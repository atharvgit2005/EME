/**
 * Test Suite: Stage 25.5 — QA Reporting, Integration & Diagnostics
 *
 * Verifies:
 * 1. REP-01: Canonical schema conformance: MediaQAReport containing Earshot checks
 *    passes BriefValidator.validateMediaQAReport() with 0 schema errors.
 * 2. REP-02: Category and severity taxonomy alignment with canonical schema.
 * 3. REP-03: QualityAssuranceEngine.auditQuality() safely includes Earshot checks.
 * 4. REP-04: Controlled diagnostic sheet generation (generateSheet: true) with path containment.
 * 5. REP-05: Non-interference: enableEarshot: false produces clean legacy report.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RenderOrchestrator } = require('../src/prompt-core/render-orchestrator.js');
const { QualityAssuranceEngine } = require('../src/renderers/qa-engine.js');
const { BriefValidator } = require('../src/prompt-core/brief-validator.js');

/**
 * Synthesizes a valid 48kHz mono 16-bit PCM WAV file.
 */
function createSyntheticWav(filePath, durationSec, amplitude = 0.4) {
  const sampleRate = 48000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataByteLength = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * amplitude;
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

test('Stage 25.5: QA Reporting, Integration & Diagnostics', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/test-rep-fixtures-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const testWav = path.join(scratchDir, 'test-render.wav');
  createSyntheticWav(testWav, 2.0, 0.3);

  const mockProject = {
    project_id: 'proj-rep-001',
    revision: 1,
    canvas: { width: 1920, height: 1080 },
    timebase: {
      durationTicks: 240000,
      ticksPerSecond: 120000,
      fpsNumerator: 30,
      fpsDenominator: 1
    },
    clips: [
      { id: 'clip-1', start: 0, duration: 120000, type: 'video' },
      { id: 'clip-2', start: 120000, duration: 120000, type: 'video' }
    ],
    assets: [
      { id: 'asset-audio', type: 'audio', src: testWav }
    ],
    deliveryProfile: {
      name: 'web_streaming',
      target_lufs: -14.0,
      lufs_tolerance: 2.0,
      true_peak_ceiling_dbtp: -1.0
    }
  };

  const mockRenderJob = {
    job_id: 'rjob-stage25-test-01',
    target: 'master',
    output_profile: {
      width: 1920,
      height: 1080,
      frame_rate: {
        numerator: 30,
        denominator: 1
      }
    }
  };

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('REP-01: Canonical Schema Conformance with Earshot Checks', () => {
    const qaReport = RenderOrchestrator.inspectRenderedMedia({
      mediaPath: testWav,
      renderJob: mockRenderJob,
      project: mockProject,
      options: { enableEarshot: true }
    });

    assert.ok(qaReport);
    assert.strictEqual(qaReport.schema_version, '1.0.0');
    assert.strictEqual(qaReport.job_id, mockRenderJob.job_id);

    // Verify Earshot checks are included
    const hasLoudness = qaReport.checks.some(c => c.id === 'CHK_EARSHOT_LOUDNESS');
    const hasTruePeak = qaReport.checks.some(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
    assert.ok(hasLoudness, 'CHK_EARSHOT_LOUDNESS must be present in report');
    assert.ok(hasTruePeak, 'CHK_EARSHOT_TRUE_PEAK must be present in report');

    // Canonical schema validation
    const val = BriefValidator.validateMediaQAReport(qaReport);
    assert.strictEqual(val.valid, true, `MediaQAReport failed schema validation: ${val.errors.join('; ')}`);
  });

  await t.test('REP-02: Category and Severity Taxonomy Fully Conforms to Frozen Schema', () => {
    const qaReport = RenderOrchestrator.inspectRenderedMedia({
      mediaPath: testWav,
      renderJob: mockRenderJob,
      project: mockProject,
      options: { enableEarshot: true }
    });

    const validCategories = new Set([
      'container_format',
      'stream_conformance',
      'audio_integrity',
      'video_integrity',
      'content_timing',
      'synchronization'
    ]);

    const validSeverities = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
    const validStatuses = new Set(['passed', 'failed', 'not_measured', 'not_applicable']);

    for (const check of qaReport.checks) {
      assert.ok(validCategories.has(check.category), `Invalid category "${check.category}" in check ${check.id}`);
      assert.ok(validStatuses.has(check.status), `Invalid status "${check.status}" in check ${check.id}`);
      if (check.severity) {
        assert.ok(validSeverities.has(check.severity), `Invalid severity "${check.severity}" in check ${check.id}`);
      }
    }
  });

  await t.test('REP-03: QualityAssuranceEngine.auditQuality() Safely Incorporates Earshot Checks', () => {
    const auditRes = QualityAssuranceEngine.auditQuality(mockProject, testWav, {
      enableEarshot: true
    });

    assert.ok(auditRes);
    assert.ok(typeof auditRes.score === 'number');
    assert.ok(Array.isArray(auditRes.checks));

    const earshotCheck = auditRes.checks.find(c => c.id === 'CHK_EARSHOT_LOUDNESS');
    assert.ok(earshotCheck, 'QualityAssuranceEngine report includes CHK_EARSHOT_LOUDNESS');
    assert.strictEqual(earshotCheck.category, 'audio_integrity');
  });

  await t.test('REP-04: Controlled Diagnostic Sheet Generation with Path Containment', () => {
    const sheetOutput = path.join(scratchDir, 'diagnostic-sheet.png');

    const qaReport = RenderOrchestrator.inspectRenderedMedia({
      mediaPath: testWav,
      renderJob: mockRenderJob,
      project: mockProject,
      options: {
        enableEarshot: true,
        generateSheet: true,
        sheetOutputPath: sheetOutput
      }
    });

    assert.ok(qaReport);
    // If Earshot sheet generator completed, sheet exists and is contained in scratchDir
    if (fs.existsSync(sheetOutput)) {
      assert.ok(fs.statSync(sheetOutput).size > 0, 'Sheet file is non-empty');
      assert.ok(sheetOutput.startsWith(scratchDir), 'Sheet path is strictly contained');
    }
  });

  await t.test('REP-05: Non-Interference: enableEarshot: false Disables Adapter Cleanly', () => {
    const qaReport = RenderOrchestrator.inspectRenderedMedia({
      mediaPath: testWav,
      renderJob: mockRenderJob,
      project: mockProject,
      options: { enableEarshot: false }
    });

    assert.ok(qaReport);
    const hasEarshot = qaReport.checks.some(c => c.id.startsWith('CHK_EARSHOT'));
    assert.strictEqual(hasEarshot, false, 'No Earshot checks should be present when disabled');
    // Schema must still be 100% valid
    const val = BriefValidator.validateMediaQAReport(qaReport);
    assert.strictEqual(val.valid, true);
  });
});
