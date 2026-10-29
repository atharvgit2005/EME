# Phase 19 (RT-01) — Stage 19.1A: Unified Lifecycle Contract & Transition Design

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.1A — Lifecycle Contract and Transition Design  
**Document**: `plans/PHASE_19_STAGE1A_LIFECYCLE_CONTRACT.md`  
**Prerequisite**: Stage 19.0 Accepted (`plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md`)  
**Architecture Lead Directive**: Section 2 of `plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md`  
**Governing Principle**:
*The engine owns state, deterministic operations own edits, verification owns acceptance, and the delivery pipeline owns publication.*

---

## 1. Executive Summary & Design Gate Resolutions

In accordance with the ChatGPT Architecture Lead's Stage 19.1 Implementation Directive, this document establishes the authoritative lifecycle contract reconciling the legacy Phase 14B (`src/orchestration/job-manager.js`) and Phase PF-11 (`src/prompt-core/job-orchestrator.js`) status models.

### Resolution of Mandatory Architecture Gates:

#### Gate 1: Resolution of the `RECOVERING` Discrepancy
- **Issue**: The initial Stage 19.0 proposal omitted `RECOVERING` from the 12-state canonical enum but referred to it in transition tables.
- **Resolution**: `RECOVERING` is **NOT** a top-level logical status. The canonical lifecycle retains strictly **12 top-level states**. Recovery is an active process modeled using structured metadata under `NEEDS_RECONCILIATION`.
- **Metadata Structure under `NEEDS_RECONCILIATION`**:
  ```json
  {
    "status": "NEEDS_RECONCILIATION",
    "reconciliation": {
      "status": "in_progress" | "resolved" | "unresolvable",
      "attempt": 1,
      "max_attempts": 2,
      "source_checkpoint": "artifacts/deliverables/session-123-tx-abc-checkpoint.json",
      "journal_path": "artifacts/deliverables/job-456-execution-journal.json",
      "last_verified_step": 3,
      "last_verified_revision": 4,
      "disposition": "rolled_back" | "partially_committed" | "replayed",
      "error": "Render process SIGKILL interrupted frame 45/90"
    }
  }
  ```
- **Allowed Continuation Transitions from `NEEDS_RECONCILIATION`**:
  1. Once project state is verified as cleanly rolled back or replayed: transition to `FAILED` (with diagnostic failure report) or to `READY_TO_EXECUTE` / `VERIFYING` if state is fully coherent.
  2. If unrecoverable: transition to terminal `FAILED`.

#### Gate 2: Explicit Distinction between Approval & Clarification
- **Issue**: `AWAITING_APPROVAL` conflated plan confirmation with missing user inputs.
- **Resolution**: The state `AWAITING_APPROVAL` carries an explicit `awaitingReason`:
  1. `awaitingReason: "approval"`: The system produced a complete, valid `OperationPlan` (status: `ready`), but policy requires explicit user confirmation before applying mutations.
     - **Allowed Transition**: User confirms $\rightarrow$ validates that plan hash and base project revision remain unchanged $\rightarrow$ transition to `READY_TO_EXECUTE`.
     - **Rejection / Stale**: If project revision advanced during waiting $\rightarrow$ transition to `PLANNING` (recompile) or `FAILED`.
  2. `awaitingReason: "clarification"`: The input brief contains ambiguities, missing asset references, or conflicting constraints (e.g. contradictory color requirements).
     - **Allowed Transition**: User provides required parameters / resolves conflict $\rightarrow$ transition to `PLANNING` (must recompile brief and plan from scratch).
     - Under zero circumstances can a clarification proceed directly to `READY_TO_EXECUTE` without replanning.

