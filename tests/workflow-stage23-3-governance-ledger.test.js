/**
 * Phase 23 Stage 23.3 Test Suite: Cryptographic Governance & Tamper-Evident Ledger
 *
 * Verifies:
 * 1. GOV-01: Hash-chained audit logging from genesis to successive blocks.
 * 2. GOV-02: Cryptographic tamper detection: detects modified payloads, timestamps, or deleted entries.
 * 3. GOV-03: Immutable delivery manifest registry & collision rejection.
 * 4. GOV-04: Active delivery certification verification gate.
 * 5. GOV-05: Persistent storage serialization and reload integrity verification.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GovernanceLedger, GENESIS_PREV_HASH } = require('../src/prompt-core/governance-ledger.js');

test('Stage 23.3: Cryptographic Governance & Tamper-Evident Ledger', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/gov-test-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('GOV-01: Hash-Chained Audit Logging & Genesis Initialization', async () => {
    const ledger = new GovernanceLedger();

    // Verify genesis block
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].index, 0);
    assert.equal(ledger.entries[0].action, 'GENESIS');
    assert.equal(ledger.entries[0].prevHash, GENESIS_PREV_HASH);
    assert.ok(ledger.entries[0].hash);

    // Record sequential events
    const e1 = ledger.recordEvent('PROJECT_MUTATION', 'proj-123', 'operator', { op: 'TRIM_CLIP', tick: 120000 });
    assert.equal(e1.index, 1);
    assert.equal(e1.prevHash, ledger.entries[0].hash);

    const e2 = ledger.recordEvent('DELIVERY_PROMOTED', 'session-abc', 'qa-engine', { revision_id: 'rev-01' });
    assert.equal(e2.index, 2);
    assert.equal(e2.prevHash, e1.hash);

    // Verify full chain integrity
    const integrity = ledger.verifyChainIntegrity();
    assert.equal(integrity.valid, true);
    assert.equal(integrity.chainLength, 3);
  });

  await t.test('GOV-02: Cryptographic Tamper Detection & Integrity Protection', async () => {
    const ledger = new GovernanceLedger();
    ledger.recordEvent('EVENT_ONE', 'res-1', 'admin', { val: 1 });
    ledger.recordEvent('EVENT_TWO', 'res-2', 'admin', { val: 2 });
    ledger.recordEvent('EVENT_THREE', 'res-3', 'admin', { val: 3 });

    assert.equal(ledger.verifyChainIntegrity().valid, true);

    // Tamper Attempt 1: Modify payload of block 1 without recomputing hash
    ledger.entries[1].payloadHash = '0'.repeat(64);
    const tamperRes1 = ledger.verifyChainIntegrity();
    assert.equal(tamperRes1.valid, false);
    assert.equal(tamperRes1.tamperedIndex, 1);
    assert.ok(tamperRes1.error.includes('Content tamper'));

    // Tamper Attempt 2: Recompute block 1 hash, but block 2 prevHash breaks
    const ledger2 = new GovernanceLedger();
    ledger2.recordEvent('STEP_A', 'res-A', 'admin', { a: 1 });
    ledger2.recordEvent('STEP_B', 'res-B', 'admin', { b: 2 });
    ledger2.entries[1].actor = 'evil-hacker'; // modify content
    // Recompute entry 1 hash
    ledger2.entries[1].hash = ledger2._computeEntryHash(ledger2.entries[1]);

    const tamperRes2 = ledger2.verifyChainIntegrity();
    assert.equal(tamperRes2.valid, false);
    assert.equal(tamperRes2.tamperedIndex, 2);
    assert.ok(tamperRes2.error.includes('Broken chain link'));
  });

  await t.test('GOV-03: Immutable Delivery Manifest Registry & Collision Defense', async () => {
    const ledger = new GovernanceLedger();

    const cert1 = ledger.certifyManifest('manifest-eme-2026-001', {
      sha256: 'abc123def456',
      mediaPath: '/artifacts/deliverables/video1.mp4',
      mediaSha256: 'media_hash_999'
    });
    assert.equal(cert1.certified, true);
    assert.equal(cert1.isNew, true);

    // Idempotent re-certification with identical checksum succeeds
    const certRepeat = ledger.certifyManifest('manifest-eme-2026-001', {
      sha256: 'abc123def456'
    });
    assert.equal(certRepeat.certified, true);
    assert.equal(certRepeat.isNew, false);

    // Collision with DIFFERENT checksum throws error
    assert.throws(() => {
      ledger.certifyManifest('manifest-eme-2026-001', {
        sha256: 'conflicting_checksum_hacked'
      });
    }, /Manifest ID collision/);
  });

  await t.test('GOV-04: Active Delivery Certification Verification Gate', async () => {
    const ledger = new GovernanceLedger();

    ledger.certifyManifest('valid-manifest', {
      sha256: 'sha_manifest_111',
      mediaSha256: 'sha_media_222'
    });

    // Certified delivery candidate
    const validDelivery = {
      manifest_id: 'valid-manifest',
      media_sha256: 'sha_media_222'
    };
    assert.equal(ledger.isDeliveryCertified(validDelivery), true);

    // Uncertified delivery candidate (manifest missing)
    const untrackedDelivery = {
      manifest_id: 'unknown-manifest',
      media_sha256: 'sha_media_222'
    };
    assert.equal(ledger.isDeliveryCertified(untrackedDelivery), false);

    // Tampered delivery (manifest known, but media SHA mismatch)
    const tamperedMediaDelivery = {
      manifest_id: 'valid-manifest',
      media_sha256: 'corrupted_media_hash'
    };
    assert.equal(ledger.isDeliveryCertified(tamperedMediaDelivery), false);
  });

  await t.test('GOV-05: Atomic Persistent Storage & Reload Validation', async () => {
    const storageFile = path.join(scratchDir, 'governance-ledger.json');
    const ledger = new GovernanceLedger({ storagePath: storageFile });

    ledger.recordEvent('PERSIST_EVENT_1', 'res-1', 'system', { status: 'OK' });
    ledger.recordEvent('PERSIST_EVENT_2', 'res-2', 'operator', { status: 'COMMITTED' });
    ledger.certifyManifest('persisted-manifest-1', {
      sha256: 'persisted_sha_777',
      mediaSha256: 'media_sha_888'
    });

    assert.ok(fs.existsSync(storageFile));

    // Reload into a fresh ledger instance
    const reloadedLedger = new GovernanceLedger({ storagePath: storageFile });
    assert.equal(reloadedLedger.entries.length, 4); // Genesis + 2 events + 1 manifest certification event
    const integrity = reloadedLedger.verifyChainIntegrity();
    assert.equal(integrity.valid, true);

    assert.equal(reloadedLedger.isDeliveryCertified({
      manifest_id: 'persisted-manifest-1',
      media_sha256: 'media_sha_888'
    }), true);
  });

});
