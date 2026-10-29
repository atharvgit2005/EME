/**
 * Editing Mechanics Engine (EME) - SFX Asset Catalog & Indexer (Phase A4)
 * Ingests, categorizes, and indexes high-grade WAV assets from assets/sjc_sfx_pack/.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { decodeWav, sampleToTicks } = require('../beat/audio-ingest.js');

const SJC_PACK_DIR = path.resolve(__dirname, '../../../assets/sjc_sfx_pack/SJC SFX Pack Vol 1 (Giveaway)');

class SfxCatalog {
  constructor(baseDir = SJC_PACK_DIR) {
    this.baseDir = baseDir;
    this.index = new Map();
    this.categoryMap = new Map();
    this.isIndexed = false;
  }

  /**
   * Builds the in-memory catalog index.
   */
  buildIndex() {
    if (this.isIndexed) return;
    if (!fs.existsSync(this.baseDir)) {
      this.isIndexed = true;
      return;
    }

    const wavFiles = this._scanDir(this.baseDir);
    for (const filePath of wavFiles) {
      try {
        const buf = fs.readFileSync(filePath);
        const wav = decodeWav(buf);
        const relPath = path.relative(path.resolve(__dirname, '../../..'), filePath);
        const id = path.basename(filePath, '.wav');
        const category = this._categorize(filePath);

        const asset = {
          id,
          path: relPath,
          fullPath: filePath,
          category,
          sha256: wav.sha256,
          sampleRate: wav.sampleRate,
          channels: wav.channels,
          durationSamples: wav.durationSamples,
          durationSeconds: wav.durationSeconds,
          durationTicks: wav.durationTicks
        };

        this.index.set(id, asset);

        if (!this.categoryMap.has(category)) {
          this.categoryMap.set(category, []);
        }
        this.categoryMap.get(category).push(asset);
      } catch (err) {
        // Skip unparseable files
      }
    }

    this.isIndexed = true;
  }

  _scanDir(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(this._scanDir(full));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wav')) {
        results.push(full);
      }
    }
    return results;
  }

  _categorize(filePath) {
    const lower = filePath.toLowerCase();
    if (lower.includes('whoosh') || lower.includes('swish')) return 'whoosh';
    if (lower.includes('impact') || lower.includes('sub impact')) return 'impact';
    if (lower.includes('reverse swell') || lower.includes('reverse')) return 'riser';
    if (lower.includes('click') || lower.includes('switch')) return 'click';
    if (lower.includes('shutter') || lower.includes('film camera') || lower.includes('flashbulb')) return 'camera';
    if (lower.includes('text') || lower.includes('keyboard')) return 'text';
    if (lower.includes('bleep') || lower.includes('hover') || lower.includes('pop')) return 'ui';
    return 'foley';
  }

  /**
   * Retrieves assets matching category.
   * @param {string} category 'whoosh'|'impact'|'riser'|'click'|'camera'|'text'|'ui'|'foley'
   * @returns {Array<object>}
   */
  getByCategory(category) {
    this.buildIndex();
    return this.categoryMap.get(category) || [];
  }

  /**
   * Retrieves specific asset by ID or filename.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    this.buildIndex();
    return this.index.get(id) || null;
  }
}

const defaultCatalog = new SfxCatalog();

module.exports = {
  SfxCatalog,
  defaultCatalog
};
