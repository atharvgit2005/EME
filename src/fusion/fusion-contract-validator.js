/**
 * FusionContractValidator
 *
 * Formal contract validator, exact rational time-alignment engine, and deterministic
 * confidence normalizer for EME Phase 33: Audio-Visual Composition Synthesis (AVCS-33).
 *
 * Invariants Enforced:
 * - Timebase: Strictly 120,000 integer ticks / second with half-open intervals.
 * - Exact Rational Arithmetic: BigInt fractions with deterministic round-half-to-even quantization.
 * - Confidence Normalization: Audio float [0.0, 1.0] -> integer [0, 1000] via roundHalfToEven(1000 * c).
 * - Observation Separation (CTR-03): Sidecars contain strictly observations, zero solver placement decisions.
 * - Provenance & Freshness (GATE-01): Validates media digests, sidecar fingerprints, and project revisions.
 */

const crypto = require('node:crypto');

class FusionContractValidator {
  constructor() {
    this.TICKS_PER_SECOND = 120000;
  }

  // =========================================================================
  // Section 1: Exact Rational Arithmetic & Quantization Core
  // =========================================================================

  _gcd(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
      const temp = y;
      y = x % y;
      x = temp;
    }
    return x === 0n ? 1n : x;
  }

  _simplify(rat) {
    if (rat.den === 0n) throw new Error('Division by zero in rational arithmetic');
    let num = rat.num;
    let den = rat.den;
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const common = this._gcd(num, den);
    return { num: num / common, den: den / common };
  }

  toRational(val) {
    if (typeof val === 'bigint') {
      return { num: val, den: 1n };
    }
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) throw new Error(`Invalid number for rational conversion: ${val}`);
      if (Number.isInteger(val)) {
        return { num: BigInt(val), den: 1n };
      }
      const s = val.toString();
      const dot = s.indexOf('.');
      if (dot === -1) {
        return { num: BigInt(s), den: 1n };
      }
      const decPlaces = s.length - dot - 1;
      const den = 10n ** BigInt(decPlaces);
      const numStr = s.replace('.', '');
      return this._simplify({ num: BigInt(numStr), den });
    }
    if (typeof val === 'string') {
      if (val.includes('/')) {
        const parts = val.split('/');
        return this._simplify({ num: BigInt(parts[0].trim()), den: BigInt(parts[1].trim()) });
      }
      return this.toRational(Number(val));
    }
    if (val && typeof val.num === 'bigint' && typeof val.den === 'bigint') {
      return this._simplify(val);
    }
    throw new Error(`Cannot convert value to rational: ${JSON.stringify(val)}`);
  }

  /**
   * Quantize rational to scaleDecimals using deterministic Round-Half-to-Even (Banker's Rounding).
   * @param {Object} rat - { num: BigInt, den: BigInt }
   * @param {number} scaleDecimals - Target decimal places (0 for integer ticks)
   * @returns {number|bigint}
   */
  roundHalfToEvenRational(rat, scaleDecimals = 0) {
    const simplified = this._simplify(rat);
    const scaleFactor = 10n ** BigInt(scaleDecimals);
    const scaledNum = simplified.num * scaleFactor;
    const den = simplified.den;

    const quotient = scaledNum / den;
    const remainder = scaledNum % den;

    let rounded = quotient;
    const absRem = remainder < 0n ? -remainder : remainder;
    const doubledAbsRem = absRem * 2n;

    if (doubledAbsRem > den) {
      rounded = remainder > 0n ? quotient + 1n : quotient - 1n;
    } else if (doubledAbsRem === den) {
      // Exactly half-way tie: round to nearest even integer
      const isQuotientEven = (quotient % 2n === 0n);
      if (!isQuotientEven) {
        rounded = remainder > 0n ? quotient + 1n : quotient - 1n;
      }
    }

    if (scaleDecimals === 0) {
      return Number(rounded);
    }
    return Number(rounded) / Math.pow(10, scaleDecimals);
  }

  // =========================================================================
  // Section 2: Canonical Temporal Mapping
  // =========================================================================

  /**
   * Convert audio sample index to canonical integer ticks.
   * tick = roundHalfToEven((sampleIndex * 120000) / sampleRate)
   */
  sampleToTicks(sampleIndex, sampleRate) {
    if (!Number.isInteger(sampleIndex) || sampleIndex < 0) {
      throw new Error(`Sample index must be non-negative integer, got: ${sampleIndex}`);
    }
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error(`Sample rate must be positive integer, got: ${sampleRate}`);
    }

    const rat = {
      num: BigInt(sampleIndex) * BigInt(this.TICKS_PER_SECOND),
      den: BigInt(sampleRate)
    };
    return this.roundHalfToEvenRational(rat, 0);
  }

  /**
   * Convert canonical integer ticks to audio sample index.
   */
  ticksToSample(ticks, sampleRate) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error(`Ticks must be non-negative integer, got: ${ticks}`);
    }
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error(`Sample rate must be positive integer, got: ${sampleRate}`);
    }

    const rat = {
      num: BigInt(ticks) * BigInt(sampleRate),
      den: BigInt(this.TICKS_PER_SECOND)
    };
    return this.roundHalfToEvenRational(rat, 0);
  }

  /**
   * Convert video frame index to canonical integer ticks.
   * tick = roundHalfToEven((frameIndex * 120000 * fpsDen) / fpsNum)
   */
  frameToTicks(frameIndex, fpsNumerator, fpsDenominator) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      throw new Error(`Frame index must be non-negative integer, got: ${frameIndex}`);
    }
    if (!Number.isInteger(fpsNumerator) || fpsNumerator <= 0) {
      throw new Error(`FPS numerator must be positive integer, got: ${fpsNumerator}`);
    }
    if (!Number.isInteger(fpsDenominator) || fpsDenominator <= 0) {
      throw new Error(`FPS denominator must be positive integer, got: ${fpsDenominator}`);
    }

    const rat = {
      num: BigInt(frameIndex) * BigInt(this.TICKS_PER_SECOND) * BigInt(fpsDenominator),
      den: BigInt(fpsNumerator)
    };
    return this.roundHalfToEvenRational(rat, 0);
  }

  /**
   * Convert canonical integer ticks to video frame index.
   */
  ticksToFrame(ticks, fpsNumerator, fpsDenominator) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error(`Ticks must be non-negative integer, got: ${ticks}`);
    }
    if (!Number.isInteger(fpsNumerator) || fpsNumerator <= 0) {
      throw new Error(`FPS numerator must be positive integer, got: ${fpsNumerator}`);
    }
    if (!Number.isInteger(fpsDenominator) || fpsDenominator <= 0) {
      throw new Error(`FPS denominator must be positive integer, got: ${fpsDenominator}`);
    }

    const rat = {
      num: BigInt(ticks) * BigInt(fpsNumerator),
      den: BigInt(this.TICKS_PER_SECOND) * BigInt(fpsDenominator)
    };
    return this.roundHalfToEvenRational(rat, 0);
  }

  // =========================================================================
  // Section 3: Deterministic Confidence Normalization
  // =========================================================================

  /**
   * Normalize Earshot floating-point confidence [0.0, 1.0] to integer [0, 1000]
   * using exact rational arithmetic and round-half-to-even.
   */
  normalizeAudioConfidence(floatConf) {
    if (typeof floatConf !== 'number' || !Number.isFinite(floatConf)) {
      throw new Error(`Invalid audio confidence value: ${floatConf} (must be finite number)`);
    }
    if (floatConf < 0.0 || floatConf > 1.0) {
      throw new Error(`Audio confidence out of bounds [0.0, 1.0]: ${floatConf}`);
    }

    const rat = this.toRational(floatConf);
    const scaledRat = { num: rat.num * 1000n, den: rat.den };
    const intConf = this.roundHalfToEvenRational(scaledRat, 0);

    // Strict boundary clamp guard
    if (intConf < 0) return 0;
    if (intConf > 1000) return 1000;
    return intConf;
  }

  // =========================================================================
  // Section 4: Validation & Pure Observation Enforcement
  // =========================================================================

  /**
   * Validate that a payload contains pure observations and ZERO decision/operation fields.
   */
  assertPureObservation(payload, context = 'Sidecar') {
    const barredFields = [
      'safe_placement_rect',
      'placement_score',
      'safePlacementRect',
      'placementScore',
      'operationPlan',
      'operation_plan',
      'edit_decision',
      'editDecision',
      'candidate_cut',
      'candidateCut'
    ];

    const inspectObj = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (barredFields.includes(key)) {
          throw new Error(`CTR-03 Invariant Breach in ${context}: Barred decision field '${fullPath}' found in observation payload`);
        }
        inspectObj(obj[key], fullPath);
      }
    };

    inspectObj(payload);
  }

  /**
   * Validate a Beat Analysis sidecar against eme-beat-analysis.v1.
   */
  validateBeatAnalysis(sidecar) {
    if (!sidecar || typeof sidecar !== 'object') {
      throw new Error('Beat analysis sidecar must be an object');
    }
    if (sidecar.schemaVersion !== 'eme-beat-analysis.v1') {
      throw new Error(`Unsupported schemaVersion: ${sidecar.schemaVersion} (expected 'eme-beat-analysis.v1')`);
    }
    if (!sidecar.analysisId || !sidecar.analysisId.startsWith('sha256:')) {
      throw new Error(`Invalid analysisId format: ${sidecar.analysisId}`);
    }
    if (!sidecar.source || typeof sidecar.source !== 'object') {
      throw new Error('Beat analysis sidecar missing source object');
    }
    if (!/^[a-f0-9]{64}$/.test(sidecar.source.sha256)) {
      throw new Error(`Invalid source.sha256: ${sidecar.source.sha256}`);
    }
    if (!Number.isInteger(sidecar.source.sampleRate) || sidecar.source.sampleRate < 8000) {
      throw new Error(`Invalid sampleRate: ${sidecar.source.sampleRate}`);
    }
    if (!Number.isInteger(sidecar.source.durationTicks) || sidecar.source.durationTicks < 0) {
      throw new Error(`Invalid durationTicks: ${sidecar.source.durationTicks}`);
    }
    if (!sidecar.events || !Array.isArray(sidecar.events.beats)) {
      throw new Error('Beat analysis missing events.beats array');
    }

    for (let i = 0; i < sidecar.events.beats.length; i++) {
      const b = sidecar.events.beats[i];
      if (!b.id || !Number.isInteger(b.ticks) || b.ticks < 0) {
        throw new Error(`Invalid beat entry at index ${i}: ${JSON.stringify(b)}`);
      }
      if (typeof b.confidence === 'number' && (b.confidence < 0 || b.confidence > 1.0)) {
        throw new Error(`Beat confidence out of range [0.0, 1.0] at index ${i}: ${b.confidence}`);
      }
    }

    this.assertPureObservation(sidecar, 'BeatAnalysisSidecar');
    return { valid: true };
  }

  /**
   * Validate a Visual Intelligence sidecar against eme-visual-intelligence.v1.
   */
  validateVisualIntelligence(sidecar) {
    if (!sidecar || typeof sidecar !== 'object') {
      throw new Error('Visual intelligence sidecar must be an object');
    }
    if (sidecar.schemaVersion !== 'eme-visual-intelligence.v1') {
      throw new Error(`Unsupported schemaVersion: ${sidecar.schemaVersion} (expected 'eme-visual-intelligence.v1')`);
    }
    if (!sidecar.sidecarId || !sidecar.sidecarId.startsWith('sha256:')) {
      throw new Error(`Invalid sidecarId format: ${sidecar.sidecarId}`);
    }
    if (!sidecar.source || typeof sidecar.source !== 'object') {
      throw new Error('Visual intelligence sidecar missing source object');
    }
    if (!/^[a-f0-9]{64}$/.test(sidecar.source.sha256)) {
      throw new Error(`Invalid source.sha256: ${sidecar.source.sha256}`);
    }
    if (!sidecar.frames || !Array.isArray(sidecar.frames)) {
      throw new Error('Visual intelligence missing frames array');
    }

    let prevTick = -1;
    for (let i = 0; i < sidecar.frames.length; i++) {
      const f = sidecar.frames[i];
      if (!Number.isInteger(f.tick) || f.tick < 0) {
        throw new Error(`Invalid frame tick at index ${i}: ${f.tick}`);
      }
      if (f.tick <= prevTick) {
        throw new Error(`Temporal monotonicity violated at frame ${i}: tick ${f.tick} <= ${prevTick}`);
      }
      prevTick = f.tick;

      if (Array.isArray(f.faces)) {
        for (const face of f.faces) {
          if (!Number.isInteger(face.confidence) || face.confidence < 0 || face.confidence > 1000) {
            throw new Error(`Visual face confidence must be integer [0, 1000], got: ${face.confidence}`);
          }
        }
      }
    }

    this.assertPureObservation(sidecar, 'VisualIntelligenceSidecar');
    return { valid: true };
  }

  /**
   * Validate a Fusion Evidence payload against eme-fusion-evidence.v1.
   */
  validateFusionEvidence(fusionPayload) {
    if (!fusionPayload || typeof fusionPayload !== 'object') {
      throw new Error('Fusion evidence payload must be an object');
    }
    if (fusionPayload.schemaVersion !== 'eme-fusion-evidence.v1') {
      throw new Error(`Invalid schemaVersion: ${fusionPayload.schemaVersion}`);
    }
    if (!fusionPayload.fusionId || !fusionPayload.fusionId.startsWith('sha256:')) {
      throw new Error(`Invalid fusionId format: ${fusionPayload.fusionId}`);
    }
    if (!fusionPayload.provenance || typeof fusionPayload.provenance !== 'object') {
      throw new Error('Fusion evidence missing provenance object');
    }
    if (!Number.isInteger(fusionPayload.provenance.projectRevision) || fusionPayload.provenance.projectRevision < 1) {
      throw new Error(`Invalid provenance.projectRevision: ${fusionPayload.provenance.projectRevision}`);
    }
    if (!fusionPayload.provenance.audioSource || !/^[a-f0-9]{64}$/.test(fusionPayload.provenance.audioSource.sha256)) {
      throw new Error('Invalid provenance.audioSource.sha256');
    }
    if (!fusionPayload.provenance.visualSource || !/^[a-f0-9]{64}$/.test(fusionPayload.provenance.visualSource.sha256)) {
      throw new Error('Invalid provenance.visualSource.sha256');
    }
    if (!fusionPayload.timebase || fusionPayload.timebase.ticksPerSecond !== 120000) {
      throw new Error('Timebase ticksPerSecond must be exactly 120000');
    }
    if (fusionPayload.timebase.intervalConvention !== 'half-open') {
      throw new Error("Interval convention must be 'half-open'");
    }

    // Verify all audio beats have normalized integer confidence [0, 1000]
    if (fusionPayload.audioObservations && Array.isArray(fusionPayload.audioObservations.beats)) {
      for (let i = 0; i < fusionPayload.audioObservations.beats.length; i++) {
        const b = fusionPayload.audioObservations.beats[i];
        if (!Number.isInteger(b.confidence) || b.confidence < 0 || b.confidence > 1000) {
          throw new Error(`Fused audio beat confidence must be normalized integer [0, 1000], got: ${b.confidence} at beat ${i}`);
        }
      }
    }

    this.assertPureObservation(fusionPayload, 'FusionEvidencePayload');
    return { valid: true };
  }

  // =========================================================================
  // Section 5: Freshness & Cache Invalidation
  // =========================================================================

  /**
   * Verify freshness of a fusion evidence payload against active project and source digests.
   */
  verifyFreshness({ fusionEvidence, currentProjectRevision, currentAudioSha256, currentVisualSha256 }) {
    if (!fusionEvidence || !fusionEvidence.provenance) {
      return { valid: false, reason: 'MISSING_PROVENANCE' };
    }

    const prov = fusionEvidence.provenance;
    if (prov.projectRevision !== currentProjectRevision) {
      return {
        valid: false,
        reason: 'STALE_PROJECT_REVISION',
        details: `Payload revision ${prov.projectRevision} !== current revision ${currentProjectRevision}`
      };
    }

    if (prov.audioSource.sha256 !== currentAudioSha256) {
      return {
        valid: false,
        reason: 'STALE_AUDIO_MEDIA_DIGEST',
        details: `Audio digest ${prov.audioSource.sha256} !== current digest ${currentAudioSha256}`
      };
    }

    if (prov.visualSource.sha256 !== currentVisualSha256) {
      return {
        valid: false,
        reason: 'STALE_VISUAL_MEDIA_DIGEST',
        details: `Visual digest ${prov.visualSource.sha256} !== current digest ${currentVisualSha256}`
      };
    }

    return { valid: true, status: 'FRESH' };
  }

  // =========================================================================
  // Section 6: Deterministic Fingerprinting & Serialization
  // =========================================================================

  canonicalStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.canonicalStringify(item)).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    return '{' + sortedKeys.map(k => JSON.stringify(k) + ':' + this.canonicalStringify(obj[k])).join(',') + '}';
  }

  computeFusionFingerprint(payload) {
    // Clone and exclude volatile or self-referencing fusionId
    const clone = { ...payload };
    delete clone.fusionId;
    const canonicalStr = this.canonicalStringify(clone);
    const hash = crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
    return `sha256:${hash}`;
  }
}

module.exports = { FusionContractValidator };
