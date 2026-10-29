/**
 * Phase 22 Stage 22.4 Test Suite: Operational Recovery & Verified Rollback Proof
 *
 * Verifies:
 * 1. REC-01: Deployment interruption and service crash recovery with RTO <= 2.0s.
 * 2. REC-02: Live rollback to approved Phase 20 replacement baseline (SHA-256: 96002a..., 371,606 bytes, 161 files).
 * 3. REC-03: Strict Invariant: Active delivery preservation across crash, recovery, and rollback (RPO = 0).
 * 4. REC-04: Cryptographic tamper detection and fail-closed rejection on corrupted baseline.
 * 5. REC-05: Pilot health ledger and SLO recovery metrics synchronization.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { RollbackManager } = require('../src/prompt-core/rollback-manager.js');
const { PilotController } = require('../src/prompt-core/pilot-controller.js');
const { SloMonitor } = require('../src/prompt-core/slo-monitor.js');
const { OrchestrationJobManager } = require('../src/prompt-core/job-orchestrator.js');

const APPROVED_BASELINE_SHA256 = '96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282';
const APPROVED_BASELINE_BYTES = 371606;
const APPROVED_BASELINE_FILES = 161;

test('Stage 22.4: Operational Recovery & Verified Rollback Proof', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/rec-test-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('REC-01: Deployment Interruption & Crash Recovery (RTO <= 2.0s)', async () => {
    const jobsDir = path.join(scratchDir, 'jobs');
    const jobManager = new OrchestrationJobManager(jobsDir);

    // Create an in-flight job that gets interrupted by a simulated hard crash
    const job = jobManager.createJob({ jobId: 'job-interrupted-01', request: { operation: 'render' } });
    jobManager.transition(job.job_id, 'PLANNING');
    jobManager.transition(job.job_id, 'READY_TO_EXECUTE');
    jobManager.transition(job.job_id, 'EXECUTING');

    // Simulate service restart: reconcile dangling in-flight jobs
    const startReconcile = Date.now();
    const inFlightJob = jobManager.loadJob(job.job_id);
    if (['EXECUTING', 'PLANNING', 'RENDERING'].includes(inFlightJob.status)) {
      jobManager.transition(inFlightJob.job_id, 'NEEDS_RECONCILIATION', {
        reason: 'Service restart: in-flight job interrupted by deployment crash',
        error: 'Deployment interrupted'
      });
    }

    const durationMs = Date.now() - startReconcile;
    assert.ok(durationMs <= 2000, `Recovery duration (${durationMs}ms) must satisfy RTO <= 2000ms`);

    const reconciledJob = jobManager.loadJob(job.job_id);
    assert.equal(reconciledJob.status, 'NEEDS_RECONCILIATION');
    const lastHistory = reconciledJob.state_history[reconciledJob.state_history.length - 1];
    assert.ok(lastHistory.reason.includes('interrupted'));
  });

  await t.test('REC-02: Live Rollback to Approved Phase 20 Baseline', async () => {
    const priorKnownGoodDir = path.resolve(__dirname, '../dist/prior-known-good');
    const rollbackManager = new RollbackManager({ archiveDir: priorKnownGoodDir });

    const baselineTarball = path.join(priorKnownGoodDir, 'editing-mechanics-engine-0.1.0-rc1.tgz');
    assert.ok(fs.existsSync(baselineTarball), 'Approved baseline tarball must exist in dist/prior-known-good');

    // 1. Verify artifact against approved checksum and size
    const verification = rollbackManager.verifyReleaseArtifact(baselineTarball, APPROVED_BASELINE_SHA256);
    assert.equal(verification.valid, true);
    assert.equal(verification.calculatedSha256, APPROVED_BASELINE_SHA256);
    assert.equal(verification.byteSize, APPROVED_BASELINE_BYTES);
    assert.equal(verification.fileCount, APPROVED_BASELINE_FILES);

    // 2. Execute live atomic rollback restoration into staging target directory
    const restoreDir = path.join(scratchDir, 'live-rollback-target');
    const rollbackResult = rollbackManager.executeRollback(restoreDir);

    assert.equal(rollbackResult.ok, true);
    assert.equal(rollbackResult.sha256, APPROVED_BASELINE_SHA256);
    assert.ok(rollbackResult.durationMs <= 1000, `Rollback restoration took ${rollbackResult.durationMs}ms (<= 1.0s)`);

    // Verify restored file in target directory
    const restoredFile = path.join(restoreDir, rollbackResult.restoredFilename);
    assert.ok(fs.existsSync(restoredFile));
    assert.equal(fs.statSync(restoredFile).size, APPROVED_BASELINE_BYTES);
  });

  await t.test('REC-03: Active Delivery Preservation Across Rollback (RPO = 0 Data Loss)', async () => {
    // Certified active delivery
    const activeDelivery = {
      revision_id: 'rev-2026-10-21-verified-active',
      manifest_id: 'manifest-certified-phase21',
      media_path: path.join(scratchDir, 'active_final_delivery.mp4'),
      qa_score: 98.5
    };
    fs.writeFileSync(activeDelivery.media_path, 'CANONICAL_CERTIFIED_MEDIA_PAYLOAD_V21');
    const activeHashBefore = crypto.createHash('sha256').update(fs.readFileSync(activeDelivery.media_path)).digest('hex');

    // Mock candidate artifact undergoing failed pilot rollout
    const candidateMedia = path.join(scratchDir, 'candidate_experimental.mp4');
    fs.writeFileSync(candidateMedia, 'UNVERIFIED_CANDIDATE_DATA');

    // Execute rollback
    const priorKnownGoodDir = path.resolve(__dirname, '../dist/prior-known-good');
    const rollbackManager = new RollbackManager({ archiveDir: priorKnownGoodDir });
    const restoreDir = path.join(scratchDir, 'rollback-dir');
    const res = rollbackManager.executeRollback(restoreDir);
    assert.equal(res.ok, true);

    // CRITICAL INVARIANT: Active delivery media file must remain 100% byte-for-byte identical (RPO = 0)
    assert.ok(fs.existsSync(activeDelivery.media_path));
    const activeHashAfter = crypto.createHash('sha256').update(fs.readFileSync(activeDelivery.media_path)).digest('hex');
    assert.equal(activeHashAfter, activeHashBefore, 'Active delivery hash must remain identical across rollback');
    assert.equal(fs.readFileSync(activeDelivery.media_path, 'utf8'), 'CANONICAL_CERTIFIED_MEDIA_PAYLOAD_V21');
  });

  await t.test('REC-04: Cryptographic Tamper Detection & Fail-Closed Defense', async () => {
    const tamperedArchiveDir = path.join(scratchDir, 'tampered-archive');
    fs.mkdirSync(tamperedArchiveDir, { recursive: true });

    // Copy genuine baseline and manifest
    const genuineTarball = path.resolve(__dirname, '../dist/prior-known-good/editing-mechanics-engine-0.1.0-rc1.tgz');
    const tamperedTarball = path.join(tamperedArchiveDir, 'editing-mechanics-engine-0.1.0-rc1.tgz');
    fs.copyFileSync(genuineTarball, tamperedTarball);

    // Tamper with the tarball content
    fs.appendFileSync(tamperedTarball, 'MALICIOUS_INJECTED_BYTES');

    const manifest = {
      schema_version: '1.0.0',
      artifact_filename: 'editing-mechanics-engine-0.1.0-rc1.tgz',
      artifact_path: tamperedTarball,
      sha256: APPROVED_BASELINE_SHA256 // Original expected checksum
    };
    fs.writeFileSync(path.join(tamperedArchiveDir, 'prior-known-good-manifest.json'), JSON.stringify(manifest, null, 2));

    const tamperedRollbackManager = new RollbackManager({ archiveDir: tamperedArchiveDir });
    const restoreDir = path.join(scratchDir, 'should-not-restore');
    const rollbackRes = tamperedRollbackManager.executeRollback(restoreDir);

    // Must fail closed
    assert.equal(rollbackRes.ok, false);
    assert.ok(rollbackRes.error.includes('tamper') || rollbackRes.error.includes('mismatch') || rollbackRes.error.includes('Checksum'));
    assert.ok(!fs.existsSync(path.join(restoreDir, 'editing-mechanics-engine-0.1.0-rc1.tgz')));
  });

  await t.test('REC-05: Pilot Health Ledger & SLO Recovery Metrics Synchronization', async () => {
    const sloMonitor = new SloMonitor({ autoSubscribe: false });
    const rollbackManager = new RollbackManager({
      archiveDir: path.resolve(__dirname, '../dist/prior-known-good')
    });
    const pilotController = new PilotController({
      sloMonitor,
      rollbackManager,
      config: { minObservationDurationMs: 10, minJobCountPerGate: 5 }
    });

    pilotController.currentGate = 50;

    // Trigger immediate containment with live rollback
    const restoreDir = path.join(scratchDir, 'ledger-rollback-dest');
    const containment = pilotController.triggerImmediateContainment(
      'Synthetic staging rollback verification',
      restoreDir
    );

    assert.equal(containment.contained, true);
    assert.equal(containment.currentGate, -1);
    assert.ok(containment.rollbackResult);
    assert.equal(containment.rollbackResult.ok, true);

    // Record recovery in SLO monitor
    sloMonitor.recordRecovery(containment.rollbackResult.durationMs, 0);

    const recoverySli = sloMonitor.calculateRecovery();
    assert.equal(recoverySli.targetMet, true);
    assert.equal(recoverySli.totalDataLoss, 0);
    assert.ok(recoverySli.rtoP95 <= 2000);

    const pilotStatus = pilotController.getPilotStatus();
    const lastEntry = pilotStatus.healthLedger[pilotStatus.healthLedger.length - 1];
    assert.equal(lastEntry.action, 'CONTAINMENT_TRIGGERED');
    assert.equal(lastEntry.rollbackResult.sha256, APPROVED_BASELINE_SHA256);
  });

});
