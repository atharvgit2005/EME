const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  SAMPLE_RATE,
  LOCK_NOTES,
  envelope,
  equalPowerPan,
  synthesizeSfx,
  writeSfxWav
} = require('../sfx-synth.js');

test('equalPowerPan - Preserves unit energy', () => {
  const pans = [-1.0, -0.5, 0.0, 0.5, 1.0];
  pans.forEach(p => {
    const [l, r] = equalPowerPan(p);
    const power = l * l + r * r;
    assert.ok(Math.abs(power - 1.0) < 1e-4, `Power should be 1.0 at pan ${p}, got ${power}`);
  });
});

test('envelope - Attack and release behavior', () => {
  assert.equal(envelope(0, 0.01, 0.1), 0.0);
  const peak = envelope(0.01, 0.01, 0.1);
  assert.ok(peak > 0.8 && peak <= 1.0);
  const decayed = envelope(0.2, 0.01, 0.1);
  assert.ok(decayed < peak);
});

test('synthesizeSfx - Produces valid RIFF header and exact byte count', () => {
  const duration = 2.0;
  const wavBuf = synthesizeSfx({
    durationSeconds: duration,
    cuts: [0.1, 0.8],
    keys: [0.2, 0.3, 0.4, 0.5],
    locks: [{ time: 1.2, screenX: 960, screenW: 1920 }]
  });

  const expectedPcmBytes = 2 * 48000 * 4; // 2 seconds * 48000 * 4 bytes
  const expectedTotalBytes = 44 + expectedPcmBytes;
  assert.equal(wavBuf.length, expectedTotalBytes);

  // Verify RIFF header
  assert.equal(wavBuf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wavBuf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wavBuf.toString('ascii', 12, 16), 'fmt ');
  assert.equal(wavBuf.readUInt16LE(20), 1); // PCM format
  assert.equal(wavBuf.readUInt16LE(22), 2); // 2 channels (stereo)
  assert.equal(wavBuf.readUInt32LE(24), 48000); // 48kHz
  assert.equal(wavBuf.readUInt16LE(34), 16); // 16-bit
  assert.equal(wavBuf.toString('ascii', 36, 40), 'data');
  assert.equal(wavBuf.readUInt32LE(40), expectedPcmBytes);
});

test('writeSfxWav - Validated by ffprobe', () => {
  const tempWav = path.resolve('experiments/tracking-camera/probes/test-sfx.wav');
  const res = writeSfxWav(tempWav, {
    durationSeconds: 1.5,
    cuts: [0.2],
    keys: [0.3, 0.4],
    locks: [{ time: 0.8, screenX: 400, screenW: 1920 }]
  });

  assert.equal(fs.existsSync(tempWav), true);
  assert.equal(res.sizeBytes, 44 + Math.floor(1.5 * 48000) * 4);

  // Probe with ffprobe
  const probe = spawnSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    tempWav
  ], { encoding: 'utf8' });

  assert.equal(probe.status, 0);
  const json = JSON.parse(probe.stdout);
  const audioStream = json.streams.find(s => s.codec_type === 'audio');
  assert.ok(audioStream);
  assert.equal(audioStream.codec_name, 'pcm_s16le');
  assert.equal(audioStream.sample_rate, '48000');
  assert.equal(audioStream.channels, 2);

  // Cleanup
  fs.unlinkSync(tempWav);
});
