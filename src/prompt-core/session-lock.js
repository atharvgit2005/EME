/**
 * Editing Mechanics Engine (EME) - Hierarchical Distributed Lock Coordinator
 *
 * Implements Stage 19.3 & Stage 19.5 Revision 2 Lock Ownership & Recovery Guarantees:
 * 1. Global Lock Acquisition Order: Session Lock ([session_id].lock) < Job Lock ([job_id].lock)
 * 2. Atomic OS Mutex Primitive: fs.openSync(path, 'wx') with O_CREAT | O_EXCL
 * 3. Structured Ownership Metadata: { lock_id, target_type, target_id, owner_id, pid, hostname, fencing_token, acquired_at, last_heartbeat }
 * 4. Process Liveness Semantics: Uses process.kill(pid, 0) to check true OS process existence;
 *    live owners are NEVER displaced simply because time elapsed.
 * 5. Serialized Reclamation Gate: Concurrent reclaimers serialize through [lockPath].reclaim_gate,
 *    re-verifying lock_id and process liveness under the gate before touching the lock file.
 *    Guarantees that a delayed reclaimer CANNOT displace or delete a successor's live lock.
 * 6. Durable Per-Resource Fencing Sequence Counter: Stored durably in [lockDir]/[target]_[id].fencing_seq,
 *    monotonically advancing across releases, crash recovery, and service restarts.
 * 7. Fencing Token Guarding: Monotonically increasing fencing tokens prevent former owners from
 *    committing mutations after lock transfer.
 * 8. Verified Release: Releases verify owner_id and fencing_token before unlinking.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync, spawnSync } = require('node:child_process');

class LockAcquisitionError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'LockAcquisitionError';
    this.code = code;
    this.details = details;
  }
}

class SessionLockCoordinator {
  /**
   * @param {object} options
   * @param {string} [options.lockDir='artifacts/locks'] Directory where lock files are maintained
   * @param {number} [options.defaultLeaseMs=30000] Advisory lease timeout for logging (ms)
   */
  constructor(options = {}) {
    this.lockDir = options.lockDir || path.resolve('artifacts/locks');
    this.defaultLeaseMs = options.defaultLeaseMs || 30000;
    fs.mkdirSync(this.lockDir, { recursive: true });
    this.hostname = os.hostname();
  }

  /**
   * Computes the filesystem path for a target lock.
   */
  getLockPath(targetType, targetId) {
    const sanitizedId = String(targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.lockDir, `${targetType}_${sanitizedId}.lock`);
  }

  /**
   * Computes the filesystem path for a target's durable fencing sequence counter.
   */
  getFencingSeqPath(targetType, targetId) {
    const sanitizedId = String(targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.lockDir, `${targetType}_${sanitizedId}.fencing_seq`);
  }

  /**
   * Computes the filesystem path for the serialized reclamation gate.
   */
  getReclaimGatePath(lockPath) {
    return `${lockPath}.reclaim_gate`;
  }

  /**
   * Reads and advances the durable monotonic fencing token for a protected resource.
   * Guarantees monotonic progression across normal release, crash recovery, and service restarts.
   */
  nextFencingToken(targetType, targetId) {
    const seqPath = this.getFencingSeqPath(targetType, targetId);
    let currentSeq = 0;
    if (fs.existsSync(seqPath)) {
      try {
        const raw = fs.readFileSync(seqPath, 'utf8').trim();
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          currentSeq = parsed;
        }
      } catch (e) {}
    }

    const nextSeq = currentSeq + 1;
    const tmpPath = `${seqPath}.tmp.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}`;
    try {
      fs.writeFileSync(tmpPath, String(nextSeq), 'utf8');
      fs.renameSync(tmpPath, seqPath);
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (err) {}
      // Fallback direct write
      fs.writeFileSync(seqPath, String(nextSeq), 'utf8');
    }
    return nextSeq;
  }

  /**
   * Checks whether an OS process with given PID is actively running.
   * Uses signal 0 to perform kernel-level existence check without altering target process.
   */
  isProcessAlive(pid) {
    if (!pid || typeof pid !== 'number' || isNaN(pid)) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM means process exists but belongs to different UID (still alive)
      return err.code === 'EPERM';
    }
  }

  /**
   * Performs fail-closed inspection of open file descriptors on a file using lsof.
   *
   * Distinguishes (Gate A3):
   * 1. LIVE_HOLDER: Successful inspection showing one or more live processes holding the file.
   * 2. NO_HOLDER: Successful inspection confirming no process holds the file (exit code 1, empty stderr).
   * 3. ERROR: Inspection failed (executable missing, permission error, timeout, non-zero system error).
   *
   * Invariant: If inspection returns ERROR, liveness is uncertain and callers MUST fail closed.
   * Uncertainty must NEVER be interpreted as proof that a resource is abandoned.
   *
   * @param {string} filePath
   * @returns {{ status: 'LIVE_HOLDER'|'NO_HOLDER'|'ERROR', hasLiveHolder: boolean, pids: number[], error?: string }}
   */
  _checkFileLiveness(filePath) {
    if (!fs.existsSync(filePath)) {
      return { status: 'NO_HOLDER', hasLiveHolder: false, pids: [] };
    }

    try {
      const res = spawnSync('lsof', ['-t', filePath], {
        encoding: 'utf8',
        timeout: 1500
      });

      if (res.error) {
        return { status: 'ERROR', hasLiveHolder: false, pids: [], error: res.error.message };
      }

      if (res.status === 0) {
        const out = (res.stdout || '').trim();
        if (out) {
          const pids = out.split('\n')
            .map(p => parseInt(p.trim(), 10))
            .filter(p => !isNaN(p) && p > 0);
          const livePids = pids.filter(p => this.isProcessAlive(p));
          if (livePids.length > 0) {
            return { status: 'LIVE_HOLDER', hasLiveHolder: true, pids: livePids };
          }
        }
        return { status: 'NO_HOLDER', hasLiveHolder: false, pids: [] };
      }

      if (res.status === 1 && (!res.stderr || res.stderr.trim().length === 0)) {
        return { status: 'NO_HOLDER', hasLiveHolder: false, pids: [] };
      }

      return { status: 'ERROR', hasLiveHolder: false, pids: [], error: (res.stderr || `lsof exited with code ${res.status}`).trim() };
    } catch (e) {
      return { status: 'ERROR', hasLiveHolder: false, pids: [], error: e.message };
    }
  }

  /**
   * Helper that returns the PID of a live holder, or null if verified NO_HOLDER or ERROR.
   */
  _getFileHoldingPid(filePath) {
    const liveness = this._checkFileLiveness(filePath);
    return liveness.hasLiveHolder ? liveness.pids[0] : null;
  }

  /**
   * Reads and parses metadata from an existing lock file.
   */
  readLockMetadata(lockPath) {
    try {
      if (!fs.existsSync(lockPath)) return null;
      const raw = fs.readFileSync(lockPath, 'utf8');
      if (!raw || raw.trim().length === 0) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Attempts to acquire an individual lock for a specified target (e.g. 'session' or 'job').
   *
   * @param {string} targetType 'session' | 'job'
   * @param {string} targetId Unique target identifier
   * @param {object} [options]
   * @param {string} [options.ownerId] Custom owner identifier (defaults to pid-time-random)
   * @returns {object} Lock handle with release() and verifyActive() methods
   */
  acquireLock(targetType, targetId, options = {}) {
    const lockPath = this.getLockPath(targetType, targetId);
    const pid = process.pid;
    const ownerId = options.ownerId || `${this.hostname}-${pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const nowIso = new Date().toISOString();

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;
      let fd = null;
      try {
        // Step 1: Atomic creation using O_CREAT | O_EXCL
        fd = fs.openSync(lockPath, 'wx');

        // Determine durable, monotonic fencing token
        const fencingToken = this.nextFencingToken(targetType, targetId);

        const metadata = {
          lock_id: `lock-${crypto.randomBytes(6).toString('hex')}`,
          target_type: targetType,
          target_id: targetId,
          owner_id: ownerId,
          pid,
          hostname: this.hostname,
          fencing_token: fencingToken,
          acquired_at: nowIso,
          last_heartbeat: nowIso,
          lease_ms: this.defaultLeaseMs
        };

        fs.writeFileSync(fd, JSON.stringify(metadata, null, 2), 'utf8');
        fs.closeSync(fd);
        fd = null;

        return this._createLockHandle(lockPath, metadata);
      } catch (err) {
        if (fd !== null) {
          try { fs.closeSync(fd); } catch (e) {}
        }

        if (err.code !== 'EEXIST') {
          throw new LockAcquisitionError(`Failed to create lock file: ${err.message}`, 'LOCK_IO_ERROR', { targetType, targetId });
        }

        // Step 2: Lock file already exists. Inspect current owner.
        let currentMeta = this.readLockMetadata(lockPath);
        if (!currentMeta) {
          if (fs.existsSync(lockPath)) {
            const liveness = this._checkFileLiveness(lockPath);
            if (liveness.hasLiveHolder) {
              // Live process is actively writing metadata
              continue;
            }
            if (liveness.status === 'ERROR') {
              // Fail closed: uncertainty cannot assume abandonment
              throw new LockAcquisitionError(
                `Cannot determine liveness of uninitialized lock file: ${liveness.error || 'Inspection error'}`,
                'LIVENESS_INSPECTION_UNAVAILABLE',
                { targetType, targetId, error: liveness.error }
              );
            }
            // Verified NO_HOLDER: Uninitialized 0-byte lock file whose creator died! Safe to reclaim via gate.
            currentMeta = { pid: null, lock_id: 'uninitialized-lock', owner_id: 'dead-uninitialized' };
          } else {
            continue;
          }
        }

        // Step 3: Check OS process liveness of existing owner
        const isOwnerAlive = this.isProcessAlive(currentMeta.pid);

        if (isOwnerAlive) {
          // Live process owns the lock. Strictly reject acquisition.
          // Invariant: Live owners are NEVER displaced simply because time elapsed.
          throw new LockAcquisitionError(
            `Target ${targetType}:${targetId} is locked by live process PID ${currentMeta.pid} (owner: ${currentMeta.owner_id})`,
            'LOCKED_BY_LIVE_OWNER',
            {
              targetType,
              targetId,
              currentOwner: currentMeta
            }
          );
        }

        // Step 4: Stale Lock Detected (Owner PID is dead/crashed).
        // Safely reclaim using Serialized Reclamation Gate to prevent concurrent reclaimer race:
        this._reclaimStaleLockSafely(lockPath, currentMeta);
        // Loop back to Step 1 to atomically create the new lock
      }
    }

    throw new LockAcquisitionError(
      `Exceeded max attempts acquiring lock for ${targetType}:${targetId}`,
      'LOCK_CONTENTION_TIMEOUT',
      { targetType, targetId }
    );
  }

  /**
   * Atomically and non-overwritingly publishes complete token metadata.
   * Conforms to Phase 19 Final Closure Directive, Revision 11 (Gate A6):
   * 1. Writes complete JSON metadata to a private temporary file in the same directory.
   * 2. Flushes the file descriptor to disk via fsyncSync before closing.
   * 3. Publishes to targetPath using atomic POSIX linkSync.
   * 4. If targetPath already exists, linkSync fails with EEXIST without touching or corrupting targetPath.
   * 5. The private temporary file is always cleaned up in finally.
   * Target path NEVER points to an empty, truncated, or unparseable record.
   *
   * @param {string} targetPath
   * @param {object} tokenMeta
   * @returns {{ ok: boolean, code?: string, error?: string }}
   */
  /**
   * Synchronizes parent directory metadata to durable storage (POSIX directory fsync).
   * Conforms to Phase 19 Final Closure Directive, Revision 13 (Gate A8):
   * Flushes the directory file descriptor to ensure atomic links survive power loss on supported filesystems.
   * Returns an explicit result distinguishing confirmed durability from degraded or unsupported durability.
   *
   * @param {string} dirPath
   * @returns {{ synced: boolean, error: string|null, code?: string }}
   */
  _syncDirectory(dirPath) {
    let dirFd = null;
    try {
      dirFd = fs.openSync(dirPath, fs.constants.O_RDONLY);
      fs.fsyncSync(dirFd);
      return { synced: true, error: null };
    } catch (e) {
      // Platform limitation: directory fsync may be unsupported on some virtual filesystems or OS mount types.
      return { synced: false, error: e.message, code: e.code || 'UNSUPPORTED' };
    } finally {
      if (dirFd !== null) {
        try { fs.closeSync(dirFd); } catch (e) {}
      }
    }
  }

  /**
   * Atomically and non-overwritingly publishes complete token metadata.
   * Conforms to Phase 19 Final Closure Directive, Revision 13 (Gate A6 & Gate A8):
   * 1. Writes complete JSON metadata to a private temporary file in the same directory.
   * 2. Flushes the file descriptor to disk via fsyncSync before closing.
   * 3. Publishes to targetPath using atomic POSIX linkSync.
   * 4. Invokes _syncDirectory(dir) to synchronize parent directory metadata and captures the explicit durability result.
   * 5. If directory sync fails/unsupported after publication: preserves targetPath, reporting published: true, durable: false.
   * 6. If targetPath already exists: linkSync fails with EEXIST without touching or corrupting targetPath.
   * 7. The private temporary file is always cleaned up in finally.
   *
   * @param {string} targetPath
   * @param {object} tokenMeta
   * @returns {{ ok: boolean, code?: string, error?: string, durable?: boolean, durabilityLimitation?: string|null }}
   */
  _publishRecoveryToken(targetPath, tokenMeta) {
    const dir = path.dirname(targetPath);
    const tmpPath = path.join(dir, `.tmp_token_${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    let tmpFd = null;
    try {
      tmpFd = fs.openSync(tmpPath, 'wx');
      fs.writeFileSync(tmpFd, JSON.stringify(tokenMeta, null, 2), 'utf8');
      fs.fsyncSync(tmpFd);
      fs.closeSync(tmpFd);
      tmpFd = null;

      // Atomically publish via non-overwriting POSIX linkSync
      fs.linkSync(tmpPath, targetPath);

      // Parent directory synchronization for durable persistence across power loss (Gate A8)
      const syncResult = this._syncDirectory(dir);

      return {
        ok: true,
        durable: syncResult.synced,
        durabilityLimitation: syncResult.synced ? null : (syncResult.code || syncResult.error)
      };
    } catch (err) {
      if (tmpFd !== null) {
        try { fs.closeSync(tmpFd); } catch (e) {}
        tmpFd = null;
      }
      if (err.code === 'EEXIST') {
        return { ok: false, code: 'EEXIST' };
      }
      return { ok: false, code: err.code || 'ERROR', error: err.message };
    } finally {
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (e) {}
    }
  }

  /**
   * Safely relinquishes recovery token authority via an explicit, identity-linked release record.
   * Conforms to Phase 19 Final Closure Directive, Revision 13 (Gate A7 & Gate A8):
   * 1. Publishes an immutable release record (${tokenPrefix}.rel_${tokenMeta.token_id}.token).
   * 2. The record cryptographically binds the released token ID, owner PID, and release reason (COMPLETED/ABORTED).
   * 3. Subsequent contenders and resolvers verify this release record, allowing succession without waiting
   *    for the releasing process to exit, while permanently rejecting stale actions from the released owner.
   * 4. Propagates explicit publication and durability status to the caller.
   *
   * @param {string} claimPath
   * @param {object} tokenMeta
   * @param {string} reason 'COMPLETED' | 'ABORTED'
   * @returns {{ ok: boolean, durable?: boolean, durabilityLimitation?: string|null, error?: string }}
   */
  _releaseRecoveryToken(claimPath, tokenMeta, reason = 'COMPLETED') {
    if (!tokenMeta || !tokenMeta.token_id) return { ok: false, error: 'NO_TOKEN_META' };
    const observedId = tokenMeta.for_claim_id || 'recovered-claim';
    const tokenPrefix = `${claimPath}.reclaim_${observedId}`;
    const relPath = `${tokenPrefix}.rel_${tokenMeta.token_id}.token`;

    const relMeta = {
      token_id: `rel-${crypto.randomBytes(6).toString('hex')}`,
      released_token_id: tokenMeta.token_id,
      reclaimer_pid: process.pid,
      for_claim_id: observedId,
      status: 'RELEASED',
      reason,
      released_at: new Date().toISOString()
    };

    return this._publishRecoveryToken(relPath, relMeta);
  }

  /**
   * Resolves the current active recovery token in the immutable generation chain.
   * Conforms to Phase 19 Final Closure Directive, Revision 12 (Gate A6 & Gate A7):
   * Chains from root token through successor tokens without in-place displacement or TOCTOU races.
   * Detects and explicitly flags malformed/corrupt records so callers fail closed instead of
   * repeatedly retrying on occupied paths.
   * Checks explicit identity-linked release records (rel_${token_id}.token) to distinguish actively
   * held tokens from relinquished tokens.
   *
   * @param {string} tokenPrefix
   * @returns {{ activeTokenPath: string, activeMeta: object|null, generation: number, corrupt: boolean }}
   */
  _resolveActiveRecoveryToken(tokenPrefix) {
    const rootTokenPath = `${tokenPrefix}.root.token`;
    if (!fs.existsSync(rootTokenPath)) {
      return { activeTokenPath: rootTokenPath, activeMeta: null, generation: 0, corrupt: false };
    }

    let curPath = rootTokenPath;
    let curMeta = this.readLockMetadata(rootTokenPath);
    let generation = 0;

    if (!curMeta || !curMeta.token_id) {
      // Root token exists on disk but is corrupt or empty!
      return { activeTokenPath: rootTokenPath, activeMeta: null, generation: 0, corrupt: true };
    }

    const checkRelease = (meta) => {
      const relPath = `${tokenPrefix}.rel_${meta.token_id}.token`;
      if (fs.existsSync(relPath)) {
        const relMeta = this.readLockMetadata(relPath);
        if (relMeta && relMeta.released_token_id === meta.token_id) {
          meta.released = true;
          meta.releaseReason = relMeta.reason;
          meta.releasedAt = relMeta.released_at;
          meta.releaseRecordPath = relPath;
        }
      }
    };

    checkRelease(curMeta);

    // Follow immutable successor chain
    while (curMeta && curMeta.token_id) {
      const succPath = `${tokenPrefix}.succ_${curMeta.token_id}.token`;
      if (fs.existsSync(succPath)) {
        const succMeta = this.readLockMetadata(succPath);
        if (!succMeta || !succMeta.token_id) {
          // Successor path exists but contains empty/corrupt metadata!
          // Explicitly report corrupt: true so contenders fail closed rather than
          // silently ignoring it or retrying the occupied path.
          return { activeTokenPath: succPath, activeMeta: null, generation: generation + 1, corrupt: true };
        }
        checkRelease(succMeta);
        curPath = succPath;
        curMeta = succMeta;
        generation++;
        continue;
      }
      break;
    }

    return { activeTokenPath: curPath, activeMeta: curMeta, generation, corrupt: false };
  }

  /**
   * Acquires the exclusive ephemeral recovery token using an immutable generation-chained successor protocol.
   * Conforms to Phase 19 Final Closure Directive, Revision 12 (Gate A6 & Gate A7):
   * 1. If root token is absent, atomically publishes root token via _publishRecoveryToken.
   * 2. If root token exists, resolves current active token in generation chain.
   * 3. If malformed/corrupt token detected in chain: fails closed immediately (MALFORMED_RECOVERY_TOKEN_IN_CHAIN).
   * 4. Checks active token liveness and release status:
   *    - If holder is alive AND has not released: aborts immediately (LOCKED_BY_LIVE_RECLAIMER).
   *    - If holder is DEAD OR has explicitly released: contender publishes complete successor token tied
   *      specifically to activeMeta.token_id via atomic POSIX linkSync (${tokenPrefix}.succ_${activeMeta.token_id}.token).
   * 5. Atomic non-overwriting linkSync guarantees that partial records are NEVER visible at the target path,
   *    and competing contenders fail with EEXIST without touching or corrupting the winning token.
   *
   * @param {string} claimPath
   * @param {string} observedId
   * @returns {{ ok: boolean, tokenFd: number|null, tokenPath: string|null, tokenMeta: object|null, tokenPrefix: string, liveReclaimer?: number, durable?: boolean, durabilityLimitation?: string|null, error?: string }}
   */
  _acquireRecoveryToken(claimPath, observedId) {
    const tokenPrefix = `${claimPath}.reclaim_${observedId}`;
    const rootTokenPath = `${tokenPrefix}.root.token`;

    for (let attempt = 0; attempt < 5; attempt++) {
      // Step 1: Attempt atomic root token publication if absent
      if (!fs.existsSync(rootTokenPath)) {
        const rootMeta = {
          token_id: `token-${crypto.randomBytes(6).toString('hex')}`,
          reclaimer_pid: process.pid,
          for_claim_id: observedId,
          generation: 0,
          acquired_at: new Date().toISOString()
        };
        const pubResult = this._publishRecoveryToken(rootTokenPath, rootMeta);
        if (pubResult.ok) {
          return {
            ok: true,
            tokenFd: null,
            tokenPath: rootTokenPath,
            tokenMeta: rootMeta,
            tokenPrefix,
            durable: pubResult.durable,
            durabilityLimitation: pubResult.durabilityLimitation
          };
        }
        if (pubResult.code !== 'EEXIST') {
          return { ok: false, tokenFd: null, tokenPath: null, tokenMeta: null, tokenPrefix, error: pubResult.error };
        }
        // EEXIST: Another contender published root token first; proceed to generation chain resolution
      }

      // Step 2: Root exists. Resolve active token in generation chain:
      const resolved = this._resolveActiveRecoveryToken(tokenPrefix);
      if (resolved.corrupt) {
        // Fail closed: malformed/corrupt token detected in chain.
        // Never treat an invalid successor as though no successor had ever been published!
        // Never retry the permanently occupied path!
        return { ok: false, tokenFd: null, tokenPath: resolved.activeTokenPath, tokenMeta: null, tokenPrefix, error: 'MALFORMED_RECOVERY_TOKEN_IN_CHAIN' };
      }

      const { activeTokenPath, activeMeta, generation } = resolved;
      if (!activeMeta || !activeMeta.reclaimer_pid) {
        return { ok: false, tokenFd: null, tokenPath: activeTokenPath, tokenMeta: null, tokenPrefix, error: 'MISSING_RECOVERY_TOKEN_METADATA' };
      }

      // Step 3: Check liveness and release status of active token holder (Gate A7)
      const isTokenActive = !activeMeta.released && this.isProcessAlive(activeMeta.reclaimer_pid);

      if (isTokenActive) {
        // Live reclaimer actively owns the critical section!
        return { ok: false, tokenFd: null, tokenPath: activeTokenPath, liveReclaimer: activeMeta.reclaimer_pid, tokenPrefix };
      }

      // Step 4: Active token holder is DEAD OR HAS EXPLICITLY RELEASED!
      // In both cases, authority has ceased. Contender atomically publishes successor tied specifically to this token identity:
      const succPath = `${tokenPrefix}.succ_${activeMeta.token_id}.token`;
      const succMeta = {
        token_id: `token-${crypto.randomBytes(6).toString('hex')}`,
        reclaimer_pid: process.pid,
        for_claim_id: observedId,
        predecessor_token_id: activeMeta.token_id,
        generation: generation + 1,
        acquired_at: new Date().toISOString()
      };

      const pubResult = this._publishRecoveryToken(succPath, succMeta);
      if (pubResult.ok) {
        return {
          ok: true,
          tokenFd: null,
          tokenPath: succPath,
          tokenMeta: succMeta,
          tokenPrefix,
          durable: pubResult.durable,
          durabilityLimitation: pubResult.durabilityLimitation
        };
      }
      if (pubResult.code === 'EEXIST') {
        // Another contender already claimed succession of this specific dead/released token!
        continue;
      }
      return { ok: false, tokenFd: null, tokenPath: null, tokenMeta: null, tokenPrefix, error: pubResult.error };
    }

    return { ok: false, tokenFd: null, tokenPath: null, tokenMeta: null, tokenPrefix };
  }

  /**
   * Safely reclaims an abandoned claim reservation without displacement races, vacancy, or TOCTOU.
   * Conforms to Phase 19 Final Closure Directive, Revision 10 (Gate A1 CAS & Gate A5 Generation Chain):
   * 1. Inspects the claim in place to establish the observed owner identity.
   * 2. Serializes competing reclaimers under an immutable generation-chained token acquired via _acquireRecoveryToken.
   * 3. Under the exclusive token, REVALIDATES that claimPath still exists and still matches observedId!
   *    - If claimPath belongs to a live claimant or its claim_id has changed: ABORTS IMMEDIATELY!
   *    - A delayed reclaimer CANNOT displace, overwrite, or modify a live successor's claim.
   * 4. In-place Atomic Publication: Writes new claim metadata to a temporary file and replaces claimPath
   *    via fs.renameSync(tmpPath, claimPath). claimPath is NEVER absent from the filesystem, preventing
   *    concurrent processes from acquiring the path while vacant.
   * 5. Releases the recovery token safely in finally.
   *
   * @param {string} claimPath
   * @param {object|null} observedClaimMeta
   * @returns {boolean} true if abandoned claim was safely reclaimed in-place; false if live or changed
   */
  _recoverAbandonedClaim(claimPath, observedClaimMeta) {
    if (!fs.existsSync(claimPath)) return false;

    // 1. Establish observed claim identity
    const observedId = (observedClaimMeta && observedClaimMeta.claim_id)
      ? observedClaimMeta.claim_id
      : (observedClaimMeta && observedClaimMeta.claimant_pid
          ? `pid-${observedClaimMeta.claimant_pid}`
          : '0byte-claim');

    // 2. Serialized Reclamation Token for this specific dead claim identity (Gate A5 Generation Chain)
    const tokenResult = this._acquireRecoveryToken(claimPath, observedId);
    if (!tokenResult.ok) {
      return false; // Could not acquire token or live reclaimer holds it
    }
    const tokenFd = tokenResult.tokenFd;
    const tokenPath = tokenResult.tokenPath;
    const tokenMeta = tokenResult.tokenMeta;

    let recoverySucceeded = false;
    try {
      // 3. Under exclusive token, REVALIDATE that claimPath still exists and matches observedId
      if (!fs.existsSync(claimPath)) {
        return false;
      }

      let curMeta = null;
      try {
        const raw = fs.readFileSync(claimPath, 'utf8');
        if (raw && raw.trim().length > 0) {
          curMeta = JSON.parse(raw);
        }
      } catch (e) {}

      if (curMeta && curMeta.claimant_pid) {
        // If current claimant is alive, DO NOT TOUCH IT!
        if (this.isProcessAlive(curMeta.claimant_pid)) {
          return false;
        }
        // If current claim_id does not match observedId, a different claim appeared! DO NOT TOUCH IT!
        const curId = curMeta.claim_id || `pid-${curMeta.claimant_pid}`;
        if (curId !== observedId) {
          return false;
        }
      } else {
        // 0-byte claim file on disk
        if (observedId !== '0byte-claim') {
          return false; // Identity diverged from observed
        }
        const liveness = this._checkFileLiveness(claimPath);
        if (liveness.hasLiveHolder || liveness.status === 'ERROR') {
          return false; // Live holder appeared or inspection error (fail closed!)
        }
      }

      // 4. In-Place Atomic Replacement:
      // Publish new live claim metadata without EVER leaving claimPath vacant!
      const newClaimMeta = {
        claimant_pid: process.pid,
        for_dead_gate: (observedClaimMeta && observedClaimMeta.for_dead_gate) || 'recovered-gate',
        claim_id: `claim-${crypto.randomBytes(6).toString('hex')}`,
        claimed_at: new Date().toISOString()
      };
      const tmpClaimPath = `${claimPath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpClaimPath, JSON.stringify(newClaimMeta, null, 2), 'utf8');
      fs.renameSync(tmpClaimPath, claimPath);
      recoverySucceeded = true;

      return true;
    } finally {
      // 5. Safely release recovery token via explicit release record (Gate A7)
      if (tokenFd !== null) {
        try { fs.closeSync(tokenFd); } catch (e) {}
      }
      try {
        if (tokenMeta) {
          this._releaseRecoveryToken(claimPath, tokenMeta, recoverySucceeded ? 'COMPLETED' : 'ABORTED');
        }
      } catch (e) {}
    }
  }

  /**
   * Acquires exclusive claim reservation on a dead gate.
   * Recovers from crashed claimants at every boundary:
   * 1. 0-byte or unparseable claim files left by processes killed before writing metadata.
   * 2. Claims left by processes killed after writing metadata (claimant PID dead).
   * Respects claims held by live processes without displacing them.
   */
  _acquireClaim(claimPath, deadGateId) {
    for (let cAttempt = 0; cAttempt < 5; cAttempt++) {
      let claimFd = null;
      try {
        claimFd = fs.openSync(claimPath, 'wx');
        const claimMeta = {
          claimant_pid: process.pid,
          for_dead_gate: deadGateId,
          claim_id: `claim-${crypto.randomBytes(6).toString('hex')}`,
          claimed_at: new Date().toISOString()
        };
        fs.writeFileSync(claimFd, JSON.stringify(claimMeta, null, 2), 'utf8');
        return { ok: true, claimFd, claimMeta };
      } catch (claimErr) {
        if (claimFd !== null) {
          try { fs.closeSync(claimFd); } catch (e) {}
          claimFd = null;
        }

        if (claimErr.code !== 'EEXIST') {
          return { ok: false, claimFd: null };
        }

        // Claim file already exists. Inspect it for liveness and identity.
        if (!fs.existsSync(claimPath)) {
          continue; // Unlinked concurrently, retry openSync
        }

        let claimMeta = null;
        try {
          const raw = fs.readFileSync(claimPath, 'utf8');
          if (raw && raw.trim().length > 0) {
            claimMeta = JSON.parse(raw);
          }
        } catch (e) {}

        if (claimMeta && claimMeta.claimant_pid) {
          if (this.isProcessAlive(claimMeta.claimant_pid)) {
            // Live claimant actively holds this claim! Respect it.
            return { ok: false, claimFd: null, liveClaimant: claimMeta.claimant_pid };
          }
          // Claimant PID is DEAD! Recover in-place under serialized CAS critical section.
          const recovered = this._recoverAbandonedClaim(claimPath, claimMeta);
          if (recovered) {
            const newMeta = this.readLockMetadata(claimPath);
            return { ok: true, claimFd: null, claimMeta: newMeta };
          } else {
            return { ok: false, claimFd: null };
          }
        }

        // Claim file is 0 bytes or unparseable JSON
        const liveness = this._checkFileLiveness(claimPath);
        if (liveness.hasLiveHolder) {
          // Live process is actively writing
          continue;
        }
        if (liveness.status === 'ERROR') {
          // Liveness inspection failed (fail closed!)
          return { ok: false, claimFd: null, error: 'LIVENESS_INSPECTION_UNAVAILABLE' };
        }

        // Verified abandoned 0-byte claim with confirmed absence of live holder
        const recovered = this._recoverAbandonedClaim(claimPath, { for_dead_gate: deadGateId });
        if (recovered) {
          const newMeta = this.readLockMetadata(claimPath);
          return { ok: true, claimFd: null, claimMeta: newMeta };
        } else {
          return { ok: false, claimFd: null };
        }
      }
    }
    return { ok: false, claimFd: null };
  }

  /**
   * Acquires the exclusive reclamation gate for a given lock path.
   * Uses an atomic claim file (`[gatePath].[deadGateId].claim`) to serialize concurrent
   * reclaimers attempting to recover the same dead gate owner.
   * Handles process termination at every material boundary:
   * 1. After creating claim reservation but before writing metadata (0-byte claim).
   * 2. After writing claim metadata but before re-verifying dead gate.
   * 3. During replacement of stale gate.
   * 4. After gate replacement but before claim cleanup.
   * 5. After creating reclamation gate but before publishing complete gate metadata.
   * Guarantees that a delayed reclaimer can NEVER displace a live owner's gate.
   */
  _acquireReclamationGate(gatePath) {
    for (let attempt = 0; attempt < 5; attempt++) {
      let gateFd = null;
      try {
        // Attempt 1: Standard atomic creation via O_CREAT | O_EXCL
        gateFd = fs.openSync(gatePath, 'wx');
        const gateMeta = {
          pid: process.pid,
          acquired_at: new Date().toISOString(),
          gate_id: `gate-${crypto.randomBytes(6).toString('hex')}`
        };
        fs.writeFileSync(gateFd, JSON.stringify(gateMeta, null, 2), 'utf8');
        return { ok: true, gateFd, gateMeta };
      } catch (gateErr) {
        if (gateFd !== null) {
          try { fs.closeSync(gateFd); } catch (e) {}
          gateFd = null;
        }

        if (gateErr.code !== 'EEXIST') {
          return { ok: false, gateFd: null };
        }

        // Gate file exists. Inspect liveness and identity of current gate owner.
        if (!fs.existsSync(gatePath)) {
          continue; // File unlinked in between, retry
        }

        let currentGate = null;
        try {
          const raw = fs.readFileSync(gatePath, 'utf8');
          if (raw && raw.trim().length > 0) {
            currentGate = JSON.parse(raw);
          }
        } catch (e) {
          // In-flight or corrupted
        }

        let deadGateId = null;

        if (currentGate && currentGate.pid) {
          if (this.isProcessAlive(currentGate.pid)) {
            // Gate owner is actively alive! Reclamation gate is legitimately occupied.
            return { ok: false, gateFd: null, liveOwner: currentGate.pid };
          }
          deadGateId = currentGate.gate_id || `pid-${currentGate.pid}`;
        } else {
          // Gate file is 0 bytes or unparseable JSON (creator died before/during write)
          const liveness = this._checkFileLiveness(gatePath);
          if (liveness.hasLiveHolder) {
            // Live process is actively writing gate metadata
            continue;
          }
          if (liveness.status === 'ERROR') {
            // Fail closed if liveness inspection fails
            return { ok: false, gateFd: null, error: 'LIVENESS_INSPECTION_UNAVAILABLE' };
          }
          // No live process owns this gate! It is a dead/abandoned uninitialized gate.
          deadGateId = 'abandoned-uninitialized-gate';
        }

        // Exclusively claim this specific dead gate to serialize concurrent reclaimers
        const claimPath = `${gatePath}.${deadGateId}.claim`;
        const claimResult = this._acquireClaim(claimPath, deadGateId);
        if (!claimResult.ok) {
          // Another reclaimer is actively handling or live claimant exists
          continue;
        }
        const claimFd = claimResult.claimFd;

        try {
          // Under the exclusive claim, re-verify gatePath identity and liveness
          if (!fs.existsSync(gatePath)) {
            continue; // Gate already cleaned by prior reclaimer
          }

          let verifyGate = null;
          try {
            const raw = fs.readFileSync(gatePath, 'utf8');
            if (raw && raw.trim().length > 0) {
              verifyGate = JSON.parse(raw);
            }
          } catch (e) {}

          if (verifyGate && verifyGate.pid) {
            const curVerifyGateId = verifyGate.gate_id || `pid-${verifyGate.pid}`;
            // Invariant: If gate is now owned by a live process or no longer matches the dead gate we claimed,
            // DO NOT TOUCH IT! A live successor is NEVER displaced.
            if (this.isProcessAlive(verifyGate.pid) || curVerifyGateId !== deadGateId) {
              return { ok: false, gateFd: null };
            }
          } else {
            // Gate is still uninitialized/0-byte. Check if a live process appeared.
            const liveness = this._checkFileLiveness(gatePath);
            if (liveness.hasLiveHolder || liveness.status === 'ERROR') {
              return { ok: false, gateFd: null };
            }
          }

          // Safe to displace the dead/abandoned gate under exclusive claim!
          const newGateMeta = {
            pid: process.pid,
            acquired_at: new Date().toISOString(),
            gate_id: `gate-${crypto.randomBytes(6).toString('hex')}`
          };

          const tmpGate = `${gatePath}.tmp.${process.pid}.${Date.now()}`;
          fs.writeFileSync(tmpGate, JSON.stringify(newGateMeta, null, 2), 'utf8');
          fs.renameSync(tmpGate, gatePath);

          return { ok: true, gateFd: null, gateMeta: newGateMeta };
        } finally {
          // Always release the atomic claim
          if (claimFd !== null) {
            try { fs.closeSync(claimFd); } catch (e) {}
          }
          try { fs.unlinkSync(claimPath); } catch (e) {}
        }
      }
    }
    return { ok: false, gateFd: null };
  }

  /**
   * Safely reclaims a stale lock using an atomic serialized reclamation gate.
   * Survives crashes of the gate holder and prevents the race condition where
   * reclaimer A displaces a newly created live lock by reclaimer B.
   */
  _reclaimStaleLockSafely(lockPath, observedStaleMeta) {
    const gatePath = this.getReclaimGatePath(lockPath);
    const gateResult = this._acquireReclamationGate(gatePath);
    if (!gateResult.ok) {
      return false;
    }
    const gateFd = gateResult.gateFd;
    const gateMeta = gateResult.gateMeta;

    try {
      // 2. Under the exclusive reclamation gate, RE-VERIFY the lock file
      if (!fs.existsSync(lockPath)) {
        return true;
      }

      const currentUnderGate = this.readLockMetadata(lockPath);
      if (!currentUnderGate) {
        // Uninitialized or 0-byte lock file on disk. Check liveness of file holder.
        const liveness = this._checkFileLiveness(lockPath);
        if (liveness.hasLiveHolder || liveness.status === 'ERROR') {
          return false; // Live process actively writing OR liveness check failed (fail-closed!)
        }
        // Verified NO_HOLDER! Dead 0-byte lock file. Safe to unlink.
        try { fs.unlinkSync(lockPath); } catch (e) {}
        return true;
      }

      // 3. Crucial Guard: Verify that the lock file STILL belongs to the dead owner observed
      // If a live owner already acquired it while we waited for the gate, DO NOT TOUCH IT!
      if (this.isProcessAlive(currentUnderGate.pid)) {
        return false;
      }

      // If lock was already replaced by another dead owner or token, verify match
      if (observedStaleMeta && observedStaleMeta.lock_id !== 'uninitialized-lock' &&
          (currentUnderGate.owner_id !== observedStaleMeta.owner_id ||
           currentUnderGate.lock_id !== observedStaleMeta.lock_id)) {
        return false;
      }

      // 4. Safe to remove the dead owner's lock file
      try {
        fs.unlinkSync(lockPath);
        return true;
      } catch (unlinkErr) {
        return false;
      }
    } finally {
      // 5. Always release the reclamation gate, but ONLY if we are still the registered gate owner
      if (gateFd !== null) {
        try { fs.closeSync(gateFd); } catch (e) {}
      }
      try {
        if (fs.existsSync(gatePath)) {
          const curGate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
          if (curGate && curGate.gate_id === gateMeta?.gate_id && curGate.pid === process.pid) {
            fs.unlinkSync(gatePath);
          }
        }
      } catch (e) {}
    }
  }

  /**
   * Enforces global lock hierarchy:
   * Acquires Session Lock ([session_id].lock) first, then Job Lock ([job_id].lock).
   * Releases in reverse order: Job Lock first, then Session Lock.
   */
  acquireHierarchicalLocks(sessionId, jobId, options = {}) {
    if (!sessionId) {
      throw new Error('sessionId is required for hierarchical lock acquisition');
    }

    // 1. Acquire Session Lock FIRST (Level 1 in global lock hierarchy)
    const sessionLockHandle = this.acquireLock('session', sessionId, options);

    // 2. If jobId provided, acquire Job Lock SECOND (Level 2 in global lock hierarchy)
    let jobLockHandle = null;
    if (jobId) {
      try {
        jobLockHandle = this.acquireLock('job', jobId, options);
      } catch (jobLockErr) {
        // Rollback: Release session lock immediately on failure to prevent orphan locks
        sessionLockHandle.release();
        throw jobLockErr;
      }
    }

    return {
      sessionLock: sessionLockHandle,
      jobLock: jobLockHandle,
      fencingToken: sessionLockHandle.fencingToken,
      verifyActive: () => {
        const sActive = sessionLockHandle.verifyActive();
        const jActive = jobLockHandle ? jobLockHandle.verifyActive() : true;
        return sActive && jActive;
      },
      release: () => {
        // Reverse order release: Job lock first, then Session lock
        let jobReleased = false;
        let sessionReleased = false;
        if (jobLockHandle) {
          jobReleased = jobLockHandle.release();
        }
        sessionReleased = sessionLockHandle.release();
        return { sessionReleased, jobReleased };
      }
    };
  }

  /**
   * Constructs the lock handle returned to the caller.
   */
  _createLockHandle(lockPath, metadata) {
    let released = false;

    return {
      lockId: metadata.lock_id,
      lockPath,
      targetType: metadata.target_type,
      targetId: metadata.target_id,
      ownerId: metadata.owner_id,
      pid: metadata.pid,
      fencingToken: metadata.fencing_token,
      acquiredAt: metadata.acquired_at,

      /**
       * Verifies that this lock handle is still the authoritative, un-fenced owner of the lock file.
       */
      verifyActive: () => {
        if (released) return false;
        try {
          if (!fs.existsSync(lockPath)) return false;
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          return current.owner_id === metadata.owner_id &&
                 current.fencing_token === metadata.fencing_token;
        } catch (e) {
          return false;
        }
      },

      /**
       * Updates the lock heartbeat timestamp.
       */
      heartbeat: () => {
        if (released) return false;
        try {
          if (!fs.existsSync(lockPath)) return false;
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          if (current.owner_id !== metadata.owner_id || current.fencing_token !== metadata.fencing_token) {
            return false;
          }
          current.last_heartbeat = new Date().toISOString();
          fs.writeFileSync(lockPath, JSON.stringify(current, null, 2), 'utf8');
          return true;
        } catch (e) {
          return false;
        }
      },

      /**
       * Safely releases the lock.
       * Invariant: Never deletes a lock file if another process has reclaimed or replaced it.
       */
      release: () => {
        if (released) return true;
        released = true;
        try {
          if (!fs.existsSync(lockPath)) return true;
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          // Only unlink if the lock file still belongs to THIS owner and fencing token
          if (current.owner_id === metadata.owner_id && current.fencing_token === metadata.fencing_token) {
            fs.unlinkSync(lockPath);
            return true;
          }
          return false; // Lock was displaced or replaced
        } catch (e) {
          return false;
        }
      }
    };
  }
}

module.exports = {
  SessionLockCoordinator,
  LockAcquisitionError
};
