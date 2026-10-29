/**
 * EME Audio Intelligence - Phase A2 Structure & Multi-Band Tests
 * Tests downbeat estimation, meter (4/4, 3/4), musical sections, and 5-band frequency decomposition.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeBeat,
  estimateDownbeats,
  detectSections,
  analyzeFrequencyBands
} = require('../src/audio/beat/index.js');
const { computeStft } = require('../src/audio/beat/stft.js');

test('A2.1 Downbeat & Meter: Correctly identifies 4/4 meter and phase from beat features', () => {
  const sampleRate = 44100;
  const beats = [];
  // 16 beats at 120 BPM = 0.5s intervals
  for (let i = 0; i < 16; i++) {
    beats.push({
      id: `beat-${i + 1}`,
      sampleIndex: i * 22050,
      ticks: i * 60000,
      confidence: 0.9,
      strength: i % 4 === 0 ? 0.95 : 0.4 // Strong beat 1 in each bar
    });
  }

  // Synthesize band flux where low band spikes on beat 0, 4, 8, 12
  const numFrames = 100;
  const sampleIndices = new Int32Array(numFrames);
  const lowFlux = new Float32Array(numFrames);
  const midFlux = new Float32Array(numFrames);
  const highFlux = new Float32Array(numFrames);

  for (let m = 0; m < numFrames; m++) {
    sampleIndices[m] = m * 4410;
  }

  // Spikes on 4/4 downbeats
  [0, 4, 8, 12].forEach(bIdx => {
    const s = beats[bIdx].sampleIndex;
    const fIdx = Math.round(s / 4410);
    if (fIdx < numFrames) lowFlux[fIdx] = 1.0;
  });

  const res = estimateDownbeats(beats, { low: lowFlux, mid: midFlux, high: highFlux }, sampleIndices, { sampleRate });

  assert.equal(res.meter.numerator, 4, 'Meter numerator should be 4');
  assert.equal(res.meter.denominator, 4, 'Meter denominator should be 4');
  assert.ok(res.meter.confidence >= 0.5, 'Meter confidence should be >= 0.5');
  assert.equal(res.phaseOffsetBeats, 0, 'Phase offset should be beat 0');
  assert.equal(res.downbeats.length, 4, 'Should detect 4 bars of downbeats');
  assert.equal(res.downbeats[0].ticks, 0, 'First downbeat should be at tick 0');
  assert.equal(res.downbeats[1].ticks, 240000, 'Second downbeat should be at 4 beats (240,000 ticks)');
});

test('A2.2 Section Detection: Classifies intro, build, drop, and outro across dynamic energy profile', () => {
  const sampleRate = 44100;
  const durationSeconds = 12; // 12 seconds
  const totalSamples = sampleRate * durationSeconds;
  const pcm = new Float32Array(totalSamples);

  // 0-3s: quiet intro (amp 0.1)
  for (let s = 0; s < sampleRate * 3; s++) {
    pcm[s] = Math.sin(2 * Math.PI * 220 * (s / sampleRate)) * 0.1;
  }
  // 3-6s: rising build (amp 0.1 -> 0.5)
  for (let s = sampleRate * 3; s < sampleRate * 6; s++) {
    const progress = (s - sampleRate * 3) / (sampleRate * 3);
    pcm[s] = Math.sin(2 * Math.PI * 440 * (s / sampleRate)) * (0.1 + progress * 0.4);
  }
  // 6-10s: high energy drop (amp 0.95)
  for (let s = sampleRate * 6; s < sampleRate * 10; s++) {
    pcm[s] = Math.sin(2 * Math.PI * 80 * (s / sampleRate)) * 0.95;
  }
  // 10-12s: fading outro (amp 0.15)
  for (let s = sampleRate * 10; s < totalSamples; s++) {
    pcm[s] = Math.sin(2 * Math.PI * 220 * (s / sampleRate)) * 0.15;
  }

  // Dummy beats every 0.5s
  const beats = [];
  for (let s = 0; s < totalSamples; s += 22050) {
    beats.push({ sampleIndex: s, ticks: Math.round((s * 120000) / sampleRate) });
  }

  const sections = detectSections(pcm, beats, {}, { sampleRate });
  assert.ok(sections.length >= 2, 'Should detect multiple sections');
  assert.equal(sections[0].type, 'intro', 'First section should be intro');

  const dropSection = sections.find(s => s.type === 'drop');
  assert.ok(dropSection, 'Should detect a drop section');
  assert.ok(dropSection.startTicks >= 360000, 'Drop should start after intro/build');
});

test('A2.3 Multi-Band Decomposition: Separates 5 frequency bands and isolates localized transients', () => {
  const sampleRate = 44100;
  const fftSize = 1024;
  const hopLength = 256;
  const numFrames = 20;

  // Synthesize STFT frames where frame 5 has sub-bass energy and frame 12 has high-hat energy
  const logMagnitudes = [];
  const sampleIndices = new Int32Array(numFrames);

  for (let m = 0; m < numFrames; m++) {
    sampleIndices[m] = m * hopLength;
    const frame = new Float32Array((fftSize >> 1) + 1);
    if (m === 5) {
      // 60 Hz tone (bin ~ 60 / (44100 / 1024) = 1.4)
      frame[1] = 5.0;
      frame[2] = 5.0;
    }
    if (m === 12) {
      // 10,000 Hz tone (bin ~ 10000 / 43.06 = 232)
      frame[232] = 6.0;
    }
    logMagnitudes.push(frame);
  }

  const res = analyzeFrequencyBands(logMagnitudes, sampleIndices, { fftSize, sampleRate });

  assert.equal(res.bandPeaks.sub.frameIndex, 5, 'Sub-bass peak should be detected at frame 5');
  assert.equal(res.bandPeaks.high.frameIndex, 12, 'High-frequency peak should be detected at frame 12');
  assert.ok(res.curves.sub[5] > res.curves.sub[0], 'Sub curve at frame 5 should be elevated');
  assert.ok(res.curves.high[12] > res.curves.high[0], 'High curve at frame 12 should be elevated');
});
