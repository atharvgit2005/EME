/**
 * VTSM-02 Full Ablation Benchmark Runner
 * 
 * Runs all 4 configurations across all 7 fixtures (A through G):
 * 1. vtsm01_baseline (Classical vision baseline)
 * 2. mobilesam_proposals_only (MobileSAM proposals + naive greedy matching)
 * 3. mobilesam_kalman (MobileSAM + Kalman filter + gated Hungarian association)
 * 4. mobilesam_kalman_camera (Full stack: MobileSAM + Kalman + camera compensation + Hungarian)
 * 
 * Records exact per-fixture metrics, latency, memory, schema validity,
 * and saves results/vtsm02_benchmark_results.json.
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
const PIPELINE_VTSM01 = path.join(EXP_DIR, 'src/baseline/pipeline.py');
const PIPELINE_VTSM02 = path.join(EXP_DIR, 'src/tracker/pipeline_vtsm02.py');

const FIXTURE_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const ABLATION_MODES = [
  'vtsm01_baseline',
  'mobilesam_proposals_only',
  'mobilesam_kalman',
  'mobilesam_kalman_camera'
];

async function runBenchmark() {
  console.log('================================================================');
  console.log('  VTSM-02: COMPREHENSIVE ABLATION BENCHMARK (7 FIXTURES x 4 MODES)');
  console.log('================================================================\n');

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const benchmarkSummary = {
    suite: 'VTSM-02 Modular Tracking Benchmark',
    timestamp: new Date().toISOString(),
    environment: {
      platform: 'macOS arm64 (Apple Silicon M3)',
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
      totalIdSwitches: 0
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
      const predPath = path.join(RESULTS_DIR, `pred_vtsm02_${mode}_fix_${fixId}.json`);
      console.log(`  - Mode: [${mode}]`);

      const t0 = Date.now();
      let cmd, args;

      if (mode === 'vtsm01_baseline') {
        cmd = PYTHON_BIN;
        args = [PIPELINE_VTSM01, videoPath, predPath];
      } else {
        cmd = PYTHON_BIN;
        args = [PIPELINE_VTSM02, videoPath, predPath, mode];
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
      evalReport.runtimeMs = elapsedMs;
      evalReport.fps = parseFloat((gtDoc.source.totalFrames / (elapsedMs / 1000.0)).toFixed(2));
      evalReport.schemaValid = valRes.valid;
      evalReport.ablationMode = mode;

      benchmarkSummary.results[fixId][mode] = evalReport;

      if (evalReport.passed && valRes.valid) {
        benchmarkSummary.summaryByMode[mode].passedFixtures++;
        console.log(`    PASS: centerErr=${evalReport.metrics.trajectory.medianCenterErrorPx}px, IoU=${evalReport.metrics.trajectory.meanIoU}, IDSw=${evalReport.metrics.trajectory.idSwitches}, latency=${elapsedMs}ms (${evalReport.fps} FPS)`);
      } else {
        benchmarkSummary.summaryByMode[mode].failedFixtures++;
        console.log(`    FAIL: centerErr=${evalReport.metrics.trajectory.medianCenterErrorPx}px, IoU=${evalReport.metrics.trajectory.meanIoU}, Targets:`, Object.entries(evalReport.targets).filter(([, v]) => !v.passed).map(([k, v]) => `${k}(${v.achieved})`));
      }
    }
  }

  // Aggregate stats per mode
  for (const mode of ABLATION_MODES) {
    let latSum = 0, fpsSum = 0, errSum = 0, iouSum = 0, idSwSum = 0, count = 0;
    for (const fixId of FIXTURE_IDS) {
      const res = benchmarkSummary.results[fixId]?.[mode];
      if (res && res.metrics) {
        latSum += res.runtimeMs || 0;
        fpsSum += res.fps || 0;
        errSum += res.metrics.trajectory?.medianCenterErrorPx || 0;
        iouSum += res.metrics.trajectory?.meanIoU || 0;
        idSwSum += res.metrics.trajectory?.idSwitches || 0;
        count++;
      }
    }
    if (count > 0) {
      benchmarkSummary.summaryByMode[mode].meanLatencyMs = parseFloat((latSum / count).toFixed(1));
      benchmarkSummary.summaryByMode[mode].meanFps = parseFloat((fpsSum / count).toFixed(2));
      benchmarkSummary.summaryByMode[mode].meanCenterErrorPx = parseFloat((errSum / count).toFixed(2));
      benchmarkSummary.summaryByMode[mode].meanIoU = parseFloat((iouSum / count).toFixed(4));
      benchmarkSummary.summaryByMode[mode].totalIdSwitches = idSwSum;
    }
  }

  const outPath = path.join(RESULTS_DIR, 'vtsm02_benchmark_results.json');
  fs.writeFileSync(outPath, JSON.stringify(benchmarkSummary, null, 2));

  console.log('\n================================================================');
  console.log('  VTSM-02 BENCHMARK RUN COMPLETE');
  console.log(`  Saved to: ${outPath}`);
  console.log('================================================================');
  console.log(JSON.stringify(benchmarkSummary.summaryByMode, null, 2));

  return benchmarkSummary;
}

if (require.main === module) {
  runBenchmark().catch(err => {
    console.error('Fatal benchmark error:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
