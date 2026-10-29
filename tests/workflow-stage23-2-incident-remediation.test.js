/**
 * Phase 23 Stage 23.2 Test Suite: Automated Incident Response & Remediation Engine
 *
 * Verifies:
 * 1. REM-01: Storage saturation remediation (purges scratch media while preserving active deliverables).
 * 2. REM-02: Dangling in-flight job reconciliation sweep on restart -> NEEDS_RECONCILIATION.
 * 3. REM-03: Stale lease deadlock resolution (auto-revocation on TTL expiration).
 * 4. REM-04: Emergency containment and rollback to prior known-good baseline.
 * 5. REM-05: Comprehensive remediation audit logging and event tracking.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IncidentRemediator } = require('../src/prompt-core/incident-remediator.js');
const { OrchestrationJobManager } = require('../src/prompt-core/job-orchestrator.js');
const { SessionLockCoordinator } = require('../src/prompt-core/session-lock.js');
const { RollbackManager } = require('../src/prompt-core/rollback-manager.js');

test('Stage 23.2: Automated Incident Response & Remediation Engine', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/rem-test-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('REM-01: Storage Saturation Auto-Purge (Preserving Active Deliverables)', async () => {
    const remediator = new IncidentRemediator();
    const tempScratch = path.join(scratchDir, 'scratch-files');
    fs.mkdirSync(tempScratch, { recursive: true });

    // Create temporary scratch files
    const scratch1 = path.join(tempScratch, 'temp_frame_01.raw');
    const scratch2 = path.join(tempScratch, 'temp_audio_chunk.wav');
    fs.writeFileSync(scratch1, Buffer.alloc(1024 * 500)); // 500 KB
    fs.writeFileSync(scratch2, Buffer.alloc(1024 * 500)); // 500 KB

    // Create active deliverable in the same folder or separate
    const activeDelivery = path.join(tempScratch, 'active_canonical_delivery.mp4');
    fs.writeFileSync(activeDelivery, 'CANONICAL_ACTIVE_MEDIA_DATA');

    // Run purge preserving active deliverable
    const purgeRes = remediator.remediateStorageSaturation(tempScratch, {
      preservePaths: [activeDelivery]
    });

    assert.equal(purgeRes.filesPurged, 2);
    assert.ok(purgeRes.bytesReclaimed >= 1024 * 1000);
    assert.ok(!fs.existsSync(scratch1));
    assert.ok(!fs.existsSync(scratch2));

    // CRITICAL: Active deliverable must remain intact
    assert.ok(fs.existsSync(activeDelivery));
    assert.equal(fs.readFileSync(activeDelivery, 'utf8'), 'CANONICAL_ACTIVE_MEDIA_DATA');
  });

  await t.test('REM-02: Dangling In-Flight Job Reconciliation Sweep', async () => {
    const jobsDir = path.join(scratchDir, 'jobs');
    const jobManager = new OrchestrationJobManager(jobsDir);
    const remediator = new IncidentRemediator({ jobManager });

    // Create jobs in various states
    const jobRunning1 = jobManager.createJob({ jobId: 'job-run-1', request: { type: 'render' } });
    jobManager.transition(jobRunning1.job_id, 'PLANNING');
    jobManager.transition(jobRunning1.job_id, 'READY_TO_EXECUTE');
    jobManager.transition(jobRunning1.job_id, 'EXECUTING');

    const jobRunning2 = jobManager.createJob({ jobId: 'job-run-2', request: { type: 'render' } });
    jobManager.transition(jobRunning2.job_id, 'PLANNING');
    jobManager.transition(jobRunning2.job_id, 'READY_TO_EXECUTE');

    const jobDone = jobManager.createJob({ jobId: 'job-done', request: { type: 'render' } });
    jobManager.transition(jobDone.job_id, 'PLANNING');
    jobManager.transition(jobDone.job_id, 'READY_TO_EXECUTE');
    jobManager.transition(jobDone.job_id, 'EXECUTING');
    jobManager.transition(jobDone.job_id, 'VERIFYING');
    jobManager.transition(jobDone.job_id, 'RENDERING');
    jobManager.transition(jobDone.job_id, 'PUBLISHING');
    jobManager.transition(jobDone.job_id, 'SUCCEEDED');

    // Execute reconciliation sweep
    const sweepRes = remediator.reconcileDanglingJobs(jobsDir, 'Simulated crash recovery sweep');
    assert.equal(sweepRes.reconciledCount, 2);

    const check1 = jobManager.loadJob(jobRunning1.job_id);
    const check2 = jobManager.loadJob(jobRunning2.job_id);
    const checkDone = jobManager.loadJob(jobDone.job_id);

    assert.equal(check1.status, 'NEEDS_RECONCILIATION');
    assert.equal(check2.status, 'NEEDS_RECONCILIATION');
    assert.equal(checkDone.status, 'SUCCEEDED', 'Terminal job must remain unaffected');
  });

  await t.test('REM-03: Stale Lease Deadlock Resolution', async () => {
    const lockDir = path.join(scratchDir, 'locks');
    const lockCoordinator = new SessionLockCoordinator({ lockDir });
    const remediator = new IncidentRemediator({ lockCoordinator });

    // Acquire lock and simulate past acquisition timestamp in lock file
    const handle = lockCoordinator.acquireLock('session', 'session-deadlocked');
    assert.ok(handle);

    // Artificially age the lock file on disk by 60 seconds (TTL = 30s) and set pid to dead process (99999999)
    const lockPath = lockCoordinator.getLockPath('session', 'session-deadlocked');
    const meta = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    meta.acquired_at = new Date(Date.now() - 60000).toISOString();
    meta.pid = 99999999; // Dead PID
    fs.writeFileSync(lockPath, JSON.stringify(meta, null, 2), 'utf8');

    // Break stale leases
    const breakRes = remediator.breakStaleLeases('session', 30000);
    assert.equal(breakRes.brokenCount, 1);

    // Verify lock is now acquirable again
    const newHandle = lockCoordinator.acquireLock('session', 'session-deadlocked');
    assert.ok(newHandle);
    assert.ok(newHandle.fencingToken > handle.fencingToken, 'Monotonic fencing token must increment');
  });

  await t.test('REM-04: Emergency Containment & Rollback Execution', async () => {
    const priorKnownGoodDir = path.resolve(__dirname, '../dist/prior-known-good');
    const rollbackManager = new RollbackManager({ archiveDir: priorKnownGoodDir });
    const remediator = new IncidentRemediator({ rollbackManager });

    const targetDir = path.join(scratchDir, 'emergency-restore');
    const containment = remediator.containAndRollback(targetDir, 'QA corruption detected');

    assert.equal(containment.action, 'CONTAIN_AND_ROLLBACK');
    assert.ok(containment.rollbackResult);
    assert.equal(containment.rollbackResult.ok, true);
    assert.equal(containment.rollbackResult.sha256, '96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282');

    const restoredPath = path.join(targetDir, containment.rollbackResult.restoredFilename);
    assert.ok(fs.existsSync(restoredPath));
  });

  await t.test('REM-05: Comprehensive Remediation Audit Logging', async () => {
    const lockDir = path.join(scratchDir, 'locks-audit');
    const lockCoordinator = new SessionLockCoordinator({ lockDir });
    const remediator = new IncidentRemediator({ lockCoordinator });
    remediator.remediateStorageSaturation(path.join(scratchDir, 'nonexistent'));
    remediator.breakStaleLeases('session', 10000);

    assert.equal(remediator.remediationHistory.length, 2);
    assert.equal(remediator.remediationHistory[0].action, 'STORAGE_PURGE');
    assert.equal(remediator.remediationHistory[1].action, 'STALE_LEASES_BROKEN');
    assert.ok(remediator.remediationHistory[0].timestamp);
    assert.ok(remediator.remediationHistory[1].timestamp);
  });

});
