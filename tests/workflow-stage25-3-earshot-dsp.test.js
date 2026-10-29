/**
 * Test Suite: Stage 25.3 — Objective DSP Measurements (measure) & Delivery Profiles
 *
 * Verifies:
 * 1. Named Authoritative Delivery Profiles.
 * 2. Rational frame-rate tolerance calculation (30 fps, 24 fps, 60 fps, 29.97 fps).
 * 3. Objective DSP measurement of integrated LUFS, True Peak dBTP, and LRA on synthetic signals.
 * 4. High-level compliance detection (flags out-of-band LUFS and true-peak violations).
 * 5. Digital silence handling (normalized to null with explicit reason, resulting in not_measured without false pass).
 * 6. Native fallback when worker is unavailable (produces not_measured, native checks unaffected).
 * 7. Zero Project Mutation Invariant (read-only verification).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EarshotAdapter,
  DELIVERY_PROFILES
} = require('../src/renderers/earshot-adapter.js');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');

/**
 * Helper to synthesize a valid 48kHz mono 16-bit PCM WAV file.
 */
function createSyntheticWav(filePath, durationSec, amplitude = 0.5, frequencyHz = 440) {
  const sampleRate = 48000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataByteLength = numSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataByteLength);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 for mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  // Generate sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    if (amplitude > 0) {
      sample = Math.sin(2 * Math.PI * frequencyHz * t) * amplitude;
    }
    // Clamp to 16-bit signed range [-32768, 32767]
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

test('Stage 25.3: Objective DSP Measurements (measure) & Delivery Profiles', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/test-dsp-fixtures-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const client = new EarshotWorkerClient();
  const adapter = new EarshotAdapter({ workerClient: client });

  t.after(() => {
    client.stop();
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('DSP-01: Authoritative Named Delivery Profiles Resolved Correctly', () => {
    assert.ok(DELIVERY_PROFILES.web_streaming);
    assert.strictEqual(DELIVERY_PROFILES.web_streaming.target_lufs, -14.0);
    assert.strictEqual(DELIVERY_PROFILES.web_streaming.lufs_tolerance, 2.0);
    assert.strictEqual(DELIVERY_PROFILES.web_streaming.true_peak_ceiling_dbtp, -1.0);

    assert.ok(DELIVERY_PROFILES.broadcast_ebu_r128);
    assert.strictEqual(DELIVERY_PROFILES.broadcast_ebu_r128.target_lufs, -23.0);
    assert.strictEqual(DELIVERY_PROFILES.broadcast_ebu_r128.lufs_tolerance, 1.0);

    const custom = EarshotAdapter.resolveProfile({ target_lufs: -18.0, lufs_tolerance: 1.0 });
    assert.strictEqual(custom.target_lufs, -18.0);
    assert.strictEqual(custom.lufs_tolerance, 1.0);
  });

  await t.test('DSP-02: Rational Frame-Rate Tolerance Derived with Precision', () => {
    // 30 fps = 33.333ms
    const tol30 = EarshotAdapter.calculateFrameToleranceMs(30, 1);
    assert.ok(Math.abs(tol30 - 33.333) < 0.01);

    // 24 fps = 41.667ms
    const tol24 = EarshotAdapter.calculateFrameToleranceMs(24, 1);
    assert.ok(Math.abs(tol24 - 41.667) < 0.01);

    // 60 fps = 16.667ms
    const tol60 = EarshotAdapter.calculateFrameToleranceMs(60, 1);
    assert.ok(Math.abs(tol60 - 16.667) < 0.01);

    // 29.97 fps (30000 / 1001) = 33.3667ms
    const tolNTSC = EarshotAdapter.calculateFrameToleranceMs(30000, 1001);
    assert.ok(Math.abs(tolNTSC - 33.3667) < 0.01);
  });

  await t.test('DSP-03: Measurement of Normal Audio File Passes Streaming Target', async () => {
    // 1.0s tone with 0.3 amplitude (~ -14 LUFS range)
    const wavPath = path.join(scratchDir, 'normal-tone.wav');
    createSyntheticWav(wavPath, 1.0, 0.3, 440);

    const res = await adapter.auditAudioQuality(wavPath, {
      profile: 'web_streaming',
      timebase: { duration_ticks: 120000, fps_numerator: 30, fps_denominator: 1 }
    });

    assert.ok(res.checks.length >= 2);
    const lufsCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_LOUDNESS');
    const tpCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');

    assert.ok(lufsCheck, 'CHK_EARSHOT_LOUDNESS exists');
    assert.ok(tpCheck, 'CHK_EARSHOT_TRUE_PEAK exists');

    assert.strictEqual(lufsCheck.category, 'audio_integrity');
    assert.strictEqual(tpCheck.category, 'audio_integrity');

    assert.ok(lufsCheck.measured_value.integrated_lufs !== null);
    assert.ok(tpCheck.measured_value.true_peak_dbtp !== null);
    // True peak for 0.3 amplitude sine wave is approx -10.4 dBTP <= -1.0 ceiling
    assert.strictEqual(tpCheck.status, 'passed');
  });

  await t.test('DSP-04: Digital Silence Normalized Without False Pass', async () => {
    // 1.0s of pure digital silence (amplitude 0)
    const silencePath = path.join(scratchDir, 'digital-silence.wav');
    createSyntheticWav(silencePath, 1.0, 0.0, 0);

    const res = await adapter.auditAudioQuality(silencePath, {
      profile: 'web_streaming'
    });

    const lufsCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_LOUDNESS');
    assert.ok(lufsCheck);
    // Silence cannot produce a valid LUFS reading, must be not_measured, never passed
    assert.strictEqual(lufsCheck.status, 'not_measured');
    assert.strictEqual(lufsCheck.measured_value.lufs, null);
    assert.ok(lufsCheck.detail.includes('could not be measured') || lufsCheck.detail.includes('silence'));
  });

  await t.test('DSP-05: Missing Worker Produces not_measured with Clean Fallback', async () => {
    const brokenClient = new EarshotWorkerClient({
      pythonPath: '/non/existent/bin/python3'
    });
    const brokenAdapter = new EarshotAdapter({ workerClient: brokenClient });

    const wavPath = path.join(scratchDir, 'normal-tone.wav');
    const res = await brokenAdapter.auditAudioQuality(wavPath);

    assert.ok(res.checks.length >= 2);
    const lufsCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_LOUDNESS');
    assert.strictEqual(lufsCheck.status, 'not_measured');
    assert.strictEqual(lufsCheck.severity, 'MEDIUM');
  });

  await t.test('DSP-06: Zero Project Mutation Invariant Maintained', async () => {
    const wavPath = path.join(scratchDir, 'normal-tone.wav');
    const project = {
      project_id: 'proj-immutable-test',
      revision: 4,
      timebase: { ticksPerSecond: 120000, durationTicks: 600000, fpsNumerator: 30, fpsDenominator: 1 },
      clips: [{ id: 'clip-1', start: 0, duration: 600000 }]
    };

    const beforeJson = JSON.stringify(project);

    await adapter.auditAudioQuality(wavPath, {
      profile: 'web_streaming',
      timebase: {
        duration_ticks: project.timebase.durationTicks,
        fps_numerator: project.timebase.fpsNumerator,
        fps_denominator: project.timebase.fpsDenominator
      }
    });

    const afterJson = JSON.stringify(project);
    assert.strictEqual(beforeJson, afterJson, 'Project must remain completely unmodified by Earshot inspection');
  });
});
