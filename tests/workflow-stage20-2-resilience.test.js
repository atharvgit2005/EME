/**
 * Phase 20 (Stage 20.2) Test Suite: Operational Resilience & Resource Guardrails
 *
 * Verifies:
 * - RES-01: Subprocess timeout guard terminates hanging commands via SIGTERM/SIGKILL escalation.
 * - RES-02: Subprocess buffer limit enforcement prevents memory exhaustion from runaway streams.
 * - RES-03: Disk space preflight check detects storage capacity and surfaces safety limitations.
 * - RES-04: ScratchManager creates isolated workspaces, tracks directories, and prunes cleanly.
 * - RES-05: ScratchManager garbage-collects abandoned workspaces older than retention threshold.
 * - RES-06: GracefulShutdownCoordinator safely triggers registered cleanup routines on signal.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  execSubprocessGuarded,
  checkAvailableDiskSpace,
  ScratchManager,
  GracefulShutdownCoordinator
} = require('../src/prompt-core/resource-guard.js');

const TEST_SCRATCH_DIR = path.join(os.tmpdir(), `eme-test-resilience-${Date.now()}`);

test('RES-01: Subprocess timeout guard terminates hanging commands via SIGTERM/SIGKILL escalation', async () => {
  const timeoutMs = 200;
  const killGraceMs = 100;

  // Launch a process that would otherwise sleep for 10 seconds
  const start = Date.now();
  let caughtError = null;

  try {
    await execSubprocessGuarded('node', ['-e', 'setInterval(() => {}, 1000);'], {
      timeoutMs,
      killGraceMs
    });
  } catch (err) {
    caughtError = err;
  }

  const elapsed = Date.now() - start;

  assert.ok(caughtError, 'Timeout must reject with an error');
  assert.strictEqual(caughtError.code, 'ERR_SUBPROCESS_TIMEOUT');
  assert.ok(caughtError.message.includes(`timed out after ${timeoutMs}ms`));
  // Execution must have completed close to timeoutMs + grace period, not 10s
  assert.ok(elapsed < 2000, `Process must terminate promptly (elapsed: ${elapsed}ms)`);
});

test('RES-02: Subprocess buffer limit enforcement prevents memory exhaustion from runaway streams', async () => {
  const maxBufferBytes = 64 * 1024; // 64 KB limit

  let caughtError = null;
  try {
    // Generate 500 KB of stdout stream
    await execSubprocessGuarded('node', ['-e', 'process.stdout.write("A".repeat(500 * 1024));'], {
      maxBufferBytes
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Buffer overflow must reject with an error');
  assert.strictEqual(caughtError.code, 'ERR_MAX_BUFFER_EXCEEDED');
  assert.ok(caughtError.message.includes('exceeded maxBuffer'));
});

test('RES-03: Disk space preflight check detects storage capacity and surfaces safety limitations', () => {
  // 1. Realistic reasonable requirement (10 MB): must pass on test machine
  const resPass = checkAvailableDiskSpace(process.cwd(), 10 * 1024 * 1024);
  assert.strictEqual(resPass.ok, true);
  assert.ok(resPass.availableBytes > 0 || resPass.availableBytes === -1);

  // 2. Unrealistic absurd requirement (1,000,000 TB): must fail closed
  const hugeBytes = 1000000 * 1024 * 1024 * 1024 * 1024;
  const resFail = checkAvailableDiskSpace(process.cwd(), hugeBytes);
  assert.strictEqual(resFail.ok, false);
  assert.ok(resFail.error.includes('Insufficient disk space'));
});

test('RES-04: ScratchManager creates isolated workspaces, tracks directories, and prunes cleanly', () => {
  const sm = new ScratchManager(TEST_SCRATCH_DIR);

  const ws1 = sm.createWorkspace('render-job-1');
  const ws2 = sm.createWorkspace('render-job-2');

  assert.ok(fs.existsSync(ws1), 'Workspace 1 must exist on disk');
  assert.ok(fs.existsSync(ws2), 'Workspace 2 must exist on disk');
  assert.notStrictEqual(ws1, ws2, 'Workspaces must have distinct paths');

  // Write temporary scratch files
  fs.writeFileSync(path.join(ws1, 'frame001.png'), 'dummy frame data');
  fs.writeFileSync(path.join(ws2, 'audio.wav'), 'dummy audio data');

  // Prune single workspace
  assert.strictEqual(sm.pruneWorkspace(ws1), true);
  assert.strictEqual(fs.existsSync(ws1), false, 'Pruned workspace must be removed from disk');
  assert.strictEqual(fs.existsSync(ws2), true, 'Non-pruned workspace must remain intact');

  // Prune all active
  sm.pruneAllActive();
  assert.strictEqual(fs.existsSync(ws2), false, 'All active workspaces must be pruned');

  // Clean test base dir
  try { fs.rmSync(TEST_SCRATCH_DIR, { recursive: true, force: true }); } catch (e) {}
});

test('RES-05: ScratchManager garbage-collects abandoned workspaces older than retention threshold', () => {
  const sm = new ScratchManager(TEST_SCRATCH_DIR);

  const oldWs = sm.createWorkspace('abandoned-old');
  const newWs = sm.createWorkspace('active-new');

  // Artificially age the mtime of oldWs back by 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(oldWs, twoHoursAgo, twoHoursAgo);

  // GC workspaces older than 1 hour (3600000ms)
  const pruned = sm.gcAbandoned(3600000);

  assert.strictEqual(pruned, 1, 'Exactly one abandoned workspace must be pruned');
  assert.strictEqual(fs.existsSync(oldWs), false, 'Old workspace must be deleted');
  assert.strictEqual(fs.existsSync(newWs), true, 'Recent workspace must be preserved');

  // Clean test base dir
  try { fs.rmSync(TEST_SCRATCH_DIR, { recursive: true, force: true }); } catch (e) {}
});

test('RES-06: GracefulShutdownCoordinator safely triggers registered cleanup routines on signal', async () => {
  const coordinator = new GracefulShutdownCoordinator();
  const executionLog = [];

  coordinator.register(async () => {
    executionLog.push('step1_suspend_jobs');
  });

  coordinator.register(() => {
    executionLog.push('step2_release_locks');
  });

  coordinator.register(() => {
    // Failing cleanup step must not abort subsequent cleanup handlers
    throw new Error('Non-critical cleanup failure');
  });

  coordinator.register(async () => {
    executionLog.push('step3_flush_logs');
  });

  await coordinator.triggerShutdown('SIGTERM');

  assert.deepStrictEqual(executionLog, [
    'step1_suspend_jobs',
    'step2_release_locks',
    'step3_flush_logs'
  ]);
  assert.strictEqual(coordinator.isShuttingDown, true);

  // Triggering shutdown a second time must be a no-op (idempotent)
  await coordinator.triggerShutdown('SIGINT');
  assert.strictEqual(executionLog.length, 3);
});
