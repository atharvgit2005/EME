# ChatGPT Architecture Lead: Phase 19 Stage 19.1 Review & Stage 19.2 Directive

**Date**: 2026-10-20T18:46:46.796Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.1 Review  

---

EME Phase 19 (RT-01) — Stage 19.1 Architecture Review
Stage 19.1: IMPLEMENTATION ACCEPTED

Workflow lifecycle, preflight, job API, approval/clarification, and manual revision lineage

Regression sign-off: CONDITIONAL

The reported 50/50 run covers five named suites, not the complete repository regression.

Stage 19.2: AUTHORIZED TO BEGIN

Start with golden workflow contracts and cross-system execution integration.

The Stage 19.1 report addresses the main architectural requirements: a canonical 12-state lifecycle, compatibility aliases, distinct approval and clarification paths, durable job identity, manual timeline revision lineage, and explicit atomic versus non-atomic execution behavior.

The 18/18 dedicated tests and 50/50 tests across five named suites provide useful evidence. However, the latter is a targeted multi-suite regression, not proof that the full npm test suite passes. I therefore accept the implementation based on the report, but reserve final Stage 19.1 regression sign-off until the full repository suite is run on the current candidate.

That verification item need not prevent the next stage's planning and golden-workflow work from starting. I authorize Stage 19.2, with the contract and transaction boundaries below serving as its initial gates.

This review is based on your submitted report; I have not independently inspected the repository or run its tests.

Writing
EME Phase 19 — Stage 19.2 Architecture Directive

Milestone: RT-01 — End-to-End Workflow Integration & Final Delivery
Stage: 19.2 — End-to-End Golden Workflows, Multi-turn Revision DAGs & Cross-System Integration
Decision: GO — Stage 19.2 may begin
Predecessor: Stage 19.1 — Workflow Contract & Orchestration
Architecture owner: ChatGPT Architecture Lead
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Mission

Demonstrate that EME can carry representative editing requests through a repeatable, traceable workflow while preserving canonical project state, revision history, and user intent across multiple turns and entry points.

Stage 19.1 established the job lifecycle and preflight foundation. Stage 19.2 must now prove that the approved plan, actual operations, session revision lineage, and workflow job history stay consistent when users perform successive edits through automated prompting and the interactive timeline.

The governing principle is:

One canonical project, one authoritative operation engine, one validated workflow lifecycle, and a traceable revision lineage across editing turns.

This stage is not a replacement for OperationExecutor, RevisionSessionManager, OrchestrationJobManager, or OperationPlanCompiler. It connects their existing contracts and adds only the integration needed to make the complete workflow reliable.

Stage 19.3 remains responsible for deeper closed-loop verification and recovery hardening. Stage 19.4 remains responsible for unifying delivery-oriented rendering and verified publication pathways.

2. Stage 19.2A — Close Stage 19.1 Regression Sign-Off

Before completing Stage 19.2, close the remaining Stage 19.1 regression-verification item.

Run the full repository test suite on the current implementation candidate:

npm test

Record the actual discovered files, test count, failures, duration, and exit code. Confirm that tests/workflow-stage19-1-orchestration.test.js is included in the master runner rather than relying only on the earlier five-suite command.

If the suite fails, classify each failure as a regression, environmental issue, or unrelated pre-existing failure and provide evidence. Do not call the full regression green unless the actual run exits successfully with the required suites passing.

Deliverable: update plans/PHASE_19_STAGE1_COMPLETION_REPORT.md or append a focused regression addendum.

This verification may proceed alongside Stage 19.2A design work. It must be closed before final Stage 19.2 acceptance.

3. Stage 19.2B — Golden Workflow Contract & Fixtures

Author:

plans/PHASE_19_STAGE2A_GOLDEN_WORKFLOW_CONTRACT.md

Create deterministic golden workflows that exercise the existing request, planning, execution, revision, and session contracts. Each scenario must specify:

Initial project and session identity.

Initial canonical project revision and active-delivery identity.

User request, relevant hard constraints, and target references.

Expected intent/brief outcome.

Expected plan and operation sequence.

Whether approval or clarification is required.

Expected project-content changes and revision progression.

Expected revision DAG and job-history relationships.

Failure injections, where applicable.

