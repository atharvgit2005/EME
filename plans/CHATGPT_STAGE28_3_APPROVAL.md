Architecture Lead decision: Stage 28.3 ACCEPTED. Stage 28.4 AUTHORIZED WITH BINDING CONDITIONS.

The submitted evidence satisfies the Stage 28.3 acceptance gate. All six discrete convergence-guard tests reportedly pass, including semantic oscillation detection, duplicate-repair protection, cumulative limits, safe termination, and diagnostic journaling. The cumulative test count also reconciles: 
212
+
8
+
7
+
7
=
234
212+8+7+7=234 reported passing results.

The next stage is particularly important: it must prove that EME can handle conflicting repairs safely—not merely detect a conflict in isolation.

STAGE 28.3 ACCEPTED

Anti-Oscillation & Convergence Guard

PASS
Discrete subtests
6/6
Node.js reported results
7/7
Cumulative reported results
234/234

Stage 28.4

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot — Stage 28.3 Acceptance & Stage 28.4 Authorization

Milestone: Phase 28 — Repair Policy, Conflict Resolution & Multi-Pass Orchestration
Stage 28.3 commit: 503968b
Next stage: Stage 28.4 — Mandatory Conflicting Defect Certification Scenario
Feature branch: feature/phase-28-repair-policy-orchestration
Decision: STAGE 28.3 ACCEPTED; STAGE 28.4 AUTHORIZED WITH BINDING CONDITIONS

1. Stage 28.3 acceptance

The submitted verification ledger addresses the required convergence safeguards:

Semantic reversal detection uses affected clip and defect lineage rather than sign alone.

The integer-tick reversal tolerance is explicitly defined as 1,200 ticks (10 ms).

Duplicate ineffective proposals are distinguished from legitimate follow-up repairs.

Per-operation and cumulative timeline-shift limits are enforced.

The cumulative attenuation limit is enforced.

The guard distinguishes progress, stagnation, regression, oscillation, duplicate repairs, exhaustion, and reconciliation conditions.

Pre-execution checks and post-render evaluations are integrated with the multi-pass orchestrator.

Oscillation termination preserves the active delivery and does not give the guard direct mutation authority.

The reported result is six passing discrete subtests and seven Node.js test-runner results, including the parent suite. The reported cumulative result of 234/234 reconciles with the previous 227-result baseline plus seven Stage 28.3 results.

Stage 28.3 exit gate: ACCEPTED.

This acceptance is based on the evidence submitted by the engineering team. The source code and test suites have not been independently executed during this review.

2. Binding conditions for Stage 28.4
ARC-28-23 — Separate perceptual findings from timeline conflict evidence

The controlled fixture must use distinct, correctly attributed evidence sources.

Earshot QA supplies the measured audio-sync finding for Clip A. EME's timeline and conflict-validation logic determines whether the proposed retiming creates an interval collision with Clip B.

Do not claim that Earshot independently detected a timeline collision unless the actual adapter contract supports that capability and the test demonstrates it.

The scenario must establish that the original audio-sync finding is valid and that the collision is caused by, or exposed by, the proposed canonical operation.

ARC-28-24 — Prove both resolvable and unresolvable paths

The test must exercise two distinct policy outcomes.

Path A — Resolvable conflict: Where the approved policy permits resolution and existing canonical operations can represent it safely, the engine may construct a deterministic alternative. The resulting candidate must pass fresh validation, rerendering, and closed-loop QA before promotion.

Path B — Unresolvable conflict: Where a required track is locked, the available operation vocabulary cannot safely represent the resolution, or the policy does not authorize the required change, the engine must reject the conflicting batch or halt with NEEDS_RECONCILIATION.

The second path must not partially apply the conflicting batch or replace the previously active delivery.

Automatic track reallocation is not inherently authorized. Before implementing that path, verify the existing operation registry, canonical payload contracts, and executor semantics. If safe track reallocation requires unsupported operations or architectural changes, use the unresolvable path instead.

ARC-28-25 — Validate the complete proposed interval graph

Conflict validation must operate on the proposed resulting timeline, not only the original project.

For every candidate operation, validate:

Non-negative start ticks.

Half-open interval overlap using [startTick, startTick + durationTick).

Target track and track-lock constraints.

Existing and proposed clip relationships.

