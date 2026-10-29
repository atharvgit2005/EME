# EME Phase 18: Stage 18.0 — Repository Audit, Baseline & Integration Contract (TL-01)

**Milestone**: TL-01 / Phase 18  
**Document**: `plans/PHASE_18_STAGE0_INTEGRATION_AUDIT.md`  
**Date**: October 20, 2026  
**Status**: SUBMITTED FOR CHATGPT ARCHITECTURE REVIEW  
**Architecture Owner**: ChatGPT Architecture Lead  
**Working Commit**: `08ef2811c7eeb7f05d591f67b7e04ba0ade818ad` (Tag: `phase-17-stage2-certified`)  

---

## 1. Executive Summary

In compliance with the **ChatGPT Architecture Kickoff Directive** (`plans/CHATGPT_PHASE18_KICKOFF_DIRECTIVE.md`), this document provides an exhaustive, code-grounded audit of the existing Editing Mechanics Engine (EME) and Visual Control Surface codebase prior to executing interactive editing changes.

The central architecture invariant established by ChatGPT for Phase 18 is:
> **"The UI owns transient interaction state; the engine owns canonical project state and every committed edit."**

This audit traces the complete data path from canonical JSON project models to interactive UI coordinates, classifies transient vs. persistent state, documents every operation contract, records empirical performance baselines on 1,000-clip fixtures, and details concrete coverage gaps and risks before Stage 18.1 kickoff.

---

## 2. Exact Source Paths & Code Symbols Involved

| Component Subsystem | Absolute / Relative Path | Key Symbols & Responsibilities |
| :--- | :--- | :--- |
| **Atomic Operation Engine** | `src/engine/operations.js` | `OperationExecutor.execute()`: Deep-clone atomicity, monotonic revision incrementing, `expectedBaseRevision` validation, track lock enforcement via `_assertTrackNotLocked()`, inverse-operation generation. |
| **Operation Implementations** | `src/engine/operations.js` | `_opInsertClip`, `_opTrimClip`, `_opMoveClip`, `_opSplitClip`, `_opDeleteClip`, `_opReorderTracks`, `_opRippleDelete`, `_opRippleTrim`, `_opSlipClip`, `_opSlideClip`, `_opSetTrackState`, `_updateProjectDuration`. |
| **Project Model & Validation** | `src/engine/project.js` | `ProjectManager.validateProject()`: Schema validation against `schema/eme-project.v1.schema.json`, half-open interval checking `[start, end)`, collision detection on identical tracks, audio volume envelope bounds checking. |
| **Canonical Timebase** | `src/engine/time.js` | `TICKS_PER_SECOND = 120000`, `MediaTime.secondsToTicks()`, `MediaTime.ticksToSeconds()`, `MediaTime.microsecondsToTicks()`, `MediaTime.ticksToMicroseconds()`, `MediaTime.intervalsOverlap()`. |
| **Timeline View Adapter** | `src/engine/timeline-adapter.js` | `TimelineAdapter.projectToTimelineView()`: View projection (tick to pixel mapping at constant 100 base pps), SMPTE timecode formatting `formatTimecode()`, magnetic snapping `computeMagneticSnap()`, CapCut draft import `importCapCutDraft()`. |
| **UI Server & API Endpoints** | `src/ui/server.js` | `EditorBackend`: Routes `/api/timeline` (GET), `/api/project/operation` (POST), `/api/project/undo` (POST), `/api/project/redo` (POST), `/api/project` (GET), `/api/capcut/import` (POST). |
| **Visual Control Surface UI** | `src/ui/public/app.js` | `setupTimelineInteractions()`: Mousedown/move/up event handlers, transient drag state (`state.dragState`), ruler scrubbing, blade cut, magnetic snap guide overlay, `dispatchOperation()`, `renderTimeline()`. |
| **UI DOM & Layout** | `src/ui/public/index.html` | Multitrack container (`#timeline-container`), lanes (`#timeline-track-lanes`), ruler (`#timeline-ruler`), playhead (`#timeline-playhead`), snap guide (`#timeline-snap-guide`), track headers (`#track-header-list`), action toolbar (`#timeline-toolbar`). |
| **Timeline Test Suites** | `tests/timeline-operations.test.js`<br>`tests/timeline-e2e.test.js` | 11 unit, integration, benchmark, and stress tests covering compound operations, CapCut round-trips, transaction throughput, and 1,000-clip latency. |

