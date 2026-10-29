/**
 * Phase 12 - Plan Compilation & Execution Regression Tests
 *
 * Verifies:
 * 1. Plan schema validation for Scenarios A, B, and C
 * 2. Dry-run execution traceability and atomic revision increments
 * 3. Precondition failure detection on missing assets
 * 4. Preservation of canonical project invariants across compilation
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PlanCompiler } = require('../../src/planning/plan-compiler.js');
const { SourceAnalyzer } = require('../../src/planning/source-analyzer.js');

test('Phase 12 Source Media Analysis', async (t) => {
  const assets = [
    { id: 'video_main', path: 'Aditya Rikhari - Raatein Guzaari [qbvAmlKhWQQ].mp4', type: 'video' },
    { id: 'font_inter', path: 'assets/fonts/files/Inter-Variable.ttf', type: 'font' },
    { id: 'bgm', path: 'assets/bgm/snowfall.mp3', type: 'audio' }
  ];

  const analysis = SourceAnalyzer.analyzeAssets(assets);
  assert.equal(analysis.assetsAnalyzed.length, 3, 'Must analyze 3 assets');
  assert.ok(analysis.assetsAnalyzed.every(a => a.exists), 'All test assets must exist');
});

test('Phase 12 Intermediate Editing Plan Schema & Dry-Run Validation', async (t) => {
  const plans = [
    'examples/plans/plan-scenario-a-kinetic.json',
    'examples/plans/plan-scenario-b-narrative.json',
    'examples/plans/plan-scenario-c-compositing.json'
  ];

  for (const p of plans) {
    const planPath = path.resolve(p);
    assert.ok(fs.existsSync(planPath), `Plan file must exist: ${p}`);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    const val = PlanCompiler.validatePlan(plan);
    assert.equal(val.valid, true, `Plan must be valid: ${p}`);

    const dryRun = PlanCompiler.dryRun({}, plan);
    assert.equal(dryRun.success, true, `Dry-run must succeed for ${p}`);
    assert.ok(dryRun.stepsCount > 0, `Steps count must be > 0 for ${p}`);
    assert.ok(dryRun.finalRevision > 0, `Final revision must advance for ${p}`);
    assert.ok(dryRun.previewProject.id, `Preview project must be created for ${p}`);
  }
});

test('Phase 12 Plan Precondition Rejection on Missing Asset', async (t) => {
  const plan = {
    id: 'plan_invalid_missing_asset',
    schemaVersion: '1.0.0',
    brief: { prompt: 'Test', creativeGoal: 'Test', targetAudience: 'Test' },
    outputProfile: { width: 1920, height: 1080, aspectRatio: '16:9', fps: 60, targetDurationTicks: 120000 },
    sourceReferences: [
      { assetId: 'ghost_asset', path: 'assets/missing_ghost_file.mp4', type: 'video' }
    ],
    operations: [
      { type: 'create_project', params: {} }
    ]
  };

  const val = PlanCompiler.validatePlan(plan);
  assert.equal(val.valid, false, 'Plan with missing asset must fail validation');
  assert.ok(val.errors.some(e => e.includes('Referenced asset path not found')));
});
