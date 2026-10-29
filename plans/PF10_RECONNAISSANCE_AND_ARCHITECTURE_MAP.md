# EME Phase PF-10: Repository Reconnaissance & Proposed Component/Service Architecture Map

**Document Version:** 1.0.0  
**Date:** 2026-10-19  
**Milestone:** Phase PF-10: Timeline UI Surface Integration & Multi-Revision Visual Inspection  
**Authoritative Reference:** ChatGPT PF-10 Directive (`plans/CHATGPT_PHASE_PF10_DIRECTIVE.md`)  
**Status:** Architecture Review Proposal (Prior to Large-Scale Implementation)  

---

## 1. Executive Summary & Intent

Phase **PF-10** transitions the certified backend foundation (**PF-09 Conversational Revision Sessions**, **PF-08 Preference Evaluation**, **PF-07 Multi-Variant Candidates**, **PF-06 Iterative Revision**, **PF-04 Closed-Loop QA**) into an integrated, professional editing workstation UI.

### Core Architectural Mandate
> **"The timeline UI must display the truth established by the engine—not become another place where planning, execution, or verification logic is implemented. The timeline, revision history, preview monitor, and active delivery must all agree on the same authoritative engine state."**

---

## 2. Repository Reconnaissance

A comprehensive audit of existing codebase assets reveals the current state and integration surface:

### 2.1. Backend Service Layer (`src/ui/server.js`)
- **Current Capability**: Runs a native Node.js HTTP server on port 4321, serving static assets from `src/ui/public` and providing REST endpoints for project operations, render, QA, and media streaming.
- **Media Streaming**: `/api/media?path=...` is already implemented with full HTTP 206 byte-range seeking, MIME detection (`.mp4`, `.webm`, `.mov`, `.wav`), and path traversal sandboxing via `assertSafePath`.
- **Existing Missing Endpoints**:
  - No endpoints currently interface with `RevisionSessionManager` (`src/prompt-core/revision-session.js`).
  - No candidate set retrieval or selection endpoints interfacing with `CandidateOrchestrator`.
  - In-memory undo/redo stack in `EditorBackend` only tracks linear project objects, rather than driving `RevisionSessionManager.undo()` and `redo()`.

### 2.2. Timeline Projection Adapter (`src/engine/timeline-adapter.js`)
- **Current Capability**: Pure functional engine that projects canonical `eme-project.v1` objects into view models (`TimelineAdapter.projectToTimelineView`).
- **Precision**: Implements exact tick-to-pixel conversions (`TICKS_PER_SECOND = 120,000`, `basePps = 100`, `pixelsPerTick = (basePps * zoom) / 120,000`).
- **Integrity**: Perfectly preserves half-open intervals `[startTick, startTick + durationTicks)` and track `zIndex` hierarchies.

### 2.3. Frontend Workspace Surface (`src/ui/public/`)
- **Layout**: CapCut-grade dark editing layout (`index.html`, `index.css`, `app.js`).
- **Preview Area**: Currently renders CSS DOM div representations of clips rather than playing the actual physical deliverable MP4 via `/api/media`.
- **Inspector Tabs**: Has "Properties", "Color Grade", and "QA Audit" tabs, but lacks a dedicated "Revisions & Diff" panel and "Candidate Comparison" surface.

---

## 3. Proposed Component & Service Architecture Map

```
+--------------------------------------------------------------------------------------------------+
|                                    EME Studio UI (Browser)                                       |
|                                                                                                  |
|  +--------------------+  +-----------------------------+  +------------------------------------+ |
|  |   Header Toolbar   |  |     Live Preview Player     |  |       Inspector & Control Panel     | |
|  | - Session Status   |  | - Native <video> Player     |  | - [Tab 1] Conversational Revision  | |
|  | - Rev ID / Version |  | - Delivery Verification Tag |  | - [Tab 2] Revision History DAG     | |
|  | - Undo / Redo      |  | - Timecode / Playhead Sync  |  | - [Tab 3] Candidate Comparison     | |
|  | - Crash Recovery   |  | - Manifest ID & SHA-256     |  | - [Tab 4] Properties & QA Audit    | |
|  +--------------------+  +-----------------------------+  +------------------------------------+ |
|                                                                                                  |
|  +---------------------------------------------------------------------------------------------+ |
|  |                        Multitrack Timeline Surface (Canvas / DOM)                           | |
|  | - SMPTE Ruler & Sub-millisecond Playhead                                                     | |
|  | - Visual Tracks (Video, B-Roll, Graphics/Titles) & Audio Track                              | |
|  | - Half-Open Interval Clip Bounds [startTick, startTick + durationTicks)                      | |
|  | - Read-Only Truth Projection from TimelineAdapter                                           | |
|  +---------------------------------------------------------------------------------------------+ |
+--------------------------------------------------------------------------------------------------+
                                                |  HTTP REST / Streaming (Port 4321)
                                                v
+--------------------------------------------------------------------------------------------------+
|                                  Backend Service (src/ui/server.js)                              |
|                                                                                                  |
|   /api/session               /api/session/revise         /api/session/undo & redo                |
|   /api/session/init          /api/session/diff           /api/session/recover                    |
|   /api/candidates            /api/session/select         /api/media (Byte-Range Stream)          |
+--------------------------------------------------------------------------------------------------+
                                                |
                                                v
+--------------------------------------------------------------------------------------------------+
|                                Canonical Engine Subsystems (Core)                               |
|                                                                                                  |
|   RevisionSessionManager       CandidateOrchestrator      RevisionOrchestrator                   |
|   (src/prompt-core/            (src/prompt-core/          (src/prompt-core/                      |
|    revision-session.js)         candidate-orchestrator)    revision-orchestrator)                |
|                                                                                                  |
|   TimelineAdapter              QualityAssuranceEngine     RenderOrchestrator                     |
|   (src/engine/                 (src/renderers/            (src/prompt-core/                      |
|    timeline-adapter.js)         qa-engine.js)              render-orchestrator.js)               |
+--------------------------------------------------------------------------------------------------+
```