---

## 3. Current-State Data-Flow Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User as User Pointer / Hotkey
    participant DOM as Browser DOM (app.js)
    participant State as Transient UI State
    participant Backend as EditorBackend (server.js)
    participant Engine as OperationExecutor (operations.js)
    participant Adapter as TimelineAdapter (timeline-adapter.js)
    participant Project as Canonical EME Project State

    User->>DOM: Pointer Drag / Handle Scrub
    DOM->>State: Update transient proposal (dragState, leftPx, snapGuide)
    Note over DOM,State: Zero Engine Mutations, Zero Revisions, Zero Latency Drift
    User->>DOM: Pointer Release (Gesture Complete)
    DOM->>Backend: POST /api/project/operation { operation, expectedBaseRevision }
    Backend->>Engine: OperationExecutor.execute(project, operation)
    Engine->>Engine: Validate expectedBaseRevision == project.revision
    Engine->>Engine: Check targetTrack.locked == false
    Engine->>Engine: Deep-clone candidate = structuredClone(project)
    Engine->>Engine: Apply deterministic operation & check track collisions
    Engine->>Engine: Validate candidate against JSON schema & intervals
    Engine->>Project: Commit candidate (revision = revision + 1)
    Engine->>Backend: Return { success: true, project, affectedIds }
    Backend->>Backend: Push previous state to undoStack; clear redoStack
    Backend-->>DOM: 200 OK { project, revision, canUndo, canRedo }
    DOM->>Adapter: TimelineAdapter.projectToTimelineView(project, viewState)
    Adapter-->>DOM: Authoritative display projection (pixelsPerTick, clips, tracks)
    DOM->>DOM: Authoritative reconciliation (renderTimeline, clear dragState)
