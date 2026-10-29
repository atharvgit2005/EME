# Phase 1 mandatory approval implementation report

Date: October 27, 2026. Historical Phase 1 verification record.
Consolidated on `codex/eme-remediation`; subsequent phases are recorded separately.

## Workspace and evidence preservation

Implementation is in the attached, detached worktree:
`$REPO`.
The candidate was originally verified detached at
`a347c3ca3979976aa7646448d770a576aeb7b621` before branch consolidation.

The source checkout remains on `feature/phase-34-1a-creative-director` at that HEAD.
Its three existing tracked modifications and 72,120 untracked files were preserved.
The source tracked-diff SHA-256 still equals
`81d890c2761f083079ccc8a9d57d26aba2461b2334de4ccc2853b25f82928101`.

Before implementation, the three modified files and 40 untracked schema/fixture
prerequisites were copied, not moved, into the worktree. Their initial hashes are in
the local `.eme-phase1-baseline.json`. All copied source inputs still match that baseline
in the original checkout. Canonical schema bytes and copied fixtures remain unchanged
in both checkouts. No media, prior plans, tickets, renders, or scratch evidence was
removed, relocated, or overwritten. Test output uses newly allocated temporary roots.

The inherited audio-mixer and Phase 35 test changes are byte-identical to the source
checkout and are not Phase 1 changes. The inherited MCP audio/render changes were
preserved: `eme_render_and_verify` and subsequent handlers are byte-identical to the
source checkout. Renderer/effect/audio modules and dependency declarations were not
modified for this task. No applicable AGENTS/GSD workflow was found.

## Actual Phase 1 files

Paths below are relative to the worktree, not the original source checkout.

| File | Reason |
| --- | --- |
| `src/creative/execution-record.js` (new) | Canonical input hashing; compile/simulate once; immutable exact-operation payload; snapshot, options, asset and destination binding. |
| `src/creative/execution-authority.js` (new) | Shared locked validation, durable single-use consumption, atomic OperationExecutor execution, file/head commit and truthful failure/replay outcomes. |
| `src/creative/approval-authority.js` | Persisted signed tickets, interactive-only issuance, durable rejection, fresh disk reads, expiry and tamper checks; remove boolean/standalone issuance. |
| `src/creative/creative-director.js` | Route direct execution through the same authority; no recompile after approval. |
| `src/creative/index.js` | Export the shared execution boundary. |
| `src/engine/operations.js` | Engine-owned `restore_project_history` transition, with project validation and normal monotonic revision handling. |
| `src/mcp/server.js` | Protect create/atomic/batch mutations, prepare pending execution records, remove optional enforcement and caller hash trust; update tool contracts. |
| `bin/eme-confirm.js` | Use interactive authority confirmation and durable rejection; retain strict argument/TTY checks and truthful PTY limitation. |
| `src/ui/server.js` | Protect atomic edits, history and color application; require authorization for cached results; prepare review records; withhold unbound legacy commit routes. |
| `src/cli/index.js` | Add sealed `execute-approved`; withhold legacy unbound commits and initialization. |
| `tests/phase1-approval-boundary.test.js` (new) | 27 test cases including nested cases; authorization, tampering, PTY, real process races/crashes, commit failures and protected interfaces. |
| `tests/helpers/phase1-approval.cjs` (new) | Fresh temporary fixtures and real production-CLI PTY driver. |
| `tests/helpers/phase1-confirm-child.cjs` (new) | Isolated-store adapter for the production confirmation CLI; no interaction bypass. |
| `tests/helpers/phase1-execute-child.cjs` (new) | Separate-process execution, barrier and SIGKILL injection confined to tests. |
| `tests/helpers/phase1-authorized-fetch.cjs` (new) | Acquire CLI-issued approvals for existing HTTP timeline regressions. |
| `tests/mcp-server.test.js` | Replace obsolete approval-free creation expectation; approved creation is covered in the new suite. |
| `tests/timeline-stage18-2-operations.test.js` | Adapt to mandatory approvals and isolated physical asset/output fixtures; preserve editing assertions. |
| `tests/timeline-stage18-3-concurrency.test.js` | Same protocol/fixture adaptation; preserve lock, concurrency and idempotency assertions. |
| `scripts/verify-approval-phase1.cjs` (new) | Bounded repeatable test runner with fresh cleanup roots and raw logs. |
| `docs/security/PHASE1_APPROVAL_POLICY.md` (new) | Record format, protocol, protected routes, transaction semantics and limitations. |
| `docs/security/APPROVAL_THREAT_MODEL.md` | Mark historical guarantees as superseded and link current policy. |
| `docs/security/PHASE1_IMPLEMENTATION_REPORT.md` (new) | This implementation/verification record. |

Additional review artifacts are the baseline manifest and `.eme-phase1-evidence/`.
The Phase 1-only patch in that evidence directory is relative to the original working
tree, so it excludes inherited audio and Phase 35 changes.

## Protected execution paths and record

