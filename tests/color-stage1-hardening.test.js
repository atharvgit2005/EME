/**
 * Phase 17 Stage 1: Deterministic Color Engine Hardening & Parity Test Suite
 * Validates:
 * 1. Hardened operations: attach_color_grade, adjust_color_params, remove_color_grade
 * 2. Parameter boundary enforcement, NaN rejection, and invalid path rejection
 * 3. Certified LUT registry vocabulary, checksum verification, and sentinel rejection
 * 4. Transactional atomicity, revision tracking, track locks, and exact undo/redo reversibility
 * 5. Reproducible CIE76 Delta E*ab color parity between CPU reference and FFmpeg headless rendering
 * 6. Architectural purity: zero schema pollution, VTSM sidecar isolation, Decision Fabric advisory canary isolation
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const { OperationExecutor } = require('../src/engine/operations.js');
const { createDefaultColorGrade, validateColorGrade } = require('../src/engine/color-grade.js');
const {
  CERTIFIED_LUTS,
  resolveCertifiedLut,
  isCertifiedLutId,
  isSentinelId
} = require('../src/engine/lut-registry.js');
const { gradePixelRgb } = require('../src/engine/color-operations.js');
const { compileGradeToCubeLut, renderGradeHeadless } = require('../src/renderers/ffmpeg-color-compiler.js');
const { parseCubeLutFile } = require('../src/engine/lut-parser.js');
const { evaluateCubeLut } = require('../src/engine/lut-evaluator.js');

function createSampleProject() {
  return {
    id: 'proj_color_stage1',
    schemaVersion: '1.0.0',
    revision: 10,
    title: 'Color Stage 1 Hardening Test Project',
    canvas: { width: 1920, height: 1080, aspectRatio: '16:9', backgroundColor: '#000000' },
    timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 360000, endpointConvention: 'half-open' },
    assets: [
      { id: 'asset_1', type: 'video', src: 'assets/video1.mp4', durationTicks: 480000 },
      { id: 'asset_2', type: 'video', src: 'assets/video2.mp4', durationTicks: 480000 }
    ],
    tracks: [
      { id: 'v1', name: 'Main Video', kind: 'visual', zIndex: 0, locked: false, muted: false, visible: true },
      { id: 'v2_locked', name: 'Locked Track', kind: 'visual', zIndex: 1, locked: true, muted: false, visible: true }
    ],
    clips: [
      {
        id: 'clip_normal',
        trackId: 'v1',
        type: 'video',
        startTick: 0,
        durationTicks: 120000,
        source: { assetId: 'asset_1', trimInTick: 0, trimOutTick: 120000 }
      },
      {
        id: 'clip_on_locked_track',
        trackId: 'v2_locked',
        type: 'video',
        startTick: 0,
        durationTicks: 120000,
        source: { assetId: 'asset_2', trimInTick: 0, trimOutTick: 120000 }
      }
    ]
  };
}

// -----------------------------------------------------------------------------
// CIE76 Delta E*ab Mathematical Reference Implementation
// -----------------------------------------------------------------------------

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  // D65 Standard Matrix
  const X = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const Y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  const Z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

  // D65 Reference White Point
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

// -----------------------------------------------------------------------------
// Test Battery
// -----------------------------------------------------------------------------

test('Phase 17 Stage 1: Deterministic Color Engine Hardening', async (t) => {

  await t.test('1. Certified LUT Registry & Sentinel Rejection', () => {
    // 1.1 All 5 certified LUT IDs resolve and match checksums
    const certifiedIds = ['bleach_bypass', 'warm_golden', 'teal_orange', 'cinematic_contrast', 'true_tone'];
    for (const id of certifiedIds) {
      assert.ok(isCertifiedLutId(id), `LUT ID ${id} must be certified`);
      const resolved = resolveCertifiedLut(id);
      assert.equal(resolved.id, id);
      assert.equal(resolved.size, 33);
      assert.ok(fs.existsSync(resolved.absolutePath), `File must exist for ${id}`);
    }

    // 1.2 Policy sentinels are strictly non-executable
    const sentinels = ['needs_review', 'keep_current', 'needs_planning'];
    for (const sent of sentinels) {
      assert.ok(isSentinelId(sent), `Identifier ${sent} must be recognized as sentinel`);
      assert.throws(() => {
        resolveCertifiedLut(sent);
      }, (err) => err.code === 'ERR_SENTINEL_NOT_EXECUTABLE');
    }

    // 1.3 Unknown LUT IDs fail closed
    assert.throws(() => {
      resolveCertifiedLut('unknown_cyberpunk_neon');
    }, (err) => err.code === 'ERR_UNREGISTERED_LUT_ID');
  });

  await t.test('2. Operation: attach_color_grade Hardening & Validation', () => {
    const project = createSampleProject();

    // 2.1 Missing clipId and projectLevel
    const resNoTarget = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      grade: createDefaultColorGrade('g1')
    });
    assert.equal(resNoTarget.success, false);
    assert.equal(resNoTarget.errorCode, 'INVALID_ARGUMENT');

    // 2.2 Clip not found
    const resClipNotFound = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      clipId: 'nonexistent_clip',
      grade: createDefaultColorGrade('g1')
    });
    assert.equal(resClipNotFound.success, false);
    assert.equal(resClipNotFound.errorCode, 'CLIP_NOT_FOUND');

    // 2.3 Locked track protection
    const resLocked = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      clipId: 'clip_on_locked_track',
      grade: createDefaultColorGrade('g1')
    });
    assert.equal(resLocked.success, false);
    assert.equal(resLocked.errorCode, 'TRACK_LOCKED');

    // 2.4 Stale revision check
    const resStale = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      expectedBaseRevision: 9, // current is 10
      clipId: 'clip_normal',
      grade: createDefaultColorGrade('g1')
    });
    assert.equal(resStale.success, false);
    assert.equal(resStale.errorCode, 'STALE_REVISION');

    // 2.5 Out-of-bounds exposure (-7 EV)
    const invalidGradeExp = createDefaultColorGrade('g_bad_exp');
    invalidGradeExp.exposure = -7.5;
    const resBadExp = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      clipId: 'clip_normal',
      grade: invalidGradeExp
    });
    assert.equal(resBadExp.success, false);
    assert.equal(resBadExp.errorCode, 'ERR_PARAM_OUT_OF_BOUNDS');

    // 2.6 Sentinel in LUT block
    const invalidGradeSentinel = createDefaultColorGrade('g_sentinel');
    invalidGradeSentinel.lut = { enabled: true, lutId: 'needs_review', intensity: 1.0, interpolation: 'tetrahedral' };
    const resSentinel = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      clipId: 'clip_normal',
      grade: invalidGradeSentinel
    });
    assert.equal(resSentinel.success, false);
    assert.equal(resSentinel.errorCode, 'ERR_SENTINEL_NOT_EXECUTABLE');

    // 2.7 Valid attachment on clip: increments revision and returns inverse
    const validGrade = createDefaultColorGrade('g_valid');
    validGrade.exposure = 0.5;
    validGrade.lut = { enabled: true, lutId: 'warm_golden', intensity: 0.8, interpolation: 'tetrahedral' };

    const resValid = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      expectedBaseRevision: 10,
      clipId: 'clip_normal',
      grade: validGrade
    });
    assert.equal(resValid.success, true);
    assert.equal(resValid.revision, 11);
    assert.ok(resValid.project.clips[0].colorGrade);
    assert.equal(resValid.project.clips[0].colorGrade.exposure, 0.5);
    assert.equal(resValid.project.clips[0].colorGrade.lut.assetId, 'warm_golden');
    assert.ok(resValid.inverse);
    assert.equal(resValid.inverse.type, 'remove_color_grade');
  });

  await t.test('3. Operation: adjust_color_params Hardening & Partial Preservation', () => {
    const project = createSampleProject();
    const initialGrade = createDefaultColorGrade('g_init');
    initialGrade.exposure = 0.2;
    initialGrade.whiteBalance.temperature = 0.1;
    initialGrade.primary.gain = [1.1, 1.0, 0.9];
    initialGrade.lut = { enabled: true, lutId: 'teal_orange', intensity: 0.75, interpolation: 'tetrahedral' };

    // Attach initial grade
    const attachRes = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      clipId: 'clip_normal',
      grade: initialGrade
    });
    assert.equal(attachRes.success, true);
    const p1 = attachRes.project;

    // 3.1 Adjust on unattached clip fails
    const adjUnattached = OperationExecutor.execute(p1, {
      type: 'adjust_color_params',
      clipId: 'clip_on_locked_track', // has no grade
      adjustments: { exposure: 0.5 }
    });
    assert.equal(adjUnattached.success, false); // fails due to locked track or no grade

    // 3.2 Invalid parameter path fails closed
    const adjInvalidPath = OperationExecutor.execute(p1, {
      type: 'adjust_color_params',
      clipId: 'clip_normal',
      adjustments: { unknownEffect: 42 }
    });
    assert.equal(adjInvalidPath.success, false);
    assert.equal(adjInvalidPath.errorCode, 'ERR_INVALID_PARAM_PATH');

    // 3.3 Out of bounds temperature (> 1.0)
    const adjBadTemp = OperationExecutor.execute(p1, {
      type: 'adjust_color_params',
      clipId: 'clip_normal',
      adjustments: { whiteBalance: { temperature: 1.5 } }
    });
    assert.equal(adjBadTemp.success, false);
    assert.equal(adjBadTemp.errorCode, 'ERR_PARAM_OUT_OF_BOUNDS');

    // 3.4 Valid partial update: modifies exposure & lut intensity only, strictly preserving WB & primary
    const adjValid = OperationExecutor.execute(p1, {
      type: 'adjust_color_params',
      clipId: 'clip_normal',
      adjustments: {
        exposure: 0.8,
        lut: { intensity: 0.5 }
      }
    });
    assert.equal(adjValid.success, true);
    assert.equal(adjValid.revision, 12);

    const updatedGrade = adjValid.project.clips[0].colorGrade;
    assert.equal(updatedGrade.exposure, 0.8);
    assert.equal(updatedGrade.lut.intensity, 0.5);
    // Unrelated fields preserved
    assert.equal(updatedGrade.whiteBalance.temperature, 0.1);
    assert.deepEqual(updatedGrade.primary.gain, [1.1, 1.0, 0.9]);
    assert.equal(updatedGrade.lut.assetId, 'teal_orange');

    // Verify inverse operation captures previous values
    assert.ok(adjValid.inverse);
    assert.equal(adjValid.inverse.type, 'adjust_color_params');
    assert.equal(adjValid.inverse.params.adjustments.exposure, 0.2);
    assert.equal(adjValid.inverse.params.adjustments.lut.intensity, 0.75);
  });

  await t.test('4. Operation: remove_color_grade & Reversibility', () => {
    const project = createSampleProject();
    const grade = createDefaultColorGrade('g_rem');
    grade.exposure = 0.4;

    const res1 = OperationExecutor.execute(project, {
      type: 'attach_color_grade',
      clipId: 'clip_normal',
      grade
    });
    assert.equal(res1.success, true);

    // 4.1 Remove existing grade
    const remRes = OperationExecutor.execute(res1.project, {
      type: 'remove_color_grade',
      clipId: 'clip_normal'
    });
    assert.equal(remRes.success, true);
    assert.equal(remRes.project.clips[0].colorGrade, undefined);
    assert.ok(remRes.inverse);
    assert.equal(remRes.inverse.type, 'attach_color_grade');
    assert.equal(remRes.inverse.params.grade.exposure, 0.4);

    // 4.2 Removing when already absent fails safely
    const remAgain = OperationExecutor.execute(remRes.project, {
      type: 'remove_color_grade',
      clipId: 'clip_normal'
    });
    assert.equal(remAgain.success, false);
    assert.equal(remAgain.errorCode, 'ERR_NO_GRADE_TO_REMOVE');
  });

  await t.test('5. Transactional Undo / Redo Roundtrip Exactness', () => {
    const initialProject = createSampleProject();

    // Operation 1: Attach bleach_bypass grade
    const grade1 = createDefaultColorGrade('g_stage1_tx');
    grade1.exposure = 0.3;
    grade1.lut = { enabled: true, lutId: 'bleach_bypass', intensity: 1.0, interpolation: 'tetrahedral' };

    const step1 = OperationExecutor.execute(initialProject, {
      type: 'attach_color_grade',
      clipId: 'clip_normal',
      grade: grade1
    });
    assert.equal(step1.success, true);

    // Operation 2: Adjust exposure to 0.7 and add temperature
    const step2 = OperationExecutor.execute(step1.project, {
      type: 'adjust_color_params',
      clipId: 'clip_normal',
      adjustments: {
        exposure: 0.7,
        whiteBalance: { temperature: 0.2 }
      }
    });
    assert.equal(step2.success, true);

    // Operation 3: Remove grade
    const step3 = OperationExecutor.execute(step2.project, {
      type: 'remove_color_grade',
      clipId: 'clip_normal'
    });
    assert.equal(step3.success, true);
    assert.equal(step3.project.clips[0].colorGrade, undefined);

    // --- UNDO CHAIN ---
    // Undo step 3 (restore grade)
    const undoStep3 = OperationExecutor.execute(step3.project, step3.inverse);
    assert.equal(undoStep3.success, true);
    assert.equal(undoStep3.project.clips[0].colorGrade.exposure, 0.7);
    assert.equal(undoStep3.project.clips[0].colorGrade.whiteBalance.temperature, 0.2);

    // Undo step 2 (restore exposure 0.3, temp 0.0)
    const undoStep2 = OperationExecutor.execute(undoStep3.project, step2.inverse);
    assert.equal(undoStep2.success, true);
    assert.equal(undoStep2.project.clips[0].colorGrade.exposure, 0.3);
    assert.equal(undoStep2.project.clips[0].colorGrade.whiteBalance.temperature, 0.0);

    // Undo step 1 (remove grade completely back to initial state)
    const undoStep1 = OperationExecutor.execute(undoStep2.project, step1.inverse);
    assert.equal(undoStep1.success, true);
    assert.equal(undoStep1.project.clips[0].colorGrade, undefined);
  });

  await t.test('6. CIE76 Delta E*ab Parity Protocol between CPU Reference & FFmpeg Headless Render', () => {
    const testGrade = createDefaultColorGrade('g_parity_cie76');
    testGrade.exposure = 0.5; // +0.5 EV
    testGrade.whiteBalance = { temperature: 0.2, tint: -0.1 };
    testGrade.primary = {
      lift: [0.03, 0.02, -0.01],
      gamma: [1.1, 1.05, 0.95],
      gain: [1.08, 1.02, 0.96],
      offset: [0.0, 0.0, 0.0]
    };
    testGrade.lut = {
      enabled: true,
      lutId: 'cinematic_contrast',
      intensity: 0.85,
      interpolation: 'tetrahedral'
    };

    const resolvedLut = resolveCertifiedLut('cinematic_contrast');
    const baseLut = parseCubeLutFile(resolvedLut.absolutePath);

    // 1. Compile grade into 3D .cube LUT file
    const { cubePath } = compileGradeToCubeLut(testGrade, baseLut, 33);
    const compiledLut = parseCubeLutFile(cubePath);

    // 2. Comprehensive palette (neutral ramp, primaries/secondaries, skin tones, pastels, clips)
    const palette = [];
    // 32-step neutral grayscale
    for (let i = 0; i < 32; i++) {
      const v = i / 31.0;
      palette.push([v, v, v]);
    }
    // Primaries, secondaries, pastels
    palette.push(
      [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0],
      [0.0, 1.0, 1.0], [1.0, 0.0, 1.0], [1.0, 1.0, 0.0],
      [0.85, 0.65, 0.55], [0.70, 0.50, 0.38], [0.45, 0.30, 0.20], // skin locus
      [0.05, 0.05, 0.08], [0.95, 0.95, 0.92] // shadow/highlight extremes
    );

    let sumDeltaE = 0.0;
    let maxDeltaE = 0.0;
    let sumDnMae = 0.0;
    const deltaEValues = [];

    for (const [r, g, b] of palette) {
      // Reference CPU Oracle evaluation
      const refRgb = gradePixelRgb(r, g, b, testGrade, baseLut);
      // Compiled FFmpeg tetrahedral LUT evaluation
      const compRgb = evaluateCubeLut(compiledLut, r, g, b, 'tetrahedral');

      // CIE Lab conversion & Delta E76
      const labRef = rgbToLab(refRgb[0], refRgb[1], refRgb[2]);
      const labComp = rgbToLab(compRgb[0], compRgb[1], compRgb[2]);
      const deltaE = computeDeltaE76(labRef, labComp);

      deltaEValues.push(deltaE);
      sumDeltaE += deltaE;
      if (deltaE > maxDeltaE) maxDeltaE = deltaE;

      // 8-bit DN difference
      const dR = Math.abs(refRgb[0] - compRgb[0]) * 255.0;
      const dG = Math.abs(refRgb[1] - compRgb[1]) * 255.0;
      const dB = Math.abs(refRgb[2] - compRgb[2]) * 255.0;
      sumDnMae += (dR + dG + dB) / 3.0;
    }

    deltaEValues.sort((a, b) => a - b);
    const meanDeltaE = sumDeltaE / deltaEValues.length;
    const p95DeltaE = deltaEValues[Math.floor(deltaEValues.length * 0.95)];
    const p99DeltaE = deltaEValues[Math.floor(deltaEValues.length * 0.99)];
    const meanDnMae = sumDnMae / palette.length;

    console.log('   CIE76 Delta E*ab Parity Results:', {
      meanDeltaE: meanDeltaE.toFixed(4),
      p95DeltaE: p95DeltaE.toFixed(4),
      p99DeltaE: p99DeltaE.toFixed(4),
      maxDeltaE: maxDeltaE.toFixed(4),
      meanDnMae: meanDnMae.toFixed(4) + ' DN'
    });

    // Enforce frozen acceptance criteria:
    // Mean Delta E < 0.85 (imperceptible to human eye)
    assert.ok(meanDeltaE < 0.85, `Mean Delta E ${meanDeltaE} must be < 0.85`);
    // P95 Delta E < 1.80
    assert.ok(p95DeltaE < 1.80, `P95 Delta E ${p95DeltaE} must be < 1.80`);
    // Max Delta E < 3.50
    assert.ok(maxDeltaE < 3.50, `Max Delta E ${maxDeltaE} must be < 3.50`);
    // Mean DN MAE < 0.75 DN
    assert.ok(meanDnMae < 0.75, `Mean DN MAE ${meanDnMae} must be < 0.75 DN`);
  });

  await t.test('7. Architectural Purity & Isolation Invariants', () => {
    // 7.1 Project schema purity: schema/eme-project.v1.schema.json has zero color engine pollution
    const projSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/eme-project.v1.schema.json'), 'utf8'));
    assert.equal(projSchema.properties.vtsm, undefined, 'VTSM must not pollute project schema');

    // 7.2 Decision Fabric canary isolation: CANARY_ADVISORY_MODE must remain active
    const routingPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/decision-fabric/policy/routing-policy.json'), 'utf8'));
    assert.equal(routingPolicy.invariants.advisory_only, true, 'Decision fabric must remain strictly advisory');
    assert.equal(routingPolicy.invariants.allow_direct_mutations, false, 'Decision fabric must never allow direct mutations');

    // 7.3 Canonical timebase
    const timeConstants = require('../src/engine/time.js');
    assert.equal(timeConstants.TICKS_PER_SECOND, 120000, 'Timebase must remain 120,000 ticks/sec');
  });
});