```

---

## 4. Existing Route & Operation Contracts

### 4.1 Backend REST Routes (`src/ui/server.js`)

| Route | Method | Payload / Query | Response Structure | Concurrency & Invariants |
| :--- | :---: | :--- | :--- | :--- |
| `/api/project` | `GET` | `?path=<filePath>` | `200 OK { path, project, canUndo, canRedo }` | Loads project via `ProjectManager.loadProject()`. Clears undo/redo stacks. |
| `/api/timeline` | `GET` | `?zoom=1.0&playhead=0&selectedClipId=...` | `200 OK { success: true, timeline, revisionId }` | Read-only projection via `TimelineAdapter`. Does not mutate project or increment revision. |
| `/api/project/operation` | `POST` | `{ operation: { type, params, expectedBaseRevision } }` | `200 OK { success, project, affectedIds, revision, canUndo, canRedo }` | Validates `expectedBaseRevision`. Enforces atomicity. Returns `409 Conflict` on stale revision. |
| `/api/project/undo` | `POST` | `{}` | `200 OK { success, project, canUndo, canRedo }` | Pops previous project from `undoStack`, pushes current to `redoStack`. Assigns monotonic revision (`prev.revision = current.revision + 1`). |
| `/api/project/redo` | `POST` | `{}` | `200 OK { success, project, canUndo, canRedo }` | Pops from `redoStack`, pushes to `undoStack`. Assigns monotonic revision (`next.revision = current.revision + 1`). |
| `/api/capcut/import` | `POST` | `{ draftInfo: { ... } }` | `200 OK { success: true, project }` | Converts microsecond timings to 120,000 integer ticks without floating-point seconds. |

---

## 5. Operation-by-Operation Engine Contract Table

Every operation executed via `OperationExecutor.execute(project, operation)` guarantees:
1. **Atomicity**: Zero partial mutation on validation failure (`structuredClone` candidate pattern).
2. **Track Lock Protection**: Throws `TRACK_LOCKED` (`400 Bad Request`) if target track is locked.
3. **Collision Invariant**: Rejects overlaps on same track with `TRACK_COLLISION`.
4. **Timebase & Range Semantics**: Strict half-open intervals `[startTick, startTick + durationTicks)`.

| Operation Type | Parameter Schema (`params`) | Pre-Conditions & Invariants | Post-Conditions & Side Effects | Inverse Operation (Undo) |
| :--- | :--- | :--- | :--- | :--- |
| `insert_clip` | `id, trackId, type, startTick, durationTicks, [source], [transform]` | Target track exists and `!locked`. Clip type matches track kind (visual vs audio). `durationTicks > 0`. No collision with existing clips on `trackId`. | New clip added to `candidate.clips`. Affected: `[id]`. | `delete_clip { clipId: id }` |
| `trim_clip` | `clipId, [newDurationTicks], [trimInTick], [trimOutTick]` | Clip exists and `!track.locked`. `newDurationTicks > 0`. If trims specified: `trimInTick >= 0` and `trimOutTick > trimInTick`. | Adjusts clip `durationTicks` and/or `source.trimInTick`, `source.trimOutTick`. Preserves timeline `startTick`. | Restore previous `durationTicks` and `source` trims. |
| `move_clip` | `clipId, targetTick (or newStartTick), [targetTrackId]` | Clip exists. Current track and target track `!locked`. `targetTick >= 0`. Destination track has no collision over `[targetTick, targetTick + durationTicks)`. | `clip.startTick = targetTick`, `clip.trackId = targetTrackId`. Clip source range and duration preserved. | `move_clip { clipId, targetTick: oldStart, targetTrackId: oldTrack }` |
| `split_clip` | `clipId, splitTick, [newClipId]` | Clip exists and `!track.locked`. `splitTick` strictly within clip bounds: `startTick < splitTick < startTick + durationTicks`. `newClipId` unique. | Shrinks original clip to `[startTick, splitTick)`. Appends new clip spanning `[splitTick, oldEnd)`. Source trims cleanly partitioned with zero duration gap. | Atomic compound: remove `newClipId`, restore `clipId` original duration and trimOutTick. |
| `delete_clip` | `clipId` | Clip exists and `!track.locked`. | Removes clip from `clips`. Cleans up linked keyframe animations. | `insert_clip` with original clip definition. |
| `ripple_delete` | `clipId` | Clip exists and `!track.locked`. | Removes clip. Identifies all subsequent clips on same track where `startTick >= oldEnd`. Shifts them left by `durationTicks`. Downstream project duration updated. | Re-insert deleted clip, shift downstream clips right by `durationTicks`. |
| `ripple_trim` | `clipId, edge ("start"\|"end"), deltaTicks, [rippleShiftDownstream]` | Clip exists and `!track.locked`. Resulting duration `> 0`. | If `end`: expands/contracts clip duration and source trimOut, shifts downstream clips on track by `deltaTicks`. If `start`: shifts clip start and adjusts trimIn; shifts downstream if enabled. | Inverse `ripple_trim` with `-deltaTicks`. |
| `slip_clip` | `clipId, deltaTicks` | Clip exists and `!track.locked`. Clip has source. New `trimInTick >= 0`. If asset duration known, `newTrimOutTick <= asset.durationTicks`. | Preserves clip timeline `startTick` and `durationTicks`. Adjusts `source.trimInTick` and `source.trimOutTick` by `deltaTicks`. | `slip_clip { clipId, deltaTicks: -deltaTicks }` |
| `slide_clip` | `clipId, deltaTicks` | Clip exists and `!track.locked`. If moving left (`deltaTicks < 0`), previous adjacent clip exists and duration `+ deltaTicks > 0`. If moving right, next adjacent clip exists and duration `- deltaTicks > 0`. | Slides clip timeline position by `deltaTicks`. Shrinks/expands adjacent neighboring clips to maintain seamless butting boundaries without gaps. Source ranges preserved. | `slide_clip { clipId, deltaTicks: -deltaTicks }` |
| `reorder_tracks` | `trackOrders: [{ trackId, zIndex }]` | All track IDs exist. `zIndex` values are integers. | Updates `track.zIndex`. | `reorder_tracks` with prior z-indices. |
| `set_track_state` | `trackId, [muted], [locked], [visible]` | Track exists. | Sets `track.muted`, `track.locked`, and/or `track.visible`. When `locked: true`, prevents future edits on that track. | `set_track_state` restoring previous boolean flags. |

---

## 6. UI vs. Engine State Separation Model

| State Variable | Physical Location | Persistence / Mutation Policy | Authority |
| :--- | :--- | :--- | :--- |
| **`playheadTick`** | `state.currentTick` (`app.js`) | Transient display state. Scrubbing updates playhead visual and timecode readout. **Zero project revisions created.** | UI / Viewport |
| **`zoom` & `scrollLeft`** | `state.zoom`, `dom.timelineTracksArea.scrollLeft` | Transient display state. Logarithmic zoom factor (0.05x to 8.0x). Zero project mutations. | UI / Viewport |
| **`selectedClipId`** | `state.selectedClipId` (`app.js`) | Transient selection state. Activates inspector panel and clip boundary highlights. | UI / Viewport |
| **`dragState` (Proposal)** | `state.dragState` (`app.js`) | Transient pointer proposal. Tracks `startX`, `origStartTick`, `deltaTicks`. Renders visual drag ghost and `#timeline-snap-guide`. **Zero engine calls during mousemove.** | UI / Viewport |
| **`activeTool`** | `state.activeTool` (`'select' \| 'blade' \| 'slip' \| 'slide' \| 'ripple'`) | Transient UI mode. Dictates pointer event interpretation on mousedown/mouseup. | UI / Viewport |
| **`project`** | `state.project` (`app.js`), `EditorBackend.currentProject` | Authoritative canonical EME project model. Monotonic integer `revision`. Updated only on validated engine operation commit. | Engine / Backend |
| **`undoStack` / `redoStack`** | `EditorBackend.undoStack`, `EditorBackend.redoStack` | Engine-owned transactional history. Monotonic revision guarantee across undo and redo. | Engine / Backend |
| **`active_delivery`** | `session.json` (`active_delivery.manifest_id`) | **Strictly isolated.** Timeline operations modify project revision state but never repoint or overwrite verified deliverables. | Pipeline / QA |

