# ChatGPT Architecture Lead: Stage 18.2 Completion Review & Stage 18.3 Authorization

**Date**: 2026-10-20T16:32:15.763Z  
**Conversation**: `https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a`  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.2 Review  

---

EME Phase 18 — Stage 18.2 Review Decision
Implementation review: SUBSTANTIALLY ACCEPTED

Atomic editing and compound-operation integration

Stage 18.3: CONDITIONAL GO

Begin the concurrency and recovery audit now; resolve two evidence items before treating Stage 18.2 as fully closed.

The submitted report demonstrates meaningful progress on the critical editing path: atomic trim-in, engine-boundary lock enforcement, expected-revision checks, integration of compound operations, and engine-owned Undo/Redo. The reported 35/35 timeline tests and 425/425 master tests are encouraging; this review is based on your report, not on an independent checkout or test run.

Two details need clarification before the Phase 18.2 exit gate can be recorded as unconditionally satisfied:

Insert and track reordering: The directive included UI integration for insert_clip and reorder_tracks. The report describes their engine tests, but its operation-to-gesture and UI-integration summaries do not clearly identify the user-facing controls or confirm that they dispatch the canonical operations. Confirm they are integrated, or explicitly mark them unsupported/deferred.

“Bit-exact” Undo/Redo: The report also states that revisions advance monotonically during Undo and Redo. Therefore, the entire project document cannot be bit-for-bit identical to an earlier snapshot if the revision field differs. State the guarantee precisely: canonical editing content is restored exactly, while revision and history metadata advance according to the engine contract.

These are focused evidence and contract clarifications, not a request to redo the successfully reported operation work. Stage 18.3's audit and test-design work is authorized immediately; production changes to concurrency/recovery may proceed once these points are resolved.

Writing
EME Phase 18 — Stage 18.3 Architecture Directive

Milestone: TL-01 — Non-Destructive Interactive Timeline Engine
Stage: 18.3 — Concurrency, Lock Enforcement & Recovery Hardening
Authorization: Conditional GO
Immediate scope: Concurrency audit, contract reconciliation, and deterministic test design are authorized now. Full implementation proceeds after the Stage 18.2 acceptance clarifications below are resolved.
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Stage 18.2 acceptance addendum

Before the implementation team treats Stage 18.2 as fully closed, produce plans/PHASE_18_STAGE2_ACCEPTANCE_ADDENDUM.md.

The addendum must confirm one of the following for both insert_clip and reorder_tracks:

The UI control already exists and dispatches the correct authoritative operation, with its tests identified.

The feature is implemented and tested as part of Stage 18.2.

The feature is explicitly unsupported or deferred, with the scope impact and revised acceptance status documented.

Also qualify the Undo/Redo equality claim. Canonical edit content and relevant source/track data must be restored exactly, while monotonic revision and history metadata follow the engine's revision contract. Compare those fields separately in assertions.

This should be a focused documentation and evidence task unless the audit reveals a genuine implementation gap. Do not rewrite accepted operation logic simply to satisfy the wording of a report.

2. Stage 18.3A — Concurrency and Recovery Contract Audit

Inspect the actual implementation of:

OperationExecutor.execute() and project commit logic.

The existing request/revision guards in src/ui/server.js.

dispatchOperation() and mutation-in-flight state in src/ui/public/app.js.

Project operation, Undo, Redo, and state-reconciliation endpoints.

Track lock transitions and set_track_state.

Request identity, idempotency, persistence, and crash-recovery facilities, if present.

Deliverable: plans/PHASE_18_STAGE3_CONCURRENCY_AUDIT.md.

Document the mutation serialization boundary, revision-check ordering, current retry semantics, undo/redo behavior under concurrent requests, and the method used to establish whether an operation succeeded when its HTTP response is lost.

Do not assume that a UI disable flag is a concurrency mechanism, that a request abort means server execution stopped, or that an in-memory mutex survives a process restart.

Exit gate: Every project mutation path has a documented concurrency rule and an identifiable authoritative commit boundary. Each unresolved weakness has a specific test and proposed remediation.

3. Stage 18.3B — Revision Concurrency and Track Locks
Expected-revision enforcement

Ensure every mutating request uses the current canonical base revision. The backend must enforce the revision check atomically with the commit so concurrent callers cannot both commit against the same stale revision.

For two distinct mutations submitted against revision N:

One valid operation may commit and advance the revision to N+1.

A competing operation using the same base revision must fail with the established stale-revision conflict.

The rejected operation must not alter project content, operation history, or undo/redo stacks.

Preserve the existing 409 STALE_REVISION contract where applicable. Do not let the frontend silently refresh the revision and replay an old proposal against new project state.

Lock transitions during gestures

Test both pre-gesture and mid-gesture lock cases.

A required scenario is:

Begin a move or trim proposal against revision N.

Another authorized action locks the target track and commits revision N+1.

The original gesture attempts to commit using revision N.

The engine rejects the stale proposal; the canonical project remains unchanged by that proposal.

The UI clears or invalidates the ghost and resynchronizes.

Also test an operation submitted directly against a currently locked track with the correct current revision. It must still fail at the engine boundary with the established TRACK_LOCKED error.

Audit the special case of unlocking a track: lock enforcement must prevent edits to a locked track without making the legitimate unlock operation impossible. Define and test the exact set_track_state authorization semantics.

4. Stage 18.3C — Duplicate Requests and Unknown Outcomes

A critical recovery case occurs when the engine commits an operation but the client does not receive the response. The client cannot safely conclude that the mutation failed.

