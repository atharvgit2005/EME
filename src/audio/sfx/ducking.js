/**
 * Editing Mechanics Engine (EME) - Dialogue-Aware Sidechain Ducking (Phase A4)
 * Lookahead sidechain compression ducking background music & SFX during active speech.
 */

/**
 * Applies dialogue-aware ducking to a background audio track based on a voice reference.
 * @param {Float32Array} backgroundPcm Background music or SFX track
 * @param {Float32Array} voicePcm Dialogue or voiceover track
 * @param {object} [options]
 * @param {number} [options.sampleRate=48000]
 * @param {number} [options.thresholdDb=-24] Voice activation threshold in dBFS
 * @param {number} [options.duckingGainDb=-9] Gain reduction during speech in dB
 * @param {number} [options.attackMs=50] Attack smoothing in ms
 * @param {number} [options.releaseMs=250] Release recovery smoothing in ms
 * @returns {{ duckedPcm: Float32Array, gainCurve: Float32Array }}
 */
function applyDialogueDucking(backgroundPcm, voicePcm, options = {}) {
  const sampleRate = options.sampleRate || 48000;
  const numSamples = backgroundPcm.length;
  const duckedPcm = new Float32Array(numSamples);
  const gainCurve = new Float32Array(numSamples);

  const thresholdLinear = Math.pow(10, (options.thresholdDb || -24) / 20);
  const duckingGainLinear = Math.pow(10, (options.duckingGainDb || -9) / 20);

  // Filter smoothing coefficients
  const attackSamples = Math.max(1, Math.round(((options.attackMs || 50) / 1000) * sampleRate));
  const releaseSamples = Math.max(1, Math.round(((options.releaseMs || 250) / 1000) * sampleRate));
  const attackCoeff = 1.0 / attackSamples;
  const releaseCoeff = 1.0 / releaseSamples;

  // Windowed voice envelope detection (10ms window)
  const windowSize = Math.round(sampleRate * 0.01);
  let currentGain = 1.0;

  for (let i = 0; i < numSamples; i++) {
    // 1. Measure voice RMS in surrounding window
    let sumSq = 0.0;
    const start = Math.max(0, i - (windowSize >> 1));
    const end = Math.min(voicePcm.length, i + (windowSize >> 1));
    const count = end - start;

    if (count > 0 && i < voicePcm.length) {
      for (let s = start; s < end; s++) {
        const v = voicePcm[s];
        sumSq += v * v;
      }
    }
    const voiceRms = count > 0 ? Math.sqrt(sumSq / count) : 0.0;

    // 2. Target gain based on threshold
    const targetGain = voiceRms > thresholdLinear ? duckingGainLinear : 1.0;

    // 3. Smooth envelope follower
    if (targetGain < currentGain) {
      currentGain -= (currentGain - targetGain) * attackCoeff;
    } else {
      currentGain += (targetGain - currentGain) * releaseCoeff;
    }

    gainCurve[i] = currentGain;
    duckedPcm[i] = backgroundPcm[i] * currentGain;
  }

  return {
    duckedPcm,
    gainCurve
  };
}

module.exports = {
  applyDialogueDucking
};
