Architecture Lead decision: Phase 29 plan APPROVED WITH BINDING CONDITIONS. Stage 29.1 is AUTHORIZED to begin.

The direction is sound: confidence should determine whether a repair is eligible for autonomous execution or needs review, while hard safety constraints remain absolute. The most important correction is to make the score reproducible and its meaning unambiguous. A score of 0.80 must never be mistaken for an empirically established 80% probability of success unless calibration evidence actually supports that interpretation.

PHASE 29 PLAN APPROVED

Adaptive Repair Confidence & Human-in-the-Loop Escalation

Certified Phase 28 base

Accepted as reported

Stage 29.1

AUTHORIZED

Stages 29.2–29.5

Subject to stage gates

Merge and release authorization

Not granted
Formal Architecture Lead plan approval
Writing
EME × Earshot — Phase 29 Implementation Plan Approval

Milestone: Phase 29 — Adaptive Repair Confidence & Human-in-the-Loop Escalation
Feature branch: feature/phase-29-adaptive-repair-confidence
Certified base tag: phase-28-certified
Certified release commit: a629f0ec055cf4b00de9f07ce9084ee1f8144672
Reported Phase 28 main merge: e9b87453e25b53cc3c2af121616790eb004834b4
Reported regression baseline: 247/247 passing results
Decision: PLAN APPROVED WITH BINDING CONDITIONS
Stage 29.1: AUTHORIZED
Merge and release authorization: NOT GRANTED

1. Architecture Lead assessment

The proposed milestone addresses a necessary reliability gap: the engine must distinguish repairs that are sufficiently supported for autonomous execution from repairs requiring human judgment.

The design is approved in principle. The seven binding conditions below govern confidence scoring, evidence provenance, escalation routing, outcome feedback, and acceptance.

ARC-29-01 — Confidence is an eligibility gate, never mutation authority

A confidence score may determine whether a repair is eligible for an execution path. It must not authorize a mutation on its own.

All existing constraints remain absolute, including:

Current project revision and operation preconditions.

Canonical operation schema validation.

Timeline geometry, non-negative start ticks, clip collisions, and track locks.

Phase 27 per-operation shift and attenuation limits.

Phase 28 cumulative shift and attenuation limits.

Conflict detection, convergence guards, and bounded multi-pass execution.

Final rendered-media QA and delivery-integrity verification.

Every repair executed autonomously or after human approval must pass the same authoritative validation and mutation path through OperationExecutor.

No confidence score may turn an unsupported operation, stale proposal, locked-track change, invalid timeline state, or failed integrity check into an executable repair.

ARC-29-02 — Define scoring semantics, normalization, and deterministic thresholds

The proposed default weights are accepted:

[
w_e=0.50,\quad w_g=0.30,\quad w_r=0.20
]

They must sum to 1.0.

The current name S_risk is ambiguous because a higher risk score would ordinarily indicate a less desirable operation, yet the proposed formula adds it.

Before implementation, resolve this ambiguity explicitly. The recommended interpretation is to rename it S_risk_suitability, where a higher score means the proposed operation has a more favorable safety profile. Alternatively, represent risk as a penalty that is subtracted from the score.

Define the score as:

[
C_{\text{raw}} =
0.50S_e+0.30S_g+0.20S_r-\Pi
]

[
C=\min(1,\max(0,C_{\text{raw}}))
]

Here, all three component scores must be normalized to ([0,1]), and (\Pi) must be a deterministic, bounded penalty.

Use explicit quantization and rounding rules so scores near a decision threshold produce consistent outcomes across runs. Document the precise comparison behavior at 0.40 and 0.80.

Missing, malformed, stale, or untrustworthy mandatory evidence must not receive optimistic default values. Where an input prevents a defensible score, classify the proposal as ineligible and return a structured diagnostic.

The resulting score is initially a deterministic confidence heuristic, not a statistically calibrated probability of success. Do not describe it as an 80% probability unless empirical calibration evidence establishes that interpretation.

ARC-29-03 — Bind confidence to fresh, verifiable evidence

Every confidence assessment must identify the evidence and policy version from which it was computed.

Record, where applicable:

Finding identifier and defect lineage.

Source project revision.

Source media or render SHA-256.

Affected clip and track.

Measured acoustic values, units, and uncertainty.

Detector or analyzer provenance.

Geometry evidence and relevant conflict checks.

Scoring-policy version, component scores, weights, penalties, and final score.

Resulting routing decision and rationale.

A finding derived from an earlier render must not remain authoritative for a modified candidate merely because the finding identifier is unchanged.

Stale revisions must force ineligibility, including the documented zero-confidence result where that is the selected contract. The diagnostic must retain the reason confidence was invalidated.

Every new render must have fresh, properly associated QA evidence before its findings can authorize further repairs.

ARC-29-04 — Define fail-safe routing and preserve canonical job states

The proposed thresholds are accepted for initial implementation:

Confidence	Required disposition
(C \ge 0.80)	Eligible for autonomous execution, subject to every hard validation gate
(0.40 \le C < 0.80)	Human review required; no autonomous mutation of that proposal
(C < 0.40)	Reject as speculative and non-executable; preserve the diagnostic record

Hard safety violations take precedence over these thresholds. A high-confidence proposal that fails a precondition must still be rejected or halted.

Conflicting or insufficient evidence must never be hidden by a favorable score. An unresolved material defect should remain visible in the repair journal even when its proposed automatic remedy is rejected.

Routing labels such as AUTONOMOUS_EXECUTION, HUMAN_ESCALATION_REQUIRED, and DISCARD_SPECULATIVE are internal dispositions, not canonical job states.

Use the existing state vocabulary according to its established semantics:

