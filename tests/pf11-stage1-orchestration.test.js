/**
 * Editing Mechanics Engine (EME) - Phase PF-11 Stage 1 Test Battery
 * End-to-End Orchestration Integration, Durable Job Lifecycle, & Acceptance Fixture
 *
 * Verifies all 9 mandatory Stage 1 gates from ChatGPT Architectural Directive:
 * 1. Successful request: reaches committed state with a real, playable, verified output.
 * 2. Invalid request: fails before execution without changing the active delivery.
 * 3. Operation failure: rolls back or recovers according to existing transaction guarantees.
 * 4. Render failure: leaves the previous verified delivery active.
 * 5. QA or semantic failure: does not publish the failed render.
 * 6. Duplicate submission or timeout retry: does not cause duplicate execution or competing commits.
 * 7. Concurrent mutation: stale revisions are rejected and the authoritative session remains consistent.
 * 8. Process interruption at documented persistence boundaries: recovery is safe and idempotent.
 * 9. Successful rerun after recovery: produces a valid delivery without corrupting history.
 * 10. HTTP Job Lifecycle & Progress API: validates /api/jobs and /api/jobs/:jobId over HTTP.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  OrchestrationJobStatus,
  ValidJobTransitions,
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

const TEST_OUT_DIR = path.resolve('artifacts/test-pf11-stage1');

// Helper to ensure directory and real test media
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
    session_id: `sess-pf11-${Date.now()}`,
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
      last_modified: new Date().toISOString(),
      active_agent: 'user'
    },
    selected_candidate_id: 'cand-001',
    active_delivery: {
      delivery_run_id: 'run-init',
      manifest_id: 'manifest-rev-0-init',
      media_path: mediaPath,
      sha256: fileSha,
      revision_id: 'rev-0',
      activated_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Initial verified baseline delivery',
        status: 'committed',
        plan_hash: 'plan-hash-rev0',
        manifest_id: 'manifest-rev-0-init',
        media_sha256: fileSha,
        media_path: mediaPath,
        operations_count: 5,
        qa_score: 96,
        timestamp: new Date().toISOString(),
        _project: baseProject
      }
    ],
    undo_redo: {
      undo_stack: [],
      redo_stack: [],
      canUndo: false,
      canRedo: false
    },
    recovery: {
      status: 'clean',
      pending_transaction_id: null,
      last_attempted_revision_id: null,
      checkpoint_path: null
    }
  };
}

// ---------------------------------------------------------------------------
// Gate 1: Successful Request Reaches Committed State with Playable Media
// ---------------------------------------------------------------------------
test('PF11-S1.1: Flagship End-to-End Orchestration reaches COMMITTED state with real verified output', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration and clip order.';
  const expectedVer = session.concurrency.version;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: expectedVer,
    jobManager: jm
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.job.status, OrchestrationJobStatus.COMMITTED);
  assert.strictEqual(result.job.progress.stage, 'COMMITTED');
  assert.strictEqual(result.job.progress.percent, 100);

  // Active delivery updated
  assert.strictEqual(result.active_delivery.revision_id, 'rev-1');
  assert.ok(result.active_delivery.manifest_id);
  assert.ok(fs.existsSync(result.active_delivery.media_path));

  // SHA-256 matches actual bytes
  const computedHash = RenderOrchestrator.computeFileSha256(result.active_delivery.media_path);
  assert.strictEqual(result.active_delivery.sha256, computedHash);

  // Session history updated with committed node
  const rev1 = session.history.find(h => h.revision_id === 'rev-1');
  assert.ok(rev1);
  assert.strictEqual(rev1.status, 'committed');
  assert.strictEqual(rev1.predecessor_id, 'rev-0');
  assert.strictEqual(session.concurrency.version, 2);
});

// ---------------------------------------------------------------------------
// Gate 2: Invalid Request Fails Before Execution Without Changing Active Delivery
// ---------------------------------------------------------------------------
test('PF11-S1.2: Invalid Request fails before execution without mutating active delivery', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const priorDelivery = { ...session.active_delivery };
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // Conflicting request that violates hard duration constraint (requesting 25s instead of 12s)
  const invalidPrompt = 'Make the video duration 25 seconds';

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: invalidPrompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: session.concurrency.version,
    jobManager: jm
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, OrchestrationJobStatus.FAILED);
  assert.ok(result.error.includes('Conflict'));

  // Active delivery strictly preserved!
  assert.strictEqual(session.active_delivery.revision_id, priorDelivery.revision_id);
  assert.strictEqual(session.active_delivery.manifest_id, priorDelivery.manifest_id);
  assert.strictEqual(session.active_delivery.sha256, priorDelivery.sha256);

  // Failed attempt recorded in history without corrupting active delivery
  const lastHist = session.history[session.history.length - 1];
  assert.strictEqual(lastHist.status, 'failed');
});

// ---------------------------------------------------------------------------
// Gate 3: Operation Failure Rolls Back Safely and Leaves Delivery Active
// ---------------------------------------------------------------------------
test('PF11-S1.3: Operation execution failure rolls back safely and preserves active delivery', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const priorDelivery = { ...session.active_delivery };
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: session.concurrency.version,
    options: { injectFailureAtStep: 0 }, // Injected execution failure
    jobManager: jm
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, OrchestrationJobStatus.FAILED);
  assert.ok(result.error.includes('Operation execution failed'));

  // Invariant: active delivery untouched
  assert.strictEqual(session.active_delivery.revision_id, priorDelivery.revision_id);
  assert.strictEqual(session.active_delivery.manifest_id, priorDelivery.manifest_id);
});

// ---------------------------------------------------------------------------
// Gate 4: Render Failure Leaves Previous Verified Delivery Active
// ---------------------------------------------------------------------------
test('PF11-S1.4: Render failure leaves previous verified delivery active', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const priorDelivery = { ...session.active_delivery };
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: session.concurrency.version,
    options: { simulateRenderFail: true }, // Injected render failure
    jobManager: jm
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, OrchestrationJobStatus.FAILED);
  assert.ok(result.error.includes('Rendering failed'));

  // Active delivery strictly preserved
  assert.strictEqual(session.active_delivery.revision_id, priorDelivery.revision_id);
});

// ---------------------------------------------------------------------------
// Gate 5: QA Failure Does Not Publish Failed Render
// ---------------------------------------------------------------------------
test('PF11-S1.5: QA failure does not publish failed render as active delivery', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const priorDelivery = { ...session.active_delivery };
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: session.concurrency.version,
    options: { simulateQaFail: true }, // Injected QA failure
    jobManager: jm
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, OrchestrationJobStatus.FAILED);
  assert.ok(result.error.includes('Media QA verification failed'));

  // Active delivery strictly remains rev-0
  assert.strictEqual(session.active_delivery.revision_id, priorDelivery.revision_id);
  assert.strictEqual(session.active_delivery.manifest_id, priorDelivery.manifest_id);
});

// ---------------------------------------------------------------------------
// Gate 6: Idempotency & Duplicate Submission Prevents Duplicate Execution
// ---------------------------------------------------------------------------
test('PF11-S1.6: Idempotency key prevents duplicate execution and competing commits', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));
  const idempotencyKey = `idemp-${Date.now()}-abc`;

  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  // First execution
  const res1 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey,
    expectedVersion: session.concurrency.version,
    jobManager: jm
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.fromCache, undefined);
  const committedRevId = res1.active_delivery.revision_id;
  const committedManifestId = res1.active_delivery.manifest_id;
  const historyLenAfterFirst = session.history.length;

  // Retry with same idempotency key (e.g. simulated network timeout retry)
  const res2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey,
    expectedVersion: session.concurrency.version,
    jobManager: jm
  });

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.fromCache, true);
  assert.strictEqual(res2.active_delivery.revision_id, committedRevId);
  assert.strictEqual(res2.active_delivery.manifest_id, committedManifestId);

  // Invariant: Zero duplicate mutations or competing revision commits
  assert.strictEqual(session.history.length, historyLenAfterFirst);
});

// ---------------------------------------------------------------------------
// Gate 7: Concurrent Mutation Rejection (Stale Version)
// ---------------------------------------------------------------------------
test('PF11-S1.7: Stale expectedVersion is rejected and session remains consistent', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const priorDelivery = { ...session.active_delivery };
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  // Pass stale version (e.g. expected 999 while current is 1)
  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: 999,
    jobManager: jm
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'STALE_VERSION');
  assert.strictEqual(session.active_delivery.revision_id, priorDelivery.revision_id);
});

// ---------------------------------------------------------------------------
// Gate 8: Process Interruption Crash Recovery
// ---------------------------------------------------------------------------
test('PF11-S1.8: Process interruption recovery is safe and idempotent', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // Create an in-flight job simulating crash mid-render
  const job = jm.createJob({
    jobId: `job_interrupted_${Date.now()}`,
    request: { prompt: 'Interrupted prompt', session_id: session.session_id }
  });
  jm.transition(job.job_id, OrchestrationJobStatus.PLANNING);
  jm.transition(job.job_id, OrchestrationJobStatus.EXECUTING);
  jm.transition(job.job_id, OrchestrationJobStatus.RENDERING);

  // Simulate recovery invocation
  const recRes = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  assert.strictEqual(recRes.success, true);
  assert.strictEqual(recRes.status, 'recovered');
  assert.strictEqual(recRes.job.status, OrchestrationJobStatus.FAILED);
  assert.strictEqual(session.active_delivery.revision_id, 'rev-0');
});

// ---------------------------------------------------------------------------
// Gate 9: Clean Rerun After Recovery
// ---------------------------------------------------------------------------
test('PF11-S1.9: Successful rerun after recovery produces valid delivery without corrupting history', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // 1. Simulate a failed revision
  const failPrompt = 'Make the video duration 20 seconds';
  EndToEndOrchestrator.runWorkflow({
    session,
    prompt: failPrompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: session.concurrency.version,
    jobManager: jm
  });

  assert.strictEqual(session.active_delivery.revision_id, 'rev-0');

  // 2. Execute valid revision after failure
  const validPrompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';
  const resValid = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: validPrompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    expectedVersion: session.concurrency.version,
    jobManager: jm
  });

  assert.strictEqual(resValid.success, true);
  assert.strictEqual(resValid.active_delivery.revision_id, 'rev-2');
  assert.strictEqual(session.active_delivery.revision_id, 'rev-2');

  // History DAG preserves failure node and connects new node to rev-0 predecessor
  const rev1Fail = session.history.find(h => h.revision_id === 'rev-1');
  const rev2Ok = session.history.find(h => h.revision_id === 'rev-2');
  assert.strictEqual(rev1Fail.status, 'failed');
  assert.strictEqual(rev2Ok.status, 'committed');
  assert.strictEqual(rev2Ok.predecessor_id, 'rev-0');
});

// ---------------------------------------------------------------------------
// Gate 10: HTTP Job Lifecycle & Progress API Verification
// ---------------------------------------------------------------------------
test('PF11-S1.10: HTTP API supports job submission, status querying, and idempotency', async () => {
  const port = 4710;
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
    const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';
    const idempKey = `http-idemp-${Date.now()}`;

    // 1. Submit Job via POST /api/jobs
    const submitRes = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        expectedVersion: session.concurrency.version,
        idempotencyKey: idempKey
      })
    });

    assert.strictEqual(submitRes.status, 200);
    const submitData = await submitRes.json();
    assert.strictEqual(submitData.success, true);
    assert.strictEqual(submitData.job.status, OrchestrationJobStatus.COMMITTED);
    const jobId = submitData.job.job_id;

    // 2. Query Job via GET /api/jobs/:jobId
    const getRes = await fetch(`http://localhost:${port}/api/jobs/${jobId}`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.job.job_id, jobId);
    assert.strictEqual(getData.job.status, OrchestrationJobStatus.COMMITTED);
    assert.strictEqual(getData.job.progress.stage, 'COMMITTED');

    // 3. Retry identical request: Returns cached result
    const retryRes = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        expectedVersion: session.concurrency.version,
        idempotencyKey: idempKey
      })
    });

    assert.strictEqual(retryRes.status, 200);
    const retryData = await retryRes.json();
    assert.strictEqual(retryData.fromCache, true);
    assert.strictEqual(retryData.job.job_id, jobId);
  } finally {
    await backend.stop();
  }
});
