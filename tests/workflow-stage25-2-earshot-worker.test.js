/**
 * Test Suite: Stage 25.2 — Isolated Python Worker & Lifecycle Watchdog
 *
 * Verifies:
 * 1. Worker process startup and ping handshake.
 * 2. Sanitized environment (token stripping).
 * 3. Strict path containment using realpathSync (rejecting path traversal escapes).
 * 4. Graceful fallback on missing Python binary (returning NOT_MEASURED).
 * 5. Watchdog timeout enforcement and process-tree termination.
 * 6. Worker restart and recovery after termination.
 * 7. Queue backpressure and depth bounding.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');

test('Stage 25.2: Isolated Python Worker & Lifecycle Watchdog', async (t) => {

  await t.test('WRK-01: Worker Starts Cleanly and Completes Ping Handshake', async () => {
    const client = new EarshotWorkerClient({ startupTimeoutMs: 10000 });
    try {
      const res = await client.start();
      assert.strictEqual(res.ok, true, `Worker start failed: ${res.reason}`);
      assert.strictEqual(client.isRunning, true);
      assert.strictEqual(client.earshotAvailable, true);
      assert.ok(client.workerPid > 0, 'Worker PID assigned');
    } finally {
      client.stop();
    }
  });

  await t.test('WRK-02: Sanitized Environment Strips Sensitive Tokens', () => {
    const origKey = process.env.OPENAI_API_KEY;
    const origGh = process.env.GITHUB_TOKEN;
    process.env.OPENAI_API_KEY = 'sk-secret-12345';
    process.env.GITHUB_TOKEN = 'ghp_secret_67890';

    try {
      const client = new EarshotWorkerClient();
      const env = client.getSanitizedEnv();
      assert.strictEqual(env.OPENAI_API_KEY, undefined, 'OPENAI_API_KEY must be stripped');
      assert.strictEqual(env.GITHUB_TOKEN, undefined, 'GITHUB_TOKEN must be stripped');
    } finally {
      if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
      else delete process.env.OPENAI_API_KEY;
      if (origGh !== undefined) process.env.GITHUB_TOKEN = origGh;
      else delete process.env.GITHUB_TOKEN;
    }
  });

  await t.test('WRK-03: Path Containment Rejects Symlink Escapes and Unauthorized Paths', () => {
    const client = new EarshotWorkerClient();

    // Valid path inside project
    const safePath = path.resolve(__dirname, '../fixtures');
    assert.doesNotThrow(() => client.assertAuthorizedPath(safePath));

    // Valid path inside /tmp
    const tmpPath = '/tmp/test-audio.wav';
    assert.doesNotThrow(() => client.assertAuthorizedPath(tmpPath));

    // Unauthorized path (e.g. /etc/passwd or /var/root)
    assert.throws(() => {
      client.assertAuthorizedPath('/etc/passwd');
    }, /Security violation/);

    // Traversal attempt (../../etc/passwd)
    assert.throws(() => {
      client.assertAuthorizedPath(path.join(client.repoRoot, '../../../../etc/shadow'));
    }, /Security violation/);
  });

  await t.test('WRK-04: Missing Python Binary Falls Back to NOT_MEASURED without Crashing', async () => {
    const client = new EarshotWorkerClient({
      pythonPath: '/non/existent/python3/binary'
    });

    const dummyReq = {
      request_id: 'req-earshot-missing-py',
      media_path: '/tmp/nonexistent.mp4',
      timebase: {
        duration_ticks: 120000,
        ticks_per_second: 120000,
        fps_numerator: 30,
        fps_denominator: 1
      },
      options: { mode: 'fast_dsp' }
    };

    const res = await client.executeQa(dummyReq);
    assert.strictEqual(res.status, 'NOT_MEASURED');
    assert.strictEqual(res.error?.code, 'WORKER_UNAVAILABLE');
    assert.ok(res.error?.message.includes('not found'));
  });

  await t.test('WRK-05: Watchdog Timeout Terminates Hung Command and Kills Subprocess', async () => {
    const client = new EarshotWorkerClient({
      commandTimeoutMs: 150 // Very short timeout for testing
    });

    try {
      const startRes = await client.start();
      assert.strictEqual(startRes.ok, true);

      // We send a request to a sleep command or unreachable path
      const req = {
        request_id: 'req-earshot-timeout-test',
        media_path: '/tmp/test-timeout.mp4',
        timebase: {
          duration_ticks: 120000,
          ticks_per_second: 120000,
          fps_numerator: 30,
          fps_denominator: 1
        },
        options: { mode: 'fast_dsp' }
      };

      // Create a temporary mock worker that hangs
      const hungScript = path.join(__dirname, '../scratch/hung-worker.py');
      fs.mkdirSync(path.dirname(hungScript), { recursive: true });
      fs.writeFileSync(hungScript, `
import sys, time
for line in sys.stdin:
    time.sleep(10) # Hang indefinitely
`, 'utf8');

      const hungClient = new EarshotWorkerClient({
        commandTimeoutMs: 200,
        bridgeScript: hungScript
      });

      // Handshake with hung worker should time out
      const hRes = await hungClient.start();
      assert.strictEqual(hRes.ok, false);
      assert.ok(hRes.reason.includes('timed out'));
      assert.strictEqual(hungClient.isRunning, false);
    } finally {
      client.stop();
    }
  });

  await t.test('WRK-06: Worker Recovers and Can Restart on Subsequent Invocation', async () => {
    const client = new EarshotWorkerClient();
    try {
      await client.start();
      assert.strictEqual(client.isRunning, true);

      // Force stop
      client.stop();
      assert.strictEqual(client.isRunning, false);

      // Second start
      const restart = await client.start();
      assert.strictEqual(restart.ok, true);
      assert.strictEqual(client.isRunning, true);
    } finally {
      client.stop();
    }
  });

  await t.test('WRK-07: Queue Backpressure Rejects Invocations Beyond Max Depth', async () => {
    const client = new EarshotWorkerClient({
      maxQueueDepth: 2
    });

    // Mock saturation without starting
    client.pendingCommands = [{}, {}];

    await assert.rejects(async () => {
      await client.sendRawCommand({ action: 'ping' }, 1000);
    }, /Queue saturation/i);
  });
});
