/**
 * @file repair-outcome-calibrator.js
 * @description Evaluates post-repair outcome efficacy against pre-repair measurements,
 * applies bounded confidence adjustments, detects diminishing returns across passes,
 * enforces defect lineage tracking, and records audit trail events in the Decision Ledger.
 *
 * Implements ARC-29-21 through ARC-29-24.
 */

'use strict';

const crypto = require('crypto');
const { LEDGER_EVENT_TYPES, LEDGER_ROUTING_TIERS } = require('./repair-decision-ledger');

const CALIBRATION_SCHEMA_VERSION = '1.0.0';

const EVALUATION_STATUS = Object.freeze({
  OPTIMAL_REPAIR: 'OPTIMAL_REPAIR',
  PARTIAL_IMPROVEMENT: 'PARTIAL_IMPROVEMENT',
  UNDER_CORRECTION: 'UNDER_CORRECTION',
  OVER_CORRECTION: 'OVER_CORRECTION',
  INEFFECTIVE: 'INEFFECTIVE',
  REGRESSION: 'REGRESSION',
  PROTECTED_METRIC_REGRESSION: 'PROTECTED_METRIC_REGRESSION',
  NO_EXPECTED_IMPROVEMENT: 'NO_EXPECTED_IMPROVEMENT',
  INCONCLUSIVE: 'INCONCLUSIVE'
});

const CALIBRATION_ROUTING = Object.freeze({
  AUTOMATIC_ELIGIBLE: 'AUTOMATIC_ELIGIBLE',
  ROUTED_HUMAN_REVIEW: 'ROUTED_HUMAN_REVIEW',
  HUMAN_ESCALATION_REQUIRED: 'HUMAN_ESCALATION_REQUIRED',
  DISCARD_SPECULATIVE: 'DISCARD_SPECULATIVE',
  NEEDS_RECONCILIATION: 'NEEDS_RECONCILIATION'
});

// Default measurement tolerances
const DEFAULT_TOLERANCES = Object.freeze({
  SYNC_DRIFT_MS: 5.0,
  SYNC_DRIFT_TICKS: 120, // 1 ms at 120,000 tps
  PEAK_DBTP: 0.1, // 0.1 dBTP measurement uncertainty
  GENERIC: 0.001
});

// Bounded confidence adjustments
const CONFIDENCE_DELTAS = Object.freeze({
  OPTIMAL_REPAIR: 0.0500,
  PARTIAL_IMPROVEMENT: 0.0200,
  UNDER_CORRECTION: -0.1000,
  OVER_CORRECTION: -0.1200,
  INEFFECTIVE: -0.1500,
  REGRESSION: -0.2500,
  PROTECTED_METRIC_REGRESSION: -0.3000,
  NO_EXPECTED_IMPROVEMENT: -0.0500,
  INCONCLUSIVE: -0.0500,
  DIMINISHING_RETURNS_EXTRA_PENALTY: -0.1500
});

const MAX_CONFIDENCE_CEILING = 0.9800;
const MIN_CONFIDENCE_FLOOR = 0.0000;
const DIMINISHING_RETURNS_CONFIDENCE_CAP = 0.4900;
const DIMINISHING_RETURNS_THRESHOLD_RATIO = 0.20; // < 20% of expected improvement

function quantize(num, decimals = 4) {
  if (typeof num !== 'number' || Number.isNaN(num)) return 0;
  return Number(num.toFixed(decimals));
}

class RepairOutcomeCalibrator {
  /**
   * @param {Object} [options]
   * @param {string} [options.runId] - Unique delivery run identifier for run isolation
   * @param {Object} [options.tolerances] - Custom measurement tolerances
   * @param {Object} [options.ledger] - Optional RepairDecisionLedger instance
   */
  constructor(options = {}) {
    this.runId = options.runId || `run-${crypto.randomBytes(6).toString('hex')}`;
    this.tolerances = Object.assign({}, DEFAULT_TOLERANCES, options.tolerances || {});
    this.ledger = options.ledger || null;

    // Lineage map keyed by lineage_key: { passes: [], consecutiveDiminishing: 0, lastConfidence: null }
    this._lineageMap = new Map();
  }

  /**
   * Creates an isolated run context inheriting configuration but having independent lineage state.
   * @param {string} runId
   * @returns {RepairOutcomeCalibrator}
   */
  createRunContext(runId) {
    if (!runId || typeof runId !== 'string') {
      throw new TypeError('runId must be a non-empty string');
    }
    return new RepairOutcomeCalibrator({
      runId,
      tolerances: this.tolerances,
      ledger: this.ledger
    });
  }

