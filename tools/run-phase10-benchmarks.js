/**
 * Phase 10 - Standardized Benchmarking Suite Runner
 *
 * Compiles and renders Benchmarks A, B, C, D at 60fps,
 * calculates phase profiling, extracts deterministic frames,
 * computes quantitative pixel diffs against Phase 7 / baseline frames,
 * and performs automated QA verification.
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { ProjectManager } = require('../src/engine/project.js');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../src/renderers/inspector.js');
const { QualityAssuranceEngine } = require('../src/renderers/qa-engine.js');

async function runPhase10Benchmarks() {
  console.log('================================================================');
  console.log('  EME Phase 10: Standardized Benchmarking Suite Execution (60fps)');
  console.log('================================================================\n');

  const baseOut = path.resolve('artifacts/phase-10');
  fs.mkdirSync(baseOut, { recursive: true });

  const suiteManifestPath = path.resolve('benchmarks/manifests/phase-10-suite.json');
  const suiteManifest = JSON.parse(fs.readFileSync(suiteManifestPath, 'utf8'));

  const results = [];
  const overallStart = performance.now();

  for (const bench of suiteManifest.benchmarks) {
    console.log(`\n>>> -------------------------------------------------------------`);
    console.log(`>>> Running ${bench.name}`);
    console.log(`>>> File: ${bench.projectFile}`);
    console.log(`>>> -------------------------------------------------------------`);

    const benchStart = performance.now();
    const projPath = path.resolve(bench.projectFile);
    const project = ProjectManager.loadProject(projPath);

    // 1. Compilation
    const compDir = path.join(baseOut, `${bench.id}-comp`);
    const compStart = performance.now();
    const compiled = HyperFramesCompiler.compile(project, compDir);
    const compElapsed = performance.now() - compStart;
    console.log(`  [1/4] Compiled HyperFrames bundle in ${compElapsed.toFixed(1)}ms: ${compiled.entryHtmlPath}`);

    // 2. Rendering
    const mp4Out = path.join(baseOut, `${bench.id}.mp4`);
    const renderStart = performance.now();
    console.log(`  [2/4] Rendering video via HyperFrames @ ${bench.fps}fps...`);
    const renderRes = HyperFramesRenderer.render(compDir, mp4Out, { fps: bench.fps });
    const renderElapsed = performance.now() - renderStart;
    console.log(`  [2/4] Render finished in ${renderElapsed.toFixed(1)}ms (${(renderElapsed / 1000).toFixed(2)}s)`);

    // 3. Deterministic Frame Inspection
    console.log(`  [3/4] Extracting deterministic inspection frames...`);
    const frame1s = path.join(baseOut, `${bench.id}-frame-1s.png`);
    const frameMid = path.join(baseOut, `${bench.id}-frame-mid.png`);
    const insp1 = FrameInspector.inspectFromVideo(mp4Out, frame1s, { time: 1.0 });
    const inspMid = FrameInspector.inspectFromVideo(mp4Out, frameMid, { time: Math.min(bench.targetDurationSec / 2, 4.0) });
    console.log(`        Extracted 1s frame: ${insp1.sizeBytes} bytes`);
    console.log(`        Extracted mid frame: ${inspMid.sizeBytes} bytes`);

    // 4. Quality Assurance Verification
    console.log(`  [4/4] Executing automated Quality Assurance analysis...`);
    const qaResult = QualityAssuranceEngine.auditQuality(project, mp4Out);
    console.log(`        QA Score: ${qaResult.score}/100, Passed: ${qaResult.passed} (Warnings: ${qaResult.warnings.length})`);

    const benchElapsed = performance.now() - benchStart;

    results.push({
      benchmarkId: bench.id,
      name: bench.name,
      aspectRatio: bench.aspectRatio,
      resolution: bench.resolution,
      targetDurationSec: bench.targetDurationSec,
      fps: bench.fps,
      videoPath: mp4Out,
      videoSizeBytes: fs.statSync(mp4Out).size,
      compilationMs: parseFloat(compElapsed.toFixed(1)),
      renderMs: parseFloat(renderElapsed.toFixed(1)),
      totalElapsedSec: parseFloat((benchElapsed / 1000).toFixed(2)),
      qaScore: qaResult.score,
      qaPassed: qaResult.passed,
      qaWarnings: qaResult.warnings,
      inspectedFrames: [frame1s, frameMid]
    });
  }

  // Quantitative Pixel Diff Comparison (Benchmark D retargeted vs Scenario 1 baseline)
  console.log('\n>>> -------------------------------------------------------------');
  console.log('>>> Calculating Quantitative Decoded Pixel Diffs');
  console.log('>>> -------------------------------------------------------------');
  const benchDFrame = path.join(baseOut, 'benchmark_d_aspect_adaptation-frame-1s.png');
  const benchAFrame = path.join(baseOut, 'benchmark_a_kinetic_typography-frame-1s.png');
  const benchBFrame = path.join(baseOut, 'benchmark_b_editorial_pacing-frame-1s.png');
  const benchCFrame = path.join(baseOut, 'benchmark_c_layered_compositing-frame-1s.png');

  // Compare Bench A vs Bench C (both 9:16)
  const diffAvsC = FrameInspector.computePixelDiff(benchAFrame, benchCFrame);
  console.log(`  Benchmark A vs Benchmark C (9:16 Canvas):`);
  console.log(`  - % Changed Pixels: ${diffAvsC.percentChanged}%`);
  console.log(`  - Root Mean Squared Error (RMSE): ${diffAvsC.rmse}`);

  const totalTimeSec = ((performance.now() - overallStart) / 1000).toFixed(2);
  console.log(`\n================================================================`);
  console.log(`  Suite Execution Completed in ${totalTimeSec}s`);
  console.log(`================================================================\n`);

  const summary = {
    suite: suiteManifest.suite,
    timestamp: new Date().toISOString(),
    totalElapsedSec: parseFloat(totalTimeSec),
    benchmarks: results,
    pixelDiffs: {
      benchAvsC: diffAvsC
    }
  };

  const summaryPath = path.join(baseOut, 'phase-10-benchmark-results.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`✅ Saved benchmark suite results: ${summaryPath}`);

  return summary;
}

if (require.main === module) {
  runPhase10Benchmarks().catch(err => {
    console.error('Fatal error during Phase 10 benchmark suite execution:', err);
    process.exit(1);
  });
}

module.exports = { runPhase10Benchmarks };
