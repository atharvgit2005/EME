/**
 * Editing Mechanics Engine (EME) - Multi-Layer Audio Mixer & QA (Phase A4)
 * Multi-track layer compositing, sample-accurate cue placement, true-peak limiting, and QA metrics.
 */

const {
  SAMPLE_RATE,
  equalPowerPan,
  encodeStereoWav
} = require('./synth/primitives.js');

/**
 * Mixes multiple audio cue layers into a master stereo PCM buffer.
 * @param {Array<{ pcm: Float32Array, startSample: number, gain?: number, pan?: number }>} layers
 * @param {number} totalSamples Master duration in samples
 * @param {object} [options]
 * @returns {{ masterWav: Buffer, left: Float32Array, right: Float32Array, metrics: object }}
 */
function mixAudioLayers(layers, totalSamples, options = {}) {
  const sampleRate = options.sampleRate || SAMPLE_RATE;
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  for (const layer of layers) {
    const pcm = layer.pcm;
    const start = layer.startSample || 0;
    const gain = layer.gain !== undefined ? layer.gain : 1.0;
    const pan = layer.pan !== undefined ? layer.pan : 0.0;
    const [panL, panR] = equalPowerPan(pan);

    const layerLen = pcm.length;
    const end = Math.min(totalSamples, start + layerLen);

    for (let s = start; s < end; s++) {
      const srcIdx = s - start;
      const sampleVal = pcm[srcIdx] * gain;
      left[s] += sampleVal * panL;
      right[s] += sampleVal * panR;
    }
  }

  // Measure metrics before limiting
  const rawMetrics = measureMetrics(left, right);

  // Apply master limiter (ceiling: -1.0 dBFS = 0.891 linear)
  const ceiling = 0.891;
  const maxPeak = Math.max(rawMetrics.peakLeft, rawMetrics.peakRight);
  const masterGain = maxPeak > ceiling ? ceiling / maxPeak : 1.0;

  for (let s = 0; s < totalSamples; s++) {
    left[s] = Math.tanh(left[s] * masterGain);
    right[s] = Math.tanh(right[s] * masterGain);
  }

  const finalMetrics = measureMetrics(left, right);
  const masterWav = encodeStereoWav(left, right, sampleRate);

  return {
    masterWav,
    left,
    right,
    metrics: {
      rawPeakDb: rawMetrics.peakDb,
      finalPeakDb: finalMetrics.peakDb,
      rawClippedSamples: rawMetrics.clippedCount,
      clippedSamples: finalMetrics.clippedCount,
      integratedRms: finalMetrics.rmsAvg,
      passedQa: finalMetrics.peakDb <= -0.9
    }
  };
}

function measureMetrics(left, right) {
  let maxL = 0.0;
  let maxR = 0.0;
  let sumSqL = 0.0;
  let sumSqR = 0.0;
  let clipped = 0;

  const len = left.length;
  for (let i = 0; i < len; i++) {
    const absL = Math.abs(left[i]);
    const absR = Math.abs(right[i]);
    if (absL > maxL) maxL = absL;
    if (absR > maxR) maxR = absR;
    sumSqL += left[i] * left[i];
    sumSqR += right[i] * right[i];
    if (absL >= 1.0 || absR >= 1.0) clipped++;
  }

  const peak = Math.max(maxL, maxR, 1e-9);
  const peakDb = Number((20 * Math.log10(peak)).toFixed(2));
  const rmsL = Math.sqrt(sumSqL / Math.max(1, len));
  const rmsR = Math.sqrt(sumSqR / Math.max(1, len));

  return {
    peakLeft: maxL,
    peakRight: maxR,
    peakDb,
    rmsAvg: Number(((rmsL + rmsR) * 0.5).toFixed(4)),
    clippedCount: clipped
  };
}

module.exports = {
  mixAudioLayers,
  measureMetrics
};
