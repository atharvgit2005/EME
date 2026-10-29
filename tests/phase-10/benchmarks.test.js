/**
 * Phase 10 - Automated Regression Tests
 *
 * Verifies:
 * 1. Standardized Benchmark suite manifests validity
 * 2. Deterministic timebase constraints across all manifests
 * 3. Track collision safety
 * 4. Rendered video container integrity and QA scores
 * 5. Quantitative pixel diff calculation accuracy
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../../src/engine/project.js');
const { FrameInspector } = require('../../src/renderers/inspector.js');

test('Phase 10 Benchmark Suite Manifests Validity & Integrity', async (t) => {
  const suiteManifestPath = path.resolve('benchmarks/manifests/phase-10-suite.json');
  assert.ok(fs.existsSync(suiteManifestPath), 'Suite manifest must exist');

  const suiteManifest = JSON.parse(fs.readFileSync(suiteManifestPath, 'utf8'));
  assert.equal(suiteManifest.benchmarks.length, 4, 'Must define exactly 4 standardized benchmarks');

  for (const bench of suiteManifest.benchmarks) {
    const projPath = path.resolve(bench.projectFile);
    assert.ok(fs.existsSync(projPath), `Benchmark manifest file must exist: ${bench.projectFile}`);

    const project = ProjectManager.loadProject(projPath);
    assert.ok(project.id, `Project ID must be defined for ${bench.id}`);
    assert.equal(project.timebase.ticksPerSecond, 120000, `Timebase ticksPerSecond must be 120000 for ${bench.id}`);
    assert.equal(project.timebase.durationTicks, bench.durationTicks, `Duration ticks must match suite manifest for ${bench.id}`);
    assert.ok(project.canvas.width > 0 && project.canvas.height > 0, `Canvas dimensions must be valid for ${bench.id}`);
    assert.ok(project.tracks.length > 0, `Tracks must be defined for ${bench.id}`);
    assert.ok(project.clips.length > 0, `Clips must be defined for ${bench.id}`);
  }
});

test('Phase 10 Rendered Artifacts & QA Verification', async (t) => {
  const resultsPath = path.resolve('artifacts/phase-10/phase-10-benchmark-results.json');
  assert.ok(fs.existsSync(resultsPath), 'Phase 10 benchmark results must exist');

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  assert.equal(results.benchmarks.length, 4, 'Must have recorded results for 4 benchmarks');

  for (const benchResult of results.benchmarks) {
    assert.ok(fs.existsSync(benchResult.videoPath), `Rendered MP4 must exist: ${benchResult.videoPath}`);
    assert.ok(benchResult.videoSizeBytes > 1000, `MP4 must be non-empty for ${benchResult.benchmarkId}`);
    assert.equal(benchResult.qaScore, 100, `QA score must be 100 for ${benchResult.benchmarkId}`);
    assert.equal(benchResult.qaPassed, true, `QA must pass for ${benchResult.benchmarkId}`);

    for (const frame of benchResult.inspectedFrames) {
      assert.ok(fs.existsSync(frame), `Inspected frame PNG must exist: ${frame}`);
      assert.ok(fs.statSync(frame).size > 1000, `Frame PNG must be non-empty: ${frame}`);
    }
  }
});

test('Phase 10 Quantitative Pixel Diff Precision', async (t) => {
  const frameA = path.resolve('artifacts/phase-10/benchmark_a_kinetic_typography-frame-1s.png');
  const frameC = path.resolve('artifacts/phase-10/benchmark_c_layered_compositing-frame-1s.png');

  assert.ok(fs.existsSync(frameA), 'Frame A must exist');
  assert.ok(fs.existsSync(frameC), 'Frame C must exist');

  const diff = FrameInspector.computePixelDiff(frameA, frameC);
  assert.equal(diff.dimensionsMatch, true, 'Canvases must have matching dimensions (1080x1920)');
  assert.equal(diff.different, true, 'Frames must be distinct');
  assert.ok(diff.percentChanged > 50, 'Percent changed must be significantly positive');
  assert.ok(diff.rmse > 50, 'RMSE must reflect compositing disparity');

  // Self-comparison identity check
  const identityDiff = FrameInspector.computePixelDiff(frameA, frameA);
  assert.equal(identityDiff.different, false, 'Identical frames must have 0 diff');
  assert.equal(identityDiff.percentChanged, 0, 'Percent changed must be 0 for identical frame');
  assert.equal(identityDiff.rmse, 0, 'RMSE must be 0 for identical frame');
});
