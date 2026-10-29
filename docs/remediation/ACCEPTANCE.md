# EME remediation engineering acceptance — 2026-10-27

The supported local native workflow has been implemented and verified on
`codex/eme-remediation`, in the isolated remediation worktree. No merge or push was
performed. The original checkout remains on `feature/phase-34-1a-creative-director`
at `a347c3ca3979976aa7646448d770a576aeb7b621`, with its three inherited tracked changes
and its initial 72,120 untracked files preserved. The final inventory is 72,121: one newer
unrelated evidence document is present and was left untouched/out of this branch.
The exact-count preservation assertion therefore exited 1; follow-up checks confirmed the
original HEAD, tracked-diff SHA-256 and all 43 audited source inputs still match. No original media/evidence was deleted, moved,
reset, cleaned or overwritten. There were no applicable AGENTS/GSD instructions.

**Recommendation:** suitable for controlled local/native integration using the declared
capability profile. This is not a blanket production release recommendation: genuine
Antigravity inference, the entire historical suite, long-form capacity and commercial
rights clearance remain unverified. Technical success and the user's review apply to
the actual artifacts below, not to historical milestone claims.

## Branch and phase history

| Phase | Commit | Result |
| --- | --- | --- |
| 0 | `abde2f2` | Exact inherited fixes, 18 previously untracked schemas and 22 fixtures versioned; 26 schema hashes checked. |
| 1 / 1.1 | `51b0cc7` | Mandatory sealed approval at supported canonical mutation boundaries; unbound legacy routes withheld. |
| 2 | `d94f468` | Durable committed snapshots drive managed native rendering; independent editorial delivery overrides removed. |
| 3 | `b1e88b1` | Final mux measurement, durable jobs, QA/manifest integrity and guarded publication. |
| 4 | `b5fb803` | Existing-schema validation, immutable plan persistence, meaningful snapshot checks and replay/history tests. |
| 5 | `84284b4` | Catalog/context/audio contracts and sample-accurate canonical audio. |
| 5 follow-up | `d09a18d` | Explicit peak control compiles to approved canonical gain keyframes. |
| 6 | `2549afd` | Backend capability reconciliation, real curved animation, crop/annotation mapping and raster face-safe checks. |
| 7 | `4f61f36` | HTTP/CLI verified-route consolidation, public entry/runtime/docs, stdio and reproducibility checks; final audit guards. |
| 7 portability | `b9363e0` | Remove five inherited private asset links; safe source archive passes all 165 tests. |

Detailed evidence is in [Phase 0](PHASE0.md), [approval](../security/PHASE1_IMPLEMENTATION_REPORT.md),
[Phase 2](PHASE2.md), [Phase 3](PHASE3.md), [Phase 4](PHASE4.md), [Phase 5](PHASE5.md),
[peak control](PHASE5_PEAK_CONTROL.md), and [Phase 6](PHASE6.md).
[Change index](CHANGE_INDEX.md) lists actual files and reasons per commit. Earlier phase
reports record their then-current state; this report and the current backend matrix govern
final acceptance. Schema contents were not changed after baseline capture.

The first committed-archive extraction was correctly rejected (exit 1) by Python's
safe tar filter because five inherited tracked symlinks pointed to absolute private asset
libraries. No extraction through those links or external asset writes occurred. A follow-up
portability commit replaces only this branch's five tracked links with documented optional
directories; the original links and every referenced target remain untouched. A dedicated
portable-input gate checks those directories. The final safe archive then runs without
following any inherited private library mounts. This is a compatibility change for optional
legacy media/LUT libraries: register reviewed physical assets explicitly.

## Protected paths and authorization record

MCP project creation, atomic/batch execution, CreativeDirector execution, CLI
execute-approved, HTTP operation/Undo/Redo and color changes use ExecutionAuthority.
Valid commits require a token from the existing terminal confirmation workflow. Pending
requests grant no authorization. Tokens cannot be issued through booleans, flags,
environment defaults or caller-supplied hashes. Unsupported legacy session/job/save/import
and CLI autonomous commit routes remain fail closed; compatibility impact is intentional.

