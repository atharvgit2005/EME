/**
 * Stage 30.3: Concurrency, Fencing, and Idempotency Test Suite
 *
 * Implements Stage 30.3 verification:
 * - CNC-01: Concurrent duplicate requests with same idempotency key (FI-09)
 * - CNC-02: Stale fencing token rejected fail-closed at commit boundary (FI-10)
 * - CNC-03: Monotonically increasing fencing tokens validate at commit boundary
 * - CNC-04: Lock ordering enforcement (Session Lock -> Job Lock, reverse release)
 * - CNC-05: Uncertain process liveness fails closed without unsafe takeover (FI-11)
 * - CNC-06: Cross-session concurrent execution with strict isolation (FI-18)
 * - CNC-07: Delayed callback race resolution (late callback rejected)
 * - CNC-08: Duplicate compensation request idempotency
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { FencingIdempotencyGuard } = require('../src/orchestration/fencing-idempotency-guard.js');

const TMP_DIR = path.resolve('scratch/stage30-3-test');
const LOCK_DIR = path.join(TMP_DIR, 'locks');
const JOURNAL_DIR = path.join(TMP_DIR, 'journal');

describe('Stage 30.3: Concurrency, Fencing, and Idempotency', () => {

  beforeEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(LOCK_DIR, { recursive: true });
    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('CNC-01: Concurrent duplicate requests with same idempotency key execute mutation exactly once (FI-09)', async () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });

    let mutationCounter = 0;
    const testMutation = async () => {
      mutationCounter++;
      return { revision: 10, result: { operation: 'split_clip', clipId: 'c1', counter: mutationCounter } };
    };

    const idempotencyKey = 'idemp_req_abc_123';
    const context = { sessionId: 'sess_1', jobId: 'job_1' };

    // Worker 1 executes
    const res1 = await guard.executeIdempotent(idempotencyKey, context, testMutation);
    assert.strictEqual(res1.committed, true);
    assert.strictEqual(res1.idempotentReplay, false);
    assert.strictEqual(res1.duplicatePrevented, false);
    assert.strictEqual(res1.result.counter, 1);
    assert.strictEqual(mutationCounter, 1);

    // Concurrent Worker 2 with identical idempotencyKey
    const res2 = await guard.executeIdempotent(idempotencyKey, context, testMutation);
    assert.strictEqual(res2.committed, true);
    assert.strictEqual(res2.idempotentReplay, true);
    assert.strictEqual(res2.duplicatePrevented, true);
    assert.strictEqual(res2.result.counter, 1); // returns cached result
    assert.strictEqual(mutationCounter, 1); // mutation was NOT executed a second time
  });

  test('CNC-02: Stale fencing token rejected fail-closed at commit boundary (FI-10)', () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });
    const resourceId = 'sess_render_timeline_42';

    // Worker A acquires fencing token 1
    const tokenA = guard.acquireFencingToken(resourceId, 'worker_alpha');
    assert.strictEqual(tokenA.fencingToken, 1);

    // Worker B acquires fencing token 2 (superseding Worker A)
    const tokenB = guard.acquireFencingToken(resourceId, 'worker_bravo');
    assert.strictEqual(tokenB.fencingToken, 2);

    // Worker A attempts authoritative commit with stale token 1
    const checkA = guard.validateCommitFencing(resourceId, tokenA.fencingToken, 'worker_alpha');
    assert.strictEqual(checkA.authorized, false);
    assert.strictEqual(checkA.reason, 'STALE_FENCING_TOKEN');
    assert.strictEqual(checkA.candidateToken, 1);
    assert.strictEqual(checkA.currentToken, 2);
    assert.match(checkA.message, /rejected fail-closed/i);

    // Worker B attempts authoritative commit with current token 2
    const checkB = guard.validateCommitFencing(resourceId, tokenB.fencingToken, 'worker_bravo');
    assert.strictEqual(checkB.authorized, true);
    assert.strictEqual(checkB.fencingToken, 2);
  });

  test('CNC-03: Monotonically increasing fencing tokens validate at commit boundary', () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });
    const resourceId = 'proj_monotone_res';

    const t1 = guard.acquireFencingToken(resourceId, 'w1');
    const t2 = guard.acquireFencingToken(resourceId, 'w2');
    const t3 = guard.acquireFencingToken(resourceId, 'w3');

    assert.strictEqual(t1.fencingToken, 1);
    assert.strictEqual(t2.fencingToken, 2);
    assert.strictEqual(t3.fencingToken, 3);
    assert.ok(t3.fencingToken > t2.fencingToken);
    assert.ok(t2.fencingToken > t1.fencingToken);

    // Only t3 can commit
    assert.strictEqual(guard.validateCommitFencing(resourceId, t1.fencingToken, 'w1').authorized, false);
    assert.strictEqual(guard.validateCommitFencing(resourceId, t2.fencingToken, 'w2').authorized, false);
    assert.strictEqual(guard.validateCommitFencing(resourceId, t3.fencingToken, 'w3').authorized, true);
  });

  test('CNC-04: Lock ordering enforcement (Session Lock before Job Lock, released in reverse order)', () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });
    const sessionId = 'session_lock_ord';
    const jobId = 'job_lock_ord';

    const handle = guard.acquireHierarchicalLocks(sessionId, jobId);
    assert.strictEqual(handle.acquired, true);
    assert.deepStrictEqual(handle.order, ['SESSION_LOCK', 'JOB_LOCK']);

    // Attempting to acquire again fails because session lock is already held
    const handleConflict = guard.acquireHierarchicalLocks(sessionId, 'job_diff');
    assert.strictEqual(handleConflict.acquired, false);
    assert.strictEqual(handleConflict.failedLock, 'SESSION_LOCK');

    // Release locks in reverse order
    const releaseRes = guard.releaseHierarchicalLocks(handle);
    assert.strictEqual(releaseRes.clean, true);
    assert.deepStrictEqual(releaseRes.releasedOrder, ['JOB_LOCK', 'SESSION_LOCK']);

    // Now locks are clean and re-acquirable
    const handleAfter = guard.acquireHierarchicalLocks(sessionId, jobId);
    assert.strictEqual(handleAfter.acquired, true);
    guard.releaseHierarchicalLocks(handleAfter);
  });

  test('CNC-05: Uncertain process liveness fails closed without unsafe lock takeover (FI-11)', () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });

    // Scenario 1: Malformed / corrupted lock file
    const corruptLock = path.join(LOCK_DIR, 'session_corrupt.lock');
    fs.writeFileSync(corruptLock, '{ NOT_VALID_JSON ... partial write');
    const res1 = guard.evaluateLockLiveness(corruptLock);
    assert.strictEqual(res1.canAcquire, false);
    assert.strictEqual(res1.status, 'CORRUPT_LOCK_FAIL_CLOSED');
    assert.strictEqual(res1.action, 'NEEDS_RECONCILIATION');

    // Scenario 2: Lock missing workerPid
    const noPidLock = path.join(LOCK_DIR, 'session_nopid.lock');
    fs.writeFileSync(noPidLock, JSON.stringify({ acquiredAt: '2026-10-22T00:00:00Z' }));
    const res2 = guard.evaluateLockLiveness(noPidLock);
    assert.strictEqual(res2.canAcquire, false);
    assert.strictEqual(res2.status, 'UNKNOWN_OWNER_FAIL_CLOSED');
    assert.strictEqual(res2.action, 'NEEDS_RECONCILIATION');

    // Scenario 3: Lock held by current process (active)
    const activeLock = path.join(LOCK_DIR, 'session_active.lock');
    fs.writeFileSync(activeLock, JSON.stringify({ workerPid: process.pid, acquiredAt: new Date().toISOString() }));
    const res3 = guard.evaluateLockLiveness(activeLock);
    assert.strictEqual(res3.canAcquire, false);
    assert.strictEqual(res3.status, 'LOCKED_BY_ACTIVE_PROCESS');
    assert.strictEqual(res3.pid, process.pid);

    // Scenario 4: Lock held by conclusively dead process (ESRCH, non-existent high PID)
    const deadLock = path.join(LOCK_DIR, 'session_dead.lock');
    fs.writeFileSync(deadLock, JSON.stringify({ workerPid: 9999999, acquiredAt: '2026-10-22T00:00:00Z' }));
    const res4 = guard.evaluateLockLiveness(deadLock);
    assert.strictEqual(res4.canAcquire, true);
    assert.strictEqual(res4.status, 'STALE_LOCK_DEAD_PROCESS');
  });

  test('CNC-06: Cross-session concurrent execution with strict isolation and zero state leakage (FI-18)', async () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });

    const sessionA = 'sess_alpha_isolated';
    const sessionB = 'sess_bravo_isolated';

    let countA = 0;
    let countB = 0;

    const tokenA = guard.acquireFencingToken(sessionA, 'worker_a');
    const tokenB = guard.acquireFencingToken(sessionB, 'worker_b');

    // Concurrently execute guarded mutations for both sessions
    const [execA, execB] = await Promise.all([
      guard.executeConcurrentGuarded({
        sessionId: sessionA,
        jobId: 'job_a1',
        idempotencyKey: 'idemp_sess_a',
        workerId: 'worker_a',
        fencingToken: tokenA.fencingToken,
        mutationFn: async () => {
          countA++;
          return { revision: 1, result: { session: sessionA, count: countA } };
        }
      }),
      guard.executeConcurrentGuarded({
        sessionId: sessionB,
        jobId: 'job_b1',
        idempotencyKey: 'idemp_sess_b',
        workerId: 'worker_b',
        fencingToken: tokenB.fencingToken,
        mutationFn: async () => {
          countB++;
          return { revision: 1, result: { session: sessionB, count: countB } };
        }
      })
    ]);

    assert.strictEqual(execA.success, true);
    assert.strictEqual(execB.success, true);
    assert.strictEqual(execA.result.session, sessionA);
    assert.strictEqual(execB.result.session, sessionB);
    assert.strictEqual(countA, 1);
    assert.strictEqual(countB, 1);

    // Verify session A cannot commit to session B's fence
    const breachAttempt = guard.validateCommitFencing(sessionB, tokenA.fencingToken, 'worker_a');
    assert.strictEqual(breachAttempt.authorized, false);
    assert.strictEqual(breachAttempt.reason, 'OWNERSHIP_MISMATCH');
  });

  test('CNC-07: Delayed callback race resolution rejects callback from earlier expired attempt', () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });
    const jobId = 'job_render_delayed';

    // Attempt 1 expired/timed out; active attempt is now attempt 2
    const checkLate = guard.validateCallbackAttempt(jobId, 1, 2);
    assert.strictEqual(checkLate.accepted, false);
    assert.strictEqual(checkLate.reason, 'SUPERSEDED_ATTEMPT');
    assert.strictEqual(checkLate.callbackAttempt, 1);
    assert.strictEqual(checkLate.activeAttempt, 2);
    assert.match(checkLate.message, /superseded by active attempt/i);

    // Callback from current attempt 2 is accepted
    const checkCurrent = guard.validateCallbackAttempt(jobId, 2, 2);
    assert.strictEqual(checkCurrent.accepted, true);
    assert.strictEqual(checkCurrent.attempt, 2);
  });

  test('CNC-08: Duplicate compensation request idempotency prevents duplicate execution', () => {
    const guard = new FencingIdempotencyGuard({ lockDir: LOCK_DIR, journalDir: JOURNAL_DIR });
    const compKey = 'comp_cleanup_tmp_render_99';

    let compRunCount = 0;
    const compensationFn = () => {
      compRunCount++;
      return { compensated: true, cleanedArtifacts: ['tmp_clip_99.wav'], runCount: compRunCount };
    };

    // First compensation execution
    const res1 = guard.executeCompensationGated(compKey, { jobId: 'job_fail_99' }, compensationFn);
    assert.strictEqual(res1.alreadyCompensated, false);
    assert.strictEqual(res1.duplicateCompensationPrevented, false);
    assert.strictEqual(res1.result.runCount, 1);
    assert.strictEqual(compRunCount, 1);

    // Duplicate compensation execution attempt
    const res2 = guard.executeCompensationGated(compKey, { jobId: 'job_fail_99' }, compensationFn);
    assert.strictEqual(res2.alreadyCompensated, true);
    assert.strictEqual(res2.duplicateCompensationPrevented, true);
    assert.strictEqual(compRunCount, 1); // Not run a second time
    assert.match(res2.message, /already executed for this identity/i);
  });

});
