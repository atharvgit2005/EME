# ChatGPT Architecture Lead: Phase 19 Stage 19.0 Review & Stage 19.1 Directive

**Date**: 2026-10-20T18:16:51.754Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.0 Review & Stage 19.1 Kickoff Directive  

---

EME Phase 19 (RT-01) — Stage 19.0 Architecture Review
Stage 19.0: ACCEPTED WITH DESIGN GATES

Repository Audit, Workflow Baseline & Integration Contract

Stage 19.1: AUTHORIZED

End-to-End Workflow Contract & Orchestration

The audit establishes useful source-level boundaries across ingestion, planning, canonical project operations, job management, verification, rendering, and publication. It also identifies the three integration problems that should drive the next stage:

Competing Phase 14B and PF-11 job lifecycle models.

The direct /api/render path bypassing the complete QA and manifest publication flow.

Manual Visual Control Surface edits not automatically appearing in the revision session's history DAG.

Stage 19.1 is authorized, beginning with the lifecycle contract and compatibility mapping—not a broad rewrite of both job managers.

Three design questions must be resolved before the unified lifecycle is migrated into production code:

The proposed 12-state model omits RECOVERING as a top-level state but refers to it in transitions.

Cancellation rules differ across the lifecycle table and failure matrix, especially after execution has begun.

Atomic multi-operation rollback must be reconciled with monotonic revision semantics so a failed workflow cannot leave partial changes or move the canonical revision backward.

These issues do not block Stage 19.1. They define its first architecture gates.

The decision below is based on the audit supplied in your message; I have not independently inspected the repository or rerun its tests.

Writing
EME Phase 19 — Stage 19.1 Implementation Directive

Milestone: RT-01 — End-to-End Workflow Integration & Final Delivery
Stage: 19.1 — End-to-End Workflow Contract & Orchestration
Authorization: GO, subject to the mandatory design gates below
Prerequisite: Stage 19.0 accepted with the identified lifecycle and transaction-contract issues assigned for resolution
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Objective

Integrate the existing request-ingestion, planning, job-management, and orchestration components into one explicit workflow contract without replacing the deterministic engine or creating competing authorities.

A valid request must move through a traceable lifecycle:

Request accepted → Intent and context validated → Plan constructed → Plan approved or clarified when required → Ready to execute → Deterministic execution → Post-execution verification → Rendering → Media verification → Delivery publication → Succeeded

A request that cannot safely progress must remain blocked, fail with a specific reason, or enter reconciliation. It must never be labeled successful merely because an API returned HTTP 200 or a render process exited successfully.

Stage 19.1 establishes the job lifecycle and pre-execution orchestration contract. The execution transaction details, closed-loop recovery implementation, verified delivery gates, and unified MCP tools continue through Stages 19.2–19.5 respectively.

2. Stage 19.1A — Lifecycle Contract and Transition Design

Before migrating the implementation, author:

plans/PHASE_19_STAGE1A_LIFECYCLE_CONTRACT.md

The contract must reconcile the existing Phase 14B and PF-11 status models with the approved 12-state logical model.

2.1 Authoritative 12-state model

The canonical logical states are:

ACCEPTED

PLANNING

AWAITING_APPROVAL

READY_TO_EXECUTE

EXECUTING

VERIFYING

RENDERING

PUBLISHING

SUCCEEDED

FAILED

CANCELLED

NEEDS_RECONCILIATION

Do not introduce RECOVERING as an additional top-level state without a separate architecture decision. Instead, model recovery activity using explicit metadata under NEEDS_RECONCILIATION, including recovery status, attempt number, source checkpoint, and outcome.

If repository inspection establishes a compelling reason for a distinct recovery state, propose the additional state and its transition contract before altering the canonical model. Do not call a 13-state implementation a 12-state model.

2.2 Required transition rules

Use the following as the initial approved transition contract. Existing callers may be supported through compatibility adapters, but the authoritative logical transitions must remain coherent.

