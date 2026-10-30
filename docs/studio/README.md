# EME Studio

A local editor for importing footage, reviewing editing proposals, rendering verified
MP4s, and revising the same project through a local IDE agent. It uses the existing
canonical EME engine. There is no embedded model service or fabricated AI response.

## Run

Install Node 20.20.1+, FFmpeg/ffprobe with H264/AAC support, and Python with Pillow.
Then run:

```sh
npm start
```

Open http://127.0.0.1:4720. Use `npm start -- --port 4800` for a different port.
The generated sample uses Pillow and system Arial or DejaVu Sans fonts. It includes
synthetic artwork and a generated tone; it is not footage from an external creator.
Import your own video or audio with the file picker (250 MB and ten-minute input
limits). Compositions currently use a 960×540 landscape canvas and up to two minutes
of output. The first imported video sets the output duration within that limit;
longer footage is explicitly trimmed, and incompatible aspect ratios are center-cropped.

Review the import proposal, approve it, then use Add title or send an editing request.
Timeline preview approximates composition and plays source audio. Export for the
rendered typography, effects, and final audio mix. Verified exports currently require
an audible source-audio or soundtrack clip. Silent-video export is not implemented.

## Connect the local IDE agent

Click **Connect IDE** in Studio and copy the generated MCP configuration into your
IDE's supported MCP settings. It uses `bin/eme-studio-mcp.js` and the active workspace
root. No private IDE endpoints, browser credentials, or external model API keys are used.
The editing flow adds inbox, proposal and reply tools to the existing 26 EME tools. Scene placement and the shared design system add further planning tools:

- `eme_studio_get_inbox`: read requests, current project, media, and constraints.
- `eme_studio_submit_plan`: submit grounded operations for human review.
- `eme_studio_reply`: ask a question or explain an unsupported request.

MCP provides tools to the IDE agent; registering a server does not automatically
trigger inference when a browser request arrives. Send the request in Studio, then
ask your IDE agent:

> Read the EME Studio inbox. Interpret the latest queued request against its actual
> project and media. Submit exact operations with a concise summary. Preserve all
> content the user did not ask to change. If ambiguous or unsupported, ask a question.
> Do not approve or execute the proposal. Return to the inbox for the next request.

Agents with a terminal tool can use the production stdio client instead of registering
an MCP server:

```sh
node scripts/studio-agent-call.cjs eme_studio_get_inbox
node scripts/studio-agent-call.cjs eme_studio_submit_plan /absolute/path/to/plan.json
node scripts/studio-agent-call.cjs eme_studio_reply /absolute/path/to/reply.json
```

A plan contains `requestId`, `baseRevision`, `summary`, and `operations`, each with
`type` and `params`. The inbox supplies live IDs, units, examples, and supported
operations. Read the inbox before planning. The server simulates and validates the
operations, binds assets, seals a pending execution, and displays the proposal.

## Review, history, and delivery

Studio supports an explicit browser-review authority in addition to the existing
terminal authority. POSTs require the exact loopback origin and a per-process browser
review capability. Agent endpoints use a separate private local capability and cannot
approve proposals. Review binds the exact execution digest; expiration, asset changes,
and stale snapshots are rechecked. All accepted edits use ExecutionAuthority and
OperationExecutor. Browser approval is not physical-human authentication against an
unrestricted same-user process. The terminal workflow remains available and unchanged.

Undo and redo also create proposals, which are reviewed before applying an engine-owned
history restoration. Revisions advance monotonically. Render jobs execute in a separate
process against the sealed committed snapshot. Failed exports do not replace previous
successful outputs. A fresh output requires successful final-media QA and publication.
Uploads, history, proposals, assets, and outputs remain under `.eme/studio/` and are
excluded from Git. Restarting preserves the workspace and reports interrupted renders.

## Partners

- **Wispr Flow:** use its desktop dictation shortcut while the request field has focus.
  The app does not embed a Wispr SDK or transcribe the video through Wispr.
- **Dodo Payments:** optionally set `DODO_CHECKOUT_URL` to an existing HTTPS hosted
  Dodo checkout. The Connect IDE dialog then exposes the link. This is a hosted-checkout
  handoff, not tested payment processing, subscription management, or entitlement sync.
- Other partner services are not required by the local editing workflow. No graph,
  wallet, model credits, or security scan is represented as a live integration.

## Checks

```sh
npm test
```

This runs the bounded existing engine acceptance checks and the Studio integration
suite. It covers origin/capability separation, exact/stale review, real media import,
MCP proposals, history, project duration changes, actual rendering, and range/download
responses. `npm run test:legacy` retains the broad historical suite, which can depend
on external assets and fixed cleanup paths. Review it before use.

## Scene understanding prototype

Use **Understand scene** on a video card to select and track a region with the optional local MPS worker. [Setup, contract, and scope](SCENE.md). The Studio MCP server has 37 tools, including the read-only scene interval query and `eme_studio_propose_title` for a guarded, reviewable title placement. Follow the [hackathon demo walkthrough](HACKATHON_DEMO.md) for the complete tracking-to-export flow.

## Shared design system

Use **Design** in the timeline to compare three styles for a footage lower third,
title card or statistic card. The IDE can call `eme_studio_plan_design` and
`eme_studio_propose_design`; EME owns measured layout and motion compilation.
See [scope, evidence, IDE examples and repeatable demo](DESIGN_SYSTEM.md).

The [feedback and ranking system](DESIGN_FEEDBACK.md) recommends a candidate,
learns from explicit comparisons, and supports correcting/retracting feedback.
The IDE reads recommendations through `eme_studio_rank_designs`; user feedback
remains a separate Studio action.

[Editable design components](DESIGN_REVISIONS.md) retain content and parameters for
targeted revisions. The IDE reads `eme_studio_get_design_component`, requests changes
with `eme_studio_revise_design`, then proposes a candidate for review. EME can compare
variants within one style and learn parameter preferences. `npm run demo:revisions`
renders a generated-media before/after example.

## TigerGraph memory

[TigerGraph integration](TIGERGRAPH.md) provides optional graph memory for designs,
parameter buckets, approved component versions and explicit feedback. Use
`eme_studio_get_design_memory` before planning to retrieve verified related examples.
Studio shows status, sync and retrieval controls in the Design dialog. The local
ledger remains authoritative and network failures fall back to local examples.
The local Savanna connection is configured in ignored `.env.local`; enable it with
`node --env-file=.env.local bin/eme-studio.js`. The live integration passed on
TigerGraph 4.2.5. New deployments use the supplied GSQL schema and environment
template. See the [recorded verification](TIGERGRAPH_ACCEPTANCE.md).
