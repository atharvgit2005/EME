/**
 * Editing Mechanics Engine (EME) - Musical Structure Analyzer (Phase A2)
 *
 * Independent pipeline for:
 * - Downbeat phase inference (timing error <= 20ms)
 * - Meter classification (4/4, 3/4, unsupported 6/8, unknown)
 * - Bar indexing and alignment
 * - Phrase grouping (2-bar, 4-bar, 8-bar)
 * - Section boundary detection with explicit uncertainty states
 * - Emits canonical eme-musical-structure.v1 sidecar artifact
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { validateObject } = require('../../engine/validator.js');
const { validateConfig } = require('./config.js');
const { decodeWav, sampleToTicks, TICKS_PER_SECOND } = require('./audio-ingest.js');
const { computeStft } = require('./stft.js');
const { computeSpectralFlux } = require('./spectral-features.js');
const { detectOnsets } = require('./onset-detector.js');
const { estimateTempo } = require('./tempo-estimator.js');
const { generateBeatGrid } = require('./beat-grid.js');
const { estimateDownbeats } = require('./downbeat-estimator.js');
const { detectPhrases } = require('./phrase-detector.js');
const { detectSections } = require('./section-detector.js');

const SCHEMA_PATH = path.resolve(__dirname, '../../../schema/eme-musical-structure.v1.schema.json');
let cachedStructureSchema = null;

function getMusicalStructureSchema() {
  if (!cachedStructureSchema) {
    cachedStructureSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  }
  return cachedStructureSchema;
}

/**
 * Analyzes audio and produces a validated eme-musical-structure.v1 document.
 *
 * @param {Buffer|string|object} input Audio input
 * @param {object} [userConfig] Analysis configuration overrides
 * @returns {{ structure: object, valid: boolean, errors: string[] }}
 */
function analyzeMusicalStructure(input, userConfig = {}) {
  const config = validateConfig(userConfig);

  // 1. Ingest audio
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
    const durationTicks = Math.round((numFrames * TICKS_PER_SECOND) / sampleRate);

    audioData = {
      pcm: input.pcm,
      sampleRate,
      channels,
      sha256,
      durationSamples: numFrames,
      durationTicks
    };
  } else {
    throw new Error('Invalid audio input: expected WAV buffer, file path, or Float32Array PCM object');
  }

  // 2. Compute STFT & Spectral Flux
  const stftResult = computeStft(audioData.pcm, config);
  const fluxResult = computeSpectralFlux(stftResult.logMagnitudes, {
    fftSize: config.fftSize,
    sampleRate: audioData.sampleRate,
    sampleIndices: stftResult.sampleIndices
  });

  // 3. Onset & Tempo Detection
  const onsets = detectOnsets(fluxResult.broadbandFlux, fluxResult.bandFlux, fluxResult.sampleIndices, config);
  const tempoResult = estimateTempo(fluxResult.broadbandFlux, config);

  // 4. Beat Grid Generation
  const gridResult = generateBeatGrid(tempoResult, audioData.durationSamples, onsets, config);

  // 5. Downbeat, Meter & Bar Estimation
  const downbeatResult = estimateDownbeats(
    gridResult.beats,
    fluxResult.bandFlux,
    fluxResult.sampleIndices,
    { ...config, onsets, broadbandFlux: fluxResult.broadbandFlux }
  );

  // 6. Phrase Grouping
  const phrases = detectPhrases(downbeatResult.bars, fluxResult, config);

  // 7. Section Boundary & Role Detection
  const sections = detectSections(
    audioData.pcm,
    gridResult.beats,
    fluxResult,
    config,
    downbeatResult.bars
  );

  // 8. Build Candidate Payload
  const payload = {
    schemaVersion: 'eme-musical-structure.v1',
    structureId: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    source: {
      sha256: audioData.sha256,
      sampleRate: audioData.sampleRate,
      channels: audioData.channels,
      durationSamples: audioData.durationSamples,
      durationTicks: audioData.durationTicks
    },
    config: {
      algorithmVersion: '2.0.0',
      ticksPerSecond: TICKS_PER_SECOND,
      endpointConvention: 'half-open',
      fftSize: config.fftSize,
      hopLength: config.hopLength
    },
    meter: downbeatResult.meter,
    bars: downbeatResult.bars,
    phrases,
    sections,
    ambiguity: downbeatResult.ambiguity
  };

  // Compute Content-Addressed SHA-256 fingerprint
  const rawJson = JSON.stringify(payload);
  const hash = crypto.createHash('sha256').update(rawJson, 'utf8').digest('hex');
  payload.structureId = `sha256:${hash}`;

  // 9. Schema Validation
  const schema = getMusicalStructureSchema();
  const errors = validateObject(payload, schema, schema);

  return {
    structure: payload,
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  analyzeMusicalStructure,
  getMusicalStructureSchema
};
