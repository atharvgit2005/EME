/**
 * Editing Mechanics Engine (EME) - Phase A1 Audio Fixture Generator
 * Programmatically generates synthetic WAV fixtures for beat detection, tempo, and transient testing.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function encodeWav(samples, sampleRate = 44100, channels = 1) {
  const numFrames = samples.length / channels;
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = numFrames * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1.0, Math.min(1.0, samples[i]));
    const val = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    buffer.writeInt16LE(val, offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Creates a synthetic metronome click (short damped sine burst).
 */
function addClick(pcm, sampleRate, startSample, freqHz = 1000, durationMs = 15, amplitude = 0.8) {
  const numClickSamples = Math.round((durationMs * sampleRate) / 1000);
  for (let i = 0; i < numClickSamples; i++) {
    const idx = startSample + i;
    if (idx >= pcm.length) break;
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 200.0); // fast decay
    const val = amplitude * Math.sin(2.0 * Math.PI * freqHz * t) * envelope;
    pcm[idx] += val;
  }
}

/**
 * Creates a band-limited tone burst with a smooth Hann envelope to eliminate spectral leakage.
 */
function addToneBurst(pcm, sampleRate, startSample, freqHz, durationMs = 60, amplitude = 0.9) {
  const numSamples = Math.round((durationMs * sampleRate) / 1000);
  for (let i = 0; i < numSamples; i++) {
    const idx = startSample + i;
    if (idx >= pcm.length) break;
    const env = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (numSamples - 1)));
    const t = i / sampleRate;
    pcm[idx] += amplitude * Math.sin(2.0 * Math.PI * freqHz * t) * env;
  }
}

/**
 * 1. A1-MET-060: Click track at exactly 60.0 BPM (1 click per second, 6 seconds)
 */