---

## 7. Empirical Baseline Measurements & Environment

All measurements taken on local developer environment:
- **OS**: macOS Darwin 24.6.0 (Apple Silicon arm64)
- **Node.js**: v20.x
- **Timebase**: 120,000 integer ticks / second
- **Git Commit**: `08ef2811c7eeb7f05d591f67b7e04ba0ade818ad`

### 7.1 Regression & Latency Benchmarks (`node --test tests/timeline-*.test.js`)

| Benchmark Test Metric | Sample Size / Conditions | Target Budget | Measured Baseline | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1,000-Clip View Projection Latency** | 1,000 clips, 10 tracks, 100 repetitions | P95 $\le$ 16.67 ms (60 FPS) | **P50: 0.08 ms, P95: 0.87 ms** | **PASS** |
| **1,000-Clip Magnetic Snap Latency** | 2,001 snap points (starts, ends, playhead), 100 reps | P95 $\le$ 1.50 ms | **P50: 0.067 ms, P95: 0.80 ms** | **PASS** |
| **1,000-Clip Transaction Throughput** | Deep clone, full semantic validation, collision check | P95 $\le$ 20.0 ms | **P50: 4.23 ms, P95: 6.82 ms** | **PASS** |
| **CapCut Rational Microsecond Roundtrip** | 1,000,000 $\mu$s $\leftrightarrow$ 120,000 ticks | 0 tick drift | **0 tick error (Exact integer)** | **PASS** |
| **Master Regression Suite** | 401 tests across all 17 completed milestones | 100% Pass | **401 / 401 PASS (83.0s)** | **PASS** |

---

## 8. Critical Findings & Identified Coverage Gaps

During our in-depth source inspection, 6 critical integration discrepancies and coverage gaps were discovered:

### Gap 1: Inconsistent Pixel-to-Tick Scaling between Adapter and Frontend
- **Issue**: `TimelineAdapter.js` defines `pixelsPerSecond = 100.0 * zoom` (constant temporal scale where 1 second = 100 px at 1.0x zoom). However, `app.js` (lines 1734, 2571, 2619) currently calculates `pixelsPerTick = (800 / totalTicks) * state.zoom`.
- **Impact**: In `app.js`, timeline scale shrinks dynamically if project duration increases (e.g. a 3s project has 266 px/sec, but a 30s project has 26.6 px/sec). This causes temporal distortion during zooming and scrubbing.
- **Remediation in Stage 18.1**: Standardize `app.js` to strictly use the constant PPS formula from `TimelineAdapter` (`pixelsPerTick = (100.0 * state.zoom) / 120000`), ensuring exact parity between client rendering and backend adapter responses.

