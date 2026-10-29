/**
 * Phase 22 Stage 22.1 Test Suite: Representative Workload Engine & SLO Stress Validation
 *
 * Verifies:
 * 1. VAL-01: Multi-distribution workload synthesis across LOW_VOLUME, BURST, SUSTAINED_PEAK, and CHAOS profiles.
 * 2. VAL-02: Cold-start and zero-traffic sample sufficiency guards protecting against misleading health assessments.
 * 3. VAL-03: Deterministic alert state machine transitions (HEALTHY -> WARNING -> CRITICAL -> RECOVERY -> HEALTHY).
 * 4. VAL-04: Telemetry failure isolation under active workload with dedicated telemetry health alerting.
 * 5. VAL-05: High-concurrency burst and exact percentile (p50, p95, p99) calculation accuracy.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { SloMonitor } = require('../src/prompt-core/slo-monitor.js');
const {
  WorkloadValidator,
  WORKLOAD_PROFILES,
  SAMPLE_SUFFICIENCY_THRESHOLDS
} = require('../src/prompt-core/workload-validator.js');

test('Stage 22.1: Representative Workload Engine & SLO Stress Validation', async (t) => {

  await t.test('VAL-01: Multi-Distribution Workload Synthesis', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });
    const validator = new WorkloadValidator(monitor);

    // 1. Synthesize LOW_VOLUME
    const lowSum = validator.synthesizeWorkload(WORKLOAD_PROFILES.LOW_VOLUME, { count: 3 });
    assert.equal(lowSum.jobsGenerated, 3);
    assert.equal(lowSum.succeeded, 3);

    // 2. Synthesize BURST
    const burstSum = validator.synthesizeWorkload(WORKLOAD_PROFILES.BURST, { burstSize: 40 });
    assert.equal(burstSum.jobsGenerated, 40);
    assert.equal(burstSum.succeeded, 40);
    assert.equal(burstSum.lockWaitsGenerated, 40);

    // 3. Synthesize SUSTAINED_PEAK
    const sustainedSum = validator.synthesizeWorkload(WORKLOAD_PROFILES.SUSTAINED_PEAK, { totalJobs: 150 });
    assert.equal(sustainedSum.jobsGenerated, 150);
    assert.ok(sustainedSum.succeeded >= 145);

    // 4. Synthesize CHAOS_DEGRADED
    const chaosSum = validator.synthesizeWorkload(WORKLOAD_PROFILES.CHAOS_DEGRADED, {
      totalJobs: 20,
      injectTelemetryError: true,
      injectRecovery: true
    });
    assert.equal(chaosSum.jobsGenerated, 20);
    assert.ok(chaosSum.failed > 0);
    assert.equal(chaosSum.telemetryErrorsGenerated, 1);
    assert.equal(chaosSum.recoveriesGenerated, 1);
  });

  await t.test('VAL-02: Cold-Start & Zero-Traffic Sample Sufficiency Guards', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });
    const validator = new WorkloadValidator(monitor);

    // Step A: Zero traffic state
    const zeroEval = validator.evaluateSampleSufficiency();
    assert.equal(zeroEval.confidence, 'NO_DATA');
    assert.equal(zeroEval.assessment, 'INSUFFICIENT_DATA');
    assert.equal(zeroEval.allSamplesSufficient, false);
    assert.equal(zeroEval.counts.workflow_availability.count, 0);

    // Step B: Low traffic (2 jobs) - insufficient sample size
    validator.synthesizeWorkload(WORKLOAD_PROFILES.LOW_VOLUME, { count: 2 });
    const lowEval = validator.evaluateSampleSufficiency();
    assert.equal(lowEval.confidence, 'LOW');
    assert.equal(lowEval.assessment, 'INSUFFICIENT_DATA');
    assert.equal(lowEval.counts.workflow_availability.sufficient, false);
    assert.equal(lowEval.counts.workflow_availability.count, 2);

    // Step C: Add jobs to satisfy availability (5 jobs) and latency (3 jobs), but lacking QA / contention
    for (let i = 3; i <= 5; i++) {
      monitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1200);
    }
    const modEval = validator.evaluateSampleSufficiency();
    assert.equal(modEval.counts.workflow_availability.sufficient, true);
    assert.equal(modEval.counts.job_latency.sufficient, true);
    assert.equal(modEval.confidence, 'MODERATE');

    // Step D: Full sample sufficiency across all SLIs
    for (let i = 1; i <= 6; i++) {
      monitor.recordLockWait(4);
      monitor.recordQaEvaluation(95.0, true);
    }
    monitor.recordRecovery(300, 0);
    const fullEval = validator.evaluateSampleSufficiency();
    assert.equal(fullEval.confidence, 'HIGH');
    assert.equal(fullEval.assessment, 'HEALTHY');
    assert.equal(fullEval.allSamplesSufficient, true);
  });

  await t.test('VAL-03: Deterministic Alert State Machine Transitions', async () => {
    const validator = new WorkloadValidator();
    const result = validator.verifyAlertTransitions();

    assert.equal(result.success, true);
    assert.equal(result.trace.length, 5);
    assert.equal(result.trace[0].step, 'INITIAL_STATE');
    assert.equal(result.trace[1].step, 'NOMINAL_WORKLOAD');
    assert.equal(result.trace[2].step, 'TRIGGER_WARNING');
    assert.equal(result.trace[2].severity, 'WARNING');
    assert.equal(result.trace[3].step, 'TRIGGER_CRITICAL');
    assert.equal(result.trace[3].severity, 'CRITICAL');
    assert.equal(result.trace[4].step, 'RESTORE_HEALTHY');
    assert.equal(result.trace[4].activeWorkflowAlerts, 0);
    assert.equal(result.trace[4].allSlosMet, true);
  });

  await t.test('VAL-04: Telemetry Failure Isolation Under Active Workload', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });
    const validator = new WorkloadValidator(monitor);

    // Run active workload
    validator.synthesizeWorkload(WORKLOAD_PROFILES.BURST, { burstSize: 30 });

    // Inject telemetry collection failure
    monitor.recordTelemetryError('prometheus-exporter', new Error('ECONNRESET while collecting metrics'));
    monitor.recordTelemetryError('log-streamer', 'Dropped 4 diagnostic events due to backpressure');

    const evalRes = validator.evaluateSampleSufficiency();
    const sloStatus = monitor.getSloStatus();

    // Verify isolation: workflow availability remains 100%
    assert.equal(sloStatus.metrics.workflow_availability.percentage, 100.0);
    assert.equal(sloStatus.metrics.workflow_availability.targetMet, true);

    // Verify telemetry health reporting
    assert.equal(evalRes.telemetry_health.healthy, false);
    assert.equal(evalRes.telemetry_health.telemetry_errors_count, 2);
    assert.equal(evalRes.telemetry_health.isolated_from_workflow_slo, true);

    // Verify dedicated TELEMETRY_FAILURE alert exists
    const telAlert = sloStatus.active_alerts.find(a => a.category === 'TELEMETRY_FAILURE');
    assert.ok(telAlert, 'TELEMETRY_FAILURE alert must be present');
    assert.equal(telAlert.severity, 'WARNING');
  });

  await t.test('VAL-05: High-Concurrency Burst & Percentile Methodology Verification', async () => {
    const validator = new WorkloadValidator();

    // Verify exact mathematical percentile behavior under 1000 samples
    const res = validator.validatePercentileMethodology(1000);
    assert.equal(res.exactMatch, true);
    assert.equal(res.calculated.p50, 500);
    assert.equal(res.calculated.p95, 950);
    assert.equal(res.calculated.p99, 990);

    // Run high concurrency burst test
    const monitor = new SloMonitor({ autoSubscribe: false });
    const burstValidator = new WorkloadValidator(monitor);
    burstValidator.synthesizeWorkload(WORKLOAD_PROFILES.BURST, {
      burstSize: 100,
      baseLatencyMs: 2000,
      spikeMultiplier: 3
    });

    const status = monitor.getSloStatus();
    assert.equal(status.metrics.job_latency.sampleCount, 100);
    assert.ok(status.metrics.job_latency.p50 >= 2000);
    assert.ok(status.metrics.job_latency.p99 >= status.metrics.job_latency.p50);
    assert.equal(status.metrics.lock_contention.sampleCount, 100);
  });

});
