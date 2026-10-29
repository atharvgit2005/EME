Architecture Lead decision: Stage 28.2 ACCEPTED. Stage 28.3 AUTHORIZED WITH BINDING CONDITIONS.

The submitted evidence satisfies the Stage 28.2 acceptance gate: six discrete subtests reportedly pass, including bounded execution, fresh findings, revision fencing, pass exhaustion, delivery preservation, and rollback recovery. The cumulative test count also reconciles: 
212
+
8
+
7
=
227
212+8+7=227 reported passing results.

The critical next step is to make oscillation detection sensitive to the meaning of a repair, not just the sign of its tick shift. Reversing a correction to the same clip and defect is potentially oscillatory; applying an opposite shift to a different clip may be completely legitimate.

STAGE 28.2 ACCEPTED

Multi-Pass Repair Orchestrator & Bounded Pass Engine

PASS
Discrete subtests
6/6
Stage 28.2 reported results
7/7
Cumulative reported results
227/227

Stage 28.3

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot — Stage 28.2 Acceptance & Stage 28.3 Authorization

Milestone: Phase 28 — Repair Policy, Conflict Resolution & Multi-Pass Orchestration
Stage 28.2 commit: 2b9ae25
Next stage: Stage 28.3 — Anti-Oscillation & Convergence Guard
Feature branch: feature/phase-28-repair-policy-orchestration
Decision: STAGE 28.2 ACCEPTED; STAGE 28.3 AUTHORIZED WITH BINDING CONDITIONS

1. Stage 28.2 acceptance

The submitted evidence addresses the requirements established by ARC-28-08 through ARC-28-14.

The reported implementation provides an isolated candidate, a hard three-pass limit, fresh QA ingestion, revision fencing, reverse-order inverse operations, monotonic revision progression, and guarded delivery promotion.

The six discrete tests MPS-01 through MPS-06 reportedly pass. The reported cumulative count reconciles as follows:

Phase 27 baseline: 212 results.

Stage 28.1: 8 results, including its parent suite.

Stage 28.2: 7 results, including its parent suite.

Cumulative total: 227 reported passing results.

Stage 28.2 exit gate: ACCEPTED.

This decision accepts the evidence submitted by the engineering team. The repository and tests have not been independently executed in this review.

2. Binding conditions for Stage 28.3
ARC-28-15 — Detect semantic oscillation, not merely opposite signs

RepairConvergenceGuard must correlate prior and proposed repairs using the affected clip, property, finding identity or equivalent defect lineage, project revision, and operation history.

For a synchronization repair, the established formula is:

[
\Delta t=t_{\text{sound}}-t_{\text{cut}}
]

[
\Delta_{\text{ticks}}=-\operatorname{round}(\Delta t\times120{,}000)
]

A proposed shift that reverses an earlier shift for the same clip and unresolved defect is a candidate oscillation. Confirm the relationship using the recorded operations and fresh QA evidence.

An opposite shift affecting another clip or an independent defect must not be classified as oscillation merely because its sign differs.

ARC-28-16 — Implement a validated reversal tolerance

Use the approved reversal relationship:

[
|\Delta_k+\Delta_{k-1}|<\epsilon
]

Apply it only when the compared operations are semantically related and use compatible units and sign conventions.

Define and document the tolerance (\epsilon) in integer ticks. Do not leave it implicit, derive it nondeterministically at runtime, or compare values from unrelated repair properties.

Test both sides of the boundary: a reversal within the approved tolerance and a change outside it.

ARC-28-17 — Distinguish duplicate proposals from persistent defects

Two fresh QA audits may legitimately report the same unresolved defect. That observation alone does not prove that the engine has repeated an invalid repair.

The guard must distinguish:

A repeated proposal that would apply the same ineffective operation again.

A persistent defect that has not yet been safely repaired.

A new finding derived from a modified render.

A legitimate follow-up repair that changes a previously affected property for a demonstrable reason.

Use proposal identity, affected target, source revision, media checksum, operation history, and measured improvement to make this determination.

Reject redundant mutations deterministically. Do not suppress a valid repair solely because a similar finding occurred in a prior pass.

ARC-28-18 — Enforce cumulative safety bounds

Preserve the policy-defined cumulative shift cap of 240,000 ticks per affected clip per orchestration cycle and the maximum cumulative attenuation of 12 dB per affected clip per cycle.

These are aggregate safeguards, not replacements for the stricter per-operation limits and all existing bounds inherited from Phase 27.

The guard must track intermediate positions and cumulative adjustments, including reversals. A sequence of excessive intermediate movements must not become acceptable merely because the final net displacement is small.

