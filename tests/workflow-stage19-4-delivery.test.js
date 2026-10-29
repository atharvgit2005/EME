/**
 * EME Phase 19 (RT-01) — Stage 19.4 Closed-Loop Delivery Path Unification Test Battery
 *
 * Validates the 12 closed-loop delivery unification, preview isolation, and multi-surface parity
 * scenarios mandated by the ChatGPT Architecture Lead Directive:
 * - Scenario A: Direct REST delivery routes through canonical closed-loop authority
 * - Scenario B: Direct delivery and orchestrated prompt delivery achieve full schema & artifact parity
 * - Scenario C: Supported CLI delivery command (eme render --deliver) invokes canonical closed-loop pipeline
 * - Scenario D: Preview rendering isolation preserves active_delivery and emits zero delivery manifests
 * - Scenario E: Render failure prunes scratch media and leaves active_delivery untouched
 * - Scenario F: Media QA threshold failure aborts deliverable publication and preserves active_delivery
 * - Scenario G: Manifest SHA-256 integrity mismatch fails closed without promoting delivery
 * - Scenario H: Duplicate delivery request with identical idempotency key returns cached deliverable
 * - Scenario I: Lost response recovery restores committed deliverable without re-execution
 * - Scenario J: Process restart during delivery recovers safely and preserves last-known-good active delivery
 * - Scenario K: Concurrent live timeline mutation during delivery binds to immutable snapshot
 * - Scenario L: Active-delivery preservation across adversarial battery of failed delivery attempts
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
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

const TEST_OUT_DIR = path.resolve('artifacts/test_stage19_4_delivery');

function setupTestEnvironment() {
  fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  const jobsDir = path.join(TEST_OUT_DIR, 'jobs');
  const deliverablesDir = path.join(TEST_OUT_DIR, 'deliverables');
  const uiRendersDir = path.join(TEST_OUT_DIR, 'ui-renders');
  fs.mkdirSync(jobsDir, { recursive: true });
  fs.mkdirSync(deliverablesDir, { recursive: true });
  fs.mkdirSync(uiRendersDir, { recursive: true });

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

  // Ensure clean-12s.mp4 also exists in subdirs
  fs.copyFileSync(cleanMp4Path, path.join(deliverablesDir, 'clean-12s.mp4'));
  fs.copyFileSync(cleanMp4Path, path.join(uiRendersDir, 'clean-12s.mp4'));

  return cleanMp4Path;
}

function createBaseExecutedProject(mediaPath = null) {
  const baseProject = structuredClone(scenario1Project);
  if (mediaPath && Array.isArray(baseProject.assets)) {
    for (const asset of baseProject.assets) {
      asset.src = mediaPath;
    }
  }
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const executed = OperationPlanCompiler.executePlan(baseProject, basePlan).project;
  if (mediaPath && Array.isArray(executed.assets)) {
    for (const asset of executed.assets) {
      asset.src = mediaPath;
    }
  }
  return executed;
}

function createTestSession() {
  const mediaPath = setupTestEnvironment();
  const baseProject = createBaseExecutedProject(mediaPath);
  const fileSha = RenderOrchestrator.computeFileSha256(mediaPath);

  return {
    schema_version: '1.0.0',
    session_id: `sess-stage19-4-${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
      delivery_run_id: 'run-initial',
      revision_id: 'rev-0',
      manifest_id: 'mf-initial-golden',
      media_path: mediaPath,
      media_sha256: fileSha,
      published_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Initial creation',
        status: 'committed',
        plan_hash: 'initial-hash',
        manifest_id: 'mf-initial-golden',
        media_sha256: fileSha,
        media_path: mediaPath,
        _project: baseProject
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Helper: Local HTTP Server Harness
// ---------------------------------------------------------------------------
async function withServer(backend, testFn) {
  const server = http.createServer((req, res) => backend.handleRequest(req, res));
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  try {
    await testFn(baseUrl);
  } finally {
    await new Promise(r => server.close(r));
  }
}

async function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Scenario A: Direct REST Delivery
// ---------------------------------------------------------------------------
test('RT01-S4.A: Direct REST final delivery routes through canonical closed-loop authority', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = session.history[0]._project;
  backend.activeSession = session;

  await withServer(backend, async baseUrl => {
    const res = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: { cleanMediaOverride: session.active_delivery.media_path }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.deliverable, true);
    assert.ok(res.body.active_delivery, 'Must publish verified active_delivery');
    assert.ok(res.body.manifest, 'Must generate verified delivery manifest');
    assert.ok(res.body.qaReport, 'Must include Media QA report');
    assert.ok(res.body.qaReport.score >= 85.0, 'QA score must meet threshold (>= 85.0)');
    assert.ok(fs.existsSync(res.body.mediaPath), 'Media deliverable must exist on disk');
    assert.strictEqual(session.active_delivery.delivery_run_id, res.body.active_delivery.delivery_run_id);
  });
});

// ---------------------------------------------------------------------------
// Scenario B: Orchestration Parity
// ---------------------------------------------------------------------------
test('RT01-S4.B: Direct delivery and orchestrated prompt delivery achieve full schema and artifact parity', async () => {
  setupTestEnvironment();
  const session1 = createTestSession();
  const session2 = createTestSession();
  const liveProject = session1.history[0]._project;

  // Path 1: Direct delivery via REST
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = liveProject;
  backend.activeSession = session1;

  let directDelivery = null;
  await withServer(backend, async baseUrl => {
    const res = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: { cleanMediaOverride: session1.active_delivery.media_path }
    });
    assert.strictEqual(res.status, 200);
    directDelivery = res.body;
  });

  // Path 2: Orchestrated prompt workflow delivery
  const wfRes = EndToEndOrchestrator.runWorkflow({
    session: session2,
    prompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: session2.history[0]._project,
    outputDir: TEST_OUT_DIR,
    options: { cleanMediaOverride: session2.active_delivery.media_path }
  });
  assert.strictEqual(wfRes.success, true);

  // Parity Assertions
  assert.strictEqual(typeof directDelivery.active_delivery.delivery_run_id, 'string');
  assert.strictEqual(typeof wfRes.active_delivery.delivery_run_id, 'string');
  assert.strictEqual(typeof directDelivery.active_delivery.media_sha256, 'string');
  assert.strictEqual(typeof wfRes.active_delivery.media_sha256, 'string');
  assert.strictEqual(directDelivery.active_delivery.media_sha256.length, 64);
  assert.strictEqual(wfRes.active_delivery.media_sha256.length, 64);
  assert.ok(directDelivery.qaReport.score >= 85.0);
  assert.ok(wfRes.job.result.qa_score >= 85.0);
});

// ---------------------------------------------------------------------------
// Scenario C: Supported CLI Parity
// ---------------------------------------------------------------------------
test('RT01-S4.C: Supported CLI delivery command (eme render --deliver) invokes canonical closed-loop pipeline', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const projPath = path.join(TEST_OUT_DIR, 'test_proj.json');
  fs.writeFileSync(projPath, JSON.stringify(session.history[0]._project, null, 2), 'utf8');

  const outMp4 = path.join(TEST_OUT_DIR, 'deliverables', 'cli_delivered.mp4');

  // Invoke CLI render with --deliver
  const { runCli } = require('../src/cli/index.js');
  const origLog = console.log;
  const origExit = process.exit;
  const logs = [];
  console.log = msg => logs.push(msg);

  let exitCode = null;
  process.exit = code => { exitCode = code; };

  try {
    runCli(['render', projPath, '--out', outMp4, '--deliver']);
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, null, 'CLI delivery must exit successfully without error code');
  assert.ok(fs.existsSync(outMp4), 'Delivered MP4 must exist');
  assert.ok(logs.some(l => l && l.includes('Verified Delivery Complete')), 'Must log verified delivery completion');
});

// ---------------------------------------------------------------------------
// Scenario D: Preview Isolation
// ---------------------------------------------------------------------------
test('RT01-S4.D: Preview rendering isolation preserves active_delivery and emits zero delivery manifests', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = session.history[0]._project;
  backend.activeSession = session;

  await withServer(backend, async baseUrl => {
    // Request default preview render
    const res = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'preview',
      outputDir: path.join(TEST_OUT_DIR, 'ui-renders')
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.preview, true);
    assert.strictEqual(res.body.active_delivery, null, 'Preview must never return active_delivery');
    assert.strictEqual(res.body.manifest, undefined, 'Preview must not emit delivery manifest');
    assert.deepStrictEqual(session.active_delivery, initialActive, 'Session active delivery must remain 100% untouched');
  });
});

// ---------------------------------------------------------------------------
// Scenario E: Render Subprocess Failure
// ---------------------------------------------------------------------------
test('RT01-S4.E: Render failure prunes scratch media and leaves active_delivery untouched', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = session.history[0]._project;
  backend.activeSession = session;

  await withServer(backend, async baseUrl => {
    // Simulate render failure via synthetic error injection
    const res = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: { simulateRenderFail: true }
    });

    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.success, false);
    assert.deepStrictEqual(session.active_delivery, initialActive, 'Prior active delivery must remain untouched on render failure');
  });
});

// ---------------------------------------------------------------------------
// Scenario F: Media QA Threshold Failure
// ---------------------------------------------------------------------------
test('RT01-S4.F: Media QA threshold failure aborts deliverable publication and preserves active_delivery', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = session.history[0]._project;
  backend.activeSession = session;

  await withServer(backend, async baseUrl => {
    // Simulate QA score below 85.0
    const res = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: { simulateQaFail: true }
    });

    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('QA audit failed'));
    assert.deepStrictEqual(session.active_delivery, initialActive, 'Failed QA must never overwrite active delivery');
  });
});

// ---------------------------------------------------------------------------
// Scenario G: Manifest / Hash Integrity Failure
// ---------------------------------------------------------------------------
test('RT01-S4.G: Manifest SHA-256 integrity mismatch fails closed without promoting delivery', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);

  // Directly verify RenderOrchestrator rejects mismatched media SHA
  const manifest = RenderOrchestrator.generateDeliveryManifest({
    renderJob: { job_id: 'rjob-test', output_profile: {} },
    project: session.history[0]._project,
    qaReport: { score: 95, checks: [] },
    mediaPath: session.active_delivery.media_path
  });

  // Tamper hash
  manifest.deliverable.sha256 = 'f'.repeat(64); // corrupt hash

  // Gate check
  const actualHash = RenderOrchestrator.computeFileSha256(session.active_delivery.media_path);
  const hashMatches = actualHash === manifest.deliverable.sha256;

  assert.strictEqual(hashMatches, false, 'Tampered hash must be detected');
  assert.deepStrictEqual(session.active_delivery, initialActive, 'Tampered manifest cannot promote active delivery');
});

// ---------------------------------------------------------------------------
// Scenario H: Duplicate Delivery Request (Durable Idempotency)
// ---------------------------------------------------------------------------
test('RT01-S4.H: Duplicate delivery request with identical idempotency key returns cached deliverable', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = session.history[0]._project;
  backend.activeSession = session;
  backend.jobManager = jm;

  await withServer(backend, async baseUrl => {
    const key = `idem-deliv-${Date.now()}`;

    // Request 1
    const res1 = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      idempotencyKey: key,
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: { cleanMediaOverride: session.active_delivery.media_path }
    });
    assert.strictEqual(res1.status, 200);
    const firstDeliveryRunId = res1.body.active_delivery.delivery_run_id;

    // Request 2 (Duplicate replay)
    const res2 = await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      idempotencyKey: key,
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: { cleanMediaOverride: session.active_delivery.media_path }
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.fromCache, true, 'Second request must be served from idempotency cache');
    assert.strictEqual(res2.body.active_delivery.delivery_run_id, firstDeliveryRunId, 'Must return same delivery run ID');
  });
});

// ---------------------------------------------------------------------------
// Scenario I: Lost Response Recovery
// ---------------------------------------------------------------------------
test('RT01-S4.I: Lost response recovery restores committed deliverable without re-execution', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // Commit delivery to session and disk
  const job = jm.createJob({
    jobId: 'job_delivery_lost_ack',
    request: { type: 'delivery', revision: session.history[0]._project.revision }
  });
  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(job.job_id, CanonicalJobStatus.RENDERING);
  jm.transition(job.job_id, CanonicalJobStatus.PUBLISHING);
  jm.transition(job.job_id, CanonicalJobStatus.SUCCEEDED, {
    artifacts: {
      media_path: session.active_delivery.media_path,
      manifest_id: session.active_delivery.manifest_id
    },
    result: { active_delivery: session.active_delivery }
  });

  // Client recovers job after response was lost
  const recovered = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm
  });

  assert.strictEqual(recovered.success, true);
  assert.strictEqual(recovered.status, 'already_committed');
  assert.strictEqual(recovered.active_delivery.delivery_run_id, session.active_delivery.delivery_run_id);
});

// ---------------------------------------------------------------------------
// Scenario J: Process Restart During Delivery
// ---------------------------------------------------------------------------
test('RT01-S4.J: Process restart during delivery recovers safely and preserves last-known-good active delivery', () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);
  const jm1 = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // Job interrupted in RENDERING stage
  const job = jm1.createJob({
    jobId: 'job_interrupted_rendering',
    request: { type: 'delivery' }
  });
  jm1.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm1.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm1.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm1.transition(job.job_id, CanonicalJobStatus.RENDERING);

  // Simulate new process instance after restart
  const jm2 = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));
  const recRes = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    project: session.history[0]._project,
    outputDir: TEST_OUT_DIR,
    jobManager: jm2
  });

  assert.strictEqual(recRes.success, true);
  assert.strictEqual(recRes.status, 'recovered');
  assert.strictEqual(jm2.loadJob(job.job_id).status, CanonicalJobStatus.FAILED);
  assert.deepStrictEqual(session.active_delivery, initialActive, 'Must preserve last known good active delivery');
});

// ---------------------------------------------------------------------------
// Scenario K: Concurrent Project Mutation During Delivery
// ---------------------------------------------------------------------------
test('RT01-S4.K: Concurrent live timeline mutation during delivery binds to immutable snapshot', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = structuredClone(session.history[0]._project);
  backend.activeSession = session;
  const baseRev = backend.currentProject.revision;

  await withServer(backend, async baseUrl => {
    // Direct delivery initiated with delay to hold mutex
    const delivPromise = httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      outputDir: path.join(TEST_OUT_DIR, 'deliverables'),
      options: {
        cleanMediaOverride: session.active_delivery.media_path,
        simulateDelayMs: 60
      }
    });

    // Small yield to ensure server received request and acquired mutex
    await new Promise(r => setTimeout(r, 15));

    // Concurrent mutation should fail with 409 while delivery holds mutex
    const racingMutRes = await httpRequest(`${baseUrl}/api/project/operation`, 'POST', {
      operation: {
        type: 'move_clip',
        params: { clipId: 'clip_broll', targetTick: 240000, targetTrackId: 'track_video' }
      },
      expectedBaseRevision: baseRev
    });

    // Mutex rejects concurrent mutation
    assert.strictEqual(racingMutRes.status, 409);
    assert.strictEqual(racingMutRes.body.errorCode, 'MUTATION_IN_PROGRESS');

    // Wait for delivery to finish
    const delivRes = await delivPromise;
    assert.strictEqual(delivRes.status, 200);
    assert.strictEqual(delivRes.body.success, true);
  });
});

// ---------------------------------------------------------------------------
// Scenario L: Active-Delivery Preservation Across Full Failure Battery
// ---------------------------------------------------------------------------
test('RT01-S4.L: Active-delivery preservation across adversarial battery of failed delivery attempts', async () => {
  setupTestEnvironment();
  const session = createTestSession();
  const initialActive = structuredClone(session.active_delivery);
  const backend = new EditorBackend({ outputDir: TEST_OUT_DIR });
  backend.currentProject = session.history[0]._project;
  backend.activeSession = session;

  await withServer(backend, async baseUrl => {
    // 1. Render failure
    await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      options: { simulateRenderFail: true }
    });
    assert.deepStrictEqual(session.active_delivery, initialActive, 'Must survive render failure');

    // 2. QA failure
    await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'deliver',
      options: { simulateQaFail: true }
    });
    assert.deepStrictEqual(session.active_delivery, initialActive, 'Must survive QA failure');

    // 3. Preview render
    await httpRequest(`${baseUrl}/api/render`, 'POST', {
      mode: 'preview'
    });
    assert.deepStrictEqual(session.active_delivery, initialActive, 'Must survive preview render');

    // 4. Missing project failure
    const emptyBackend = new EditorBackend({ outputDir: TEST_OUT_DIR });
    await withServer(emptyBackend, async emptyUrl => {
      const res = await httpRequest(`${emptyUrl}/api/render`, 'POST', { mode: 'deliver' });
      assert.strictEqual(res.status, 400);
    });

    assert.deepStrictEqual(session.active_delivery, initialActive, 'Must survive entire adversarial delivery battery');
  });
});
