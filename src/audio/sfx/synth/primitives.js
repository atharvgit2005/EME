/**
 * Editing Mechanics Engine (EME) - Procedural Audio Synthesizer Primitives (Phase A4)
 * Pure JavaScript, zero-dependency, bit-exact 48 kHz 16-bit stereo PCM DSP routines.
 */

const SAMPLE_RATE = 48000;

/**
 * Seeded 32-bit pseudo-random number generator (Mulberry32).
 * Guarantees 100% bit-exact reproducibility across platforms.
 */
function createPrng(seed = 1337) {
  let s = seed >>> 0;
  return function nextFloat() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard 44-byte RIFF WAV Header for 48 kHz 16-bit Stereo PCM.
 * @param {number} numSamples Number of audio samples per channel
 * @param {number} [sampleRate=48000]
 * @returns {Buffer}
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
  buffer.writeUInt32LE(16, 16);          // PCM subchunk size
  buffer.writeUInt16LE(1, 20);           // Audio format 1 = PCM
  buffer.writeUInt16LE(numChannels, 22); // Stereo
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);          // 16 bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/**
 * Equal-power stereo panning.
 * @param {number} pan Position in [-1.0 (left), 1.0 (right)]
 * @returns {[number, number]} [gainLeft, gainRight]
 */
function equalPowerPan(pan) {
  const p = Math.max(-1.0, Math.min(1.0, pan));
  const angle = (p + 1.0) * (Math.PI / 4.0);
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Envelope with linear attack and exponential release.
 * @param {number} t Current time in seconds
 * @param {number} attack Attack duration in seconds
 * @param {number} release Release time constant in seconds
 */
function attackReleaseEnvelope(t, attack, release) {
  const att = Math.max(attack, 0.0001);
  const rel = Math.max(release, 0.0001);
  const rise = Math.min(t / att, 1.0);
  return rise * Math.exp(-t / rel);
}

/**
 * Digital Biquad Filter (Lowpass, Bandpass, Resonant)
 */
class BiquadFilter {
  constructor(type = 'bandpass', freq = 1000, q = 1.0, sampleRate = SAMPLE_RATE) {
    this.type = type;
    this.sampleRate = sampleRate;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.setParams(freq, q);
  }

  setParams(freq, q) {
    const f0 = Math.max(10, Math.min(this.sampleRate * 0.48, freq));
    const Q = Math.max(0.1, q);
    const w0 = (2 * Math.PI * f0) / this.sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);
    const cosw0 = Math.cos(w0);

    let b0, b1, b2, a0, a1, a2;

    if (this.type === 'lowpass') {
      b0 = (1 - cosw0) / 2;
      b1 = 1 - cosw0;
      b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
    } else {
      // Bandpass (constant 0 dB peak gain)
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(sample) {
    const out = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = out;
    return out;
  }
}

/**
 * Encodes Float32Array stereo channels into 16-bit PCM Buffer.
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @returns {Buffer} Standard RIFF WAV Buffer
 */
function encodeStereoWav(left, right, sampleRate = SAMPLE_RATE) {
  const numSamples = left.length;
  const header = buildWavHeader(numSamples, sampleRate);
  const data = Buffer.alloc(numSamples * 4); // 2 channels * 2 bytes

  for (let i = 0; i < numSamples; i++) {
    // Soft-clip limiter to guarantee zero digital wrap-around
    const sL = Math.max(-1.0, Math.min(1.0, Math.tanh(left[i])));
    const sR = Math.max(-1.0, Math.min(1.0, Math.tanh(right[i])));

    const iL = Math.round(sL * 32767);
    const iR = Math.round(sR * 32767);

    data.writeInt16LE(iL, i * 4);
    data.writeInt16LE(iR, i * 4 + 2);
  }

  return Buffer.concat([header, data]);
}

module.exports = {
  SAMPLE_RATE,
  createPrng,
  buildWavHeader,
  equalPowerPan,
  attackReleaseEnvelope,
  BiquadFilter,
  encodeStereoWav
};
