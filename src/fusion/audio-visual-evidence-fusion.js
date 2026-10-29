/**
 * Editing Mechanics Engine (EME) - Deterministic Audio-Visual Evidence Fusion
 * Milestone: Phase 33 — Audio-Visual Composition Synthesis (AVCS-33)
 * Stage: Stage 33.3 — Deterministic Audio-Visual Evidence Fusion
 *
 * Implements the non-mutating evidence layer joining validated Earshot audio observations
 * with Phase 32 visual intelligence observations.
 *
 * Key Invariants:
 * - Determinism (INV-07): Exact identical normalized fusion payload and fingerprint across runs.
 * - Exact Rational Timebase (INV-02): 120,000 integer ticks / second with half-open intervals.
 * - Observation Separation (CTR-03 / INV-06): Pure observation evidence, zero solver placement decisions.
 * - Provenance & Freshness (GATE-01): Strict project revision and source media digest validation.
 * - Zero Dependencies (INV-05): 0 runtime npm dependencies, 0 Python/weights in core package.
 * - Mutation Authority (INV-03): Non-mutating evidence engine; canonical mutation exclusively via OperationExecutor.
 */

const crypto = require('node:crypto');
const { FusionContractValidator } = require('./fusion-contract-validator');

class AudioVisualEvidenceFusion {
  constructor(options = {}) {
    this.validator = options.validator || new FusionContractValidator();
    this.TICKS_PER_SECOND = 120000;
    this.DEFAULT_POLICY_VERSION = 'avcs-policy-v1.0.0';
  }

  /**
   * Helper to round float using validator's exact rational Banker's Rounding.
   */
  roundHalfToEven(val, decimals = 0) {
    if (typeof val !== 'number') return val;
    const rat = this.validator.toRational(val);
    return this.validator.roundHalfToEvenRational(rat, decimals);
  }

  /**
   * Helper for canonical recursive key-sorted JSON stringification.
   */
  canonicalStringify(obj) {
    return this.validator.canonicalStringify(obj);
  }

