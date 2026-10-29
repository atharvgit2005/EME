/**
 * Fencing, Idempotency & Concurrency Guard (Phase 30 Stage 30.3)
 *
 * Implements strict authoritative concurrency controls:
 * - ARC-30-10: Monotonically increasing durable fencing tokens checked at commit boundary (FI-10).
 * - ARC-30-11: Durable idempotency journal preventing duplicate authoritative mutation (FI-09).
 * - ARC-30-12: Strict lock acquisition and release ordering (Session Lock -> Job Lock).
 * - ARC-30-13: Fail-closed handling of uncertain process liveness (FI-11).
 * - ARC-30-14: Complete cross-session isolation with zero state leakage (FI-18).
 * - ARC-30-15: Rejection of late callbacks from earlier expired attempts.
 * - ARC-30-16: Idempotent compensation gating (compensation applied at most once).
 *
 * Zero external runtime npm dependencies; uses native Node.js core modules.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CanonicalJobStatus } = require('../prompt-core/job-orchestrator.js');

class FencingIdempotencyGuard {
  constructor(options = {}) {
    this.lockDir = options.lockDir || path.resolve('artifacts/locks');
    this.journalDir = options.journalDir || path.resolve('artifacts/idempotency-journal');
    fs.mkdirSync(this.lockDir, { recursive: true });
    fs.mkdirSync(this.journalDir, { recursive: true });
  }

  _getFenceFilePath(resourceId) {
    const safeId = String(resourceId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.lockDir, `fence_${safeId}.json`);
  }

  _getJournalFilePath(idempotencyKey) {
    const hash = crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex');
    return path.join(this.journalDir, `idemp_${hash}.json`);
  }

  /**
   * Acquire a monotonically increasing fencing token for a resource.
   */
  acquireFencingToken(resourceId, workerId) {
    const fenceFile = this._getFenceFilePath(resourceId);
    let currentToken = 0;

    if (fs.existsSync(fenceFile)) {
      try {
        const record = JSON.parse(fs.readFileSync(fenceFile, 'utf8'));
        currentToken = record.fencing_token || 0;
      } catch (e) {}
    }

    const nextToken = currentToken + 1;
    const fenceRecord = {
      resource_id: resourceId,
      fencing_token: nextToken,
      owner_worker_id: workerId,
      acquired_at: new Date().toISOString()
    };

    const tmp = `${fenceFile}.tmp_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(fenceRecord, null, 2), 'utf8');
    fs.renameSync(tmp, fenceFile);

    return {
      fencingToken: nextToken,
      resourceId,
      workerId
    };
  }

  /**
   * Authoritative Commit Fencing Gate.
   * Validates that the worker's fencing token is current (equals latest issued token).
   * If a newer worker has acquired a higher token, the stale worker is rejected fail-closed.
   */
  validateCommitFencing(resourceId, candidateToken, workerId) {
    const fenceFile = this._getFenceFilePath(resourceId);
    if (!fs.existsSync(fenceFile)) {
      return {
        authorized: false,
        reason: 'NO_FENCE_RECORD',
        message: `No fencing record found for resource ${resourceId}`
      };
    }

    const record = JSON.parse(fs.readFileSync(fenceFile, 'utf8'));
    const currentToken = record.fencing_token;

    if (candidateToken < currentToken) {
      return {
        authorized: false,
        reason: 'STALE_FENCING_TOKEN',
        candidateToken,
        currentToken,
        currentOwner: record.owner_worker_id,
        message: `Commit rejected fail-closed: worker token ${candidateToken} is stale (current active fence is ${currentToken})`
      };
    }

    if (candidateToken === currentToken && workerId && record.owner_worker_id !== workerId) {
      return {
        authorized: false,
        reason: 'OWNERSHIP_MISMATCH',
        candidateToken,
        currentToken,
        currentOwner: record.owner_worker_id,
        message: `Commit rejected: worker ${workerId} is not the registered owner of token ${candidateToken}`
      };
    }

    return {
      authorized: true,
      fencingToken: candidateToken,
      message: 'Fencing token verified valid at authoritative commit boundary.'
    };
  }

  /**
   * Acquire hierarchical locks in strict canonical order:
   * 1. Session Lock
   * 2. Job Lock
   */
  acquireHierarchicalLocks(sessionId, jobId, workerPid = process.pid) {
    const sessionLockPath = path.join(this.lockDir, `session_${sessionId}.lock`);
    const jobLockPath = path.join(this.lockDir, `job_${jobId}.lock`);

    // Step 1: Acquire Session Lock using wx exclusive creation
    let sessionFd;
    try {
      sessionFd = fs.openSync(sessionLockPath, 'wx');
      fs.writeFileSync(sessionFd, JSON.stringify({ sessionId, workerPid, acquiredAt: new Date().toISOString() }));
    } catch (err) {
      return {
        acquired: false,
        failedLock: 'SESSION_LOCK',
        error: `Could not acquire session lock for session ${sessionId}: lock already held`
      };
    }

    // Step 2: Acquire Job Lock
    let jobFd;
    try {
      jobFd = fs.openSync(jobLockPath, 'wx');
      fs.writeFileSync(jobFd, JSON.stringify({ jobId, sessionId, workerPid, acquiredAt: new Date().toISOString() }));
    } catch (err) {
      // Release session lock before failing to preserve clean state
      try {
        fs.closeSync(sessionFd);
        fs.unlinkSync(sessionLockPath);
      } catch (e) {}
      return {
        acquired: false,
        failedLock: 'JOB_LOCK',
        error: `Could not acquire job lock for job ${jobId}: lock already held; rolled back session lock`
      };
    }

    return {
      acquired: true,
      sessionLockPath,
      jobLockPath,
      sessionFd,
      jobFd,
      order: ['SESSION_LOCK', 'JOB_LOCK']
    };
  }

  /**
   * Release hierarchical locks in reverse order:
   * 1. Job Lock
   * 2. Session Lock
   */
  releaseHierarchicalLocks(lockHandle) {
    const released = [];
    if (lockHandle?.jobFd) {
      try { fs.closeSync(lockHandle.jobFd); } catch (e) {}
    }
    if (lockHandle?.jobLockPath && fs.existsSync(lockHandle.jobLockPath)) {
      fs.unlinkSync(lockHandle.jobLockPath);
      released.push('JOB_LOCK');
    }

    if (lockHandle?.sessionFd) {
      try { fs.closeSync(lockHandle.sessionFd); } catch (e) {}
    }
    if (lockHandle?.sessionLockPath && fs.existsSync(lockHandle.sessionLockPath)) {
      fs.unlinkSync(lockHandle.sessionLockPath);
      released.push('SESSION_LOCK');
    }

    return {
      releasedOrder: released,
      clean: released.length === 2
    };
  }

  /**
   * Evaluate lock ownership with uncertain process liveness.
   * Fails closed if process existence cannot be proven.
   */
  evaluateLockLiveness(lockFilePath) {
    if (!fs.existsSync(lockFilePath)) {
      return { status: 'UNLOCKED', canAcquire: true };
    }

    let lockData;
    try {
      lockData = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
    } catch (e) {
      return {
        status: 'CORRUPT_LOCK_FAIL_CLOSED',
        canAcquire: false,
        action: 'NEEDS_RECONCILIATION',
        message: 'Lock file corrupt; failed closed to prevent concurrent mutation.'
      };
    }

    const pid = lockData.workerPid;
    if (!pid) {
      return {
        status: 'UNKNOWN_OWNER_FAIL_CLOSED',
        canAcquire: false,
        action: 'NEEDS_RECONCILIATION',
        message: 'Lock owner PID unspecified; fail closed.'
      };
    }

    // Check process liveness via signal 0
    let processAlive = false;
    let livenessAmbiguous = false;
    try {
      process.kill(pid, 0);
      processAlive = true;
    } catch (err) {
      if (err.code === 'ESRCH') {
        processAlive = false; // definitely dead
      } else if (err.code === 'EPERM') {
        processAlive = true; // alive but owned by another user
      } else {
        livenessAmbiguous = true; // uncertain
      }
    }

    if (processAlive) {
      return {
        status: 'LOCKED_BY_ACTIVE_PROCESS',
        canAcquire: false,
        pid,
        message: `Resource is actively locked by running process ${pid}`
      };
    }

    if (livenessAmbiguous) {
      return {
        status: 'LIVENESS_AMBIGUOUS_FAIL_CLOSED',
        canAcquire: false,
        pid,
        action: 'NEEDS_RECONCILIATION',
        message: `Process ${pid} liveness status ambiguous; fail closed without unsafe lock takeover.`
      };
    }

    // Process is conclusively dead
    return {
      status: 'STALE_LOCK_DEAD_PROCESS',
      canAcquire: true,
      deadPid: pid,
      message: `Process ${pid} verified dead (ESRCH); safe for reclamation.`
    };
  }

  /**
   * Durable Idempotency Enforcement.
   * Checks whether an operation with idempotencyKey has already committed.
   * If yes, returns existing result without re-executing.
   * If no, executes mutationFn, records result in durable journal, and returns result.
   */
  async executeIdempotent(idempotencyKey, context, mutationFn) {
    const journalPath = this._getJournalFilePath(idempotencyKey);

    // 1. Check existing journal entry
    if (fs.existsSync(journalPath)) {
      const record = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      return {
        idempotentReplay: true,
        committed: true,
        duplicatePrevented: true,
        result: record.result,
        revision: record.revision,
        journalRecord: record,
        message: 'Idempotency journal match found; returned cached outcome without duplicate mutation.'
      };
    }

    // 2. Execute authoritative mutation
    const execResult = await mutationFn();

    // 3. Durably persist to idempotency journal
    const journalEntry = {
      idempotency_key: idempotencyKey,
      context,
      result: execResult.result || execResult,
      revision: execResult.revision,
      committed_at: new Date().toISOString()
    };

    const tmp = `${journalPath}.tmp_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(journalEntry, null, 2), 'utf8');
    fs.renameSync(tmp, journalPath);

    return {
      idempotentReplay: false,
      committed: true,
      duplicatePrevented: false,
      result: journalEntry.result,
      revision: journalEntry.revision,
      journalRecord: journalEntry
    };
  }

  /**
   * Gated compensation execution.
   * Ensures a compensation action is applied at most once.
   */
  executeCompensationGated(compensationKey, context, compensationFn) {
    const compJournal = path.join(this.journalDir, `comp_${crypto.createHash('sha256').update(compensationKey).digest('hex')}.json`);

    if (fs.existsSync(compJournal)) {
      const record = JSON.parse(fs.readFileSync(compJournal, 'utf8'));
      return {
        idempotent: true,
        alreadyCompensated: true,
        duplicateCompensationPrevented: true,
        record,
        message: 'Compensation already executed for this identity; duplicate compensation avoided.'
      };
    }

    const result = compensationFn();

    const record = {
      compensation_key: compensationKey,
      context,
      result,
      compensated_at: new Date().toISOString()
    };
    fs.writeFileSync(compJournal, JSON.stringify(record, null, 2), 'utf8');

    return {
      idempotent: false,
      alreadyCompensated: false,
      duplicateCompensationPrevented: false,
      result,
      record
    };
  }
  /**
   * Validate a callback against attempt generation/token.
   * Rejects late callbacks from expired or superseded attempts.
   */
  validateCallbackAttempt(jobId, callbackAttempt, activeAttempt) {
    if (callbackAttempt < activeAttempt) {
      return {
        accepted: false,
        reason: 'SUPERSEDED_ATTEMPT',
        callbackAttempt,
        activeAttempt,
        message: `Callback for job ${jobId} from attempt ${callbackAttempt} rejected: superseded by active attempt ${activeAttempt}.`
      };
    }
    return {
      accepted: true,
      jobId,
      attempt: callbackAttempt,
      message: `Callback for attempt ${callbackAttempt} accepted.`
    };
  }

  /**
   * Full end-to-end concurrency-guarded execution:
   * 1. Acquires hierarchical locks (Session -> Job).
   * 2. Validates idempotency before mutation.
   * 3. Validates fencing token at authoritative commit boundary.
   * 4. Durably records result to journal.
   * 5. Releases hierarchical locks in reverse order (Job -> Session).
   */
  async executeConcurrentGuarded({ sessionId, jobId, idempotencyKey, workerId, fencingToken, mutationFn }) {
    // Step 1: Hierarchical lock acquisition
    const lockHandle = this.acquireHierarchicalLocks(sessionId, jobId);
    if (!lockHandle.acquired) {
      return {
        success: false,
        phase: 'LOCK_ACQUISITION',
        error: lockHandle.error,
        failedLock: lockHandle.failedLock
      };
    }

    try {
      // Step 2: Pre-execution idempotency check
      const journalPath = this._getJournalFilePath(idempotencyKey);
      if (fs.existsSync(journalPath)) {
        const cached = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
        return {
          success: true,
          idempotentReplay: true,
          result: cached.result,
          revision: cached.revision,
          message: 'Idempotency journal match found; duplicate execution prevented.'
        };
      }

      // Step 3: Fencing validation at Authoritative Commit Boundary
      const fenceCheck = this.validateCommitFencing(sessionId, fencingToken, workerId);
      if (!fenceCheck.authorized) {
        return {
          success: false,
          phase: 'COMMIT_FENCING',
          reason: fenceCheck.reason,
          message: fenceCheck.message
        };
      }

      // Step 4: Execute authoritative mutation
      const mutationResult = await mutationFn();

      // Step 5: Durably journal result
      const journalEntry = {
        idempotency_key: idempotencyKey,
        sessionId,
        jobId,
        workerId,
        fencingToken,
        result: mutationResult.result || mutationResult,
        revision: mutationResult.revision,
        committed_at: new Date().toISOString()
      };
      const tmp = `${journalPath}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(journalEntry, null, 2), 'utf8');
      fs.renameSync(tmp, journalPath);

      return {
        success: true,
        idempotentReplay: false,
        result: journalEntry.result,
        revision: journalEntry.revision,
        fencingToken,
        message: 'Authoritative mutation committed successfully with verified fencing and durable idempotency journal.'
      };
    } finally {
      // Step 6: Reverse lock release
      this.releaseHierarchicalLocks(lockHandle);
    }
  }
}

module.exports = { FencingIdempotencyGuard };
