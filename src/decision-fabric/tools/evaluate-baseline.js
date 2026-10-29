import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeterministicRouter } from '../baseline/deterministic-router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

const DATA_DIR = path.join(ROOT, 'src', 'decision-fabric', 'data');
const REPORTS_DIR = path.join(ROOT, 'src', 'decision-fabric', 'reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const valPath = path.join(DATA_DIR, 'validation.jsonl');
const lines = fs.readFileSync(valPath, 'utf8').trim().split('\n').filter(Boolean);
const records = lines.map(l => JSON.parse(l));

const router = new DeterministicRouter();
const latencies = [];
let correct = 0;
let needsPlanningExpected = 0;
let needsPlanningCaptured = 0;

const classCounts = {};
const truePositives = {};
const falsePositives = {};
const falseNegatives = {};

for (const r of records) {
  const expected = r.expected.intent;
  classCounts[expected] = (classCounts[expected] || 0) + 1;

  if (expected === 'needs_planning') {
    needsPlanningExpected++;
  }

  const t0 = performance.now();
  const pred = router.predict(r.state);
  const t1 = performance.now();
  latencies.push(t1 - t0);

  const predicted = pred.answers.intent.choice;
  if (predicted === expected) {
    correct++;
    truePositives[expected] = (truePositives[expected] || 0) + 1;
  } else {
    falsePositives[predicted] = (falsePositives[predicted] || 0) + 1;
    falseNegatives[expected] = (falseNegatives[expected] || 0) + 1;
  }

  if (expected === 'needs_planning' && (predicted === 'needs_planning' || pred.answers.requires_multistep_plan.noul >= 0.5)) {
    needsPlanningCaptured++;
  }
}

// Compute metrics
const allLabels = Object.keys(classCounts);
let sumF1 = 0;
const perClass = {};

for (const label of allLabels) {
  const tp = truePositives[label] || 0;
  const fp = falsePositives[label] || 0;
  const fn = falseNegatives[label] || 0;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  perClass[label] = {
    count: classCounts[label],
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4))
  };
  sumF1 += f1;
}

const macroF1 = sumF1 / allLabels.length;
latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.50)];
const p95 = latencies[Math.floor(latencies.length * 0.95)];

const report = {
  version: "1.0.0",
  model: "deterministic_baseline_v1",
  evaluated_at: new Date().toISOString(),
  dataset: "validation.jsonl",
  total_samples: records.length,
  accuracy: Number((correct / records.length).toFixed(4)),
  macro_f1: Number(macroF1.toFixed(4)),
  needs_planning_safety_recall: Number((needsPlanningCaptured / (needsPlanningExpected || 1)).toFixed(4)),
  latency_ms: {
    p50: Number(p50.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    mean: Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3))
  },
  per_class: perClass
};

const reportPath = path.join(REPORTS_DIR, 'baseline.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`[Baseline Evaluation] Accuracy: ${(report.accuracy * 100).toFixed(1)}%, Macro-F1: ${report.macro_f1}, NeedsPlanning Recall: ${(report.needs_planning_safety_recall * 100).toFixed(1)}%, P95: ${report.latency_ms.p95}ms`);
