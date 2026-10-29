const test = require('node:test');
const assert = require('node:assert/strict');
const { MediaTime, TICKS_PER_SECOND } = require('../src/engine/time.js');

test('MediaTime - Standard frame rates ticksPerFrame', () => {
  assert.equal(MediaTime.ticksPerFrame(24), 5000);
  assert.equal(MediaTime.ticksPerFrame(25), 4800);
  assert.equal(MediaTime.ticksPerFrame(30), 4000);
  assert.equal(MediaTime.ticksPerFrame(60), 2000);
});

test('MediaTime - Fractional NTSC frame rates ticksPerFrame exactness', () => {
  // 24000/1001 fps: 120000 * 1001 / 24000 = 5 * 1001 = 5,005 ticks
  assert.equal(MediaTime.ticksPerFrame({ numerator: 24000, denominator: 1001 }), 5005);
  // 30000/1001 fps: 120000 * 1001 / 30000 = 4 * 1001 = 4,004 ticks
  assert.equal(MediaTime.ticksPerFrame({ numerator: 30000, denominator: 1001 }), 4004);
  // 60000/1001 fps: 120000 * 1001 / 60000 = 2 * 1001 = 2,002 ticks
  assert.equal(MediaTime.ticksPerFrame({ numerator: 60000, denominator: 1001 }), 2002);
});

test('MediaTime - Conversion between ticks and seconds', () => {
  assert.equal(MediaTime.secondsToTicks(1.0), 120000);
  assert.equal(MediaTime.secondsToTicks(0.5), 60000);
  assert.equal(MediaTime.secondsToTicks(0.0), 0);
  assert.equal(MediaTime.ticksToSeconds(120000), 1.0);
  assert.equal(MediaTime.ticksToSeconds(60000), 0.5);
});

test('MediaTime - Frame boundary conversions', () => {
  const fps = { numerator: 60, denominator: 1 };
  assert.equal(MediaTime.frameToTicks(0, fps), 0);
  assert.equal(MediaTime.frameToTicks(60, fps), 120000);
  assert.equal(MediaTime.ticksToFrame(120000, fps), 60);
  assert.equal(MediaTime.ticksToFrame(2000, fps), 1);
  assert.equal(MediaTime.ticksToFrame(3999, fps), 1); // inside frame 1 half-open interval
  assert.equal(MediaTime.ticksToFrame(4000, fps), 2);
});

test('MediaTime - Audio sample deterministic conversion', () => {
  // At 48 kHz: 1 second (120,000 ticks) = 48,000 samples
  assert.equal(MediaTime.ticksToAudioSamples(120000, 48000), 48000);
  assert.equal(MediaTime.audioSamplesToTicks(48000, 48000), 120000);

  // At 44.1 kHz: 1 second = 44,100 samples
  assert.equal(MediaTime.ticksToAudioSamples(120000, 44100), 44100);
  assert.equal(MediaTime.audioSamplesToTicks(44100, 44100), 120000);

  // 1 frame at 24 fps (5000 ticks) -> 48000 * 5000 / 120000 = 2000 samples exact
  assert.equal(MediaTime.ticksToAudioSamples(5000, 48000), 2000);
  // 1 frame at 24 fps (5000 ticks) at 44.1kHz -> 44100 * 5000 / 120000 = 1837.5 -> rounded to 1838
  assert.equal(MediaTime.ticksToAudioSamples(5000, 44100), 1838);
});

test('MediaTime - Half-open intervals overlap and adjacency', () => {
  // Interval A: [0, 100) -> start: 0, duration: 100
  // Interval B: [100, 200) -> start: 100, duration: 100
  // They are adjacent and do NOT overlap
  assert.equal(MediaTime.intervalsOverlap(0, 100, 100, 100), false);
  assert.equal(MediaTime.intervalsAdjacent(0, 100, 100, 100), true);

  // Interval C: [50, 150) overlaps with [0, 100)
  assert.equal(MediaTime.intervalsOverlap(0, 100, 50, 100), true);
  assert.equal(MediaTime.intervalsAdjacent(0, 100, 50, 100), false);

  // Disjoint intervals
  assert.equal(MediaTime.intervalsOverlap(0, 50, 100, 50), false);
  assert.equal(MediaTime.intervalsAdjacent(0, 50, 100, 50), false);
});
