# ChatGPT Architecture Lead: Phase 19 Stage 19.3 Review & Next Directive

**Date**: 2026-10-20T19:08:52.707Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.3 Review  

---

Formal Architecture Review — Phase 19, Stage 19.3
Stage 19.3: Functionally accepted, certification pending evidence reconciliation

Review basis: the submitted Stage 19.3 completion report. Repository code, the underlying recovery matrix, Git state, and test execution have not been independently inspected or rerun.

The report provides strong evidence for the recovery work. It records 12/12 dedicated recovery tests passing, 40/40 Phase 19 workflow tests passing, 62/62 cross-subsystem tests passing, and a reported full npm test result of 500/500 tests passing. 
Pasted text.txt

The central architectural outcomes are aligned with the directive: the reported lost-response recovery avoids a second mutation, uncertain outcomes enter NEEDS_RECONCILIATION, restart recovery reloads durable job records, atomic failures preserve canonical project state, and failed publication paths preserve the last known-good active delivery. 
Pasted text.txt

However, I am not issuing unconditional Stage 19.3 certification yet. There are specific evidence discrepancies to close before the recovery milestone becomes the immutable baseline for delivery-path work.

Required evidence corrections

1. Non-atomic recovery has an unexplained contradiction.

The Scenario F description says step 1 succeeds and step 2 fails, but the same row reports executedSteps: 0. 
Pasted text.txt
 Those results do not agree under the ordinary meaning of “executed steps.”

The team must inspect the actual journal and project state, clarify what executedSteps counts, and correct either the implementation, assertion, or report as appropriate. The expected result is that the committed-step count, actual project content, resulting revision, and durable journal all agree.

2. The master-suite count needs clarification.

The report declares 12 test suites while enumerating subsystem areas that appear to total 13, depending on how the Stage 19 workflow group is counted. 
Pasted text.txt
 This may be a distinction between runner suites and subsystem categories, rather than a test failure. State that distinction explicitly and retain the actual test-runner summary.

3. Stage 19.3 does not yet have an immutable candidate identity.

The report identifies 741dde7 as its Git baseline while also stating that Stage 19.1–19.3 candidate files remain modified or added in the working tree. 
Pasted text.txt
 Therefore, the reported SHA does not by itself identify the exact source tree that produced the 500 passing tests. Record the final Stage 19.3 commit SHA—or an equivalently reproducible candidate identity with its complete patch—and rerun the full suite against that exact candidate.

4. The recovery matrix still needs direct review.

The submitted report names plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md and summarizes its intended coverage, but the actual matrix contents were not included in the material available for this review. 
Pasted text.txt
 I can review the reported design outcomes, but cannot yet certify that every state’s restart evidence, permissible actions, and fallback transitions are correctly specified.

These are bounded closure items, not a reason to discard the recovery implementation. Resolve them through a short evidence addendum and rerun the appropriate tests. Until then, the accurate decision is functional acceptance with certification pending.

Formal Stage 19.4 Architecture Directive
Writing
Phase 19 (RT-01) — Stage 19.4 Architecture Directive
Closed-Loop Delivery Path Unification & CLI/REST Certification

To: EME Engineering Team
From: ChatGPT Architecture Lead
Milestone: RT-01 — End-to-End Workflow Integration & Final Delivery
Stage: 19.4
Decision: Conditionally authorized, subject to Stage 19.3 evidence closure
Required completion report: plans/PHASE_19_STAGE4_COMPLETION_REPORT.md

1. Stage 19.3 Closure Gate

Before certifying Stage 19.3 as the recovery baseline, publish a short evidence addendum that resolves the following:

Reconcile Scenario F's reported executedSteps: 0 with its description that the first non-atomic operation succeeded and the second failed. Validate the actual project content, revision, and durable operation journal.

Clarify the reported master test-suite count versus the enumerated subsystem areas.

Identify the exact source tree that produced the accepted test results. Prefer a clean, committed candidate with a full commit SHA, parent SHA, and clean working-tree status.

Run npm test against that exact candidate and record the actual output, test counts, duration, and exit code.

Submit plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md for direct review. Confirm that the matrix matches the implemented transitions and is consistent with the recovery tests.

Do not suppress a discrepancy merely to preserve a passing status. If the non-atomic result is incorrect, fix the underlying behavior and tests, then rerun the relevant suites and full regression.

Once these closure items are resolved, Stage 19.3 may be recorded as certified. Stage 19.4 implementation preparation may proceed in parallel, but do not tag Stage 19.3 or represent the recovery baseline as immutable until its identity and evidence are reconciled.

2. Objective

Unify every delivery-producing render entry point behind the same authoritative, closed-loop delivery contract.

The required delivery path is:

Request → Job Creation → Planning / Preflight → Deterministic Execution, if required → Post-Execution Verification → Render → Media QA → Manifest and Integrity Verification → Active-Delivery Publication → Verified Terminal Job State

This applies to orchestration workflows, delivery-producing REST endpoints, and supported CLI delivery commands.

