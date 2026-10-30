#!/usr/bin/env node
// CLI client for IDE agents that can run tools but cannot register another MCP server.
// Sends real JSON-RPC to the production Studio stdio entry point; never approves edits.
const { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  path = require("node:path");
const name = process.argv[2],
  args = process.argv[3]
    ? JSON.parse(fs.readFileSync(process.argv[3], "utf8"))
    : {};
if (
  ![
    "eme_studio_get_inbox",
    "eme_studio_get_scene",
    "eme_studio_propose_title",
    "eme_studio_submit_plan",
    "eme_studio_reply",
  ].includes(name)
)
  throw Error("Use a Studio inbox, proposal, or reply tool.");
const child = spawn(
  process.execPath,
  [path.resolve(__dirname, "../bin/eme-studio-mcp.js")],
  { stdio: ["pipe", "pipe", "inherit"] },
);
let buffer = "";
const timer = setTimeout(() => {
  child.kill();
  process.exitCode = 1;
  console.error("Studio MCP timed out");
}, 35000);
child.stdout.on("data", (data) => {
  buffer += data;
  let end;
  while ((end = buffer.indexOf("\n")) >= 0) {
    const raw = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (!raw) continue;
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name, arguments: args },
        }) + "\n",
      );
    } else if (msg.id === 2) {
      clearTimeout(timer);
      if (msg.error) {
        console.error(JSON.stringify(msg.error));
        process.exitCode = 1;
      } else console.log(msg.result.content[0].text);
      child.stdin.end();
    }
  }
});
child.stdin.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "eme-studio-cli", version: "1.0.0" },
    },
  }) + "\n",
);
child.once("exit", (code) => {
  clearTimeout(timer);
  if (code) process.exitCode = code;
});
