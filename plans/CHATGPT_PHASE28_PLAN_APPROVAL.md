Architecture Lead decision: Phase 28 plan APPROVED WITH BINDING CONDITIONS. Stage 28.1 is AUTHORIZED to begin.

The proposed direction is correct: the engine must resolve repair conflicts before execution, use fresh QA evidence after each render, and stop safely when repairs cannot converge. I am imposing several additional constraints now to prevent multi-pass orchestration from introducing nondeterministic mutations, ambiguous rollback claims, or changes to the canonical job-state model.

PHASE 28 KICKOFF APPROVED

Repair Policy, Conflict Resolution & Multi-Pass Orchestration

Phase 27 base

Accepted as reported

Stage 28.1 implementation

Authorized

Stages 28.2–28.5

Subject to stage gates
Formal Architecture Lead plan approval
Writing
EME × Earshot — Phase 28 Implementation Plan Approval

Milestone: Phase 28 — Repair Policy, Conflict Resolution & Multi-Pass Orchestration
Feature branch: feature/phase-28-repair-policy-orchestration
Certified release base: phase-27-certified
Certified release commit: e53317ae7958a87dd17ae7aaaeecfdebd1a38a62
Reported post-merge baseline: 38cd2ee801b9677a1d7f2b8027af25d2be74ef4a
Decision: PLAN APPROVED WITH BINDING CONDITIONS
Stage 28.1: AUTHORIZED
Merge and release authorization: NOT GRANTED

1. Architecture Lead assessment

The proposed architecture addresses four necessary capabilities:

Deterministic conflict detection and proposal ordering.

Bounded multi-pass execution with fresh findings after rendering.

Protection against oscillation, duplicate repairs, and non-convergence.

Delivery integrity throughout repair, rerendering, quality verification, and promotion.

The plan is approved in principle. The binding conditions below govern implementation and acceptance.

2. Binding conditions
ARC-28-01 — Conflict detection must be deterministic and non-mutating

RepairConflictDetector must be a planning component. It may construct dependency graphs, classify conflicts, and partition proposals, but it must not mutate canonical project state.

Use the established integer-tick timebase and half-open intervals:

[startTick, startTick + durationTick)

Conflict checks must account for target clip, target track, interval overlap, affected properties, proposal preconditions, and project revision.

Use CLIP_OVERLAP or an equally explicit timeline-conflict code for time-based overlap. Reserve spatial collision terminology for actual spatial or positional conflicts where such dimensions exist.

The detector must distinguish:

Independent proposals that may safely coexist.

Proposals that require deterministic sequential execution and fresh validation.

Proposals that cannot safely be combined and therefore must be rejected or sent for reconciliation.

Parallel grouping is not permission for concurrent canonical mutations. Unless the existing executor explicitly supports and verifies safe concurrent execution, approved proposals must be executed sequentially through OperationExecutor.

ARC-28-02 — Define a deterministic total ordering

Apply the approved priority policy:

Structural or synchronization retiming before peak attenuation.

Earlier timeline intervals before later intervals.

Lexicographic clip ID as a stable tie-breaker.

Add a stable proposal identifier as a final tie-breaker when the preceding fields are equal.

The dependency graph must remain acyclic. If dependencies produce a cycle, stop and return explicit conflict diagnostics. Do not silently invent an ordering or drop a proposal to force a result.

The ordering must be reproducible for identical project snapshots and proposal sets.

ARC-28-03 — Bound the complete multi-pass lifecycle

Set maxPasses = 3 by default and expose a validated policy limit rather than permitting arbitrary unbounded configuration.

Define precisely what counts as a pass. Every pass must be bounded and must use evidence from the current candidate revision and the corresponding render.

A subsequent repair pass must consume fresh QA findings from the preceding pass's rendered output. Findings from an older revision must not remain actionable merely because their content looks similar.

A clean verification pass must not reuse a stale success result. Before promotion, the final candidate must have a fresh successful render and the required QA evidence for that same candidate.

Record the pass index, source revision, render identity, findings, proposals, committed operations, quality metrics, and final disposition in the execution journal.

ARC-28-04 — Distinguish oscillation from failure to improve

OSCILLATION_DETECTED is a diagnostic or termination reason, not a new canonical job state.

The existing canonical state model remains unchanged; use NEEDS_RECONCILIATION when a repair cannot safely continue because of an oscillation or unresolved state.

Oscillation detection must compare the relevant clip, property, finding identity, proposal, and prior operation. A sign-reversal check alone is insufficient if the proposals affect different clips or solve different defects.

Preserve the proposed cumulative safeguards:

Maximum absolute cumulative timeline shift: 240,000 ticks per affected clip per orchestration cycle, subject to all stricter bounds inherited from earlier phases.

Maximum cumulative attenuation: 12 dB per affected clip per orchestration cycle, unless the applicable product requirement is stricter.

All intermediate positions must satisfy the non-negative start constraint and existing collision, locking, and revision rules. A compliant final sum does not excuse an unsafe intermediate position.

A lack of improvement is not automatically oscillation. Define separate outcomes for:

Proven cyclic or reversing behavior.

No measurable progress.

A regression in a protected metric.

Maximum-pass exhaustion.

An ambiguous execution or verification outcome.

Use finding-specific quality thresholds. A synchronization repair should be judged against synchronization criteria; a peak repair should be judged against peak criteria. Do not let an unchanged unrelated metric invalidate an otherwise valid individual repair, and do not let improvement in one metric conceal an unacceptable regression in another.

ARC-28-05 — The conflicting-repair scenario is mandatory

