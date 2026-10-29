# User Prompt

Lock the proposed EME × Earshot Phase 30 plan with these decisions: Scope = Full six-stage reliability certification; Validation = Both synthetic fault injection and a separate real-project benchmark; Release policy = Strict: every safety-invariant failure blocks certification. Produce the formal Architecture Lead directive, stage-level requirements, acceptance criteria, test matrix, evidence bundle specification, and required GSD actions wherever needed. Preserve all EME canonical architecture invariants.

---

# Architecture Lead Phase 30 Directive

Phase 30 is now locked as the proposed engineering plan with all three decisions fixed: full six-stage reliability certification, synthetic fault injection plus a separate real-project benchmark, and a strict safety release policy.

The directive below is designed to be handed directly to your engineering agent or IDE. It preserves the existing EME canonical architecture and makes implementation, testing, evidence collection, and formal certification separate responsibilities.

Writing
EME × Earshot
Phase 30 — Production Reliability, Crash Recovery & Fault-Injection Certification

Document Type: Formal Architecture Lead Directive
Phase: 30
Status: PLAN LOCKED — EXECUTION AUTHORIZED SUBJECT TO PREFLIGHT
Release Policy: STRICT — ZERO TOLERANCE FOR CANONICAL SAFETY-INVARIANT FAILURES
Validation Strategy: Synthetic Fault Injection + Separate Real-Project Benchmark
Predecessor: Phase 29 — Adaptive Repair Confidence & Human-in-the-Loop Escalation
Certified Predecessor Release Commit: c854f6fbf254f7b1f62f7dd9ffc33429298733d2
Expected Predecessor Tag: phase-29-certified

1. Architecture Lead Decision

Phase 30 is hereby approved as the next EME × Earshot engineering milestone, with the following scope frozen:

Full six-stage reliability certification.

Two distinct validation tracks: deterministic synthetic fault injection and a separate real-project benchmark.

Strict release policy: every failure of a canonical safety invariant blocks Phase 30 certification.

No unrelated architectural expansion. New features are permitted only when necessary to satisfy an approved Phase 30 requirement and remain within the existing architecture.

Evidence-led acceptance. A completed implementation, passing unit tests, or a successful demonstration alone does not constitute milestone certification.

The goal is to establish that EME can recover safely from crashes, interrupted operations, concurrency conflicts, persistence failures, and artifact-integrity defects without corrupting canonical project state or promoting an unverified delivery.

Phase 30 is a reliability milestone, not an autonomous-capability expansion milestone.

2. Mission and success definition
Primary mission

Prove that the Editing Mechanics Engine maintains deterministic, auditable, and recoverable behavior across failure boundaries, including failures that occur after a mutation has committed but before its outcome has been fully recorded or delivered.

For every injected failure, the engine must establish:

What state existed before the operation.

Which changes, if any, were durably committed.

Which changes remain unapplied or require compensation.

Whether an operation is safe to retry.

Whether the job can continue, must fail, was cancelled, or requires reconciliation.

Whether the active delivery remains valid.

Which durable evidence supports the recovery decision.

Definition of success

Phase 30 succeeds only when:

All six stages satisfy their mandatory acceptance criteria.

All mandatory canonical safety tests pass.

Synthetic fault-injection results and real-project benchmark results are independently reported.

Recovery behavior is demonstrated from durable evidence rather than process-local memory.

The complete predecessor regression baseline is preserved and revalidated.

Source provenance, package contents, checksums, and release manifests reconcile.

The final Architecture Lead review finds no unresolved safety blocker.

No percentage score, weighted quality metric, confidence score, or aggregate test total can override a failed mandatory safety gate.

3. Canonical architecture invariants — immutable constraints

These invariants govern every Phase 30 stage. They are not implementation suggestions.

3.1 Time and interval semantics

The canonical timebase is exactly 120,000 ticks per second.

Canonical timing uses integer arithmetic.

Intervals are half-open: [startTick, startTick + durationTick).

Recovery, serialization, compensation, and replay must preserve these semantics.

Floating-point conversions must not become an alternate canonical timing authority.

3.2 Canonical schemas

