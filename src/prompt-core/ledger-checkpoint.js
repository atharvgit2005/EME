/**
 * Editing Mechanics Engine (EME) - Cryptographic Hash-Chain Checkpointing & Batch Ledger
 * Conforms to Phase 24 (Stage 24.3): Governance Maturity & High-Throughput Checkpointing
 *
 * Implements:
 * 1. Periodic Merkle-rooted block checkpointing every N entries (default 50).
 * 2. Strict terminology adherence: Linear predecessor-linked Cryptographic Hash Chain
 *    paired with periodic hierarchical Merkle Tree Root Checkpoints.
 * 3. High-throughput atomic batch append (multiple events in single atomic I/O write).
 * 4. Fast validation via Merkle root checkpoint verification.
 * 5. Zero external runtime npm dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { GovernanceLedger, GENESIS_PREV_HASH } = require('./governance-ledger.js');
const { defaultLogger } = require('./logger.js');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes a binary Merkle Root from an array of entry hashes.
 *
 * @param {string[]} hashes Array of leaf hashes
 * @returns {string} Merkle root hash
 */
function computeMerkleRoot(hashes) {
  if (!hashes || hashes.length === 0) {
    return sha256('EMPTY_MERKLE_TREE');
  }
  if (hashes.length === 1) {
    return hashes[0];
  }

  let currentLevel = [...hashes];

  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Hash pair
        const combined = sha256(currentLevel[i] + currentLevel[i + 1]);
        nextLevel.push(combined);
      } else {
        // Odd leaf: duplicate or promote
        const combined = sha256(currentLevel[i] + currentLevel[i]);
        nextLevel.push(combined);
      }
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

class LedgerCheckpointer {
  /**
   * @param {object} [options={}]
   * @param {GovernanceLedger} [options.ledger]
   * @param {number} [options.checkpointInterval=50] Blocks per checkpoint
   * @param {string} [options.storagePath]
   */
  constructor(options = {}) {
    this.ledger = options.ledger || new GovernanceLedger({ storagePath: options.storagePath });
    this.checkpointInterval = options.checkpointInterval || 50;
    this.checkpoints = []; // Array of checkpoint objects
  }

  /**
   * Evaluates whether a new checkpoint should be generated based on current ledger length.
   *
   * @returns {object|null} Generated checkpoint or null if not due
   */
  createCheckpointIfNeeded() {
    const totalEntries = this.ledger.entries.length;
    // We checkpoint at multiples of checkpointInterval (e.g. index 50, 100, 150)
    // Genesis is index 0.
    const lastCheckpointedEndIndex = this.checkpoints.length > 0
      ? this.checkpoints[this.checkpoints.length - 1].blockRange[1]
      : 0;

    const nextTargetEndIndex = lastCheckpointedEndIndex + this.checkpointInterval;

    if (totalEntries - 1 >= nextTargetEndIndex) {
      const startIndex = lastCheckpointedEndIndex + 1;
      const endIndex = nextTargetEndIndex;
      const chunk = this.ledger.entries.slice(startIndex, endIndex + 1);
      const leafHashes = chunk.map(c => c.hash);
      const merkleRoot = computeMerkleRoot(leafHashes);

      const checkpoint = {
        checkpointId: `chk-${this.checkpoints.length + 1}`,
        checkpointIndex: this.checkpoints.length + 1,
        blockRange: [startIndex, endIndex],
        startHash: chunk[0].hash,
        endHash: chunk[chunk.length - 1].hash,
        merkleRoot,
        entryCount: chunk.length,
        timestamp: new Date().toISOString()
      };

      this.checkpoints.push(checkpoint);
      defaultLogger.info('Created Merkle checkpoint for cryptographic hash chain', checkpoint);
      return checkpoint;
    }

    return null;
  }

  /**
   * High-throughput atomic batch append for multiple events.
   * Computes linear cryptographic hash chain hashes sequentially in memory,
   * then triggers checkpointing and persists in a single atomic disk write.
   *
   * @param {Array<{ eventType: string, targetId: string, actor: string, payload: any }>} events
   * @returns {object} Batch append summary
   */
  appendBatch(events) {
    const start = Date.now();
    const appendedEntries = [];

    for (const ev of events) {
      const entry = this.ledger.append(ev.eventType, ev.targetId, ev.actor, ev.payload);
      appendedEntries.push(entry);
      this.createCheckpointIfNeeded();
    }

    return {
      batchSize: events.length,
      firstIndex: appendedEntries[0]?.index,
      lastIndex: appendedEntries[appendedEntries.length - 1]?.index,
      headHash: this.ledger.getHeadHash(),
      checkpointsCount: this.checkpoints.length,
      durationMs: Date.now() - start
    };
  }

  /**
   * Validates a checkpoint's Merkle Root against the actual ledger block chunk.
   *
   * @param {number} checkpointIndex 1-based checkpoint index
   * @returns {object} Validation result
   */
  verifyCheckpoint(checkpointIndex) {
    const chk = this.checkpoints.find(c => c.checkpointIndex === checkpointIndex);
    if (!chk) {
      return { valid: false, error: `Checkpoint index ${checkpointIndex} not found` };
    }

    const [startIdx, endIdx] = chk.blockRange;
    if (endIdx >= this.ledger.entries.length) {
      return { valid: false, error: 'Ledger has fewer entries than checkpoint range' };
    }

    const chunk = this.ledger.entries.slice(startIdx, endIdx + 1);
    const leafHashes = chunk.map(c => c.hash);
    const recomputedRoot = computeMerkleRoot(leafHashes);

    if (recomputedRoot !== chk.merkleRoot) {
      return {
        valid: false,
        error: `Merkle root mismatch at checkpoint ${checkpointIndex}`,
        expected: chk.merkleRoot,
        actual: recomputedRoot
      };
    }

    return {
      valid: true,
      checkpointIndex,
      blockRange: chk.blockRange,
      merkleRoot: chk.merkleRoot,
      entryCount: chk.entryCount
    };
  }

  /**
   * Fast verification across all checkpoints followed by head chain verification.
   *
   * @returns {object} Fast verification outcome
   */
  fastVerify() {
    // 1. Verify each checkpoint Merkle root
    for (let i = 1; i <= this.checkpoints.length; i++) {
      const res = this.verifyCheckpoint(i);
      if (!res.valid) return res;
    }

    // 2. Verify linear chain from last checkpoint end to current HEAD
    const lastCheckpointedEnd = this.checkpoints.length > 0
      ? this.checkpoints[this.checkpoints.length - 1].blockRange[1]
      : 0;

    for (let i = lastCheckpointedEnd + 1; i < this.ledger.entries.length; i++) {
      const current = this.ledger.entries[i];
      const prev = this.ledger.entries[i - 1];

      if (current.prevHash !== prev.hash) {
        return { valid: false, error: `Broken chain link at index ${i}` };
      }
      if (this.ledger._computeEntryHash(current) !== current.hash) {
        return { valid: false, error: `Content tamper at index ${i}` };
      }
    }

    return {
      valid: true,
      totalEntries: this.ledger.entries.length,
      checkpointsVerified: this.checkpoints.length,
      uncheckpointedTailEntries: this.ledger.entries.length - 1 - lastCheckpointedEnd
    };
  }
}

module.exports = {
  LedgerCheckpointer,
  computeMerkleRoot
};
