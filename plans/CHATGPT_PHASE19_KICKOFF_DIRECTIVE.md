# ChatGPT Architecture Lead: Phase 18 Final Signoff & Phase 19 (RT-01) Kickoff Directive

**Date**: 2026-10-20T18:02:15.938Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 18 Signoff & Phase 19 (RT-01) Kickoff  

---

EME Phase 19 (RT-01) — Architecture Kickoff Decision
Phase 18 (TL-01): ACCEPTED

Final certification accepted based on the submitted completion report and verification results.

Phase 19 (RT-01): AUTHORIZED

Stage 19.0 — Repository Audit, Workflow Baseline & Integration Contract

Phase 18 establishes the interactive editing foundation: authoritative timeline operations, transaction and revision guards, supported CapCut interoperability, and verified media delivery. Phase 19 should now focus on integrating those capabilities into one dependable end-to-end workflow.

The architectural objective is to move from individual capabilities that work to a complete workflow that reliably turns an editing request into a verified final delivery.

The acceptance report is accepted as submitted; I have not independently checked out the repository or executed the tests. One documentation improvement belongs in the next audit: record the exact full commit SHA targeted by phase-18-tl-01-certified and reconcile the differing master-test durations reported in the certification document. These do not block starting Stage 19.0.

Writing
EME Phase 19 — RT-01 Architecture Kickoff Directive

Milestone: RT-01 — End-to-End Workflow Integration & Final Delivery
Status: Authorized — Stage 19.0 may begin immediately
Predecessor: Phase 18 — TL-01 Non-Destructive Interactive Timeline Engine
Architecture owner: ChatGPT Architecture Lead
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Mission

Integrate the existing EME components into a reliable end-to-end editing workflow that can take a request, establish a valid execution plan, apply the intended edits deterministically, verify the resulting project and media, recover safely from failures, and publish a verified final delivery.

The target architecture is:

User intent → Interpretation → Planning and operation selection → Deterministic execution → Closed-loop verification and recovery → Rendering → Media QA → Manifest and integrity verification → Active-delivery publication

Every stage must have an explicit contract, observable status, and defined failure behavior. No stage may report success merely because the preceding stage returned without throwing an exception.

Architectural principle

The engine owns state, deterministic operations own edits, verification owns acceptance, and the delivery pipeline owns publication.

The Visual Control Surface must reflect authoritative backend state. Planning must not mutate the project. Operations must execute through the established engine. A render must not become the active delivery until the required verification gates pass.

Do not replace functioning subsystems with parallel implementations simply to make the integration appear cleaner.

2. Phase 19 stage breakdown
Stage 19.0 — Repository Audit, Workflow Baseline & Integration Contract

Authorized immediately.

Inspect the actual repository and trace every existing component involved in the full workflow.

Required areas:

User request ingestion and intent interpretation.

Plan construction, operation selection, and constraint preservation.

OperationExecutor and canonical project state.

Revision/session lifecycle and orchestration job management.

Expected-revision validation, write mutexes, and idempotency.

Timeline and Visual Control Surface integration.

Render compilation and execution.

Closed-loop technical and semantic verification.

Media QA, output hashing, delivery manifests, and active-delivery publication.

Failure handling, recovery, persistence, status reporting, and logs.

Existing CLI and MCP integration boundaries, including Laya's advisory-only role.

Trace the real execution path from request submission through final delivery. Identify existing entry points rather than assuming a new API or orchestration component is needed.

Deliverable: plans/PHASE_19_STAGE0_INTEGRATION_AUDIT.md

It must include:

Exact source paths, symbols, APIs, and existing implementation boundaries.

An end-to-end data-flow diagram.

A workflow state machine identifying transitions, ownership, and terminal states.

A requirements-to-existing-capabilities matrix.

A mutation and transaction boundary map.

A failure/recovery matrix covering each major subsystem.

A baseline of existing tests, commands, output artifacts, and known gaps.

A proposed staged implementation order with explicit exit gates.

Risks, unresolved assumptions, and any capabilities that are not currently implemented.

Exit gate: Every major workflow transition has an identified authoritative component, an explicit input/output contract, and an understood failure boundary. Do not begin broad orchestration refactoring before this audit is reviewed.

Stage 19.1 — End-to-End Workflow Contract & Orchestration

Integrate the existing orchestration components into one coherent request lifecycle.

Required behavior:

Accept a user editing request with the appropriate project/session context.

Resolve the applicable project revision and constraints.

Produce an inspectable plan before executing operations.

Identify the exact operations intended for execution.

Validate preconditions and reject unresolved ambiguity or unsupported requests according to existing policy.

Create or reuse the established orchestration job lifecycle and status API.

Maintain a clear distinction between planning, execution, verification, and delivery.

Return stable identifiers for tracking the request, job, plan, and resulting revision.

Do not assume a valid plan guarantees successful execution. Do not treat a generated operation list as committed project state.

Exit gate: The request lifecycle is documented and testable; invalid or ambiguous inputs fail safely; planning alone has no project mutation effects; and job status remains consistent with actual execution state.

