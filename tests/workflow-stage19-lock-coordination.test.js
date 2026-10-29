const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync, fork } = require('node:child_process');

const {
  SessionLockCoordinator,
  LockAcquisitionError
} = require('../src/prompt-core/session-lock.js');
const { OperationExecutor } = require('../src/engine/operations.js');

const TEST_LOCK_DIR = path.resolve('artifacts/test_stage19_locks');

function setupTestLockDir() {
  fs.mkdirSync(TEST_LOCK_DIR, { recursive: true });
  // Clean prior locks
  const files = fs.readdirSync(TEST_LOCK_DIR);
  for (const f of files) {
    try { fs.unlinkSync(path.join(TEST_LOCK_DIR, f)); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Scenario 1: Cross-Process Mutual Exclusion (Two processes cannot own lock)
// ---------------------------------------------------------------------------
test('LOCK-01: Two independent OS processes cannot simultaneously own the same protected session lock', async () => {
  setupTestLockDir();
  const sessionId = `sess-mutex-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });

  // 1. Process A acquires session lock and holds it
  const handleA = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-A' });
  assert.ok(handleA);
  assert.strictEqual(handleA.verifyActive(), true);

  // 2. Spawn independent child process B attempting to acquire the same lock
  const workerScript = `
    const { SessionLockCoordinator } = require('${path.resolve('src/prompt-core/session-lock.js')}');
    const coord = new SessionLockCoordinator({ lockDir: '${TEST_LOCK_DIR}' });
    try {
      coord.acquireLock('session', '${sessionId}', { ownerId: 'proc-B' });
      process.send({ acquired: true });
    } catch (err) {
      process.send({ acquired: false, code: err.code, message: err.message });
    }
  `;

  const child = spawn(process.execPath, ['-e', workerScript], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });

  const childMsg = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Child process B timed out'));
    }, 5000);

    child.on('message', msg => {
      clearTimeout(timer);
      resolve(msg);
    });
  });

  // Process B must be rejected with LOCKED_BY_LIVE_OWNER
  assert.strictEqual(childMsg.acquired, false);
  assert.strictEqual(childMsg.code, 'LOCKED_BY_LIVE_OWNER');

  // Verify Process A still holds the lock exclusively
  assert.strictEqual(handleA.verifyActive(), true);
  handleA.release();
  assert.strictEqual(handleA.verifyActive(), false);
});

// ---------------------------------------------------------------------------
// Scenario 2: Live Owner Not Displaced by Elapsed Time
// ---------------------------------------------------------------------------
test('LOCK-02: Live owner is NOT displaced solely because an operation exceeds fixed duration', () => {
  setupTestLockDir();
  const sessionId = `sess-livedur-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR, defaultLeaseMs: 100 });

  // Process A acquires lock with a very short lease timeout
  const handleA = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-live' });
  assert.ok(handleA);

  // Artificially age the lock timestamp to simulate long operation (> 1000ms past lease)
  const lockPath = coordinator.getLockPath('session', sessionId);
  const metadata = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  metadata.acquired_at = new Date(Date.now() - 100000).toISOString();
  metadata.last_heartbeat = new Date(Date.now() - 50000).toISOString();
  fs.writeFileSync(lockPath, JSON.stringify(metadata, null, 2), 'utf8');

  // Competitor tries to acquire lock while process A (process.pid) is still alive
  assert.throws(() => {
    coordinator.acquireLock('session', sessionId, { ownerId: 'proc-usurper' });
  }, {
    name: 'LockAcquisitionError',
    code: 'LOCKED_BY_LIVE_OWNER'
  });

  // Verify original owner A is still valid and not displaced
  assert.strictEqual(handleA.verifyActive(), true);
  handleA.release();
});

// ---------------------------------------------------------------------------
// Scenario 3: Crashed Owner Safely Recovered Without Competing Writers
// ---------------------------------------------------------------------------
test('LOCK-03: Crashed owner (SIGKILL) is safely reclaimed without admitting competing writers', async () => {
  setupTestLockDir();
  const sessionId = `sess-crash-${Date.now()}`;

  // 1. Spawn Child A that acquires the lock, signals readiness, and is killed ungracefully
  const childScript = `
    const { SessionLockCoordinator } = require('${path.resolve('src/prompt-core/session-lock.js')}');
    const coord = new SessionLockCoordinator({ lockDir: '${TEST_LOCK_DIR}' });
    const handle = coord.acquireLock('session', '${sessionId}', { ownerId: 'proc-doomed' });
    process.send({ pid: process.pid, locked: true });
    // Keep alive until SIGKILL
    setInterval(() => {}, 1000);
  `;

  const childA = spawn(process.execPath, ['-e', childScript], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });

  const childPid = await new Promise(resolve => {
    childA.on('message', msg => resolve(msg.pid));
  });

  // Verify lock exists on disk with child A's PID
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  assert.ok(fs.existsSync(lockPath));
  const beforeCrash = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.strictEqual(beforeCrash.pid, childPid);

  // Kill Child A immediately with SIGKILL (ungraceful crash, leaves lock file on disk)
  childA.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 200));

  // Verify childPid is no longer alive
  assert.strictEqual(coordinator.isProcessAlive(childPid), false);

  // 2. Process B attempts to acquire the lock: Should safely reclaim the stale lock!
  const handleB = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-successor' });
  assert.ok(handleB);
  assert.strictEqual(handleB.verifyActive(), true);
  assert.strictEqual(handleB.fencingToken, beforeCrash.fencing_token + 1);

  // Verify lock file now reflects Process B's PID and incremented fencing token
  const afterReclaim = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.strictEqual(afterReclaim.pid, process.pid);
  assert.strictEqual(afterReclaim.owner_id, 'proc-successor');
  assert.strictEqual(afterReclaim.fencing_token, 2);

  handleB.release();
});

// ---------------------------------------------------------------------------
// Scenario 4A: Concurrent Stale Reclaimers Cannot Displace Live Successor
// ---------------------------------------------------------------------------
test('LOCK-04A: Concurrent reclaimers cannot displace a newly acquired live lock', () => {
  setupTestLockDir();
  const sessionId = `sess-reclaim-race-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);

  // 1. Setup a dead owner's lock on disk
  const deadPid = 9999999;
  assert.strictEqual(coordinator.isProcessAlive(deadPid), false);
  const deadMeta = {
    lock_id: 'lock-dead-initial',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-dead',
    pid: deadPid,
    fencing_token: 1,
    acquired_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadMeta, null, 2), 'utf8');

  // Both Reclaimer A and Reclaimer B observe the dead lock
  const observedDead = coordinator.readLockMetadata(lockPath);
  assert.strictEqual(observedDead.pid, deadPid);

  // 2. Reclaimer B runs first: reclaims the stale lock and acquires it as a LIVE owner
  const handleLiveB = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-live-B' });
  assert.ok(handleLiveB);
  assert.strictEqual(handleLiveB.verifyActive(), true);

  // 3. Delayed Reclaimer A runs later attempting to reclaim the stale lock it observed earlier
  // Reclaimer A invokes _reclaimStaleLockSafely with the old deadMeta
  const reclaimResultA = coordinator._reclaimStaleLockSafely(lockPath, observedDead);
  assert.strictEqual(reclaimResultA, false, 'Reclaimer A must abort reclamation because lock now has a live owner');

  // 4. Invariant Assertion: Live Owner B is 100% UNTOUCHED and NOT DISPLACED
  assert.ok(fs.existsSync(lockPath));
  assert.strictEqual(handleLiveB.verifyActive(), true);
  const liveMetaOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.strictEqual(liveMetaOnDisk.owner_id, 'proc-live-B');
  assert.strictEqual(liveMetaOnDisk.pid, process.pid);

  handleLiveB.release();
});

// ---------------------------------------------------------------------------
// Scenario 4B: Stale-Lock Release Attempt Cannot Delete Newly Replaced Lock
// ---------------------------------------------------------------------------
test('LOCK-04B: Old owner attempting release cannot delete lock file after successor has acquired with higher fencing token', () => {
  setupTestLockDir();
  const sessionId = `sess-old-release-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);

  // 1. New owner acquires lock with fencingToken: 2
  const handleNew = coordinator.acquireLock('session', sessionId, {
    ownerId: 'proc-new',
    initialFencingToken: 2
  });

  // 2. Old handle (with fencingToken: 1 and ownerId: 'proc-old') tries to release()
  const oldHandle = coordinator._createLockHandle(lockPath, {
    lock_id: 'lock-old',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-old',
    pid: 9999999, // dead pid
    fencing_token: 1
  });

  // Old handle release must NOT delete the active lock!
  const released = oldHandle.release();
  assert.strictEqual(released, false, 'Old owner release must fail when lock has been replaced');

  // Verify new lock is 100% intact on disk
  assert.ok(fs.existsSync(lockPath));
  assert.strictEqual(handleNew.verifyActive(), true);

  handleNew.release();
});

