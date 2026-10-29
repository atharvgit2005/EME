Architecture Lead decision: Stage 28.1 ACCEPTED. Stage 28.2 AUTHORIZED WITH BINDING CONDITIONS.

The submitted evidence satisfies the Stage 28.1 exit gate: all seven discrete conflict-detector tests reportedly pass, deterministic ordering is tested across 50 shuffled inputs, and the cumulative test runner reports 220/220 passing results. This is acceptance based on your submitted evidence; I have not independently run the repository tests.

STAGE 28.1 ACCEPTED

Proposal Conflict Detector & Dependency Graph

PASS
Discrete subtests
7/7
Node.js reported results
8/8
Cumulative reported results
220/220

Stage 28.2

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot — Stage 28.1 Acceptance & Stage 28.2 Authorization

Milestone: Phase 28 — Repair Policy, Conflict Resolution & Multi-Pass Orchestration
Stage 28.1 commit: 58abba7
Next stage: Stage 28.2 — Multi-Pass Repair Orchestrator & Bounded Pass Engine
Feature branch: feature/phase-28-repair-policy-orchestration
Decision: STAGE 28.1 ACCEPTED; STAGE 28.2 AUTHORIZED WITH BINDING CONDITIONS

1. Stage 28.1 acceptance

The submitted results address the approved Stage 28.1 requirements:

Half-open interval semantics prevent adjacent clips that merely abut from being treated as overlapping.

Same-track collisions, competing properties, mutually exclusive proposals, stale revisions, locked tracks, and dependency cycles are represented by explicit diagnostics.

Proposal ordering follows the specified priority, timeline position, clip identifier, and proposal identifier.

Unresolvable dependency cycles require reconciliation rather than arbitrary ordering.

The conflict detector remains a planning component and does not directly mutate canonical project state.

The internal policy schema is separate from the 18 frozen canonical schemas.

The submitted test ledger reports seven passing discrete cases, plus one top-level Node.js test runner result. The reported cumulative result of 220/220 is arithmetically consistent with the 212-result Phase 27 baseline plus eight Stage 28.1 runner results.

Stage 28.1 exit gate: ACCEPTED.

This decision acknowledges the reported results; it does not represent an independent execution or source-code audit.

2. Binding conditions for Stage 28.2
ARC-28-08 — One authoritative candidate per orchestration cycle

MultiPassRepairOrchestrator must operate on an isolated candidate derived from a known project revision.

The orchestration cycle must retain the distinction between:

Original authoritative project and active delivery.

Current candidate project and its revision.

Rendered media for a particular candidate revision.

Fresh QA findings from that exact render.

Proposed and committed repair operations.

Final verified delivery eligible for promotion.

The orchestrator must not modify the original active delivery while evaluating candidate repairs.

ARC-28-09 — Explicit pass semantics and hard budget

Implement maxPasses = 3 as the default maximum number of complete render-and-audit cycles in one orchestration attempt.

Each pass must:

Identify the candidate revision being evaluated.

Produce the corresponding render.

Run fresh QA on that render.

Associate findings with the candidate revision and render identity.

Determine whether the candidate is clean, requires a bounded repair, or must stop.

A repair in a pass must be followed by a render and audit before its success can be accepted.

The final verification-only pass counts toward the same three-pass limit. If defects persist when the budget is exhausted, terminate with MAX_PASSES_EXCEEDED; do not promote the candidate.

No additional repair may be applied after the final permitted verification cycle. Do not silently reset the counter, reuse a prior successful audit, or begin another cycle to evade the limit.

ARC-28-10 — Fresh findings and revision fencing

Pass (k+1) must consume findings obtained from the new render resulting from pass (k), not previously actionable findings from an earlier revision.

Every repair proposal must be checked against the current candidate revision immediately before execution. If another operation invalidates its preconditions, discard or regenerate the proposal and re-run the applicable validation.

Record at least the pass index, candidate revision, render checksum, findings, proposals, operations, and QA disposition in the journal.

A render result and its QA evidence must be bound to the same artifact. A successful finding ingestion step alone is not evidence that the corresponding candidate is safe to promote.

ARC-28-11 — Convergence and termination decisions

Integrate RepairConvergenceGuard at the orchestration boundary, even though the guard is implemented in Stage 28.3.

