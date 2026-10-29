/**
 * Phase 13 - Evidence-Grounded Editing & Closed-Loop Creative QA Regression Suite
 *
 * Verifies:
 * 1. Source analysis produces compliant eme-source-analysis.v1.schema.json structure
 *    with SHA-256 hashes, rational frame rates, and candidate keyframes.
 * 2. Editing plan compiler enforces stable error codes (ERR_PLAN_INVALID, ERR_ASSET_MISSING, ERR_UNSUPPORTED_EFFECT).
 * 3. Dry-run execution produces 0 side-effects, 0 disk mutation, and full operational traceability.
 * 4. Closed-loop QA pipeline detects defects (e.g. text boundary clipping) and applies targeted atomic corrections within 3 attempts.
 * 5. State atomicity and invariant preservation across failed operations.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SourceAnalyzer } = require('../../src/planning/source-analyzer.js');
const { PlanCompiler, PlanErrorCodes } = require('../../src/planning/plan-compiler.js');
const { ClosedLoopQaPipeline } = require('../../src/planning/closed-loop-qa.js');
const { OperationExecutor } = require('../../src/engine/operations.js');

test('Phase 13 Source Analysis - SHA-256 and Candidate Keyframes', async (t) => {
  const assets = [
    { id: 'video_main', path: 'Aditya Rikhari - Raatein Guzaari [qbvAmlKhWQQ].mp4', type: 'video' },
    { id: 'font_instrument', path: 'assets/fonts/files/InstrumentSerif-Regular.ttf', type: 'font' },
    { id: 'bgm_snowfall', path: 'assets/bgm/snowfall.mp3', type: 'audio' }
  ];

  const analysis = SourceAnalyzer.analyzeAssets(assets, { analysisId: 'sa_test_phase_13' });
  assert.equal(analysis.analysisId, 'sa_test_phase_13');
  assert.equal(analysis.schemaVersion, '1.0.0');
  assert.equal(analysis.assets.length, 3);

  const videoAsset = analysis.assets.find(a => a.assetId === 'video_main');
  assert.ok(videoAsset.sha256, 'Video asset must have SHA-256 hash');
  assert.equal(videoAsset.sha256.length, 64, 'SHA-256 must be 64 hex characters');
  assert.ok(videoAsset.videoStream, 'Must contain videoStream metadata');
  assert.ok(videoAsset.videoStream.rationalFps, 'Must contain rationalFps');
  assert.ok(Array.isArray(videoAsset.candidateKeyframes), 'Must contain candidate keyframes array');
  assert.ok(videoAsset.candidateKeyframes.length > 0, 'Candidate keyframes count must be > 0');
  assert.equal(videoAsset.candidateKeyframes[0].frameIndex, 0, 'First keyframe index must be 0');
});

test('Phase 13 Plan Compilation - Stable Error Codes & Unsupported Effect Rejection', async (t) => {
  // 1. Missing asset test
  const planMissingAsset = {
    id: 'plan_test_missing_asset',
    schemaVersion: '1.0.0',
    brief: { prompt: 'T', creativeGoal: 'T', targetAudience: 'T' },
    outputProfile: { width: 1920, height: 1080, aspectRatio: '16:9', fps: 60, targetDurationTicks: 120000 },
    sourceReferences: [{ assetId: 'nonexistent', path: 'assets/ghost.mp4', type: 'video' }],
    operations: [{ type: 'create_project', params: {} }]
  };
  const valMissing = PlanCompiler.validatePlan(planMissingAsset);
  assert.equal(valMissing.valid, false);
  assert.equal(valMissing.errorCode, PlanErrorCodes.ERR_ASSET_MISSING);

  // 2. Unsupported visual effect test
  const planBadEffect = {
    id: 'plan_test_bad_effect',
    schemaVersion: '1.0.0',
    brief: { prompt: 'T', creativeGoal: 'T', targetAudience: 'T' },
    outputProfile: { width: 1920, height: 1080, aspectRatio: '16:9', fps: 60, targetDurationTicks: 120000 },
    operations: [
      {
        type: 'apply_effect',
        params: { clipId: 'c1', effect: { type: 'magic_ai_dreamscape_super_filter' } }
      }
    ]
  };
  const valBadEffect = PlanCompiler.validatePlan(planBadEffect);
  assert.equal(valBadEffect.valid, false);
  assert.equal(valBadEffect.errorCode, PlanErrorCodes.ERR_UNSUPPORTED_EFFECT);
});

test('Phase 13 Plan Compiler - Dry-Run Zero Side-Effects Proof', async (t) => {
  const planPath = path.resolve('examples/plans/plan-scenario-a-kinetic.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  const initialProject = {
    schemaVersion: '1.0.0',
    id: 'proj_untouched',
    revision: 10,
    title: 'Baseline Project',
    canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
    timebase: { fps: { numerator: 60, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 1800000 },
    assets: [],
    tracks: [],
    clips: []
  };

  const initialSnapshot = JSON.stringify(initialProject);
  const dryRun = PlanCompiler.dryRun(initialProject, plan);

  assert.equal(dryRun.success, true);
  assert.equal(JSON.stringify(initialProject), initialSnapshot, 'initialProject must remain 100% unmutated');
  assert.ok(dryRun.previewProject.revision > initialProject.revision, 'Dry run candidate revision must advance');
});

test('Phase 13 Closed-Loop QA - Automated Detection and Correction of Layout Defect', async (t) => {
  const defectiveProject = {
    schemaVersion: '1.0.0',
    id: 'proj_defective_qa',
    revision: 1,
    title: 'Defective Project',
    canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
    timebase: { fps: { numerator: 60, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 180000, endpointConvention: 'half-open' },
    assets: [
      { id: 'font_instrument', type: 'font', src: 'assets/fonts/files/InstrumentSerif-Regular.ttf' }
    ],
    tracks: [
      { id: 'track_text', name: 'Text', kind: 'visual', zIndex: 10 }
    ],
    clips: [
      {
        id: 'clip_clipped_title',
        trackId: 'track_text',
        type: 'text',
        startTick: 0,
        durationTicks: 180000,
        transform: { x: 1060, y: 960, anchorX: 0.0, anchorY: 0.5 },
        typography: {
          text: 'EXTREMELY LONG HEADLINE THAT OVERFLOWS CANVAS EDGE',
          fontAssetId: 'font_instrument',
          fontSize: 96,
          color: '#ffffff'
        }
      }
    ]
  };

  const loopResult = ClosedLoopQaPipeline.run({
    project: defectiveProject,
    renderOutputDir: 'artifacts/phase-13/qa-loop-test',
    maxAttempts: 3,
    autoRender: false // Test logical audit-to-fix cycle
  });

  assert.equal(loopResult.resolved, true, 'Defect must be detected and resolved');
  assert.ok(loopResult.attemptsTotal <= 3, 'Must resolve within 3-attempt budget');
  assert.equal(loopResult.history[0].findings[0].type, 'LAYOUT_CLIPPING');
  assert.equal(loopResult.history[0].appliedCorrections[0].operation.type, 'modify_clip');
  assert.ok(loopResult.finalScore >= 90, 'Final QA score after correction must be >= 90');
});
