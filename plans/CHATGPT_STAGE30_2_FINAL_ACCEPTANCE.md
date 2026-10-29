EME × Earshot — Architecture Lead Final Decision

Stage 30.2: ACCEPTED. Stage 30.3: AUTHORIZED TO PROCEED.

The dedicated RPC-04 test addresses the outstanding FI-07 requirement: a real child process is reportedly killed by SIGKILL immediately after active-delivery promotion, and an independent recovery process reconstructs the promoted delivery from durable records.

Both previously outstanding evidence-closure items are now accepted on the submitted evidence.

Stage 30.2 — Crash, Restart & Durable Recovery
ACCEPTED

EC-30.2-A — Real process crash and recovery

Accepted. The submitted evidence describes pre-commit, post-commit, and post-promotion SIGKILL scenarios with separate recovery processes.

EC-30.2-B — Fault-registry traceability

Accepted. FI-07 is mapped to the dedicated RPC-04 test, and the reported matrix accounts for all 20 registered fault scenarios.

Stage 30.3 — Concurrency, Fencing & Idempotency

Formal execution authorization granted.

AUTHORIZED
Writing
EME × Earshot
Formal Architecture Lead Decision — Stage 30.2 Final Acceptance

Phase: 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Stage Accepted: 30.2 — Crash, Restart, and Durable Recovery
Next Stage Authorized: 30.3 — Concurrency, Fencing, and Idempotency
Reported Branch: feature/phase-30-production-reliability
Reported Evidence-Closure Commit: cc24eed
Predecessor Release: phase-29-certified
Decision: ACCEPTED; EXECUTION AUTHORIZED FOR STAGE 30.3

1. Acceptance findings

Stage 30.2 is formally accepted on the evidence submitted.

The acceptance recognizes:

Real-process crash coverage for pre-commit and post-commit boundaries through RPC-01 and RPC-02.

Cross-process lost-acknowledgement and retry verification through RPC-03.

Dedicated post-promotion crash verification through RPC-04.

Fault-registry traceability across all 20 registered scenarios, with later-stage scenarios explicitly assigned to their appropriate stages.

Recovery behavior covering atomic and non-atomic operations, terminal-state immutability, artifact integrity drift, active-delivery protection, and fail-closed reconciliation.

Reported preservation of all 18 canonical schemas, the 12 canonical job states, OperationExecutor mutation authority, and the zero-additional-runtime-dependency policy.

2. FI-07 closure

FI-07 — Crash after promotion — is accepted as closed on the submitted RPC-04 evidence.

The reported sequence exercises the required boundary: a candidate delivery passes QA and manifest verification, session.active_delivery is committed to del_v2_promoted, the worker is killed by SIGKILL before acknowledgement, and a separate process reconstructs the durable promoted identity.

The report states that the recovered delivery matches the manifest and artifact checksum, that QA remains valid, and that no false rollback or duplicate promotion occurs.

The reported correspondence between the actual post-promotion boundary and its dedicated test resolves the traceability gap identified in the previous ruling.

3. Non-blocking audit correction

The cumulative test counts in the submitted addendum have not yet been updated to reflect RPC-04.

The earlier tally lists three real-process tests, nine Stage 30.2 unit tests, and seven Stage 30.1 tests. The addendum now identifies four real-process scenarios, RPC-01 through RPC-04.

Update the cumulative test summary using the actual test-runner output. If all four RPC tests are distinct passing tests under the same counting convention, the arithmetic becomes:

Stage 30.1: 7 tests.

Stage 30.2 unit tests: 9 tests.

Stage 30.2 real-process tests: 4 tests.

Phase 30 total: 20 tests.

Predecessor regression: 289 tests.

Combined total: 309 tests.

This is an audit-accounting correction, not a newly identified canonical safety failure. Preserve the previous record and document the corrected count before the final Phase 30 master-regression and release-certification review. The actual runner output remains authoritative.

4. Stage 30.3 authorization

Authorization is granted to proceed with Stage 30.3 — Concurrency, Fencing, and Idempotency.

The next stage must address, at minimum:

FI-09: Duplicate concurrent requests.

FI-10: Stale fencing tokens.

FI-11: Uncertain process liveness.

FI-18: Cross-session concurrency.

Durable idempotency and duplicate-effect prevention under concurrent execution.

Tests must exercise the actual authoritative commit boundary. They must demonstrate that stale workers cannot commit, competing requests cannot produce duplicate authoritative effects, and uncertain process ownership causes fail-closed behavior.

Continue to preserve lock ordering, durable fencing-token monotonicity, terminal-state immutability, and OperationExecutor as the sole canonical mutation authority.

5. Continuing restrictions

This stage decision does not certify Phase 30 as a whole.

Stages 30.3, 30.4, 30.5, and 30.6 remain subject to their individual execution, evidence, acceptance, and regression requirements. Release certification remains a separate Architecture Lead decision.

The reported results have been reviewed as submitted; the repository and test suite have not been independently executed by this decision.

Final disposition: Stage 30.2 accepted. EC-30.2-A and EC-30.2-B accepted. Stage 30.3 execution authorized. Phase 30 release certification remains pending completion of all required stages.

Next engineering objective: Stage 30.3

The first priority should be FI-09 and FI-10: concurrent duplicate requests and stale fencing tokens.

The key proof is that even when two workers believe they can perform the same operation, only a worker with valid current authority can commit—and retries cannot duplicate an already committed effect.

Keep the corrected cumulative test accounting in the Phase 30 evidence bundle, then submit the Stage 30.3 completion report when its actual concurrency and fencing tests are complete.