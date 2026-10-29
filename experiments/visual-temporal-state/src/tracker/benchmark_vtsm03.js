/**
 * VTSM-03 Comprehensive Ablation Benchmark Runner
 * 
 * Benchmarks all 5 propagation & keyframe scheduling configurations across all 7 test fixtures (A through G):
 * 1. vtsm02_full_mobilesam (Reference: Per-frame MobileSAM TinyViT encoder + decoder)
 * 2. vtsm03_fixed_keyframe_N10 (Sparse LK + Delaunay mesh warp, N=10)
 * 3. vtsm03_fixed_keyframe_N20 (Sparse LK + Delaunay mesh warp, N=20)
 * 4. vtsm03_adaptive_hybrid (Sparse LK + ROI Farneback + 4 adaptive reseg failure triggers)
 * 5. vtsm03_fixed_keyframe_N10_dense (Dense Farneback backward warp, N=10)
 * 
 * Evaluates:
 * - Trajectory median center error (px), P95 error, max error
 * - Mean IoU, ID switches, lost track frames
 * - Effective throughput FPS, component P50 / P95 latency (ms)
 * - Keyframes vs propagated frames count and resegmentation trigger count
 * - Strict VTSM-01 schema compliance (zero tolerance)
 * 
 * Saves results to results/vtsm03_benchmark_results.json.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { VtsmValidator } = require('../validate-state.js');
const { VtsmEvaluator } = require('../metrics/evaluator.js');

const EXP_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.join(EXP_DIR, 'fixtures');
const RESULTS_DIR = path.join(EXP_DIR, 'results');
const PYTHON_BIN = path.join(EXP_DIR, '.venv/bin/python3');
const PIPELINE_VTSM02 = path.join(EXP_DIR, 'src/tracker/pipeline_vtsm02.py');
const PIPELINE_VTSM03 = path.join(EXP_DIR, 'src/tracker/pipeline_vtsm03.py');

const FIXTURE_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const ABLATION_MODES = [
  'vtsm02_full_mobilesam',
  'vtsm03_fixed_keyframe_N10',
  'vtsm03_fixed_keyframe_N20',
  'vtsm03_adaptive_hybrid',
  'vtsm03_fixed_keyframe_N10_dense'
];

async function runBenchmark() {
  console.log('================================================================');
  console.log('  VTSM-03: EFFICIENT TEMPORAL PROPAGATION BENCHMARK (7 FIXTURES x 5 MODES)');
  console.log('================================================================\n');

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const benchmarkSummary = {
    suite: 'VTSM-03 Temporal Propagation Benchmark',
    timestamp: new Date().toISOString(),
    environment: {
      platform: 'macOS arm64 (Apple Silicon)',
      node: process.version,
      python: 'Python 3.12 (.venv)',
      pytorch: '2.14.1 (MPS)',
      mobilesamWeights: 'third_party/MobileSAM/weights/mobile_sam.pt (38.84 MB)'
    },
    fixtures: FIXTURE_IDS,
    modes: ABLATION_MODES,
    results: {}, // fixtureId -> mode -> evalReport
    summaryByMode: {}
  };

  for (const mode of ABLATION_MODES) {
    benchmarkSummary.summaryByMode[mode] = {
      totalFixtures: FIXTURE_IDS.length,
      passedFixtures: 0,
      failedFixtures: 0,
      meanLatencyMs: 0,
      meanFps: 0,
      meanCenterErrorPx: 0,
      meanIoU: 0,
      totalIdSwitches: 0,
      totalKeyframes: 0,
      totalPropagated: 0,
      totalResegTriggers: 0
    };
  }

  for (const fixId of FIXTURE_IDS) {
    const videoPath = path.join(FIXTURES_DIR, `fixture_${fixId}.mp4`);
    const gtPath = path.join(FIXTURES_DIR, `fixture_${fixId}_gt.json`);

    if (!fs.existsSync(videoPath) || !fs.existsSync(gtPath)) {
      console.warn(`[WARN] Skipping Fixture ${fixId}: Missing files`);
      continue;
    }

    const gtDoc = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
    benchmarkSummary.results[fixId] = {};

    console.log(`\n>>> Benchmarking Fixture ${fixId.toUpperCase()} (${videoPath})...`);

    for (const mode of ABLATION_MODES) {
      const predPath = path.join(RESULTS_DIR, `pred_vtsm03_${mode}_fix_${fixId}.json`);
      console.log(`  - Mode: [${mode}]`);

      const t0 = Date.now();
      let cmd, args;

      if (mode === 'vtsm02_full_mobilesam') {
        cmd = PYTHON_BIN;
        args = [PIPELINE_VTSM02, videoPath, predPath, 'mobilesam_kalman_camera'];
      } else {
        cmd = PYTHON_BIN;
        args = [PIPELINE_VTSM03, videoPath, predPath, mode];
      }

      const runRes = spawnSync(cmd, args, {
        encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: path.join(EXP_DIR, 'src') }
      });

      const elapsedMs = Date.now() - t0;

      if (runRes.status !== 0 || !fs.existsSync(predPath)) {
        console.error(`    FAILED to run: ${runRes.stderr || runRes.stdout}`);
        benchmarkSummary.results[fixId][mode] = {
          passed: false,
          error: runRes.stderr || 'Execution failed'
        };
        benchmarkSummary.summaryByMode[mode].failedFixtures++;
        continue;
      }

      const predDoc = JSON.parse(fs.readFileSync(predPath, 'utf8'));
      const valRes = VtsmValidator.validate(predDoc);
      if (!valRes.valid) {
        console.error(`    Schema Validation Errors: ${valRes.errors.slice(0, 3).join(', ')}`);
      }

      const evalReport = VtsmEvaluator.evaluate(predDoc, gtDoc);
      const provParams = (predDoc.provenance && predDoc.provenance.parameters) || {};

      evalReport.runtimeMs = elapsedMs;
      evalReport.fps = parseFloat((gtDoc.source.totalFrames / (elapsedMs / 1000.0)).toFixed(2));
      evalReport.medianLatencyMs = provParams.medianLatencyMs || 0;
      evalReport.p95LatencyMs = provParams.p95LatencyMs || 0;
      evalReport.keyframeEncodings = provParams.keyframeEncodings || gtDoc.source.totalFrames;
      evalReport.propagatedFrames = provParams.propagatedFrames || 0;
      evalReport.resegTriggers = provParams.resegTriggers || 0;
      evalReport.schemaValid = valRes.valid;
      evalReport.ablationMode = mode;

      benchmarkSummary.results[fixId][mode] = evalReport;

      if (evalReport.passed && valRes.valid) {
        benchmarkSummary.summaryByMode[mode].passedFixtures++;
        console.log(`    PASS: centerErr=${evalReport.metrics.trajectory.medianCenterErrorPx}px, IoU=${evalReport.metrics.trajectory.meanIoU}, IDSw=${evalReport.metrics.trajectory.idSwitches}, latency=${elapsedMs}ms (${evalReport.fps} FPS, P50=${evalReport.medianLatencyMs}ms, KF=${evalReport.keyframeEncodings})`);
      } else {
        benchmarkSummary.summaryByMode[mode].failedFixtures++;
        console.log(`    FAIL: centerErr=${evalReport.metrics.trajectory.medianCenterErrorPx}px, IoU=${evalReport.metrics.trajectory.meanIoU}, Targets:`, Object.entries(evalReport.targets).filter(([, v]) => !v.passed).map(([k, v]) => `${k}(${v.achieved})`));
      }
    }
  }

  // Aggregate averages across valid fixtures
  for (const mode of ABLATION_MODES) {
    let latSum = 0, fpsSum = 0, errSum = 0, iouSum = 0, swSum = 0;
    let kfSum = 0, propSum = 0, resegSum = 0;
    let count = 0;

    for (const fixId of FIXTURE_IDS) {
      const res = benchmarkSummary.results[fixId] && benchmarkSummary.results[fixId][mode];
      if (res && res.metrics && res.metrics.trajectory) {
        count++;
        latSum += res.runtimeMs || 0;
        fpsSum += res.fps || 0;
        errSum += res.metrics.trajectory.medianCenterErrorPx || 0;
        iouSum += res.metrics.trajectory.meanIoU || 0;
        swSum += res.metrics.trajectory.idSwitches || 0;
        kfSum += res.keyframeEncodings || 0;
        propSum += res.propagatedFrames || 0;
        resegSum += res.resegTriggers || 0;
      }
    }

    if (count > 0) {
      const s = benchmarkSummary.summaryByMode[mode];
      s.meanLatencyMs = parseFloat((latSum / count).toFixed(1));
      s.meanFps = parseFloat((fpsSum / count).toFixed(2));
      s.meanCenterErrorPx = parseFloat((errSum / count).toFixed(2));
      s.meanIoU = parseFloat((iouSum / count).toFixed(4));
      s.totalIdSwitches = swSum;
      s.totalKeyframes = kfSum;
      s.totalPropagated = propSum;
      s.totalResegTriggers = resegSum;
    }
  }

  const outPath = path.join(RESULTS_DIR, 'vtsm03_benchmark_results.json');
  fs.writeFileSync(outPath, JSON.stringify(benchmarkSummary, null, 2), 'utf8');
  console.log(`\n>>> Benchmark complete! Saved summary to ${outPath}\n`);

  console.log('------------------------------------------------------------------------------------------------------------------------');
  console.log('Mode                             | Pass Rate | Mean CenterErr | Mean IoU | ID Switches | Keyframes | FPS   | Mean Latency');
  console.log('------------------------------------------------------------------------------------------------------------------------');
  for (const mode of ABLATION_MODES) {
    const s = benchmarkSummary.summaryByMode[mode];
    const passStr = `${s.passedFixtures}/${s.totalFixtures}`;
    console.log(
      `${mode.padEnd(32)} | ${passStr.padEnd(9)} | ${(s.meanCenterErrorPx + ' px').padEnd(14)} | ${s.meanIoU.toString().padEnd(8)} | ${s.totalIdSwitches.toString().padEnd(11)} | ${s.totalKeyframes.toString().padEnd(9)} | ${(s.meanFps + ' FPS').padEnd(5)} | ${s.meanLatencyMs} ms`
    );
  }
  console.log('------------------------------------------------------------------------------------------------------------------------\n');
}

runBenchmark().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
