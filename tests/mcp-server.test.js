const test = require('node:test');
const assert = require('node:assert/strict');
const { EmeMcpServer, TOOL_DEFINITIONS } = require('../src/mcp/server.js');

test('EmeMcpServer - Initialize and list tools', async () => {
  const initRes = await EmeMcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {}
  });
  assert.equal(initRes.result.serverInfo.name, 'eme-mcp-server');

  const listRes = await EmeMcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
  assert.equal(listRes.result.tools.length, TOOL_DEFINITIONS.length);
  assert.ok(listRes.result.tools.some(t => t.name === 'eme_create_project'));
  assert.ok(listRes.result.tools.some(t => t.name === 'eme_execute_operation'));
});

test('EmeMcpServer - Project creation without trusted approval fails closed', async () => {
  const callRes = await EmeMcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'eme_create_project',
      arguments: {
        title: 'MCP Project',
        width: 1080,
        height: 1920,
        fps: { numerator: 60, denominator: 1 },
        durationTicks: 360000
      }
    }
  });

  assert.ok(callRes.result);
  const data = JSON.parse(callRes.result.content[0].text);
  assert.equal(data.success, false);
  assert.equal(data.error.code, 'ERR_UNTRUSTED_APPROVAL');
  assert.equal(data.committedSteps, 0);
});
