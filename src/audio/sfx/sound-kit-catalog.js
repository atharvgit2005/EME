/**
 * Editing Mechanics Engine (EME) - Sound Kit Ingestion & Role Catalog (Stage 26.3)
 *
 * Ingests validated kit.lock.json and assets into an in-memory role catalog.
 * Indexes physical transient alignment points, durations in 120,000 ticks/sec timebase,
 * dual-hash provenance records, and deterministic/round-robin take selection.
 */

const fs = require('node:fs');
const path = require('node:path');
const { validateKitDirectory } = require('./earshot-kit-validator.js');
const { TICKS_PER_SECOND } = require('../../engine/time.js');

class SoundKitCatalog {
  /**
   * @param {object} [options]
   * @param {string} [options.kitDir] Path to sound kit directory containing kit.lock.json and WAVs
   */
  constructor(options = {}) {
    this.kitDir = options.kitDir ? path.resolve(options.kitDir) : null;
    this.lock = null;
    this.name = null;
    this.earshotVersion = null;
    this.bankVersion = null;
    this.sampleRate = 48000;
    this.roles = new Map();
    this.takesByRole = new Map();
    this.assetProvenance = new Map();
    this.roundRobinCounters = new Map();
    this.isLoaded = false;
  }

  /**
   * Loads and validates a sound kit directory.
   * @param {string} [kitDir]
   * @returns {SoundKitCatalog}
   */
  load(kitDir = this.kitDir) {
    if (!kitDir) {
      throw new Error('SoundKitCatalog requires a kit directory path');
    }

    const realDir = path.resolve(kitDir);
    const val = validateKitDirectory(realDir);
    if (!val.valid) {
      const err = new Error(`Cannot load invalid sound kit directory "${kitDir}": ${val.errors.join('; ')}`);
      err.code = 'INVALID_KIT_DIRECTORY';
      err.errors = val.errors;
      throw err;
    }

    this.kitDir = realDir;
    this.lock = val.lock;
    this.name = val.lock.name || path.basename(realDir);
    this.earshotVersion = val.lock.earshot;
    this.bankVersion = val.lock.bank;
    this.sampleRate = val.lock.sr || 48000;

    this.roles.clear();
    this.takesByRole.clear();
    this.assetProvenance.clear();
    this.roundRobinCounters.clear();

    // Populate asset provenance map
    for (const [fileName, prov] of Object.entries(val.assetProvenance)) {
      this.assetProvenance.set(fileName, prov);
    }

    // Index roles and takes with exact physical timing
    for (const [roleName, roleEntry] of Object.entries(val.lock.roles || {})) {
      if (!roleEntry || !Array.isArray(roleEntry.takes)) {
        continue;
      }

      const roleMeta = {
        name: roleName,
        sound: roleEntry.sound,
        align: roleEntry.align || 'onset',
        level_db: typeof roleEntry.level_db === 'number' ? roleEntry.level_db : 0.0,
        max_s: roleEntry.max_s !== undefined ? roleEntry.max_s : null,
        takeCount: roleEntry.takes.length
      };

      this.roles.set(roleName, roleMeta);

      const parsedTakes = [];
      for (let i = 0; i < roleEntry.takes.length; i++) {
        const rawTake = roleEntry.takes[i];
        const prov = this.assetProvenance.get(rawTake.file);

        // Derive physical alignment point in exact ticks at 120,000 ticks/sec
        let alignmentSeconds = rawTake.onset_s || 0.0;
        if (roleMeta.align === 'peak') {
          alignmentSeconds = rawTake.peak_s || 0.0;
        } else if (roleMeta.align === 'end') {
          alignmentSeconds = rawTake.end_s || rawTake.dur_s || 0.0;
        }

        const alignmentTicks = Math.round(alignmentSeconds * TICKS_PER_SECOND);
        const durationTicks = Math.round((rawTake.dur_s || 0.0) * TICKS_PER_SECOND);
        const onsetTicks = Math.round((rawTake.onset_s || 0.0) * TICKS_PER_SECOND);
        const peakTicks = Math.round((rawTake.peak_s || 0.0) * TICKS_PER_SECOND);
        const endTicks = Math.round((rawTake.end_s || 0.0) * TICKS_PER_SECOND);

        const takeRecord = {
          role: roleName,
          index: i,
          file: rawTake.file,
          fullPath: path.join(this.kitDir, rawTake.file),
          seed: rawTake.seed,
          plannedSeed: rawTake.planned_seed !== undefined ? rawTake.planned_seed : rawTake.seed,
          pitch: rawTake.pitch || null,
          alignMode: roleMeta.align,
          levelDb: roleMeta.level_db,
          // Measurements in seconds
          dur_s: rawTake.dur_s,
          onset_s: rawTake.onset_s,
          peak_s: rawTake.peak_s,
          end_s: rawTake.end_s,
          peak_db: rawTake.peak_db,
          lufs_m_max: rawTake.lufs_m_max,
          // Measurements in canonical integer ticks (120,000 ticks/sec)
          durationTicks,
          alignmentTicks,
          onsetTicks,
          peakTicks,
          endTicks,
          // Cryptographic integrity
          sha1: rawTake.sha1,
          sha256: (prov && prov.sha256) || rawTake.sha256 || null,
          checks: rawTake.checks || []
        };

        parsedTakes.push(takeRecord);
      }

      this.takesByRole.set(roleName, parsedTakes);
      this.roundRobinCounters.set(roleName, 0);
    }

    this.isLoaded = true;
    return this;
  }

