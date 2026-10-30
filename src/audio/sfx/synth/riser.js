/**
 * Editing Mechanics Engine (EME) - Procedural Tension Riser Synthesizer (Phase A4)
 * Synthesizes exponential pitch risers and filter sweeps leading into drops and transitions.
 */

const {
  SAMPLE_RATE, validateSynthParams, finishSynth,
  createPrng,
  equalPowerPan,
  BiquadFilter,
  encodeStereoWav
} = require('./primitives.js');

/**
 * Synthesizes a tension riser sound effect.
 * @param {object} [params]
 * @param {number} [params.durationSeconds=2.0] Duration in seconds
 * @param {number} [params.startFreqHz=120]
 * @param {number} [params.endFreqHz=2400]
 * @param {number} [params.seed=202]
 * @returns {Buffer} 48 kHz 16-bit Stereo PCM WAV
 */
function synthesizeRiser(params = {}) {
  const duration = validateSynthParams(params, 2.0);
  const startFreq = params.startFreqHz || 120;
  const endFreq = params.endFreqHz || 2400;
  const numSamples = Math.round(duration * SAMPLE_RATE);
  const prng = createPrng(params.seed ?? 202);

  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);
  const filter = new BiquadFilter('bandpass', startFreq, 2.0, SAMPLE_RATE);

  const filterR = new BiquadFilter('bandpass', startFreq, 2.0, SAMPLE_RATE);
  let phase1 = 0.0;
  let phase2 = 0.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples; // normalized 0 -> 1

    // Exponential frequency curve
    const freq = startFreq * Math.pow(endFreq / startFreq, Math.pow(t, 1.4));
    phase1 += (2 * Math.PI * freq) / SAMPLE_RATE;
    phase2 += (2 * Math.PI * freq * 1.01) / SAMPLE_RATE; // Detuned stereo pair

    // Sawtooth / harmonic blend
    const tone1 = (phase1 % (2 * Math.PI)) / Math.PI - 1.0;
    const tone2 = (phase2 % (2 * Math.PI)) / Math.PI - 1.0;
    const noise = (prng() * 2.0 - 1.0) * 0.2;

    filter.setParams(freq * 1.2, 1.8);
    filterR.setParams(freq * 1.2, 1.8);
    const filteredL = filter.process(tone1 + noise);
    const filteredR = filterR.process(tone2 + noise);

    // Rising exponential amplitude envelope
    const amp = Math.pow(t, 1.5) * 0.9;

    left[i] = filteredL * amp;
    right[i] = filteredR * amp;
  }

  return finishSynth(left, right);
}

module.exports = {
  synthesizeRiser
};