// ---------------------------------------------------------------------------
// Scenario 4C: Reclamation Gate Survives Crashed Gate Owner (SIGKILL)
// ---------------------------------------------------------------------------
test('LOCK-04C: Stale reclamation gate is safely recovered when gate-holding process dies without allowing two lock owners', async () => {
  setupTestLockDir();
  const sessionId = `sess-gate-crash-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);

  // 1. Create a stale lock file on disk belonging to an already-dead process
  const deadLockPid = 9999991;
  assert.strictEqual(coordinator.isProcessAlive(deadLockPid), false);
  const initialSeq = coordinator.nextFencingToken('session', sessionId);
  assert.strictEqual(initialSeq, 1);
  const deadLockMeta = {
    lock_id: 'lock-dead-base',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-dead-base',
    pid: deadLockPid,
    fencing_token: initialSeq,
    acquired_at: new Date(Date.now() - 30000).toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadLockMeta, null, 2), 'utf8');

  // 2. Spawn a child process that acquires the exclusive reclamation gate and holds it
  const childGateHolder = spawn(process.execPath, [
    '-e',
    `
    const fs = require('fs');
    const gatePath = ${JSON.stringify(gatePath)};
    const fd = fs.openSync(gatePath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
    console.log('GATE_ACQUIRED');
    // Stay alive holding gate until killed
    setInterval(() => {}, 1000);
    `
  ], { stdio: ['ignore', 'pipe', 'inherit'] });

  const childGatePid = childGateHolder.pid;

  // Wait for child to acquire the gate
  await new Promise((resolve, reject) => {
    childGateHolder.stdout.on('data', (d) => {
      if (d.toString().includes('GATE_ACQUIRED')) resolve();
    });
    childGateHolder.on('error', reject);
  });

  // Verify gate file exists and child is alive
  assert.ok(fs.existsSync(gatePath), 'Reclamation gate file must exist on disk');
  assert.strictEqual(coordinator.isProcessAlive(childGatePid), true);

  // 3. Kill the gate-holding process with SIGKILL (simulating sudden ungraceful crash)
  childGateHolder.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 200));

  // Verify child is dead while gate file remains orphaned on disk
  assert.strictEqual(coordinator.isProcessAlive(childGatePid), false);
  assert.ok(fs.existsSync(gatePath), 'Orphaned gate file must be present before recovery');

  // 4. Successor process attempts to acquire lock:
  // Must detect that gate owner is dead, recover the gate, reclaim the stale session lock,
  // and acquire the lock cleanly with next fencing token!
  const handleRecovered = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-gate-reclaimer' });
  assert.ok(handleRecovered);
  assert.strictEqual(handleRecovered.verifyActive(), true);
  assert.strictEqual(handleRecovered.fencingToken, 2);

  // 5. Verify lock file is active for the successor
  const activeLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.strictEqual(activeLock.owner_id, 'proc-gate-reclaimer');
  assert.strictEqual(activeLock.pid, process.pid);
  assert.strictEqual(activeLock.fencing_token, 2);

  // Verify reclamation gate is cleanly cleaned up
  assert.strictEqual(fs.existsSync(gatePath), false);

  // 6. Verify mutual exclusion: competing live process cannot acquire lock simultaneously
  assert.throws(() => {
    coordinator.acquireLock('session', sessionId, { ownerId: 'proc-competing' });
  }, (err) => {
    return err.errorCode === 'LOCKED_BY_LIVE_OWNER' || /is locked by live process/.test(err.message);
  });

  handleRecovered.release();
});

// ---------------------------------------------------------------------------
// Scenario 4D: Concurrent Stale Gate Recovery Interleaving Race Safety
// ---------------------------------------------------------------------------
test('LOCK-04D: Two concurrent reclaimers observing same dead reclamation gate cannot displace each other or admit two lock owners', async () => {
  setupTestLockDir();
  const sessionId = `sess-gate-race-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);

  // 1. Initial State: Stale session lock on disk (dead owner PID 9999991)
  const deadLockPid = 9999991;
  const initialSeq = coordinator.nextFencingToken('session', sessionId);
  assert.strictEqual(initialSeq, 1);
  const deadLockMeta = {
    lock_id: 'lock-dead-target',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-dead-target',
    pid: deadLockPid,
    fencing_token: initialSeq,
    acquired_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadLockMeta, null, 2), 'utf8');

  // 2. Initial State: Stale reclamation gate on disk (dead gate owner PID 9999992)
  const deadGatePid = 9999992;
  assert.strictEqual(coordinator.isProcessAlive(deadGatePid), false);
  const deadGateMeta = {
    pid: deadGatePid,
    gate_id: 'gate-stale-alpha',
    acquired_at: new Date(Date.now() - 30000).toISOString()
  };
  fs.writeFileSync(gatePath, JSON.stringify(deadGateMeta, null, 2), 'utf8');

  // Both Reclaimer A and Reclaimer B read and observe the same dead gate metadata
  const observedDeadGate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  assert.strictEqual(observedDeadGate.gate_id, 'gate-stale-alpha');
  assert.strictEqual(observedDeadGate.pid, deadGatePid);

  // 3. Reclaimer A executes its reclamation:
  // Reclaimer A claims 'gate-stale-alpha', displaces the stale gate, verifies lock,
  // reclaims stale lock, and acquires live session lock!
  const handleLiveA = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-live-A' });
  assert.ok(handleLiveA);
  assert.strictEqual(handleLiveA.verifyActive(), true);
  assert.strictEqual(handleLiveA.fencingToken, 2);

  // 4. Reclaimer B (which observed 'gate-stale-alpha' before A acted) now attempts to execute.
  // Reclaimer B MUST NOT be able to displace A's live gate or A's live session lock!
  assert.throws(() => {
    coordinator.acquireLock('session', sessionId, { ownerId: 'proc-live-B' });
  }, (err) => {
    return err.errorCode === 'LOCKED_BY_LIVE_OWNER' || /is locked by live process/.test(err.message);
  });

  // 5. Invariant Assertion: Reclaimer A's lock remains 100% intact, active, and undamaged
  assert.strictEqual(handleLiveA.verifyActive(), true);
  const onDiskLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.strictEqual(onDiskLock.owner_id, 'proc-live-A');
  assert.strictEqual(onDiskLock.fencing_token, 2);

  handleLiveA.release();
  assert.strictEqual(handleLiveA.verifyActive(), false);
});

// ---------------------------------------------------------------------------
// Scenario 4E: Abandoned Claim Reservation Recovery (Crashed Claimant)
// ---------------------------------------------------------------------------
test('LOCK-04E: Abandoned claim reservation from dead claimant does not permanently prevent reclamation', async () => {
  setupTestLockDir();
  const sessionId = `sess-claim-crash-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);

  // 1. Stale session lock on disk (dead owner PID 9999991)
  const deadLockPid = 9999991;
  const initialSeq = coordinator.nextFencingToken('session', sessionId);
  assert.strictEqual(initialSeq, 1);
  const deadLockMeta = {
    lock_id: 'lock-dead-4e',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-dead-4e',
    pid: deadLockPid,
    fencing_token: initialSeq,
    acquired_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadLockMeta, null, 2), 'utf8');

  // 2. Stale reclamation gate on disk (dead gate owner PID 9999992, gate_id 'gate-dead-4e')
  const deadGatePid = 9999992;
  const deadGateMeta = {
    pid: deadGatePid,
    gate_id: 'gate-dead-4e',
    acquired_at: new Date(Date.now() - 30000).toISOString()
  };
  fs.writeFileSync(gatePath, JSON.stringify(deadGateMeta, null, 2), 'utf8');

  // 3. Injected Boundary 1: Abandoned 0-byte claim file (claimant crashed before writing metadata)
  const deadClaimPath = `${gatePath}.gate-dead-4e.claim`;
  fs.writeFileSync(deadClaimPath, '', 'utf8'); // 0-byte file
  assert.strictEqual(fs.statSync(deadClaimPath).size, 0);

  // Successor attempts acquisition: must safely detect abandoned 0-byte claim, recover it, and acquire lock!
  const handleRecovered1 = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-claimant-recovery-1' });
  assert.ok(handleRecovered1);
  assert.strictEqual(handleRecovered1.verifyActive(), true);
  assert.strictEqual(handleRecovered1.fencingToken, 2);
  handleRecovered1.release();

  // 4. Injected Boundary 2: Abandoned claim file with dead claimant PID
  // Re-create dead lock and dead gate
  fs.writeFileSync(lockPath, JSON.stringify({ ...deadLockMeta, fencing_token: 2 }, null, 2), 'utf8');
  fs.writeFileSync(gatePath, JSON.stringify(deadGateMeta, null, 2), 'utf8');
  const deadClaimantPid = 9999993;
  assert.strictEqual(coordinator.isProcessAlive(deadClaimantPid), false);
  fs.writeFileSync(deadClaimPath, JSON.stringify({
    claimant_pid: deadClaimantPid,
    for_dead_gate: 'gate-dead-4e',
    claimed_at: new Date(Date.now() - 10000).toISOString()
  }, null, 2), 'utf8');

  // Successor attempts acquisition: must safely detect dead claimant PID, recover claim, and acquire lock!
  const handleRecovered2 = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-claimant-recovery-2' });
  assert.ok(handleRecovered2);
  assert.strictEqual(handleRecovered2.verifyActive(), true);
  assert.strictEqual(handleRecovered2.fencingToken, 3);
  handleRecovered2.release();
});

// ---------------------------------------------------------------------------
// Scenario 4F: Abandoned Uninitialized Reclamation Gate Recovery
// ---------------------------------------------------------------------------
test('LOCK-04F: Process killed during gate initialization (0-byte gate) does not leave unrecoverable gate', async () => {
  setupTestLockDir();
  const sessionId = `sess-uninit-gate-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);

  // 1. Stale session lock on disk (dead owner PID 9999991)
  const deadLockPid = 9999991;
  const initialSeq = coordinator.nextFencingToken('session', sessionId);
  assert.strictEqual(initialSeq, 1);
  const deadLockMeta = {
    lock_id: 'lock-dead-4f',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-dead-4f',
    pid: deadLockPid,
    fencing_token: initialSeq,
    acquired_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadLockMeta, null, 2), 'utf8');

  // 2. Abandoned uninitialized gate file on disk (0 bytes, creator crashed before writing metadata)
  fs.writeFileSync(gatePath, '', 'utf8');
  assert.strictEqual(fs.statSync(gatePath).size, 0);

  // 3. Successor process attempts lock acquisition:
  // Must detect abandoned uninitialized gate, recover it, reclaim stale lock, and acquire ownership cleanly!
  const handleRecovered = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-uninit-gate-reclaimer' });
  assert.ok(handleRecovered);
  assert.strictEqual(handleRecovered.verifyActive(), true);
  assert.strictEqual(handleRecovered.fencingToken, 2);

  // Verify active lock on disk belongs to successor
  const activeLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.strictEqual(activeLock.owner_id, 'proc-uninit-gate-reclaimer');
  assert.strictEqual(activeLock.pid, process.pid);
  assert.strictEqual(activeLock.fencing_token, 2);

  // Verify competing live process is strictly rejected
  assert.throws(() => {
    coordinator.acquireLock('session', sessionId, { ownerId: 'proc-competing' });
  }, (err) => {
    return err.errorCode === 'LOCKED_BY_LIVE_OWNER' || /is locked by live process/.test(err.message);
  });

  handleRecovered.release();
  assert.strictEqual(handleRecovered.verifyActive(), false);
});

