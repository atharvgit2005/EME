EME × Earshot — Architecture Lead Review

Decision: Stage 30.2 acceptance is temporarily withheld pending evidence closure. Stage 30.3 execution is not yet authorized.

Your report documents nine passing recovery tests and describes substantial implementation of crash recovery, idempotent retry behavior, terminal-state protection, and active-delivery safety. However, the Stage 30.2 authorization established a specific requirement: tests claiming process-crash recovery must demonstrate actual process termination and recovery by a new process, not merely simulate a crash inside a test process.

The submitted summary does not establish that this requirement has been met. Under the locked strict safety policy, I cannot waive it based on the aggregate 9/9 result.

Writing
EME × Earshot
Architecture Lead Decision — Stage 30.2 Evidence Closure

Phase: 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Stage Reviewed: 30.2 — Crash, Restart, and Durable Recovery
Next Stage Requested: 30.3 — Concurrency, Fencing, and Idempotency
Branch: feature/phase-30-production-reliability
Reported Commit: 6b63a7e
Decision: EVIDENCE CLOSURE REQUIRED
Stage 30.3 Authorization: WITHHELD PENDING ACCEPTANCE

1. Findings accepted

The following results are acknowledged as reported:

CrashRecoveryEngine has been implemented using native Node.js core modules.

The Stage 30.2 test suite reports 9 passing subtests, 0 failures, and 0 skipped tests.

The reported test cases address atomic and non-atomic recovery, lost acknowledgements, candidate-render interruption, QA failure, terminal-state immutability, integrity drift, and compensation failure.

The report states that the 18 canonical schemas, zero-runtime-dependency policy, 12 canonical job states, and OperationExecutor mutation-authority invariant remain preserved.

These are meaningful implementation and test results. They are not yet sufficient evidence for unconditional Stage 30.2 acceptance.

2. Mandatory evidence closure
EC-30.2-A — Actual process termination and restart

The Stage 30.2 authorization explicitly requires actual process termination and restart for scenarios that claim to test crash recovery.

Provide reproducible evidence for at least the pre-commit and post-commit crash scenarios:

REC-01: Terminate the process before the authoritative commit and demonstrate that a separate recovery process reconstructs the correct uncommitted outcome.

REC-02: Terminate the process after the authoritative commit and demonstrate that a separate recovery process reconstructs the committed outcome without falsely reporting a rollback.

The evidence must identify:

The original process and how it was terminated.

The exact fault-injection boundary reached.

The durable records written before termination.

The original process's exit status or terminating signal.

The separately started recovery process.

The recovered canonical revision and job state.

The evidence establishing whether the mutation committed.

The active-delivery identity before and after recovery, where applicable.

A thrown exception, mocked restart, or reconstructed in-memory object is not a substitute for demonstrating recovery across a real process boundary.

EC-30.2-B — Fault-registry traceability

Submit a traceability matrix connecting the applicable Phase 30 fault scenarios to the Stage 30.2 test results.

For each applicable scenario, record:

Fault ID from artifacts/phase-30/stage-30.1/fault-registry.json.

Corresponding test ID.

Injection mechanism.

Expected postcondition.

Actual observed result.

Raw evidence location.

PASS, FAIL, or INCONCLUSIVE verdict.

Pay particular attention to crash windows involving durable journal or ledger persistence, manifest creation, delivery promotion, compensation, and repeated recovery.

Scenarios assigned to later Phase 30 stages need not be prematurely certified here. They must, however, remain explicitly mapped to their intended stage rather than being implicitly counted as Stage 30.2 coverage.

3. Closure acceptance criteria

Evidence closure will be accepted when:

Both critical crash scenarios demonstrate termination and recovery across distinct process lifetimes.

The recovered outcome agrees with durable state and authoritative commit history.

A retry cannot duplicate an already committed mutation.

The fault-to-test matrix reconciles with the registered scenario inventory.

All failures, inconclusive results, and reruns remain preserved in the evidence bundle.

The applicable predecessor regression baseline passes after any corrective changes.

No canonical safety invariant is violated.

The submitted 9/9 test result must remain in the historical record. Additional evidence or corrective tests should supplement that record rather than replace it.

4. Authorization decision

Stage 30.2: Not yet accepted.

The remaining work is limited to the evidence gaps identified above, unless the new tests reveal an implementation defect requiring remediation.

Stage 30.3: Authorization withheld.

Preparatory planning for concurrency, fencing, and idempotency may continue without changing the certified architecture baseline. Stage 30.3 implementation and formal execution must wait until Stage 30.2 receives acceptance.

5. Required next submission

Submit a Stage 30.2 Evidence Closure Addendum containing:

Actual process-termination and separate-process recovery output for REC-01 and REC-02.

The fault-registry-to-test traceability matrix.

Any additional tests or remediation results.

The updated regression output and source commit.

A final statement identifying any unresolved failures or inconclusive cases.

The Architecture Lead will then issue the Stage 30.2 acceptance decision and, if all mandatory gates pass, authorize Stage 30.3.

Final disposition: Evidence closure required. No canonical safety invariant is waived.

The priority is narrow: establish that EME recovers correctly after the process truly dies, then reconcile the scenario coverage. If those checks pass and no new defects emerge, Stage 30.2 can be accepted without expanding its scope.