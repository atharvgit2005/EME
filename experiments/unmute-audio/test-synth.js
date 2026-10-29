const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  SR,
  BPM,
  BEAT,
  STEP,
  BAR,
  polyBlep,
  saw,
  sine,
  envAdsr,
  expEnv,
  BiquadFilter,
  synthesizeComposition,
  encodeWav
} = require('./synth');

console.log('=== Running Procedural Synth & Dynamic Duration Test Suite ===\n');

// 1. PolyBLEP Oscillator Stability
console.log('[Test 1] PolyBLEP Oscillator boundary test...');
const dtLow = 20 / SR;
const dtHigh = 12000 / SR;
assert.strictEqual(polyBlep(0.0, dtLow), -1.0, 'PolyBLEP at phase 0 must be -1.0');
assert.strictEqual(polyBlep(0.5, dtLow), 0.0, 'PolyBLEP at phase 0.5 must be 0.0');
const sawLow = saw(30, 480);
const sawHigh = saw(8000, 480);
for (let v of sawLow) assert(!isNaN(v) && isFinite(v) && Math.abs(v) <= 1.5, 'Saw low finite');
for (let v of sawHigh) assert(!isNaN(v) && isFinite(v) && Math.abs(v) <= 1.5, 'Saw high finite');
console.log('  PASS: PolyBLEP oscillators are stable across audio band.\n');

// 2. Biquad Filter Stability
console.log('[Test 2] Resonant Biquad stability & frequency response...');
const lp = new BiquadFilter('lowpass', 1000);
const bp = new BiquadFilter('bandpass', 2000, 2.0);
const hp = new BiquadFilter('highpass', 500);
const testImpulse = new Float64Array(480);
testImpulse[0] = 1.0;
const lpOut = lp.processArray(testImpulse);
const bpOut = bp.processArray(testImpulse);
const hpOut = hp.processArray(testImpulse);
for (let v of lpOut) assert(!isNaN(v) && isFinite(v), 'LP impulse finite');
for (let v of bpOut) assert(!isNaN(v) && isFinite(v), 'BP impulse finite');
for (let v of hpOut) assert(!isNaN(v) && isFinite(v), 'HP impulse finite');
console.log('  PASS: Biquad filters are stable with bounded impulse response.\n');

// 3. Deterministic Bit-Identical Repeatability
console.log('[Test 3] Deterministic synthesis repeatability...');
const run1 = synthesizeComposition(6.0, 42);
const run2 = synthesizeComposition(6.0, 42);
assert.strictEqual(run1.totalSamples, run2.totalSamples, 'Sample count match');
assert.strictEqual(run1.events.length, run2.events.length, 'Event count match');
let maxDiff = 0;
for (let i = 0; i < run1.totalSamples; i++) {
  const dL = Math.abs(run1.left[i] - run2.left[i]);
  const dR = Math.abs(run1.right[i] - run2.right[i]);
  if (dL > maxDiff) maxDiff = dL;
  if (dR > maxDiff) maxDiff = dR;
}
assert.strictEqual(maxDiff, 0, 'Bit-identical repeatability expected with identical seed');
console.log('  PASS: Bit-identical repeatability verified (max diff = 0).\n');

// 4. Sample and Frame Alignment
console.log('[Test 4] Canonical timeline & sample-to-frame alignment...');
for (let ev of run1.events) {
  const expectedSample = Math.round(ev.t * SR);
  const expectedFrame = Math.round(ev.t * 30);
  assert.strictEqual(ev.sample, expectedSample, `Sample index alignment at t=${ev.t}`);
  assert.strictEqual(ev.frame, expectedFrame, `Frame index alignment at t=${ev.t}`);
}
console.log('  PASS: Events adhere to canonical sample and frame mapping.\n');

// 5. Dynamic Duration Matrix (6s, 8s, 12s, 16s, 30s)
console.log('[Test 5] Dynamic Duration Matrix evaluation...');
const testDurations = [6.0, 8.0, 12.0, 16.0, 30.0];
for (let dur of testDurations) {
  const comp = synthesizeComposition(dur, 1209);
  const expectedSamples = Math.round(dur * SR);
  assert.strictEqual(comp.totalSamples, expectedSamples, `Total samples for ${dur}s`);
  const wav = encodeWav(comp.left, comp.right);
  assert.strictEqual(wav.readUInt32LE(24), SR, 'WAV sample rate 48000');
  assert.strictEqual(wav.readUInt16LE(22), 2, 'WAV stereo channels');
  assert.strictEqual(wav.readUInt16LE(34), 16, 'WAV 16-bit');
  console.log(`  PASS: Duration ${dur.toFixed(1)}s -> ${comp.totalSamples} samples, ${comp.totalBars} bars, ${comp.events.length} events, WAV ${(wav.length/1024/1024).toFixed(2)} MB`);
}
console.log('');

// 6. EME Core Baseline Immutability Check
console.log('[Test 6] Verifying EME core baseline remains clean & untouched...');
const gitStatus = spawnSync('git', ['status', '--porcelain', 'src/', 'bin/'], { encoding: 'utf8' });
assert.strictEqual(gitStatus.stdout.trim(), '', 'Core src/ and bin/ must have zero changes');
console.log('  PASS: Core engine baseline is 100% pristine and untouched.\n');

console.log('=== All 6/6 Procedural Synth & Dynamic Duration Tests PASSED ===');
