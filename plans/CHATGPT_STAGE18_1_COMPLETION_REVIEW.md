# ChatGPT Architecture Lead: Stage 18.1 Formal Review & Stage 18.2 Authorization

**Date**: 2026-10-20T16:22:19.418Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.1 Review & Stage 18.2 Authorization  

---

EME Phase 18 — Stage 18.1 Formal Review
Stage 18.1: ACCEPTED

Timeline Visual Surface, Scrubbing & Transient Interaction State

Stage 18.2: AUTHORIZED

Atomic Editing & Compound Editorial Operations

The submitted report addresses the Stage 18.1 exit criteria. In particular, the unified 100-pixels-per-second coordinate model removes the reported duration-dependent scaling discrepancy; view-only interactions remain transient; gestures can be cancelled; and the reported sequence guard prevents older timeline projections from replacing newer ones.

The snapping discrepancy is also reconciled with a 1,000-clip result of 0.0125 ms P95 against the original below 0.30 ms target. The consolidated test run reports a snapping P95 of 0.146 ms, also below that target. Both reported measurements pass; future benchmarks should continue recording their fixture and measurement conditions so the figures remain comparable.

The reported verification results are 9/9 Stage 18.1 tests, 20/20 combined timeline tests, and 410/410 master tests passing. I accept Stage 18.1 based on this evidence. I have not independently executed the repository or its tests.

Stage 18.2 is now authorized. The most important requirement is to turn the visual proposals into one atomic, revision-guarded engine operation per completed logical edit—without sacrificing the responsive preview behavior delivered in Stage 18.1.

Writing
EME Phase 18 — Stage 18.2 Implementation Directive

Milestone: TL-01 — Non-Destructive Interactive Timeline Engine
Stage: 18.2 — Atomic Editing & Compound Editorial Operations
Disposition: Authorized to begin
Prerequisite: Stage 18.1 accepted based on submitted evidence
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Objective

Connect the Stage 18.1 transient timeline interaction surface to the existing deterministic operation engine.

Users must be able to perform supported timeline edits through the Visual Control Surface, preview those edits before commitment, explicitly complete a gesture, and receive the authoritative result from OperationExecutor.

A visual proposal is not a committed edit. A successful edit must pass engine validation, respect revision and track-lock rules, update canonical project state atomically, and remain reversible through existing engine-owned Undo/Redo.

Do not add a second timeline engine, client-side operation semantics, or a frontend undo stack.

2. Stage sequence
Stage 18.2A — Operation Contract Audit & Atomic Edit Design

Before changing operation semantics, confirm the exact current implementation of:

_opInsertClip

_opTrimClip

_opMoveClip

_opSplitClip

_opDeleteClip

_opReorderTracks

_opRippleDelete

_opRippleTrim

_opSlipClip

_opSlideClip

_opSetTrackState

Verify their actual parameter names, source-range semantics, track-lock enforcement, collision checks, revision behavior, returned affected IDs, and inverse operations.

Pay particular attention to the reported trim-in defect: the current UI issues a move_clip followed by trim_clip. Define a single canonical trim transaction before wiring that gesture to the existing API.

Deliverable: plans/PHASE_18_STAGE2A_OPERATION_CONTRACT.md

Exit gate: The proposed contract table specifies inputs, preconditions, postconditions, affected entities, failure behavior, and exact Undo/Redo expectations for every supported operation. Do not assume that mathematically negating a compound operation's parameters always creates an exact inverse.

Stage 18.2B — Basic Atomic Editing

Integrate the following user interactions with the existing operations:

Insert clip.

Move clip.

Trim in and out.

Split clip.

Delete clip.

Reorder tracks.

Change track state, including visibility and locking.

Gesture-to-operation contract

Move: During the drag, display a transient proposal and snap guide. On successful gesture completion, send one move_clip operation with the intended destination and expected base revision.

Trim out: Preserve the clip's timeline start. Update its duration and source-out boundary consistently with the approved operation semantics.

Trim in: Preserve the original right boundary for a non-ripple trim. Update the timeline start, timeline duration, and source-in boundary together in one atomic transaction. Do not send move_clip followed by trim_clip.

If the existing trim_clip contract cannot express this safely, extend it with a backward-compatible payload or propose a narrowly scoped unified atomic trim operation. Document the decision before implementation.

Split: Split at a valid interior timeline tick. Preserve the intended timeline continuity and source continuity, and ensure both resulting clip identities and boundaries are valid.

Delete: Dispatch the existing engine delete operation. Preserve the complete prior clip definition and any supported linked data through the established inverse mechanism.

Insert: Validate track compatibility, duration, source data, destination collision, and clip identity in the engine. Do not treat client-side form validation as authoritative.

Track visibility and ordering: Use set_track_state and reorder_tracks respectively. Never mutate state.project directly to simulate a committed operation.

A completed gesture must dispatch one logical operation. On success, reconcile the visible timeline against the engine response. On failure or a stale-revision conflict, clear or invalidate the proposal, surface the failure, and resynchronize authoritative state.

Stage 18.2C — Compound Editorial Operations

Wire the existing compound operations:

ripple_delete

ripple_trim

slip_clip

slide_clip

Do not reproduce these operations in frontend JavaScript by issuing a sequence of independent basic edits.

Ripple delete: Verify the deleted clip, downstream movement, total duration, and any linked data affected by the operation. Confirm that only the operation's intended timeline region changes.

Ripple trim: Verify both start-edge and end-edge behavior, including expansion and contraction. Test all combinations supported by the existing rippleShiftDownstream contract.

Slip: Preserve timeline placement and duration while updating the source range. Reject proposals that violate source boundaries.

