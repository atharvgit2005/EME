/**
 * Editing Mechanics Engine (EME) - Deterministic Onset Detector
 * Implements adaptive median/std threshold peak picking with refractory suppression and dominant band tagging.
 */

const { sampleToTicks } = require('./audio-ingest.js');

/**
 * Detect onsets from spectral flux envelope.
 * @param {Float32Array} flux Broadband positive spectral flux envelope
 * @param {object} bandFlux { low, mid, high } multi-band flux envelopes
 * @param {number[]} sampleIndices Exact center sample index for each frame
 * @param {object} config Configuration options
 * @returns {Array<{ id: string, sampleIndex: number, ticks: number, strength: number, band: string }>}
 */
function detectOnsets(flux, bandFlux, sampleIndices, config = {}) {
  const numFrames = flux.length;
  if (numFrames < 3) return [];

  const sampleRate = config.sampleRate || 44100;
  const hopLength = config.hopLength || 441;
  const minSepMs = config.minOnsetSeparationMs || 30;
  const minFrameSep = Math.max(1, Math.round((minSepMs * sampleRate) / (1000 * hopLength)));
  const windowRadius = 6; // ~60 ms window around peak
  const delta = config.adaptiveThresholdDelta || 1.25;

  // 1. Check for global silence or weak signal
  let maxFlux = 0;
  let fluxSum = 0;
  for (let i = 0; i < numFrames; i++) {
    const f = flux[i];
    if (f > maxFlux) maxFlux = f;
    fluxSum += f;
  }
  const meanFlux = fluxSum / numFrames;

  if (maxFlux < 1e-4 || meanFlux < 1e-5) {
    // Silence detected - return 0 onsets
    return [];
  }

  const onsets = [];
  let lastOnsetFrame = -minFrameSep - 1;

  for (let m = 1; m < numFrames - 1; m++) {
    const val = flux[m];

    // Must be a local peak
    if (val <= flux[m - 1] || val < flux[m + 1]) continue;

    // Must satisfy refractory period
    if (m - lastOnsetFrame < minFrameSep) continue;

    // Compute local window stats [m - W ... m + W]
    const wStart = Math.max(0, m - windowRadius);
    const wEnd = Math.min(numFrames - 1, m + windowRadius);
    const wLen = wEnd - wStart + 1;

    // Collect values for median & std
    const windowVals = new Float32Array(wLen);
    let wSum = 0;
    for (let j = 0; j < wLen; j++) {
      const v = flux[wStart + j];
      windowVals[j] = v;
      wSum += v;
    }
    windowVals.sort();

    const wMedian = wLen % 2 === 1
      ? windowVals[Math.floor(wLen / 2)]
      : (windowVals[(wLen / 2) - 1] + windowVals[wLen / 2]) * 0.5;

    const wMean = wSum / wLen;
    let varSum = 0;
    for (let j = 0; j < wLen; j++) {
      const diff = windowVals[j] - wMean;
      varSum += diff * diff;
    }
    const wStd = Math.sqrt(varSum / wLen);

    const threshold = wMedian + (delta * wStd);

    if (val > threshold && val > (maxFlux * 0.05)) {
      const sampleIndex = sampleIndices[m] ?? (m * hopLength);
      const ticks = sampleToTicks(sampleIndex, sampleRate);

      // Determine dominant frequency band at this onset
      let dominantBand = 'broadband';
      if (bandFlux) {
        const lVal = bandFlux.low ? bandFlux.low[m] : 0;
        const mVal = bandFlux.mid ? bandFlux.mid[m] : 0;
        const hVal = bandFlux.high ? bandFlux.high[m] : 0;

        if (lVal > mVal && lVal > hVal && lVal > 0.4 * val) dominantBand = 'low';
        else if (hVal > lVal && hVal > mVal && hVal > 0.4 * val) dominantBand = 'high';
        else if (mVal > lVal && mVal > hVal) dominantBand = 'mid';
      }

      onsets.push({
        id: `onset-${onsets.length + 1}`,
        sampleIndex,
        ticks,
        strength: Number((val / maxFlux).toFixed(4)),
        band: dominantBand
      });

      lastOnsetFrame = m;
    }
  }

  return onsets;
}

module.exports = {
  detectOnsets
};
