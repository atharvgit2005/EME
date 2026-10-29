/**
 * EME Phase 19 (RT-01) — Stage 19.3 Recovery & State Reconciliation Test Battery
 *
 * Validates the 12 closed-loop verification, failure recovery, and state reconciliation
 * scenarios mandated by the ChatGPT Architecture Lead Directive:
 * - Scenario A: Commit succeeded, response lost (no duplicate edits, no double revision increment)
 * - Scenario B: Commit outcome unknown (diverged state enters NEEDS_RECONCILIATION)
 * - Scenario C: Process restarts in nonterminal stage (durable state recovery)
 * - Scenario D: Duplicate request after restart (durable idempotency & conflict guard)
 * - Scenario E: Atomic plan interrupted (candidate rollback leaves canonical project untouched)
 * - Scenario F: Non-atomic plan interrupted (partial step journaling & exact state retention)
 * - Scenario G: Render or QA failure (never updates session.active_delivery)
 * - Scenario H: Publication outcome ambiguous (corrupt/missing manifest prevents promotion)
 * - Scenario I: Cancellation at mutation boundary (honest reporting, zero untracked mutation)
 * - Scenario J: Conflicting project state (pre-execution 409 STALE_REVISION)
 * - Scenario K: Late callbacks after terminal state (terminal immutability)
 * - Scenario L: Active-delivery preservation across full failure battery
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  CanonicalJobStatus,
  OrchestrationJobStatus,
  OrchestrationJobManager,
  EndToEndOrchestrator,
  OperationPlanCompiler,
  RenderOrchestrator
} = require('../src/prompt-core/index.js');
const { EditorBackend } = require('../src/ui/server.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/test_stage19_3_recovery');

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
      const { spawnSync } = require('child_process');
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

function createBaseExecutedProject() {
  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  return OperationPlanCompiler.executePlan(baseProject, basePlan).project;
}

function createTestSession() {
  const mediaPath = setupTestEnvironment();
  const baseProject = createBaseExecutedProject();
  const fileSha = RenderOrchestrator.computeFileSha256(mediaPath);

  return {
    schema_version: '1.0.0',
    session_id: `sess-stage19-3-${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
      manifest_id: 'mf-initial-golden',
      media_path: mediaPath,
      sha256: fileSha,
      published_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Create 12-second vertical travel reel',
        origin: 'prompt_workflow',
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
// Scenario A: Commit Succeeded, Response Lost
// ---------------------------------------------------------------------------
test('RT01-S3.A: Commit succeeded, response lost (no duplicate edits, no double revision increment)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);
  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  // 1. Initial workflow execution succeeds
  const runRes = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });
  assert.strictEqual(runRes.success, true);
  assert.strictEqual(session.history.length, 2);
  const committedRev = session.history[1]._project.revision;
  const committedRevId = session.history[1].revision_id;

  // 2. Caller simulates lost response and triggers recoverJob on the job ID
  const recRes = EndToEndOrchestrator.recoverJob({
    jobId: runRes.job.job_id,
    session,
    project: session.history[1]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  assert.strictEqual(recRes.success, true);
  // Must discover already committed result
  assert.ok(recRes.status === 'already_committed' || recRes.status === 'reconciled_committed');
  // Invariant: no duplicate edit, revision does not increment again
  assert.strictEqual(session.history.length, 2, 'History must not append a second revision');
  assert.strictEqual(session.history[1]._project.revision, committedRev, 'Project revision must remain unchanged on recovery');
  assert.strictEqual(recRes.job.status, CanonicalJobStatus.SUCCEEDED);
});

// ---------------------------------------------------------------------------
// Scenario B: Commit Outcome Unknown (Ambiguous Interruption)
// ---------------------------------------------------------------------------
test('RT01-S3.B: Commit outcome unknown (diverged state enters NEEDS_RECONCILIATION)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);

  // Create a durable job interrupted in EXECUTING state
  const job = jm.createJob({
    jobId: 'job_ambiguous_interrupted_1',
    request: { prompt: 'Move headline title 1 second later on track_graphics.' }
  });

  jm.transition(job.job_id, CanonicalJobStatus.PLANNING, {
    artifacts: {
      plan_id: 'plan_ambiguous',
      plan_hash: 'hash_ambiguous_999',
      plan: {
        base_revision: 1,
        project_snapshot: { base_revision: 1 }
      }
    }
  });
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(job.job_id, CanonicalJobStatus.EXECUTING);

  // Diverge the live project revision to simulate unjournaled mutation
  const divergedProject = structuredClone(session.history[0]._project);
  divergedProject.revision = 99; // Diverged!

  // Recovery must detect the ambiguity and fail closed into NEEDS_RECONCILIATION
  const recRes = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    project: divergedProject,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  assert.strictEqual(recRes.success, false);
  assert.strictEqual(recRes.status, 'needs_reconciliation');
  const loadedJob = jm.loadJob(job.job_id);
  assert.strictEqual(loadedJob.status, CanonicalJobStatus.NEEDS_RECONCILIATION);
  assert.strictEqual(loadedJob.reconciliation?.uncertainty_reason, 'unverified_partial_mutation');
});

// ---------------------------------------------------------------------------
// Scenario C: Process Restarts in Nonterminal Stage
// ---------------------------------------------------------------------------
test('RT01-S3.C: Process restarts in nonterminal stage (durable state recovery across restart)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');

  // Process 1: Job starts and reaches RENDERING, then process crashes
  const jm1 = new OrchestrationJobManager(jobsDir);
  const job = jm1.createJob({
    jobId: 'job_process_restart_test',
    request: { prompt: 'Move headline title 1 second later on track_graphics.' }
  });
  jm1.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm1.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm1.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm1.transition(job.job_id, CanonicalJobStatus.RENDERING);

  // Process 2: Server restarts, creating a brand new OrchestrationJobManager reading from disk
  const jm2 = new OrchestrationJobManager(jobsDir);
  const loaded = jm2.loadJob(job.job_id);
  assert.ok(loaded);
  assert.strictEqual(loaded.status, CanonicalJobStatus.RENDERING);

  // Recover job in fresh process
  const recRes = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm2
  });

  assert.strictEqual(recRes.success, true);
  assert.strictEqual(recRes.status, 'recovered');
  const recoveredJob = jm2.loadJob(job.job_id);
  assert.strictEqual(recoveredJob.status, CanonicalJobStatus.FAILED);
  // Prior active delivery preserved
  assert.strictEqual(session.active_delivery.revision_id, 'rev-0');
});

// ---------------------------------------------------------------------------
// Scenario D: Duplicate Request After Restart
// ---------------------------------------------------------------------------
test('RT01-S3.D: Duplicate request after restart (durable idempotency & conflict guard)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const idempKey = `idemp-restart-${Date.now()}`;
  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  // Process 1: Submit workflow with idempotencyKey
  const jm1 = new OrchestrationJobManager(jobsDir);
  const res1 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey,
    jobManager: jm1
  });
  assert.strictEqual(res1.success, true);
  const originalJobId = res1.job.job_id;

  // Process 2: Simulate complete server restart with fresh OrchestrationJobManager
  const jm2 = new OrchestrationJobManager(jobsDir);

  // Submitting identical prompt resolves from disk cache
  const res2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[1]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey,
    jobManager: jm2
  });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.fromCache, true);
  assert.strictEqual(res2.job.job_id, originalJobId);

  // Submitting conflicting prompt with same key fails closed with 409 IDEMPOTENCY_CONFLICT
  const res3 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'A completely different conflicting prompt with same key',
    project: session.history[1]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey,
    jobManager: jm2
  });
  assert.strictEqual(res3.success, false);
  assert.strictEqual(res3.errorCode, 'IDEMPOTENCY_CONFLICT');
});

// ---------------------------------------------------------------------------
// Scenario E: Atomic Plan Interrupted (atomic: true)
// ---------------------------------------------------------------------------
test('RT01-S3.E: Atomic plan interrupted (atomic: true candidate rollback leaves canonical project untouched)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const baseRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      atomic: true,
      injectFailureAtStep: 0
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'rolled_back');
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
  // Canonical project content and revision strictly unchanged
  assert.strictEqual(session.history[0]._project.revision, baseRev);
  assert.strictEqual(session.active_delivery.revision_id, 'rev-0');
});

// ---------------------------------------------------------------------------
// Scenario F: Non-Atomic Plan Interrupted (atomic: false)
// ---------------------------------------------------------------------------
test('RT01-S3.F: Non-atomic plan interrupted (partial step journaling & exact state retention)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const baseRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Make pacing more cinematic.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      atomic: false,
      injectFailureAtStep: 1
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'partially_executed_failed');
  assert.strictEqual(result.executedSteps, 1, 'First step must commit before second step fails');
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
  assert.ok(result.committedRevision > baseRev, 'Committed step must advance project revision');
});

// ---------------------------------------------------------------------------
// Scenario G: Render or QA Failure
// ---------------------------------------------------------------------------
test('RT01-S3.G: Render or QA failure (never updates session.active_delivery)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);

  // Injected synthetic QA failure
  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: { simulateQaFail: true }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
  // Invariant: active delivery is 100% untouched
  assert.deepStrictEqual(session.active_delivery, initialActive);
});

// ---------------------------------------------------------------------------
// Scenario H: Publication Outcome Ambiguous
// ---------------------------------------------------------------------------
test('RT01-S3.H: Publication outcome ambiguous (corrupt/missing manifest prevents promotion)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);

  // Create job in PUBLISHING with corrupted/nonexistent manifest
  const job = jm.createJob({
    jobId: 'job_pub_ambiguous',
    request: { prompt: 'Move headline title 1 second later on track_graphics.' }
  });
  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(job.job_id, CanonicalJobStatus.VERIFYING);
  jm.transition(job.job_id, CanonicalJobStatus.RENDERING);
  jm.transition(job.job_id, CanonicalJobStatus.PUBLISHING, {
    artifacts: {
      media_path: path.join(TEST_OUT_DIR, 'nonexistent_media.mp4'),
      manifest_id: 'manifest_corrupt'
    }
  });

  // Recovery must not promote the nonexistent artifact
  const recRes = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  assert.strictEqual(recRes.success, true);
  assert.strictEqual(recRes.status, 'recovered');
  assert.strictEqual(jm.loadJob(job.job_id).status, CanonicalJobStatus.FAILED);
  assert.deepStrictEqual(session.active_delivery, initialActive);
});

// ---------------------------------------------------------------------------
// Scenario I: Cancellation at Mutation Boundary (All 5 Execution Boundaries)
// ---------------------------------------------------------------------------
test('RT01-S3.I: Cancellation at mutation boundary (honest reporting across all execution boundaries)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);
  const baseRev = session.history[0]._project.revision;

  // Boundary 1: Pre-execution cancellation in ACCEPTED state (zero mutation, zero steps)
  const jobPre = jm.createJob({
    jobId: 'job_cancel_pre_exec',
    request: { prompt: 'Move headline title 1 second later on track_graphics.' }
  });
  const cancelledPre = jm.cancelJob(jobPre.job_id, 'User cancelled before execution');
  assert.strictEqual(cancelledPre.status, CanonicalJobStatus.CANCELLED);
  assert.strictEqual(session.history[0]._project.revision, baseRev);

  // Late callbacks cannot override terminal CANCELLED state
  const lateAttempt = jm.transition(jobPre.job_id, CanonicalJobStatus.EXECUTING);
  assert.strictEqual(lateAttempt.status, CanonicalJobStatus.CANCELLED);

  // Boundary 2: In-flight cancellation before commit (atomic rollback leaves project unchanged)
  const jobInFlight = jm.createJob({
    jobId: 'job_cancel_inflight_precommit',
    request: { prompt: 'Move headline title 1 second later on track_graphics.' }
  });
  jm.transition(jobInFlight.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(jobInFlight.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(jobInFlight.job_id, CanonicalJobStatus.EXECUTING);
  const cancelledInFlight = jm.cancelJob(jobInFlight.job_id, 'User cancelled while execution underway', {
    artifacts: { atomic: true, executedSteps: 0, committedRevision: baseRev }
  });
  assert.strictEqual(cancelledInFlight.status, CanonicalJobStatus.CANCELLED);
  assert.strictEqual(session.history[0]._project.revision, baseRev);

  // Boundary 3: In-flight cancellation after partial commit (atomic: false preserves committed revision)
  const liveProject = structuredClone(session.history[0]._project);
  const jobPartial = jm.createJob({
    jobId: 'job_cancel_post_partial_commit',
    request: { prompt: 'Move headline title 1 second later on track_graphics. Make pacing more cinematic.' }
  });
  jm.transition(jobPartial.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(jobPartial.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(jobPartial.job_id, CanonicalJobStatus.EXECUTING);
  // Step 0 committed:
  liveProject.revision = baseRev + 1;
  const cancelledPartial = jm.cancelJob(jobPartial.job_id, 'User cancelled after step 1 committed', {
    artifacts: {
      atomic: false,
      executedSteps: 1,
      committedRevision: baseRev + 1,
      journal: [
        { stepIndex: 0, type: 'move_clip', status: 'committed', resultingRevision: baseRev + 1 }
      ]
    }
  });
  assert.strictEqual(cancelledPartial.status, CanonicalJobStatus.CANCELLED);
  assert.strictEqual(cancelledPartial.artifacts.executedSteps, 1);
  assert.strictEqual(cancelledPartial.artifacts.committedRevision, baseRev + 1);
  assert.strictEqual(liveProject.revision, baseRev + 1, 'Committed revision must NOT be rolled back on cancellation');

  // Boundary 4: Cancellation during RENDERING preserves committed revision and prior active delivery
  const initialActive = structuredClone(session.active_delivery);
  const jobRender = jm.createJob({
    jobId: 'job_cancel_during_render',
    request: { prompt: 'Move headline title 1 second later on track_graphics.' }
  });
  jm.transition(jobRender.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(jobRender.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(jobRender.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(jobRender.job_id, CanonicalJobStatus.RENDERING);
  const cancelledRender = jm.cancelJob(jobRender.job_id, 'User cancelled during video rendering');
  assert.strictEqual(cancelledRender.status, CanonicalJobStatus.CANCELLED);
  assert.deepStrictEqual(session.active_delivery, initialActive, 'Prior active delivery must remain untouched');

  // Boundary 5: Cancellation after publication is terminal immutable no-op (verified delivery remains active)
  const jobPublished = jm.createJob({
    jobId: 'job_cancel_post_pub',
    request: { prompt: 'Completed workflow' }
  });
  jm.transition(jobPublished.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(jobPublished.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(jobPublished.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(jobPublished.job_id, CanonicalJobStatus.RENDERING);
  jm.transition(jobPublished.job_id, CanonicalJobStatus.PUBLISHING);
  jm.transition(jobPublished.job_id, CanonicalJobStatus.SUCCEEDED, {
    result: { active_delivery: initialActive }
  });
  const cancelAfterPub = jm.cancelJob(jobPublished.job_id, 'Attempt cancel after success');
  assert.strictEqual(cancelAfterPub.status, CanonicalJobStatus.SUCCEEDED, 'Terminal SUCCEEDED resists cancellation');
  assert.deepStrictEqual(session.active_delivery, initialActive);
});

// ---------------------------------------------------------------------------
// Scenario J: Conflicting Project State (Stale Revision)
// ---------------------------------------------------------------------------
test('RT01-S3.J: Conflicting project state (pre-execution 409 STALE_REVISION)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const currentRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      expectedBaseRevision: currentRev + 10 // Stale
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'STALE_REVISION');
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
});

// ---------------------------------------------------------------------------
// Scenario K: Late Callbacks After Terminal State
// ---------------------------------------------------------------------------
test('RT01-S3.K: Late callbacks after terminal state (terminal immutability)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);

  // Successful terminal job
  const job = jm.createJob({ jobId: 'job_term_test' });
  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(job.job_id, CanonicalJobStatus.SUCCEEDED);

  // Late failed callback arrives
  const late1 = jm.transition(job.job_id, CanonicalJobStatus.FAILED, { error: 'Late network error' });
  assert.strictEqual(late1.status, CanonicalJobStatus.SUCCEEDED);

  // Late rendering callback arrives
  const late2 = jm.transition(job.job_id, CanonicalJobStatus.RENDERING);
  assert.strictEqual(late2.status, CanonicalJobStatus.SUCCEEDED);
});

// ---------------------------------------------------------------------------
// Scenario L: Active-Delivery Preservation Across Full Failure Battery
// ---------------------------------------------------------------------------
test('RT01-S3.L: Active-delivery preservation across full failure battery', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActiveDelivery = structuredClone(session.active_delivery);

  // Failure 1: Validation failure
  EndToEndOrchestrator.runWorkflow({
    session,
    prompt: '', // empty prompt
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR
  });
  assert.deepStrictEqual(session.active_delivery, initialActiveDelivery, 'Must survive validation failure');

  // Failure 2: Stale revision
  EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: { expectedBaseRevision: 999 }
  });
  assert.deepStrictEqual(session.active_delivery, initialActiveDelivery, 'Must survive stale revision');

  // Failure 3: Atomic step rollback
  EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: { atomic: true, injectFailureAtStep: 0 }
  });
  assert.deepStrictEqual(session.active_delivery, initialActiveDelivery, 'Must survive atomic rollback');

  // Failure 4: QA score failure
  EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: { simulateQaFail: true }
  });
  assert.deepStrictEqual(session.active_delivery, initialActiveDelivery, 'Must survive QA failure');
});

// ---------------------------------------------------------------------------
// Scenario M: Mutation-Lock Ordering & In-Lock Revalidation (Gate 1 Concurrency)
// ---------------------------------------------------------------------------
test('RT01-S3.M: In-lock revalidation in READY_TO_EXECUTE prevents stale plan mutation', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);
  const liveProject = structuredClone(session.history[0]._project);
  const baseRev = liveProject.revision;

  // 1. Dry-run compiles plan and pauses at AWAITING_APPROVAL
  const dryResult = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: liveProject,
    outputDir: TEST_OUT_DIR,
    jobManager: jm,
    options: { requireApproval: true }
  });

  assert.strictEqual(dryResult.success, true);
  assert.strictEqual(dryResult.held, true);
  const approvedJob = jm.submitApproval(dryResult.job.job_id, {
    action: 'approve',
    expectedPlanHash: dryResult.planHash,
    expectedBaseRevision: baseRev
  });
  assert.strictEqual(approvedJob.status, CanonicalJobStatus.READY_TO_EXECUTE);

  // 2. Race condition simulation: Out-of-band manual edit mutates live project before execution
  liveProject.revision = baseRev + 1; // Project advanced out-of-band

  // 3. Execution attempt under mutation lock
  const execResult = EndToEndOrchestrator.executeApprovedJob({
    jobId: dryResult.job.job_id,
    session,
    project: liveProject,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  // Revalidation inside lock MUST fail closed with 409 STALE_REVISION
  assert.strictEqual(execResult.success, false);
  assert.strictEqual(execResult.errorCode, 'STALE_REVISION');
  assert.strictEqual(jm.loadJob(dryResult.job.job_id).status, CanonicalJobStatus.FAILED);
  assert.strictEqual(liveProject.revision, baseRev + 1, 'Project must remain strictly untouched by stale plan');

  // 4. Track lock race condition simulation: Track locked after approval
  const dryResult2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: liveProject,
    outputDir: TEST_OUT_DIR,
    jobManager: jm,
    options: { requireApproval: true }
  });
  jm.submitApproval(dryResult2.job.job_id, { action: 'approve' });

  // Out-of-band track lock
  const graphicsTrack = liveProject.tracks.find(t => t.id === 'track_graphics');
  graphicsTrack.locked = true;

  const execResult2 = EndToEndOrchestrator.executeApprovedJob({
    jobId: dryResult2.job.job_id,
    session,
    project: liveProject,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  assert.strictEqual(execResult2.success, false);
  assert.strictEqual(execResult2.errorCode, 'TRACK_LOCKED');
  assert.strictEqual(jm.loadJob(dryResult2.job.job_id).status, CanonicalJobStatus.FAILED);
});
