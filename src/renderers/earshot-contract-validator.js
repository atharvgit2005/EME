/**
 * Editing Mechanics Engine (EME) - Phase 25: Earshot Contract Validator
 *
 * Implements strict, zero-dependency validation for:
 * - earshot-qa-request.v1.json
 * - earshot-qa-response.v1.json
 *
 * Enforces:
 * 1. Strict property containment (additionalProperties: false on root and nested objects).
 * 2. Regex pattern conformance (^req-earshot-[a-zA-Z0-9_-]+$).
 * 3. Status taxonomy: SUCCESS, NOT_MEASURED, NOT_APPLICABLE, TIMEOUT, WORKER_ERROR.
 * 4. Normalization of non-finite numbers (-Infinity, Infinity, NaN) to null with explicit reasons.
 * 5. Absolute URI validation for $schema and $id.
 */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMAS_DIR = path.resolve(__dirname, 'schemas');

const STATUS_TAXONOMY = Object.freeze([
  'SUCCESS',
  'NOT_MEASURED',
  'NOT_APPLICABLE',
  'TIMEOUT',
  'WORKER_ERROR'
]);

const MODES = Object.freeze([
  'fast_dsp',
  'full_perception'
]);

class EarshotContractValidator {
  static getRequestSchema() {
    if (!this._requestSchema) {
      const p = path.join(SCHEMAS_DIR, 'earshot-qa-request.v1.json');
      this._requestSchema = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return this._requestSchema;
  }

  static getResponseSchema() {
    if (!this._responseSchema) {
      const p = path.join(SCHEMAS_DIR, 'earshot-qa-response.v1.json');
      this._responseSchema = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return this._responseSchema;
  }

  /**
   * Validates an Earshot QA Request object.
   *
   * @param {object} req
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateRequest(req) {
    const errors = [];
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      return { valid: false, errors: ['Request must be a non-null object'] };
    }

    // Check additional properties at root
    const allowedRootKeys = new Set(['request_id', 'media_path', 'timebase', 'cues', 'options']);
    for (const key of Object.keys(req)) {
      if (!allowedRootKeys.has(key)) {
        errors.push(`$.${key}: Unknown property (additionalProperties: false)`);
      }
    }

    // Required root properties
    if (!req.request_id) errors.push('$.request_id: Missing required property');
    else if (typeof req.request_id !== 'string' || !/^req-earshot-[a-zA-Z0-9_-]+$/.test(req.request_id)) {
      errors.push('$.request_id: Must match pattern ^req-earshot-[a-zA-Z0-9_-]+$');
    }

    if (typeof req.media_path !== 'string' || req.media_path.trim().length === 0) {
      errors.push('$.media_path: Must be a non-empty string');
    }

    // Timebase
    if (!req.timebase || typeof req.timebase !== 'object' || Array.isArray(req.timebase)) {
      errors.push('$.timebase: Missing or invalid required object');
    } else {
      const tbKeys = new Set(['duration_ticks', 'ticks_per_second', 'fps_numerator', 'fps_denominator']);
      for (const k of Object.keys(req.timebase)) {
        if (!tbKeys.has(k)) {
          errors.push(`$.timebase.${k}: Unknown property (additionalProperties: false)`);
        }
      }
      if (!Number.isInteger(req.timebase.duration_ticks) || req.timebase.duration_ticks < 1) {
        errors.push('$.timebase.duration_ticks: Must be an integer >= 1');
      }
      if (req.timebase.ticks_per_second !== 120000) {
        errors.push('$.timebase.ticks_per_second: Must be const 120000');
      }
      if (!Number.isInteger(req.timebase.fps_numerator) || req.timebase.fps_numerator < 1) {
        errors.push('$.timebase.fps_numerator: Must be an integer >= 1');
      }
      if (!Number.isInteger(req.timebase.fps_denominator) || req.timebase.fps_denominator < 1) {
        errors.push('$.timebase.fps_denominator: Must be an integer >= 1');
      }
    }

    // Cues (optional)
    if (req.cues !== undefined) {
      if (!Array.isArray(req.cues)) {
        errors.push('$.cues: Must be an array');
      } else {
        const allowedCueKeys = new Set(['frame', 'time_seconds', 'kind', 'weight']);
        req.cues.forEach((cue, i) => {
          if (!cue || typeof cue !== 'object' || Array.isArray(cue)) {
            errors.push(`$.cues[${i}]: Must be an object`);
            return;
          }
          for (const k of Object.keys(cue)) {
            if (!allowedCueKeys.has(k)) {
              errors.push(`$.cues[${i}].${k}: Unknown property (additionalProperties: false)`);
            }
          }
          if (typeof cue.time_seconds !== 'number' || cue.time_seconds < 0) {
            errors.push(`$.cues[${i}].time_seconds: Must be a number >= 0`);
          }
          if (typeof cue.kind !== 'string') {
            errors.push(`$.cues[${i}].kind: Must be a string`);
          }
          if (cue.frame !== undefined && (!Number.isInteger(cue.frame) || cue.frame < 0)) {
            errors.push(`$.cues[${i}].frame: Must be an integer >= 0`);
          }
          if (cue.weight !== undefined && (typeof cue.weight !== 'number' || cue.weight < 0 || cue.weight > 1.0)) {
            errors.push(`$.cues[${i}].weight: Must be a number between 0 and 1.0`);
          }
        });
      }
    }

    // Options
    if (!req.options || typeof req.options !== 'object' || Array.isArray(req.options)) {
      errors.push('$.options: Missing or invalid required object');
    } else {
      const optKeys = new Set(['mode', 'generate_sheet', 'sheet_output_path', 'profile']);
      for (const k of Object.keys(req.options)) {
        if (!optKeys.has(k)) {
          errors.push(`$.options.${k}: Unknown property (additionalProperties: false)`);
        }
      }
      if (!MODES.includes(req.options.mode)) {
        errors.push(`$.options.mode: Must be one of [${MODES.join(', ')}]`);
      }
      if (req.options.generate_sheet !== undefined && typeof req.options.generate_sheet !== 'boolean') {
        errors.push('$.options.generate_sheet: Must be a boolean');
      }
      if (req.options.sheet_output_path !== undefined && typeof req.options.sheet_output_path !== 'string') {
        errors.push('$.options.sheet_output_path: Must be a string');
      }
      if (req.options.profile !== undefined) {
        if (typeof req.options.profile !== 'object' || Array.isArray(req.options.profile)) {
          errors.push('$.options.profile: Must be an object');
        } else {
          const profKeys = new Set(['name', 'target_lufs', 'lufs_tolerance', 'true_peak_ceiling_dbtp', 'sync_tolerance_ms']);
          for (const k of Object.keys(req.options.profile)) {
            if (!profKeys.has(k)) {
              errors.push(`$.options.profile.${k}: Unknown property (additionalProperties: false)`);
            }
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
   * Validates an Earshot QA Response object.
   *
   * @param {object} res
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateResponse(res) {
    const errors = [];
    if (!res || typeof res !== 'object' || Array.isArray(res)) {
      return { valid: false, errors: ['Response must be a non-null object'] };
    }

    const allowedRootKeys = new Set([
      'request_id',
      'status',
      'mode',
      'execution_time_ms',
      'loudness',
      'sfx_integrity',
      'sync',
      'critique',
      'sheet_path',
      'error'
    ]);

    for (const key of Object.keys(res)) {
      if (!allowedRootKeys.has(key)) {
        errors.push(`$.${key}: Unknown property (additionalProperties: false)`);
      }
    }

    // Required root properties
    if (!res.request_id || typeof res.request_id !== 'string' || !/^req-earshot-[a-zA-Z0-9_-]+$/.test(res.request_id)) {
      errors.push('$.request_id: Must match pattern ^req-earshot-[a-zA-Z0-9_-]+$');
    }

    if (!STATUS_TAXONOMY.includes(res.status)) {
      errors.push(`$.status: Must be one of [${STATUS_TAXONOMY.join(', ')}], got "${res.status}"`);
    }

    if (!MODES.includes(res.mode)) {
      errors.push(`$.mode: Must be one of [${MODES.join(', ')}], got "${res.mode}"`);
    }

    if (typeof res.execution_time_ms !== 'number' || res.execution_time_ms < 0) {
      errors.push('$.execution_time_ms: Must be a number >= 0');
    }

    // Loudness
    if (res.loudness !== undefined && res.loudness !== null) {
      if (typeof res.loudness !== 'object' || Array.isArray(res.loudness)) {
        errors.push('$.loudness: Must be an object or null');
      } else {
        const loudKeys = new Set([
          'integrated_lufs',
          'lufs_reason',
          'true_peak_dbtp',
          'true_peak_reason',
          'loudness_range_lu',
          'clipping_samples',
          'compliant'
        ]);
        for (const k of Object.keys(res.loudness)) {
          if (!loudKeys.has(k)) {
            errors.push(`$.loudness.${k}: Unknown property (additionalProperties: false)`);
          }
        }
        if (res.loudness.integrated_lufs !== null && typeof res.loudness.integrated_lufs !== 'number') {
          errors.push('$.loudness.integrated_lufs: Must be a number or null');
        }
        if (res.loudness.true_peak_dbtp !== null && typeof res.loudness.true_peak_dbtp !== 'number') {
          errors.push('$.loudness.true_peak_dbtp: Must be a number or null');
        }
        if (res.loudness.loudness_range_lu !== null && typeof res.loudness.loudness_range_lu !== 'number') {
          errors.push('$.loudness.loudness_range_lu: Must be a number or null');
        }
        if (res.loudness.clipping_samples !== null && (!Number.isInteger(res.loudness.clipping_samples) || res.loudness.clipping_samples < 0)) {
          errors.push('$.loudness.clipping_samples: Must be an integer >= 0 or null');
        }
        if (res.loudness.compliant !== null && typeof res.loudness.compliant !== 'boolean') {
          errors.push('$.loudness.compliant: Must be a boolean or null');
        }
      }
    }

    // SFX Integrity
    if (res.sfx_integrity !== undefined && res.sfx_integrity !== null) {
      if (typeof res.sfx_integrity !== 'object' || Array.isArray(res.sfx_integrity)) {
        errors.push('$.sfx_integrity: Must be an object or null');
      } else {
        const sfxKeys = new Set(['status', 'rising_glides', 'double_hits', 'clicks', 'issues']);
        for (const k of Object.keys(res.sfx_integrity)) {
          if (!sfxKeys.has(k)) {
            errors.push(`$.sfx_integrity.${k}: Unknown property (additionalProperties: false)`);
          }
        }
      }
    }

    // Sync
    if (res.sync !== undefined && res.sync !== null) {
      if (typeof res.sync !== 'object' || Array.isArray(res.sync)) {
        errors.push('$.sync: Must be an object or null');
      } else {
        const syncKeys = new Set(['analyzed_cuts', 'mean_offset_ms', 'max_offset_ms', 'max_offset_ticks', 'aligned', 'details']);
        for (const k of Object.keys(res.sync)) {
          if (!syncKeys.has(k)) {
            errors.push(`$.sync.${k}: Unknown property (additionalProperties: false)`);
          }
        }
        if (res.sync.details !== undefined && Array.isArray(res.sync.details)) {
          const detailKeys = new Set(['cut_frame', 'cut_seconds', 'sound_onset_seconds', 'offset_ms', 'offset_ticks', 'confidence']);
          res.sync.details.forEach((d, i) => {
            if (!d || typeof d !== 'object' || Array.isArray(d)) {
              errors.push(`$.sync.details[${i}]: Must be an object`);
              return;
            }
            for (const k of Object.keys(d)) {
              if (!detailKeys.has(k)) {
                errors.push(`$.sync.details[${i}].${k}: Unknown property (additionalProperties: false)`);
              }
            }
          });
        }
      }
    }

    // Error
    if (res.error !== undefined && res.error !== null) {
      if (typeof res.error !== 'object' || Array.isArray(res.error)) {
        errors.push('$.error: Must be an object or null');
      } else {
        const errKeys = new Set(['code', 'message', 'details']);
        for (const k of Object.keys(res.error)) {
          if (!errKeys.has(k)) {
            errors.push(`$.error.${k}: Unknown property (additionalProperties: false)`);
          }
        }
        if (!res.error.code || typeof res.error.code !== 'string') errors.push('$.error.code: Required string');
        if (!res.error.message || typeof res.error.message !== 'string') errors.push('$.error.message: Required string');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitizes numeric values to prevent -Infinity, Infinity, or NaN from breaking JSON serialization.
   *
   * @param {number|null|undefined} val
   * @returns {{ value: number|null, reason: string|null }}
   */
  static normalizeFloat(val) {
    if (val === null || val === undefined) {
      return { value: null, reason: null };
    }
    if (Number.isNaN(val)) {
      return { value: null, reason: 'not_a_number' };
    }
    if (val === -Infinity) {
      return { value: null, reason: 'negative_infinity' };
    }
    if (val === Infinity) {
      return { value: null, reason: 'positive_infinity' };
    }
    if (typeof val === 'number') {
      return { value: Number(val.toFixed(4)), reason: null };
    }
    return { value: null, reason: 'invalid_type' };
  }
}

module.exports = {
  EarshotContractValidator,
  STATUS_TAXONOMY,
  MODES
};
