const fs = require("node:fs"),
  path = require("node:path");
const { EmeMcpServer, TOOL_DEFINITIONS } = require("../mcp/server.js");
const parameterSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    titleScale: { type: "number", minimum: 0.8, maximum: 1.4 },
    spacingScale: { type: "number", minimum: 0.75, maximum: 1.5 },
    motionScale: { type: "number", minimum: 0, maximum: 1.75 },
    holdScale: { type: "number", minimum: 0.8, maximum: 1.5 },
  },
};
const profileIds = Object.keys(require("../design/catalog.js").PROFILES);
const sfxTemplates = require('../audio/sfx/templates.js');
const definitions = [
  { name: "eme_studio_list_sfx_templates", description: "List original procedural sound recipes, designed alignment anchors and material cooldowns. No project mutation.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: "eme_studio_plan_sfx", description: "Plan contextual SFX from explicit editorial events. Preserves silence, dialogue and handles; returns deterministic seeds and skipped reasons. Proposal only. Render selected cues with eme-sfx render, import the WAVs into Studio, then submit an edit for human review.",
    inputSchema: { type: "object", additionalProperties: false, required: ["events", "options"], properties: {
      events: { type: "array", maxItems: 10000, items: { type: "object", additionalProperties: false, required: ["id", "kind", "tick"], properties: {
        id: { type: "string", minLength: 1 }, kind: { enum: ["title", "reveal", "cut", "transition", "accent"] }, tick: { type: "integer", minimum: 0 }, salience: { type: "number", minimum: 0, maximum: 1 }
      } } }, options: { type: "object", additionalProperties: false, required: ["durationTicks"], properties: {
        profile: { enum: ["editorial", "kinetic", "product", "cinematic", "interface"] }, durationTicks: { type: "integer", minimum: 1 }, seed: { type: "integer" }, maxCuesPerSecond: { type: "number", minimum: .1, maximum: 8 },
        dialogueIntervals: { type: "array", items: { type: "object", additionalProperties: false, required: ["startTick", "endTick"], properties: { startTick: { type: "integer", minimum: 0 }, endTick: { type: "integer", minimum: 1 } } } }
      } }
    } } },
  {
    name: "eme_studio_get_design_memory",
    description:
      "Retrieve related measured design examples, revision lineage and explicit feedback from verified TigerGraph memory or the local ledger. Read evidence before planning; cannot approve edits, submit preferences or execute arbitrary graph queries.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        recipe: { enum: ["lower-third", "title-card", "statistic-card"] },
        profileId: { enum: profileIds },
        aspect: { enum: ["landscape", "portrait", "square"] },
        componentId: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
    },
  },
  {
    name: "eme_studio_get_design_component",
    description:
      "Read a designed component's editable content, style and parameters from the current project. Reports unsupported external changes; never modifies the project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["clipId"],
      properties: { clipId: { type: "string" } },
    },
  },
  {
    name: "eme_studio_revise_design",
    description:
      "Plan a designed component revision. Preserves style and untouched dimensions; alternatives vary only requested axes. Creates candidates for review; cannot approve or execute.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["requestId", "baseRevision", "clipId", "changes"],
      properties: {
        requestId: { type: "string" },
        baseRevision: { type: "integer" },
        clipId: { type: "string" },
        explore: { type: "boolean" },
        changes: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", maxLength: 180 },
            body: { type: "string", maxLength: 260 },
            eyebrow: { type: "string", maxLength: 45 },
            value: { type: "string", maxLength: 16 },
            startTick: { type: "integer", minimum: 0 },
            durationTicks: { type: "integer", minimum: 1 },
            profileId: { enum: profileIds },
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                titleScale: { type: "number", minimum: 0.8, maximum: 1.4 },
                spacingScale: { type: "number", minimum: 0.75, maximum: 1.5 },
                motionScale: { type: "number", minimum: 0, maximum: 1.75 },
                holdScale: { type: "number", minimum: 0.8, maximum: 1.5 },
              },
            },
            adjustments: {
              type: "object",
              additionalProperties: false,
              properties: {
                typography: { enum: ["larger", "smaller"] },
                spacing: { enum: ["more", "less"] },
                motion: { enum: ["more", "less"] },
                hold: { enum: ["longer", "shorter"] },
              },
            },
          },
        },
      },
    },
  },
  {
    name: "eme_studio_rank_designs",
    description:
      "Read current explained design rankings using measured rules and explicit local user feedback. Historical or damaged candidates are ineligible. Read-only; does not record human preferences, approve, apply or alter the project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["setId"],
      properties: { setId: { type: "string" } },
    },
  },
  {
    name: "eme_studio_plan_design",
    description:
      "Create measured design candidates without changing the project. Read the inbox designSystem first. EME owns text wrapping, layout, reading time and motion. Title/statistic cards cover footage; lower thirds are not subject-safe. Returns previews, decisions and per-profile failures.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["requestId", "baseRevision", "brief"],
      properties: {
        requestId: { type: "string" },
        baseRevision: { type: "integer" },
        brief: {
          type: "object",
          additionalProperties: false,
          required: ["recipe", "title", "startTick", "durationTicks"],
          properties: {
            recipe: { enum: ["lower-third", "title-card", "statistic-card"] },
            title: { type: "string", maxLength: 180 },
            body: { type: "string", maxLength: 260 },
            eyebrow: { type: "string", maxLength: 45 },
            value: { type: "string", maxLength: 16 },
            startTick: { type: "integer", minimum: 0 },
            durationTicks: { type: "integer", minimum: 1 },
            videoClipId: { type: "string" },
            preferredProfile: { enum: profileIds },
            parameters: parameterSchema,
            variationMode: { enum: ["styles", "parameters"] },
            variationAxes: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
              items: {
                enum: [
                  "titleScale",
                  "spacingScale",
                  "motionScale",
                  "holdScale",
                ],
              },
            },
            profiles: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              uniqueItems: true,
              items: { enum: profileIds },
            },
          },
        },
      },
    },
  },
  {
    name: "eme_studio_propose_design",
    description:
      "Select a current design candidate and create an exact browser-review proposal. Cannot approve or execute. Changed source, preview, font or project requires replanning.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["requestId", "baseRevision", "setId", "candidateId"],
      properties: {
        requestId: { type: "string" },
        baseRevision: { type: "integer" },
        setId: { type: "string" },
        candidateId: { type: "string" },
      },
    },
  },
  {
    name: "eme_studio_propose_title",
    description:
      "Propose a static title that avoids a selected tracked region throughout its duration. Requires complete observed coverage. Resolves real font bounds, crop/trim mapping, backing and placement preview. Creates a browser review proposal only; cannot approve or execute.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "requestId",
        "baseRevision",
        "analysisId",
        "videoClipId",
        "text",
        "startTick",
        "durationTicks",
      ],
      properties: {
        requestId: { type: "string" },
        baseRevision: { type: "integer" },
        analysisId: { type: "string" },
        videoClipId: { type: "string" },
        text: { type: "string" },
        startTick: { type: "integer" },
        durationTicks: { type: "integer" },
        fontSize: { type: "integer", minimum: 12, maximum: 120 },
      },
    },
  },
  {
    name: "eme_studio_get_scene",
    description:
      "Read a source-bound scene analysis interval. Returns observed regions, predictions, uncertainty and mask IDs. Read-only: cannot authorize edits. Coordinates are source pixels, not project canvas pixels.",
    inputSchema: {
      type: "object",
      required: ["analysisId"],
      properties: {
        analysisId: { type: "string" },
        startTick: { type: "integer" },
        endTick: { type: "integer" },
        requireVisible: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },

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
    if (name === "eme_studio_list_sfx_templates") return sfxTemplates.listSfxTemplates();
    if (name === "eme_studio_plan_sfx") return sfxTemplates.planSfxTemplates(args.events, args.options);
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
      name === "eme_studio_get_design_memory"
        ? "design/memory"
        : name === "eme_studio_get_design_component"
          ? "design/component"
          : name === "eme_studio_revise_design"
            ? "design/revise"
            : name === "eme_studio_rank_designs"
              ? "design/rank"
              : name === "eme_studio_plan_design"
                ? "design/plan"
                : name === "eme_studio_propose_design"
                  ? "design/propose"
                  : name === "eme_studio_propose_title"
                    ? "title"
                    : name === "eme_studio_get_scene"
                      ? "scene"
                      : name === "eme_studio_get_inbox"
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
