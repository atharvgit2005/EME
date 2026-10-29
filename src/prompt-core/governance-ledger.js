/**
 * Editing Mechanics Engine (EME) - Cryptographic Governance & Tamper-Evident Ledger
 * Conforms to Phase 23 (Stage 23.3): Cryptographic Governance & Tamper-Evident Audit Ledger
 *
 * Capabilities:
 * 1. Cryptographically Hash-Chained Audit Ledger (SHA-256 Merkle-link chain):
 *    - Each entry binds { index, timestamp, action, targetId, actor, payloadHash, prevHash, hash }
 *    - Genesis block initialized with fixed 64-character zero-hash.
 *    - Full chain validation sweeps detect any modification, deletion, or insertion.
 * 2. Immutable Delivery Manifest Registry:
 *    - Certifies published deliverables and binds manifest digests to active session promotions.
 *    - Prevents promotion of uncertified or tampered artifacts.
 * 3. Zero external runtime npm dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { defaultLogger } = require('./logger.js');

const GENESIS_PREV_HASH = '0'.repeat(64);

class GovernanceLedger {
  /**
   * @param {object} [options={}]
   * @param {string} [options.storagePath]
   */
  constructor(options = {}) {
    this.storagePath = options.storagePath || null;
    this.entries = [];
    this.manifestRegistry = new Map(); // manifestId -> { sha256, mediaPath, mediaSha256, publishedAt }

    if (this.storagePath && fs.existsSync(this.storagePath)) {
      this.load();
    } else {
      this._initGenesis();
    }
  }

  /**
   * Initializes the immutable genesis block.
   */
  _initGenesis() {
    const timestamp = '2026-10-21T00:00:00.000Z';
    const genesisData = {
      index: 0,
      timestamp,
      action: 'GENESIS',
      targetId: 'eme-system',
      actor: 'system',
      payloadHash: crypto.createHash('sha256').update('EME_GOVERNANCE_GENESIS').digest('hex'),
      prevHash: GENESIS_PREV_HASH
    };
    const hash = this._computeEntryHash(genesisData);
    this.entries = [{ ...genesisData, hash }];
    this._persist();
  }

  /**
   * Computes SHA-256 hash for a ledger entry.
   */
  _computeEntryHash(data) {
    const serialized = [
      data.index,
      data.timestamp,
      data.action,
      data.targetId,
      data.actor,
      data.payloadHash,
      data.prevHash
    ].join('|');
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Records a governance event into the hash-chained ledger.
   *
   * @param {string} action - Event action identifier
   * @param {string} targetId - Identifier of targeted resource
   * @param {string} actor - Entity authorizing the action
   * @param {object|string} payload - Event payload to be hashed
   * @returns {object} Newly created and sealed entry
   */
  recordEvent(action, targetId, actor, payload = {}) {
    const lastEntry = this.entries[this.entries.length - 1];
    const prevHash = lastEntry ? lastEntry.hash : GENESIS_PREV_HASH;
    const index = this.entries.length;
    const timestamp = new Date().toISOString();

    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    const entryData = {
      index,
      timestamp,
      action: String(action).toUpperCase(),
      targetId: String(targetId),
      actor: String(actor),
      payloadHash,
      prevHash
    };

    const hash = this._computeEntryHash(entryData);
    const sealedEntry = { ...entryData, hash };

    this.entries.push(sealedEntry);
    this._persist();

    defaultLogger.info(`Governance Ledger: ${sealedEntry.action} (#${index})`, {
      targetId,
      actor,
      hash
    });

    return sealedEntry;
  }

  /**
   * Alias for recordEvent to support append semantics.
   */
  append(action, targetId, actor, payload = {}) {
    return this.recordEvent(action, targetId, actor, payload);
  }

  /**
   * Registers and certifies a delivery manifest.
   *
   * @param {string} manifestId
   * @param {object} manifestDetails
   * @returns {object} Certification outcome
   */
  certifyManifest(manifestId, manifestDetails = {}) {
    const { sha256, mediaPath, mediaSha256, revisionId } = manifestDetails;
    if (!manifestId || !sha256) {
      throw new Error('Manifest certification requires manifestId and sha256');
    }

    if (this.manifestRegistry.has(manifestId)) {
      const existing = this.manifestRegistry.get(manifestId);
      if (existing.sha256 !== sha256) {
        throw new Error(`Manifest ID collision: manifest ${manifestId} already registered with different checksum`);
      }
      return { certified: true, manifest: existing, isNew: false };
    }

    const record = {
      manifestId,
      sha256,
      mediaPath: mediaPath || null,
      mediaSha256: mediaSha256 || null,
      revisionId: revisionId || null,
      certifiedAt: new Date().toISOString()
    };

    this.manifestRegistry.set(manifestId, record);
    this.recordEvent('MANIFEST_CERTIFIED', manifestId, 'qa-engine', record);

    return { certified: true, manifest: record, isNew: true };
  }

  /**
   * Verifies whether an active delivery candidate is certified in the registry.
   *
   * @param {object} delivery
   * @returns {boolean}
   */
  isDeliveryCertified(delivery) {
    if (!delivery || !delivery.manifest_id) return false;
    const cert = this.manifestRegistry.get(delivery.manifest_id);
    if (!cert) return false;
    if (delivery.media_sha256 && cert.mediaSha256 && delivery.media_sha256 !== cert.mediaSha256) {
      return false;
    }
    return true;
  }

  /**
   * Returns hash of the latest entry on the cryptographic hash chain.
   */
  getHeadHash() {
    const last = this.entries[this.entries.length - 1];
    return last ? last.hash : GENESIS_PREV_HASH;
  }

  /**
   * Alias for verifyChainIntegrity.
   */
  validateIntegrity() {
    return this.verifyChainIntegrity();
  }

  /**
   * Validates cryptographic integrity of the entire chain from genesis to head.
   *
   * @returns {{ valid: boolean, chainLength: number, error?: string, tamperedIndex?: number }}
   */
  verifyChainIntegrity() {
    if (!this.entries || this.entries.length === 0) {
      return { valid: false, chainLength: 0, error: 'Empty chain' };
    }

    // 1. Genesis check
    const genesis = this.entries[0];
    if (genesis.index !== 0 || genesis.prevHash !== GENESIS_PREV_HASH) {
      return { valid: false, chainLength: this.entries.length, tamperedIndex: 0, error: 'Genesis block corrupted' };
    }
    const computedGenHash = this._computeEntryHash(genesis);
    if (computedGenHash !== genesis.hash) {
      return { valid: false, chainLength: this.entries.length, tamperedIndex: 0, error: 'Genesis block hash mismatch' };
    }

    // 2. Linear hash-chain linkage check
    for (let i = 1; i < this.entries.length; i++) {
      const current = this.entries[i];
      const prev = this.entries[i - 1];

      if (current.index !== i) {
        return { valid: false, chainLength: this.entries.length, tamperedIndex: i, error: `Index mismatch at ${i}` };
      }

      if (current.prevHash !== prev.hash) {
        return { valid: false, chainLength: this.entries.length, tamperedIndex: i, error: `Broken chain link at index ${i}` };
      }

      const computedHash = this._computeEntryHash(current);
      if (computedHash !== current.hash) {
        return { valid: false, chainLength: this.entries.length, tamperedIndex: i, error: `Content tamper detected at index ${i}` };
      }
    }

    return { valid: true, chainLength: this.entries.length };
  }

  /**
   * Persists ledger to storage file if storagePath is configured.
   */
  _persist() {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      fs.mkdirSync(dir, { recursive: true });
      const serialized = JSON.stringify({
        schema_version: '1.0.0',
        entries: this.entries,
        manifests: Array.from(this.manifestRegistry.entries())
      }, null, 2);
      const tmp = `${this.storagePath}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, serialized, 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (e) {
      defaultLogger.error(`Failed to persist governance ledger: ${e.message}`);
    }
  }

  /**
   * Loads ledger from storage file.
   */
  load() {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const data = JSON.parse(raw);
      this.entries = data.entries || [];
      if (Array.isArray(data.manifests)) {
        this.manifestRegistry = new Map(data.manifests);
      }
    } catch (e) {
      defaultLogger.error(`Failed to load governance ledger: ${e.message}`);
      this._initGenesis();
    }
  }
}

module.exports = {
  GovernanceLedger,
  GENESIS_PREV_HASH
};
