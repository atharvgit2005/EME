# Phase 19 (RT-01) — Stage 19.1D: Workflow API & Job Tracking Contract Report

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.1D — Workflow API, Job Tracking and Status Projection  
**Document**: `plans/PHASE_19_STAGE1D_API_CONTRACT_REPORT.md`  
**Prerequisite**: Stage 19.1A, 19.1B, and 19.1C Reports  
**Architecture Lead Directive**: Section 5 of `plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md`  

---

## 1. Executive Summary

This report defines the HTTP and programmatic API contract for the unified end-to-end editing workflow in `src/ui/server.js` (`EditorBackend`) and `src/prompt-core/job-orchestrator.js` (`OrchestrationJobManager`).

### Core Contract Principles:
1. **Reuse Existing Endpoint Family**: Enhances `POST /api/jobs`, `GET /api/jobs/:jobId`, and `POST /api/session/revise` rather than creating a competing endpoint family.
2. **Clear Separation of Concerns**: Status responses clearly distinguish job execution state from project revision state and delivery publication state.
3. **Idempotency Multi-Tiering**: Separates the 200-entry in-memory operation cache from durable workflow job idempotency.

---

## 2. API Endpoints Specification

### 2.1 Submit Workflow Request: `POST /api/jobs`
- **Method**: `POST`
- **Path**: `/api/jobs`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "prompt": "Create 12-second vertical travel reel",
    "idempotencyKey": "req-idemp-001",
    "expectedVersion": 1,
    "async": false,
    "requireApproval": false,
    "options": {
      "outputProfile": {
        "container": "mp4",
        "width": 1080,
        "height": 1920,
        "frame_rate": { "numerator": 30, "denominator": 1 }
      }
    }
  }
  ```
- **Synchronous Response (`async: false`)**:
  - `HTTP 200 OK` on success:
    ```json
    {
      "success": true,
      "job": {
        "job_id": "job_1729450000_a1b2",
        "status": "SUCCEEDED",
        "progress": { "stage": "SUCCEEDED", "percent": 100, "message": "Revision rev-1 active" },
        "artifacts": {
          "plan_id": "plan-xyz",
          "plan_hash": "sha256...",
          "journal_path": "artifacts/deliverables/job-...-journal.json",
          "media_path": "artifacts/deliverables/job-...-deliverable.mp4",
          "media_sha256": "sha256...",
          "manifest_id": "man-abc",
          "revision_id": "rev-1"
        }
      },
      "active_delivery": { ... },
      "session": { ... }
    }
    ```
  - `HTTP 202 Accepted` if held in `AWAITING_APPROVAL`:
    ```json
    {
      "success": true,
      "held": true,
      "jobId": "job_1729450000_a1b2",
      "status": "AWAITING_APPROVAL",
      "awaitingReason": "approval",
      "plan": { ... },
      "planHash": "sha256..."
    }
    ```
  - `HTTP 422 Unprocessable Entity` on preflight / execution / QA failure:
    ```json
    {
      "success": false,
      "error": "Media QA verification failed: score=72",
      "job": { "job_id": "...", "status": "FAILED" },
      "active_delivery": { /* prior delivery preserved */ }
    }
    ```
- **Asynchronous Response (`async: true`)**:
  - `HTTP 202 Accepted`: Returns `{ success: true, jobId, status: "ACCEPTED", progress }`.

### 2.2 Poll Job Status: `GET /api/jobs/:jobId`
- **Method**: `GET`
- **Path**: `/api/jobs/:jobId`
- **Response**:
  - `HTTP 200 OK`:
    ```json
    {
      "success": true,
      "job": {
        "job_id": "job_1729450000_a1b2",
        "status": "SUCCEEDED",
        "progress": { "stage": "SUCCEEDED", "percent": 100 },
        "state_history": [
          { "from_status": null, "to_status": "ACCEPTED", "timestamp": "...", "reason": "Job created" },
          { "from_status": "ACCEPTED", "to_status": "PLANNING", "timestamp": "...", "reason": "Compiling plan" },
          { "from_status": "PLANNING", "to_status": "READY_TO_EXECUTE", "timestamp": "...", "reason": "Preflight passed" },
          { "from_status": "READY_TO_EXECUTE", "to_status": "EXECUTING", "timestamp": "...", "reason": "Executing operations" },
          { "from_status": "EXECUTING", "to_status": "RENDERING", "timestamp": "...", "reason": "Rendering video" },
          { "from_status": "RENDERING", "to_status": "VERIFYING", "timestamp": "...", "reason": "QA checks" },
          { "from_status": "VERIFYING", "to_status": "PUBLISHING", "timestamp": "...", "reason": "Signing manifest" },
          { "from_status": "PUBLISHING", "to_status": "SUCCEEDED", "timestamp": "...", "reason": "Active delivery updated" }
        ],
        "artifacts": { ... },
        "result": { ... }
      }
    }
    ```
  - `HTTP 404 Not Found`: If job does not exist.

### 2.3 Submit Plan Approval / Clarification: `POST /api/jobs/:jobId/approve`
- **Method**: `POST`
- **Path**: `/api/jobs/:jobId/approve`
- **Request Body**:
  ```json
  {
    "action": "approve" | "clarify" | "reject",
    "clarification": { ... },
    "expectedPlanHash": "sha256...",
    "expectedBaseRevision": 0
  }
  ```
- **Response**:
  - If approved and hashes match: Job transitions `AWAITING_APPROVAL` $\to$ `READY_TO_EXECUTE` and commences execution.
  - If clarified: Job transitions `AWAITING_APPROVAL` $\to$ `PLANNING` and recompiles.
  - If rejected: Job transitions `AWAITING_APPROVAL` $\to$ `FAILED`.

### 2.4 Request Cancellation: `POST /api/jobs/:jobId/cancel`
- **Method**: `POST`
- **Path**: `/api/jobs/:jobId/cancel`
- **Request Body**: `{ "reason": "User requested" }`
- **Response**:
  - `HTTP 200 OK`: If cancelled cleanly before execution or during render. Job status is `CANCELLED`.
  - `HTTP 409 Conflict`: If job is already in a terminal state (`SUCCEEDED`, `FAILED`, `CANCELLED`).

---

## 3. Idempotency & Reconnection Guarantees

1. **Exact Payload Deduplication**: Replaying `POST /api/jobs` with the same `idempotencyKey` and identical prompt payload returns the original cached response immediately.
2. **Conflict Rejection**: Replaying `POST /api/jobs` with the same `idempotencyKey` but a modified prompt payload returns `HTTP 409 IDEMPOTENCY_CONFLICT` without modifying any state.
3. **Reconnection**: Clients that disconnect mid-request reconnect by querying `GET /api/jobs/:jobId` or re-submitting with the same `idempotencyKey`.