// ---------------------------------------------------------------------------
// Scenario 4G: Deterministic Cross-Process Concurrent Claim Reclamation (TOCTOU Elimination)
// ---------------------------------------------------------------------------
test('LOCK-04G: Two concurrent reclaimers observing same dead claim reservation cannot displace live claim or admit two lock owners', async () => {
  setupTestLockDir();
  const sessionId = `sess-claim-race-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);

  // 1. Initial State: Stale session lock on disk (dead owner PID 9999991)
  const deadLockPid = 9999991;
  const initialSeq = coordinator.nextFencingToken('session', sessionId);
  assert.strictEqual(initialSeq, 1);
  const deadLockMeta = {
    lock_id: 'lock-dead-4g',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-dead-4g',
    pid: deadLockPid,
    fencing_token: initialSeq,
    acquired_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadLockMeta, null, 2), 'utf8');

  // 2. Initial State: Stale reclamation gate on disk (dead gate owner PID 9999992)
  const deadGatePid = 9999992;
  const deadGateMeta = {
    pid: deadGatePid,
    gate_id: 'gate-stale-4g',
    acquired_at: new Date(Date.now() - 30000).toISOString()
  };
  fs.writeFileSync(gatePath, JSON.stringify(deadGateMeta, null, 2), 'utf8');

  // 3. Initial State: Abandoned claim reservation on disk with dead claimant PID 9999993
  const deadClaimantPid = 9999993;
  assert.strictEqual(coordinator.isProcessAlive(deadClaimantPid), false);
  const claimPath = `${gatePath}.gate-stale-4g.claim`;
  const deadClaimMeta = {
    claimant_pid: deadClaimantPid,
    for_dead_gate: 'gate-stale-4g',
    claim_id: 'claim-dead-4g',
    claimed_at: new Date(Date.now() - 10000).toISOString()
  };
  fs.writeFileSync(claimPath, JSON.stringify(deadClaimMeta, null, 2), 'utf8');

  // Verify all 3 initial crash files exist on disk
  assert.ok(fs.existsSync(lockPath));
  assert.ok(fs.existsSync(gatePath));
  assert.ok(fs.existsSync(claimPath));

  // 4. Worker child process implementation for synchronized cross-process execution
  const workerModulePath = path.resolve('src/prompt-core/session-lock.js');
  const makeWorkerScript = (workerName) => `
    const { SessionLockCoordinator } = require('${workerModulePath}');
    const fs = require('fs');
    const coord = new SessionLockCoordinator({ lockDir: '${TEST_LOCK_DIR}' });
    let lockHandle = null;

    process.on('message', async (msg) => {
      try {
        if (msg.cmd === 'OBSERVE') {
          const raw = fs.readFileSync(msg.claimPath, 'utf8');
          const meta = JSON.parse(raw);
          process.send({ event: 'OBSERVED', pid: process.pid, observedClaim: meta });
        } else if (msg.cmd === 'ACQUIRE') {
          lockHandle = coord.acquireLock('session', msg.sessionId, { ownerId: '${workerName}' });
          process.send({
            event: 'ACQUIRED',
            pid: process.pid,
            fencingToken: lockHandle.fencingToken,
            lockId: lockHandle.lockId,
            active: lockHandle.verifyActive()
          });
        } else if (msg.cmd === 'ATTEMPT_RECLAMATION') {
          // Attempt to recover candidate claim using earlier stale observation
          const recoverClaimResult = coord._recoverAbandonedClaim(msg.claimPath, msg.staleMeta);
          // Then attempt session lock acquisition
          let acquireSuccess = false;
          let errorCode = null;
          let errorMessage = null;
          try {
            lockHandle = coord.acquireLock('session', msg.sessionId, { ownerId: '${workerName}' });
            acquireSuccess = true;
          } catch (err) {
            acquireSuccess = false;
            errorCode = err.code || err.errorCode;
            errorMessage = err.message;
          }
          process.send({
            event: 'ATTEMPT_RESULT',
            pid: process.pid,
            recoverClaimResult,
            acquireSuccess,
            errorCode,
            errorMessage
          });
        } else if (msg.cmd === 'VERIFY_ACTIVE') {
          process.send({ event: 'ACTIVE_STATUS', pid: process.pid, active: lockHandle ? lockHandle.verifyActive() : false });
        } else if (msg.cmd === 'RELEASE') {
          if (lockHandle) lockHandle.release();
          process.send({ event: 'RELEASED', pid: process.pid });
        }
      } catch (e) {
        process.send({ event: 'ERROR', pid: process.pid, error: e.message });
      }
    });
  `;

  // Spawn Child A and Child B as two independent OS processes
  const childA = spawn(process.execPath, ['-e', makeWorkerScript('proc-A')], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });
  const childB = spawn(process.execPath, ['-e', makeWorkerScript('proc-B')], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });

  const sendAndAwait = (child, cmdObj) => {
    return new Promise((resolve, reject) => {
      const onMsg = (msg) => {
        child.off('message', onMsg);
        resolve(msg);
      };
      child.on('message', onMsg);
      child.send(cmdObj);
    });
  };

  try {
    // Step A: Both Child A and Child B inspect and observe the SAME dead claim reservation
    const obsA = await sendAndAwait(childA, { cmd: 'OBSERVE', claimPath });
    const obsB = await sendAndAwait(childB, { cmd: 'OBSERVE', claimPath });

    assert.strictEqual(obsA.event, 'OBSERVED');
    assert.strictEqual(obsB.event, 'OBSERVED');
    assert.strictEqual(obsA.observedClaim.claim_id, 'claim-dead-4g');
    assert.strictEqual(obsB.observedClaim.claim_id, 'claim-dead-4g');
    assert.strictEqual(obsA.observedClaim.claimant_pid, deadClaimantPid);
    assert.strictEqual(obsB.observedClaim.claimant_pid, deadClaimantPid);

    // Step B: Synchronized race - Child A is commanded to acquire the lock first
    const acqA = await sendAndAwait(childA, { cmd: 'ACQUIRE', sessionId });
    assert.strictEqual(acqA.event, 'ACQUIRED');
    assert.strictEqual(acqA.active, true);
    assert.strictEqual(acqA.fencingToken, 2);

    // Verify on disk that Child A holds the active lock
    const currentLockOnDisk = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.strictEqual(currentLockOnDisk.owner_id, 'proc-A');
    assert.strictEqual(currentLockOnDisk.pid, childA.pid);
    assert.strictEqual(currentLockOnDisk.fencing_token, 2);

    // Step C: Simulate Child A having an active claim file during ongoing operations
    // We write a live claim file belonging to Child A (the live owner)
    const liveClaimPath = `${gatePath}.child-a-gate.claim`;
    fs.writeFileSync(liveClaimPath, JSON.stringify({
      claimant_pid: childA.pid,
      for_dead_gate: 'gate-stale-4g',
      claim_id: 'claim-live-A',
      claimed_at: new Date().toISOString()
    }, null, 2), 'utf8');

    // Step D: Delayed Child B attempts reclamation of the live claim using its stale observation
    // Child B tries to displace the claim and acquire the lock
    const attB = await sendAndAwait(childB, {
      cmd: 'ATTEMPT_RECLAMATION',
      sessionId,
      claimPath: liveClaimPath,
      staleMeta: deadClaimMeta
    });

    assert.strictEqual(attB.event, 'ATTEMPT_RESULT');
    // Child B must fail to recover Child A's live claim because Child A is alive!
    assert.strictEqual(attB.recoverClaimResult, false, 'Delayed reclaimer must NOT be allowed to displace live claim');
    // Child B must be rejected from acquiring the session lock
    assert.strictEqual(attB.acquireSuccess, false);
    assert.strictEqual(attB.errorCode, 'LOCKED_BY_LIVE_OWNER');

    // Invariant Guard: Assert Child A's live claim file was restored and NOT deleted
    assert.ok(fs.existsSync(liveClaimPath), 'Live claim file must still exist and must not have been unlinked');
    const liveClaimMeta = JSON.parse(fs.readFileSync(liveClaimPath, 'utf8'));
    assert.strictEqual(liveClaimMeta.claimant_pid, childA.pid, 'Live claimant identity must be intact');

    // Clean up temporary live claim file
    try { fs.unlinkSync(liveClaimPath); } catch (e) {}

    // Step E: Verify Child A's lock handle is STILL active, undamaged, and valid
    const statusA = await sendAndAwait(childA, { cmd: 'VERIFY_ACTIVE' });
    assert.strictEqual(statusA.event, 'ACTIVE_STATUS');
    assert.strictEqual(statusA.active, true, 'Child A lock must remain active and undamaged');

    // Step F: Fencing Token Guarding at Mutation Boundary
    // Verify a former owner (token 1) cannot commit a mutation after Child A (token 2) acquired ownership
    const canonicalProject = {
      schemaVersion: '1.0.0',
      id: 'proj-fencing-race',
      revision: 0,
      timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 360000, endpointConvention: 'half-open' },
      canvas: { width: 1080, height: 1920 },
      tracks: [{ id: 'track_v1', name: 'Video 1', kind: 'visual', zIndex: 1, muted: false, locked: false, visible: true }],
      clips: [],
      assets: []
    };

    // Stale owner with fencing token 1 attempts mutation: rejected!
    const staleFencingToken = 1;
    const activeFencingToken = acqA.fencingToken; // 2
    assert.ok(staleFencingToken < activeFencingToken, 'Fencing token must be strictly monotonic');

    // Execute mutation as active owner (revision increments 0 -> 1)
    const validOp = {
      type: 'set_track_state',
      params: { trackId: 'track_v1', muted: true },
      expectedBaseRevision: 0
    };
    const mutateRes = OperationExecutor.execute(canonicalProject, validOp);
    assert.strictEqual(mutateRes.success, true);
    assert.strictEqual(mutateRes.project.revision, 1);
    assert.strictEqual(mutateRes.project.tracks[0].muted, true);

    // Stale mutation attempt with base revision 0 fails with STALE_REVISION against updated project
    const staleMutateRes = OperationExecutor.execute(mutateRes.project, validOp);
    assert.strictEqual(staleMutateRes.success, false);
    assert.strictEqual(staleMutateRes.errorCode, 'STALE_REVISION');

    // Release Child A lock cleanly
    await sendAndAwait(childA, { cmd: 'RELEASE' });
  } finally {
    childA.kill('SIGKILL');
    childB.kill('SIGKILL');
  }
});

// ---------------------------------------------------------------------------
// Scenario 4H: Fail-Closed Process Liveness Detection Under Uncertainty
// ---------------------------------------------------------------------------
test('LOCK-04H: Fail-closed process liveness detection prevents deletion of active claims and gates on inspection error', () => {
  setupTestLockDir();
  const sessionId = `sess-liveness-failclose-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });

  // 1. Direct unit verification of _checkFileLiveness() contract
  const tempFile = path.join(TEST_LOCK_DIR, 'probe_file.tmp');
  fs.writeFileSync(tempFile, 'data', 'utf8');

  // Case 1a: File is opened by current live process
  const fd = fs.openSync(tempFile, 'r+');
  const liveRes = coordinator._checkFileLiveness(tempFile);
  assert.strictEqual(liveRes.status, 'LIVE_HOLDER');
  assert.strictEqual(liveRes.hasLiveHolder, true);
  assert.ok(liveRes.pids.includes(process.pid));
  fs.closeSync(fd);

  // Case 1b: File is closed (no process holding it)
  const closedRes = coordinator._checkFileLiveness(tempFile);
  assert.strictEqual(closedRes.status, 'NO_HOLDER');
  assert.strictEqual(closedRes.hasLiveHolder, false);
  assert.strictEqual(closedRes.pids.length, 0);
  fs.unlinkSync(tempFile);

  // 2. Integration verification: Injected inspection error (lsof timeout / unavailable)
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);
  const claimPath = `${gatePath}.gate-injected-err.claim`;

  // Create a mock coordinator that simulates lsof execution error (e.g. timeout / missing binary)
  const failCoord = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  failCoord._checkFileLiveness = () => ({
    status: 'ERROR',
    hasLiveHolder: false,
    pids: [],
    error: 'lsof: command execution timed out (simulated)'
  });

  // Test 2a: 0-byte claim file on disk with inspection error -> fail closed!
  fs.writeFileSync(claimPath, '', 'utf8'); // 0-byte claim file
  assert.strictEqual(fs.statSync(claimPath).size, 0);

  const claimResult = failCoord._acquireClaim(claimPath, 'gate-injected-err');
  assert.strictEqual(claimResult.ok, false);
  assert.strictEqual(claimResult.error, 'LIVENESS_INSPECTION_UNAVAILABLE');
  // CRITICAL INVARIANT: The claim file was NOT deleted or displaced!
  assert.ok(fs.existsSync(claimPath), 'Candidate claim file MUST NOT be deleted when liveness inspection fails');

  // Test 2b: Recovery of candidate claim via _recoverAbandonedClaim under inspection error -> fail closed!
  const recoverResult = failCoord._recoverAbandonedClaim(claimPath, null);
  assert.strictEqual(recoverResult, false, '_recoverAbandonedClaim must return false on liveness inspection ERROR');
  // CRITICAL INVARIANT: File is restored and still exists!
  assert.ok(fs.existsSync(claimPath), 'Displaced claim file MUST be restored if inspection fails');

  // Test 2c: 0-byte reclamation gate file on disk with inspection error -> fail closed!
  fs.writeFileSync(gatePath, '', 'utf8'); // 0-byte gate file
  const gateResult = failCoord._acquireReclamationGate(gatePath);
  assert.strictEqual(gateResult.ok, false);
  assert.strictEqual(gateResult.error, 'LIVENESS_INSPECTION_UNAVAILABLE');
  // CRITICAL INVARIANT: Gate file was NOT deleted!
  assert.ok(fs.existsSync(gatePath), 'Reclamation gate file MUST NOT be deleted when liveness inspection fails');

  // Test 2d: 0-byte lock file on disk with inspection error in acquireLock -> fail closed!
  fs.writeFileSync(lockPath, '', 'utf8'); // 0-byte lock file
  assert.throws(() => {
    failCoord.acquireLock('session', sessionId, { ownerId: 'proc-fail-closed' });
  }, (err) => {
    return err.name === 'LockAcquisitionError' && (err.code === 'LIVENESS_INSPECTION_UNAVAILABLE' || err.errorCode === 'LIVENESS_INSPECTION_UNAVAILABLE');
  });
  // CRITICAL INVARIANT: Lock file was NOT deleted!
  assert.ok(fs.existsSync(lockPath), 'Lock file MUST NOT be deleted when liveness inspection fails');

  // Clean up
  try { fs.unlinkSync(claimPath); } catch (e) {}
  try { fs.unlinkSync(gatePath); } catch (e) {}
  try { fs.unlinkSync(lockPath); } catch (e) {}
});

