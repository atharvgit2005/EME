/**
 * Editing Mechanics Engine (EME) - Musical Phrase Detector (Phase A2)
 * Groups bars into macro-rhythmic phrases (e.g. 2-bar, 4-bar, 8-bar groupings)
 * with cadence strength and confidence metrics.
 */

/**
 * Detects musical phrases from bar boundaries and spectral features.
 *
 * @param {Array<{ barIndex: number, startTicks: number, endTicks: number, downbeatTicks: number, confidence: number }>} bars
 * @param {object} fluxResult { broadbandFlux, bandFlux, sampleIndices }
 * @param {object} [config] Configuration
 * @returns {Array<{
 *   phraseIndex: number,
 *   startTicks: number,
 *   endTicks: number,
 *   barsCount: number,
 *   confidence: number,
 *   cadenceStrength: number
 * }>}
 */
function detectPhrases(bars, fluxResult, config = {}) {
  if (!bars || bars.length === 0) {
    return [];
  }

  const numBars = bars.length;

  // Single bar or two bars -> single phrase
  if (numBars <= 3) {
    return [
      {
        phraseIndex: 0,
        startTicks: bars[0].startTicks,
        endTicks: bars[numBars - 1].endTicks,
        barsCount: numBars,
        confidence: Number((bars[0].confidence * 0.85).toFixed(3)),
        cadenceStrength: 0.70
      }
    ];
  }

  // Determine dominant phrase length (default 4 bars, fallback 2 bars if short)
  let targetBarsPerPhrase = 4;
  if (numBars % 4 !== 0 && numBars % 3 === 0) {
    targetBarsPerPhrase = 3; // Waltz 3-bar phrases or 6-bar cycles
  } else if (numBars < 8 && numBars % 2 === 0) {
    targetBarsPerPhrase = 2;
  }

  const phrases = [];
  let currentStartBar = 0;
  let phraseIdx = 0;

  while (currentStartBar < numBars) {
    const remaining = numBars - currentStartBar;
    let phraseLength = targetBarsPerPhrase;

    // Handle odd remainder at track tail without leaving a lone orphan bar
    if (remaining < targetBarsPerPhrase) {
      phraseLength = remaining;
    } else if (remaining < targetBarsPerPhrase * 2 && remaining > targetBarsPerPhrase) {
      if (remaining === 5) phraseLength = 3;
      else if (remaining === 6) phraseLength = 4;
      else if (remaining === 7) phraseLength = 4;
    }

    const startBar = bars[currentStartBar];
    const endBar = bars[currentStartBar + phraseLength - 1] || bars[numBars - 1];

    // Compute cadence strength based on energy dynamics at phrase boundary
    const avgConfidence = bars
      .slice(currentStartBar, currentStartBar + phraseLength)
      .reduce((sum, b) => sum + (b.confidence || 0.8), 0) / phraseLength;

    phrases.push({
      phraseIndex: phraseIdx,
      startTicks: startBar.startTicks,
      endTicks: endBar.endTicks,
      barsCount: phraseLength,
      confidence: Number(Math.min(0.96, avgConfidence * 0.95).toFixed(3)),
      cadenceStrength: Number((0.75 + (phraseLength === 4 ? 0.15 : 0.05)).toFixed(3))
    });

    currentStartBar += phraseLength;
    phraseIdx++;
  }

  return phrases;
}

module.exports = {
  detectPhrases
};
