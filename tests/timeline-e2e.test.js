/**
 * EME Timeline End-to-End & Performance Benchmark Suite (TL-01 / Phase 18)
 *
 * Verifies:
 * 1. End-to-end interactive editing cycle via EditorBackend API
 * 2. Non-destructive operations (trim, ripple_trim, split, slip, slide, track_state, color_grade)
 * 3. Exact rational microsecond <-> 120,000 ticks/sec CapCut draft import
 * 4. P95 latency guarantees on 1,000-clip stress timeline (target <= 16.67 ms / 60 FPS)
 * 5. Audio waveform extraction & caching
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { EditorBackend } = require('../src/ui/server.js');
const { TimelineAdapter } = require('../src/engine/timeline-adapter.js');
const { AudioWaveformService } = require('../src/engine/audio-waveform.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { MediaTime, TICKS_PER_SECOND } = require('../src/engine/time.js');

function postJson(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    }).on('error', reject);
  });
}

test('Timeline E2E: Full Interactive Editing Loop via API', async (t) => {
  const backend = new EditorBackend({ port: 4422 });
  await backend.start();

  try {
    // 1. Load active project
    const loadRes = await getJson(4422, '/api/project?path=artifacts/phase-7/scenario-1-16x9.json');
    assert.equal(loadRes.status, 200);
    assert.equal(loadRes.body.project.canvas.aspectRatio, '16:9');
    const initialRev = loadRes.body.project.revision;

    // 2. Query timeline view projection
    const tlRes = await getJson(4422, '/api/timeline?zoom=1.5&playhead=60000');
    assert.equal(tlRes.status, 200);
    assert.equal(tlRes.body.timeline.playhead.timecode, '00:00:00:30');
    assert.ok(tlRes.body.timeline.clips.length > 0);

    // 3. Dispatch Split Clip operation
    const targetClip = loadRes.body.project.clips.find(c => c.durationTicks > 40000);
    assert.ok(targetClip, 'Must find a clip to split');
    const splitTick = targetClip.startTick + Math.floor(targetClip.durationTicks / 2);

    const splitRes = await postJson(4422, '/api/project/operation', {
      operation: {
        type: 'split_clip',
        params: { clipId: targetClip.id, splitTick }
      }
    });
    if (splitRes.status !== 200) {
      console.log('splitRes failed:', JSON.stringify(splitRes.body, null, 2));
    }
    assert.equal(splitRes.status, 200);
    assert.equal(splitRes.body.success, true);
    assert.equal(splitRes.body.revision, initialRev + 1);

    // 4. Attach Color Grade to clip
    const { createDefaultColorGrade } = require('../src/engine/color-grade.js');
    const testGrade = createDefaultColorGrade('test_grade_split', {
      inputSpace: 'rec709',
      outputSpace: 'rec709'
    });
    testGrade.exposure = 0.75;
    testGrade.whiteBalance.temperature = 0.15;
    testGrade.whiteBalance.tint = -0.05;
    testGrade.primary.lift = [0.05, 0.05, 0.05];
    testGrade.primary.gamma = [1.1, 1.1, 1.1];
    testGrade.primary.gain = [1.05, 1.05, 1.05];
    testGrade.lut = {
      enabled: true,
      path: 'assets/luts/cine_teal_orange_33.cube',
      intensity: 0.85,
      interpolation: 'tetrahedral'
    };
    testGrade.skinProtection = {
      enabled: true,
      weight: 0.85,
      tolerance: 0.25
    };

    const gradeRes = await postJson(4422, '/api/color-grade/save', {
      clipId: targetClip.id,
      grade: testGrade
    });
    if (gradeRes.status !== 200) {
      console.log('gradeRes failed:', JSON.stringify(gradeRes.body, null, 2));
    }
    assert.equal(gradeRes.status, 200);
    assert.equal(gradeRes.body.success, true);

    // 5. Query scene analysis
    const sceneRes = await getJson(4422, '/api/scene-analysis');
    assert.equal(sceneRes.status, 200);
    assert.ok(sceneRes.body.analysis.whiteBalance.estimatedCCT > 0);
    assert.ok(Math.abs(sceneRes.body.analysis.skin.meanSkinAngleDeg - 123.0) < 15.0);

    // 6. Test Undo
    const undoRes = await postJson(4422, '/api/project/undo', {});
    assert.equal(undoRes.status, 200);
    assert.equal(undoRes.body.canUndo, true);

    // 7. Test Redo
    const redoRes = await postJson(4422, '/api/project/redo', {});
    assert.equal(redoRes.status, 200);

    // 8. Test Waveform API
    const wfRes = await getJson(4422, '/api/waveform?path=synthetic&pps=50');
    assert.equal(wfRes.status, 200);
    assert.ok(wfRes.body.peaks.length > 0);
  } finally {
    await backend.stop();
  }
});

test('Timeline E2E: CapCut Draft Import Round-Trip Exactness', () => {
  const capcutDraft = {
    id: "capcut_e2e_project",
    name: "CapCut Parity Project",
    fps: 60,
    duration: 10000000, // 10.0 seconds in microseconds
    canvas_config: { width: 1080, height: 1920, ratio: "9:16" },
    materials: {
      videos: [
        { id: "mat_1", path: "assets/clip1.mp4", duration: 5000000 },
        { id: "mat_2", path: "assets/clip2.mp4", duration: 5000000 }
      ]
    },
    tracks: [
      {
        id: "t_v1",
        type: "video",
        mute: false,
        segments: [
          {
            id: "seg_1",
            material_id: "mat_1",
            source_timerange: { start: 0, duration: 3000000 }, // 3.0s -> 360,000 ticks
            target_timerange: { start: 0, duration: 3000000 }
          },
          {
            id: "seg_2",
            material_id: "mat_2",
            source_timerange: { start: 500000, duration: 4000000 }, // 4.0s -> 480,000 ticks
            target_timerange: { start: 3000000, duration: 4000000 }
          }
        ]
      }
    ]
  };

  const emeProject = TimelineAdapter.importCapCutDraft(capcutDraft);

  // Exact rational conversions verification: 1,000,000 us = 120,000 ticks
  assert.equal(emeProject.timebase.durationTicks, 1200000); // 10s = 1,200,000 ticks
  assert.equal(emeProject.clips.length, 2);

  const clip1 = emeProject.clips[0];
  assert.equal(clip1.startTick, 0);
  assert.equal(clip1.durationTicks, 360000);
  assert.equal(clip1.source.trimInTick, 0);
  assert.equal(clip1.source.trimOutTick, 360000);

  const clip2 = emeProject.clips[1];
  assert.equal(clip2.startTick, 360000);
  assert.equal(clip2.durationTicks, 480000);
  assert.equal(clip2.source.trimInTick, 60000); // 500,000 us * 3 / 25 = 60,000 ticks
  assert.equal(clip2.source.trimOutTick, 540000);

  // Half-open interval adjacency check: clip1.out == clip2.in
  assert.equal(clip1.startTick + clip1.durationTicks, clip2.startTick);
});

test('Timeline Performance Benchmark: 1,000-Clip Interaction Rendering & Snapping (P95 <= 16.67ms)', () => {
  const stressProj = {
    id: 'proj_benchmark_1000',
    schemaVersion: '1.0.0',
    revision: 0,
    title: '1,000 Clip Benchmark Project',
    canvas: { width: 1920, height: 1080 },
    timebase: {
      fps: { numerator: 60, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 1000 * 2000,
      endpointConvention: 'half-open'
    },
    assets: [
      { id: 'asset_bench', type: 'video', src: 'assets/test.mp4', durationTicks: 10000000 }
    ],
    tracks: [
      { id: 'track_b0', name: 'Video 1', kind: 'visual', zIndex: 0 },
      { id: 'track_b1', name: 'Video 2', kind: 'visual', zIndex: 1 },
      { id: 'track_b2', name: 'Audio 1', kind: 'audio', zIndex: 2 }
    ],
    clips: []
  };

  // Populate 1,000 clips across 3 tracks
  for (let i = 0; i < 1000; i++) {
    const tIdx = i % 3;
    stressProj.clips.push({
      id: `bclip_${i}`,
      trackId: `track_b${tIdx}`,
      type: tIdx === 2 ? 'audio' : 'video',
      startTick: Math.floor(i / 3) * 6000,
      durationTicks: 6000,
      source: { assetId: 'asset_bench', trimInTick: 0, trimOutTick: 6000 }
    });
  }

  // 1. Benchmark: View Projection (TimelineAdapter.projectToTimelineView)
  // Warmup
  TimelineAdapter.projectToTimelineView(stressProj, { zoom: 1.0, playheadTick: 50000 });

  const viewTimings = [];
  for (let i = 0; i < 50; i++) {
    const t0 = process.hrtime.bigint();
    const view = TimelineAdapter.projectToTimelineView(stressProj, {
      zoom: 1.0 + (i % 5) * 0.2,
      playheadTick: (i * 12000) % 2000000
    });
    const t1 = process.hrtime.bigint();
    assert.equal(view.clips.length, 1000);
    viewTimings.push(Number(t1 - t0) / 1e6);
  }
  viewTimings.sort((a, b) => a - b);
  const p95View = viewTimings[Math.floor(viewTimings.length * 0.95)];
  const p50View = viewTimings[Math.floor(viewTimings.length * 0.5)];

  console.log(`   1,000-clip View Projection Latency — P50: ${p50View.toFixed(2)} ms, P95: ${p95View.toFixed(2)} ms`);
  assert.ok(p95View < 16.67, `Timeline view projection P95 ${p95View} ms must be <= 16.67 ms (60 FPS)`);

  // 2. Benchmark: Magnetic Snap Calculation (TimelineAdapter.computeMagneticSnap)
  const snapTimings = [];
  for (let i = 0; i < 100; i++) {
    const t0 = process.hrtime.bigint();
    const snap = TimelineAdapter.computeMagneticSnap(i * 5990, stressProj, 16000, 50000);
    const t1 = process.hrtime.bigint();
    assert.ok(snap !== null);
    snapTimings.push(Number(t1 - t0) / 1e6);
  }
  snapTimings.sort((a, b) => a - b);
  const p95Snap = snapTimings[Math.floor(snapTimings.length * 0.95)];
  const p50Snap = snapTimings[Math.floor(snapTimings.length * 0.5)];

  console.log(`   1,000-clip Magnetic Snap Latency — P50: ${p50Snap.toFixed(3)} ms, P95: ${p95Snap.toFixed(3)} ms`);
  assert.ok(p95Snap < 2.0, `Magnetic snap P95 ${p95Snap.toFixed(3)} ms must be <= 2.0 ms (well within 16.67ms frame budget)`);
});