Deliverable: plans/PHASE_19_STAGE1_COMPLETION_REPORT.md

Stage 19.2 — Deterministic Execution, Constraints & Revision Integration

Wire planned operations into the existing engine without introducing another execution authority.

Required behavior:

Execute the supported canonical operations through OperationExecutor.

Preserve project, track, timing, source-range, and other explicit constraints.

Validate the expected base revision at the authoritative commit boundary.

Make operation identity and retries consistent with the verified idempotency contract.

Record the actual operation outcome and resulting revision.

Stop safely if a prerequisite fails or a plan cannot continue.

Ensure that a partial multi-operation workflow is represented accurately rather than reported as fully successful.

A compound request may require multiple operations. The workflow must explicitly distinguish a sequence of individually committed operations from an atomic transaction. Do not claim whole-workflow atomicity unless the implementation genuinely provides it.

Exit gate: Execution results correspond to the approved plan, each committed operation is traceable, and revision conflicts or operation failures cause a safe and truthful workflow outcome.

Deliverable: plans/PHASE_19_STAGE2_COMPLETION_REPORT.md

Stage 19.3 — Closed-Loop Verification, Failure Recovery & State Reconciliation

Establish that EME verifies the result of execution rather than merely trusting that a requested edit occurred.

Verification must inspect the actual resulting project against the intended changes and applicable constraints. Where the workflow produces media, use the rendered result and existing verification systems to establish delivery correctness.

Required behavior:

Compare expected changes with canonical post-execution project state.

Identify failed preconditions, invalid project states, and unmet constraints.

Distinguish an execution failure from a verification failure.

Reconcile discrepancies against authoritative state.

Use bounded, documented recovery attempts where recovery is supported.

Prevent unsafe retries after an operation's outcome becomes uncertain.

Record verification evidence, failure reasons, and recovery decisions.

Preserve the previous verified active delivery if a new delivery fails.

Do not retry indefinitely, repeatedly apply the same edit under a new operation identity, or silently reinterpret a failed request to force success.

Exit gate: Injected failures produce correct status, state reconciliation, and bounded recovery behavior. The workflow cannot label an unverified result successful.

Deliverable: plans/PHASE_19_STAGE3_COMPLETION_REPORT.md

Stage 19.4 — Rendering, Media QA & Final Delivery Publication

Integrate workflow completion with the established rendering and delivery pipeline.

Required sequence:

Establish which canonical project revision is to be rendered.

Freeze or otherwise reliably bind rendering inputs to that revision.

Execute rendering through the existing compiler/renderer.

Verify that expected media output was generated.

Perform Media QA and any required semantic verification.

Compute and verify the actual output's SHA-256.

Generate or validate the delivery manifest.

Bind the manifest and media to the exact project revision.

Publish the active-delivery pointer only when every required gate passes.

If project revision N+1 commits but its render fails, the workflow must preserve that truthful project state while keeping the prior verified delivery active. The old delivery must not be misrepresented as the verified output of the newer revision.

Exit gate: A genuine request-to-render workflow yields a verified deliverable, while render, QA, manifest, and integrity failures preserve the previous valid delivery.

Deliverable: plans/PHASE_19_STAGE4_COMPLETION_REPORT.md

Stage 19.5 — Unified End-to-End Acceptance & Release Certification

Run the complete workflow through the intended entry points, not just isolated unit tests.

The final certification must demonstrate that a user request can be tracked from submission through planning, deterministic execution, verification, recovery where applicable, rendering, and final delivery publication.

Cover the Visual Control Surface and the supported API/CLI entry points. Include MCP only for the integrations that Stage 19.0 confirms are part of the intended RT-01 scope.

Deliverable: plans/PHASE_19_RT01_COMPLETION_REPORT.md

The final report must include a requirement-to-test acceptance matrix, exact commands and exit codes, real artifact/manifest identity, project revision provenance, failure-injection outcomes, regression totals, known limitations, and the proposed certification tag.

3. State ownership and workflow contracts

Each stage must use explicit, typed contracts and must not invent a parallel state model for information that already has an authoritative owner.

Concern	Authoritative owner	Required behavior
User intent and approved request context	Workflow/request layer	Preserve request identity and constraints
Plan and proposed operations	Planning/orchestration layer	Inspectable and non-mutating before execution
Canonical project state	Project engine and OperationExecutor	Committed only through validated operations
Project revision and transaction history	Existing engine/session mechanisms	Enforce the established concurrency model
Job lifecycle and status	Existing orchestration job manager or designated equivalent	Report truthful state transitions
Verification outcome	Existing verification and QA components	Success requires evidence against the defined gates
Rendered media and manifest	Existing delivery pipeline	Bound to the exact verified project revision
Active-delivery pointer	Existing session/delivery authority	Changes only after successful verification
Timeline selection, zoom, and transient gestures	Visual Control Surface	Must not become canonical project state
Laya decision recommendations	Advisory decision layer	Must not acquire execution authority

If the audit identifies multiple competing sources of truth for a given concern, document the conflict and propose the smallest safe consolidation before implementing it.

4. Required workflow status model

