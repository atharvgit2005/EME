/**
 * Phase 20 (Stage 20.5) Test Suite: Operational Fault-Injection & Packaged Candidate Certification
 *
 * Verifies:
 * - FLT-01: Subprocess abnormal crash during guarded execution rejects with non-zero code and captures diagnostics without orphaned state.
 * - FLT-02: Storage write failure during project backup fails closed cleanly without mutating original project state.
 * - FLT-03: Fencing token monotonicity and concurrent lock acquisition conflicts fail closed deterministically.
 * - FLT-04: Corrupted or truncated backup manifest triggers fail-closed restore rejection without corrupting destination.
 * - FLT-05: Faulty diagnostics channel subscriber exception does not crash or abort host workflow execution.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  execSubprocessGuarded,
  ScratchManager,
  SessionLockCoordinator,
  LockAcquisitionError,
  createProjectBackup,
  restoreProjectBackup
} = require('../src/prompt-core/index.js');

const TEST_WORK_DIR = path.join(os.tmpdir(), `eme-test-stage20-5-${Date.now()}`);

test.before(() => {
  fs.mkdirSync(TEST_WORK_DIR, { recursive: true });
});

test.after(() => {
  try {
    fs.rmSync(TEST_WORK_DIR, { recursive: true, force: true });
  } catch (_) {}
});

test('FLT-01: Subprocess abnormal crash during guarded execution rejects with non-zero code and captures diagnostics without orphaned state', async () => {
  const sm = new ScratchManager(path.join(TEST_WORK_DIR, 'scratch-flt-01'));
  const ws = sm.createWorkspace('crash-job');

  // Place a marker in workspace
  fs.writeFileSync(path.join(ws, 'probe.tmp'), 'pre-crash');

  let caughtError = null;
  try {
    // Run a script that deliberately writes to stderr and exits with code 42
    await execSubprocessGuarded('node', [
      '-e',
      'process.stderr.write("Fatal GPU Out-Of-Memory error\\n"); process.exit(42);'
    ], {
      cwd: ws,
      rejectOnNonZero: true
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Subprocess abnormal exit must reject when rejectOnNonZero is set');
  assert.strictEqual(caughtError.code, 'ERR_SUBPROCESS_NON_ZERO');
  assert.strictEqual(caughtError.exitCode, 42);
  assert.ok(caughtError.stderr.includes('Fatal GPU Out-Of-Memory error'));

  // Cleanup scratch workspace cleanly
  assert.strictEqual(sm.pruneWorkspace(ws), true);
  assert.strictEqual(fs.existsSync(ws), false, 'Scratch workspace must be completely removed');
});

test('FLT-02: Storage write failure during project backup fails closed cleanly without mutating original project state', () => {
  const projectFile = path.join(TEST_WORK_DIR, 'source_project.json');
  const originalData = { schema_version: '1.0.0', name: 'ImmutableSource', revision: 5 };
  fs.writeFileSync(projectFile, JSON.stringify(originalData, null, 2), 'utf8');

  // Attempt to backup to an impossible/invalid path (e.g. a file pretending to be directory)
  const invalidDir = path.join(TEST_WORK_DIR, 'file_not_dir');
  fs.writeFileSync(invalidDir, 'blocking-file', 'utf8');
  const backupTarget = path.join(invalidDir, 'nested_backup');

  const backupRes = createProjectBackup(projectFile, backupTarget);

  assert.strictEqual(backupRes.ok, false);
  assert.strictEqual(backupRes.backupPath, null);
  assert.ok(backupRes.error.includes('Backup creation failed'));

  // Ensure source file remains completely intact and uncorrupted
  const preservedData = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  assert.deepStrictEqual(preservedData, originalData);
});

test('FLT-03: Fencing token monotonicity and concurrent lock acquisition conflicts fail closed deterministically', () => {
  const lockDir = path.join(TEST_WORK_DIR, 'locks-flt-03');
  const coord = new SessionLockCoordinator({ lockDir, defaultLeaseMs: 5000 });

  // 1. Acquire lock first time
  const handle1 = coord.acquireLock('session', 'session-stale-test');
  assert.ok(handle1.fencingToken >= 1);
  assert.strictEqual(handle1.verifyActive(), true);

  // 2. Second concurrent acquire by another caller must fail closed with LockAcquisitionError
  let lockError = null;
  try {
    coord.acquireLock('session', 'session-stale-test', { ownerId: 'competing-agent-99' });
  } catch (err) {
    lockError = err;
  }
  assert.ok(lockError, 'Concurrent acquisition on live process lock must throw');
  assert.ok(lockError instanceof LockAcquisitionError);
  assert.strictEqual(lockError.code, 'LOCKED_BY_LIVE_OWNER');

  // 3. Monotonic token verification across clean release & re-acquisition
  assert.strictEqual(handle1.release(), true);
  assert.strictEqual(handle1.verifyActive(), false, 'Released lock handle must not be active');

  const handle2 = coord.acquireLock('session', 'session-stale-test');
  assert.ok(handle2.fencingToken > handle1.fencingToken, 'Fencing token must advance monotonically');
  assert.strictEqual(handle2.release(), true);
});

test('FLT-04: Corrupted or truncated backup manifest triggers fail-closed restore rejection without corrupting destination', () => {
  const backupFile = path.join(TEST_WORK_DIR, 'corrupt_backup.json');
  const manifestFile = `${backupFile}.manifest.json`;
  const destinationFile = path.join(TEST_WORK_DIR, 'critical_active_production.json');

  const pristineOriginal = { name: 'PristineProduction', status: 'ACTIVE' };
  fs.writeFileSync(destinationFile, JSON.stringify(pristineOriginal), 'utf8');

  // Write valid JSON backup but write corrupted, unparseable manifest
  fs.writeFileSync(backupFile, JSON.stringify({ name: 'TamperedBackup' }), 'utf8');
  fs.writeFileSync(manifestFile, '{ "invalid_json_manifest": truncated... ', 'utf8');

  const restoreRes = restoreProjectBackup(backupFile, destinationFile, manifestFile);

  assert.strictEqual(restoreRes.ok, false);
  assert.ok(restoreRes.error.includes('Invalid backup manifest'));

  // Destination file must NOT have been overwritten
  const currentDest = JSON.parse(fs.readFileSync(destinationFile, 'utf8'));
  assert.deepStrictEqual(currentDest, pristineOriginal);
});

test('FLT-05: Faulty diagnostics channel subscriber exception does not crash or abort host workflow execution', async () => {
  // Execute isolated child test script where subscriber deliberately throws
  const testScript = `
    const { defaultLogger, channels } = require("./src/prompt-core/logger.js");
    channels.jobTransitionChannel.subscribe(() => {
      throw new Error("Simulated external monitoring subscriber crash");
    });
    process.on("uncaughtException", (err) => {
      process.stdout.write("CAUGHT_SUBSCRIBER_ERROR: " + err.message + "\\n");
    });
    defaultLogger.emitJobTransition({ jobId: "flt-job-999", fromState: "EXECUTING", toState: "SUCCEEDED" });
    process.stdout.write("HOST_WORKFLOW_SUCCESS\\n");
  `;

  const res = await execSubprocessGuarded('node', ['-e', testScript], {
    cwd: path.resolve(__dirname, '..'),
    rejectOnNonZero: true
  });

  assert.strictEqual(res.exitCode, 0, 'Host process must exit cleanly with code 0');
  assert.ok(res.stdout.includes('HOST_WORKFLOW_SUCCESS'), 'Host workflow must complete successfully');
  assert.ok(res.stdout.includes('CAUGHT_SUBSCRIBER_ERROR: Simulated external monitoring subscriber crash'), 'Subscriber error must be intercepted');
});
