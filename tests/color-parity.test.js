/**
 * EME Color Preview / Render Parity Conformance Test (CG-01 / Phase 17)
 * Compares lossless decoded outputs rendered via FFmpeg against reference CPU oracle.
 * Target: Mean Absolute Error <= 1.5 code values, P99 <= 4.0 code values.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createDefaultColorGrade } = require('../src/engine/color-grade.js');
const { gradeImageBuffer } = require('../src/engine/color-operations.js');
const { renderGradeHeadless } = require('../src/renderers/ffmpeg-color-compiler.js');
const { getOrLoadLut } = require('../src/engine/lut-evaluator.js');

const FIXTURES_DIR = path.resolve(__dirname, '../artifacts/parity_fixtures');

// Creates a synthetic PNG test pattern using ffmpeg lavfi or raw pixels
function createSyntheticRampImage(outPath, width = 256, height = 64) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const rawBytes = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const val = Math.floor((x / (width - 1)) * 255);
      rawBytes[idx] = val;     // R
      rawBytes[idx + 1] = val; // G
      rawBytes[idx + 2] = val; // B
    }
  }
  // Convert raw RGB to PNG via ffmpeg
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-s', `${width}x${height}`,
    '-i', '-',
    '-pix_fmt', 'rgb24',
    outPath
  ], { input: rawBytes });
}

function createSyntheticColorPatchImage(outPath, width = 256, height = 128) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const rawBytes = Buffer.alloc(width * height * 3);
  const patches = [
    [255, 0, 0],     // Red
    [0, 255, 0],     // Green
    [0, 0, 255],     // Blue
    [0, 255, 255],   // Cyan
    [255, 0, 255],   // Magenta
    [255, 255, 0],   // Yellow
    [210, 160, 130], // Skin tone 1
    [160, 110, 80],  // Skin tone 2
  ];

  const patchW = Math.floor(width / patches.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = Math.min(patches.length - 1, Math.floor(x / patchW));
      const [pr, pg, pb] = patches[pIdx];
      const idx = (y * width + x) * 3;
      rawBytes[idx] = pr;
      rawBytes[idx + 1] = pg;
      rawBytes[idx + 2] = pb;
    }
  }

  spawnSync('ffmpeg', [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-s', `${width}x${height}`,
    '-i', '-',
    '-pix_fmt', 'rgb24',
    outPath
  ], { input: rawBytes });
}

// Reads raw rgb24 pixels from any image file via ffmpeg
function readRawRgb24(filePath) {
  const res = spawnSync('ffmpeg', [
    '-v', 'error',
    '-i', filePath,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-'
  ]);
  if (res.status !== 0) {
    throw new Error(`Failed to decode raw RGB from ${filePath}: ${res.stderr.toString()}`);
  }
  return res.stdout;
}

// Compares two raw RGB24 buffers and computes error statistics
function computeParityMetrics(bufA, bufB) {
  assert.equal(bufA.length, bufB.length, 'Buffers must have identical byte lengths');
  const errors = [];
  let sumError = 0;
  let maxError = 0;

  for (let i = 0; i < bufA.length; i++) {
    const diff = Math.abs(bufA[i] - bufB[i]);
    errors.push(diff);
    sumError += diff;
    if (diff > maxError) maxError = diff;
  }

  errors.sort((a, b) => a - b);
  const mae = sumError / bufA.length;
  const p50 = errors[Math.floor(errors.length * 0.50)];
  const p95 = errors[Math.floor(errors.length * 0.95)];
  const p99 = errors[Math.floor(errors.length * 0.99)];

  return { mae, p50, p95, p99, maxError, totalSamples: bufA.length };
}

test('Parity Test 1: Neutral Ramp under Primary LGGO & Curves', () => {
  const inPath = path.join(FIXTURES_DIR, 'ramp_in.png');
  const refPath = path.join(FIXTURES_DIR, 'ramp_ref.png');
  const ffmpegPath = path.join(FIXTURES_DIR, 'ramp_ffmpeg.png');
  createSyntheticRampImage(inPath, 256, 64);

  const grade = createDefaultColorGrade('parity_grade_1');
  grade.exposure = 0.3; // +0.3 EV
  grade.primary.lift = [0.05, 0.05, 0.05];
  grade.primary.gamma = [1.1, 1.1, 1.1];
  grade.primary.gain = [1.05, 1.05, 1.05];

  // A. Reference CPU Oracle render
  const inRaw = readRawRgb24(inPath);
  const refRaw = gradeImageBuffer(inRaw, 256, 64, grade, null, 3);

  // B. Headless FFmpeg render
  renderGradeHeadless(inPath, ffmpegPath, grade, { lutSize: 33, lossless: true });
  const ffmpegRaw = readRawRgb24(ffmpegPath);

  // Compute parity statistics
  const metrics = computeParityMetrics(refRaw, ffmpegRaw);
  console.log('   Neutral Ramp Parity:', {
    mae: metrics.mae.toFixed(3),
    p95: metrics.p95,
    p99: metrics.p99,
    max: metrics.maxError
  });

  // Verify within approved thresholds: MAE <= 1.5, P99 <= 4.0
  assert.ok(metrics.mae <= 1.5, `MAE ${metrics.mae} exceeds 1.5 target`);
  assert.ok(metrics.p99 <= 4.0, `P99 ${metrics.p99} exceeds 4.0 target`);
});

test('Parity Test 2: Color Patches with Creative Teal & Orange 3D LUT', () => {
  const inPath = path.join(FIXTURES_DIR, 'patches_in.png');
  const ffmpegPath = path.join(FIXTURES_DIR, 'patches_ffmpeg.png');
  createSyntheticColorPatchImage(inPath, 256, 128);

  const lutPath = path.resolve(__dirname, '../assets/luts/cine_teal_orange_33.cube');
  const activeLut = getOrLoadLut(lutPath);

  const grade = createDefaultColorGrade('parity_grade_lut');
  grade.whiteBalance.temperature = 0.2; // warm
  grade.whiteBalance.tint = 0.1;
  grade.lut = {
    enabled: true,
    path: lutPath,
    intensity: 0.85,
    interpolation: 'tetrahedral'
  };

  // A. Reference CPU Oracle
  const inRaw = readRawRgb24(inPath);
  const refRaw = gradeImageBuffer(inRaw, 256, 128, grade, activeLut, 3);

  // B. Headless FFmpeg
  renderGradeHeadless(inPath, ffmpegPath, grade, { lutSize: 33, lossless: true });
  const ffmpegRaw = readRawRgb24(ffmpegPath);

  const metrics = computeParityMetrics(refRaw, ffmpegRaw);
  console.log('   Creative LUT Parity:', {
    mae: metrics.mae.toFixed(3),
    p95: metrics.p95,
    p99: metrics.p99,
    max: metrics.maxError
  });

  assert.ok(metrics.mae <= 1.5, `MAE ${metrics.mae} exceeds 1.5 target`);
  assert.ok(metrics.p99 <= 4.0, `P99 ${metrics.p99} exceeds 4.0 target`);
});