The existing 18 schema/*.v1.schema.json canonical schemas remain frozen.

Do not alter canonical schemas to accommodate Phase 30 implementation convenience.

Any genuinely necessary canonical schema change requires a separate, explicitly approved architecture change, migration strategy, and compatibility certification.

Internal fault-injection metadata, recovery evidence, and diagnostic information must not silently become canonical project fields.

3.3 Mutation ownership

OperationExecutor remains the sole canonical project mutation authority.

Recovery workers, callbacks, render processes, and diagnostic utilities must not mutate canonical project state through an alternate path.

Undo and Redo remain engine-owned.

Recovery and compensation must preserve the distinction between a committed mutation and a rolled-back candidate.

3.4 State and delivery separation

Keep these concepts distinct:

Canonical project state and revision.

Persisted project state.

Job and workflow status.

Rendered artifacts.

Release manifests and checksums.

Verified active delivery.

session.active_delivery may only be promoted after the candidate render, fresh QA, manifest, and checksum-integrity checks succeed.

A successful render is not, by itself, a successfully published delivery.

3.5 Canonical job states

The canonical job state set remains exactly:

ACCEPTED, PLANNING, AWAITING_APPROVAL, READY_TO_EXECUTE, EXECUTING, VERIFYING, RENDERING, PUBLISHING, SUCCEEDED, FAILED, CANCELLED, NEEDS_RECONCILIATION.

Do not introduce additional canonical states for retries, crash recovery, pending cleanup, or recovery-in-progress. Those concepts must be represented through existing states and appropriate internal records or ledger events.

Progress labels are not canonical job states.

3.6 Failure semantics

Genuine ambiguity routes to NEEDS_RECONCILIATION.

Deterministic operation failures route to FAILED.

User-requested cancellation routes to CANCELLED.

Canonical terminal states are immutable against late callbacks.

A missing or corrupted artifact discovered after successful completion does not retroactively erase the successful outcome. Preserve the historical success and raise INTEGRITY_DRIFT_ALERT.

Never report a committed mutation as rolled back.

Never claim an operation was committed merely because a process-local flag indicates success.

3.7 Transactions and compensation

Atomic plans roll back candidate state when they fail before authoritative commit.

Non-atomic plans preserve previously committed steps and their journals.

Compensation is an explicitly evidenced inverse operation, not a destructive historical rewrite.

A failed compensation that leaves the authoritative outcome ambiguous must trigger reconciliation.

Retrying a compensation must not apply its inverse twice.

3.8 Concurrency and durable identity

Preserve lock ordering: session lock before job lock; release in reverse order.

Use durable fencing tokens that monotonically increase and are checked at the authoritative commit boundary.

Process-local caches do not qualify as durable idempotency.

Use exclusive file creation (fs.openSync(path, 'wx')) where required for ownership or claim acquisition.

When ownership or process liveness cannot be established reliably, fail closed rather than assuming a lock is stale.

Do not allow a stale worker to commit because it previously acquired a lock.

3.9 Existing specialized constraints

VTSM masks remain in .vtsm.json sidecars, not canonical schema fields.

Laya remains advisory-only under CANARY_ADVISORY_MODE=true.

Phase 29 confidence scoring remains gating-only and never overrides hard validation.

Human approvals remain bound to the exact request, proposal, candidate revision, and relevant evidence.

Existing decision-ledger integrity and provenance guarantees remain in force.

No external runtime npm dependencies may be added without separate approval.

3.10 Repository safety

Do not use destructive Git rollback operations such as git reset --hard combined with git clean -fd to obtain a clean baseline.

Preserve test failures, recovery artifacts, and diagnostic evidence.

Use a separate branch, worktree, or evidence-preserving revert where needed.

Never force-update an existing certified release tag to conceal a provenance problem.

Any violation of these invariants is a Phase 30 release blocker.

4. Mandatory preflight — before implementation
Stage 30.0: Entry verification

Stage 30.0 is a readiness gate, not an additional numbered delivery stage.

Before changing implementation code:

Confirm the current repository and branch.

Confirm that main contains the Phase 29 release commit in its ancestry.

Verify that phase-29-certified, if created, peels to the exact certified release commit.

Confirm the working tree is clean or preserve and classify every existing change.

Re-run the Phase 29 regression baseline from the actual repository.

Archive the original results and identify any differences from the previously reported 289/289 PASS baseline.

Capture source commit, schema inventory, dependency inventory, package-generation procedure, and release-manifest structure.

Establish a known-good test fixture containing an existing valid project and verified active delivery.

The historical report states that Phase 29 achieved 289/289 PASS. Treat this as reported predecessor evidence until the result has been reproduced against the actual release source.

Entry gate: Do not begin implementation if the release ancestry is wrong, the baseline cannot be reproduced, existing work would be overwritten, or any canonical invariant is already failing.

Use the project's actual GSD workflow to plan and execute the work. Do not invent GSD action names or assume that a workflow ran merely because its documentation exists.

5. Six-stage implementation directive
Stage 30.1 — Failure Model and Reproducible Baseline
Objective

Inventory all authoritative state transitions and establish a deterministic model of the engine's failure boundaries before introducing recovery changes.

Required work

Map the complete path from request acceptance through planning, approval, execution, verification, rendering, publishing, and delivery promotion.

Identify every persistent write and every externally observable side effect.

Record the exact commit boundaries for project state, job state, workflow journals, decision-ledger events, render metadata, manifests, checksums, and active-delivery promotion.

Identify the crash windows before and after each authoritative boundary.

Identify the ownership, lock, lease, fencing-token, and idempotency rules protecting each mutation.

Create a machine-readable fault-injection registry that names each injection point, its preconditions, expected outcome, and evidence requirements.

Establish baseline fixtures for atomic plans, non-atomic plans, approvals, undo/redo, completed deliveries, failed renders, and recovery cases.

Ensure each synthetic failure can be reproduced using a fixed fixture and seed where applicable.

Deliverables

Failure-boundary inventory.

State-transition and persistence map.

Fault-injection registry.

Canonical invariant-to-test traceability matrix.

Baseline test report.

Initial recovery evidence-bundle specification.

Acceptance criteria

Every authoritative mutation boundary has at least one identified failure scenario.

Every scenario has a defined expected canonical state and durable evidence requirement.

All 18 canonical schema identities and compatibility assumptions are documented.

Phase 29 baseline results are captured and reproducible.

No production behavior is changed merely to simplify testing.

Blocking defects

Unknown mutation authority, undocumented authoritative writes, non-reproducible baseline failures, or a failure path that cannot determine whether a mutation committed.

Stage 30.2 — Crash, Restart, and Durable Recovery
Objective

Prove that the engine can reconstruct the correct outcome after process termination at critical execution boundaries.

Required fault scenarios

Inject a process crash:

Before authoritative mutation commit.

Immediately after authoritative mutation commit.

Before and after the corresponding durable journal or ledger event.

During a non-atomic plan after at least one step has committed.

During an atomic plan before its commit boundary.

During rendering, before an artifact has been finalized.

After rendering but before QA completion.

After QA but before manifest creation.

After manifest creation but before active-delivery promotion.

Immediately after active-delivery promotion but before acknowledgement.

During recovery or compensation itself.

Where the system uses multiple independent persistence operations, test the relevant ordering and interruption windows separately.

Required behavior

Reconstruct the outcome from authoritative durable records.

Determine whether the original operation committed before deciding whether to replay, compensate, fail, or reconcile.

Preserve previously committed non-atomic steps.

Discard uncommitted atomic candidate state without rewriting committed history.

Never promote a partially written or unverified artifact.

Never repeat a committed effect merely because its acknowledgement was lost.

If durable evidence cannot resolve the outcome, use NEEDS_RECONCILIATION.

A recovery restart must not weaken terminal-state immutability.

Acceptance criteria

Every registered crash window has a deterministic expected result.

Repeated restart and recovery do not duplicate committed mutations.

Durable state and reconstructed state agree after recovery.

Recovery never promotes a delivery that fails verification.

An unresolved outcome is explicitly represented instead of guessed.

All mandatory crash-recovery cases pass on the supported test environment.

Stage 30.2 is blocked if a crash can cause silent state loss, duplicate mutation, or false rollback reporting.

Stage 30.3 — Concurrency, Fencing, and Idempotency
Objective

Demonstrate correct authoritative behavior under duplicate requests, simultaneous workers, delayed callbacks, stale ownership, and retries.

Required fault scenarios

Two workers attempt the same logical operation.

A duplicate request arrives while the original operation is running.

A worker loses its lease or ownership and later attempts to commit.

A fencing token becomes stale before the commit boundary.

A callback from an earlier attempt arrives after a newer attempt has completed.

A retry begins after the operation committed but its acknowledgement failed.

A recovery worker races with a late completion callback.

An existing lock cannot be proven stale.

A duplicate compensation request arrives.

Independent sessions execute simultaneously and must not leak state into one another.

Required behavior

Enforce durable idempotency at the authoritative commit boundary.

Validate current ownership and fencing tokens at commit time, not just at initial request acceptance.

Preserve the required lock acquisition and release order.

Reject stale writes and late conflicting callbacks.

Make retry decisions based on durable operation identity and evidence.

Fail closed when ownership or liveness remains uncertain.

Preserve isolation between job, session, and delivery contexts.

Acceptance criteria

No duplicate authoritative mutation for the same idempotency identity.

No stale worker can commit an authoritative change.

No terminal job is revived by a delayed callback.

Reconciliation remains explicit when competing outcomes cannot be resolved safely.

Lock acquisition, fencing, and retry decisions are observable in the evidence records.

Concurrency tests pass under repeated runs and controlled scheduling variations.

A passing single-worker test is insufficient evidence for this stage.

Stage 30.4 — Artifact Integrity, Compensation, and Reconciliation
Objective

Protect delivery integrity and historical truth when artifacts, metadata, manifests, or compensation operations fail.

Required fault scenarios

Rendered artifact missing after a reported successful render.

Rendered artifact altered after checksum generation.

Truncated or malformed render output.

Missing, malformed, or inconsistent manifest.

A checksum mismatch between artifact and manifest.

Failure during replacement of a previously valid delivery.

Failure after successful QA but before delivery promotion.

Failure immediately after promotion.

Failed compensation of a partially completed operation.

A successful historical job later exhibits artifact integrity drift.

Required behavior

Verify artifact existence, structure, and required integrity metadata before promotion.

Recompute and compare the required cryptographic checksums at the appropriate trust boundaries.

Generate fresh QA evidence for the candidate delivery.

Never use a stale QA result to authorize a new candidate.

Preserve the previous valid active delivery until its replacement passes all required checks.

Preserve the success history of a job that previously completed successfully.

Emit INTEGRITY_DRIFT_ALERT when a successful delivery's artifact later disappears or becomes corrupted.

Record compensation effects explicitly, including failures and unresolved outcomes.

Route genuinely ambiguous recovery decisions to NEEDS_RECONCILIATION.

Acceptance criteria

No corrupted, missing, or unverified candidate becomes active.

The previous valid active delivery survives a failed replacement attempt.

Artifact checksums and manifest records reconcile exactly.

Historical execution outcomes are not rewritten to disguise later integrity drift.

Compensation cannot silently erase evidence of already committed effects.

Every unresolved compensation case has explicit reconciliation evidence.

Stage 30.5 — Deterministic Recovery Evidence and Replay
Objective

Make every important recovery decision independently auditable and reproducible.

Required work

Define a stable operation identifier and correlate related recovery attempts without conflating distinct operations.

Record fault-injection identity, initial state, revision, commit status, worker identity, relevant fencing information, and recovery decision.

Capture durable event ordering sufficient to distinguish committed from uncommitted effects.

Associate artifacts and manifests with their cryptographic checksums.

Preserve evidence from failed recovery attempts instead of replacing it with the latest attempt.

Make repeated evidence generation deterministic wherever the underlying inputs are unchanged.

Ensure replay tooling is diagnostic or uses an isolated fixture; it must not bypass OperationExecutor to mutate canonical project state.

Clearly separate expected test-fixture values from actual measured results.

Required evidence fields

Each scenario record should include, where applicable:

Scenario ID and test version.

Source commit and test-run identity.

Initial canonical project revision.

Operation and job identity.

Injected fault point and timing.

Initial and resulting canonical job states.

Durable commit decision and journal references.

Recovery action and justification.

Expected versus observed state.

Artifact and manifest checksums.

Active-delivery identity before and after recovery.

Test assertions and final verdict.

Evidence file references.

Any unresolved condition and its escalation decision.

Sensitive data should not be copied into diagnostic bundles unnecessarily. Any redaction must preserve the integrity and interpretability of the evidence.

Acceptance criteria

Every mandatory failure scenario produces a traceable evidence record.

A reviewer can reproduce the scenario from its documented fixture and procedure.

Records distinguish actual results from expected results.

Conflicting or incomplete evidence is reported as such.

Evidence generation does not modify canonical project state.

Repeated recovery runs do not silently overwrite previous failure evidence.

Stage 30.6 — Master Regression, Qualification, and Release Certification
Objective

Combine the six-stage results into one source-bound, reproducible release qualification.

Required work

Run the complete predecessor regression suite.

Run all Phase 30 unit, integration, concurrency, persistence, crash-recovery, artifact-integrity, and fault-injection tests.

Run the separate real-project benchmark defined in Section 7.

Re-run any required test under controlled repeated execution when nondeterministic behavior could conceal a defect.

Review every failed, skipped, quarantined, and flaky test. No safety-critical case may be silently skipped or excluded from the denominator.

Reconcile source changes against the certified Phase 29 baseline.

Verify canonical schema immutability and runtime dependency policy.

Build a clean release archive using the repository's approved release-generation procedure.

Reconcile the manifest, source commit, archive size, checksums, file inventory, and test evidence.

Produce a formal go/no-go dossier for Architecture Lead review.

Acceptance criteria

All mandatory tests pass.

The historical regression baseline is preserved and fully revalidated.

Synthetic and real-project validation reports are separately available.

No canonical schema has been silently altered.

No external runtime dependency has been added without approval.

No unresolved critical safety defect remains.

Source-to-package provenance is reproducible and internally consistent.

The Architecture Lead can identify the exact tested source and release package from the evidence bundle.

A passing aggregate score cannot compensate for a single failed mandatory safety test.

6. Mandatory synthetic fault-injection test matrix

Use the following matrix as the minimum mandatory coverage. Expand it whenever Stage 30.1 identifies additional authoritative failure windows.

ID	Fault scenario	Required postcondition	Severity
FI-01	Crash before atomic commit	Candidate changes absent; committed state preserved	Release blocker
FI-02	Crash immediately after commit	Durable evidence identifies committed outcome; no false rollback	Release blocker
FI-03	Crash during non-atomic execution	Previously committed steps preserved and journaled	Release blocker
FI-04	Crash between mutation and acknowledgement	Retry does not duplicate committed effect	Release blocker
FI-05	Crash during rendering	Incomplete render never becomes active	Release blocker
FI-06	Crash between QA and publication	Promotion requires valid candidate and fresh QA	Release blocker
FI-07	Crash after promotion	Recovered active-delivery identity agrees with durable evidence	Release blocker
FI-08	Ledger or journal persistence failure	Commit truth preserved; ambiguity reconciled	Release blocker
FI-09	Duplicate concurrent request	At most one authoritative logical effect	Release blocker
FI-10	Stale fencing token	Stale worker cannot commit	Release blocker
FI-11	Uncertain process liveness	Fail closed; no unsafe lock takeover	Release blocker
FI-12	Late callback after terminal state	Terminal state remains unchanged	Release blocker
FI-13	Missing or checksum-mismatched artifact	Invalid candidate is not promoted	Release blocker
FI-14	Corrupt or inconsistent manifest	Delivery verification fails safely	Release blocker
FI-15	Compensation fails after partial effects	Committed effects remain truthful; ambiguity reconciled	Release blocker
FI-16	Post-success artifact corruption	Historical success retained; integrity-drift alert emitted	Release blocker
FI-17	Repeated recovery of same committed operation	No duplicate mutation or compensation	Release blocker
FI-18	Cross-session concurrency	Session isolation maintained	Release blocker
FI-19	Repeated evidence generation	Prior evidence preserved; no silent replacement	Release blocker
FI-20	Recovery with insufficient durable evidence	NEEDS_RECONCILIATION, never a guessed outcome	Release blocker
Test design rules

For every matrix entry:

Declare the initial fixture and its authoritative revision.

Verify that the fault was injected at the intended boundary.

Restart or retry the system where applicable.

Inspect durable state, not merely UI output or in-memory status.

Compare expected state, observed state, job status, journal records, and delivery identity.

Verify that assertions fail when the targeted invariant is deliberately violated in an isolated test control, where feasible.

Preserve the full run output and scenario evidence.

A test that did not actually reach its intended failure point is inconclusive, not a pass.

7. Separate real-project benchmark

Synthetic fault tests establish specific failure semantics. They do not establish that the engine is reliable across real editing projects.

Phase 30 therefore includes a separate benchmark with independently identified projects and fixtures.

7.1 Benchmark entry requirements

Select representative, legally usable editing projects with reproducible inputs.

Record source-media and project provenance.

Preserve a known-good copy of each input.

Use a separate workspace and isolated delivery destination.

Establish a baseline render and QA result before testing recovery.

Identify applicable project properties, clips, revisions, and expected outcomes.

Exclude private or confidential project material from evidence bundles unless its inclusion is explicitly authorized.

Do not silently substitute synthetic fixtures for real editing projects in this track.

7.2 Required benchmark coverage

The selected benchmark suite must cover, as applicable:

Short and long timelines.

Multiple clips, tracks, and transitions.

Existing masks and sidecar metadata.

Projects with deterministic, reproducible repair candidates.

At least one multi-step repair workflow.

At least one human-approval workflow involving a revision-bound proposal.

Render interruption and restart.

Failed delivery replacement with an existing verified active delivery.

Repeated execution and artifact-integrity verification.

Record the rationale for project selection and identify any unsupported project class.

7.3 Execution modes

Use two distinct modes:

Mode A — Baseline and replay. Run the project without injected faults to establish expected state, output, and QA behavior.

Mode B — Fault and recovery. Run the same fixture in an isolated workspace, inject a documented fault, recover the operation, and compare the result with the expected state.

Begin in a non-destructive or shadow-evaluation mode. Do not expose benchmark faults to users or replace production deliveries during qualification.

7.4 Required measurements

For each real project, report:

Input project identity and revision.

Source-media inventory and checksums where practical.

Baseline execution outcome.

Fault scenario and injection point.

Recovery duration and number of attempts.

Resulting project revision and job state.

Render and QA results.

Active-delivery identity before and after the test.

Artifact and manifest checksums.

Any discrepancy against the synthetic fixture's expected semantics.

Final pass, fail, or inconclusive classification.

7.5 Benchmark acceptance criteria

All mandatory applicable recovery scenarios pass.

No project or media input is unintentionally modified.

No unverified delivery is promoted.

The resulting project state and artifacts match the documented expected behavior.

All deviations are investigated and classified.

Unsupported scenarios are explicitly recorded and do not count as successful coverage.

The benchmark report must be separate from the synthetic fault-injection report. Both are mandatory for final certification.

8. Evidence bundle specification

Every stage must produce a versioned evidence bundle. Stage 30.6 combines these into the final Phase 30 certification dossier.

8.1 Recommended directory layout

Use the repository's established artifact conventions if they already exist. Otherwise, adopt a structure equivalent to:

artifacts/
  phase-30/
    baseline/
      source-provenance.json
      schema-inventory.json
      dependency-inventory.json
      predecessor-regression.txt

    stage-30.1/
      failure-boundaries.json
      fault-registry.json
      invariant-test-map.json
      stage-report.md

    stage-30.2/
      crash-recovery-results.json
      restart-verification.txt
      stage-report.md

    stage-30.3/
      concurrency-results.json
      idempotency-results.json
      stage-report.md

    stage-30.4/
      artifact-integrity-results.json
      compensation-results.json
      reconciliation-results.json
      stage-report.md

    stage-30.5/
      replay-results.json
      evidence-integrity-report.json
      stage-report.md

    stage-30.6/
      synthetic-fault-report.md
      real-project-benchmark.md
      complete-test-results.json
      invariant-gate-report.json
      release-manifest.json
      package.sha256
      package-inventory.txt
      certification-dossier.md

This is a proposed organization, not a claim that those paths already exist. Reuse established repository conventions where they serve the same purpose, and record any deviation.

8.2 Minimum provenance fields

The release manifest or its referenced provenance record must identify:

Exact source commit.

Applicable predecessor release identity.

Release package filename.

SHA-256 of the package.

Package byte size.

Archive entry count and inventory.

Canonical schema inventory and version identifiers.

Runtime dependency inventory.

Test-suite identity and results.

Synthetic benchmark identity.

Real-project benchmark identity.

Build and package-generation procedure.

Evidence file inventory and checksums.

Certification status and decision record.

Never populate measured fields with expected values or fabricate checksums to complete a manifest.

8.3 Evidence integrity

Hash the final evidence files after they are finalized.

Generate an inventory that identifies every included evidence file.

Preserve raw test output in addition to summarized reports.

Preserve failed-run evidence even after a fix produces a later passing run.

Explicitly label rerun results and connect them to the original failed scenario.

Ensure the manifest describes the actual release package, not an earlier candidate package.

Avoid circular package-hash calculations; define clearly which files are inside the archive and which are external release attestations.

9. Strict pass/fail and certification policy
9.1 Mandatory pass requirements

Phase 30 may be certified only when all of the following hold:

Stage 30.1 through Stage 30.6 have individually passed.

Every mandatory safety-invariant assertion has passed.

All required synthetic fault scenarios are passing.

The separate real-project benchmark satisfies its acceptance criteria.

The complete predecessor regression suite passes.

No mandatory test is silently skipped, excluded, or reclassified to obtain a passing result.

All material failures have been resolved and retested.

Any schema, dependency, or architecture change has prior approval.

The final source and release package are reconciled with the evidence bundle.

No required provenance or checksum verification remains unresolved.

9.2 Blocking conditions

Any of the following results in NO-GO:

An authoritative mutation cannot be classified accurately as committed or uncommitted.

Recovery duplicates a committed effect or compensation.

A stale worker commits a mutation.

A terminal job is revived by a late callback.

An invalid delivery becomes active.

A committed mutation is reported as rolled back.

A genuine ambiguity is resolved by guessing instead of reconciliation.

The historical success record is rewritten to conceal later integrity drift.

Canonical schemas or mutation authorities are changed without approval.

The release manifest, archive checksum, or source provenance does not reconcile.

A required safety test is inconclusive, skipped, or failing.

An inconclusive result remains unresolved until new evidence establishes the expected behavior.

9.3 Permitted non-safety exceptions

Non-safety issues may be documented for future work only if all of these conditions hold:

The issue has no impact on any canonical invariant or mandatory acceptance criterion.

The issue is reproducible or its uncertainty is explicitly recorded.

A documented rationale and follow-up issue exist.

The exception is explicitly approved by the Architecture Lead.

There is no exception mechanism for a canonical safety-invariant failure.

9.4 Final decision states

The Architecture Lead's final decision must be one of:

CERTIFIED: All mandatory gates pass and release authorization may be granted.

BLOCKED: A release-blocking requirement has failed or remains unresolved.

INCONCLUSIVE: Evidence is insufficient to determine whether the required behavior holds.

A green UI indicator or aggregate test percentage cannot substitute for this decision.

10. Required GSD workflow and actions

Mandatory execution instruction: use required GSD actions to achieve the goals and wherever needed.

Use the actual GSD workflow and action definitions available in the repository or the authorized development environment. Discover the supported actions before invoking them. Do not invent command names, bypass required workflow stages, or claim completion without evidence.

GSD action sequence

Inspect and establish context. Read the project's GSD instructions, current milestone state, roadmap, plans, relevant architecture documents, and existing verification conventions.

Plan Phase 30. Create or update the Phase 30 plan using the established GSD planning actions. Include all six stages, their dependencies, their tests, and their acceptance criteria.

Map requirements to implementation. Create explicit links between canonical invariants, affected components, planned changes, and the test cases that prove the behavior.

Execute stage by stage. Use the relevant GSD execution actions for each stage. Preserve the intended stage boundaries and avoid implementing all six stages before evaluating intermediate results.

Verify every stage. Use the established GSD verification and test actions. Capture the actual command, exit status, output, test denominator, and evidence path.

Maintain recovery evidence. Record failed runs, remediation, rerun results, unresolved blockers, and deviations using the project's established GSD tracking mechanism.

Perform master regression. Use the required GSD integration or verification workflow, plus the independent synthetic and real-project benchmark procedures.

Close the milestone. Use the established GSD phase-close or milestone-completion action only after all acceptance gates pass. Preserve the actual output as evidence.

If the installed GSD framework does not provide one of these actions, document the limitation and use the closest supported workflow. Do not claim a nonexistent action was executed.

GSD completion requirements

Phase 30 has an explicit plan and six identifiable stages.

Every stage has a recorded completion or blocked status.

Every test result points to preserved evidence.

Blockers remain visible until resolved.

The final GSD summary agrees with the canonical state, test results, and release provenance.

No phase-close action is recorded as successful before the required gates pass.

11. Git and release-management requirements
11.1 Branch and history safety

Preserve the certified Phase 29 commit and its tag.

Create a dedicated Phase 30 working branch or use the repository's established GSD branch workflow.

Keep the known-good predecessor state recoverable.

Do not rewrite certified history to make the Phase 30 branch appear cleaner.

Do not overwrite an existing release tag.

Preserve the exact tested source commit and package-generation inputs.

11.2 Release preparation

The final release candidate must be generated from the exact source commit identified in its provenance records. After any change that affects executable code, configuration, schemas, packaging, or tests, rerun the relevant verification and regenerate the affected evidence.

The certification dossier must distinguish:

Implementation commit.

Tested release-candidate commit.

Any eventual merge commit.

Annotated certification-tag target.

Release archive checksum.

These identifiers are not interchangeable.

11.3 Certification authority

Phase 30 planning is approved by this directive. Implementation and testing may proceed after preflight. Final Phase 30 certification, merge authorization, and creation of any Phase 30 certification tag require a separate Architecture Lead decision.

No release tag is authorized by this planning document.

12. Required Architecture Lead status report

At the end of each stage, submit a structured report containing:

A. Stage identity

Phase, stage, branch, source commit, and stage status.

B. Scope delivered

Files or components changed.

Architecture decisions made.

Existing invariants reviewed.

C. Test results

Exact commands or GSD actions used.

Test totals, passing, failing, skipped, and inconclusive counts.

Relevant raw output and evidence locations.

Deviations from the approved matrix.

D. Failure analysis

Faults injected.

Actual recovery behavior.

Commit and rollback truth.

Job state and delivery integrity.

Remaining defects.

E. Provenance

Changes from the predecessor baseline.

Schema and dependency inventory.

Commit and package status.

F. Decision requested

PASS, BLOCKED, or INCONCLUSIVE for that stage.

Outstanding blockers.

The next stage requested.

Do not represent a stage as passed merely because its code is merged or its feature appears to work in the UI.

13. Final Architecture Lead certification checklist

Before recommending Phase 30 certification, answer every item with concrete evidence.

Phase 29 release provenance verified.

The original 18 canonical schema identities preserved.

OperationExecutor remains the sole canonical mutation authority.

Canonical timebase and half-open interval semantics preserved.

Atomic and non-atomic failure behavior verified.

Crash/restart cases pass.

Durable idempotency verified across retries.

Fencing and concurrency protections verified.

Terminal-state immutability verified.

Integrity-drift behavior verified.

Active-delivery promotion safety verified.

Compensation and reconciliation behavior verified.

Recovery evidence can be replayed or independently audited.

Synthetic fault-injection report complete.

Separate real-project benchmark report complete.

Complete predecessor regression baseline passes.

No mandatory safety test skipped or inconclusive.

Runtime dependency policy satisfied.

Release archive and manifest reconciled.

Source provenance and SHA-256 checksums independently verified.

GSD stage and verification records reconciled with actual outcomes.

No unresolved canonical safety violation.

Any unchecked mandatory item means Phase 30 certification is not ready to be granted.

14. Immediate next actions

Execute only the following activities first:

Confirm Phase 29's actual merge and certification-tag status without modifying Git history.

Reproduce the predecessor baseline and preserve its full output.

Inspect the existing GSD workflow and repository architecture.

Produce the Stage 30.1 failure inventory and test map.

Have the Architecture Lead review the Stage 30.1 deliverables before implementation proceeds into the subsequent stages.

Do not begin by refactoring the entire engine or adding new autonomous features.

Final directive

Phase 30 scope is locked. Preflight and Stage 30.1 are authorized to begin, subject to the entry gate. The remaining stages must be executed in sequence, verified with actual evidence, and escalated to the Architecture Lead whenever an invariant is threatened.

The release policy is strict: preserve state truth, preserve evidence, protect the active delivery, fail closed when authority is uncertain, and never trade correctness for a green test summary.

What happens next

The immediate deliverable is Stage 30.1: Failure Model and Reproducible Baseline—not implementation code yet. Your engineering agent should first inspect the actual repository and GSD workflow, reproduce the Phase 29 baseline, and map the engine's authoritative mutation and persistence boundaries.

Once that inventory is available, we can review the fault matrix against the real code paths and prevent gaps in coverage before Stage 30.2 introduces crash-recovery changes.

ChatGPT can make mistakes. Check important info.
Latest response
Meet Codex in the desktop app
A coding agent that helps you build and ship with AI, included for free in your ChatGPT plan.
Learn more
Download the app




Think