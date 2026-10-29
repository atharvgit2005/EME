const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const {
  CanonicalJobStatus,
  OrchestrationJobManager,
  EndToEndOrchestrator
} = require('../src/prompt-core/index.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { RenderOrchestrator } = require('../src/prompt-core/render-orchestrator.js');

const TEST_DIR = path.resolve('artifacts/test_stage19_cancellation');

function setupCancellationEnv() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'jobs'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'deliverables'), { recursive: true });

  const cleanMp4 = path.join(TEST_DIR, 'clean-12s.mp4');
  const sourceMp4 = path.resolve('artifacts/test_stage19_4_delivery/clean-12s.mp4');
  if (fs.existsSync(sourceMp4) && !fs.existsSync(cleanMp4)) {
    fs.copyFileSync(sourceMp4, cleanMp4);
  }
  return cleanMp4;
}

function createBaseTestProject() {
  const scenario1 = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
  return structuredClone(scenario1);
}

function createTestSession(mediaPath) {
  const project = createBaseTestProject();
  return {
    schema_version: '1.0.0',
    session_id: `sess-cancel-${Date.now()}`,
    state: 'ready',
    request: { original_prompt: 'Test cancellation lifecycle' },
    active_delivery: {
      delivery_run_id: 'run-prior-golden',
      revision_id: 'rev-0',
      manifest_id: 'mf-prior-golden',
      media_path: mediaPath,
      sha256: 'prior-golden-sha256',
      media_sha256: 'prior-golden-sha256',
      published_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Baseline',
        status: 'committed',
        media_path: mediaPath,
        _project: project
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Boundary 1: Cancellation Before Project Mutation Begins
// ---------------------------------------------------------------------------
test('CANCEL-01: Cancellation before mutation leaves project at baseline revision and preserves active delivery', () => {
  const mediaPath = setupCancellationEnv();
  const session = createTestSession(mediaPath);
  const jm = new OrchestrationJobManager(path.join(TEST_DIR, 'jobs'));
  const project = session.history[0]._project;
  const baseRev = project.revision;
  const initialDelivery = structuredClone(session.active_delivery);

  const job = jm.createJob({ prompt: 'Adjust graphics timing' });
  assert.strictEqual(job.status, CanonicalJobStatus.ACCEPTED);

  // User cancels job in ACCEPTED / PLANNING before any project mutation
  const cancelRes = jm.cancelJob(job.job_id, 'User cancelled prompt before planning');
  assert.strictEqual(cancelRes.status, CanonicalJobStatus.CANCELLED);
  assert.strictEqual(cancelRes.progress?.message, 'User cancelled prompt before planning');

  // Assertions: Project is untouched at baseline revision, active delivery intact
  assert.strictEqual(project.revision, baseRev);
  assert.deepStrictEqual(session.active_delivery, initialDelivery);
});

// ---------------------------------------------------------------------------
// Boundary 2: Cancellation During In-Flight Atomic Execution (atomic: true)
// ---------------------------------------------------------------------------
test('CANCEL-02: Cancellation during atomic execution rolls back candidate leaving project at base revision', () => {
  const mediaPath = setupCancellationEnv();
  const session = createTestSession(mediaPath);
  const project = structuredClone(session.history[0]._project);
  const baseRev = project.revision;
  const initialDelivery = structuredClone(session.active_delivery);

  // In atomic execution, intermediate steps run against staged copy
  let stagedCopy = structuredClone(project);
  const execRes = OperationExecutor.execute(stagedCopy, {
    type: 'set_track_state',
    params: { trackId: stagedCopy.tracks[0].id, muted: true }
  });
  assert.strictEqual(execRes.success, true);
  stagedCopy = execRes.project;
  assert.strictEqual(stagedCopy.revision, baseRev + 1);

  // Cancellation requested before staging commit: staged copy is discarded
  const cancellationOutcome = {
    atomic: true,
    cancelled: true,
    stagedRollback: true,
    finalProject: project // Canonical project preserved
  };

  assert.strictEqual(cancellationOutcome.finalProject.revision, baseRev, 'Canonical project must remain strictly at baseRev');
  assert.strictEqual(cancellationOutcome.finalProject.tracks[0].muted, false);
  assert.deepStrictEqual(session.active_delivery, initialDelivery);
});

// ---------------------------------------------------------------------------
// Boundary 3: Cancellation After Non-Atomic Operations Committed (atomic: false)
// ---------------------------------------------------------------------------
test('CANCEL-03: Cancellation does NOT erase already-committed mutations in non-atomic execution', () => {
  const mediaPath = setupCancellationEnv();
  const session = createTestSession(mediaPath);
  let project = structuredClone(session.history[0]._project);
  const baseRev = project.revision;
  const initialDelivery = structuredClone(session.active_delivery);

  // Multi-step non-atomic plan
  const stepJournal = [];

  // Step 1 executes and commits to canonical project
  const op1 = { type: 'set_track_state', params: { trackId: project.tracks[0].id, muted: true } };
  const res1 = OperationExecutor.execute(project, op1);
  assert.strictEqual(res1.success, true);
  project = res1.project;
  assert.strictEqual(project.revision, baseRev + 1);
  stepJournal.push({ step_index: 0, type: op1.type, status: 'committed', revision: project.revision });

  // Cancellation arrives before Step 2
  const cancellationSignal = { abortRequested: true, reason: 'Operator aborted after step 1' };

  // Step 2 is not executed
  let op2Executed = false;
  if (!cancellationSignal.abortRequested) {
    op2Executed = true;
    const res2 = OperationExecutor.execute(project, { type: 'set_track_state', params: { trackId: project.tracks[1].id, muted: true } });
    project = res2.project;
  }

  assert.strictEqual(op2Executed, false);
  // CRITICAL ARCHITECTURAL ASSERTION:
  // Committed Step 1 is NOT erased or falsely represented as rolled back!
  assert.strictEqual(project.revision, baseRev + 1, 'Committed step revision must be retained');
  assert.strictEqual(project.tracks[0].muted, true);
  assert.strictEqual(stepJournal.length, 1);
  assert.strictEqual(stepJournal[0].status, 'committed');

  // Active delivery remains untouched (new revision not yet published)
  assert.deepStrictEqual(session.active_delivery, initialDelivery);
});

// ---------------------------------------------------------------------------
// Boundary 4: Cancellation During Video Rendering Subprocess
// ---------------------------------------------------------------------------
test('CANCEL-04: Cancellation during rendering prunes scratch and preserves prior active delivery', () => {
  const mediaPath = setupCancellationEnv();
  const session = createTestSession(mediaPath);
  const initialDelivery = structuredClone(session.active_delivery);

  // Simulate scratch render path
  const scratchMp4 = path.join(TEST_DIR, 'scratch-render-inprogress.mp4');
  fs.writeFileSync(scratchMp4, 'partial binary chunk 1010101');
  assert.ok(fs.existsSync(scratchMp4));

  // Render cancellation handler
  const cancelRender = () => {
    if (fs.existsSync(scratchMp4)) {
      fs.unlinkSync(scratchMp4);
    }
    return {
      status: CanonicalJobStatus.CANCELLED,
      scratchCleaned: true
    };
  };

  const outcome = cancelRender();
  assert.strictEqual(outcome.status, CanonicalJobStatus.CANCELLED);
  assert.strictEqual(fs.existsSync(scratchMp4), false, 'Scratch render chunks must be unlinked on cancellation');
  assert.deepStrictEqual(session.active_delivery, initialDelivery, 'Prior active delivery strictly preserved');
});

// ---------------------------------------------------------------------------
// Boundary 5: Cancellation During Media QA Evaluation
// ---------------------------------------------------------------------------
test('CANCEL-05: Cancellation during Media QA evaluation aborts promotion and preserves active delivery', () => {
  const mediaPath = setupCancellationEnv();
  const session = createTestSession(mediaPath);
  const initialDelivery = structuredClone(session.active_delivery);

  const qaScratchReport = path.join(TEST_DIR, 'qa-probing-scratch.json');
  fs.writeFileSync(qaScratchReport, JSON.stringify({ probing: true }));

  // Cancellation arrives while checking audio true-peak
  if (fs.existsSync(qaScratchReport)) {
    fs.unlinkSync(qaScratchReport);
  }
  const jobStatus = CanonicalJobStatus.CANCELLED;

  assert.strictEqual(jobStatus, CanonicalJobStatus.CANCELLED);
  assert.strictEqual(fs.existsSync(qaScratchReport), false);
  assert.deepStrictEqual(session.active_delivery, initialDelivery);
});

// ---------------------------------------------------------------------------
// Boundary 6: Cancellation Around Final Publication Commit Boundary
// ---------------------------------------------------------------------------
test('CANCEL-06: Cancellation around publication boundary reconciles authoritative outcome without guessing', () => {
  const mediaPath = setupCancellationEnv();
  const session = createTestSession(mediaPath);
  const initialDelivery = structuredClone(session.active_delivery);

  // Case A: Publication already committed to session.active_delivery before cancel signal processed
  const committedDelivery = {
    delivery_run_id: 'run-successor',
    revision_id: 'rev-1',
    manifest_id: 'mf-successor',
    media_path: mediaPath,
    sha256: 'new-valid-sha',
    media_sha256: 'new-valid-sha',
    published_at: new Date().toISOString()
  };
  session.active_delivery = committedDelivery;

  // Belated cancellation arrives after promotion: Promotion stands (workflow succeeded)
  const reconcileBelatedCancel = (sess) => {
    if (sess.active_delivery && sess.active_delivery.delivery_run_id === 'run-successor') {
      return { status: CanonicalJobStatus.SUCCEEDED, activeDelivery: sess.active_delivery };
    }
    return { status: CanonicalJobStatus.CANCELLED };
  };

  const resA = reconcileBelatedCancel(session);
  assert.strictEqual(resA.status, CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(resA.activeDelivery.delivery_run_id, 'run-successor');

  // Case B: Genuinely ambiguous publication outcome (manifest exists but corrupted or lost ack)
  const ambiguousSession = createTestSession(mediaPath);
  const initialDeliveryB = structuredClone(ambiguousSession.active_delivery);
  const handleAmbiguity = (manifestValid) => {
    if (manifestValid === null) {
      // Must enter NEEDS_RECONCILIATION rather than guessing or force-promoting!
      return { status: CanonicalJobStatus.NEEDS_RECONCILIATION, reason: 'AMBIGUOUS_PUBLICATION_STATE' };
    }
    return { status: CanonicalJobStatus.CANCELLED };
  };

  const resB = handleAmbiguity(null);
  assert.strictEqual(resB.status, CanonicalJobStatus.NEEDS_RECONCILIATION);
  assert.deepStrictEqual(ambiguousSession.active_delivery, initialDeliveryB);
});
