/**
 * EME Color Operations & Grading Math Tests (CG-01 / Phase 17)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createDefaultColorGrade } = require('../src/engine/color-grade.js');
const {
  gradePixelRgb,
  evaluateCurve,
  gradeImageBuffer
} = require('../src/engine/color-operations.js');
const { parseCubeLutFile } = require('../src/engine/lut-parser.js');

test('Color Operations: default grade is exact identity (zero pixel change)', () => {
  const grade = createDefaultColorGrade('identity_test');
  const samples = [
    [0.0, 0.0, 0.0],
    [1.0, 1.0, 1.0],
    [0.5, 0.5, 0.5],
    [0.2, 0.7, 0.4],
    [0.85, 0.12, 0.63]
  ];

  for (const [r, g, b] of samples) {
    const out = gradePixelRgb(r, g, b, grade);
    assert.ok(Math.abs(out[0] - r) < 1e-4, `R mismatch: ${out[0]} vs ${r}`);
    assert.ok(Math.abs(out[1] - g) < 1e-4, `G mismatch: ${out[1]} vs ${g}`);
    assert.ok(Math.abs(out[2] - b) < 1e-4, `B mismatch: ${out[2]} vs ${b}`);
  }
});

test('Color Operations: Exposure +1 EV doubles linear luminance', () => {
  const grade = createDefaultColorGrade('exposure_test');
  grade.exposure = 1.0; // +1 EV
  const out = gradePixelRgb(0.5, 0.5, 0.5, grade);
  // Linear luminance should double, leading to higher output code value
  assert.ok(out[0] > 0.5);
  assert.ok(out[1] > 0.5);
  assert.ok(out[2] > 0.5);
});

test('Color Operations: White Balance warm increases red and decreases blue', () => {
  const grade = createDefaultColorGrade('wb_test');
  grade.whiteBalance.temperature = 0.5; // warm
  const out = gradePixelRgb(0.5, 0.5, 0.5, grade);
  assert.ok(out[0] > 0.5, `Red should increase, got ${out[0]}`);
  assert.ok(out[2] < 0.5, `Blue should decrease, got ${out[2]}`);
});

test('Color Operations: Lift raises shadows without affecting pure white', () => {
  const grade = createDefaultColorGrade('lift_test');
  grade.primary.lift = [0.2, 0.2, 0.2];

  const shadowOut = gradePixelRgb(0.0, 0.0, 0.0, grade);
  assert.ok(shadowOut[0] >= 0.2, `Black should be lifted, got ${shadowOut[0]}`);

  const highlightOut = gradePixelRgb(1.0, 1.0, 1.0, grade);
  assert.ok(Math.abs(highlightOut[0] - 1.0) < 1e-4, `White should stay 1.0, got ${highlightOut[0]}`);
});

test('Color Operations: S-Curve increases contrast (darkens shadows, brightens highlights)', () => {
  // S-curve with control points
  const sCurve = [
    { x: 0.0, y: 0.0 },
    { x: 0.25, y: 0.15 }, // darkens lower quarter
    { x: 0.75, y: 0.85 }, // brightens upper quarter
    { x: 1.0, y: 1.0 }
  ];

  const darkVal = evaluateCurve(sCurve, 0.25);
  assert.ok(darkVal < 0.25, `Expected darkVal < 0.25, got ${darkVal}`);

  const brightVal = evaluateCurve(sCurve, 0.75);
  assert.ok(brightVal > 0.75, `Expected brightVal > 0.75, got ${brightVal}`);
});

test('Color Operations: 8-Channel Selective HSL isolated to target hue', () => {
  const grade = createDefaultColorGrade('hsl_test');
  // Shift Red hue by +30 degrees
  grade.hsl.red.hue = 30.0;

  // Pure Red pixel (H = 0)
  const redOut = gradePixelRgb(1.0, 0.0, 0.0, grade);
  assert.ok(redOut[1] > 0.1, `Red pixel should shift toward yellow/orange, G is ${redOut[1]}`);

  // Pure Blue pixel (H = 240) - should NOT be affected by Red adjustment
  const blueOut = gradePixelRgb(0.0, 0.0, 1.0, grade);
  assert.ok(Math.abs(blueOut[0] - 0.0) < 1e-4);
  assert.ok(Math.abs(blueOut[1] - 0.0) < 1e-4);
  assert.ok(Math.abs(blueOut[2] - 1.0) < 1e-4);
});

test('Color Operations: Skin Tone Protection preserves skin colors under creative tint', () => {
  const grade = createDefaultColorGrade('skin_test');
  grade.whiteBalance.tint = -0.6; // Heavy green tint
  grade.skinProtection.enabled = true;
  grade.skinProtection.weight = 0.85;

  // Typical skin tone color (warm beige/peach)
  const skinR = 0.85, skinG = 0.65, skinB = 0.55;
  const protectedSkin = gradePixelRgb(skinR, skinG, skinB, grade);

  // Turn off skin protection to compare
  grade.skinProtection.enabled = false;
  const unprotectedSkin = gradePixelRgb(skinR, skinG, skinB, grade);

  // Protected skin should have much higher Red/Blue and lower Green compared to unprotected
  assert.ok(protectedSkin[0] > unprotectedSkin[0]);
  assert.ok(protectedSkin[1] < unprotectedSkin[1]);
});

test('Color Operations: Image buffer processing preserves dimensions and alpha', () => {
  const w = 4, h = 4;
  const inBuf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < inBuf.length; i += 4) {
    inBuf[i] = 128;
    inBuf[i + 1] = 64;
    inBuf[i + 2] = 32;
    inBuf[i + 3] = 255; // Alpha
  }

  const grade = createDefaultColorGrade('buf_test');
  grade.exposure = 0.5;
  const outBuf = gradeImageBuffer(inBuf, w, h, grade, null, 4);

  assert.equal(outBuf.length, inBuf.length);
  assert.equal(outBuf[3], 255); // Alpha preserved
  assert.ok(outBuf[0] > 128);   // Exposure boosted
});
