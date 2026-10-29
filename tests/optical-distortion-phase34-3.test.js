/**
 * Editing Mechanics Engine (EME) - Phase 34.3 Test Suite
 * Native Optical Distortion Rendering Slice
 *
 * Verifies all Phase 34.3 objectives:
 * 1. Bounded optical distortion parameter validation (cx, cy in [0, 1], k1, k2 in [-1, 1], interpolation)
 * 2. Fail-closed rejection of invalid distortion parameters with ERR_INVALID_DISTORTION_PARAMETER
 * 3. Sanitization of timeline enable expression preventing filter injection
 * 4. Capability matrix truthfulness: optical_fisheye_distortion is supported; curved_typography & 3D remain unsupported
 * 5. Deterministic FFmpeg filtergraph construction with lenscorrection
 * 6. Compilation of apply_effect operation for optical distortion through OperationExecutor
 * 7. Synthetic grid pattern test verifying physical radial distortion away from optical center
 * 8. Real video render from raw_videos/raw_talking_head_30s.mp4: baseline vs fisheye distorted outputs
 * 9. Quantitative multi-pixel displacement audit (percentChanged, RMSE, optical center invariance)
 * 10. Preservation of subject composition and face-safe graphic placement under lens distortion
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  CompositionRenderer,
  CreativePlanCompiler,
  CreativeContextBuilder,
  MockLlmAdapter,
  ReframingEngine,
  SUPPORTED_CAPABILITIES,
  EXPLICITLY_UNSUPPORTED_CAPABILITIES
} = require('../src/creative/index.js');
const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

const FIXTURE_PROJECT_PATH = path.resolve(__dirname, '../fixtures/prompt-core/projects/project-pf02-scenario1.json');
const TALKING_HEAD_VIDEO = path.resolve(__dirname, '../raw_videos/raw_talking_head_30s.mp4');
const VALID_SIDECAR_PATH = path.resolve(__dirname, '../artifacts/phase-32/stage-32.1/examples/valid-sidecar-interview.json');
const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts/phase-34');

test('Phase 34.3: Native Optical Distortion Rendering Slice Suite', async (t) => {

  // =========================================================================
  // Section 1: Parameter Validation & Bounds Enforcement
  // =========================================================================
  await t.test('1.1: Validates bounded optical distortion parameters', () => {
    const valid = CompositionRenderer.validateOpticalDistortionParams({
      cx: 0.5,
      cy: 0.5,
      k1: -0.25,
      k2: -0.05,
      interpolation: 'bilinear'
    });

    assert.equal(valid.cx, 0.5);
    assert.equal(valid.cy, 0.5);
    assert.equal(valid.k1, -0.25);
    assert.equal(valid.k2, -0.05);
    assert.equal(valid.interpolation, 'bilinear');
  });

  await t.test('1.2: Rejects out-of-bounds optical parameters fail-closed', () => {
    // cx < 0
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({ cx: -0.1 });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*cx/);

    // cx > 1
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({ cx: 1.2 });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*cx/);

    // cy < 0 or > 1
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({ cy: 1.5 });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*cy/);

    // k1 > 1.0 or < -1.0
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({ k1: 1.5 });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*k1/);

    // k2 > 1.0 or < -1.0
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({ k2: -2.0 });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*k2/);

    // invalid interpolation
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({ interpolation: 'bicubic_spline' });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*Interpolation/);
  });

  await t.test('1.3: Sanitizes timeline enable expressions against filter injection', () => {
    const validEnable = CompositionRenderer.validateOpticalDistortionParams({
      cx: 0.5,
      cy: 0.5,
      k1: -0.2,
      enable: 'between(t, 0.5, 2.5)'
    });
    assert.equal(validEnable.enable, 'between(t, 0.5, 2.5)');

    // Malicious injection attempt with shell/ffmpeg operators
    assert.throws(() => {
      CompositionRenderer.validateOpticalDistortionParams({
        enable: 'between(t,0,1); rm -rf /; echo'
      });
    }, /ERR_INVALID_DISTORTION_PARAMETER.*Invalid characters/);
  });

  // =========================================================================
  // Section 2: Capability Matrix Truthfulness
  // =========================================================================
  await t.test('2.1: Capability matrix marks optical_fisheye_distortion supported', () => {
    assert.ok(
      CompositionRenderer.SUPPORTED_CAPABILITIES.includes('optical_fisheye_distortion'),
      'optical_fisheye_distortion must be in SUPPORTED_CAPABILITIES'
    );
    assert.ok(
      !CompositionRenderer.EXPLICITLY_UNSUPPORTED_CAPABILITIES.includes('optical_fisheye_distortion'),
      'optical_fisheye_distortion must NOT be in EXPLICITLY_UNSUPPORTED_CAPABILITIES'
    );

    const capCheck = CompositionRenderer.validateCapabilities({
      features: ['crop_9_16', 'scale_canvas', 'optical_fisheye_distortion']
    });
    assert.equal(capCheck.supported, true);
    assert.equal(capCheck.unsupportedFeatures.length, 0);
  });

  await t.test('2.2: Capability matrix continues to reject unverified capabilities', () => {
    const capCheck = CompositionRenderer.validateCapabilities({
      features: ['perspective_3d', 'neural_relighting']
    });
    assert.equal(capCheck.supported, false);
    assert.equal(capCheck.unsupportedFeatures.length, 2);
    assert.ok(capCheck.errors.some(e => e.includes('perspective_3d')));
    assert.ok(capCheck.errors.some(e => e.includes('neural_relighting')));
  });

  // =========================================================================
  // Section 3: Deterministic Filtergraph Generation
  // =========================================================================
  await t.test('3.1: Builds deterministic filtergraph with lenscorrection', () => {
    const filtergraph = CompositionRenderer.buildFiltergraph({
      cropRect: { x: 656, y: 0, width: 608, height: 1080 },
      targetDimensions: { width: 1080, height: 1920 },
      opticalDistortion: { cx: 0.5, cy: 0.5, k1: -0.25, k2: -0.05, interpolation: 'bilinear' },
      graphicPlacements: [
        { x: 168, y: 1472, width: 600, height: 140, color: 'blue', opacity: 0.85, borderColor: 'white', borderWidth: 4 }
      ]
    });

    assert.equal(
      filtergraph,
      'crop=608:1080:656:0,scale=1080:1920:flags=lanczos,lenscorrection=cx=0.5:cy=0.5:k1=-0.25:k2=-0.05:i=bilinear,drawbox=x=168:y=1472:w=600:h=140:color=blue@0.85:t=fill,drawbox=x=168:y=1472:w=600:h=140:color=white@0.95:t=4'
    );
  });

  // =========================================================================
  // Section 4: Canonical Pipeline & Compiler Integration
  // =========================================================================
  await t.test('4.1: CreativePlanCompiler compiles apply_effect for optical distortion through OperationExecutor', async () => {
    const project = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const context = CreativeContextBuilder.buildContext({
      brief: 'Create a 10s punchy 9:16 vertical reel with optical fisheye distortion',
      project
    });
    const creativePlan = await new MockLlmAdapter().generateCreativePlan({ context });

    const compileRes = CreativePlanCompiler.compile({
      creativePlan,
      project,
      options: {
        opticalDistortion: { cx: 0.5, cy: 0.5, k1: -0.25, k2: -0.05, interpolation: 'bilinear' }
      }
    });

    assert.equal(compileRes.success, true, 'Compilation must succeed with optical distortion');
    assert.equal(compileRes.errors.length, 0);

    // Verify apply_effect operation was emitted conforming to frozen project schema
    const effectOp = compileRes.operationPlan.operations.find(o => o.type === 'apply_effect');
    assert.ok(effectOp, 'apply_effect operation must be in compiled operation plan');
    assert.equal(effectOp.params.effect.type, 'transition');
    assert.equal(effectOp.params.effect.parameters.effect, 'optical_fisheye_distortion');
    assert.equal(effectOp.params.effect.parameters.k1, -0.25);

    // Verify clip properties also contain optical_distortion parameters
    const insertOp = compileRes.operationPlan.operations.find(o => o.type === 'insert_clip');
    assert.ok(insertOp.params.properties?.optical_distortion, 'insert_clip must carry optical_distortion properties');
    assert.equal(insertOp.params.properties.optical_distortion.k1, -0.25);

    // Verify dry-run simulation cleanly updated candidate state through OperationExecutor
    assert.ok(compileRes.dryRunResult.final_revision > project.revision);
  });

  // =========================================================================
  // Section 5: Synthetic Grid Test Pattern Verification
  // =========================================================================
  await t.test('5.1: Proves measurable radial distortion on synthetic high-contrast grid', () => {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const gridBase = path.join(ARTIFACTS_DIR, 'test_grid_baseline.png');
    const gridDist = path.join(ARTIFACTS_DIR, 'test_grid_distorted.png');

    // 1. Generate high-contrast grid baseline
    const genBase = spawnSync('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'color=c=black:s=1080x1920:d=1',
      '-vf', 'drawgrid=width=60:height=60:thickness=3:color=white',
      '-vframes', '1',
      '-y', gridBase
    ], { encoding: 'utf8' });
    assert.equal(genBase.status, 0, 'Must generate grid baseline');

    // 2. Generate distorted grid with barrel fisheye (k1 = -0.25)
    const genDist = spawnSync('ffmpeg', [
      '-i', gridBase,
      '-vf', 'lenscorrection=cx=0.5:cy=0.5:k1=-0.25:k2=-0.05:i=bilinear',
      '-vframes', '1',
      '-y', gridDist
    ], { encoding: 'utf8' });
    assert.equal(genDist.status, 0, 'Must render distorted grid');

    // 3. Quantitative pixel displacement audit
    const audit = CompositionRenderer.auditOpticalDistortion({
      baselineImagePath: gridBase,
      distortedImagePath: gridDist,
      opticalCenter: { x: 540, y: 960 },
      centerRadiusPx: 15
    });

    assert.equal(audit.verified, true, 'Distortion audit must verify physical pixel displacement');
    assert.ok(audit.differentPixels > 300000, `Must displace > 300k pixels (got ${audit.differentPixels})`);
    assert.ok(audit.percentChanged >= 15.0, `Percent changed must be >= 15% (got ${audit.percentChanged}%)`);
    assert.ok(audit.rmse >= 50.0, `RMSE must be >= 50.0 (got ${audit.rmse})`);
    assert.equal(audit.centerStability.isStable, true, 'Optical center must remain stable');
    assert.equal(audit.perimeterDisplacement.isDisplaced, true, 'Perimeter must experience large displacement');
    assert.equal(audit.radialDisplacementGradient, true, 'Perimeter RMSE must be > 1.5x center RMSE');
  });

  // =========================================================================
  // Section 6: Real Video Render — Baseline vs Fisheye Sample
  // =========================================================================
  await t.test('6.1: Renders real baseline and fisheye distorted 9:16 video samples', () => {
    assert.ok(fs.existsSync(TALKING_HEAD_VIDEO), 'Talking head video fixture must exist');

    const baselinePath = path.join(ARTIFACTS_DIR, 'phase34_3_talking_head_baseline.mp4');
    const fisheyePath = path.join(ARTIFACTS_DIR, 'phase34_3_talking_head_fisheye.mp4');
    const cropRect = { x: 656, y: 0, width: 608, height: 1080 };

    // 1. Render Baseline (optical distortion = null)
    const baseResult = CompositionRenderer.renderSample({
      inputVideoPath: TALKING_HEAD_VIDEO,
      outputPath: baselinePath,
      cropRect,
      targetDimensions: { width: 1080, height: 1920 },
      opticalDistortion: null,
      graphicPlacements: [
        { x: 168, y: 1472, width: 600, height: 140, color: 'blue', opacity: 0.85, borderColor: 'white', borderWidth: 4 }
      ],
      durationSec: 2.0,
      startSec: 0.0
    });

    assert.equal(baseResult.success, true);
    assert.ok(fs.existsSync(baselinePath));
    assert.equal(baseResult.dimensions.width, 1080);
    assert.equal(baseResult.dimensions.height, 1920);

    // 2. Render Fisheye Distorted (optical distortion enabled)
    const fisheyeResult = CompositionRenderer.renderSample({
      inputVideoPath: TALKING_HEAD_VIDEO,
      outputPath: fisheyePath,
      cropRect,
      targetDimensions: { width: 1080, height: 1920 },
      opticalDistortion: { cx: 0.5, cy: 0.5, k1: -0.25, k2: -0.05, interpolation: 'bilinear' },
      graphicPlacements: [
        { x: 168, y: 1472, width: 600, height: 140, color: 'blue', opacity: 0.85, borderColor: 'white', borderWidth: 4 }
      ],
      durationSec: 2.0,
      startSec: 0.0
    });

    assert.equal(fisheyeResult.success, true);
    assert.ok(fs.existsSync(fisheyePath));
    assert.equal(fisheyeResult.dimensions.width, 1080);
    assert.equal(fisheyeResult.dimensions.height, 1920);
    assert.notEqual(baseResult.sha256, fisheyeResult.sha256, 'Distorted render must produce distinct checksum');
  });

  // =========================================================================
  // Section 7: Multi-Frame Frame Extraction & Quantitative Pixel Audit
  // =========================================================================
  await t.test('7.1: Extracts frames and verifies real optical displacement on video pixels', () => {
    const baselinePath = path.join(ARTIFACTS_DIR, 'phase34_3_talking_head_baseline.mp4');
    const fisheyePath = path.join(ARTIFACTS_DIR, 'phase34_3_talking_head_fisheye.mp4');

    const basePng = path.join(ARTIFACTS_DIR, 'frame_baseline_1.0s.png');
    const fishPng = path.join(ARTIFACTS_DIR, 'frame_fisheye_1.0s.png');

    FrameInspector.inspectFromVideo(baselinePath, basePng, { time: 1.0 });
    FrameInspector.inspectFromVideo(fisheyePath, fishPng, { time: 1.0 });

    assert.ok(fs.existsSync(basePng));
    assert.ok(fs.existsSync(fishPng));

    const audit = CompositionRenderer.auditOpticalDistortion({
      baselineImagePath: basePng,
      distortedImagePath: fishPng,
      opticalCenter: { x: 540, y: 960 },
      centerRadiusPx: 15
    });

    assert.equal(audit.verified, true, 'Video pixel distortion audit must verify physical displacement');
    assert.ok(audit.differentPixels > 500000, `Must displace > 500k video pixels (got ${audit.differentPixels})`);
    assert.ok(audit.percentChanged >= 25.0, `Percent changed must be >= 25% (got ${audit.percentChanged}%)`);
    assert.ok(audit.rmse >= 30.0, `RMSE must be >= 30.0 (got ${audit.rmse})`);
    assert.equal(audit.centerStability.isStable, true, 'Optical center must remain stable');
  });

  // =========================================================================
  // Section 8: Preservation of Subject Composition & Face-Safe Graphic Placement
  // =========================================================================
  await t.test('8.1: Preserves headroom and zero face collisions under optical distortion', () => {
    const fisheyePath = path.join(ARTIFACTS_DIR, 'phase34_3_talking_head_fisheye.mp4');
    const sidecar = JSON.parse(fs.readFileSync(VALID_SIDECAR_PATH, 'utf8'));
    const cropRect = { x: 656, y: 0, width: 608, height: 1080 };
    const graphicPlacements = [
      { x: 168, y: 1472, width: 600, height: 140, color: 'blue', opacity: 0.85, borderColor: 'white', borderWidth: 4 }
    ];

    const inspection = CompositionRenderer.inspectRenderedComposition({
      videoPath: fisheyePath,
      timestampsSec: [0.0, 1.0],
      sidecar,
      cropRect,
      canvasDimensions: { width: 1080, height: 1920 },
      graphicPlacements,
      outputDir: path.join(ARTIFACTS_DIR, 'visual-acceptance-fisheye')
    });

    assert.equal(inspection.allFramesInspected, true);
    assert.equal(inspection.summary.zeroFaceCollisions, true, 'Must have zero face collisions under distortion');
    assert.equal(inspection.summary.headroomCompliant, true, 'Headroom must remain compliant');
  });
});
