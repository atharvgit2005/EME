# ChatGPT Architecture Lead: Phase 19 Stage 19.2 Review & Stage 19.3 Directive

**Date**: 2026-10-20T18:59:33.865Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.2 Review  

---

Formal Architecture Review — Phase 19, Stage 19.2
Stage 19.2: Accepted

Decision based on the submitted completion report, not an independent execution of the repository tests.

The evidence submitted supports acceptance of Stage 19.2 and authorization to proceed to Stage 19.3.

The report records all 10 golden scenarios passing, including stale-plan rejection, atomic rollback, non-atomic partial failure, duplicate-submission protection, and preservation of the last verified delivery on failure. 
Pasted text.txt
 It also reports a full npm test run with 488/488 tests passing across 12 suites, addressing the earlier gap where only targeted regression testing had been reported. 
Pasted text.txt

Two boundaries remain important:

This is report-based acceptance, not independent certification. I have not independently rerun npm test, inspected the implementation, or verified the repository commit and working-tree state.

I do not accept the proposed scope jump to packaging as the next stage. The agreed engineering sequence still needs a dedicated stage for closed-loop recovery and reconciliation before final delivery-path unification and packaging. Stage 19.2 passing golden scenarios does not, by itself, certify crash recovery or safe handling of uncertain outcomes after a process interruption.

Critical architectural observations before the next stage

The Stage 19.2 results are strong, but the next stage must close gaps that successful happy-path and injected-failure tests cannot automatically settle.

1. Separate job state from progress labels. The report uses SUCCEEDED as the terminal job status and COMMITTED as the progress stage. Keep these separate in APIs, persisted job records, CLI output, and tests. Legacy values must not become new canonical persisted statuses.

2. Prove recovery across process restarts. A duplicate request returning a cached job in the same process does not prove that a restarted service can safely resolve a previously committed but unacknowledged operation. Stage 19.3 needs actual persistence and restart tests, not only in-memory simulation.

3. Reconcile uncertain outcomes instead of replaying blindly. If an operation commits but the job update or response is lost, the recovery path must inspect the authoritative revision and operation journal before retrying. It must not duplicate edits or falsely report that nothing happened.

Those are the priority gates for the next stage.

Formal Stage 19.3 Architecture Directive
Writing
Phase 19 (RT-01) — Stage 19.3 Architecture Directive
Closed-Loop Verification, Failure Recovery & State Reconciliation

To: EME Engineering Team
From: ChatGPT Architecture Lead
Decision: Stage 19.2 accepted; Stage 19.3 authorized within the scope defined below
Priority: P0 — Workflow correctness and crash safety
Required report: plans/PHASE_19_STAGE3_COMPLETION_REPORT.md

1. Objective

Make the EME orchestration engine recover safely when execution is interrupted, a downstream action fails, a persisted state disagrees with the actual project, or the outcome of an operation is unknown.

The required control loop is:

Intent → Planning → Approval, when required → Deterministic Execution → Verification → Reconciliation or Recovery → Verified Terminal State

Stage 19.3 must demonstrate that the engine can determine what actually happened, preserve the user's last verified delivery, recover when safe, and stop for reconciliation when it cannot establish a trustworthy outcome.

Do not treat a successful golden-workflow run as proof of restart safety.

2. Scope boundary

This stage is specifically for closed-loop verification, crash recovery, failure recovery, and reconciliation of project, job, history, and delivery state.

Do not expand this stage into an unrestricted rewrite of the rendering system or general packaging work. In particular:

Do not claim the direct POST /api/render seam is unified with the complete orchestration delivery pipeline. That remains a separately gated delivery-path task.

Do not change the project schema, canonical timebase, revision semantics, or operation authority.

Do not promote unverified output merely because rendering finished.

Do not use a blind replay as a substitute for reconciliation.

Do not claim exactly-once execution unless the underlying behavior is proven across failures and restarts.

3. Canonical job-state recovery contract

Use the existing canonical 12-state model:

ACCEPTED, PLANNING, AWAITING_APPROVAL, READY_TO_EXECUTE, EXECUTING, VERIFYING, RENDERING, PUBLISHING, SUCCEEDED, FAILED, CANCELLED, and NEEDS_RECONCILIATION.

Create a documented recovery matrix covering every state. It must define the persisted evidence required, permissible restart action, mutation risk, and destination state if safe recovery cannot be established.

At minimum, enforce these rules:

ACCEPTED / PLANNING: Resume or replan using durable job data. These stages must not accidentally mutate the canonical project.

AWAITING_APPROVAL: Restore the pending request and approval context. Never infer user approval after restart.