  /**
   * Fuse Earshot audio observations and Phase 32 visual observations into a validated,
   * deterministic auxiliary fusion evidence payload conforming to eme-fusion-evidence.v1.
   *
   * @param {Object} params
   * @param {number} params.projectRevision Current canonical project revision (integer >= 1)
   * @param {string} params.audioMediaSha256 SHA-256 of the audio media asset
   * @param {string} params.visualMediaSha256 SHA-256 of the visual video asset
   * @param {Object} params.audioSidecar Earshot beat analysis sidecar (eme-beat-analysis.v1)
   * @param {Object} params.visualSidecar Phase 32 visual intelligence sidecar (eme-visual-intelligence.v1)
   * @param {string} [params.policyVersion] Policy version identifier
   * @returns {{ valid: boolean, fusionEvidence: Object, fingerprint: string }}
   */
  fuse({
    projectRevision,
    audioMediaSha256,
    visualMediaSha256,
    audioSidecar,
    visualSidecar,
    policyVersion = this.DEFAULT_POLICY_VERSION
  }) {
    // =========================================================================
    // 1. Parameter & Provenance Preflight Validation
    // =========================================================================
    if (!Number.isInteger(projectRevision) || projectRevision < 1) {
      const err = new Error(`Invalid projectRevision: ${projectRevision} (must be integer >= 1)`);
      err.code = 'ERR_INVALID_PROJECT_REVISION';
      throw err;
    }

    if (!/^[a-f0-9]{64}$/.test(audioMediaSha256)) {
      const err = new Error(`Invalid audioMediaSha256 format: ${audioMediaSha256}`);
      err.code = 'ERR_INVALID_AUDIO_SHA256';
      throw err;
    }

    if (!/^[a-f0-9]{64}$/.test(visualMediaSha256)) {
      const err = new Error(`Invalid visualMediaSha256 format: ${visualMediaSha256}`);
      err.code = 'ERR_INVALID_VISUAL_SHA256';
      throw err;
    }

    if (!audioSidecar || typeof audioSidecar !== 'object') {
      const err = new Error('Missing or invalid audioSidecar');
      err.code = 'ERR_MISSING_AUDIO_SIDECAR';
      throw err;
    }

    if (!visualSidecar || typeof visualSidecar !== 'object') {
      const err = new Error('Missing or invalid visualSidecar');
      err.code = 'ERR_MISSING_VISUAL_SIDECAR';
      throw err;
    }

    // Validate inputs against their respective contracts
    this.validator.validateBeatAnalysis(audioSidecar);
    this.validator.validateVisualIntelligence(visualSidecar);

    // Strict Freshness Check (GATE-01)
    if (audioSidecar.source.sha256 !== audioMediaSha256) {
      const err = new Error(`Stale audio sidecar: recorded hash ${audioSidecar.source.sha256} !== current ${audioMediaSha256}`);
      err.code = 'ERR_STALE_AUDIO_MEDIA_DIGEST';
      throw err;
    }

    if (visualSidecar.source.sha256 !== visualMediaSha256) {
      const err = new Error(`Stale visual sidecar: recorded hash ${visualSidecar.source.sha256} !== current ${visualMediaSha256}`);
      err.code = 'ERR_STALE_VISUAL_MEDIA_DIGEST';
      throw err;
    }

    // =========================================================================
    // 2. Canonical Timebase & Audio Observation Normalization
    // =========================================================================
    const audioSampleRate = audioSidecar.source.sampleRate;
    const rawAudioEvents = audioSidecar.events || {};
    const rawBeats = Array.isArray(rawAudioEvents.beats) ? rawAudioEvents.beats : [];
    const rawDownbeats = Array.isArray(rawAudioEvents.downbeats) ? rawAudioEvents.downbeats : [];
    const rawOnsets = Array.isArray(rawAudioEvents.onsets) ? rawAudioEvents.onsets : [];

    const normalizedBeats = [];
    for (let i = 0; i < rawBeats.length; i++) {
      const b = rawBeats[i];
      let tick = b.ticks !== undefined ? b.ticks : b.tick;
      if (tick === undefined && b.sampleIndex !== undefined) {
        tick = this.validator.sampleToTicks(b.sampleIndex, audioSampleRate);
      }
      if (!Number.isInteger(tick) || tick < 0) {
        const err = new Error(`Invalid beat tick at index ${i}: ${tick}`);
        err.code = 'ERR_INVALID_BEAT_TICK';
        throw err;
      }

      // Confidence normalization: float [0.0, 1.0] -> integer [0, 1000]
      let normalizedConf = b.confidence;
      if (typeof normalizedConf === 'number' && normalizedConf <= 1.0) {
        normalizedConf = this.validator.normalizeAudioConfidence(normalizedConf);
      } else if (!Number.isInteger(normalizedConf) || normalizedConf < 0 || normalizedConf > 1000) {
        const err = new Error(`Invalid beat confidence at index ${i}: ${b.confidence}`);
        err.code = 'ERR_INVALID_CONFIDENCE';
        throw err;
      }

      normalizedBeats.push({
        id: b.id || `beat_${i}`,
        tick,
        sampleIndex: b.sampleIndex !== undefined ? b.sampleIndex : this.validator.ticksToSample(tick, audioSampleRate),
        confidence: normalizedConf,
        strength: typeof b.strength === 'number' ? this.roundHalfToEven(b.strength, 3) : 1.0
      });
    }

    // Sort beats deterministically by tick, then id
    normalizedBeats.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));

    // Normalized downbeats
    const normalizedDownbeats = [];
    for (let i = 0; i < rawDownbeats.length; i++) {
      const db = rawDownbeats[i];
      let tick = db.ticks !== undefined ? db.ticks : db.tick;
      if (tick === undefined && db.sampleIndex !== undefined) {
        tick = this.validator.sampleToTicks(db.sampleIndex, audioSampleRate);
      }
      let conf = db.confidence;
      if (typeof conf === 'number' && conf <= 1.0) {
        conf = this.validator.normalizeAudioConfidence(conf);
      }
      normalizedDownbeats.push({
        id: db.id || `downbeat_${i}`,
        barIndex: db.barIndex !== undefined ? db.barIndex : i,
        tick,
        confidence: conf !== undefined ? conf : 1000
      });
    }
    normalizedDownbeats.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));

    // Normalized onsets
    const normalizedOnsets = [];
    for (let i = 0; i < rawOnsets.length; i++) {
      const o = rawOnsets[i];
      let tick = o.ticks !== undefined ? o.ticks : o.tick;
      if (tick === undefined && o.sampleIndex !== undefined) {
        tick = this.validator.sampleToTicks(o.sampleIndex, audioSampleRate);
      }
      normalizedOnsets.push({
        tick,
        strength: typeof o.strength === 'number' ? this.roundHalfToEven(o.strength, 3) : 1.0
      });
    }
    normalizedOnsets.sort((a, b) => a.tick - b.tick);

    // Audio tempo structure
    const rawTempo = audioSidecar.tempo || {};
    const tempoConf = typeof rawTempo.confidence === 'number' && rawTempo.confidence <= 1.0
      ? this.validator.normalizeAudioConfidence(rawTempo.confidence)
      : (rawTempo.confidence || 950);

    const audioObservations = {
      tempo: {
        bpm: rawTempo.bpm || 120,
        confidence: tempoConf,
        isAmbiguous: Boolean(rawTempo.isAmbiguous),
        phaseOffsetTicks: rawTempo.phaseOffsetTicks || 0
      },
      beats: normalizedBeats,
      downbeats: normalizedDownbeats,
      onsets: normalizedOnsets
    };

    // =========================================================================
    // 3. Visual Observation Normalization
    // =========================================================================
    const visualFpsNum = visualSidecar.source.fps.numerator;
    const visualFpsDen = visualSidecar.source.fps.denominator;
    const rawFrames = Array.isArray(visualSidecar.frames) ? visualSidecar.frames : [];

    const normalizedFrames = [];
    let prevTick = -1;

    for (let fIdx = 0; fIdx < rawFrames.length; fIdx++) {
      const rf = rawFrames[fIdx];
      let frameTick = rf.tick;
      if (frameTick === undefined && rf.frameIndex !== undefined) {
        frameTick = this.validator.frameToTicks(rf.frameIndex, visualFpsNum, visualFpsDen);
      }

      if (!Number.isInteger(frameTick) || frameTick < 0) {
        const err = new Error(`Invalid visual frame tick at index ${fIdx}: ${frameTick}`);
        err.code = 'ERR_INVALID_FRAME_TICK';
        throw err;
      }

      if (frameTick <= prevTick) {
        const err = new Error(`Temporal monotonicity violation in visual frames: tick ${frameTick} <= prevTick ${prevTick}`);
        err.code = 'ERR_TEMPORAL_MONOTONICITY_VIOLATION';
        throw err;
      }
      prevTick = frameTick;

      // Extract and normalize faces
      const frameFaces = [];
      const srcFaces = Array.isArray(rf.faces) ? rf.faces : [];
      for (let j = 0; j < srcFaces.length; j++) {
        const face = srcFaces[j];
        let conf = face.confidence;
        if (typeof conf === 'number' && conf <= 1.0) {
          conf = this.validator.normalizeAudioConfidence(conf);
        } else if (!Number.isInteger(conf) || conf < 0 || conf > 1000) {
          conf = 950;
        }

        const box = face.box || face.bounds || { x: face.x || 0, y: face.y || 0, width: face.width || 0, height: face.height || 0 };
        frameFaces.push({
          faceId: face.faceId || face.id || `f_${fIdx}_face_${j}`,
          confidence: conf,
          box: {
            x: this.roundHalfToEven(box.x, 3),
            y: this.roundHalfToEven(box.y, 3),
            width: this.roundHalfToEven(box.width, 3),
            height: this.roundHalfToEven(box.height, 3)
          }
        });
      }

      normalizedFrames.push({
        tick: frameTick,
        frameIndex: rf.frameIndex !== undefined ? rf.frameIndex : fIdx,
        faces: frameFaces
      });
    }

    const visualObservations = {
      coordinateSpace: {
        units: 'source_pixel',
        origin: 'top_left',
        precisionDecimals: 3
      },
      frames: normalizedFrames
    };

    // =========================================================================
    // 4. Assemble Unified Auxiliary Fusion Document
    // =========================================================================
    const audioDurationTicks = audioSidecar.source.durationTicks || 0;
    const visualDurationTicks = visualSidecar.source.durationTicks || 0;
    const durationTicks = Math.max(audioDurationTicks, visualDurationTicks);

    const fusionPayloadRaw = {
      schemaVersion: 'eme-fusion-evidence.v1',
      fusionId: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      provenance: {
        projectRevision,
        audioSource: {
          assetId: audioSidecar.source.assetId || `audio_asset_${audioMediaSha256.slice(0, 8)}`,
          sha256: audioMediaSha256,
          sampleRate: audioSampleRate,
          analysisId: audioSidecar.analysisId || `sha256:${crypto.createHash('sha256').update(JSON.stringify(audioSidecar)).digest('hex')}`,
          schemaVersion: 'eme-beat-analysis.v1'
        },
        visualSource: {
          assetId: visualSidecar.source.assetId || `visual_asset_${visualMediaSha256.slice(0, 8)}`,
          sha256: visualMediaSha256,
          width: visualSidecar.source.width,
          height: visualSidecar.source.height,
          fps: {
            numerator: visualFpsNum,
            denominator: visualFpsDen
          },
          sidecarId: visualSidecar.sidecarId || `sha256:${crypto.createHash('sha256').update(JSON.stringify(visualSidecar)).digest('hex')}`,
          schemaVersion: 'eme-visual-intelligence.v1'
        }
      },
      timebase: {
        ticksPerSecond: this.TICKS_PER_SECOND,
        durationTicks,
        intervalConvention: 'half-open'
      },
      policy: {
        policyVersion,
        confidenceNormalization: 'roundHalfToEven(1000 * c)'
      },
      audioObservations,
      visualObservations
    };

    // Enforce Pure Observation Separation (CTR-03 / INV-06)
    this.validator.assertPureObservation(fusionPayloadRaw, 'AudioVisualEvidenceFusion');

    // Compute Deterministic Content-Addressed Fingerprint
    const fingerprint = this.validator.computeFusionFingerprint(fusionPayloadRaw);
    fusionPayloadRaw.fusionId = fingerprint;

    // Validate assembled payload against eme-fusion-evidence.v1 contract
    const validationResult = this.validator.validateFusionEvidence(fusionPayloadRaw);
    if (!validationResult.valid) {
      const err = new Error(`Assembled fusion payload failed contract validation`);
      err.code = 'ERR_FUSION_VALIDATION_FAILED';
      throw err;
    }

    return {
      valid: true,
      fusionEvidence: fusionPayloadRaw,
      fingerprint
    };
  }

  /**
   * Deterministic parity evaluation: run fusion across multiple independent processes
   * or invocations to verify 100% bit-identical JSON serialization and checksums.
   */
  verifyDeterministicParity(params, runsCount = 3) {
    if (runsCount < 2) {
      throw new Error('Parity verification requires at least 2 runs');
    }

    const results = [];
    const fingerprints = [];

    for (let r = 0; r < runsCount; r++) {
      // Deep clone inputs to ensure clean state
      const cleanParams = JSON.parse(JSON.stringify(params));
      const res = this.fuse(cleanParams);
      const serialized = JSON.stringify(res.fusionEvidence);
      const hash = crypto.createHash('sha256').update(serialized).digest('hex');

      results.push(serialized);
      fingerprints.push(res.fingerprint);
    }

    // Verify all runs produced identical output
    const baseSerialized = results[0];
    const baseFingerprint = fingerprints[0];

    for (let i = 1; i < runsCount; i++) {
      if (results[i] !== baseSerialized) {
        return {
          parityPassed: false,
          discrepancyIndex: i,
          reason: 'SERIALIZATION_MISMATCH'
        };
      }
      if (fingerprints[i] !== baseFingerprint) {
        return {
          parityPassed: false,
          discrepancyIndex: i,
          reason: 'FINGERPRINT_MISMATCH'
        };
      }
    }

    return {
      parityPassed: true,
      runsEvaluated: runsCount,
      fingerprint: baseFingerprint,
      sha256: crypto.createHash('sha256').update(baseSerialized).digest('hex')
    };
  }
}

module.exports = { AudioVisualEvidenceFusion };
