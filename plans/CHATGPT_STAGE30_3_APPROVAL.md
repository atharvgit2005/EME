EME × Earshot — Architecture Lead Decision

Stage 30.3: UNCONDITIONALLY ACCEPTED. Stage 30.4: AUTHORIZED TO PROCEED.

The submitted Stage 30.3 report satisfies the stage's stated acceptance requirements. The eight concurrency and fencing tests are reported passing, the cumulative test accounting is internally consistent, and the required protections for durable idempotency, fencing, lock ordering, ambiguous ownership, and cross-session isolation are documented.

Stage 30.3 — Concurrency, Fencing & Idempotency

Reported commit: d7b91c6

ACCEPTED

Stage 30.3 tests

8/8

Reported passing

Combined test baseline

317/317

Reported passing

Stage 30.4 — Artifact Integrity, Compensation & Reconciliation

Formal execution authorization granted.

AUTHORIZED

The decision below accepts Stage 30.3 on the submitted evidence; I have not independently executed your repository's test suite.

Writing
EME × Earshot
Formal Architecture Lead Decision — Stage 30.3 Acceptance & Stage 30.4 Authorization

Phase: 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Stage Accepted: 30.3 — Concurrency, Fencing, and Idempotency
Stage Authorized: 30.4 — Artifact Integrity, Compensation, and Reconciliation
Branch: feature/phase-30-production-reliability
Reported Stage Commit: d7b91c6
Decision: STAGE 30.3 ACCEPTED; STAGE 30.4 AUTHORIZED

1. Formal acceptance of Stage 30.3

Stage 30.3 is unconditionally accepted based on the submitted completion report.

The accepted scope covers the required concurrency, fencing, idempotency, lock-ordering, and ownership-safety behaviors.

CNC-01 — Concurrent duplicate requests

Accepted on the reported evidence that concurrent requests sharing an idempotency key produce exactly one authoritative mutation and that duplicate requests are resolved through durable records.

The implementation must continue to base idempotency on durable operation identity and authoritative commit behavior, never solely on process-local caches.

CNC-02 and CNC-03 — Fencing and monotonic token progression

Accepted on the reported evidence that stale fencing tokens are rejected at the authoritative commit boundary and that newer fencing tokens supersede older ones.

A worker that previously acquired a lock must not retain commit authority after its fencing token is superseded.

CNC-04 — Lock ordering

Accepted on the reported evidence that session locks are acquired before job locks and released in reverse order.

The required ordering is:

Session Lock → Job Lock

Release ordering is:

Job Lock → Session Lock

The existing exclusive file-creation mechanism and fail-closed ownership rules remain binding.

CNC-05 — Ambiguous process liveness

Accepted on the reported evidence that uncertain ownership and corrupt lock metadata do not authorize unsafe lock reclamation. When ownership cannot be reliably established, recovery must fail closed and use the approved reconciliation pathway.

CNC-06 — Cross-session isolation

Accepted on the reported evidence that independent sessions remain isolated and that an operation attempting to use another session's fencing authority is rejected.

CNC-07 and CNC-08 — Late callbacks and compensation idempotency

Accepted on the reported evidence that callbacks from superseded attempts cannot corrupt or revive the current job and that duplicate compensation requests do not repeat an already committed compensating effect.

These protections remain binding during Stages 30.4–30.6.

2. Cumulative test accounting

The updated arithmetic reconciles:

Test group	Reported result
Predecessor regression, Phases 21–29	289/289
Stage 30.1	7/7
Stage 30.2 unit tests	9/9
Stage 30.2 real-process tests, RPC-01–04	4/4
Stage 30.3, CNC-01–08	8/8
Phase 30 subtotal	28/28
Combined repository total	317/317

The combined total is 289 predecessor tests plus 28 Phase 30 tests.

These are accepted as the reported test results. The raw output from subsequent master-regression runs remains the authoritative evidence for final Phase 30 certification.

3. Binding constraints carried forward

All EME canonical invariants remain unchanged.

OperationExecutor is the sole canonical project mutation authority.

The canonical timebase remains 120,000 ticks per second, using integer arithmetic and half-open intervals.

The 18 canonical schemas remain frozen.

The 12 canonical job states remain unchanged.

Durable fencing and idempotency remain mandatory at the authoritative commit boundary.

Lock acquisition and release ordering remains mandatory.

Ambiguous outcomes route to NEEDS_RECONCILIATION.

Terminal states remain immutable against late callbacks.

Atomic and non-atomic plans retain their established transaction semantics.

session.active_delivery is promoted only after the required render, fresh QA, manifest, and checksum-integrity checks.

A successful historical operation is not reclassified as rolled back because a later acknowledgement or artifact fails.

INTEGRITY_DRIFT_ALERT remains the required signal for applicable post-success artifact-integrity drift.

No external runtime npm dependencies may be added without separate approval.

No canonical schema or certified release history may be altered to conceal a defect.

