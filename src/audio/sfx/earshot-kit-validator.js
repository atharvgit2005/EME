/**
 * Editing Mechanics Engine (EME) - Earshot Sound Kit & Lockfile Validator (Stage 26.1)
 *
 * Enforces strict Draft 2020-12 schema validation, physical transient sanity,
 * path containment, take collision detection, and dual-hash integrity (SHA-1 + SHA-256).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateObject } = require('../../engine/validator.js');

const SCHEMA_PATH = path.resolve(__dirname, '../schemas/earshot-sound-kit.v1.json');
let cachedFullSchema = null;

function getFullSchema() {
  if (!cachedFullSchema) {
    cachedFullSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  }
  return cachedFullSchema;
}

const ROLE_NAME_REGEX = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const VALID_ALIGNS = new Set(['onset', 'peak', 'end']);
const VALID_SAMPLE_RATES = new Set([44100, 48000, 88200, 96000]);

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates a sound kit definition (kit.json).
 * @param {object} kitData
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateKitDefinition(kitData) {
  const errors = [];
  if (!kitData || typeof kitData !== 'object' || Array.isArray(kitData)) {
    return { valid: false, errors: ['Kit definition must be an object'] };
  }

  const fullSchema = getFullSchema();
  const defSchema = fullSchema.definitions.kitDefinition;
  const schemaErrors = validateObject(kitData, defSchema, fullSchema);
  if (schemaErrors.length > 0) {
    errors.push(...schemaErrors);
  }

  // Structural sanity
  if (kitData.kit !== 1) {
    errors.push(`Invalid kit schema version: expected 1, got ${kitData.kit}`);
  }

  if (!kitData.name || typeof kitData.name !== 'string') {
    errors.push('Kit name is required and must be a string');
  }

  if (!VALID_SAMPLE_RATES.has(kitData.sr)) {
    errors.push(`Invalid sample rate ${kitData.sr}; expected 44100, 48000, 88200, or 96000`);
  }

  if (!kitData.roles || typeof kitData.roles !== 'object' || Array.isArray(kitData.roles)) {
    errors.push('Kit roles must be a non-empty object');
  } else {
    const roleEntries = Object.entries(kitData.roles);
    if (roleEntries.length === 0) {
      errors.push('Kit roles object cannot be empty');
    }

    const seenFileNames = new Map();

    for (const [roleName, spec] of roleEntries) {
      if (!ROLE_NAME_REGEX.test(roleName)) {
        errors.push(`Invalid role name "${roleName}": must be lowercase words joined by dots`);
      }

      if (spec === null) {
        continue;
      }

      if (typeof spec !== 'object' || Array.isArray(spec)) {
        errors.push(`Role "${roleName}" specification must be an object or null`);
        continue;
      }

      if (!spec.sound || typeof spec.sound !== 'string') {
        errors.push(`Role "${roleName}" requires a sound identifier string`);
      }

      if (spec.align !== undefined && !VALID_ALIGNS.has(spec.align)) {
        errors.push(`Role "${roleName}" has invalid align "${spec.align}"; must be onset, peak, or end`);
      }

      if (spec.takes !== undefined) {
        if (!Number.isInteger(spec.takes) || spec.takes < 1 || spec.takes > 32) {
          errors.push(`Role "${roleName}" takes must be an integer between 1 and 32`);
        }
      }

      if (spec.level_db !== undefined) {
        if (!isFiniteNumber(spec.level_db) || spec.level_db > 0) {
          errors.push(`Role "${roleName}" level_db must be a number <= 0 dB`);
        }
      }

      if (spec.max_s !== undefined) {
        if (!isFiniteNumber(spec.max_s) || spec.max_s < 0.01) {
          errors.push(`Role "${roleName}" max_s must be a number >= 0.01 s`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates a sound kit lockfile (kit.lock.json) in memory.
 * @param {object} lockData
 * @param {object} [options]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateKitLock(lockData, options = {}) {
  const errors = [];
  if (!lockData || typeof lockData !== 'object' || Array.isArray(lockData)) {
    return { valid: false, errors: ['Lockfile must be a JSON object'] };
  }

  if (lockData.kit !== 1) {
    errors.push(`Invalid kit lock version: expected 1, got ${lockData.kit}`);
  }

  if (!lockData.earshot || typeof lockData.earshot !== 'string') {
    errors.push('Missing or invalid earshot version in lockfile');
  }

  if (!lockData.bank || typeof lockData.bank !== 'string') {
    errors.push('Missing or invalid bank version in lockfile');
  }

  if (!VALID_SAMPLE_RATES.has(lockData.sr)) {
    errors.push(`Invalid sample rate ${lockData.sr} in lockfile`);
  }

  if (!lockData.roles || typeof lockData.roles !== 'object' || Array.isArray(lockData.roles)) {
    errors.push('Lockfile roles must be an object');
    return { valid: false, errors };
  }

  const seenFilesLower = new Map();

  for (const [roleName, roleEntry] of Object.entries(lockData.roles)) {
    if (!ROLE_NAME_REGEX.test(roleName)) {
      errors.push(`Invalid role name in lock: "${roleName}"`);
    }

    if (roleEntry === null) {
      continue;
    }

    if (typeof roleEntry !== 'object' || Array.isArray(roleEntry)) {
      errors.push(`Role entry for "${roleName}" in lockfile must be an object or null`);
      continue;
    }

    if (!roleEntry.sound || typeof roleEntry.sound !== 'string') {
      errors.push(`Role "${roleName}" in lockfile is missing sound id`);
    }

    if (!VALID_ALIGNS.has(roleEntry.align)) {
      errors.push(`Role "${roleName}" in lockfile has invalid align "${roleEntry.align}"`);
    }

    if (!Array.isArray(roleEntry.takes)) {
      errors.push(`Role "${roleName}" in lockfile must have an array of takes`);
      continue;
    }

    for (let i = 0; i < roleEntry.takes.length; i++) {
      const take = roleEntry.takes[i];
      const takePrefix = `Role "${roleName}" take ${i + 1}`;

      if (!take || typeof take !== 'object' || Array.isArray(take)) {
        errors.push(`${takePrefix} must be an object`);
        continue;
      }

      // Check file name safety
      if (!take.file || typeof take.file !== 'string') {
        errors.push(`${takePrefix} missing "file" name`);
      } else {
        // Enforce path containment: must be pure filename with .wav extension, no slashes or ..
        if (take.file.includes('/') || take.file.includes('\\') || take.file.includes('..')) {
          errors.push(`${takePrefix} unsafe file path "${take.file}": must be local basename`);
        }
        if (!take.file.toLowerCase().endsWith('.wav')) {
          errors.push(`${takePrefix} file "${take.file}" must have .wav extension`);
        }

        // Case-insensitive filename collision check (macOS / Windows safety)
        const lowerName = take.file.toLowerCase();
        if (seenFilesLower.has(lowerName)) {
          errors.push(
            `Case-insensitive filename collision: "${take.file}" in ${roleName} conflicts with take from role "${seenFilesLower.get(lowerName)}"`
          );
        } else {
          seenFilesLower.set(lowerName, roleName);
        }
      }

      // Check SHA-1 hash format
      if (!take.sha1 || !/^[a-fA-F0-9]{40}$/.test(take.sha1)) {
        errors.push(`${takePrefix} has invalid SHA-1 digest "${take.sha1}"`);
      }

      // Check optional EME SHA-256 hash if present
      if (take.sha256 && !/^[a-fA-F0-9]{64}$/.test(take.sha256)) {
        errors.push(`${takePrefix} has invalid SHA-256 digest "${take.sha256}"`);
      }

      // Check physical transient measurements
      if (!isFiniteNumber(take.dur_s) || take.dur_s <= 0) {
        errors.push(`${takePrefix} dur_s must be a finite positive number, got ${take.dur_s}`);
      }

      if (!isFiniteNumber(take.onset_s) || take.onset_s < 0) {
        errors.push(`${takePrefix} onset_s must be a finite non-negative number, got ${take.onset_s}`);
      }

      if (!isFiniteNumber(take.peak_s) || take.peak_s < 0) {
        errors.push(`${takePrefix} peak_s must be a finite non-negative number, got ${take.peak_s}`);
      }

      if (!isFiniteNumber(take.end_s) || take.end_s < 0) {
        errors.push(`${takePrefix} end_s must be a finite non-negative number, got ${take.end_s}`);
      }

      // Transient relational sanity
      if (isFiniteNumber(take.onset_s) && isFiniteNumber(take.end_s)) {
        if (take.onset_s > take.end_s) {
          errors.push(`${takePrefix} onset_s (${take.onset_s}) cannot exceed end_s (${take.end_s})`);
        }
      }

      if (isFiniteNumber(take.dur_s)) {
        if (isFiniteNumber(take.onset_s) && take.onset_s > take.dur_s + 0.001) {
          errors.push(`${takePrefix} onset_s (${take.onset_s}) exceeds dur_s (${take.dur_s})`);
        }
        if (isFiniteNumber(take.peak_s) && take.peak_s > take.dur_s + 0.001) {
          errors.push(`${takePrefix} peak_s (${take.peak_s}) exceeds dur_s (${take.dur_s})`);
        }
      }

      if (take.peak_db !== undefined && (!isFiniteNumber(take.peak_db) || take.peak_db > 0.01)) {
        errors.push(`${takePrefix} peak_db must be a number <= 0 dB, got ${take.peak_db}`);
      }

      if (!Array.isArray(take.checks)) {
        errors.push(`${takePrefix} checks must be an array of warning codes`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates a complete sound kit directory on disk:
 * 1. Reads and validates kit.lock.json.
 * 2. Verifies that every take WAV file exists in the directory.
 * 3. Verifies that file content matches lockfile SHA-1.
 * 4. Computes EME SHA-256 digest for each file.
 * 5. Verifies that no rogue WAV files exist in the kit directory without lock registration.
 *
 * @param {string} kitDir Absolute or relative path to kit directory
 * @returns {{ valid: boolean, errors: string[], lock: object|null, assetProvenance: object }}
 */
