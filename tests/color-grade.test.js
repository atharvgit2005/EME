/**
 * EME Color Grade Schema, Validator & 3D LUT Conformance Tests (CG-01 / Phase 17)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  createDefaultColorGrade,
  validateColorGrade,
  cloneColorGrade,
  hashColorGrade
} = require('../src/engine/color-grade.js');
const { parseCubeLutFile, parseCubeLutContent } = require('../src/engine/lut-parser.js');
const { evaluateCubeLut, applyLutToRgb } = require('../src/engine/lut-evaluator.js');
const {
  rec709ToLinear,
  linearToRec709,
  rgbToHsl,
  hslToRgb,
  circularHueDistance
} = require('../src/engine/color-space.js');

test('Color Grade Schema: default grade is valid', () => {
  const grade = createDefaultColorGrade('grade_test_01');
  const res = validateColorGrade(grade);
  assert.equal(res.valid, true, `Validation errors: ${res.errors.join(', ')}`);
  assert.equal(res.errors.length, 0);
});

test('Color Grade Schema: rejects out of range exposure and non-monotonic curve', () => {
  const grade = createDefaultColorGrade('grade_test_bad');
  grade.exposure = 99.0; // max is 6.0
  grade.curves.master = [
    { x: 0.5, y: 0.2 },
    { x: 0.2, y: 0.8 } // x goes backward
  ];
  const res = validateColorGrade(grade);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('exposure')));
  assert.ok(res.errors.some(e => e.includes('curves.master')));
});

test('Color Grade Hashing: deterministic and insensitive to ordering of keys', () => {
  const gradeA = createDefaultColorGrade('grade_hash_1');
  gradeA.exposure = 1.25;
  const gradeB = cloneColorGrade(gradeA);
  gradeB.sceneAnalysis = { estimatedCCT: 5600, confidence: 0.9 }; // transient analysis field
  assert.equal(hashColorGrade(gradeA), hashColorGrade(gradeB));
});

test('Color Space: Rec.709 transfer function round-trip accuracy', () => {
  const testValues = [0.0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0];
  for (const v of testValues) {
    const lin = rec709ToLinear(v);
    const back = linearToRec709(lin);
    assert.ok(Math.abs(v - back) < 1e-4, `Mismatch for ${v}: got ${back}`);
  }
});

test('Color Space: RGB <-> HSL round-trip accuracy', () => {
  const testColors = [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
    [1.0, 1.0, 0.0],
    [0.0, 1.0, 1.0],
    [1.0, 0.0, 1.0],
    [0.5, 0.5, 0.5]
  ];
  for (const [r, g, b] of testColors) {
    const hsl = rgbToHsl(r, g, b);
    const back = hslToRgb(hsl.h, hsl.s, hsl.l);
    assert.ok(Math.abs(r - back.r) < 1e-4);
    assert.ok(Math.abs(g - back.g) < 1e-4);
    assert.ok(Math.abs(b - back.b) < 1e-4);
  }
});

test('Color Space: circular hue distance', () => {
  assert.equal(circularHueDistance(10, 20), 10);
  assert.equal(circularHueDistance(350, 10), 20);
  assert.equal(circularHueDistance(0, 180), 180);
  assert.equal(circularHueDistance(5, 355), 10);
});

test('3D LUT: parse identity and evaluate tetrahedral interpolation', () => {
  const lutPath = path.resolve(__dirname, '../assets/luts/identity_17.cube');
  const lut = parseCubeLutFile(lutPath);
  assert.equal(lut.size, 17);
  assert.equal(lut.title, 'EME_Identity_17');

  const testCoords = [
    [0.0, 0.0, 0.0],
    [1.0, 1.0, 1.0],
    [0.234, 0.567, 0.891],
    [0.5, 0.5, 0.5]
  ];

  for (const [r, g, b] of testCoords) {
    const outTetra = evaluateCubeLut(lut, r, g, b, 'tetrahedral');
    assert.ok(Math.abs(outTetra[0] - r) < 1e-4, `R error: ${outTetra[0]} vs ${r}`);
    assert.ok(Math.abs(outTetra[1] - g) < 1e-4, `G error: ${outTetra[1]} vs ${g}`);
    assert.ok(Math.abs(outTetra[2] - b) < 1e-4, `B error: ${outTetra[2]} vs ${b}`);

    const outTrilin = evaluateCubeLut(lut, r, g, b, 'trilinear');
    assert.ok(Math.abs(outTrilin[0] - r) < 1e-4);
    assert.ok(Math.abs(outTrilin[1] - g) < 1e-4);
    assert.ok(Math.abs(outTrilin[2] - b) < 1e-4);
  }
});

test('3D LUT: inversion LUT gives exact 1 - c', () => {
  const lutPath = path.resolve(__dirname, '../assets/luts/invert_17.cube');
  const lut = parseCubeLutFile(lutPath);
  const [outR, outG, outB] = evaluateCubeLut(lut, 0.25, 0.60, 0.90, 'tetrahedral');
  assert.ok(Math.abs(outR - 0.75) < 1e-4);
  assert.ok(Math.abs(outG - 0.40) < 1e-4);
  assert.ok(Math.abs(outB - 0.10) < 1e-4);
});

test('3D LUT: intensity blending exact at 0.0, 0.5, 1.0', () => {
  const lutPath = path.resolve(__dirname, '../assets/luts/invert_17.cube');
  const lut = parseCubeLutFile(lutPath);

  // w = 0.0 (exact bypass)
  const bypass = applyLutToRgb(lut, 0.2, 0.4, 0.8, 0.0);
  assert.deepEqual(bypass, [0.2, 0.4, 0.8]);

  // w = 1.0 (full invert)
  const full = applyLutToRgb(lut, 0.2, 0.4, 0.8, 1.0);
  assert.ok(Math.abs(full[0] - 0.8) < 1e-4);
  assert.ok(Math.abs(full[1] - 0.6) < 1e-4);
  assert.ok(Math.abs(full[2] - 0.2) < 1e-4);

  // w = 0.5 (halfway: 0.2*0.5 + 0.8*0.5 = 0.5)
  const half = applyLutToRgb(lut, 0.2, 0.4, 0.8, 0.5);
  assert.ok(Math.abs(half[0] - 0.5) < 1e-4);
  assert.ok(Math.abs(half[1] - 0.5) < 1e-4);
  assert.ok(Math.abs(half[2] - 0.5) < 1e-4);
});