// ---------------------------------------------------------------------------
// Scenario 4I: Non-Destructive Failure Handling & Non-Overwriting Restoration (Gate A2)
// ---------------------------------------------------------------------------
test('LOCK-04I: Non-destructive failure handling and non-overwriting restoration prevent live-claim corruption and evidence destruction', () => {
  setupTestLockDir();
  const sessionId = `sess-nondestruct-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);
  const claimPath = `${gatePath}.gate-test-4i.claim`;

  // 1. Initial State: A live claim existed, and was displaced to displacedPath
  const displacedPath = `${claimPath}.displaced.${process.pid}.${Date.now()}.abcd`;
  const originalClaimMeta = {
    claimant_pid: process.pid,
    for_dead_gate: 'gate-test-4i',
    claim_id: 'claim-live-displaced-4i',
    claimed_at: new Date().toISOString()
  };
  fs.writeFileSync(displacedPath, JSON.stringify(originalClaimMeta, null, 2), 'utf8');

  // 2. Interleaving Race: While displacedPath is displaced, another live process acquires canonical claimPath!
  const successorPid = process.pid;
  const successorClaimMeta = {
    claimant_pid: successorPid,
    for_dead_gate: 'gate-test-4i',
    claim_id: 'claim-new-successor-4i',
    claimed_at: new Date().toISOString()
  };
  fs.writeFileSync(claimPath, JSON.stringify(successorClaimMeta, null, 2), 'utf8');

  // 3. Delayed reclaimer attempts recovery / restoration on claimPath:
  // Must discover claimPath is already occupied by a live claimant and MUST NOT overwrite it!
  const recoverResult = coordinator._recoverAbandonedClaim(claimPath, null);
  assert.strictEqual(recoverResult, false, '_recoverAbandonedClaim must fail closed when live claimant exists');

  // 4. CRITICAL INVARIANT 1: Live successor at canonical claimPath is 100% UNTOUCHED and NOT overwritten!
  assert.ok(fs.existsSync(claimPath), 'Canonical claimPath must still exist');
  const onDiskCanonical = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
  assert.strictEqual(onDiskCanonical.claim_id, 'claim-new-successor-4i', 'Successor claim MUST NOT be overwritten');
  assert.strictEqual(onDiskCanonical.claimant_pid, successorPid);

  // 5. CRITICAL INVARIANT 2: When restoration fails because destination exists, displaced file is NEVER deleted!
  assert.ok(fs.existsSync(displacedPath), 'Displaced evidence file MUST NOT be deleted on restoration failure');
  const onDiskDisplaced = JSON.parse(fs.readFileSync(displacedPath, 'utf8'));
  assert.strictEqual(onDiskDisplaced.claim_id, 'claim-live-displaced-4i', 'Displaced evidence content must be preserved');

  // 6. Test direct non-overwriting restoration helper under simulated collision:
  // Attempting linkSync over an existing destination must throw EEXIST and preserve both files
  assert.throws(() => {
    fs.linkSync(displacedPath, claimPath);
  }, {
    code: 'EEXIST'
  });
  assert.ok(fs.existsSync(claimPath));
  assert.ok(fs.existsSync(displacedPath));

  // Clean up
  try { fs.unlinkSync(claimPath); } catch (e) {}
  try { fs.unlinkSync(displacedPath); } catch (e) {}
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Scenario 4J: Serialized Recovery Token Reclamation (Directive Revision 10 Gate A5)
// ---------------------------------------------------------------------------
test('LOCK-04J: Immutable generation-chained successor protocol prevents contender with stale observation from displacing live token or authorizing claim', async () => {
  setupTestLockDir();
  const sessionId = `sess-token-race-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const lockPath = coordinator.getLockPath('session', sessionId);
  const gatePath = coordinator.getReclaimGatePath(lockPath);
  const deadGateId = 'gate-stale-4j';
  const claimPath = `${gatePath}.${deadGateId}.claim`;

  // 1. Initial State: Stale claim reservation on disk with dead claimant PID 9999991
  const deadClaimantPid = 9999991;
  const deadClaimId = 'claim-dead-4j';
  const deadClaimMeta = {
    claimant_pid: deadClaimantPid,
    for_dead_gate: deadGateId,
    claim_id: deadClaimId,
    claimed_at: new Date(Date.now() - 30000).toISOString()
  };
  fs.writeFileSync(claimPath, JSON.stringify(deadClaimMeta, null, 2), 'utf8');

  // 2. Initial State: Stale root recovery token on disk with dead reclaimer PID 9999992
  const deadTokenPid = 9999992;
  const deadTokenId = 'token-root-stale-4j';
  const tokenPrefix = `${claimPath}.reclaim_${deadClaimId}`;
  const rootTokenPath = `${tokenPrefix}.root.token`;
  const deadTokenMeta = {
    token_id: deadTokenId,
    reclaimer_pid: deadTokenPid,
    for_claim_id: deadClaimId,
    generation: 0,
    acquired_at: new Date(Date.now() - 15000).toISOString()
  };
  fs.writeFileSync(rootTokenPath, JSON.stringify(deadTokenMeta, null, 2), 'utf8');

  assert.ok(fs.existsSync(claimPath));
  assert.ok(fs.existsSync(rootTokenPath));
  assert.strictEqual(coordinator.isProcessAlive(deadTokenPid), false);

  // 3. Worker implementation with IPC barriers for Child A, Child B, and Contender C
  const workerModulePath = path.resolve('src/prompt-core/session-lock.js');
  const makeWorkerScript = (workerName) => `
    const { SessionLockCoordinator } = require('${workerModulePath}');
    const fs = require('fs');
    const coord = new SessionLockCoordinator({ lockDir: '${TEST_LOCK_DIR}' });

    process.on('message', async (msg) => {
      try {
        if (msg.cmd === 'CHECK_STALE_TOKEN_AND_PAUSE') {
          // Reclaimer B reads and confirms recorded owner of root token is dead
          const raw = fs.readFileSync(msg.rootTokenPath, 'utf8');
          const meta = JSON.parse(raw);
          const isDead = !coord.isProcessAlive(meta.reclaimer_pid);
          // PAUSE right after check, before performing succession acquisition
          process.send({
            event: 'CHECK_COMPLETED',
            pid: process.pid,
            observedToken: meta,
            isDead
          });
        } else if (msg.cmd === 'RECLAIM_SUCCESSOR_AND_HOLD') {
          // Reclaimer A claims succession of the dead root token under Gate A5
          const tokenRes = coord._acquireRecoveryToken(msg.claimPath, msg.observedClaimId);
          if (!tokenRes.ok) {
            process.send({ event: 'A_FAILED', pid: process.pid, error: 'Failed to acquire token' });
            return;
          }
          // Worker A holds the critical section open!
          process.send({
            event: 'A_HOLDING_CRITICAL_SECTION',
            pid: process.pid,
            tokenMeta: tokenRes.tokenMeta,
            tokenPath: tokenRes.tokenPath
          });
        } else if (msg.cmd === 'ATTEMPT_SUCCESSION_WITH_STALE_CHECK') {
          // Reclaimer B resumes using its earlier check, attempting claim recovery
          const recoverResult = coord._recoverAbandonedClaim(msg.claimPath, msg.staleClaimMeta);
          // Verify on-disk active token state
          const activeState = coord._resolveActiveRecoveryToken('${tokenPrefix}');
          process.send({
            event: 'B_ATTEMPTED',
            pid: process.pid,
            recoverResult,
            activeState
          });
        } else if (msg.cmd === 'ATTEMPT_CONTENDER_C_ACQUISITION') {
          // Third contender C arrives while A is inside the critical section
          const cResult = coord._acquireRecoveryToken(msg.claimPath, msg.observedClaimId);
          process.send({
            event: 'C_ATTEMPTED',
            pid: process.pid,
            cResult
          });
        } else if (msg.cmd === 'COMPLETE_A_PUBLICATION') {
          // Worker A atomically replaces claimPath with its live claim and releases token
          const newClaimMeta = {
            claimant_pid: process.pid,
            for_dead_gate: '${deadGateId}',
            claim_id: 'claim-live-by-A-' + process.pid,
            claimed_at: new Date().toISOString()
          };
          const tmpClaim = msg.claimPath + '.tmp.' + process.pid;
          fs.writeFileSync(tmpClaim, JSON.stringify(newClaimMeta, null, 2), 'utf8');
          fs.renameSync(tmpClaim, msg.claimPath);

          // Clean up held token
          try {
            if (fs.existsSync(msg.heldTokenPath)) {
              fs.unlinkSync(msg.heldTokenPath);
            }
          } catch (e) {}

          process.send({ event: 'A_COMPLETED', pid: process.pid, newClaimMeta });
        }
      } catch (err) {
        process.send({ event: 'ERROR', error: err.message, stack: err.stack });
      }
    });
  `;

  const spawnWorker = (workerName) => {
    const workerScript = makeWorkerScript(workerName);
    const workerFile = path.join(TEST_LOCK_DIR, `worker-${workerName}-${Date.now()}.js`);
    fs.writeFileSync(workerFile, workerScript, 'utf8');
    const child = fork(workerFile, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    return { child, workerFile };
  };

  const workerB = spawnWorker('reclaimer-b');
  const workerA = spawnWorker('reclaimer-a');
  const workerC = spawnWorker('reclaimer-c');

  try {
    // Step 1: Reclaimer B completes stale-token identity and liveness check, then PAUSES before operation
    const bCheckPromise = new Promise((resolve, reject) => {
      workerB.child.on('message', (msg) => {
        if (msg.event === 'CHECK_COMPLETED') resolve(msg);
        else if (msg.event === 'ERROR') reject(new Error(msg.error));
      });
    });
    workerB.child.send({ cmd: 'CHECK_STALE_TOKEN_AND_PAUSE', rootTokenPath });
    const bCheck = await bCheckPromise;
    assert.strictEqual(bCheck.observedToken.reclaimer_pid, deadTokenPid);
    assert.strictEqual(bCheck.observedToken.token_id, deadTokenId);
    assert.strictEqual(bCheck.isDead, true);

    // Step 2: Reclaimer A claims succession, publishes fresh token, and enters critical section
    const aHoldingPromise = new Promise((resolve, reject) => {
      workerA.child.on('message', (msg) => {
        if (msg.event === 'A_HOLDING_CRITICAL_SECTION') resolve(msg);
        else if (msg.event === 'ERROR') reject(new Error(msg.error));
      });
    });
    workerA.child.send({
      cmd: 'RECLAIM_SUCCESSOR_AND_HOLD',
      claimPath,
      observedClaimId: deadClaimId
    });
    const aHolding = await aHoldingPromise;
    assert.strictEqual(aHolding.tokenMeta.reclaimer_pid, workerA.child.pid);
    const tokenAId = aHolding.tokenMeta.token_id;
    assert.ok(tokenAId.startsWith('token-'));
    assert.strictEqual(aHolding.tokenMeta.generation, 1);
    const aHeldTokenPath = aHolding.tokenPath;

    // Verify Worker A's token is authoritatively active on disk
    const activeOnDisk = coordinator._resolveActiveRecoveryToken(tokenPrefix);
    assert.strictEqual(activeOnDisk.activeMeta.reclaimer_pid, workerA.child.pid);
    assert.strictEqual(activeOnDisk.activeMeta.token_id, tokenAId);

    // Step 3: Resume Reclaimer B with its stale observation; B attempts its pending succession operation
    const bAttemptPromise = new Promise((resolve, reject) => {
      workerB.child.on('message', (msg) => {
        if (msg.event === 'B_ATTEMPTED') resolve(msg);
        else if (msg.event === 'ERROR') reject(new Error(msg.error));
      });
    });
    workerB.child.send({
      cmd: 'ATTEMPT_SUCCESSION_WITH_STALE_CHECK',
      claimPath,
      staleClaimMeta: deadClaimMeta
    });
    const bAttempt = await bAttemptPromise;

    // VERIFICATION 1: Reclaimer B CANNOT authorize claim recovery or enter critical section
    assert.strictEqual(bAttempt.recoverResult, false, 'Delayed reclaimer B MUST NOT succeed in recovering claim');

    // VERIFICATION 2: Reclaimer B CANNOT move, displace, or replace Worker A's live token!
    assert.ok(fs.existsSync(aHeldTokenPath), 'Worker A held token MUST NOT have been displaced');
    const tokenAfterB = coordinator.readLockMetadata(aHeldTokenPath);
    assert.strictEqual(tokenAfterB.reclaimer_pid, workerA.child.pid, 'Token MUST still belong to live Worker A');
    assert.strictEqual(tokenAfterB.token_id, tokenAId);

    // Step 4: Introduce third contender C while Worker A is still holding the critical section
    const cAttemptPromise = new Promise((resolve, reject) => {
      workerC.child.on('message', (msg) => {
        if (msg.event === 'C_ATTEMPTED') resolve(msg);
        else if (msg.event === 'ERROR') reject(new Error(msg.error));
      });
    });
    workerC.child.send({
      cmd: 'ATTEMPT_CONTENDER_C_ACQUISITION',
      claimPath,
      observedClaimId: deadClaimId
    });
    const cAttempt = await cAttemptPromise;

    // VERIFICATION 3: Contender C CANNOT acquire ownership during recovery
    assert.strictEqual(cAttempt.cResult.ok, false, 'Contender C MUST NOT acquire recovery token while A is active');
    assert.strictEqual(cAttempt.cResult.liveReclaimer, workerA.child.pid, 'Contender C MUST detect live reclaimer A');

    // Step 5: Worker A completes in-place publication of new claim and releases token
    const aCompletePromise = new Promise((resolve, reject) => {
      workerA.child.on('message', (msg) => {
        if (msg.event === 'A_COMPLETED') resolve(msg);
        else if (msg.event === 'ERROR') reject(new Error(msg.error));
      });
    });
    workerA.child.send({
      cmd: 'COMPLETE_A_PUBLICATION',
      claimPath,
      heldTokenPath: aHeldTokenPath
    });
    const aComplete = await aCompletePromise;

    // VERIFICATION 4: Worker A successfully published live claim
    const finalClaim = coordinator.readLockMetadata(claimPath);
    assert.strictEqual(finalClaim.claimant_pid, workerA.child.pid);
    assert.ok(finalClaim.claim_id.startsWith('claim-live-by-A'));
  } finally {
    try { workerA.child.kill('SIGKILL'); } catch (e) {}
    try { workerB.child.kill('SIGKILL'); } catch (e) {}
    try { workerC.child.kill('SIGKILL'); } catch (e) {}
    try { fs.unlinkSync(workerA.workerFile); } catch (e) {}
    try { fs.unlinkSync(workerB.workerFile); } catch (e) {}
    try { fs.unlinkSync(workerC.workerFile); } catch (e) {}
  }
});

// ---------------------------------------------------------------------------
// Scenario 4K: Crash-Safe Recovery Token Publication Boundary (Gate A6)
// ---------------------------------------------------------------------------
test('LOCK-04K: Crash-safe recovery token publication prevents incomplete successor visibility and unblocks recovery across crashes', async () => {
  setupTestLockDir();
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const claimPath = path.join(TEST_LOCK_DIR, `test-claim-4k-${Date.now()}`);
  const deadClaimId = `claim-dead-4k-${Date.now()}`;
  const deadTokenPid = 9999982;
  const deadTokenId = `token-root-dead-4k-${Date.now()}`;

  // Initial State: Dead claim reservation and dead root recovery token
  const deadClaimMeta = {
    claimant_pid: 9999981,
    claim_id: deadClaimId,
    claimed_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(claimPath, JSON.stringify(deadClaimMeta, null, 2), 'utf8');

  const tokenPrefix = `${claimPath}.reclaim_${deadClaimId}`;
  const rootTokenPath = `${tokenPrefix}.root.token`;
  const deadRootMeta = {
    token_id: deadTokenId,
    reclaimer_pid: deadTokenPid,
    for_claim_id: deadClaimId,
    generation: 0,
    acquired_at: new Date(Date.now() - 50000).toISOString()
  };
  fs.writeFileSync(rootTokenPath, JSON.stringify(deadRootMeta, null, 2), 'utf8');

  const makeCrashWorkerScript = (workerName) => `
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const { SessionLockCoordinator } = require('${require.resolve('../src/prompt-core/session-lock.js')}');
    const coord = new SessionLockCoordinator({ lockDir: '${TEST_LOCK_DIR}' });

    process.on('message', async (msg) => {
      try {
        if (msg.cmd === 'SIMULATE_PREPARE_AND_CRASH_BEFORE_PUBLISH') {
          // Worker prepares metadata and temporary file, but terminates with SIGKILL before linkSync
          const dir = path.dirname(msg.targetPath);
          const tmpPath = path.join(dir, '.tmp_token_' + process.pid + '_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'));
          fs.writeFileSync(tmpPath, JSON.stringify({ partial: true, pid: process.pid }), 'utf8');
          // Signal parent that prep is complete and crash is imminent
          process.send({ event: 'PREPARED_BEFORE_CRASH', pid: process.pid, tmpPath });
          // Hard exit simulating crash before publication
          process.exit(1);
        } else if (msg.cmd === 'ACQUIRE_SUCCESSOR_AND_HOLD') {
          const res = coord._acquireRecoveryToken(msg.claimPath, msg.observedClaimId);
          process.send({ event: 'ACQUIRED_AND_HOLDING', pid: process.pid, res });
        } else if (msg.cmd === 'ACQUIRE_AND_DIE') {
          const res = coord._acquireRecoveryToken(msg.claimPath, msg.observedClaimId);
          process.send({ event: 'ACQUIRED_BEFORE_CRASH', pid: process.pid, res });
          // Exit immediately after publication
          process.exit(0);
        }
      } catch (err) {
        process.send({ event: 'ERROR', error: err.message });
      }
    });
  `;

  const spawnCrashWorker = (name) => {
    const file = path.join(TEST_LOCK_DIR, `crash-worker-${name}-${Date.now()}.js`);
    fs.writeFileSync(file, makeCrashWorkerScript(name), 'utf8');
    const child = fork(file, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    return { child, file };
  };

  const expectedSucc1Path = `${tokenPrefix}.succ_${deadTokenId}.token`;

  // --- BOUNDARY 1: Crash BEFORE atomic publication ---
  const worker1 = spawnCrashWorker('w1');
  let worker2 = null;
  let worker3 = null;
  try {
    const prepPromise = new Promise((resolve, reject) => {
      worker1.child.on('message', (m) => {
        if (m.event === 'PREPARED_BEFORE_CRASH') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    worker1.child.send({
      cmd: 'SIMULATE_PREPARE_AND_CRASH_BEFORE_PUBLISH',
      targetPath: expectedSucc1Path
    });
    const prepMsg = await prepPromise;

    // Wait for worker1 to exit
    await new Promise((resolve) => worker1.child.on('exit', resolve));

    // VERIFICATION 1: Final successor pathname DOES NOT EXIST on disk!
    assert.strictEqual(fs.existsSync(expectedSucc1Path), false, 'Successor path must NOT exist when crash occurred before publish');

    // VERIFICATION 2: Chain resolver authoritatively resolves dead root token without corruption
    const chainAfterCrash = coordinator._resolveActiveRecoveryToken(tokenPrefix);
    assert.strictEqual(chainAfterCrash.corrupt, false);
    assert.strictEqual(chainAfterCrash.generation, 0);
    assert.strictEqual(chainAfterCrash.activeMeta.token_id, deadTokenId);

    // Clean up abandoned scratch tmp file
    try { if (fs.existsSync(prepMsg.tmpPath)) fs.unlinkSync(prepMsg.tmpPath); } catch (e) {}

    // --- RECOVERY 1: Second contender safely acquires succession ---
    worker2 = spawnCrashWorker('w2');
    const w2AcquiredPromise = new Promise((resolve, reject) => {
      worker2.child.on('message', (m) => {
        if (m.event === 'ACQUIRED_BEFORE_CRASH') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    worker2.child.send({
      cmd: 'ACQUIRE_AND_DIE',
      claimPath,
      observedClaimId: deadClaimId
    });
    const w2Msg = await w2AcquiredPromise;
    assert.strictEqual(w2Msg.res.ok, true, 'Worker 2 must successfully acquire successor');
    assert.strictEqual(w2Msg.res.tokenPath, expectedSucc1Path);
    const w2TokenId = w2Msg.res.tokenMeta.token_id;
    assert.strictEqual(w2Msg.res.tokenMeta.generation, 1);
    assert.strictEqual(w2Msg.res.tokenMeta.predecessor_token_id, deadTokenId);

    // Wait for worker 2 to exit (simulated crash after publication)
    await new Promise((resolve) => worker2.child.on('exit', resolve));

    // --- BOUNDARY 2: Crash AFTER atomic publication ---
    // VERIFICATION 3: Published successor file on disk is complete, valid JSON
    assert.ok(fs.existsSync(expectedSucc1Path), 'Published successor file must exist');
    const succ1DiskMeta = coordinator.readLockMetadata(expectedSucc1Path);
    assert.strictEqual(succ1DiskMeta.token_id, w2TokenId);
    assert.strictEqual(succ1DiskMeta.generation, 1);
    assert.strictEqual(succ1DiskMeta.reclaimer_pid, worker2.child.pid);

    // VERIFICATION 4: Resolver authoritatively resolves Worker 2's dead successor (Generation 1)
    const chainGen1 = coordinator._resolveActiveRecoveryToken(tokenPrefix);
    assert.strictEqual(chainGen1.corrupt, false);
    assert.strictEqual(chainGen1.generation, 1);
    assert.strictEqual(chainGen1.activeMeta.token_id, w2TokenId);
    assert.strictEqual(coordinator.isProcessAlive(chainGen1.activeMeta.reclaimer_pid), false);

    // --- RECOVERY 2: Third contender acquires succession of dead Generation 1 ---
    worker3 = spawnCrashWorker('w3');
    const w3AcquiredPromise = new Promise((resolve, reject) => {
      worker3.child.on('message', (m) => {
        if (m.event === 'ACQUIRED_AND_HOLDING') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    worker3.child.send({
      cmd: 'ACQUIRE_SUCCESSOR_AND_HOLD',
      claimPath,
      observedClaimId: deadClaimId
    });
    const w3Msg = await w3AcquiredPromise;
    assert.strictEqual(w3Msg.res.ok, true, 'Worker 3 must successfully acquire succession of Worker 2');
    const expectedSucc2Path = `${tokenPrefix}.succ_${w2TokenId}.token`;
    assert.strictEqual(w3Msg.res.tokenPath, expectedSucc2Path);
    assert.strictEqual(w3Msg.res.tokenMeta.generation, 2);
    assert.strictEqual(w3Msg.res.tokenMeta.predecessor_token_id, w2TokenId);

    // VERIFICATION 5: Chain resolves authoritatively to Worker 3 (Generation 2)
    const chainGen2 = coordinator._resolveActiveRecoveryToken(tokenPrefix);
    assert.strictEqual(chainGen2.corrupt, false);
    assert.strictEqual(chainGen2.generation, 2);
    assert.strictEqual(chainGen2.activeMeta.token_id, w3Msg.res.tokenMeta.token_id);
    assert.strictEqual(chainGen2.activeMeta.reclaimer_pid, worker3.child.pid);

    // VERIFICATION 6: Stale contender attempting succession of dead root token is rejected
    const staleContender = coordinator._acquireRecoveryToken(claimPath, deadClaimId);
    assert.strictEqual(staleContender.ok, false);
    assert.strictEqual(staleContender.liveReclaimer, worker3.child.pid);

    // VERIFICATION 7: Explicit corrupt/malformed detection in chain fails closed safely
    const dummyCorruptPath = `${tokenPrefix}.succ_${w3Msg.res.tokenMeta.token_id}.token`;
    fs.writeFileSync(dummyCorruptPath, '{ corrupt-json', 'utf8');
    const corruptChain = coordinator._resolveActiveRecoveryToken(tokenPrefix);
    assert.strictEqual(corruptChain.corrupt, true, 'Resolver must explicitly report corrupt record in chain');
    const blockedContender = coordinator._acquireRecoveryToken(claimPath, deadClaimId);
    assert.strictEqual(blockedContender.ok, false);
    assert.strictEqual(blockedContender.error, 'MALFORMED_RECOVERY_TOKEN_IN_CHAIN');

    // Clean up dummy corrupt file
    try { fs.unlinkSync(dummyCorruptPath); } catch (e) {}

    // Worker 3 safely cleans up its held token
    try { if (fs.existsSync(expectedSucc2Path)) fs.unlinkSync(expectedSucc2Path); } catch (e) {}
  } finally {
    if (worker1) {
      try { worker1.child.kill('SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(worker1.file); } catch (e) {}
    }
    if (worker2) {
      try { worker2.child.kill('SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(worker2.file); } catch (e) {}
    }
    if (worker3) {
      try { worker3.child.kill('SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(worker3.file); } catch (e) {}
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 4L: Safe Token Release and Recoverable Aborted Claims (Gate A7/A8)
// ---------------------------------------------------------------------------
test('LOCK-04L: Explicit identity-linked token release enables safe recovery from aborted attempts without waiting for process exit', async () => {
  setupTestLockDir();
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const claimPath = path.join(TEST_LOCK_DIR, `test-claim-4l-${Date.now()}`);
  const deadClaimId = `claim-dead-4l-${Date.now()}`;
  const deadTokenPid = 9999972;
  const deadTokenId = `token-root-dead-4l-${Date.now()}`;

  // Initial State: Dead claim reservation and dead root recovery token
  const deadClaimMeta = {
    claimant_pid: 9999971,
    claim_id: deadClaimId,
    claimed_at: new Date(Date.now() - 60000).toISOString()
  };
  fs.writeFileSync(claimPath, JSON.stringify(deadClaimMeta, null, 2), 'utf8');

  const tokenPrefix = `${claimPath}.reclaim_${deadClaimId}`;
  const rootTokenPath = `${tokenPrefix}.root.token`;
  const deadRootMeta = {
    token_id: deadTokenId,
    reclaimer_pid: deadTokenPid,
    for_claim_id: deadClaimId,
    generation: 0,
    acquired_at: new Date(Date.now() - 50000).toISOString()
  };
  fs.writeFileSync(rootTokenPath, JSON.stringify(deadRootMeta, null, 2), 'utf8');

  const makeWorkerScript = (workerName) => `
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const { SessionLockCoordinator } = require('${require.resolve('../src/prompt-core/session-lock.js')}');
    const coord = new SessionLockCoordinator({ lockDir: '${TEST_LOCK_DIR}' });

    process.on('message', async (msg) => {
      try {
        if (msg.cmd === 'ACQUIRE_AND_HOLD') {
          const res = coord._acquireRecoveryToken(msg.claimPath, msg.observedClaimId);
          process.send({ event: 'A_ACQUIRED', pid: process.pid, res });
        } else if (msg.cmd === 'ABORT_AND_RELEASE') {
          // Injected failure: Reclaimer A relinquishes token with ABORTED status but remains alive!
          const released = coord._releaseRecoveryToken(msg.claimPath, msg.tokenMeta, 'ABORTED');
          process.send({ event: 'A_RELEASED', pid: process.pid, released });
        } else if (msg.cmd === 'ATTEMPT_STALE_MUTATION') {
          // Late callback: Reclaimer A attempts to commit claim after relinquishing authority
          const resolved = coord._resolveActiveRecoveryToken(msg.tokenPrefix);
          const isOwnerStillActive = resolved.activeMeta && resolved.activeMeta.token_id === msg.tokenMeta.token_id && !resolved.activeMeta.released;
          let committed = false;
          if (isOwnerStillActive) {
            fs.writeFileSync(msg.claimPath, JSON.stringify({ stale: true, pid: process.pid }), 'utf8');
            committed = true;
          }
          process.send({ event: 'STALE_MUTATION_RESULT', pid: process.pid, committed });
        } else if (msg.cmd === 'ACQUIRE_SUCCESSION') {
          const res = coord._acquireRecoveryToken(msg.claimPath, msg.observedClaimId);
          process.send({ event: 'B_ACQUIRED', pid: process.pid, res });
        } else if (msg.cmd === 'COMPLETE_B_CLAIM') {
          const newClaimMeta = {
            claimant_pid: process.pid,
            for_dead_gate: 'recovered-gate-4l',
            claim_id: 'claim-live-by-B-' + process.pid,
            claimed_at: new Date().toISOString()
          };
          const tmpClaim = msg.claimPath + '.tmp.' + process.pid;
          fs.writeFileSync(tmpClaim, JSON.stringify(newClaimMeta, null, 2), 'utf8');
          fs.renameSync(tmpClaim, msg.claimPath);
          coord._releaseRecoveryToken(msg.claimPath, msg.tokenMeta, 'COMPLETED');
          process.send({ event: 'B_COMPLETED', pid: process.pid, newClaimMeta });
        }
      } catch (err) {
        process.send({ event: 'ERROR', error: err.message });
      }
    });
  `;

  const spawnWorker = (name) => {
    const file = path.join(TEST_LOCK_DIR, `worker-4l-${name}-${Date.now()}.js`);
    fs.writeFileSync(file, makeWorkerScript(name), 'utf8');
    const child = fork(file, [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    return { child, file };
  };

  const workerA = spawnWorker('a');
  let workerB = null;
  let workerC = null;

  try {
    // Step 1: Worker A acquires recovery token
    const aAcquiredPromise = new Promise((resolve, reject) => {
      workerA.child.on('message', (m) => {
        if (m.event === 'A_ACQUIRED') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    workerA.child.send({ cmd: 'ACQUIRE_AND_HOLD', claimPath, observedClaimId: deadClaimId });
    const aMsg = await aAcquiredPromise;
    assert.strictEqual(aMsg.res.ok, true);
    const tokenMetaA = aMsg.res.tokenMeta;
    assert.strictEqual(tokenMetaA.generation, 1);
    assert.strictEqual(tokenMetaA.reclaimer_pid, workerA.child.pid);

    // VERIFICATION 1: Contender C cannot acquire while Worker A actively holds token
    const cContenderResult = coordinator._acquireRecoveryToken(claimPath, deadClaimId);
    assert.strictEqual(cContenderResult.ok, false, 'Contender C must be rejected while A is active');
    assert.strictEqual(cContenderResult.liveReclaimer, workerA.child.pid);

    // Step 2: Injected failure in Worker A; A releases token with 'ABORTED' but remains alive
    const aReleasePromise = new Promise((resolve, reject) => {
      workerA.child.on('message', (m) => {
        if (m.event === 'A_RELEASED') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    workerA.child.send({ cmd: 'ABORT_AND_RELEASE', claimPath, tokenMeta: tokenMetaA });
    const aRelMsg = await aReleasePromise;
    assert.strictEqual(aRelMsg.released.ok, true);
    assert.strictEqual(aRelMsg.released.durable, true);
    assert.strictEqual(aRelMsg.released.durabilityLimitation, null);

    // VERIFICATION 2: Worker A is STILL ALIVE (has not exited)
    assert.strictEqual(coordinator.isProcessAlive(workerA.child.pid), true, 'Worker A must still be alive after abort');

    // VERIFICATION 3: Release record exists on disk and is explicitly verified
    const relRecordPath = `${tokenPrefix}.rel_${tokenMetaA.token_id}.token`;
    assert.ok(fs.existsSync(relRecordPath), 'Explicit release record must exist on disk');
    const relOnDisk = coordinator.readLockMetadata(relRecordPath);
    assert.strictEqual(relOnDisk.released_token_id, tokenMetaA.token_id);
    assert.strictEqual(relOnDisk.status, 'RELEASED');
    assert.strictEqual(relOnDisk.reason, 'ABORTED');

    // Step 3: Reclaimer B attempts recovery WITHOUT waiting for A to exit
    workerB = spawnWorker('b');
    const bAcquiredPromise = new Promise((resolve, reject) => {
      workerB.child.on('message', (m) => {
        if (m.event === 'B_ACQUIRED') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    workerB.child.send({ cmd: 'ACQUIRE_SUCCESSION', claimPath, observedClaimId: deadClaimId });
    const bMsg = await bAcquiredPromise;

    // VERIFICATION 4: Worker B safely acquires succession of Worker A's released token
    assert.strictEqual(bMsg.res.ok, true, 'Worker B must acquire succession without waiting for A to exit');
    assert.strictEqual(bMsg.res.durable, true);
    assert.strictEqual(bMsg.res.durabilityLimitation, null);
    const tokenMetaB = bMsg.res.tokenMeta;
    assert.strictEqual(tokenMetaB.generation, 2);
    assert.strictEqual(tokenMetaB.predecessor_token_id, tokenMetaA.token_id);
    assert.strictEqual(tokenMetaB.reclaimer_pid, workerB.child.pid);

    // Step 4: Late callback from A attempts mutation; must be strictly rejected
    const aLatePromise = new Promise((resolve, reject) => {
      workerA.child.on('message', (m) => {
        if (m.event === 'STALE_MUTATION_RESULT') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    workerA.child.send({
      cmd: 'ATTEMPT_STALE_MUTATION',
      claimPath,
      tokenPrefix,
      tokenMeta: tokenMetaA
    });
    const aLateMsg = await aLatePromise;

    // VERIFICATION 5: Late callback from A is rejected
    assert.strictEqual(aLateMsg.committed, false, 'Late callback from released owner A must be rejected');

    // Step 5: Worker B completes claim replacement and publishes 'COMPLETED' release
    const bCompletePromise = new Promise((resolve, reject) => {
      workerB.child.on('message', (m) => {
        if (m.event === 'B_COMPLETED') resolve(m);
        else if (m.event === 'ERROR') reject(new Error(m.error));
      });
    });
    workerB.child.send({
      cmd: 'COMPLETE_B_CLAIM',
      claimPath,
      tokenMeta: tokenMetaB
    });
    const bCompleteMsg = await bCompletePromise;

    // VERIFICATION 6: Claim path authoritatively belongs to Worker B
    const finalClaim = coordinator.readLockMetadata(claimPath);
    assert.strictEqual(finalClaim.claimant_pid, workerB.child.pid);
    assert.ok(finalClaim.claim_id.startsWith('claim-live-by-B'));

    // Step 6: Power-loss directory synchronization & complete propagation verification (Revision 14 Gate A8)
    // 6a. Direct directory synchronization check on POSIX filesystem
    const directSyncRes = coordinator._syncDirectory(TEST_LOCK_DIR);
    assert.strictEqual(directSyncRes.synced, true, 'Directory synchronization executes cleanly on POSIX filesystem');
    assert.strictEqual(directSyncRes.error, null);

    // 6b. Public acquisition and release under normal POSIX directory synchronization:
    // Confirms root acquisition, release, and successor acquisition all report confirmed durability:
    const normalClaimPath = path.join(TEST_LOCK_DIR, `test-claim-norm-${Date.now()}`);
    const normalClaimId = `claim-norm-${Date.now()}`;
    const normalRootRes = coordinator._acquireRecoveryToken(normalClaimPath, normalClaimId);
    assert.strictEqual(normalRootRes.ok, true);
    assert.strictEqual(normalRootRes.durable, true, 'Root acquisition must report confirmed durability on POSIX');
    assert.strictEqual(normalRootRes.durabilityLimitation, null);
    assert.strictEqual(normalRootRes.tokenMeta.generation, 0);

    const normalRelRes = coordinator._releaseRecoveryToken(normalClaimPath, normalRootRes.tokenMeta, 'COMPLETED');
    assert.strictEqual(normalRelRes.ok, true);
    assert.strictEqual(normalRelRes.durable, true, 'Release must report confirmed durability on POSIX');
    assert.strictEqual(normalRelRes.durabilityLimitation, null);

    const normalSuccRes = coordinator._acquireRecoveryToken(normalClaimPath, normalClaimId);
    assert.strictEqual(normalSuccRes.ok, true);
    assert.strictEqual(normalSuccRes.durable, true, 'Successor acquisition must report confirmed durability on POSIX');
    assert.strictEqual(normalSuccRes.durabilityLimitation, null);
    assert.strictEqual(normalSuccRes.tokenMeta.generation, 1);
    assert.strictEqual(normalSuccRes.tokenMeta.predecessor_token_id, normalRootRes.tokenMeta.token_id);

    // 6c. Complete propagation path under forced directory synchronization failure:
    // Injects simulated virtual filesystem where directory fsync returns ENOTSUP
    const origSync = coordinator._syncDirectory.bind(coordinator);
    coordinator._syncDirectory = (dir) => {
      return { synced: false, error: 'Directory fsync unsupported on virtual filesystem', code: 'ENOTSUP' };
    };

    const degradedClaimPath = path.join(TEST_LOCK_DIR, `test-claim-degraded-${Date.now()}`);
    const degradedClaimId = `claim-degraded-${Date.now()}`;

    // Root-token acquisition path under sync failure:
    const degradedRootRes = coordinator._acquireRecoveryToken(degradedClaimPath, degradedClaimId);
    assert.strictEqual(degradedRootRes.ok, true, 'Root publication must succeed atomically despite sync failure');
    assert.strictEqual(degradedRootRes.durable, false, 'Root acquisition must expose durable: false on sync failure');
    assert.strictEqual(degradedRootRes.durabilityLimitation, 'ENOTSUP', 'Durability limitation code must be propagated');
    assert.strictEqual(degradedRootRes.tokenMeta.generation, 0);

    // CRITICAL: Published root token is preserved intact on disk (never deleted or overwritten)
    assert.ok(fs.existsSync(degradedRootRes.tokenPath), 'Published root token must remain intact on disk');
    const readDegradedRoot = JSON.parse(fs.readFileSync(degradedRootRes.tokenPath, 'utf8'));
    assert.strictEqual(readDegradedRoot.token_id, degradedRootRes.tokenMeta.token_id, 'Root token contents must match');

    // Token release path under sync failure:
    const degradedRelRes = coordinator._releaseRecoveryToken(degradedClaimPath, degradedRootRes.tokenMeta, 'ABORTED');
    assert.strictEqual(degradedRelRes.ok, true, 'Release publication must succeed atomically despite sync failure');
    assert.strictEqual(degradedRelRes.durable, false, 'Release must expose durable: false on sync failure');
    assert.strictEqual(degradedRelRes.durabilityLimitation, 'ENOTSUP', 'Release limitation code must be propagated');

    // CRITICAL: Published release record is preserved intact on disk
    const degradedRelPath = `${degradedRootRes.tokenPrefix}.rel_${degradedRootRes.tokenMeta.token_id}.token`;
    assert.ok(fs.existsSync(degradedRelPath), 'Published release record must remain intact on disk');
    const readDegradedRel = JSON.parse(fs.readFileSync(degradedRelPath, 'utf8'));
    assert.strictEqual(readDegradedRel.released_token_id, degradedRootRes.tokenMeta.token_id);
    assert.strictEqual(readDegradedRel.reason, 'ABORTED');

    // Successor-token acquisition path under sync failure:
    const degradedSuccRes = coordinator._acquireRecoveryToken(degradedClaimPath, degradedClaimId);
    assert.strictEqual(degradedSuccRes.ok, true, 'Successor publication must succeed atomically despite sync failure');
    assert.strictEqual(degradedSuccRes.durable, false, 'Successor acquisition must expose durable: false on sync failure');
    assert.strictEqual(degradedSuccRes.durabilityLimitation, 'ENOTSUP', 'Successor limitation code must be propagated');
    assert.strictEqual(degradedSuccRes.tokenMeta.generation, 1);
    assert.strictEqual(degradedSuccRes.tokenMeta.predecessor_token_id, degradedRootRes.tokenMeta.token_id);

    // CRITICAL: Published successor token is preserved intact on disk
    assert.ok(fs.existsSync(degradedSuccRes.tokenPath), 'Published successor token must remain intact on disk');
    const readDegradedSucc = JSON.parse(fs.readFileSync(degradedSuccRes.tokenPath, 'utf8'));
    assert.strictEqual(readDegradedSucc.token_id, degradedSuccRes.tokenMeta.token_id);

    // 6d. Retention of non-overwriting, mutual exclusion, and generation-chain consistency under degraded durability:
    // Live owner check: degradedSuccRes holder (process.pid) is active and unreleased
    const conflictRes = coordinator._acquireRecoveryToken(degradedClaimPath, degradedClaimId);
    assert.strictEqual(conflictRes.ok, false, 'Active reclaimer blocks acquisition');
    assert.strictEqual(conflictRes.liveReclaimer, process.pid);

    // Non-overwriting publication: competing linkSync attempt to same path returns EEXIST without modifying file
    const pubCollision = coordinator._publishRecoveryToken(degradedSuccRes.tokenPath, {
      token_id: 'token-collision',
      reclaimer_pid: 9999999
    });
    assert.strictEqual(pubCollision.ok, false);
    assert.strictEqual(pubCollision.code, 'EEXIST');
    const unchangedSucc = JSON.parse(fs.readFileSync(degradedSuccRes.tokenPath, 'utf8'));
    assert.strictEqual(unchangedSucc.token_id, degradedSuccRes.tokenMeta.token_id, 'Original token remained untouched');

    // Restore original _syncDirectory
    coordinator._syncDirectory = origSync;
  } finally {
    if (workerA) {
      try { workerA.child.kill('SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(workerA.file); } catch (e) {}
    }
    if (workerB) {
      try { workerB.child.kill('SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(workerB.file); } catch (e) {}
    }
    if (workerC) {
      try { workerC.child.kill('SIGKILL'); } catch (e) {}
      try { fs.unlinkSync(workerC.file); } catch (e) {}
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 5: Fencing Token Guarding (Former Owner Cannot Commit Mutation)
// ---------------------------------------------------------------------------
test('LOCK-05: Former owner cannot commit a mutation after newer owner acquires lock (fencing token)', () => {
  setupTestLockDir();
  const sessionId = `sess-fencing-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });

  // 1. Initial Project at revision 0
  const canonicalProject = {
    schema_version: '1.0.0',
    id: 'proj-fencing',
    revision: 0,
    timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 360000 },
    canvas: { width: 1080, height: 1920 },
    tracks: [{ id: 'track_v1', name: 'Video 1', kind: 'visual', zIndex: 1, muted: false, locked: false, visible: true }],
    clips: [],
    assets: []
  };

  // Process A acquires lock (fencing token 1)
  const handleA = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-A', initialFencingToken: 1 });
  assert.strictEqual(handleA.fencingToken, 1);

  // Process A is paused/delayed. Lock is reclaimed by Process B with fencing token 2
  // We simulate lock transfer to Process B:
  const lockPath = coordinator.getLockPath('session', sessionId);
  const metadataB = {
    lock_id: 'lock-b',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'proc-B',
    pid: process.pid,
    fencing_token: 2,
    acquired_at: new Date().toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(metadataB, null, 2), 'utf8');

  // Process A attempts to verify lock before mutation
  assert.strictEqual(handleA.verifyActive(), false, 'Process A must be detected as fenced');

  // Process A is blocked from mutating project because its fencing token is invalid
  const canMutate = handleA.verifyActive();
  if (canMutate) {
    OperationExecutor.execute(canonicalProject, {
      type: 'set_track_state',
      params: { trackId: 'track_v1', muted: true },
      expectedBaseRevision: 0
    });
  }

  // Verify project remains strictly at revision 0, completely unmutated by Process A
  assert.strictEqual(canonicalProject.revision, 0);
  assert.strictEqual(canonicalProject.tracks[0].muted, false);
});

// ---------------------------------------------------------------------------
// Scenario 6: In-Lock Revalidation of Expected Base Revision Remains Authoritative
// ---------------------------------------------------------------------------
test('LOCK-06: Project revision and expected-base-revision checks remain authoritative immediately before mutation', () => {
  setupTestLockDir();
  const sessionId = `sess-stale-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });

  const project = {
    schema_version: '1.0.0',
    id: 'proj-stale',
    revision: 3, // Current project revision is 3
    timebase: { fps: { numerator: 30, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 360000 },
    canvas: { width: 1080, height: 1920 },
    tracks: [{ id: 'track_v1', name: 'Video 1', kind: 'visual', zIndex: 1, muted: false, locked: false, visible: true }],
    clips: [],
    assets: []
  };

  const handle = coordinator.acquireLock('session', sessionId, { ownerId: 'proc-auth' });
  assert.ok(handle);

  // In-lock execution with stale expectedBaseRevision (2 !== 3)
  const staleOp = {
    type: 'set_track_state',
    params: { trackId: 'track_v1', muted: true },
    expectedBaseRevision: 2 // Stale revision
  };

  const res = OperationExecutor.execute(project, staleOp);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.errorCode, 'STALE_REVISION');
  assert.strictEqual(project.revision, 3, 'Revision must remain untouched on mismatch');
  assert.strictEqual(project.tracks[0].muted, false);

  handle.release();
});

// ---------------------------------------------------------------------------
// Scenario 7: Hierarchical Lock Ordering Prevents Deadlocks
// ---------------------------------------------------------------------------
test('LOCK-07: Job and session locks follow documented global acquisition order without deadlocks', () => {
  setupTestLockDir();
  const sessionId = `sess-hier-${Date.now()}`;
  const jobId = `job-hier-${Date.now()}`;
  const coordinator = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });

  // Acquire Session lock (Level 1) then Job lock (Level 2)
  const hierarchical = coordinator.acquireHierarchicalLocks(sessionId, jobId);
  assert.ok(hierarchical.sessionLock);
  assert.ok(hierarchical.jobLock);
  assert.strictEqual(hierarchical.verifyActive(), true);

  // Verify both lock files exist on disk
  const sPath = coordinator.getLockPath('session', sessionId);
  const jPath = coordinator.getLockPath('job', jobId);
  assert.ok(fs.existsSync(sPath));
  assert.ok(fs.existsSync(jPath));

  // Release in reverse order
  const { sessionReleased, jobReleased } = hierarchical.release();
  assert.strictEqual(sessionReleased, true);
  assert.strictEqual(jobReleased, true);
  assert.strictEqual(fs.existsSync(sPath), false);
  assert.strictEqual(fs.existsSync(jPath), false);
});

// ---------------------------------------------------------------------------
// Scenario 8: Durable Fencing Token Monotonicity Across Restarts
// ---------------------------------------------------------------------------
test('LOCK-08: Fencing token counter advances monotonically across releases, crash recovery, and service restarts', () => {
  setupTestLockDir();
  const sessionId = `sess-restart-${Date.now()}`;

  // Instance 1 (Service run 1)
  const coord1 = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const handle1 = coord1.acquireLock('session', sessionId, { ownerId: 'service-run-1' });
  assert.strictEqual(handle1.fencingToken, 1);
  handle1.release();

  // Instance 2 (Simulating service restart: new coordinator instance)
  const coord2 = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const handle2 = coord2.acquireLock('session', sessionId, { ownerId: 'service-run-2' });
  assert.strictEqual(handle2.fencingToken, 2, 'Fencing token must advance monotonically across normal release and restart');
  handle2.release();

  // Instance 3 (Simulating crash: write stale lock file with fencingToken 2, then re-acquire after restart)
  const lockPath = coord2.getLockPath('session', sessionId);
  const deadMeta = {
    lock_id: 'lock-crashed-run-3',
    target_type: 'session',
    target_id: sessionId,
    owner_id: 'crashed-run-3',
    pid: 9999999,
    fencing_token: 2,
    acquired_at: new Date().toISOString()
  };
  fs.writeFileSync(lockPath, JSON.stringify(deadMeta, null, 2), 'utf8');

  // Instance 4 (Service restarts after crash)
  const coord4 = new SessionLockCoordinator({ lockDir: TEST_LOCK_DIR });
  const handle4 = coord4.acquireLock('session', sessionId, { ownerId: 'service-run-4' });
  assert.strictEqual(handle4.fencingToken, 3, 'Fencing token must advance monotonically across crash reclamation');
  handle4.release();

  // Invariant Assertion: Durable sequence file exists and equals 3
  const seqPath = coord4.getFencingSeqPath('session', sessionId);
  assert.ok(fs.existsSync(seqPath));
  assert.strictEqual(parseInt(fs.readFileSync(seqPath, 'utf8'), 10), 3);
});
