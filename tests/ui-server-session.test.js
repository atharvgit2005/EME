/**
 * Editing Mechanics Engine (EME) - Phase PF-10 Stage 1 Integration Test Battery
 * Authoritative Visual Control Surface Session & Media Streaming Endpoints
 *
 * Verifies the 6 mandatory architectural refinements from ChatGPT:
 * 1. Hardened media streaming (/api/media): Authorized artifacts only, realpath validation,
 *    path traversal rejection, HTTP 206 byte-range seeking, HTTP 416 on invalid bounds.
 * 2. Engine source of truth for diffs (/api/session/diff): Derived from actual project snapshots,
 *    returns 422 DIFF_UNAVAILABLE if snapshots missing.
 * 3. Authoritative revision graph (/api/session/history): Full DAG with explicit predecessor IDs,
 *    committed vs failed statuses, and active flags.
 * 4. Concurrency & mutex safeguards: Requires expectedVersion on mutations, rejects stale versions
 *    with 409 STALE_VERSION, serializes in-flight mutations with 409 CONFLICT.
 * 5. Candidate eligibility gate (/api/session/select): Requires status === 'verified' and QA >= 80,
 *    rejects ineligible candidates with 422 NOT_ELIGIBLE.
 * 6. Safe inspection mode: Historical timeline projection (/api/timeline?revisionId=...) does not
 *    mutate the active delivery pointer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');

const { EditorBackend } = require('../src/ui/server.js');
const {
  BriefValidator,
  CandidateOrchestrator,
  RevisionSessionManager,
  OperationPlanCompiler
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/pf10-test-deliverables');

const { spawnSync } = require('node:child_process');

// Helper to ensure clean media for test runs
function setupTestMedia(targetDir = TEST_OUT_DIR) {
  fs.mkdirSync(targetDir, { recursive: true });
  const cleanMp4Path = path.join(targetDir, 'clean-12s.mp4');

  if (!fs.existsSync(cleanMp4Path)) {
    const rootClean = path.join('artifacts/pf08-test-deliverables', 'clean-12s.mp4');
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

// Helper to ensure dummy media file exists
function ensureDummyMedia(fileName = 'sample-delivery.mp4') {
  fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  const p = path.join(TEST_OUT_DIR, fileName);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, Buffer.from('FAKE-MP4-STREAMING-MEDIA-HEADER-PAYLOAD-FOR-TESTING-1234567890'));
  }
  return p;
}

// HTTP request helper
function requestHttp(port, method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path: reqPath,
      method,
      headers: { ...headers }
    };

    let payload = null;
    if (body !== null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        const text = rawBuffer.toString('utf8');
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = text;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          rawBuffer
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function getJson(port, reqPath, headers = {}) {
  return requestHttp(port, 'GET', reqPath, null, headers);
}

function postJson(port, reqPath, body, headers = {}) {
  return requestHttp(port, 'POST', reqPath, body, headers);
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

test('PF10-S1.1: Session Read & Lifecycle Contract (GET /api/session)', async () => {
  const port = 4401;
  const backend = new EditorBackend({ port, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Without session, returns 404 NOT_FOUND
    const resNoSes = await getJson(port, '/api/session');
    assert.strictEqual(resNoSes.status, 404);
    assert.strictEqual(resNoSes.data.errorCode, 'NOT_FOUND');

    // 2. Start with an active session
    const executedProject = createBaseExecutedProject();
    const session = RevisionSessionManager.createSession({
      prompt: 'Build test video',
      brief: scenario1Brief,
      project: executedProject,
      outputDir: TEST_OUT_DIR
    });
    backend.activeSession = session;

    const resSes = await getJson(port, '/api/session');
    assert.strictEqual(resSes.status, 200);
    assert.strictEqual(resSes.data.success, true);
    assert.strictEqual(resSes.data.session.session_id, session.session_id);
    assert.strictEqual(resSes.data.session.state, 'initialized');
    assert.strictEqual(resSes.data.session.concurrency.version, 0);
    assert.strictEqual(resSes.data.session.undo_redo.canUndo, false);
    assert.strictEqual(resSes.data.session.undo_redo.canRedo, false);
    assert.strictEqual(resSes.data.session.history_count, 0);
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.2: Session Initialization Contract (POST /api/session/init)', async () => {
  const port = 4402;
  const backend = new EditorBackend({ port, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Empty body rejects with 400 VALIDATION_ERROR
    const resEmpty = await postJson(port, '/api/session/init', {});
    assert.strictEqual(resEmpty.status, 400);
    assert.strictEqual(resEmpty.data.errorCode, 'VALIDATION_ERROR');

    // 2. Invalid brief rejects with 400 VALIDATION_ERROR
    const resBadBrief = await postJson(port, '/api/session/init', { brief: { invalid: true } });
    assert.strictEqual(resBadBrief.status, 400);
    assert.strictEqual(resBadBrief.data.errorCode, 'VALIDATION_ERROR');

    // 3. Valid brief initializes session, returns 201
    const resInit = await postJson(port, '/api/session/init', {
      prompt: 'Create brand video',
      brief: scenario1Brief
    });
    assert.strictEqual(resInit.status, 201);
    assert.strictEqual(resInit.data.success, true);
    assert.ok(resInit.data.session.session_id.startsWith('ses-'));
    assert.strictEqual(resInit.data.session.state, 'initialized');
    assert.strictEqual(backend.activeSession.session_id, resInit.data.session.session_id);
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.3: Candidate Reading & Eligibility Gate (GET /api/candidates, POST /api/session/select)', async () => {
  const port = 4403;
  const executedProject = createBaseExecutedProject();
  const mediaPath = ensureDummyMedia('cand-media.mp4');
  const dummySha = crypto.createHash('sha256').update(fs.readFileSync(mediaPath)).digest('hex');

  const candidateSet = {
    schema_version: '1.0.0',
    candidate_set_id: 'cset-a1b2c3d4e5f6',
    request: { brief_id: 'brief-01' },
    selection: { selected_candidate_id: null },
    candidates: [
      {
        candidate_id: 'cand-verified-top',
        profile_id: 'dynamic',
        variation_profile: { name: 'Dynamic Montage' },
        status: 'verified',
        qa_summary: { score: 100, status: 'pass' },
        alignment_scores: { composite: 0.92, rank: 1 },
        deliverable: { manifest_id: 'manifest-top', media_path: mediaPath, sha256: dummySha },
        plan_summary: { operations_count: 5, target_duration_ticks: 1440000 },
        execution: { status: 'committed', executed_steps: 1, base_revision: 0, final_revision: 1, journal_path: null },
        canonical_plan_hash: 'hash-top',
        _executedProject: executedProject
      },
      {
        candidate_id: 'cand-low-qa',
        profile_id: 'experimental',
        variation_profile: { name: 'Experimental Cut' },
        status: 'verified',
        qa_summary: { score: 75, status: 'warn' }, // QA < 80 => INELIGIBLE!
        alignment_scores: { composite: 0.95, rank: 2 },
        deliverable: { manifest_id: 'manifest-low', media_path: mediaPath, sha256: dummySha },
        plan_summary: { operations_count: 8, target_duration_ticks: 1440000 },
        execution: { status: 'committed', executed_steps: 1, base_revision: 0, final_revision: 1, journal_path: null },
        canonical_plan_hash: 'hash-low',
        _executedProject: executedProject
      },
      {
        candidate_id: 'cand-unverified-failed',
        profile_id: 'cinematic',
        variation_profile: { name: 'Cinematic Flow' },
        status: 'failed', // status !== verified => INELIGIBLE!
        qa_summary: { score: 0, status: 'fail' },
        alignment_scores: { composite: 0.10, rank: 3 },
        deliverable: null,
        plan_summary: { operations_count: 0, target_duration_ticks: 1440000 },
        execution: { status: 'failed', executed_steps: 0, base_revision: 0, final_revision: 0, journal_path: null },
        canonical_plan_hash: 'hash-fail',
        _executedProject: null
      }
    ]
  };
  candidateSet._fullCandidates = candidateSet.candidates;

  const session = RevisionSessionManager.createSession({
    prompt: 'Candidate test session',
    brief: scenario1Brief,
    project: executedProject,
    candidateSetDoc: candidateSet,
    outputDir: TEST_OUT_DIR
  });

  const backend = new EditorBackend({
    port,
    session,
    candidateSet,
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  try {
    // 1. GET /api/candidates returns candidate matrix and eligibility flags
    const resCands = await getJson(port, '/api/candidates');
    assert.strictEqual(resCands.status, 200);
    assert.strictEqual(resCands.data.candidates.length, 3);

    const top = resCands.data.candidates.find(c => c.candidate_id === 'cand-verified-top');
    const low = resCands.data.candidates.find(c => c.candidate_id === 'cand-low-qa');
    const unverified = resCands.data.candidates.find(c => c.candidate_id === 'cand-unverified-failed');

    assert.strictEqual(top.isEligible, true);
    assert.strictEqual(low.isEligible, false); // Rejected by QA < 80
    assert.strictEqual(unverified.isEligible, false); // Rejected by status !== 'verified'

    // 2. Selecting non-existent candidate returns 404
    const resNonExistent = await postJson(port, '/api/session/select', { candidateId: 'cand-unknown' });
    assert.strictEqual(resNonExistent.status, 404);
    assert.strictEqual(resNonExistent.data.errorCode, 'NOT_FOUND');

    // 3. Selecting candidate with QA < 80 fails closed with 422 NOT_ELIGIBLE (Refinement 5)
    const resSelectLow = await postJson(port, '/api/session/select', { candidateId: 'cand-low-qa' });
    assert.strictEqual(resSelectLow.status, 422);
    assert.strictEqual(resSelectLow.data.errorCode, 'NOT_ELIGIBLE');

    // 4. Selecting unverified candidate fails closed with 422 NOT_ELIGIBLE (Refinement 5)
    const resSelectUnv = await postJson(port, '/api/session/select', { candidateId: 'cand-unverified-failed' });
    assert.strictEqual(resSelectUnv.status, 422);
    assert.strictEqual(resSelectUnv.data.errorCode, 'NOT_ELIGIBLE');

    // 5. Selecting verified candidate with QA >= 80 succeeds and binds active delivery
    const resSelectTop = await postJson(port, '/api/session/select', {
      candidateId: 'cand-verified-top',
      expectedVersion: 0
    });
    assert.strictEqual(resSelectTop.status, 200);
    assert.strictEqual(resSelectTop.data.success, true);
    assert.strictEqual(resSelectTop.data.session.state, 'ready');
    assert.strictEqual(resSelectTop.data.active_delivery.revision_id, 'rev-0');
    assert.strictEqual(resSelectTop.data.active_delivery.manifest_id, 'manifest-top');
    assert.strictEqual(resSelectTop.data.session.concurrency.version, 1);
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.4: Concurrency & Mutex Safeguards (POST /api/session/revise)', async () => {
  const port = 4404;
  const executedProject = createBaseExecutedProject();
  const session = RevisionSessionManager.createSession({
    prompt: 'Concurrency test',
    brief: scenario1Brief,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });

  const mediaPath = ensureDummyMedia('concurrency-rev0.mp4');
  const dummySha = crypto.createHash('sha256').update(fs.readFileSync(mediaPath)).digest('hex');

  // Manually bind rev-0 delivery
  session.active_delivery = {
    delivery_run_id: 'run-init',
    manifest_id: 'manifest-0',
    media_path: mediaPath,
    sha256: dummySha,
    revision_id: 'rev-0',
    activated_at: new Date().toISOString()
  };
  session.history.push({
    revision_id: 'rev-0',
    predecessor_id: null,
    prompt: 'Initial build',
    status: 'committed',
    plan_hash: 'hash-0',
    manifest_id: 'manifest-0',
    delivery_run_id: 'run-init',
    media_sha256: dummySha,
    media_path: mediaPath,
    project_path: path.join(TEST_OUT_DIR, `${session.session_id}-rev-0-project.json`),
    operations_count: 1,
    qa_score: 100,
    timestamp: new Date().toISOString(),
    error: null,
    _project: executedProject
  });
  session.undo_redo.current_revision_id = 'rev-0';
  session.state = 'ready';
  session.concurrency.version = 5;

  const backend = new EditorBackend({
    port,
    session,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  try {
    // 1. Missing expectedVersion returns 400 VALIDATION_ERROR
    const resNoVer = await postJson(port, '/api/session/revise', { prompt: 'Make it faster' });
    assert.strictEqual(resNoVer.status, 400);
    assert.strictEqual(resNoVer.data.errorCode, 'VALIDATION_ERROR');

    // 2. Stale expectedVersion returns 409 STALE_VERSION (Refinement 4)
    const resStale = await postJson(port, '/api/session/revise', {
      prompt: 'Make it faster',
      expectedVersion: 4 // Stale! Current is 5
    });
    assert.strictEqual(resStale.status, 409);
    assert.strictEqual(resStale.data.errorCode, 'STALE_VERSION');

    // 3. Mutex conflict simulation (isMutating = true)
    backend.isMutating = true;
    const resConflict = await postJson(port, '/api/session/revise', {
      prompt: 'Make it faster',
      expectedVersion: 5
    });
    assert.strictEqual(resConflict.status, 409);
    assert.strictEqual(resConflict.data.errorCode, 'CONFLICT');
    backend.isMutating = false;
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.5: Conversational Revision Execution & Failure Isolation (POST /api/session/revise)', async () => {
  const port = 4405;
  const cleanMp4 = setupTestMedia(TEST_OUT_DIR);
  const executedProject = createBaseExecutedProject();
  const session = RevisionSessionManager.createSession({
    prompt: 'Revision execution test',
    brief: scenario1Brief,
    project: structuredClone(scenario1Project),
    outputDir: TEST_OUT_DIR
  });

  const mediaPath = cleanMp4;
  const dummySha = '5555555555555555555555555555555555555555555555555555555555555555';

  // Establish rev-0
  const rev0ProjectPath = path.join(TEST_OUT_DIR, `${session.session_id}-rev-0-project.json`);
  fs.writeFileSync(rev0ProjectPath, JSON.stringify(executedProject, null, 2), 'utf8');

  session.active_delivery = {
    delivery_run_id: 'run-base',
    manifest_id: 'manifest-base',
    media_path: mediaPath,
    sha256: dummySha,
    revision_id: 'rev-0',
    activated_at: new Date().toISOString()
  };
  session.history.push({
    revision_id: 'rev-0',
    predecessor_id: null,
    prompt: 'Initial delivery',
    status: 'committed',
    plan_hash: 'hash-base',
    manifest_id: 'manifest-base',
    delivery_run_id: 'run-base',
    media_sha256: dummySha,
    media_path: mediaPath,
    project_path: rev0ProjectPath,
    operations_count: 2,
    qa_score: 100,
    timestamp: new Date().toISOString(),
    error: null,
    _project: executedProject
  });
  session.undo_redo.current_revision_id = 'rev-0';
  session.state = 'ready';
  session.concurrency.version = 1;

  const backend = new EditorBackend({
    port,
    session,
    project: structuredClone(scenario1Project),
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  try {
    // 1. Valid natural-language revision that succeeds
    const resRevSuccess = await postJson(port, '/api/session/revise', {
      prompt: 'Move headline title 2 seconds later on track_graphics. Preserve existing clip order, soundtrack, and total duration.',
      expectedVersion: 1
    });

    assert.strictEqual(resRevSuccess.status, 200);
    assert.strictEqual(resRevSuccess.data.success, true);
    assert.strictEqual(resRevSuccess.data.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(backend.activeSession.concurrency.version, 2);
    assert.strictEqual(backend.activeSession.undo_redo.undo_stack.length, 1);
    assert.strictEqual(backend.activeSession.undo_redo.undo_stack[0], 'rev-0');

    // Check project snapshot persistence (Refinement 2)
    const rev1Hist = backend.activeSession.history.find(h => h.revision_id === 'rev-1');
    assert.ok(rev1Hist.project_path);
    assert.ok(fs.existsSync(rev1Hist.project_path));

    // 2. Invalid revision violating hard constraints fails verification
    // Notice: The prior verified delivery (rev-1) MUST REMAIN ACTIVE!
    const resRevFail = await postJson(port, '/api/session/revise', {
      prompt: 'Change overall video duration to 60 seconds', // Violates hard duration constraint!
      expectedVersion: 2
    });

    assert.strictEqual(resRevFail.status, 422);
    assert.strictEqual(resRevFail.data.errorCode, 'VERIFICATION_FAILED');
    // Unbreakable Invariant: Active delivery remains untouched at rev-1!
    assert.strictEqual(resRevFail.data.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(backend.activeSession.state, 'ready');
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.6: Authoritative Session Undo and Redo (POST /api/session/undo, POST /api/session/redo)', async () => {
  const port = 4406;
  const executedProject = createBaseExecutedProject();
  const session = RevisionSessionManager.createSession({
    prompt: 'Undo/Redo session test',
    brief: scenario1Brief,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });

  const media0 = ensureDummyMedia('undo-rev0.mp4');
  const media1 = ensureDummyMedia('undo-rev1.mp4');
  const sha0 = crypto.createHash('sha256').update(fs.readFileSync(media0)).digest('hex');
  const sha1 = crypto.createHash('sha256').update(fs.readFileSync(media1)).digest('hex');

  session.history.push({
    revision_id: 'rev-0',
    predecessor_id: null,
    prompt: 'Initial delivery',
    status: 'committed',
    plan_hash: 'hash-0',
    manifest_id: 'manifest-0',
    delivery_run_id: 'run-0',
    media_sha256: sha0,
    media_path: media0,
    project_path: null,
    operations_count: 1,
    qa_score: 100,
    timestamp: new Date().toISOString(),
    error: null,
    _project: executedProject
  });

  session.history.push({
    revision_id: 'rev-1',
    predecessor_id: 'rev-0',
    prompt: 'Move title later',
    status: 'committed',
    plan_hash: 'hash-1',
    manifest_id: 'manifest-1',
    delivery_run_id: 'run-1',
    media_sha256: sha1,
    media_path: media1,
    project_path: null,
    operations_count: 2,
    qa_score: 100,
    timestamp: new Date().toISOString(),
    error: null,
    _project: executedProject
  });

  session.active_delivery = {
    delivery_run_id: 'run-1',
    manifest_id: 'manifest-1',
    media_path: media1,
    sha256: sha1,
    revision_id: 'rev-1',
    activated_at: new Date().toISOString()
  };
  session.undo_redo.current_revision_id = 'rev-1';
  session.undo_redo.undo_stack = ['rev-0'];
  session.undo_redo.redo_stack = [];
  session.state = 'ready';
  session.concurrency.version = 2;

  const backend = new EditorBackend({
    port,
    session,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  try {
    // 1. Undo with stale version returns 409
    const resUndoStale = await postJson(port, '/api/session/undo', { expectedVersion: 99 });
    assert.strictEqual(resUndoStale.status, 409);
    assert.strictEqual(resUndoStale.data.errorCode, 'STALE_VERSION');

    // 2. Undo restores rev-0 as active delivery
    const resUndo = await postJson(port, '/api/session/undo', { expectedVersion: 2 });
    assert.strictEqual(resUndo.status, 200);
    assert.strictEqual(resUndo.data.restoredDelivery.revision_id, 'rev-0');
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-0');
    assert.strictEqual(backend.activeSession.undo_redo.undo_stack.length, 0);
    assert.strictEqual(backend.activeSession.undo_redo.redo_stack.length, 1);
    assert.strictEqual(backend.activeSession.undo_redo.redo_stack[0], 'rev-1');

    // 3. Repeated undo when stack empty returns 400 NOTHING_TO_UNDO
    const resEmptyUndo = await postJson(port, '/api/session/undo', {});
    assert.strictEqual(resEmptyUndo.status, 400);
    assert.strictEqual(resEmptyUndo.data.errorCode, 'NOTHING_TO_UNDO');

    // 4. Redo restores rev-1 as active delivery
    const resRedo = await postJson(port, '/api/session/redo', {});
    assert.strictEqual(resRedo.status, 200);
    assert.strictEqual(resRedo.data.restoredDelivery.revision_id, 'rev-1');
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(backend.activeSession.undo_redo.undo_stack.length, 1);
    assert.strictEqual(backend.activeSession.undo_redo.redo_stack.length, 0);

    // 5. Repeated redo when stack empty returns 400 NOTHING_TO_REDO
    const resEmptyRedo = await postJson(port, '/api/session/redo', {});
    assert.strictEqual(resEmptyRedo.status, 400);
    assert.strictEqual(resEmptyRedo.data.errorCode, 'NOTHING_TO_REDO');
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.7: Crash Recovery Endpoint (POST /api/session/recover)', async () => {
  const port = 4407;
  const executedProject = createBaseExecutedProject();
  const session = RevisionSessionManager.createSession({
    prompt: 'Crash recovery session',
    brief: scenario1Brief,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });

  const mediaPath = ensureDummyMedia('recover-base.mp4');
  const dummySha = crypto.createHash('sha256').update(fs.readFileSync(mediaPath)).digest('hex');

  session.active_delivery = {
    delivery_run_id: 'run-recover-0',
    manifest_id: 'manifest-rec-0',
    media_path: mediaPath,
    sha256: dummySha,
    revision_id: 'rev-0',
    activated_at: new Date().toISOString()
  };

  // Simulate an interrupted in-flight transaction
  const txId = 'tx-test-crash';
  const checkpointPath = path.join(TEST_OUT_DIR, `${session.session_id}-${txId}-checkpoint.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify({
    session_id: session.session_id,
    transaction_id: txId,
    predecessor_revision_id: 'rev-0',
    active_delivery: session.active_delivery,
    timestamp: new Date().toISOString()
  }, null, 2), 'utf8');

  session.state = 'verifying'; // Crashed during verification!
  session.recovery.status = 'in_flight';
  session.recovery.pending_transaction_id = txId;
  session.recovery.checkpoint_path = checkpointPath;

  const backend = new EditorBackend({
    port,
    session,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  try {
    const resRecover = await postJson(port, '/api/session/recover', {});
    assert.strictEqual(resRecover.status, 200);
    assert.strictEqual(resRecover.data.success, true);
    assert.strictEqual(resRecover.data.session.state, 'ready');
    assert.strictEqual(resRecover.data.session.recovery.status, 'clean');
    assert.strictEqual(resRecover.data.active_delivery.revision_id, 'rev-0');
    // Checkpoint cleaned up
    assert.strictEqual(fs.existsSync(checkpointPath), false);
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.8: Authoritative History DAG Graph (GET /api/session/history)', async () => {
  const port = 4408;
  const executedProject = createBaseExecutedProject();
  const session = RevisionSessionManager.createSession({
    prompt: 'History DAG test',
    brief: scenario1Brief,
    project: executedProject,
    outputDir: TEST_OUT_DIR
  });

  session.history = [
    {
      revision_id: 'rev-0',
      predecessor_id: null,
      prompt: 'Initial build',
      status: 'committed',
      plan_hash: 'hash-0',
      manifest_id: 'manifest-0',
      delivery_run_id: 'run-0',
      media_sha256: 'sha-0',
      media_path: 'media-0.mp4',
      project_path: null,
      operations_count: 3,
      qa_score: 100,
      timestamp: '2026-10-19T10:00:00Z',
      error: null
    },
    {
      revision_id: 'rev-1',
      predecessor_id: 'rev-0',
      prompt: 'Invalid prompt attempt',
      status: 'failed',
      plan_hash: 'hash-none',
      manifest_id: null,
      delivery_run_id: 'run-1',
      media_sha256: null,
      media_path: null,
      project_path: null,
      operations_count: 0,
      qa_score: 0,
      timestamp: '2026-10-19T10:05:00Z',
      error: 'Invariant violated'
    },
    {
      revision_id: 'rev-2',
      predecessor_id: 'rev-0', // Branched off rev-0
      prompt: 'Adjust color grade and title',
      status: 'committed',
      plan_hash: 'hash-2',
      manifest_id: 'manifest-2',
      delivery_run_id: 'run-2',
      media_sha256: 'sha-2',
      media_path: 'media-2.mp4',
      project_path: null,
      operations_count: 4,
      qa_score: 95,
      timestamp: '2026-10-19T10:10:00Z',
      error: null
    }
  ];

  session.active_delivery = {
    delivery_run_id: 'run-2',
    manifest_id: 'manifest-2',
    media_path: 'media-2.mp4',
    sha256: 'sha-2',
    revision_id: 'rev-2',
    activated_at: '2026-10-19T10:10:00Z'
  };
  session.undo_redo.current_revision_id = 'rev-2';

  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    const resHist = await getJson(port, '/api/session/history');
    assert.strictEqual(resHist.status, 200);
    assert.strictEqual(resHist.data.history.length, 3);

    const r0 = resHist.data.history.find(h => h.revision_id === 'rev-0');
    const r1 = resHist.data.history.find(h => h.revision_id === 'rev-1');
    const r2 = resHist.data.history.find(h => h.revision_id === 'rev-2');

    assert.strictEqual(r0.predecessor_id, null);
    assert.strictEqual(r0.status, 'committed');
    assert.strictEqual(r0.isActive, false);

    assert.strictEqual(r1.predecessor_id, 'rev-0');
    assert.strictEqual(r1.status, 'failed');
    assert.strictEqual(r1.error, 'Invariant violated');
    assert.strictEqual(r1.isActive, false);

    assert.strictEqual(r2.predecessor_id, 'rev-0');
    assert.strictEqual(r2.status, 'committed');
    assert.strictEqual(r2.isActive, true); // Active delivery flag!
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.9: Snapshot-Derived Diff & Missing Diff Protection (GET /api/session/diff)', async () => {
  const port = 4409;
  const project0 = createBaseExecutedProject();
  const project1 = structuredClone(project0);

  // Modify a clip in project1
  const clip1 = project1.clips.find(c => c.id === 'clip_1');
  clip1.startTick += 240000; // Shift by 2 seconds
  clip1.durationTicks -= 60000;

  const session = RevisionSessionManager.createSession({
    prompt: 'Diff test session',
    brief: scenario1Brief,
    project: project0,
    outputDir: TEST_OUT_DIR
  });

  const p0Path = path.join(TEST_OUT_DIR, `${session.session_id}-rev-0-project.json`);
  const p1Path = path.join(TEST_OUT_DIR, `${session.session_id}-rev-1-project.json`);
  fs.writeFileSync(p0Path, JSON.stringify(project0, null, 2), 'utf8');
  fs.writeFileSync(p1Path, JSON.stringify(project1, null, 2), 'utf8');

  session.history = [
    {
      revision_id: 'rev-0',
      predecessor_id: null,
      prompt: 'Initial delivery',
      status: 'committed',
      project_path: p0Path,
      _project: project0
    },
    {
      revision_id: 'rev-1',
      predecessor_id: 'rev-0',
      prompt: 'Shift title later',
      status: 'committed',
      project_path: p1Path,
      _project: project1
    },
    {
      revision_id: 'rev-missing-snap',
      predecessor_id: 'rev-1',
      prompt: 'Snapshot lost',
      status: 'committed',
      project_path: null // No snapshot available!
    }
  ];

  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Missing query params returns 400 VALIDATION_ERROR
    const resNoParams = await getJson(port, '/api/session/diff');
    assert.strictEqual(resNoParams.status, 400);
    assert.strictEqual(resNoParams.data.errorCode, 'VALIDATION_ERROR');

    // 2. Unknown revision returns 404 NOT_FOUND
    const resUnknown = await getJson(port, '/api/session/diff?fromRev=rev-0&toRev=rev-99');
    assert.strictEqual(resUnknown.status, 404);
    assert.strictEqual(resUnknown.data.errorCode, 'NOT_FOUND');

    // 3. Valid revisions return structural diff (Refinement 2)
    const resDiff = await getJson(port, '/api/session/diff?fromRev=rev-0&toRev=rev-1');
    assert.strictEqual(resDiff.status, 200);
    assert.strictEqual(resDiff.data.success, true);
    assert.strictEqual(resDiff.data.diff.modifiedClips.length, 1);
    const modClip = resDiff.data.diff.modifiedClips[0];
    assert.strictEqual(modClip.clipId, 'clip_1');
    assert.strictEqual(modClip.startTick.deltaTicks, 240000);
    assert.strictEqual(modClip.startTick.deltaSec, 2.0);
    assert.strictEqual(modClip.durationTicks.deltaTicks, -60000);

    // 4. Missing snapshot fails closed with 422 DIFF_UNAVAILABLE (Refinement 2)
    const resDiffUnavail = await getJson(port, '/api/session/diff?fromRev=rev-0&toRev=rev-missing-snap');
    assert.strictEqual(resDiffUnavail.status, 422);
    assert.strictEqual(resDiffUnavail.data.errorCode, 'DIFF_UNAVAILABLE');
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.10: Hardened Media Streaming & Safe Range Seeking (GET /api/media)', async () => {
  const port = 4410;
  const mediaPath = ensureDummyMedia('authorized-stream-test.mp4');
  const mediaContent = fs.readFileSync(mediaPath);
  const totalBytes = mediaContent.length;

  const backend = new EditorBackend({ port, outputDir: TEST_OUT_DIR });
  // Register media under both ID and file path
  backend._registerMediaFile('artifact-test-mp4', mediaPath);
  await backend.start();

  try {
    // 1. Missing id and path returns 400 VALIDATION_ERROR
    const resNoParams = await getJson(port, '/api/media');
    assert.strictEqual(resNoParams.status, 400);
    assert.strictEqual(resNoParams.data.errorCode, 'VALIDATION_ERROR');

    // 2. Path traversal attack (Refinement 1) is rejected with 403 FORBIDDEN
    const resTraversal = await getJson(port, '/api/media?path=../../package.json');
    assert.strictEqual(resTraversal.status, 403);
    assert.strictEqual(resTraversal.data.errorCode, 'FORBIDDEN');

    // 3. Un-authorized file (e.g. valid file in repo not registered in active session) rejected with 403
    const resUnauth = await getJson(port, '/api/media?path=package.json');
    assert.strictEqual(resUnauth.status, 403);
    assert.strictEqual(resUnauth.data.errorCode, 'FORBIDDEN');

    // 4. Authorized media requested by ID returns full file with 200 (Refinement 1)
    const resId = await getJson(port, '/api/media?id=artifact-test-mp4');
    assert.strictEqual(resId.status, 200);
    assert.strictEqual(resId.headers['content-type'], 'video/mp4');
    assert.strictEqual(parseInt(resId.headers['content-length'], 10), totalBytes);
    assert.strictEqual(resId.rawBuffer.toString('utf8'), mediaContent.toString('utf8'));

    // 5. Authorized media requested by safe path returns full file with 200
    const resPath = await getJson(port, `/api/media?path=${encodeURIComponent(mediaPath)}`);
    assert.strictEqual(resPath.status, 200);
    assert.strictEqual(parseInt(resPath.headers['content-length'], 10), totalBytes);

    // 6. Byte-range seeking (HTTP 206 Partial Content)
    const resRange = await getJson(port, `/api/media?id=artifact-test-mp4`, {
      Range: 'bytes=0-15'
    });
    assert.strictEqual(resRange.status, 206);
    assert.strictEqual(resRange.headers['content-range'], `bytes 0-15/${totalBytes}`);
    assert.strictEqual(parseInt(resRange.headers['content-length'], 10), 16);
    assert.strictEqual(resRange.rawBuffer.toString('utf8'), mediaContent.subarray(0, 16).toString('utf8'));

    // 7. Out-of-bounds byte range returns HTTP 416 Range Not Satisfiable (Refinement 1)
    const resBadRange = await getJson(port, `/api/media?id=artifact-test-mp4`, {
      Range: 'bytes=99999-99999'
    });
    assert.strictEqual(resBadRange.status, 416);
    assert.strictEqual(resBadRange.headers['content-range'], `bytes */${totalBytes}`);
  } finally {
    await backend.stop();
  }
});

test('PF10-S1.11: Safe Historical Inspection Mode on Timeline Surface (GET /api/timeline?revisionId=...)', async () => {
  const port = 4411;
  const project0 = createBaseExecutedProject();
  const project1 = structuredClone(project0);

  // In project1, clip_1 is moved
  const clip1 = project1.clips.find(c => c.id === 'clip_1');
  clip1.startTick = 120000;

  const session = RevisionSessionManager.createSession({
    prompt: 'Inspection mode test',
    brief: scenario1Brief,
    project: project0,
    outputDir: TEST_OUT_DIR
  });

  const p0Path = path.join(TEST_OUT_DIR, `${session.session_id}-rev-0-project.json`);
  const p1Path = path.join(TEST_OUT_DIR, `${session.session_id}-rev-1-project.json`);
  fs.writeFileSync(p0Path, JSON.stringify(project0, null, 2), 'utf8');
  fs.writeFileSync(p1Path, JSON.stringify(project1, null, 2), 'utf8');

  session.history = [
    {
      revision_id: 'rev-0',
      predecessor_id: null,
      prompt: 'Initial build',
      status: 'committed',
      project_path: p0Path,
      _project: project0
    },
    {
      revision_id: 'rev-1',
      predecessor_id: 'rev-0',
      prompt: 'Headline shift',
      status: 'committed',
      project_path: p1Path,
      _project: project1
    }
  ];

  // rev-1 is currently active!
  session.active_delivery = {
    delivery_run_id: 'run-1',
    manifest_id: 'manifest-1',
    media_path: 'media-1.mp4',
    sha256: 'sha-1',
    revision_id: 'rev-1',
    activated_at: new Date().toISOString()
  };

  const backend = new EditorBackend({
    port,
    session,
    project: project1,
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  try {
    // 1. Inspecting rev-0 timeline projection (Safe Read-Only Inspection Mode)
    const resTimelineRev0 = await getJson(port, '/api/timeline?revisionId=rev-0');
    assert.strictEqual(resTimelineRev0.status, 200);
    assert.strictEqual(resTimelineRev0.data.success, true);
    assert.strictEqual(resTimelineRev0.data.revisionId, 'rev-0');

    // Find clip_1 in rev-0 timeline projection
    const hClipRev0 = resTimelineRev0.data.timeline.clips.find(clip => clip.id === 'clip_1');
    assert.ok(hClipRev0);
    assert.strictEqual(hClipRev0.startTick, project0.clips.find(c => c.id === 'clip_1').startTick);

    // 2. Crucial Acceptance Gate: Active delivery MUST NOT be changed by historical inspection!
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});
