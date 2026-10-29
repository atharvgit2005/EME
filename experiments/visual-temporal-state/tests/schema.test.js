/**
 * Automated Tests for VTSM-01 Schema and Semantic Validation
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { VtsmTimebase } = require('../src/timebase.js');
const { VtsmStateModel } = require('../src/state-model.js');
const { VtsmValidator } = require('../src/validate-state.js');

function createSampleValidDoc() {
  const doc = VtsmStateModel.createDocument({
    source: {
      sha256: crypto.createHash('sha256').update('synthetic_test_video').digest('hex'),
      filePath: 'fixtures/fixture_a.mp4',
      dimensions: { width: 1920, height: 1080 },
      durationSec: 2.0,
      totalFrames: 60
    },
    rationalFps: { numerator: 30, denominator: 1 },
    provenance: {
      extractor: 'vtsm-test-suite',
      version: '0.1.0',
      license: 'MIT'
    }
  });

  doc.shots.push({
    shotId: 'shot_01',
    startFrame: 0,
    endFrame: 59,
    startPts: 0.0,
    endPts: 1.966667,
    cutConfidence: 1.0,
    cutType: 'initial'
  });

  doc.entities.push({
    entityId: 'ent_01',
    label: 'subject',
    shotId: 'shot_01',
    policyAcrossCuts: 'reset_on_cut'
  });

  for (let i = 0; i < 60; i++) {
    const pts = i / 30.0;
    const tick = VtsmTimebase.secondsToTicks(pts);
    const pixelBbox = { x: 100 + i * 5, y: 200, width: 80, height: 120 };
    const normBbox = VtsmStateModel.normalizeBbox(pixelBbox, 1920, 1080);
    const centerPixel = VtsmStateModel.computeCenter(pixelBbox);
    const centerNorm = VtsmStateModel.computeCenter(normBbox);

    doc.frames.push({
      frameIndex: i,
      pts,
      tick,
      shotId: 'shot_01',
      cameraMotion: {
        model: 'identity',
        translation: { dx: 0.0, dy: 0.0 },
        scale: 1.0,
        rotation: 0.0,
        confidence: 1.0,
        valid: true
      },
      observations: [
        {
          entityId: 'ent_01',
          bbox: {
            pixel: pixelBbox,
            normalized: normBbox
          },
          center: {
            pixel: centerPixel,
            normalized: centerNorm
          },
          visibility: 'visible',
          visibilityConfidence: 1.0,
          trackingConfidence: 0.98,
          motion: {
            raw: { dx: i > 0 ? 5.0 : 0.0, dy: 0.0, valid: i > 0 },
            compensated: { dx: i > 0 ? 5.0 : 0.0, dy: 0.0, valid: i > 0 }
          }
        }
      ]
    });
  }

  doc.events.push({
    eventId: 'evt_01',
    type: 'entrance',
    entityId: 'ent_01',
    frameIndex: 0,
    pts: 0.0,
    confidence: 1.0,
    details: { note: 'Initial appearance' }
  });

  return doc;
}

test('VTSM-01 Timebase: exact rational FPS normalization and tick conversion', () => {
  const norm24 = VtsmTimebase.normalizeFps(23.976);
  assert.deepEqual(norm24, { numerator: 24000, denominator: 1001 });

  const norm30 = VtsmTimebase.normalizeFps(30);
  assert.deepEqual(norm30, { numerator: 30, denominator: 1 });

  const ticks = VtsmTimebase.secondsToTicks(1.0);
  assert.equal(ticks, 120000);

  const sec = VtsmTimebase.ticksToSeconds(120000);
  assert.equal(sec, 1.0);

  assert.throws(() => VtsmTimebase.secondsToTicks(-0.5), TypeError);
  assert.throws(() => VtsmTimebase.secondsToTicks(NaN), TypeError);
  assert.throws(() => VtsmTimebase.ticksToSeconds(-10), TypeError);
});

test('VTSM-01 Schema Validator: passes canonical valid document', () => {
  const doc = createSampleValidDoc();
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, true, `Validation errors: ${res.errors.join(', ')}`);
});

test('VTSM-01 Schema Validator: rejects non-monotonic PTS progression', () => {
  const doc = createSampleValidDoc();
  // Introduce non-monotonic PTS at frame 10
  doc.frames[10].pts = doc.frames[9].pts - 0.01;
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('PTS non-monotonic')));
});

test('VTSM-01 Schema Validator: rejects non-monotonic integer ticks', () => {
  const doc = createSampleValidDoc();
  doc.frames[15].tick = doc.frames[14].tick; // Identical tick violation
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('tick non-monotonic')));
});

test('VTSM-01 Schema Validator: rejects dangling entity references', () => {
  const doc = createSampleValidDoc();
  doc.frames[5].observations[0].entityId = 'ghost_entity';
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('references unregistered entityId: ghost_entity')));
});

test('VTSM-01 Schema Validator: rejects dangling shot references in frame', () => {
  const doc = createSampleValidDoc();
  doc.frames[20].shotId = 'unregistered_shot';
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('references unknown shotId: unregistered_shot')));
});

test('VTSM-01 Schema Validator: rejects negative or zero bounding box dimensions', () => {
  const doc = createSampleValidDoc();
  doc.frames[2].observations[0].bbox.pixel.width = -10;
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('bbox dimensions must be positive')));
});

test('VTSM-01 Schema Validator: rejects out-of-range confidence scores', () => {
  const doc = createSampleValidDoc();
  doc.frames[0].observations[0].trackingConfidence = 1.45;
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('trackingConfidence must be [0..1]')));
});

test('VTSM-01 Schema Validator: rejects non-finite numeric coordinates', () => {
  const doc = createSampleValidDoc();
  doc.frames[8].observations[0].bbox.pixel.x = NaN;
  const res = VtsmValidator.validate(doc);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('coordinates must be finite')));
});
