/**
 * Editing Mechanics Engine (EME) - Multi-Track Timeline Scheduler (PF-03)
 *
 * Implements deterministic multi-track scheduling, music beat synchronization,
 * B-roll cutaway placement, transition handle validation, and text overlay safe margins.
 *
 * Invariants:
 * - Exact integer ticks (120,000 ticks/sec).
 * - Half-open intervals [startTick, endTick) where duration = endTick - startTick.
 * - Single-track no-collision invariant: clips on the same track must not overlap.
 * - Multi-track compositing hierarchy: visual tracks stack by ascending zIndex.
 * - Music synchronization: aligns cuts to nearest eligible beat within maxDeviation (<= 20ms).
 * - Transitions: requires verified source handles; never silently alters total duration.
 * - Text overlays: respects title-safe margins within canvas boundaries.
 */

const { MediaTime, TICKS_PER_SECOND } = require('../engine/time.js');

const DEFAULT_BEAT_TOLERANCE_MS = 20; // Maximum allowed beat alignment deviation
const DEFAULT_BEAT_TOLERANCE_TICKS = Math.round((DEFAULT_BEAT_TOLERANCE_MS / 1000) * TICKS_PER_SECOND); // 2400 ticks

class MultiTrackScheduler {
  /**
   * Snaps a requested timeline tick to the nearest eligible beat from an A1 beat analysis artifact.
   *
   * @param {number} requestedTick Target timeline position in ticks
   * @param {object} beatAnalysis Artifact conforming to eme-beat-analysis.v1
   * @param {object} [options] Snapping configuration
   * @param {number} [options.maxDeviationTicks=2400] Maximum acceptable deviation (20ms default)
   * @param {number} [options.minConfidence=0.5] Minimum acceptable beat confidence
   * @param {number} [options.offsetTicks=0] Explicit offset Delta in ticks
   * @returns {{ success: boolean, snappedTick: number, beatIndex: number, alignmentErrorTicks: number, alignmentErrorMs: number, confidence: number, error?: string }}
   */
  static snapToNearestBeat(requestedTick, beatAnalysis, options = {}) {
    if (!beatAnalysis || typeof beatAnalysis !== 'object') {
      return {
        success: false,
        snappedTick: requestedTick,
        beatIndex: -1,
        alignmentErrorTicks: 0,
        alignmentErrorMs: 0,
        confidence: 0,
        error: 'Missing or invalid beat analysis artifact'
      };
    }

    // Check tempo ambiguity or missing events
    if (beatAnalysis.tempo?.isAmbiguous) {
      return {
        success: false,
        snappedTick: requestedTick,
        beatIndex: -1,
        alignmentErrorTicks: 0,
        alignmentErrorMs: 0,
        confidence: beatAnalysis.tempo?.confidence || 0,
        error: 'Beat analysis tempo is ambiguous (competing meter/tempo hypotheses)'
      };
    }

    const beats = beatAnalysis.events?.beats;
    if (!Array.isArray(beats) || beats.length === 0) {
      return {
        success: false,
        snappedTick: requestedTick,
        beatIndex: -1,
        alignmentErrorTicks: 0,
        alignmentErrorMs: 0,
        confidence: 0,
        error: 'No beat events available in beat analysis artifact'
      };
    }

    const maxDeviationTicks = options.maxDeviationTicks !== undefined ? options.maxDeviationTicks : DEFAULT_BEAT_TOLERANCE_TICKS;
    const minConfidence = options.minConfidence !== undefined ? options.minConfidence : 0.5;
    const offsetTicks = options.offsetTicks || 0;

    const effectiveTarget = requestedTick - offsetTicks;

    let bestIndex = -1;
    let minDiff = Infinity;
    let bestBeat = null;

    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const diff = Math.abs(b.ticks - effectiveTarget);
      if (diff < minDiff) {
        minDiff = diff;
        bestIndex = i;
        bestBeat = b;
      }
    }

    if (!bestBeat) {
      return {
        success: false,
        snappedTick: requestedTick,
        beatIndex: -1,
        alignmentErrorTicks: 0,
        alignmentErrorMs: 0,
        confidence: 0,
        error: 'Failed to find candidate beat'
      };
    }

    const alignmentErrorMs = (minDiff / TICKS_PER_SECOND) * 1000;
    const beatConfidence = bestBeat.confidence !== undefined ? bestBeat.confidence : (beatAnalysis.tempo?.confidence || 1.0);

    if (beatConfidence < minConfidence) {
      return {
        success: false,
        snappedTick: requestedTick,
        beatIndex: bestIndex,
        alignmentErrorTicks: minDiff,
        alignmentErrorMs,
        confidence: beatConfidence,
        error: `Beat confidence ${beatConfidence.toFixed(2)} is below minimum threshold ${minConfidence.toFixed(2)}`
      };
    }

