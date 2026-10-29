# Phase 19 (RT-01) — Stage 19.3 Recovery Matrix
## Authoritative Canonical 12-State Job Lifecycle Recovery Specification

**Document Version**: 2.2.0 (Canonical 12-State Architecture with Deterministic vs Ambiguity Split)  
**Status**: ACTIVE & VERIFIED  
**Module Reference**: `src/prompt-core/job-orchestrator.js` (`CanonicalJobStatus`, `CanonicalJobTransitions`)  
**Milestone**: Phase 19 (RT-01) — End-to-End Workflow Integration & Final Delivery  

---

## 1. Architectural Principles & Invariant Distinctions

To ensure zero ambiguous states and mathematical crash-consistency across all execution environments, the EME recovery system adheres to six non-negotiable architectural distinctions:

1. **Operation Commit $\neq$ Successful Workflow**: A committed project operation updates the project revision locally, but does not constitute a successful workflow until rendering, independent QA, delivery manifest emission, and session active delivery promotion are all completed.
2. **Non-Atomic Step Journaling**: A failed non-atomic workflow (`atomic: false`) may have successfully committed earlier steps. Recovery must retain exact partial step progress and the resulting intermediate revision rather than rolling back unrecorded state.
3. **Completed Render $\neq$ Verified Delivery**: The generation of an MP4 media file on disk does not constitute a deliverable until independent Media QA inspection validates compliance ($\text{score} \ge 85.0$) against audio/video constraints.
4. **Verified Artifact $\neq$ Published Delivery**: A deliverable passing Media QA does not update `session.active_delivery` until the delivery manifest is cryptographically signed and verified via SHA-256 digest comparison.
5. **Deterministic Failure vs. Genuine Ambiguity**:
   - **Deterministic Failures (`FAILED`)**: When inputs violate schemas, planners detect contradictory constraints, subprocesses terminate with known fatal exit codes, or QA evaluation falls below the minimum quality threshold ($\text{score} < 85.0$), the outcome is deterministic. The engine transitions the job definitively and immediately to `FAILED`. It does NOT trigger operator alarms or require human intervention.
   - **Genuine Ambiguity (`NEEDS_RECONCILIATION`)**: Ambiguity is strictly reserved for split-brain outcomes, unacknowledged external transitions, interrupted atomic writes with truncated/corrupted manifests, or unrecoverable journal discrepancies where the true state cannot be mathematically deduced. In these cases, the engine must **never guess** or force-promote. It MUST transition the job into `NEEDS_RECONCILIATION` and freeze mutations.
6. **Terminal Immutability**: The terminal states `SUCCEEDED`, `FAILED`, and `CANCELLED` are mathematically immutable and reject all subsequent mutation callbacks.

---

## 2. Canonical 12-State Job Lifecycle State Machine

```
                              +--------------------+
                              |      ACCEPTED      |
                              +--------------------+
                                 |              \
                                 v               v
                           +----------+     +-----------+
                           | PLANNING | --> | CANCELLED |
                           +----------+     +-----------+
                            /    |   \            ^
                           /     |    \           |
                          v      |     v          |
      +-------------------+      |     +--------+ |
      | AWAITING_APPROVAL |      |     | FAILED | |
      +-------------------+      |     +--------+ |
               |                 |        ^   ^   |
               v                 v        |   |   |
      +----------------------------+      |   |   |
      |      READY_TO_EXECUTE      |------+   |   |
      +----------------------------+          |   |
                     |                        |   |
                     v                        |   |
             +---------------+                |   |
             |   EXECUTING   |----------------+   |
             +---------------+                    |
               /     |     \                      |
              /      |      \                     |
             v       v       v                    |
     +-----------+  +-----------+                 |
     | VERIFYING |  | RENDERING |                 |
     +-----------+  +-----------+                 |
             \       /                            |
              v     v                             |
            +------------+                        |
            | PUBLISHING |------------------------+
            +------------+
                  |
                  v
            +-----------+
            | SUCCEEDED |
            +-----------+

      * Unresolved Ambiguity / Discrepancy -> NEEDS_RECONCILIATION
```

---

## 3. Authoritative Canonical 12-State Recovery Matrix

The table below explicitly decouples **Deterministic Error Behavior (`FAILED`)** from **Genuine Ambiguity / Uncertainty (`NEEDS_RECONCILIATION`)** across every canonical lifecycle state:

