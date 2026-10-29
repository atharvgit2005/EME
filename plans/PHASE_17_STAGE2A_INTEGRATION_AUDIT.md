# Phase 17 Stage 2A: Repository Integration Audit & Implementation Plan

**Document Version**: 1.0.0  
**Phase**: Phase 17 — Deterministic Color Engine  
**Stage**: Stage 2A — Repository Integration Audit & Contract Specification  
**Author**: Engineering Team  
**Architecture Lead**: ChatGPT Architecture Lead (Authorized in `plans/CHATGPT_STAGE2_NEXT_STEPS.md`)  
**Date**: October 20, 2026  
**Status**: COMPLETE — SUBMITTED FOR STAGE 2A ARCHITECTURE REVIEW  

---

## 1. Executive Summary & Audit Objective

Under the formal **Phase 17 Stage 2 Kickoff Directive**, this document establishes the repository audit and architectural contract for integrating EME's deterministic color engine into the Visual Control Surface (`src/ui/public/`, `src/ui/server.js`).

The core mandate is:
- **Preview is Non-Mutating**: Generating previews or dragging sliders updates an ephemeral draft only; zero project state or revision mutation.
- **Apply is Transactional**: Committing a grade executes through `OperationExecutor` with `expectedBaseRevision`, track-lock checks, and exact inverse operation logging.
- **Hold-to-Compare Default**: Instant original/graded comparison via hold-to-compare interaction (with a persistent accessible toggle), deferring split-screen wipes.
- **Delivery Integrity**: Final delivery publication occurs only after full FFmpeg rendering and media QA verification pass.
- **Architectural Isolation**: Zero project schema versioning changes; VTSM tracking sidecars remain 100% independent; Laya remains strictly advisory.

---

## 2. Repository Inventory & Component Mapping

| Subsystem / Area | File Path | Current Status | Stage 2 Responsibility |
| :--- | :--- | :--- | :--- |
| **Control Surface UI Logic** | `src/ui/public/app.js` | Uses mock CSS filter (`brightness() contrast()`) in `updateLiveGradePreview()`; direct mutation of `state.currentGrade`. | Adapt to manage ephemeral `state.colorDraft`; implement hold-to-compare; debounce slider preview requests with `requestId` and `draftVersion`; wire transactional Apply/Cancel. |
| **Control Surface DOM** | `src/ui/public/index.html` | Contains raw LUT paths (including non-certified LUTs); lacks hold-to-compare controls. | Refactor LUT `<select>` to certified 5-look vocabulary; add Hold-to-Compare button and Draft vs. Persisted indicator. |
| **Control Surface Styles** | `src/ui/public/index.css` | Basic sidebar styles. | Add styles for Hold-to-Compare active state, draft warning badge, and loading/stale preview overlay. |
| **Backend HTTP API** | `src/ui/server.js` | Has `GET /api/color-grade`, naive `POST /api/color-grade/save`. No preview endpoint. | Implement `POST /api/color/preview` (thin adapter returning graded frame buffer); wire `POST /api/color/apply` via `OperationExecutor`. |
| **Color Math Engine** | `src/engine/color-operations.js` | Canonical 6-stage pixel pipeline (`gradePixelRgb`, `gradeImageBuffer`). Certified in Stage 1. | Reused without modification as authoritative evaluation engine. |
| **Certified LUT Registry** | `src/engine/lut-registry.js` | Certified in Stage 1 (`bleach_bypass`, `warm_golden`, `teal_orange`, `cinematic_contrast`, `true_tone`). | Authoritative lookup and SHA-256 verification for preview and render. |
| **Preview Engine** | `src/renderers/color-preview.js` | Has GLSL generator, benchmark, multi-LUT matrix. | Expose single-frame CPU/GPU buffer grading helper for backend preview endpoint. |
| **Render Compiler** | `src/renderers/ffmpeg-color-compiler.js` | Compiles grade to 3D `.cube` and executes `lut3d=file=...:interp=tetrahedral`. | Reused for committed renders and delivery exports. |
| **Atomic Operations** | `src/engine/operations.js` | Hardened in Stage 1: `attach_color_grade`, `adjust_color_params`, `remove_color_grade`. | Authoritative state mutation and inverse operation generation. |
| **Session & History** | `src/prompt-core/revision-session.js` | Authoritative DAG, undo/redo stacks, active delivery pointer. | Synchronizes with Visual Control Surface after successful operations. |

---

## 3. Data Flow Architecture