### Gap 2: Dual Non-Atomic Operations for "Trim In" Gestures
- **Issue**: In `app.js` (lines 2691–2700), trimming a clip's In-point currently issues **two sequential asynchronous operations**: `move_clip` followed by `trim_clip`.
- **Impact**: Generates two project revisions, two history entries, and risks collision errors midway through the gesture.
- **Remediation in Stage 18.2**: Enhance `OperationExecutor._opTrimClip` to accept `trimInTick`, `newStartTick`, and `newDurationTicks` atomically in a single operation envelope, or map non-ripple trim-in to a unified atomic operation.

### Gap 3: Missing `expectedBaseRevision` Injection in Frontend `dispatchOperation`
- **Issue**: `src/ui/server.js` supports `expectedBaseRevision` optimistic locking, but `dispatchOperation` in `app.js` (line 826) does not automatically attach `expectedBaseRevision: state.project.revision` to outgoing requests.
- **Impact**: Race conditions or duplicate clicks are not caught by optimistic concurrency checks.
- **Remediation in Stage 18.3**: Update `dispatchOperation` to automatically inject `operation.expectedBaseRevision = state.project.revision`, guaranteeing fail-closed rejection (`409 Conflict`) on stale client states.

### Gap 4: Direct Mutation of `track.hidden` in UI
- **Issue**: `window.toggleTrackVisibility` in `app.js` (line 1149) mutates `track.hidden = !track.hidden` locally without dispatching `set_track_state`. Furthermore, the schema defines `track.visible` (boolean), not `track.hidden`.
- **Impact**: Local frontend mutation without engine synchronization or schema conformance.
- **Remediation in Stage 18.2**: Dispatch `set_track_state` with `{ trackId, visible: !track.visible }` and update headers from authoritative engine state.

### Gap 5: Keyboard Shortcut Collisions
- **Issue**: In `app.js`, `KeyC` is bound to `cropClip()` on line 711, while also being intercepted for Hold-to-Compare on line 639. Also, `isContentEditable` checks are missing on the general shortcut listener (line 670).
- **Impact**: Pressing `C` during color grading can trigger crop modal, and typing in contenteditable elements could fire timeline hotkeys.
- **Remediation in Stage 18.1**: Cleanly isolate tool shortcuts: bind Crop to `Shift+C`, reserve `C` strictly for Hold-to-Compare in color mode, and add `e.target.isContentEditable` protection to all hotkey handlers.

### Gap 6: Lack of Drag Ghosting / Proposal Cancellation
- **Issue**: Current pointer drag immediately moves the playhead or triggers operations on mouseup without an explicit "Cancel on Escape" mechanism or visual ghost rectangle.
- **Impact**: Users cannot abort an accidental drag.
- **Remediation in Stage 18.1**: Implement Escape key cancel handler (`keydown` Escape clears `state.dragState` and hides `#timeline-snap-guide` without dispatching).

---

## 9. Stage 18.0 Exit Gate & Verification Checklist

| Directive Requirement | Verification Method | Status |
| :--- | :--- | :---: |
| **Exact Source Paths & Symbols Documented** | Section 2 table citing actual file paths and exported classes | **VERIFIED** |
| **Existing Route & Operation Contracts Established** | Section 4 and Section 5 detailed contract tables | **VERIFIED** |
| **Current Data-Flow Diagram Authored** | Section 3 Mermaid sequence diagram | **VERIFIED** |
| **Transient vs. Persistent State Classified** | Section 6 state ownership matrix | **VERIFIED** |
| **Empirical Baselines Measured** | Section 7: 1,000-clip view projection (0.87ms P95), snapping (0.80ms P95), transactions (6.82ms P95) | **VERIFIED** |
| **Master Regression Health Confirmed** | 401 / 401 tests passing (`npm test` in 83s) | **VERIFIED** |
| **Coverage Gaps & Discrepancies Identified** | Section 8: 6 concrete issues documented with remediation plans | **VERIFIED** |
| **Non-Destructive Invariants Preserved** | `schema/eme-project.v1.schema.json` unmodified, VTSM sidecar isolated, Laya canary advisory | **VERIFIED** |

---

## 10. Next Immediate Action

Submit this audit report (`plans/PHASE_18_STAGE0_INTEGRATION_AUDIT.md`) to the ChatGPT Architecture Lead via the Ezra Bridge for formal review and authorization to proceed to **Stage 18.1 (Timeline Visual Surface, Scrubbing & Transient Interaction State)**.
