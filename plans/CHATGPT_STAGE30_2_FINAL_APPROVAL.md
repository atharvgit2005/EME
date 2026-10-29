EME × Earshot — Architecture Lead Decision

Decision: EC-30.2-A ACCEPTED. EC-30.2-B PARTIALLY ACCEPTED. Stage 30.2 remains pending one targeted evidence correction. Stage 30.3 authorization is withheld.

The new addendum addresses the critical process-boundary concern: it reports actual child-process SIGKILL termination before and after commit, followed by recovery in a separate process. That is the right kind of evidence for EC-30.2-A.

However, the fault-traceability matrix still contains a material mismatch. FI-07 requires a crash after delivery promotion, but its listed tests, REC-02 and REC-05, describe a project-revision commit and an interrupted render, respectively. Neither described test establishes that a process was killed immediately after the active delivery was promoted and that a separate process correctly recovered the promoted delivery. Under the strict Phase 30 policy, that gap must be closed before Stage 30.2 is accepted.

Writing
EME × Earshot
Architecture Lead Ruling — Stage 30.2 Evidence Closure Addendum

Phase: 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Stage: 30.2 — Crash, Restart, and Durable Recovery
Reported Branch: feature/phase-30-production-reliability
Reported Commit: c0510c4
Requested Next Stage: 30.3 — Concurrency, Fencing, and Idempotency

Decision: EC-30.2-A ACCEPTED; EC-30.2-B PARTIALLY ACCEPTED; TARGETED EVIDENCE CORRECTION REQUIRED.

1. Finding EC-30.2-A — Actual process termination and restart

Disposition: ACCEPTED ON SUBMITTED EVIDENCE.

The addendum describes two real operating-system process terminations:

RPC-01 / REC-01: A worker is terminated using SIGKILL after reaching the pre-commit boundary. A separate Node.js process reconstructs the outcome and observes that the authoritative revision remains at 1.

RPC-02 / REC-02: A worker is terminated using SIGKILL after revision 2 has been committed to disk but before acknowledgement. A separate recovery process identifies the committed revision and avoids a false rollback.

RPC-03 / REC-03: A separate client process retries using the original operation identity, and the report states that the committed mutation is not applied a second time.

This addresses the earlier objection that exception handling or an in-process mock cannot establish process-restart recovery.

The acceptance is based on the supplied execution report, not an independent execution of the repository's tests.

2. Finding EC-30.2-B — Fault-registry traceability

Disposition: PARTIALLY ACCEPTED.

The submitted matrix accounts for all 20 registered FI scenarios and assigns six scenarios to their planned later stages. The general traceability approach is accepted.

One mandatory mapping does not currently establish the claimed result.

Blocking finding: FI-07 — Crash after promotion

The registered scenario requires the system to survive a crash after delivery promotion and reconstruct the active-delivery identity from durable evidence.

The supplied matrix maps this case to:

REC-02: crash after the project revision commit.

REC-05: interruption during rendering, with a partial candidate discarded.

Based on the descriptions supplied, neither test demonstrates the specific FI-07 boundary. A project revision commit is not equivalent to promoting session.active_delivery, and an interrupted render before promotion does not exercise a post-promotion crash.

This is a coverage and evidence-traceability defect. It does not, by itself, prove that the production recovery implementation is incorrect.

3. Mandatory corrective action

Add a dedicated real-process test, or provide an existing test's raw output and implementation showing that it already exercises the exact FI-07 boundary.

The test must:

Start a real child process with an isolated project and an existing verified active delivery.

Produce a valid candidate render and complete the required fresh QA, manifest, and checksum verification.

Promote the candidate through the actual authorized delivery-promotion path.

Reach an explicit, observable post-promotion/pre-acknowledgement boundary.

Terminate the child process using a real OS-level signal before acknowledgement.

Start a separate recovery process.

Reconstruct the active-delivery identity from authoritative durable records.

Verify that the recovered identity agrees with the committed promotion record.

Verify that the promoted artifact and manifest exist and pass the applicable integrity checks.

Verify that recovery does not duplicate the promotion, falsely report it as rolled back, or modify unrelated canonical state.

The evidence must include the original process termination signal, the fault boundary reached, durable pre- and post-crash records, the recovery process result, the artifact and manifest checksums, and the active-delivery identity before and after recovery.

If the existing FI-07 test is shown to exercise this exact scenario, correct the traceability matrix and attach the corresponding raw evidence instead of creating a redundant test.

4. Required re-verification

After correcting the gap:

Update artifacts/phase-30/stage-30.2/fault-traceability-matrix.json.

Preserve the existing matrix and failure history where required by repository conventions.

Re-run the dedicated Stage 30.2 crash-recovery and real-process suites.

Re-run the applicable predecessor regression suite.

Preserve actual test output, test denominators, source commit, and evidence locations.

Confirm that no canonical invariant has been violated.

Keep FI-07 assigned to Stage 30.2. Do not defer it to Stage 30.4, because the missing requirement is recovery across a process crash after promotion, not merely general artifact-integrity validation.

5. Stage decision and next-stage authorization

The following findings are recorded:

Item	Decision
EC-30.2-A — Actual process crash and separate-process recovery	Accepted on submitted evidence
EC-30.2-B — General fault-registry traceability	Partially accepted
FI-07 — Post-promotion crash recovery evidence	Open
Stage 30.2 final acceptance	Pending targeted correction
Stage 30.3 implementation authorization	Not granted yet

Planning for Stage 30.3 may continue without modifying the certified architecture baseline. Implementation and formal execution remain gated on Stage 30.2 acceptance.

Final disposition: Close the FI-07 evidence gap, reconcile its test mapping, and resubmit the updated Stage 30.2 evidence report. If the dedicated test passes and no other mandatory gate fails, Stage 30.2 can be accepted and Stage 30.3 authorization reconsidered.

No canonical safety invariant is waived, and the reported 19/19 Phase 30 test results and 289/289 predecessor results remain part of the historical record.

The next action is narrowly scoped: prove recovery across an actual crash immediately after session.active_delivery promotion. Once that specific gap is closed, the remaining Stage 30.2 evidence can be reviewed for final acceptance.