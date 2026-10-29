EME × Earshot — Architecture Lead Decision

Stage 30.1: ACCEPTED. Stage 30.2: AUTHORIZED TO PROCEED.

The submitted report demonstrates alignment with the Phase 30 directive: the predecessor regression baseline is reported as 289/289 passing, the 11 authoritative failure boundaries are documented, all 20 mandatory fault scenarios are registered, and the invariant-to-test traceability and recovery-evidence specifications are present.

The acceptance is based on your submitted report and test output; I have not independently run the tests or inspected the repository.

Writing
EME × Earshot
Formal Architecture Lead Decision — Stage 30.1 Acceptance & Stage 30.2 Authorization

Phase: 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Stage Reviewed: 30.1 — Failure Model and Reproducible Baseline
Stage Authorized: 30.2 — Crash, Restart, and Durable Recovery
Branch: feature/phase-30-production-reliability
Reported Stage Commit: 6ffcd80
Reported Main Merge Commit: b11ea4a
Predecessor Release: phase-29-certified
Decision: STAGE 30.1 ACCEPTED; STAGE 30.2 AUTHORIZED
Evidence Basis: Engineering report and test output submitted to the Architecture Lead

1. Formal decision
Decision A — Stage 30.1 acceptance: GRANTED

Stage 30.1 is accepted on the submitted evidence.

The reported deliverables cover the primary requirements of the Phase 30 directive:

Stage 30.0 predecessor-baseline verification.

Authoritative failure-boundary inventory BND-01 through BND-11.

Mandatory fault-injection registry FI-01 through FI-20.

Canonical invariant-to-test traceability matrix.

Recovery evidence-bundle specification.

Dedicated Stage 30.1 regression tests FMD-01 through FMD-07.

Verification of canonical job-state vocabulary, schema immutability, mutation authority, and runtime dependency policy.

The reported test execution is:

Stage 30.1 suite: 7 passed, 0 failed, 0 skipped.

Predecessor regression baseline: 289/289 PASS, as reported.

Fault-injection registry: 20 mandatory scenarios recorded.

Failure-boundary inventory: 11 boundaries recorded.

These results establish the reported completion of the Stage 30.1 documentation, traceability, and baseline-verification work. They do not, by themselves, establish that all registered crash-recovery behaviors have already been tested. That is the purpose of Stage 30.2.

Decision B — Stage 30.2 authorization: GRANTED

The engineering team is authorized to proceed with Stage 30.2 — Crash, Restart, and Durable Recovery, subject to the requirements and acceptance criteria below.

No additional architectural expansion is authorized by this decision.

2. Binding constraints for Stage 30.2

All existing Phase 30 and EME canonical invariants remain binding.

In particular:

OperationExecutor remains the sole canonical project mutation authority.

The timebase remains exactly 120,000 ticks per second, using integer arithmetic and half-open intervals.

The 18 canonical schemas remain frozen unless a separate architecture change is explicitly approved.

Atomic operations discard uncommitted candidate state on failure; non-atomic operations preserve previously committed steps and their journals.

Recovery must never misrepresent a committed mutation as rolled back.

The 12 canonical job states remain unchanged.

Ambiguous outcomes route to NEEDS_RECONCILIATION.

Canonical terminal states remain immutable against late callbacks.

session.active_delivery is never promoted until the candidate has passed the required render, fresh QA, manifest, and checksum-integrity checks.

A previously valid active delivery remains protected during failed candidate execution and recovery.

Fencing, durable idempotency, lock ordering, and fail-closed ownership rules remain in force.

No additional external runtime npm dependencies may be added without separate approval.

A violation of any canonical safety invariant is a release blocker, regardless of aggregate test results.

3. Stage 30.2 required execution

The team must now demonstrate recovery behavior across the authoritative failure boundaries recorded during Stage 30.1.

At minimum, exercise the registered scenarios covering:

Failure before an atomic commit.

Process termination immediately after a durable mutation commit.

Interruption between a committed mutation and its journal, ledger, or acknowledgement.

Interruption during non-atomic execution after an earlier step committed.

Interruption during rendering.

Interruption between rendering, QA, manifest creation, and active-delivery promotion.

Interruption immediately after delivery promotion.

Ledger or journal persistence failure.

Interruption during compensation or reconciliation.

Recovery after a previous attempt has committed but its caller did not receive acknowledgement.

Use the actual FI-01 through FI-20 registry as the authoritative scenario inventory. The examples above supplement that inventory; they do not replace it.

For crash scenarios, where process termination is the claimed fault, verify the behavior across an actual process termination and restart. A mocked exception may be useful as an additional test, but it cannot substitute for a registered process-crash test whose purpose is to validate persistence across process boundaries.

For every scenario, the test must establish:

The exact fault-injection point.

The durable state immediately before failure.

Whether an authoritative mutation committed.

The state reconstructed after restart.

The recovery decision and its supporting evidence.

Whether retrying can duplicate a committed effect.

The resulting canonical job state.

The active-delivery identity before and after recovery.

The integrity of all relevant artifact and manifest records.

4. Mandatory Stage 30.2 acceptance criteria

Stage 30.2 may be submitted for acceptance only when all of the following are demonstrated:

Every mandatory crash and restart scenario has an actual, recorded outcome.

Recovery derives commit truth from authoritative durable evidence rather than process-local memory.

Repeated recovery does not duplicate committed mutations or compensation.

Atomic and non-atomic behavior remains consistent with the established transaction semantics.

Ambiguous outcomes are explicitly reconciled rather than guessed.

Terminal job states cannot be revived by late callbacks.

No unverified artifact becomes active.

The previously valid active delivery survives a failed replacement attempt.

Recovery evidence is preserved and traceable.

No canonical schema, job state, timing rule, or mutation authority is altered.

The required predecessor regression suite passes after the Stage 30.2 implementation changes.

No mandatory case is silently skipped, excluded, or treated as passing when its result is inconclusive.

A test is not a pass merely because the system restarts successfully. It must also establish that canonical state, durable commit history, and delivery integrity are correct.

5. Required Stage 30.2 deliverables

Preserve these artifacts under the repository's established Phase 30 conventions:

Crash-injection execution results.

Restart and reconstruction verification results.

Expected-versus-observed state comparison.

Durable commit and journal consistency evidence.

Atomic and non-atomic recovery results.

Retry and duplicate-effect verification.

Active-delivery preservation evidence.

Artifact and manifest integrity results.

Failure analysis and remediation records.

Updated regression output and source provenance.

A formal Stage 30.2 status report.

Keep failed-run evidence separate from subsequent passing reruns. Do not remove a failure record merely because a correction was successful.

6. Stage boundary and subsequent authorization

Stage 30.2 is authorized to execute and test its defined recovery scope.

The authorization does not automatically accept Stage 30.2, certify Phase 30, authorize a release tag, or authorize skipping directly to Stage 30.3.

At completion, submit a new Architecture Lead report containing the actual test commands, results, fault-injection coverage, recovery-state evidence, artifact integrity evidence, unresolved defects, and the requested stage decision.

Final disposition: Stage 30.1 accepted. Stage 30.2 authorized. Phase 30 remains uncertified pending completion and review of all six stages.

Immediate execution priority

Start with the crash windows immediately before and after the authoritative commit boundary. These are the most important cases because they establish whether EME can distinguish an uncommitted operation from one that committed successfully but lost its acknowledgement.

Do not proceed to claiming recovery success until the tests demonstrate the outcome after a real process restart, with durable evidence and the original active delivery protected.