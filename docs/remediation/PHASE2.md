# Canonical native rendering — 2026-10-27

ExecutionAuthority now retains the exact committed project in its signed durable
execution acknowledgement and returns `execution_id`. The snapshot loader validates
signature, committed status, identity, revision and the approved resulting digest.
Older execution tickets without a committed snapshot fail closed; no model regeneration
or recompilation is used to reconstruct them. Ambiguous interrupted commits remain
ineligible for rendering until reconciled.

`eme_render_and_verify` now accepts only `executionId` and `outputDir`. It rejects
all independent project, clip, crop, typography, effects and audio arguments. Its
managed RenderOrchestrator path dispatches the explicit canonical native adapter.
Assets are copied into unique staging directories and checked against the approved
physical hashes before use. Live project edits cannot alter the captured snapshot.
Canonical tracks, z-order, half-open intervals, trims, transforms, text/image overlays,
explicit audio clips and gain envelopes feed FFmpeg. Source dialogue requires an
explicit audio clip. Unsupported effects, animation, spacing, anchors and color grades
fail explicitly rather than disappearing. Native optical payloads are supported;
curved typography is withheld pending the visual phase. Renderer version, profile,
font hash, execution, operation hash, project revision and snapshot hash are recorded.
Canonical schemas have not changed.

At this phase the route deliberately reports `RENDERED_UNVERIFIED`, `success:false`,
`rendered:true`, `qaPassed:false`. A successful render is not a verified delivery.
Phase 3 adds durable QA and promotion; no previous delivery is replaced here.

Verification (Node 20.20.1):

`node --test tests/canonical-render.test.js`, exit 0:

```text
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1198.703792
```

This creates synthetic changing red/green and blue media plus a 440 Hz tone, runs a
production-CLI PTY approval, commits through OperationExecutor, modifies the live
file, restarts Node and renders the persisted snapshot. Decoded pixels are green
`[0,128,1]` from the source trim, then yellow `[254,254,0]` from inverted blue. A scaled
and translated clip exposes the expected black canvas. Caption pixels occur only in
the declared interval. Decoded audio RMS changes by over 7x across the gain envelope.
The real 160x120, 30 fps, two-second artifact SHA-256 is
`b3091ed0c077fecf894c6aebb8a5b07c87438486c88e171dbb3fa5f166b437b4`.
Raw output contains its unique temporary artifact path and complete provenance.
No genuine human approval, listening assessment or live IDE inference is claimed.
An initial test incorrectly used a synchronous assertion on an async MCP handler;
corrected to assert rejection. Initial run: 2 pass/1 fail; final run above: all pass.

`node scripts/verify-approval-phase1.cjs`, exit 0, additionally passed 75 focused
and 39 lock/fencing/delivery regressions (114/114, zero failed/skipped). Raw logs
and exact expanded commands remain under its uniquely allocated temporary evidence root.

Changed files: execution-authority (persist snapshot/identity), committed-snapshot
(new verified loader), canonical-native and canonical-text-rasterizer (new explicit
adapter), render-orchestrator (managed dispatch), MCP server (sealed route),
canonical-render.test (real-media integration), and this report.