READY_TO_EXECUTE: Revalidate the plan hash, base revision, target identities, locks, and hard constraints before execution. Reject stale plans.

EXECUTING: Reconcile the durable operation journal with the actual project revision and mutation result before any retry. If the outcome is ambiguous, enter NEEDS_RECONCILIATION.

VERIFYING: Verify against the authoritative post-execution project and operation results. Do not assume that a persisted job-stage label proves that verification completed.

RENDERING: Determine whether a usable render artifact exists and whether it belongs to the current intended project revision and delivery run. Rendering completion alone must not imply delivery success.

PUBLISHING: Verify the artifact, QA result, manifest, content hash, and publication pointer. If publication may have succeeded but acknowledgement was lost, inspect the durable state before retrying.

NEEDS_RECONCILIATION: Persist the uncertainty reason, observed facts, relevant revision and operation identifiers, and permitted recovery actions. Do not silently convert an unknown outcome into success or failure.

SUCCEEDED / FAILED / CANCELLED: These terminal states remain immutable against late callbacks. Any discovered contradiction must be handled through explicit reconciliation metadata or a separately approved correction mechanism, not an ordinary terminal-state transition.

The report must distinguish the canonical job status from progress-stage labels, operation results, project revision, saved-project state, and delivery status. Legacy COMMITTED or COMPLETED aliases must not be introduced as canonical job states.

4. Durable operation identity and restart safety

Use stable, durable identifiers to correlate each workflow, operation, project revision, render, and delivery attempt.

Required controls:

Persist enough operation-journal information to establish whether each mutation was not started, committed, rolled back, partially committed, or has an uncertain outcome.

On startup or retry, resolve the operation against authoritative persisted data before re-executing it.

Verify duplicate workflow submissions across service restarts, including reuse of an idempotency key with identical and conflicting payloads.

Keep durable orchestration-job idempotency separate from the process-local EditorBackend operation cache. The bounded in-memory cache is not evidence of restart-safe execution.

Preserve operationId, job ID, base revision, resulting revision where known, plan hash, and execution-journal correlation across recovery.

Where execution outcome cannot be determined safely, fail closed into NEEDS_RECONCILIATION.

Do not claim exactly-once execution solely because a duplicate request returns an existing job. State and prove the actual guarantee provided by the durable journal and retry protocol.

5. Failure injection and recovery verification

Add a dedicated suite at:

tests/workflow-stage19-3-recovery.test.js

Exercise recovery against real persisted job and project state wherever practical. Tests that only mock the expected recovery result are insufficient for restart-safety claims.

The minimum scenario set is:

A. Commit succeeded, response lost. An operation mutates the project, but the caller loses its response. Retry or recovery must discover the committed result without applying the edit twice or advancing the revision twice.

B. Commit outcome unknown. Interrupt execution between mutation and durable job acknowledgement. The engine must reconcile the authoritative project and journal. If the result cannot be proven, it must enter NEEDS_RECONCILIATION.

C. Process restarts in a nonterminal stage. Persist a job during execution, verification, rendering, or publishing; restart the relevant manager/service; confirm that the job is resumed, safely failed, or explicitly reconciled according to the recovery matrix.

D. Duplicate request after restart. Repeat a previously accepted request with its original idempotency key and matching payload. Verify that it resolves to the original durable workflow rather than creating a second mutation. Verify that conflicting payload reuse fails closed.

E. Atomic plan interrupted. Interrupt a multi-operation atomic: true workflow at relevant execution boundaries. Confirm that recovery produces either the valid committed transaction or a verified rollback, never a partially published canonical candidate.

F. Non-atomic plan interrupted. Interrupt an atomic: false workflow after one or more successful steps. Preserve the committed steps and report the exact partial state, completed operations, and resulting revision. Recovery must not misrepresent the plan as wholly rolled back or wholly successful.

G. Render or QA failure. A rendering error or failed Media QA result must not update session.active_delivery.

H. Publication outcome ambiguous. Interrupt the service around manifest persistence or active-delivery pointer publication. Recover the publication result by validating durable evidence; do not publish an incomplete, mismatched, or unverified artifact.

I. Cancellation at a mutation boundary. Verify cancellation before execution and cancellation requested after execution has started. The system must report what actually committed and must not mislabel an already committed mutation as cancelled without preserving its outcome.

J. Conflicting project state. Change the project revision after planning or while a job is pending. The recovery path must reject stale plans and replan only through the established workflow contract.

K. Late callbacks. Deliver late execution, render, or QA callbacks after a terminal state. Confirm that they cannot overwrite terminal job status or replace the active verified delivery.

