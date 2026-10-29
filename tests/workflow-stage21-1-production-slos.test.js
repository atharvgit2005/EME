/**
 * Phase 21 Stage 21.1 Test Suite: Production SLOs, Telemetry Health & Alerting Engine
 *
 * Verifies:
 * 1. SLO-01: Nominal operation and clean baseline across all SLIs (Availability, Latency, Contention, QA, Recovery).
 * 2. SLO-02: Workflow Availability SLO breach detection and severity escalation (WARNING vs CRITICAL).
 * 3. SLO-03: Job latency percentiles (p50/p95/p99) and lock contention (p99) SLO breaches.
 * 4. SLO-04: Media QA rejection rate SLO and Operational Recovery (RTO <= 2s, RPO = 0) breaches.
 * 5. SLO-05: Telemetry failure isolation: diagnostics errors generate TELEMETRY_FAILURE alerts without contaminating workflow availability SLI.
 * 6. SLO-06: HTTP Visual Control Surface integration: GET /healthz/slo and enriched GET /metrics Prometheus exposition.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  SloMonitor,
  DEFAULT_SLO_TARGETS
} = require('../src/prompt-core/slo-monitor.js');
const { EditorBackend } = require('../src/ui/server.js');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, text: data });
      });
    }).on('error', reject);
  });
}

test('Stage 21.1: Production SLOs, Telemetry Health & Alerting Engine', async (t) => {

  await t.test('SLO-01: Nominal Operation & Clean Baseline across all SLIs', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });
    
    // Initial empty state
    const initStatus = monitor.getSloStatus();
    assert.equal(initStatus.status, 'HEALTHY');
    assert.equal(initStatus.all_slos_met, true);
    assert.equal(initStatus.active_alerts.length, 0);

    // Record 10 successful jobs within nominal bounds
    for (let i = 1; i <= 10; i++) {
      monitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1200 + i * 50);
      monitor.recordLockWait(2 + (i % 5));
      monitor.recordQaEvaluation(95.0, true);
    }
    monitor.recordRecovery(450, 0); // 450ms RTO, 0 data loss

    const status = monitor.getSloStatus();
    assert.equal(status.status, 'HEALTHY');
    assert.equal(status.all_slos_met, true);
    assert.equal(status.active_alerts.length, 0);

    // Check individual SLIs
    const m = status.metrics;
    assert.equal(m.workflow_availability.ratio, 1.0);
    assert.equal(m.workflow_availability.percentage, 100.0);
    assert.equal(m.workflow_availability.targetMet, true);

    assert.ok(m.job_latency.p50 <= DEFAULT_SLO_TARGETS.latencyP50Ms);
    assert.ok(m.job_latency.p95 <= DEFAULT_SLO_TARGETS.latencyP95Ms);
    assert.ok(m.job_latency.p99 <= DEFAULT_SLO_TARGETS.latencyP99Ms);
    assert.equal(m.job_latency.targetMet, true);

    assert.ok(m.lock_contention.p99 <= DEFAULT_SLO_TARGETS.contentionP99Ms);
    assert.equal(m.lock_contention.targetMet, true);

    assert.equal(m.qa_rejection.rejectionRatio, 0.0);
    assert.equal(m.qa_rejection.targetMet, true);

    assert.ok(m.operational_recovery.rtoP95 <= DEFAULT_SLO_TARGETS.rtoMs);
    assert.equal(m.operational_recovery.totalDataLoss, 0);
    assert.equal(m.operational_recovery.targetMet, true);
  });

  await t.test('SLO-02: Workflow Availability SLO Breach Detection & Severity Escalation', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });
    const alertsFired = [];
    monitor.onAlert((alert) => alertsFired.push(alert));

    // Record 9 successful jobs and 1 failure (90% availability, target 99.5%)
    for (let i = 1; i <= 9; i++) {
      monitor.recordJobCompletion(`job-s-${i}`, 'SUCCEEDED', 1000);
    }
    monitor.recordJobCompletion('job-f-1', 'FAILED', 1000);

    const statusWarn = monitor.getSloStatus();
    assert.equal(statusWarn.status, 'DEGRADED');
    assert.equal(statusWarn.all_slos_met, false);
    assert.equal(statusWarn.metrics.workflow_availability.percentage, 90.0);
    assert.equal(statusWarn.metrics.workflow_availability.targetMet, false);

    const availAlertWarn = statusWarn.active_alerts.find(a => a.category === 'WORKFLOW_SLO_BREACH');
    assert.ok(availAlertWarn, 'WORKFLOW_SLO_BREACH alert must be active');
    assert.equal(availAlertWarn.severity, 'WARNING');
    assert.ok(availAlertWarn.remediation, 'Remediation advice must be present');

    // Escalate: add 2 more failures to drop availability below 90% (9 / 12 = 75%)
    monitor.recordJobCompletion('job-f-2', 'FAILED', 1000);
    monitor.recordJobCompletion('job-f-3', 'NEEDS_RECONCILIATION', 1000);

    const statusCrit = monitor.getSloStatus();
    assert.equal(statusCrit.metrics.workflow_availability.percentage, 75.0);
    const availAlertCrit = statusCrit.active_alerts.find(a => a.category === 'WORKFLOW_SLO_BREACH');
    assert.ok(availAlertCrit);
    assert.equal(availAlertCrit.severity, 'CRITICAL', 'Availability < 90% must escalate to CRITICAL');

    // Cancelled jobs must NOT count against availability SLI
    monitor.recordJobCompletion('job-c-1', 'CANCELLED', 200);
    const statusCancelled = monitor.getSloStatus();
    assert.equal(statusCancelled.metrics.workflow_availability.percentage, 75.0, 'CANCELLED jobs must not dilute availability ratio');
  });

  await t.test('SLO-03: Job Latency & Lock Contention SLO Breach', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });

    // Latency breach: record jobs with 35,000ms duration (target p99 <= 30,000ms)
    for (let i = 1; i <= 5; i++) {
      monitor.recordJobCompletion(`job-slow-${i}`, 'SUCCEEDED', 35000);
    }

    const latStatus = monitor.getSloStatus();
    assert.equal(latStatus.metrics.job_latency.targetMet, false);
    const latAlert = latStatus.active_alerts.find(a => a.category === 'LATENCY_SLO_BREACH');
    assert.ok(latAlert, 'LATENCY_SLO_BREACH alert must be active');
    assert.ok(latAlert.message.includes('Job Latency SLO breached'));

    // Contention breach: record lock waits of 120ms (target <= 50ms)
    for (let i = 1; i <= 6; i++) {
      monitor.recordLockWait(120);
    }

    const contStatus = monitor.getSloStatus();
    assert.equal(contStatus.metrics.lock_contention.targetMet, false);
    const contAlert = contStatus.active_alerts.find(a => a.category === 'CONTENTION_SLO_BREACH');
    assert.ok(contAlert, 'CONTENTION_SLO_BREACH alert must be active');
    assert.equal(contAlert.severity, 'WARNING');
  });

  await t.test('SLO-04: Media QA Rejection & Operational Recovery (RTO / RPO) SLO', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });

    // QA rejection breach: 2 out of 10 rejected (20% rejection rate, target <= 5%)
    for (let i = 1; i <= 8; i++) {
      monitor.recordQaEvaluation(92.0, true);
    }
    monitor.recordQaEvaluation(70.0, false);
    monitor.recordQaEvaluation(65.0, false);

    const qaStatus = monitor.getSloStatus();
    assert.equal(qaStatus.metrics.qa_rejection.rejectionPercentage, 20.0);
    assert.equal(qaStatus.metrics.qa_rejection.targetMet, false);
    const qaAlert = qaStatus.active_alerts.find(a => a.category === 'QA_REJECTION_SLO_BREACH');
    assert.ok(qaAlert, 'QA_REJECTION_SLO_BREACH alert must be active');

    // Operational recovery breach: RTO = 3500ms (> 2000ms) and RPO data loss = 1
    monitor.recordRecovery(3500, 1);
    const recStatus = monitor.getSloStatus();
    assert.equal(recStatus.metrics.operational_recovery.targetMet, false);
    assert.equal(recStatus.metrics.operational_recovery.totalDataLoss, 1);
    const recAlert = recStatus.active_alerts.find(a => a.category === 'RECOVERY_SLO_BREACH');
    assert.ok(recAlert, 'RECOVERY_SLO_BREACH alert must be active');
    assert.equal(recAlert.severity, 'CRITICAL', 'RPO data loss must strictly generate CRITICAL alert');
  });

  await t.test('SLO-05: Telemetry Failure Isolation (Strict Non-Contamination Invariant)', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });

    // Record nominal jobs: 10 succeeded
    for (let i = 1; i <= 10; i++) {
      monitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1500);
    }

    // Now inject multiple telemetry/diagnostics exceptions
    monitor.recordTelemetryError('metrics-worker', new Error('Connection reset on prometheus pushgateway'));
    monitor.recordTelemetryError('diagnostics-subscriber', 'Buffer overflow in event listener');

    const status = monitor.getSloStatus();
    assert.equal(status.telemetry_alerts_count, 2);

    // CRITICAL INVARIANT: Telemetry failures MUST NOT degrade workflow availability!
    assert.equal(status.metrics.workflow_availability.percentage, 100.0, 'Telemetry exceptions must never decrement workflow availability percentage');
    assert.equal(status.metrics.workflow_availability.targetMet, true);
    assert.equal(status.metrics.workflow_availability.total, 10);
    assert.equal(status.metrics.workflow_availability.succeeded, 10);

    // Active alert for telemetry failure exists independently
    const telAlert = status.active_alerts.find(a => a.category === 'TELEMETRY_FAILURE');
    assert.ok(telAlert, 'Dedicated TELEMETRY_FAILURE alert must be generated');
    assert.equal(telAlert.severity, 'WARNING');
    assert.ok(telAlert.message.includes('Telemetry observer exception'));
  });

  await t.test('SLO-06: HTTP Visual Control Surface Integration (GET /healthz/slo & GET /metrics)', async () => {
    const monitor = new SloMonitor({ autoSubscribe: false });
    // Populate healthy data
    for (let i = 1; i <= 5; i++) {
      monitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 2000);
      monitor.recordLockWait(5);
      monitor.recordQaEvaluation(90.0, true);
    }

    const backend = new EditorBackend({ port: 0, sloMonitor: monitor });
    const boundPort = await backend.start();

    try {
      // 1. GET /healthz/slo returns 200 and healthy JSON
      const resSlo = await fetchJson(`http://localhost:${boundPort}/healthz/slo`);
      assert.equal(resSlo.status, 200);
      assert.equal(resSlo.body.status, 'HEALTHY');
      assert.equal(resSlo.body.all_slos_met, true);
      assert.equal(resSlo.body.metrics.workflow_availability.percentage, 100.0);

      // 2. GET /readyz reports all_slos_met: true
      const resReady = await fetchJson(`http://localhost:${boundPort}/readyz`);
      assert.equal(resReady.status, 200);
      assert.equal(resReady.body.status, 'ready');
      assert.equal(resReady.body.all_slos_met, true);

      // 3. GET /metrics exposes Prometheus SLO metrics
      const resMetrics = await fetchText(`http://localhost:${boundPort}/metrics`);
      assert.equal(resMetrics.status, 200);
      assert.ok(resMetrics.text.includes('eme_slo_workflow_availability_ratio 1'));
      assert.ok(resMetrics.text.includes('eme_slo_workflow_availability_target 99.5'));
      assert.ok(resMetrics.text.includes('eme_slo_job_latency_ms{quantile="0.5"} 2000'));
      assert.ok(resMetrics.text.includes('eme_slo_lock_contention_p99_ms 5'));
      assert.ok(resMetrics.text.includes('eme_slo_qa_rejection_ratio 0'));

      // 4. Degrade SLO and verify 503 response on /healthz/slo
      monitor.recordJobCompletion('bad-job-1', 'FAILED', 1000);
      monitor.recordJobCompletion('bad-job-2', 'FAILED', 1000);
      const resDegraded = await fetchJson(`http://localhost:${boundPort}/healthz/slo`);
      assert.equal(resDegraded.status, 503, 'Degraded SLO must return HTTP 503');
      assert.equal(resDegraded.body.status, 'DEGRADED');
      assert.equal(resDegraded.body.all_slos_met, false);
    } finally {
      await backend.stop();
    }
  });

});
