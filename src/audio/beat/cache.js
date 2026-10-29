/**
 * Editing Mechanics Engine (EME) - Content-Addressed Beat Analysis Cache
 * Stores and retrieves immutable analysis artifacts with deterministic cache key invalidation.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashConfig } = require('./config.js');

class BeatAnalysisCache {
  constructor(options = {}) {
    this.memoryCache = new Map();
    this.cacheDir = options.cacheDir || path.resolve(process.cwd(), '.cache/beat-analysis');
    this.persistToDisk = options.persistToDisk !== false;
  }

  /**
   * Computes a deterministic cache key for a given audio source, config, and algorithm version.
   */
  computeKey(sourceSha256, config) {
    if (!sourceSha256 || typeof sourceSha256 !== 'string') {
      throw new Error('sourceSha256 is required to compute cache key');
    }
    const cHash = hashConfig(config);
    const raw = `${sourceSha256}:${cHash}:${config.algorithmVersion || '1.0.0'}`;
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  get(key) {
    if (this.memoryCache.has(key)) {
      return structuredClone(this.memoryCache.get(key));
    }

    if (this.persistToDisk) {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.memoryCache.set(key, content);
          return structuredClone(content);
        } catch (_) {}
      }
    }

    return null;
  }

  set(key, artifact) {
    if (!key || !artifact) return;
    this.memoryCache.set(key, structuredClone(artifact));

    if (this.persistToDisk) {
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        const filePath = path.join(this.cacheDir, `${key}.json`);
        fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf8');
      } catch (_) {}
    }
  }

  has(key) {
    return this.memoryCache.has(key) || (this.persistToDisk && fs.existsSync(path.join(this.cacheDir, `${key}.json`)));
  }

  clear() {
    this.memoryCache.clear();
    if (this.persistToDisk && fs.existsSync(this.cacheDir)) {
      try {
        const files = fs.readdirSync(this.cacheDir);
        for (const f of files) {
          if (f.endsWith('.json')) fs.unlinkSync(path.join(this.cacheDir, f));
        }
      } catch (_) {}
    }
  }
}

module.exports = {
  BeatAnalysisCache
};