Current state	Allowed next state(s)	Conditions
ACCEPTED	PLANNING, FAILED, CANCELLED	Request identity and basic context established
PLANNING	AWAITING_APPROVAL, READY_TO_EXECUTE, FAILED, CANCELLED	Valid plan produced, or explicit blocker recorded
AWAITING_APPROVAL	PLANNING, READY_TO_EXECUTE, FAILED, CANCELLED	Clarification triggers replanning; approval proceeds only if the plan remains valid
READY_TO_EXECUTE	EXECUTING, CANCELLED	Plan, approval requirements, and base revision revalidated
EXECUTING	VERIFYING, FAILED, NEEDS_RECONCILIATION	Operation results and transaction disposition established
VERIFYING	RENDERING, FAILED, NEEDS_RECONCILIATION	Project-level or rendered-media verification decides whether to progress
RENDERING	VERIFYING, FAILED, CANCELLED, NEEDS_RECONCILIATION	Output completion, process termination, and outcome known
PUBLISHING	SUCCEEDED, FAILED, NEEDS_RECONCILIATION	Manifest, integrity, and publication outcome established
NEEDS_RECONCILIATION	A justified continuation state or FAILED	Recovery evidence establishes the authoritative outcome
SUCCEEDED	None	Terminal and immutable
FAILED	None	Terminal; a retry creates a new job linked to the original
CANCELLED	None	Terminal after cancellation outcome is established

The table is a contract, not permission to transition arbitrarily. Validate transitions server-side and persist each accepted transition with a timestamp, reason, relevant revision, and job sequence.

For full delivery workflows, the normal successful path must include rendering, rendered-media verification, and publication. If other workflow types can complete without producing a delivery, define that as a separate documented workflow profile rather than silently skipping required RT-01 gates.

2.3 Approval versus clarification

AWAITING_APPROVAL has two distinct reasons: the user must approve an existing valid plan, or the system needs more information.

Represent the reason explicitly, for example with awaitingReason: "approval" | "clarification" where compatible with current contracts.

Approval without changing the request may proceed to READY_TO_EXECUTE only after confirming that the plan hash and base project revision remain valid.

A clarification that changes targets, constraints, timing, or requested edits must return to PLANNING.

A plan that has become stale must be recompiled or rejected, not approved against a newer project revision.

A blocked request must not mutate canonical project state.

2.4 Recovery is activity, not unexplained state mutation

While a job is in NEEDS_RECONCILIATION, recovery should record its progress and findings without creating undocumented transitions.

Recovery may move the job to a continuation state only after evidence establishes the previous execution outcome. For example:

A verified project commit may resume at VERIFYING.

A confirmed complete render awaiting integrity checks may resume at the appropriate verification or publication step.

An uncertain publication must be reconciled against the durable manifest and active_delivery before it can be marked successful.

An unrecoverable or unsupported outcome terminates in FAILED with explicit diagnostics.

A late callback must not overwrite a terminal state. A recovery transition is allowed only through the authoritative recovery controller after it verifies the persisted outcome.

3. Stage 19.1B — Existing Job Manager Compatibility

The audit identifies two historical lifecycle implementations:

src/orchestration/job-manager.js — Phase 14B.

src/prompt-core/job-orchestrator.js — PF-11, including OrchestrationJobManager and EndToEndOrchestrator.

Keep OrchestrationJobManager as the active authority where current EditorBackend and workflow paths already depend on it, unless the audit proves that another existing component is the necessary authoritative owner.

Do not independently evolve both state machines.

Required work:

Define a single logical transition validator.

Introduce a narrow compatibility mapping for legacy status names such as COMMITTED, COMPLETED, QA_EVALUATING, and RECOVERING.

Map legacy terminal-success values to logical SUCCEEDED at the compatibility boundary.

Preserve historical job files and existing CLI/API behavior wherever possible.

Version and migrate persistent status formats only where genuinely required and explicitly tested.

Ensure transition validation is shared across job creation, execution, recovery, polling, and persistence.

Preserve durable job IDs and idempotency-key lookup across process restarts.

If Phase 14B is no longer needed by an active path, document that fact. Do not delete or bypass it merely because it duplicates functionality.

Exit gate: Both legacy-facing contracts map consistently to the canonical lifecycle, and no delayed callback or alternate code path can bypass transition validation.

Deliverable: plans/PHASE_19_STAGE1B_JOB_COMPATIBILITY_REPORT.md

4. Stage 19.1C — Request Intake, Preflight and Non-Mutating Planning

Integrate the existing ingestion pipeline:

ContextNormalizer

ReferenceResolver

ConstraintNormalizer

ReadinessEvaluator

BriefValidator

OperationPlanCompiler

MultiTrackScheduler

Re-use established implementations rather than writing another intent interpreter or planner.

For every request:

Capture an immutable request identity and project/session context.

Bind the request to a canonical project snapshot and its base revision.

Resolve referenced clips, tracks, assets, and other targets.

Normalize constraints and identify explicit prohibitions.

Evaluate ambiguity, conflicting instructions, missing assets, and stale revisions.

