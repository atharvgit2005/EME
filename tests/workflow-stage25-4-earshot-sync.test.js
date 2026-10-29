/**
 * Test Suite: Stage 25.4 — Audio-to-Picture Synchronization Analysis
 *
 * Verifies:
 * 1. SYNC-01: Aligned visual cut (< 1 frame duration, e.g. +15ms at 30 fps <= 33.33ms).
 * 2. SYNC-02: Known desync (+150ms late impact, +18,000 ticks) detected and flagged as failed.
 * 3. SYNC-03: Negative offset (sound early by -60ms = -7,200 ticks) correctly signed and flagged.
 * 4. SYNC-04: Visual cut with no nearby audio transient handled gracefully with null offset.
 * 5. SYNC-05: Rational frame rate tolerance scaling (24 fps vs 30 fps vs 60 fps).
 * 6. SYNC-06: Strict integer tick conversion at 120,000 ticks/sec (1ms = 120 ticks).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EarshotAdapter } = require('../src/renderers/earshot-adapter.js');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');

/**
 * Helper to synthesize a WAV with a sharp transient burst at a precise time.
 */
function createSyntheticTransientWav(filePath, durationSec, transientTimeSec) {
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

  const burstStart = Math.floor(transientTimeSec * sampleRate);
  const burstLength = Math.floor(0.04 * sampleRate); // 40ms transient burst

  for (let i = 0; i < numSamples; i++) {
    let sample = 0;
    // Add low ambient background
    sample += (Math.random() - 0.5) * 0.002;

    // Add sharp transient burst
    if (i >= burstStart && i < burstStart + burstLength) {
      const tBurst = (i - burstStart) / sampleRate;
      const env = Math.exp(-tBurst * 50); // fast decay
      sample += Math.sin(2 * Math.PI * 800 * tBurst) * 0.8 * env;
    }

    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

test('Stage 25.4: Audio-to-Picture Synchronization Analysis', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/test-sync-fixtures-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const client = new EarshotWorkerClient();
  const adapter = new EarshotAdapter({ workerClient: client });

  t.after(() => {
    client.stop();
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('SYNC-01: Aligned Visual Cut Within Frame Tolerance Passes', async () => {
    // Cut at 1.000s, Transient at 1.015s (15ms offset <= 33.33ms at 30fps)
    const wavPath = path.join(scratchDir, 'aligned-transient.wav');
    createSyntheticTransientWav(wavPath, 2.5, 1.015);

    const res = await adapter.auditAudioQuality(wavPath, {
      cues: [
        { frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }
      ],
      timebase: { duration_ticks: 300000, fps_numerator: 30, fps_denominator: 1 }
    });

    const syncCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck, 'CHK_EARSHOT_SYNC exists');
    assert.strictEqual(syncCheck.category, 'synchronization');
    assert.strictEqual(syncCheck.status, 'passed');
    assert.ok(Math.abs(syncCheck.measured_value.max_offset_ms) <= 33.34);
    assert.ok(syncCheck.detail.includes('aligned within'));
  });

  await t.test('SYNC-02: Late Audio Impact (+150ms / +18,000 ticks) Detected and Fails', async () => {
    // Cut at 1.000s, Transient at 1.150s (+150ms late)
    const wavPath = path.join(scratchDir, 'late-transient.wav');
    createSyntheticTransientWav(wavPath, 2.5, 1.150);

    const res = await adapter.auditAudioQuality(wavPath, {
      cues: [
        { frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }
      ],
      timebase: { duration_ticks: 300000, fps_numerator: 30, fps_denominator: 1 }
    });

    const syncCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck);
    assert.strictEqual(syncCheck.status, 'failed');
    assert.strictEqual(syncCheck.severity, 'HIGH');

    // Expected: offset ~ +150ms, ticks ~ +18000
    const measuredOffsetMs = syncCheck.measured_value.max_offset_ms;
    assert.ok(Math.abs(measuredOffsetMs - 150) <= 20, `Expected ~150ms, got ${measuredOffsetMs}ms`);

    const measuredTicks = syncCheck.measured_value.max_offset_ticks;
    assert.ok(Math.abs(measuredTicks - 18000) <= 2400, `Expected ~18000 ticks, got ${measuredTicks}`);
  });

  await t.test('SYNC-03: Early Audio Impact (-60ms / -7,200 ticks) Accurately Signed', async () => {
    // Cut at 1.000s, Transient at 0.940s (-60ms early)
    const wavPath = path.join(scratchDir, 'early-transient.wav');
    createSyntheticTransientWav(wavPath, 2.5, 0.940);

    const res = await adapter.auditAudioQuality(wavPath, {
      cues: [
        { frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }
      ],
      timebase: { duration_ticks: 300000, fps_numerator: 30, fps_denominator: 1 }
    });

    const syncCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck);
    assert.strictEqual(syncCheck.status, 'failed');

    const measuredOffsetMs = syncCheck.measured_value.max_offset_ms;
    assert.ok(measuredOffsetMs < 0, `Expected negative offset (early), got ${measuredOffsetMs}`);
    assert.ok(Math.abs(measuredOffsetMs - (-60)) <= 40, `Expected ~ -60ms, got ${measuredOffsetMs}`);
  });

  await t.test('SYNC-04: Visual Cut Without Audio Transient Handled Gracefully', async () => {
    // 2.0s pure quiet audio with no transient
    const wavPath = path.join(scratchDir, 'quiet.wav');
    const sampleRate = 48000;
    const buffer = Buffer.alloc(44 + sampleRate * 2 * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + sampleRate * 4, 4);
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
    buffer.writeUInt32LE(sampleRate * 4, 40);
    fs.writeFileSync(wavPath, buffer);

    const res = await adapter.auditAudioQuality(wavPath, {
      cues: [
        { frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }
      ],
      timebase: { duration_ticks: 240000, fps_numerator: 30, fps_denominator: 1 }
    });

    const syncCheck = res.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck);
    // When no audio transient exists, details record null without crashing
    const detail = res.rawResponse.sync.details[0];
    assert.strictEqual(detail.cut_frame, 30);
    assert.strictEqual(detail.sound_onset_seconds, null);
    assert.strictEqual(detail.offset_ms, null);
  });

  await t.test('SYNC-05: Rational Frame Rate Tolerance Differentiation (24 fps vs 60 fps)', async () => {
    // 25ms offset:
    // At 24 fps (tolerance 41.67ms): 25ms is WITHIN tolerance -> passes
    // At 60 fps (tolerance 16.67ms): 25ms is OUTSIDE tolerance -> fails
    const wavPath = path.join(scratchDir, 'tolerance-check.wav');
    createSyntheticTransientWav(wavPath, 2.5, 1.025);

    // Test 24 fps
    const res24 = await adapter.auditAudioQuality(wavPath, {
      cues: [{ frame: 24, time_seconds: 1.000, kind: 'visual_cut' }],
      timebase: { duration_ticks: 300000, fps_numerator: 24, fps_denominator: 1 }
    });
    const check24 = res24.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.strictEqual(check24.status, 'passed', '25ms offset must pass 24 fps (41.67ms tol)');

    // Test 60 fps
    const res60 = await adapter.auditAudioQuality(wavPath, {
      cues: [{ frame: 60, time_seconds: 1.000, kind: 'visual_cut' }],
      timebase: { duration_ticks: 300000, fps_numerator: 60, fps_denominator: 1 }
    });
    const check60 = res60.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.strictEqual(check60.status, 'failed', '25ms offset must fail 60 fps (16.67ms tol)');
  });

  await t.test('SYNC-06: Strict Integer Microsecond Tick Conversion (120,000 ticks/sec)', () => {
    const ticksPerSec = 120000;
    const testCases = [
      { ms: 150.0, expectedTicks: 18000 },
      { ms: -60.0, expectedTicks: -7200 },
      { ms: 33.3333, expectedTicks: 4000 },
      { ms: 1.0, expectedTicks: 120 },
      { ms: 0.0, expectedTicks: 0 }
    ];

    for (const tc of testCases) {
      const computed = Math.round(tc.ms * (ticksPerSec / 1000.0));
      assert.strictEqual(computed, tc.expectedTicks, `Mismatch for ${tc.ms}ms`);
    }
  });
});
