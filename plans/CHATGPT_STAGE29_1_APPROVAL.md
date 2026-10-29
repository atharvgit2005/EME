Architecture Lead decision: Stage 29.1 ACCEPTED. Stage 29.2 AUTHORIZED WITH BINDING CONDITIONS.

The reported results satisfy the Stage 29.1 exit gate: seven discrete tests pass, repeated executions produce deterministic scores and dispositions, and the cumulative regression count reconciles to 
247
+
8
=
255
247+8=255 reported passing results.

The most important achievement is that confidence is now separated from mutation authority. Stage 29.2 must preserve that separation: an escalation advisory requests a decision; it does not authorize an operation.

STAGE 29.1 ACCEPTED

Repair Confidence Calibrator & Evidence Scorer

PASS
Discrete subtests
7/7
Reported stage results
8/8
Cumulative reported results
255/255

Stage 29.2

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot — Stage 29.1 Acceptance & Stage 29.2 Authorization

Milestone: Phase 29 — Adaptive Repair Confidence & Human-in-the-Loop Escalation
Stage 29.1 commit: b6257b6
Next stage: Stage 29.2 — Human-in-the-Loop Escalation Router & Advisory Generator
Feature branch: feature/phase-29-adaptive-repair-confidence
Decision: STAGE 29.1 ACCEPTED; STAGE 29.2 AUTHORIZED WITH BINDING CONDITIONS

1. Stage 29.1 acceptance

The submitted evidence satisfies the Stage 29.1 exit gate.

The implementation reports:

A versioned internal confidence-policy schema with weight and threshold validation.

Deterministic scoring with normalized components, bounded output, and four-decimal quantization.

Hard-precondition validation that confidence cannot override.

Immediate confidence invalidation for stale finding or project-revision evidence.

Explicit autonomous, human-escalation, and speculative-rejection dispositions.

Machine-readable assessments containing policy identity, scoring components, penalties, and rationale.

Seven passing discrete tests, with repeat executions producing identical scores and decisions.

The reported cumulative regression total is arithmetically consistent: 247 baseline results plus eight Stage 29.1 runner results equals 255.

Stage 29.1 exit gate: ACCEPTED.

This acceptance is based on the submitted evidence. The repository and test suite have not been independently executed during this review.

2. Binding conditions for Stage 29.2
ARC-29-08 — Routing must not confer mutation authority

RepairEscalationRouter is a policy and advisory component, not a project mutation authority.

The router may classify a proposal as:

AUTONOMOUS_EXECUTION

HUMAN_ESCALATION_REQUIRED

DISCARD_SPECULATIVE

These are internal routing dispositions, not canonical job states.

For autonomous routing, a high confidence score is necessary but insufficient. The proposal must still pass current-revision validation, conflict detection, convergence safeguards, supported-operation checks, and all other established execution preconditions.

A low-confidence proposal must not be executed merely because it belongs to a batch containing other high-confidence proposals.

ARC-29-09 — Bind every review request to an exact proposal and revision

Every human_review_request must include enough information to identify precisely what requires approval:

Request identifier and proposal identifier.

Source finding and defect lineage.

Candidate project revision.

Source media or render identity, including SHA-256 where applicable.

Target clip and track.

Confidence score, component breakdown, and policy version.

Relevant acoustic evidence and uncertainty.

Conflict or geometry diagnostics, if applicable.

Suggested repair alternatives and deterministic rationale.

Expiration or invalidation conditions for the approval.

Use stable identifiers and a machine-readable contract. The request must not rely on a mutable clip label, a free-form message, or a confidence number alone to identify the proposed action.

Large waveform data need not be embedded in the advisory when a stable, verifiable reference and relevant measurements provide sufficient evidence.

ARC-29-10 — Human approval must be explicit, scoped, and revocable

An approval must apply to the specific proposal and candidate revision described by the request.

Before executing an approved action, validate that:

The request exists and is eligible for a decision.

An explicit authorized approval has been recorded.

The approved action matches the proposed action.

The candidate revision and relevant supporting evidence remain current.

All current canonical preconditions still pass.

If the project changes, the evidence becomes stale, the target changes, or the approved operation is materially modified, invalidate the approval and request a new decision or revalidation.

A test-injected approval is acceptable for deterministic testing, but it must exercise the same approval-validation contract used by the real execution path. The existence of an advisory, a nonempty response, or a generic Boolean must never itself authorize execution.

ARC-29-11 — Separate waiting for approval from reconciliation

Use the established canonical states according to their existing semantics.

