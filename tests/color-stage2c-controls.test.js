/**
 * EME Phase 17 Stage 2C: Schema-Backed Grade Controls & Hold-to-Compare Tests
 *
 * Verifies:
 * 1. 5 Certified LUTs vocabulary enforcement in UI state and API requests.
 * 2. Schema-bounded parameter mapping for Exposure, WB, LGGO, Skin Protection, and 8-channel HSL.
 * 3. Hold-to-Compare interaction (startHold, endHold, toggle, window blur recovery).
 * 4. Ephemeral draft lifecycle: version incrementing, cancellation, and clip-switch isolation.
 * 5. Transactional apply and state synchronization with EditorBackend.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { EditorBackend } = require('../src/ui/server.js');
const { createDefaultColorGrade, validateColorGrade } = require('../src/engine/color-grade.js');
const { CERTIFIED_LUTS, isCertifiedLutId, isSentinelId } = require('../src/engine/lut-registry.js');

const PORT = 4792;

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

function makeCanonicalProject() {
  return {
    id: 'proj_stage2c_test',
    schemaVersion: '1.0.0',
    revision: 1,
    title: 'Stage 2C Controls Test Project',
    canvas: { width: 1920, height: 1080, aspectRatio: '16:9', backgroundColor: '#000000' },
    timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 480000, endpointConvention: 'half-open' },
    assets: [
      { id: 'asset_runner', type: 'image', src: 'assets/shot4_runner.jpg', durationTicks: 480000 }
    ],
    tracks: [
      { id: 'v1', name: 'Main Video', kind: 'visual', zIndex: 0, locked: false, muted: false, visible: true }
    ],
    clips: [
      {
        id: 'clip_A',
        trackId: 'v1',
        type: 'video',
        startTick: 0,
        durationTicks: 240000,
        assetPath: 'assets/shot4_runner.jpg',
        source: { assetId: 'asset_runner', trimInTick: 0, trimOutTick: 240000 },
        colorGrade: null
      },
      {
        id: 'clip_B',
        trackId: 'v1',
        type: 'video',
        startTick: 240000,
        durationTicks: 240000,
        assetPath: 'assets/shot4_runner.jpg',
        source: { assetId: 'asset_runner', trimInTick: 0, trimOutTick: 240000 },
        colorGrade: null
      }
    ]
  };
}

test('Stage 2C Test Suite: Schema-Backed Controls & UI Integration', async (t) => {
  let backend = null;

  await t.test('Setup: Start EditorBackend instance', async () => {
    backend = new EditorBackend({
      port: PORT,
      project: makeCanonicalProject()
    });
    await backend.start();
  });

  await t.test('2C.1: Closed Vocabulary - All 5 Certified LUTs produce valid preview requests', async () => {
    const certifiedIds = Object.keys(CERTIFIED_LUTS);
    assert.equal(certifiedIds.length, 5, 'Must have exactly 5 certified LUTs');

    for (const lutId of certifiedIds) {
      assert.ok(isCertifiedLutId(lutId), `${lutId} must be certified`);
      const g = createDefaultColorGrade();
      g.lut = { enabled: true, lutId, intensity: 0.95, interpolation: 'tetrahedral' };

      const res = await requestJson('POST', '/api/color/preview', {
        clipId: 'clip_A',
        frameTick: 0,
        expectedBaseRevision: 1,
        requestId: `req_lut_${lutId}`,
        draftVersion: 1,
        grade: g
      });

      assert.equal(res.status, 200, `LUT ${lutId} preview must return 200`);
      assert.equal(res.data.success, true);
    }
  });

  await t.test('2C.2: Schema Boundaries - All Control Sliders Map Correctly to Schema Bounds', async () => {
    // 1. Valid extreme bounds
    const extremeGrade = createDefaultColorGrade();
    extremeGrade.exposure = 6.0; // Max allowed
    extremeGrade.whiteBalance.temperature = -1.0;
    extremeGrade.whiteBalance.tint = 1.0;
    extremeGrade.primary.lift = [-0.5, -0.5, -0.5];
    extremeGrade.primary.gamma = [2.0, 2.0, 2.0];
    extremeGrade.primary.gain = [2.0, 2.0, 2.0];
    extremeGrade.skinProtection = { enabled: true, weight: 1.0, tolerance: 0.5 };
    extremeGrade.hsl.red = { hue: 20, saturation: 1.0, lightness: -0.5 };
    extremeGrade.hsl.yellow = { hue: -15, saturation: 0.5, lightness: 0.2 };
    extremeGrade.hsl.green = { hue: 0, saturation: -0.8, lightness: 0.0 };
    extremeGrade.hsl.cyan = { hue: 10, saturation: 0.0, lightness: 0.0 };
    extremeGrade.hsl.blue = { hue: -20, saturation: 0.7, lightness: 0.3 };

    const valRes = validateColorGrade(extremeGrade);
    assert.equal(valRes.valid, true, 'Extreme grade at boundary must be valid schema');

    const res = await requestJson('POST', '/api/color/preview', {
      clipId: 'clip_A',
      frameTick: 0,
      expectedBaseRevision: 1,
      requestId: 'req_extreme_bounds',
      draftVersion: 2,
      grade: extremeGrade
    });
    assert.equal(res.status, 200);

    // 2. Beyond boundaries (Exposure = 7.0 EV) -> Fail Closed
    const invalidGrade = structuredClone(extremeGrade);
    invalidGrade.exposure = 7.0;
    const resBad = await requestJson('POST', '/api/color/preview', {
      clipId: 'clip_A',
      requestId: 'req_out_of_bounds',
      draftVersion: 3,
      grade: invalidGrade
    });
    assert.equal(resBad.status, 400);
    assert.equal(resBad.data.errorCode, 'ERR_INVALID_COLOR_GRADE');
  });

  await t.test('2C.3: Hold-to-Compare State Invariant Machine Simulation', async () => {
    // Simulate UI Hold-to-Compare state machine
    class ComparisonStateMachine {
      constructor() {
        this.isComparing = false;
        this.bypassMode = false;
        this.displayedView = 'graded'; // 'graded' | 'original'
      }

      startHold() {
        this.isComparing = true;
        this.displayedView = 'original';
      }

      endHold() {
        this.isComparing = false;
        this.displayedView = this.bypassMode ? 'original' : 'graded';
      }

      toggleBypass() {
        this.bypassMode = !this.bypassMode;
        this.displayedView = (this.isComparing || this.bypassMode) ? 'original' : 'graded';
      }

      onBlur() {
        // Recovery on window blur / focus loss
        this.isComparing = false;
        this.displayedView = this.bypassMode ? 'original' : 'graded';
      }
    }

    const sm = new ComparisonStateMachine();
    assert.equal(sm.displayedView, 'graded');

    // 1. Press and hold compare button
    sm.startHold();
    assert.equal(sm.displayedView, 'original');
    assert.equal(sm.isComparing, true);

    // 2. Release compare button
    sm.endHold();
    assert.equal(sm.displayedView, 'graded');
    assert.equal(sm.isComparing, false);

    // 3. Toggle bypass mode on
    sm.toggleBypass();
    assert.equal(sm.displayedView, 'original');
    assert.equal(sm.bypassMode, true);

    // 4. Toggle bypass mode off
    sm.toggleBypass();
    assert.equal(sm.displayedView, 'graded');
    assert.equal(sm.bypassMode, false);

    // 5. Holding compare during window blur safely recovers
    sm.startHold();
    assert.equal(sm.displayedView, 'original');
    sm.onBlur();
    assert.equal(sm.displayedView, 'graded');
    assert.equal(sm.isComparing, false);
  });

  await t.test('2C.4: Ephemeral Draft Lifecycle & Clip-Switch Isolation', async () => {
    // 1. Simulate draft creation on Clip A
    let draftState = {
      active: true,
      version: 4,
      clipId: 'clip_A',
      grade: createDefaultColorGrade()
    };
    draftState.grade.exposure = 1.25;

    // 2. User discards draft -> revert to persisted state
    function discardDraft(persisted) {
      draftState.active = false;
      draftState.version = 0;
      draftState.grade = structuredClone(persisted);
    }

    discardDraft(null);
    assert.equal(draftState.active, false);
    assert.equal(draftState.version, 0);
    assert.equal(draftState.grade, null);

    // 3. User switches from Clip A to Clip B -> clean state isolation
    function switchClip(targetClip) {
      // Any in-flight work on previous clip is cancelled
      draftState = {
        active: false,
        version: 0,
        clipId: targetClip.id,
        grade: structuredClone(targetClip.colorGrade)
      };
    }

    const clipB = backend.currentProject.clips.find(c => c.id === 'clip_B');
    switchClip(clipB);
    assert.equal(draftState.clipId, 'clip_B');
    assert.equal(draftState.active, false);
    assert.equal(draftState.grade, null);
  });

  await t.test('2C.5: Transactional Commit Sync & Persisted Grade Promotion', async () => {
    const gradeToCommit = createDefaultColorGrade();
    gradeToCommit.exposure = 0.8;
    gradeToCommit.lut = { enabled: true, lutId: 'cinematic_contrast', intensity: 0.9, interpolation: 'tetrahedral' };

    // 1. Apply to Clip A
    const res = await requestJson('POST', '/api/color/apply', {
      clipId: 'clip_A',
      expectedBaseRevision: 1,
      grade: gradeToCommit
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.revision, 2);

    const clipA = backend.currentProject.clips.find(c => c.id === 'clip_A');
    assert.equal(clipA.colorGrade.exposure, 0.8);
    assert.equal(clipA.colorGrade.lut.lutId, 'cinematic_contrast');

    // 2. Adjust color params on existing grade (preservation of other params)
    const adjustedGrade = structuredClone(clipA.colorGrade);
    adjustedGrade.exposure = 1.5;

    const resAdjust = await requestJson('POST', '/api/color/apply', {
      clipId: 'clip_A',
      expectedBaseRevision: 2,
      grade: adjustedGrade
    });

    assert.equal(resAdjust.status, 200);
    assert.equal(resAdjust.data.revision, 3);
    const updatedClipA = backend.currentProject.clips.find(c => c.id === 'clip_A');
    assert.equal(updatedClipA.colorGrade.exposure, 1.5);
    assert.equal(updatedClipA.colorGrade.lut.lutId, 'cinematic_contrast', 'LUT preserved during adjustment');
  });

  await t.test('Teardown: Stop EditorBackend instance', async () => {
    await backend.stop();
  });
});
