/**
 * Phase 23 Stage 23.1 Test Suite: Production Operational Monitoring & Alerting Infrastructure
 *
 * Verifies:
 * 1. PROD-01: Multi-window error budget burn rate calculation (nominal, slow burn, fast burn).
 * 2. PROD-02: Incident classification and automated runbook action recommendation.
 * 3. PROD-03: Runbook execution dispatching and history audit logging.
 * 4. PROD-04: HTTP control surface integration (GET /healthz/production & GET /metrics/operational).
 * 5. PROD-05: Non-contamination invariant: telemetry errors do not consume workflow error budget.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  ProductionMonitor,
  RUNBOOK_ACTIONS,
  ERROR_BUDGET_CONFIG
} = require('../src/prompt-core/production-monitor.js');
const { SloMonitor } = require('../src/prompt-core/slo-monitor.js');
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

test('Stage 23.1: Production Operational Monitoring & Alerting Infrastructure', async (t) => {

  await t.test('PROD-01: Multi-Window Error Budget Burn Rate Calculation', async () => {
    const sloMonitor = new SloMonitor({ autoSubscribe: false });
    const prodMonitor = new ProductionMonitor({ sloMonitor });

    // Step A: Nominal baseline - 100% success
    for (let i = 1; i <= 20; i++) {
      sloMonitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1200);
    }
    const nominalBudget = prodMonitor.calculateErrorBudget();
    assert.equal(nominalBudget.burnRate, 0);
    assert.equal(nominalBudget.remainingBudgetPercent, 100);
    assert.equal(nominalBudget.alertSeverity, null);
    assert.equal(nominalBudget.recommendedRunbook, RUNBOOK_ACTIONS.RUNBOOK_NOOP);

    // Step B: Slow burn - 2 failures out of 50 jobs (4% error rate > allowed 0.5% -> burnRate = 8x)
    for (let i = 21; i <= 48; i++) {
      sloMonitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1200);
    }
    sloMonitor.recordJobCompletion('fail-1', 'FAILED', 1200);
    sloMonitor.recordJobCompletion('fail-2', 'FAILED', 1200);

    const slowBudget = prodMonitor.calculateErrorBudget();
    assert.ok(slowBudget.burnRate >= ERROR_BUDGET_CONFIG.slowBurnRate6hThreshold);
    assert.equal(slowBudget.alertSeverity, 'WARNING');
    assert.equal(slowBudget.recommendedRunbook, RUNBOOK_ACTIONS.RUNBOOK_RECONCILE_DANGLING_JOBS);

    // Step C: Fast burn - 5 failures out of 55 jobs (~9% error rate -> burnRate > 14.4x)
    for (let i = 1; i <= 5; i++) {
      sloMonitor.recordJobCompletion(`fast-fail-${i}`, 'FAILED', 1200);
    }
    const fastBudget = prodMonitor.calculateErrorBudget();
    assert.ok(fastBudget.burnRate >= ERROR_BUDGET_CONFIG.fastBurnRate1hThreshold);
    assert.equal(fastBudget.alertSeverity, 'CRITICAL');
    assert.equal(fastBudget.recommendedRunbook, RUNBOOK_ACTIONS.RUNBOOK_TRIGGER_ROLLBACK);
  });

  await t.test('PROD-02: Incident Classification & Automated Runbook Recommendations', async () => {
    const sloMonitor = new SloMonitor({ autoSubscribe: false });
    const prodMonitor = new ProductionMonitor({ sloMonitor });

    // 1. Storage Pressure incident
    const storageAssessment = prodMonitor.evaluateIncidents({
      diskAvailableBytes: 200 * 1024 * 1024, // 200MB available (< 500MB safety threshold)
      minDiskBytes: 500 * 1024 * 1024
    });
    assert.equal(storageAssessment.healthy, false);
    const storageInc = storageAssessment.activeIncidents.find(i => i.category === 'STORAGE_SATURATION');
    assert.ok(storageInc);
    assert.equal(storageInc.recommendedRunbook, RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH);

    // 2. Lock Contention incident
    for (let i = 1; i <= 6; i++) {
      sloMonitor.recordLockWait(150); // p99 contention > 50ms
    }
    const contentionAssessment = prodMonitor.evaluateIncidents();
    const lockInc = contentionAssessment.activeIncidents.find(i => i.category === 'LEASE_CONTENTION');
    assert.ok(lockInc);
    assert.equal(lockInc.recommendedRunbook, RUNBOOK_ACTIONS.RUNBOOK_BREAK_STALE_LEASES);
  });

  await t.test('PROD-03: Runbook Execution Dispatching & History Audit', async () => {
    const prodMonitor = new ProductionMonitor();

    const purgeRecord = prodMonitor.dispatchRunbook(RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH, { targetDir: 'artifacts/scratch' });
    assert.equal(purgeRecord.status, 'EXECUTED');
    assert.equal(purgeRecord.runbookAction, RUNBOOK_ACTIONS.RUNBOOK_PURGE_SCRATCH);
    assert.ok(purgeRecord.dispatchedAt);

    const rollbackRecord = prodMonitor.dispatchRunbook(RUNBOOK_ACTIONS.RUNBOOK_TRIGGER_ROLLBACK, { reason: 'Error budget exhausted' });
    assert.equal(rollbackRecord.status, 'EXECUTED');
    assert.equal(rollbackRecord.runbookAction, RUNBOOK_ACTIONS.RUNBOOK_TRIGGER_ROLLBACK);

    assert.equal(prodMonitor.dispatchedRunbooks.length, 2);
  });

  await t.test('PROD-04: HTTP Visual Control Surface Integration (/healthz/production & /metrics/operational)', async () => {
    const sloMonitor = new SloMonitor({ autoSubscribe: false });
    const prodMonitor = new ProductionMonitor({ sloMonitor });

    for (let i = 1; i <= 10; i++) {
      sloMonitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1200);
      sloMonitor.recordLockWait(4);
      sloMonitor.recordQaEvaluation(95.0, true);
    }

    const backend = new EditorBackend({
      port: 0,
      sloMonitor,
      productionMonitor: prodMonitor
    });
    const boundPort = await backend.start();

    try {
      // 1. GET /healthz/production returns 200 and healthy JSON
      const resHealth = await fetchJson(`http://localhost:${boundPort}/healthz/production`);
      assert.equal(resHealth.status, 200);
      assert.equal(resHealth.body.status, 'HEALTHY');
      assert.equal(resHealth.body.healthy, true);
      assert.ok(resHealth.body.error_budget);
      assert.equal(resHealth.body.error_budget.remainingBudgetPercent, 100);

      // 2. GET /metrics/operational returns Prometheus operational exposition
      const resMetrics = await fetchText(`http://localhost:${boundPort}/metrics/operational`);
      assert.equal(resMetrics.status, 200);
      assert.ok(resMetrics.text.includes('eme_operational_error_budget_burn_rate 0'));
      assert.ok(resMetrics.text.includes('eme_operational_error_budget_remaining_percent 100'));
      assert.ok(resMetrics.text.includes('eme_operational_active_incidents 0'));

      // 3. Induce critical error budget burn and verify 503 response
      for (let i = 1; i <= 5; i++) {
        sloMonitor.recordJobCompletion(`bad-job-${i}`, 'FAILED', 1200);
      }
      const resDegraded = await fetchJson(`http://localhost:${boundPort}/healthz/production`);
      assert.equal(resDegraded.status, 503, 'Degraded production health must return HTTP 503');
      assert.equal(resDegraded.body.healthy, false);
      assert.ok(resDegraded.body.error_budget.burnRate > 0);
    } finally {
      await backend.stop();
    }
  });

  await t.test('PROD-05: Non-Contamination Invariant (Telemetry vs Production Error Budget)', async () => {
    const sloMonitor = new SloMonitor({ autoSubscribe: false });
    const prodMonitor = new ProductionMonitor({ sloMonitor });

    // 10 successful jobs
    for (let i = 1; i <= 10; i++) {
      sloMonitor.recordJobCompletion(`job-${i}`, 'SUCCEEDED', 1000);
    }

    // Inject telemetry collection errors
    sloMonitor.recordTelemetryError('prometheus-worker', new Error('Scrape timeout on socket'));
    sloMonitor.recordTelemetryError('log-exporter', 'Buffer overflow in exporter channel');

    const budget = prodMonitor.calculateErrorBudget();
    const health = prodMonitor.getProductionHealth();

    // Critical invariant: Telemetry errors MUST NOT consume error budget
    assert.equal(budget.burnRate, 0, 'Telemetry exceptions must not inflate error budget burn rate');
    assert.equal(budget.remainingBudgetPercent, 100);
    assert.equal(health.healthy, true);
  });

});
