/**
 * EME Procedural Audio Synthesizer (Pure Mathematics & Float Arrays)
 * 
 * Clean-room TypeScript/JavaScript port of tools/sfx.py from mrsarac/ff-tracking.
 * Generates 100% procedural 48 kHz 16-bit stereo WAV audio with zero external dependencies.
 * 
 * Layers:
 * 1. Screen Hum: Mains 50Hz/60Hz harmonics + CRT flyback whine (7812 Hz) + stereo detune.
 * 2. Glitch Cuts: High-frequency transient burst on scene cuts.
 * 3. Keystroke Clicks: Band-limited transient impulses.
 * 4. Lock-on Beeps: Minor pentatonic two-partial tone + chirp with spatial stereo panning.
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 48000;

// Pentatonic scale partials (Hz) from ff-tracking tools/sfx.py
const LOCK_NOTES = [
  1318.5, // E6
  1568.0, // G6
  1760.0, // A6
  2093.0, // C7
  2349.3, // D7
  1760.0,
  1568.0,
  2093.0,
  2637.0, // E7
  1760.0,
  1046.5, // C6
  2093.0
];

/**
 * Envelope generator: linear attack, exponential release.
 */
function envelope(t, attack, release) {
  const att = Math.max(attack, 0.0001);
  const rel = Math.max(release, 0.0001);
  const rise = Math.min(t / att, 1.0);
  return rise * Math.exp(-t / rel);
}

/**
 * Equal-power stereo panning: pan in [-1.0, 1.0].
 * Returns [leftGain, rightGain].
 */
