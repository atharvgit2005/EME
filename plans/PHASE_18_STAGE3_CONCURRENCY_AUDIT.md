# EME Phase 18: Stage 18.3A Concurrency & Recovery Contract Audit

**Milestone**: TL-01 / Phase 18  
**Document**: `plans/PHASE_18_STAGE3_CONCURRENCY_AUDIT.md`  
**Date**: October 20, 2026  
**Status**: APPROVED AUDIT DELIVERABLE FOR STAGE 18.3 IMPLEMENTATION  
**Architecture Owner**: ChatGPT Architecture Lead  
**Inspected Subsystems**: `src/engine/operations.js`, `src/ui/server.js`, `src/ui/public/app.js`  

---

## 1. Executive Summary

In accordance with the **ChatGPT Stage 18.3 Implementation Directive** (`plans/CHATGPT_STAGE18_2_COMPLETION_REVIEW.md`), this document performs a comprehensive code inspection and architectural audit of all mutation, revision, concurrency, locking, and recovery mechanisms across the Editing Mechanics Engine.

The audit identifies:
1. Exact commit boundaries and revision synchronization points.
2. In-flight race vulnerabilities between `/api/project/operation`, `/api/project/undo`, and `/api/project/redo`.
3. Absence of idempotency keys and request deduplication under ambiguous network outcomes.
4. UI gesture client-side serialization gaps.
5. Deterministic failure-injection scenarios required to certify Stage 18.3.

---

## 2. Component-by-Component Concurrency Audit

### 2.1 Engine Boundary: `OperationExecutor.execute()`
- **File**: `src/engine/operations.js` (lines 14–204)
- **Mechanism**:
  - Validates `operation.expectedBaseRevision` against `project.revision`.
  - Performs `structuredClone(project || {})` to isolate candidate execution from the active state.
  - Executes operation handlers; if any handler throws (e.g., `TRACK_LOCKED`, `TRACK_COLLISION`, `SPLIT_OUT_OF_BOUNDS`), execution immediately aborts and returns `{ success: false, error, errorCode, project }`. Zero partial mutation occurs.
  - Validates resulting candidate against `ProjectManager.validateProject(candidate)` (JSON schema and semantic invariants).
  - Increments revision monotonically: `candidate.revision = (project && Number.isInteger(project.revision)) ? project.revision + 1 : 0`.
- **Audit Findings**:
  - `OperationExecutor` is purely functional and synchronous. It guarantees transaction atomicity and fail-closed validation for a single invocation.
  - It does **not** protect against concurrent asynchronous HTTP requests racing on the server. Serialization must be enforced at the server endpoint boundary.

### 2.2 Server Boundary: `EditorBackend` in `src/ui/server.js`
- **File**: `src/ui/server.js` (lines 50–1080)
- **Current State**:
  - `this.isMutating = false;` is declared on line 61.
  - `this.isMutating` is checked and acquired across session-level conversational revision routes (`/api/session/revise`, `/api/session/undo`, `/api/session/redo`, `/api/session/select`), returning HTTP 409 (`MUTATION_IN_PROGRESS`) if a mutation is already in-flight.
  - **Identified Gap**: `/api/project/operation`, `/api/project/undo`, and `/api/project/redo` (lines 988–1063) **do not currently check or set `this.isMutating`**!
  - **Risk**: If two distinct HTTP requests hit `/api/project/operation` concurrently (e.g. rapid multi-touch, racing websocket/HTTP clients, or an undo request racing with an operation commit), both requests could read `this.currentProject` before either has written `this.currentProject = result.project`, leading to race conditions or inconsistent history stacks.
- **Remediation**:
  - Wrap `/api/project/operation`, `/api/project/undo`, and `/api/project/redo` with `this.isMutating` guard:
    ```javascript
    if (this.isMutating) {
      return this.sendJson(res, 409, {
        error: 'A project mutation or undo/redo operation is already in progress',
        errorCode: 'MUTATION_IN_PROGRESS'
      });
    }
    this.isMutating = true;
    try {
      // execute operation or undo/redo
    } finally {
      this.isMutating = false;
    }
    ```

### 2.3 Idempotency & Duplicate Request Protection
- **Current State**:
  - The server currently has no idempotency cache for project operations.
  - If a client issues an operation with `operationId`, and the HTTP connection drops after the server commits the transaction, the client experiences a network failure. If the client retries the exact same request, the server evaluates `expectedBaseRevision`, which has now advanced from $N \to N+1$. The retry fails with HTTP 409 `STALE_REVISION`, leaving the client unable to discern whether its operation was successfully applied or lost.
- **Remediation**:
  - Implement a bounded LRU Idempotency Cache in `EditorBackend`:
    `this.idempotencyCache = new Map();` (bounded to 200 entries).
  - When `operation.operationId` (or `body.idempotencyKey`) is present:
    1. Check if `this.idempotencyCache.has(opId)`:
       - If payload hash matches: return the cached response `{ success: true, project, revision, affectedIds, canUndo, canRedo }` without incrementing revision or mutating state.
       - If payload hash differs: reject with HTTP 400 `IDEMPOTENCY_CONFLICT` (`operationId reused with conflicting parameters`).
    2. On new successful commit, cache result:
       `this.idempotencyCache.set(opId, { payloadHash, response: cloneResult });`

