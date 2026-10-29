/**
 * Editing Mechanics Engine (EME) - Grounded Creative Context Builder
 *
 * Constructs grounded, bounded creative context from authentic project data:
 * - User brief & deliverable requirements.
 * - Genuine media asset metadata & references.
 * - Speech transcript segments (when available; never fabricated).
 * - VTSM tracking observations, quality, and shoulder/headroom metrics.
 * - Audio & musical structure evidence.
 * - Actual renderer capabilities & verified supported operations.
 * - Explicit distinction between AVAILABLE, MISSING, and UNCERTAIN information.
 */

const crypto = require('node:crypto');
const { TICKS_PER_SECOND, MediaTime } = require('../engine/time.js');
const { computeProjectSnapshotSha256 } = require('../prompt-core/context-normalizer.js');

const VERIFIED_SUPPORTED_OPERATIONS = [
  'create_project',
  'add_asset',
  'add_track',
  'insert_clip',
  'trim_clip',
  'move_clip',
  'split_clip',
  'animate_property',
  'apply_effect',
  'set_audio_envelope',
  'delete_clip',
  'ripple_delete',
  'reorder_tracks',
  'modify_clip',
  'update_keyframe',
  'ripple_trim',
  'slip_clip',
  'slide_clip',
  'set_track_state',
  'attach_color_grade',
  'adjust_color_params',
  'remove_color_grade'
];

const VERIFIED_SUPPORTED_EFFECTS = ['blur', 'brightness', 'contrast', 'opacity', 'blendMode'];

const KNOWN_UNSUPPORTED_CAPABILITIES = [
  'curved_svg_typography',
  'optical_fisheye_distortion_shader',
  'perspective_3d_transform',
  'generative_soundtrack_synthesis'
];

class CreativeContextBuilder {
  /**
   * Build grounded context for the Creative Director LLM runtime.
   *
   * @param {object} params
   * @param {string|object} params.brief User brief text or structured brief object
   * @param {object} params.project Canonical EME project snapshot
   * @param {object} [params.vtsmSidecar] Optional VTSM tracking sidecar
   * @param {object} [params.transcript] Optional timestamped transcript { segments: [...] }
   * @param {object} [params.beatAnalysis] Optional beat analysis sidecar
   * @param {Array<object>} [params.availableAssets] Optional workspace catalog assets
   * @returns {object} Grounded creative context
   */
  static buildContext({
    brief,
    project,
    vtsmSidecar = null,
    transcript = null,
    beatAnalysis = null,
    availableAssets = []
  }) {
    if (!project || typeof project !== 'object') {
      throw new Error('Valid canonical EME project snapshot is required for CreativeContextBuilder');
    }

    // 1. Normalize Brief
    const normalizedBrief = this._normalizeBrief(brief, project);

    // 2. Project State Snapshot
    const projectSnapshotSha256 = computeProjectSnapshotSha256(project);
    const projectSummary = {
      project_id: project.id || 'project_default',
      base_revision: project.revision ?? 0,
      snapshot_sha256: projectSnapshotSha256,
      canvas: {
        width: project.canvas?.width || 1920,
        height: project.canvas?.height || 1080,
        aspect_ratio: project.canvas?.aspectRatio || '16:9'
      },
      timebase: {
        ticks_per_second: project.timebase?.ticksPerSecond || TICKS_PER_SECOND,
        fps: project.timebase?.fps || { numerator: 30, denominator: 1 },
        duration_ticks: project.timebase?.durationTicks || 0
      },
      assets: (project.assets || []).map(a => ({
        id: a.id,
        type: a.type,
        src: a.src
      })),
      tracks: (project.tracks || []).map(t => ({
        id: t.id,
        kind: t.kind,
        name: t.name || t.id,
        locked: Boolean(t.locked),
        enabled: t.enabled !== false
      })),
      clips: (project.clips || []).map(c => ({
        id: c.id,
        track_id: c.trackId,
        asset_id: c.assetId,
        type: c.type || 'video',
        timeline_range: {
          start_tick: c.startTick,
          end_tick: c.startTick + c.durationTicks,
          duration_ticks: c.durationTicks
        },
        source_range: {
          start_tick: c.sourceStartTick ?? 0,
          end_tick: (c.sourceStartTick ?? 0) + (c.sourceDurationTicks ?? c.durationTicks),
          duration_ticks: c.sourceDurationTicks ?? c.durationTicks
        }
      }))
    };

    // 3. Media Assets (Distinguish Available vs Missing)
    const mediaCatalog = this._resolveMediaCatalog(project, availableAssets);

    // 4. Speech Transcript Intelligence (Genuine vs Missing)
    const speechIntelligence = this._resolveSpeechIntelligence(transcript);

    // 5. Visual Intelligence & VTSM Tracking
    const visualIntelligence = this._resolveVisualIntelligence(vtsmSidecar, projectSummary);

    // 6. Audio Intelligence & Beat Grid
    const audioIntelligence = this._resolveAudioIntelligence(beatAnalysis, mediaCatalog);

    // 7. Engine Capabilities & Unsupported Disclaimers
    const engineCapabilities = {
      supported_operations: VERIFIED_SUPPORTED_OPERATIONS,
      renderer_backends: require('../renderers/native-capabilities.js').BACKENDS,
      supported_effects: VERIFIED_SUPPORTED_EFFECTS,
      known_unsupported_features: KNOWN_UNSUPPORTED_CAPABILITIES,
      timebase_ticks_per_second: TICKS_PER_SECOND,
      timing_convention: 'half-open [start_tick, end_tick)'
    };

    const contextPayload = {
      brief: normalizedBrief,
      project_state: projectSummary,
      media_catalog: mediaCatalog,
      speech_intelligence: speechIntelligence,
      visual_intelligence: visualIntelligence,
      audio_intelligence: audioIntelligence,
      engine_capabilities: engineCapabilities,
      provenance: {
        created_at: new Date().toISOString()
      }
    };

    // Compute deterministic context hash
    const serialized = JSON.stringify(contextPayload);
    contextPayload.provenance.context_hash = crypto.createHash('sha256').update(serialized).digest('hex');

    Object.defineProperty(contextPayload, '_canonicalProject', { value: structuredClone(project), enumerable: false });
    return contextPayload;
  }

