/**
 * Editing Mechanics Engine (EME) - Positive Spectral Flux & Multi-Band Energy
 * Implements exact log1p positive spectral flux excluding DC bin and multi-band decomposition.
 */

/**
 * Computes broadband and multi-band positive spectral flux.
 * @param {Float32Array[]} logMagnitudes Log-magnitude STFT frames [numFrames][numBins]
 * @param {object} options { fftSize, sampleRate, sampleIndices }
 * @returns {{ broadbandFlux: Float32Array, bandFlux: { low: Float32Array, mid: Float32Array, high: Float32Array }, sampleIndices: number[] }}
 */
function computeSpectralFlux(logMagnitudes, options = {}) {
  const numFrames = logMagnitudes.length;
  if (numFrames === 0) {
    return {
      broadbandFlux: new Float32Array(0),
      bandFlux: {
        low: new Float32Array(0),
        mid: new Float32Array(0),
        high: new Float32Array(0)
      },
      sampleIndices: []
    };
  }

  const numBins = logMagnitudes[0].length;
  const fftSize = options.fftSize || 2048;
  const sampleRate = options.sampleRate || 44100;
  const sampleIndices = options.sampleIndices || [];

  // Bin frequency conversion: f = k * sampleRate / fftSize
  const hzToBin = (hz) => Math.min(numBins - 1, Math.max(1, Math.round((hz * fftSize) / sampleRate)));

  const kLowStart = hzToBin(20);
  const kLowEnd = hzToBin(120);

  const kMidStart = hzToBin(120);
  const kMidEnd = hzToBin(2000);

  const kHighStart = hzToBin(2000);
  const kHighEnd = hzToBin(16000);

  const broadbandFlux = new Float32Array(numFrames);
  const lowFlux = new Float32Array(numFrames);
  const midFlux = new Float32Array(numFrames);
  const highFlux = new Float32Array(numFrames);

  // Frame 0: comparison against zero baseline
  for (let k = 1; k < numBins; k++) {
    const diff = Math.max(0, logMagnitudes[0][k]);
    broadbandFlux[0] += diff;

    if (k >= kLowStart && k <= kLowEnd) lowFlux[0] += diff;
    if (k >= kMidStart && k <= kMidEnd) midFlux[0] += diff;
    if (k >= kHighStart && k <= kHighEnd) highFlux[0] += diff;
  }

  // Frames 1 ... numFrames - 1
  for (let m = 1; m < numFrames; m++) {
    const curr = logMagnitudes[m];
    const prev = logMagnitudes[m - 1];

    let bSum = 0;
    let lSum = 0;
    let mSum = 0;
    let hSum = 0;

    for (let k = 1; k < numBins; k++) {
      const diff = curr[k] - prev[k];
      if (diff > 0) {
        bSum += diff;
        if (k >= kLowStart && k <= kLowEnd) lSum += diff;
        if (k >= kMidStart && k <= kMidEnd) mSum += diff;
        if (k >= kHighStart && k <= kHighEnd) hSum += diff;
      }
    }

    broadbandFlux[m] = bSum;
    lowFlux[m] = lSum;
    midFlux[m] = mSum;
    highFlux[m] = hSum;
  }

  return {
    broadbandFlux,
    bandFlux: {
      low: lowFlux,
      mid: midFlux,
      high: highFlux
    },
    sampleIndices
  };
}

module.exports = {
  computeSpectralFlux
};