Expected terminal or nonterminal job state.

Expected active-delivery behavior.

Golden fixtures must be version-controlled, deterministic, and isolated from developer-specific projects or media paths. Use stable fixture identifiers and controlled inputs rather than timestamps or random data in expected results.

Required golden scenarios

Scenario A — Valid single-turn edit

A clear, supported request resolves against a known project snapshot, produces a valid plan, passes preflight, executes its canonical operations, and records the resulting revision and job outcome.

Scenario B — Clarification before execution

An ambiguous target or contradictory constraint transitions to AWAITING_APPROVAL with awaitingReason: "clarification". No canonical project mutation occurs. Once clarified, the request is replanned from current state and goes through the required validation steps again.

Scenario C — Approval of a valid plan

A plan that requires explicit approval stays non-mutating until approval. Approval must validate the existing plan hash and base revision. If either changes, execution must be blocked or the plan recompiled.

Scenario D — Multi-turn revision session

A user creates an initial edit, submits a follow-up request that modifies the result, and then submits another follow-up. Each turn must use the correct predecessor revision, preserve its request context and applicable constraints, and record the actual project changes.

Scenario E — Manual timeline edit between automated turns

An automated workflow commits a revision. The user then performs a manual timeline operation, Undo, or Redo through the Visual Control Surface. The next automated turn must use the latest valid project state and revision lineage rather than blindly applying the old plan.

Scenario F — Stale plan rejection

A plan is compiled against revision N, but another authorized operation advances the project to N+1 before execution. The original plan must not be applied to the newer project without revalidation and appropriate recompilation.

Scenario G — Atomic multi-operation failure

An atomic plan stages multiple operations, then fails at a later step. Canonical project content must remain unchanged relative to the pre-transaction state, with the failure recorded in the job and journal.

Scenario H — Non-atomic partial failure

A non-atomic plan commits some operations before a later step fails. The report must identify committed steps and the final known project revision. The workflow must not misrepresent this state as a full rollback or successful completion.

Scenario I — Duplicate workflow submission

The same durable job idempotency key and request payload are submitted twice. The existing job must be returned or referenced rather than creating duplicate workflow execution. A conflicting payload under that key must fail closed.

Scenario J — Failed workflow does not replace a verified delivery

An edit commits successfully but the later stage fails before verified delivery publication. Canonical project state must reflect the committed edit, and session.active_delivery must remain pointed at the previous verified output.

Exit gate: Each scenario has a documented initial state, actual operation sequence, expected canonical result, expected job status, and reproducible tests. Do not use a mocked successful result as evidence that the real operation engine committed the expected project.

Deliverable: plans/PHASE_19_STAGE2A_GOLDEN_WORKFLOW_CONTRACT.md

4. Stage 19.2C — Multi-turn Revision DAG & Provenance Integration

Connect the canonical project revision lineage, RevisionSessionManager, the orchestration job history, and the workflow's operation records without conflating their distinct responsibilities.

4.1 Preserve two related but distinct histories

The project/revision DAG records canonical project evolution. The job history records requests, planning, execution, verification, and delivery lifecycle.

A project revision is not itself a workflow job. A job may contain multiple operations, and a manual timeline edit may create a revision without an associated conversational prompt.

Represent the association through explicit identifiers and provenance fields where supported:

session_id

job_id or request identity

predecessor and resulting revision identities

base revision

plan hash

operation identity or execution-journal reference

origin, such as prompt_workflow or manual_vcs

delivery run, manifest, and media digest when they exist

Do not fabricate a plan hash, conversational prompt, render artifact, or delivery manifest for a manual operation that did not produce one.

4.2 Multi-turn context rules

Every follow-up turn must resolve the latest authoritative project snapshot and its revision before compiling a new plan.

Preserve the relevant prior conversational context, but do not blindly reuse a stale operation list. A new user instruction may change the target, constraints, or desired result, requiring fresh planning.

The compiler must re-evaluate applicable constraints against the updated project. Constraints that remain valid must be preserved; constraints explicitly changed by the user must follow the repository's established intent/approval rules.

4.3 Branching, Undo and Redo

If the user undoes a prior operation and makes a new edit, the system must preserve its established history semantics. Do not overwrite historical revision records or invent an active delivery for a branch that has never been rendered and verified.

