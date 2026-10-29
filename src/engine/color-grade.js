/**
 * EME Color Grade Model & Validation (CG-01 / Phase 17)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateObject } = require('./validator.js');

const COLOR_GRADE_SCHEMA_PATH = path.resolve(__dirname, '../../schema/eme-color-grade.v1.schema.json');
let _cachedSchema = null;

function getColorGradeSchema() {
  if (!_cachedSchema) {
    _cachedSchema = JSON.parse(fs.readFileSync(COLOR_GRADE_SCHEMA_PATH, 'utf8'));
  }
  return _cachedSchema;
}

function createDefaultCurve() {
  return [
    { x: 0.0, y: 0.0, rightControl: { x: 0.333, y: 0.333 } },
    { x: 1.0, y: 1.0, leftControl: { x: 0.667, y: 0.667 } }
  ];
}

function createDefaultHslChannel() {
  return {
    hue: 0.0,
    saturation: 0.0,
    lightness: 0.0
  };
}

function createDefaultColorGrade(id = `grade_${Date.now()}`, options = {}) {
  return {
    id,
    schemaVersion: "1.0.0",
    revision: 0,
    enabled: options.enabled !== undefined ? options.enabled : true,
    name: options.name || "Default Grade",
    colorSpaces: {
      input: options.inputSpace || "rec709",
      working: options.workingSpace || "rec709",
      lutDomain: "rec709",
      output: options.outputSpace || "rec709"
    },
    exposure: 0.0,
    whiteBalance: {
      temperature: 0.0,
      tint: 0.0
    },
    primary: {
      lift: [0.0, 0.0, 0.0],
      gamma: [1.0, 1.0, 1.0],
      gain: [1.0, 1.0, 1.0],
      offset: [0.0, 0.0, 0.0]
    },
    curves: {
      master: createDefaultCurve(),
      red: createDefaultCurve(),
      green: createDefaultCurve(),
      blue: createDefaultCurve(),
      luma: createDefaultCurve()
    },
    hsl: {
      red: createDefaultHslChannel(),
      orange: createDefaultHslChannel(),
      yellow: createDefaultHslChannel(),
      green: createDefaultHslChannel(),
      cyan: createDefaultHslChannel(),
      blue: createDefaultHslChannel(),
      purple: createDefaultHslChannel(),
      magenta: createDefaultHslChannel()
    },
    lut: {
      enabled: false,
      intensity: 1.0,
      interpolation: "tetrahedral"
    },
    skinProtection: {
      enabled: false,
      weight: 0.8,
      tolerance: 0.3
    }
  };
}

function validateColorGrade(grade) {
  const schema = getColorGradeSchema();
  const errors = validateObject(grade, schema, schema);

  // Additional semantic validations:
  if (grade.curves) {
    for (const [chan, pts] of Object.entries(grade.curves)) {
      if (!Array.isArray(pts) || pts.length < 2) {
        errors.push(`$.curves.${chan}: Must have at least 2 control points`);
        continue;
      }
      // Verify x monotonically increasing
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < pts[i - 1].x) {
          errors.push(`$.curves.${chan}: Points must be strictly non-decreasing in x (point ${i} has x=${pts[i].x} < ${pts[i - 1].x})`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function cloneColorGrade(grade) {
  return JSON.parse(JSON.stringify(grade));
}

function hashColorGrade(grade) {
  // Strip transient or recommendation fields before hashing
  const normalized = {
    colorSpaces: grade.colorSpaces,
    exposure: grade.exposure,
    whiteBalance: grade.whiteBalance,
    primary: grade.primary,
    curves: grade.curves,
    hsl: grade.hsl,
    lut: grade.lut,
    skinProtection: grade.skinProtection
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

module.exports = {
  getColorGradeSchema,
  createDefaultColorGrade,
  createDefaultCurve,
  createDefaultHslChannel,
  validateColorGrade,
  cloneColorGrade,
  hashColorGrade
};
