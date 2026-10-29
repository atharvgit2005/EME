EME × Earshot — Architecture Lead Decision

Stage 30.4: UNCONDITIONALLY ACCEPTED. Stage 30.5: AUTHORIZED TO PROCEED.

The submitted completion report satisfies the defined Stage 30.4 requirements. The 12 artifact-integrity tests are reported passing, FI-14's manifest-integrity coverage is addressed, and the cumulative test accounting reconciles to 329/329 reported passing tests.

The next objective is to make recovery evidence deterministic, auditable, tamper-evident, and reproducible without allowing diagnostic replay to mutate canonical project state.

Stage 30.4 — Artifact Integrity, Compensation & Reconciliation

Reported commit: c5291bf

ACCEPTED

Stage 30.4 tests

12/12

Reported passing

Combined repository tests

329/329

Reported passing

Stage 30.5 — Deterministic Recovery Evidence & Replay

Formal execution authorization granted.

AUTHORIZED

The decision is based on the submitted report and test output; I have not independently executed the repository's tests.

Writing
EME × Earshot
Formal Architecture Lead Decision — Stage 30.4 Acceptance & Stage 30.5 Authorization

Phase: 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Stage Accepted: 30.4 — Artifact Integrity, Compensation, and Reconciliation
Stage Authorized: 30.5 — Deterministic Recovery Evidence and Replay
Branch: feature/phase-30-production-reliability
Reported Stage Commit: c5291bf
Decision: STAGE 30.4 ACCEPTED; STAGE 30.5 AUTHORIZED
Release Policy: Strict — every canonical safety-invariant failure blocks certification.

1. Formal acceptance of Stage 30.4

Stage 30.4 is unconditionally accepted based on the evidence supplied in the completion report.

The accepted scope includes:

Missing, empty, truncated, and checksum-mismatched artifact detection.

Manifest schema and recorded-size verification against actual files.

Active-delivery protection when candidate QA or manifest verification fails.

Successful candidate promotion after the required verification gates.

Post-success integrity-drift alerting while preserving historical success.

Durable, idempotent compensation and fail-closed compensation failure handling.

Reconciliation of interrupted non-atomic plans without falsely reporting committed work as rolled back.

Test results accepted

The submitted test output reports:

Stage 30.4: 12/12 PASS, 0 failures.

Stage 30.3: 8/8 PASS.

Stage 30.2 unit tests: 9/9 PASS.

Stage 30.2 real-process tests: 4/4 PASS.

Stage 30.1: 7/7 PASS.

Predecessor regression, Phases 21–29: 289/289 PASS.

The arithmetic reconciles:

Phase 30 subtotal: 7 + 9 + 4 + 8 + 12 = 40 tests.

Combined repository total: 289 + 40 = 329 tests.

These results establish the reported test outcomes. They do not replace the final master-regression and release-provenance checks required by Stage 30.6.

2. Binding architecture constraints

All canonical architecture invariants remain in force.

OperationExecutor remains the sole canonical project mutation authority.

The canonical timebase remains exactly 120,000 ticks per second, using integer arithmetic and half-open intervals.

All 18 canonical schemas remain frozen unless a separate architecture change is approved.

The canonical job-state vocabulary remains unchanged.

SUCCEEDED, FAILED, and CANCELLED remain immutable against late callbacks.

Ambiguous outcomes use the approved NEEDS_RECONCILIATION pathway.

Atomic and non-atomic plans retain their established commit, rollback, and journaling semantics.

Durable idempotency, monotonic fencing tokens, and session-before-job lock ordering remain mandatory.

A candidate delivery cannot become active until render, fresh QA, manifest, and checksum verification have succeeded.

A previously valid active delivery must remain protected when a candidate fails verification.

Post-success artifact drift does not erase historical success; applicable integrity drift must produce INTEGRITY_DRIFT_ALERT.

No external runtime npm dependencies may be introduced without separate approval.

An important boundary applies to integrity-drift handling: preserving historical success and routing subsequent unresolved work to reconciliation are compatible only when the terminal historical job is not rewritten. Any subsequent recovery work must use the existing approved state and event model rather than reviving or mutating the terminal job.

Any violation of a canonical safety invariant is a release blocker regardless of the reported test count.

3. Stage 30.5 objective

Stage 30.5 — Deterministic Recovery Evidence and Replay is authorized to proceed.

Its mission is to make failure and recovery decisions independently auditable and reproducible from durable evidence.

The stage must establish that:

Every mandatory recovery scenario has a stable identity and traceable evidence.