---

## 4. Detailed Component Specifications

### 4.1. Component 1: Authoritative Preview Monitor (`PreviewPlayer`)
- **Contract**: The monitor plays the actual engine-rendered MP4 artifact streamed from `/api/media?path=<absolute_path>`.
- **Truth Invariant**: Never display an active tag on an unverified render.
- **Visual Status Badges**:
  - `🟢 ACTIVE DELIVERY` (Current certified baseline deliverable)
  - `🟡 VERIFYING / IN-FLIGHT` (Closed-loop QA or render executing)
  - `🔴 REVISION FAILED` (Prior delivery remains active; failure reason displayed)
  - `⚪ SUPERSEDED REVISION` (Historical revision being previewed in read-only mode)
- **Metadata Readout**: Revision ID (`rev-1`), Manifest ID (`manifest-ce35...`), Media SHA-256 (first 16 hex chars), Resolution, FPS.

### 4.2. Component 2: Conversational Revision Panel (`RevisionPanel`)
- **Natural Language Input**: Textarea for revision prompts (e.g., *"Move the headline title 2 seconds later, keep duration unchanged"*).
- **Compiler Feedback Display**:
  - **Parsed Intent**: Explicit changes detected by `RevisionIntentCompiler`.
  - **Preserved Constraints**: Unaltered brief invariants and timeline anchors.
  - **Conflict Warnings**: Instant alert if a request violates hard invariants.
- **Action Control**: Single `Apply Revision` button triggering optimistic concurrency revision with version check (`expectedVersion`).

### 4.3. Component 3: Multi-Revision History DAG & Diff Inspector (`HistoryDiffView`)
- **Revision Tree**: Interactive list of all committed, failed, and active revisions in `session.history`.
- **Structured Diff View**:
  - Modified clips with before/after tick offsets and duration deltas.
  - Added/removed operations.
  - Derived changes vs direct user requests.
- **Safe Inspection Mode**: Clicking a prior revision (e.g., `rev-0`) loads its project snapshot into the timeline and its MP4 into the preview monitor in read-only inspection mode without modifying `session.active_delivery`.

### 4.4. Component 4: Candidate Comparison & Selection Surface (`CandidateGrid`)
- **Profile Cards**: Side-by-side cards for `cand-dynamic`, `cand-cinematic`, `cand-editorial`.
- **Metrics Displayed**:
  - Candidate ID and profile name.
  - QA verification score (`100/100 PASS`).
  - Musical alignment composite score and rank (`Rank #1 [0.88]`).
  - Variation parameters (transition type, cut frequency, typographic pacing).
- **Selection Action**: `Select Candidate` button that calls `RevisionSessionManager.bindSelectedCandidate`, publishing the selected delivery run and updating session state to `ready`.

### 4.5. Component 5: Header Controls & Crash Recovery (`SessionHeader`)
- **Undo / Redo Buttons**: Wired directly to `POST /api/session/undo` and `POST /api/session/redo`.
  - Buttons disabled when corresponding stack is empty.
  - Redo stack invalidated upon new branch revision commit.
- **Crash Recovery Indicator**: If `session.recovery.status === 'in_flight'` or `checkpoint_path` exists, a prominent `⚠️ Crash Recovery Required` badge appears with an idempotent `Restore Last Verified Delivery` action.

---

## 5. Implementation Roadmap & Milestones

Following ChatGPT's recommended sequence:
1. **Stage 1 — Backend Session Endpoints (`src/ui/server.js`)**: Expose full session lifecycle, candidate sets, and revision diffing endpoints without modifying canonical schemas.
2. **Stage 2 — Preview Monitor & Verification Status**: Implement native video player with streaming media identity, status badges, and transport sync.
3. **Stage 3 — Multi-Revision History & Diff Viewer**: Implement history list and property diffing from authoritative project snapshots.
4. **Stage 4 — Candidate Comparison & Selection**: Implement candidate comparison surface with playback and selection binding.
5. **Stage 5 — Conversational Revision Panel**: Implement natural-language revision interface with intent/constraint display.
6. **Stage 6 — Undo/Redo & Recovery Controls**: Connect top-level controls to session DAG semantics.
7. **Stage 7 — Testing & Verification Battery**: Author unit tests (`tests/ui-timeline-adapter.test.js`, `tests/ui-server-session.test.js`) and visual/behavioral certification.

---

## 6. Acceptance Gates
1. The timeline renders authoritative project data accurately (zero duplicate math).
2. All mutations route strictly through `OperationExecutor` and `RevisionSessionManager`.
3. Preview identity and verification status are 100% truthful; unverified media never appears active.
4. Candidate selection binds the exact verified candidate and manifest.
5. Revision diffs are computed from actual project snapshots.
6. Undo/redo and crash recovery preserve PF-09 invariants.
7. Stale and concurrent updates fail safely.
8. Regression test suite remains 100% green (50/50 tests passing).
