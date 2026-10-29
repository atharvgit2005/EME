/**
 * Editing Mechanics Engine (EME) - Procedural Glitch & Click Synthesizer (Phase A4)
 * Synthesizes transient clicks, keystroke taps, and pentatonic lock-on chirps.
 */

const {
  SAMPLE_RATE,
  createPrng,
  equalPowerPan,
  BiquadFilter,
  encodeStereoWav
} = require('./primitives.js');

/**
 * Synthesizes a micro-glitch or transient click.
 * @param {object} [params]
 * @param {'click'|'glitch'|'beep'} [params.type='click']
 * @param {number} [params.durationSeconds=0.08]
 * @param {number} [params.seed=303]
 * @returns {Buffer} 48 kHz 16-bit Stereo PCM WAV
 */
function synthesizeGlitch(params = {}) {
  const type = params.type || 'click';
  const duration = params.durationSeconds || (type === 'click' ? 0.04 : 0.08);
  const numSamples = Math.round(duration * SAMPLE_RATE);
  const prng = createPrng(params.seed || 303);

  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);
  const filter = new BiquadFilter('bandpass', 2400, 3.0, SAMPLE_RATE);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let signal = 0.0;

    if (type === 'beep') {
      // 1760 Hz (A6) pure sine beep with fast exponential decay
      signal = Math.sin(2 * Math.PI * 1760.0 * t) * Math.exp(-t * 35.0);
    } else if (type === 'glitch') {
      // Frequency-modulated chirped pulse + burst noise
      const chirpFreq = 4200.0 - t * 35000.0;
      const chirp = Math.sin(2 * Math.PI * Math.max(100, chirpFreq) * t);
      const noise = (prng() * 2.0 - 1.0) * 0.4;
      signal = (chirp + noise) * Math.exp(-t * 40.0);
    } else {
      // 'click': band-limited single transient impulse
      const noise = prng() * 2.0 - 1.0;
      signal = filter.process(noise) * Math.exp(-t * 90.0) * 1.5;
    }

    const [panL, panR] = equalPowerPan(0.0);
    left[i] = signal * panL;
    right[i] = signal * panR;
  }

  return encodeStereoWav(left, right, SAMPLE_RATE);
}

module.exports = {
  synthesizeGlitch
};