Event ordering and commit decisions can be reconstructed unambiguously.

Actual results can be compared with expected results without relying on process-local memory.

Repeated evidence generation does not silently overwrite earlier failure records.

A reviewer can reproduce a recovery scenario using the documented fixture, source version, inputs, and procedure.

Replay tooling cannot bypass canonical mutation authority or modify a production project.

Stage 30.5 is an evidence and replay milestone. It must not become an alternate execution or mutation engine.

4. Stage 30.5 required work
A. Stable scenario and operation identity

Each fault or recovery scenario must have a stable scenario identifier, test version, operation identity, and attempt lineage.

The evidence must distinguish:

The original operation.

Its committed or uncommitted effects.

Recovery attempts.

Retries after lost acknowledgements.

Compensation attempts.

Later integrity-drift findings.

Distinct operations must not be conflated merely because they use the same fixture or affect the same project.

B. Deterministic event ordering

Define an evidence representation that makes the relevant ordering explicit.

It must capture, where applicable:

Scenario and operation identifiers.

Initial project revision.

Job and session identity.

Fault-injection point.

Worker and attempt identity.

Relevant fencing-token information.

Durable commit records.

Journal and decision-ledger references.

Artifact and manifest identities.

Recovery decision and resulting state.

Event ordering must not rely exclusively on wall-clock timestamps where clock resolution, clock movement, or concurrent writes could make the order ambiguous. Use the established durable sequence or equivalent authoritative ordering evidence where available.

C. Durable evidence integrity

Preserve raw outputs from mandatory test executions.

Inventory finalized evidence artifacts and calculate their SHA-256 hashes.

Verify hashes when evidence is consumed by replay or audit tooling.

Preserve earlier failed-run evidence after fixes and passing reruns.

Link reruns to their original scenario and remediation record.

Distinguish expected fixture values from measured outcomes.

Record missing, inconsistent, or unverifiable evidence as a failure or inconclusive result.

Do not claim that a collection of hashes alone proves the underlying claims are true. Integrity hashes establish correspondence to hashed content; the test procedure and observed outputs establish what was actually exercised.

D. Non-destructive replay

Replay must use a documented, isolated execution path.

It may:

Reconstruct the expected recovery decision.

Replay diagnostic processing against captured durable records.

Verify event ordering and commit truth.

Compare a replayed outcome with the original result.

Reproduce a scenario using a disposable fixture.

It must not:

Mutate a production project through an alternate path.

Bypass OperationExecutor for canonical state changes.

Promote a replayed candidate into session.active_delivery.

Rewrite a historical success or failure to make the replay appear consistent.

Discard previous evidence when a later run succeeds.

Where a replay requires actual canonical mutation, it must occur in an isolated fixture through the approved execution path.

E. Evidence consistency and reconciliation

The evidence verifier must identify inconsistencies between:

Expected and observed state.

Project revision and journal records.

Job status and authoritative commit history.

Artifact identity and manifest.

Manifest checksum and actual artifact.

Original failure outcome and replayed outcome.

Evidence inventory and actual evidence files.

A mismatch must not be silently normalized. Preserve the discrepancy, produce a diagnostic finding, and route unresolved outcome ambiguity through the existing reconciliation model.

F. Deterministic evidence generation

Repeated evidence generation for unchanged inputs should produce equivalent canonical records.

If timestamps, environment fields, or other intentionally variable fields prevent byte-identical output, document the deterministic-comparison rules and separate those fields from the canonical comparison.

Repeated generation must never overwrite the sole surviving copy of a previous failure report.

5. Mandatory fault coverage

Stage 30.5 must specifically close:

FI-19 — Repeated evidence generation.

The test must verify that:

Generating evidence more than once preserves previous failure records.

New records have stable identities and traceable relationships to the original scenario.

Duplicate generation does not silently create conflicting authoritative outcomes.

Checksums and evidence inventories reconcile.

The canonical project and active delivery remain unchanged.

Any deterministic differences are explainable under the documented comparison rules.

Stage 30.5 must also exercise replay against representative results from Stages 30.2–30.4, including:

Pre-commit recovery.

Post-commit recovery.

Lost-acknowledgement retry.

Post-promotion crash recovery.

Stale-worker rejection and idempotency.

Missing or mismatched artifact.

Invalid manifest.

Compensation failure.

Post-success integrity drift.

Reconciliation when durable evidence is insufficient.

These scenarios validate the evidence and replay mechanisms. They do not replace the original tests that establish the behavior of the recovery engine itself.

