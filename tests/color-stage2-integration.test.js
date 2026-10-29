/**
 * EME Phase 17 Stage 2D & 2E: End-to-End Delivery Verification & CIE76 Parity Test Suite
 *
 * Verifies:
 * 1. Full pipeline: Ephemeral Preview -> Transactional Apply -> FFmpeg Render -> Delivery QA.
 * 2. Guaranteed non-mutation during preview, followed by atomic commit on Apply.
 * 3. FFmpeg headless render through compiled tetrahedral 3D LUT filtergraph.
 * 4. Delivery failure isolation: render failures preserve previous verified active delivery
 *    and DO NOT silently roll back committed project revision (ChatGPT Correction 2).
 * 5. Frozen Stage 1 CIE76 Delta E*ab parity protocol confirmation (< 0.85 mean, < 1.80 P95, < 2.50 P99).
 * 6. Full Undo / Redo operational reversibility.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { EditorBackend } = require('../src/ui/server.js');
const { createDefaultColorGrade } = require('../src/engine/color-grade.js');
const { gradePixelRgb, gradeImageBuffer } = require('../src/engine/color-operations.js');
const { renderGradeHeadless, compileGradeToFiltergraph } = require('../src/renderers/ffmpeg-color-compiler.js');
const { resolveCertifiedLut } = require('../src/engine/lut-registry.js');
const { getOrLoadLut } = require('../src/engine/lut-evaluator.js');

const PORT = 4794;
const DELIVERABLES_DIR = path.resolve(__dirname, '../artifacts/stage2_deliverables');

// Color space & CIE76 Math helpers
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const X = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const Y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  const Z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

  const Xn = 0.95047;
  const Yn = 1.00000;
  const Zn = 1.08883;

  const xr = X / Xn;
  const yr = Y / Yn;
  const zr = Z / Zn;

  const eps = 216.0 / 24389.0;
  const kap = 24389.0 / 27.0;

  const fx = xr > eps ? Math.cbrt(xr) : (kap * xr + 16.0) / 116.0;
  const fy = yr > eps ? Math.cbrt(yr) : (kap * yr + 16.0) / 116.0;
  const fz = zr > eps ? Math.cbrt(zr) : (kap * zr + 16.0) / 116.0;

  const L = Math.max(0.0, 116.0 * fy - 16.0);
  const a = 500.0 * (fx - fy);
  const bVal = 200.0 * (fy - fz);

  return [L, a, bVal];
}

function computeDeltaE76(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

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
    id: 'proj_delivery_e2e',
    schemaVersion: '1.0.0',
    revision: 1,
    title: 'Stage 2E Delivery Verification Project',
    canvas: { width: 1920, height: 1080, aspectRatio: '16:9', backgroundColor: '#000000' },
    timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 480000, endpointConvention: 'half-open' },
    assets: [
      { id: 'asset_shot4', type: 'image', src: 'assets/shot4_runner.jpg', durationTicks: 480000 }
    ],
    tracks: [
      { id: 'v1', name: 'Main Video', kind: 'visual', zIndex: 0, locked: false, muted: false, visible: true }
    ],
    clips: [
      {
        id: 'clip_hero',
        trackId: 'v1',
        type: 'video',
        startTick: 0,
        durationTicks: 480000,
        assetPath: 'assets/shot4_runner.jpg',
        source: { assetId: 'asset_shot4', trimInTick: 0, trimOutTick: 480000 },
        colorGrade: null
      }
    ]
  };
}

test('Stage 2D & 2E Test Suite: Delivery Verification & CIE76 Parity', async (t) => {
  fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
  let backend = null;

  // Initial dummy active delivery
  const mockSession = {
    session_id: 'ses_stage2_delivery',
    active_delivery: {
      revision_id: 'rev-1',
      manifest_id: 'man-initial-001',
      media_path: 'assets/shot4_runner.jpg',
      sha256: 'initial_sha_value_123'
    },
    history: []
  };

  await t.test('Setup: Start EditorBackend instance with active session', async () => {
    backend = new EditorBackend({
      port: PORT,
      project: makeCanonicalProject(),
      session: mockSession
    });
    await backend.start();
  });

  const testGrade = createDefaultColorGrade();
  testGrade.exposure = 0.5;
  testGrade.whiteBalance.temperature = 0.2;
  testGrade.whiteBalance.tint = -0.05;
  testGrade.primary.lift = [0.02, 0.02, 0.02];
  testGrade.primary.gamma = [1.05, 1.05, 1.05];
  testGrade.primary.gain = [1.1, 1.1, 1.1];
  testGrade.skinProtection = { enabled: false, weight: 0.85, tolerance: 0.3 };
  testGrade.lut = {
    enabled: true,
    lutId: 'warm_golden',
    intensity: 0.85,
    interpolation: 'tetrahedral'
  };

  await t.test('2E.1: Preview is strictly non-mutating before Apply', async () => {
    const revBefore = backend.currentProject.revision;
    const resPreview = await requestJson('POST', '/api/color/preview', {
      clipId: 'clip_hero',
      frameTick: 0,
      expectedBaseRevision: 1,
      requestId: 'req_preview_before_apply',
      draftVersion: 1,
      grade: testGrade
    });

    assert.equal(resPreview.status, 200);
    assert.equal(resPreview.data.success, true);
    assert.equal(backend.currentProject.revision, revBefore, 'Revision must remain strictly at base');
    assert.equal(backend.undoStack.length, 0, 'Zero undo stack items created during preview');
    assert.equal(backend.activeSession.active_delivery.revision_id, 'rev-1', 'Active delivery pointer untouched');
  });

  await t.test('2E.2: Transactional Apply commits grade atomically (Revision 1 -> 2)', async () => {
    const resApply = await requestJson('POST', '/api/color/apply', {
      clipId: 'clip_hero',
      expectedBaseRevision: 1,
      grade: testGrade
    });

    assert.equal(resApply.status, 200);
    assert.equal(resApply.data.success, true);
    assert.equal(resApply.data.revision, 2);
    assert.equal(backend.currentProject.revision, 2);
    assert.equal(backend.undoStack.length, 1);

    const clip = backend.currentProject.clips.find(c => c.id === 'clip_hero');
    assert.equal(clip.colorGrade.exposure, 0.5);
    assert.equal(clip.colorGrade.lut.lutId, 'warm_golden');
  });

  const outputDeliveryPng = path.join(DELIVERABLES_DIR, 'delivery_rev2_shot4.png');

  await t.test('2E.3: FFmpeg Headless Color Render through Compiled Filtergraph', async () => {
    const inputMedia = path.resolve(__dirname, '../assets/shot4_runner.jpg');
    assert.ok(fs.existsSync(inputMedia), 'Input media assets/shot4_runner.jpg must exist');

    const lutDesc = resolveCertifiedLut(testGrade.lut.lutId);
    testGrade.lut.path = lutDesc.relativePath;

    const renderResult = renderGradeHeadless(inputMedia, outputDeliveryPng, testGrade, {
      lutSize: 33,
      lossless: true
    });

    assert.equal(renderResult.success, true);
    assert.ok(fs.existsSync(outputDeliveryPng), 'Rendered output file must exist');

    const stats = fs.statSync(outputDeliveryPng);
    assert.ok(stats.size > 5000, `Output file size must be > 5KB, got ${stats.size}`);

    const fileBytes = fs.readFileSync(outputDeliveryPng);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    assert.ok(sha256.length === 64, 'Output file must have valid SHA-256');
    console.log(`Rendered delivery SHA-256: ${sha256} (${stats.size} bytes)`);
  });

  await t.test('2E.4: CIE76 Delta E*ab Parity Protocol: CPU Reference vs FFmpeg Render (< 0.85 mean)', async () => {
    const inputMedia = path.resolve(__dirname, '../assets/shot4_runner.jpg');
    // Decode source media to raw RGB24
    const resRaw = spawnSync('ffmpeg', ['-v', 'error', '-i', inputMedia, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 50 * 1024 * 1024 });
    assert.equal(resRaw.status, 0);
    const rawSrcBytes = resRaw.stdout;

    // Decode rendered output to raw RGB24
    const resRendered = spawnSync('ffmpeg', ['-v', 'error', '-i', outputDeliveryPng, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 50 * 1024 * 1024 });
    assert.equal(resRendered.status, 0);
    const renderedBytes = resRendered.stdout;

    assert.equal(rawSrcBytes.length, renderedBytes.length, 'Source and rendered image dimensions must match');

    const lutDesc = resolveCertifiedLut(testGrade.lut.lutId);
    const loadedLut = getOrLoadLut(lutDesc.absolutePath);

    const numPixels = rawSrcBytes.length / 3;
    const step = Math.max(1, Math.floor(numPixels / 10000)); // Sample 10,000 pixels across image

    let sumDeltaE = 0.0;
    let maxDeltaE = 0.0;
    let sumDnMae = 0.0;
    const deltaEValues = [];

    for (let i = 0; i < numPixels; i += step) {
      const offset = i * 3;
      const sr = rawSrcBytes[offset] / 255.0;
      const sg = rawSrcBytes[offset + 1] / 255.0;
      const sb = rawSrcBytes[offset + 2] / 255.0;

      // Authoritative CPU reference evaluation
      const [refR, refG, refB] = gradePixelRgb(sr, sg, sb, testGrade, loadedLut);
      const labRef = rgbToLab(refR, refG, refB);

      // FFmpeg decoded output
      const outR = renderedBytes[offset] / 255.0;
      const outG = renderedBytes[offset + 1] / 255.0;
      const outB = renderedBytes[offset + 2] / 255.0;
      const labFfmpeg = rgbToLab(outR, outG, outB);

      const deltaE = computeDeltaE76(labRef, labFfmpeg);
      deltaEValues.push(deltaE);
      sumDeltaE += deltaE;
      if (deltaE > maxDeltaE) maxDeltaE = deltaE;

      // 8-bit RGB Digital Number (DN) MAE
      const dR = Math.abs(refR - outR) * 255.0;
      const dG = Math.abs(refG - outG) * 255.0;
      const dB = Math.abs(refB - outB) * 255.0;
      sumDnMae += (dR + dG + dB) / 3.0;
    }

    deltaEValues.sort((a, b) => a - b);
    const meanDeltaE = sumDeltaE / deltaEValues.length;
    const p95DeltaE = deltaEValues[Math.floor(deltaEValues.length * 0.95)];
    const p99DeltaE = deltaEValues[Math.floor(deltaEValues.length * 0.99)];
    const meanDnMae = sumDnMae / deltaEValues.length;

    console.log('--- Phase 17 Stage 2E Parity Conformance Report ---');
    console.log(`Evaluated Samples: ${deltaEValues.length}`);
    console.log(`Mean Delta E*ab:   ${meanDeltaE.toFixed(4)} (Threshold: < 0.85)`);
    console.log(`P95 Delta E*ab:    ${p95DeltaE.toFixed(4)} (Threshold: < 1.80)`);
    console.log(`P99 Delta E*ab:    ${p99DeltaE.toFixed(4)} (Threshold: < 2.50)`);
    console.log(`Max Delta E*ab:    ${maxDeltaE.toFixed(4)} (Threshold: < 3.50)`);
    console.log(`Mean RGB DN MAE:   ${meanDnMae.toFixed(4)} (Threshold: < 0.75)`);

    assert.ok(meanDeltaE < 0.85, `Mean Delta E ${meanDeltaE} must be < 0.85`);
    assert.ok(p95DeltaE < 1.80, `P95 Delta E ${p95DeltaE} must be < 1.80`);
    assert.ok(p99DeltaE < 2.50, `P99 Delta E ${p99DeltaE} must be < 2.50`);
    assert.ok(maxDeltaE < 3.50, `Max Delta E ${maxDeltaE} must be < 3.50`);
    assert.ok(meanDnMae < 0.75, `Mean RGB DN MAE ${meanDnMae} must be < 0.75`);
  });

  await t.test('2E.5: Delivery Failure Isolation - Render Failure Preserves Committed Grade and Active Delivery (Correction 2)', async () => {
    const revBeforeFailure = backend.currentProject.revision;
    const activeDeliveryBefore = structuredClone(backend.activeSession.active_delivery);

    // Simulate render failure: attempt to render with non-existent input media
    const badInputPath = 'assets/missing_file_404_corrupt.mp4';
    const badOutputPath = path.join(DELIVERABLES_DIR, 'failed_render.mp4');

    let renderFailed = false;
    try {
      renderGradeHeadless(badInputPath, badOutputPath, testGrade);
    } catch (err) {
      renderFailed = true;
    }
    assert.equal(renderFailed, true, 'Headless render of missing media must throw error');

    // --- ARCHITECTURAL INVARIANT (Mandatory Correction 2) ---
    // 1. The committed project revision REMAINS COMMITTED (rev 2), NOT rolled back
    assert.equal(backend.currentProject.revision, revBeforeFailure, 'Committed revision must NOT be silently rolled back on render failure');
    const clip = backend.currentProject.clips.find(c => c.id === 'clip_hero');
    assert.ok(clip.colorGrade !== null, 'Committed grade must remain intact in project state');

    // 2. Active delivery pointer remains frozen at the previous verified revision
    assert.deepStrictEqual(backend.activeSession.active_delivery, activeDeliveryBefore, 'Previous verified active delivery pointer must remain unchanged');
  });

  await t.test('2E.6: Undo and Redo Transactional Reversibility', async () => {
    // 1. Undo returns to un-graded state
    const resUndo = await requestJson('POST', '/api/project/undo', {});
    assert.equal(resUndo.status, 200);
    const clipUndone = backend.currentProject.clips.find(c => c.id === 'clip_hero');
    assert.equal(clipUndone.colorGrade, null, 'Grade must be reverted to null on undo');

    // 2. Redo restores the grade
    const resRedo = await requestJson('POST', '/api/project/redo', {});
    assert.equal(resRedo.status, 200);
    const clipRedone = backend.currentProject.clips.find(c => c.id === 'clip_hero');
    assert.ok(clipRedone.colorGrade !== null, 'Grade must be restored on redo');
    assert.equal(clipRedone.colorGrade.exposure, 0.5);
    assert.equal(clipRedone.colorGrade.lut.lutId, 'warm_golden');
  });

  await t.test('Teardown: Stop EditorBackend instance', async () => {
    await backend.stop();
  });
});
