/**
 * Editing Mechanics Engine (EME) - Phase 19 (RT-01) Stage 19.2 Test Suite
 * End-to-End Golden Workflows, Multi-turn Revision DAGs & Cross-System Integration
 *
 * Verifies all 10 Golden Scenarios (Scenarios A through J) mandated by ChatGPT Directive:
 * - Scenario A: Valid single-turn edit with end-to-end verified delivery.
 * - Scenario B: Clarification before execution (AWAITING_APPROVAL, awaitingReason: 'clarification').
 * - Scenario C: Approval of valid plan (plan hash & base revision verification).
 * - Scenario D: Multi-turn revision session with unbroken predecessor DAG tracking.
 * - Scenario E: Manual timeline edit between automated turns (manual VCS lineage & active-delivery preservation).
 * - Scenario F: Stale plan rejection (409 STALE_REVISION).
 * - Scenario G: Atomic multi-operation failure (atomic: true candidate rollback).
 * - Scenario H: Non-atomic partial failure (atomic: false partial progress reporting).
 * - Scenario I: Duplicate workflow submission & durable idempotency conflict guard.
 * - Scenario J: Failed workflow preserves prior verified delivery.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  CanonicalJobStatus,
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

const TEST_OUT_DIR = path.resolve('artifacts/test-stage19-2');

// Helper to set up clean test environment and reproducible test media
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
function createTestSession() {
  const mediaPath = setupTestEnvironment();
  const baseProject = createBaseExecutedProject();
  const fileSha = RenderOrchestrator.computeFileSha256(mediaPath);

  return {
    schema_version: '1.0.0',
    session_id: `sess-stage19-2-${Date.now()}`,
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
// Scenario A: Valid Single-Turn Edit
// ---------------------------------------------------------------------------
test('RT01-S2.A: Valid single-turn edit with end-to-end verified delivery', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const revBefore = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.job.status, CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(result.job.progress.stage, 'COMMITTED');
  assert.strictEqual(result.job.progress.percent, 100);

  // Active delivery updated
  assert.strictEqual(result.active_delivery.revision_id, 'rev-1');
  assert.ok(result.active_delivery.manifest_id);
  assert.ok(fs.existsSync(result.active_delivery.media_path));

  // Revision DAG updated
  assert.strictEqual(session.history.length, 2);
  const node = session.history[1];
  assert.strictEqual(node.revision_id, 'rev-1');
  assert.strictEqual(node.predecessor_id, 'rev-0');
  assert.strictEqual(node.status, 'committed');
  assert.ok(node._project.revision > revBefore);
});

// ---------------------------------------------------------------------------
// Scenario B: Clarification Before Execution
// ---------------------------------------------------------------------------
test('RT01-S2.B: Clarification before execution (AWAITING_APPROVAL, awaitingReason: "clarification")', () => {
  setupTestEnvironment();
  const session = createTestSession();
  session.active_delivery = null; // Force intake through brief compiler
  const revBefore = session.history[0]._project.revision;
  const historyLenBefore = session.history.length;

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

  // Verify non-mutating guarantee
  assert.strictEqual(session.history[0]._project.revision, revBefore, 'Project must not mutate on clarification hold');
  assert.strictEqual(session.history.length, historyLenBefore, 'History must not append revision on hold');

  // User clarifies: transitions back to PLANNING
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const jm = new OrchestrationJobManager(jobsDir);
  const clarified = jm.submitApproval(result.job.job_id, {
    action: 'clarify',
    clarification: 'User clarifies: warm white balance only, keep base grade unchanged'
  });
  assert.strictEqual(clarified.status, CanonicalJobStatus.PLANNING);
  assert.strictEqual(clarified.request.clarification, 'User clarifies: warm white balance only, keep base grade unchanged');
});

// ---------------------------------------------------------------------------
// Scenario C: Approval of a Valid Plan
// ---------------------------------------------------------------------------
test('RT01-S2.C: Approval of valid plan (plan hash & base revision verification)', () => {
  setupTestEnvironment();
  const session = createTestSession();

  const dryResult = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: { requireApproval: true }
  });

  assert.strictEqual(dryResult.success, true);
  assert.strictEqual(dryResult.held, true);
  assert.strictEqual(dryResult.awaitingApproval, true);
  assert.strictEqual(dryResult.job.status, CanonicalJobStatus.AWAITING_APPROVAL);
  const planHash = dryResult.planHash;
  const baseRev = dryResult.plan.base_revision;

  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // Approval with mismatched plan hash throws
  assert.throws(() => {
    jm.submitApproval(dryResult.job.job_id, {
      action: 'approve',
      expectedPlanHash: 'hash-corrupted-mismatch'
    });
  }, /Plan hash mismatch/);

  // Approval with mismatched base revision throws
  assert.throws(() => {
    jm.submitApproval(dryResult.job.job_id, {
      action: 'approve',
      expectedPlanHash: planHash,
      expectedBaseRevision: baseRev + 100
    });
  }, /Base revision mismatch/);

  // Approval with matching hash and base revision succeeds
  const approved = jm.submitApproval(dryResult.job.job_id, {
    action: 'approve',
    expectedPlanHash: planHash,
    expectedBaseRevision: baseRev
  });
  assert.strictEqual(approved.status, CanonicalJobStatus.READY_TO_EXECUTE);
});

// ---------------------------------------------------------------------------
// Scenario D: Multi-Turn Revision Session
// ---------------------------------------------------------------------------
test('RT01-S2.D: Multi-turn revision session with unbroken predecessor DAG tracking', () => {
  setupTestEnvironment();
  const session = createTestSession();

  // Turn 1: Shift title
  const res1 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR
  });
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.active_delivery.revision_id, 'rev-1');

  // Turn 2: Move headline title entrance to 2 seconds
  const res2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title entrance to 2 seconds on track_graphics.',
    project: session.history[1]._project,
    outputDir: TEST_OUT_DIR
  });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.active_delivery.revision_id, 'rev-2');

  // Turn 3: Split clip_1
  const res3 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[2]._project,
    outputDir: TEST_OUT_DIR
  });
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.active_delivery.revision_id, 'rev-3');

  // Verify unbroken DAG lineage: rev-0 -> rev-1 -> rev-2 -> rev-3
  assert.strictEqual(session.history.length, 4);
  assert.strictEqual(session.history[0].revision_id, 'rev-0');
  assert.strictEqual(session.history[1].revision_id, 'rev-1');
  assert.strictEqual(session.history[1].predecessor_id, 'rev-0');
  assert.strictEqual(session.history[2].revision_id, 'rev-2');
  assert.strictEqual(session.history[2].predecessor_id, 'rev-1');
  assert.strictEqual(session.history[3].revision_id, 'rev-3');
  assert.strictEqual(session.history[3].predecessor_id, 'rev-2');
});

// ---------------------------------------------------------------------------
// Scenario E: Manual Timeline Edit Between Automated Turns
// ---------------------------------------------------------------------------
test('RT01-S2.E: Manual timeline edit between automated turns (manual VCS lineage & active-delivery preservation)', async () => {
  const port = 4790;
  setupTestEnvironment();
  const session = createTestSession();
  const backend = new EditorBackend({
    port,
    project: session.history[0]._project,
    session,
    outputDir: TEST_OUT_DIR
  });

  await backend.start();

  try {
    // 1. Automated Turn 1
    const jobRes1 = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.'
      })
    });
    const jobData1 = await jobRes1.json();
    assert.strictEqual(jobData1.success, true);
    assert.strictEqual(session.active_delivery.revision_id, 'rev-1');

    // 2. Direct manual timeline operation (split clip_1)
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
    const opData = await opRes.json();
    assert.strictEqual(opData.success, true);

    // Verify session history captured manual VCS node
    const lastHist = session.history[session.history.length - 1];
    assert.strictEqual(lastHist.origin, 'manual_vcs');
    assert.strictEqual(lastHist.operation.type, 'split_clip');
    assert.strictEqual(lastHist.predecessor_id, 'rev-1');

    // Invariant: active delivery remains untouched by manual edit
    assert.strictEqual(session.active_delivery.revision_id, 'rev-1');

    // 3. Automated Turn 2 builds on top of manual revision
    const jobRes2 = await fetch(`http://localhost:${port}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
        expectedBaseRevision: opData.revision
      })
    });
    const jobData2 = await jobRes2.json();
    assert.strictEqual(jobData2.success, true);

    // After verified render, active delivery updates to the new turn
    const latestHist = session.history[session.history.length - 1];
    assert.strictEqual(session.active_delivery.revision_id, latestHist.revision_id);
    assert.strictEqual(latestHist.origin, 'prompt_workflow');
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Scenario F: Stale Plan Rejection
// ---------------------------------------------------------------------------
test('RT01-S2.F: Stale plan rejection (409 STALE_REVISION)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const currentRev = session.history[0]._project.revision;

  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      expectedBaseRevision: currentRev + 5 // Stale revision
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'STALE_REVISION');
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);
});

// ---------------------------------------------------------------------------
// Scenario G: Atomic Multi-Operation Failure
// ---------------------------------------------------------------------------
test('RT01-S2.G: Atomic multi-operation failure (atomic: true candidate rollback)', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const revBefore = session.history[0]._project.revision;

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
  assert.strictEqual(session.history[0]._project.revision, revBefore, 'Canonical project revision must not advance on atomic rollback');
});

// ---------------------------------------------------------------------------
// Scenario H: Non-Atomic Partial Failure
// ---------------------------------------------------------------------------
test('RT01-S2.H: Non-atomic partial failure (atomic: false partial progress reporting)', () => {
  setupTestEnvironment();
  const session = createTestSession();

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
// Scenario I: Duplicate Workflow Submission & Idempotency
// ---------------------------------------------------------------------------
test('RT01-S2.I: Duplicate workflow submission & durable idempotency conflict guard', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const idempKey = `idemp-golden-I-${Date.now()}`;
  const prompt = 'Move headline title 1 second later on track_graphics. Preserve duration.';

  // Initial execution
  const res1 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });
  assert.strictEqual(res1.success, true);
  const jobId = res1.job.job_id;

  // Duplicate retry: returns cached result
  const res2 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.fromCache, true);
  assert.strictEqual(res2.job.job_id, jobId);

  // Conflicting payload: fails closed with 409 IDEMPOTENCY_CONFLICT
  const res3 = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'A completely different prompt using same key',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    idempotencyKey: idempKey
  });
  assert.strictEqual(res3.success, false);
  assert.strictEqual(res3.errorCode, 'IDEMPOTENCY_CONFLICT');
});

// ---------------------------------------------------------------------------
// Scenario J: Failed Workflow Preserves Prior Verified Delivery
// ---------------------------------------------------------------------------
test('RT01-S2.J: Failed workflow preserves prior verified delivery', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActiveDelivery = structuredClone(session.active_delivery);

  // Trigger simulated QA failure during downstream verification
  const result = EndToEndOrchestrator.runWorkflow({
    session,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: {
      simulateQaFail: true
    }
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.job.status, CanonicalJobStatus.FAILED);

  // Non-negotiable invariant: active delivery remains pointed to prior verified output
  assert.deepStrictEqual(session.active_delivery, initialActiveDelivery, 'Prior verified active delivery must remain untouched on QA failure');
});