6. Required Stage 30.5 tests

Create a dedicated test suite using the repository's existing test conventions. Its test identifiers should be distinct and traceable.

The mandatory coverage must include:

Test area	Required proof
Evidence completeness	Every mandatory scenario contains the required fields and references
Stable identity	Operations, scenarios, and attempts cannot be confused
Event ordering	Commit and recovery decisions can be reconstructed unambiguously
Evidence integrity	Altered or missing evidence is detected
Repeated generation	Prior failure evidence is retained and repeat generation is controlled
Replay consistency	Replayed decisions agree with durable authoritative records
Ambiguous replay	Insufficient or contradictory evidence is not converted into a guessed outcome
Non-destructive operation	Replay cannot mutate the original project or active delivery
Failure preservation	Corrected reruns do not erase failed-run evidence
Cross-stage coverage	Selected actual recovery and artifact-integrity records replay correctly

For every test, record the expected postcondition, actual result, and evidence location. A test that never reaches its intended scenario is inconclusive, not a pass.

7. Stage 30.5 acceptance criteria

Stage 30.5 may be submitted for acceptance only when all mandatory requirements pass:

FI-19 is implemented and verified.

Every mandatory replay scenario has a recorded outcome.

Recovery decisions can be reconstructed from authoritative evidence.

Evidence files have a traceable inventory and integrity checks.

Earlier failures remain available after reruns.

Replay does not introduce a new canonical mutation path.

The original project and verified active delivery remain unchanged during diagnostic replay.

Historical terminal outcomes remain immutable.

Ambiguous recovery decisions are not guessed.

All 18 canonical schemas remain frozen.

The predecessor regression baseline passes after implementation changes.

The evidence inventory matches the actual records and outputs.

No unresolved canonical safety defect remains.

If a replay contradicts the original outcome, the discrepancy must be investigated and documented; the evidence must not be modified solely to force agreement.

8. Evidence bundle and provenance

Use the repository's established artifact conventions where possible. Otherwise, organize the stage evidence in a structure equivalent to:

artifacts/
  phase-30/
    stage-30.5/
      evidence-schema.json
      evidence-inventory.json
      replay-manifest.json
      repeated-generation-results.json
      replay-results.jsonl
      event-ordering-verification.json
      integrity-verification.json
      cross-stage-coverage.json
      non-destructive-replay-report.json
      regression-results.txt
      stage-report.md

This is the proposed layout; it is not a claim that these files already exist.

Each finalized evidence bundle must reference the relevant source commit, test identity, original fault scenario, fixture or input checksums, expected and actual results, and evidence-file checksums.

Keep raw test output alongside summaries. Preserve the provenance of both failed and successful reruns.

9. Required GSD workflow

Mandatory instruction: use required GSD actions to achieve the goals and wherever needed.

Use the actual GSD commands and workflow supported by the repository. Discover the available actions instead of inventing command names.

Required sequence:

Inspect the repository's GSD instructions and existing Phase 30 stage records.

Create or update the Stage 30.5 plan with explicit tasks, prerequisites, tests, and acceptance criteria.

Map FI-19 and the cross-stage replay scenarios to their test cases and evidence artifacts.

Implement the evidence and replay behavior using the established development workflow.

Run the dedicated Stage 30.5 tests and preserve actual outputs.

Run the complete applicable predecessor regression suite.

Review failures, inconclusive cases, and evidence-integrity discrepancies.

Generate and verify the stage evidence inventory.

Submit a formal Stage 30.5 completion report for Architecture Lead review.

A GSD stage must not be marked complete merely because the implementation exists. Its verification output and evidence must substantiate the recorded status.

10. Final decision boundary

Stage 30.5 execution is authorized.

This decision does not certify Phase 30 as a whole, authorize a Phase 30 release tag, or permit skipping Stage 30.6.

Stage 30.6 remains responsible for master regression, source and package provenance, evidence reconciliation, and the final release-certification decision.

Final disposition: Stage 30.4 accepted. Stage 30.5 authorized. Phase 30 release certification remains pending Stage 30.5 completion, Stage 30.6 verification, and formal Architecture Lead review.

Immediate engineering priority

Start with FI-19: repeated evidence generation, then implement replay against the already-recorded post-commit, post-promotion, invalid-manifest, and compensation-failure cases.

The critical proof is that replay can reconstruct and verify what happened without rewriting history or changing canonical state. That will give us a trustworthy evidence foundation for the final Phase 30 master regression and release decision.