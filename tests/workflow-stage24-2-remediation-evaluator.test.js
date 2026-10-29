/**
 * Phase 24 Stage 24.2 Test Suite: Incident MTTR & Remediation Effectiveness Engine
 *
 * Verifies:
 * 1. REM-EVAL-01: MTTD (Mean Time to Detect) calculation.
 * 2. REM-EVAL-02: MTTR (Mean Time to Remediate) calculation (overall & per-runbook).
 * 3. REM-EVAL-03: Runbook success rate accounting and failure classification.
 * 4. REM-EVAL-04: Flapping incident detection and severity escalation.
 * 5. REM-EVAL-05: Non-negotiable invariant: Graceful evaluation with zero incidents / cold start.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { RemediationEvaluator } = require('../src/prompt-core/remediation-evaluator.js');
const { RUNBOOK_ACTIONS } = require('../src/prompt-core/production-monitor.js');

test('Stage 24.2: Incident MTTR & Remediation Effectiveness Engine', async (t) => {
  await t.test('REM-EVAL-01: MTTD (Mean Time to Detect) Calculation', async () => {
    const evaluator = new RemediationEvaluator();
    const now = Date.now();

    // Incident 1: Detected 200ms after occurrence
    evaluator.recordDetection({
      incidentId: 'inc-01',
      incidentType: 'STORAGE_SATURATION',
      occurredAt: now - 1000,
      detectedAt: now - 800
    });

    // Incident 2: Detected 400ms after occurrence
    evaluator.recordDetection({
      incidentId: 'inc-02',
      incidentType: 'LEASE_CONTENTION',
      occurredAt: now - 500,
      detectedAt: now - 100
    });

    // MTTD = (200 + 400) / 2 = 300ms
    assert.equal(evaluator.calculateMttd(), 300);
  });

  await t.test('REM-EVAL-02: MTTR (Mean Time to Remediate) Calculation (Overall & Per-Runbook)', async () => {
    const evaluator = new RemediationEvaluator();
    const now = Date.now();

    // Incident 1: Storage purge took 50ms
    evaluator.recordDetection({
      incidentId: 'inc-01',
      incidentType: 'STORAGE_SATURATION',
      detectedAt: now - 100
    });
    evaluator.recordRemediation('inc-01', {
      runbookAction: RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH,
      success: true,
      resolvedAt: now - 50
    });

    // Incident 2: Storage purge took 70ms
    evaluator.recordDetection({
      incidentId: 'inc-02',
      incidentType: 'STORAGE_SATURATION',
      detectedAt: now - 80
    });
    evaluator.recordRemediation('inc-02', {
      runbookAction: RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH,
      success: true,
      resolvedAt: now - 10
    });

    // Incident 3: Rollback took 200ms
    evaluator.recordDetection({
      incidentId: 'inc-03',
      incidentType: 'INTEGRITY_BREACH',
      detectedAt: now - 300
    });
    evaluator.recordRemediation('inc-03', {
      runbookAction: RUNBOOK_ACTIONS.RUNBOOK_TRIGGER_ROLLBACK,
      success: true,
      resolvedAt: now - 100
    });

    // Overall MTTR = (50 + 70 + 200) / 3 = 106.67 -> 107ms
    assert.equal(evaluator.calculateMttr(), 107);

    // Per-runbook MTTR
    assert.equal(evaluator.calculateMttr(RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH), 60); // (50 + 70) / 2 = 60
    assert.equal(evaluator.calculateMttr(RUNBOOK_ACTIONS.RUNBOOK_TRIGGER_ROLLBACK), 200);
  });

  await t.test('REM-EVAL-03: Runbook Success Rate & Failure Classification', async () => {
    const evaluator = new RemediationEvaluator();
    const now = Date.now();

    // 9 successful scratch purges
    for (let i = 0; i < 9; i++) {
      evaluator.recordDetection({ incidentId: `inc-s-${i}`, incidentType: 'STORAGE_SATURATION', detectedAt: now });
      evaluator.recordRemediation(`inc-s-${i}`, {
        runbookAction: RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH,
        success: true,
        resolvedAt: now + 20
      });
    }

    // 1 failed scratch purge (permission error)
    evaluator.recordDetection({ incidentId: 'inc-s-fail', incidentType: 'STORAGE_SATURATION', detectedAt: now });
    evaluator.recordRemediation('inc-s-fail', {
      runbookAction: RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH,
      success: false,
      error: 'EACCES: permission denied',
      resolvedAt: now + 30
    });

    const stats = evaluator.calculateSuccessRate(RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH);
    assert.equal(stats.total, 10);
    assert.equal(stats.successful, 9);
    assert.equal(stats.failed, 1);
    assert.equal(stats.successRatePercent, 90.0);
  });

  await t.test('REM-EVAL-04: Flapping Incident Detection & Severity Escalation', async () => {
    const evaluator = new RemediationEvaluator({
      flappingThresholdCount: 3,
      flappingWindowMs: 600000 // 10 mins
    });
    const now = Date.now();

    // Simulate 3 lease contentions on the same session in 5 minutes
    for (let i = 0; i < 3; i++) {
      evaluator.recordDetection({
        incidentId: `inc-l-${i}`,
        incidentType: 'LEASE_CONTENTION',
        targetResource: 'session-project-101',
        detectedAt: now - (5 - i) * 60000
      });
    }

    const flapping = evaluator.detectFlapping(now);
    assert.equal(flapping.length, 1);
    assert.equal(flapping[0].incidentType, 'LEASE_CONTENTION');
    assert.equal(flapping[0].targetResource, 'session-project-101');
    assert.equal(flapping[0].count, 3);
    assert.equal(flapping[0].severity, 'WARNING');

    // Simulate 3 more occurrences -> count reaches 6 (>= threshold * 2) -> CRITICAL
    for (let i = 3; i < 6; i++) {
      evaluator.recordDetection({
        incidentId: `inc-l-${i}`,
        incidentType: 'LEASE_CONTENTION',
        targetResource: 'session-project-101',
        detectedAt: now - (2 - i * 0.2) * 60000
      });
    }

    const critFlapping = evaluator.detectFlapping(now);
    assert.equal(critFlapping[0].count, 6);
    assert.equal(critFlapping[0].severity, 'CRITICAL');
  });

  await t.test('REM-EVAL-05: Non-Negotiable Invariant: Graceful Evaluation with Zero Incidents', async () => {
    const emptyEvaluator = new RemediationEvaluator();
    assert.equal(emptyEvaluator.calculateMttd(), 0);
    assert.equal(emptyEvaluator.calculateMttr(), 0);

    const emptyStats = emptyEvaluator.calculateSuccessRate();
    assert.equal(emptyStats.total, 0);
    assert.equal(emptyStats.successRatePercent, 100.0);

    assert.equal(emptyEvaluator.detectFlapping().length, 0);

    const report = emptyEvaluator.generateEvaluationReport();
    assert.equal(report.status, 'EFFECTIVE');
    assert.equal(report.mttrTargetMet, true);
    assert.equal(report.totalIncidentsRecorded, 0);
  });
});
