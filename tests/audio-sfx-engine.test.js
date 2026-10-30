/**
 * EME Audio Intelligence - Phase A4 SFX Engine Tests
 * Tests procedural synthesis, sound pack indexing, dialogue ducking, layer mixing, and schema validation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  synthesizeWhoosh,
  synthesizeImpact,
  synthesizeRiser,
  synthesizeGlitch,
  defaultCatalog, SfxCatalog,
  applyDialogueDucking,
  mixAudioLayers,
  validateSfxCue
} = require('../src/audio/sfx/index.js');
const { decodeWav } = require('../src/audio/beat/audio-ingest.js');

test('A4.1 Procedural Synthesis & Determinism: Same seed yields 100% bit-exact WAV output', () => {
  const whoosh1 = synthesizeWhoosh({ durationSeconds: 0.5, panDirection: 1, seed: 42 });
  const whoosh2 = synthesizeWhoosh({ durationSeconds: 0.5, panDirection: 1, seed: 42 });

  assert.equal(whoosh1.equals(whoosh2), true, 'Identical seed must produce byte-for-byte identical WAV');

  const decoded = decodeWav(whoosh1);
  assert.equal(decoded.sampleRate, 48000, 'Sample rate must be 48 kHz');
  assert.equal(decoded.channels, 2, 'Channel count must be stereo');
  assert.ok(decoded.durationSamples > 0, 'Audio samples must be non-empty');

  const impact = synthesizeImpact({ durationSeconds: 0.8, subFreqHz: 40, seed: 77 });
  const impactDecoded = decodeWav(impact);
  assert.equal(impactDecoded.sampleRate, 48000);

  const riser = synthesizeRiser({ durationSeconds: 1.0, seed: 88 });
  const riserDecoded = decodeWav(riser);
  assert.equal(riserDecoded.sampleRate, 48000);

  const glitch = synthesizeGlitch({ type: 'click', seed: 99 });
  const glitchDecoded = decodeWav(glitch);
  assert.equal(glitchDecoded.sampleRate, 48000);
});

test('A4.2 Sound Pack Catalog: indexes supplied WAVs without requiring a licensed pack', (t) => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-sfx-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'whoosh.wav'), synthesizeWhoosh({ durationSeconds: .1 }));
  fs.writeFileSync(path.join(root, 'impact.wav'), synthesizeImpact({ durationSeconds: .1 }));
  fs.writeFileSync(path.join(root, 'click.wav'), synthesizeGlitch({ type: 'click' }));
  fs.writeFileSync(path.join(root, 'broken.wav'), 'invalid');
  const catalog = new SfxCatalog(root);
  for (const category of ['whoosh', 'impact', 'click']) {
    const assets = catalog.getByCategory(category);
    assert.equal(assets.length, 1);
    assert.ok(assets[0].durationTicks > 0);
  }
  assert.equal(new SfxCatalog(path.join(root, 'missing')).getByCategory('whoosh').length, 0);
});

test('A4.3 Dialogue Ducking: Reduces background music gain during speech bursts', () => {
  const sampleRate = 48000;
  const numSamples = sampleRate * 2; // 2 seconds

  // Background music: constant amplitude 0.5
  const music = new Float32Array(numSamples).fill(0.5);

  // Dialogue: silence in 0-0.5s, loud speech in 0.5-1.5s (amp 0.8), silence in 1.5-2.0s
  const voice = new Float32Array(numSamples);
  for (let s = Math.round(sampleRate * 0.5); s < Math.round(sampleRate * 1.5); s++) {
    voice[s] = Math.sin(2 * Math.PI * 300 * (s / sampleRate)) * 0.8;
  }

  const res = applyDialogueDucking(music, voice, {
    sampleRate,
    thresholdDb: -20,
    duckingGainDb: -12 // ~0.25 linear gain
  });

  // Verify before speech: full gain ~1.0
  assert.ok(res.gainCurve[1000] > 0.95, 'Gain before speech should be ~1.0');

  // Verify during active speech: ducked to ~0.25 (between 0.2 and 0.35)
  const speechMid = Math.round(sampleRate * 1.0);
  assert.ok(res.gainCurve[speechMid] < 0.4, 'Gain during speech must be ducked below 0.4');
  assert.ok(res.duckedPcm[speechMid] < 0.25, 'Ducked audio amplitude must be reduced');

  // Verify after speech: recovers toward 1.0
  assert.ok(res.gainCurve[numSamples - 100] > 0.85, 'Gain after speech release should recover toward 1.0');
});

test('A4.4 Multi-Layer Mixer & True-Peak Limiter: Enforces -1.0 dBFS ceiling compliance', () => {
  const sampleRate = 48000;
  const numSamples = sampleRate * 1;

  // Two loud layers that would sum to 1.6 (heavily clipping without limiter)
  const layer1 = new Float32Array(numSamples).fill(0.8);
  const layer2 = new Float32Array(numSamples).fill(0.8);

  const res = mixAudioLayers([
    { pcm: layer1, startSample: 0, gain: 1.0 },
    { pcm: layer2, startSample: 0, gain: 1.0 }
  ], numSamples, { sampleRate });

  assert.equal(res.metrics.passedQa, true, 'Mixer must pass loudness QA');
  assert.ok(res.metrics.finalPeakDb <= -0.9, 'Final peak must not exceed -0.9 dBFS');
  assert.equal(res.metrics.clippedSamples, 0, 'Master output must have 0 clipped samples');
  assert.ok(Buffer.isBuffer(res.masterWav), 'Master output must be valid WAV buffer');
});

test('A4.5 Schema Conformance: Validates against eme-sfx-cue.v1.schema.json', () => {
  const validProceduralCue = {
    schemaVersion: 'eme-sfx-cue.v1',
    cueId: 'cue-sfx-001',
    type: 'whoosh',
    sourceType: 'procedural',
    startTick: 120000,
    durationTicks: 72000,
    gain: 0.8,
    pan: 0.5,
    proceduralParams: {
      durationSeconds: 0.6,
      panDirection: 1
    }
  };

  const res1 = validateSfxCue(validProceduralCue);
  assert.equal(res1.valid, true, `Procedural cue should validate: ${JSON.stringify(res1.errors)}`);

  const validCatalogCue = {
    schemaVersion: 'eme-sfx-cue.v1',
    cueId: 'cue-sfx-002',
    type: 'impact',
    sourceType: 'catalog',
    startTick: 240000,
    durationTicks: 144000,
    gain: 1.0,
    pan: 0.0,
    catalogAssetPath: 'assets/sjc_sfx_pack/SJC SFX Pack Vol 1 (Giveaway)/UI & Motion/Impact/SJC_IMPACT_Sub Impact_01.wav'
  };

  const res2 = validateSfxCue(validCatalogCue);
  assert.equal(res2.valid, true, `Catalog cue should validate: ${JSON.stringify(res2.errors)}`);
});
