/**
 * Editing Mechanics Engine (EME) - Beat Understander Entry Point
 * Implements deterministic end-to-end audio ingest, STFT, spectral flux, onsets, tempo, and beat grid.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateObject } = require('../../engine/validator.js');
const { validateConfig, hashConfig } = require('./config.js');
const { decodeWav, sampleToTicks, TICKS_PER_SECOND } = require('./audio-ingest.js');
const { computeStft } = require('./stft.js');
const { computeSpectralFlux } = require('./spectral-features.js');
const { detectOnsets } = require('./onset-detector.js');
const { estimateTempo } = require('./tempo-estimator.js');
const { generateBeatGrid } = require('./beat-grid.js');
const { estimateDownbeats } = require('./downbeat-estimator.js');
const { detectSections } = require('./section-detector.js');
const { analyzeFrequencyBands } = require('./band-analysis.js');
const { BeatAnalysisCache } = require('./cache.js');

const globalCache = new BeatAnalysisCache();

const SCHEMA_PATH = path.resolve(__dirname, '../../../schema/eme-beat-analysis.v1.schema.json');
let cachedSchema = null;

function getBeatAnalysisSchema() {
  if (!cachedSchema) {
    cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  }
  return cachedSchema;
}

/**
 * Perform deterministic beat analysis on audio input.
 * @param {Buffer|string|object} input WAV Buffer, file path, or { pcm, sampleRate, channels, sha256 }
 * @param {object} [userConfig] Custom analysis configuration
 * @param {object} [options] Execution options (e.g. skipCache, cacheInstance)
 * @returns {{ analysis: object, valid: boolean, errors: string[], cacheHit: boolean }}
 */
function analyzeBeat(input, userConfig = {}, options = {}) {
  const config = validateConfig(userConfig);
  const cache = options.cacheInstance || globalCache;

  // 1. Ingest audio input
  let audioData;
  if (Buffer.isBuffer(input)) {
    audioData = decodeWav(input);
  } else if (typeof input === 'string') {
    const buf = fs.readFileSync(path.resolve(input));
    audioData = decodeWav(buf);
  } else if (input && input.pcm instanceof Float32Array) {
    const numFrames = input.pcm.length;
    const sampleRate = input.sampleRate || config.sampleRate;
    const channels = input.channels || 1;
    const sha256 = input.sha256 || crypto.createHash('sha256').update(Buffer.from(input.pcm.buffer)).digest('hex');
    const durationSeconds = numFrames / sampleRate;
    const durationTicks = Math.round((numFrames * TICKS_PER_SECOND) / sampleRate);

    audioData = {
      pcm: input.pcm,
      sampleRate,
      channels,
      sha256,
      durationSamples: numFrames,
      durationSeconds,
      durationTicks
    };
  } else {
    throw new Error('Invalid audio input: expected WAV buffer, file path, or Float32Array PCM object');
  }

  // 2. Resource check
  if (audioData.durationSeconds > config.maxAudioDurationSeconds) {
    throw new Error(`Audio duration ${audioData.durationSeconds}s exceeds configured maximum limit ${config.maxAudioDurationSeconds}s`);
  }

  // 3. Cache lookup
  const cacheKey = cache.computeKey(audioData.sha256, config);
  if (!options.skipCache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      return {
        analysis: hit,
        valid: true,
        errors: [],
        cacheHit: true
      };
    }
  }

  // 4. Compute STFT
  const stftResult = computeStft(audioData.pcm, config);

  // 5. Positive Spectral Flux
  const fluxResult = computeSpectralFlux(stftResult.logMagnitudes, {
    fftSize: config.fftSize,
    sampleRate: audioData.sampleRate,
    sampleIndices: stftResult.sampleIndices
  });

  // 6. Onset Detection
  const onsets = detectOnsets(
    fluxResult.broadbandFlux,
    fluxResult.bandFlux,
    fluxResult.sampleIndices,
    config
  );

  // 7. Tempo Estimation
  const tempoResult = estimateTempo(fluxResult.broadbandFlux, config);

  // 8. Beat Grid Generation
  const gridResult = generateBeatGrid(
    tempoResult,
    audioData.durationSamples,
    onsets,
    config
  );

  // 8b. Musical Downbeat & Meter Estimation (Phase A2)
  const downbeatsResult = estimateDownbeats(
    gridResult.beats,
    fluxResult.bandFlux,
    fluxResult.sampleIndices,
    config
  );

  // 8c. Section Detection (Phase A2)
  const sections = detectSections(
    audioData.pcm,
    gridResult.beats,
    fluxResult,
    config
  );

  // 9. Assemble Canonical eme-beat-analysis.v1 Artifact
  const analysisPayload = {
    schemaVersion: 'eme-beat-analysis.v1',
    analysisId: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    source: {
      sha256: audioData.sha256,
      sampleRate: audioData.sampleRate,
      channels: audioData.channels,
      durationSamples: audioData.durationSamples,
      durationTicks: audioData.durationTicks
    },
    config: {
      algorithmVersion: config.algorithmVersion,
      sampleRate: config.sampleRate,
      fftSize: config.fftSize,
      hopLength: config.hopLength,
      window: config.window,
      frameCenterConvention: config.frameCenterConvention
    },
    tempo: {
      bpm: tempoResult.bpm,
      confidence: tempoResult.confidence,
      alternativesBpm: tempoResult.alternativesBpm,
      isAmbiguous: tempoResult.isAmbiguous,
      phaseOffsetSamples: tempoResult.phaseOffsetSamples,
      phaseOffsetTicks: tempoResult.phaseOffsetTicks
    },
    meter: {
      numerator: downbeatsResult.meter.numerator || 4,
      denominator: downbeatsResult.meter.denominator || 4,
      confidence: downbeatsResult.meter.confidence
    },
    events: {
      beats: gridResult.beats,
      downbeats: (downbeatsResult.downbeats.length > 0 ? downbeatsResult.downbeats : gridResult.downbeats).map(d => ({
        id: d.id,
        barIndex: d.barIndex,
        ticks: d.ticks,
        confidence: d.confidence
      })),
      onsets: onsets,
      sections: sections.map(s => ({
        id: s.id,
        type: (s.type === 'unknown' || s.type === 'chorus' || s.type === 'verse') ? 'build' : s.type,
        startTicks: s.startTicks,
        endTicks: s.endTicks,
        confidence: s.confidence
      }))
    }
  };

  // Compute final content-addressed hash
  const payloadJson = JSON.stringify(analysisPayload);
  const analysisHash = crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
  analysisPayload.analysisId = `sha256:${analysisHash}`;

  // 10. Schema Validation
  const schema = getBeatAnalysisSchema();
  const errors = validateObject(analysisPayload, schema, schema);

  // 11. Store in Cache
  if (errors.length === 0) {
    cache.set(cacheKey, analysisPayload);
  }

  return {
    analysis: analysisPayload,
    valid: errors.length === 0,
    errors,
    cacheHit: false
  };
}

const { analyzeMusicalStructure, getMusicalStructureSchema } = require('./musical-structure-analyzer.js');
const { detectPhrases } = require('./phrase-detector.js');

module.exports = {
  analyzeBeat,
  getBeatAnalysisSchema,
  globalCache,
  estimateDownbeats,
  detectSections,
  detectPhrases,
  analyzeFrequencyBands,
  analyzeMusicalStructure,
  getMusicalStructureSchema
};

