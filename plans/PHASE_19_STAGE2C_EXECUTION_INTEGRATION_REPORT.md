# Phase 19 (RT-01) — Stage 19.2C: Plan Execution, Atomicity & Cross-System Integration Report

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.2D — Plan Execution, Atomicity & Cross-System Integration  
**Document**: `plans/PHASE_19_STAGE2C_EXECUTION_INTEGRATION_REPORT.md`  
**Architecture Lead Directive**: Section 5 of `plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md`  
**Prerequisites**: Stage 19.2A Golden Contract & Stage 19.2B Revision Lineage  

---

## 1. Executive Summary

This report establishes the precise execution preconditions, transaction boundaries, compound plan atomicity rules, and idempotency guarantees governing the integration between `OperationPlanCompiler`, `OperationExecutor`, `OrchestrationJobManager`, and `RevisionSessionManager`.

---

## 2. Immediate Pre-Execution Gates & Preconditions

Before `OperationPlanCompiler.executePlan` or `OperationExecutor` executes any operation against a project snapshot:
1. **Authoritative State Reload**:
   - Reload live project state and active session concurrency version immediately prior to mutation lock acquisition.
2. **Base Revision & Plan Hash Concurrency Guard**:
   - Compare `effectiveProject.revision` against `plan.base_revision`. If unequal $\to$ **Abort with 409 `STALE_REVISION`**.
   - Compare canonical plan hash against approved hash in job artifacts. If unequal $\to$ **Abort with `PLAN_HASH_MISMATCH`**.
3. **Precondition Re-Verification**:
   - Verify that all target clip IDs and track IDs referenced in operations exist in the current project.
   - Verify that no target track is locked (`locked: true`).
   - Verify all required asset media files exist and match registered SHA-256 hashes.
4. **Job State Guard**:
   - Confirm job is in `READY_TO_EXECUTE` or `PLANNING` (for direct preflight paths).
   - If job is terminal (`SUCCEEDED`, `FAILED`, `CANCELLED`) $\to$ **Reject execution immediately**.
5. **Transaction Boundary Recording**:
   - Record transaction start timestamp and transaction journal identifier (`tx-<uuid>`) before memory or disk mutation begins.

---

## 3. Atomic vs. Non-Atomic Compound Plan Semantics

### 3.1 Compound Plan Atomicity (`atomic: true`)
When a workflow specifies `atomic: true` (the default for all automated AI revisions):
1. **Isolated Candidate Staging**:
   - Operations execute against an isolated candidate clone: `candidate = structuredClone(effectiveProject)`.
   - Live canonical project content and revision remain completely untouched during intermediate step execution.
2. **Success Commitment**:
   - Only when **all** operations in the plan succeed and validate:
     - The staged candidate replaces the active project state.
     - Final revision $N+k$ is assigned.
     - Execution journal writes `status: 'committed'`, `executed_steps: k`.
3. **Failure Rollback**:
   - If any step $i$ fails or raises an error:
     - The candidate clone is immediately discarded.
     - Execution journal writes `status: 'rolled_back'`, `executed_steps: i-1`, `failed_step_index: i`.
     - Canonical project content and revision remain **100% unaltered** at original revision $N$.
     - Job transitions to `FAILED`.

### 3.2 Non-Atomic Plan Semantics (`atomic: false`)
When a workflow specifies `atomic: false`:
1. **Sequential Live Execution**:
   - Operations execute sequentially on the live project.
   - Each completed step $i$ increments revision and records an operation journal entry.
2. **Partial Failure Reporting**:
   - If step $k$ fails:
     - Steps $0 \dots k-1$ remain committed at revision $N+k-1$.
     - Remaining unexecuted steps are halted.
     - Execution journal writes `status: 'partially_executed_failed'`, `executed_steps: k-1`, `failed_step_index: k`, `committed_revision: N+k-1`.
     - Job transitions to `FAILED`.
     - The response explicitly identifies completed steps and final project revision so callers or human operators can resolve the partial state.

---

## 4. Multi-Tier Idempotency Architecture

EME enforces idempotency across two distinct layers:

### Layer 1: High-Level Workflow Job Idempotency
- **Scope**: Durable, cross-session, persistent across process restarts.
- **Authority**: `OrchestrationJobManager.idempotencyIndex`.
- **Behavior**:
  - Maps caller `idempotencyKey` $\to$ `jobId`.
  - Persisted in `artifacts/jobs/*.json`.
  - If a duplicate request arrives with identical prompt payload:
    - If job is `SUCCEEDED` or `COMMITTED`: returns cached result (`fromCache: true`) with HTTP 200.
    - If job is `FAILED`: returns cached failure with HTTP 422.
    - If job is in-flight: returns HTTP 202 (`inFlight: true`).
  - If a request arrives reusing an existing `idempotencyKey` with a *different* prompt or payload:
    - Immediately fails closed with **409 `IDEMPOTENCY_CONFLICT`**.

### Layer 2: Low-Level Timeline Operation Idempotency
- **Scope**: Process-local, high-frequency, in-memory LRU cache (200 entries).
- **Authority**: `EditorBackend.idempotencyCache`.
- **Behavior**:
  - Maps `operationId` $\to$ `{ payloadHash, response }`.
  - When the Visual Control Surface UI retries a rapid timeline split, trim, or move:
    - If operationId and payload match: returns cached response (`idempotent: true`) with HTTP 200 without executing duplicate timeline mutation.
    - If operationId is reused with conflicting parameters: returns 400 `IDEMPOTENCY_CONFLICT`.

---

## 5. Persistence & Publication Boundaries

EME enforces four distinct lifecycle states:
1. **In-Memory Revision**: Live JavaScript object updated during interactive editing.
2. **Serialized Project File**: Disk file written on explicit `POST /api/project/save` or plan execution persist boundary.
3. **Session Revision Record**: Historical node appended to `session.history` representing an auditable DAG point.
4. **Active Verified Delivery**: Signed package containing media file, SHA-256 digest, technical metadata, and `QualityAssuranceEngine` score $\ge 90$.

**Publication Gate**: A project revision is never promoted to `session.active_delivery` until the rendered media file exists on disk, passes SHA-256 validation, and passes the 10-point media QA audit. If rendering or QA fails, `active_delivery` strictly retains its prior verified value.

---

## 6. Exit Gate Attestation

- [x] Pre-execution gates enforce base revision currency, plan hash matching, and track lock validation.
- [x] `atomic: true` guarantees zero mutation rollback on compound plan failure.
- [x] `atomic: false` guarantees accurate partial progress reporting with committed revision tracking.
- [x] Durable job idempotency and process-local operation idempotency cooperate cleanly.
- [x] Active delivery publication strictly gated by media rendering, SHA-256 verification, and QA audit.
