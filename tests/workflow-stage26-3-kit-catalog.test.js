/**
 * Test Suite: Workflow Stage 26.3 - Sound Kit Ingestion & Role Catalog
 *
 * Verifies:
 * - Ingestion of validated kit lockfiles and WAV directory
 * - Role indexing and transient alignment offset derivation in ticks
 * - Deterministic modulo take selection and round-robin anti-machine-gunning
 * - Dual-hash provenance lookup
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { SoundKitCatalog } = require('../src/audio/sfx/sound-kit-catalog.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

function createTestWav(durationSeconds = 0.5) {
  const sampleRate = 48000;
  const numSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const pcm = Buffer.alloc(dataSize);
  return Buffer.concat([header, pcm]);
}

describe('Stage 26.3: Sound Kit Ingestion & Role Catalog', () => {
  it('CAT-01: Ingests validated kit directory and indexes roles and physical timing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-catalog-test-'));

    try {
      const popBuf = createTestWav(0.28);
      const whooshBuf = createTestWav(0.48);

      const popSha1 = crypto.createHash('sha1').update(popBuf).digest('hex');
      const whooshSha1 = crypto.createHash('sha1').update(whooshBuf).digest('hex');

      fs.writeFileSync(path.join(tmpDir, 'pop_1.wav'), popBuf);
      fs.writeFileSync(path.join(tmpDir, 'pop_2.wav'), popBuf);
      fs.writeFileSync(path.join(tmpDir, 'whoosh-short_1.wav'), whooshBuf);

      const lock = {
        kit: 1,
        earshot: '0.3.0',
        bank: 'bank-2026.1',
        sr: 48000,
        name: 'test_kit',
        roles: {
          'pop': {
            sound: 'fit/pop/mouth_plop',
            align: 'onset',
            level_db: -2.5,
            takes: [
              {
                file: 'pop_1.wav',
                seed: 1,
                onset_s: 0.008,
                peak_s: 0.015,
                end_s: 0.192,
                dur_s: 0.28,
                peak_db: -1.0,
                lufs_m_max: -21.9,
                sha1: popSha1,
                key: 'k-pop-1',
                checks: []
              },
              {
                file: 'pop_2.wav',
                seed: 2,
                onset_s: 0.010,
                peak_s: 0.018,
                end_s: 0.200,
                dur_s: 0.28,
                peak_db: -1.0,
                lufs_m_max: -21.9,
                sha1: popSha1,
                key: 'k-pop-2',
                checks: []
              }
            ]
          },
          'whoosh.short': {
            sound: 'fit/whoosh.short/bamboo_swish',
            align: 'peak',
            level_db: -9.0,
            takes: [
              {
                file: 'whoosh-short_1.wav',
                seed: 1,
                onset_s: 0.04,
                peak_s: 0.22,
                end_s: 0.45,
                dur_s: 0.48,
                peak_db: -1.0,
                lufs_m_max: -18.5,
                sha1: whooshSha1,
                key: 'k-whoosh-1',
                checks: []
              }
            ]
          }
        }
      };

      fs.writeFileSync(path.join(tmpDir, 'kit.lock.json'), JSON.stringify(lock, null, 2));

      const catalog = new SoundKitCatalog({ kitDir: tmpDir }).load();

      assert.equal(catalog.isLoaded, true);
      assert.equal(catalog.name, 'test_kit');
      assert.deepEqual(catalog.getAvailableRoles().sort(), ['pop', 'whoosh.short'].sort());

      // Check pop role (align: onset)
      const popRole = catalog.getRole('pop');
      assert.equal(popRole.align, 'onset');
      assert.equal(popRole.takeCount, 2);

      // Check exact integer tick alignment math:
      // pop_1 onset is 0.008s -> 0.008 * 120,000 = 960 ticks
      const popOffset0 = catalog.getAlignmentOffsetTicks('pop', 0);
      assert.equal(popOffset0, 960);

      // pop_2 onset is 0.010s -> 0.010 * 120,000 = 1200 ticks
      const popOffset1 = catalog.getAlignmentOffsetTicks('pop', 1);
      assert.equal(popOffset1, 1200);

      // whoosh peak is 0.22s -> 0.22 * 120,000 = 26,400 ticks (align: peak)
      const whooshOffset = catalog.getAlignmentOffsetTicks('whoosh.short', 0);
      assert.equal(whooshOffset, 26400);

      // Check provenance record
      const prov = catalog.getProvenance('pop_1.wav');
      assert.ok(prov);
      assert.equal(prov.role, 'pop');
      assert.equal(prov.sha1, popSha1);
      assert.ok(prov.sha256);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('CAT-02: Round-robin rotation and deterministic seed selection', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-rr-test-'));

    try {
      const wav = createTestWav(0.1);
      const sha1 = crypto.createHash('sha1').update(wav).digest('hex');

      fs.writeFileSync(path.join(tmpDir, 'tick_1.wav'), wav);
      fs.writeFileSync(path.join(tmpDir, 'tick_2.wav'), wav);
      fs.writeFileSync(path.join(tmpDir, 'tick_3.wav'), wav);

      const lock = {
        kit: 1,
        earshot: '0.3.0',
        bank: 'bank-2026.1',
        sr: 48000,
        name: 'rr_kit',
        roles: {
          tick: {
            sound: 'fit/tick/domino',
            align: 'onset',
            level_db: -5.0,
            takes: [
              { file: 'tick_1.wav', seed: 10, onset_s: 0.005, peak_s: 0.01, end_s: 0.08, dur_s: 0.1, sha1, key: 'k1', checks: [] },
              { file: 'tick_2.wav', seed: 11, onset_s: 0.006, peak_s: 0.01, end_s: 0.08, dur_s: 0.1, sha1, key: 'k2', checks: [] },
              { file: 'tick_3.wav', seed: 12, onset_s: 0.007, peak_s: 0.01, end_s: 0.08, dur_s: 0.1, sha1, key: 'k3', checks: [] }
            ]
          }
        }
      };

      fs.writeFileSync(path.join(tmpDir, 'kit.lock.json'), JSON.stringify(lock, null, 2));
      const catalog = new SoundKitCatalog({ kitDir: tmpDir }).load();

      // Test round-robin: 0 -> 1 -> 2 -> 0 -> 1
      const t1 = catalog.selectTake('tick');
      const t2 = catalog.selectTake('tick');
      const t3 = catalog.selectTake('tick');
      const t4 = catalog.selectTake('tick');

      assert.equal(t1.file, 'tick_1.wav');
      assert.equal(t2.file, 'tick_2.wav');
      assert.equal(t3.file, 'tick_3.wav');
      assert.equal(t4.file, 'tick_1.wav');

      // Test explicit seed
      const seededTake = catalog.selectTake('tick', { seed: 14 }); // 14 % 3 = 2 -> tick_3.wav
      assert.equal(seededTake.file, 'tick_3.wav');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('CAT-03: Rejects invalid or corrupt kit directory on load', () => {
    const invalidDir = path.join(os.tmpdir(), 'non_existent_kit_dir_xyz');
    assert.throws(
      () => {
        new SoundKitCatalog({ kitDir: invalidDir }).load();
      },
      /Cannot load invalid sound kit directory/
    );
  });
});
