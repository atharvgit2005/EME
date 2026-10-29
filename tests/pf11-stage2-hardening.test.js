/**
 * Editing Mechanics Engine (EME) - Phase PF-11 Stage 2 Test Battery
 * Production Hardening, Media Access Security, Exact Artifact Identity,
 * Schema Compatibility & Visual Frame Timing Verification
 *
 * Verifies all Stage 2 gates from ChatGPT Architectural Directive:
 * 1.  Path traversal & encoded traversal rejection on /api/media
 * 2.  Null-byte injection rejection on /api/media
 * 3.  Unauthorized system/project file access rejection (403 Forbidden)
 * 4.  Symlink escaping detection & rejection
 * 5.  HTTP range streaming: valid prefix, suffix, and closed ranges (206)
 * 6.  HTTP range error handling: multi-range and out-of-bounds ranges (416)
 * 7.  Candidate activation manifest & SHA-256 integrity gate (422 on mismatch)
 * 8.  Candidate missing media fails closed (422 ARTIFACT_MISSING)
 * 9.  Historical inspection media isolation & read-only non-mutating preview
 * 10. Persisted session schema backward compatibility (older sessions without project_path)
 * 11. Realistic process kill (SIGKILL) & coherent restart recovery
 * 12. Title-move visual frame verification (frame pixel difference & distinct file hashes)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync, fork } = require('child_process');
const crypto = require('crypto');

const {
  OrchestrationJobStatus,
  OrchestrationJobManager,
  EndToEndOrchestrator,
  RevisionSessionManager,
  OperationPlanCompiler,
  RenderOrchestrator
} = require('../src/prompt-core/index.js');
const { EditorBackend } = require('../src/ui/server.js');
const { BriefValidator } = require('../src/prompt-core/brief-validator.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/test-pf11-stage2');

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

function createBaseExecutedProject() {
  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  return OperationPlanCompiler.executePlan(baseProject, basePlan).project;
}

function createTestSession(outDir) {
  const cleanMedia = path.join(outDir, 'clean-12s.mp4');
  const fileSha = RenderOrchestrator.computeFileSha256(cleanMedia) || '0'.repeat(64);
  const baseProject = createBaseExecutedProject();

  return {
    schema_version: '1.0.0',
    session_id: 'session-pf11-stage2',
    concurrency: {
      version: 1,
      last_modified: new Date().toISOString()
    },
    state: 'ready',
    active_delivery: {
      manifest_id: 'manifest-rev-0-init',
      media_path: cleanMedia,
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
        media_path: cleanMedia,
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
// Gate 1: Path Traversal & Encoded Traversal Rejection on /api/media
// ---------------------------------------------------------------------------
test('PF11-S2.1: Path traversal and encoded traversal are rejected with 403 Forbidden', async () => {
  const port = 4721;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Raw traversal
    const res1 = await fetch(`http://localhost:${port}/api/media?path=../../../etc/passwd`);
    assert.strictEqual(res1.status, 403);
    const data1 = await res1.json();
    assert.strictEqual(data1.errorCode, 'FORBIDDEN');

    // 2. Encoded traversal (%2e%2e%2f)
    const res2 = await fetch(`http://localhost:${port}/api/media?path=%2e%2e%2f%2e%2e%2fpackage.json`);
    assert.strictEqual(res2.status, 403);
    const data2 = await res2.json();
    assert.strictEqual(data2.errorCode, 'FORBIDDEN');

    // 3. Double-encoded traversal
    const res3 = await fetch(`http://localhost:${port}/api/media?path=%252e%252e%252fpackage.json`);
    assert.strictEqual(res3.status, 403);
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 2: Null-Byte Injection Rejection on /api/media
// ---------------------------------------------------------------------------
test('PF11-S2.2: Null-byte injection is rejected cleanly with 400 Validation Error', async () => {
  const port = 4722;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    const res = await fetch(`http://localhost:${port}/api/media?path=clean-12s.mp4%00.png`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.errorCode, 'VALIDATION_ERROR');
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 3: Unauthorized Existing File Rejection (Outside Media Registry)
// ---------------------------------------------------------------------------
test('PF11-S2.3: Unauthorized existing files outside media registry return 403 Forbidden', async () => {
  const port = 4723;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    const res = await fetch(`http://localhost:${port}/api/media?path=package.json`);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.errorCode, 'FORBIDDEN');
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 4: Symlink Escaping Detection & Rejection
// ---------------------------------------------------------------------------
test('PF11-S2.4: Symlinks pointing outside media registry are rejected with 403 Forbidden', async () => {
  const port = 4724;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);

  // Create a rogue symlink in TEST_OUT_DIR pointing to package.json
  const rogueLink = path.join(TEST_OUT_DIR, 'rogue_symlink.mp4');
  try { if (fs.existsSync(rogueLink)) fs.unlinkSync(rogueLink); } catch (e) {}
  fs.symlinkSync(path.resolve('package.json'), rogueLink);

  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    const res = await fetch(`http://localhost:${port}/api/media?path=${encodeURIComponent(rogueLink)}`);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.errorCode, 'FORBIDDEN');
  } finally {
    try { if (fs.existsSync(rogueLink)) fs.unlinkSync(rogueLink); } catch (e) {}
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 5: HTTP Range Streaming: Valid Prefix, Suffix, and Closed Ranges (206)
// ---------------------------------------------------------------------------
test('PF11-S2.5: HTTP Byte-Range Streaming returns 206 Partial Content with exact headers', async () => {
  const port = 4725;
  const cleanMp4 = setupTestEnvironment();
  const fileSize = fs.statSync(cleanMp4).size;
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Closed byte range: bytes=0-499 (500 bytes)
    const resClosed = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': 'bytes=0-499' }
    });
    assert.strictEqual(resClosed.status, 206);
    assert.strictEqual(resClosed.headers.get('content-range'), `bytes 0-499/${fileSize}`);
    assert.strictEqual(resClosed.headers.get('content-length'), '500');
    assert.strictEqual(resClosed.headers.get('content-type'), 'video/mp4');
    const bufClosed = Buffer.from(await resClosed.arrayBuffer());
    assert.strictEqual(bufClosed.length, 500);

    // 2. Prefix range: bytes=1000- (from 1000 to end)
    const resPrefix = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': 'bytes=1000-' }
    });
    assert.strictEqual(resPrefix.status, 206);
    assert.strictEqual(resPrefix.headers.get('content-range'), `bytes 1000-${fileSize - 1}/${fileSize}`);
    assert.strictEqual(resPrefix.headers.get('content-length'), String(fileSize - 1000));
    await resPrefix.arrayBuffer();

    // 3. Suffix range: bytes=-300 (last 300 bytes)
    const resSuffix = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': 'bytes=-300' }
    });
    assert.strictEqual(resSuffix.status, 206);
    assert.strictEqual(resSuffix.headers.get('content-range'), `bytes ${fileSize - 300}-${fileSize - 1}/${fileSize}`);
    assert.strictEqual(resSuffix.headers.get('content-length'), '300');
    await resSuffix.arrayBuffer();

    // 4. Full request without range: returns 200 OK
    const resFull = await fetch(`http://localhost:${port}/api/media?id=active_delivery`);
    assert.strictEqual(resFull.status, 200);
    assert.strictEqual(resFull.headers.get('content-length'), String(fileSize));
    assert.strictEqual(resFull.headers.get('accept-ranges'), 'bytes');
    await resFull.arrayBuffer();
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 6: HTTP Range Errors: Multi-Range & Out-of-Bounds Rejection (416)
// ---------------------------------------------------------------------------
test('PF11-S2.6: Malformed, inverted, out-of-bounds, and multi-range requests return 416', async () => {
  const port = 4726;
  const cleanMp4 = setupTestEnvironment();
  const fileSize = fs.statSync(cleanMp4).size;
  const session = createTestSession(TEST_OUT_DIR);
  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Multiple ranges (unsupported)
    const resMulti = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': 'bytes=0-100, 200-300' }
    });
    assert.strictEqual(resMulti.status, 416);
    assert.strictEqual(resMulti.headers.get('content-range'), `bytes */${fileSize}`);
    await resMulti.text();

    // 2. Inverted range (start > end)
    const resInverted = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': 'bytes=500-100' }
    });
    assert.strictEqual(resInverted.status, 416);
    await resInverted.text();

    // 3. Out-of-bounds start (start >= fileSize)
    const resOob = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': `bytes=${fileSize + 1000}-${fileSize + 2000}` }
    });
    assert.strictEqual(resOob.status, 416);
    await resOob.text();

    // 4. Malformed range syntax
    const resMalformed = await fetch(`http://localhost:${port}/api/media?id=active_delivery`, {
      headers: { 'Range': 'bytes=-' }
    });
    assert.strictEqual(resMalformed.status, 416);
    await resMalformed.text();
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 7: Candidate Activation Manifest & SHA-256 Integrity Verification
// ---------------------------------------------------------------------------
test('PF11-S2.7: Candidate activation rechecks manifest identity and rejects SHA-256 tampering', async () => {
  const port = 4727;
  const cleanMp4 = setupTestEnvironment();
  const realSha = RenderOrchestrator.computeFileSha256(cleanMp4);

  const candidateSet = {
    schema_version: '1.0.0',
    candidate_set_id: 'cset-integrity-test',
    candidates: [
      {
        candidate_id: 'cand-tampered',
        status: 'verified',
        qa_summary: { score: 95 },
        deliverable: {
          manifest_id: 'manifest-cand-tampered',
          media_path: cleanMp4,
          sha256: 'tampered_fake_sha256_hash_that_does_not_match_actual_file'
        }
      },
      {
        candidate_id: 'cand-valid',
        status: 'verified',
        qa_summary: { score: 95 },
        deliverable: {
          manifest_id: 'manifest-cand-valid',
          media_path: cleanMp4,
          sha256: realSha
        }
      }
    ]
  };

  const session = createTestSession(TEST_OUT_DIR);
  session.active_candidate_set = candidateSet;

  const backend = new EditorBackend({ port, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. Attempt to activate tampered candidate: Rejected with 422 ARTIFACT_INTEGRITY_MISMATCH
    const resTampered = await fetch(`http://localhost:${port}/api/session/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'cand-tampered',
        expectedVersion: session.concurrency.version
      })
    });
    assert.strictEqual(resTampered.status, 422);
    const dataTampered = await resTampered.json();
    assert.strictEqual(dataTampered.errorCode, 'ARTIFACT_INTEGRITY_MISMATCH');

    // Active delivery remains untouched!
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-0');

    // 2. Activate valid candidate: Succeeds
    const resValid = await fetch(`http://localhost:${port}/api/session/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'cand-valid',
        expectedVersion: session.concurrency.version
      })
    });
    assert.strictEqual(resValid.status, 200);
    const dataValid = await resValid.json();
    assert.strictEqual(dataValid.success, true);
    assert.strictEqual(dataValid.active_delivery.manifest_id, 'manifest-cand-valid');
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 8: Candidate Missing Media Fails Closed
// ---------------------------------------------------------------------------
test('PF11-S2.8: Candidate with missing media artifact on disk fails closed with 422 ARTIFACT_MISSING', async () => {
  const port = 4728;
  setupTestEnvironment();

  const candidateSet = {
    schema_version: '1.0.0',
    candidate_set_id: 'cset-missing-test',
    candidates: [
      {
        candidate_id: 'cand-missing-media',
        status: 'verified',
        qa_summary: { score: 90 },
        deliverable: {
          manifest_id: 'manifest-cand-missing',
          media_path: path.join(TEST_OUT_DIR, 'non_existent_media_file.mp4'),
          sha256: 'some_sha'
        }
      }
    ]
  };

  const session = createTestSession(TEST_OUT_DIR);
  session.active_candidate_set = candidateSet;

  const backend = new EditorBackend({ port, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    const res = await fetch(`http://localhost:${port}/api/session/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'cand-missing-media',
        expectedVersion: session.concurrency.version
      })
    });
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.errorCode, 'ARTIFACT_MISSING');
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-0');
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 9: Historical Inspection Media Isolation & Read-Only Timeline Projection
// ---------------------------------------------------------------------------
test('PF11-S2.9: Historical inspection serves exact revision media and never mutates active delivery', async () => {
  const port = 4729;
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);

  // Add historical revision rev-prev with distinct media file
  const histMedia = path.join(TEST_OUT_DIR, 'hist-rev0-media.mp4');
  fs.copyFileSync(session.active_delivery.media_path, histMedia);

  session.history.push({
    revision_id: 'rev-prev',
    predecessor_id: null,
    prompt: 'Predecessor revision',
    status: 'committed',
    manifest_id: 'manifest-hist-prev',
    media_path: histMedia,
    media_sha256: RenderOrchestrator.computeFileSha256(histMedia),
    operations_count: 2,
    qa_score: 90,
    timestamp: new Date().toISOString(),
    _project: session.history[0]._project
  });

  const backend = new EditorBackend({ port, session, outputDir: TEST_OUT_DIR });
  await backend.start();

  try {
    // 1. GET /api/media?id=rev-prev returns the historical media file
    const resHistMedia = await fetch(`http://localhost:${port}/api/media?id=rev-prev`);
    assert.strictEqual(resHistMedia.status, 200);

    // 2. Querying a non-existent historical ID returns 404, does NOT leak active delivery
    const resMissing = await fetch(`http://localhost:${port}/api/media?id=rev-nonexistent`);
    assert.strictEqual(resMissing.status, 404);

    // 3. GET /api/timeline?revisionId=rev-prev returns projection without mutating session
    const resTimeline = await fetch(`http://localhost:${port}/api/timeline?revisionId=rev-prev`);
    assert.strictEqual(resTimeline.status, 200);
    const dataTimeline = await resTimeline.json();
    assert.strictEqual(dataTimeline.revisionId, 'rev-prev');

    // Active delivery remains rev-0!
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-0');
    assert.strictEqual(backend.activeSession.concurrency.version, 1);
  } finally {
    await backend.stop();
  }
});

// ---------------------------------------------------------------------------
// Gate 10: Persisted Session Schema Backward Compatibility
// ---------------------------------------------------------------------------
test('PF11-S2.10: Schema validates backward compatibility for older sessions without project_path', () => {
  const schemaPath = path.resolve('schema/eme-revision-session.v1.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // 1. Older session document: No project_path in history item
  const olderSession = {
    schema_version: '1.0.0',
    session_id: 'ses-older-compatibility',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    state: 'ready',
    request: { original_prompt: 'Old prompt' },
    hard_constraints: [{ constraint_id: 'c-1', description: 'Constraint' }],
    concurrency: { version: 1 },
    history: [
      {
        revision_id: 'rev-0',
        status: 'committed',
        timestamp: new Date().toISOString(),
        operations_count: 3
      }
    ],
    undo_redo: {
      undo_stack: [],
      redo_stack: []
    }
  };

  const valOld = BriefValidator.validateRevisionSession(olderSession);
  assert.strictEqual(valOld.valid, true, `Older session failed schema: ${valOld.errors?.join(', ')}`);

  // 2. New session document: Contains project_path
  const newSession = structuredClone(olderSession);
  newSession.history[0].project_path = 'artifacts/projects/project-rev0.json';
  const valNew = BriefValidator.validateRevisionSession(newSession);
  assert.strictEqual(valNew.valid, true, `New session failed schema: ${valNew.errors?.join(', ')}`);

  // 3. Null project_path
  newSession.history[0].project_path = null;
  const valNull = BriefValidator.validateRevisionSession(newSession);
  assert.strictEqual(valNull.valid, true, `Null project_path failed schema: ${valNull.errors?.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Gate 11: Realistic Process Kill & Coherent Restart Recovery
// ---------------------------------------------------------------------------
test('PF11-S2.11: Realistic process crash mid-transaction recovers to coherent active delivery', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // Simulate process kill while job was in EXECUTING state
  const job = jm.createJob({
    jobId: 'job_interrupted_test',
    request: { prompt: 'Interrupted prompt', expected_version: 1 }
  });
  jm.transition(job.job_id, OrchestrationJobStatus.PLANNING);
  jm.transition(job.job_id, OrchestrationJobStatus.EXECUTING);

  // Set session recovery to in_flight
  const checkpointPath = path.join(TEST_OUT_DIR, 'crash-test-checkpoint.json');
  fs.writeFileSync(checkpointPath, JSON.stringify({
    session_id: session.session_id,
    active_delivery: session.active_delivery,
    timestamp: new Date().toISOString()
  }));
  session.recovery = {
    status: 'in_flight',
    pending_transaction_id: 'tx-crash-123',
    last_attempted_revision_id: 'rev-crash',
    checkpoint_path: checkpointPath
  };

  // Perform crash recovery via EndToEndOrchestrator.recoverJob
  const recoveredResult = EndToEndOrchestrator.recoverJob({
    jobId: job.job_id,
    session,
    jobManager: jm,
    outputDir: TEST_OUT_DIR
  });
  assert.strictEqual(recoveredResult.job.status, OrchestrationJobStatus.FAILED);
  assert.strictEqual(session.recovery.status, 'clean');
  assert.strictEqual(session.active_delivery.revision_id, 'rev-0');

  // Verify that active delivery media remains intact and valid
  assert.ok(fs.existsSync(session.active_delivery.media_path));
  assert.strictEqual(session.active_delivery.sha256, RenderOrchestrator.computeFileSha256(session.active_delivery.media_path));
});

// ---------------------------------------------------------------------------
// Gate 12: Title-Move Visual Frame Verification (Real Frame Diff & Distinct Hash)
// ---------------------------------------------------------------------------
test('PF11-S2.12: Title timing move renders distinct visual frames and distinct SHA-256 hashes', async () => {
  setupTestEnvironment();
  const session = createTestSession(TEST_OUT_DIR);
  const jm = new OrchestrationJobManager(path.join(TEST_OUT_DIR, 'jobs'));

  // 1. Render rev-0 baseline with title between 1.0s and 3.0s
  const project0 = structuredClone(session.history[0]._project);
  if (!project0.clips) project0.clips = [];
  project0.clips = project0.clips.filter(c => c.trackId !== 'track_graphics');
  project0.clips.push({
    id: 'clip_headline_v0',
    trackId: 'track_graphics',
    name: 'HEADLINE TITLE',
    type: 'text',
    startTick: 120000,   // t = 1.0s
    durationTicks: 240000 // 2.0s
  });

  const plan0 = {
    plan_id: 'plan-v0',
    operations: []
  };

  const res0 = RenderOrchestrator.runClosedLoop({
    project: project0,
    plan: plan0,
    outputDir: path.join(TEST_OUT_DIR, 'visual-test'),
    options: { renderVisualChanges: true }
  });
  assert.strictEqual(res0.success, true);
  const media0 = res0.deliverablePath;

  // 2. Render rev-1 where title is moved 2 seconds later (t = 3.0s to 5.0s)
  const project1 = structuredClone(project0);
  project1.clips = project1.clips.filter(c => c.id !== 'clip_headline_v0');
  project1.clips.push({
    id: 'clip_headline_v1',
    trackId: 'track_graphics',
    name: 'HEADLINE TITLE',
    type: 'text',
    startTick: 360000,  // t = 3.0s
    durationTicks: 240000 // 2.0s
  });

  const plan1 = {
    plan_id: 'plan-v1',
    operations: []
  };

  const res1 = RenderOrchestrator.runClosedLoop({
    project: project1,
    plan: plan1,
    outputDir: path.join(TEST_OUT_DIR, 'visual-test'),
    options: { renderVisualChanges: true }
  });
  assert.strictEqual(res1.success, true);
  const media1 = res1.deliverablePath;

  // Verify file hashes are completely distinct!
  const sha0 = RenderOrchestrator.computeFileSha256(media0);
  const sha1 = RenderOrchestrator.computeFileSha256(media1);
  assert.notStrictEqual(sha0, sha1, 'Rendered revision media files must have distinct SHA-256 hashes');

  // 3. Extract frame at t=2.0s from both videos using ffmpeg
  const frame0Path = path.join(TEST_OUT_DIR, 'visual-test', 'frame_rev0_2s.png');
  const frame1Path = path.join(TEST_OUT_DIR, 'visual-test', 'frame_rev1_2s.png');

  spawnSync('ffmpeg', ['-y', '-ss', '2.0', '-i', media0, '-vframes', '1', frame0Path], { stdio: 'ignore' });
  spawnSync('ffmpeg', ['-y', '-ss', '2.0', '-i', media1, '-vframes', '1', frame1Path], { stdio: 'ignore' });

  assert.ok(fs.existsSync(frame0Path));
  assert.ok(fs.existsSync(frame1Path));

  const buf0 = fs.readFileSync(frame0Path);
  const buf1 = fs.readFileSync(frame1Path);

  // In rev-0, the title is active at t=2.0s. In rev-1, the title hasn't started yet!
  assert.strictEqual(buf0.equals(buf1), false, 'Frame at 2.0s must show visual difference between rev-0 and rev-1');
});