Proposal revision and preconditions.

Interactions with other operations in the same candidate batch.

A set of proposals that is individually valid may still be collectively invalid. The detector must evaluate the combined outcome before authorizing the batch.

ARC-28-26 — Preserve deterministic conflict resolution

The same starting project, proposal set, policy, and relevant evidence must produce the same conflict classification and resolution decision.

Retain the established ordering: synchronization retiming before peak attenuation, earlier timeline positions before later positions, followed by stable clip and proposal identifiers.

If a resolution introduces a new dependency cycle or another unresolved conflict, stop instead of inventing an execution order or silently discarding a proposal.

ARC-28-27 — Use fresh evidence after any resolution

Any automatic resolution that changes the candidate timeline invalidates the assumption that earlier QA findings fully describe the new candidate.

After the change:

Revalidate the candidate against the current revision.

Execute canonical mutations only through OperationExecutor.

Render the resulting candidate.

Acquire fresh QA evidence from the new render.

Evaluate relevant convergence and protected quality metrics.

Apply the existing maximum-pass budget of three complete render-and-audit cycles. Do not reset the pass counter to accommodate a conflict-resolution attempt.

ARC-28-28 — Make failure safety part of both paths

Both successful resolution and safe halt require explicit assertions about the active delivery.

For the resolvable path, promote only after the actual candidate render passes required QA and artifact-integrity checks.

For the unresolvable path, prove that:

No unauthorized conflicting mutation commits.

The prior active delivery remains unchanged.

Any already-committed candidate operations are compensated through verified inverse operations when required.

Rollback success is claimed only after resulting candidate state is verified.

Failed compensation or an ambiguous result triggers quarantine and NEEDS_RECONCILIATION.

Candidate quarantine must not introduce a new canonical job state.

3. Required Stage 28.4 tests

Implement all six discrete cases:

CSC-01: Generate the controlled dual-condition fixture and establish the original render baseline.

CSC-02: Establish the valid audio-sync finding and independently confirm the relevant timeline conditions through EME validation.

CSC-03: Prove that the proposed retiming creates an interval conflict and that the conflict detector classifies it correctly.

CSC-04: Exercise a policy-authorized resolution, if supported by existing canonical operations, and prove the resulting render passes fresh QA.

CSC-05: Exercise the locked-track or otherwise unresolvable path and prove that the candidate is safely rejected, with active delivery preserved.

CSC-06: Verify that the execution journal records the original evidence, conflicting proposals, resolution decision, operation outcomes, render identities, QA results, and final reconciliation instructions where applicable.

If the automatic resolution path cannot be represented safely by the existing executor, document that limitation and use a deterministic rejection outcome. Do not introduce a new canonical operation to make the test pass without separate architecture approval.

Acceptance criteria: Six discrete tests pass; both policy outcomes are covered; all executed mutations pass through OperationExecutor; and neither path promotes an unverified candidate.

Assuming the established Node.js test-file structure is retained, Stage 28.4 should contribute seven reported results, including its parent suite. Starting from the reported baseline of 234, the expected cumulative runner result becomes 241.

4. Test-file naming

The earlier Phase 28 plan used:

tests/workflow-stage28-4-conflicting-repair-scenario.test.js

The current request proposes:

tests/workflow-stage28-4-conflicting-defects.test.js

Choose one filename and use it consistently in the implementation plan, test command, completion report, and cumulative regression command. No architectural preference depends on the filename itself.

5. Authorization

Stage 28.4 implementation: AUTHORIZED.

The engineering team may implement the mandatory conflicting-defect scenario and its six discrete tests under the binding conditions above.

Stage 28.5 remains subject to the Stage 28.4 acceptance gate. Phase 28 merge authorization and certification-tag authorization are not granted by this decision.

All 18 canonical schemas remain frozen, the core package retains "dependencies": {}, and OperationExecutor remains the sole canonical mutation authority.

Mandatory engineering directive: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate priority

Build the locked-track rejection path first. It establishes the safety baseline: the engine must recognize a valid repair that becomes unsafe in combination, refuse to execute the conflicting batch, and preserve the existing active delivery.

Then implement the authorized resolution path only if the real operation registry supports it. That sequence will demonstrate that conflict detection controls execution policy rather than merely reporting diagnostics after a dangerous edit has already occurred.