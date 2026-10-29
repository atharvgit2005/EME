/**
 * Editing Mechanics Engine (EME) - Deterministic Role Placement Engine (Stage 26.4)
 *
 * Translates editorial events (visual cuts, text reveals, markers) into frame-accurate,
 * physically aligned audio operations using measured transient offsets.
 *
 * Architectural Invariants:
 * - Correction B: Uses canonical EME operation vocabulary (add_asset, add_track, insert_clip, set_audio_envelope)
 * - Correction D: Exact physical transient math: t_start = t_event - t_align.
 *   Fails safely on negative start, invalid duration, or collision (no silent clamping!).
 * - Correction E: Conservative dialogue ducking only when explicit intervals are provided.
 * - Zero Project Mutation: Only compiles declarative operations; execution is delegated to OperationExecutor.
 */

const { OperationExecutor } = require('../../engine/operations.js');
const { MediaTime, TICKS_PER_SECOND } = require('../../engine/time.js');

class RolePlacementEngine {
  /**
   * @param {object} options
   * @param {import('./sound-kit-catalog.js').SoundKitCatalog} options.catalog
   * @param {string} [options.defaultTrackPrefix='a-sfx']
   */
  constructor(options = {}) {
    if (!options.catalog) {
      throw new Error('RolePlacementEngine requires a SoundKitCatalog instance');
    }
    this.catalog = options.catalog;
    this.defaultTrackPrefix = options.defaultTrackPrefix || 'a-sfx';
  }

