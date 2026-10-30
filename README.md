# Editing Mechanics Engine

EME combines a local video editor with a deterministic editing, rendering, audio,
and verification engine. Your local IDE agent supplies creative reasoning through
stdio MCP; no model API key is needed by the engine.

## EME Studio

```sh
npm start
```

Open **http://127.0.0.1:4720**. Import footage or try the generated sample, review
and apply edits, preview the timeline, then export a verified MP4. Undo/redo and
revision history preserve earlier edits. Connect your IDE through the in-app MCP
configuration to submit conversational editing requests. Requests wait for the IDE
agent to read the inbox and propose a plan; Studio does not run a background model.
See [Studio setup, agent workflow, scope, and partner status](docs/studio/README.md).

The optional [scene understanding prototype](docs/studio/SCENE.md) tracks a selected region with MobileSAM on MPS, preserves timestamped masks and uncertainty, and exposes the same evidence in Studio and the IDE.

The [hackathon demo](docs/studio/HACKATHON_DEMO.md) uses those observations to place
a title clear of the selected region, review the measured result and export it
with scene, font and collision checks. Both a local quick action and an IDE/MCP
proposal workflow are available.

This repository imports the audited `codex/eme-remediation` implementation and
additional source tools and experiments into a new eight-commit history on `main`.
See [source import notes](docs/import/README.md) for provenance and repository scope.
It preserves 120,000 integer
ticks/second, half-open intervals, OperationExecutor mutation ownership, engine Undo/Redo,
mandatory approval, immutable execution snapshots and guarded durable delivery publication.
See [engineering acceptance](docs/remediation/ACCEPTANCE.md) for evidence and limitations.

## Runtime

Use Node **20.20.1 or later**, FFmpeg/ffprobe with H264/AAC support, and Python with
Pillow for text/curved typography. Verified here: Node 20.20.1, FFmpeg/ffprobe 9.0.2,
Python 3.15.0, Pillow 12.3.0. No npm runtime dependencies were added. Fonts and referenced
media must exist locally; their physical hashes are verified. Catalog rights labels are
license declarations, not proof of clearance. Media libraries are not bundled in Git. Optional asset directories contain setup notes;
the candidate no longer mounts private absolute-path libraries from another checkout.

The verified native path does not require HyperFrames or network access. Legacy
HyperFrames demonstration tools have separate runtime requirements and may attempt
installation through npx; they are not part of the verified native delivery path.

## Local workflow

Start the MCP server with `node bin/eme-mcp.js`. Configure Antigravity using the
[local MCP guide](docs/remediation/MCP_WORKFLOW.md); existing IDE configuration is not
changed by this import.

1. Inspect context and renderer capabilities. Supply a schema-valid Creative Plan,
   OperationPlan or atomic operation through `eme_request_user_approval`.
2. Review the exact sealed execution in a separate terminal using
   `node bin/eme-confirm.js <request_id> approve`. Pending requests never grant tokens.
3. Execute once through `eme_execute_approved_plan` with the issued `approval_token`.
   Keep the returned `execution_id`.
4. Call `eme_render_and_verify` with **only** `executionId` and `outputDir`.
   The engine renders the committed snapshot, measures the final mux, verifies its
   manifest and promotes it only if every mandatory gate passes.
5. Read durable results through `eme_get_job_status` with `jobId`.

CLI equivalents after approval:

```sh
node bin/eme.js execute-approved --approval-token '<token>'
node bin/eme.js deliver-committed --execution-id '<execution_id>' --output-dir '/absolute/output'
node bin/eme.js delivery-status --job-id '<job_id>'
```

HTTP editing uses `/api/approval/request` and protected operation/Undo/Redo/color routes.
`POST /api/deliver` accepts `executionId` and `outputDir`; `/api/delivery/status?jobId=…`
reads the same native delivery state. See the guide for compatibility restrictions.
The same-user shell/PTY limitation remains: a local TTY is not physical-human authentication.

## Supported native rendering

Native output derives its size, frame rate, timeline, source trims, ordering, transforms,
text, supported effects, explicit audio clips and gain envelopes from the committed project.
Source regions must match the canvas aspect within integer-pixel rounding; incompatible
aspects require an explicit crop rather than stretching or letterboxing.
Query `eme_get_renderer_capabilities` for backend-specific contracts. Native effects include
invert, brightness/contrast factor, blur, radial lens correction and animated arc typography.
Only linear generic opacity/x/y animation is supported. Required face-safe placement needs
complete per-source annotations and measured raster bounds; unsupported combinations fail.

Source dialogue requires explicit audio clips or sealed `preserveSourceDialogue:true`
compilation intent. Optional `dialoguePeakControl` compiles an explicit peak-control profile
into approved canonical gain keyframes. Mastering never silently substitutes compression.
Final output must measure −14 LUFS ±1, true peak ≤−1 dBFS, zero clipped samples, and audio/video
sync within one output frame. Unavailable or invalid measurements cannot pass.

Color grades, general blend/transition effects, SVG-path typography, noncentral anchors,
nonlinear generic easing and alternative delivery profiles remain unsupported on this path.
Create the project with its intended canvas/fps/duration before Creative Plan compilation;
profile mismatches fail rather than rendering a different requested deliverable.

## Bounded verification

```sh
npm run test:contracts
npm run test:portable
npm run test:approval
npm run test:native
```

These runners preserve raw TAP/JSON summaries under uniquely allocated OS temporary roots.
They use synthetic media and test-only automated PTYs, not genuine IDE inference or human
authentication. The native suite also exercises the actual production stdio entry point.
`schema/` hashes are checked against the versioned baseline. Never run the broad historical
`npm run test:legacy` command against valuable scratch/evidence directories without reviewing cleanup
and external-asset assumptions; historical milestones are not current acceptance evidence.

A deterministic local benchmark harness is available for the existing 1920x1080 before/after
fixture: `node scripts/benchmark-canonical-native.cjs /absolute/path/to/fixture.mp4`.
It writes a fresh temporary evidence directory. Its mock reasoning, automated PTY, supplied
annotations, technical QA and human-review status are explicitly distinguished.
