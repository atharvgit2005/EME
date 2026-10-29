/**
 * Generate Final Empirical Benchmark v1.2.0 Recall Results JSON and Summary Report
 */

const fs = require('fs');
const path = require('path');
const { VisionWorkerOfflinePipeline } = require('../src/renderers/vision-worker-pipeline');

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const inventoryFile = path.join(repoRoot, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/fixture-inventory.json');
  const outputDir = path.join(repoRoot, 'artifacts/phase-32/stage-32.4/sidecars');
  
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  const pipeline = new VisionWorkerOfflinePipeline({ outputDir });
  
  console.log('Evaluating complete 12-clip benchmark corpus against Benchmark v1.2.0...');
  const report = await pipeline.evaluateBenchmarkRecall(inventory);
  await pipeline.close();

  // Add target semantics qualification
  report.benchmarkVersion = '1.2.0';
  report.targetSemantics = 'synthetic-visual-chrominance-segmentation';
  report.scopeQualification = 'Measures localization of visually encoded synthetic face-region targets via RGB chrominance segmentation (#d4a373); does not measure unconstrained natural human face recognition.';
  
  const jsonPath = path.join(repoRoot, 'artifacts/phase-32/stage-32.4/benchmark-recall-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Saved benchmark recall results to: ${jsonPath}`);
  
  console.log('\n--- EVALUATION SUMMARY ---');
  console.log(`Overall Recall (GATE-02A): ${(report.overallMetrics.recall * 100).toFixed(2)}% (Target: >=95.0%) -> ${report.gateResults['GATE-02A'].status}`);
  for (const [key, scen] of Object.entries(report.gateResults['GATE-02B'].scenarios)) {
    console.log(`  ${key}: Recall = ${scen.recallDisplay || (scen.recall * 100).toFixed(2) + '%'}, FP = ${scen.falsePositives} -> ${scen.status}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
