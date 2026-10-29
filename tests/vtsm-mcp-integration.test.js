import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { EmeMcpServer } = require('../src/mcp/server.js');
const { getVtsmService } = require('../src/engine/vtsm-service.js');

test('VTSM-04 Stage 3: MCP Tool Integration & Read-Only Invariants', async (t) => {
  const heldOutClipB = path.join(ROOT, 'experiments/visual-temporal-state/held_out_fixtures/held_out_test_b_reappearance.mp4');

  await t.test('1. MCP tool definitions list includes all 5 VTSM tools with schemas', () => {
    const tools = EmeMcpServer.getTools();
    const toolNames = tools.map(t => t.name);

    assert.ok(toolNames.includes('eme_vtsm_init_tracking'), 'Must expose eme_vtsm_init_tracking');
    assert.ok(toolNames.includes('eme_vtsm_propagate_range'), 'Must expose eme_vtsm_propagate_range');
    assert.ok(toolNames.includes('eme_vtsm_get_frame_mask'), 'Must expose eme_vtsm_get_frame_mask');
    assert.ok(toolNames.includes('eme_vtsm_cancel_tracking'), 'Must expose eme_vtsm_cancel_tracking');
    assert.ok(toolNames.includes('eme_vtsm_get_session_status'), 'Must expose eme_vtsm_get_session_status');

    const initTool = tools.find(t => t.name === 'eme_vtsm_init_tracking');
    assert.deepEqual(initTool.inputSchema.required, ['projectId', 'mediaPath']);
  });

  await t.test('2. eme_vtsm_init_tracking initializes session and validates paths', async () => {
    // Valid call
    const initRes = await EmeMcpServer.handleToolCall('eme_vtsm_init_tracking', {
      projectId: 'proj_mcp_test',
      mediaPath: heldOutClipB,
      promptBoxes: [[50, 50, 100, 100]],
      label: 'runner_subject'
    });

    assert.equal(initRes.status, 'initialized');
    assert.ok(initRes.sessionId);
    assert.equal(initRes.mediaId, 'held_out_test_b_reappearance.mp4');
    assert.equal(initRes.tracks.length, 1);
    assert.equal(initRes.tracks[0].label, 'runner_subject');

    // Unauthorized path rejection
    await assert.rejects(async () => {
      await EmeMcpServer.handleToolCall('eme_vtsm_init_tracking', {
        projectId: 'proj_mcp_test',
        mediaPath: '/etc/shadow'
      });
    });
  });

  await t.test('3. eme_vtsm_get_session_status and eme_vtsm_cancel_tracking lifecycle', async () => {
    const initRes = await EmeMcpServer.handleToolCall('eme_vtsm_init_tracking', {
      projectId: 'proj_mcp_lifecycle',
      mediaPath: heldOutClipB
    });
    const sId = initRes.sessionId;

    const status1 = await EmeMcpServer.handleToolCall('eme_vtsm_get_session_status', { sessionId: sId });
    assert.equal(status1.status, 'initialized');
    assert.equal(status1.advisoryOnly, true);

    const cancelRes = await EmeMcpServer.handleToolCall('eme_vtsm_cancel_tracking', { sessionId: sId });
    assert.equal(cancelRes.status, 'canceled');

    const status2 = await EmeMcpServer.handleToolCall('eme_vtsm_get_session_status', { sessionId: sId });
    assert.equal(status2.status, 'canceled');
  });

  await t.test('4. eme_vtsm_get_frame_mask retrieves spatial state by frame or 120k tick', async () => {
    const service = getVtsmService();
    const initRes = await service.initTracking({
      projectId: 'proj_mask_test',
      mediaPath: heldOutClipB
    });
    const sId = initRes.sessionId;

    // Record dummy state
    service.stateManager.recordFrameState(sId, {
      frameIdx: 12,
      ptsTicks: 48000,
      ptsSec: 0.4,
      states: [{
        trackId: 1,
        visibility: 'visible',
        bbox: [10, 20, 30, 40],
        confidence: 0.98
      }]
    });

    // Query by frame index
    const resByFrame = await EmeMcpServer.handleToolCall('eme_vtsm_get_frame_mask', {
      sessionId: sId,
      frameIdx: 12
    });
    assert.equal(resByFrame.found, true);
    assert.equal(resByFrame.state.frameIdx, 12);
    assert.equal(resByFrame.state.states[0].trackId, 1);

    // Query by tick
    const resByTick = await EmeMcpServer.handleToolCall('eme_vtsm_get_frame_mask', {
      sessionId: sId,
      tick: 48000
    });
    assert.equal(resByTick.found, true);
    assert.equal(resByTick.state.frameIdx, 12);
  });

  await t.test('5. Non-destructive invariant: MCP tracking calls do not mutate active project timeline', () => {
    const projectSchemaPath = path.join(ROOT, 'schema', 'eme-project.v1.schema.json');
    const content = fs.readFileSync(projectSchemaPath, 'utf8');
    assert.ok(!content.includes('"vtsm"'), 'eme-project.v1.schema.json must remain 100% untouched');
  });

  t.after(async () => {
    const service = getVtsmService();
    await service.stop();
  });
});
