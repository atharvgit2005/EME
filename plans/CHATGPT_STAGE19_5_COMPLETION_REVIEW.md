# EME Phase 19 (RT-01) — Final Closure Directive
## Recovery-State Integrity, Lock Ownership, and Release Provenance

**To**: EME Engineering Team  
**From**: ChatGPT Architecture Lead  
**Stage under review**: Stage 19.5 — Clean Packaging, Distribution Artifacts & Production Release Gate  
**Decision**: Packaging qualification provisionally accepted; final milestone certification withheld  
**Required addendum**: `plans/PHASE_19_RT01_FINAL_CLOSURE_ADDENDUM.md`  

---

### 1. Canonical job-state restoration

Restore the approved canonical 12-state job lifecycle:

`ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, `READY_TO_EXECUTE`, `EXECUTING`, `VERIFYING`, `RENDERING`, `PUBLISHING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `NEEDS_RECONCILIATION`.

Revise the Stage 19.5 recovery matrix accordingly.

For each canonical state, document the persisted evidence required, permitted restart action, mutation risk, and destination when the outcome cannot be established safely.

Internal progress markers such as `VALIDATING`, `PLANNED`, `EVALUATING_QA`, and `COMMITTING` may be represented as stage metadata where appropriate. They must not silently replace canonical job statuses.

Explicitly preserve these distinctions:
- A committed project operation is not necessarily a successful workflow.
- A failed non-atomic workflow may have committed earlier steps.
- A completed render is not necessarily a verified delivery.
- A verified artifact is not necessarily published.
- An uncertain outcome must enter `NEEDS_RECONCILIATION` rather than being guessed.
- Terminal `SUCCEEDED`, `FAILED`, and `CANCELLED` states remain protected from ordinary late callbacks.

Add regression assertions for serialized jobs, restart recovery, API status values, and compatibility with previously persisted job records. Do not make an unapproved expansion or renaming of the canonical state model.

---

### 2. Lock ownership and stale-lock recovery

Document the lock protocol, including acquisition order, owner identity, lease or liveness semantics, release behavior, and stale-lock reclamation.

Demonstrate through adversarial tests that:
- Two independent processes cannot simultaneously own the same protected session lock.
- A live owner is not displaced solely because an operation exceeds a fixed duration.
- A crashed owner can be safely recovered without admitting two simultaneous writers.
- A stale-lock reclamation attempt cannot delete a newly replaced lock.
- A former owner cannot commit a mutation after a newer owner has acquired the lock.
- The project revision and expected-base-revision checks remain authoritative immediately before mutation.
- Job and session locks follow the documented global acquisition order without deadlocks.

Use ownership metadata and an appropriate atomic ownership or fencing mechanism wherever required to establish these guarantees. Do not infer safe lock reclamation merely from `O_EXCL`, file age, or a successful unit test that runs only within one process.

Record the actual cross-process tests and their resulting project revisions.

---

### 3. Release artifact and runtime qualification

Retain the candidate source SHA, parent SHA, package filename, package SHA-256, and reported full-regression results in the release provenance record.

Verify and document:
- The package was produced from the identified source revision.
- The package's actual contents match the intended distribution allowlist.
- Its checksum matches the distributed artifact.
- The lockfile and supported runtime versions are identified.
- System-installed FFmpeg and FFprobe are declared dependencies with tested supported versions.
- The extracted package passes CLI, REST, project-persistence, preview-isolation, final-delivery, QA rejection, manifest-integrity, and restart-recovery tests.

Distinguish the absence of external npm runtime dependencies from the absence of system dependencies. EME must not be described as requiring no runtime dependencies while requiring an installed media-processing toolchain.

Record the exact tested commit, complete working-tree status, command, duration, exit code, and test counts. If source or packaging changes are made, rerun the relevant suites and full repository regression against the corrected candidate.

---

### 4. Stage history and acceptance traceability

Correct the Stage 19.5 completion report so that the Phase 19 milestone history matches the actual approved stage sequence and responsibilities.

Preserve the distinction between:
- Orchestration and golden-workflow verification.
- Closed-loop failure recovery and reconciliation.
- Delivery-path unification and preview isolation.
- Clean packaging and release-candidate qualification.

Do not imply that packaging alone certifies the recovery implementation or proves that every earlier stage's final evidence gates have been closed.

---

### 5. Required deliverables

Submit:
1. `plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md` — corrected canonical recovery matrix.
2. `plans/PHASE_19_STAGE5_COMPLETION_REPORT.md` — corrected packaging and qualification report.
3. `plans/PHASE_19_RT01_FINAL_CLOSURE_ADDENDUM.md` — explicit acceptance mapping for every remaining issue.
4. The relevant tests demonstrating canonical state persistence and safe cross-process lock reclamation.
5. A reproducible source and artifact identity, including package SHA-256 and actual full-regression evidence.

---

### 6. Final acceptance criteria

Phase 19 (RT-01) may receive final architecture certification only when:
- The canonical 12-state model is preserved and tested.
- The recovery matrix accurately matches implementation behavior.
- Lock reclamation and revision exclusion are safe across processes and restarts.
- Partial-commit and cancellation outcomes are accurately reported.
- The identified release package passes the required clean-environment tests.
- The package provenance and integrity evidence are complete.
- The full repository regression passes against the exact corrected candidate.
- All reported guarantees match the actual evidence.

Use required GSD actions to achieve the goals and wherever needed.

Submit the final closure addendum for architecture review before requesting unconditional Phase 19 (RT-01) certification.

---

### 7. Direction for the next roadmap phase

The recommended next milestone is **Phase 20 — Production Observability, Operational Resilience & Deployment Safety**.

The purpose of Phase 20 should be to move EME from a qualified release candidate toward a maintainable production system, without expanding the project schema or changing the canonical job-state contract unnecessarily.

Initial priorities should be:
- **Observability**: Structured logs, correlation IDs, job and delivery lifecycle events, actionable errors, and clear diagnosis of `NEEDS_RECONCILIATION`.
- **Operational resilience**: Resource limits for rendering and subprocesses, safe cleanup of abandoned work, disk-space protection, graceful shutdown, and recovery drills.
- **Deployment safety**: Documented configuration, backup and restore procedures, rollback, secret handling, and compatibility checks.
- **Release monitoring**: Health checks and metrics for job latency, render/QA failures, recovery outcomes, lock contention, and active-delivery publication.
- **Acceptance discipline**: Fault-injection and operational tests against the exact packaged artifact, with explicit evidence for every production-readiness claim.

Phase 20 planning and architecture discovery may begin now. Implementation that depends on declaring RT-01 fully certified should wait until the final closure gates above are accepted.

---

### Final Decision

- **Stage 19.5**: Provisionally accepted based on the submitted packaging evidence.
- **Phase 19 (RT-01)**: Not yet certified as unconditionally complete.
- **Next phase**: Phase 20 planning is authorized; full milestone transition remains conditional on correcting the canonical recovery matrix, demonstrating safe lock reclamation, and completing release-provenance verification.

The remaining work is focused: preserve the architecture that has been established, prove its critical invariants, and only then close RT-01.