Audit the current mechanism before adding new infrastructure.

Where the existing implementation cannot safely reconcile repeated requests, introduce a narrowly scoped operation identity or idempotency safeguard. Its behavior must be explicit:

Repeated submission of the same operation identity and same payload must not execute a second commit.

Reuse of the same identity with a different payload must be rejected.

A retry that matches a previously committed operation must return or expose the known result without creating another revision.

A genuinely new user action must use a new identity.

The mechanism must have bounded storage and a documented lifetime.

If the system claims recovery across process restart, verify that the operation outcome survives the required failure boundary. An in-memory cache alone does not establish crash-safe idempotency.

Do not blindly retry non-idempotent commands after network failures. When the operation outcome is unknown, reconcile against authoritative project revision and operation history. If the outcome cannot be established, present an explicit unresolved state and require synchronization before another mutation is allowed.

5. Stage 18.3D — Undo/Redo and Cross-Mutation Serialization

Undo, Redo, clip mutations, and track-state changes must not race in a way that corrupts canonical content or history.

Audit the existing Undo/Redo route contract and add revision checks or equivalent server-side serialization consistent with the existing API. Preserve backward compatibility when possible; do not weaken safety for old clients.

Test the following:

A mutation races with Undo.

A mutation races with Redo.

Two Undo requests arrive concurrently.

Two Redo requests arrive concurrently.

A new edit follows Undo and exercises the engine's established redo-branch behavior.

A stale client requests Undo/Redo after another client has changed the project.

A request errors or disconnects during reconciliation.

The system must serialize conflicting changes or reject them deterministically. It must never restore an old project snapshot over a newer successful edit simply because Undo began first.

For each scenario, verify canonical project content, revision monotonicity, and undo/redo availability independently.

6. Stage 18.3E — Stale Projection and Recovery Hardening

Extend the timeline response guard beyond request order alone.

A projection may update the view only when it belongs to the current project/session and is not older than the accepted canonical revision. Use the existing request-sequence guard in conjunction with authoritative revision validation.

Test that a late response cannot:

Reintroduce a removed clip.

Restore a clip's pre-edit coordinates.

Replace the currently accepted track lock state.

Overwrite a newer selection context with invalid object references.

Make a failed or uncommitted operation appear committed.

After a failed request, connection loss, or recovery event, resynchronize from the authoritative project and timeline projection. Preserve valid transient zoom/scroll context where possible, but clear stale drag proposals and pending operations whose results are no longer safe to apply.

Any project-load or recovery behavior that clears Undo/Redo must be audited for races with outstanding mutations. Do not let a delayed load response replace newer canonical state.

7. Required deterministic failure-injection tests

Add focused scenarios to a dedicated Stage 18.3 suite. Prefer deterministic barriers, controlled promise resolution, and explicit failure injection over tests that rely solely on race-prone sleeps.

Minimum cases:

Scenario	Required result
Competing mutations against one revision	No double commit; stale operation rejected
Track locked during gesture	Original proposal cannot commit against stale state
Correct-revision edit of locked track	Engine rejects the forbidden operation
Duplicate operation request	At most one logical commit
Same idempotency identity, different payload	Explicit rejection
Commit succeeds but response is lost	Outcome reconciled without duplicate execution
Undo races with a new mutation	Serialized or rejected without state corruption
Redo races with another mutation	Serialized or rejected without state corruption
Stale timeline response arrives last	Newer accepted canonical projection remains visible
Process restart within claimed recovery boundary	Canonical state and recoverable operation outcome remain consistent
Failed mutation or validation	No partial canonical change or history corruption
Unlocking a locked track	Authorized unlock remains possible under the documented contract

For every injected failure, record canonical project content, revision, lock state, operation outcome, and history state before and after.

8. Stage 18.3F — Regression and Completion Certification

Deliver plans/PHASE_18_STAGE3_COMPLETION_REPORT.md.

Include:

Stage 18.2 acceptance-addendum disposition.

Exact source files and functions changed.

Mutation and recovery contracts.

Requirements-to-tests traceability.

The full set of deterministic failure-injection results.

Exact commands, exit codes, test counts, and failure logs.

Regression and performance results.

Any unsupported recovery boundary or known limitation.

Commit SHA and release disposition.

Run the focused Stage 18.3 suite, all timeline tests, relevant engine/UI integration tests, and the complete master regression. Preserve the Stage 18.1 snapping and projection performance targets unless an evidence-based architecture review approves a change.

Acceptance requires zero double commits, zero partial mutations, correct lock enforcement, deterministic stale-revision handling, sound Undo/Redo under concurrency, and accurate recovery from uncertain outcomes within the explicitly supported failure boundary.

Keep schema/eme-project.v1.schema.json unchanged, preserve the 120,000-tick timebase and half-open interval semantics, maintain VTSM sidecar isolation, keep Laya advisory-only, and protect the active-delivery publication path.

The report must distinguish what was tested from what is merely expected. Do not claim crash-safe or durable idempotency beyond the failure boundaries actually exercised.

9. Final authorization gate

Stage 18.3 may be submitted for acceptance when the above cases pass and the existing master regression remains green.

Do not promote Phase 18 to delivery/interop acceptance solely because concurrency tests pass. Stage 18.4 retains its own end-to-end timeline, interop, and delivery-integrity gates.

End of directive.

Immediate next step

Have the IDE agent produce the Stage 18.2 acceptance addendum alongside the Stage 18.3 concurrency audit. Once insert/reorder coverage and Undo/Redo equality semantics are explicit, proceed with the concurrency implementation under the directive above.

See another version