| # | Canonical State | Persisted Evidence Required | Interruption / Failure Trigger | Deterministic Error Behavior (`FAILED`) | Genuine Ambiguity Behavior (`NEEDS_RECONCILIATION`) | Project Revision Impact | Active Delivery Impact |
|---|---|---|---|---|---|---|---|
| **1** | `ACCEPTED` | Job envelope in `jobs/[job_id].json` with request parameters and timestamps. | Crash before validation, or invalid input brief syntax. | Schema violation or invalid prompt parameters immediately fails job to `FAILED`. | Half-written, truncated, or unparseable job envelope file on disk enters `NEEDS_RECONCILIATION`. | Untouched (Baseline) | Strictly Untouched |
| **2** | `PLANNING` | Job record with `intent_envelope` and compiled `edit_brief`. | Contradictory brief constraints, or planner crash mid-synthesis. | Contradictory edit instructions or unsupported operations transition job to `FAILED`. | Truncated/corrupted planner output or indeterminate compile state enters `NEEDS_RECONCILIATION`. | Untouched (Baseline) | Strictly Untouched |
| **3** | `AWAITING_APPROVAL` | Job record containing complete `candidate_plan`, `plan_hash`, and `expected_base_revision`. | Operator rejection, approval timeout, or approval log corruption. | Explicit user rejection or approval window expiration transitions job to `FAILED` / `CANCELLED`. | Conflicting approval signatures or tampered/diverged plan hash enters `NEEDS_RECONCILIATION`. | Untouched (Baseline) | Strictly Untouched |
| **4** | `READY_TO_EXECUTE` | Job record with approved action, verified `plan_hash`, and caller signature. | Pre-execution lock revalidation detects project moved (`actual !== expected_base_rev`). | Stale revision detected during in-lock recheck cleanly fails job with 409 conflict (`FAILED`). | Orphaned transaction journal without lock or diverged session revision pointer enters `NEEDS_RECONCILIATION`. | Untouched (Baseline) | Strictly Untouched |
| **5** | `EXECUTING` | Step execution journal: `{ step_index, operation_id, status }` and staged candidate. | Operation failure, unhandled exception, or mid-step process termination. | Invalid op parameters fail cleanly: atomic rolls back candidate to `FAILED`; non-atomic journals committed steps and transitions to `FAILED`. | Truncated journal, unreadable step state, or partial disk write where committed revision cannot be proven enters `NEEDS_RECONCILIATION`. | Atomic: baseRev.<br>Non-atomic: retained at committed step revision. | Strictly Untouched |
| **6** | `VERIFYING` | Pre-render semantic validation report and invariant checklists. | Semantic invariant violation (gap out of tolerance, missing source clip). | Invariant failure (e.g. invalid track arrangement) transitions job cleanly to `FAILED`. | Verification crash leaving conflicting verification logs or unreadable media metadata enters `NEEDS_RECONCILIATION`. | Atomic (`atomic: true`): Candidate discarded; project at baseline.<br>Non-atomic (`atomic: false`): Retains committed step revision; does not roll back already-committed mutations. | Strictly Untouched |
| **7** | `RENDERING` | Active render job record, PID, and scratch output file paths in scratch directory. | FFmpeg non-zero exit code, invalid codec param, or kernel kill / power loss. | Clean FFmpeg failure with fatal exit status and known stderr prunes scratch and marks job `FAILED`. | Power loss / SIGKILL leaving partial scratch chunks and indeterminate process state enters `NEEDS_RECONCILIATION`. | Project at committed revision. | Strictly Untouched (Prior Active Preserved) |
| **8** | `PUBLISHING` | Verified render MP4, passing QA report ($\ge 85.0$), and signed delivery manifest. | Sub-threshold QA score (< 85.0), audio clipping, or crash during manifest rename. | Sub-threshold QA score (< 85.0) or loudness violation aborts promotion and cleanly marks job `FAILED`. | Process crash during atomic rename or session manifest link leaving unverified manifest/session link enters `NEEDS_RECONCILIATION`. | Project at committed revision. | `FAILED`: Prior Active Preserved.<br>`NEEDS_REC`: Never guessed; preserved until operator reconciliation. |
| **9** | `SUCCEEDED` | Final manifest, verified `media_sha256`, and updated `session.active_delivery`. | Duplicate request replay after completion or missing manifest file. | Not applicable: `SUCCEEDED` is immutable. Duplicate requests return cached deliverable (Idempotency). | Terminal immutability strictly preserved: job remains `SUCCEEDED`. If post-success filesystem inspection detects a vanished deliverable, job status is NOT rewritten; an out-of-band `INTEGRITY_DRIFT_ALERT` incident is recorded. | Retained at committed revision. | Verified Active Returned |
| **10**| `FAILED` | Terminal error record: `{ errorCode, errorMessage, timestamp }`. | Duplicate request replay or late callback from aborted subprocess. | Terminal immutable state. Idempotent return of failure record. Late callbacks rejected. | Not applicable: `FAILED` is immutable. | Baseline (or committed non-atomic revision). | Prior Active Preserved |
| **11**| `CANCELLED` | Cancellation record: `{ cancelled_at, boundary, reason }`. | Late arrival of cancel ack, replay, or post-cancellation callback. | Terminal immutable state. Retains project revision and session state as established at boundary. | Not applicable: `CANCELLED` is immutable. | Retains exact revision established at cancellation boundary. | Prior Active Preserved |
| **12**| `NEEDS_RECONCILIATION` | Divergence report: `{ expected_revision, actual_revision, unverified_manifest }`. | Startup recovery detects ambiguous state. | Manual/operator resolution via CLI tool (`eme-reconcile`) transitions job to authoritative state. | System freezes mutations; holds session lock in read-only audit mode; prevents automatic promotion. | Frozen until reconciled. | Prior Active Preserved |