Validate the structured brief against the existing schema.

Compile an inspectable declarative operation plan.

Dry-run the plan against an isolated project candidate.

Persist or otherwise expose the plan and its hash before execution.

Determine whether approval or clarification is needed.

Enter READY_TO_EXECUTE only after the required conditions are met.

Planning and dry-run must leave the authoritative project, revision, Undo/Redo stacks, and active delivery untouched.

Every plan must retain the request identity, base revision, hard constraints, operation list, and a reproducible plan hash. Any amendment that changes the operations must produce a new plan identity/hash according to the documented contract.

Do not infer approval merely because the user submitted a request. Honor the repository's established approval policy.

Exit gate: Requests are either rejected with actionable errors, held for clarification/approval, or converted into valid executable plans. Planning creates zero project mutations.

Deliverable: plans/PHASE_19_STAGE1C_PREFLIGHT_REPORT.md

5. Stage 19.1D — Workflow API, Job Tracking and Status Projection

Reuse the existing job endpoints and orchestration interfaces identified in the audit.

At minimum, establish the request contract for:

Creating or accepting a workflow job.

Retrieving job status and state history.

Inspecting the proposed plan and its base revision.

Submitting approval or clarification where applicable.

Requesting cancellation subject to the documented cancellation boundary.

Identifying the resulting project revision, delivery run, manifest, and output once available.

The existing POST /api/jobs and job-status APIs should be extended through compatible contracts where possible. Do not create a second endpoint family with a duplicate job store just to expose the new states.

A status response must distinguish job state from operation, project, and delivery state. A job that has committed project edits but has not rendered successfully must not show a new verified delivery.

Use the durable job identifier and established idempotency key to support status polling and reconnection. Preserve the distinction between the process-local HTTP operation cache and durable workflow-job idempotency.

Exit gate: A caller can submit a request, retrieve the same job, inspect its plan/status, and obtain a truthful result without creating duplicate jobs or mutations.

Deliverable: plans/PHASE_19_STAGE1D_API_CONTRACT_REPORT.md

6. Stage 19.1E — Revision Lineage and Cancellation Contract
6.1 Manual timeline edit lineage

The audit identified a gap: direct Visual Control Surface mutations update canonical project revision but may not automatically appear in the active session's revision DAG.

Define and implement the contract for representing manual edits in the session's revision lineage. A manual edit must be recorded with its actual origin, operation identity, before/after revision, and canonical outcome where the current schema supports those fields.

Do not fabricate a conversational prompt, plan hash, manifest, or delivery run to make a manual edit appear to be a prompt-driven job. If the existing revision-session schema cannot represent manual changes honestly, propose a versioned session-schema extension or a compatible external revision-event record before changing the persisted schema.

Before compiling an automated request, the workflow must compare its snapshot/base revision with the current canonical project. It must either reconcile the latest revision lineage or fail closed on a stale snapshot.

This contract must preserve the active-delivery pointer independently of project-history updates.

6.2 Cancellation

Define cancellation as a request that must be resolved safely at a valid boundary, not an unconditional interruption.

Before execution begins, cancellation may transition directly to CANCELLED if no project mutation or external side effect has occurred.

During execution, finish the current atomic operation. Do not interrupt it halfway through a mutation.

For an atomic multi-operation plan, use the documented transaction journal to roll back the staged transaction safely if cancellation requires it.

For a non-atomic plan with already committed operations, report the committed steps and remaining state truthfully. Use reconciliation if the final state or operation outcome cannot yet be established.

During rendering, stop the renderer only through the supported process-control path, verify termination, clean up incomplete artifacts safely, and confirm publication did not occur before reporting cancellation.

If publication may have succeeded but the response was lost, reconcile the actual active-delivery pointer and manifest instead of guessing.

The final cancellation record must contain the execution disposition, last confirmed project revision, and delivery disposition. Do not report CANCELLED if the final state remains ambiguous; retain NEEDS_RECONCILIATION.

Exit gate: Manual edits cannot silently diverge from session lineage, stale automated requests fail safely, and cancellation results reflect the actual side effects.

Deliverable: plans/PHASE_19_STAGE1E_LINEAGE_CANCELLATION_REPORT.md

7. Atomic multi-operation plan contract

The audit identifies a critical distinction: OperationExecutor executes single operations, while OperationPlanCompiler.executePlan() may coordinate multiple operations through a journal.

Stage 19.1 must establish the formal contract. Stage 19.2 will implement or harden the corresponding execution behavior.

atomic: true

