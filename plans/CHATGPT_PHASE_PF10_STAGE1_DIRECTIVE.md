Pasted text(20261019-100957).txt
Document
### EME Engineering Report: Phase PF-10 Repository Reconnaissance & Component/Service Architecture Map

# EME Phase PF-10: Repository Reconnaissance & Proposed Component/Service Architecture Map

**Document Version:** 1.0.0  
**Date:** 2026-10-19  
**Milestone:** Phase PF-10: Timeline UI Surface Integration & Multi-Revision Visual Inspection  
**Authoritative Reference:** ChatGPT PF-10 Directive (plans/CHATGPT_PHASE_PF10_DIRECTIVE.md)  
**Status:** Architecture Review Proposal (Prior to Large-Scale Implementation)  

---

## 1. Executive Summary & Intent

Phase **PF-10** transitions the certified backend foundation (**PF-09 Conversational Revision Sessions**, **PF-08 Preference Evaluation**, **PF-07 Multi-Variant Candidates**, **PF-06 Iterative Revision**, **PF-04 Closed-Loop QA**) into an integrated, professional editing workstation UI.

### Core Architectural Mandate
> **"The timeline UI must display the truth established by the engine—not become another place where planning, execution, or verification logic is implemented. The timeline, revision history, preview monitor, and active delivery must all agree on the same authoritative engine state."**

---

## 2. Repository Reconnaissance

A comprehensive audit of existing codebase assets reveals the current state and integration surface:

### 2.1. Backend Service Layer (src/ui/server.js)
- **Current Capability**: Runs a native Node.js HTTP server on port 4321, serving static assets from src/ui/public and providing REST endpoints for project operations, render, QA, and media streaming.
- **Media Streaming**: /api/media?path=... is already implemented with full HTTP 206 byte-range seeking, MIME detection (.mp4, .webm, .mov, .wav), and path traversal sandboxing via assertSafePath.
- **Existing Missing Endpoints**:
  - No endpoints currently interface with RevisionSessionManager (src/prompt-core/revision-session.js).
  - No candidate set retrieval or selection endpoints interfacing with CandidateOrchestrator.
  - In-memory undo/redo stack in EditorBackend only tracks linear project objects, rather than driving RevisionSessionManager.undo() and redo().

### 2.2. Timeline Projection Adapter (src/engine/timeline-adapter.js)
- **Current Capability**: Pure functional engine that projects canonical eme-project.v1 objects into view models (TimelineAdapter.projectToTimelineView).
- **Precision**: Implements exact tick-to-pixel conversions (TICKS_PER_SECOND = 120,000, basePps = 100, pixelsPerTick = (basePps * zoom) / 120,000).
- **Integrity**: Perfectly preserves half-open intervals [startTick, startTick + durationTicks) and track zIndex hierarchies.

### 2.3. Frontend Workspace Surface (src/ui/public/)
- **Layout**: CapCut-grade dark editing layout (index.html, index.css, app.js).
- **Preview Area**: Currently renders CSS DOM div representations of clips rather than playing the actual physical deliverable MP4 via /api/media.
- **Inspector Tabs**: Has "Properties", "Color Grade", and "QA Audit" tabs, but lacks a dedicated "Revisions & Diff" panel and "Candidate Comparison" surface.

---

## 3. Proposed Component & Service Architecture Map


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


---

## 4. Detailed Component Specifications

### 4.1. Component 1: Authoritative Preview Monitor (PreviewPlayer)
- **Contract**: The monitor plays the actual engine-rendered MP4 artifact streamed from /api/media?path=<absolute_path>.
- **Truth Invariant**: Never display an active tag on an unverified render.
- **Visual Status Badges**:
  - 🟢 ACTIVE DELIVERY (Current certified baseline deliverable)
  - 🟡 VERIFYING / IN-FLIGHT (Closed-loop QA or render executing)
  - 🔴 REVISION FAILED (Prior delivery remains active; failure reason displayed)
  - ⚪ SUPERSEDED REVISION (Historical revision being previewed in read-only mode)
- **Metadata Readout**: Revision ID (rev-1), Manifest ID (manifest-ce35...), Media SHA-256 (first 16 hex chars), Resolution, FPS.

### 4.2. Component 2: Conversational Revision Panel (RevisionPanel)
- **Natural Language Input**: Textarea for revision prompts (e.g., *"Move the headline title 2 seconds later, keep duration unchanged"*).
- **Compiler Feedback Display**:
  - **Parsed Intent**: Explicit changes detected by RevisionIntentCompiler.
  - **Preserved Constraints**: Unaltered brief invariants and timeline anchors.
  - **Conflict Warnings**: Instant alert if a request violates hard invariants.