The HMAC-signed `eme-approval-ticket.v2` seals `eme-approved-execution.v1`: project identity,
base revision, canonical snapshot digest, full Creative Plan and actual digest, exact
normalized OperationPlan/operations and digests, supplied and effective compilation options
and digests, physical asset identities/hashes, target mode/path, atomic policy, and expected
result digest/revision. File-bound relative assets resolve from the project directory unless
an explicit sealed assetBaseDir is supplied. No operations are recompiled after confirmation.
Committed resulting snapshots are signed and persisted with the execution acknowledgement.

Execution validates/consumes under session→job locking and fencing, runs only through
OperationExecutor, and commits the candidate atomically. Rejected/expired/altered/stale/
consumed/fabricated approvals fail closed. Rejection survives restart. A failure before
commit leaves project/delivery unchanged. A crash or acknowledgement failure after commit
reports committed truth or reconciliation, never a false rollback. Revision overflow fails
atomically; history restoration advances the current revision rather than restoring old counters.

## Delivery interfaces and final audit corrections

MCP eme_render_and_verify, CLI deliver-committed and HTTP /api/deliver use the same durable
NativeDelivery workflow. The only editorial authority is the signed committed snapshot;
executionId/outputDir select it. Caller projects, clips, crops, audio/effects, simulation flags,
profiles or QA overrides are rejected. Output directories are canonicalized for idempotency.
The old HTTP/CLI closed-loop publication path was removed/withheld during the final audit.
Plain demonstration exports are explicitly unverified and do not promote active delivery.

Native /3.1 derives timing, source trims/order, transforms, supported graphics/effects and
explicit audio from the snapshot. Assets are staged into unique directories with identity/
checksum checks, so later live edits cannot alter the render. Unsupported properties fail
rather than disappear. Incompatible source aspects require explicit compatible crops rather
than silent stretching or letterboxing. Required face-safe payloads are supported for
text/curved typography; unsupported non-text constraints are rejected. Native color grades,
SVG geometry, general blend/transition effects, nonlinear generic easing, noncentral anchors
and alternative output profiles remain explicitly unsupported.

Final mux QA requires H264 video/AAC stereo 48 kHz audio, finite dimensions/fps/duration,
full successful decode, −14 LUFS ±1, true peak ≤−1 dBFS, zero clipped PCM samples, stable
checksums and stream timing within one output frame. Unavailable metrics, absent streams,
corrupt files or invalid parsing cannot pass. QA and artifact hashes are bound into the
manifest. Promotion verifies disk truth under the project fence and refuses a stale live
project. Failed replacements preserve prior active delivery. Durable status/retries and
actual process-death recovery distinguish unpublished candidates from committed publication.
Historical success is preserved with a separate integrity-drift alert if evidence changes.

## Verification commands and raw summaries

Verified minimum runtime: Node 20.20.1. Native environment: FFmpeg/ffprobe 9.0.2,
Python 3.15.0, Pillow 12.3.0. No npm runtime dependency or external inference service added.

Primary command: `node scripts/verify-remediation.cjs` (using the Node 20.20.1 binary).
It runs the following bounded commands, all exit **0**:

| Command | Actual result |
| --- | --- |
| `node scripts/verify-portable-inputs.cjs` | Verified five optional asset directories without inherited absolute mounts. |
| `node scripts/verify-contract-baseline.cjs` | Verified 26 schema and 22 fixture SHA-256s; missing/altered files fail. |
| `node scripts/verify-approval-phase1.cjs` | 75 focused approval/core/timeline/MCP tests plus 39 lock/fencing/integrity tests. |
| `node scripts/verify-native-delivery.cjs` | 51 native/render/audio/contracts/interface tests, including nested cases. |

Literal final worktree summaries:

