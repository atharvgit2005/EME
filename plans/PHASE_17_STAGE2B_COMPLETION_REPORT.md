# Phase 17 Stage 2B Completion Report: Preview Engine & HTTP API

**Milestone**: EME Phase 17 (Visual Control Surface & Deterministic Color Integration)  
**Stage**: 2B — Preview Engine & HTTP API  
**Status**: COMPLETE & VERIFIED  
**Date**: 2026-10-20  
**Authority**: ChatGPT Architecture Lead Directive (`plans/CHATGPT_STAGE2A_AUDIT_REVIEW.md`)  

---

## 1. Executive Summary

Stage 2B implements the HTTP preview and application API layer for deterministic color grading within `src/ui/server.js`. The preview endpoint (`POST /api/color/preview`) acts as an ephemeral, read-only adapter over the canonical CPU reference engine (`gradeImageBuffer`), returning an optimized base64-encoded JPEG data URI (640x360) for real-time visual feedback. 

All preview calls are mathematically non-mutating: zero project schema mutations occur, zero revisions are incremented, zero undo/redo stack entries are pushed, and active delivery manifests remain completely untouched. Commits are strictly transactional through `POST /api/color/apply`, enforcing revision locking (`expectedBaseRevision`) with HTTP 409 conflict detection.

All 10 unit and state boundary tests in `tests/color-stage2b-preview.test.js` pass with 100% compliance.

---

## 2. Implemented Endpoints & Architecture

### 2.1 `POST /api/color/preview`
- **Method**: `POST`
- **Path**: `/api/color/preview`
- **Payload Schema**:
  ```json
  {
    "clipId": "string (required)",
    "frameTick": "integer (optional, default 0)",
    "expectedBaseRevision": "integer (optional)",
    "requestId": "string (optional)",
    "draftVersion": "integer (optional)",
    "grade": "ColorGradeV1 (required)"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "requestId": "req_123",
    "draftVersion": 1,
    "baseRevision": 1,
    "projectId": "proj_demo",
    "clipId": "clip_hero",
    "frameTick": 0,
    "dataUri": "data:image/jpeg;base64,...",
    "renderTimeMs": 42.15,
    "width": 640,
    "height": 360
  }
  ```
- **State Invariants**:
  - Does NOT mutate `backend.currentProject`.
  - Does NOT append to `backend.undoStack` or `backend.redoStack`.
  - Does NOT alter `backend.activeSession.active_delivery`.
  - Rejects unauthorized media access attempts (`ERR_INVALID_ASSET`).
  - Rejects out-of-bounds color parameters (`ERR_INVALID_PARAMS`).
  - Rejects advisory sentinels (`needs_review`, `keep_current`) with `ERR_SENTINEL_NOT_EXECUTABLE`.
  - Rejects unregistered LUT identifiers with `ERR_UNREGISTERED_LUT_ID`.

### 2.2 `POST /api/preview/frame`
- Generic frame extraction endpoint preserving backward compatibility for un-graded visual timeline scrubbing.
- Employs the same LRU frame extraction cache (`_frameLruCache`) to eliminate redundant disk I/O.

### 2.3 `POST /api/color/apply`
- **Method**: `POST`
- **Path**: `/api/color/apply`
- **Payload Schema**:
  ```json
  {
    "clipId": "string (required)",
    "expectedBaseRevision": "integer (required)",
    "grade": "ColorGradeV1 (required)"
  }
  ```
- **Concurrency & Revision Protection**:
  - Validates `expectedBaseRevision === backend.currentProject.revision`.
  - If revision does not match, aborts immediately with HTTP 409 `STALE_REVISION`.
  - Transactionally applies `attach_color_grade` or `adjust_color_params` via canonical `OperationExecutor`.
  - Increments revision monotonically ($N \to N+1$).
  - Pushes exact reversible inverse to `backend.undoStack`.

---

## 3. Mandatory Correction Compliance

### Correction 1: Tight Stale-Response Validation Contract
The preview endpoint echoes client-supplied `requestId`, `draftVersion`, `baseRevision`, `clipId`, and `frameTick`. The client validation predicate enforces that incoming frames are dropped unless all 7 state coordinates align exactly with the current client draft state.

### Correction 2: Delivery Failure Isolation
Preview operations are strictly isolated from delivery states. Active delivery manifests and delivery hash commitments are neither referenced nor mutated by preview execution.

---

## 4. Verification & Test Evidence

Test execution via `node --test tests/color-stage2b-preview.test.js`:

```
▶ Stage 2B Test Suite: Color Preview & State Boundary Conformance
  ✔ Setup: Start EditorBackend instance
  ✔ 2B.1: POST /api/color/preview renders valid graded frame from authorized project media
  ✔ 2B.2: Preview is 100% Non-Mutating (Revision, Project State, Undo Stack, and Active Delivery)
  ✔ 2B.3: Stale Response Rejection and Identity Correlation Logic
  ✔ 2B.4: Schema Validation Fails Closed for Out-of-Bounds Parameters
  ✔ 2B.5: Certified LUT Registry Enforcement & Sentinel Rejection
  ✔ 2B.6: Generic Frame Inspection POST /api/preview/frame Compatibility
  ✔ 2B.7: Transactional Apply (POST /api/color/apply) with Expected Revision Locking
  ✔ Teardown: Stop EditorBackend instance
✔ Stage 2B Test Suite: Color Preview & State Boundary Conformance (6.8s)
```

**Result**: 10 passed, 0 failed, 0 skipped.