Stage 28.2 may use a minimal interface or stub that supports deterministic stopping decisions, but it must not permit unbounded repair loops while the complete guard is still under development.

Keep these outcomes distinct:

Candidate is clean and eligible for final verification or promotion.

A repair made measurable progress and another bounded pass is justified.

No measurable improvement occurred.

A protected quality metric regressed.

An oscillation or duplicate repair was detected.

The pass budget was exhausted.

Execution or verification ended in an ambiguous state.

Use the existing canonical job-state vocabulary. MAX_PASSES_EXCEEDED and OSCILLATION_DETECTED are diagnostic or termination reasons, not additional canonical job states. Use NEEDS_RECONCILIATION when the outcome requires intervention.

ARC-28-12 — Rollback requires verified inverse operations

For a failure requiring cycle-level rollback, process committed operations in reverse execution order, using the verified inverse operations supported by the engine.

Do not roll back project history by decrementing or resetting the canonical revision number. Compensation through inverse operations must preserve monotonic revision progression and must be recorded in the audit journal.

If a repair failed before committing, do not invent a committed mutation or an inverse for it. If an inverse operation fails, or the resulting state cannot be verified, do not claim that rollback completed.

Quarantine the candidate and use NEEDS_RECONCILIATION when the remaining state is ambiguous. Preserve the previous active delivery regardless of rollback outcome.

ARC-28-13 — Promotion remains a separate final transaction

The orchestrator may not promote a candidate merely because all planned operations executed successfully.

Promotion requires:

All required repairs have completed.

The final permitted verification render is fresh.

Required QA checks pass for the actual final artifact.

The candidate revision and media checksum match the verification evidence.

Manifest and checksum integrity checks succeed.

No unresolved conflict, rollback failure, or ambiguous execution remains.

Until these conditions hold, the existing active delivery remains authoritative and untouched.

ARC-28-14 — Preserve all established architecture invariants

OperationExecutor remains the sole canonical mutation authority. No new canonical operations, canonical job states, schema modifications, or external runtime npm dependencies are authorized.

All 18 canonical schemas remain frozen, and the core package retains "dependencies": {}.

3. Required Stage 28.2 acceptance tests

Implement and pass all six planned discrete tests:

MPS-01: Enforce the three-cycle limit and terminate successfully when all required checks pass.

MPS-02: Prove that each subsequent pass consumes fresh findings from the preceding pass's render.

MPS-03: Prove monotonic revision progression and correct revision fencing.

MPS-04: Prove that unresolved defects at the limit result in MAX_PASSES_EXCEEDED without promotion.

MPS-05: Prove the existing active delivery remains unchanged until final promotion.

MPS-06: Inject a failure after an earlier pass has committed operations and prove reverse-order inverse execution, verified candidate-state recovery, and correct handling of rollback failure.

The sixth test must distinguish successful compensation from a failed or ambiguous rollback. Assertions must not assume that an inverse operation restores an earlier revision number.

For the Stage 28.2 cumulative runner, the expected result is seven reported results: six discrete subtests and one parent suite result, assuming the existing Node.js test structure is retained.

4. Stage authorization

Stage 28.2 implementation: AUTHORIZED.

The engineering team may implement:

src/audio/repair/multi-pass-orchestrator.js

tests/workflow-stage28-2-multi-pass-orchestrator.test.js

The six passing discrete test cases and the cumulative regression report must be submitted before Stage 28.2 is accepted.

Stage 28.3 may be prepared in parallel at the design level, but the complete convergence implementation must pass its own review gate before the multi-pass system is authorized for full Phase 28 end-to-end certification.

No Phase 28 merge or release-tag authorization is granted by this decision.

Mandatory engineering directive: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate implementation focus

The highest-risk part of Stage 28.2 is not the three-pass loop itself; it is recovering correctly after a failure on Pass 2 when Pass 1 has already committed changes.

Build that test early. It should prove that the orchestrator can distinguish committed operations from rejected proposals, compensate in reverse order, keep revisions monotonic, preserve the active delivery, and refuse promotion whenever recovery remains uncertain.

That is the critical proof required before EME can safely turn the Phase 27 repair engine into a bounded multi-pass system.