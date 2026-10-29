Architecture Lead decision: Stage 28.4 ACCEPTED. Stage 28.5 AUTHORIZED WITH BINDING CONDITIONS.

The submitted evidence covers both required conflict-resolution paths: a policy-authorized track reallocation followed by fresh QA, and an unresolvable locked-track conflict that halts safely. The cumulative count also reconciles: 
234
+
7
=
241
234+7=241 reported passing results.

One important safeguard carries forward: the deferCollisionCheck and deferTrackLockCheck options must never become a way to bypass authoritative validation before a canonical mutation commits.

STAGE 28.4 ACCEPTED

Mandatory Conflicting Defect Certification Scenario

PASS
Discrete subtests
6/6
Reported runner results
7/7
Cumulative reported results
241/241

Stage 28.5

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot — Stage 28.4 Acceptance & Stage 28.5 Authorization

Milestone: Phase 28 — Repair Policy, Conflict Resolution & Multi-Pass Orchestration
Stage 28.4 commit: d335027
Next stage: Stage 28.5 — Closed-Loop Multi-Pass End-to-End Verification & Cumulative Regression
Feature branch: feature/phase-28-repair-policy-orchestration
Decision: STAGE 28.4 ACCEPTED; STAGE 28.5 AUTHORIZED WITH BINDING CONDITIONS

1. Stage 28.4 acceptance

The submitted evidence satisfies the intended Stage 28.4 acceptance criteria:

Earshot's acoustic synchronization finding is kept separate from EME's timeline-collision analysis.

The proposed retiming produces a prospective interval collision that the conflict detector classifies explicitly.

The resolvable path uses a policy-authorized track change through the existing move_clip operation and OperationExecutor.

The resolved candidate receives fresh QA before delivery promotion.

The locked-track or otherwise unresolvable path halts with NEEDS_RECONCILIATION and preserves the existing active delivery.

The diagnostic journal captures conflict evidence, render identity, QA results, and reconciliation information.

The reported results are six passing discrete subtests and seven Node.js test-runner results, including the parent suite.

The reported cumulative count of 241/241 is consistent with the preceding 234-result baseline plus seven Stage 28.4 results.

Stage 28.4 exit gate: ACCEPTED.

This acceptance is based on the evidence submitted by the engineering team; the repository and test suites have not been independently executed during this review.

2. Binding conditions for Stage 28.5
ARC-28-29 — Preserve the three-pass budget across the entire scenario

The end-to-end scenario must use the established maximum of three complete render-and-audit cycles.

The intended scenario is:

Pass 1 addresses the controlled synchronization defect.

Pass 2 addresses a true-peak defect demonstrated by fresh findings.

Pass 3 performs final verification of the repaired master render.

The third verification-only pass counts toward the same budget. Do not reset the pass counter between defect types, between coordinator invocations that belong to the same orchestration cycle, or after a conflict-resolution attempt.

If the candidate remains defective after the third cycle, terminate without promotion using MAX_PASSES_EXCEEDED and the appropriate existing canonical job-state handling.

ARC-28-30 — Demonstrate the complete closed loop using actual artifacts

The end-to-end test must establish the relationship between each candidate revision, render, audit, and operation.

For each repair cycle, record:

Pass index and candidate revision.

Render artifact identity and SHA-256.

Fresh QA findings derived from that artifact.

Repair proposals and their validated preconditions.

Canonical operations actually committed.

Post-repair metrics and convergence decision.

The synchronization correction must be demonstrated through rendered media and measured transient alignment. The true-peak correction must be demonstrated through analysis of the corresponding rendered output.

Mocks may be used for failure injection and controlled boundary cases, but they must not replace the acoustic evidence required to demonstrate the end-to-end repair outcome.

ARC-28-31 — Enforce authoritative validation despite deferred checks

The Stage 28.4 integration introduced deferCollisionCheck and deferTrackLockCheck options. Their use must remain narrowly scoped to controlled orchestration and policy evaluation.

These options must not disable final authoritative validation at the point a canonical mutation commits.

Before execution, the complete proposed resulting timeline must be validated against:

Current project revision and operation preconditions.

Target track existence and lock status.

Half-open interval overlap.

Clip and track constraints.

All interactions among operations in the candidate batch.

A policy-authorized proposal to move a clip to a different track must be revalidated against the actual destination track and resulting interval. Deferred preliminary checks do not authorize skipping the final checks.