Stage 19.0 must inspect the current status model and propose any necessary extension. At minimum, the integrated workflow must distinguish these logical states, using the repository's established naming conventions where applicable:

Accepted: Request and context validated.

Planning: Plan is being constructed.

Awaiting approval or clarification: A supported workflow requires explicit user confirmation or missing input.

Ready to execute: Plan and preconditions are validated.

Executing: One or more operations are in progress.

Verifying: Postconditions or rendered results are being checked.

Rendering: Final media is being generated.

Publishing: Final integrity and manifest gates are being completed.

Succeeded: All required workflow gates have passed.

Failed: A required stage failed and recovery did not produce a valid result.

Cancelled: Cancellation was accepted and the resulting state is accurately represented.

Needs reconciliation: The system cannot yet establish the authoritative outcome of a request or operation.

Do not equate job completion with delivery publication. A project edit may succeed while rendering fails; the model must be able to represent that outcome without corrupting either project revision state or active delivery state.

Transitions must be validated. Terminal jobs must not become successful again because of a delayed response. Any re-entry or retry must follow an explicit rule.

5. Idempotency, persistence, and cancellation boundaries

Phase 18's current 200-entry idempotency cache is process-local. It is not, by itself, proof of durable idempotency across restart or eviction.

During Stage 19.0, determine what level of request and job durability RT-01 actually needs. Explicitly distinguish:

Retrying an HTTP request while the server process remains alive.

Recovering after client disconnection.

Recovering after server restart.

Recovering after a project has been saved.

Recovering a multi-operation workflow that committed some operations before a later operation failed.

Do not make durable exactly-once execution claims without a durable outcome record and appropriate failure-injection evidence.

Cancellation must also be scoped honestly. Cancelling a request should not imply that an already committed operation has been undone, that FFmpeg immediately stopped, or that publication was prevented unless the relevant subsystem confirms that outcome.

6. Cross-cutting safety and architecture constraints

Throughout Phase 19:

Keep schema/eme-project.v1.schema.json unchanged unless a separate schema-change proposal is approved.

Preserve the 120,000-tick timebase and half-open interval semantics.

Keep all canonical project mutations within validated engine operations.

Preserve revision guards, lock enforcement, transaction atomicity, and engine-owned Undo/Redo.

Keep VTSM tracking masks in their existing sidecar boundary.

Keep Laya advisory-only under its existing canary controls.

Do not create a parallel timeline engine, rendering pipeline, or verification authority.

Preserve the previous verified active delivery on any new-render or publication failure.

Do not represent an old verified output as the output of a newer revision.

Log enough request, job, operation, revision, manifest, and error identity to diagnose failed workflows without inventing provenance.

Keep failure handling bounded and deterministic; unknown outcomes must be reconciled instead of blindly retried.

7. Verification and performance discipline

Reuse existing tests and fixtures wherever possible, adding narrowly scoped tests for genuinely missing behavior.

Every report must separate unit tests, API integration tests, orchestration tests, actual rendering tests, and genuine end-to-end delivery verification.

Run the focused suites and full regression on the actual candidate. Record real commands, exit codes, test counts, and failures. Do not infer a green test result from prior milestones.

Retain the established timeline performance gates:

1,000-clip projection P95 ≤ 16.67 ms on the established fixture.

Magnetic snapping P95 < 0.30 ms on the established fixture.

Measure workflow-stage latencies separately from complete render duration so that slow media encoding does not obscure interaction performance and fast unit tests do not imply a fast end-to-end workflow.

8. Stage 19.0 acceptance gate

Before proceeding to broad implementation, deliver plans/PHASE_19_STAGE0_INTEGRATION_AUDIT.md with:

An exact source-grounded end-to-end architecture map.

A current-state workflow and status-transition diagram.

API, job, operation, verification, and delivery contracts.

A state-ownership table.

A failure and recovery matrix.

An idempotency/persistence/cancellation boundary analysis.

A baseline test and performance inventory.

Identified missing links, duplicated responsibilities, and risks.

A prioritized Stage 19.1–19.5 implementation plan with acceptance conditions.

The audit must also capture the full commit SHA targeted by the accepted Phase 18 tag and resolve any internal discrepancies in the previous certification report that affect traceability.

Stage 19.0 is accepted only when the complete current workflow and its actual limitations are established from repository evidence. Subsequent implementation stages require review at their defined gates.

9. Formal authorization

Stage 19.0 is authorized to begin immediately.

Do not start with broad code refactoring. First trace the existing request-to-delivery path, establish the workflow contracts and failure boundaries, and identify the smallest integrations needed to achieve a true end-to-end result.

The objective is not to add more isolated subsystems. It is to make EME's existing subsystems cooperate reliably, deterministically, and transparently from the first user request to the final verified delivery.

End of directive.

Immediate next step

Have the IDE agent produce plans/PHASE_19_STAGE0_INTEGRATION_AUDIT.md and submit it for review. The first decision is whether the existing orchestration, operation engine, verification, and delivery components already form one coherent lifecycle—or whether gaps remain between them. That audit determines the correct Stage 19.1 implementation scope.
