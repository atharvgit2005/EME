/**
 * Editing Mechanics Engine (EME) - Procedural Whoosh & Swish Generator (Phase A4)
 * Synthesizes dynamic transitional whooshes with resonant filter sweep and spatial panning.
 */

const {
  SAMPLE_RATE, validateSynthParams, finishSynth,
  createPrng,
  equalPowerPan,
  BiquadFilter,
  encodeStereoWav
} = require('./primitives.js');

/**
 * Synthesizes a directional whoosh sound effect.
 * @param {object} [params]
 * @param {number} [params.durationSeconds=0.6] Duration in seconds
 * @param {number} [params.panDirection=1] 1 = Left-to-Right, -1 = Right-to-Left, 0 = Center
 * @param {number} [params.seed=42] Deterministic PRNG seed
 * @returns {Buffer} 48 kHz 16-bit Stereo PCM WAV
 */
function synthesizeWhoosh(params = {}) {
  const duration = validateSynthParams(params, 0.6);
  const panDir = params.panDirection !== undefined ? params.panDirection : 1;
  const numSamples = Math.round(duration * SAMPLE_RATE);
  const prng = createPrng(params.seed ?? 42);

  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);
  const filter = new BiquadFilter('bandpass', 400, 2.5, SAMPLE_RATE);

  // Pink noise generator state
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples; // normalized 0 -> 1

    // 1. Generate Pink Noise (Paul Kellet's filter)
    const white = prng() * 2.0 - 1.0;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    // 2. Frequency sweep: parabolic curve rising to peak at t=0.5 then dropping
    const sweepProgress = Math.sin(t * Math.PI);
    const centerFreq = 300 + sweepProgress * 2400; // 300Hz -> 2700Hz -> 300Hz
    filter.setParams(centerFreq, 2.2);

    const filtered = filter.process(pink);

    // 3. Amplitude envelope: smooth bell curve
    const amp = Math.pow(Math.sin(t * Math.PI), 1.8) * 1.8;

    // 4. Stereo panning sweep: -panDir -> +panDir
    const currentPan = (t * 2.0 - 1.0) * panDir;
    const [panL, panR] = equalPowerPan(currentPan);

    left[i] = filtered * amp * panL;
    right[i] = filtered * amp * panR;
  }

  return finishSynth(left, right);
}

module.exports = {
  synthesizeWhoosh
};
