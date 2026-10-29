/**
 * Editing Mechanics Engine (EME) - Procedural Cinematic Impact Synthesizer (Phase A4)
 * Synthesizes deep sub-bass drops and cinematic slams with pitch decay and transient punch.
 */

const {
  SAMPLE_RATE,
  createPrng,
  equalPowerPan,
  BiquadFilter,
  encodeStereoWav
} = require('./primitives.js');

/**
 * Synthesizes a cinematic sub-impact sound effect.
 * @param {object} [params]
 * @param {number} [params.durationSeconds=1.2]
 * @param {number} [params.subFreqHz=45] Low-end body frequency
 * @param {number} [params.seed=101] Deterministic PRNG seed
 * @returns {Buffer} 48 kHz 16-bit Stereo PCM WAV
 */
function synthesizeImpact(params = {}) {
  const duration = params.durationSeconds || 1.2;
  const subFreq = params.subFreqHz || 45;
  const numSamples = Math.round(duration * SAMPLE_RATE);
  const prng = createPrng(params.seed || 101);

  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);
  const lowFilter = new BiquadFilter('lowpass', 120, 1.2, SAMPLE_RATE);

  let phase = 0.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // 1. Exponential pitch drop: 160 Hz -> 45 Hz over 0.1s
    const pitchDrop = Math.exp(-t * 22.0);
    const instFreq = subFreq + pitchDrop * 120.0;
    phase += (2 * Math.PI * instFreq) / SAMPLE_RATE;

    // 2. Sub-bass body
    const subBody = Math.sin(phase) * Math.exp(-t * 2.8);

    // 3. Transient noise click for initial punch (first 25ms)
    let click = 0.0;
    if (t < 0.025) {
      const clickEnv = (1.0 - t / 0.025);
      click = (prng() * 2.0 - 1.0) * clickEnv * 0.45;
    }

    // 4. Combined signal with lowpass smoothing on sub
    const raw = subBody * 0.85 + click;
    const filtered = lowFilter.process(raw);

    const [panL, panR] = equalPowerPan(0.0); // Center

    left[i] = filtered * panL;
    right[i] = filtered * panR;
  }

  return encodeStereoWav(left, right, SAMPLE_RATE);
}

module.exports = {
  synthesizeImpact
};
