/**
 * Editing Mechanics Engine (EME) - Repair Confidence Calibrator & Evidence Scorer
 *
 * Implements Stage 29.1 in accordance with binding conditions ARC-29-01 through ARC-29-07:
 * - Deterministic heuristic scoring based on evidence strength, timeline geometry headroom,
 *   and operation risk suitability.
 * - Enforces w_e + w_g + w_r = 1.0 and bounded scores C in [0.0, 1.0].
 * - Renames S_risk to S_risk_suitability (higher = more favorable safety profile) (ARC-29-02).
 * - Binds confidence strictly to fresh finding evidence and active project revision (ARC-29-03).
 * - Zeroes confidence on stale revision or missing/malformed evidence.
 * - Generates structured disposition: AUTONOMOUS_EXECUTION (>= 0.80),
 *   HUMAN_ESCALATION_REQUIRED (0.40 <= C < 0.80), or DISCARD_SPECULATIVE (< 0.40).
 * - Hard safety preconditions always take precedence (ARC-29-01).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CONFIDENCE_POLICY_PATH = path.join(__dirname, '../schemas/audio-repair-confidence.v1.json');

const DEFAULT_CONFIDENCE_POLICY = {
  schema_version: '1.0.0',
  policy_name: 'default_adaptive_confidence_v1',
  weights: {
    evidence: 0.50,
    geometry: 0.30,
    risk_suitability: 0.20
  },
  thresholds: {
    autonomous_execution: 0.80,
    minimum_execution: 0.40
  },
  penalties: {
    max_penalty: 0.50,
    tight_boundary_penalty: 0.15,
    unstable_history_penalty: 0.20
  },
  rounding_precision: 4
};

class RepairConfidenceCalibrator {
  /**
   * @param {Object} [options]
   * @param {Object} [options.policy] Custom confidence policy configuration
   */
  constructor(options = {}) {
    this.policy = options.policy || DEFAULT_CONFIDENCE_POLICY;
    this.validatePolicy(this.policy);
  }

  /**
   * Validates policy configuration against schema and mathematical invariants.
   * @param {Object} policy
   */
  validatePolicy(policy) {
    if (!policy || typeof policy !== 'object') {
      throw new Error('Confidence policy must be a valid non-null object');
    }
    if (policy.schema_version !== '1.0.0') {
      throw new Error(`Unsupported confidence policy schema version: ${policy.schema_version}`);
    }
    if (!policy.policy_name || typeof policy.policy_name !== 'string') {
      throw new Error('Confidence policy requires a valid policy_name string');
    }

    const { weights, thresholds } = policy;
    if (!weights || typeof weights !== 'object') {
      throw new Error('Confidence policy requires a weights object');
    }
    if (
      typeof weights.evidence !== 'number' ||
      typeof weights.geometry !== 'number' ||
      typeof weights.risk_suitability !== 'number'
    ) {
      throw new Error('Weights evidence, geometry, and risk_suitability must be numbers');
    }

    const sumWeights = weights.evidence + weights.geometry + weights.risk_suitability;
    if (Math.abs(sumWeights - 1.0) > 1e-6) {
      throw new Error(`Scoring weights must sum to 1.0. Received sum: ${sumWeights}`);
    }

    if (weights.evidence < 0 || weights.geometry < 0 || weights.risk_suitability < 0) {
      throw new Error('Scoring weights must be non-negative');
    }

    if (!thresholds || typeof thresholds !== 'object') {
      throw new Error('Confidence policy requires a thresholds object');
    }
    if (
      typeof thresholds.autonomous_execution !== 'number' ||
      typeof thresholds.minimum_execution !== 'number'
    ) {
      throw new Error('Thresholds autonomous_execution and minimum_execution must be numbers');
    }
    if (thresholds.autonomous_execution < thresholds.minimum_execution) {
      throw new Error('autonomous_execution threshold must be >= minimum_execution threshold');
    }
  }

  /**
   * Evaluates and calibrates the confidence of a proposed repair.
   *
   * @param {Object} proposal Canonical repair proposal from AudioRepairPlanner
   * @param {Object} finding Earshot finding evidence
   * @param {Object} project Canonical EME project
   * @param {Object} [contextOptions] Optional historical or external context (e.g. prior pass penalties)
   * @returns {Object} Comprehensive confidence assessment record
   */
  evaluateProposalConfidence(proposal, finding, project, contextOptions = {}) {
    const precision = this.policy.rounding_precision || 4;
    const factor = Math.pow(10, precision);

    // 1. Mandatory Input Existence & Structure Validation (ARC-29-02 & ARC-29-03)
    if (!proposal || typeof proposal !== 'object') {
      return this._createIneligibleResult(
        null,
        finding,
        project,
        'INELIGIBLE_MALFORMED_PROPOSAL',
        'Proposal is missing or not a valid object'
      );
    }
    if (!finding || typeof finding !== 'object') {
      return this._createIneligibleResult(
        proposal,
        null,
        project,
        'INELIGIBLE_MALFORMED_FINDING',
        'Finding evidence is missing or not a valid object'
      );
    }
    if (!project || typeof project !== 'object') {
      return this._createIneligibleResult(
        proposal,
        finding,
        null,
        'INELIGIBLE_MALFORMED_PROJECT',
        'Project is missing or not a valid object'
      );
    }

    // 2. Strict Stale Revision Validation (ARC-29-03)
    // Finding and proposal must bind to active project revision
    const currentRevision = project.revision;
    const findingRevision = finding.source_revision !== undefined ? finding.source_revision : finding.project_revision;
    const expectedBaseRevision = proposal.preconditions?.expected_base_revision;

    if (findingRevision !== undefined && findingRevision !== currentRevision) {
      return this._createIneligibleResult(
        proposal,
        finding,
        project,
        'CONFIDENCE_ZEROED_STALE',
        `Finding revision (${findingRevision}) is stale; does not match current project revision (${currentRevision})`
      );
    }
    if (expectedBaseRevision !== undefined && expectedBaseRevision !== currentRevision) {
      return this._createIneligibleResult(
        proposal,
        finding,
        project,
        'CONFIDENCE_ZEROED_STALE',
        `Proposal expected base revision (${expectedBaseRevision}) is stale; does not match current project revision (${currentRevision})`
      );
    }

    // 3. Hard Safety Preconditions Gate (ARC-29-01)
    // Hard safety violations take precedence over numerical confidence
    if (proposal.status === 'REJECTED') {
      return this._createIneligibleResult(
        proposal,
        finding,
        project,
        'REJECTED_PRECONDITION_FAILED',
        `Proposal was rejected during planning: ${proposal.rationale || 'Hard precondition violation'}`
      );
    }
    if (proposal.preconditions && proposal.preconditions.bounds_valid === false) {
      return this._createIneligibleResult(
        proposal,
        finding,
        project,
        'REJECTED_PRECONDITION_FAILED',
        'Proposal timeline bounds are invalid'
      );
    }

    // 4. Calculate Component Scores

    // A. Evidence Score (S_e in [0.0, 1.0])
    const Se = this._calculateEvidenceScore(finding);

    // B. Geometry Margin Score (S_g in [0.0, 1.0])
    const Sg = this._calculateGeometryScore(proposal, project);

    // C. Risk Suitability Score (S_r in [0.0, 1.0])
    // Higher score = safer, less disruptive operation profile
    const Sr = this._calculateRiskSuitabilityScore(proposal);

    // D. Cumulative & Dynamic Penalties (Pi)
    let penalty = 0.0;
    if (contextOptions.unstableHistory) {
      penalty += (this.policy.penalties?.unstable_history_penalty || 0.20);
    }
    if (Sg < 0.40) {
      penalty += (this.policy.penalties?.tight_boundary_penalty || 0.15);
    }
    if (typeof contextOptions.customPenalty === 'number' && contextOptions.customPenalty > 0) {
      penalty += contextOptions.customPenalty;
    }

    const maxPenalty = this.policy.penalties?.max_penalty !== undefined
      ? this.policy.penalties.max_penalty
      : 0.50;
    penalty = Math.min(penalty, maxPenalty);

    // 5. Compute Raw & Normalized Score (ARC-29-02)
    const { evidence: we, geometry: wg, risk_suitability: wr } = this.policy.weights;
    const rawScore = (we * Se) + (wg * Sg) + (wr * Sr) - penalty;
    const boundedScore = Math.min(1.0, Math.max(0.0, rawScore));
    const quantizedScore = Math.round(boundedScore * factor) / factor;

    // 6. Threshold Gating & Disposition Mapping (ARC-29-04)
    const thetaAuto = this.policy.thresholds.autonomous_execution;
    const thetaMin = this.policy.thresholds.minimum_execution;

    let disposition;
    let rationale;

    if (quantizedScore >= thetaAuto) {
      disposition = 'AUTONOMOUS_EXECUTION';
      rationale = `Confidence score ${quantizedScore.toFixed(4)} meets or exceeds autonomous threshold (${thetaAuto.toFixed(4)}); all safety preconditions satisfied.`;
    } else if (quantizedScore >= thetaMin) {
      disposition = 'HUMAN_ESCALATION_REQUIRED';
      rationale = `Confidence score ${quantizedScore.toFixed(4)} is below autonomous threshold (${thetaAuto.toFixed(4)}) but meets minimum viable threshold (${thetaMin.toFixed(4)}); requires human-in-the-loop escalation.`;
    } else {
      disposition = 'DISCARD_SPECULATIVE';
      rationale = `Confidence score ${quantizedScore.toFixed(4)} is below minimum execution threshold (${thetaMin.toFixed(4)}); discarded as speculative noise.`;
    }

    return {
      assessment_id: `eval_${crypto.randomUUID().slice(0, 12)}`,
      policy_name: this.policy.policy_name,
      policy_version: this.policy.schema_version,
      timestamp: new Date().toISOString(),
      proposal_id: proposal.proposal_id || 'unknown',
      finding_id: finding.finding_id || finding.id || 'unknown',
      defect_type: finding.defect_type || finding.check_id || 'unknown',
      clip_id: proposal.clip_id || proposal.parameters?.clip_id || null,
      track_id: proposal.track_id || proposal.parameters?.track_id || null,
      project_revision: currentRevision,
      source_revision: findingRevision !== undefined ? findingRevision : currentRevision,
      source_media_sha256: finding.source_media_sha256 || null,
      confidence_score: quantizedScore,
      disposition: disposition,
      eligible_for_autonomous: disposition === 'AUTONOMOUS_EXECUTION',
      components: {
        evidence_score: Math.round(Se * factor) / factor,
        geometry_score: Math.round(Sg * factor) / factor,
        risk_suitability_score: Math.round(Sr * factor) / factor,
        weights: { ...this.policy.weights },
        penalty: Math.round(penalty * factor) / factor,
        raw_score: Math.round(rawScore * factor) / factor
      },
      rationale: rationale
    };
  }

  /**
   * Helper to format ineligible / rejected assessment output.
   */
  _createIneligibleResult(proposal, finding, project, disposition, rationale) {
    return {
      assessment_id: `eval_${crypto.randomUUID().slice(0, 12)}`,
      policy_name: this.policy.policy_name,
      policy_version: this.policy.schema_version,
      timestamp: new Date().toISOString(),
      proposal_id: proposal?.proposal_id || 'unknown',
      finding_id: finding?.finding_id || finding?.id || 'unknown',
      defect_type: finding?.defect_type || finding?.check_id || 'unknown',
      clip_id: proposal?.clip_id || proposal?.parameters?.clip_id || null,
      track_id: proposal?.track_id || proposal?.parameters?.track_id || null,
      project_revision: project?.revision || 0,
      source_revision: finding?.source_revision !== undefined ? finding.source_revision : null,
      source_media_sha256: finding?.source_media_sha256 || null,
      confidence_score: 0.0000,
      disposition: disposition,
      eligible_for_autonomous: false,
      components: {
        evidence_score: 0.0000,
        geometry_score: 0.0000,
        risk_suitability_score: 0.0000,
        weights: { ...this.policy.weights },
        penalty: 0.0000,
        raw_score: 0.0000
      },
      rationale: rationale
    };
  }

  /**
   * Calculates S_evidence in [0.0, 1.0] from acoustic finding metadata.
   */
  _calculateEvidenceScore(finding) {
    // Explicit finding confidence takes precedence if defined
    if (typeof finding.confidence === 'number' && finding.confidence >= 0 && finding.confidence <= 1) {
      return finding.confidence;
    }

    const defectType = finding.defect_type || finding.check_id || '';

    // Audio Sync Defect
    if (defectType.includes('SYNC') || defectType === 'AUDIO_SYNC_OFFSET') {
      const measured = finding.measured_value;
      if (!measured) return 0.50;

      // Onset sharpness / clarity / confidence
      if (typeof measured.confidence === 'number') {
        return Math.min(1.0, Math.max(0.0, measured.confidence));
      }
      if (typeof measured.transient_clarity === 'number') {
        return Math.min(1.0, Math.max(0.0, measured.transient_clarity));
      }

      // If offset magnitude is measured with clean severity
      const offsetMs = Math.abs(measured.max_offset_ms || measured.offset_ms || 0);
      if (offsetMs > 50) {
        // Obvious, unambiguous desync
        return 0.95;
      } else if (offsetMs > 25) {
        return 0.85;
      }
      return 0.60;
    }

    // True Peak Overflow
    if (defectType.includes('PEAK') || defectType === 'TRUE_PEAK_EXCEEDED') {
      const measured = finding.measured_value;
      if (!measured) return 0.50;

      const peakDbtp = measured.max_true_peak_dbtp !== undefined
        ? measured.max_true_peak_dbtp
        : (measured.peak_dbtp || 0);

      // Obvious peak violation above 0.0 dBTP is crisp evidence
      if (peakDbtp >= 0.5) {
        return 0.95;
      } else if (peakDbtp > -1.0) {
        return 0.85;
      }
      // Near ceiling / borderline
      return 0.65;
    }

    return 0.50;
  }

  /**
   * Calculates S_geometry in [0.0, 1.0] based on available space on timeline.
   */
  _calculateGeometryScore(proposal, project) {
    const strategy = proposal.strategy;
    if (strategy === 'PEAK_ATTENUATION') {
      // Gain / envelope operations do not alter timeline bounds
      return 1.0;
    }

    if (strategy !== 'SYNC_RETIME') {
      return 0.80;
    }

    const clipId = proposal.clip_id || proposal.parameters?.clip_id;
    if (!clipId || !project || !Array.isArray(project.clips)) {
      return 0.50;
    }

    const clip = project.clips.find(c => c.id === clipId);
    if (!clip) return 0.50;

    const trackClips = project.clips
      .filter(c => c.trackId === clip.trackId && c.id !== clip.id)
      .sort((a, b) => a.startTick - b.startTick);

    const shiftTicks = proposal.parameters?.shift_ticks || 0;
    const targetStartTick = proposal.parameters?.target_start_tick !== undefined
      ? proposal.parameters.target_start_tick
      : (clip.startTick + shiftTicks);
    const targetEndTick = targetStartTick + clip.durationTicks;

    // Check distance to preceding clip
    const precedingClips = trackClips.filter(c => c.startTick + c.durationTicks <= clip.startTick);
    const followingClips = trackClips.filter(c => c.startTick >= clip.startTick + clip.durationTicks);

    let leftMargin = targetStartTick; // to 0
    if (precedingClips.length > 0) {
      const prev = precedingClips[precedingClips.length - 1];
      leftMargin = targetStartTick - (prev.startTick + prev.durationTicks);
    }

    let rightMargin = Infinity;
    if (followingClips.length > 0) {
      const next = followingClips[0];
      rightMargin = next.startTick - targetEndTick;
    }

    const minMargin = Math.min(leftMargin, rightMargin);

    // Negative margin means overlap (precondition will catch, but score is 0.0)
    if (minMargin < 0) return 0.0;

    // If margin is generous (> 120,000 ticks = 1.0s): 1.0
    if (minMargin >= 120000) return 1.0;
    // If moderate (> 24,000 ticks = 200ms): 0.80
    if (minMargin >= 24000) return 0.80;
    // If tight (< 6,000 ticks = 50ms): 0.30
    if (minMargin < 6000) return 0.25;

    return 0.50;
  }

  /**
   * Calculates S_risk_suitability in [0.0, 1.0].
   * Higher score = operation is lower risk, more suitable for automatic execution.
   */
  _calculateRiskSuitabilityScore(proposal) {
    const strategy = proposal.strategy;

    if (strategy === 'SYNC_RETIME') {
      const shiftTicks = Math.abs(proposal.parameters?.shift_ticks || 0);
      // Small micro-shift (<= 30ms = 3600 ticks) is very low risk
      if (shiftTicks <= 3600) return 1.0;
      // Normal shift (<= 200ms = 24,000 ticks) is standard risk
      if (shiftTicks <= 24000) return 0.85;
      // Moderately large shift (<= 500ms = 60,000 ticks)
      if (shiftTicks <= 60000) return 0.65;
      // Large shift (> 500ms) carries higher disruption risk
      return 0.40;
    }

    if (strategy === 'PEAK_ATTENUATION') {
      const attenuationDb = proposal.parameters?.attenuation_db || 0;
      // Subtle attenuation (<= 3.0 dB) is transparent
      if (attenuationDb <= 3.0) return 1.0;
      // Moderate attenuation (<= 6.0 dB)
      if (attenuationDb <= 6.0) return 0.85;
      // Heavy attenuation (> 6.0 dB) is perceptually noticeable
      return 0.45;
    }

    return 0.50;
  }
}

module.exports = {
  RepairConfidenceCalibrator,
  DEFAULT_CONFIDENCE_POLICY
};
