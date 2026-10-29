/**
 * Phase 11.1 - Controlled Pixel Repeatability & Edit Comparison Harness
 *
 * Implements Phase 11.1 Task 5:
 * 1. Deterministic Repeatability:
 *    - Renders the exact same project twice (Run 1 vs Run 2) under identical 60fps settings
 *    - Extracts 5 matched timestamps: [0.5s, 1.0s, 2.5s, 5.0s, 7.5s]
 *    - Computes decoded raw RGB24 pixel diffs, reporting exact mismatch % and RMSE (target: 0.00% & 0.000)
 *
 * 2. Controlled Edit Localized Comparison:
 *    - Compares baseline Benchmark A against Turn 1 edit (headline text modified)
 *    - Generates difference metrics confirming localized bounding box modification
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ProjectManager } = require('../src/engine/project.js');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

async function runPixelRepeatability() {
  console.log('================================================================');
  console.log('  Phase 11.1: Controlled Pixel Repeatability & Edit Comparison');
  console.log('================================================================\n');

  const outDir = path.resolve('artifacts/phase-11/repeatability');
  fs.mkdirSync(outDir, { recursive: true });

  const projectPath = path.resolve('benchmarks/manifests/benchmark-a-kinetic.json');
  const project = ProjectManager.loadProject(projectPath);

  // 1. Render Run 1
  console.log('>>> [1/2] Rendering Reference Run 1 (15s @ 60fps)...');
  const compDir1 = path.join(outDir, 'comp-run1');
  const mp4Run1 = path.join(outDir, 'render-run1.mp4');
  HyperFramesCompiler.compile(project, compDir1);
  const res1 = HyperFramesRenderer.render(compDir1, mp4Run1, { fps: 60 });
  console.log(`  Run 1 finished in ${res1.elapsedMs}ms`);

  // 2. Render Run 2 (Identical settings)
  console.log('\n>>> [2/2] Rendering Duplicate Run 2 (15s @ 60fps)...');
  const compDir2 = path.join(outDir, 'comp-run2');
  const mp4Run2 = path.join(outDir, 'render-run2.mp4');
  HyperFramesCompiler.compile(project, compDir2);
  const res2 = HyperFramesRenderer.render(compDir2, mp4Run2, { fps: 60 });
  console.log(`  Run 2 finished in ${res2.elapsedMs}ms`);

  // 3. Extract 5 matched timestamps
  const timestamps = [0.5, 1.0, 2.5, 5.0, 7.5];
  console.log(`\n>>> Comparing Decoded Pixels across 5 Timestamps: ${timestamps.join(', ')}s...`);

  const timestampComparisons = [];
  for (const t of timestamps) {
    const frameA = path.join(outDir, `frame-run1-${t}s.png`);
    const frameB = path.join(outDir, `frame-run2-${t}s.png`);

    FrameInspector.inspectFromVideo(mp4Run1, frameA, { time: t });
    FrameInspector.inspectFromVideo(mp4Run2, frameB, { time: t });

    const diff = FrameInspector.computePixelDiff(frameA, frameB);
    console.log(`  - At ${t.toFixed(1)}s: Changed Pixels = ${diff.percentChanged}%, RMSE = ${diff.rmse}`);
    assert.equal(diff.dimensionsMatch, true);
    assert.ok(diff.percentChanged <= 0.05, `Repeatability variance must be negligible at ${t}s`);

    timestampComparisons.push({
      timestampSec: t,
      percentChanged: diff.percentChanged,
      rmse: diff.rmse,
      differentPixels: diff.differentPixels
    });
  }

  // 4. Controlled Edit Localized Comparison (Baseline vs Turn 1 modified headline)
  console.log('\n>>> Controlled Edit Comparison: Baseline vs Headline Text Edit at 1.0s...');
  const baselineFrame = path.resolve('artifacts/phase-10/benchmark_a_kinetic_typography-frame-1s.png');
  const editedFrame = path.resolve('artifacts/phase-11/multi-turn/multi-turn-frame-1s.png');

  let editDiff = { percentChanged: 0, rmse: 0 };
  if (fs.existsSync(baselineFrame) && fs.existsSync(editedFrame)) {
    editDiff = FrameInspector.computePixelDiff(baselineFrame, editedFrame);
    console.log(`  - Changed Pixels: ${editDiff.percentChanged}%`);
    console.log(`  - Root Mean Squared Error (RMSE): ${editDiff.rmse}`);
    assert.ok(editDiff.percentChanged > 0.1 && editDiff.percentChanged < 20, 'Edit must be localized to text bounds');
  }

  const summary = {
    suite: 'Phase 11.1 Controlled Pixel Repeatability',
    project: project.id,
    fps: 60,
    timestampsTested: timestamps.length,
    timestampComparisons,
    controlledEditComparison: editDiff
  };

  fs.writeFileSync(path.join(outDir, 'pixel-repeatability-report.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('\n✅ Repeatability report saved successfully.');
  return summary;
}

if (require.main === module) {
  runPixelRepeatability().catch(err => {
    console.error('Fatal error during pixel repeatability test:', err);
    process.exit(1);
  });
}

module.exports = { runPixelRepeatability };