    if (minDiff > maxDeviationTicks) {
      return {
        success: false,
        snappedTick: requestedTick,
        beatIndex: bestIndex,
        alignmentErrorTicks: minDiff,
        alignmentErrorMs,
        confidence: beatConfidence,
        error: `Beat alignment deviation of ${alignmentErrorMs.toFixed(2)}ms (${minDiff} ticks) exceeds maximum tolerance of ${(maxDeviationTicks / TICKS_PER_SECOND * 1000).toFixed(2)}ms (${maxDeviationTicks} ticks)`
      };
    }

    return {
      success: true,
      snappedTick: bestBeat.ticks + offsetTicks,
      beatIndex: bestIndex,
      alignmentErrorTicks: minDiff,
      alignmentErrorMs,
      confidence: beatConfidence
    };
  }

  /**
   * Validates available source media handles for a requested transition between two clips.
   *
   * @param {object} params
   * @param {object} params.outgoingClip Primary outgoing clip
   * @param {object} params.incomingClip Primary incoming clip
   * @param {object} params.outgoingAsset Asset metadata for outgoing clip
   * @param {object} params.incomingAsset Asset metadata for incoming clip
   * @param {number} params.transitionDurationTicks Requested transition duration in integer ticks
   * @param {'centered' | 'start_at_cut' | 'end_at_cut'} [params.alignment='centered']
   * @returns {{ valid: boolean, outgoingHandleTicks: number, incomingHandleTicks: number, requiredOutgoingHandleTicks: number, requiredIncomingHandleTicks: number, error?: string }}
   */
  static validateTransitionHandles({
    outgoingClip,
    incomingClip,
    outgoingAsset,
    incomingAsset,
    transitionDurationTicks,
    alignment = 'centered'
  }) {
    if (!outgoingClip || !incomingClip) {
      return {
        valid: false,
        outgoingHandleTicks: 0,
        incomingHandleTicks: 0,
        requiredOutgoingHandleTicks: 0,
        requiredIncomingHandleTicks: 0,
        error: 'Both outgoing and incoming clips are required for transition handle validation'
      };
    }

    if (transitionDurationTicks <= 0) {
      return {
        valid: false,
        outgoingHandleTicks: 0,
        incomingHandleTicks: 0,
        requiredOutgoingHandleTicks: 0,
        requiredIncomingHandleTicks: 0,
        error: `Transition duration must be > 0. Got: ${transitionDurationTicks}`
      };
    }

    let reqOut = 0;
    let reqIn = 0;
    if (alignment === 'centered') {
      reqOut = Math.floor(transitionDurationTicks / 2);
      reqIn = transitionDurationTicks - reqOut;
    } else if (alignment === 'start_at_cut') {
      reqOut = 0;
      reqIn = transitionDurationTicks;
    } else if (alignment === 'end_at_cut') {
      reqOut = transitionDurationTicks;
      reqIn = 0;
    }

    // Measure outgoing clip handle (untrimmed source past cut point)
    const outSourceDuration = outgoingAsset?.durationTicks || outgoingAsset?.metadata?.durationTicks || outgoingClip.sourceDurationTicks || outgoingClip.durationTicks;
    const outTrimIn = outgoingClip.source?.trimInTick || 0;
    const outTrimOut = outgoingClip.source?.trimOutTick !== undefined ? outgoingClip.source.trimOutTick : (outTrimIn + outgoingClip.durationTicks);
    const availOutHandle = Math.max(0, outSourceDuration - outTrimOut);

    // Measure incoming clip handle (untrimmed source before cut point)
    const inTrimIn = incomingClip.source?.trimInTick || 0;
    const availInHandle = inTrimIn;

    if (availOutHandle < reqOut) {
      return {
        valid: false,
        outgoingHandleTicks: availOutHandle,
        incomingHandleTicks: availInHandle,
        requiredOutgoingHandleTicks: reqOut,
        requiredIncomingHandleTicks: reqIn,
        error: `Outgoing clip "${outgoingClip.id}" has insufficient handle: available ${availOutHandle} ticks (${availOutHandle / TICKS_PER_SECOND}s), required ${reqOut} ticks (${reqOut / TICKS_PER_SECOND}s)`
      };
    }

    if (availInHandle < reqIn) {
      return {
        valid: false,
        outgoingHandleTicks: availOutHandle,
        incomingHandleTicks: availInHandle,
        requiredOutgoingHandleTicks: reqOut,
        requiredIncomingHandleTicks: reqIn,
        error: `Incoming clip "${incomingClip.id}" has insufficient handle: available ${availInHandle} ticks (${availInHandle / TICKS_PER_SECOND}s), required ${reqIn} ticks (${reqIn / TICKS_PER_SECOND}s)`
      };
    }

    return {
      valid: true,
      outgoingHandleTicks: availOutHandle,
      incomingHandleTicks: availInHandle,
      requiredOutgoingHandleTicks: reqOut,
      requiredIncomingHandleTicks: reqIn
    };
  }

  /**
   * Validates text overlay dimensions against title-safe margins of the canvas.
   * Standard broadcast/social title-safe is 10% inset from canvas edges.
   *
   * @param {object} params
   * @param {object} params.canvas { width, height }
   * @param {object} params.typography { text, fontSize, ... }
   * @param {object} [params.transform] { x, y, scaleX, scaleY }
   * @param {number} [params.safeMarginRatio=0.10] Inset ratio (0.10 = 10%)
   * @returns {{ valid: boolean, safeBounds: object, error?: string }}
   */
  static validateTitleSafeMargins({ canvas, typography, transform = {}, safeMarginRatio = 0.10 }) {
    if (!canvas || !canvas.width || !canvas.height) {
      return { valid: false, safeBounds: {}, error: 'Invalid canvas dimensions' };
    }

    const safeX = Math.round(canvas.width * safeMarginRatio);
    const safeY = Math.round(canvas.height * safeMarginRatio);
    const safeW = canvas.width - (safeX * 2);
    const safeH = canvas.height - (safeY * 2);

    const safeBounds = {
      minX: safeX,
      maxX: canvas.width - safeX,
      minY: safeY,
      maxY: canvas.height - safeY,
      width: safeW,
      height: safeH
    };

    // Calculate approximate text layout bounds if typography provided
    const fontSize = typography?.fontSize || 64;
    const textLength = (typography?.text || '').length;
    const estCharWidth = fontSize * 0.55;
    const estTextWidth = Math.min(canvas.width, textLength * estCharWidth);
    const estTextHeight = fontSize * 1.3;

    const posX = transform.x !== undefined ? (canvas.width / 2 + transform.x) : (canvas.width / 2);
    const posY = transform.y !== undefined ? (canvas.height / 2 + transform.y) : (canvas.height / 2);

    const left = posX - (estTextWidth / 2);
    const right = posX + (estTextWidth / 2);
    const top = posY - (estTextHeight / 2);
    const bottom = posY + (estTextHeight / 2);

    if (left < safeBounds.minX || right > safeBounds.maxX || top < safeBounds.minY || bottom > safeBounds.maxY) {
      return {
        valid: false,
        safeBounds,
        measured: { left, right, top, bottom },
        error: `Text overlay layout [${Math.round(left)}, ${Math.round(top)}, ${Math.round(right)}, ${Math.round(bottom)}] exceeds safe margin boundaries [${safeBounds.minX}, ${safeBounds.minY}, ${safeBounds.maxX}, ${safeBounds.maxY}]`
      };
    }

    return {
      valid: true,
      safeBounds,
      measured: { left, right, top, bottom }
    };
  }

  /**
   * Resolves target tracks for multi-track composition (primary video, B-roll, music, graphics).
   *
   * @param {object} project
   * @returns {{ mainVideoTrack: object, brollTrack: object, musicTrack: object, graphicsTrack: object, existingTracks: Array }}
   */
  static resolveTrackTopology(project) {
    const tracks = project.tracks || [];

    const visualTracks = tracks.filter(t => t.kind === 'visual').sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const audioTracks = tracks.filter(t => t.kind === 'audio');

    // Visual primary (lowest zIndex visual track or named track_v_main)
    let mainVideoTrack = visualTracks.find(t => t.id === 'track_v_main' || t.id === 'track_v1') || visualTracks[0];

    // B-roll secondary visual track (higher zIndex than main)
    let brollTrack = visualTracks.find(t => t.id === 'track_v_broll' || t.id === 'track_v2' || (t.id !== mainVideoTrack?.id && (t.zIndex || 0) > (mainVideoTrack?.zIndex || 0)));

    // Audio music track
    let musicTrack = audioTracks.find(t => t.id === 'track_a_music' || t.id === 'track_a1') || audioTracks[0];

    // Graphics / Title track (highest zIndex visual track)
    let graphicsTrack = visualTracks.find(t => t.id === 'track_graphics' || t.id === 'track_titles' || t.id === 'track_v_overlay') || visualTracks[visualTracks.length - 1];

    return {
      mainVideoTrack,
      brollTrack,
      musicTrack,
      graphicsTrack,
      existingTracks: tracks
    };
  }
}

module.exports = {
  MultiTrackScheduler,
  DEFAULT_BEAT_TOLERANCE_MS,
  DEFAULT_BEAT_TOLERANCE_TICKS
};
