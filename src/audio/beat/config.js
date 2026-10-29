/**
 * Editing Mechanics Engine (EME) - Beat Understander Configuration Contract
 * Implements centralized, immutable configuration parameters with strict validation.
 */

const crypto = require('node:crypto');

const DEFAULT_CONFIG = Object.freeze({
  algorithmVersion: '1.0.0',
  sampleRate: 44100,
  fftSize: 2048,
  hopLength: 441,
  window: 'hann',
  frameCenterConvention: 'center',
  minOnsetSeparationMs: 30,
  tempoMinBpm: 40,
  tempoMaxBpm: 240,
  silenceThresholdRms: 1e-4,
  maxAudioDurationSeconds: 1800 // 30 minutes upper bound
});

function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function validateConfig(userConfig = {}) {
  const merged = { ...DEFAULT_CONFIG, ...userConfig };

  if (merged.sampleRate < 22050 || merged.sampleRate > 48000) {
    throw new Error(`Invalid sampleRate: ${merged.sampleRate}. Must be between 22050 and 48000 Hz.`);
  }

  if (!isPowerOfTwo(merged.fftSize) || merged.fftSize < 1024 || merged.fftSize > 8192) {
    throw new Error(`Invalid fftSize: ${merged.fftSize}. Must be a power of two between 1024 and 8192.`);
  }

  if (merged.hopLength < 220 || merged.hopLength > 1024 || merged.hopLength >= merged.fftSize) {
    throw new Error(`Invalid hopLength: ${merged.hopLength}. Must be between 220 and 1024 and less than fftSize.`);
  }

  if (merged.window !== 'hann') {
    throw new Error(`Invalid window: "${merged.window}". Only "hann" is permitted in Phase A1.`);
  }

  if (merged.minOnsetSeparationMs < 20 || merged.minOnsetSeparationMs > 100) {
    throw new Error(`Invalid minOnsetSeparationMs: ${merged.minOnsetSeparationMs}. Allowed range is 20 to 100 ms.`);
  }

  if (merged.tempoMinBpm < 30 || merged.tempoMaxBpm > 300 || merged.tempoMinBpm >= merged.tempoMaxBpm) {
    throw new Error(`Invalid tempo range: [${merged.tempoMinBpm}, ${merged.tempoMaxBpm}].`);
  }

  return Object.freeze(merged);
}

function hashConfig(config) {
  const validated = validateConfig(config);
  const keys = Object.keys(validated).sort();
  const sortedObj = {};
  for (const k of keys) sortedObj[k] = validated[k];
  return crypto.createHash('sha256').update(JSON.stringify(sortedObj), 'utf8').digest('hex');
}

module.exports = {
  DEFAULT_CONFIG,
  validateConfig,
  hashConfig
};
