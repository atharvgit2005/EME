/**
 * Stage 30.5: Deterministic Recovery Evidence and Replay Test Suite
 *
 * Implements Stage 30.5 verification:
 * - REV-01: Repeated evidence generation preserves prior failure records (FI-19)
 * - REV-02: Stable identity and SHA-256 digest validation
 * - REV-03: Evidence completeness schema validation
 * - REV-04: Strictly non-destructive diagnostic replay (zero mutation verified)
 * - REV-05: Cross-stage replay: Stage 30.2 Pre-commit crash recovery
 * - REV-06: Cross-stage replay: Stage 30.2 Post-commit crash recovery
 * - REV-07: Cross-stage replay: Stage 30.2 Post-promotion crash recovery
 * - REV-08: Cross-stage replay: Stage 30.4 Corrupt manifest delivery withholding
 * - REV-09: Ambiguous evidence fail-closed routing to NEEDS_RECONCILIATION
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { RecoveryEvidenceJournal } = require('../src/orchestration/recovery-evidence-journal.js');

const TMP_DIR = path.resolve('scratch/stage30-5-test');

describe('Stage 30.5: Deterministic Recovery Evidence and Replay', () => {

  beforeEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('REV-01: Repeated evidence generation preserves prior failure records (FI-19)', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const scenarioId = 'FI-19-repeated-generation';

    // Run 1: Failure evidence recorded
    const rec1 = journal.recordEvidence(scenarioId, {
      attempt: 1,
      outcome: 'FAILED',
      error: 'CRASH_BEFORE_COMMIT',
      expectedOutcome: 'UNCOMMITTED_PRESERVED'
    });
    assert.strictEqual(rec1.runId, 'run_001');
    assert.strictEqual(rec1.runNumber, 1);

    // Run 2: Corrected rerun recorded
    const rec2 = journal.recordEvidence(scenarioId, {
      attempt: 2,
      outcome: 'PASSED',
      expectedOutcome: 'UNCOMMITTED_PRESERVED'
    });
    assert.strictEqual(rec2.runId, 'run_002');
    assert.strictEqual(rec2.runNumber, 2);

    // Verify Run 1 file was NOT overwritten and still exists on disk
    const history = journal.getEvidenceHistory(scenarioId);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].run_id, 'run_001');
    assert.strictEqual(history[0].content.evidence.outcome, 'FAILED');
    assert.strictEqual(history[1].run_id, 'run_002');
    assert.strictEqual(history[1].content.evidence.outcome, 'PASSED');
  });

  test('REV-02: Stable identity and SHA-256 digest validation', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const scenarioId = 'SEC-stable-id-test';

    const rec = journal.recordEvidence(scenarioId, { test: 'payload', revision: 5 });
    assert.ok(rec.sha256);
    assert.strictEqual(typeof rec.sha256, 'string');
    assert.strictEqual(rec.sha256.length, 64);

    const history = journal.getEvidenceHistory(scenarioId);
    assert.strictEqual(history[0].sha256, rec.sha256);
  });

  test('REV-03: Evidence completeness schema validation', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const validRecord = {
      scenario_id: 'FI-01',
      run_number: 1,
      run_id: 'run_001',
      timestamp: new Date().toISOString(),
      evidence: { boundary: 'PRE_COMMIT' },
      record_sha256: 'a'.repeat(64)
    };

    assert.strictEqual(journal.validateEvidenceRecord(validRecord).valid, true);

    const invalidRecord = {
      scenario_id: 'FI-01',
      // missing run_number and run_id
      timestamp: new Date().toISOString()
    };
    assert.strictEqual(journal.validateEvidenceRecord(invalidRecord).valid, false);
  });

  test('REV-04: Strictly non-destructive diagnostic replay verifies zero mutation', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const originalProject = {
      project: {
        project_id: 'proj_nondestructive',
        project_revision: 7,
        timeline: { tracks: [] }
      }
    };
    const originalSession = {
      session_id: 'sess_nondestructive',
      active_delivery: 'del_v1_active'
    };

    const evidenceRecord = {
      scenario_id: 'FI-01',
      run_id: 'run_001',
      evidence: {
        recoveryType: 'PRE_COMMIT_CRASH',
        originalProjectState: originalProject,
        originalSessionState: originalSession,
        expectedOutcome: 'UNCOMMITTED_DISCARDED'
      }
    };

    const replayRes = journal.replayRecoveryEvidence(evidenceRecord);
    assert.strictEqual(replayRes.matchesExpected, true);
    assert.strictEqual(replayRes.nonDestructive.zeroMutationVerified, true);
    assert.strictEqual(replayRes.nonDestructive.mutatedProject, false);
    assert.strictEqual(replayRes.nonDestructive.mutatedSession, false);

    // Assert original project and session are untouched
    assert.strictEqual(originalProject.project.project_revision, 7);
    assert.strictEqual(originalSession.active_delivery, 'del_v1_active');
  });

  test('REV-05: Cross-stage replay: Stage 30.2 Pre-commit crash recovery', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const evidenceRecord = {
      scenario_id: 'REC-01',
      run_id: 'run_001',
      evidence: {
        recoveryType: 'PRE_COMMIT_CRASH',
        originalProjectState: { project: { project_revision: 3 } },
        expectedOutcome: 'UNCOMMITTED_DISCARDED'
      }
    };

    const replay = journal.replayRecoveryEvidence(evidenceRecord);
    assert.strictEqual(replay.matchesExpected, true);
    assert.strictEqual(replay.replayedDecision.outcome, 'UNCOMMITTED_DISCARDED');
    assert.strictEqual(replay.replayedDecision.activeRevision, 3);
  });

  test('REV-06: Cross-stage replay: Stage 30.2 Post-commit crash recovery', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const evidenceRecord = {
      scenario_id: 'REC-02',
      run_id: 'run_001',
      evidence: {
        recoveryType: 'POST_COMMIT_CRASH',
        originalProjectState: { project: { project_revision: 3 } },
        expectedOutcome: 'COMMITTED_RECOVERED'
      }
    };

    const replay = journal.replayRecoveryEvidence(evidenceRecord);
    assert.strictEqual(replay.matchesExpected, true);
    assert.strictEqual(replay.replayedDecision.outcome, 'COMMITTED_RECOVERED');
    assert.strictEqual(replay.replayedDecision.activeRevision, 4);
  });

  test('REV-07: Cross-stage replay: Stage 30.2 Post-promotion crash recovery', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const evidenceRecord = {
      scenario_id: 'RPC-04',
      run_id: 'run_001',
      evidence: {
        recoveryType: 'POST_PROMOTION_CRASH',
        originalSessionState: { active_delivery: 'del_v2_promoted' },
        expectedOutcome: 'PROMOTION_DURABLE_CONFIRMED'
      }
    };

    const replay = journal.replayRecoveryEvidence(evidenceRecord);
    assert.strictEqual(replay.matchesExpected, true);
    assert.strictEqual(replay.replayedDecision.outcome, 'PROMOTION_DURABLE_CONFIRMED');
    assert.strictEqual(replay.replayedDecision.falseRollback, false);
  });

  test('REV-08: Cross-stage replay: Stage 30.4 Corrupt manifest delivery withholding', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const corruptManifestPath = path.join(TMP_DIR, 'bad_manifest.json');
    fs.writeFileSync(corruptManifestPath, '{ corrupt json ...');

    const evidenceRecord = {
      scenario_id: 'AIG-04',
      run_id: 'run_001',
      evidence: {
        recoveryType: 'CORRUPT_MANIFEST_REJECTION',
        manifestPath: corruptManifestPath,
        expectedOutcome: 'DELIVERY_WITHHELD'
      }
    };

    const replay = journal.replayRecoveryEvidence(evidenceRecord);
    assert.strictEqual(replay.matchesExpected, true);
    assert.strictEqual(replay.replayedDecision.outcome, 'DELIVERY_WITHHELD');
    assert.strictEqual(replay.replayedDecision.activeDeliveryPreserved, true);
  });

  test('REV-09: Ambiguous evidence fail-closed routing to NEEDS_RECONCILIATION', () => {
    const journal = new RecoveryEvidenceJournal({ baseDir: TMP_DIR });
    const evidenceRecord = {
      scenario_id: 'AMB-01',
      run_id: 'run_001',
      evidence: {
        recoveryType: 'AMBIGUOUS_RECONCILIATION',
        expectedOutcome: 'NEEDS_RECONCILIATION'
      }
    };

    const replay = journal.replayRecoveryEvidence(evidenceRecord);
    assert.strictEqual(replay.matchesExpected, true);
    assert.strictEqual(replay.replayedDecision.outcome, 'NEEDS_RECONCILIATION');
    assert.strictEqual(replay.replayedDecision.action, 'FLAG_FOR_MANUAL_REVIEW');
  });

});
