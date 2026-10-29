/**
 * Editing Mechanics Engine (EME) - Autocorrelation Tempo & Phase Estimator
 * Computes multi-hypothesis tempo scoring, half/double-time ambiguity detection, and independent phase alignment.
 */

const { sampleToTicks } = require('./audio-ingest.js');

/**
 * Estimates tempo hypotheses and phase offset from spectral flux envelope.
 * @param {Float32Array} flux Broadband positive spectral flux envelope
 * @param {object} config Configuration options
 * @returns {{ bpm: number, confidence: number, alternativesBpm: number[], isAmbiguous: boolean, phaseOffsetSamples: number, phaseOffsetTicks: number, lagFrames: number }}
 */
function estimateTempo(flux, config = {}) {
  const numFrames = flux.length;
  const sampleRate = config.sampleRate || 44100;
  const hopLength = config.hopLength || 441;
  const frameRate = sampleRate / hopLength; // e.g. 100 fps

  const minBpm = config.tempoMinBpm || 40;
  const maxBpm = config.tempoMaxBpm || 240;

  // Lags corresponding to [minBpm, maxBpm]
  const minLag = Math.max(1, Math.floor((60.0 * frameRate) / maxBpm));
  const maxLag = Math.min(numFrames - 2, Math.ceil((60.0 * frameRate) / minBpm));

  if (numFrames < maxLag * 2 || minLag >= maxLag) {
    // Insufficient frames to evaluate tempo
    return {
      bpm: 0,
      confidence: 0,
      alternativesBpm: [],
      isAmbiguous: false,
      phaseOffsetSamples: 0,
      phaseOffsetTicks: 0,
      lagFrames: 0
    };
  }

  // 1. Mean-centered onset autocorrelation
  let fluxSum = 0;
  for (let i = 0; i < numFrames; i++) fluxSum += flux[i];
  const meanFlux = fluxSum / numFrames;

  // Check for silence or flat envelope
  let fluxVar = 0;
  for (let i = 0; i < numFrames; i++) {
    const diff = flux[i] - meanFlux;
    fluxVar += diff * diff;
  }
  if (fluxVar < 1e-6) {
    return {
      bpm: 0,
      confidence: 0,
      alternativesBpm: [],
      isAmbiguous: false,
      phaseOffsetSamples: 0,
      phaseOffsetTicks: 0,
      lagFrames: 0
    };
  }

  const autocorr = new Float32Array(maxLag + 2);
  const startTau = Math.max(0, minLag - 1);
  const endTau = Math.min(numFrames - 1, maxLag + 1);

  for (let tau = startTau; tau <= endTau; tau++) {
    let sum = 0;
    const limit = numFrames - tau;
    for (let m = 0; m < limit; m++) {
      sum += (flux[m] - meanFlux) * (flux[m + tau] - meanFlux);
    }
    // Normalization by overlap count
    autocorr[tau] = limit > 0 ? sum / limit : 0;
  }

  // 2. Find local peaks in autocorrelation curve within [minLag, maxLag]
  const rawPeaks = [];
  for (let tau = minLag; tau <= maxLag; tau++) {
    const val = autocorr[tau];
    if (val > 0 && val >= autocorr[tau - 1] && val >= autocorr[tau + 1]) {
      const y1 = autocorr[tau - 1];
      const y2 = val;
      const y3 = autocorr[tau + 1];

      // Gaussian or parabolic peak refinement
      let delta = 0;
      if (y1 > 0 && y2 > 0 && y3 > 0) {
        const l1 = Math.log(y1);
        const l2 = Math.log(y2);
        const l3 = Math.log(y3);
        const denom = 2 * (l1 - 2 * l2 + l3);
        if (Math.abs(denom) > 1e-9) {
          delta = (l1 - l3) / denom;
        }
      } else {
        const denom = 2 * (y1 - 2 * y2 + y3);
        if (Math.abs(denom) > 1e-9) {
          delta = (y1 - y3) / denom;
        }
      }
      if (Math.abs(delta) > 0.5) delta = 0;

      const refinedLag = tau + delta;
      const bpm = (60.0 * frameRate) / refinedLag;
      rawPeaks.push({ lag: tau, refinedLag, val, bpm });
    }
  }

  if (rawPeaks.length === 0) {
    return {
      bpm: 0,
      confidence: 0,
      alternativesBpm: [],
      isAmbiguous: false,
      phaseOffsetSamples: 0,
      phaseOffsetTicks: 0,
      lagFrames: 0
    };
  }

  // 3. Fundamental vs harmonic penalty
  // If peak P is an integer multiple k of a smaller fundamental lag Q with comparable raw correlation,
  // penalize the subharmonic P (slower tempo) in favor of fundamental Q (faster tempo).
  const scoredPeaks = rawPeaks.map(p => {
    let score = p.val;
    const isMultipleOfSmaller = rawPeaks.some(other => {
      if (other.lag >= p.lag - 2) return false;
      const k = Math.round(p.lag / other.lag);
      if (k >= 2 && k <= 5) {
        const expectedLag = other.lag * k;
        const minRatio = k === 2 ? 0.55 : 0.70;
        if (Math.abs(p.lag - expectedLag) <= 2 && other.val >= minRatio * p.val) {
          return true;
        }
      }
      return false;
    });

    if (isMultipleOfSmaller) {
      score *= 0.6;
    }
    return { ...p, score };
  });

  scoredPeaks.sort((a, b) => b.score - a.score);

  // Filter distinct candidate tempos (avoid duplicates within +/- 3 BPM)
  const distinctCandidates = [];
  for (const p of scoredPeaks) {
    const isNearby = distinctCandidates.some(c => Math.abs(c.bpm - p.bpm) < 3.0);
    if (!isNearby) {
      distinctCandidates.push(p);
      if (distinctCandidates.length >= 3) break;
    }
  }

  const primary = distinctCandidates[0];
  const secondary = distinctCandidates[1] || null;
  const tertiary = distinctCandidates[2] || null;

  // 4. Half-time / Double-time Ambiguity Detection
  let isAmbiguous = false;
  if (secondary) {
    const ratio = secondary.bpm / primary.bpm;
    const isHarmonic = Math.abs(ratio - 2.0) < 0.1 || Math.abs(ratio - 0.5) < 0.05 || Math.abs(ratio - 3.0) < 0.15 || Math.abs(ratio - 0.333) < 0.05;
    const rawRatio = Math.min(primary.val, secondary.val) / Math.max(primary.val, secondary.val);
    const scoreRatio = secondary.score / primary.score;

    if (isHarmonic && rawRatio > 0.85) {
      isAmbiguous = true;
    } else if (scoreRatio > 0.85) {
      isAmbiguous = true;
    }
  }

  // 5. Calculate Confidence
  let confidence = 0.5;
  if (secondary) {
    const separation = (primary.score - secondary.score) / primary.score;
    confidence = Math.max(0.1, Math.min(0.99, Number((0.5 + separation * 0.5).toFixed(3))));
  } else {
    confidence = 0.95;
  }

  // 6. Estimate Phase Offset independently of tempo
  const lag = primary.lag;
  const refinedLag = primary.refinedLag || lag;
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;

  for (let phi = 0; phi < lag; phi++) {
    let score = 0;
    let count = 0;
    let n = 0;
    while (true) {
      const f = Math.round(phi + n * refinedLag);
      if (f >= numFrames) break;
      score += flux[f];
      count++;
      n++;
    }
    const avgScore = count > 0 ? score / count : 0;
    if (avgScore > bestPhaseScore) {
      bestPhaseScore = avgScore;
      bestPhase = phi;
    }
  }

  const fftCenter = Math.round((config.fftSize || 2048) / 2);
  const phaseOffsetSamples = bestPhase * hopLength + fftCenter;
  const phaseOffsetTicks = sampleToTicks(phaseOffsetSamples, sampleRate);

  const alternatives = [];
  if (secondary) alternatives.push(Number(secondary.bpm.toFixed(2)));
  if (tertiary) alternatives.push(Number(tertiary.bpm.toFixed(2)));

  return {
    bpm: Number(primary.bpm.toFixed(2)),
    confidence,
    alternativesBpm: alternatives,
    isAmbiguous,
    phaseOffsetSamples,
    phaseOffsetTicks,
    lagFrames: lag
  };
}

module.exports = {
  estimateTempo
};