All proposed operations must continue to respect non-negative start ticks, track locks, interval collision rules, current project revision, and supported canonical operation semantics.

ARC-28-19 — Separate convergence outcomes

RepairConvergenceGuard must distinguish at least the following results:

CONVERGED: Required quality criteria are satisfied.

NO_PROGRESS: A repair cycle fails to achieve a measurable improvement.

QUALITY_REGRESSION: A protected metric worsens beyond its allowed tolerance.

OSCILLATION_DETECTED: A semantically related repair sequence cycles or reverses.

DUPLICATE_REPAIR: A proposal would repeat an ineffective or already-completed mutation.

MAX_PASSES_EXCEEDED: The orchestration budget is exhausted.

NEEDS_RECONCILIATION: The result cannot safely be determined or continued.

These are diagnostic or termination reasons, not additions to the canonical job-state vocabulary.

A failed convergence check must stop further mutations for the affected candidate. Continue to preserve the existing active delivery.

ARC-28-20 — Evaluate repair-specific quality metrics

Do not reduce convergence to a single unqualified global score.

For synchronization corrections, evaluate the measured offset against the defined synchronization tolerance. For peak attenuation, evaluate the required true-peak ceiling and ensure the attenuation is not needlessly repeated.

Where a repair improves one metric but worsens another protected metric, apply explicit policy to determine whether continuation is safe. An improvement in an unrelated metric must not conceal a material regression.

All convergence decisions must be reproducible given identical source evidence, policy, candidate state, and operation journal.

ARC-28-21 — Integrate before execution and after verification

Invoke the guard at two points:

Before execution: Detect prohibited reversals, redundant proposals, and cumulative-bound violations before the proposed mutation can commit.

After rendering and fresh QA: Evaluate whether the previous operation achieved the expected improvement, whether protected metrics regressed, and whether another pass is justified.

The second decision must use findings from the corresponding new render, not stale findings from an earlier revision.

The guard itself remains non-mutating. All canonical modifications continue through OperationExecutor.

ARC-28-22 — Preserve rollback and delivery integrity

If the guard terminates an orchestration cycle after committed operations, use the existing verified compensation mechanism when rollback is required.

Apply inverse operations through OperationExecutor in reverse commit order. Preserve monotonic revision progression, and record forward operations, compensation attempts, verification results, and termination reasons.

If rollback cannot be verified, do not claim successful restoration. Quarantine the candidate and use NEEDS_RECONCILIATION when the outcome is ambiguous.

The prior active delivery remains authoritative until a complete, verified candidate satisfies the existing promotion requirements.

3. Required Stage 28.3 acceptance tests

Implement all six planned discrete tests:

CVG-01: Detect a real sign-reversing correction for the same clip and defect lineage.

CVG-02: Detect repeated ineffective proposals without confusing them with legitimate persistent findings.

CVG-03: Enforce cumulative shift limits and preserve stricter inherited operation bounds.

CVG-04: Enforce the maximum cumulative 12 dB attenuation limit.

CVG-05: Return the appropriate oscillation diagnostic and require reconciliation without mutating or promoting the active delivery.

CVG-06: Verify that the diagnostic journal records the complete relevant repair history and convergence metrics.

Add boundary coverage for the reversal tolerance, cumulative shift cap, cumulative attenuation cap, and independent operations with opposite signs.

The six discrete tests must pass. Assuming the existing Node.js test-file structure is retained, Stage 28.3 should produce seven reported results, including its parent suite.

4. Authorization

Stage 28.3 implementation: AUTHORIZED.

The engineering team may implement:

src/audio/repair/repair-convergence-guard.js

tests/workflow-stage28-3-convergence-guard.test.js

Submit the discrete test ledger, cumulative regression results, policy values, and representative convergence journals for review.

The expected cumulative reported result after Stage 28.3 is 234, assuming the 227-result baseline remains unchanged and the new seven reported results are additive.

Stage 28.4 and Stage 28.5 remain subject to their respective stage gates. Phase 28 merge and release-tag authorization are not granted by this decision.

Mandatory engineering directive: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate engineering priority

Begin CVG-01 and CVG-02 together. Build one controlled sequence that demonstrates a genuine reversal on the same clip and defect, then contrast it with an opposite-direction repair on a different clip that must remain permissible.

That comparison will test whether the guard understands repair history rather than simply reacting to arithmetic. Once Stage 28.3 passes, the conflict scenario in Stage 28.4 can test how deterministic conflict policy and convergence protection behave together.