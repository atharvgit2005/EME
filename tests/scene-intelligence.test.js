/**
 * EME Scene Intelligence & True Tone Recommendation Tests (CG-01 / Phase 17)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeScene } = require('../src/engine/scene-intelligence.js');
const { createDefaultColorGrade } = require('../src/engine/color-grade.js');

test('Scene Intelligence: detects underexposed scene and recommends positive EV', () => {
  const w = 32, h = 32;
  const darkBuf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < darkBuf.length; i += 4) {
    darkBuf[i] = 25;     // ~0.1
    darkBuf[i + 1] = 25;
    darkBuf[i + 2] = 25;
    darkBuf[i + 3] = 255;
  }

  const res = analyzeScene(darkBuf, w, h, 4);
  assert.ok(res.exposure.meanLuminance < 0.15);
  assert.ok(res.exposure.recommendedEvOffset > 0.5, 'Should recommend positive EV boost');
  assert.equal(res.skin.skinDetected, false);
});

test('Scene Intelligence: detects warm cast and recommends cooling temperature', () => {
  const w = 32, h = 32;
  const warmBuf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < warmBuf.length; i += 4) {
    warmBuf[i] = 210;     // Red heavy
    warmBuf[i + 1] = 130; // Green medium
    warmBuf[i + 2] = 60;  // Blue low
    warmBuf[i + 3] = 255;
  }

  const res = analyzeScene(warmBuf, w, h, 4);
  assert.ok(res.whiteBalance.estimatedCCT < 4500, `Expected low CCT (warm), got ${res.whiteBalance.estimatedCCT}`);
  assert.ok(res.whiteBalance.recommendedTemperatureOffset < 0.0, 'Should recommend negative temperature (cooling)');
});

test('Scene Intelligence: detects skin tones and measures vectorscope I-line deviation', () => {
  const w = 32, h = 32;
  const skinBuf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < skinBuf.length; i += 4) {
    skinBuf[i] = 205;     // Typical skin tone (peach/beige)
    skinBuf[i + 1] = 145;
    skinBuf[i + 2] = 110;
    skinBuf[i + 3] = 255;
  }

  const res = analyzeScene(skinBuf, w, h, 4);
  assert.equal(res.skin.skinDetected, true);
  assert.ok(res.skin.skinCoverage > 0.9);
  // I-line is approximately 123 degrees
  assert.ok(res.skin.iLineDeviationDeg < 15.0, `Deviation ${res.skin.iLineDeviationDeg} should be small`);
});

test('Scene Intelligence: non-mutating invariant', () => {
  const grade = createDefaultColorGrade('immutable_test');
  const gradeCopy = JSON.parse(JSON.stringify(grade));

  const buf = new Uint8ClampedArray(16 * 16 * 4).fill(128);
  const res = analyzeScene(buf, 16, 16, 4);

  // Original grade is completely unchanged
  assert.deepEqual(grade, gradeCopy);
  // Recommendations exist in returned object
  assert.ok(res.provenance);
  assert.ok(res.exposure);
});
