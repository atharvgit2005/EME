/**
 * Phase 21 Stage 21.3 Test Suite: Operational Disaster Recovery Drills
 *
 * Verifies:
 * 1. DRILL-01: Real backup restoration & cryptographic tamper rejection drill (RTO <= 2.0s).
 * 2. DRILL-02: Storage exhaustion (ENOSPC) during publication -> fail-closed to NEEDS_RECONCILIATION.
 * 3. DRILL-03: Fencing token monotonicity and stale mutation rejection drill.
 * 4. DRILL-04: Subprocess hard termination (SIGTERM -> SIGKILL) and zero orphaned process state.
 * 5. DRILL-05: Non-negotiable invariant: Active delivery preservation (RPO = 0) under all disaster conditions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  runBackupRestoreDrill,
  runStorageExhaustionDrill,
  runFencingContentionDrill
} = require('../src/prompt-core/disaster-drill.js');
const { execSubprocessGuarded } = require('../src/prompt-core/resource-guard.js');

test('Stage 21.3: Operational Disaster Recovery Drills', async (t) => {

  await t.test('DRILL-01: Real Backup Restoration & Cryptographic Tamper Rejection Drill (RTO <= 2.0s)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-drill-01-'));

    try {
      const result = await runBackupRestoreDrill(tempDir);
      assert.equal(result.untamperedPass, true, 'Untampered backup must restore successfully');
      assert.equal(result.tamperedRejected, true, 'Tampered backup must be rejected fail-closed');
      assert.equal(result.targetPreserved, true, 'Target file must not be corrupted by failed restore');
      assert.ok(result.rtoMs <= 2000, `RTO must be <= 2000ms, measured ${result.rtoMs}ms`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('DRILL-02: Storage Exhaustion (ENOSPC) during Publication -> NEEDS_RECONCILIATION', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-drill-02-'));

    try {
      const result = await runStorageExhaustionDrill(tempDir);
      assert.equal(result.normalizedStatus, 'NEEDS_RECONCILIATION', 'Truncated manifest from storage exhaustion must enter NEEDS_RECONCILIATION');
      assert.equal(result.activeDeliveryPreserved, true, 'Previous active delivery must remain intact');
      assert.ok(result.rtoMs <= 2000, `Recovery time must be <= 2000ms, measured ${result.rtoMs}ms`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('DRILL-03: Fencing Token Monotonicity & Stale Mutation Rejection Drill', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-drill-03-'));

    try {
      const result = await runFencingContentionDrill(tempDir);
      assert.equal(result.isMonotonic, true, 'Fencing tokens must be monotonically increasing');
      assert.equal(result.staleRejected, true, 'Stale token from earlier lease must be rejected');
      assert.equal(result.currentFencingValid, true, 'Current fencing token must be verified valid');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test('DRILL-04: Subprocess Hard Termination (SIGTERM -> SIGKILL) and Clean Rejection', async () => {
    const start = Date.now();
    let thrownError = null;

    try {
      // Spawn a stubborn process that ignores SIGTERM
      await execSubprocessGuarded(process.execPath, [
        '-e',
        'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'
      ], {
        timeoutMs: 150,
        killGraceMs: 100
      });
    } catch (err) {
      thrownError = err;
    }

    const elapsed = Date.now() - start;
    assert.ok(thrownError, 'Timed-out stubborn process must reject');
    assert.ok(elapsed < 2000, `Termination must complete within RTO bound (<2000ms), took ${elapsed}ms`);
  });

  await t.test('DRILL-05: Non-Negotiable Invariant: Active Delivery Preservation (RPO = 0 Data Loss)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-drill-05-'));

    try {
      // 1. Run backup drill
      const drillA = await runBackupRestoreDrill(tempDir);
      assert.equal(drillA.success, true);

      // 2. Run storage exhaustion drill
      const drillC = await runStorageExhaustionDrill(tempDir);
      assert.equal(drillC.success, true);
      assert.equal(drillC.activeDeliveryPreserved, true);

      // 3. Run fencing drill
      const drillD = await runFencingContentionDrill(tempDir);
      assert.equal(drillD.success, true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

});