function createMetronome060(sampleRate = 44100, durationSec = 6) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  const interval = sampleRate; // 1s = 60 BPM

  const expectedBeats = [];
  for (let s = 0; s < numSamples; s += interval) {
    addClick(pcm, sampleRate, s, 1000, 15, 0.85);
    expectedBeats.push(s);
  }

  return {
    name: 'A1-MET-060',
    expectedBpm: 60.0,
    expectedBeats,
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 2. A1-MET-120: Click track at 120.0 BPM with nonzero phase offset (100 ms)
 */
function createMetronome120(sampleRate = 44100, durationSec = 6) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  const interval = Math.round(sampleRate * 0.5); // 0.5s = 120 BPM
  const initialOffset = Math.round(sampleRate * 0.1); // 100 ms phase offset

  const expectedBeats = [];
  for (let s = initialOffset; s < numSamples; s += interval) {
    addClick(pcm, sampleRate, s, 1000, 15, 0.85);
    expectedBeats.push(s);
  }

  return {
    name: 'A1-MET-120',
    expectedBpm: 120.0,
    initialOffsetSamples: initialOffset,
    expectedBeats,
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 3. A1-MET-128: Click track at 128.0 BPM (standard EDM tempo, 6 seconds)
 */
function createMetronome128(sampleRate = 44100, durationSec = 6) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  const interval = (60.0 * sampleRate) / 128.0;

  const expectedBeats = [];
  let s = 0;
  while (s < numSamples) {
    const sIdx = Math.round(s);
    addClick(pcm, sampleRate, sIdx, 1000, 15, 0.85);
    expectedBeats.push(sIdx);
    s += interval;
  }

  return {
    name: 'A1-MET-128',
    expectedBpm: 128.0,
    expectedBeats,
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 4. A1-MET-240: Upper-bound click track at 240.0 BPM (0.25s interval, 4 seconds)
 */
function createMetronome240(sampleRate = 44100, durationSec = 4) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  const interval = Math.round(sampleRate * 0.25);

  const expectedBeats = [];
  for (let s = 0; s < numSamples; s += interval) {
    addClick(pcm, sampleRate, s, 1200, 10, 0.85);
    expectedBeats.push(s);
  }

  return {
    name: 'A1-MET-240',
    expectedBpm: 240.0,
    expectedBeats,
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 5. A1-HALF-DOUBLE: 1s strong attacks + 0.5s secondary attacks (competing 60 vs 120 BPM)
 */
function createHalfDouble(sampleRate = 44100, durationSec = 6) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  const halfSec = Math.round(sampleRate * 0.5);

  for (let s = 0; s < numSamples; s += halfSec) {
    const isPrimary = (s % sampleRate) === 0;
    const amp = isPrimary ? 0.9 : 0.45;
    const freq = isPrimary ? 800 : 1400;
    addClick(pcm, sampleRate, s, freq, 15, amp);
  }

  return {
    name: 'A1-HALF-DOUBLE',
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 6. A1-TRANSIENTS: Known impulses at exact sample positions
 */
function createTransients(sampleRate = 44100) {
  const numSamples = sampleRate * 4;
  const pcm = new Float32Array(numSamples);
  const positions = [44100, 88200, 132300]; // at 1s, 2s, 3s

  for (const pos of positions) {
    addClick(pcm, sampleRate, pos, 1500, 8, 0.95);
  }

  return {
    name: 'A1-TRANSIENTS',
    expectedPositions: positions,
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 7. A1-MULTIBAND: Separate Low, Mid, and High bursts
 */
function createMultiBand(sampleRate = 44100) {
  const numSamples = sampleRate * 3;
  const pcm = new Float32Array(numSamples);

  // Low burst at 0.5s (80 Hz) - pure low tone burst
  const lowStart = Math.round(sampleRate * 0.5);
  addToneBurst(pcm, sampleRate, lowStart, 80, 80, 0.95);

  // Mid burst at 1.5s (800 Hz) - mid tone burst
  const midStart = Math.round(sampleRate * 1.5);
  addToneBurst(pcm, sampleRate, midStart, 800, 40, 0.95);

  // High burst at 2.5s (6000 Hz) - high tone burst
  const highStart = Math.round(sampleRate * 2.5);
  addToneBurst(pcm, sampleRate, highStart, 6000, 20, 0.95);

  return {
    name: 'A1-MULTIBAND',
    bursts: [
      { start: lowStart, expectedBand: 'low' },
      { start: midStart, expectedBand: 'mid' },
      { start: highStart, expectedBand: 'high' }
    ],
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 8. A1-SILENCE: Digital silence (zero audio)
 */
function createSilence(sampleRate = 44100, durationSec = 3) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  return {
    name: 'A1-SILENCE',
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 9. A1-QUIET: Low amplitude click track (-40 dBFS, amp ~ 0.01)
 */
function createQuiet(sampleRate = 44100, durationSec = 4) {
  const numSamples = sampleRate * durationSec;
  const pcm = new Float32Array(numSamples);
  const interval = Math.round(sampleRate * 0.5); // 120 BPM

  for (let s = 0; s < numSamples; s += interval) {
    addClick(pcm, sampleRate, s, 1000, 15, 0.01);
  }

  return {
    name: 'A1-QUIET',
    expectedBpm: 120.0,
    wavBuffer: encodeWav(pcm, sampleRate, 1)
  };
}

/**
 * 10. A1-STEREO: Stereo audio with left and right channel clicks
 */
function createStereo(sampleRate = 44100, durationSec = 4) {
  const numFrames = sampleRate * durationSec;
  const interleaved = new Float32Array(numFrames * 2);
  const interval = Math.round(sampleRate * 0.5);

  for (let f = 0; f < numFrames; f += interval) {
    const leftClick = new Float32Array(numFrames);
    const rightClick = new Float32Array(numFrames);
    addClick(leftClick, sampleRate, f, 800, 15, 0.8);
    addClick(rightClick, sampleRate, f, 1200, 15, 0.8);

    for (let i = 0; i < 500 && f + i < numFrames; i++) {
      interleaved[(f + i) * 2] = leftClick[f + i];
      interleaved[(f + i) * 2 + 1] = rightClick[f + i];
    }
  }

  return {
    name: 'A1-STEREO',
    wavBuffer: encodeWav(interleaved, sampleRate, 2)
  };
}

module.exports = {
  encodeWav,
  addClick,
  addToneBurst,
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
};