  static _normalizeBrief(brief, project) {
    if (typeof brief === 'string') {
      // Parse basic intent heuristics
      const lower = brief.toLowerCase();
      let targetAspect = '9:16';
      if (lower.includes('16:9') || lower.includes('horizontal') || lower.includes('landscape')) targetAspect = '16:9';
      if (lower.includes('4:3')) targetAspect = '4:3';
      if (lower.includes('1:1') || lower.includes('square')) targetAspect = '1:1';

      // Duration heuristic
      let durationTicks = project.timebase?.durationTicks || (10 * TICKS_PER_SECOND);
      const secMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|s\b)/);
      if (secMatch) {
        durationTicks = Math.round(parseFloat(secMatch[1]) * TICKS_PER_SECOND);
      }

      return {
        raw_text: brief,
        objective: brief,
        target_audience: lower.includes('reels') || lower.includes('tiktok') ? 'social_mobile' : 'general',
        style: lower.includes('cinematic') ? 'cinematic' : (lower.includes('dynamic') ? 'dynamic' : 'fast_paced'),
        pacing: lower.includes('fast') ? 'fast' : (lower.includes('slow') ? 'deliberate' : 'moderate'),
        target_duration_ticks: durationTicks,
        target_aspect_ratio: targetAspect,
        constraints: []
      };
    }

    if (brief && typeof brief === 'object') {
      return {
        raw_text: brief.goal?.objective || brief.objective || JSON.stringify(brief),
        objective: brief.goal?.objective || brief.objective || 'Create video edit',
        target_audience: brief.target_audience || 'social_mobile',
        style: brief.style || 'dynamic',
        pacing: brief.pacing || 'fast',
        target_duration_ticks: brief.deliverables?.[0]?.duration_ticks || brief.target_duration_ticks || (10 * TICKS_PER_SECOND),
        target_aspect_ratio: brief.target_aspect_ratio || '9:16',
        constraints: brief.constraints || []
      };
    }

    return {
      raw_text: '',
      objective: 'Default video assembly',
      target_audience: 'general',
      style: 'clean',
      pacing: 'moderate',
      target_duration_ticks: 10 * TICKS_PER_SECOND,
      target_aspect_ratio: '9:16',
      constraints: []
    };
  }

  static _resolveMediaCatalog(project, availableAssets) {
    const assets = project.assets || [];
    const available = [];
    const missing = [];

    for (const a of assets) {
      if (a.id && a.src) {
        available.push({
          asset_id: a.id,
          type: a.type || 'video',
          src: a.src,
          metadata: a.metadata || null,
          in_project: true
        });
      } else {
        missing.push({
          asset_id: a.id || 'unnamed_asset',
          reason: 'Asset definition lacks source path'
        });
      }
    }

    // Additional workspace catalog items
    for (const a of availableAssets) {
      const id = a.asset_id ?? a.id, src = a.full_path ?? a.src;
      if (!id || !src || a.available === false) {
        missing.push({asset_id:id || 'unnamed_asset',reason:a.verification_error || 'Catalog asset unavailable'}); continue;
      }
      if (!available.some(x => x.asset_id === id)) available.push({asset_id:id,type:a.type,src,sha256:a.sha256 || null,licensing:a.licensing || null,in_project:false});
    }

    return {
      status: missing.length === 0 ? 'COMPLETE' : 'PARTIAL',
      available,
      missing
    };
  }

  static _resolveSpeechIntelligence(transcript) {
    if (!transcript || !Array.isArray(transcript.segments) || transcript.segments.length === 0) {
      return {
        status: 'MISSING',
        confidence: 0.0,
        segments_count: 0,
        segments: [],
        note: 'No audio transcript or speech recognition sidecar available'
      };
    }

    const segments = transcript.segments.map((s, idx) => ({
      segment_id: s.id || `seg_${idx + 1}`,
      start_tick: s.start_tick ?? (typeof s.startSec === 'number' ? require('../engine/time.js').MediaTime.secondsToTicks(s.startSec) : 0),
      end_tick: s.end_tick ?? (typeof s.endSec === 'number' ? require('../engine/time.js').MediaTime.secondsToTicks(s.endSec) : 0),
      text: s.text || '',
      speaker: s.speaker || 'speaker_1',
      confidence: s.confidence ?? 1.0
    }));

    return {
      status: 'AVAILABLE',
      confidence: transcript.confidence ?? 0.95,
      segments_count: segments.length,
      segments
    };
  }

  static _resolveVisualIntelligence(vtsmSidecar, projectSummary) {
    if (!vtsmSidecar || !Array.isArray(vtsmSidecar.frames) || vtsmSidecar.frames.length === 0) {
      return {
        status: 'MISSING',
        tracking_coverage: 0.0,
        subject_detected: false,
        note: 'No VTSM tracking sidecar provided; reframing must use validated fallback'
      };
    }

    const frames = vtsmSidecar.frames;
    let faceObservations = 0;
    let shoulderObservations = 0;
    let totalConfidence = 0;
    let sampleFace = null;
    let sampleShoulders = null;

    for (const f of frames) {
      for (const obs of f.observations || []) {
        if (obs.type === 'face' && obs.bounds) {
          faceObservations++;
          totalConfidence += (obs.confidence || 1.0);
          if (!sampleFace) sampleFace = obs.bounds;
        }
        if (obs.type === 'pose' && obs.landmarks) {
          shoulderObservations++;
          if (!sampleShoulders && obs.landmarks.leftShoulder && obs.landmarks.rightShoulder) {
            sampleShoulders = {
              left: obs.landmarks.leftShoulder,
              right: obs.landmarks.rightShoulder
            };
          }
        }
      }
    }

    const coverage = frames.length > 0 ? (faceObservations / frames.length) : 0.0;
    const avgConfidence = faceObservations > 0 ? (totalConfidence / faceObservations) : 0.0;

    return {
      status: coverage >= 0.5 ? 'AVAILABLE' : 'UNCERTAIN',
      tracking_coverage: Number(coverage.toFixed(4)),
      average_confidence: Number(avgConfidence.toFixed(4)),
      subject_detected: faceObservations > 0 || shoulderObservations > 0,
      has_shoulder_landmarks: shoulderObservations > 0,
      sample_face: sampleFace,
      sample_shoulders: sampleShoulders,
      source_resolution: vtsmSidecar.source ? { width: vtsmSidecar.source.width, height: vtsmSidecar.source.height } : null
    };
  }

  static _resolveAudioIntelligence(beatAnalysis, mediaCatalog) {
    const hasAudioAssets = mediaCatalog.available.some(a => a.type === 'audio');

    if (!beatAnalysis || !beatAnalysis.tempo) {
      return {
        status: hasAudioAssets ? 'PARTIAL' : 'MISSING',
        tempo_bpm: null,
        confidence: 0.0,
        beats_count: 0,
        audio_assets_available: hasAudioAssets,
        note: 'No beat analysis sidecar available'
      };
    }

    return {
      status: (beatAnalysis.tempo.confidence || 0) >= 0.6 ? 'AVAILABLE' : 'UNCERTAIN',
      tempo_bpm: beatAnalysis.tempo.bpm || null,
      confidence: beatAnalysis.tempo.confidence || 0.0,
      beats_count: (beatAnalysis.beats || []).length,
      audio_assets_available: hasAudioAssets
    };
  }
}

module.exports = {
  CreativeContextBuilder,
  VERIFIED_SUPPORTED_OPERATIONS,
  VERIFIED_SUPPORTED_EFFECTS,
  KNOWN_UNSUPPORTED_CAPABILITIES
};