An atomic plan must not expose partial canonical project state.

Execute the operation sequence against an isolated staged project candidate.

Apply every operation through OperationExecutor so all individual preconditions and invariants still apply.

Record the operation outcomes in the journal.

Publish the final staged project only after the entire plan succeeds.

On failure, discard the staged candidate and leave the authoritative project content and revision unchanged.

Do not restore an older snapshot over live project state after intermediate commits have already become visible.

Document how per-operation revisions inside the staged candidate map to the final committed revision, and test that observable revisions remain monotonic.

A single externally committed snapshot may contain several staged operation steps. The report must identify every committed operation even when the project update becomes visible as one atomic publication.

atomic: false

A non-atomic plan may commit valid steps individually. If a later step fails:

Retain successful committed steps.

Record the exact last completed operation and resulting revision.

Mark the job failed or needing reconciliation according to the verified outcome.

Never claim whole-plan atomicity or a full rollback.

This distinction is mandatory for user trust and recovery correctness.

8. Stage 19.1 acceptance tests

Create or extend tests/workflow-stage19-1-orchestration.test.js and associated focused suites.

Test at minimum:

Valid request acceptance and durable job identity.

Malformed brief rejected before project mutation.

Unresolved targets and missing assets produce a blocking result.

Contradictory constraints require clarification.

Clarification that changes the request triggers replanning.

Approval of an unchanged plan verifies the plan hash and base revision.

Stale project snapshots are rejected before execution.

Plan compilation and dry-run leave canonical state and active delivery unchanged.

Invalid state transitions are rejected.

Terminal job states resist late callbacks.

Legacy COMMITTED/COMPLETED states map to logical SUCCEEDED without corrupting existing job history.

Duplicate high-level requests resolve to the same durable job for the same idempotency key and payload.

Conflicting reuse of an idempotency key fails closed.

Manual timeline edit lineage and automated-plan base revision are reconciled.

Cancellation before execution produces no unintended mutation.

The atomic and non-atomic plan policies are documented and tested at their orchestration boundaries.

Use deterministic execution and controlled failure injection. Do not rely solely on elapsed-time sleeps to prove transition ordering.

9. Cross-cutting invariants

Throughout Stage 19.1:

Keep schema/eme-project.v1.schema.json unchanged.

Preserve the 120,000-tick timebase and half-open interval semantics.

Do not mutate canonical project state during planning.

Keep execution behind the existing validated operation engine.

Preserve track-lock and expected-revision checks.

Keep VTSM masks isolated in their sidecar boundary.

Keep Laya advisory-only under CANARY_ADVISORY_MODE.

Do not promote a job to success before the required verification and publication contracts are satisfied.

Do not equate project save, job completion, successful rendering, and active-delivery publication; they are separate milestones.

Preserve prior verified delivery on all failed render, QA, hash, or manifest gates.

10. Stage 19.1 completion report

Submit:

plans/PHASE_19_STAGE1_COMPLETION_REPORT.md

Include:

Final state diagram and transition table.

Compatibility mapping for Phase 14B and PF-11.

Files and symbols modified.

Request, job, plan, and revision identity contracts.

Preflight and dry-run evidence proving zero project mutation.

Manual-edit lineage and cancellation outcomes.

Atomic versus non-atomic plan execution contract.

Test requirements-to-results matrix.

Actual test commands, counts, exit codes, and failures.

Known limitations and remaining dependencies for Stages 19.2–19.5.

Do not label untested recovery or persistence behavior as passing.

11. Authorization gate

Stage 19.1 is accepted only when:

One authoritative 12-state logical lifecycle is enforced.

The RECOVERING discrepancy is resolved without silently expanding the canonical state count.

Approval and clarification semantics are distinct and valid.

Planning is demonstrably non-mutating.

Job identity, status, and plan lineage are traceable.

Manual timeline edits cannot silently invalidate the workflow's revision assumptions.

Cancellation and atomicity semantics are explicit.

Required focused tests and the existing regression suite pass.

Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

End of directive.

Immediate implementation order

Start with the lifecycle contract and transition table, then implement the shared validator and compatibility adapter. Keep the two larger implementation seams—unifying /api/render with the verified delivery pipeline and adding high-level MCP workflow tools—assigned to their later authorized stages rather than bundling them into Stage 19.1.

The next review checkpoint is plans/PHASE_19_STAGE1_COMPLETION_REPORT.md, with the unified status model, non-mutating preflight evidence, and manual-edit revision-lineage behavior demonstrated by tests.
