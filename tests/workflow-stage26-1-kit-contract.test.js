/**
 * Test Suite: Workflow Stage 26.1 - Sound Kit Contract & kit.lock.json Validator
 *
 * Verifies strict Draft 2020-12 schema validation, physical transient constraints,
 * path containment, case-insensitive collision rejection, and dual-hash integrity.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const {
  validateKitDefinition,
  validateKitLock,
  validateKitDirectory
} = require('../src/audio/sfx/earshot-kit-validator.js');

describe('Stage 26.1: Sound Kit Contract & kit.lock.json Validation', () => {
  const validKit = {
    kit: 1,
    name: 'calm_test',
    sr: 48000,
    roles: {
      'pop': {
        sound: 'fit/pop/mouth_plop',
        takes: 2,
        align: 'onset',
        level_db: -2.5
      },
      'whoosh.short': {
        sound: 'fit/whoosh.short/bamboo_swish',
        takes: 1,
        align: 'peak',
        level_db: -9.0
      },
      'riser': null
    },
    off: {
      'riser': 'kept off by default'
    }
  };

  const validLock = {
    kit: 1,
    earshot: '0.3.0',
    bank: 'bank-2026.1',
    sr: 48000,
    name: 'calm_test',
    roles: {
      'pop': {
        sound: 'fit/pop/mouth_plop',
        align: 'onset',
        level_db: -2.5,
        max_s: null,
        takes: [
          {
            file: 'pop_1.wav',
            seed: 10,
            pitch: null,
            onset_s: 0.008,
            peak_s: 0.015,
            end_s: 0.192,
            dur_s: 0.28,
            peak_db: -1.0,
            lufs_m_max: -21.9,
            sha1: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            key: 'take-key-pop-1',
            checks: []
          }
        ]
      },
      'riser': null
    }
  };

  it('VAL-01: Validates compliant sound kit definition', () => {
    const res = validateKitDefinition(validKit);
    assert.equal(res.valid, true, `Validation failed: ${res.errors.join(', ')}`);
    assert.equal(res.errors.length, 0);
  });

  it('VAL-02: Rejects malformed role names in kit definition', () => {
    const badRoles = [
      'POP', // uppercase
      'whoosh short', // spaces
      'click-confirm', // dashes instead of dots
      '123bad', // starting with number
      '_hidden' // starting with underscore
    ];

    for (const bad of badRoles) {
      const kit = {
        kit: 1,
        name: 'bad_role_kit',
        sr: 48000,
        roles: { [bad]: { sound: 'notify/m0' } }
      };
      const res = validateKitDefinition(kit);
      assert.equal(res.valid, false, `Expected invalid for role "${bad}"`);
      assert.ok(res.errors.some(e => e.includes('Invalid role name') || e.includes('propertyNames')));
    }
  });

  it('VAL-03: Rejects invalid sample rates, levels, or durations in kit definition', () => {
    // Bad SR
    const badSr = validateKitDefinition({ ...validKit, sr: 12345 });
    assert.equal(badSr.valid, false);

    // Bad level_db (> 0)
    const badLevel = validateKitDefinition({
      kit: 1,
      name: 'test',
      sr: 48000,
      roles: { pop: { sound: 'fit/pop/mouth_plop', level_db: +3.0 } }
    });
    assert.equal(badLevel.valid, false);

    // Bad takes count (< 1 or > 32)
    const badTakes = validateKitDefinition({
      kit: 1,
      name: 'test',
      sr: 48000,
      roles: { pop: { sound: 'fit/pop/mouth_plop', takes: 50 } }
    });
    assert.equal(badTakes.valid, false);
  });

  it('VAL-04: Validates compliant kit.lock.json structure', () => {
    const res = validateKitLock(validLock);
    assert.equal(res.valid, true, `Lock validation failed: ${res.errors.join(', ')}`);
  });

  it('VAL-05: Rejects unsafe path traversal and non-WAV extensions in take files', () => {
    const pathTraversals = [
      '../outside.wav',
      '/etc/passwd.wav',
      'sub/nested.wav',
      'take.mp3',
      'take.sh'
    ];

    for (const badFile of pathTraversals) {
      const lock = structuredClone(validLock);
      lock.roles.pop.takes[0].file = badFile;
      const res = validateKitLock(lock);
      assert.equal(res.valid, false, `Expected failure for file "${badFile}"`);
      assert.ok(res.errors.some(e => e.includes('unsafe file path') || e.includes('.wav extension') || e.includes('pattern')));
    }
  });

  it('VAL-06: Rejects case-insensitive take filename collisions across roles', () => {
    const lock = structuredClone(validLock);
    lock.roles['tick'] = {
      sound: 'fit/tick/domino',
      align: 'onset',
      level_db: -5.0,
      takes: [
        {
          file: 'POP_1.WAV', // Case collision with pop_1.wav
          seed: 1,
          pitch: null,
          onset_s: 0.01,
          peak_s: 0.02,
          end_s: 0.1,
          dur_s: 0.15,
          peak_db: -1.0,
          lufs_m_max: -18.0,
          sha1: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          key: 'take-key-tick-1',
          checks: []
        }
      ]
    };

    const res = validateKitLock(lock);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Case-insensitive filename collision')));
  });

  it('VAL-07: Rejects inconsistent physical transient measurements', () => {
    // onset > end
    const lock1 = structuredClone(validLock);
    lock1.roles.pop.takes[0].onset_s = 0.5;
    lock1.roles.pop.takes[0].end_s = 0.1;
    assert.equal(validateKitLock(lock1).valid, false);

    // negative duration
    const lock2 = structuredClone(validLock);
    lock2.roles.pop.takes[0].dur_s = -0.5;
    assert.equal(validateKitLock(lock2).valid, false);

    // peak > duration
    const lock3 = structuredClone(validLock);
    lock3.roles.pop.takes[0].peak_s = 5.0;
    lock3.roles.pop.takes[0].dur_s = 0.28;
    assert.equal(validateKitLock(lock3).valid, false);
  });

  it('VAL-08: Validates on-disk kit directory with dual-hash integrity and provenance', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-kit-val-test-'));
    try {
      // Create a dummy WAV file
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + 100, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20); // PCM
      wavHeader.writeUInt16LE(1, 22); // Mono
      wavHeader.writeUInt32LE(48000, 24); // SR
      wavHeader.writeUInt32LE(96000, 28); // Byte rate
      wavHeader.writeUInt16LE(2, 32); // Block align
      wavHeader.writeUInt16LE(16, 34); // Bits per sample
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(100, 40);
      const audioData = Buffer.concat([wavHeader, Buffer.alloc(100, 0x12)]);

      const sha1 = crypto.createHash('sha1').update(audioData).digest('hex');
      const sha256 = crypto.createHash('sha256').update(audioData).digest('hex');

      fs.writeFileSync(path.join(tmpDir, 'pop_1.wav'), audioData);

      const diskLock = structuredClone(validLock);
      diskLock.roles.pop.takes[0].sha1 = sha1;
      diskLock.roles.pop.takes[0].sha256 = sha256;
      fs.writeFileSync(path.join(tmpDir, 'kit.lock.json'), JSON.stringify(diskLock, null, 2));

      // Test valid directory
      const res = validateKitDirectory(tmpDir);
      assert.equal(res.valid, true, `Expected valid dir: ${res.errors.join(', ')}`);
      assert.ok(res.assetProvenance['pop_1.wav']);
      assert.equal(res.assetProvenance['pop_1.wav'].sha256, sha256);
      assert.equal(res.assetProvenance['pop_1.wav'].sha1, sha1);
      assert.equal(res.assetProvenance['pop_1.wav'].role, 'pop');

      // Test hash mismatch
      diskLock.roles.pop.takes[0].sha1 = '0000000000000000000000000000000000000000';
      fs.writeFileSync(path.join(tmpDir, 'kit.lock.json'), JSON.stringify(diskLock, null, 2));
      const resMismatch = validateKitDirectory(tmpDir);
      assert.equal(resMismatch.valid, false);
      assert.ok(resMismatch.errors.some(e => e.includes('SHA-1 mismatch')));

      // Test rogue WAV file on disk
      diskLock.roles.pop.takes[0].sha1 = sha1;
      fs.writeFileSync(path.join(tmpDir, 'kit.lock.json'), JSON.stringify(diskLock, null, 2));
      fs.writeFileSync(path.join(tmpDir, 'rogue_extra.wav'), audioData);
      const resRogue = validateKitDirectory(tmpDir);
      assert.equal(resRogue.valid, false);
      assert.ok(resRogue.errors.some(e => e.includes('Unregistered audio asset found on disk')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