Any violation of a canonical safety invariant is a release blocker regardless of the aggregate test total.

4. Stage 30.4 authorization

Authorization is granted to proceed with Stage 30.4 — Artifact Integrity, Compensation, and Reconciliation.

The objective is to establish that artifacts, manifests, compensation records, and reconciliation decisions remain trustworthy when files are missing, corrupted, inconsistent, or interrupted at critical lifecycle boundaries.

4.1 Required scope

Stage 30.4 must address the following areas.

A. Artifact integrity

Missing rendered artifact after a reported successful render.

Artifact truncation or corruption.

Checksum mismatch between artifact and manifest.

Artifact substitution or unexpected modification.

Verification of file identity and required metadata at the applicable trust boundaries.

Post-success artifact drift without rewriting historical job success.

B. Manifest integrity

Missing manifest.

Malformed or incomplete manifest.

Manifest referencing the wrong artifact.

Incorrect artifact checksum, size, or provenance.

Inconsistent project revision, delivery identity, or source provenance.

Manifest creation interrupted before a complete durable record is available.

C. Active-delivery safety

Failed or incomplete candidate renders.

Failure after QA but before manifest creation.

Failure after manifest creation but before promotion.

Failed candidate replacement when an existing valid delivery is active.

Integrity failure discovered during recovery or reconciliation.

D. Compensation and reconciliation

Compensation interrupted before commit.

Compensation committed but acknowledgement lost.

Duplicate compensation request.

Compensation whose inverse cannot safely be applied.

Failure after a partial non-atomic operation.

Contradictory or insufficient durable evidence.

Reconciliation following failed artifact verification.

4.2 Required implementation behavior

Verify artifacts against their actual contents and authoritative manifest records.

Generate and evaluate fresh QA evidence for the candidate delivery.

Keep artifact integrity, job status, project revision, and delivery status distinct.

Preserve the existing verified active delivery until a replacement has passed every required verification gate.

Record compensation operations durably and apply them at most once per unique compensation identity.

Never claim rollback when an authoritative mutation or compensating operation has committed.

Preserve prior committed effects and their journal records for non-atomic plans.

Route unresolved outcomes to NEEDS_RECONCILIATION.

Preserve a historical SUCCEEDED state and emit INTEGRITY_DRIFT_ALERT when a previously successful artifact is later found missing or corrupted.

Preserve evidence of failed and interrupted attempts.

4.3 Mandatory fault coverage

FI-14 — Corrupt or inconsistent manifest — is a specific Stage 30.4 requirement.

The stage must also extend the coverage of FI-13 and FI-15 where necessary to test deeper artifact-integrity, compensation, and reconciliation boundaries than were exercised in Stage 30.2.

The existing fault registry remains authoritative. Do not redefine earlier scenarios to make new test results appear complete.

4.4 Required evidence

Submit:

A Stage 30.4 test matrix mapped to the original fault registry.

Artifact-integrity and manifest-verification results.

Compensation and reconciliation test results.

Candidate and active-delivery identity records.

Relevant artifact, manifest, and evidence checksums.

Actual QA outputs where rendering is involved.

Raw test-runner output and cumulative regression results.

Failure analysis, remediation, and rerun history.

A formal Stage 30.4 completion report.

5. Stage 30.4 acceptance criteria

Stage 30.4 may be submitted for acceptance when:

Every mandatory test assigned to the stage has a recorded outcome.

Corrupt, missing, or unverified candidate artifacts are never promoted.

Manifests reconcile with their referenced artifacts and provenance.

Failed replacement attempts preserve the previously verified active delivery.

Compensation is durable, auditable, and idempotent.

Ambiguous outcomes are reconciled rather than guessed.

Historical success and later integrity drift remain correctly distinguished.

The predecessor regression baseline passes after implementation changes.

No canonical invariant is violated.

The evidence bundle matches the actual tested source and artifacts.

Any mandatory safety failure blocks Stage 30.4 acceptance.

6. Authorization boundaries

Stage 30.4 is authorized to implement and verify its specified scope.

This authorization does not certify Phase 30, authorize release tagging, or permit skipping Stages 30.5 and 30.6.

Stage 30.5 — Deterministic Recovery Evidence and Replay — remains subject to its own execution and acceptance decision. Stage 30.6 — Master Regression and Release Certification — remains subject to the complete set of Phase 30 gates.

Final disposition: Stage 30.3 accepted. Stage 30.4 authorized. Phase 30 release certification remains pending completion and review of all mandatory stages.

Immediate engineering priority

Start Stage 30.4 with FI-14: corrupt or inconsistent manifest, then test compensation boundaries where the operation outcome and artifact outcome can diverge.

The most important proof is that a candidate with a missing artifact, mismatched checksum, or invalid manifest cannot become the active delivery—and that the previously verified delivery remains intact when verification or compensation fails.

Keep the tests isolated and preserve the failure evidence. Stage 30.4's completion report should map every mandatory case back to the existing fault registry rather than relying on a single aggregate pass count.