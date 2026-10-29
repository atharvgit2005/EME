/**
 * Phase 24 Stage 24.4 Test Suite: Subprocess Worker Pool & Dynamic Resource Pressure Guard
 *
 * Verifies:
 * 1. POOL-01: Concurrency bounding (enforces maxConcurrent parallel limit).
 * 2. POOL-02: Priority scheduling (HIGH tasks jump ahead of queued LOW tasks).
 * 3. POOL-03: Dynamic load shedding under queue saturation.
 * 4. POOL-04: Hung task watchdog (auto-timeout termination & slot reclamation).
 * 5. POOL-05: Non-negotiable invariant: Telemetry accuracy and clean drain.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SubprocessWorkerPool,
  TASK_PRIORITY,
  TASK_STATUS
} = require('../src/prompt-core/worker-pool.js');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

test('Stage 24.4: Subprocess Worker Pool & Dynamic Resource Pressure Guard', async (t) => {
  await t.test('POOL-01: Concurrency Bounding (Strict maxConcurrent Enforcement)', async () => {
    const pool = new SubprocessWorkerPool({ maxConcurrent: 2 });
    let concurrentPeak = 0;
    let currentlyRunning = 0;

    const makeTask = (id, durationMs) => async () => {
      currentlyRunning++;
      concurrentPeak = Math.max(concurrentPeak, currentlyRunning);
      await sleep(durationMs);
      currentlyRunning--;
      return `done-${id}`;
    };

    // Launch 5 tasks simultaneously
    const p1 = pool.submit(makeTask(1, 40));
    const p2 = pool.submit(makeTask(2, 40));
    const p3 = pool.submit(makeTask(3, 40));
    const p4 = pool.submit(makeTask(4, 40));
    const p5 = pool.submit(makeTask(5, 40));

    const results = await Promise.all([p1, p2, p3, p4, p5]);
    assert.equal(results.length, 5);
    assert.equal(concurrentPeak, 2); // Exactly 2 peak concurrent workers
    assert.equal(pool.activeWorkers.size, 0);
  });

  await t.test('POOL-02: Priority Scheduling (HIGH Dispatched Ahead of LOW)', async () => {
    const pool = new SubprocessWorkerPool({ maxConcurrent: 1 });
    const executionOrder = [];

    // Occupy single worker slot with task 1
    const p1 = pool.submit(async () => {
      await sleep(50);
      executionOrder.push('task-1');
      return 1;
    });

    // Submit LOW priority task
    const pLow = pool.submit(async () => {
      executionOrder.push('task-low');
      return 'low';
    }, { priority: TASK_PRIORITY.LOW, name: 'low-preview' });

    // Submit HIGH priority task after low
    const pHigh = pool.submit(async () => {
      executionOrder.push('task-high');
      return 'high';
    }, { priority: TASK_PRIORITY.HIGH, name: 'high-render' });

    await Promise.all([p1, pLow, pHigh]);

    // Expected order: task-1 (already started), then task-high (priority jump), then task-low
    assert.deepEqual(executionOrder, ['task-1', 'task-high', 'task-low']);
  });

  await t.test('POOL-03: Dynamic Load Shedding Under Queue Saturation', async () => {
    const pool = new SubprocessWorkerPool({
      maxConcurrent: 1,
      maxQueueSize: 2
    });

    // Occupy the worker
    const pActive = pool.submit(async () => {
      await sleep(100);
      return 'active';
    });

    // Fill queue with 2 normal tasks (reaches maxQueueSize = 2)
    const pQ1 = pool.submit(async () => 'q1', { priority: TASK_PRIORITY.NORMAL });
    const pQ2 = pool.submit(async () => 'q2', { priority: TASK_PRIORITY.NORMAL });

    // Submit a 3rd task with LOW priority -> should be rejected immediately due to saturation
    let lowShed = false;
    try {
      await pool.submit(async () => 'q3-low', { priority: TASK_PRIORITY.LOW });
    } catch (err) {
      if (err.code === 'ERR_TASK_SHED') lowShed = true;
    }
    assert.equal(lowShed, true);

    await Promise.all([pActive, pQ1, pQ2]);
    assert.ok(pool.metrics.shedTotal >= 1);
  });

  await t.test('POOL-04: Hung Task Watchdog & Automatic Slot Reclamation', async () => {
    const pool = new SubprocessWorkerPool({
      maxConcurrent: 1,
      taskTimeoutMs: 50 // Short timeout for test
    });

    // Submit hung task
    let timedOut = false;
    try {
      await pool.submit(async () => {
        await sleep(500); // Exceeds 50ms timeout
        return 'never_reaches';
      }, { name: 'hung-ffmpeg-probe' });
    } catch (err) {
      if (err.code === 'ERR_TASK_TIMEOUT') timedOut = true;
    }
    assert.equal(timedOut, true);
    assert.equal(pool.metrics.timedOutTotal, 1);

    // Slot should be reclaimed immediately for next task
    const nextRes = await pool.submit(async () => 'healthy_next');
    assert.equal(nextRes, 'healthy_next');
    assert.equal(pool.activeWorkers.size, 0);
  });

  await t.test('POOL-05: Non-Negotiable Invariant: Telemetry Accuracy & Clean Drain', async () => {
    const pool = new SubprocessWorkerPool({ maxConcurrent: 2 });
    const status = pool.getStatus();
    assert.equal(status.maxConcurrent, 2);
    assert.equal(status.activeWorkersCount, 0);
    assert.equal(status.utilizationPercent, 0);

    // Drain test: saturate maxConcurrent = 2 with 2 running tasks, then 3rd task will be queued
    const p1 = pool.submit(async () => sleep(100)); // Active 1
    const p2 = pool.submit(async () => sleep(100)); // Active 2
    const pQueued = pool.submit(async () => sleep(100)); // Queued!

    pool.drain();
    let drained = false;
    try {
      await pQueued;
    } catch (e) {
      if (e.code === 'ERR_POOL_DRAINED') drained = true;
    }
    assert.equal(drained, true);
    await Promise.all([p1, p2]);
  });
});
