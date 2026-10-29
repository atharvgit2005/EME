/**
 * Editing Mechanics Engine (EME) - Musical Downbeat & Meter Estimator (Phase A2)
 * Deterministically estimates downbeats, bar-phase alignment, and time signature hypotheses.
 * Conforms to eme-musical-structure.v1 sidecar contract.
 */

const { sampleToTicks } = require('./audio-ingest.js');

/**
 * Helper: Find spectral flux value closest to sampleIndex in sorted sampleIndices array.
 */
function getFluxNear(sampleIdx, fluxArray, sampleIndices, windowSamples = 1500) {
  if (!fluxArray || fluxArray.length === 0 || !sampleIndices || sampleIndices.length === 0) {
    return 0.0;
  }
  let maxVal = 0.0;
  for (let i = 0; i < sampleIndices.length; i++) {
    const dist = Math.abs(sampleIndices[i] - sampleIdx);
    if (dist <= windowSamples) {
      if (fluxArray[i] > maxVal) maxVal = fluxArray[i];
    } else if (sampleIndices[i] > sampleIdx + windowSamples) {
      break;
    }
  }
  return maxVal;
}

/**
 * Estimates bar phase, meter (4/4, 3/4, unsupported 6/8, or unknown), and bar indexing.
 *
 * @param {Array<{ id: string, sampleIndex: number, ticks: number, strength: number }>} beats
 * @param {object} bandFlux { low: Float32Array, mid: Float32Array, high: Float32Array }
 * @param {Int32Array} sampleIndices STFT sample indices corresponding to flux frames
 * @param {object} [config] Configuration parameters
 * @returns {{
 *   meter: {
 *     classification: '4/4'|'3/4'|'unsupported'|'unknown',
 *     numerator: number|null,
 *     denominator: number|null,
 *     confidence: number,
 *     isAmbiguous: boolean,
 *     phaseOffsetBeats: number,
 *     reasons: string[]
 *   },
 *   downbeats: Array<{ id: string, barIndex: number, ticks: number, sampleIndex: number, confidence: number }>,
 *   bars: Array<{ barIndex: number, startTicks: number, endTicks: number, downbeatTicks: number, beatsCount: number, confidence: number }>,
 *   ambiguity: { hasHighAmbiguity: boolean, isSparse: boolean, isRubato: boolean, notes: string[] }
 * }}
 */
