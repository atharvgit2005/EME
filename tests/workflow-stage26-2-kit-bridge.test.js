/**
 * Test Suite: Workflow Stage 26.2 - Isolated Python Sound Kit Bridge & Generator Client
 *
 * Verifies:
 * - Subprocess IPC lifecycle and preset discovery
 * - Kit take planning
 * - Isolated staging & safe asset promotion (Correction A: pre-existing files preserved)
 * - Dual-hash provenance recording (Correction C: SHA-1 + SHA-256)
 * - Deterministic regeneration with stable seed
 * - Watchdog timeout handling (Correction F)
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { EarshotKitClient } = require('../src/audio/sfx/earshot-kit-client.js');

describe('Stage 26.2: Isolated Python Sound Kit Bridge & Generator Client', () => {
  const client = new EarshotKitClient({
    renderTimeoutMs: 25000,
    commandTimeoutMs: 5000
  });

  after(() => {
    client.dispose();
  });

  it('BRG-01: Discovers available kit presets via Python bridge', async () => {
    const presets = await client.getPresets();
    assert.ok(Array.isArray(presets));
    assert.ok(presets.includes('calm'));
    assert.ok(presets.includes('crisp'));
    assert.ok(presets.includes('minimal'));
  });

  it('BRG-02: Loads and validates full preset kit definition', async () => {
    const calm = await client.getPreset('calm');
    assert.equal(calm.kit, 1);
    assert.equal(calm.name, 'calm');
    assert.equal(calm.sr, 48000);
    assert.ok(calm.roles['pop']);
    assert.ok(calm.roles['whoosh.short']);
    assert.ok(calm.roles['tick']);
  });

  it('BRG-03: Plans kit takes deterministically without writing audio files', async () => {
    const testKit = {
      kit: 1,
      name: 'plan_test',
      sr: 48000,
      roles: {
        'pop': {
          sound: 'fit/pop/mouth_plop',
          takes: 2,
          align: 'onset'
        },
        'whoosh.short': {
          sound: 'fit/whoosh.short/bamboo_swish',
          takes: 1,
          align: 'peak'
        }
      }
    };

    const takes = await client.planKit(testKit);
    assert.ok(Array.isArray(takes));
    assert.equal(takes.length, 3); // 2 pops + 1 whoosh

    const popTakes = takes.filter(t => t.role === 'pop');
    assert.equal(popTakes.length, 2);
    assert.equal(popTakes[0].file, 'pop_1.wav');
    assert.equal(popTakes[1].file, 'pop_2.wav');

    const whooshTakes = takes.filter(t => t.role === 'whoosh.short');
    assert.equal(whooshTakes.length, 1);
    assert.equal(whooshTakes[0].file, 'whoosh-short_1.wav');
  });

  it('BRG-04: Isolated staging, safe promotion, and preservation of pre-existing assets (Correction A)', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-canon-target-'));

    try {
      // Create a pre-existing canonical asset in the destination folder
      const canaryPath = path.join(targetDir, 'preexisting_unrelated_asset.wav');
      fs.writeFileSync(canaryPath, 'CANARY_AUDIO_DATA_DO_NOT_DELETE');

      const miniKit = {
        kit: 1,
        name: 'staging_test',
        sr: 48000,
        roles: {
          'pop': {
            sound: 'fit/pop/mouth_plop',
            takes: 1,
            align: 'onset'
          }
        }
      };

      const result = await client.renderKit(miniKit, targetDir);
      assert.equal(result.success, true);
      assert.ok(fs.existsSync(path.join(targetDir, 'pop_1.wav')));
      assert.ok(fs.existsSync(path.join(targetDir, 'kit.lock.json')));

      // CRITICAL CHECK (Correction A): Pre-existing canary file must still exist untouched!
      assert.ok(fs.existsSync(canaryPath), 'Pre-existing asset must NOT be deleted by Earshot rendering');
      assert.equal(fs.readFileSync(canaryPath, 'utf8'), 'CANARY_AUDIO_DATA_DO_NOT_DELETE');

      // Check asset provenance (Correction C)
      const popProv = result.assetProvenance['pop_1.wav'];
      assert.ok(popProv);
      assert.equal(popProv.role, 'pop');
      assert.ok(popProv.sha1);
      assert.ok(popProv.sha256);
      assert.ok(popProv.onset_s >= 0);
      assert.ok(popProv.peak_s >= 0);
      assert.ok(popProv.dur_s > 0);
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('BRG-05: Verifies deterministic regeneration with identical SHA-1 and SHA-256', async () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-det-1-'));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-det-2-'));

    try {
      const miniKit = {
        kit: 1,
        name: 'det_test',
        sr: 48000,
        roles: {
          'click': {
            sound: 'fit/click/floss_lid',
            takes: 1,
            seed: 42,
            align: 'onset'
          }
        }
      };

      const res1 = await client.renderKit(miniKit, dir1);
      const res2 = await client.renderKit(miniKit, dir2);

      const f1 = path.join(dir1, 'click_1.wav');
      const f2 = path.join(dir2, 'click_1.wav');

      const buf1 = fs.readFileSync(f1);
      const buf2 = fs.readFileSync(f2);

      assert.deepEqual(buf1, buf2, 'Rendered audio buffers must be byte-for-byte identical');
      assert.equal(res1.assetProvenance['click_1.wav'].sha1, res2.assetProvenance['click_1.wav'].sha1);
      assert.equal(res1.assetProvenance['click_1.wav'].sha256, res2.assetProvenance['click_1.wav'].sha256);
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true });
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('BRG-06: Bridge enforces watchdog timeout safely on hanging operations (Correction F)', async () => {
    const hangingClient = new EarshotKitClient({
      commandTimeoutMs: 1, // 1ms timeout to reliably trigger watchdog
      renderTimeoutMs: 1
    });

    try {
      await assert.rejects(
        async () => {
          await hangingClient.renderKit(
            {
              kit: 1,
              name: 'timeout_test',
              sr: 48000,
              roles: { pop: { sound: 'fit/pop/mouth_plop', takes: 1 } }
            },
            os.tmpdir(),
            { timeoutMs: 1 }
          );
        },
        /timed out after 1ms/
      );
    } finally {
      hangingClient.dispose();
    }
  });
});
