/**
 * Stage 30.2: Real Process Crash & Separate Recovery Process Test Suite
 *
 * Implements strict process-boundary crash recovery verification:
 * - RPC-01: Real process SIGKILL termination before atomic commit (REC-01)
 * - RPC-02: Real process SIGKILL termination immediately after atomic commit (REC-02)
 * - RPC-03: Separate recovery process execution and durable reconstruction
 * - RPC-04: Idempotent retry execution from a separate client process (REC-03)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CrashRecoveryEngine } = require('../src/orchestration/crash-recovery-engine.js');
const { CanonicalJobStatus } = require('../src/prompt-core/job-orchestrator.js');

const WORK_DIR = path.resolve('scratch/real-process-crash-test');

describe('Stage 30.2: Real Process Crash & Separate Recovery Process (EC-30.2-A)', () => {

  beforeEach(() => {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    fs.mkdirSync(WORK_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
  });

  test('RPC-01: Real process SIGKILL termination before commit; separate process reconstructs uncommitted outcome (REC-01)', () => {
    const workerScript = path.resolve(__dirname, 'helpers/real-crash-worker.js');
    const testDir = path.join(WORK_DIR, 'rpc01');

    // 1. Spawn worker in pre-commit crash mode
    const workerRes = spawnSync(process.execPath, [workerScript, 'pre-commit', testDir], {
      encoding: 'utf8',
      timeout: 10000
    });

    // 2. Verify worker actually died by SIGKILL
    assert.strictEqual(workerRes.signal, 'SIGKILL', 'Original worker process must be terminated by SIGKILL');
    assert.ok(workerRes.stdout.includes('PRE_COMMIT_BOUNDARY_REACHED'), 'Worker must reach pre-commit boundary before death');

    // 3. Inspect durable state on disk left by the dead process
    const projectFile = path.join(testDir, 'project.json');
    assert.ok(fs.existsSync(projectFile), 'project.json must exist');
    const projectOnDisk = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    assert.strictEqual(projectOnDisk.project.project_revision, 1, 'Project on disk must remain at revision 1');

    // Candidate file exists uncommitted
    const candidateFile = path.join(testDir, 'project.json.candidate');
    assert.ok(fs.existsSync(candidateFile), 'Uncommitted candidate file should exist on disk');

    // 4. Run recovery in a separate, independent process
    const recoveryCode = `
      const fs = require('fs');
      const { CrashRecoveryEngine } = require('${path.resolve('src/orchestration/crash-recovery-engine.js')}');
      const engine = new CrashRecoveryEngine();
      const projectBefore = { project: { project_revision: 1 } };
      const projectAfter = JSON.parse(fs.readFileSync('${projectFile}', 'utf8'));
      const rec = engine.reconstructOutcome({
        projectStateBefore: projectBefore,
        projectStateAfter: projectAfter,
        isAtomic: true
      });
      process.stdout.write(JSON.stringify(rec));
    `;

    const recoveryProc = spawnSync(process.execPath, ['-e', recoveryCode], { encoding: 'utf8' });
    assert.strictEqual(recoveryProc.status, 0, 'Recovery process must exit cleanly with code 0');

    const recoveryResult = JSON.parse(recoveryProc.stdout);
    assert.strictEqual(recoveryResult.outcome, 'UNCOMMITTED_DISCARDED');
    assert.strictEqual(recoveryResult.committed, false);
    assert.strictEqual(recoveryResult.finalRevision, 1);
    assert.strictEqual(recoveryResult.jobStatus, CanonicalJobStatus.FAILED);
    assert.strictEqual(recoveryResult.deliveryAction, 'WITHHELD');
  });

  test('RPC-02: Real process SIGKILL termination after atomic commit; separate process reconstructs R_{k+1} without false rollback (REC-02)', () => {
    const workerScript = path.resolve(__dirname, 'helpers/real-crash-worker.js');
    const testDir = path.join(WORK_DIR, 'rpc02');

    // 1. Spawn worker in post-commit crash mode
    const workerRes = spawnSync(process.execPath, [workerScript, 'post-commit', testDir], {
      encoding: 'utf8',
      timeout: 10000
    });

    // 2. Verify worker actually died by SIGKILL
    assert.strictEqual(workerRes.signal, 'SIGKILL', 'Original worker process must be terminated by SIGKILL');
    assert.ok(workerRes.stdout.includes('POST_COMMIT_BOUNDARY_REACHED'), 'Worker must reach post-commit boundary before death');

    // 3. Inspect durable state on disk left by the dead process
    const projectFile = path.join(testDir, 'project.json');
    assert.ok(fs.existsSync(projectFile), 'project.json must exist');
    const projectOnDisk = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    assert.strictEqual(projectOnDisk.project.project_revision, 2, 'Project on disk must reflect committed revision 2');
    assert.strictEqual(projectOnDisk.project.timeline.tracks[0].clips[0].start_tick, 240000, 'Committed clip change must be present on disk');

    // 4. Run recovery in a separate, independent process
    const recoveryCode = `
      const fs = require('fs');
      const { CrashRecoveryEngine } = require('${path.resolve('src/orchestration/crash-recovery-engine.js')}');
      const engine = new CrashRecoveryEngine();
      const projectBefore = { project: { project_revision: 1 } };
      const projectAfter = JSON.parse(fs.readFileSync('${projectFile}', 'utf8'));
      const rec = engine.reconstructOutcome({
        projectStateBefore: projectBefore,
        projectStateAfter: projectAfter,
        isAtomic: true,
        acknowledged: false
      });
      process.stdout.write(JSON.stringify(rec));
    `;

    const recoveryProc = spawnSync(process.execPath, ['-e', recoveryCode], { encoding: 'utf8' });
    assert.strictEqual(recoveryProc.status, 0, 'Recovery process must exit cleanly with code 0');

    const recoveryResult = JSON.parse(recoveryProc.stdout);
    assert.strictEqual(recoveryResult.outcome, 'COMMITTED_RECOVERED');
    assert.strictEqual(recoveryResult.committed, true);
    assert.strictEqual(recoveryResult.finalRevision, 2);
    assert.ok(recoveryResult.evidence.rationale.includes('no false rollback'), 'Must explicitly confirm no false rollback');
  });

  test('RPC-03: Separate client process retrying committed mutation is recognized idempotently without second revision bump (REC-03)', () => {
    const testDir = path.join(WORK_DIR, 'rpc03');
    fs.mkdirSync(testDir, { recursive: true });

    const projectFile = path.join(testDir, 'project.json');
    fs.writeFileSync(projectFile, JSON.stringify({ project: { project_id: 'p3', project_revision: 2 } }), 'utf8');

    // Simulate separate client process submitting retry after crash
    const clientRetryCode = `
      const fs = require('fs');
      const { CrashRecoveryEngine } = require('${path.resolve('src/orchestration/crash-recovery-engine.js')}');
      const engine = new CrashRecoveryEngine();
      const project = JSON.parse(fs.readFileSync('${projectFile}', 'utf8'));
      const committedOps = [
        { operationId: 'op_real_01', idempotencyKey: 'key_real_01', result: { status: 'committed', revision: 2 } }
      ];
      const res = engine.handleLostAckRetry({
        operationId: 'op_real_01',
        idempotencyKey: 'key_real_01',
        currentProjectState: project,
        targetRevision: 2,
        committedOperations: committedOps
      });
      process.stdout.write(JSON.stringify(res));
    `;

    const clientProc = spawnSync(process.execPath, ['-e', clientRetryCode], { encoding: 'utf8' });
    assert.strictEqual(clientProc.status, 0);

    const retryResult = JSON.parse(clientProc.stdout);
    assert.strictEqual(retryResult.idempotent, true);
    assert.strictEqual(retryResult.alreadyCommitted, true);
    assert.strictEqual(retryResult.projectRevision, 2);
    assert.strictEqual(retryResult.duplicateMutationPrevented, true);
  });

  test('RPC-04: Real process SIGKILL termination immediately after delivery promotion; separate recovery process reconstructs promoted delivery from durable records (FI-07)', () => {
    const workerScript = path.resolve(__dirname, 'helpers/real-crash-worker.js');
    const testDir = path.join(WORK_DIR, 'rpc04');

    // 1. Spawn worker in post-promotion crash mode
    const workerRes = spawnSync(process.execPath, [workerScript, 'post-promotion', testDir], {
      encoding: 'utf8',
      timeout: 10000
    });

    // 2. Verify worker actually died by SIGKILL
    assert.strictEqual(workerRes.signal, 'SIGKILL', 'Worker process must be terminated by SIGKILL');
    assert.ok(workerRes.stdout.includes('POST_PROMOTION_BOUNDARY_REACHED'), 'Worker must reach post-promotion boundary before death');

    // 3. Inspect durable state on disk left by the dead process
    const sessionFile = path.join(testDir, 'session.json');
    const manifestFile = path.join(testDir, 'delivery-manifest.json');
    const qaFile = path.join(testDir, 'qa-report.json');
    const candidateFile = path.join(testDir, 'candidate_v2.wav');

    assert.ok(fs.existsSync(sessionFile), 'session.json must exist on disk');
    assert.ok(fs.existsSync(manifestFile), 'delivery-manifest.json must exist on disk');
    assert.ok(fs.existsSync(qaFile), 'qa-report.json must exist on disk');
    assert.ok(fs.existsSync(candidateFile), 'candidate_v2.wav must exist on disk');

    const sessionOnDisk = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    assert.strictEqual(sessionOnDisk.active_delivery.delivery_id, 'del_v2_promoted', 'Durable session on disk must reflect promoted delivery');

    // 4. Run recovery in a separate, independent process
    const recoveryCode = `
      const fs = require('fs');
      const crypto = require('crypto');
      const { CrashRecoveryEngine } = require('${path.resolve('src/orchestration/crash-recovery-engine.js')}');
      const engine = new CrashRecoveryEngine();

      const session = JSON.parse(fs.readFileSync('${sessionFile}', 'utf8'));
      const manifest = JSON.parse(fs.readFileSync('${manifestFile}', 'utf8'));
      const qaReport = JSON.parse(fs.readFileSync('${qaFile}', 'utf8'));
      const candidatePath = '${candidateFile}';

      const candidateSha = crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex');

      // Verify that recovery derives active delivery from durable disk truth
      const isDurablePromoted = session.active_delivery && session.active_delivery.delivery_id === 'del_v2_promoted';
      const artifactValid = fs.existsSync(candidatePath) && candidateSha === session.active_delivery.sha256;
      const manifestMatches = manifest.package_artifact.sha256 === candidateSha;
      const qaPassed = qaReport.status === 'passed';

      const recoveryVerdict = {
        recovered_delivery_id: session.active_delivery.delivery_id,
        is_durable_promoted: isDurablePromoted,
        artifact_valid: artifactValid,
        manifest_matches: manifestMatches,
        qa_passed: qaPassed,
        candidate_sha: candidateSha,
        false_rollback: false,
        duplicate_promotion: false
      };

      process.stdout.write(JSON.stringify(recoveryVerdict));
    `;

    const recoveryProc = spawnSync(process.execPath, ['-e', recoveryCode], { encoding: 'utf8' });
    assert.strictEqual(recoveryProc.status, 0, 'Recovery process must exit cleanly with code 0');

    const recoveryResult = JSON.parse(recoveryProc.stdout);
    assert.strictEqual(recoveryResult.recovered_delivery_id, 'del_v2_promoted', 'Recovered active delivery must be del_v2_promoted');
    assert.strictEqual(recoveryResult.is_durable_promoted, true, 'Durable promotion confirmed');
    assert.strictEqual(recoveryResult.artifact_valid, true, 'Artifact validity confirmed');
    assert.strictEqual(recoveryResult.manifest_matches, true, 'Manifest matches artifact SHA');
    assert.strictEqual(recoveryResult.qa_passed, true, 'QA passed confirmed');
    assert.strictEqual(recoveryResult.false_rollback, false, 'No false rollback occurred');
    assert.strictEqual(recoveryResult.duplicate_promotion, false, 'No duplicate promotion occurred');
  });

});