### 3.1 Preview Data Flow (Non-Mutating)
```
User drags slider (e.g. Exposure, Temp) or selects Certified LUT
   │
   ▼
UI State: Updates ephemeral `state.colorDraft` (increments `draftVersion`)
   │
   ▼ (Debounced: 60ms)
HTTP POST /api/color/preview
   ├── Payload: { projectId, clipId, mediaPath, frameTick, draftGrade, requestId, draftVersion }
   │
   ▼
Backend (src/ui/server.js):
   ├── 1. Validates media path against `authorizedMedia` map
   ├── 2. Validates `draftGrade` against schema bounds & certified LUT registry
   ├── 3. Extracts source frame at `frameTick` (or uses cached raw frame)
   ├── 4. Grades buffer using `gradeImageBuffer(rawFrame, draftGrade, certifiedLut)`
   └── 5. Returns Base64 JPEG data URI + `requestId` + `draftVersion` + `gradeHash`
   │
   ▼
UI Response Handler (src/ui/public/app.js):
   ├── Checks: Does `response.requestId === state.latestRequestId` && `response.draftVersion === state.colorDraft.version`?
   ├── If STALE: Discard silently (zero UI flash).
   └── If CURRENT: Render image onto `<canvas id="color-preview-canvas">`
```
*Guaranteed Invariant*: Persisted project state, revision number, transaction journal, and active delivery remain **100% untouched** during preview.

### 3.2 Hold-to-Compare Data Flow
```
User presses & holds "Compare Original" (or holds 'C' key)
   │
   ▼
UI temporarily bypasses graded canvas display:
   ├── Sets canvas image to raw ungraded source frame
   └── Displays "COMPARING (ORIGINAL)" indicator
   │
User releases mouse button / key (or focus is lost)
   │
   ▼
UI immediately restores graded canvas display (`state.colorDraft` preview)
```
*Guaranteed Invariant*: Switching modes is purely presentation-layer; zero network requests, zero mutations.

### 3.3 Transactional Apply & Delivery Publication Flow
```
User clicks "Apply Grade"
   │
   ▼
UI validates current project revision:
   ├── Checks `state.project.revision === state.baseRevision`
   └── Dispatches POST /api/project/operation:
       {
         type: "attach_color_grade" | "adjust_color_params",
         expectedBaseRevision: state.project.revision,
         params: { clipId, grade: state.colorDraft }
       }
   │
   ▼
OperationExecutor (src/engine/operations.js):
   ├── Deep-clones project state
   ├── Verifies track lock and parameter bounds
   ├── Computes exact inverse operation
   ├── Advances revision atomically (rev N -> N+1)
   └── Commits to project state
   │
   ▼
RenderOrchestrator & FFmpeg Compiler:
   ├── Compiles canonical grade to 3D `.cube` LUT
   ├── Renders delivery file via FFmpeg `lut3d=file=...:interp=tetrahedral`
   ├── Runs Media QA (codec, clipping, duration, parity)
   └── Generates deliverable manifest with output SHA-256
   │
   ▼
Active Delivery Promotion:
   ├── ONLY on 100% QA pass: Updates `active_delivery` pointer
   └── On failure: Rolls back project state, keeps previous delivery active
```

---

## 4. API Contract & Endpoint Decision

### 4.1 Route Decision
We introduce `POST /api/color/preview` as the dedicated Visual Control Surface preview contract:
- **Rationale**: Isolates ephemeral draft rendering from persisted state endpoints (`/api/color-grade/save` or `/api/project/operation`).
- **Compatibility**: Retains existing `GET /api/color-grade` for initial grade inspection. `/api/preview/frame` remains untouched for generic frame inspection.

### 4.2 Endpoint Specification: `POST /api/color/preview`
- **Request Envelope**:
  ```json
  {
    "projectId": "proj_demo",
    "clipId": "clip_main_v1",
    "mediaPath": "assets/shot4_runner.jpg",
    "frameTick": 0,
    "requestId": "req_1718901234_abc",
    "draftVersion": 4,
    "grade": {
      "id": "grade_draft",
      "schemaVersion": "1.0.0",
      "exposure": 0.5,
      "whiteBalance": { "temperature": 0.2, "tint": 0.0 },
      "primary": { "lift": [0,0,0], "gamma": [1,1,1], "gain": [1,1,1], "offset": [0,0,0] },
      "lut": { "enabled": true, "lutId": "warm_golden", "intensity": 0.8, "interpolation": "tetrahedral" }
    }
  }
  ```
- **Response Envelope (Success 200)**:
  ```json
  {
    "success": true,
    "requestId": "req_1718901234_abc",
    "draftVersion": 4,
    "frameTick": 0,
    "gradeHash": "a1b2c3d4e5f6...",
    "previewDataUri": "data:image/jpeg;base64,...",
    "executionMs": 14.2
  }
  ```