```text
# tests 75
# suites 6
# pass 75
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3032.177917

# tests 39
# suites 2
# pass 39
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1305.190208

# tests 51
# suites 0
# pass 51
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 11599.508458
```

**165 tests passed, zero failed/skipped.** Raw TAP, expanded commands, cwd, runtime,
exit codes and evidence roots are retained by the aggregate runner and its child runners.
An isolated index export of tree `ab2041090366f3b1f2988850aacf84c072559b7f` passed the
same 165 tests (75/39/51, exits 0). A committed Git archive is also used for clean-input validation;
local evidence records the exact exported revision/tree and corresponding results. The final
safely extracted archive tree `b8036ad17c58b471bc08c993b9ce2374aa1ad173` is exactly
the committed tree of `b9363e0`. It passed 75/39/51 tests, all exits 0, with durations
3080.97575 / 1323.081375 / 11680.967709 ms. All original schema/fixture hashes and
the five-directory portability gate passed in that archive, without inherited private mounts.
`git diff --check` is clean. Baseline preservation keeps one inherited trailing blank
line in a newly versioned schema; the Phase 0 cached diff check reported it honestly.

`npm pack --dry-run --ignore-scripts --json` exited 0 in the final safe archive: 248 package files, all 26 schemas,
public entry/confirmation CLI present, 2,991,320 unpacked bytes. An earlier check
before the portability follow-up contained 247 files and 2,990,754 bytes. Generated
credentials, source media and temporary artifact directories were excluded. The package
main now resolves to the real creative API module; eme-confirm is an exposed executable.

Security and concurrency raw evidence includes:

```text
PHASE1_RACE: processes=2 successful_commits=1 rejected=1 executor_steps=1
NATIVE_RACE: processes=2 successful_publications=1 competing_retry=RENDERING
```

Actual SIGKILL tests cover project commit and delivery publication on both sides of the
commit point. Plan publication is also killed before/after atomic visibility. Tests inject
render, measurement/decode, manifest, checksum, promotion, stale state and acknowledgement
failures. No failed candidate becomes active. Engine Undo/Redo, redo invalidation, monotonic
revisions, clipping/loudness, caption timing, source trims, distortion/control pixels,
curved motion/color, multiple dimensions and integer/fractional fps have focused coverage.

The actual production stdio entry point was exercised in an isolated copy: initialize,
initialized notification, list 26 tools, pending request, production CLI PTY confirmation,
approved execution, process restart, canonical render, durable status, consumed-token
rejection and CLI retrieval of the identical delivery. This is real local MCP transport
using deterministic fixtures and automated PTY, **not live IDE inference**.

## Artifact and review evidence

One real-source benchmark has human visual/listening acceptance. Brief: a two-second
portrait crop of the existing before/after fixture's left panel, retaining dialogue with
explicit lookahead peak-control gains and placing animated yellow CANONICAL EDIT below
the annotated head region. Original input SHA-256:
`e862ac7f00299b20fdb3161d33f6fdb6c34645787dcfc9eae2a7d8626a6ca414`.
Original plan fingerprint:
`70421680e0e0953c100ce68950b9aaf4a49ac05b15d1e4fdd493bf92cde8b6e6`.
Original committed project revision: 8; its signed execution and snapshot digest are in
Phase 6 and the local benchmark record. The current /3.1 renderer reproduced identical
MP4 bytes from a fresh approved execution.

| Actual media property | Measurement |
| --- | --- |
| Artifact SHA-256 | `23216934e00abead255cc6ed47b13d186126b76e9018802463a1406ff9b2c427` |
| Video | 540x960, H264, 30 fps, 60 frames, 2.000s |
| Audio | AAC stereo, 48 kHz, 2.000s |
| Integrated loudness | −14.0 LUFS |
| True peak / clipped samples | −5.0 dBFS / 0 |
| Stream timing | starts 0/0, durations 2/2, within one 30 fps frame |
| Technical QA / publication | PASSED / guarded active promotion |

