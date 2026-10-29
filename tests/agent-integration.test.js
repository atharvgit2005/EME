const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EmeMcpServer, TOOL_DEFINITIONS } = require('../src/mcp/server.js');
const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');

test('MCP Protocol - initialize and discover all catalog tools', async () => {
  const initRes = await EmeMcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {}
  });
  assert.equal(initRes.result.serverInfo.name, 'eme-mcp-server');
  assert.equal(initRes.result.serverInfo.version, '0.1.0');

  const listRes = await EmeMcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
  const tools = listRes.result.tools;
  assert.ok(tools.length >= 7, 'Server must expose all production and inspection tools');

  const toolNames = tools.map(t => t.name);
  assert.ok(toolNames.includes('eme_create_project'));
  assert.ok(toolNames.includes('eme_execute_operation'));
  assert.ok(toolNames.includes('eme_validate_project'));
  assert.ok(toolNames.includes('eme_compile_composition'));
  assert.ok(toolNames.includes('eme_render_video'));
  assert.ok(toolNames.includes('eme_inspect_frame'));
  assert.ok(toolNames.includes('eme_inspect_project'));
  assert.ok(toolNames.includes('eme_query_capabilities'));
  assert.ok(toolNames.includes('eme_inspect_metadata'));
});

test('MCP Tool - Real argument validation and structured errors', async () => {
  // Missing operation argument
  const errRes = await EmeMcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'eme_execute_operation',
      arguments: {
        project: {},
        operation: null
      }
    }
  });
  assert.ok(errRes.error || (errRes.result && !JSON.parse(errRes.result.content[0].text).success));

  // Invalid operation type
  const badOpRes = await EmeMcpServer.handleToolCall('eme_execute_operation', {
    project: { revision: 0 },
    operation: { type: 'non_existent_op', params: {} }
  });
  assert.equal(badOpRes.success, false);
  assert.equal(badOpRes.errorCode, 'UNSUPPORTED_OPERATION');
});

test('MCP Security - Path traversal policy enforcement', async () => {
  assert.rejects(
    async () => {
      await EmeMcpServer.handleToolCall('eme_render_video', {
        project: {},
        outputMp4Path: '/etc/evil_output.mp4'
      });
    },
    /Security policy violation/
  );
});

test('MCP Capabilities - Query renderer capabilities and rejection', async () => {
  const caps = await EmeMcpServer.handleToolCall('eme_query_capabilities', {});
  assert.ok(Array.isArray(caps.blendModes));
  assert.ok(caps.blendModes.includes('difference'));
  assert.ok(caps.mediaTypes.includes('text'));
  assert.ok(caps.mediaTypes.includes('video'));
});

test('MCP Inspect Project - Inspect existing benchmark project summary', async () => {
  const benchAPath = path.resolve(__dirname, '../examples/benchmark-a-motion-graphics.json');
  const summary = await EmeMcpServer.handleToolCall('eme_inspect_project', {
    projectPath: benchAPath
  });

  assert.equal(summary.title, 'Benchmark A - Reference-Driven Kinetic Typography & Transitions');
  assert.equal(summary.width, 1080);
  assert.equal(summary.height, 1920);
  assert.ok(summary.clipsCount >= 5);
  assert.equal(summary.validation.valid, true);
});

test('MCP Atomicity - Failed operation preserves revision and state untouched', async () => {
  const initRes = await EmeMcpServer.handleToolCall('eme_create_project', {
    title: 'Atomicity Test',
    width: 1080,
    height: 1920,
    fps: { numerator: 60, denominator: 1 }
  });
  const proj = initRes.project;
  const originalRevision = proj.revision;

  // Deliberately conflicting insert_clip without track
  const failRes = await EmeMcpServer.handleToolCall('eme_execute_operation', {
    project: proj,
    operation: {
      type: 'insert_clip',
      params: {
        id: 'clip-orphan',
        trackId: 'track-non-existent',
        type: 'text',
        startTick: 0,
        durationTicks: 60000
      }
    }
  });

  assert.equal(failRes.success, false);
  assert.equal(proj.revision, originalRevision, 'Original project revision must remain completely untouched on failure');
});
