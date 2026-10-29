/**
 * EME Certified LUT Registry (Phase 17 Stage 1)
 * Enforces the closed vocabulary of certified creative 3D LUTs.
 * Rejects unknown identifiers and non-executable policy sentinels.
 * Cryptographically verifies file existence and SHA-256 digests.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

const CERTIFIED_LUTS = {
  bleach_bypass: {
    id: 'bleach_bypass',
    name: 'Bleach Bypass Contrast',
    relativePath: 'assets/luts/bleach_bypass_33.cube',
    size: 33,
    sha256: 'f493b33bbd4830e0f3a90deca7bf8a66c53d8d9803bb85e4e624089446224ce6'
  },
  warm_golden: {
    id: 'warm_golden',
    name: 'Warm Golden Hour',
    relativePath: 'assets/luts/night_warm_yellow_33.cube',
    size: 33,
    sha256: '636d5c111b3504300762ba4ddffbea1b1a97850a2d443f2a9bf43de799e9a0e0'
  },
  teal_orange: {
    id: 'teal_orange',
    name: 'Cinematic Teal & Orange',
    relativePath: 'assets/luts/cine_teal_orange_33.cube',
    size: 33,
    sha256: 'd6838aa09f712d8eb09ab4eb9dc812a102fde2ec40ec6962f6cceee53b3b7cb0'
  },
  cinematic_contrast: {
    id: 'cinematic_contrast',
    name: 'Cinematic Contrast',
    relativePath: 'assets/luts/cine_freedom_33.cube',
    size: 33,
    sha256: '59d369a0d79149dd875d9fab6b3503ff2b603909372afe2a24131a75bb3cdea3'
  },
  true_tone: {
    id: 'true_tone',
    name: 'True Tone Natural Enhance',
    relativePath: 'assets/luts/quality_enhance_33.cube',
    size: 33,
    sha256: '4ee7dbd9ebd39ffe32c3936ab4672afa1180f50c12bd24189e3586872fa4b236'
  }
};

const POLICY_SENTINELS = new Set([
  'needs_review',
  'needs_planning',
  'keep_current'
]);

/**
 * Checks if an identifier belongs to the certified closed vocabulary.
 * @param {string} id 
 * @returns {boolean}
 */
function isCertifiedLutId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CERTIFIED_LUTS, id);
}

/**
 * Checks if an identifier is a non-executable policy sentinel.
 * @param {string} id 
 * @returns {boolean}
 */
function isSentinelId(id) {
  return typeof id === 'string' && POLICY_SENTINELS.has(id);
}

/**
 * Resolves a certified LUT identifier to its descriptor and absolute path.
 * Verifies file existence and SHA-256 digest on demand.
 * @param {string} id 
 * @param {object} [options]
 * @param {boolean} [options.verifyChecksum=true]
 * @returns {{ id: string, name: string, absolutePath: string, relativePath: string, size: number, sha256: string }}
 */
function resolveCertifiedLut(id, options = { verifyChecksum: true }) {
  if (isSentinelId(id)) {
    const err = new Error(`Cannot execute color grade with policy sentinel "${id}". Policy sentinels are strictly non-executable.`);
    err.code = 'ERR_SENTINEL_NOT_EXECUTABLE';
    throw err;
  }

  if (!isCertifiedLutId(id)) {
    const err = new Error(`Unregistered LUT identifier "${id}". Must be one of: ${Object.keys(CERTIFIED_LUTS).join(', ')}`);
    err.code = 'ERR_UNREGISTERED_LUT_ID';
    throw err;
  }

  const entry = CERTIFIED_LUTS[id];
  const absPath = path.resolve(ROOT, entry.relativePath);

  if (!fs.existsSync(absPath)) {
    const err = new Error(`Certified LUT file missing at: ${absPath}`);
    err.code = 'ERR_LUT_FILE_MISSING';
    throw err;
  }

  if (options.verifyChecksum !== false) {
    const fileBytes = fs.readFileSync(absPath);
    const actualSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
    if (actualSha !== entry.sha256) {
      const err = new Error(`Certified LUT integrity failure for "${id}". Expected SHA-256 ${entry.sha256}, but got ${actualSha}`);
      err.code = 'ERR_LUT_CHECKSUM_MISMATCH';
      throw err;
    }
  }

  return {
    ...entry,
    absolutePath: absPath
  };
}

/**
 * Validates the LUT block within a color grade payload.
 * @param {object} lutObj 
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLutBlock(lutObj) {
  const errors = [];
  if (!lutObj || typeof lutObj !== 'object') {
    return { valid: true, errors: [] }; // LUT block is optional or defaults to disabled
  }

  if (lutObj.enabled) {
    const targetId = lutObj.lutId || lutObj.assetId;
    if (!targetId && !lutObj.path) {
      errors.push('lut.enabled is true but neither lutId nor path is provided');
    } else if (targetId) {
      if (isSentinelId(targetId)) {
        errors.push(`lutId "${targetId}" is a policy sentinel and cannot be used in an executable grade`);
      } else if (!isCertifiedLutId(targetId)) {
        errors.push(`lutId "${targetId}" is not in the certified LUT vocabulary`);
      }
    }

    if (lutObj.intensity !== undefined) {
      if (typeof lutObj.intensity !== 'number' || Number.isNaN(lutObj.intensity) || !Number.isFinite(lutObj.intensity)) {
        errors.push('lut.intensity must be a finite number');
      } else if (lutObj.intensity < 0.0 || lutObj.intensity > 1.0) {
        errors.push(`lut.intensity must be between 0.0 and 1.0, got ${lutObj.intensity}`);
      }
    }

    if (lutObj.interpolation !== undefined) {
      const validInterp = ['tetrahedral', 'trilinear', 'nearest'];
      if (!validInterp.includes(lutObj.interpolation)) {
        errors.push(`lut.interpolation must be one of: ${validInterp.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  CERTIFIED_LUTS,
  POLICY_SENTINELS,
  isCertifiedLutId,
  isSentinelId,
  resolveCertifiedLut,
  validateLutBlock
};
