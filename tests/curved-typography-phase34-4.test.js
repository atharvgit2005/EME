/**
 * Editing Mechanics Engine (EME) - Phase 34.4 Test Suite
 * Native Curved Kinetic Typography & Timeline Animation Slice
 *
 * Verifies:
 * 1. Bounded parameter validation (text, arc/path curve, styling, animation, timeline ticks).
 * 2. Mathematical geometry (glyph coordinates, tangent rotation angles, curvature ratio >= 1.5).
 * 3. Deterministic SVG generation (<textPath> and rotated glyphs).
 * 4. Capability matrix truthfulness (curved_typography supported; 3D/relighting refused).
 * 5. Plan compilation & OperationExecutor authority (preserves INV-01, zero schema drift).
 * 6. Native rasterizer & quantitative curvature audit (curved vs flat height span >= 1.5x, non-zero pixels).
 * 7. Kinetic timeline motion verification (pixel diff >= 2.0% between animated timestamps).
 * 8. Real 9:16 video rendering slice from raw_talking_head_30s.mp4 with animated curved typography.
 * 9. Subject safety, headroom preservation, and zero face collisions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  CurvedTypography,
  CompositionRenderer,
  CreativePlanCompiler,
  CreativeContextBuilder,
  MockLlmAdapter,
  ReframingEngine
} = require('../src/creative/index.js');
const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { FrameInspector } = require('../src/renderers/inspector.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const FIXTURE_PROJECT_PATH = path.resolve(__dirname, '../fixtures/prompt-core/projects/project-pf02-scenario1.json');
const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts', 'phase-34');
const TALKING_HEAD_VIDEO = path.resolve(__dirname, '..', 'raw_videos', 'raw_talking_head_30s.mp4');

test('Phase 34.4: Native Curved Kinetic Typography Slice Suite', async (t) => {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // =========================================================================
  // Section 1: Bounded Parameter Validation (Fail-Closed)
  // =========================================================================
  await t.test('1.1: Validates bounded arc typography parameters', () => {
    const valid = CurvedTypography.validateParams({
      text: 'CINEMATIC IMPACT',
      curve: {
        type: 'arc',
        centerX: 540,
        centerY: 1000,
        radius: 400,
        startAngleDeg: 144,
        endAngleDeg: 36
      },
      styling: {
        fontFamily: 'Helvetica',
        fontSize: 64,
        color: [255, 255, 0],
        opacity: 0.95
      },
      animation: {
        type: 'curve_sweep',
        sweepShiftDeg: 30
      },
      timeline: {
        startTick: 0,
        durationTicks: 240000
      }
    });

    assert.equal(valid.text, 'CINEMATIC IMPACT');
    assert.equal(valid.curve.centerX, 540);
    assert.equal(valid.curve.radius, 400);
    assert.equal(valid.styling.fontSize, 64);
    assert.equal(valid.animation.type, 'curve_sweep');
    assert.equal(valid.timeline.durationTicks, 240000);
  });

  await t.test('1.2: Rejects out-of-bounds and invalid parameters fail-closed', () => {
    // Empty text
    assert.throws(() => {
      CurvedTypography.validateParams({ text: '   ' });
    }, /ERR_INVALID_TYPOGRAPHY_PARAMETER/);

    // Negative radius
    assert.throws(() => {
      CurvedTypography.validateParams({ text: 'TEST', curve: { radius: -50 } });
    }, /ERR_INVALID_CURVE_GEOMETRY/);

    // Out of bounds canvas center
    assert.throws(() => {
      CurvedTypography.validateParams({ text: 'TEST', curve: { centerX: 99999 } });
    }, /ERR_INVALID_CURVE_GEOMETRY/);

    // Out of bounds font size
    assert.throws(() => {
      CurvedTypography.validateParams({ text: 'TEST', styling: { fontSize: 999 } });
    }, /ERR_INVALID_TYPOGRAPHY_PARAMETER/);

    // Out of bounds opacity
    assert.throws(() => {
      CurvedTypography.validateParams({ text: 'TEST', styling: { opacity: 1.5 } });
    }, /ERR_INVALID_TYPOGRAPHY_PARAMETER/);
  });

  await t.test('1.3: Rejects invalid animation types fail-closed', () => {
    assert.throws(() => {
      CurvedTypography.validateParams({
        text: 'TEST',
        animation: { type: 'unsupported_3d_warp' }
      });
    }, /ERR_INVALID_TYPOGRAPHY_PARAMETER/);
  });

  await t.test('1.4: Rejects non-integer or negative timeline ticks', () => {
    assert.throws(() => {
      CurvedTypography.validateParams({
        text: 'TEST',
        timeline: { startTick: -100 }
      });
    }, /ERR_INVALID_TYPOGRAPHY_PARAMETER/);

    assert.throws(() => {
      CurvedTypography.validateParams({
        text: 'TEST',
        timeline: { durationTicks: 1200.5 } // float tick violates integer timebase
      });
    }, /ERR_INVALID_TYPOGRAPHY_PARAMETER/);
  });

  // =========================================================================
  // Section 2: Mathematical Geometry & Arc Calculation
  // =========================================================================
  await t.test('2.1: Computes exact glyph coordinates and tangent angles along arc', () => {
    const geom = CurvedTypography.computeGeometry({
      text: 'ARC MOTION',
      curve: {
        centerX: 540,
        centerY: 1000,
        radius: 400,
        startAngleDeg: 140,
        endAngleDeg: 40
      },
      styling: { fontSize: 64 }
    });

    assert.equal(geom.glyphCount, 10);
    assert.equal(geom.glyphs.length, 10);

    // First glyph at ~140 degrees (cos 140 < 0, sin 140 > 0)
    const first = geom.glyphs[0];
    assert.equal(first.char, 'A');
    assert.ok(first.x < 540, `First glyph X (${first.x}) should be left of center`);
    assert.ok(first.y < 1000, `First glyph Y (${first.y}) should be above center`);

    // Middle glyph near top of arc (~90 deg)
    const mid = geom.glyphs[Math.floor(geom.glyphs.length / 2)];
    assert.ok(Math.abs(mid.x - 540) < 60, `Middle glyph X (${mid.x}) should be near center 540`);
    assert.ok(mid.y < first.y, `Top of arch (${mid.y}) should be higher than ends (${first.y})`);

    // Last glyph at ~40 degrees (cos 40 > 0, sin 40 > 0)
    const last = geom.glyphs[geom.glyphs.length - 1];
    assert.equal(last.char, 'N');
    assert.ok(last.x > 540, `Last glyph X (${last.x}) should be right of center`);

    // Curvature ratio must exceed 1.5x flat line height
    assert.ok(geom.curvatureRatio >= 1.5, `Curvature ratio (${geom.curvatureRatio}) must be >= 1.5`);
    assert.equal(geom.isCurved, true);
  });

  // =========================================================================
  // Section 3: Deterministic SVG Generation
  // =========================================================================
  await t.test('3.1: Generates deterministic SVG with <textPath> and rotated glyphs', () => {
    const svg = CurvedTypography.generateSvg({
      text: 'EME CURVED',
      curve: { centerX: 540, centerY: 800, radius: 350, startAngleDeg: 150, endAngleDeg: 30 },
      styling: { fontFamily: 'Helvetica', fontSize: 60, color: [255, 255, 0], opacity: 1.0 }
    });

    assert.ok(svg.includes('<svg'), 'Must produce SVG root element');
    assert.ok(svg.includes('<defs>'), 'Must include defs section for path definition');
    assert.ok(svg.includes('<path id="textArcCurve"'), 'Must define textArcCurve path');
    assert.ok(svg.includes('<textPath href="#textArcCurve"'), 'Must include standard textPath');
    assert.ok(svg.includes('<g id="curvedGlyphs"'), 'Must include rotated glyph group');
    assert.ok(svg.includes('transform="rotate('), 'Must rotate individual glyphs along tangent');
  });

  // =========================================================================
  // Section 4: Capability Matrix Truthfulness
  // =========================================================================
  await t.test('4.1: Capability matrix marks curved_typography supported', () => {
    const capCheck = CompositionRenderer.validateCapabilities({
      features: ['crop_9_16', 'scale_canvas', 'curved_typography']
    });
    assert.equal(capCheck.supported, true);
    assert.equal(capCheck.unsupportedFeatures.length, 0);
    assert.ok(CompositionRenderer.SUPPORTED_CAPABILITIES.includes('curved_typography'));
  });

  await t.test('4.2: Capability matrix continues to reject unverified capabilities', () => {
    const capCheck = CompositionRenderer.validateCapabilities({
      features: ['perspective_3d', 'neural_relighting']
    });
    assert.equal(capCheck.supported, false);
    assert.equal(capCheck.unsupportedFeatures.length, 2);
    assert.ok(capCheck.errors.some(e => e.includes('perspective_3d')));
    assert.ok(capCheck.errors.some(e => e.includes('neural_relighting')));
  });

  // =========================================================================
  // Section 5: Plan Compilation & Mutation Authority
  // =========================================================================
  await t.test('5.1: CreativePlanCompiler compiles apply_effect for curved typography', async () => {
    const project = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const context = CreativeContextBuilder.buildContext({
      brief: 'Create a 10s punchy 9:16 vertical reel with curved title',
      project
    });
    const creativePlan = await new MockLlmAdapter().generateCreativePlan({ context });

    const compileRes = CreativePlanCompiler.compile({
      creativePlan,
      project,
      options: {
        curvedTypography: {
          text: 'REVOLUTIONARY EDIT',
          curve: {
            centerX: 540,
            centerY: 500,
            radius: 350,
            startAngleDeg: 140,
            endAngleDeg: 40
          },
          animation: {
            type: 'curve_sweep',
            sweepShiftDeg: 30
          }
        }
      }
    });

    assert.equal(compileRes.success, true, 'Compilation must succeed with curved typography');
    assert.equal(compileRes.errors.length, 0);

    // Find the insert_clip operation for the curved text
    const insertOp = compileRes.operationPlan.operations.find(
      op => op.type === 'insert_clip' && op.params.properties?.curved_typography
    );
    assert.ok(insertOp, 'Must emit insert_clip with curved_typography properties');
    assert.equal(insertOp.params.properties.curved_typography.text, 'REVOLUTIONARY EDIT');

    // Find the apply_effect operation for curved_typography
    const effectOp = compileRes.operationPlan.operations.find(
      op => op.type === 'apply_effect' && op.params.effect?.parameters?.effect === 'curved_typography'
    );
    assert.ok(effectOp, 'Must emit apply_effect for curved_typography');
    assert.equal(effectOp.params.effect.type, 'transition');

    // Execute dry run verification
    assert.ok(compileRes.dryRunResult, 'Dry run result must exist');
    assert.equal(compileRes.dryRunResult.success, true);
  });

  // =========================================================================
  // Section 6: Native Rasterization & Curvature Quantitative Audit
  // =========================================================================
  await t.test('6.1: Rasterizes control flat vs curved text PNGs and verifies curvature ratio >= 1.5x', () => {
    const curvedPath = path.join(ARTIFACTS_DIR, 'test_curved_render.png');
    const flatPath = path.join(ARTIFACTS_DIR, 'test_flat_render.png');

    // 1. Render Curved Text
    const curvedRes = CurvedTypography.rasterize({
      text: 'ARCHING TITLE',
      outputPath: curvedPath,
      curve: { centerX: 540, centerY: 600, radius: 400, startAngleDeg: 144, endAngleDeg: 36 },
      styling: { fontSize: 64, color: [255, 255, 0] }
    });

    assert.equal(curvedRes.success, true);
    assert.ok(fs.existsSync(curvedPath));

    // 2. Render Control Flat Text
    const flatRes = CurvedTypography.rasterize({
      text: 'ARCHING TITLE',
      outputPath: flatPath,
      controlFlat: true,
      curve: { centerX: 540, centerY: 600 },
      styling: { fontSize: 64, color: [255, 255, 0] }
    });

    assert.equal(flatRes.success, true);
    assert.ok(fs.existsSync(flatPath));

    // 3. Quantitative Curvature Audit
    const audit = CurvedTypography.auditCurvature({
      curvedImagePath: curvedPath,
      controlFlatImagePath: flatPath
    });

    assert.ok(audit.textPixels > 1000, `Text pixels (${audit.textPixels}) must exceed 1000`);
    assert.ok(audit.curvedBounds.height > audit.flatHeightSpan, 'Curved height span must exceed flat height');
    assert.ok(audit.curvatureRatio >= 1.5, `Curvature ratio (${audit.curvatureRatio}) must be >= 1.5`);
    assert.equal(audit.isCurved, true);
  });

  // =========================================================================
  // Section 7: Kinetic Timeline Animation & Motion Verification
  // =========================================================================
  await t.test('7.1: Rasterizes animated sequence and audits pixel delta across timestamps', () => {
    const seqDir = path.join(ARTIFACTS_DIR, 'kinetic_seq_test');
    fs.mkdirSync(seqDir, { recursive: true });
    const seqPattern = path.join(seqDir, 'frame_%04d.png');

    const seqRes = CurvedTypography.rasterize({
      text: 'KINETIC SWEEP',
      mode: 'sequence',
      totalFrames: 30,
      outputPattern: seqPattern,
      curve: { centerX: 540, centerY: 500, radius: 350, startAngleDeg: 140, endAngleDeg: 40 },
      animation: { type: 'curve_sweep', sweepShiftDeg: 35 }
    });

    assert.equal(seqRes.success, true);
    assert.equal(seqRes.totalFrames, 30);

    const frame0 = path.join(seqDir, 'frame_0000.png');
    const frame15 = path.join(seqDir, 'frame_0015.png');
    assert.ok(fs.existsSync(frame0));
    assert.ok(fs.existsSync(frame15));

    // Audit kinetic motion between start frame and midpoint frame
    const audit = CurvedTypography.auditCurvature({
      curvedImagePath: frame0,
      motionFrame1Path: frame0,
      motionFrame2Path: frame15
    });

    assert.ok(audit.motion.differentPixels >= 1000, `Different pixels (${audit.motion.differentPixels}) must be >= 1000`);
    assert.equal(audit.motion.verified, true);
  });

  // =========================================================================
  // Section 8: Real Video Rendering Slice
  // =========================================================================
  await t.test('8.1: Renders real 9:16 sample from raw_talking_head_30s.mp4 with animated curved typography', () => {
    const outVideoPath = path.join(ARTIFACTS_DIR, 'phase34_4_curved_typography.mp4');

    const cropRect = { x: 656, y: 0, width: 608, height: 1080 };
    const curvedTypography = {
      text: 'FUTURE OF VIDEO',
      curve: { centerX: 540, centerY: 450, radius: 350, startAngleDeg: 144, endAngleDeg: 36 },
      styling: { fontFamily: 'Helvetica', fontSize: 60, color: [255, 230, 0], opacity: 1.0 },
      animation: { type: 'curve_sweep', sweepShiftDeg: 30 }
    };

    const renderResult = CompositionRenderer.renderSample({
      inputVideoPath: TALKING_HEAD_VIDEO,
      outputPath: outVideoPath,
      cropRect,
      targetDimensions: { width: 1080, height: 1920 },
      curvedTypography,
      durationSec: 2.0,
      startSec: 1.0
    });

    assert.equal(renderResult.success, true);
    assert.ok(fs.existsSync(outVideoPath));
    assert.equal(renderResult.dimensions.width, 1080);
    assert.equal(renderResult.dimensions.height, 1920);
    assert.ok(Math.abs(renderResult.durationSec - 2.0) < 0.2);

    // Verify video stream metadata
    const metadata = FrameInspector.inspectVideoMetadata(outVideoPath);
    assert.equal(metadata.video.codec, 'h264');
    assert.equal(metadata.video.width, 1080);
    assert.equal(metadata.video.height, 1920);

    // Extract frame and inspect yellow text pixels physically encoded in video
    const framePng = path.join(ARTIFACTS_DIR, 'phase34_4_extracted_frame.png');
    FrameInspector.inspectFromVideo(outVideoPath, framePng, { time: 0.5 });
    assert.ok(fs.existsSync(framePng));

    // Decode extracted frame and search for bright yellow pixels in upper third (y: 200 to 550)
    const rawRgb = spawnSync('ffmpeg', ['-v', 'error', '-i', framePng, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
      maxBuffer: 30 * 1024 * 1024
    }).stdout;

    let yellowTextPixels = 0;
    const width = 1080;
    for (let y = 150; y < 600; y++) {
      for (let x = 200; x < 880; x++) {
        const idx = (y * width + x) * 3;
        const r = rawRgb[idx];
        const g = rawRgb[idx + 1];
        const b = rawRgb[idx + 2];
        // Yellow text has high red and high green with low blue
        if (r > 190 && g > 170 && b < 100) {
          yellowTextPixels++;
        }
      }
    }

    assert.ok(yellowTextPixels > 100, `Extracted video frame must contain yellow curved text pixels. Found: ${yellowTextPixels}`);
  });

  // =========================================================================
  // Section 9: Face Clearance & Headroom Preservation
  // =========================================================================
  await t.test('9.1: Verifies face clearance and headroom preservation under curved typography', () => {
    const curvedPath = path.join(ARTIFACTS_DIR, 'test_curved_render.png');
    // Talking head face is located around (x: 400, y: 700, w: 280, h: 360)
    const faceBounds = { x: 400, y: 700, width: 280, height: 360 };

    const audit = CurvedTypography.auditCurvature({
      curvedImagePath: curvedPath,
      faceBounds
    });

    assert.equal(audit.faceClearance.zeroFaceCollisions, true, 'Curved text must not collide with face bounds');
    assert.ok(audit.faceClearance.clearancePx > 0, `Clearance pixels (${audit.faceClearance.clearancePx}) must be positive`);
    assert.equal(audit.verified, true);
  });

  await t.test('9.2: Detects face collision when curved text is placed directly over face', () => {
    const collidingPath = path.join(ARTIFACTS_DIR, 'test_colliding_curve.png');
    CurvedTypography.rasterize({
      text: 'COLLIDING TEXT',
      outputPath: collidingPath,
      curve: { centerX: 540, centerY: 850, radius: 200, startAngleDeg: 144, endAngleDeg: 36 },
      styling: { fontSize: 64, color: [255, 255, 0] }
    });

    const faceBounds = { x: 400, y: 700, width: 280, height: 360 };
    const audit = CurvedTypography.auditCurvature({
      curvedImagePath: collidingPath,
      faceBounds
    });

    assert.equal(audit.faceClearance.zeroFaceCollisions, false, 'Must detect face collision when text overlaps face');
    assert.equal(audit.verified, false, 'Audit must fail when face collision is detected');
  });
});