---

## 4. Sub-State Progress Metadata Mapping

Internal progress markers used for instrumentation, telemetry, and logging must NOT replace canonical states:

| Internal Progress Marker | Canonical Job Status | Purpose & Observability Role |
|---|---|---|
| `VALIDATING` | `PLANNING` | Input schema and invariant verification |
| `PLANNED` | `AWAITING_APPROVAL` or `READY_TO_EXECUTE` | Plan compiled and hashed, awaiting lock/execution |
| `EVALUATING_QA` | `VERIFYING` / `RENDERING` | FFprobe / EBU R128 audio & video quality assessment |
| `COMMITTING` | `PUBLISHING` | Atomic rename of session document and manifest linking |
| `RECOVERING` | `NEEDS_RECONCILIATION` | Active recovery audit executing against transaction logs |

---

## 5. Verification & Regression Anchors

The canonical 12-state recovery lifecycle is tested and asserted in:
- `tests/workflow-stage19-3-recovery.test.js`:
  - `RT01-S3.A`: Commit succeeded, response lost (durable return from SUCCEEDED)
  - `RT01-S3.B`: Commit outcome unknown (diverged state enters NEEDS_RECONCILIATION)
  - `RT01-S3.C`: Process restarts in nonterminal stage (recovery across restart)
  - `RT01-S3.D`: Duplicate request after restart (durable idempotency & conflict guard)
  - `RT01-S3.E`: Atomic plan interrupted (rollback leaves canonical project untouched)
  - `RT01-S3.F`: Non-atomic plan interrupted (partial step journaling & exact state retention)
  - `RT01-S3.G`: Render or QA failure (never updates session.active_delivery)
  - `RT01-S3.H`: Publication outcome ambiguous (corrupt/missing manifest prevents promotion)
  - `RT01-S3.I`: Cancellation at mutation boundary (honest reporting across 5 boundaries)
  - `RT01-S3.J`: Conflicting project state (pre-execution 409 STALE_REVISION)
  - `RT01-S3.K`: Late callbacks after terminal state (terminal immutability)
  - `RT01-S3.L`: Active-delivery preservation across full failure battery
  - `RT01-S3.M`: In-lock revalidation in READY_TO_EXECUTE prevents stale plan mutation
- `tests/workflow-stage19-cancellation-semantics.test.js`:
  - `CANCEL-01` through `CANCEL-06`: Verifies cancellation across all 6 architectural boundaries.
- `tests/workflow-stage19-lock-coordination.test.js`:
  - `LOCK-01` through `LOCK-08`: Verifies lock acquisition, serialized reclamation gates, durable fencing, and crash recovery.
