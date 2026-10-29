const fs = require("node:fs"),
  path = require("node:path");
const { EmeMcpServer, TOOL_DEFINITIONS } = require("../mcp/server.js");
const definitions = [
  {
    name: "eme_studio_get_inbox",
    description:
      "Read queued editing requests, the actual project, imported media, and editing constraints from local Studio. Read before planning. Never authorizes edits.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "eme_studio_submit_plan",
    description:
      "Submit exact operations for a queued Studio request. Creates a review proposal only; cannot authorize or execute edits.",
    inputSchema: {
      type: "object",
      required: ["requestId", "baseRevision", "summary", "operations"],
      properties: {
        requestId: { type: "string" },
        baseRevision: { type: "integer" },
        summary: { type: "string" },
        operations: {
          type: "array",
          items: {
            type: "object",
            required: ["type", "params"],
            properties: {
              type: { type: "string" },
              params: { type: "object" },
            },
          },
        },
      },
    },
  },
  {
    name: "eme_studio_reply",
    description:
      "Ask a clarifying question or explain an unsupported request, without changing the project.",
    inputSchema: {
      type: "object",
      required: ["requestId", "message"],
      properties: {
        requestId: { type: "string" },
        message: { type: "string" },
      },
    },
  },
];
class StudioMcpServer extends EmeMcpServer {
  static async handleToolCall(name, args = {}) {
    if (!definitions.some((t) => t.name === name))
      return super.handleToolCall(name, args);
    const root =
      process.env.EME_STUDIO_ROOT ||
      path.resolve(__dirname, "../../.eme/studio");
    let connection;
    try {
      connection = JSON.parse(
        fs.readFileSync(path.join(root, "connection.json")),
      );
    } catch {
      throw Error(
        "Start EME Studio with npm start before connecting the IDE agent.",
      );
    }
    const url = new URL(connection.url);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
      throw Error("Studio must be a local loopback service.");
    const route =
      name === "eme_studio_get_inbox"
        ? "context"
        : name === "eme_studio_submit_plan"
          ? "plan"
          : "reply";
    const response = await fetch(new URL("/api/agent/" + route, url), {
      method: route === "context" ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + connection.token,
        "Content-Type": "application/json",
      },
      body: route === "context" ? undefined : JSON.stringify(args),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Studio request failed");
    return result;
  }
  static async handleJsonRpc(req) {
    if (
      req?.jsonrpc === "2.0" &&
      req.id !== undefined &&
      req.method === "tools/list"
    )
      return {
        jsonrpc: "2.0",
        id: req.id,
        result: { tools: [...TOOL_DEFINITIONS, ...definitions] },
      };
    return super.handleJsonRpc(req);
  }
}
module.exports = { StudioMcpServer, definitions };