Stage 19.3 established the recovery contract. Stage 19.4 must prove that user-facing entry points actually use that contract rather than bypassing it.

The primary seam to resolve is the direct POST /api/render path previously identified as being separate from the full orchestration delivery pipeline.

3. Render Endpoint Contract

Inspect and document the existing semantics of POST /api/render, the orchestration job delivery path, and all supported CLI rendering or delivery commands.

For each entry point, identify whether it performs:

Preview or intermediate rendering only.

Final delivery rendering.

Verification, QA, and publication.

Any legacy behavior that must remain backward-compatible.

Delivery-producing requests must use the canonical delivery orchestration path. They must not independently publish an artifact or advance session.active_delivery before all required verification gates pass.

If an endpoint is intentionally preview-only, preserve that distinction explicitly in its contract, response, and documentation. A preview must never be reported as a verified final delivery.

Do not solve this by blindly routing every render request into a full final-export workflow. Preserve established caller semantics while eliminating ambiguous behavior and unverified publication.

4. Single Delivery Authority

Establish one canonical implementation for delivery execution and publication. REST handlers, orchestration workers, and CLI commands may adapt their inputs and outputs, but must not independently reimplement QA, manifest creation, integrity validation, or active-delivery promotion.

The canonical path must:

Bind each delivery attempt to the intended project revision and a stable delivery-run identity.

Verify that the selected project snapshot is the authoritative snapshot required by the request.

Complete required project operations through OperationExecutor.

Perform post-execution verification against the actual project state.

Render using the verified intended snapshot.

Run required Media QA and reject output that fails acceptance thresholds.

Produce a manifest bound to the correct delivery run, project revision, artifact identity, and integrity hash.

Verify that the artifact exists and that its hash matches the manifest.

Publish the active-delivery pointer only after every required gate succeeds.

Mark the job SUCCEEDED only after publication is verifiably complete.

Rendering success alone must not imply delivery success. Do not advance the active-delivery pointer on a preview render, unverified render, QA failure, missing manifest, integrity mismatch, or unknown publication outcome.

Keep the job lifecycle separate from progress-stage metadata. Use the existing canonical 12-state job model. COMMITTED may be a progress-stage label, but it must not become a new canonical job status.

5. Revision, Concurrency, and Recovery Integration

Re-use the established Stage 19.3 recovery protocol for all delivery-producing entry points.

Required behavior:

A request based on a stale project revision fails closed or follows the existing explicit replan contract.

The render and QA process remains bound to the snapshot and revision identified by the delivery attempt. A later edit must not silently change what an already-approved job means.

Concurrent manual timeline edits must not be overwritten by stale snapshots or accidentally incorporated into an unrelated delivery.

Duplicate delivery submissions with the same idempotency key and matching payload resolve to the same durable job or delivery attempt.

Reuse of an idempotency key with conflicting payloads fails closed with the established conflict contract.

A retry after a lost response checks durable job, render, manifest, and publication records before starting work again.

An interrupted or ambiguous publication must be reconciled before retrying.

Failed delivery attempts retain sufficient diagnostic evidence without replacing the prior verified active delivery.

Terminal job states remain protected against late callbacks.

Cancellation must report what actually committed and whether rendering or publication had already progressed; it must never conceal a committed mutation.

Do not claim distributed exactly-once execution. State the actual idempotency and recovery guarantees demonstrated by the local durable journal and concurrency controls.

6. CLI and REST Consistency

Create an explicit contract for the delivery-producing REST endpoints and CLI commands supported by the project.

For equivalent delivery requests, both entry points must share the same authoritative delivery orchestration and produce consistent outcomes.

Verify that callers can distinguish:

Request accepted versus workflow completed.

Project revision committed versus delivery published.

Render produced versus render passed QA.

Delivery failed versus outcome unknown and awaiting reconciliation.

An intermediate preview versus a verified active delivery.

Responses should expose stable job and delivery identifiers, current job status, meaningful failure details, and the authoritative revision or delivery identity where applicable.

Do not break existing API behavior silently. Document intentional compatibility changes and add contract tests for them.

7. Required Delivery Test Suite

Create:

tests/workflow-stage19-4-delivery.test.js

Include the following required scenarios:

A. Direct REST final delivery. A delivery-producing request through POST /api/render completes the canonical verification, rendering, QA, manifest, integrity, and publication contract.

B. Orchestrated final delivery parity. An equivalent request submitted through the existing orchestration entry point obeys the same delivery gates and active-delivery rules.

C. CLI final delivery parity. A supported CLI delivery command uses the same canonical delivery authority and reports results consistent with the corresponding REST request.

D. Preview isolation. If preview rendering is supported, verify that preview output cannot be promoted as a verified final delivery without completing the required final-delivery gates.

E. Render failure. A render-process error fails the delivery attempt and leaves the active verified delivery unchanged.

F. QA failure. A rendered artifact that fails Media QA is rejected and never becomes the active delivery.

G. Manifest and integrity failure. A missing, corrupt, mismatched, or incomplete manifest or artifact hash prevents promotion.