- **Action Control**: Single Apply Revision button triggering optimistic concurrency revision with version check (expectedVersion).

### 4.3. Component 3: Multi-Revision History DAG & Diff Inspector (HistoryDiffView)
- **Revision Tree**: Interactive list of all committed, failed, and active revisions in session.history.
- **Structured Diff View**:
  - Modified clips with before/after tick offsets and duration deltas.
  - Added/removed operations.
  - Derived changes vs direct user requests.
- **Safe Inspection Mode**: Clicking a prior revision (e.g., rev-0) loads its project snapshot into the timeline and its MP4 into the preview monitor in read-only inspection mode without modifying session.active_delivery.

### 4.4. Component 4: Candidate Comparison & Selection Surface (CandidateGrid)
- **Profile Cards**: Side-by-side cards for cand-dynamic, cand-cinematic, cand-editorial.
- **Metrics Displayed**:
  - Candidate ID and profile name.
  - QA verification score (100/100 PASS).
  - Musical alignment composite score and rank (Rank #1 [0.88]).
  - Variation parameters (transition type, cut frequency, typographic pacing).
- **Selection Action**: Select Candidate button that calls RevisionSessionManager.bindSelectedCandidate, publishing the selected delivery run and updating session state to ready.

### 4.5. Component 5: Header Controls & Crash Recovery (SessionHeader)
- **Undo / Redo Buttons**: Wired directly to POST /api/session/undo and POST /api/session/redo.
  - Buttons disabled when corresponding stack is empty.
  - Redo stack invalidated upon new branch revision commit.
- **Crash Recovery Indicator**: If session.recovery.status === 'in_flight' or checkpoint_path exists, a prominent ⚠️ Crash Recovery Required badge appears with an idempot
…
Show more
ChatGPT said:
2. Architecture review: approved with changes
PF-10 Stage 1 authorized
The proposed architecture is aligned with the PF-10 directive. Proceed with backend session endpoints and the UI-facing service adapter, subject to the safeguards below. Keep this stage focused on API contracts, security, state consistency, and integration tests—not a large UI rewrite.

The strongest decisions in your proposal are:

Reusing TimelineAdapter for canonical timeline projection and integer-tick precision.

Extending src/ui/server.js rather than introducing another backend.

Separating historical inspection from active-delivery activation.

Connecting revision, candidate, undo/redo, and recovery controls to existing engine services.

Making the preview's verification status derive from engine records, not frontend assumptions. 
Pasted text.txt

I would make six changes before implementation.

3. Six required architectural refinements

1. Harden the media endpoint

The existing assertSafePath is a good foundation, but path sandboxing alone is not sufficient. New session endpoints must authorize media against known project/session artifacts, prevent arbitrary file disclosure, and validate symlinks and resolved paths. Do not trust a client-supplied absolute path simply because it passes a string-prefix check.

Prefer a media identifier or manifest reference that the server resolves to an approved artifact. Preserve byte-range support, validate ranges, and return appropriate errors for missing or disallowed media.

2. Make the engine the source of truth for diffs

HistoryDiffView should not infer changes from prompts or operation names alone. The server should provide a diff derived from the actual predecessor and successor project snapshots, with requested changes and engine-derived changes distinguished where provenance exists.

If a historical snapshot is missing, report that the diff is unavailable rather than manufacturing one.

3. Treat history as a revision graph, not just two stacks

The report calls the history a DAG while describing undo/redo stacks and branch invalidation. 
Pasted text.txt
 Represent committed revisions with explicit predecessor IDs and branch relationships. Use PF-09's authoritative undo/redo semantics; the UI must not invent its own graph or invalidate history independently.

4. Add request and concurrency safeguards

Mutating endpoints must require expectedVersion, reject stale versions, validate request bodies and content types, and return structured errors. Prevent accidental duplicate submissions, and serialize or safely reject concurrent writes to the same session. Use an idempotency key where supported by the engine; do not blindly replay a timed-out revision request.

5. Separate candidate eligibility, selection, and activation

Candidate selection must resolve the exact candidate ID, candidate-set identity, verified manifest, and eligibility status. Never accept a client-provided QA score or profile label as proof. If selection creates or activates a delivery, use the existing session contract to determine the correct operation; don't assume that bindSelectedCandidate publishes a delivery unless the actual implementation confirms it.

6. Define playhead synchronization precisely

“Sub-millisecond playhead” is not a reliable promise for a browser video element. Keep timeline geometry in integer ticks, but derive playback time from the media element's actual playback position and frame rate. Define explicit rounding when mapping media time to ticks. Treat preview seeking as frame-aware, not guaranteed sub-millisecond video seeking.

4. Stage 1 — Required API contract

Implement only the endpoints needed to establish authoritative session integration. Adjust names to match existing CLI and engine conventions.

Endpoint

	

Purpose

	

Required behavior




GET /api/session

	

Read session state

	

Return session identity, version, state, active delivery, recovery status, and history references




POST /api/session/init

	

Initialize session

	

Validate candidate-set identity and initialization inputs




POST /api/session/select

	

Select candidate

	

Verify eligibility and bind the exact candidate/manifest through existing services




POST /api/session/revise

	

Request revision

	

Require expectedVersion; route through PF-09




POST /api/session/undo

	

Undo

	

Apply authoritative session history semantics




POST /api/session/redo

	

Redo

	

Apply authoritative session history semantics




POST /api/session/recover

	

Recover interrupted session

	

Invoke existing recovery service; never activate unverified media




GET /api/session/history

	

Read history

	

Return committed and failed attempts with clear status




GET /api/session/diff

	

Compare revisions

	

Require two revision IDs; derive changes from snapshots




GET /api/candidates

	

Read candidate set

	

Return eligibility, metrics, profile, manifest, and artifact references




GET /api/media/:id or equivalent

	

Stream media

	

Resolve an authorized artifact reference and preserve range seeking

For every endpoint, define request/response schemas, status codes, error shapes, and concurrency behavior. Keep mutation responses explicit about whether a request is merely accepted, still running, failed, or fully verified and committed.

Suggested error categories include VALIDATION_ERROR, NOT_FOUND, STALE_VERSION, CONFLICT, NOT_ELIGIBLE, VERIFICATION_FAILED, RECOVERY_REQUIRED, and INTERNAL_ERROR. Preserve the engine's native error codes when available.

Do not build a second state store in the server. The server may cache read-only projections if invalidation is reliable, but PF-09 remains authoritative.

5. Stage 1 implementation sequence

Inventory existing contracts. Inspect the actual exported methods and constructor dependencies of RevisionSessionManager, CandidateOrchestrator, RevisionOrchestrator, RenderOrchestrator, and TimelineAdapter. Confirm real paths and method signatures before coding.

Define endpoint contracts. Add validation and consistent response/error shapes, including session version handling.

Implement the service adapter. Route calls to existing services; do not duplicate execution, verification, or undo/redo logic.

Secure artifact resolution. Map candidate/manifest/revision IDs to allowed media and project snapshots; preserve HTTP range streaming.

Add integration tests. Exercise valid requests, invalid input, stale versions, concurrent writes, unauthorized media paths, missing snapshots, and engine failures.

Return a Stage 1 report. Include files changed, API examples, exact test results, security tests, and any endpoint not implemented or any service method that differs from the proposal.

6. Stage 1 acceptance gates

Before moving to the preview monitor and full visual surfaces, verify:

Existing session services are reused; no parallel revision executor exists.
Reads expose authoritative session state and revision identities.
All mutations enforce optimistic concurrency and handle duplicate requests safely.
Candidate selection checks eligibility and exact manifest binding.
Diffs come from actual snapshots.
Historical inspection cannot change the active-delivery pointer.
Media access is restricted to authorized artifacts, including symlink and traversal tests.
Byte-range seeking still works.
Failed revisions and recovery operations preserve the last verified delivery.
Existing PF-09 regression tests remain green, alongside the new server integration tests.

One important qualification: the reported 50/50 suite should remain a baseline, but passing those 50 tests alone is not PF-10 certification. The new API, browser interactions, and actual preview artifacts require their own tests.

Final decision: The component/service map is approved with the six refinements above. Proceed with Stage 1 implementation. Keep the timeline UI read-only until authoritative session and media contracts are working and tested.

ChatGPT can make mistakes. Check important info.
Latest response
Improve accuracy for documents and research
Upgrade to Plus and use increased reasoning to synthesize documents, research, files, and complex information.
Get Plus




Think
Response complete
⋮⋮
⋮⋮
⋮⋮
⋮⋮
⋮⋮
⋮⋮
⋮⋮
⋮⋮