### 2.4 Client-Side Serialization: `src/ui/public/app.js`
- **Current State**:
  - `pendingOperation` exists as a module-scoped variable (line 921).
  - `undo()` and `redo()` check `if (pendingOperation) await pendingOperation.catch(() => {});`.
  - **Identified Gap**: `dispatchOperation()` itself does not check if `pendingOperation !== null` before initiating a new request. If rapid clicks or simultaneous pointer-up events occur, two operations can be dispatched in parallel.
- **Remediation**:
  - In `dispatchOperation()`, if `pendingOperation !== null`, queue or reject subsequent dispatches until the pending operation completes.
  - Automatically generate and attach a unique `operationId: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)` to every operation envelope to enable server-side idempotency tracking.

### 2.5 Mid-Gesture Track Lock Transitions
- **Scenario**:
  1. User starts dragging a clip on track `track_v1` (unlocked, revision $N$).
  2. While the drag gesture is in progress, another action locks `track_v1` via `set_track_state` and commits revision $N+1$.
  3. User completes drag and releases pointer (`mouseup`).
  4. Client dispatches `move_clip` with `expectedBaseRevision: N`.
- **Expected Engine Behavior**:
  - The engine checks `expectedBaseRevision !== project.revision` ($N \neq N+1$) and immediately rejects with HTTP 409 `STALE_REVISION`.
  - Even if a stale or modified request passes without `expectedBaseRevision`, `_assertTrackNotLocked` validates `track.locked === true` and aborts with `TRACK_LOCKED`.
  - The UI catches the rejection, removes the ghost element transform, displays an error notification, and re-renders the timeline from the authoritative engine state.
- **Track Unlock Legality**:
  - Crucially, `_opSetTrackState` does **not** invoke `_assertTrackNotLocked`. Therefore, an authorized `set_track_state { trackId: 'track_v1', locked: false }` operation is always permitted, avoiding deadlock.

### 2.6 Stale Timeline Projection Protection
- **Current State**:
  - `state.timelineFetchSeq` was introduced in Stage 18.1.
- **Remediation for Stage 18.3**:
  - Extend the guard to compare both sequence ID and authoritative project revision:
    ```javascript
    if (seq < state.timelineFetchSeq) return; // Sequence order check
    if (data.revisionId && state.project && data.revisionId < state.project.revision) return; // Stale revision check
    ```
  - This guarantees that an out-of-order timeline projection arriving after an editing operation cannot reintroduce deleted clips, restore pre-edit coordinates, or display obsolete lock states.

---

## 3. Concurrency & Failure Recovery Invariants Summary

| Mechanism | Current Implementation | Stage 18.3 Remediation | Target Guarantees |
| :--- | :--- | :--- | :--- |
| **Project Operation Mutex** | Missing on `/api/project/*` | Enforce `this.isMutating` lock across `/api/project/operation`, `undo`, `redo` | Re-entrant requests fail with HTTP 409 `MUTATION_IN_PROGRESS`; zero state corruption |
| **Operation Idempotency** | Absent | Bounded LRU cache (200 entries) keyed by `operationId` + payload hash | Duplicate requests return identical response without duplicate revisions; conflicting payloads rejected |
| **Client In-Flight Serialization** | Partial (`undo`/`redo` only) | In `dispatchOperation()`, await `pendingOperation` or reject concurrent dispatches | Zero duplicate client-side requests during active gestures |
| **Mid-Gesture Lock Rejection** | Checked on mousedown | Enforced at engine boundary via `_assertTrackNotLocked` + revision check | Conflicting gestures fail closed; ghost cleared |
| **Stale Projection Rejection** | Sequence number check | Sequence number + authoritative revision validation | Delayed responses cannot overwrite newer canonical projections |
| **Monotonic Undo / Redo** | Implemented | Protected under `this.isMutating` mutex | Racing undo/redo requests serialized safely |

---

## 4. Stage 18.3 Implementation & Test Plan

We will implement the following changes in Stage 18.3:
1. **Server Hardening (`src/ui/server.js`)**:
   - Enforce `this.isMutating` mutex on `/api/project/operation`, `/api/project/undo`, `/api/project/redo`.
   - Add LRU idempotency cache `this.idempotencyCache` for duplicate request handling.
2. **Client Hardening (`src/ui/public/app.js`)**:
   - Prevent concurrent `dispatchOperation` invocations while `pendingOperation` is in-flight.
   - Inject unique `operationId` into every operation envelope.
   - Dual-guard timeline projections against both `seq` and `revision`.
3. **Deterministic Failure Injection Test Suite (`tests/timeline-stage18-3-concurrency.test.js`)**:
   - Competing mutations against one revision (double commit prevention).
   - Track locked during in-flight gesture.
   - Correct-revision edit of locked track.
   - Duplicate operation request with same `operationId` (idempotent result).
   - Same `operationId` with different payload (explicit rejection).
   - Undo racing with a new mutation.
   - Redo racing with a new mutation.
   - Concurrent Undo requests.
   - Concurrent Redo requests.
   - Stale timeline projection arrives late (discarded).
   - Failed validation leaves zero partial mutation.
   - Unlocking a locked track is permitted.

This audit forms the architectural baseline for immediate Stage 18.3 execution.