L. Active-delivery preservation. Seed a known-good delivery, run every applicable failure and recovery scenario, and prove that session.active_delivery continues pointing to that known-good delivery until a new candidate passes all publication gates.

Each test must assert actual resulting project content, project revision, durable job status, operation journal, revision-history lineage, delivery manifest where applicable, and active-delivery pointer. Assert only the fields relevant to each scenario, but never use a status label alone as proof of a successful recovery.

6. Recovery and reconciliation rules

Implement a centralized, documented recovery policy rather than scattering ad hoc retries across orchestration stages.

The policy must:

Consult the persisted job, operation journal, authoritative project revision, revision history, and delivery records before choosing a recovery action.

Distinguish a confirmed failure from an uncertain outcome.

Resume only when the required prerequisites and execution evidence are valid.

Revalidate plan hash, base revision, target IDs, track locks, and hard constraints before any remaining mutation.

Preserve the lineage of both prompt_workflow and manual_vcs changes.

Preserve exact partial-commit information for non-atomic execution.

Preserve the last-known-good session.active_delivery through every failed or uncertain render/publication path.

Record recovery attempts and decisions durably, with stable correlation IDs and sufficient diagnostic detail to audit the result.

Keep project mutation under OperationExecutor and its established validation, transaction, and revision controls.

Avoid using stale in-memory snapshots to overwrite newer authoritative project state.

If the system cannot prove whether an operation committed, it must not fabricate certainty. Persist NEEDS_RECONCILIATION, provide the evidence required for diagnosis, and wait for a safe, explicitly defined recovery path.

7. Regression and invariant gates

Run the dedicated Stage 19.3 recovery suite, the relevant Stage 19.1 and 19.2 workflow suites, timeline operation and timeline E2E tests, UI server/session tests, and the full repository test command:

npm test

Required completion gates:

All dedicated recovery tests pass.

The full repository regression run passes with zero unexpected failures, skips, or cancellations; explain any pre-existing intentional skips explicitly.

The recovery suite demonstrates actual persistence/restart behavior, not only same-process retries.

No duplicate project mutation or revision increment occurs in the lost-response recovery scenario.

No unapproved plan executes against a stale base revision.

Atomic failure does not alter canonical project content or revision.

Non-atomic partial success remains accurately and durably represented.

Terminal job states resist ordinary late callbacks.

Failed or ambiguous delivery paths do not replace the active verified delivery.

schema/eme-project.v1.schema.json remains unchanged.

TICKS_PER_SECOND = 120,000, half-open interval semantics, track-lock behavior, OperationExecutor authority, sidecar-only VTSM masks, and advisory-only Laya behavior remain intact.

Include the actual command, raw summary, exit code, duration, and test counts for every reported run. Do not label a targeted test run as the full repository regression.

8. Required engineering artifacts

Deliver the following:

plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md — complete state-by-state restart and reconciliation matrix.

plans/PHASE_19_STAGE3_COMPLETION_REPORT.md — scope, design decisions, files changed, failure-injection scenarios, evidence, test results, limitations, and unresolved risks.

tests/workflow-stage19-3-recovery.test.js — durable recovery and restart test suite.

A baseline identity containing the candidate commit SHA, parent commit, and working-tree status. Do not describe the candidate as release-certified merely because the test suite passes.

An explicit statement identifying which recovery guarantees have been demonstrated and which remain unproven.

Keep implementation changes focused on the recovery contract. Do not change the project schema or silently broaden the canonical job-state model.

9. Acceptance standard

Stage 19.3 will be accepted only when the evidence demonstrates that:

The engine can recover safely from process interruption across the specified mutation, verification, render, and publication boundaries.

It can reconcile a completed mutation whose acknowledgement was lost without applying that mutation twice.

It correctly distinguishes committed, rolled-back, partially committed, and uncertain outcomes.

It preserves revision DAG integrity and active-delivery safety under failures, retries, restarts, and late callbacks.

The full repository regression passes against an identified candidate baseline.

The completion report makes no stronger reliability claims than the tests establish.

Stage 19.3 approval does not certify the unified render endpoint, final delivery packaging, or production release. Those remain separate acceptance gates after recovery/reconciliation is certified.

Use required GSD actions to achieve the goals and wherever needed.

Proceed with Stage 19.3 implementation and return the recovery matrix and completion report for formal review before starting the next stage.

Final authorization: Stage 19.2 is accepted, and Stage 19.3 is authorized under the recovery-focused directive above. The team should not mark Phase 19 complete or claim final delivery certification until the remaining delivery-path and packaging gates have been reviewed separately.
