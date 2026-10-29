/**
 * Stage 30.2: Crash, Restart, and Durable Recovery Test Suite
 *
 * Implements Stage 30.2 verification:
 * - REC-01: Crash before atomic commit (uncommitted candidate discarded, R_k preserved)
 * - REC-02: Crash immediately after commit (R_{k+1} detected on disk, no false rollback)
 * - REC-03: Lost acknowledgement & idempotent retry (duplicate mutation prevented)
 * - REC-04: Non-atomic execution interruption (committed step 1 preserved, reconciliation flagged)
 * - REC-05: Render interruption & active delivery preservation (partial render discarded)
 * - REC-06: Post-render QA failure / interruption (promotion withheld, active delivery untouched)
 * - REC-07: Terminal state immutability against late callbacks (terminal states immutable)
 * - REC-08: Post-success artifact drift & INTEGRITY_DRIFT_ALERT (historical success retained)
 * - REC-09: Compensation failure fail-closed routing to NEEDS_RECONCILIATION
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CrashRecoveryEngine } = require('../src/orchestration/crash-recovery-engine.js');
const { CanonicalJobStatus } = require('../src/prompt-core/job-orchestrator.js');

const TMP_DIR = path.resolve('scratch/stage30-2-test');

describe('Stage 30.2: Crash, Restart, and Durable Recovery', () => {

  beforeEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('REC-01: Crash before atomic commit discards uncommitted candidate state and preserves R_k', () => {
    const engine = new CrashRecoveryEngine();

    const projectBefore = {
      project: {
        project_id: 'proj_crash_01',
        project_revision: 5,
        timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1', start_tick: 0 }] }] }
      }
    };

    // Crash occurs before atomic commit: project on disk remains at revision 5
    const projectAfter = {
      project: {
        project_id: 'proj_crash_01',
        project_revision: 5,
        timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1', start_tick: 0 }] }] }
      }
    };

    const recovery = engine.reconstructOutcome({
      projectStateBefore: projectBefore,
      projectStateAfter: projectAfter,
      isAtomic: true
    });

    assert.strictEqual(recovery.outcome, 'UNCOMMITTED_DISCARDED');
    assert.strictEqual(recovery.committed, false);
    assert.strictEqual(recovery.finalRevision, 5);
    assert.strictEqual(recovery.jobStatus, CanonicalJobStatus.FAILED);
    assert.strictEqual(recovery.deliveryAction, 'WITHHELD');
    assert.ok(recovery.evidence.rationale.includes('uncommitted candidate state discarded'));
  });

  test('REC-02: Crash immediately after atomic commit detects R_{k+1} on disk without false rollback', () => {
    const engine = new CrashRecoveryEngine();

    const projectBefore = {
      project: {
        project_id: 'proj_crash_02',
        project_revision: 5
      }
    };

    // Worker crashed after atomic rename write; project on disk is at revision 6
    const projectAfter = {
      project: {
        project_id: 'proj_crash_02',
        project_revision: 6,
        timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1', start_tick: 120000 }] }] }
      }
    };

    const recovery = engine.reconstructOutcome({
      projectStateBefore: projectBefore,
      projectStateAfter: projectAfter,
      isAtomic: true,
      acknowledged: false
    });

    assert.strictEqual(recovery.outcome, 'COMMITTED_RECOVERED');
    assert.strictEqual(recovery.committed, true);
    assert.strictEqual(recovery.finalRevision, 6);
    assert.strictEqual(recovery.jobStatus, CanonicalJobStatus.READY_TO_EXECUTE);
    assert.ok(recovery.evidence.rationale.includes('no false rollback'));
  });

  test('REC-03: Lost acknowledgement & idempotent retry prevents duplicate mutation', () => {
    const engine = new CrashRecoveryEngine();

    const projectState = {
      project: {
        project_id: 'proj_crash_03',
        project_revision: 7
      }
    };

    const committedOps = [
      {
        operationId: 'op_retime_01',
        idempotencyKey: 'idemp_key_abc123',
        result: { status: 'committed', revision: 7, clips_retimed: 1 }
      }
    ];

    // Client retries operation with same idempotency key
    const retryResult = engine.handleLostAckRetry({
      operationId: 'op_retime_01',
      idempotencyKey: 'idemp_key_abc123',
      currentProjectState: projectState,
      targetRevision: 7,
      committedOperations: committedOps
    });

    assert.strictEqual(retryResult.idempotent, true);
    assert.strictEqual(retryResult.alreadyCommitted, true);
    assert.strictEqual(retryResult.projectRevision, 7, 'Revision must not advance on replay');
    assert.strictEqual(retryResult.duplicateMutationPrevented, true);
    assert.strictEqual(retryResult.status, CanonicalJobStatus.SUCCEEDED);
  });

  test('REC-04: Non-atomic execution interruption preserves committed step 1 and flags reconciliation', () => {
    const engine = new CrashRecoveryEngine();

    const projectBefore = { project: { project_revision: 2 } };
    const projectAfter = { project: { project_revision: 3 } }; // Step 1 committed

    const committedSteps = [
      { step: 1, action: 'retime_dialogue', status: 'committed', revision: 3 }
    ];

    const recovery = engine.reconstructOutcome({
      projectStateBefore: projectBefore,
      projectStateAfter: projectAfter,
      isAtomic: false,
      committedSteps,
      totalSteps: 2
    });

    assert.strictEqual(recovery.outcome, 'NON_ATOMIC_PARTIALLY_COMMITTED');
    assert.strictEqual(recovery.committed, true);
    assert.strictEqual(recovery.partial, true);
    assert.strictEqual(recovery.finalRevision, 3);
    assert.strictEqual(recovery.committedSteps.length, 1);
    assert.strictEqual(recovery.unappliedStepsCount, 1);
    assert.strictEqual(recovery.jobStatus, CanonicalJobStatus.NEEDS_RECONCILIATION);
  });

  test('REC-05: Render interruption in isolated workdir discards partial artifact and preserves active delivery', () => {
    const engine = new CrashRecoveryEngine();

    const activeDelivery = {
      delivery_id: 'del_active_good',
      artifact_path: '/path/to/valid_delivery.mp4',
      sha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000'
    };

    // Candidate file was partially written (0 bytes or missing)
    const partialCandidatePath = path.join(TMP_DIR, 'partial_candidate.wav');
    fs.writeFileSync(partialCandidatePath, ''); // 0 bytes

    const promoResult = engine.evaluateCandidateDeliveryPromotion({
      candidateArtifactPath: partialCandidatePath,
      manifest: { package_artifact: { sha256: 'expected_sha' } },
      qaReport: { status: 'passed' },
      existingActiveDelivery: activeDelivery
    });

    assert.strictEqual(promoResult.promoted, false);
    assert.strictEqual(promoResult.decision, 'DELIVERY_WITHHELD');
    assert.strictEqual(promoResult.activeDeliveryPreserved, true);
    assert.strictEqual(promoResult.activeDelivery.delivery_id, 'del_active_good');
    assert.strictEqual(promoResult.jobStatus, CanonicalJobStatus.FAILED);
  });

  test('REC-06: Post-render QA failure withholds candidate promotion and protects active delivery', () => {
    const engine = new CrashRecoveryEngine();

    const activeDelivery = {
      delivery_id: 'del_active_good',
      artifact_path: '/path/to/valid_delivery.mp4',
      sha256: 'a1b2c3d4e5f6'
    };

    const validCandidatePath = path.join(TMP_DIR, 'candidate.wav');
    fs.writeFileSync(validCandidatePath, 'SAMPLE_PCM_AUDIO_DATA_VALID');
    const sha = CrashRecoveryEngine.computeFileSha256(validCandidatePath);

    // QA failed (e.g. true peak exceeded ceiling)
    const failedQa = {
      status: 'failed',
      candidate_sha256: sha,
      violations: ['CHK_EARSHOT_TRUE_PEAK: -0.4 dBTP > -1.0 dBTP ceiling']
    };

    const promoResult = engine.evaluateCandidateDeliveryPromotion({
      candidateArtifactPath: validCandidatePath,
      manifest: { package_artifact: { sha256: sha } },
      qaReport: failedQa,
      existingActiveDelivery: activeDelivery
    });

    assert.strictEqual(promoResult.promoted, false);
    assert.strictEqual(promoResult.decision, 'DELIVERY_WITHHELD');
    assert.strictEqual(promoResult.activeDeliveryPreserved, true);
    assert.strictEqual(promoResult.activeDelivery.delivery_id, 'del_active_good');
    assert.strictEqual(promoResult.jobStatus, CanonicalJobStatus.FAILED);
    assert.ok(promoResult.errors.some(e => e.includes('Post-render QA failed')));
  });

  test('REC-07: Terminal job states are strictly immutable against late arriving callbacks', () => {
    const engine = new CrashRecoveryEngine();

    const jobs = [
      { id: 'j1', status: CanonicalJobStatus.SUCCEEDED },
      { id: 'j2', status: CanonicalJobStatus.FAILED },
      { id: 'j3', status: CanonicalJobStatus.CANCELLED }
    ];

    for (const j of jobs) {
      const res = engine.handleLateCallback(j, { event: 'late_worker_done', error: 'late error' });
      assert.strictEqual(res.rejected, true);
      assert.strictEqual(res.reason, 'TERMINAL_STATE_IMMUTABLE');
      assert.strictEqual(res.currentStatus, j.status);
    }
  });

  test('REC-08: Post-success artifact drift emits INTEGRITY_DRIFT_ALERT while retaining historical success', () => {
    const engine = new CrashRecoveryEngine();

    const deliveryFile = path.join(TMP_DIR, 'historical_delivery.mp4');
    fs.writeFileSync(deliveryFile, 'ORIGINAL_DELIVERY_BYTES');
    const origSha = CrashRecoveryEngine.computeFileSha256(deliveryFile);

    const historicalJob = {
      id: 'job_hist_01',
      status: CanonicalJobStatus.SUCCEEDED
    };

    const activeDelivery = {
      delivery_id: 'del_hist_01',
      artifact_path: deliveryFile,
      sha256: origSha
    };

    // Case 8A: Clean audit - no drift
    const cleanAudit = engine.auditHistoricalDeliveryIntegrity(historicalJob, activeDelivery);
    assert.strictEqual(cleanAudit.driftDetected, false);
    assert.strictEqual(cleanAudit.historicalStatusPreserved, CanonicalJobStatus.SUCCEEDED);

    // Case 8B: External corruption / modification of delivery file
    fs.appendFileSync(deliveryFile, '_CORRUPTED_BYTES');
    const driftAudit = engine.auditHistoricalDeliveryIntegrity(historicalJob, activeDelivery);
    assert.strictEqual(driftAudit.driftDetected, true);
    assert.strictEqual(driftAudit.alert.alert_type, 'INTEGRITY_DRIFT_ALERT');
    assert.strictEqual(driftAudit.alert.reason, 'HISTORICAL_CHECKSUM_MISMATCH');
    assert.strictEqual(driftAudit.historicalStatusPreserved, CanonicalJobStatus.SUCCEEDED, 'Historical success must never be rewritten');

    // Case 8C: Complete file deletion
    fs.unlinkSync(deliveryFile);
    const missingAudit = engine.auditHistoricalDeliveryIntegrity(historicalJob, activeDelivery);
    assert.strictEqual(missingAudit.driftDetected, true);
    assert.strictEqual(missingAudit.alert.reason, 'HISTORICAL_ARTIFACT_MISSING');
    assert.strictEqual(missingAudit.historicalStatusPreserved, CanonicalJobStatus.SUCCEEDED);
  });

  test('REC-09: Compensation failure routes fail-closed to NEEDS_RECONCILIATION without false recovery claim', () => {
    const engine = new CrashRecoveryEngine();

    const compResult = engine.handleCompensationFailure({
      operationId: 'op_comp_01',
      compensationError: new Error('Disk write error ENOSPC during compensation inverse move_clip'),
      partiallyCompensatedState: { revision: 4, tracks_restored: 1, tracks_unrestored: 1 }
    });

    assert.strictEqual(compResult.outcome, 'COMPENSATION_FAILED_RECONCILIATION_REQUIRED');
    assert.strictEqual(compResult.status, CanonicalJobStatus.NEEDS_RECONCILIATION);
    assert.strictEqual(compResult.reconciliationRequired, true);
    assert.ok(compResult.error.includes('ENOSPC'));
  });

});