MCP `eme_create_project`, `eme_execute_operation`, and `eme_execute_approved_plan`,
direct `CreativeDirector.execute`, and CLI `execute-approved` use ExecutionAuthority.
HTTP project operation/Undo/Redo and color apply/save use that same boundary.
HTTP idempotent-result retrieval requires the original token and matching payload.

Legacy HTTP session init/select/revise/undo/redo/recover, job submit/approve/execute,
CapCut import and unbound project save now fail before state changes. CLI `init`,
`prompt plan --execute`, autonomous/revision/candidate commits and mutating session
commands are likewise withheld. This is a compatibility restriction: these entry
points have not been retrofitted to run complete legacy recipes from sealed records.
Project Undo/Redo remains operational; legacy session Undo/Redo entry points are
withheld while their underlying history implementation is preserved.

The `eme-approval-ticket.v2` ticket seals an `eme-approved-execution.v1` payload:
project identity/revision/full snapshot hash; complete Creative Plan and digest (or
explicit null for direct operations); original input and digest; complete normalized
OperationPlan and operations digest; all compilation options and digest; independently
verified local asset identities/paths/content hashes; commit destination/mode; atomic
policy and expected resulting project digest/revision. Sorted-key JSON determines
SHA-256. A local authority key HMAC-seals the complete ticket, including its status.
Only the bearer token digest is persisted. Caller booleans, hashes, flags and optional
enforcement settings cannot grant authorization.

Pending request creation never returns a token. The production confirmation CLI
rechecks the displayed ticket, assets and project under session→job locks after the
user enters CONFIRM. Rejection survives restart and revokes an issued token. Execution
rechecks disk truth under the same lock ordering and consumes the ticket durably before
candidate steps. It executes stored operations without recompilation, validates the
expected result, and commits atomically. Failure before commit discards the candidate;
failure after commit records the committed revision. A retry never executes again and
does not claim that an earlier acknowledged or interrupted commit was rolled back.

## Verification commands and raw results

Final command, from the worktree:

```sh
node scripts/verify-approval-phase1.cjs
```

The binary resolves to Node v20.20.1. Runner exit code: **0**.
The exact expanded child commands/cwds and exit codes are in
the local `.eme-phase1-evidence/node20-verified/summary.json`.

Approval + focused regressions (`approval-and-focused.tap`), exit **0**:

```text
# tests 75
# suites 6
# pass 75
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3505.2575
```

Existing lock, fencing and delivery integrity regressions
(`locks-fencing-delivery.tap`), exit **0**:

```text
# tests 39
# suites 2
# pass 39
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1782.031
```

Total: **114 passed, 0 failed, 0 skipped**. The focused set includes the 27 Phase 1
test cases and 48 core/time/timeline/MCP cases. Existing HTTP assertions now use actual
production-CLI-issued fixture tokens; authorization was not bypassed in production code.
The legacy cleanup suites ran in a fresh OS temporary cwd with only a source symlink,
so their fixed scratch/lock cleanup paths could not touch existing evidence.

Separate-process race evidence from the raw TAP:

```text
PHASE1_RACE: processes=2 successful_commits=1 rejected=1 executor_steps=1
```

Real SIGKILL tests establish both boundaries: before project commit the original file
remains unchanged; after rename the committed revision remains and retry reports
FAILED_AFTER_COMMIT. Neither token is re-executed. A separate acknowledgement-write
failure test verifies truthful immediate post-commit reporting. A two-operation
candidate failure test proves that one successful speculative step does not become a
partial commit. Staging-file collision tests preserve pre-existing bytes.

`git diff --check` passed with exit **0**. Source-preservation assertions and checksums
are in `preservation.json`. Syntax checks and initial focused tests were also run.
An early test attempt exposed overly strict handling of macOS `/var` aliases; target
normalization was corrected and the complete final bounded run above passed.

## Remaining limitations

- Same-user processes with unrestricted shell/filesystem access can synthesize PTY
  input, read the local key/token, call engine primitives or run old code. This does
  not provide physical-human authentication or non-repudiation against that attacker.
- Tests use real subprocesses/PTYs but simulated confirmation input, not genuine
  human approval. Test adapters and crash injection are confined to test helpers.
- Legacy unbound commit routes are unavailable, including session Undo/Redo and
  unbound HTTP save. Use the sealed operation protocol; restoring those complete
  legacy recipes requires separate scoped integration work.
- Full `npm test` and historical rendering/IDE benchmark suites were not run. Some
  still target the deprecated boolean/programmatic approval protocol. No claim of a
  fully migrated repository-wide test suite or live IDE acceptance is made.
- Local filesystem durability relies on fsync/rename semantics. Actual process crashes
  were tested, not physical power failure. Interrupted ambiguous outcomes are withheld
  for reconciliation; no automatic rollback or successful replay is fabricated.
- This worktree has not been applied to the original checkout, committed, deployed,
  or wired into the live Antigravity configuration. Existing legacy tickets are kept
  as evidence and must not be migrated into trusted authorizations automatically.

Renderer behavior, audio contracts, visual effects, canonical schemas, model-provider
policy and dependency declarations were left unchanged. Phase 2 was not started.