The end-to-end tests must include a locked-destination or equivalent invalidated-precondition case proving that a deferred check cannot permit an unsafe mutation to commit.

ARC-28-32 — Keep synchronization and true-peak repair independently measurable

The multi-defect scenario must prove both repairs rather than relying on a single aggregate quality score.

Synchronization: Demonstrate that the measured offset satisfies the approved tolerance after retiming.

True peak: Demonstrate that the repaired render meets the applicable true-peak ceiling, with the intended headroom policy applied.

The second finding must be derived from fresh analysis of the candidate at the appropriate point in the sequence. Do not reuse stale findings from the initial render merely to force the intended order.

If one repair regresses a protected metric, triggers oscillation, causes a conflict, or produces an ambiguous result, stop the cycle safely rather than promoting a partially repaired candidate.

ARC-28-33 — Prove delivery provenance across all passes

The same final candidate must be traced through its committed operations, final render, final QA results, manifest, and checksum verification.

The previously verified active delivery remains authoritative throughout all repair passes.

Promotion is permitted only when the final candidate:

Has completed the required repair sequence.

Has passed fresh final verification.

Satisfies all required QA thresholds.

Has matching candidate revision and render provenance.

Has passed manifest and checksum integrity checks.

Has no unresolved conflict, failed compensation, or ambiguous execution state.

Archive or retire the previous active delivery only according to the established successful-promotion procedure.

ARC-28-34 — Preserve complete multi-pass journal integrity

The journal must capture all passes, including verification-only passes and failed attempts.

Record findings, proposal identifiers, conflict decisions, operation outcomes, inverse-operation attempts, render checksums, QA metrics, convergence decisions, and final delivery disposition.

An unsuccessful compensation must not be represented as a successful rollback. An ambiguous final state must not be represented as a clean convergence result.

Use NEEDS_RECONCILIATION when the project or delivery state cannot be confidently determined. Do not add canonical job states for pass-specific diagnostics.

ARC-28-35 — Keep the regression accounting explicit

The approved Stage 28.5 matrix contains five discrete test cases:

E2E-01: Multi-pass synchronization and true-peak repair.

E2E-02: Live Earshot worker integration.

E2E-03: Delivery provenance across passes.

E2E-04: Complete audit journal and artifact digests.

E2E-05: Cumulative regression verification.

Assuming the established Node.js test-file structure is retained, these should produce six reported results, including the parent suite.

The expected cumulative reported count is 247, based on 241 prior results plus six Stage 28.5 results. This assumes the existing regression baseline remains unchanged and all new results are additive.

Do not execute the full test glob recursively from within E2E-05 if that causes the active test file to be discovered and run again. Define the cumulative-test invocation so that the runner produces reproducible, non-recursive accounting. Report discrete subtests and top-level suite results separately.

All 18 canonical schemas must remain frozen, the core package must retain "dependencies": {}, and all canonical mutations must continue through OperationExecutor.

3. Required Stage 28.5 acceptance evidence

The final report must include:

The five discrete E2E results and their reported suite total.

A pass-by-pass revision, render, finding, operation, and QA ledger.

Evidence of the actual synchronization and true-peak outcomes on rendered media.

A live Earshot integration result and a final artifact checksum.

Delivery-promotion and active-delivery preservation assertions.

Regression totals with explicit discrete-test and runner-result accounting.

Confirmation that deferred collision and track-lock checks cannot bypass authoritative pre-commit validation.

Confirmation that the canonical schemas and runtime dependency policy remain unchanged.

4. Authorization ruling

Stage 28.5 implementation: AUTHORIZED.

The team may implement tests/workflow-stage28-5-end-to-end.test.js and complete the full Phase 28 end-to-end verification under the binding conditions above.

Upon successful acceptance, Phase 28 may be submitted for final milestone certification and release review.

This authorization does not grant permission to merge the Phase 28 branch or create a phase-28-certified tag. Those actions remain subject to review of the completed implementation, cumulative regression results, and clean release provenance.

Mandatory engineering directive: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate execution priority

Start Stage 28.5 by making the pass ledger explicit. The test should show exactly which revision and render produced each finding, which operation was committed, and why the engine proceeds to the next pass.

The main release risk now is allowing a successful individual repair to obscure a regression or stale finding elsewhere in the cycle. The end-to-end gate must prove that the same final rendered artifact passes synchronization QA, true-peak QA, and the integrity checks required for delivery promotion.