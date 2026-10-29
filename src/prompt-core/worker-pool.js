/**
 * Editing Mechanics Engine (EME) - Subprocess Worker Pool & Resource Pressure Guard
 * Conforms to Phase 24 (Stage 24.4): Reliability Optimization & Concurrency Bounding
 *
 * Implements:
 * 1. Bounded concurrency slot manager for heavy media subprocesses (FFmpeg / FFprobe).
 * 2. Multi-tier priority queue (HIGH, NORMAL, LOW).
 * 3. Dynamic load shedding under queue saturation (sheds LOW priority tasks first).
 * 4. Hung worker detection and auto-timeout termination.
 * 5. Concurrency telemetry and capacity utilization metrics.
 * 6. Zero external runtime npm dependencies.
 */

const { EventEmitter } = require('node:events');
const { defaultLogger } = require('./logger.js');

const TASK_PRIORITY = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2
};

const TASK_STATUS = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  SHED: 'SHED'
};

class SubprocessWorkerPool extends EventEmitter {
  /**
   * @param {object} [options={}]
   * @param {number} [options.maxConcurrent=4] Maximum concurrent running worker slots
   * @param {number} [options.maxQueueSize=50] Maximum tasks allowed in queue before shedding
   * @param {number} [options.taskTimeoutMs=10000] Maximum task duration in ms before auto-timeout
   */
  constructor(options = {}) {
    super();
    this.maxConcurrent = Math.max(1, options.maxConcurrent || 4);
    this.maxQueueSize = Math.max(1, options.maxQueueSize || 50);
    this.taskTimeoutMs = options.taskTimeoutMs || 10000;

    this.activeWorkers = new Map(); // taskId -> { task, timer, startedAt }
    this.queue = []; // Array of queued task objects sorted by priority and queueTime
    this.metrics = {
      submittedTotal: 0,
      completedTotal: 0,
      failedTotal: 0,
      timedOutTotal: 0,
      shedTotal: 0,
      totalQueueWaitMs: 0
    };
  }

  /**
   * Submits a task to the pool.
   *
   * @param {Function} taskFn Async or sync function executing the unit of work: async (signal) => result
   * @param {object} [options={}]
   * @param {string} [options.taskId]
   * @param {number} [options.priority=TASK_PRIORITY.NORMAL]
   * @param {string} [options.name]
   * @returns {Promise<any>}
   */
  submit(taskFn, options = {}) {
    this.metrics.submittedTotal++;
    const taskId = options.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const priority = options.priority !== undefined ? options.priority : TASK_PRIORITY.NORMAL;
    const name = options.name || 'anonymous_worker_task';

    return new Promise((resolve, reject) => {
      const task = {
        taskId,
        name,
        priority,
        taskFn,
        queuedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        status: TASK_STATUS.QUEUED,
        resolve,
        reject
      };

      // Check if queue is saturated and load shedding is needed
      if (this.queue.length >= this.maxQueueSize) {
        if (priority === TASK_PRIORITY.LOW) {
          // Immediately shed LOW priority task
          task.status = TASK_STATUS.SHED;
          this.metrics.shedTotal++;
          const err = new Error(`Worker pool queue saturated (${this.queue.length} >= ${this.maxQueueSize}); LOW priority task shed`);
          err.code = 'ERR_TASK_SHED';
          return reject(err);
        }

        // Evict an existing queued LOW priority task to make room for HIGH/NORMAL
        const lowIdx = this.queue.findIndex(t => t.priority === TASK_PRIORITY.LOW);
        if (lowIdx !== -1) {
          const evicted = this.queue.splice(lowIdx, 1)[0];
          evicted.status = TASK_STATUS.SHED;
          this.metrics.shedTotal++;
          const err = new Error('Evicted by higher-priority task due to queue saturation');
          err.code = 'ERR_TASK_SHED';
          evicted.reject(err);
        } else if (this.queue.length >= this.maxQueueSize * 1.5) {
          // Absolute hard limit
          task.status = TASK_STATUS.SHED;
          this.metrics.shedTotal++;
          const err = new Error('Worker pool queue hard limit exceeded');
          err.code = 'ERR_TASK_SHED';
          return reject(err);
        }
      }

      this.queue.push(task);
      this._sortQueue();
      this._dispatchNext();
    });
  }

  _sortQueue() {
    // Priority first (0 = HIGH, 1 = NORMAL, 2 = LOW), then FIFO by queuedAt
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.queuedAt - b.queuedAt;
    });
  }

  _dispatchNext() {
    while (this.activeWorkers.size < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      this._executeTask(task);
    }
  }

  async _executeTask(task) {
    task.startedAt = Date.now();
    task.status = TASK_STATUS.RUNNING;
    this.metrics.totalQueueWaitMs += (task.startedAt - task.queuedAt);

    let finished = false;

    // Timeout watchdog
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      task.status = TASK_STATUS.TIMED_OUT;
      this.metrics.timedOutTotal++;
      this.activeWorkers.delete(task.taskId);

      const err = new Error(`Worker task '${task.name}' timed out after ${this.taskTimeoutMs}ms`);
      err.code = 'ERR_TASK_TIMEOUT';
      task.reject(err);
      this._dispatchNext();
    }, this.taskTimeoutMs);

    this.activeWorkers.set(task.taskId, { task, timer, startedAt: task.startedAt });

    try {
      const result = await task.taskFn();
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        task.completedAt = Date.now();
        task.status = TASK_STATUS.COMPLETED;
        this.metrics.completedTotal++;
        this.activeWorkers.delete(task.taskId);
        task.resolve(result);
        this._dispatchNext();
      }
    } catch (err) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        task.completedAt = Date.now();
        task.status = TASK_STATUS.FAILED;
        this.metrics.failedTotal++;
        this.activeWorkers.delete(task.taskId);
        task.reject(err);
        this._dispatchNext();
      }
    }
  }

  /**
   * Returns current pool utilization and health metrics.
   *
   * @returns {object} Status snapshot
   */
  getStatus() {
    const avgWaitMs = this.metrics.completedTotal > 0
      ? Math.round(this.metrics.totalQueueWaitMs / this.metrics.completedTotal)
      : 0;

    return {
      maxConcurrent: this.maxConcurrent,
      activeWorkersCount: this.activeWorkers.size,
      queuedTasksCount: this.queue.length,
      utilizationPercent: Math.round((this.activeWorkers.size / this.maxConcurrent) * 100),
      metrics: {
        ...this.metrics,
        averageQueueWaitMs: avgWaitMs
      }
    };
  }

  /**
   * Drains queue and cancels all pending tasks.
   */
  drain() {
    while (this.queue.length > 0) {
      const t = this.queue.shift();
      t.status = TASK_STATUS.SHED;
      this.metrics.shedTotal++;
      const err = new Error('Pool drained');
      err.code = 'ERR_POOL_DRAINED';
      t.reject(err);
    }
  }
}

module.exports = {
  SubprocessWorkerPool,
  TASK_PRIORITY,
  TASK_STATUS
};