function estimateDownbeats(beats, bandFlux, sampleIndices, config = {}) {
  const sampleRate = config.sampleRate || 44100;
  const numBeats = beats ? beats.length : 0;

  // 1. Edge Case: Insufficient beats or silence
  if (numBeats === 0) {
    return {
      meter: {
        classification: 'unknown',
        numerator: null,
        denominator: null,
        confidence: 0.0,
        isAmbiguous: true,
        phaseOffsetBeats: 0,
        reasons: ['No beats detected in audio input']
      },
      downbeats: [],
      bars: [],
      ambiguity: {
        hasHighAmbiguity: true,
        isSparse: true,
        isRubato: false,
        notes: ['Insufficient audio content or silent input']
      }
    };
  }

  if (numBeats < 4) {
    // Insufficient beats to establish meter or bar phase with certainty
    const downbeats = beats.map((b, idx) => ({
      id: `downbeat-${idx + 1}`,
      barIndex: idx,
      ticks: b.ticks,
      sampleIndex: b.sampleIndex,
      confidence: Number(((b.strength || 0.5) * 0.4).toFixed(3))
    }));

    return {
      meter: {
        classification: 'unknown',
        numerator: 4,
        denominator: 4,
        confidence: 0.35,
        isAmbiguous: true,
        phaseOffsetBeats: 0,
        reasons: ['Insufficient beat count (< 4 beats) to establish meter hypothesis']
      },
      downbeats,
      bars: [],
      ambiguity: {
        hasHighAmbiguity: true,
        isSparse: true,
        isRubato: false,
        notes: ['Very short audio snippet (< 4 beats)']
      }
    };
  }

  // 2. Extract beat features with multi-band spectral decomposition
  const broadbandFlux = config.broadbandFlux || null;
  const maxLow = Math.max(...beats.map(b => bandFlux?.low ? getFluxNear(b.sampleIndex, bandFlux.low, sampleIndices) : 0), 1e-6);
  const maxMid = Math.max(...beats.map(b => bandFlux?.mid ? getFluxNear(b.sampleIndex, bandFlux.mid, sampleIndices) : 0), 1e-6);
  const maxBroad = Math.max(...beats.map(b => broadbandFlux ? getFluxNear(b.sampleIndex, broadbandFlux, sampleIndices) : 0), 1e-6);

  const beatFeatures = beats.map((b, idx) => {
    const rawLow = bandFlux?.low ? getFluxNear(b.sampleIndex, bandFlux.low, sampleIndices) : 0.0;
    const rawMid = bandFlux?.mid ? getFluxNear(b.sampleIndex, bandFlux.mid, sampleIndices) : 0.0;
    const rawHigh = bandFlux?.high ? getFluxNear(b.sampleIndex, bandFlux.high, sampleIndices) : 0.0;
    const rawBroad = broadbandFlux ? getFluxNear(b.sampleIndex, broadbandFlux, sampleIndices) : 0.0;
    const strength = b.strength || 0.5;

    const lowEnergy = rawLow / maxLow;
    const midEnergy = rawMid / maxMid;
    const broadEnergy = rawBroad / maxBroad;

    // A downbeat has bass kick + harmonic broadband energy
    // A snare has negligible bass (lowEnergy < 0.35) and high mid energy
    const isSnare = lowEnergy < 0.35 && midEnergy > 0.50;
    const downbeatScore = isSnare ? 0.05 : (lowEnergy * 1.5 + broadEnergy * 1.0);
    const bassProminence = rawLow > 0 ? (rawLow / (rawMid + 0.01)) : 0.0;

    return {
      index: idx,
      sampleIndex: b.sampleIndex,
      ticks: b.ticks,
      lowEnergy,
      midEnergy,
      highEnergy: rawHigh,
      bassProminence,
      strength,
      downbeatScore: Math.max(0, downbeatScore)
    };
  });

  // Calculate variability/ambiguity
  const scores = beatFeatures.map(f => f.downbeatScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const scoreVariance = scores.reduce((a, b) => a + Math.pow(b - avgScore, 2), 0) / scores.length;
  const onsetsCount = config.onsets ? config.onsets.length : (avgScore > 0.05 ? 10 : 0);

  let isUniformEnergy = false;
  if (broadbandFlux && broadbandFlux.length > 0) {
    let bSum = 0;
    for (let i = 0; i < broadbandFlux.length; i++) bSum += broadbandFlux[i];
    const bMean = bSum / broadbandFlux.length;
    let bVar = 0;
    for (let i = 0; i < broadbandFlux.length; i++) bVar += (broadbandFlux[i] - bMean) * (broadbandFlux[i] - bMean);
    bVar /= broadbandFlux.length;
    const coeffVar = Math.sqrt(bVar) / (bMean + 1e-6);
    if (coeffVar < 0.40 || bMean < 1.0) {
      isUniformEnergy = true;
    }
  } else if ((maxLow < 0.05) || (scoreVariance < 0.005 && avgScore < 0.20) || onsetsCount === 0) {
    isUniformEnergy = true;
  }

  // 3. Evaluate 4/4 meter hypotheses across phase offsets p in [0, 3]
  const scores44 = [0.0, 0.0, 0.0, 0.0];
  const count44 = [0, 0, 0, 0];
  for (let i = 0; i < beatFeatures.length; i++) {
    const phase = i % 4;
    scores44[phase] += beatFeatures[i].downbeatScore;
    count44[phase]++;
  }
  for (let p = 0; p < 4; p++) {
    if (count44[p] > 0) scores44[p] /= count44[p];
  }

  let bestPhase44 = 0;
  let maxScore44 = -1;
  let secondScore44 = -1;
  for (let p = 0; p < 4; p++) {
    if (scores44[p] > maxScore44) {
      secondScore44 = maxScore44;
      maxScore44 = scores44[p];
      bestPhase44 = p;
    } else if (scores44[p] > secondScore44) {
      secondScore44 = scores44[p];
    }
  }

  // In 4/4 meter, phase p and phase (p + 2) % 4 are both kick beats (Beat 1 and Beat 3).
  // If their scores are comparable (within 15%), the earlier phase is the true bar downbeat (Beat 1).
  const oppositePhase44 = (bestPhase44 + 2) % 4;
  if (scores44[oppositePhase44] > 0 && Math.abs(scores44[bestPhase44] - scores44[oppositePhase44]) / Math.max(scores44[bestPhase44], scores44[oppositePhase44]) < 0.15) {
    bestPhase44 = Math.min(bestPhase44, oppositePhase44);
  }

  // 4. Evaluate 3/4 meter hypotheses across phase offsets p in [0, 2]
  const scores34 = [0.0, 0.0, 0.0];
  const count34 = [0, 0, 0];
  for (let i = 0; i < beatFeatures.length; i++) {
    const phase = i % 3;
    scores34[phase] += beatFeatures[i].downbeatScore;
    count34[phase]++;
  }
  for (let p = 0; p < 3; p++) {
    if (count34[p] > 0) scores34[p] /= count34[p];
  }

  let bestPhase34 = 0;
  let maxScore34 = -1;
  let secondScore34 = -1;
  for (let p = 0; p < 3; p++) {
    if (scores34[p] > maxScore34) {
      secondScore34 = maxScore34;
      maxScore34 = scores34[p];
      bestPhase34 = p;
    } else if (scores34[p] > secondScore34) {
      secondScore34 = scores34[p];
    }
  }

  // 5. Evaluate 6/8 compound meter vs 3/4 waltz:
  // In 3/4 waltz: beat 0 and beat 3 are both bar downbeats with bass kicks.
  // In 6/8: beat 0 is kick (bass), beat 3 is snare (mid-range accent without sub-bass).
  let lowPhase0 = 0, lowPhase3 = 0, midPhase3 = 0, countP0 = 0, countP3 = 0;
  for (let i = 0; i < beatFeatures.length; i++) {
    if (i % 6 === 0) { lowPhase0 += beatFeatures[i].lowEnergy; countP0++; }
    if (i % 6 === 3) {
      lowPhase3 += beatFeatures[i].lowEnergy;
      midPhase3 += beatFeatures[i].midEnergy;
      countP3++;
    }
  }
  const avgLow0 = countP0 > 0 ? lowPhase0 / countP0 : 0;
  const avgLow3 = countP3 > 0 ? lowPhase3 / countP3 : 0;
  const avgMid3 = countP3 > 0 ? midPhase3 / countP3 : 0;
  const bassRatio3to0 = avgLow0 > 0 ? avgLow3 / avgLow0 : 1;
  const isCompound68 = (maxScore34 > maxScore44 * 1.05) && (avgLow0 > 0.2) && (bassRatio3to0 < 0.72 || avgMid3 > avgLow3 * 1.8);
  const isWaltz34 = (maxScore34 > maxScore44 * 1.05) && !isCompound68;

  // 6. Classification Decision Logic
  let classification = '4/4';
  let numerator = 4;
  let denominator = 4;
  let selectedPhase = bestPhase44;
  let confidence = 0.85;
  let isAmbiguous = false;
  const reasons = [];
  const ambiguityNotes = [];

  if (isUniformEnergy) {
    // Ambient / unaccented
    classification = 'unknown';
    numerator = null;
    denominator = null;
    confidence = 0.25;
    isAmbiguous = true;
    reasons.push('Low spectral contrast across all beat positions');
    ambiguityNotes.push('Sparse rhythmic cues or sustained ambient pads');
  } else if (isCompound68) {
    // 6/8 Compound meter detected -> out of scope for 3/4 and 4/4 engine per architecture directive
    classification = 'unsupported';
    numerator = 6;
    denominator = 8;
    selectedPhase = 0;
    confidence = 0.88;
    reasons.push('Compound 6/8 meter periodicity detected; out of scope for supported 3/4 and 4/4 profiles');
    ambiguityNotes.push('Compound duple rhythm (6/8) identified');
  } else if (isWaltz34) {
    // 3/4 Waltz
    classification = '3/4';
    numerator = 3;
    denominator = 4;
    selectedPhase = bestPhase34;
    const separation = (maxScore34 - Math.max(0, secondScore34)) / Math.max(0.01, maxScore34);
    confidence = Math.min(0.98, Math.max(0.70, 0.72 + separation * 0.28));
    reasons.push(`3/4 triple meter periodicity dominant (score 3/4: ${maxScore34.toFixed(2)} vs 4/4: ${maxScore44.toFixed(2)})`);

  } else {
    // 4/4 Standard Common Time
    classification = '4/4';
    numerator = 4;
    denominator = 4;
    selectedPhase = bestPhase44;
    const separation = (maxScore44 - Math.max(0, secondScore44)) / Math.max(0.01, maxScore44);
    confidence = Math.min(0.98, Math.max(0.70, 0.72 + separation * 0.28));
    reasons.push(`4/4 quadruple meter regularity verified (best phase offset: ${bestPhase44})`);
  }

  // 7. Generate Downbeats Array
  const downbeats = [];
  const bars = [];
  let barIdx = 0;
  const numInBar = numerator || 4;

  for (let i = selectedPhase; i < beats.length; i += numInBar) {
    const remainingBeats = beats.length - i;
    if (remainingBeats < Math.ceil(numInBar / 2) && bars.length > 0) {
      break;
    }
    const b = beats[i];
    const nextBarBeat = beats[i + numInBar];
    const nextBarTicks = nextBarBeat ? nextBarBeat.ticks : b.ticks + (b.ticks - (beats[i - 1]?.ticks || 0)) * numInBar;

    downbeats.push({
      id: `downbeat-${barIdx + 1}`,
      barIndex: barIdx,
      ticks: b.ticks,
      sampleIndex: b.sampleIndex,
      confidence: Number(confidence.toFixed(3))
    });

    bars.push({
      barIndex: barIdx,
      startTicks: b.ticks,
      endTicks: nextBarTicks,
      downbeatTicks: b.ticks,
      beatsCount: Math.min(numInBar, beats.length - i),
      confidence: Number(confidence.toFixed(3))
    });

    barIdx++;
  }

  return {
    phaseOffsetBeats: selectedPhase,
    meter: {
      classification,
      numerator,
      denominator,
      confidence: Number(confidence.toFixed(3)),
      isAmbiguous,
      phaseOffsetBeats: selectedPhase,
      reasons
    },
    downbeats,
    bars,
    ambiguity: {
      hasHighAmbiguity: isAmbiguous,
      isSparse: isUniformEnergy,
      isRubato: false,
      notes: ambiguityNotes
    }
  };
}

module.exports = {
  estimateDownbeats
};