Tests must show that:

Each committed edit is traceable to its origin.

Undo/Redo results are reflected correctly in the authoritative revision/session view.

A new edit after Undo follows the established redo-branch rules.

A later automated turn uses the actual current canonical project.

Failed jobs remain auditable without becoming active successful revisions.

Delayed callbacks cannot append false success records to terminal jobs.

4.4 Manual edit lineage consistency

Exercise the existing manual VCS synchronization behavior for:

POST /api/project/operation

POST /api/project/undo

POST /api/project/redo

Confirm that each successful mutation records a coherent revision node, updates the session's concurrency/version metadata, and does not change active_delivery prematurely.

Use unique revision/event identities. Do not rely on a rev-manual-N naming pattern unless its uniqueness across sessions and revisions is guaranteed. Test repeated edits, Undo/Redo, and reload/recovery scenarios to ensure nodes do not collide or lose predecessor relationships.

Exit gate: The project DAG and job history agree on the actual revision and outcome, while retaining their distinct meanings. Automated and manual edits cannot silently diverge from the current project lineage.

Deliverable: plans/PHASE_19_STAGE2B_REVISION_LINEAGE_REPORT.md

5. Stage 19.2D — Plan Execution, Atomicity & Cross-System Integration

Integrate the request planner and operation execution path through the existing OperationPlanCompiler, OperationExecutor, OrchestrationJobManager, and RevisionSessionManager.

5.1 Execution preconditions

Immediately before execution:

Load the authoritative project/session state.

Compare the current canonical revision with the approved plan's base revision.

Confirm the plan hash matches the approved plan.

Recheck required hard constraints and resolved target identities.

Verify track locks, asset existence, and operation-specific preconditions.

Confirm the job is in READY_TO_EXECUTE and not terminal or cancelled.

Record the execution start and transaction boundary before mutation begins.

A preflight success from several seconds earlier is not enough if the canonical project has changed since then.

5.2 Atomic and non-atomic plan semantics

Keep the distinction between single-operation atomicity and multi-operation workflow atomicity explicit.

For atomic: true, operations must be staged so partial canonical changes are never published. The entire candidate can be committed only after all operations succeed. If execution fails, discard the staged candidate and retain canonical project content from before the transaction.

For atomic: false, successfully committed earlier steps remain committed if a later step fails. The job must report its partial execution outcome, completed step count, current project revision, and required next action.

Do not implement atomic rollback by writing an older snapshot over live project state after uncoordinated commits may already have occurred. Use the established transaction boundary or introduce a narrowly scoped staged-candidate publication mechanism with concurrency validation.

5.3 Operation and job idempotency

Preserve the distinction between:

The process-local timeline operation idempotency cache.

The durable high-level job idempotency index.

A high-level workflow retry must not create a second job or execute the same workflow twice for the same idempotency key and payload. Conflicting payloads must be rejected.

Within one plan, operation identities must remain stable when a step is retried or reconciled. Do not generate a new operation ID merely because a network response was lost.

Do not claim durable exactly-once operation execution across restarts unless the actual persisted operation-outcome mechanism demonstrates that guarantee. Where an outcome is unknown, reconcile from journal, canonical project revision, and job records before another mutation is attempted.

5.4 Session history and project save boundaries

Make the workflow's persistence behavior explicit. A project revision committed in memory, a serialized project file, a session revision record, and an active verified delivery are separate states.

Ensure that the existing persistence contract is respected and that failures do not make saved project state, session revision lineage, and reported job status disagree silently.

Exit gate: Approved plans execute through the canonical operation engine; atomicity semantics match actual behavior; successful and partial operations are accurately recorded; and job, project, session, and idempotency identities remain coherent.

Deliverable: plans/PHASE_19_STAGE2C_EXECUTION_INTEGRATION_REPORT.md

6. Stage 19.2E — Golden Workflow Execution & Regression

Implement tests/workflow-stage19-2-execution.test.js and any appropriately scoped integration suites.

The tests must exercise the actual planner and operation executor, using deterministic fixtures and controlled failures. Include at least the ten golden scenarios from Stage 19.2B, with focused scenario subsets where appropriate.

For each scenario, record:

