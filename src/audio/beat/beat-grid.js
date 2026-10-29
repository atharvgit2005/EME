/**
 * Editing Mechanics Engine (EME) - Deterministic Beat Grid Generator
 * Maps tempo hypotheses and phase offsets to discrete, sample-accurate beat sequences and integer EME ticks.
 */

const { sampleToTicks } = require('./audio-ingest.js');

/**
 * Generates deterministic beat grid from tempo, phase offset, and total sample duration.
 * @param {object} tempoResult { bpm, phaseOffsetSamples, confidence }
 * @param {number} totalSamples Total length of audio in samples
 * @param {Array<{ sampleIndex: number, strength: number }>} onsets Detected onsets
 * @param {object} config { sampleRate, hopLength }
 * @returns {{ beats: Array<{ id: string, sampleIndex: number, ticks: number, confidence: number, strength: number }>, downbeats: Array<{ id: string, barIndex: number, ticks: number, confidence: number }> }}
 */
function generateBeatGrid(tempoResult, totalSamples, onsets = [], config = {}) {
  const bpm = tempoResult.bpm;
  if (!bpm || bpm <= 0 || totalSamples <= 0) {
    return { beats: [], downbeats: [] };
  }

  const sampleRate = config.sampleRate || 44100;
  const beatIntervalSamples = (60.0 * sampleRate) / bpm;
  const phaseSamples = tempoResult.phaseOffsetSamples || 0;
  const baseConfidence = tempoResult.confidence || 0.8;

  const beats = [];
  const downbeats = [];

  let beatIndex = 0;
  let phaseOffset = phaseSamples % beatIntervalSamples;
  if (phaseOffset > beatIntervalSamples * 0.5) {
    phaseOffset -= beatIntervalSamples;
  }
  let currentSample = phaseOffset;

  // Pre-index onsets by sample for fast lookup
  const onsetSamples = onsets.map(o => o.sampleIndex);
  const toleranceSamples = Math.round(beatIntervalSamples * 0.15); // +/- 15% window

  while (currentSample < totalSamples - beatIntervalSamples * 0.35) {
    const sIdx = Math.max(0, Math.round(currentSample));
    const ticks = sampleToTicks(sIdx, sampleRate);

    // Look for matching onset near this beat to measure local strength
    let nearestDist = Infinity;
    let localStrength = 0.5;

    for (let i = 0; i < onsetSamples.length; i++) {
      const dist = Math.abs(onsetSamples[i] - sIdx);
      if (dist < nearestDist) {
        nearestDist = dist;
        localStrength = onsets[i].strength;
      }
      if (onsetSamples[i] > sIdx + toleranceSamples) break;
    }

    const confidence = nearestDist <= toleranceSamples
      ? Number(Math.min(0.99, baseConfidence * (1.0 - (nearestDist / toleranceSamples) * 0.3)).toFixed(3))
      : Number((baseConfidence * 0.7).toFixed(3));

    beats.push({
      id: `beat-${beatIndex + 1}`,
      sampleIndex: sIdx,
      ticks,
      confidence,
      strength: Number(localStrength.toFixed(4))
    });

    // Simple 4/4 bar grouping for A1 (A2 provides musical downbeat detection)
    if (beatIndex % 4 === 0) {
      const barIndex = Math.floor(beatIndex / 4);
      downbeats.push({
        id: `downbeat-${barIndex + 1}`,
        barIndex,
        ticks,
        confidence
      });
    }

    beatIndex++;
    currentSample += beatIntervalSamples;
  }

  return {
    beats,
    downbeats
  };
}

module.exports = {
  generateBeatGrid
};
