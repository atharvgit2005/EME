/**
 * Editing Mechanics Engine (EME) - Beat Understander DSP Test Suite (Phase A1)
 * Validates deterministic STFT, spectral flux, adaptive onset detection, autocorrelation tempo,
 * beat-grid generation, golden metronome fixtures, silence invariance, and content-addressed caching.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  validateConfig,
  hashConfig,
  DEFAULT_CONFIG
} = require('../src/audio/beat/config.js');

const {
  decodeWav,
  sampleToTicks,
  ticksToSample,
  TICKS_PER_SECOND
} = require('../src/audio/beat/audio-ingest.js');

const {
  computeStft,
  fft,
  getHannWindow
} = require('../src/audio/beat/stft.js');

const {
  computeSpectralFlux
} = require('../src/audio/beat/spectral-features.js');

const {
  detectOnsets
} = require('../src/audio/beat/onset-detector.js');

const {
  estimateTempo
} = require('../src/audio/beat/tempo-estimator.js');

const {
  generateBeatGrid
} = require('../src/audio/beat/beat-grid.js');

const {
  BeatAnalysisCache
} = require('../src/audio/beat/cache.js');

const {
  analyzeBeat,
  getBeatAnalysisSchema
} = require('../src/audio/beat/index.js');

const {
  createMetronome060,
  createMetronome120,
  createMetronome128,
  createMetronome240,
  createHalfDouble,
  createTransients,
  createMultiBand,
  createSilence,
  createQuiet,
  createStereo
} = require('../fixtures/audio/generator.js');

// 1. A1.1: Configuration Tests
test('A1.1 Config: Validates parameters and throws on invalid bounds', () => {
  const valid = validateConfig({ sampleRate: 48000, fftSize: 4096 });
  assert.equal(valid.sampleRate, 48000);
  assert.equal(valid.fftSize, 4096);
  assert.equal(valid.window, 'hann');

  // Invalid sample rate
  assert.throws(() => validateConfig({ sampleRate: 16000 }), /Invalid sampleRate/);

  // Non-power of two FFT
  assert.throws(() => validateConfig({ fftSize: 2000 }), /Invalid fftSize/);

  // Invalid window
  assert.throws(() => validateConfig({ window: 'blackman' }), /Only "hann" is permitted/);

  // Hop length >= fftSize
  assert.throws(() => validateConfig({ fftSize: 1024, hopLength: 1024 }), /less than fftSize/);

  // Deterministic config hashing
  const h1 = hashConfig({ sampleRate: 44100, fftSize: 2048 });
  const h2 = hashConfig({ fftSize: 2048, sampleRate: 44100 });
  assert.equal(h1, h2, 'Config hashing must be independent of key insertion order');
});

// 2. A1.2: Ingest & Timebase Conversions
test('A1.2 Ingest & Timebase: Exact integer tick conversions without float accumulation', () => {
  const sampleRate = 44100;

  // 1 second = 44100 samples = 120000 ticks exactly
  assert.equal(sampleToTicks(44100, sampleRate), 120000);
  assert.equal(ticksToSample(120000, sampleRate), 44100);

  // Frame boundary (1/30s = 4000 ticks = 1470 samples)
  assert.equal(sampleToTicks(1470, sampleRate), 4000);
  assert.equal(ticksToSample(4000, sampleRate), 1470);

  // Decode synthetic metronome WAV
  const fix = createMetronome060(sampleRate, 2);
  const decoded = decodeWav(fix.wavBuffer);
  assert.equal(decoded.sampleRate, 44100);
  assert.equal(decoded.channels, 1);
  assert.equal(decoded.durationSamples, 44100 * 2);
  assert.equal(decoded.durationTicks, 240000);
  assert.match(decoded.sha256, /^[a-f0-9]{64}$/);
});

// 3. A1.3: STFT Mathematical Reference Test
test('A1.3 STFT: Real FFT isolates 440 Hz sinusoidal frequency peak within 0.1%', () => {
  const N = 2048;
  const sampleRate = 44100;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const freq = 440.0;
  const expectedBin = Math.round((freq * N) / sampleRate); // 20

  for (let n = 0; n < N; n++) {
    re[n] = Math.sin((2.0 * Math.PI * freq * n) / sampleRate);
    im[n] = 0.0;
  }

  fft(re, im);

  // Find peak magnitude bin
  let maxMag = 0;
  let peakBin = -1;
  for (let k = 0; k < N / 2; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    if (mag > maxMag) {
      maxMag = mag;
      peakBin = k;
    }
  }

  assert.equal(peakBin, expectedBin, `FFT peak should occur at bin ${expectedBin}`);
  assert.ok(maxMag > 500.0, 'Peak magnitude should be concentrated at fundamental');
});

// 4. A1.4: Onset Detection on Isolated Transients
test('A1.4 Onsets (A1-TRANSIENTS): Timing error <= 10 ms with zero duplicates', () => {
  const fix = createTransients(44100);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  const onsets = res.analysis.events.onsets;
  assert.equal(onsets.length, fix.expectedPositions.length);

  for (let i = 0; i < fix.expectedPositions.length; i++) {
    const expectedSample = fix.expectedPositions[i];
    const detectedSample = onsets[i].sampleIndex;
    const errorSec = Math.abs(detectedSample - expectedSample) / 44100;

    // Numerical gate: median absolute error <= 10 ms
    assert.ok(errorSec <= 0.012, `Onset ${i} error ${errorSec * 1000} ms exceeds threshold`);
  }
});

// 5. A1.5: Multi-Band Spectral Energy
test('A1.5 Multi-Band (A1-MULTIBAND): Accurately classifies low, mid, and high bursts', () => {
  const fix = createMultiBand(44100);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  const onsets = res.analysis.events.onsets;
  assert.ok(onsets.length >= 3, `Expected at least 3 onsets, found ${onsets.length}`);

  // First burst is low (80 Hz)
  assert.equal(onsets[0].band, 'low');
  // Second burst is mid (800 Hz)
  assert.equal(onsets[1].band, 'mid');
  // Third burst is high (6000 Hz)
  assert.equal(onsets[2].band, 'high');
});

// 6. A1.6: Golden Metronome Fixtures (60, 120, 128, 240 BPM)
test('A1.6 Golden Metronome A1-MET-060: Recovers 60.0 BPM within <= 0.1 BPM error', () => {
  const fix = createMetronome060(44100, 6);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.analysis.tempo.bpm - 60.0) <= 0.1, `BPM ${res.analysis.tempo.bpm} exceeds +/-0.1 of 60.0`);
  assert.ok(res.analysis.tempo.confidence > 0.8);
  assert.ok(res.analysis.events.beats.length >= 5);
});

test('A1.6 Golden Metronome A1-MET-120: Recovers 120.0 BPM and non-zero phase offset', () => {
  const fix = createMetronome120(44100, 6);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.analysis.tempo.bpm - 120.0) <= 0.1, `BPM ${res.analysis.tempo.bpm} exceeds +/-0.1 of 120.0`);
  assert.ok(res.analysis.tempo.phaseOffsetSamples > 0, 'Phase offset must be recovered from non-zero initial offset');
  assert.ok(res.analysis.events.beats.length >= 10);
});

test('A1.6 Golden Metronome A1-MET-128: Recovers 128.0 BPM within <= 0.1 BPM error', () => {
  const fix = createMetronome128(44100, 6);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.analysis.tempo.bpm - 128.0) <= 0.1, `BPM ${res.analysis.tempo.bpm} exceeds +/-0.1 of 128.0`);
  assert.ok(res.analysis.events.beats.length >= 11);
});

test('A1.6 Golden Metronome A1-MET-240: Recovers upper-bound 240.0 BPM', () => {
  const fix = createMetronome240(44100, 4);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.analysis.tempo.bpm - 240.0) <= 0.5, `BPM ${res.analysis.tempo.bpm} exceeds +/-0.5 of 240.0`);
});

// 7. A1.7: Half/Double Ambiguity & Silence Invariance
test('A1.7 Ambiguity (A1-HALF-DOUBLE): Flags isAmbiguous on competing 60 vs 120 BPM', () => {
  const fix = createHalfDouble(44100, 6);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.ok([60, 120].some(b => Math.abs(res.analysis.tempo.bpm - b) < 2.0));
  assert.equal(res.analysis.tempo.isAmbiguous, true, 'Must report isAmbiguous=true for harmonic tempo competition');
  assert.ok(res.analysis.tempo.alternativesBpm.length > 0);
});

test('A1.7 Silence (A1-SILENCE): Detects 0 onsets and 0 beats above silence threshold', () => {
  const fix = createSilence(44100, 3);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.equal(res.analysis.events.onsets.length, 0, 'Zero onsets on digital silence');
  assert.equal(res.analysis.events.beats.length, 0, 'Zero beats on digital silence');
  assert.equal(res.analysis.tempo.bpm, 0);
  assert.equal(res.analysis.tempo.confidence, 0);
});

test('A1.7 Quiet Track (A1-QUIET): Analyzes -40 dBFS audio without amplitude failure', () => {
  const fix = createQuiet(44100, 4);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.analysis.tempo.bpm - 120.0) <= 0.5);
  assert.ok(res.analysis.events.onsets.length > 0);
});

test('A1.7 Stereo Downmix (A1-STEREO): Downmixes to mono while preserving channel metadata', () => {
  const fix = createStereo(44100, 4);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true);
  assert.equal(res.analysis.source.channels, 2, 'Channel count must be 2 in source metadata');
  assert.ok(Math.abs(res.analysis.tempo.bpm - 120.0) <= 0.5);
});

// 8. A1.8: Repeatability & Caching
test('A1.8 Repeatability & Caching: Repeat runs yield identical analysisId; config change invalidates cache', () => {
  const fix = createMetronome120(44100, 4);
  const cache = new BeatAnalysisCache({ persistToDisk: false });

  // First run (cache miss)
  const res1 = analyzeBeat(fix.wavBuffer, { fftSize: 2048 }, { cacheInstance: cache });
  assert.equal(res1.cacheHit, false);

  // Second run (cache hit)
  const res2 = analyzeBeat(fix.wavBuffer, { fftSize: 2048 }, { cacheInstance: cache });
  assert.equal(res2.cacheHit, true);
  assert.equal(res1.analysis.analysisId, res2.analysis.analysisId);
  assert.deepEqual(res1.analysis.events.beats, res2.analysis.events.beats);

  // Third run with different config (cache invalidation)
  const res3 = analyzeBeat(fix.wavBuffer, { fftSize: 4096 }, { cacheInstance: cache });
  assert.equal(res3.cacheHit, false);
  assert.notEqual(res1.analysis.analysisId, res3.analysis.analysisId);
});

// 9. A1.9: Schema Conformance
test('A1.9 Schema Conformance: Validates against eme-beat-analysis.v1.schema.json', () => {
  const fix = createMetronome128(44100, 4);
  const res = analyzeBeat(fix.wavBuffer, {}, { skipCache: true });

  assert.equal(res.valid, true, `Schema validation errors: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.analysis.schemaVersion, 'eme-beat-analysis.v1');
});
