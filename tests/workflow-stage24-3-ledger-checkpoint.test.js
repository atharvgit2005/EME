/**
 * Phase 24 Stage 24.3 Test Suite: Cryptographic Hash-Chain Checkpointing & Batch Ledger
 *
 * Verifies:
 * 1. CHK-01: Merkle Tree Root mathematical calculation (even and odd leaf sets).
 * 2. CHK-02: Automated Merkle checkpoint creation at configured block interval boundaries.
 * 3. CHK-03: High-throughput atomic batch append preserving linear hash chain continuity.
 * 4. CHK-04: Tamper detection identifying corrupted blocks within checkpointed chunks.
 * 5. CHK-05: Fast verification path across checkpoints and uncheckpointed tail blocks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LedgerCheckpointer,
  computeMerkleRoot
} = require('../src/prompt-core/ledger-checkpoint.js');
const { GovernanceLedger } = require('../src/prompt-core/governance-ledger.js');

test('Stage 24.3: Cryptographic Hash-Chain Checkpointing & Batch Ledger', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/chk-test-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('CHK-01: Merkle Tree Root Calculation (Even & Odd Leaf Counts)', async () => {
    const leafHashes = ['hash1', 'hash2', 'hash3', 'hash4'];
    const rootEven = computeMerkleRoot(leafHashes);
    assert.ok(typeof rootEven === 'string' && rootEven.length === 64);

    // Deterministic repeatability
    assert.equal(computeMerkleRoot(leafHashes), rootEven);

    // Odd leaf count handling (3 leaves)
    const rootOdd = computeMerkleRoot(['hashA', 'hashB', 'hashC']);
    assert.ok(typeof rootOdd === 'string' && rootOdd.length === 64);

    // Empty and single leaf handling
    assert.equal(computeMerkleRoot(['singleLeaf']), 'singleLeaf');
    assert.ok(computeMerkleRoot([]).length === 64);
  });

  await t.test('CHK-02: Automated Checkpointing at Block Interval Boundaries', async () => {
    const ledger = new GovernanceLedger({
      storagePath: path.join(scratchDir, 'chk-auto-ledger.json')
    });
    const checkpointer = new LedgerCheckpointer({
      ledger,
      checkpointInterval: 10 // Every 10 blocks
    });

    // Ingest 25 events
    const events = [];
    for (let i = 1; i <= 25; i++) {
      events.push({
        eventType: 'JOB_COMPLETED',
        targetId: `job-${i}`,
        actor: 'orchestrator',
        payload: { jobNum: i }
      });
    }

    const appendRes = checkpointer.appendBatch(events);
    assert.equal(appendRes.batchSize, 25);
    // At index 10 and index 20, checkpoints should have been created (2 total checkpoints)
    assert.equal(checkpointer.checkpoints.length, 2);

    const chk1 = checkpointer.checkpoints[0];
    assert.deepEqual(chk1.blockRange, [1, 10]);
    assert.equal(chk1.entryCount, 10);
    assert.ok(chk1.merkleRoot.length === 64);

    const chk2 = checkpointer.checkpoints[1];
    assert.deepEqual(chk2.blockRange, [11, 20]);
    assert.equal(chk2.entryCount, 10);
  });

  await t.test('CHK-03: High-Throughput Batch Append Linear Chain Integrity', async () => {
    const ledger = new GovernanceLedger();
    const checkpointer = new LedgerCheckpointer({ ledger, checkpointInterval: 20 });

    const batch = Array.from({ length: 50 }, (_, i) => ({
      eventType: 'METRIC_RECORDED',
      targetId: `metric-${i}`,
      actor: 'monitor',
      payload: { value: i * 1.5 }
    }));

    const res = checkpointer.appendBatch(batch);
    assert.equal(res.batchSize, 50);

    // Full linear hash chain validation from genesis
    const fullVal = ledger.validateIntegrity();
    assert.equal(fullVal.valid, true);
    assert.equal(fullVal.chainLength, 51); // 1 genesis + 50 entries
  });

  await t.test('CHK-04: Cryptographic Tamper Detection in Checkpointed Chunks', async () => {
    const ledger = new GovernanceLedger();
    const checkpointer = new LedgerCheckpointer({ ledger, checkpointInterval: 10 });

    const batch = Array.from({ length: 15 }, (_, i) => ({
      eventType: 'EVENT',
      targetId: `ev-${i}`,
      actor: 'system',
      payload: { i }
    }));

    checkpointer.appendBatch(batch);
    assert.equal(checkpointer.checkpoints.length, 1);

    // Verify checkpoint 1 is valid initially
    const initCheck = checkpointer.verifyCheckpoint(1);
    assert.equal(initCheck.valid, true);

    // Tamper with block 5 hash
    ledger.entries[5].hash = '0000000000000000000000000000000000000000000000000000000000000000';

    // Fast verify should detect failure
    const tamperCheck = checkpointer.verifyCheckpoint(1);
    assert.equal(tamperCheck.valid, false);
    assert.ok(tamperCheck.error.includes('Merkle root mismatch'));
  });

  await t.test('CHK-05: Fast Verification Across Checkpoints and Uncheckpointed Tail', async () => {
    const ledger = new GovernanceLedger();
    const checkpointer = new LedgerCheckpointer({ ledger, checkpointInterval: 10 });

    // 25 entries -> Checkpoints at [1,10] and [11,20]. Tail entries: 21, 22, 23, 24, 25.
    const batch = Array.from({ length: 25 }, (_, i) => ({
      eventType: 'FRAME_RENDERED',
      targetId: `frame-${i}`,
      actor: 'renderer',
      payload: { frame: i }
    }));

    checkpointer.appendBatch(batch);

    const fastRes = checkpointer.fastVerify();
    assert.equal(fastRes.valid, true);
    assert.equal(fastRes.totalEntries, 26);
    assert.equal(fastRes.checkpointsVerified, 2);
    assert.equal(fastRes.uncheckpointedTailEntries, 5); // entries 21..25
  });
});