  /**
   * Generates a declarative operation plan for placing sound kit cues on an EME project.
   *
   * @param {object} project Current canonical EME project snapshot
   * @param {Array<object>} cues Array of placement requests
   * @param {object} [options]
   * @param {boolean} [options.autoTrackAllocation=true] Automatically allocate additional audio tracks on collision
   * @param {boolean} [options.strictBounds=true] Reject cue if t_start < 0 (false skips with warning)
   * @param {string} [options.onNegativeStart='reject'] 'reject'|'skip'
   * @param {Array<{startTick: number, endTick: number}>} [options.dialogueIntervals] Explicit speech intervals for ducking
   * @param {number} [options.duckingGainDb=-6] Attenuation in dB during dialogue
   * @returns {{ success: boolean, operations: Array<object>, placedCues: Array<object>, diagnostics: Array<object>, baseRevision: number, error?: string }}
   */
  planPlacements(project, cues = [], options = {}) {
    if (!project || typeof project !== 'object') {
      return {
        success: false,
        operations: [],
        placedCues: [],
        diagnostics: [{ code: 'INVALID_PROJECT', message: 'Project snapshot is required' }],
        baseRevision: 0,
        error: 'Invalid project snapshot'
      };
    }

    const baseRevision = project.revision || 0;
    const operations = [];
    const diagnostics = [];
    const placedCues = [];

    // Working simulation of tracks and clips to track simulated allocations & collisions
    const simulatedTracks = structuredClone(project.tracks || []);
    const simulatedClips = structuredClone(project.clips || []);
    const existingAssetIds = new Set((project.assets || []).map(a => a.id));

    // Ensure at least one primary audio track exists for SFX
    let primaryTrack = simulatedTracks.find(t => t.kind === 'audio' && !t.locked);
    if (!primaryTrack) {
      const newTrackId = `${this.defaultTrackPrefix}-1`;
      operations.push({
        type: 'add_track',
        params: {
          id: newTrackId,
          kind: 'audio',
          name: 'Sound Effects 1',
          zIndex: simulatedTracks.length
        }
      });
      primaryTrack = { id: newTrackId, kind: 'audio', zIndex: simulatedTracks.length, clips: [] };
      simulatedTracks.push(primaryTrack);
      diagnostics.push({ code: 'TRACK_CREATED', message: `Created primary SFX track "${newTrackId}"` });
    }

    const autoTrack = options.autoTrackAllocation !== false;
    const strictBounds = options.strictBounds !== false;
    const onNegativeStart = options.onNegativeStart || (strictBounds ? 'reject' : 'skip');

    // Process each cue in chronological order
    const sortedCues = [...cues].sort((a, b) => (a.eventTick || 0) - (b.eventTick || 0));

    for (let cueIdx = 0; cueIdx < sortedCues.length; cueIdx++) {
      const cue = sortedCues[cueIdx];
      const cueId = cue.id || `cue-${cue.role}-${cue.eventTick}-${cueIdx + 1}`;

      // 1. Role validation
      if (!cue.role || !this.catalog.hasRole(cue.role)) {
        diagnostics.push({
          code: 'ROLE_UNAVAILABLE',
          cueId,
          role: cue.role,
          message: `Role "${cue.role}" is not available in sound kit "${this.catalog.name}"`
        });
        continue;
      }

      // 2. Take selection (round robin or explicit seed/index)
      let take;
      try {
        take = this.catalog.selectTake(cue.role, {
          seed: cue.seed,
          takeIndex: cue.takeIndex,
          advanceRoundRobin: true
        });
      } catch (err) {
        diagnostics.push({
          code: 'TAKE_SELECTION_FAILED',
          cueId,
          message: err.message
        });
        continue;
      }

      // 3. Exact Physical Transient Alignment Math (Correction D)
      // t_start = t_event - round(t_align * 120,000)
      const eventTick = cue.eventTick || 0;
      const startTick = eventTick - take.alignmentTicks;
      const durationTicks = take.durationTicks;

      // 4. Bound & Constraint Validation
      if (startTick < 0) {
        const msg = `Placement bounds error for cue "${cueId}": eventTick (${eventTick}) - alignmentTicks (${take.alignmentTicks}) produces negative startTick (${startTick})`;
        diagnostics.push({
          code: 'PLACEMENT_BOUNDS_ERROR',
          cueId,
          startTick,
          eventTick,
          alignmentTicks: take.alignmentTicks,
          message: msg
        });

        if (onNegativeStart === 'reject') {
          return {
            success: false,
            operations: [],
            placedCues: [],
            diagnostics,
            baseRevision,
            error: msg
          };
        }
        // If 'skip', bypass this cue safely without clamping
        continue;
      }

      if (durationTicks <= 0) {
        const msg = `Invalid duration for cue "${cueId}": durationTicks must be > 0, got ${durationTicks}`;
        diagnostics.push({ code: 'INVALID_DURATION', cueId, message: msg });
        return {
          success: false,
          operations: [],
          placedCues: [],
          diagnostics,
          baseRevision,
          error: msg
        };
      }

      // 5. Track Resolution and Collision Avoidance
      let targetTrackId = cue.trackId || primaryTrack.id;
      let targetTrack = simulatedTracks.find(t => t.id === targetTrackId);

      if (!targetTrack || targetTrack.kind !== 'audio') {
        targetTrackId = primaryTrack.id;
        targetTrack = primaryTrack;
      }

      // Check collision on candidate track
      let hasCollision = simulatedClips.some(
        c => c.trackId === targetTrackId && MediaTime.intervalsOverlap(startTick, durationTicks, c.startTick, c.durationTicks)
      );

      if (hasCollision) {
        if (autoTrack) {
          // Find an existing alternative audio track without collision
          let resolvedTrack = null;
          for (const t of simulatedTracks) {
            if (t.kind === 'audio' && !t.locked && t.id !== targetTrackId) {
              const collision = simulatedClips.some(
                c => c.trackId === t.id && MediaTime.intervalsOverlap(startTick, durationTicks, c.startTick, c.durationTicks)
              );
              if (!collision) {
                resolvedTrack = t;
                break;
              }
            }
          }

          // If no existing track is free, allocate a new track
          if (!resolvedTrack) {
            const nextTrackIndex = simulatedTracks.filter(t => t.kind === 'audio').length + 1;
            const allocatedTrackId = `${this.defaultTrackPrefix}-${nextTrackIndex}`;
            operations.push({
              type: 'add_track',
              params: {
                id: allocatedTrackId,
                kind: 'audio',
                name: `Sound Effects ${nextTrackIndex}`,
                zIndex: simulatedTracks.length
              }
            });
            resolvedTrack = { id: allocatedTrackId, kind: 'audio', zIndex: simulatedTracks.length };
            simulatedTracks.push(resolvedTrack);
            diagnostics.push({
              code: 'COLLISION_TRACK_ALLOCATED',
              cueId,
              message: `Allocated new track "${allocatedTrackId}" to avoid collision for cue "${cueId}"`
            });
          }

          targetTrackId = resolvedTrack.id;
        } else {
          const msg = `Track collision on "${targetTrackId}" for cue "${cueId}" at interval [${startTick}, ${startTick + durationTicks}]`;
          diagnostics.push({ code: 'TRACK_COLLISION', cueId, message: msg });
          return {
            success: false,
            operations: [],
            placedCues: [],
            diagnostics,
            baseRevision,
            error: msg
          };
        }
      }

      // 6. Asset Registration Operation (Correction C)
      const assetId = `asset-kit-${this.catalog.name}-${take.file.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      if (!existingAssetIds.has(assetId)) {
        operations.push({
          type: 'add_asset',
          params: {
            id: assetId,
            type: 'audio',
            src: take.fullPath,
            sha256: take.sha256 || undefined,
            metadata: {
              kit: this.catalog.name,
              role: cue.role,
              file: take.file,
              alignMode: take.alignMode,
              alignmentTicks: take.alignmentTicks,
              durationTicks: take.durationTicks,
              onset_s: take.onset_s,
              peak_s: take.peak_s,
              end_s: take.end_s,
              dur_s: take.dur_s,
              levelDb: take.levelDb,
              sha1: take.sha1,
              sha256: take.sha256
            }
          }
        });
        existingAssetIds.add(assetId);
      }

      // 7. Canonical Clip Insertion Operation (Correction B: insert_clip)
      const clipId = `clip-${cueId}`;
      const effectiveGainDb = (take.levelDb || 0) + (cue.gainDb || 0);

      const insertOp = {
        type: 'insert_clip',
        params: {
          id: clipId,
          trackId: targetTrackId,
          type: 'audio',
          startTick,
          durationTicks,
          source: {
            assetId,
            sourceStartTick: 0,
            sourceDurationTicks: durationTicks
          },
          audio: {
            volumeDb: effectiveGainDb,
            pan: 0.0
          }
        }
      };

      operations.push(insertOp);

      // Record simulated clip placement
      simulatedClips.push({
        id: clipId,
        trackId: targetTrackId,
        startTick,
        durationTicks,
        type: 'audio'
      });

      placedCues.push({
        cueId,
        role: cue.role,
        clipId,
        trackId: targetTrackId,
        eventTick,
        startTick,
        durationTicks,
        alignmentTicks: take.alignmentTicks,
        alignMode: take.alignMode,
        gainDb: effectiveGainDb,
        file: take.file,
        assetId
      });
    }

    // 8. Conservative Dialogue Ducking (Correction E)
    if (Array.isArray(options.dialogueIntervals) && options.dialogueIntervals.length > 0) {
      const duckingGainDb = options.duckingGainDb !== undefined ? options.duckingGainDb : -6.0;
      const duckingGainLinear = Math.pow(10, duckingGainDb / 20);
      const rampTicks = Math.round(0.05 * TICKS_PER_SECOND); // 50ms ramp

      for (const placed of placedCues) {
        const clipStart = placed.startTick;
        const clipEnd = placed.startTick + placed.durationTicks;

        // Check if this SFX clip overlaps with any speech interval
        const overlaps = options.dialogueIntervals.some(
          d => MediaTime.intervalsOverlap(clipStart, placed.durationTicks, d.startTick, d.endTick - d.startTick)
        );

        if (overlaps) {
          // Add conservative volume envelope keyframes to duck the SFX clip
          operations.push({
            type: 'set_audio_envelope',
            params: {
              clipId: placed.clipId,
              volumeKeyframes: [
                { offsetTick: 0, volume: duckingGainLinear },
                { offsetTick: placed.durationTicks, volume: duckingGainLinear }
              ]
            }
          });
          diagnostics.push({
            code: 'DIALOGUE_DUCKED',
            clipId: placed.clipId,
            message: `Applied dialogue ducking (${duckingGainDb} dB) to clip "${placed.clipId}"`
          });
        }
      }
    }

    return {
      success: true,
      operations,
      placedCues,
      diagnostics,
      baseRevision
    };
  }

  /**
   * Helper that discovers editorial cue points from project visual cuts and text titles.
   * @param {object} project
   * @returns {Array<object>} Discovered cues
   */
  discoverEditorialCues(project) {
    const discovered = [];
    if (!project || !Array.isArray(project.tracks) || !Array.isArray(project.clips)) {
      return discovered;
    }

    const visualTracks = project.tracks.filter(t => t.kind === 'visual' || t.kind === 'video');

    for (const track of visualTracks) {
      const trackClips = project.clips
        .filter(c => c.trackId === track.id)
        .sort((a, b) => a.startTick - b.startTick);

      for (let i = 0; i < trackClips.length; i++) {
        const clip = trackClips[i];

        // 1. Text reveals
        if (clip.type === 'text' || clip.type === 'title') {
          discovered.push({
            id: `cue-text-${clip.id}`,
            role: this.catalog.hasRole('text') ? 'text' : 'pop',
            eventTick: clip.startTick,
            note: `Text reveal for clip "${clip.id}"`
          });
        }

        // 2. Visual cuts between clips
        if (i > 0) {
          const prevClip = trackClips[i - 1];
          const cutTick = prevClip.startTick + prevClip.durationTicks;
          if (clip.startTick === cutTick) {
            discovered.push({
              id: `cue-cut-${clip.id}`,
              role: this.catalog.hasRole('whoosh.short') ? 'whoosh.short' : 'pop',
              eventTick: cutTick,
              note: `Visual cut between "${prevClip.id}" and "${clip.id}"`
            });
          }
        }
      }
    }

    return discovered;
  }

  /**
   * Executes a placement proposal through OperationExecutor sequentially.
   * @param {object} project
   * @param {{ operations: Array<object> }} proposal
   * @returns {{ success: boolean, project: object, error?: string }}
   */
  executeProposal(project, proposal) {
    if (!proposal || !Array.isArray(proposal.operations)) {
      return { success: false, project, error: 'Invalid proposal: operations array missing' };
    }

    let current = structuredClone(project);

    for (let i = 0; i < proposal.operations.length; i++) {
      const op = proposal.operations[i];
      const res = OperationExecutor.execute(current, op);
      if (!res.success) {
        return {
          success: false,
          failedStep: i,
          failedOperation: op,
          error: `Step ${i + 1} (${op.type}) failed: ${res.error}`,
          project: current
        };
      }
      current = res.project;
    }

    return {
      success: true,
      project: current
    };
  }
}

module.exports = {
  RolePlacementEngine
};
