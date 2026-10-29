import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Import CommonJS module via createRequire
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  VtsmWorkerClient,
  VtsmError,
  VtsmAuthorizationError,
  VtsmTimeoutError,
  VtsmBackpressureError,
  VtsmProtocolError
} = require('../src/engine/vtsm-worker-client.js');

test('VTSM-04 Stage 1: Worker Subprocess Client & Protocol Invariants', async (t) => {
  await t.test('1. Prerequisites validation detects existing python and worker', () => {
    const client = new VtsmWorkerClient();
    const prereq = client.checkPrerequisites();
    assert.equal(prereq.ok, true, `Prerequisites must be met: ${prereq.reason}`);
  });

  await t.test('2. Authorization boundary rejects paths outside authorized roots', () => {
    const client = new VtsmWorkerClient();
    
    // Valid repo path
    const validPath = path.join(ROOT, 'experiments/visual-temporal-state/held_out_fixtures/held_out_test_b_reappearance.mp4');
    assert.doesNotThrow(() => {
      client.assertAuthorizedPath(validPath);
    });

    // Valid tmp path
    const validTmp = '/tmp/vtsm_test_output.json';
    assert.doesNotThrow(() => {
      client.assertAuthorizedPath(validTmp);
    });

    // Unauthorized external path
    assert.throws(() => {
      client.assertAuthorizedPath('/etc/shadow');
    }, VtsmAuthorizationError);

    assert.throws(() => {
      client.assertAuthorizedPath('/var/root/secret.mp4');
    }, VtsmAuthorizationError);

    // Empty or non-string
    assert.throws(() => {
      client.assertAuthorizedPath('');
    }, VtsmAuthorizationError);
  });

  await t.test('3. Backpressure limit rejects commands when queue depth exceeded', async () => {
    const client = new VtsmWorkerClient({ maxQueueDepth: 2 });
    // Manually mark as running with a dummy process to test queue
    client.isRunning = true;
    client.process = { stdin: { write: () => {} } };

    // Fill queue to capacity
    const p1 = client._sendCommand({ command: 'test1' }, 1000).catch(() => {});
    const p2 = client._sendCommand({ command: 'test2' }, 1000).catch(() => {});
    const p3 = client._sendCommand({ command: 'test3' }, 1000).catch(() => {});

    // 3rd command exceeds maxQueueDepth of 2
    await assert.rejects(async () => {
      await client._sendCommand({ command: 'test4' }, 1000);
    }, VtsmBackpressureError);

    // Clean up timers
    client.pendingCommands.forEach(cmd => clearTimeout(cmd.timer));
    client.pendingCommands = [];
    client.currentCommand = null;
    client.isRunning = false;
  });

  await t.test('4. Session isolation and status tracking', () => {
    const client = new VtsmWorkerClient();
    const s1 = 'session-1-alpha';
    const s2 = 'session-2-beta';

    client.activeSessions.set(s1, {
      sessionId: s1,
      projectId: 'project-a',
      status: 'tracking'
    });

    client.activeSessions.set(s2, {
      sessionId: s2,
      projectId: 'project-b',
      status: 'tracking'
    });

    assert.equal(client.getSession(s1).projectId, 'project-a');
    assert.equal(client.getSession(s2).projectId, 'project-b');

    // Cancel session 1
    const cancelRes = client.cancelSession(s1);
    assert.equal(cancelRes.status, 'canceled');
    assert.equal(client.getSession(s1).status, 'canceled');
    assert.equal(client.getSession(s2).status, 'tracking', 'Canceling session 1 must not affect session 2');
  });

  await t.test('5. Read-only invariant: eme-project.v1.schema.json remains completely unmodified', () => {
    const projectSchemaPath = path.join(ROOT, 'schema', 'eme-project.v1.schema.json');
    assert.ok(fs.existsSync(projectSchemaPath));
    const schemaContent = fs.readFileSync(projectSchemaPath, 'utf8');
    const parsed = JSON.parse(schemaContent);

    // Verify no transient tracking properties polluted the core project schema
    assert.equal(parsed.properties.tracking, undefined, 'Project schema must not contain tracking property');
    assert.equal(parsed.properties.vtsm, undefined, 'Project schema must not contain vtsm property');
    assert.equal(parsed.title, 'EditingMechanicsEngineProject', 'Project schema title unchanged');
  });

  await t.test('6. Live Subprocess Integration: start, ping healthcheck, and graceful stop', async () => {
    const client = new VtsmWorkerClient();
    
    // Start real Python worker daemon
    const startRes = await client.start();
    assert.equal(startRes.status, 'ready');
    assert.ok(client.deviceInfo, 'Device info must be reported');
    assert.ok(['mps', 'cpu'].includes(client.deviceInfo), `Device must be mps or cpu, got ${client.deviceInfo}`);

    // Ping check
    const pong = await client.ping(5000);
    assert.equal(pong.status, 'pong');
    assert.equal(pong.device, client.deviceInfo);

    // Graceful stop
    const stopRes = await client.stop(5000);
    assert.equal(stopRes.status, 'stopped');
    assert.equal(client.isRunning, false);
  });
});
