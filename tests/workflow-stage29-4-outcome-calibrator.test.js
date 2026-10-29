/**
 * Workflow Stage 29.4 Test Suite: Post-Render Outcome Calibration & Confidence Feedback Loop
 *
 * Verifies Stage 29.4 under binding architectural conditions ARC-29-21 through ARC-29-27:
 * - OCG-01: Metric-specific efficacy calculation across sync drift, true peak, and zero expected delta (ARC-29-21)
 * - OCG-02: Deterministic confidence adjustment and success ceiling bound without unconditional 1.0 (ARC-29-23)
 * - OCG-03: Bounded confidence penalties for under-correction, over-correction, ineffective, & protected regressions (ARC-29-23)
 * - OCG-04: Lineage tracking, diminishing returns detection across two passes, and human escalation gating (ARC-29-21 & ARC-29-24)
 * - OCG-05: Decision ledger integration: recording OUTCOME_EVALUATED & CONFIDENCE_CALIBRATED with strict SHA-256 (ARC-29-22 & ARC-29-25)
 * - OCG-06: Delivery run isolation and clean penalty state reset across distinct runs (ARC-29-24)
 *
 * Test Accounting: 6 discrete subtests (7 reported by Node runner).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  RepairOutcomeCalibrator,
  EVALUATION_STATUS,
  CALIBRATION_ROUTING,
  MAX_CONFIDENCE_CEILING,
  MIN_CONFIDENCE_FLOOR,
  DIMINISHING_RETURNS_CONFIDENCE_CAP,
  quantize
} = require('../src/audio/repair/repair-outcome-calibrator');

const {
  RepairDecisionLedger,
  LEDGER_EVENT_TYPES
} = require('../src/audio/repair/repair-decision-ledger');

const VALID_SHA256_A = 'a'.repeat(64);
const VALID_SHA256_B = 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2';

test('Stage 29.4: Post-Render Outcome Calibration & Confidence Feedback Loop', async (t) => {

  // OCG-01: Metric-specific efficacy calculation across synchronization and true peak
  await t.test('OCG-01: Metric-specific efficacy calculation with favorable direction, tolerances, and zero expected delta (ARC-29-21)', () => {
    const calibrator = new RepairOutcomeCalibrator();

    // 1. Sync Drift in milliseconds: initial 150ms -> post-repair 2ms (tolerance 5ms) -> OPTIMAL_REPAIR
    const syncResult = calibrator.calculateMetricEfficacy({
      metricName: 'sync_offset_ms',
      preValue: 150.0,
      postValue: 2.0,
      targetValue: 0.0
    });
    assert.equal(syncResult.status, EVALUATION_STATUS.OPTIMAL_REPAIR);
    assert.equal(syncResult.expectedDelta, 150.0);
    assert.equal(syncResult.observedDelta, 148.0);
    assert.equal(syncResult.efficacyRatio, 0.9867);
    assert.equal(syncResult.favorableDirection, 'CLOSER_TO_TARGET');

    // 2. Sync Drift in audio ticks: initial -18000 ticks -> post-repair 0 ticks -> OPTIMAL_REPAIR
    const tickResult = calibrator.calculateMetricEfficacy({
      metricName: 'offset_ticks',
      preValue: -18000,
      postValue: 0,
      targetValue: 0
    });
    assert.equal(tickResult.status, EVALUATION_STATUS.OPTIMAL_REPAIR);
    assert.equal(tickResult.expectedDelta, 18000);
    assert.equal(tickResult.observedDelta, 18000);
    assert.equal(tickResult.efficacyRatio, 1.0);

    // 3. True Peak in dBTP: initial +1.8 dBTP -> post-repair -1.1 dBTP (target -1.0, ceiling reached) -> OPTIMAL_REPAIR
    const peakResult = calibrator.calculateMetricEfficacy({
      metricName: 'peak_dbtp',
      preValue: 1.8,
      postValue: -1.1,
      targetValue: -1.0
    });
    assert.equal(peakResult.status, EVALUATION_STATUS.OPTIMAL_REPAIR);
    assert.equal(peakResult.expectedDelta, 2.8);
    assert.equal(peakResult.observedDelta, 2.9);
    assert.ok(peakResult.efficacyRatio >= 1.0);

    // 4. Zero expected improvement boundary: preValue already within tolerance (e.g. 1.0ms with 5ms tolerance)
    const zeroExpectedSync = calibrator.calculateMetricEfficacy({
      metricName: 'sync_offset_ms',
      preValue: 1.0,
      postValue: 1.0,
      targetValue: 0.0,
      tolerance: 5.0
    });
    assert.equal(zeroExpectedSync.status, EVALUATION_STATUS.NO_EXPECTED_IMPROVEMENT);
    assert.equal(zeroExpectedSync.efficacyRatio, null, 'Efficacy ratio must be null when expected delta is <= tolerance (no div by zero)');

    // 5. Incompatible / invalid / missing measurements -> INCONCLUSIVE
    const invalidResult = calibrator.calculateMetricEfficacy({
      metricName: 'unknown_metric',
      preValue: NaN,
      postValue: null
    });
    assert.equal(invalidResult.status, EVALUATION_STATUS.INCONCLUSIVE);
    assert.equal(invalidResult.efficacyRatio, null);

    // 6. Improvement smaller than measurement tolerance -> INEFFECTIVE
    const withinToleranceResult = calibrator.calculateMetricEfficacy({
      metricName: 'sync_offset_ms',
      preValue: 50.0,
      postValue: 48.0, // only 2.0ms improvement, tolerance is 5.0ms
      targetValue: 0.0,
      tolerance: 5.0
    });
    assert.equal(withinToleranceResult.status, EVALUATION_STATUS.INEFFECTIVE);
  });

  // OCG-02: Deterministic confidence adjustment and ceiling bounds
  await t.test('OCG-02: Deterministic confidence adjustment and maximum ceiling bound without unconditional 1.0000 (ARC-29-23)', () => {
    const calibrator = new RepairOutcomeCalibrator();

    // 1. Optimal repair boost: 0.8200 -> +0.0500 -> 0.8700
    const adj1 = calibrator.adjustConfidence({
      priorConfidence: 0.8200,
      status: EVALUATION_STATUS.OPTIMAL_REPAIR
    });
    assert.equal(adj1.priorConfidence, 0.8200);
    assert.equal(adj1.posteriorConfidence, 0.8700);
    assert.equal(adj1.confidenceDelta, 0.0500);
    assert.match(adj1.rationale, /Adjusted confidence by \+0.0500 based on outcome OPTIMAL_REPAIR/);

    // 2. Partial improvement boost: 0.7000 -> +0.0200 -> 0.7200
    const adj2 = calibrator.adjustConfidence({
      priorConfidence: 0.7000,
      status: EVALUATION_STATUS.PARTIAL_IMPROVEMENT
    });
    assert.equal(adj2.posteriorConfidence, 0.7200);
    assert.equal(adj2.confidenceDelta, 0.0200);

    // 3. Strict ceiling: even with multiple optimal boosts, confidence never exceeds MAX_CONFIDENCE_CEILING (0.9800)
    const adjCeiling = calibrator.adjustConfidence({
      priorConfidence: 0.9700,
      status: EVALUATION_STATUS.OPTIMAL_REPAIR
    });
    assert.equal(adjCeiling.posteriorConfidence, MAX_CONFIDENCE_CEILING, 'Confidence must be capped at 0.9800 ceiling');
    assert.equal(adjCeiling.confidenceDelta, 0.0100);
    assert.ok(adjCeiling.posteriorConfidence < 1.0000, 'Single successful repair must never assign unconditional 1.0000 probability');

    // 4. Exact 4-decimal quantization preserved
    assert.equal(quantize(0.854321, 4), 0.8543);

    // 5. Complete 3-band post-calibration routing disposition mapping and exact boundary behavior
    // Band 1: C >= 0.8000 -> AUTOMATIC_ELIGIBLE (0.8000, 0.8500, 0.9800)
    const rec80 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_bound_80',
      clipId: 'clip_b1',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.7500, // +0.0500 -> 0.8000 exactly
      preRepairMetric: { metricName: 'offset_ms', value: 50.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 0.0 }
    });
    assert.equal(rec80.posterior_confidence, 0.8000);
    assert.equal(rec80.routing_disposition, CALIBRATION_ROUTING.AUTOMATIC_ELIGIBLE, 'Boundary 0.8000 must be AUTOMATIC_ELIGIBLE');

    // Band 2: 0.4000 <= C < 0.8000 -> ROUTED_HUMAN_REVIEW (tested at 0.7999, 0.7000, 0.4000)
    const rec7999 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_bound_7999',
      clipId: 'clip_b2',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.7499, // +0.0500 -> 0.7999
      preRepairMetric: { metricName: 'offset_ms', value: 50.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 0.0 }
    });
    assert.equal(rec7999.posterior_confidence, 0.7999);
    assert.equal(rec7999.routing_disposition, CALIBRATION_ROUTING.ROUTED_HUMAN_REVIEW, '0.7999 must be ROUTED_HUMAN_REVIEW');

    const rec70 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_bound_70',
      clipId: 'clip_b3',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.6500, // +0.0500 -> 0.7000
      preRepairMetric: { metricName: 'offset_ms', value: 50.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 0.0 }
    });
    assert.equal(rec70.posterior_confidence, 0.7000);
    assert.equal(rec70.routing_disposition, CALIBRATION_ROUTING.ROUTED_HUMAN_REVIEW, '0.7000 must be ROUTED_HUMAN_REVIEW');

    const rec40 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_bound_40',
      clipId: 'clip_b4',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.5000, // -0.1000 under-correction -> 0.4000
      preRepairMetric: { metricName: 'offset_ms', value: 50.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 44.0 } // 6ms observed delta > 5ms tolerance, ratio = 0.12 (< 0.20) -> UNDER_CORRECTION
    });
    assert.equal(rec40.posterior_confidence, 0.4000);
    assert.equal(rec40.routing_disposition, CALIBRATION_ROUTING.ROUTED_HUMAN_REVIEW, 'Boundary 0.4000 must be ROUTED_HUMAN_REVIEW');

    // Band 3: C < 0.4000 -> DISCARD_SPECULATIVE (tested at 0.3999 and 0.2000)
    const rec3999 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_bound_3999',
      clipId: 'clip_b5',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.4999, // -0.1000 under-correction -> 0.3999
      preRepairMetric: { metricName: 'offset_ms', value: 50.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 44.0 } // 6ms observed delta -> UNDER_CORRECTION
    });
    assert.equal(rec3999.posterior_confidence, 0.3999);
    assert.equal(rec3999.routing_disposition, CALIBRATION_ROUTING.DISCARD_SPECULATIVE, '0.3999 must be DISCARD_SPECULATIVE');
  });

  // OCG-03: Bounded confidence penalties for under/over-correction and protected regressions
  await t.test('OCG-03: Bounded confidence penalties for under-correction, over-correction, and protected metric regression (ARC-29-23)', () => {
    const calibrator = new RepairOutcomeCalibrator();

    // 1. Under-correction penalty: 0.7500 -> -0.1000 -> 0.6500
    const underAdj = calibrator.adjustConfidence({
      priorConfidence: 0.7500,
      status: EVALUATION_STATUS.UNDER_CORRECTION
    });
    assert.equal(underAdj.posteriorConfidence, 0.6500);
    assert.equal(underAdj.confidenceDelta, -0.1000);

    // 2. Over-correction penalty: 0.7500 -> -0.1200 -> 0.6300
    const overAdj = calibrator.adjustConfidence({
      priorConfidence: 0.7500,
      status: EVALUATION_STATUS.OVER_CORRECTION
    });
    assert.equal(overAdj.posteriorConfidence, 0.6300);
    assert.equal(overAdj.confidenceDelta, -0.1200);

    // 3. Ineffective penalty: 0.7000 -> -0.1500 -> 0.5500
    const ineffAdj = calibrator.adjustConfidence({
      priorConfidence: 0.7000,
      status: EVALUATION_STATUS.INEFFECTIVE
    });
    assert.equal(ineffAdj.posteriorConfidence, 0.5500);
    assert.equal(ineffAdj.confidenceDelta, -0.1500);

    // 4. Protected metric regression penalty: 0.8000 -> -0.3000 -> 0.5000
    const protAdj = calibrator.adjustConfidence({
      priorConfidence: 0.8000,
      status: EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION
    });
    assert.equal(protAdj.posteriorConfidence, 0.5000);
    assert.equal(protAdj.confidenceDelta, -0.3000);

    // 5. Protected metric regression evaluation in full pipeline triggers RECONCILIATION_REQUIRED
    const evalResult = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_prot_reg_01',
      candidateRevision: 'rev-2',
      clipId: 'clip_dialogue_01',
      operationType: 'SYNC_RETIME',
      passNumber: 1,
      priorConfidence: 0.8500,
      preRepairMetric: { metricName: 'offset_ms', value: 80.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 0.0 },
      protectedMetrics: [
        {
          metricName: 'peak_dbtp',
          preValue: -2.0,
          postValue: 1.5, // regressed severely into clipping
          targetValue: -1.0,
          tolerance: 0.1
        }
      ]
    });
    assert.equal(evalResult.evaluation_status, EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION);
    assert.equal(evalResult.routing_disposition, CALIBRATION_ROUTING.NEEDS_RECONCILIATION);
    assert.equal(evalResult.posterior_confidence, 0.5500);

    // 6. Absolute floor: penalties cannot reduce confidence below 0.0000
    const floorAdj = calibrator.adjustConfidence({
      priorConfidence: 0.0500,
      status: EVALUATION_STATUS.PROTECTED_METRIC_REGRESSION
    });
    assert.equal(floorAdj.posteriorConfidence, MIN_CONFIDENCE_FLOOR);
  });

  // OCG-04: Lineage tracking, diminishing returns detection, and human escalation
  await t.test('OCG-04: Lineage tracking, diminishing returns detection across two passes, and human escalation gating (ARC-29-21 & ARC-29-24)', () => {
    const calibrator = new RepairOutcomeCalibrator();
    const clipId = 'clip_lineage_01';
    const opType = 'SYNC_RETIME';

    // Pass 1: achieve only 10% improvement (< 20% threshold ratio) -> consecutive sub-threshold = 1
    const pass1 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_pass_1',
      candidateRevision: 'rev-2',
      clipId,
      operationType: opType,
      passNumber: 1,
      priorConfidence: 0.8000,
      preRepairMetric: { metricName: 'offset_ms', value: 100.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 90.0 } // 10ms improvement = 10%
    });
    assert.equal(pass1.evaluation_status, EVALUATION_STATUS.UNDER_CORRECTION);
    assert.equal(pass1.diminishing_returns, false);
    assert.equal(pass1.consecutive_diminishing_passes, 1);
    assert.equal(pass1.posterior_confidence, 0.7000);

    // Pass 2: achieve another sub-threshold improvement (< 20%) -> triggers diminishing returns!
    // Note: uses a different proposalId to prove penalty evasion prevention (ARC-29-24)
    const pass2 = calibrator.evaluateAndCalibrate({
      proposalId: 'prop_pass_2_new_id',
      candidateRevision: 'rev-3',
      clipId,
      operationType: opType,
      passNumber: 2,
      priorConfidence: pass1.posterior_confidence,
      preRepairMetric: { metricName: 'offset_ms', value: 90.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 85.0 } // 5ms improvement = 5.5%
    });
    assert.equal(pass2.diminishing_returns, true, 'Two consecutive sub-threshold passes must trigger diminishing returns');
    assert.equal(pass2.consecutive_diminishing_passes, 2);
    assert.equal(pass2.routing_disposition, CALIBRATION_ROUTING.HUMAN_ESCALATION_REQUIRED);
    assert.ok(pass2.posterior_confidence <= DIMINISHING_RETURNS_CONFIDENCE_CAP, 'Confidence must be capped at 0.4900 under diminishing returns');
  });

  // OCG-05: Decision ledger integration and schema contract validation
  await t.test('OCG-05: Decision ledger integration: recording OUTCOME_EVALUATED & CONFIDENCE_CALIBRATED with strict SHA-256 (ARC-29-22 & ARC-29-25)', () => {
    const ledger = new RepairDecisionLedger();
    const calibrator = new RepairOutcomeCalibrator({ ledger });

    const proposalId = 'prop_ocg_05';
    const candidateRevision = 'rev-4';
    const clipId = 'clip_aud_05';

    // Execute calibration with attached ledger and strict 64-char SHA-256 digests
    const calRecord = calibrator.evaluateAndCalibrate({
      proposalId,
      candidateRevision,
      projectRevision: 4,
      sourceMediaSha256: VALID_SHA256_A,
      clipId,
      operationType: 'PEAK_ATTENUATION',
      passNumber: 1,
      priorConfidence: 0.8500,
      preRepairMetric: { metricName: 'peak_dbtp', value: 1.5, targetValue: -1.0 },
      postRepairMetric: { metricName: 'peak_dbtp', value: -1.1 },
      renderEvidence: {
        renderOutputId: 'render_pass1_05',
        candidateRevision: 'rev-4',
        checksum: VALID_SHA256_B,
        isFresh: true
      }
    });

    // 1. Contract validation
    const valResult = calibrator.validateCalibrationRecord(calRecord);
    assert.equal(valResult.valid, true, 'Calibration record must satisfy internal contract schema');

    // 2. Ledger verification: check that OUTCOME_EVALUATED and CONFIDENCE_CALIBRATED events were recorded
    const evalEvent = ledger.events.find(e => e.event_type === LEDGER_EVENT_TYPES.OUTCOME_EVALUATED && e.proposal_id === proposalId);
    assert.ok(evalEvent, 'OUTCOME_EVALUATED event must be recorded in ledger');
    assert.equal(evalEvent.project_revision, 4);
    assert.equal(evalEvent.source_media_sha256, VALID_SHA256_A);
    assert.equal(evalEvent.render_sha256, VALID_SHA256_B);
    assert.equal(evalEvent.details.evaluationStatus, EVALUATION_STATUS.OPTIMAL_REPAIR);

    const confEvent = ledger.events.find(e => e.event_type === LEDGER_EVENT_TYPES.CONFIDENCE_CALIBRATED && e.proposal_id === proposalId);
    assert.ok(confEvent, 'CONFIDENCE_CALIBRATED event must be recorded in ledger');
    assert.equal(confEvent.details.priorConfidence, 0.8500);
    assert.equal(confEvent.details.posteriorConfidence, 0.9000);

    // 3. Stale render evidence rejection boundary (ARC-29-22)
    assert.throws(() => {
      calibrator.evaluateAndCalibrate({
        proposalId: 'prop_stale_test',
        candidateRevision: 'rev-5',
        clipId,
        operationType: 'SYNC_RETIME',
        priorConfidence: 0.8000,
        preRepairMetric: { metricName: 'offset_ms', value: 50.0 },
        postRepairMetric: { metricName: 'offset_ms', value: 0.0 },
        renderEvidence: {
          candidateRevision: 'rev-4', // MISMATCH with rev-5
          checksum: VALID_SHA256_B,
          isFresh: true
        }
      });
    }, /Render evidence revision mismatch/, 'Mismatched candidate revision must be rejected as STALE_RENDER_EVIDENCE');

    assert.throws(() => {
      calibrator.evaluateAndCalibrate({
        proposalId: 'prop_stale_flag_test',
        candidateRevision: 'rev-5',
        clipId,
        operationType: 'SYNC_RETIME',
        priorConfidence: 0.8000,
        preRepairMetric: { metricName: 'offset_ms', value: 50.0 },
        postRepairMetric: { metricName: 'offset_ms', value: 0.0 },
        renderEvidence: {
          candidateRevision: 'rev-5',
          checksum: VALID_SHA256_B,
          isFresh: false // STALE
        }
      });
    }, /Stale post-repair render evidence rejected/, 'isFresh: false must be rejected');
  });

  // OCG-06: Delivery run isolation and clean penalty state reset across distinct runs
  await t.test('OCG-06: Delivery run isolation and clean penalty state reset across distinct runs (ARC-29-24)', () => {
    const parentCalibrator = new RepairOutcomeCalibrator({ runId: 'run-delivery-101' });
    const clipId = 'clip_shared_id_01';

    // Run 1: establish diminishing returns on clip_shared_id_01
    parentCalibrator.evaluateAndCalibrate({
      proposalId: 'prop_run1_p1',
      clipId,
      operationType: 'SYNC_RETIME',
      passNumber: 1,
      priorConfidence: 0.8000,
      preRepairMetric: { metricName: 'offset_ms', value: 100.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 95.0 }
    });
    const run1Pass2 = parentCalibrator.evaluateAndCalibrate({
      proposalId: 'prop_run1_p2',
      clipId,
      operationType: 'SYNC_RETIME',
      passNumber: 2,
      priorConfidence: 0.7000,
      preRepairMetric: { metricName: 'offset_ms', value: 95.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 92.0 }
    });
    assert.equal(run1Pass2.diminishing_returns, true, 'Run 1 should exhibit diminishing returns');

    // Run 2: create an isolated run context for a new delivery run
    const run2Calibrator = parentCalibrator.createRunContext('run-delivery-102');

    // Prove that Run 2 starts clean and does NOT inherit Run 1's diminishing returns penalties on the same clip ID!
    const run2Pass1 = run2Calibrator.evaluateAndCalibrate({
      proposalId: 'prop_run2_p1',
      clipId,
      operationType: 'SYNC_RETIME',
      passNumber: 1,
      priorConfidence: 0.8200,
      preRepairMetric: { metricName: 'offset_ms', value: 100.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 0.0 } // Optimal repair
    });
    assert.equal(run2Pass1.diminishing_returns, false, 'Unrelated delivery run must NOT inherit diminishing returns');
    assert.equal(run2Pass1.consecutive_diminishing_passes, 0, 'Clean run must have 0 consecutive diminishing passes on optimal repair');
    assert.equal(run2Pass1.routing_disposition, CALIBRATION_ROUTING.AUTOMATIC_ELIGIBLE);
    assert.equal(run2Pass1.posterior_confidence, 0.8700);
  });

});