H. Duplicate submission. Repeating a matching delivery request with the same idempotency key does not produce an unintended second delivery attempt or duplicate project mutation. Conflicting payload reuse fails closed.

I. Lost response and restart. Interrupt a delivery attempt around render completion or publication acknowledgement, then restart the relevant service and reconcile from durable evidence. Do not blindly render or publish again when the existing result may already have committed.

J. Concurrent project modification. Modify the project after the original plan or delivery request is accepted. Verify that the delivery remains bound to its intended revision and cannot silently publish content from the wrong project state.

K. Publication success with lost acknowledgement. Exercise the boundary where the active-delivery pointer may have been updated but the caller did not receive confirmation. Verify durable reconciliation before any retry or final status change.

L. Last-known-good preservation. Seed a known-good active delivery and prove that render, QA, manifest, integrity, cancellation, and ambiguous-publication failures do not replace it.

Where a test makes a real final-delivery claim, exercise the actual delivery pipeline and its persistence boundaries. A mocked renderer may be used for targeted failure injection, but it cannot alone certify real rendering or artifact integrity.

Each applicable scenario must assert actual job status, project revision where relevant, durable delivery-run identity, manifest and artifact binding, active-delivery pointer, and recovery result. A SUCCEEDED label alone is not sufficient evidence.

8. Artifact, QA, and Publication Invariants

Preserve these invariants without exception:

schema/eme-project.v1.schema.json remains unchanged.

TICKS_PER_SECOND = 120,000 and half-open timeline intervals remain canonical.

OperationExecutor remains the sole canonical project mutation authority.

VTSM masks remain isolated in .vtsm.json sidecars.

Laya Decision Fabric remains advisory-only under CANARY_ADVISORY_MODE=true.

Project revisions, saved-project state, workflow jobs, render artifacts, manifests, and verified delivery pointers remain distinct concepts.

The active-delivery pointer changes only after validation of the new delivery candidate.

Recovery of an uncertain delivery does not erase, fabricate, or overwrite authoritative evidence.

Any proposed change that requires a project schema modification or canonical-state-model expansion must be submitted separately for architecture approval.

9. Regression and Performance Gates

Run, in order:

The new Stage 19.4 delivery suite.

The Stage 19.1 orchestration and Stage 19.2 golden-workflow suites.

The Stage 19.3 recovery suite.

Relevant timeline, UI server/session, rendering, Media QA, and manifest-integrity suites.

The full repository regression command: npm test.

Report every command's actual test count, pass/fail/skip/cancellation counts, duration, and exit code. Identify the exact tested commit and working-tree status.

Any performance claim must include the applicable workload and measurement methodology. Do not reuse earlier benchmark results to imply that the unified path has been benchmarked when it has not.

10. Required Deliverables

Submit:

plans/PHASE_19_STAGE4_DELIVERY_CONTRACT.md — the delivery contract and endpoint/CLI behavior matrix.

tests/workflow-stage19-4-delivery.test.js — the dedicated delivery-integration test suite.

plans/PHASE_19_STAGE4_COMPLETION_REPORT.md — implementation scope, architecture decisions, changed files, failure tests, raw regression evidence, known limitations, and acceptance mapping.

A source-control identity for the tested candidate, including full commit SHA, parent SHA, and clean working-tree status.

A concise list of delivery guarantees demonstrated by tests and guarantees that remain unproven.

Do not claim the whole RT-01 milestone is complete merely because the direct REST endpoint passes. CLI parity, orchestration parity, recovery behavior, artifact integrity, QA enforcement, and safe active-delivery publication must also be evidenced.

11. Acceptance Criteria

Stage 19.4 can be accepted only when:

All delivery-producing entry points use the canonical closed-loop delivery authority.

Preview-only behavior, if present, is clearly separated from verified final delivery.

REST, CLI, and orchestration outcomes are consistent for equivalent requests.

Render success is distinct from verified delivery success.

QA, manifest, and integrity failures cannot promote the candidate.

Duplicate requests and lost-response recovery are safe across service restarts.

Concurrent project changes cannot silently alter the intended delivery revision.

The last known-good active delivery survives all applicable failure paths.

The full repository regression passes against an identified candidate baseline.

The completion report contains no claims stronger than the evidence demonstrates.

Stage 19.4 acceptance will certify delivery-path integration and the specified CLI/REST behavior. It will not automatically certify production packaging, installation, distribution, or release operations.

Use required GSD actions to achieve the goals and wherever needed.

Proceed with Stage 19.4 implementation once the Stage 19.3 evidence addendum is resolved. Submit the delivery contract and completion report for formal architecture review before beginning final production packaging and release certification.

Next gate

The next milestone should be Stage 19.4 — Closed-Loop Delivery Path Unification & CLI/REST Certification. Reserve production packaging and release readiness for a separately reviewed Stage 19.5.

The immediate task is to reconcile the Stage 19.3 evidence—not to rewrite the recovery engine—and then carry the verified recovery guarantees into every delivery-producing entry point.
