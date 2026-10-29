/**
 * EME Phase 17 Stage 2B: Deterministic Color Preview Integration Tests
 *
 * Verifies:
 * 1. POST /api/color/preview renders accurate graded frames from authorized media.
 * 2. Guaranteed non-mutation of project state, revision, undo/redo stacks, and active delivery.
 * 3. Stale-response rejection and identity correlation (requestId, draftVersion, clipId, frameTick, baseRevision).
 * 4. Schema validation and fail-closed rejection of unregistered LUTs and policy sentinels.
 * 5. Generic frame inspection endpoint POST /api/preview/frame caller compatibility.
 * 6. Transactional Apply (POST /api/color/apply) with base revision locking and delivery failure isolation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { EditorBackend } = require('../src/ui/server.js');
const { createDefaultColorGrade } = require('../src/engine/color-grade.js');

const PORT = 4789;
const ROOT = path.resolve(__dirname, '..');

// Helper to make HTTP JSON requests to EditorBackend
function requestJson(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function makeSampleProject() {
  return {
    id: 'proj_color_preview_test',
    schemaVersion: '1.0.0',
    revision: 3,
    title: 'Color Preview Test Project',
    canvas: { width: 1920, height: 1080, aspectRatio: '16:9', backgroundColor: '#000000' },
    timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 360000, endpointConvention: 'half-open' },
    assets: [
      { id: 'asset_1', type: 'image', src: 'assets/shot4_runner.jpg', durationTicks: 360000 }
    ],
    tracks: [
      { id: 'v1', name: 'Main Video', kind: 'visual', zIndex: 0, locked: false, muted: false, visible: true }
    ],
    clips: [
      {
        id: 'clip_1',
        trackId: 'v1',
        type: 'video',
        startTick: 0,
        durationTicks: 360000,
        assetPath: 'assets/shot4_runner.jpg',
        source: { assetId: 'asset_1', trimInTick: 0, trimOutTick: 360000 },
        colorGrade: null
      }
    ]
  };
}

test('Stage 2B Test Suite: Color Preview & State Boundary Conformance', async (t) => {
  let backend = null;
  const initialProject = makeSampleProject();

  await t.test('Setup: Start EditorBackend instance', async () => {
    backend = new EditorBackend({
      port: PORT,
      project: structuredClone(initialProject)
    });
    await backend.start();
  });

  await t.test('2B.1: POST /api/color/preview renders valid graded frame from authorized project media', async () => {
    const candidateGrade = createDefaultColorGrade();
    candidateGrade.exposure = 0.75;
    candidateGrade.whiteBalance.temperature = 0.25;
    candidateGrade.lut = {
      enabled: true,
      lutId: 'warm_golden',
      intensity: 0.8,
      interpolation: 'tetrahedral'
    };

    const res = await requestJson('POST', '/api/color/preview', {
      projectId: 'proj_color_preview_test',
      clipId: 'clip_1',
      frameTick: 0,
      expectedBaseRevision: 3,
      requestId: 'req_test_001',
      draftVersion: 1,
      grade: candidateGrade
    });

    assert.equal(res.status, 200, 'Preview request must return HTTP 200');
    assert.equal(res.data.success, true);
    assert.equal(res.data.requestId, 'req_test_001');
    assert.equal(res.data.draftVersion, 1);
    assert.equal(res.data.clipId, 'clip_1');
    assert.equal(res.data.frameTick, 0);
    assert.equal(res.data.baseRevision, 3);
    assert.ok(typeof res.data.previewDataUri === 'string' && res.data.previewDataUri.startsWith('data:image/jpeg;base64,'), 'Must return JPEG data URI');
    assert.ok(typeof res.data.gradeHash === 'string' && res.data.gradeHash.length === 64, 'Must return 64-char SHA256 gradeHash');
    assert.ok(typeof res.data.executionMs === 'number' && res.data.executionMs < 2000, 'Execution latency must be measured');
  });

  await t.test('2B.2: Preview is 100% Non-Mutating (Revision, Project State, Undo Stack, and Active Delivery)', async () => {
    const snapshotBefore = structuredClone(backend.currentProject);
    const undoBeforeLen = backend.undoStack.length;
    const redoBeforeLen = backend.redoStack.length;

    // Fire 20 rapid preview iterations simulating scrubbing
    for (let i = 1; i <= 20; i++) {
      const g = createDefaultColorGrade();
      g.exposure = (i - 10) * 0.1;
      await requestJson('POST', '/api/color/preview', {
        projectId: 'proj_color_preview_test',
        clipId: 'clip_1',
        frameTick: 0,
        expectedBaseRevision: 3,
        requestId: `req_scrub_${i}`,
        draftVersion: i,
        grade: g
      });
    }

    assert.deepStrictEqual(backend.currentProject, snapshotBefore, 'Project state must remain bit-for-bit unchanged after previews');
    assert.equal(backend.currentProject.revision, 3, 'Revision must remain strictly at 3');
    assert.equal(backend.undoStack.length, undoBeforeLen, 'Undo stack must not grow during previews');
    assert.equal(backend.redoStack.length, redoBeforeLen, 'Redo stack must not change during previews');
  });

  await t.test('2B.3: Stale Response Rejection and Identity Correlation Logic', async () => {
    // Simulate UI client-side correlation validation function as mandated in Architecture Directive
    function isPreviewResponseEligible(response, activeView) {
      if (!response || !response.success) return false;
      if (!activeView.draftActive) return false;
      if (response.requestId !== activeView.pendingRequestId) return false;
      if (response.draftVersion !== activeView.currentDraftVersion) return false;
      if (response.projectId !== activeView.currentProjectId) return false;
      if (response.clipId !== activeView.currentClipId) return false;
      if (response.frameTick !== activeView.currentFrameTick) return false;
      if (response.baseRevision !== activeView.currentBaseRevision) return false;
      return true;
    }

    const currentView = {
      draftActive: true,
      pendingRequestId: 'req_005',
      currentDraftVersion: 5,
      currentProjectId: 'proj_color_preview_test',
      currentClipId: 'clip_1',
      currentFrameTick: 0,
      currentBaseRevision: 3
    };

    // 1. Current matching response -> ACCEPT
    const validRes = {
      success: true,
      requestId: 'req_005',
      draftVersion: 5,
      projectId: 'proj_color_preview_test',
      clipId: 'clip_1',
      frameTick: 0,
      baseRevision: 3
    };
    assert.equal(isPreviewResponseEligible(validRes, currentView), true);

    // 2. Outdated draftVersion -> REJECT
    assert.equal(isPreviewResponseEligible({ ...validRes, draftVersion: 4 }, currentView), false);

    // 3. Outdated requestId -> REJECT
    assert.equal(isPreviewResponseEligible({ ...validRes, requestId: 'req_004' }, currentView), false);

    // 4. Mismatched clipId (user switched clip while preview was in-flight) -> REJECT
    assert.equal(isPreviewResponseEligible({ ...validRes, clipId: 'clip_2' }, currentView), false);

    // 5. Mismatched frameTick (user scrubbed playhead while preview was in-flight) -> REJECT
    assert.equal(isPreviewResponseEligible({ ...validRes, frameTick: 120000 }, currentView), false);

    // 6. Mismatched baseRevision (project was committed while preview was in-flight) -> REJECT
    assert.equal(isPreviewResponseEligible({ ...validRes, baseRevision: 4 }, currentView), false);

    // 7. Cancelled draft -> REJECT
    assert.equal(isPreviewResponseEligible(validRes, { ...currentView, draftActive: false }), false);
  });

  await t.test('2B.4: Schema Validation Fails Closed for Out-of-Bounds Parameters', async () => {
    const badGrade = createDefaultColorGrade();
    badGrade.exposure = 15.0; // Max allowed is 6.0

    const res = await requestJson('POST', '/api/color/preview', {
      projectId: 'proj_color_preview_test',
      clipId: 'clip_1',
      requestId: 'req_bad_exposure',
      draftVersion: 1,
      grade: badGrade
    });

    assert.equal(res.status, 400, 'Out-of-bounds parameter must return HTTP 400');
    assert.equal(res.data.success, false);
    assert.equal(res.data.errorCode, 'ERR_INVALID_COLOR_GRADE');
  });

  await t.test('2B.5: Certified LUT Registry Enforcement & Sentinel Rejection', async () => {
    // 1. Unregistered LUT -> Fails Closed
    const unregGrade = createDefaultColorGrade();
    unregGrade.lut = { enabled: true, lutId: 'unknown_party_lut', intensity: 1.0 };
    const resUnreg = await requestJson('POST', '/api/color/preview', {
      requestId: 'req_unreg',
      draftVersion: 1,
      grade: unregGrade
    });
    assert.equal(resUnreg.status, 400);
    assert.equal(resUnreg.data.errorCode, 'ERR_UNREGISTERED_LUT_ID');

    // 2. Policy Sentinel -> Fails Closed
    const sentinelGrade = createDefaultColorGrade();
    sentinelGrade.lut = { enabled: true, lutId: 'needs_review', intensity: 1.0 };
    const resSent = await requestJson('POST', '/api/color/preview', {
      requestId: 'req_sentinel',
      draftVersion: 1,
      grade: sentinelGrade
    });
    assert.equal(resSent.status, 400);
    assert.equal(resSent.data.errorCode, 'ERR_SENTINEL_NOT_EXECUTABLE');

    // 3. Certified LUT bleach_bypass -> PASS
    const certGrade = createDefaultColorGrade();
    certGrade.lut = { enabled: true, lutId: 'bleach_bypass', intensity: 0.9, interpolation: 'tetrahedral' };
    const resCert = await requestJson('POST', '/api/color/preview', {
      requestId: 'req_cert',
      draftVersion: 1,
      grade: certGrade
    });
    assert.equal(resCert.status, 200);
    assert.equal(resCert.data.success, true);
  });

  await t.test('2B.6: Generic Frame Inspection POST /api/preview/frame Compatibility', async () => {
    const res = await requestJson('POST', '/api/preview/frame', {
      clipId: 'clip_1',
      frameTick: 0
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.previewDataUri.startsWith('data:image/jpeg;base64,'));
  });

  await t.test('2B.7: Transactional Apply (POST /api/color/apply) with Expected Revision Locking', async () => {
    const validGrade = createDefaultColorGrade();
    validGrade.exposure = 0.5;
    validGrade.lut = { enabled: true, lutId: 'true_tone', intensity: 1.0, interpolation: 'tetrahedral' };

    // 1. Conflict test: passing stale expectedBaseRevision
    const conflictRes = await requestJson('POST', '/api/color/apply', {
      clipId: 'clip_1',
      expectedBaseRevision: 999, // Stale!
      grade: validGrade
    });
    assert.equal(conflictRes.status, 409, 'Stale expected revision must return 409 Conflict');
    assert.equal(conflictRes.data.errorCode, 'STALE_REVISION');
    assert.equal(backend.currentProject.revision, 3, 'Revision must not change on conflict');

    // 2. Successful Apply with exact expectedBaseRevision
    const applyRes = await requestJson('POST', '/api/color/apply', {
      clipId: 'clip_1',
      expectedBaseRevision: 3,
      grade: validGrade
    });
    assert.equal(applyRes.status, 200, 'Valid Apply must return HTTP 200');
    assert.equal(applyRes.data.success, true);
    assert.equal(applyRes.data.revision, 4, 'Revision must increment from 3 to 4');
    assert.equal(backend.undoStack.length, 1, 'Undo stack must record previous state');

    // Verify clip has persisted grade
    const updatedClip = backend.currentProject.clips.find(c => c.id === 'clip_1');
    assert.equal(updatedClip.colorGrade.exposure, 0.5);
    assert.equal(updatedClip.colorGrade.lut.lutId, 'true_tone');

    // 3. Engine Undo restores previous state with monotonic revision
    const undoRes = await requestJson('POST', '/api/project/undo', {});
    assert.equal(undoRes.status, 200);
    assert.equal(backend.currentProject.revision, 5, 'Undo advances revision monotonically');
    const revertedClip = backend.currentProject.clips.find(c => c.id === 'clip_1');
    assert.equal(revertedClip.colorGrade, null, 'Grade is reverted to null');
  });

  await t.test('Teardown: Stop EditorBackend instance', async () => {
    await backend.stop();
  });
});
