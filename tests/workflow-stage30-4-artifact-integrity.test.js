/**
 * Stage 30.4: Artifact Integrity, Compensation, and Reconciliation Test Suite
 *
 * Implements Stage 30.4 verification:
 * - AIG-01: Missing rendered artifact detected fail-closed (FI-13)
 * - AIG-02: Truncated or empty artifact detected fail-closed (FI-13)
 * - AIG-03: Checksum mismatch between artifact and manifest rejected (FI-13)
 * - AIG-04: Corrupt or incomplete manifest schema rejected (FI-14)
 * - AIG-05: Manifest recorded size mismatch against disk truth rejected (FI-14)
 * - AIG-06: Active delivery preserved intact when candidate QA fails
 * - AIG-07: Active delivery preserved intact when candidate manifest fails
 * - AIG-08: Successful multi-gate candidate delivery promotion with atomic commit
 * - AIG-09: Post-success artifact drift emits INTEGRITY_DRIFT_ALERT & preserves historical SUCCEEDED
 * - AIG-10: Durable idempotent compensation execution prevents duplicate invocation
 * - AIG-11: Compensation failure fail-closed routing to NEEDS_RECONCILIATION
 * - AIG-12: Non-atomic interruption preserves committed step 1 and flags reconciliation (FI-15)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ArtifactIntegrityGuardian } = require('../src/orchestration/artifact-integrity-guardian.js');
const { CanonicalJobStatus } = require('../src/prompt-core/job-orchestrator.js');

const TMP_DIR = path.resolve('scratch/stage30-4-test');
const JOURNAL_DIR = path.join(TMP_DIR, 'comp-journal');

describe('Stage 30.4: Artifact Integrity, Compensation, and Reconciliation', () => {

  beforeEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('AIG-01: Missing rendered artifact detected fail-closed (FI-13)', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const missingPath = path.join(TMP_DIR, 'missing_render.wav');

    const result = guardian.verifyArtifact(missingPath);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'ARTIFACT_MISSING');
    assert.match(result.message, /does not exist/i);
  });

  test('AIG-02: Truncated or empty artifact detected fail-closed (FI-13)', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const emptyPath = path.join(TMP_DIR, 'empty_render.wav');
    fs.writeFileSync(emptyPath, Buffer.alloc(0));

    const result = guardian.verifyArtifact(emptyPath, null, 100);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'ARTIFACT_EMPTY_OR_TRUNCATED');
    assert.strictEqual(result.actualSize, 0);
  });

  test('AIG-03: Checksum mismatch between artifact and manifest rejected (FI-13)', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const artPath = path.join(TMP_DIR, 'audio_render.wav');
    fs.writeFileSync(artPath, 'REAL_AUDIO_RENDER_CONTENT');

    const expectedSha = crypto.createHash('sha256').update('DIFFERENT_CONTENT').digest('hex');
    const result = guardian.verifyArtifact(artPath, expectedSha);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'CHECKSUM_MISMATCH');
    assert.notStrictEqual(result.actualSha, expectedSha);
  });

  test('AIG-04: Corrupt or incomplete manifest schema rejected (FI-14)', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });

    // Corrupt JSON
    const corruptManifestPath = path.join(TMP_DIR, 'corrupt_manifest.json');
    fs.writeFileSync(corruptManifestPath, '{ invalid json ... truncated');
    const res1 = guardian.verifyManifest(corruptManifestPath);
    assert.strictEqual(res1.valid, false);
    assert.strictEqual(res1.reason, 'CORRUPT_MANIFEST_JSON');

    // Incomplete Schema (missing delivery_id)
    const incompletePath = path.join(TMP_DIR, 'incomplete_manifest.json');
    fs.writeFileSync(incompletePath, JSON.stringify({
      project_id: 'p1',
      project_revision: 2,
      artifact_path: 'a.wav',
      artifact_sha256: 'abc',
      artifact_size_bytes: 100,
      qa_summary: { pass: true }
    }));
    const res2 = guardian.verifyManifest(incompletePath);
    assert.strictEqual(res2.valid, false);
    assert.strictEqual(res2.reason, 'INCOMPLETE_MANIFEST_SCHEMA');
    assert.strictEqual(res2.missingField, 'delivery_id');
  });

  test('AIG-05: Manifest recorded size mismatch against disk truth rejected (FI-14)', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const artPath = path.join(TMP_DIR, 'artifact_size_test.wav');
    fs.writeFileSync(artPath, 'TWENTY_CHAR_CONTENT!'); // 20 bytes
    const sha = crypto.createHash('sha256').update('TWENTY_CHAR_CONTENT!').digest('hex');

    const manifestPath = path.join(TMP_DIR, 'manifest_wrong_size.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      delivery_id: 'del_size_mismatch',
      project_id: 'proj_1',
      project_revision: 3,
      artifact_path: 'artifact_size_test.wav',
      artifact_sha256: sha,
      artifact_size_bytes: 9999, // Inconsistent size recorded
      qa_summary: { pass: true }
    }));

    const res = guardian.verifyManifest(manifestPath, TMP_DIR);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.reason, 'MANIFEST_SIZE_MISMATCH');
    assert.strictEqual(res.manifestSize, 9999);
    assert.strictEqual(res.actualSize, 20);
  });

  test('AIG-06: Active delivery preserved intact when candidate QA fails', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const session = {
      session_id: 'sess_qa_fail',
      active_delivery: 'del_v1_active_baseline'
    };

    const candidateDelivery = { delivery_id: 'del_v2_rejected' };
    const qaReport = { status: 'FAILED', decision: 'FAIL', score: 45 };

    const promoRes = guardian.promoteDeliveryGated({
      session,
      candidateDelivery,
      manifestPath: path.join(TMP_DIR, 'manifest.json'),
      qaReport
    });

    assert.strictEqual(promoRes.promoted, false);
    assert.strictEqual(promoRes.reason, 'QA_VERIFICATION_FAILED');
    assert.strictEqual(promoRes.action, 'DELIVERY_WITHHELD');
    assert.strictEqual(session.active_delivery, 'del_v1_active_baseline'); // Untouched
  });

  test('AIG-07: Active delivery preserved intact when candidate manifest verification fails', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const session = {
      session_id: 'sess_manifest_fail',
      active_delivery: 'del_v1_active_baseline'
    };

    const candidateDelivery = { delivery_id: 'del_v2_bad_manifest' };
    const qaReport = { status: 'PASSED', decision: 'PASS' };

    // Point to non-existent manifest
    const promoRes = guardian.promoteDeliveryGated({
      session,
      candidateDelivery,
      manifestPath: path.join(TMP_DIR, 'nonexistent_manifest.json'),
      qaReport
    });

    assert.strictEqual(promoRes.promoted, false);
    assert.strictEqual(promoRes.action, 'DELIVERY_WITHHELD');
    assert.strictEqual(session.active_delivery, 'del_v1_active_baseline'); // Untouched
  });

  test('AIG-08: Successful multi-gate candidate delivery promotion with atomic commit', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const sessionPath = path.join(TMP_DIR, 'session.json');
    const session = {
      session_id: 'sess_promo_success',
      active_delivery: 'del_v1_old'
    };
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

    // Create valid artifact
    const artPath = path.join(TMP_DIR, 'candidate_render.wav');
    const content = 'VALID_RENDERED_WAV_BINARY_DATA';
    fs.writeFileSync(artPath, content);
    const sha = crypto.createHash('sha256').update(content).digest('hex');

    // Create valid manifest
    const manifestPath = path.join(TMP_DIR, 'manifest_del_v2.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      delivery_id: 'del_v2_promoted',
      project_id: 'proj_promo',
      project_revision: 4,
      artifact_path: 'candidate_render.wav',
      artifact_sha256: sha,
      artifact_size_bytes: Buffer.byteLength(content),
      qa_summary: { pass: true, true_peak: -6.0 }
    }));

    const candidateDelivery = { delivery_id: 'del_v2_promoted' };
    const qaReport = { status: 'PASSED', decision: 'PASS' };

    const promoRes = guardian.promoteDeliveryGated({
      session,
      candidateDelivery,
      manifestPath,
      qaReport,
      sessionFilePath: sessionPath
    });

    assert.strictEqual(promoRes.promoted, true);
    assert.strictEqual(promoRes.activeDelivery, 'del_v2_promoted');
    assert.strictEqual(session.active_delivery, 'del_v2_promoted');

    // Verify disk truth of session file
    const diskSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    assert.strictEqual(diskSession.active_delivery, 'del_v2_promoted');
    assert.strictEqual(diskSession.deliveries.length, 1);
  });

  test('AIG-09: Post-success artifact drift emits INTEGRITY_DRIFT_ALERT & preserves historical SUCCEEDED', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const artPath = path.join(TMP_DIR, 'historical_render.wav');
    fs.writeFileSync(artPath, 'ORIGINAL_CONTENT');
    const origSha = crypto.createHash('sha256').update('ORIGINAL_CONTENT').digest('hex');

    const historicalDelivery = {
      delivery_id: 'del_v1_historical',
      artifact_path: artPath,
      artifact_sha256: origSha,
      status: CanonicalJobStatus.SUCCEEDED
    };

    // Before tampering: verified clean
    const cleanAudit = guardian.auditDeliveryPostSuccessDrift(historicalDelivery);
    assert.strictEqual(cleanAudit.integrityStatus, 'VERIFIED_CLEAN');
    assert.strictEqual(cleanAudit.driftDetected, false);

    // Tamper with file post-success (simulate external modification)
    fs.writeFileSync(artPath, 'TAMPERED_MODIFIED_CONTENT');

    // Post-tampering audit
    const driftAudit = guardian.auditDeliveryPostSuccessDrift(historicalDelivery);
    assert.strictEqual(driftAudit.integrityStatus, 'INTEGRITY_DRIFT_ALERT');
    assert.strictEqual(driftAudit.driftDetected, true);
    assert.strictEqual(driftAudit.reason, 'CHECKSUM_MISMATCH');
    assert.strictEqual(driftAudit.historicalStatus, CanonicalJobStatus.SUCCEEDED);
    assert.strictEqual(driftAudit.historicalStatusPreserved, true);
    assert.strictEqual(driftAudit.reconciliationAction, 'NEEDS_RECONCILIATION');
  });

  test('AIG-10: Durable idempotent compensation execution prevents duplicate invocation', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const compKey = 'comp_clean_render_scratch_42';

    let invocationCount = 0;
    const compensationFn = () => {
      invocationCount++;
      return { cleaned: ['scratch_42.tmp'], count: invocationCount };
    };

    // First invocation
    const res1 = guardian.executeCompensation(compKey, { jobId: 'job_42' }, compensationFn);
    assert.strictEqual(res1.executed, true);
    assert.strictEqual(res1.status, 'COMMITTED');
    assert.strictEqual(invocationCount, 1);

    // Duplicate invocation with same compensation key
    const res2 = guardian.executeCompensation(compKey, { jobId: 'job_42' }, compensationFn);
    assert.strictEqual(res2.executed, false);
    assert.strictEqual(res2.alreadyCommitted, true);
    assert.strictEqual(invocationCount, 1); // Not executed a second time
  });

  test('AIG-11: Compensation failure fail-closed routing to NEEDS_RECONCILIATION', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });
    const compKey = 'comp_exploding_compensation';

    const failingCompensationFn = () => {
      throw new Error('Disk IO error during compensation cleanup');
    };

    const res = guardian.executeCompensation(compKey, { jobId: 'job_boom' }, failingCompensationFn);
    assert.strictEqual(res.executed, false);
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(res.disposition, 'NEEDS_RECONCILIATION');
    assert.match(res.error, /Disk IO error/i);
  });

  test('AIG-12: Non-atomic interruption preserves committed step 1 and flags reconciliation (FI-15)', () => {
    const guardian = new ArtifactIntegrityGuardian({ compensationJournalDir: JOURNAL_DIR });

    const planSteps = [
      { stepId: 'step_1', op: 'split_clip' },
      { stepId: 'step_2', op: 'move_clip' }
    ];

    // Interrupted execution: step 1 committed, step 2 never completed
    const executedStepResults = [
      { stepId: 'step_1', committed: true, revision: 2 }
    ];

    const recon = guardian.reconcileNonAtomicInterruption(planSteps, executedStepResults);
    assert.strictEqual(recon.status, 'PARTIAL_EXECUTION_INTERRUPTED');
    assert.strictEqual(recon.reconciliationRequired, true);
    assert.strictEqual(recon.disposition, 'NEEDS_RECONCILIATION');
    assert.deepStrictEqual(recon.committedSteps, [{ stepId: 'step_1', revision: 2 }]);
    assert.deepStrictEqual(recon.uncommittedSteps, ['step_2']);
    assert.match(recon.message, /Committed effects preserved on disk/i);
  });

});