  /**
   * Returns list of all available role names in the catalog.
   * @returns {string[]}
   */
  getAvailableRoles() {
    return Array.from(this.roles.keys());
  }

  /**
   * Returns metadata for a role.
   * @param {string} roleName
   * @returns {object|null}
   */
  getRole(roleName) {
    return this.roles.get(roleName) || null;
  }

  /**
   * Checks if a role is present and has takes.
   * @param {string} roleName
   * @returns {boolean}
   */
  hasRole(roleName) {
    const takes = this.takesByRole.get(roleName);
    return Boolean(takes && takes.length > 0);
  }

  /**
   * Returns all takes for a role.
   * @param {string} roleName
   * @returns {Array<object>}
   */
  getTakes(roleName) {
    return this.takesByRole.get(roleName) || [];
  }

  /**
   * Selects a take for a role using explicit index, seed, or round-robin rotation.
   * @param {string} roleName
   * @param {object} [options]
   * @param {number} [options.takeIndex] Specific 0-based index
   * @param {number} [options.seed] Deterministic seed for modulo selection
   * @param {boolean} [options.advanceRoundRobin=false] Advance round-robin counter
   * @returns {object} Selected take record
   */
  selectTake(roleName, options = {}) {
    const takes = this.getTakes(roleName);
    if (!takes || takes.length === 0) {
      const err = new Error(`Sound kit "${this.name}" has no takes for role "${roleName}"`);
      err.code = 'ROLE_NOT_FOUND';
      throw err;
    }

    let selectedIndex = 0;

    if (typeof options.takeIndex === 'number' && Number.isInteger(options.takeIndex)) {
      selectedIndex = Math.abs(options.takeIndex) % takes.length;
    } else if (typeof options.seed === 'number' && Number.isInteger(options.seed)) {
      selectedIndex = Math.abs(options.seed) % takes.length;
    } else {
      const currentCounter = this.roundRobinCounters.get(roleName) || 0;
      selectedIndex = currentCounter % takes.length;
      if (options.advanceRoundRobin !== false) {
        this.roundRobinCounters.set(roleName, (currentCounter + 1) % takes.length);
      }
    }

    return takes[selectedIndex];
  }

  /**
   * Returns the transient alignment offset in ticks for a given role and take.
   * @param {string} roleName
   * @param {number} [takeIndex=0]
   * @returns {number} Alignment offset in ticks
   */
  getAlignmentOffsetTicks(roleName, takeIndex = 0) {
    const take = this.selectTake(roleName, { takeIndex, advanceRoundRobin: false });
    return take.alignmentTicks;
  }

  /**
   * Retrieves full provenance record for a file.
   * @param {string} fileName
   * @returns {object|null}
   */
  getProvenance(fileName) {
    return this.assetProvenance.get(fileName) || null;
  }
}

module.exports = {
  SoundKitCatalog
};