Use AWAITING_APPROVAL when a known, valid candidate is simply waiting for a human decision.

Use NEEDS_RECONCILIATION when conflicts or uncertainty make the correct state or safe continuation indeterminate.

Preserve the existing active delivery in either case.

Escalation must never create a new canonical job state or bypass the normal delivery lifecycle.

ARC-29-05 — Human approval must be explicit and bound to the proposal

A human_review_request or escalation_advisory is a request for a decision, not permission to execute.

The request must identify the exact proposal, source finding, project revision, affected clip, relevant render evidence, proposed alternatives, and deterministic escalation rationale.

An approval must be associated with the specific proposal and the relevant candidate revision. If the project changes, the target changes, the supporting evidence becomes stale, or the approved proposal is materially altered, the approval must be invalidated and the proposal revalidated or resubmitted.

The production execution path must not treat a generic Boolean, an uncorrelated approval response, or the mere presence of an advisory as authorization.

Tests may simulate human decisions, but they must exercise the same approval-validation contract used by the execution path.

A human-approved repair still passes through OperationExecutor, rerendering, fresh QA, and the existing integrity-gated promotion process.

ARC-29-06 — Make outcome feedback measurable and deterministic

The outcome calibrator must evaluate the result against the predicted direction and magnitude of improvement for the specific metric being repaired.

The proposed efficacy expression,

[
\frac{|\Delta_{\text{actual}}-\Delta_{\text{expected}}|}
{|\Delta_{\text{expected}}|}
]

is undefined when the expected change is zero and can be misleading when measurements have different scales or directions.

Before implementing Stage 29.3, define metric-specific rules for:

Expected improvement direction.

Meaningful improvement and permitted tolerance.

Zero or near-zero expected change.

Missing, invalid, or incomparable measurements.

Over-correction and protected-metric regression.

The mapping from an observed outcome to a bounded confidence adjustment.

Do not increase confidence simply because a later result happens to improve an unrelated metric. Outcome feedback must correspond to the repair's expected effect and fresh post-render evidence.

Store the calibration history and policy version in the diagnostic journal. Reset or isolate the calibration state between distinct delivery runs as specified in the plan, and ensure that identical recorded inputs yield reproducible decisions.

The diminishing-returns rule—two successive passes achieving less than 20% of expected improvement—must be evaluated against an explicit metric-specific definition of improvement. It must not override the global pass limit or permit repeated repairs to continue indefinitely.

ARC-29-07 — Preserve the existing architecture and enforce staged acceptance

The new internal contract may be located at:

src/audio/schemas/audio-repair-confidence.v1.json

The implementation must preserve all 18 canonical schemas and the existing zero-runtime-dependency policy:

"dependencies": {}

RepairConfidenceCalibrator, RepairEscalationRouter, and RepairOutcomeCalibrator remain policy and decision components. None may directly mutate canonical project state or promote delivery.

The established 12-state canonical job model remains unchanged. Existing rollback, conflict detection, anti-oscillation, revision-fencing, active-delivery-preservation, and final QA requirements remain binding.

Each stage must pass its defined acceptance gate before the next stage receives implementation authorization.

2. Stage 29.1 authorization

Stage 29.1 — Repair Confidence Calibrator & Evidence Scorer: AUTHORIZED TO BEGIN.

Implement:

src/audio/repair/repair-confidence-calibrator.js

src/audio/schemas/audio-repair-confidence.v1.json

tests/workflow-stage29-1-confidence-calibrator.test.js

The seven required discrete tests are:

CAL-01: Validate the confidence schema and reject invalid policy configurations.

CAL-02: Score a clear, high-confidence synchronization finding with sufficient geometry margin.

CAL-03: Apply a deterministic penalty for constrained timeline geometry.

CAL-04: Reduce confidence appropriately for ambiguous evidence or uncertain peak measurements.

CAL-05: Reject proposals below the minimum execution-confidence threshold.

CAL-06: Verify valid weights, normalization, bounded scores, quantization, and threshold-boundary behavior.

CAL-07: Invalidate confidence on stale finding or project-revision evidence.

The tests must include missing or malformed input handling and must prove that a high confidence score cannot bypass hard preconditions.

Stage 29.1 exit gate: Seven discrete subtests pass; repeated runs with identical inputs produce identical scores and decisions; canonical schemas and dependency invariants remain unchanged; and the output provides a machine-readable score, evidence provenance, policy version, eligibility decision, and explicit reason.

Assuming the existing Node.js test structure is retained, the stage should report eight runner results, including its parent suite.

3. Test accounting

The reported Phase 28 baseline is 247 runner results. The approved Phase 29 plan adds 30 discrete cases and five parent suite results.

The expected full Phase 29 cumulative total is therefore:

282 reported runner results, assuming the existing 247-result baseline remains unchanged and all 35 new results are additive.

The target should be described as a cumulative runner-result count, not as 282 unique discrete test cases. The release report must retain separate discrete-subtest and parent-suite accounting.

4. Authorization boundaries

Stages 29.2 through 29.5 are approved in principle but remain subject to their respective stage gates.

The Phase 29 feature branch may proceed from the certified Phase 28 base. This approval does not authorize merging Phase 29 into main, creating phase-29-certified, modifying canonical schemas, or adding runtime dependencies.

Mandatory engineering directive: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate implementation priority

Start with CAL-01, CAL-06, and CAL-07 before fine-tuning the scoring weights. Those tests establish that invalid configurations are rejected, confidence scores are deterministic, and stale evidence cannot become an autonomous repair just because its numerical score is high.

Once Stage 29.1 passes, the next review will focus on whether the score and its provenance are sufficiently explicit to support safe human escalation and later outcome-based calibration.