function validateKitDirectory(kitDir) {
  const errors = [];
  const assetProvenance = {};

  if (!fs.existsSync(kitDir)) {
    return {
      valid: false,
      errors: [`Kit directory does not exist: "${kitDir}"`],
      lock: null,
      assetProvenance
    };
  }

  const realDir = fs.realpathSync(kitDir);
  const lockPath = path.join(realDir, 'kit.lock.json');

  if (!fs.existsSync(lockPath)) {
    return {
      valid: false,
      errors: [`kit.lock.json missing in "${kitDir}"`],
      lock: null,
      assetProvenance
    };
  }

  let lockData;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    lockData = JSON.parse(raw);
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse kit.lock.json: ${err.message}`],
      lock: null,
      assetProvenance
    };
  }

  const lockRes = validateKitLock(lockData);
  if (!lockRes.valid) {
    errors.push(...lockRes.errors);
  }

  const expectedFiles = new Set();

  for (const [roleName, roleEntry] of Object.entries(lockData.roles || {})) {
    if (!roleEntry || !Array.isArray(roleEntry.takes)) continue;

    for (let i = 0; i < roleEntry.takes.length; i++) {
      const take = roleEntry.takes[i];
      if (!take || !take.file) continue;

      expectedFiles.add(take.file);
      const filePath = path.join(realDir, take.file);

      if (!fs.existsSync(filePath)) {
        errors.push(`Missing audio asset file: "${take.file}" for role "${roleName}"`);
        continue;
      }

      // Read file and verify digests
      let buf;
      try {
        buf = fs.readFileSync(filePath);
      } catch (err) {
        errors.push(`Cannot read asset file "${take.file}": ${err.message}`);
        continue;
      }

      const actualSha1 = crypto.createHash('sha1').update(buf).digest('hex');
      if (take.sha1 && actualSha1.toLowerCase() !== take.sha1.toLowerCase()) {
        errors.push(
          `SHA-1 mismatch on "${take.file}": expected ${take.sha1}, computed ${actualSha1}`
        );
      }

      const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex');
      if (take.sha256 && actualSha256.toLowerCase() !== take.sha256.toLowerCase()) {
        errors.push(
          `SHA-256 mismatch on "${take.file}": expected ${take.sha256}, computed ${actualSha256}`
        );
      }

      // Record full EME asset provenance
      assetProvenance[take.file] = {
        role: roleName,
        takeIndex: i,
        file: take.file,
        fullPath: filePath,
        sound: roleEntry.sound,
        align: roleEntry.align,
        level_db: roleEntry.level_db,
        seed: take.seed,
        planned_seed: take.planned_seed !== undefined ? take.planned_seed : take.seed,
        pitch: take.pitch,
        onset_s: take.onset_s,
        peak_s: take.peak_s,
        end_s: take.end_s,
        dur_s: take.dur_s,
        peak_db: take.peak_db,
        lufs_m_max: take.lufs_m_max,
        sha1: actualSha1,
        sha256: actualSha256,
        bankVersion: lockData.bank,
        earshotVersion: lockData.earshot,
        sampleRate: lockData.sr,
        checks: take.checks || []
      };
    }
  }

  // Check for rogue WAV files on disk not registered in lock
  const diskFiles = fs.readdirSync(realDir);
  for (const f of diskFiles) {
    if (f.toLowerCase().endsWith('.wav') && !expectedFiles.has(f)) {
      errors.push(`Unregistered audio asset found on disk: "${f}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lock: lockData,
    assetProvenance
  };
}

module.exports = {
  validateKitDefinition,
  validateKitLock,
  validateKitDirectory
};