  /**
   * Generates a stable defect lineage key across proposal IDs.
   * @param {Object} params
   * @param {string} [params.lineageKey]
   * @param {string} [params.clipId]
   * @param {string} [params.operationType]
   * @param {string} [params.findingFingerprint]
   * @returns {string}
   */
  resolveLineageKey(params = {}) {
    if (params.lineageKey && typeof params.lineageKey === 'string') {
      return params.lineageKey;
    }
    if (params.findingFingerprint && typeof params.findingFingerprint === 'string') {
      return `fingerprint:${params.findingFingerprint}`;
    }
    if (params.clipId && params.operationType) {
      return `clip:${params.clipId}:${params.operationType}`;
    }
    if (params.clipId) {
      return `clip:${params.clipId}`;
    }
    return `anon:${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Calculates metric efficacy with favorable direction for sync drift, peak exceedance, etc.
   * @param {Object} params
   * @param {string} params.metricName - e.g. 'offset_ms', 'offset_ticks', 'peak_dbtp', 'loudness_lufs'
   * @param {number} params.preValue - Measured pre-repair value
   * @param {number} params.postValue - Measured post-repair value
   * @param {number} [params.targetValue] - Desired target value (default 0 for drift, -1.0 for peak)
   * @param {number} [params.tolerance] - Custom tolerance override
   * @param {boolean} [params.isProtectedMetric] - True if this is an invariant/protected metric
   * @returns {Object} Metric efficacy report
   */
  calculateMetricEfficacy(params) {
    const { metricName, preValue, postValue, isProtectedMetric = false } = params;

    if (preValue === undefined || preValue === null || Number.isNaN(preValue) ||
        postValue === undefined || postValue === null || Number.isNaN(postValue)) {
      return {
        metricName: metricName || 'unknown',
        preValue: preValue ?? null,
        postValue: postValue ?? null,
        targetValue: null,
        expectedDelta: 0,
        observedDelta: 0,
        efficacyRatio: null,
        tolerance: 0,
        status: EVALUATION_STATUS.INCONCLUSIVE,
        favorableDirection: 'UNKNOWN'
      };
    }

    const normMetric = (metricName || '').toLowerCase();
    const isSync = normMetric.includes('offset') || normMetric.includes('sync') || normMetric.includes('drift');
    const isPeak = normMetric.includes('peak') || normMetric.includes('dbtp') || normMetric.includes('ceiling');

    let tolerance = params.tolerance;
    if (tolerance === undefined || tolerance === null) {
      if (normMetric.includes('tick')) tolerance = this.tolerances.SYNC_DRIFT_TICKS;
      else if (isSync) tolerance = this.tolerances.SYNC_DRIFT_MS;
      else if (isPeak) tolerance = this.tolerances.PEAK_DBTP;
      else tolerance = this.tolerances.GENERIC;
    }

    let targetValue = params.targetValue;
    if (targetValue === undefined || targetValue === null) {
      targetValue = isPeak ? -1.0 : 0.0;
    }

    let expectedDelta = 0;
    let observedDelta = 0;
    let efficacyRatio = null;
    let status = EVALUATION_STATUS.OPTIMAL_REPAIR;
    let favorableDirection = 'CLOSER_TO_TARGET';

    if (isSync) {
      // For sync drift: goal is distance to target (|val - target|) -> 0
      const preDist = Math.abs(preValue - targetValue);
      const postDist = Math.abs(postValue - targetValue);
      expectedDelta = quantize(preDist, 4);
      observedDelta = quantize(preDist - postDist, 4);

      if (expectedDelta <= tolerance) {
        status = EVALUATION_STATUS.NO_EXPECTED_IMPROVEMENT;
        efficacyRatio = null;
      } else {
        efficacyRatio = quantize(observedDelta / expectedDelta, 4);

        if (observedDelta < -tolerance) {
          // Absolute drift increased
          status = isProtectedMetric ? EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION : EVALUATION_STATUS.REGRESSION;
        } else if (observedDelta <= tolerance) {
          // Essentially no change
          status = EVALUATION_STATUS.INEFFECTIVE;
        } else {
          // Check for over-correction (e.g. overshot target with opposite sign and significant magnitude)
          const signPre = Math.sign(preValue - targetValue);
          const signPost = Math.sign(postValue - targetValue);
          const isSignReversal = (signPre !== 0 && signPost !== 0 && signPre !== signPost);

          if (isSignReversal && postDist > tolerance && postDist > 0.5 * preDist) {
            status = EVALUATION_STATUS.OVER_CORRECTION;
          } else if (postDist <= tolerance || efficacyRatio >= 0.80) {
            status = EVALUATION_STATUS.OPTIMAL_REPAIR;
          } else if (efficacyRatio >= DIMINISHING_RETURNS_THRESHOLD_RATIO) {
            status = EVALUATION_STATUS.PARTIAL_IMPROVEMENT;
          } else {
            status = EVALUATION_STATUS.UNDER_CORRECTION;
          }
        }
      }
    } else if (isPeak) {
      // For peak: goal is postValue <= targetValue
      // Expected reduction: preValue - targetValue
      expectedDelta = quantize(preValue - targetValue, 4);
      observedDelta = quantize(preValue - postValue, 4);

      if (expectedDelta <= tolerance) {
        status = EVALUATION_STATUS.NO_EXPECTED_IMPROVEMENT;
        efficacyRatio = null;
      } else {
        efficacyRatio = quantize(observedDelta / expectedDelta, 4);

        if (observedDelta < -tolerance) {
          // Level increased!
          status = isProtectedMetric ? EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION : EVALUATION_STATUS.REGRESSION;
        } else if (observedDelta <= tolerance) {
          status = EVALUATION_STATUS.INEFFECTIVE;
        } else {
          // Check if over-attenuated beyond reason (e.g. ratio > 2.0 and overshot by > 3 dB)
          if (efficacyRatio > 2.0 && (targetValue - postValue) > 3.0) {
            status = EVALUATION_STATUS.OVER_CORRECTION;
          } else if (postValue <= targetValue + tolerance && efficacyRatio >= 0.80) {
            status = EVALUATION_STATUS.OPTIMAL_REPAIR;
          } else if (efficacyRatio >= DIMINISHING_RETURNS_THRESHOLD_RATIO) {
            status = EVALUATION_STATUS.PARTIAL_IMPROVEMENT;
          } else {
            status = EVALUATION_STATUS.UNDER_CORRECTION;
          }
        }
      }
    } else {
      // Generic metric: minimize absolute difference to target
      const preDist = Math.abs(preValue - targetValue);
      const postDist = Math.abs(postValue - targetValue);
      expectedDelta = quantize(preDist, 4);
      observedDelta = quantize(preDist - postDist, 4);

      if (expectedDelta <= tolerance) {
        status = EVALUATION_STATUS.NO_EXPECTED_IMPROVEMENT;
        efficacyRatio = null;
      } else {
        efficacyRatio = quantize(observedDelta / expectedDelta, 4);
        if (observedDelta < -tolerance) {
          status = isProtectedMetric ? EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION : EVALUATION_STATUS.REGRESSION;
        } else if (observedDelta <= tolerance) {
          status = EVALUATION_STATUS.INEFFECTIVE;
        } else if (postDist <= tolerance || efficacyRatio >= 0.80) {
          status = EVALUATION_STATUS.OPTIMAL_REPAIR;
        } else if (efficacyRatio >= DIMINISHING_RETURNS_THRESHOLD_RATIO) {
          status = EVALUATION_STATUS.PARTIAL_IMPROVEMENT;
        } else {
          status = EVALUATION_STATUS.UNDER_CORRECTION;
        }
      }
    }

    if (isProtectedMetric && (status === EVALUATION_STATUS.REGRESSION || observedDelta < -tolerance)) {
      status = EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION;
    }

    return {
      metricName,
      preValue: quantize(preValue, 4),
      postValue: quantize(postValue, 4),
      targetValue: quantize(targetValue, 4),
      expectedDelta,
      observedDelta,
      efficacyRatio,
      tolerance,
      status,
      favorableDirection
    };
  }

  /**
   * Adjusts confidence deterministically based on outcome evaluation.
   * Never sets 1.0000 on success (ARC-29-23).
   * @param {Object} params
   * @param {number} params.priorConfidence - [0.0, 1.0]
   * @param {string} params.status - EVALUATION_STATUS member
   * @param {boolean} [params.diminishingReturns]
   * @param {string} [params.reason]
   * @returns {Object} Bounded confidence adjustment result
   */
  adjustConfidence(params) {
    const { priorConfidence, status, diminishingReturns = false, reason = '' } = params;

    if (typeof priorConfidence !== 'number' || Number.isNaN(priorConfidence)) {
      throw new TypeError('priorConfidence must be a valid number');
    }

    let baseDelta = CONFIDENCE_DELTAS[status];
    if (baseDelta === undefined) {
      baseDelta = 0.0;
    }

    let delta = baseDelta;
    if (diminishingReturns) {
      delta += CONFIDENCE_DELTAS.DIMINISHING_RETURNS_EXTRA_PENALTY;
    }

    let posterior = priorConfidence + delta;

    // Apply strict bounds and caps
    if (diminishingReturns) {
      posterior = Math.min(posterior, DIMINISHING_RETURNS_CONFIDENCE_CAP);
    } else {
      posterior = Math.min(posterior, MAX_CONFIDENCE_CEILING);
    }
    posterior = Math.max(MIN_CONFIDENCE_FLOOR, posterior);

    posterior = quantize(posterior, 4);
    delta = quantize(posterior - priorConfidence, 4);

    const rationale = reason || `Adjusted confidence by ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} based on outcome ${status}${diminishingReturns ? ' (diminishing returns penalty applied)' : ''}. Prior: ${priorConfidence.toFixed(4)} -> Posterior: ${posterior.toFixed(4)}.`;

    return {
      priorConfidence: quantize(priorConfidence, 4),
      posteriorConfidence: posterior,
      confidenceDelta: delta,
      status,
      diminishingReturns,
      rationale
    };
  }

  /**
   * Tracks defect lineage and detects diminishing returns across passes.
   * ARC-29-21: Two successive passes achieving < 20% expected improvement = diminishing returns.
   * ARC-29-24: Lineage is tracked by lineageKey, preventing penalty evasion via new proposal IDs.
   * @param {Object} params
   * @param {string} params.lineageKey
   * @param {number} params.passNumber
   * @param {string} params.status - Efficacy evaluation status
   * @param {number|null} params.efficacyRatio
   * @returns {Object} Diminishing returns analysis
   */
  recordLineagePass(params) {
    const { lineageKey, passNumber, status, efficacyRatio } = params;

    let lineage = this._lineageMap.get(lineageKey);
    if (!lineage) {
      lineage = {
        lineageKey,
        passes: [],
        consecutiveDiminishing: 0
      };
      this._lineageMap.set(lineageKey, lineage);
    }

    const isSubThreshold = (
      status === EVALUATION_STATUS.UNDER_CORRECTION ||
      status === EVALUATION_STATUS.INEFFECTIVE ||
      status === EVALUATION_STATUS.REGRESSION ||
      status === EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION ||
      (efficacyRatio !== null && efficacyRatio < DIMINISHING_RETURNS_THRESHOLD_RATIO)
    );

    if (isSubThreshold) {
      lineage.consecutiveDiminishing += 1;
    } else {
      lineage.consecutiveDiminishing = 0;
    }

    const diminishingReturns = lineage.consecutiveDiminishing >= 2;

    lineage.passes.push({
      passNumber,
      status,
      efficacyRatio,
      consecutiveDiminishing: lineage.consecutiveDiminishing,
      diminishingReturns,
      recordedAt: new Date().toISOString()
    });

    return {
      lineageKey,
      consecutiveDiminishing: lineage.consecutiveDiminishing,
      diminishingReturns,
      totalPassesRecorded: lineage.passes.length
    };
  }

  /**
   * Full outcome calibration pipeline for a repair pass.
   * Evaluates efficacy, tracks lineage, adjusts confidence, validates render evidence,
   * and optionally logs to Decision Ledger.
   *
   * @param {Object} params
   * @param {string} params.proposalId
   * @param {string} [params.candidateRevision]
   * @param {string} [params.clipId]
   * @param {string} params.operationType - 'SYNC_RETIME' | 'PEAK_ATTENUATION'
   * @param {number} [params.passNumber=1]
   * @param {number} params.priorConfidence
   * @param {Object} params.preRepairMetric - { metricName, value, targetValue }
   * @param {Object} params.postRepairMetric - { metricName, value }
   * @param {Object} [params.renderEvidence] - { renderOutputId, candidateRevision, checksum, isFresh }
   * @param {Array<Object>} [params.protectedMetrics] - Array of { metricName, preValue, postValue, tolerance }
   * @returns {Object} Comprehensive calibration result
   */
  evaluateAndCalibrate(params) {
    const {
      proposalId,
      candidateRevision = 'rev-1',
      clipId = 'clip-unknown',
      operationType,
      passNumber = 1,
      priorConfidence,
      preRepairMetric,
      postRepairMetric,
      renderEvidence,
      protectedMetrics = []
    } = params;

    if (!proposalId) throw new TypeError('proposalId is required');
    if (!operationType) throw new TypeError('operationType is required');
    if (priorConfidence === undefined || priorConfidence === null) {
      throw new TypeError('priorConfidence is required');
    }
    if (!preRepairMetric || !postRepairMetric) {
      throw new TypeError('preRepairMetric and postRepairMetric are required');
    }

    // ARC-29-22: Validate render evidence freshness and candidate revision alignment
    if (renderEvidence) {
      if (renderEvidence.candidateRevision && renderEvidence.candidateRevision !== candidateRevision) {
        const err = new Error(`Render evidence revision mismatch: expected ${candidateRevision}, got ${renderEvidence.candidateRevision}`);
        err.code = 'STALE_RENDER_EVIDENCE';
        throw err;
      }
      if (renderEvidence.isFresh === false) {
        const err = new Error('Stale post-repair render evidence rejected');
        err.code = 'STALE_RENDER_EVIDENCE';
        throw err;
      }
    }

    // 1. Primary metric efficacy
    const primaryEfficacy = this.calculateMetricEfficacy({
      metricName: preRepairMetric.metricName,
      preValue: preRepairMetric.value,
      postValue: postRepairMetric.value,
      targetValue: preRepairMetric.targetValue,
      tolerance: preRepairMetric.tolerance
    });

    let effectiveStatus = primaryEfficacy.status;

    // 2. Evaluate protected metrics (invariants)
    const protectedEvaluations = [];
    for (const prot of protectedMetrics) {
      const protEff = this.calculateMetricEfficacy({
        metricName: prot.metricName,
        preValue: prot.preValue,
        postValue: prot.postValue,
        targetValue: prot.targetValue,
        tolerance: prot.tolerance,
        isProtectedMetric: true
      });
      protectedEvaluations.push(protEff);
      if (protEff.status === EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION ||
          protEff.status === EVALUATION_STATUS.REGRESSION) {
        effectiveStatus = EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION;
      }
    }

    // 3. Lineage tracking and diminishing returns check (ARC-29-21, ARC-29-24)
    const lineageKey = this.resolveLineageKey({
      lineageKey: params.lineageKey,
      clipId,
      operationType,
      findingFingerprint: params.findingFingerprint
    });

    const lineageResult = this.recordLineagePass({
      lineageKey,
      passNumber,
      status: effectiveStatus,
      efficacyRatio: primaryEfficacy.efficacyRatio
    });

    // 4. Bounded confidence adjustment (ARC-29-23)
    const adjustment = this.adjustConfidence({
      priorConfidence,
      status: effectiveStatus,
      diminishingReturns: lineageResult.diminishingReturns,
      reason: params.reason
    });

    // 5. Determine routing disposition (strict 3-band policy + safety overrides)
    let routingDisposition = CALIBRATION_ROUTING.AUTOMATIC_ELIGIBLE;
    if (lineageResult.diminishingReturns) {
      routingDisposition = CALIBRATION_ROUTING.HUMAN_ESCALATION_REQUIRED;
    } else if (effectiveStatus === EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION ||
               effectiveStatus === EVALUATION_STATUS.REGRESSION) {
      routingDisposition = CALIBRATION_ROUTING.NEEDS_RECONCILIATION;
    } else if (adjustment.posteriorConfidence < 0.4000) {
      routingDisposition = CALIBRATION_ROUTING.DISCARD_SPECULATIVE;
    } else if (adjustment.posteriorConfidence < 0.8000) {
      routingDisposition = CALIBRATION_ROUTING.ROUTED_HUMAN_REVIEW;
    } else {
      routingDisposition = CALIBRATION_ROUTING.AUTOMATIC_ELIGIBLE;
    }

    const calibrationRecord = {
      calibration_version: CALIBRATION_SCHEMA_VERSION,
      lineage_key: lineageKey,
      clip_id: clipId,
      operation_type: operationType,
      pass_number: passNumber,
      evaluation_status: effectiveStatus,
      metric_efficacy: {
        metric_name: primaryEfficacy.metricName,
        pre_value: primaryEfficacy.preValue,
        post_value: primaryEfficacy.postValue,
        target_value: primaryEfficacy.targetValue,
        expected_delta: primaryEfficacy.expectedDelta,
        observed_delta: primaryEfficacy.observedDelta,
        efficacy_ratio: primaryEfficacy.efficacyRatio,
        tolerance: primaryEfficacy.tolerance
      },
      protected_metrics: protectedEvaluations,
      prior_confidence: adjustment.priorConfidence,
      posterior_confidence: adjustment.posteriorConfidence,
      confidence_delta: adjustment.confidenceDelta,
      diminishing_returns: lineageResult.diminishingReturns,
      consecutive_diminishing_passes: lineageResult.consecutiveDiminishing,
      routing_disposition: routingDisposition,
      rationale: adjustment.rationale
    };

    // 6. Record in Decision Ledger if attached (ARC-29-22)
    if (this.ledger) {
      const projRev = typeof params.projectRevision === 'number' ? params.projectRevision : 1;
      const srcSha = params.sourceMediaSha256;
      const rndSha = (renderEvidence && renderEvidence.checksum) ? renderEvidence.checksum : params.renderSha256;

      // Record outcome evaluation
      this.ledger.recordEvent({
        schema_version: '1.0.0',
        event_id: `evt_eval_${crypto.randomBytes(6).toString('hex')}`,
        event_type: LEDGER_EVENT_TYPES.OUTCOME_EVALUATED,
        timestamp: new Date().toISOString(),
        proposal_id: proposalId,
        correlation_key: this.ledger.computeCorrelationKey(proposalId, projRev, LEDGER_EVENT_TYPES.OUTCOME_EVALUATED, String(passNumber)),
        project_revision: projRev,
        ...(srcSha ? { source_media_sha256: srcSha } : {}),
        ...(rndSha ? { render_sha256: rndSha } : {}),
        target: { clip_id: clipId },
        details: {
          lineageKey,
          passNumber,
          evaluationStatus: effectiveStatus,
          metricEfficacy: calibrationRecord.metric_efficacy,
          diminishingReturns: lineageResult.diminishingReturns
        }
      });

      // Record calibrated confidence
      this.ledger.recordEvent({
        schema_version: '1.0.0',
        event_id: `evt_conf_${crypto.randomBytes(6).toString('hex')}`,
        event_type: LEDGER_EVENT_TYPES.CONFIDENCE_CALIBRATED,
        timestamp: new Date().toISOString(),
        proposal_id: proposalId,
        correlation_key: this.ledger.computeCorrelationKey(proposalId, projRev, LEDGER_EVENT_TYPES.CONFIDENCE_CALIBRATED, String(passNumber)),
        project_revision: projRev,
        ...(srcSha ? { source_media_sha256: srcSha } : {}),
        ...(rndSha ? { render_sha256: rndSha } : {}),
        target: { clip_id: clipId },
        details: {
          priorConfidence: adjustment.priorConfidence,
          posteriorConfidence: adjustment.posteriorConfidence,
          confidenceDelta: adjustment.confidenceDelta,
          routingDisposition,
          rationale: adjustment.rationale
        }
      });

      // If diminishing returns or regression, record escalation/reconciliation
      if (routingDisposition === CALIBRATION_ROUTING.HUMAN_ESCALATION_REQUIRED) {
        this.ledger.recordEvent({
          schema_version: '1.0.0',
          event_id: `evt_esc_${crypto.randomBytes(6).toString('hex')}`,
          event_type: LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED,
          timestamp: new Date().toISOString(),
          proposal_id: proposalId,
          correlation_key: this.ledger.computeCorrelationKey(proposalId, projRev, LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED, `esc_${passNumber}`),
          project_revision: projRev,
          ...(srcSha ? { source_media_sha256: srcSha } : {}),
          ...(rndSha ? { render_sha256: rndSha } : {}),
          target: { clip_id: clipId },
          details: {
            reason: 'DIMINISHING_RETURNS_ESCALATION',
            consecutiveDiminishingPasses: lineageResult.consecutiveDiminishing
          }
        });
      } else if (routingDisposition === CALIBRATION_ROUTING.NEEDS_RECONCILIATION) {
        this.ledger.recordEvent({
          schema_version: '1.0.0',
          event_id: `evt_rec_${crypto.randomBytes(6).toString('hex')}`,
          event_type: LEDGER_EVENT_TYPES.RECONCILIATION_REQUIRED,
          timestamp: new Date().toISOString(),
          proposal_id: proposalId,
          correlation_key: this.ledger.computeCorrelationKey(proposalId, projRev, LEDGER_EVENT_TYPES.RECONCILIATION_REQUIRED, `rec_${passNumber}`),
          project_revision: projRev,
          ...(srcSha ? { source_media_sha256: srcSha } : {}),
          ...(rndSha ? { render_sha256: rndSha } : {}),
          target: { clip_id: clipId },
          details: {
            reason: 'REGRESSION_DETECTED',
            canonicalJobState: 'NEEDS_RECONCILIATION',
            status: effectiveStatus
          }
        });
      }
    }

    return calibrationRecord;
  }

  /**
   * Validates a calibration record against internal contract audio-repair-calibration.v1.json.
   * @param {Object} record
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateCalibrationRecord(record) {
    const errors = [];
    if (!record || typeof record !== 'object') {
      return { valid: false, errors: ['Calibration record must be a non-null object'] };
    }
    if (record.calibration_version !== CALIBRATION_SCHEMA_VERSION) {
      errors.push(`calibration_version must be "${CALIBRATION_SCHEMA_VERSION}", got "${record.calibration_version}"`);
    }
    if (typeof record.lineage_key !== 'string' || record.lineage_key.length === 0) {
      errors.push('lineage_key is required and must be a non-empty string');
    }
    if (typeof record.clip_id !== 'string') {
      errors.push('clip_id is required');
    }
    if (!['SYNC_RETIME', 'PEAK_ATTENUATION'].includes(record.operation_type)) {
      errors.push(`Invalid operation_type: "${record.operation_type}"`);
    }
    if (typeof record.pass_number !== 'number' || !Number.isInteger(record.pass_number) || record.pass_number < 1) {
      errors.push('pass_number must be an integer >= 1');
    }
    if (!Object.values(EVALUATION_STATUS).includes(record.evaluation_status)) {
      errors.push(`Invalid evaluation_status: "${record.evaluation_status}"`);
    }
    if (!record.metric_efficacy || typeof record.metric_efficacy !== 'object') {
      errors.push('metric_efficacy is required');
    } else {
      const me = record.metric_efficacy;
      if (typeof me.metric_name !== 'string') errors.push('metric_efficacy.metric_name must be a string');
      if (typeof me.pre_value !== 'number') errors.push('metric_efficacy.pre_value must be a number');
      if (typeof me.post_value !== 'number') errors.push('metric_efficacy.post_value must be a number');
      if (typeof me.expected_delta !== 'number') errors.push('metric_efficacy.expected_delta must be a number');
      if (typeof me.observed_delta !== 'number') errors.push('metric_efficacy.observed_delta must be a number');
    }
    if (typeof record.prior_confidence !== 'number' || record.prior_confidence < 0 || record.prior_confidence > 1.0) {
      errors.push('prior_confidence must be a number between 0.0 and 1.0');
    }
    if (typeof record.posterior_confidence !== 'number' || record.posterior_confidence < 0 || record.posterior_confidence > MAX_CONFIDENCE_CEILING) {
      errors.push(`posterior_confidence must be between 0.0 and ${MAX_CONFIDENCE_CEILING}`);
    }
    if (typeof record.confidence_delta !== 'number') {
      errors.push('confidence_delta must be a number');
    }
    if (typeof record.diminishing_returns !== 'boolean') {
      errors.push('diminishing_returns must be a boolean');
    }
    if (!Object.values(CALIBRATION_ROUTING).includes(record.routing_disposition)) {
      errors.push(`Invalid routing_disposition: "${record.routing_disposition}"`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  CALIBRATION_SCHEMA_VERSION,
  EVALUATION_STATUS,
  CALIBRATION_ROUTING,
  DEFAULT_TOLERANCES,
  CONFIDENCE_DELTAS,
  MAX_CONFIDENCE_CEILING,
  MIN_CONFIDENCE_FLOOR,
  DIMINISHING_RETURNS_CONFIDENCE_CAP,
  DIMINISHING_RETURNS_THRESHOLD_RATIO,
  RepairOutcomeCalibrator,
  quantize
};