- **Response Envelope (Validation Error 400)**:
  ```json
  {
    "success": false,
    "requestId": "req_1718901234_abc",
    "draftVersion": 4,
    "errorCode": "ERR_PARAM_OUT_OF_BOUNDS",
    "error": "exposure must be finite number in [-6.0, 6.0], got 12.0"
  }
  ```

---

## 5. State Ownership & Invariant Boundaries

| State Item | Authoritative Owner | Mutation Path | Lifecycle & Rules |
| :--- | :--- | :--- | :--- |
| **In-Progress Grade Draft** | Visual Control Surface (`state.colorDraft`) | UI slider drag / LUT select | **Ephemeral**: Discarded on Cancel, clip switch, or panel close. Never committed to project file. |
| **Persisted Project Grade** | `ProjectManager` / `this.currentProject` | `OperationExecutor.execute()` | **Authoritative**: Mutated only upon explicit user Apply. Increments revision monotonically. |
| **Project Revision & Locks** | EME Engine (`candidate.revision`) | `OperationExecutor` | Enforces `expectedBaseRevision` and track lock (`TRACK_LOCKED`). |
| **Preview Job Execution** | Backend Preview Service | Worker thread / CPU buffer | Stateless and read-only. Responses correlated by `requestId`. |
| **Undo / Redo Stack** | `OperationExecutor` / `this.undoStack` | Inverse operation execution | **Engine-owned**: UI has zero client-side undo stacks. |
| **Final Render Delivery** | `RenderOrchestrator` / `JobManager` | FFmpeg compile & render | Stored in `artifacts/deliverables/`. Requires QA verification before publishing. |
| **Active Delivery Pointer** | `RevisionSession` / Session JSON | `RevisionSessionManager` | Points strictly to the latest verified delivery. Preserved on render failure. |

---

## 6. Gap Analysis

| Requirement | Existing Code / Symbol | Gap Identified | Remediation Plan (Stage 2B–2D) |
| :--- | :--- | :--- | :--- |
| **Real Color Preview** | `updateLiveGradePreview()` in `app.js` | Uses CSS filter `brightness() contrast()`. Does not evaluate 3D LUTs, curves, or HSL. | Replace with `<canvas>` preview fed by `POST /api/color/preview`. |
| **Preview API Endpoint** | None in `src/ui/server.js` | Only `POST /api/color-grade/save` exists, which commits immediately. | Implement `POST /api/color/preview` returning graded JPEG/PNG buffers. |
| **Stale Response Guard** | None in `app.js` | Network latency could cause older preview to overwrite newer slider position. | Implement `latestRequestId` and monotonic `draftVersion` check in UI. |
| **Hold-to-Compare** | None | No UI toggle between graded and original frame. | Add `#cg-btn-compare` with `mousedown`/`mouseup`, `touchstart`/`touchend`, and `Space`/`C` keydown/keyup bindings. |
| **Certified LUT UI Selector** | `#cg-lut-select` in `index.html` | Lists uncertified LUTs and arbitrary paths. | Restructure to strictly list the 5 certified LUT IDs (`bleach_bypass`, `warm_golden`, `teal_orange`, `cinematic_contrast`, `true_tone`). |
| **Transactional Apply/Cancel** | `saveColorGrade()` in `app.js` | Directly attaches grade without checking `expectedBaseRevision`. | Wire to `OperationExecutor` with `expectedBaseRevision`, and provide explicit "Cancel" button to discard draft. |

---

## 7. Concurrency, Race Condition & Failure Analysis

1. **Rapid Slider Dragging (Backpressure)**:
   - *Issue*: User drags exposure slider rapidly, firing 30 events/sec.
   - *Mitigation*: Debounce requests by 60ms; client aborts prior `fetch` using `AbortController`; backend queues at most 1 in-flight preview per session.
2. **Out-of-Order Network Responses**:
   - *Issue*: Request #3 (fast) returns after Request #4 (slow).
   - *Mitigation*: Client checks `if (data.draftVersion < state.colorDraft.version) return;`. Discards stale previews.
3. **Clip Switching during In-Flight Preview**:
   - *Issue*: User previews Clip A, immediately clicks Clip B; Clip A's preview arrives and displays on Clip B.
   - *Mitigation*: Client checks `if (data.clipId !== state.selectedClipId) return;`.
4. **Stale Revision Conflict on Apply**:
   - *Issue*: Project revision changed in another window or background process.
   - *Mitigation*: `expectedBaseRevision` check in `OperationExecutor` fails closed with `STALE_REVISION`; UI alerts user and reloads canonical project state without clobbering.
5. **Render Failure Isolation**:
   - *Issue*: FFmpeg process crashes or runs out of disk during export.
   - *Mitigation*: Render failure is caught; project state rolls back; `active_delivery` pointer remains anchored to the previous verified revision.