Slide: Preserve the exact adjacency and source-range properties defined by the existing engine implementation. Test left and right motion, neighboring clip adjustments, and boundary rejection. Do not assume that the inverse deltaTicks is sufficient until exact restoration is demonstrated.

Each compound operation must be committed as one engine transaction, not a series of separately committed modifications.

Stage 18.2D — Engine-Owned History & Transactional UI Reconciliation

Use the existing OperationExecutor history mechanisms.

For every supported edit, demonstrate:

The operation succeeds and produces the expected canonical state.

The project revision advances according to the existing engine contract.

A failed operation leaves canonical state and history unchanged.

Undo restores the exact expected previous state.

Redo restores the exact expected edited state.

Subsequent successful edits preserve the established undo/redo branch semantics.

Compare canonical project snapshots after each transition. Do not rely solely on a screenshot, visible clip position, or a successful HTTP status.

Ensure a rejected proposal does not leave a ghost, stale inspector values, or outdated clip coordinates that appear committed.

Stage 18.2E — Operation, UI and Regression Certification

Run focused unit tests, route/integration tests, and UI gesture tests covering every supported operation.

The full workflow must be exercised across the browser surface, backend endpoint, operation executor, authoritative response, and refreshed timeline projection.

Deliverable: plans/PHASE_18_STAGE2_COMPLETION_REPORT.md

Stage 18.2 does not certify all concurrency and recovery edge cases. Those remain Stage 18.3 requirements, but the normal operation path must already enforce expected revisions and existing track locks.

3. Mandatory operation invariants
Revision and concurrency

Every mutating request must carry a valid expectedBaseRevision corresponding to the revision the user acted upon. Do not allow a proposal based on stale project state to overwrite newer work.

The backend remains authoritative: a frontend-injected revision is a precondition, not permission to commit.

Serialize or disable duplicate submissions for the same pending gesture. Stage 18.3 will expand this into broader concurrency, idempotency, and ambiguous-outcome recovery testing.

Atomicity and validation

The operation engine must validate against a candidate state and commit the change only after required checks succeed.

Preserve:

Integer tick representation at 120,000 ticks per second.

Half-open timeline intervals [startTick, startTick + durationTicks).

Existing source trim and timeline range distinctions.

Existing schema validation and collision rules.

Track locking, target-track compatibility, and source-boundary checks.

Existing transaction and monotonic revision semantics.

Do not modify schema/eme-project.v1.schema.json for convenience.

Compound operation reversibility

For compound edits, take a pre-operation snapshot and verify all affected clips and track properties after execution, Undo, and Redo.

An inverse operation that appears algebraically correct is not sufficient evidence of reversibility. Test the actual canonical project result, including multiple downstream clips and relevant source metadata.

Delivery protection

Timeline operations update project state, not the active-delivery pointer. Rendering and QA remain governed by the established delivery pipeline.

A render or QA failure must preserve the previous verified active delivery and must not silently undo a committed timeline operation.

4. Required test matrix
Test area	Minimum required evidence
Basic operations	Success, invalid inputs, collision/boundary rejection, and expected canonical result for each operation
Atomic trim-in	Exactly one operation and one logical commit; timeline and source ranges update together
Compound operations	Ripple, slip, and slide invariants verified across affected clips
Track locks	Forbidden edits rejected by the engine, not just disabled in the UI
Optimistic concurrency	Stale expectedBaseRevision fails safely
Transaction atomicity	No partial project mutation when validation or execution fails
Undo/Redo	Exact expected canonical state restoration for every supported operation
UI gesture lifecycle	Preview updates during interaction; one operation on completion; safe rejection reconciliation
Project schema	Unmodified schema and validation of all committed project states
Regression	Existing timeline, engine, interop, color, and full master tests pass

Report the exact test commands, exit codes, test counts, and failure logs. Distinguish unit tests from actual UI/API integration tests and full-project regressions.

5. Performance expectations

Preserve the Stage 18.1 coordinate and snapping improvements.

The interactive gesture preview must remain transient; pointer movement must not cause a stream of committed engine operations. Measure proposal rendering and snap evaluation independently from operation/transaction latency.

Record actual P50 and P95 results for the existing benchmark fixture. If an interaction requires a slower backend round trip, keep the proposal visually distinct until confirmation instead of claiming it is committed.

6. Out of scope

Do not use Stage 18.2 as a reason to introduce a new project schema, redesign VTSM, change Laya authority, or add an independent timeline planner.

Do not silently change established operation semantics. If the operation audit discovers a genuine engine defect, document it and add a focused regression test alongside the smallest safe fix.

Full adversarial concurrency recovery and ambiguous network-outcome handling remain Stage 18.3.

7. Completion and authorization gate

Stage 18.2 can be submitted for acceptance only when:

All supported basic and compound interactions use their canonical engine operations.

Each completed logical edit creates the intended single transaction.

Trim-in no longer requires two independently committed operations.

Failed or invalid edits leave no partial canonical changes.

Track-lock and revision guards work at the engine boundary.

Undo/Redo restores the expected canonical state for all covered operations.

UI state reconciles to authoritative engine results.

Required tests and existing regressions pass.

Submit the completion report for architectural review. Stage 18.3 is not automatically certified by Stage 18.2 acceptance.

Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

End of directive.

Immediate next action: execute Stage 18.2A and submit plans/PHASE_18_STAGE2A_OPERATION_CONTRACT.md. The critical design decision to settle first is atomic trim-in and the exact inverse behavior of the compound operations. Once those contracts are explicit, the team can wire the gestures without introducing hidden multi-transaction edits.
