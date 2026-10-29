#!/usr/bin/env node

/**
 * Editing Mechanics Engine (EME) - Model Context Protocol (MCP) Server Entry Point
 */

const { EmeMcpServer } = require('../src/mcp/server.js');

if (require.main === module) {
  EmeMcpServer.startStdio();
}

module.exports = { EmeMcpServer };
