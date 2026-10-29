/**
 * Editing Mechanics Engine (EME) - Phase 19 (RT-01) Stage 19.1 Test Suite
 * End-to-End Orchestration Integration, Job Lifecycle, Concurrency & Lineage Contract
 *
 * Verifies all 18 requirements from Section 8 of ChatGPT Architectural Lead Directive:
 * 1. Valid request acceptance and durable job identity.
 * 2. Malformed brief rejected before project mutation.
 * 3. Unresolved targets / missing assets produce blocking result.
 * 4. Contradictory constraints require clarification (AWAITING_APPROVAL, awaitingReason: 'clarification').
 * 5. Clarification triggers replanning.
 * 6. Approval of unchanged plan verifies plan hash and base revision.
 * 7. Stale project snapshots rejected before execution (409 STALE_REVISION).
 * 8. Plan compilation and dry-run leave canonical state and active delivery unchanged.
 * 9. Invalid state transitions rejected.
 * 10. Terminal job states resist late callbacks.
 * 11. Legacy COMMITTED and COMPLETED map to SUCCEEDED.
 * 12. Duplicate requests resolve to same job for identical idempotency key and payload.
 * 13. Conflicting reuse of idempotency key fails closed (409 IDEMPOTENCY_CONFLICT).
 * 14. Manual timeline edit lineage and automated plan base revision reconciled.
 * 15. Cancellation before execution produces zero mutation.
 * 16. Atomic (atomic: true) rolls back staged candidate on failure without altering project.
 * 17. Non-atomic (atomic: false) reports partial failure with exact committed step and revision.
 * 18. Status polling via GET /api/jobs/:jobId, approval via POST /api/jobs/:jobId/approve, cancel via POST /api/jobs/:jobId/cancel.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  CanonicalJobStatus,
  StatusNormalizationMap,
  CanonicalJobTransitions,
  OrchestrationJobStatus,
  OrchestrationJobManager,
  EndToEndOrchestrator,
  RevisionSessionManager,
  OperationPlanCompiler,
  RenderOrchestrator
} = require('../src/prompt-core/index.js');
const { EditorBackend } = require('../src/ui/server.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/test-workflow-stage19-1');

// Helper to ensure media directory and synthetic test media
function setupTestEnvironment() {
  fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_OUT_DIR, 'jobs'), { recursive: true });

  const cleanMp4Path = path.join(TEST_OUT_DIR, 'clean-12s.mp4');
  const rootClean = path.join('artifacts/pf08-test-deliverables', 'clean-12s.mp4');
  if (fs.existsSync(cleanMp4Path) && fs.statSync(cleanMp4Path).size < 100000) {
    fs.unlinkSync(cleanMp4Path);
  }
  if (!fs.existsSync(cleanMp4Path)) {
    if (fs.existsSync(rootClean)) {
      fs.copyFileSync(rootClean, cleanMp4Path);
    } else {
      spawnSync('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=12',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=12:sample_rate=48000',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        cleanMp4Path
      ], { stdio: 'ignore' });
    }
  }
  return cleanMp4Path;
}

// Helper to build executed baseline project
function createBaseExecutedProject() {
  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  return OperationPlanCompiler.executePlan(baseProject, basePlan).project;
}

// Helper to build initialized session
function createTestSession(outDir) {
  const mediaPath = setupTestEnvironment();
  const baseProject = createBaseExecutedProject();
  const fileSha = RenderOrchestrator.computeFileSha256(mediaPath);

  return {
    schema_version: '1.0.0',
    session_id: `sess-stage19-1-${Date.now()}`,
    state: 'ready',
    request: {
      original_prompt: 'Create 12-second vertical travel reel',
      brief_id: 'brief-pf03-scenario1'
    },
    hard_constraints: [
      { constraint_id: 'C-DUR-1440K', description: 'Duration 1440000 ticks (12.0s)' },
      { constraint_id: 'C-ORD-PRIMARY', description: 'Clip order preserved' },
      { constraint_id: 'C-SND-TRACK', description: 'Soundtrack preserved' }
    ],
    concurrency: {
      version: 1,
      last_modified: new Date().toISOString()
    },
    active_delivery: {
      revision_id: 'rev-0',
      manifest_id: 'mf-initial-001',
      media_path: mediaPath,
      sha256: fileSha,
      published_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Create 12-second vertical travel reel',
        status: 'committed',
        timestamp: new Date().toISOString(),
        _project: baseProject
      }
    ],
    recovery: {
      status: 'clean',
      pending_transaction_id: null,
      last_attempted_revision_id: null,
      checkpoint_path: null
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Valid request acceptance and durable job identity
// ---------------------------------------------------------------------------
test('RT01-S1.1: Valid request acceptance and durable job identity', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-1');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);

  const job = jm.createJob({
    jobId: 'job_test_001',
    idempotencyKey: 'idemp-001',
    request: { prompt: 'Speed up primary sequence by 10%', session_id: 'sess-001' }
  });

  assert.strictEqual(job.job_id, 'job_test_001');
  assert.strictEqual(job.status, CanonicalJobStatus.ACCEPTED);
  assert.strictEqual(job.idempotency_key, 'idemp-001');
  assert.strictEqual(job.state_history.length, 1);
  assert.strictEqual(job.state_history[0].to_status, CanonicalJobStatus.ACCEPTED);

  // Verify persistence on disk
  const persistedPath = path.join(jobsDir, 'job_test_001.json');
  assert.ok(fs.existsSync(persistedPath), 'Job file must exist on disk');
  const loaded = jm.loadJob('job_test_001');
  assert.strictEqual(loaded.job_id, 'job_test_001');
  assert.strictEqual(loaded.status, CanonicalJobStatus.ACCEPTED);
});

// ---------------------------------------------------------------------------
// 2. Malformed brief rejected before project mutation
// ---------------------------------------------------------------------------
test('RT01-S1.2: Malformed brief rejected before project mutation', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const initialHistoryLen = session.history.length;
  const initialRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: '   ', // Malformed empty prompt
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(session.history.length, initialHistoryLen, 'Session history must remain unmodified');
  assert.strictEqual(session.history[0]._project.revision, initialRev, 'Project revision must remain unmodified');
});

// ---------------------------------------------------------------------------
// 3. Unresolved targets / missing assets produce blocking result
// ---------------------------------------------------------------------------
test('RT01-S1.3: Unresolved targets / missing assets produce blocking result', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  // Wipe active delivery to force initial brief compilation
  session.active_delivery = null;
  const initialRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Trim non_existent_clip_xyz by 2 seconds',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
  assert.ok(result.error.includes('failed') || result.error.includes('blocked'));
  assert.strictEqual(session.history[0]._project.revision, initialRev, 'Project must remain unmodified on blocking error');
});

// ---------------------------------------------------------------------------
// 4. Contradictory constraints require clarification (AWAITING_APPROVAL, awaitingReason: 'clarification')
// ---------------------------------------------------------------------------
test('RT01-S1.4: Contradictory constraints require clarification (AWAITING_APPROVAL, awaitingReason: "clarification")', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  session.active_delivery = null;

  // Contradictory prompt: requested color modification with explicit constraint to preserve grade
  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Make warmer by changing color grade. Preserve existing color grade unchanged.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.held, true);
  assert.strictEqual(result.needsClarification, true);
  assert.strictEqual(result.job.status, CanonicalJobStatus.AWAITING_APPROVAL);
  assert.strictEqual(result.job.awaiting_reason, 'clarification');
});

// ---------------------------------------------------------------------------
// 5. Clarification triggers replanning
// ---------------------------------------------------------------------------
test('RT01-S1.5: Clarification triggers replanning', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-clarify');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);

  const job = jm.createJob({
    jobId: 'job_clarify_001',
    request: { prompt: 'Conflicting prompt' }
  });

  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.AWAITING_APPROVAL, {
    reason: 'Conflicting requirements',
    awaitingReason: 'clarification'
  });

  const clarifiedJob = jm.submitApproval(job.job_id, {
    action: 'clarify',
    clarification: 'User resolved: adjust white balance only',
    reason: 'Clarification received from user'
  });

  assert.strictEqual(clarifiedJob.status, CanonicalJobStatus.PLANNING);
  assert.strictEqual(clarifiedJob.request.clarification, 'User resolved: adjust white balance only');
});

// ---------------------------------------------------------------------------
// 6. Approval of unchanged plan verifies plan hash and base revision
// ---------------------------------------------------------------------------
test('RT01-S1.6: Approval of unchanged plan verifies plan hash and base revision', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-approval');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);

  const job = jm.createJob({
    jobId: 'job_appr_001',
    request: { prompt: 'Trim clip' }
  });

  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.AWAITING_APPROVAL, {
    reason: 'Review plan',
    awaitingReason: 'approval',
    artifacts: {
      plan_hash: 'hash_abc123',
      plan: { plan_id: 'plan_001', base_revision: 5 }
    }
  });

  // Mismatch in plan hash throws
  assert.throws(() => {
    jm.submitApproval(job.job_id, {
      action: 'approve',
      expectedPlanHash: 'hash_different'
    });
  }, /Plan hash mismatch/);

  // Mismatch in base revision throws
  assert.throws(() => {
    jm.submitApproval(job.job_id, {
      action: 'approve',
      expectedPlanHash: 'hash_abc123',
      expectedBaseRevision: 99
    });
  }, /Base revision mismatch/);

  // Matching plan hash and base revision proceeds to READY_TO_EXECUTE
  const approvedJob = jm.submitApproval(job.job_id, {
    action: 'approve',
    expectedPlanHash: 'hash_abc123',
    expectedBaseRevision: 5,
    reason: 'Plan verified by supervisor'
  });

  assert.strictEqual(approvedJob.status, CanonicalJobStatus.READY_TO_EXECUTE);
});

// ---------------------------------------------------------------------------
// 7. Stale project snapshots rejected before execution (409 STALE_REVISION)
// ---------------------------------------------------------------------------
test('RT01-S1.7: Stale project snapshots rejected before execution (409 STALE_REVISION)', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const currentRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      expectedBaseRevision: currentRev + 10 // Intentionally stale
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'STALE_REVISION');
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
});

// ---------------------------------------------------------------------------
// 8. Plan compilation and dry-run leave canonical state and active delivery unchanged
// ---------------------------------------------------------------------------
test('RT01-S1.8: Plan compilation and dry-run leave canonical state and active delivery unchanged', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const activeDeliveryBefore = structuredClone(session.active_delivery);
  const revBefore = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      requireApproval: true // Dry run / pause at approval gate
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.held, true);
  assert.strictEqual(result.awaitingApproval, true);
  assert.strictEqual(result.job.status, CanonicalJobStatus.AWAITING_APPROVAL);
  assert.deepStrictEqual(session.active_delivery, activeDeliveryBefore, 'Active delivery must remain unchanged');
  assert.strictEqual(session.history[0]._project.revision, revBefore, 'Project revision must remain unchanged');
});

// ---------------------------------------------------------------------------
// 9. Invalid state transitions rejected
// ---------------------------------------------------------------------------
test('RT01-S1.9: Invalid state transitions rejected', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-transitions');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);

  const job = jm.createJob({ jobId: 'job_trans_001' });
  assert.strictEqual(job.status, CanonicalJobStatus.ACCEPTED);

  // Direct transition from ACCEPTED to PUBLISHING is forbidden
  assert.throws(() => {
    jm.transition(job.job_id, CanonicalJobStatus.PUBLISHING);
  }, /Invalid state transition/);

  // Direct transition from ACCEPTED to SUCCEEDED is forbidden
  assert.throws(() => {
    jm.transition(job.job_id, CanonicalJobStatus.SUCCEEDED);
  }, /Invalid state transition/);
});

// ---------------------------------------------------------------------------
// 10. Terminal job states resist late callbacks
// ---------------------------------------------------------------------------
test('RT01-S1.10: Terminal job states resist late callbacks', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-terminal');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);

  // SUCCEEDED job
  const jobS = jm.createJob({ jobId: 'job_term_succeeded' });
  jm.transition(jobS.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(jobS.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(jobS.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(jobS.job_id, CanonicalJobStatus.RENDERING);
  jm.transition(jobS.job_id, CanonicalJobStatus.VERIFYING);
  jm.transition(jobS.job_id, CanonicalJobStatus.PUBLISHING);
  const terminalJob = jm.transition(jobS.job_id, CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(terminalJob.status, CanonicalJobStatus.SUCCEEDED);

  const historyLengthBefore = terminalJob.state_history.length;

  // Late callback attempting to set FAILED or EXECUTING
  const lateAttempt = jm.transition(jobS.job_id, CanonicalJobStatus.FAILED, { error: 'Late error' });
  assert.strictEqual(lateAttempt.status, CanonicalJobStatus.SUCCEEDED, 'Terminal status must remain SUCCEEDED');
  assert.strictEqual(lateAttempt.state_history.length, historyLengthBefore, 'State history must not append late callbacks');

  // CANCELLED job
  const jobC = jm.createJob({ jobId: 'job_term_cancelled' });
  jm.cancelJob(jobC.job_id, 'User cancel');
  const cancelledJob = jm.loadJob(jobC.job_id);
  assert.strictEqual(cancelledJob.status, CanonicalJobStatus.CANCELLED);

  const lateCancelAttempt = jm.transition(jobC.job_id, CanonicalJobStatus.PLANNING);
  assert.strictEqual(lateCancelAttempt.status, CanonicalJobStatus.CANCELLED);
});

// ---------------------------------------------------------------------------
// 11. Legacy COMMITTED and COMPLETED map to SUCCEEDED
// ---------------------------------------------------------------------------
test('RT01-S1.11: Legacy COMMITTED and COMPLETED map to SUCCEEDED', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-legacy');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);

  assert.strictEqual(StatusNormalizationMap['COMMITTED'], CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(StatusNormalizationMap['COMPLETED'], CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(StatusNormalizationMap['RECOVERING'], CanonicalJobStatus.NEEDS_RECONCILIATION);

  const job = jm.createJob({ jobId: 'job_legacy_001' });
  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(job.job_id, CanonicalJobStatus.RENDERING);
  jm.transition(job.job_id, CanonicalJobStatus.VERIFYING);
  jm.transition(job.job_id, CanonicalJobStatus.PUBLISHING);

  // Transition to legacy COMMITTED alias
  const finalJob = jm.transition(job.job_id, 'COMMITTED');
  assert.strictEqual(finalJob.status, CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(finalJob.canonical_status, CanonicalJobStatus.SUCCEEDED);
});

// ---------------------------------------------------------------------------
// 12. Duplicate requests resolve to same job for identical idempotency key and payload
// ---------------------------------------------------------------------------
test('RT01-S1.12: Duplicate requests resolve to same job for identical idempotency key and payload', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const idempKey = `idemp-dup-${Date.now()}`;
  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  const res1 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });

  assert.strictEqual(res1.success, true);
  const jobId1 = res1.job.job_id;

  const res2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.fromCache, true);
  assert.strictEqual(res2.job.job_id, jobId1, 'Identical request must resolve to existing job');
});

// ---------------------------------------------------------------------------
// 13. Conflicting reuse of idempotency key fails closed (409 IDEMPOTENCY_CONFLICT)
// ---------------------------------------------------------------------------
test('RT01-S1.13: Conflicting reuse of idempotency key fails closed (409 IDEMPOTENCY_CONFLICT)', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const idempKey = `idemp-conflict-${Date.now()}`;

  const res1 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'First prompt instruction',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });

  const res2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Different prompt with reused key',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });

  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.errorCode, 'IDEMPOTENCY_CONFLICT');
  assert.ok(res2.error.includes('already bound to different prompt payload'));
});

// ---------------------------------------------------------------------------
// 14. Manual timeline edit lineage and automated plan base revision reconciled
// ---------------------------------------------------------------------------
test('RT01-S1.14: Manual timeline edit lineage and automated plan base revision reconciled', async () => {
  const port = 4780;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({
    port,
    project: session.history[0]._project,
    session,
    outputDir: TEST_OUT_DIR
  });

  await backend.start();

  try {
    const revBefore = backend.currentProject.revision;
    const historyLenBefore = session.history.length;

    // 1. Perform direct manual timeline operation (e.g. split clip)
    const opRes = await fetch(`http://localhost:${port}/api/project/operation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: {
          type: 'split_clip',
          params: { clipId: 'clip_1', splitTick: 240000 }
        }
      })
    });

    assert.strictEqual(opRes.status, 200);
    const opData = await opRes.json();
    assert.strictEqual(opData.success, true);
    assert.strictEqual(opData.revision, revBefore + 1);

    // Verify session lineage synchronization
    assert.strictEqual(session.history.length, historyLenBefore + 1);
    const lastHist = session.history[session.history.length - 1];
    assert.strictEqual(lastHist.origin, 'manual_vcs');
    assert.strictEqual(lastHist.operation.type, 'split_clip');
    assert.strictEqual(lastHist._project.revision, revBefore + 1);

    // Active delivery must remain untouched by manual edits
    assert.strictEqual(session.active_delivery.revision_id, 'rev-0');

    // 2. Perform automated revision prompt: expects base revision matching manual edit
    const jobRes = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
        expectedBaseRevision: opData.revision
      })
    });

    assert.strictEqual(jobRes.status, 200);
    const jobData = await jobRes.json();
    assert.strictEqual(jobData.success, true);

    // 3. Stale base revision against current manual edit fails closed
    const staleRes = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
        expectedBaseRevision: revBefore // Stale revision
      })
    });

    assert.strictEqual(staleRes.status, 409);
    const staleData = await staleRes.json();
    assert.strictEqual(staleData.errorCode, 'STALE_REVISION');
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// 15. Cancellation before execution produces zero mutation
// ---------------------------------------------------------------------------
test('RT01-S1.15: Cancellation before execution produces zero mutation', () => {
  setupTestEnvironment();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs-cancel');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jm = new OrchestrationJobManager(jobsDir);
  const session = createTestSession(TEST_OUT_DIR);
  const initialRev = session.history[0]._project.revision;
  const initialActiveDelivery = structuredClone(session.active_delivery);

  const job = jm.createJob({
    jobId: 'job_cancel_pre_001',
    request: { prompt: 'Complex grade change' }
  });

  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.AWAITING_APPROVAL, {
    reason: 'Review plan',
    awaitingReason: 'approval'
  });

  const cancelled = jm.cancelJob(job.job_id, 'User clicked Cancel before execution');
  assert.strictEqual(cancelled.status, CanonicalJobStatus.CANCELLED);

  // Verify zero mutation
  assert.strictEqual(session.history[0]._project.revision, initialRev);
  assert.deepStrictEqual(session.active_delivery, initialActiveDelivery);
});

// ---------------------------------------------------------------------------
// 16. Atomic (atomic: true) rolls back staged candidate on failure without altering project
// ---------------------------------------------------------------------------
test('RT01-S1.16: Atomic (atomic: true) rolls back staged candidate on failure without altering project', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const initialRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      atomic: true,
      injectFailureAtStep: 0 // Fail on first step
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'rolled_back');
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
  assert.strictEqual(session.history[0]._project.revision, initialRev, 'Project must remain at original revision');
});

// ---------------------------------------------------------------------------
// 17. Non-atomic (atomic: false) reports partial failure with exact committed step and revision
// ---------------------------------------------------------------------------
test('RT01-S1.17: Non-atomic (atomic: false) reports partial failure with exact committed step and revision', () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      atomic: false,
      injectFailureAtStep: 0
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'partially_executed_failed');
  assert.strictEqual(result.executedSteps, 0);
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
});

// ---------------------------------------------------------------------------
// 18. Status polling via GET /api/jobs/:jobId, approval via POST /api/jobs/:jobId/approve, cancel via POST /api/jobs/:jobId/cancel
// ---------------------------------------------------------------------------
test('RT01-S1.18: HTTP API: status polling, approval, cancellation', async () => {
  const port = 4785;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({
    port,
    project: session.history[0]._project,
    session,
    outputDir: TEST_OUT_DIR
  });

  await backend.start();

  try {
    // 1. Submit workflow with requireApproval: true
    const submitRes = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
        options: { requireApproval: true }
      })
    });

    assert.strictEqual(submitRes.status, 200);
    const submitData = await submitRes.json();
    assert.strictEqual(submitData.held, true);
    assert.strictEqual(submitData.awaitingApproval, true);
    const jobId = submitData.job.job_id;
    const planHash = submitData.planHash;

    // 2. Poll status via GET /api/jobs/:jobId
    const getRes = await fetch(`http://localhost:${port}/api/jobs/${jobId}`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.job.job_id, jobId);
    assert.strictEqual(getData.job.status, CanonicalJobStatus.AWAITING_APPROVAL);

    // 3. Submit Approval via POST /api/jobs/:jobId/approve
    const approveRes = await fetch(`http://localhost:${port}/api/jobs/${jobId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        expectedPlanHash: planHash,
        reason: 'User approved plan via UI modal'
      })
    });

    assert.strictEqual(approveRes.status, 200);
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.success, true);
    assert.strictEqual(approveData.job.status, CanonicalJobStatus.READY_TO_EXECUTE);

    // 4. Test Cancel on a new job via POST /api/jobs/:jobId/cancel
    const cancelJobRes = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
        options: { requireApproval: true }
      })
    });
    const cancelJobData = await cancelJobRes.json();
    const cancelJobId = cancelJobData.job.job_id;

    const cancelRes = await fetch(`http://localhost:${port}/api/jobs/${cancelJobId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'User aborted revision'
      })
    });

    assert.strictEqual(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.strictEqual(cancelData.success, true);
    assert.strictEqual(cancelData.job.status, CanonicalJobStatus.CANCELLED);
  } finally {
    await backend.stop();
  }
});
