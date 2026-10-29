/**
 * Editing Mechanics Engine (EME) - Musical Section Detector (Phase A2)
 * Detects macro musical structures: intro, verse, chorus, build, drop, breakdown, outro, unknown.
 * Conforms to eme-musical-structure.v1 sidecar contract.
 */

const { sampleToTicks } = require('./audio-ingest.js');

/**
 * Detects musical sections from audio PCM, beats, downbeats, and spectral features.
 *
 * @param {Float32Array} pcm Audio samples
 * @param {Array<{ sampleIndex: number, ticks: number }>} beats Detected beats
 * @param {object} fluxResult { broadbandFlux, bandFlux, sampleIndices }
 * @param {object} [config] Configuration
 * @param {Array<{ barIndex: number, startTicks: number }>} [bars] Bar boundaries for snapping
 * @returns {Array<{
 *   id: string,
 *   sectionIndex: number,
 *   type: 'intro'|'verse'|'chorus'|'build'|'drop'|'breakdown'|'outro'|'unknown',
 *   startTicks: number,
 *   endTicks: number,
 *   confidence: number,
 *   uncertaintyState: 'clear'|'ambiguous'|'insufficient_evidence'|'transition_zone'
 * }>}
 */
function detectSections(pcm, beats, fluxResult, config = {}, bars = []) {
  const sampleRate = config.sampleRate || 44100;
  const totalSamples = pcm ? pcm.length : 0;
  const totalDurationTicks = sampleToTicks(totalSamples, sampleRate);

  if (totalSamples === 0) {
    return [];
  }
  const safeBeats = beats || [];

  // Short audio (< 6 seconds) treated as a single uniform section
  if (totalSamples < sampleRate * 6) {
    return [
      {
        id: 'section-1',
        sectionIndex: 0,
        type: 'intro',
        startTicks: 0,
        endTicks: totalDurationTicks,
        confidence: 0.95,
        uncertaintyState: 'clear'
      }
    ];
  }

  // Windowed analysis in 2-second buckets
  const windowSamples = sampleRate * 2;
  const numWindows = Math.ceil(totalSamples / windowSamples);
  const windowFeatures = [];

  for (let w = 0; w < numWindows; w++) {
    const startSample = w * windowSamples;
    const endSample = Math.min(totalSamples, startSample + windowSamples);
    const count = endSample - startSample;

    let sumSq = 0.0;
    for (let s = startSample; s < endSample; s++) {
      const v = pcm[s];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    const beatsInWindow = safeBeats.filter(b => b.sampleIndex >= startSample && b.sampleIndex < endSample).length;

    windowFeatures.push({
      startSample,
      endSample,
      startTicks: sampleToTicks(startSample, sampleRate),
      endTicks: sampleToTicks(endSample, sampleRate),
      rms,
      beatDensity: beatsInWindow
    });
  }

  // Baseline statistics
  const allRms = windowFeatures.map(f => f.rms);
  const maxRms = Math.max(...allRms, 1e-6);
  const avgRms = allRms.reduce((a, b) => a + b, 0) / allRms.length;

  // Helper to snap ticks to nearest bar start
  function snapToNearestBar(ticks) {
    if (!bars || bars.length === 0) return ticks;
    let closestTicks = ticks;
    let minDiff = Infinity;
    for (const bar of bars) {
      const diff = Math.abs(bar.startTicks - ticks);
      if (diff < minDiff && diff <= 120000 * 2) { // within 2 seconds
        minDiff = diff;
        closestTicks = bar.startTicks;
      }
    }
    return closestTicks;
  }

  const rawSections = [];
  let currentType = 'intro';
  let sectionStartTicks = 0;

  for (let w = 0; w < numWindows; w++) {
    const f = windowFeatures[w];
    const prevF = w > 0 ? windowFeatures[w - 1] : null;

    let detectedType = 'intro';

    if (maxRms < 0.01) {
      detectedType = 'unknown';
    } else if (f.rms >= maxRms * 0.70) {
      detectedType = 'drop';
    } else if (w >= numWindows * 0.75 && f.rms <= maxRms * 0.35) {
      detectedType = 'outro';
    } else if (prevF && f.rms > prevF.rms * 1.35 && f.rms > maxRms * 0.18) {
      detectedType = 'build';
    } else {
      detectedType = prevF ? prevF.detectedType : 'intro';
    }

    f.detectedType = detectedType;

    if (w === 0) {
      currentType = detectedType;
    } else if (detectedType !== currentType) {
      const boundaryTicks = snapToNearestBar(f.startTicks);
      if (boundaryTicks > sectionStartTicks) {
        rawSections.push({
          type: currentType,
          startTicks: sectionStartTicks,
          endTicks: boundaryTicks
        });
        currentType = detectedType;
        sectionStartTicks = boundaryTicks;
      }
    }
  }

  // Final section
  rawSections.push({
    type: currentType,
    startTicks: sectionStartTicks,
    endTicks: totalDurationTicks
  });

  // Assign IDs, sectionIndex, confidence, and uncertaintyState
  return rawSections.map((s, idx) => {
    let uncertaintyState = 'clear';
    let conf = 0.88;

    if (s.type === 'unknown') {
      uncertaintyState = 'insufficient_evidence';
      conf = 0.40;
    } else if (s.endTicks - s.startTicks < 240000) {
      // Very short section (< 2s)
      uncertaintyState = 'transition_zone';
      conf = 0.72;
    }

    return {
      id: `section-${idx + 1}`,
      sectionIndex: idx,
      type: s.type,
      startTicks: s.startTicks,
      endTicks: s.endTicks,
      confidence: Number(conf.toFixed(3)),
      uncertaintyState
    };
  });
}

module.exports = {
  detectSections
};