function equalPowerPan(pan) {
  const p = Math.max(-1.0, Math.min(1.0, pan));
  const angle = (p + 1.0) * (Math.PI / 4.0);
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Build 44-byte standard RIFF WAV header for 16-bit stereo PCM.
 */
function buildWavHeader(numSamples, sampleRate = SAMPLE_RATE) {
  const numChannels = 2;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);          // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);           // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);  // SampleRate
  buffer.writeUInt32LE(byteRate, 28);    // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34);          // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/**
 * Synthesize procedural sound effects buffer for an animation timeline.
 * 
 * @param {Object} options
 * @param {number} options.durationSeconds Total duration in seconds
 * @param {Array<number>} [options.cuts] Timestamps (sec) for glitch cut bursts
 * @param {Array<number>} [options.keys] Timestamps (sec) for keyboard click impulses
 * @param {Array<Object>} [options.locks] Array of { time, screenX, screenW } for lock beeps
 * @param {number} [options.sampleRate=48000] Audio sample rate
 * @returns {Buffer} 16-bit stereo WAV buffer
 */
function synthesizeSfx(options) {
  const duration = options.durationSeconds || 3.0;
  const sampleRate = options.sampleRate || SAMPLE_RATE;
  const numSamples = Math.floor(duration * sampleRate);

  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // 1. Screen Hum: 50Hz mains + harmonics + 7812Hz CRT flyback whine
  for (let ch = 0; ch < 2; ch++) {
    const detune = ch === 0 ? 0.0 : 0.35;
    const target = ch === 0 ? left : right;
    
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let hum = 0.0;
      for (let k = 1; k <= 6; k++) {
        hum += Math.sin(2.0 * Math.PI * (50.0 + detune) * k * t) / Math.pow(k, 1.4);
      }
      const whine = Math.sin(2.0 * Math.PI * (7812.0 + detune * 3.0) * t) * 0.012;
      // Slight pseudo-random noise air
      const noise = (Math.random() * 2.0 - 1.0) * 0.004;

      target[i] += (hum * 0.035 + whine + noise) * 0.5;
    }
  }

  // 2. Cut Glitch Bursts
  const cuts = options.cuts || [];
  cuts.forEach(cutTime => {
    const startIdx = Math.floor(cutTime * sampleRate);
    const burstLen = Math.floor(0.045 * sampleRate); // 45ms
    const pan = (Math.random() * 2.0 - 1.0) * 0.5;
    const [panL, panR] = equalPowerPan(pan);

    for (let j = 0; j < burstLen; j++) {
      const idx = startIdx + j;
      if (idx >= numSamples) break;
      const t = j / sampleRate;
      const env = envelope(t, 0.0005, 0.012);
      // Bitcrushed noise
      const rawNoise = Math.random() * 2.0 - 1.0;
      const crushed = Math.round(rawNoise * 3.0) / 3.0;
      const click = (j < 30) ? (1.0 - j / 30.0) * 0.8 : 0.0;
      const sample = (crushed * 0.4 + click) * env * 0.4;

      left[idx] += sample * panL;
      right[idx] += sample * panR;
    }
  });

  // 3. Keystroke Clicks
  const keys = options.keys || [];
  keys.forEach(keyTime => {
    const startIdx = Math.floor(keyTime * sampleRate);
    const clickLen = Math.floor(0.012 * sampleRate); // 12ms
    const pan = (Math.random() * 2.0 - 1.0) * 0.3;
    const [panL, panR] = equalPowerPan(pan);

    for (let j = 0; j < clickLen; j++) {
      const idx = startIdx + j;
      if (idx >= numSamples) break;
      const t = j / sampleRate;
      const env = envelope(t, 0.0002, 0.0025);
      // High frequency click oscillation (3500 Hz + noise)
      const osc = Math.sin(2.0 * Math.PI * 3500.0 * t) * 0.6 + (Math.random() * 2.0 - 1.0) * 0.4;
      const sample = osc * env * 0.15;

      left[idx] += sample * panL;
      right[idx] += sample * panR;
    }
  });

  // 4. Lock-on Beeps
  const locks = options.locks || [];
  locks.forEach((lock, k) => {
    const lockTime = lock.time !== undefined ? lock.time : 1.0;
    const startIdx = Math.floor(lockTime * sampleRate);
    const beepLen = Math.floor(0.16 * sampleRate); // 160ms
    const f0 = LOCK_NOTES[k % LOCK_NOTES.length];

    // Compute stereo pan from target screen position
    let pan = 0.0;
    if (lock.screenX !== undefined && lock.screenW !== undefined) {
      pan = (lock.screenX / lock.screenW - 0.5) * 1.6;
      pan = Math.max(-0.85, Math.min(0.85, pan));
    }
    const [panL, panR] = equalPowerPan(pan);

    let chirpPhase = 0.0;
    for (let j = 0; j < beepLen; j++) {
      const idx = startIdx + j;
      if (idx >= numSamples) break;
      const t = j / sampleRate;
      const envMain = envelope(t, 0.001, 0.045);
      const envChirp = envelope(t, 0.0005, 0.018);

      // Two partials
      const partial1 = Math.sin(2.0 * Math.PI * f0 * t);
      const partial2 = 0.35 * Math.sin(2.0 * Math.PI * f0 * 2.01 * t);
      const beep = (partial1 + partial2) * envMain;

      // Chirp sweep
      const sweepFreq = f0 * 2.5 * Math.exp(-t * 40.0);
      chirpPhase += 2.0 * Math.PI * sweepFreq / sampleRate;
      const chirp = Math.sin(chirpPhase) * envChirp * 0.35;

      const sample = (beep + chirp) * 0.35;

      left[idx] += sample * panL;
      right[idx] += sample * panR;
    }
  });

  // Fade out last 0.2s
  const fadeSamples = Math.floor(0.2 * sampleRate);
  for (let i = 0; i < fadeSamples; i++) {
    const idx = numSamples - fadeSamples + i;
    const gain = 1.0 - (i / fadeSamples);
    left[idx] *= gain;
    right[idx] *= gain;
  }

  // Peak normalization (target -3 dBFS = 0.707)
  let maxPeak = 0.0;
  for (let i = 0; i < numSamples; i++) {
    const al = Math.abs(left[i]);
    const ar = Math.abs(right[i]);
    if (al > maxPeak) maxPeak = al;
    if (ar > maxPeak) maxPeak = ar;
  }

  const normalizer = maxPeak > 0 ? (0.707 / maxPeak) : 1.0;

  // Interleave and quantize to 16-bit PCM
  const pcmBytes = Buffer.alloc(numSamples * 4); // 2 channels * 2 bytes
  for (let i = 0; i < numSamples; i++) {
    let sL = Math.max(-1.0, Math.min(1.0, left[i] * normalizer));
    let sR = Math.max(-1.0, Math.min(1.0, right[i] * normalizer));

    // Soft tanh saturation for analog warmth
    sL = Math.tanh(sL);
    sR = Math.tanh(sR);

    const intL = Math.floor(sL < 0 ? sL * 32768 : sL * 32767);
    const intR = Math.floor(sR < 0 ? sR * 32768 : sR * 32767);

    pcmBytes.writeInt16LE(intL, i * 4);
    pcmBytes.writeInt16LE(intR, i * 4 + 2);
  }

  const wavHeader = buildWavHeader(numSamples, sampleRate);
  return Buffer.concat([wavHeader, pcmBytes]);
}

/**
 * Synthesize and write WAV file directly to disk.
 */
function writeSfxWav(outputPath, options) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const wavBuffer = synthesizeSfx(options);
  fs.writeFileSync(resolved, wavBuffer);
  return {
    outputPath: resolved,
    sizeBytes: wavBuffer.length,
    durationSeconds: options.durationSeconds || 3.0,
    sampleRate: options.sampleRate || SAMPLE_RATE
  };
}

module.exports = {
  SAMPLE_RATE,
  LOCK_NOTES,
  envelope,
  equalPowerPan,
  synthesizeSfx,
  writeSfxWav
};
