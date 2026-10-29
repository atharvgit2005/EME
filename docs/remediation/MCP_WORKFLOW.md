# Local MCP and compatibility guide

Antigravity IDE is the intended creative reasoning environment. Register a local stdio
server through its supported MCP configuration UI. A configuration entry has this shape;
substitute real absolute paths to this checkout and a supported Node binary:

```json
{
  "mcpServers": {
    "eme": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/editing-mechanics-engine/bin/eme-mcp.js"]
    }
  }
}
```

No private IDE endpoints, browser/session tokens, provider credentials or external inference
services are used. This branch does not edit the user's existing IDE configuration. The
server speaks newline-delimited JSON-RPC over stdio; initialize, initialized notification,
tools/list and tools/call are exercised against the actual entry point in isolated tests.
There are 26 tools. Native workflow testing is not a claim that an IDE model generated a plan.

`eme_request_user_approval` accepts exactly one of creativePlan, operationPlan or operation,
plus the project/projectPath and compilation options. It returns a pending request and the
normalized operation plan. Creation uses an empty snapshot and a create_project operation.
The trusted terminal command is `node bin/eme-confirm.js <request_id> approve`; rejection uses
`reject`. Confirmation rechecks the exact record, project and assets. Copy the returned token
into `eme_execute_approved_plan` as approval_token. The token is consumed once, under locks;
retries report historical commit truth and never execute again.

Approval seals identity, base revision, full snapshot digest, Creative Plan and exact compiled
operations/digests, options, verified asset identities/hashes, target path and expected result.
The committed resulting snapshot is durably signed and supplies the execution_id. Requests
that alter operations/options/assets, become stale, expire, are rejected or are fabricated fail.
The local HMAC key and PTY interaction enforce an application protocol; same-user arbitrary
shell/filesystem/PTY control is outside that threat boundary.

Verified rendering accepts only `{ "executionId": "req_…", "outputDir": "/absolute/output" }`.
It cannot accept project, clips, crop, typography, effect, audio or QA overrides. Job identity
is stable for the execution/output directory pair. A retry reads the durable job, including
integrity drift, failed outcomes and reconciliation. `SUCCEEDED` requires verified final media,
QA and manifest evidence plus guarded publication. Publication refuses a live project that
advanced after snapshot capture. A crash after publication is never described as rollback.

CLI `deliver-committed` and HTTP `/api/deliver` use the same workflow. The latter accepts only
executionId/outputDir; `/api/render` may select it with mode=deliver or delivery=true, but still
requires the sealed execution and rejects editorial overrides. Preview exports are explicitly
DEMO_UNVERIFIED. CLI render --deliver/--delivery/--closed-loop and prompt render are withheld;
use the committed route. The old independent MCP eme_render_and_verify contract is removed.
MCP eme_render_video and plain CLI render remain demonstration exports, without publication.

Legacy unbound session init/select/revise/undo/redo/recover, job submit/approve/execute,
CapCut import and direct project save remain withheld at agent interfaces. Project Undo/Redo
and approved color edits still work through OperationExecutor. Native rendering explicitly
rejects unsupported color grades. Read-only inspection/planning and separate preview exports
remain available. HTTP frontend flows using old payloads need the new execution identity.

Canonical assets must be explicitly imported through approved operations before plans reference
them. Context includes catalog identity/source/hash and backend capability contracts. Licensing
is declared, not certified. Default system fonts are recorded in provenance; compiler-selected
fonts are physically bound. Requested font families require an explicit registered font asset.
Required face-safe rendering relies on provided annotations with active-frame coverage; supplied
rectangles are not automatic face detection or guarantees about unannotated footage.

Creative Plan profile dimensions/fps/duration must match the project. Unsupported coefficients,
curves, effects, easing, motion and compilation options fail. Speech seconds normalize once to
120,000-tick intervals. SFX normalizes asset_id/trigger_tick; missing duration metadata requires
explicit duration. Dialogue and existing audio tracks are preserved only according to explicit
canonical mixing intent. Peak-control options are compiled before approval, never invented at
render time. A profile that cannot meet loudness/peak bounds fails without promotion.

Native /3.1 refuses mismatched source/canvas aspect ratios unless an explicit compatible
crop is present. This prevents silent anamorphic stretching or letterbox fallback.
File-bound relative assets resolve from the project directory, unless an explicit sealed
assetBaseDir is supplied; effective compilation defaults are also recorded in the digest.

The portable branch contains optional asset setup directories rather than the original
absolute symlinks into private libraries. The original checkout/targets are preserved.
Register assets explicitly and provide certified LUT files separately for legacy UI preview.