Use AWAITING_APPROVAL when a valid candidate is simply waiting for a human decision.

Use NEEDS_RECONCILIATION when conflicting evidence, invalidated preconditions, or an ambiguous execution outcome prevents safe continuation.

Do not invent a new canonical job state to represent human escalation.

A routed advisory may carry its own noncanonical disposition and request lifecycle metadata, but this metadata must not redefine the canonical job-state model.

The prior active delivery remains authoritative and unchanged while a repair awaits approval.

ARC-29-12 — Define safe behavior for mixed-confidence batches

A batch may contain autonomous-eligible, human-review, and speculative proposals.

The router must classify each proposal deterministically and partition the batch without deadlock.

An autonomous-eligible subset may proceed only when:

The existing policy permits subset execution.

The subset is independent of the escalated proposals.

Its combined timeline and property effects are safe.

Execution does not invalidate the evidence or approval requirements of the remaining proposals.

If a pending escalated proposal could conflict with or change the outcome of the autonomous subset, halt the affected combined operation rather than executing it prematurely.

The existence of an escalated item does not automatically require all unrelated work to stop. However, the router must not promote a candidate whose remaining unresolved findings violate required delivery acceptance criteria. Preserve the previous active delivery until a complete, eligible candidate passes the normal promotion gates.

ARC-29-13 — Treat advisory choices as proposals, not executable instructions

Suggested options—such as retiming, moving a clip, or leaving a defect unchanged—must reference supported repair strategies and clearly explain their expected effects and known risks.

The router must not invent canonical operations or assume that a suggested track move is permitted.

Human approval of an unsupported option must return the proposal for safe rejection or further planning. It must not expand the canonical operation vocabulary, bypass OperationExecutor, or bypass timeline, lock, revision, conflict, or convergence validation.

A decision to ignore a defect must be recorded explicitly, with the unresolved finding retained in the audit record. It must not silently convert failed QA into successful QA.

ARC-29-14 — Preserve advisory and decision provenance

The diagnostic journal must retain:

Original finding and evidence identity.

Confidence assessment and policy version.

Router disposition and rationale.

Review request identifier and the available alternatives.

Approval or rejection decision and its scope.

Candidate revision at review time and at execution time.

Final precondition-validation result.

Executed operation outcome, if any.

Subsequent render, QA, and delivery disposition.

Rejected or expired proposals must remain auditable. Repeated identical inputs must produce deterministic routing decisions, subject to the same recorded policy and evidence.

No advisory or approval event may directly mutate canonical project state or promote a delivery.

3. Required Stage 29.2 acceptance tests

Implement all six discrete tests:

ESC-01: High-confidence proposal enters the autonomous-eligible route only when all mandatory preconditions pass.

ESC-02: Moderate-confidence proposal is routed to human review with autonomous execution withheld.

ESC-03: The review advisory satisfies the schema and includes complete proposal provenance, alternatives, and rationale.

ESC-04: A mixed-confidence batch is partitioned deterministically, with dependent or conflicting actions safely withheld.

ESC-05: The previous active delivery remains unchanged while a proposal is waiting for review.

ESC-06: A review request leads to the appropriate existing state and cannot bypass approval, revision fencing, OperationExecutor, or reconciliation safeguards.

Add explicit cases for stale approval, approval of a materially altered operation, and rejection of an unsupported repair option. These may be additional subtests within the six required test areas.

The six discrete tests must pass. Assuming the established Node.js test structure is retained, Stage 29.2 should contribute seven reported runner results, including its parent suite.

4. Stage authorization

Stage 29.2 implementation: AUTHORIZED.

The engineering team may implement:

src/audio/repair/repair-escalation-router.js

tests/workflow-stage29-2-escalation-router.test.js

Submit the discrete test ledger, cumulative regression report, sample advisory payloads, and evidence that an advisory cannot independently authorize a mutation.

The expected cumulative reported count after Stage 29.2 is 262, assuming the existing 255-result baseline remains unchanged and the new seven runner results are additive.

Stages 29.3 through 29.5 remain subject to their respective gates. Phase 29 merge and certification-tag authorization are not granted by this decision.

Mandatory engineering directive: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate engineering priority

Implement ESC-03 and ESC-06 first. Together, they prove that the advisory accurately identifies the proposed action and that neither the advisory nor a stale or mismatched approval can turn into an unauthorized mutation.

Once that boundary is demonstrated, ESC-04 can establish safe handling of mixed-confidence batches without unnecessarily blocking independent repairs or promoting an incomplete candidate.