---

## 8. Risk Register

| Risk ID | Description | Likelihood / Impact | Mitigation Strategy | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **R-1** | Slider drag lag / queue overflow | Medium / Medium | 60ms client debounce + AbortController request cancellation. | `test('Rapid slider scrubbing drops obsolete requests')` |
| **R-2** | Stale preview overwriting newer slider position | High / High | Monotonic `draftVersion` and `requestId` correlation in UI. | `test('Stale preview response is safely discarded')` |
| **R-3** | Preview vs. Final Render mathematical drift | Low / Critical | Both preview and FFmpeg compiler derive from canonical `color-operations.js`. | `test('Preview and FFmpeg render CIE76 Delta E < 0.85')` |
| **R-4** | Accidental mutation on preview cancel | Medium / High | Draft state is isolated in `state.colorDraft`; Cancel simply restores persisted grade. | `test('Cancelling preview preserves project revision bit-for-bit')` |

---

## 9. Implementation Sequence (Stage 2B $\to$ 2F)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Visual Control Surface (app.js)
    participant Svr as UI Server (server.js)
    participant Eng as Engine (OperationExecutor)
    participant Rnd as FFmpeg Compiler & QA

    Note over User,UI: Stage 2B/2C: Interactive Preview & Draft
    User->>UI: Adjusts Exposure slider / selects LUT
    UI->>UI: Updates state.colorDraft (version + 1)
    UI->>Svr: POST /api/color/preview (draftGrade, draftVersion)
    Svr->>Svr: Grades frame buffer (non-mutating)
    Svr-->>UI: Returns Base64 JPEG + draftVersion
    UI->>UI: Verifies draftVersion matches latest; renders on Canvas

    Note over User,UI: Hold-to-Compare
    User->>UI: Holds "Compare Original" (mousedown / keydown 'C')
    UI->>UI: Displays ungraded source frame
    User->>UI: Releases button
    UI->>UI: Restores draft graded preview

    Note over User,Rnd: Stage 2D: Transactional Apply & Stage 2E: Delivery
    User->>UI: Clicks "Apply Grade"
    UI->>Svr: POST /api/project/operation (attach_color_grade, expectedBaseRevision)
    Svr->>Eng: OperationExecutor.execute(candidate, op)
    Eng->>Eng: Validates bounds & locks; records inverse; increments rev (N -> N+1)
    Eng-->>Svr: Success, committed revision N+1
    Svr->>Rnd: Compiles .cube & renders via FFmpeg lut3d
    Rnd->>Rnd: Runs Media QA (checksums, video parity)
    Rnd-->>Svr: QA Passed -> Updates active_delivery
    Svr-->>UI: Returns { success: true, revision: N+1, activeDelivery }
    UI->>UI: Synchronizes project state; clears draft indicator
```

### Milestone Sub-Stage Breakdown:
1. **Stage 2B (Preview Integration)**:
   - Implement `POST /api/color/preview` in `src/ui/server.js`.
   - Update `src/ui/public/app.js` with canvas rendering, request cancellation, and draft state isolation.
2. **Stage 2C (Schema-Backed UI Controls)**:
   - Update `src/ui/public/index.html` with certified LUT selector and Hold-to-Compare button.
   - Bind all sliders (exposure, WB, LGGO, curves, HSL, skin protection) to schema bounds.
3. **Stage 2D (Transactional Apply, Cancel, Undo, Redo)**:
   - Wire Apply button to `POST /api/project/operation`.
   - Wire Cancel button to discard draft.
   - Wire UI Undo/Redo buttons to `/api/project/undo` and `/api/project/redo`.
4. **Stage 2E (End-to-End Delivery Verification)**:
   - Build automated test verifying preview $\to$ Apply $\to$ FFmpeg render $\to$ QA $\to$ active delivery manifest.
   - Re-verify CIE76 $\Delta E_{ab}^*$ parity metric on rendered delivery.
5. **Stage 2F (Regression & Certification Report)**:
   - Execute full test suite (all 374+ tests passing).
   - Author `plans/PHASE_17_STAGE2_COMPLETION_REPORT.md`.

---

## 10. Stage 2A Exit Gate Determination

All required sections of Stage 2A are completed and verified:
- Actual repository state inspected and documented.
- Exact integration points in `src/ui/server.js` and `src/ui/public/app.js` isolated.
- Non-mutating preview contract and hold-to-compare interaction specified.
- Concurrency, race condition, and failure isolation mitigations codified.

**Recommendation**: **STAGE 2A COMPLETE — READY FOR STAGE 2B/2C IMPLEMENTATION AUTHORIZATION**.
