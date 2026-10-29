/**
 * Phase 22 Stage 22.3 Test Suite: Controlled Production Pilot & Progressive Canary Execution
 *
 * Verifies:
 * 1. PILOT-01: Pilot cohort specification and deterministic eligibility filtering.
 * 2. PILOT-02: Progressive canary gate advancement (0% -> 10% -> 50% -> 100%) with observation window enforcement.
 * 3. PILOT-03: Real-time SLO breach containment (error rate & latency thresholds).
 * 4. PILOT-04: Non-negotiable invariant: Immediate containment on active delivery integrity breach.
 * 5. PILOT-05: Append-only pilot health ledger integrity and decision provenance.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PilotController,
  PILOT_GATES,
  DEFAULT_PILOT_CONFIG
} = require('../src/prompt-core/pilot-controller.js');
const { SloMonitor } = require('../src/prompt-core/slo-monitor.js');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

test('Stage 22.3: Controlled Production Pilot & Progressive Canary Execution', async (t) => {

  await t.test('PILOT-01: Cohort Specification & Eligibility Filtering', async () => {
    const controller = new PilotController({
      config: { minObservationDurationMs: 10, minJobCountPerGate: 5 }
    });

    // Gate 0%: No requests eligible
    assert.equal(controller.currentGate, 0);
    assert.equal(controller.isRequestEligible({ jobId: 'req-1' }), false);
    assert.equal(controller.isRequestEligible({ jobId: 'req-2' }), false);

    // Manually test at Gate 50%: Approximately half eligible
    controller.currentGate = 50;
    let eligibleCount = 0;
    for (let i = 0; i < 100; i++) {
      if (controller.isRequestEligible({ jobId: `job-sample-${i}` })) {
        eligibleCount++;
      }
    }
    // Distribution should be roughly 50% (allow 35-65 range for hash hashing)
    assert.ok(eligibleCount >= 35 && eligibleCount <= 65, `Expected ~50% eligible, got ${eligibleCount}%`);

    // Gate 100%: 100% requests eligible
    controller.currentGate = 100;
    for (let i = 0; i < 20; i++) {
      assert.equal(controller.isRequestEligible({ jobId: `full-job-${i}` }), true);
    }
  });

  await t.test('PILOT-02: Progressive Canary Gate Advancement (0% -> 10% -> 50% -> 100%)', async () => {
    const controller = new PilotController({
      config: { minObservationDurationMs: 50, minJobCountPerGate: 10 }
    });

    // 1. Initial Gate 0%
    assert.equal(controller.currentGate, 0);

    // Premature evaluation: no jobs, no elapsed time
    const evalZero = controller.evaluateGateAdvancement();
    assert.equal(evalZero.canAdvance, false);

    // Wait for observation window
    await sleep(60);

    // Observation duration met, but job count not met
    const evalNoJobs = controller.evaluateGateAdvancement();
    assert.equal(evalNoJobs.canAdvance, false);
    assert.ok(evalNoJobs.reason.includes('Sample job count'));

    // Record 10 successful jobs at Gate 0
    for (let i = 1; i <= 10; i++) {
      controller.recordJobExecution({ jobId: `g0-job-${i}`, status: 'SUCCEEDED', durationMs: 1200 });
    }

    // Now ready for Gate 10%
    const evalReady10 = controller.evaluateGateAdvancement();
    assert.equal(evalReady10.canAdvance, true);
    assert.equal(evalReady10.nextGate, 10);

    // Advance to Gate 10%
    controller.advanceToNextGate();
    assert.equal(controller.currentGate, 10);

    // Advance to Gate 50%
    await sleep(60);
    for (let i = 1; i <= 10; i++) {
      controller.recordJobExecution({ jobId: `g10-job-${i}`, status: 'SUCCEEDED', durationMs: 1300 });
    }
    const evalReady50 = controller.evaluateGateAdvancement();
    assert.equal(evalReady50.canAdvance, true);
    assert.equal(evalReady50.nextGate, 50);
    controller.advanceToNextGate();
    assert.equal(controller.currentGate, 50);

    // Advance to Gate 100%
    await sleep(60);
    for (let i = 1; i <= 10; i++) {
      controller.recordJobExecution({ jobId: `g50-job-${i}`, status: 'SUCCEEDED', durationMs: 1400 });
    }
    const evalReady100 = controller.evaluateGateAdvancement();
    assert.equal(evalReady100.canAdvance, true);
    assert.equal(evalReady100.nextGate, 100);
    controller.advanceToNextGate();
    assert.equal(controller.currentGate, 100);

    // At Gate 100%: verify completion
    const evalComplete = controller.evaluateGateAdvancement();
    assert.equal(evalComplete.isComplete, true);
    assert.equal(evalComplete.currentGate, 100);
  });

  await t.test('PILOT-03: Real-Time SLO Breach Containment', async () => {
    const controller = new PilotController({
      config: { minObservationDurationMs: 10, minJobCountPerGate: 10, maxErrorRatePercent: 0.5 }
    });

    controller.currentGate = 10;
    await sleep(20);

    // Record 9 successful jobs and 1 failed job (10% error rate > 0.5% threshold)
    for (let i = 1; i <= 9; i++) {
      controller.recordJobExecution({ jobId: `job-ok-${i}`, status: 'SUCCEEDED', durationMs: 1000 });
    }
    controller.recordJobExecution({ jobId: 'job-fail-1', status: 'FAILED', durationMs: 1000 });

    const evalRes = controller.evaluateGateAdvancement();
    assert.equal(evalRes.canAdvance, false);
    assert.equal(evalRes.contained, true);
    assert.equal(controller.isContained, true);
    assert.equal(controller.currentGate, -1);
    assert.ok(evalRes.reason.includes('exceeded threshold'));
  });

  await t.test('PILOT-04: Immediate Containment on Active Delivery Integrity Breach', async () => {
    const controller = new PilotController({
      config: { minObservationDurationMs: 10, minJobCountPerGate: 5 }
    });
    controller.currentGate = 50;

    // Simulate an execution where active delivery integrity check fails
    controller.recordJobExecution({
      jobId: 'corrupted-delivery-job',
      status: 'SUCCEEDED',
      durationMs: 1200,
      activeDeliveryVerified: false // Integrity breach!
    });

    assert.equal(controller.isContained, true);
    assert.equal(controller.currentGate, -1);
    assert.equal(controller.activeDeliveryCompromised, true);

    // No further requests can be eligible
    assert.equal(controller.isRequestEligible({ jobId: 'any-new-job' }), false);

    // Health ledger must record the exact breach action
    const breachEntry = controller.healthLedger.find(e => e.action === 'CONTAINMENT_TRIGGERED');
    assert.ok(breachEntry);
    assert.equal(breachEntry.priorGate, 50);
    assert.equal(breachEntry.activeDeliveryCompromised, true);
  });

  await t.test('PILOT-05: Append-Only Pilot Health Ledger Verification', async () => {
    const controller = new PilotController({
      config: { minObservationDurationMs: 20, minJobCountPerGate: 5 }
    });

    await sleep(25);
    for (let i = 1; i <= 5; i++) {
      controller.recordJobExecution({ jobId: `test-${i}`, status: 'SUCCEEDED', durationMs: 1000 });
    }
    controller.advanceToNextGate();

    const status = controller.getPilotStatus();
    assert.ok(status.healthLedger.length >= 2);
    assert.equal(status.healthLedger[0].action, 'PILOT_INITIALIZED');
    assert.equal(status.healthLedger[1].action, 'GATE_ADVANCED');
    assert.equal(status.healthLedger[1].fromGate, 0);
    assert.equal(status.healthLedger[1].toGate, 10);
    assert.ok(status.healthLedger[1].timestamp);
    assert.ok(status.healthLedger[1].evidence);
  });

});