Stage 28.4 must prove that two individually valid proposals become incompatible when combined.

For the Clip A/Clip B scenario, distinguish the audio-sync defect detected by Earshot from the interval collision detected by EME timeline validation.

The scenario must establish:

Both original findings are valid for the starting fixture.

The conflict detector identifies the collision created by the proposed retiming.

Any automatic resolution is permitted by an explicit policy and supported by existing canonical operations.

The resolved candidate is rerendered and passes fresh QA.

An unresolvable or locked-track case halts safely, preserving the active delivery.

Do not assume that automatic track reallocation is permitted. Verify the existing operation vocabulary and semantics first. If safe reallocation cannot be represented with an existing supported operation and approved policy, reject that resolution and use NEEDS_RECONCILIATION.

ARC-28-06 — Define the multi-pass transaction boundary

Treat one bounded repair orchestration cycle as a single atomic candidate transaction for purposes of failure recovery.

If a failure requires rollback, apply verified inverse operations in reverse committed order and verify the resulting candidate state. Preserve a journal of each forward and inverse operation.

If any inverse operation fails, or the resulting state cannot be verified, do not claim that rollback completed. Quarantine the candidate, retain the evidence, and move the workflow to NEEDS_RECONCILIATION where appropriate.

The active delivery must remain unchanged throughout all passes until final promotion succeeds. Candidate rollback and delivery preservation are separate controls: rollback failure must not authorize promotion of an uncertain candidate.

This transaction boundary must remain consistent with the established EME distinction between atomic plans and non-atomic operations. Phase 28 must not silently redefine the behavior of existing non-atomic workflows.

ARC-28-07 — Preserve canonical schemas and execution authority

The internal policy schema may be added at:

src/audio/schemas/audio-repair-policy.v1.json

The schema must describe policy, conflict categories, ordering, pass limits, and diagnostic outcomes. It must not redefine canonical project operations or canonical job states.

All 18 existing schema/*.v1.schema.json files must remain unchanged. The core package.json must retain "dependencies": {}.

OperationExecutor remains the sole canonical mutation authority. Repair orchestration, the conflict detector, convergence guard, Earshot adapter, and worker processes must not bypass it.

3. Test accounting ruling

The approved Phase 28 plan contains 30 planned discrete subtests:

Stage	Discrete subtests	Expected Node test results
28.1 — Conflict detector	7	8, including suite harness
28.2 — Multi-pass orchestrator	6	7
28.3 — Convergence guard	6	7
28.4 — Conflict scenario	6	7
28.5 — End-to-end verification	5	6
Total	30	35

This stage-by-stage accounting is accepted.

The cumulative target requires one terminology correction. The Phase 27 completion record reports a 212-result baseline, including its Node.js test-runner accounting. Adding 30 planned discrete Phase 28 subtests yields 242 in a mixed-unit arithmetic sum; adding the five Phase 28 suite harness results yields 247 reported runner results.

Therefore:

Phase 28 discrete subtests: 30.

Phase 28 reported runner results: 35.

Expected cumulative reported runner results: 247, assuming the existing 212-result baseline is rerun unchanged and all 35 Phase 28 results are additive.

Cumulative discrete test count: Not established by this arithmetic alone; it requires consistent enumeration of the actual discrete subtests across all phases.

Do not label 242 as the cumulative discrete test count unless the entire existing baseline has been recounted and independently classified by test type.

The release gate requires complete test discovery and reporting, including pass, fail, skip, cancellation, and duration information. Do not count repeated executions as additional unique cases.

4. Stage authorization
Stage 28.1 — Proposal Conflict Detector & Dependency Graph

AUTHORIZED TO BEGIN IMMEDIATELY.

Implement:

src/audio/schemas/audio-repair-policy.v1.json

src/audio/repair/repair-conflict-detector.js

tests/workflow-stage28-1-conflict-detector.test.js

The initial implementation must demonstrate:

Policy schema validation.

Same-track interval conflict detection with half-open interval semantics.

Same-clip property-interference detection.

Stable grouping of independent proposals without concurrent mutation.

Deterministic dependency ordering.

Explicit rejection of mutually exclusive or cyclic proposals.

Stale-revision rejection.

The detector should produce structured diagnostics and a deterministic ordering result. It must not execute repair operations or promote deliveries.

Stage 28.1 exit gate: All seven discrete subtests pass; deterministic repeated runs produce identical conflict classifications and ordering; frozen canonical schemas remain unchanged; no new runtime dependencies are introduced.

Submit the stage result for review before Stage 28.2 proceeds to execution orchestration.

5. Remaining stage gates

Stages 28.2 through 28.5 are approved in principle under this plan, but must honor the above conditions and their dependent stage gates. In particular, verify canonical operation support before implementing automatic track reallocation, verify rollback semantics before multi-pass execution, and demonstrate actual rendered-media results before accepting the end-to-end scenario.

No merge or release-tag authorization is granted by this plan approval.

6. Phase 28 implementation directive

The engineering team is authorized to begin Stage 28.1 on the certified Phase 27 base and should preserve the exact base ancestry and release provenance.

The mandatory engineering directive is:

“Use required GSD actions to achieve the goals and wherever needed.”

Immediate next step

Begin Stage 28.1 with the seven discrete conflict-detector tests. Pay particular attention to deterministic interval handling, cycles in the dependency graph, and stale project revisions. Once those tests pass and the Stage 28.1 evidence is submitted, the next review will focus on whether the resulting policy contract is safe enough to authorize multi-pass execution.