Input request and project snapshot identity.

Base revision and approved plan hash.

Operation sequence and execution outcome.

Canonical project changes and revision progression.

Job state and event history.

Revision DAG predecessor relationships and origin metadata.

Active-delivery pointer before and after the workflow.

Expected and actual artifact identities, where the workflow reaches delivery generation.

Run the Stage 19.2 focused suite, the Stage 19.1 orchestration suite, relevant timeline/engine/session regressions, and the complete master regression. Report actual commands, exit codes, test counts, failures, and known limitations.

The full npm test regression must include the Stage 19.1 tests. Do not describe the earlier 50-test subset as the complete master regression.

Exit gate: The golden workflows are reproducible and pass against the real integration path. No mocked-only suite may be used to claim that canonical revision, session lineage, or delivery behavior is fully verified.

Deliverable: plans/PHASE_19_STAGE2_COMPLETION_REPORT.md

7. Important architecture boundary: rendering remains a separate gate

The audit identified that POST /api/render performs direct rendering without necessarily running the full QA and delivery-manifest publication path.

Stage 19.2 must not treat a direct render endpoint as proof of verified delivery, nor make that endpoint a competing active-delivery authority.

For tests that require a final delivery, use the existing verified delivery pipeline and assert its manifest and active-delivery behavior. The full unification of delivery-oriented render entry points remains Stage 19.4.

Likewise, deeper semantic verification, repair policy, and recovery after failed or interrupted delivery remain subject to Stage 19.3 and Stage 19.4 gates.

8. Required safeguards and non-negotiable invariants

Throughout Stage 19.2:

Keep schema/eme-project.v1.schema.json unchanged.

Preserve TICKS_PER_SECOND = 120,000 and half-open interval semantics.

Preserve source-range and canonical project invariants.

Route all committed changes through validated OperationExecutor operations.

Maintain expected-base-revision checks and established track-lock enforcement.

Preserve the 12-state canonical job lifecycle and terminal-state immutability.

Keep project revision DAG and job lifecycle history distinct but linked by explicit provenance.

Do not mutate canonical state during planning or dry-run.

Do not report an atomic workflow if only each individual operation is atomic.

Keep VTSM sidecars isolated and Laya advisory-only.

Do not publish an unverified output or replace a prior verified active delivery on failure.

Distinguish current project revision, saved project revision, rendered revision, and active verified delivery revision in reports and user-facing status.

9. Stage 19.2 completion report requirements

Submit plans/PHASE_19_STAGE2_COMPLETION_REPORT.md containing:

Golden workflow definitions and initial fixture identities.

The implemented cross-system data flow and source files.

Operation sequence, plan-hash, revision, job, and session lineage contracts.

Tests demonstrating atomic versus non-atomic execution behavior.

Multi-turn revision DAG tests covering manual edits and Undo/Redo.

Idempotency and response-loss reconciliation results.

Actual workflow outcomes, artifact provenance, and delivery behavior for scenarios that reach the delivery pipeline.

Exact test commands, exit codes, totals, and failures.

Results of the full regression and explicit confirmation that Stage 19.1 tests are included.

Limitations and any remaining dependencies on Stage 19.3–19.5.

Final disposition must be PASS, CONDITIONAL PASS, or FAIL. Do not mark unexecuted tests or unsupported durability claims as passing.

10. Acceptance and next-stage boundary

Stage 19.2 is accepted only when:

Golden workflows demonstrate the supported request-to-execution behavior.

Multi-turn revisions build on current authoritative state.

Job history and project revision lineage remain coherent across prompt and manual editing.

Atomic versus non-atomic execution behavior is correct and observable.

Stale plans, duplicate submissions, and partial failures are handled safely.

The complete regression including Stage 19.1 remains green.

Known delivery and recovery boundaries are truthfully represented.

Stage 19.2 acceptance authorizes review of Stage 19.3, but does not certify closed-loop recovery or delivery publication as complete.

Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

End of directive.

Immediate next step

Run the full npm test check for Stage 19.1 while the team writes the ten golden workflow contracts and builds deterministic fixtures. The first Stage 19.2 review checkpoint is the golden workflow contract plus evidence that multi-turn prompt edits and manual VCS edits share coherent revision lineage.
