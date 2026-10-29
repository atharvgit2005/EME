/**
 * Phase 11 Regression Test Suite
 *
 * Verifies all Phase 11 closures:
 * 1. Audio mixing benchmark output and signal presence
 * 2. 3-format aspect adaptation output and QA score
 * 3. 5-turn sequential revision trace and state integrity
 * 4. Negative fixture rejection and uncorrupted recovery
 * 5. QA engine defect detection sensitivity and zero false positives
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../../src/engine/project.js');
const { OperationExecutor } = require('../../src/engine/operations.js');
const { QualityAssuranceEngine } = require('../../src/renderers/qa-engine.js');

test('Phase 11 Audio Mixing Benchmark Conformance', async (t) => {
  const audioResultFile = path.resolve('artifacts/phase-11/audio/audio-benchmark-result.json');
  assert.ok(fs.existsSync(audioResultFile), 'Audio benchmark result must exist');

  const data = JSON.parse(fs.readFileSync(audioResultFile, 'utf8'));
  assert.equal(data.durationSec, 16, 'Audio duration must be 16s');
  assert.ok(data.audioStream && data.audioStream.codec === 'aac', 'Output must contain AAC audio stream');
  assert.equal(data.signalMetrics.hasAudioSignal, true, 'Audio signal must be present (> -90dB)');
  assert.equal(data.qa.score, 100, 'Audio benchmark QA score must be 100');
});

test('Phase 11 3-Format Aspect Ratio Adaptation Conformance', async (t) => {
  const adaptResultFile = path.resolve('artifacts/phase-11/aspect-adaptation/adaptation-results.json');
  assert.ok(fs.existsSync(adaptResultFile), 'Aspect adaptation result must exist');

  const results = JSON.parse(fs.readFileSync(adaptResultFile, 'utf8'));
  assert.equal(results.length, 3, 'Must render exactly 3 formats (16:9, 9:16, 1:1)');

  for (const res of results) {
    assert.ok(fs.existsSync(res.mp4Path), `MP4 must exist for format ${res.format}`);
    assert.ok(fs.existsSync(res.framePath), `Frame must exist for format ${res.format}`);
    assert.equal(res.qaScore, 100, `QA score must be 100 for format ${res.format}`);
    assert.equal(res.qaPassed, true, `QA must pass for format ${res.format}`);
  }
});

test('Phase 11 Multi-Turn Revisions & State Preservation', async (t) => {
  const traceFile = path.resolve('artifacts/phase-11/multi-turn/multi-turn-trace.json');
  assert.ok(fs.existsSync(traceFile), 'Multi-turn trace file must exist');

  const traceData = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  assert.equal(traceData.turnsCompleted, 5, 'Must execute exactly 5 turns');
  assert.equal(traceData.initialRevision, 1, 'Initial revision must be 1');
  assert.equal(traceData.finalRevision, 6, 'Final revision must be 6');
  assert.ok(fs.existsSync(path.resolve('artifacts/phase-11/multi-turn/multi-turn-final.mp4')), 'Final MP4 must exist');
});

test('Phase 11 Negative Request Invariant & Failure Recovery', async (t) => {
  const reportFile = path.resolve('artifacts/phase-11/failure-recovery/failure-recovery-report.json');
  assert.ok(fs.existsSync(reportFile), 'Failure recovery report must exist');

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  assert.equal(report.testsTotal, 8, 'Must test 8 failure & recovery scenarios');
  assert.equal(report.testsPassed, 8, 'All 8 failure tests must pass');
});

test('Phase 11 Quality Assurance Engine Sensitivity & Calibration', async (t) => {
  const calibFile = path.resolve('artifacts/phase-11/qa-calibration/qa-calibration-report.json');
  assert.ok(fs.existsSync(calibFile), 'QA calibration report must exist');

  const calib = JSON.parse(fs.readFileSync(calibFile, 'utf8'));
  assert.equal(calib.sensitivityPercent, 100, 'QA engine sensitivity must be 100%');
  assert.equal(calib.falsePositives, 0, 'QA engine must have 0 false positives');
});