At 0.5s and 1.5s the extracted frames show a filled portrait canvas and moving curved text
below the annotated head region without face overlap. The human user reviewed those frames
and the linked artifact, then explicitly replied: **“I reviewed visuals and audio; acceptable.”**
That acceptance is attached to the checksum above. Human-review metadata is retained as a
separate local evidence record; initial benchmark metadata remains intact. No agent listening
judgment is invented. Conservative supplied face rectangles are labeled manual annotations,
not measured tracking or detector ground truth. Asset commercial rights are unreviewed.

Other synthetic outputs verify engineering behavior, not human aesthetic acceptance:
canonical trim/order/transform/caption/gain-envelope pixels; 440/220/880 Hz dialogue/music/SFX
band measurements; optical distortion mean absolute pixel difference 47.3004 against a real
control; curved text centroid movement and interval boundaries. Their artifact paths, hashes,
plans/provenance and measurements are retained in raw TAP. No historical Phase 35 artifact is
substituted for newly generated evidence.

## Failures, unexecuted work and limitations

Developmental failures were corrected and rerun: synchronous assertion on async MCP rejection;
missing test-helper export; strict-schema discovery of an invalid color fixture ID and undefined
mock property; audio fixture loudness at −15.7 LUFS; incomplete disabled-reframing fixture;
malformed duration argument in the measurement harness; a hardcoded 30 fps plan against a 60 fps
project. Detailed counts are recorded in phase reports. The real-source linear-only mix failed
with ERR_AUDIO_MASTER_HEADROOM and was not published. It passed only after explicit peak-control
options were compiled into approved canonical keyframes; no QA threshold was relaxed. The failed
benchmark and explicitly unverified visual-only preview remain preserved alongside passing evidence.

The broad historical `npm test` suite was **not run**. It contains fixed cleanup paths, external
asset assumptions and obsolete boolean-approval/legacy workflow expectations. Selected existing
core/timeline/locking/fencing/integrity suites were run in reviewed isolated roots. Historical
Phase 34/35 audio/IDE suites have not all been migrated to the new protocol. Their prior milestone
PASS statements are not current acceptance evidence. Long-form memory/performance, platform
coverage beyond this environment and all unsupported capability combinations are unverified.

A genuine IDE-model-driven workflow was **not demonstrated**. No authorized interactive IDE
reasoning interface was exposed to this session, and no private endpoints/browser/token extraction
were used. Existing Antigravity MCP configuration still points to the original checkout; it was
not silently changed. The documented next integration step is to select this candidate through
the IDE's supported MCP configuration and run its actual agent-supplied plan/approval workflow.
No model API, provider key or external inference fallback was added.

Same-user arbitrary shell/filesystem/PTY control remains outside the local authorization threat
boundary. A TTY does not authenticate a physical human; the automated fixture confirmations must
not be presented as genuine human authorization. Canonical state/approval/job evidence is durable
local filesystem state, not hardware-backed authority. Face safety depends on complete supplied
annotations and the declared supported combinations. Only the recorded short artifact has human
visual/listening acceptance; rights clearance and a general production release still require
separate evidence.

## Evidence retention and next integration step

Raw final worktree/archive logs, exact commands, physical artifact copies, QA/manifests,
plans, signed fixture execution records, human-review metadata, package checks and the
original preservation record are retained locally under the ignored
`.eme-phase1-evidence/remediation-final-yekh6m_d/`. Copy checksums preserve immutable
original evidence and a copy-map records original paths; temporary sources were not moved
or rewritten. No generated media, fixture credentials, private paths or raw logs were committed.
The final source implementation is `b9363e0`; subsequent acceptance-only documentation
updates do not change that tested implementation.

The outstanding operational integration is a genuine Antigravity-agent-driven run through
its supported local MCP configuration. Broad historical-suite migration, long-form/platform
qualification and asset-rights review remain separate release prerequisites. Do not interpret
the passing local/native acceptance as evidence those unexecuted activities occurred.