#### Gate 3: Explicit Cancellation Boundaries
- **Issue**: Ambiguity regarding when a request can be cancelled and what project state results.
- **Resolution**: Cancellation is a transactional resolution, not an instantaneous asynchronous interrupt:
  1. **Pre-Execution (`ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, `READY_TO_EXECUTE`)**: Immediate transition to terminal `CANCELLED`. Zero project mutations have occurred; project remains at revision $N$; active delivery is untouched.
  2. **During Execution (`EXECUTING`)**: The currently running atomic operation in `OperationExecutor` runs to completion (never interrupted mid-memory).
     - For `atomic: true`: The staged candidate is discarded; canonical project remains at revision $N$; transition to `CANCELLED`.
     - For `atomic: false`: Execution halts after current step; completed steps remain committed; job transitions to `CANCELLED` with explicit `cancelled_at_step` and `final_revision` recorded.
  3. **During Rendering (`RENDERING`)**: Headless browser / FFmpeg child processes are terminated via clean process signals (`SIGTERM` followed by `SIGKILL` if unresponsive within 2s); partial MP4 files are purged; active delivery is untouched; job transitions to `CANCELLED`.

#### Gate 4: Reconciled Atomic Multi-Operation Contract
- **Issue**: Reconciling atomic multi-operation rollback with engine-owned monotonic revision increments.
- **Resolution**:
  - `atomic: true`: All operations in the plan are applied sequentially to an **isolated staged candidate project** using `OperationExecutor.execute()`. Per-operation revisions advance internally within the candidate ($N \to N+1 \to \dots \to N+k$). If all $k$ operations succeed, the candidate is published to the live project with revision $N+k$ in a single atomic transaction. If step $i$ fails, the staged candidate is discarded; the live project remains at revision $N$. Monotonicity is preserved because failed intermediate revisions were never observable outside the transaction boundary.
  - `atomic: false`: Operations are executed directly against the live project. Each step commits revision $+1$. If step $i$ fails, the project remains at revision $N+i$; the job transitions to `FAILED` with status `partially_executed_failed`. It is NEVER claimed to be atomic or rolled back.

#### Gate 5: Manual Timeline Edit Lineage Synchronization
- **Issue**: Direct Visual Control Surface mutations increment project revision but were not represented in the session DAG.
- **Resolution**: `POST /api/project/operation` now records an explicit revision entry in the active session history:
  ```json
  {
    "revision_id": "rev-manual-5",
    "predecessor_id": "rev-4",
    "origin": "manual_vcs",
    "operation": { "type": "split_clip", "operationId": "op-manual-123" },
    "status": "committed",
    "timestamp": "2026-10-20T18:25:00.000Z",
    "_project": { "revision": 5, "..." : "..." }
  }
  ```
  This preserves the project revision provenance across both automated prompt jobs and manual timeline edits.

---

## 2. Authoritative 12-State Canonical Lifecycle

The 12 authoritative logical states are defined as an immutable frozen enumeration:

```javascript
const WorkflowJobStatus = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  PLANNING: 'PLANNING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  READY_TO_EXECUTE: 'READY_TO_EXECUTE',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  RENDERING: 'RENDERING',
  PUBLISHING: 'PUBLISHING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  NEEDS_RECONCILIATION: 'NEEDS_RECONCILIATION'
});
```

### 2.1 State Definitions
1. **`ACCEPTED`**: Request payload, session context, and idempotency key validated. Initial state upon job creation.
2. **`PLANNING`**: Brief is being analyzed, reference targets resolved, constraints normalized, and declarative operation plan compiled and dry-run.
3. **`AWAITING_APPROVAL`**: Request is held awaiting explicit user confirmation of the compiled plan (`awaitingReason: 'approval'`) or resolution of missing input/ambiguity (`awaitingReason: 'clarification'`).
4. **`READY_TO_EXECUTE`**: Preconditions, base revision, and approval confirmed. Plan is frozen and queued for execution.
5. **`EXECUTING`**: OperationExecutor is applying planned operations to project timeline with execution journaling.
6. **`VERIFYING`**: Technical or semantic quality checks are being evaluated (e.g. post-execution timeline invariant checks or media QA analysis).
7. **`RENDERING`**: Media composition is compiled and HyperFrames/FFmpeg renderer is encoding output video.
8. **`PUBLISHING`**: Output media SHA-256 is verified, delivery manifest is signed, and `session.active_delivery` pointer is prepared for atomic publication.
9. **`SUCCEEDED`**: **Terminal state.** All required execution, render, QA, and publication gates passed. Active delivery updated.
10. **`FAILED`**: **Terminal state.** A required stage failed, and bounded recovery could not produce a valid deliverable. Previous active delivery preserved.
11. **`CANCELLED`**: **Terminal state.** Cancellation was accepted and resolved cleanly at a transaction boundary.
12. **`NEEDS_RECONCILIATION`**: An unexpected interruption (e.g. process crash, timeout, lost response) requires journal inspection to determine authoritative outcome.

---

## 3. Authoritative State Transition Table

The following state transition table is strictly enforced by the unified lifecycle validator:

| From State | Allowed Next States | Transition Preconditions & Guard Rules |
| :--- | :--- | :--- |
| **`ACCEPTED`** | `PLANNING`<br>`FAILED`<br>`CANCELLED` | - `PLANNING`: Context normalized, project snapshot hash computed.<br>- `FAILED`: Ingestion validation error (malformed request).<br>- `CANCELLED`: User cancelled before planning started. |
| **`PLANNING`** | `AWAITING_APPROVAL`<br>`READY_TO_EXECUTE`<br>`FAILED`<br>`CANCELLED` | - `AWAITING_APPROVAL`: Plan requires user signoff or brief needs clarification.<br>- `READY_TO_EXECUTE`: Plan dry-run passed; no approval required.<br>- `FAILED`: Unresolvable conflict, missing asset, or syntax error.<br>- `CANCELLED`: User cancelled during planning. |
| **`AWAITING_APPROVAL`** | `READY_TO_EXECUTE`<br>`PLANNING`<br>`FAILED`<br>`CANCELLED` | - `READY_TO_EXECUTE`: User approved plan; base revision & plan hash re-verified.<br>- `PLANNING`: User supplied clarification modifying inputs (triggers replan).<br>- `FAILED`: User rejected plan or base revision became stale.<br>- `CANCELLED`: User cancelled request. |
| **`READY_TO_EXECUTE`** | `EXECUTING`<br>`CANCELLED` | - `EXECUTING`: Write mutex acquired; base revision confirmed current.<br>- `CANCELLED`: User cancelled before execution began. |
| **`EXECUTING`** | `VERIFYING`<br>`RENDERING`<br>`FAILED`<br>`NEEDS_RECONCILIATION` | - `VERIFYING`: All operations executed; project-level verification begins.<br>- `RENDERING`: Direct transition to render (when verification is post-render).<br>- `FAILED`: Operation failed and rolled back (or partial failed).<br>- `NEEDS_RECONCILIATION`: Process crashed or response lost mid-execution. |
| **`VERIFYING`** | `RENDERING`<br>`PUBLISHING`<br>`FAILED`<br>`NEEDS_RECONCILIATION` | - `RENDERING`: Pre-render verification passed; commencing video encode.<br>- `PUBLISHING`: Post-render QA score $\ge 80$; proceeding to manifest.<br>- `FAILED`: QA check failed (e.g. blank flash, audio clipping).<br>- `NEEDS_RECONCILIATION`: Verification probe timeout or unreadable probe. |
| **`RENDERING`** | `VERIFYING`<br>`FAILED`<br>`CANCELLED`<br>`NEEDS_RECONCILIATION` | - `VERIFYING`: MP4 generated; passing to Media QA inspection.<br>- `FAILED`: HyperFrames/FFmpeg exit code $\ne 0$.<br>- `CANCELLED`: Renderer cleanly killed via process control.<br>- `NEEDS_RECONCILIATION`: Host crash during video encoding. |
| **`PUBLISHING`** | `SUCCEEDED`<br>`FAILED`<br>`NEEDS_RECONCILIATION` | - `SUCCEEDED`: File SHA-256 confirmed; manifest written; `active_delivery` updated.<br>- `FAILED`: SHA-256 mismatch or write error.<br>- `NEEDS_RECONCILIATION`: Manifest written but session file update interrupted. |
| **`NEEDS_RECONCILIATION`** | `VERIFYING`<br>`PUBLISHING`<br>`FAILED` | - `VERIFYING`: Journal confirms project committed cleanly; resumes QA.<br>- `PUBLISHING`: Output media and QA confirmed; resumes publication.<br>- `FAILED`: Unresolvable corruption or journal rollback confirmed. |
| **`SUCCEEDED`** | *None* | **Terminal State.** Immutable; late callbacks rejected. |
| **`FAILED`** | *None* | **Terminal State.** Immutable; retry creates new linked job. |
| **`CANCELLED`** | *None* | **Terminal State.** Immutable. |

---

## 4. Legacy Compatibility Mapping

To maintain 100% backward compatibility with existing tests and clients across Phase 14B and PF-11 without running divergent state machines:

| Legacy Status Name | Originating Phase | Authoritative 12-State Canonical Status | Compatibility Adapter Handling |
| :--- | :---: | :---: | :--- |
| `CREATED` | Phase 14B | `ACCEPTED` | Maps bi-directionally; legacy API receives `CREATED` if requested. |
| `INGESTING` | Phase 14B | `PLANNING` | Sub-stage progress `stage: "INGESTING"` inside `PLANNING`. |
| `ANALYZING` | Phase 14B | `PLANNING` | Sub-stage progress `stage: "ANALYZING"` inside `PLANNING`. |
| `VALIDATING` | Phase 14B | `READY_TO_EXECUTE` | Maps to `READY_TO_EXECUTE`. |
| `QA_EVALUATING` | Phase 14B | `VERIFYING` | Maps to `VERIFYING`. |
| `CORRECTING` | Phase 14B | `NEEDS_RECONCILIATION` | Handled as active reconciliation under `NEEDS_RECONCILIATION`. |
| `SUSPENDED` | Phase 14B | `AWAITING_APPROVAL` | Suspended awaiting user resumption maps to `AWAITING_APPROVAL`. |
| `COMPLETED` | Phase 14B | `SUCCEEDED` | Normalized to `SUCCEEDED`; legacy clients reading `.status === 'COMPLETED'` receive `COMPLETED` via getter alias. |
| `COMMITTED` | Phase PF-11 | `SUCCEEDED` | Normalized to `SUCCEEDED`; getter alias `.status === 'COMMITTED'` preserved. |
| `RECOVERING` | Phase PF-11 | `NEEDS_RECONCILIATION` | Active recovery recorded under `NEEDS_RECONCILIATION` metadata. |

---

## 5. Architectural Invariants Enforced by this Contract

1. **State Immutability of Terminal Jobs**: A job in `SUCCEEDED`, `FAILED`, or `CANCELLED` ignores all delayed callbacks, timers, or asynchronous resolution events.
2. **Active-Delivery Fail-Safe Preservation**: Under every failure path (`FAILED`, `CANCELLED`, `NEEDS_RECONCILIATION`), `session.active_delivery` retains its previous verified state. A new delivery is published **ONLY** upon reaching `SUCCEEDED`.
3. **Monotonic Revision Integrity**: The canonical project revision increments monotonically. Staged failures in atomic workflows discard the candidate snapshot without altering the base project revision.
4. **Authoritative State Ownership**: The Project Engine owns state; `OperationExecutor` owns edits; `QualityAssuranceEngine` owns acceptance; `RenderOrchestrator` owns publication.
