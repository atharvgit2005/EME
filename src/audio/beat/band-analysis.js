/**
 * Editing Mechanics Engine (EME) - Multi-Band Audio Decomposition (Phase A2)
 * Extracts 5 frequency bands: sub, low_mid, mid, high_mid, high.
 */

const { sampleToTicks } = require('./audio-ingest.js');

const FREQUENCY_BANDS = {
  sub: { minHz: 20, maxHz: 120, label: 'Sub-bass / 808' },
  low_mid: { minHz: 120, maxHz: 500, label: 'Kick body & bass' },
  mid: { minHz: 500, maxHz: 2000, label: 'Vocal & snare body' },
  high_mid: { minHz: 2000, maxHz: 8000, label: 'Snare snap & claps' },
  high: { minHz: 8000, maxHz: 16000, label: 'Hi-hats & air' }
};

/**
 * Computes multi-band energy trajectories from STFT log magnitudes.
 * @param {Array<Float32Array>} logMagnitudes STFT frames
 * @param {Int32Array} sampleIndices Sample index for each STFT frame
 * @param {object} config { fftSize, sampleRate }
 * @returns {{
 *   curves: { sub: Float32Array, low_mid: Float32Array, mid: Float32Array, high_mid: Float32Array, high: Float32Array },
 *   sampleIndices: Int32Array,
 *   tickIndices: Int32Array,
 *   bandPeaks: object
 * }}
 */
function analyzeFrequencyBands(logMagnitudes, sampleIndices, config = {}) {
  const numFrames = logMagnitudes.length;
  const fftSize = config.fftSize || 2048;
  const sampleRate = config.sampleRate || 44100;
  const numBins = (fftSize >> 1) + 1;
  const binHz = sampleRate / fftSize;

  const curves = {
    sub: new Float32Array(numFrames),
    low_mid: new Float32Array(numFrames),
    mid: new Float32Array(numFrames),
    high_mid: new Float32Array(numFrames),
    high: new Float32Array(numFrames)
  };

  const tickIndices = new Int32Array(numFrames);
  for (let m = 0; m < numFrames; m++) {
    tickIndices[m] = sampleToTicks(sampleIndices[m], sampleRate);
  }

  // Pre-calculate bin ranges for each band
  const binRanges = {};
  for (const [key, b] of Object.entries(FREQUENCY_BANDS)) {
    const startBin = Math.max(0, Math.min(numBins - 1, Math.floor(b.minHz / binHz)));
    const endBin = Math.max(startBin, Math.min(numBins - 1, Math.ceil(b.maxHz / binHz)));
    binRanges[key] = { startBin, endBin, count: Math.max(1, endBin - startBin + 1) };
  }

  // Accumulate band energies per frame
  for (let m = 0; m < numFrames; m++) {
    const frame = logMagnitudes[m];
    for (const [key, range] of Object.entries(binRanges)) {
      let sum = 0.0;
      for (let k = range.startBin; k <= range.endBin; k++) {
        sum += frame[k];
      }
      curves[key][m] = sum / range.count;
    }
  }

  // Find max peak and timestamps for each band
  const bandPeaks = {};
  for (const [key, curve] of Object.entries(curves)) {
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let m = 0; m < numFrames; m++) {
      if (curve[m] > maxVal) {
        maxVal = curve[m];
        maxIdx = m;
      }
    }
    bandPeaks[key] = {
      peakValue: Number(maxVal.toFixed(4)),
      frameIndex: maxIdx,
      sampleIndex: sampleIndices[maxIdx],
      ticks: tickIndices[maxIdx]
    };
  }

  return {
    curves,
    sampleIndices,
    tickIndices,
    bandPeaks
  };
}

module.exports = {
  FREQUENCY_BANDS,
  analyzeFrequencyBands
};
