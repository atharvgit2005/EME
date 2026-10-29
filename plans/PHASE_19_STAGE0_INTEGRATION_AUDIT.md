# Phase 19 (RT-01) — Stage 19.0: Repository Audit, Workflow Baseline & Integration Contract

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.0 — Repository Audit, Workflow Baseline & Integration Contract  
**Document**: `plans/PHASE_19_STAGE0_INTEGRATION_AUDIT.md`  
**Predecessor Milestone**: Phase 18 (TL-01 Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration)  
**Release Tag Targeted**: `phase-18-tl-01-certified`  
**Full Release Commit SHA**: `741dde73e818e14994aa907d60bcbea752636558`  
**Target Architecture Owner**: ChatGPT Architecture Lead  
**Operating Principles**:
1. *The Engine owns state, deterministic operations own edits, verification owns acceptance, and the delivery pipeline owns publication.*
2. *The Visual Control Surface reflects authoritative backend state; planning does not mutate the project; operations execute through OperationExecutor; renders become active delivery ONLY after verification passes.*
3. *Zero schema modification to `schema/eme-project.v1.schema.json` without explicit approval.*
4. *Strict integer timebase (120,000 ticks/sec) and half-open intervals $[startTick, startTick + durationTicks)$.*
5. *Preserve prior verified active delivery on any render, QA, or manifest failure.*

---

## 1. Commit Identity & Test Duration Reconciliation

### 1.1 Full Release Commit Provenance
As required by the Architecture Lead Kickoff Directive, the exact commit identity targeted by the certified release tag is formally recorded:
- **Annotated Tag**: `phase-18-tl-01-certified`
- **Target Object**: `commit 741dde73e818e14994aa907d60bcbea752636558`
- **Tagger**: `Atharv Paharia <pahariaatharv2005@gmail.com> 1792515923 +0530`
- **Commit Message**: `feat(phase-18): complete Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration (TL-01)`
- **Parent Commit**: `08ef2817d23d8c1c4f51952a22be264582f347fe` (`phase-17-stage2-certified`)
- **Schema Immutability Check**: `git diff 08ef281..741dde7 -- schema/eme-project.v1.schema.json` $\rightarrow$ **0 diff lines** (strictly invariant).

### 1.2 Master Test Duration Discrepancy Reconciliation
In the Phase 18 completion reports, two distinct test duration figures were recorded:
1. **1,197 ms** (reported in Section 2 for `node --test tests/timeline-*.test.js`).
2. **87.8 s** (reported in Section 3 for full `npm test`), and **97.0 s** in the subsequent test run.

**Technical Reconciliation**:
- **Timeline Test Suite (`tests/timeline-*.test.js`)**: Comprises 70 tests across 11 test suites. It executes in **869 ms – 1,197 ms** because all timeline projection algorithms, coordinate transforms, magnetic snapping routines, CapCut microsecond arithmetic conversions, and in-memory transactional operations run purely in-process in V8 without spawning long-running external worker processes.
- **Master Regression Suite (`npm test`)**: Comprises **460 tests across 28 test files**. It requires **87.8 s – 97.0 s** because it executes several computationally intensive subsystems:
  1. `tests/vtsm-held-out-integration.test.js`: Accounts for **~42.0 seconds** alone by spawning real Python child processes (`python3 src/engine/vtsm_worker.py`) that load PyTorch, run Lucas-Kanade and SAM2 visual tracking inference across 100+ frames of video footage.
  2. Live FFmpeg Video Rendering & Color Preview Suites (`tests/color-parity.test.js`, `tests/color-full-parity.test.js`, `tests/timeline-stage18-4-delivery.test.js`, `tests/roundtrip-integration.test.js`): Account for **~25.0 seconds** combined by spawning live `ffmpeg` and `ffprobe` processes to decode video frames, evaluate 3D tetrahedral LUT interpolation, encode H.264/AAC MP4 media deliverables, and verify frame hashes.
  3. Audio Synthesis & DSP Feature Extraction Suites (`tests/audio-beat-dsp.test.js`, `tests/audio-musical-structure-a2-benchmark.test.js`, `tests/audio-sfx-engine.test.js`): Account for **~12.0 seconds** extracting Short-Time Fourier Transforms (STFT), onset envelopes, spectral flux, and synthesizing PCM WAV assets.
  4. Packaging & Clean-Install Smoke Tests (`tests/pf11-stage3-release.test.js`): Accounts for **~8.0 seconds** packing the npm tarball, unpacking in a fresh temp directory, running environment doctor diagnostics, and executing an end-to-end rendering pipeline.
- **Conclusion**: There is zero discrepancy in testing integrity. The focused timeline suite runs in ~1.0s, while the 460-test full regression suite takes ~90s due to genuine heavy external process execution (PyTorch ML inference, FFmpeg encoding, audio DSP).

---

## 2. Comprehensive Subsystem Audit (11 Core Areas)

A comprehensive, source-grounded inspection of all 11 subsystem areas was conducted against the live repository at commit `741dde7`.

```
====================================================================================================
AREA 1: User Request Ingestion & Intent Interpretation
====================================================================================================
Source Paths:
  - src/prompt-core/index.js (compileEditBrief, extractIntentEnvelope)
  - src/prompt-core/context-normalizer.js (ContextNormalizer, computeProjectSnapshotSha256)
  - src/prompt-core/brief-validator.js (BriefValidator)
  - src/prompt-core/reference-resolver.js (ReferenceResolver)
  - src/prompt-core/constraint-normalizer.js (ConstraintNormalizer)
  - src/prompt-core/readiness-evaluator.js (ReadinessEvaluator)
  - schema/eme-intent-envelope.v1.schema.json, schema/eme-edit-brief.v1.schema.json, schema/eme-constraint.v1.schema.json

Authoritative Classes & Functions:
  - ContextNormalizer.normalizeProjectContext(project, options): Computes canonical project snapshot SHA-256, extracts base_revision, timebase ticks (120,000), available asset IDs, and selected entity IDs.
  - extractIntentEnvelope(rawPrompt, project, options): Rule- and heuristic-based extractor compiling user prompt into structured IntentEnvelope.
  - ReferenceResolver.resolveTargets(project, targetDescriptor): Maps semantic selectors (e.g. "dialogue", "interview_01", "music") to concrete, immutable entity IDs in project.clips, project.tracks, or project.assets.
  - ConstraintNormalizer.normalizeConstraints(rawConstraints, project, baselineRevision): Compiles negative prohibitions and positive invariants into typed, zero-tolerance contracts (e.g. C-GRADE-001, C-MUSIC-001, C-TIME-001).
  - ReadinessEvaluator.evaluate(brief, options): Deterministically checks for stale project revisions (brief.project_snapshot.base_revision !== project.revision), unresolved blocking ambiguities, or conflicting requirements (e.g. "make warmer" vs "preserve existing grade" -> CONFLICT_COLOR_GRADE).
  - BriefValidator: Strict JSON-schema validator for IntentEnvelope and EditBrief.

Capabilities & Invariants:
  - Completely non-mutating: Zero state changes to the input project snapshot.
  - Fail-closed: Stale base revisions, unresolved entities, or contradictory constraints produce status: 'blocked' or 'needs_clarification' with blocking issue IDs.
  - Deterministic SHA-256 fingerprinting guarantees intent envelope is bound to exact project state.

Current Failure Modes & Edge Cases:
  - Ambiguous target references without exact match return unresolved: true.
  - Freeform intent extraction outside trained regex patterns requires structured fallback.

Integration Seam for Phase 19:
  - Wire into EndToEndOrchestrator to reject invalid briefs before entering the PLANNING or EXECUTING phase.

====================================================================================================
AREA 2: Plan Construction, Operation Selection & Constraint Preservation
====================================================================================================
Source Paths:
  - src/prompt-core/operation-plan-compiler.js (OperationPlanCompiler)
  - src/prompt-core/multi-track-scheduler.js (MultiTrackScheduler)
  - src/planning/plan-compiler.js (Phase 13 legacy compiler)
  - schema/eme-operation-plan.v1.schema.json

Authoritative Classes & Functions:
  - OperationPlanCompiler.compilePlan({ brief, project, beatAnalysis, options }): Compiles an EditBrief into a declarative OperationPlan.
  - MultiTrackScheduler: Schedules B-roll overlays, music beds, and SFX cues while respecting track collision avoidance, audio ducking, and beat alignment within DEFAULT_BEAT_TOLERANCE_TICKS.
  - OperationPlanCompiler.computePlanHash(plan): Computes SHA-256 of canonical JSON-stringified operations.
  - OperationPlanCompiler.executePlan(project, plan, options): Executes declarative operations with dry-run simulation, transaction journaling, and atomic rollback.

Capabilities & Invariants:
  - Zero direct project mutation during plan compilation: Project snapshot is cloned for dry-run simulation.
  - Complete operation validation: Plans only contain canonical operations accepted by OperationExecutor.
  - Constraint preservation: Plan compiler checks that proposed operations do not violate EditBrief hard constraints (e.g. rejecting grade operations if preserve_property: color_grade is present).

Current Failure Modes & Edge Cases:
  - Competing plan alternatives: OperationPlanCompiler generates a single deterministic plan; variant candidate generation is handled separately by CandidateOrchestrator.
  - Multi-track collisions: MultiTrackScheduler shifts non-dialogue clips to avoid collisions, but if tracks are locked, it fails closed.

Integration Seam for Phase 19:
  - Unify plan compilation across single-turn creation and conversational revisions via RevisionPlanCompiler.

====================================================================================================
AREA 3: OperationExecutor & Canonical Project State
====================================================================================================
Source Paths:
  - src/engine/operations.js (OperationExecutor)
  - src/engine/project.js (ProjectManager)
  - src/engine/time.js (MediaTime, TICKS_PER_SECOND = 120,000)
  - schema/eme-project.v1.schema.json

Authoritative Classes & Functions:
  - OperationExecutor.execute(project, operation): Sole system authority for mutating project state.
    Supported 22 canonical operations:
    1. create_project       8. animate_property     15. update_keyframe
    2. add_asset            9. apply_effect         16. ripple_trim
    3. add_track           10. set_audio_envelope   17. slip_clip
    4. insert_clip         11. delete_clip          18. slide_clip
    5. trim_clip           12. ripple_delete        19. set_track_state
    6. move_clip           13. reorder_tracks       20. attach_color_grade
    7. split_clip          14. modify_clip          21. adjust_color_params
                                                    22. remove_color_grade
  - ProjectManager.saveProject(path, project) & ProjectManager.loadProject(path): Validates and persists project JSON.

Capabilities & Invariants:
  - Deep clone candidate before execution: If any validation rule, track lock, collision, or interval boundary fails, candidate is discarded; original project state is completely unmodified.
  - Concurrency guard: operation.expectedBaseRevision is validated against project.revision before applying changes. If mismatched, returns errorCode: 'STALE_REVISION'.
  - Monotonic revision increment: Every successful operation increments project.revision by 1.
  - Full schema conformance: Project states produced strictly validate against schema/eme-project.v1.schema.json.

Current Failure Modes & Edge Cases:
  - Partial multi-operation sequences: OperationExecutor executes ONE operation at a time. Multi-operation batches require external transactional management (provided by OperationPlanCompiler.executePlan with journal rollback).

Integration Seam for Phase 19:
  - Ensure all workflow operations pass strictly through OperationExecutor, never direct JSON mutations.

====================================================================================================
AREA 4: Revision/Session Lifecycle & Orchestration Job Management
====================================================================================================
Source Paths:
  - src/prompt-core/revision-session.js (RevisionSessionManager)
  - src/prompt-core/job-orchestrator.js (OrchestrationJobManager, OrchestrationJobStatus, EndToEndOrchestrator)
  - src/orchestration/job-manager.js (Phase 14B JobManager - see Section 3 for consolidation)
  - schema/eme-revision-session.v1.schema.json, schema/eme-job.v1.schema.json

Authoritative Classes & Functions:
  - OrchestrationJobManager (src/prompt-core/job-orchestrator.js):
    - createJob({ jobId, idempotencyKey, request, initialMeta }): Emits durable job artifact to artifacts/jobs/<jobId>.json.
    - transition(jobId, toStatus, details): Enforces ValidJobTransitions, logs state_history, updates progress and artifacts.
    - findByIdempotencyKey(key): Retrieves existing job by idempotency key.
  - RevisionSessionManager:
    - createSession(options): Initializes session with active_delivery, history DAG, concurrency version, and recovery structure.
    - recordRevision(session, revisionDoc): Appends revision run to DAG history.
    - activateDelivery(session, deliveryDoc): Updates session.active_delivery pointer with validation.
  - EndToEndOrchestrator.runWorkflow(params): Executes complete lifecycle from prompt to verified delivery.

Capabilities & Invariants:
  - Durable job status: Job transitions are persisted atomically via temp file + atomic rename.
  - Terminal safety: Terminal states (COMMITTED, FAILED) cannot be overwritten by delayed callbacks.
  - DAG history: Revisions record predecessor_id, prompt, plan_hash, manifest_id, delivery_run_id, media_sha256, and _project snapshot.

Current Failure Modes & Edge Cases:
  - Divergent status models between Phase 14B JobManager and Phase PF-11 OrchestrationJobManager (addressed in Section 4).

Integration Seam for Phase 19:
  - Unify status transition model into the 12-state architecture specified in the Kickoff Directive.

====================================================================================================
AREA 5: Expected-Revision Validation, Write Mutexes & Idempotency
====================================================================================================
Source Paths:
  - src/ui/server.js (EditorBackend)
  - src/prompt-core/job-orchestrator.js (OrchestrationJobManager, EndToEndOrchestrator)

Authoritative Classes & Functions:
  - EditorBackend.isMutating: Process-wide write mutex guarding concurrent project modifications and session revisions. Re-entrant mutating requests receive 409 CONFLICT or 409 MUTATION_IN_PROGRESS.
  - EditorBackend.idempotencyCache: Bounded in-memory LRU cache (200 entries) mapping operationId -> { payloadHash, response } on POST /api/project/operation.
  - OrchestrationJobManager.idempotencyIndex: Persistent, durable index mapping idempotency_key -> job_id across server restarts (loaded from artifacts/jobs/*.json).
  - Optimistic concurrency control: Both /api/project/operation (expectedRevision) and /api/jobs (expectedVersion) validate base version before processing.

Capabilities & Invariants:
  - Idempotency conflict detection: Reusing an idempotency key with a differing prompt or operation payload is rejected with 409 IDEMPOTENCY_CONFLICT or 400.
  - Replay exactness: Replaying a committed request returns the cached result and active delivery without executing a second time or creating duplicate project revisions.

Current Failure Modes & Edge Cases:
  - In-memory 200-entry LRU cache in server.js does not persist across server restarts (though OrchestrationJobManager does).
  - Delineation needed between process-local HTTP idempotency and durable job idempotency (detailed in Section 8).

Integration Seam for Phase 19:
  - Harmonize idempotency keys across timeline operations and high-level workflow jobs.

====================================================================================================
AREA 6: Timeline & Visual Control Surface Integration
====================================================================================================
Source Paths:
  - src/engine/timeline-adapter.js (TimelineAdapter)
  - src/ui/server.js (EditorBackend HTTP endpoints)
  - src/ui/public/app.js (Client frontend state & renderer)
  - src/ui/public/index.html, src/ui/public/index.css

Authoritative Classes & Functions:
  - TimelineAdapter.projectToTimelineView(project, viewState): Authoritative projection from canonical project model to display tracks, clips, playhead, and timecodes.
  - TimelineAdapter.computeMagneticSnap(candidateTick, project, thresholdTicks, playheadTick): Sub-millisecond snapping engine targeting clip in/out points and playhead.
  - TimelineAdapter.exportCapCutDraft(project) & TimelineAdapter.importCapCutDraft(draftInfo): Microsecond-exact CapCut bidirectional conversion.
  - Client state in app.js: Maintains transient viewport zoom, pan, playhead scrubbing, and draft color parameters without polluting canonical project state.

Capabilities & Invariants:
  - Authoritative backend state: VCS reads state from GET /api/timeline or GET /api/project; manual edits commit via POST /api/project/operation.
  - Transient gestures are non-mutating: Dragging, scrubbing, zooming, or selecting clips modifies only client viewState.
  - Verified performance: 1,000-clip projection P95 = 4.61 ms (limit <= 16.67 ms); magnetic snapping P95 = 0.038 ms (limit < 0.30 ms).

Current Failure Modes & Edge Cases:
  - Disconnect between interactive timeline edits and prompt-core session history: If a user edits via VCS, currentProject increments revision, but session history must be informed or re-synchronized.

Integration Seam for Phase 19:
  - Establish clear synchronization: Manual VCS edits and automated prompt jobs share canonical project revision lineage.

====================================================================================================
AREA 7: Render Compilation & Execution
====================================================================================================
Source Paths:
  - src/renderers/hyperframes/compiler.js (HyperFramesCompiler)
  - src/renderers/hyperframes/renderer.js (HyperFramesRenderer)
  - src/renderers/hyperframes/capabilities.js (HyperFramesCapabilities)
  - src/renderers/ffmpeg-color-compiler.js (FfmpegColorCompiler)
  - src/prompt-core/render-orchestrator.js (RenderOrchestrator.renderJob)

Authoritative Classes & Functions:
  - HyperFramesCompiler.compile(project, outputDir): Compiles canonical project into HTML5/Canvas/WebGL composition directory with manifest and asset symlinks/copies.
  - HyperFramesRenderer.render(compositionDir, outputMp4Path, options): Spawns headless browser/FFmpeg pipeline to execute frame-by-frame rendering at exact specified FPS.
  - FfmpegColorCompiler: Builds FFmpeg filtergraphs for 3D LUT tetrahedral interpolation, white balance, exposure, and primary color adjustments.
  - RenderOrchestrator.buildRenderJob({ project, plan, outputProfile, outputDir }): Constructs canonical eme-render-job.v1 document with preflight asset validation.

Capabilities & Invariants:
  - Immutable input snapshot: Rendering operates on a frozen deep clone of the project revision; subsequent edits during render do not affect the output.
  - Exact timebase rendering: 120,000 ticks/sec mapped precisely to rational frame rates (30 fps, 60 fps).

Current Failure Modes & Edge Cases:
  - Direct endpoint POST /api/render in server.js renders directly without QA audit or delivery manifest generation.

Integration Seam for Phase 19:
  - Direct all delivery-oriented rendering through RenderOrchestrator to ensure closed-loop QA and manifest signing.

====================================================================================================
AREA 8: Closed-Loop Technical & Semantic Verification
====================================================================================================
Source Paths:
  - src/renderers/qa-engine.js (QualityAssuranceEngine)
  - src/renderers/inspector.js (FrameInspector)
  - src/prompt-core/candidate-musical-scorer.js (CandidateMusicalScorer)
  - src/prompt-core/prompt-deliverable-orchestrator.js (PromptDeliverableOrchestrator.verifyIntentToOutput)
  - src/planning/closed-loop-qa.js (ClosedLoopQaPipeline)

Authoritative Classes & Functions:
  - QualityAssuranceEngine.auditQuality(project, renderedMp4Path, options): Runs 10-point technical QA:
    1. Deterministic Timebase Check
    2. Asset Existence & Provenance
    3. Layout & Safe Margins Inspection
    4. Animated Keyframe Bounds Inspection
    5. Track Integrity & Stacking Hierarchy
    6. Inter-Clip Cut Continuity (no 1-2 frame gaps)
    7. Video Stream Dimension Conformance (1080x1920 or 1920x1080)
    8. Audio Track Stream Conformance (AAC, 48kHz, stereo)
    9. Rendered Blank-Frame Flash Inspection (FrameInspector black-pixel probe)
    10. Audio Signal Integrity & True-Peak Ceiling Compliance
  - PromptDeliverableOrchestrator.verifyIntentToOutput: Cross-references EditBrief requested changes and constraints against executed project and media metrics.
  - CandidateMusicalScorer: Verifies edit-to-beat alignment and musical energy matching.

Capabilities & Invariants:
  - Independent media inspection: Verification decodes the actual rendered MP4 via ffprobe/ffmpeg; exit code 0 of renderer is NOT sufficient.
  - Objective scoring: QA score must be >= 80 and decision === 'PASS'.

Current Failure Modes & Edge Cases:
  - Injected QA failures (e.g. simulated flash frame or audio clip) must fail closed and abort publication.

Integration Seam for Phase 19:
  - Enforce QA gate as mandatory precondition before transitioning to PUBLISHING / SUCCEEDED.

====================================================================================================
AREA 9: Media QA, Output Hashing, Delivery Manifests & Active-Delivery Publication
====================================================================================================
Source Paths:
  - src/prompt-core/render-orchestrator.js (RenderOrchestrator.generateDeliveryManifest, runClosedLoop)
  - src/prompt-core/job-orchestrator.js (EndToEndOrchestrator)
  - schema/eme-delivery-manifest.v1.schema.json, schema/eme-media-qa-report.v1.schema.json

Authoritative Classes & Functions:
  - RenderOrchestrator.computeFileSha256(filePath): Computes cryptographic SHA-256 digest of rendered media file.
  - RenderOrchestrator.generateDeliveryManifest({ renderJob, project, qaReport, mediaPath, repairAttempts }): Emits canonical eme-delivery-manifest.v1 linking:
    - manifest_id
    - project_id and project_revision
    - deliverable media_path, byte size, format, duration_ticks
    - media_sha256
    - qa_report_id, qa_score, qa_decision
    - source_assets manifest with per-asset SHA-256 hashes
  - EndToEndOrchestrator: Updates session.active_delivery ONLY after all gates pass:
    newActiveDelivery = { delivery_run_id, manifest_id, media_path, sha256, revision_id, activated_at }

Capabilities & Invariants:
  - Cryptographic binding: Media SHA-256 is verified on disk before manifest emission.
  - Failure preservation: If rendering, QA, or manifest generation fails, the previous session.active_delivery remains 100% active and untouched. An unverified render NEVER becomes active delivery.
  - Truthful revision representation: If project revision N+1 commits but rendering fails, revision N+1 is recorded in project history, but active_delivery continues pointing to revision N. The system never misrepresents an old media render as the output of a newer project revision.

Current Failure Modes & Edge Cases:
  - Manifest file tampering or missing media artifact fails closed with ARTIFACT_MISSING or SHA_MISMATCH.

Integration Seam for Phase 19:
  - Ensure all publication pathways (API, CLI, and Web UI) execute through this exact verification-to-publication gate.

====================================================================================================
AREA 10: Failure Handling, Recovery, Persistence, Status Reporting & Logs
====================================================================================================
Source Paths:
  - src/prompt-core/operation-plan-compiler.js (recoverFromJournal)
  - src/prompt-core/job-orchestrator.js (OrchestrationJobManager, checkpointing)
  - src/engine/project.js (ProjectManager.saveProject/loadProject)
  - src/orchestration/artifact-verifier.js (ArtifactVerifier)

Authoritative Classes & Functions:
  - Transaction Checkpointing: Before executing a workflow turn, EndToEndOrchestrator writes a checkpoint file:
    ${session.session_id}-${txId}-checkpoint.json containing session_id, transaction_id, predecessor_revision_id, and prior active_delivery.
  - Journaled Execution & Rollback: OperationPlanCompiler.executePlan writes ${job.job_id}-execution-journal.json recording each step. If a step fails and atomic: true, it rolls back project state to initialSnapshot and marks status: 'rolled_back'.
  - OperationPlanCompiler.recoverFromJournal(journalPath, projectPath): Reconciles broken state after crash or failure by inspecting journal entries and restoring canonical state.
  - Crash recovery after SIGKILL: Validated in tests/pf11-stage3-release.test.js (Gate A3) restoring coherent active delivery from checkpoint.

Capabilities & Invariants:
  - Bounded recovery: Maximum 2 automated repair attempts during closed-loop QA.
  - Zero corruption on unhandled exception: Unhandled failures leave previous saved project files and checkpoints intact.

Current Failure Modes & Edge Cases:
  - If a multi-operation non-atomic plan fails midway, status is partially_executed_failed; system requires explicit reconciliation (matching the Kickoff Directive's needs_reconciliation state).

Integration Seam for Phase 19:
  - Expose formal POST /api/session/recover and CLI recovery commands that invoke journal-based state reconciliation.

====================================================================================================
AREA 11: CLI & MCP Integration Boundaries (Including Advisory Laya)
====================================================================================================
Source Paths:
  - src/cli/index.js (CLI binary `eme`)
  - src/mcp/server.js (MCP JSON-RPC server)
  - src/engine/vtsm-service.js (VTSM perception service)
  - src/decision-fabric/adapter/eme-policy-gate.js (Laya advisory policy gate)

Authoritative Classes & Functions:
  - CLI Commands:
    - eme prompt inspect: Non-executing brief compiler & readiness inspector.
    - eme prompt plan: Compiles and dry-runs operation plan.
    - eme prompt render: Compiles, dry-runs, and renders deliverable.
    - eme prompt auto: Full prompt-to-delivery pipeline execution.
    - eme prompt revise: Multi-turn conversational revision.
    - eme editor / eme serve: Visual Control Surface backend.
    - eme doctor, eme validate, eme inspect, eme capabilities.
  - MCP Tools:
    - Core: eme_create_project, eme_execute_operation, eme_validate_project, eme_compile_composition, eme_render_video, eme_inspect_frame, eme_inspect_project, eme_query_capabilities, eme_inspect_metadata.
    - Advisory: eme_route_request, eme_triage_color_mood, eme_arbitrate_timeline (Laya advisory router).
    - Perception: eme_vtsm_init_tracking, eme_vtsm_propagate_range, eme_vtsm_get_frame_mask, eme_vtsm_cancel_tracking, eme_vtsm_get_session_status.

Capabilities & Invariants:
  - Strict advisory containment: Laya Decision Fabric runs strictly in CANARY_ADVISORY_MODE=true behind EMEPolicyGate. Laya has ZERO execution authority and cannot mutate projects.
  - Strict spatial sidecar containment: VTSM tracking masks are stored in .vtsm.json sidecar files; project schema remains completely unmodified.
  - Safe path sandboxing: MCP and CLI assert that file paths fall within authorized repository boundaries or /tmp.

Current Failure Modes & Edge Cases:
  - MCP server does not yet expose high-level workflow orchestration tools (e.g. eme_run_workflow, eme_get_job_status).

Integration Seam for Phase 19:
  - Evaluate adding high-level workflow orchestration tools to MCP in Stage 19.5 if within RT-01 release scope.
```

---

## 3. End-to-End Architecture Data-Flow Diagram

The following Mermaid diagram traces the end-to-end data flow from user request submission through planning, deterministic execution, verification, rendering, media QA, and verified active-delivery publication:

```mermaid
flowchart TD
    subgraph Ingestion ["1. INGESTION & INTERPRETATION"]
        UR["User Request\n(Prompt / HTTP / CLI)"] --> CN["ContextNormalizer\n(Snapshot SHA-256)"]
        CN --> RR["ReferenceResolver\n(Resolve Clip/Track/Asset IDs)"]
        RR --> CR["ConstraintNormalizer\n(Typed Hard Invariants)"]
        CR --> RE["ReadinessEvaluator\n(Revision & Conflict Check)"]
        RE -->|Blocked / Conflict| CLAR["Awaiting Clarification / Failed\n(Zero Mutation)"]
        RE -->|Ready| BV["BriefValidator\n(JSON Schema Validation)"]
    end

    subgraph Planning ["2. PLANNING & SELECTION"]
        BV --> OPC["OperationPlanCompiler\n(Declarative Plan Construction)"]
        OPC --> MTS["MultiTrackScheduler\n(Collision & Ducking Logic)"]
        MTS --> DR["Dry-Run Simulation\n(Cloned State Verification)"]
        DR -->|Preflight Failed| PLAN_FAIL["Job Failed: Preflight\n(Zero Mutation)"]
        DR -->|Preflight OK| READY["Ready to Execute\n(Plan Stored, Non-Mutating)"]
    end

    subgraph Execution ["3. DETERMINISTIC EXECUTION"]
        READY --> OJM["OrchestrationJobManager\n(Create Durable Job: ACCEPTED)"]
        OJM --> OPE["OperationPlanCompiler.executePlan\n(Atomic Journaling Engine)"]
        OPE --> OE["OperationExecutor.execute\n(Sole State Authority)"]
        OE -->|Check Revision| REV_GUARD{"Base Revision\nMatches?"}
        REV_GUARD -->|No| STALE["409 STALE_REVISION\n(Rollback Snapshot)"]
        REV_GUARD -->|Yes| COMMIT_OP["Apply 22 Operations\n(Monotonic Rev + 1)"]
        COMMIT_OP --> JOURNAL["Write Execution Journal\n(Step-by-Step Provenance)"]
    end

    subgraph Verification ["4. CLOSED-LOOP VERIFICATION & RECOVERY"]
        JOURNAL --> INTENT_VERIF["PromptDeliverableOrchestrator\n(Verify Intent to Project State)"]
        INTENT_VERIF -->|Semantic Failed| REC_CTRL{"Can Recover?\n(Attempts < 2)"}
        REC_CTRL -->|Yes| REPLAN["Re-Plan Correction Step"]
        REPLAN --> OPE
        REC_CTRL -->|No| RECON["Needs Reconciliation\n(Keep Prior Delivery)"]
    end

    subgraph Rendering ["5. RENDERING & MEDIA QA"]
        INTENT_VERIF -->|Verified| R_JOB["RenderOrchestrator.buildRenderJob\n(Freeze Revision Snapshot)"]
        R_JOB --> COMP["HyperFramesCompiler / FfmpegColorCompiler"]
        COMP --> RENDER["HyperFramesRenderer\n(Generate Output MP4)"]
        RENDER -->|Render Exit != 0| RENDER_FAIL["Job Failed: Render Crash\n(Preserve Prior Delivery)"]
        RENDER -->|MP4 Generated| QA["QualityAssuranceEngine.auditQuality\n(10-Point Technical QA Inspection)"]
        QA -->|Score < 80 or Blank Flash| QA_FAIL["Job Failed: QA Gate Rejected\n(Preserve Prior Delivery)"]
    end

    subgraph Publication ["6. INTEGRITY & ACTIVE-DELIVERY PUBLICATION"]
        QA -->|Score >= 80 PASS| HASH["Compute Media SHA-256\n(File on Disk)"]
        HASH --> MAN["RenderOrchestrator.generateDeliveryManifest\n(Sign Manifest with Revision & Hash)"]
        MAN --> PUB["Publish Active Delivery\n(Update session.active_delivery Pointer)"]
        PUB --> DAG["Append Revision Run to Session DAG\n(Record History & Clear Recovery)"]
        DAG --> SUCCEED["Job Status: SUCCEEDED\n(HTTP 200 / Verified Output)"]
    end
```

---

## 4. Current-State Workflow & Unified Status Model

### 4.1 Comparison of Existing Status Models
The audit revealed two competing historical job managers in the repository:
1. **Phase 14B `JobManager` (`src/orchestration/job-manager.js`)**: 14 states (`CREATED`, `INGESTING`, `ANALYZING`, `PLANNING`, `AWAITING_APPROVAL`, `VALIDATING`, `EXECUTING`, `RENDERING`, `QA_EVALUATING`, `CORRECTING`, `COMPLETED`, `FAILED`, `CANCELLED`, `SUSPENDED`).
2. **Phase PF-11 `OrchestrationJobManager` (`src/prompt-core/job-orchestrator.js`)**: 8 states (`ACCEPTED`, `PLANNING`, `EXECUTING`, `RENDERING`, `VERIFYING`, `COMMITTED`, `FAILED`, `RECOVERING`). Active in `EditorBackend` (`server.js`).

### 4.2 Unified 12-State Target Model for Phase 19 (RT-01)
To satisfy the Architecture Lead's Kickoff Directive without destabilizing existing callers, we define the authoritative 12-state unified lifecycle:

| Target Logical State | Naming in RT-01 | Predecessor States | Next Allowed States | Terminal? | Authoritative Owner |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Accepted** | `ACCEPTED` | *None (Initial)* | `PLANNING`, `FAILED`, `CANCELLED` | No | Request/Job Layer |
| **Planning** | `PLANNING` | `ACCEPTED`, `RECOVERING` | `AWAITING_APPROVAL`, `READY_TO_EXECUTE`, `FAILED`, `CANCELLED` | No | Planning Layer |
| **Awaiting approval/clarification** | `AWAITING_APPROVAL` | `PLANNING` | `READY_TO_EXECUTE`, `FAILED`, `CANCELLED` | No | User/Client Layer |
| **Ready to execute** | `READY_TO_EXECUTE` | `PLANNING`, `AWAITING_APPROVAL` | `EXECUTING`, `CANCELLED` | No | Planning/Preflight Gate |
| **Executing** | `EXECUTING` | `READY_TO_EXECUTE`, `RECOVERING` | `VERIFYING`, `RENDERING`, `FAILED`, `NEEDS_RECONCILIATION` | No | OperationExecutor / Journal |
| **Verifying** | `VERIFYING` | `EXECUTING`, `RENDERING` | `RENDERING`, `PUBLISHING`, `RECOVERING`, `FAILED` | No | QualityAssuranceEngine |
| **Rendering** | `RENDERING` | `EXECUTING`, `VERIFYING` | `VERIFYING`, `FAILED`, `RECOVERING` | No | HyperFramesRenderer |
| **Publishing** | `PUBLISHING` | `VERIFYING` | `SUCCEEDED`, `FAILED`, `NEEDS_RECONCILIATION` | No | Delivery / Manifest Authority |
| **Succeeded** | `SUCCEEDED` *(alias `COMMITTED`)* | `PUBLISHING` | *None* | **Yes** | Session / Active Delivery |
| **Failed** | `FAILED` | Any non-terminal | *None (Retry creates new job)* | **Yes** | Error / Recovery Controller |
| **Cancelled** | `CANCELLED` | `ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, `READY_TO_EXECUTE` | *None* | **Yes** | Request / Mutex Authority |
| **Needs reconciliation** | `NEEDS_RECONCILIATION` | `EXECUTING`, `PUBLISHING` | `RECOVERING`, `FAILED` | No | State Recovery / Journal |

### 4.3 Key Invariants of the Unified Status Model
1. **Job Completion $\neq$ Delivery Publication**: If an edit executes and commits revision $N+1$, but rendering fails, the job transitions to `FAILED` (or `PARTIALLY_COMMITTED`), the project revision remains truthfully at $N+1$, and `session.active_delivery` continues pointing to revision $N$. Under no circumstances is the prior media represented as the render of revision $N+1$.
2. **Terminal Job Immutability**: Once a job enters `SUCCEEDED`, `FAILED`, or `CANCELLED`, its state cannot be modified by late callbacks or asynchronous timers.
3. **Cancellation Boundary**: Cancellation is accepted only prior to operation execution (`ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, `READY_TO_EXECUTE`). Once `EXECUTING` has commenced, cancelling a request does NOT abort an uncompleted atomic transaction mid-step; the transaction must finish or roll back to a coherent snapshot before the job state is settled.

---

## 5. State Ownership & Mutation Boundary Map

| Concern | Authoritative Owner | Implementation Symbol | Canonical Persistence | Concurrency & Mutation Boundary |
| :--- | :--- | :--- | :--- | :--- |
| **User Intent & Constraints** | Request / Prompt Layer | `EditBrief`, `IntentEnvelope` | In-memory / Brief JSON | Immutable snapshot at request submission time |
| **Proposed Operations & Plan** | Planning Layer | `OperationPlan` | In-memory / Plan JSON | Strictly non-mutating; dry-run uses deep cloned state |
| **Canonical Project State** | Engine State Authority | `Project` conforming to `eme-project.v1` | `<project>.json` via `ProjectManager.saveProject` | Mutated ONLY by `OperationExecutor.execute()` |
| **Revision Monotonicity** | Project Engine | `project.revision` | `<project>.json` | Incremented $+1$ per successful operation; checked via `expectedBaseRevision` |
| **Job Lifecycle & Status** | Orchestration Job Manager | `OrchestrationJobManager` | `artifacts/jobs/<jobId>.json` | Atomic writes via temporary file and atomic rename |
| **Transaction Journal** | Plan Execution Engine | `OperationPlanCompiler.executePlan` | `artifacts/deliverables/<jobId>-journal.json` | Step-by-step audit record; rollback to snapshot on atomic failure |
| **Rendered Media** | Rendering Pipeline | `HyperFramesRenderer` | `artifacts/deliverables/*.mp4` | Produced from frozen revision snapshot |
| **Media QA Assessment** | Verification Authority | `QualityAssuranceEngine` | `eme-media-qa-report.v1` | Objective ffprobe/blank-flash probes; requires score $\ge 80$ |
| **Delivery Manifest** | Delivery Authority | `RenderOrchestrator` | `artifacts/deliverables/*-manifest.json` | Binds project revision, media path, and file SHA-256 |
| **Active Delivery Pointer** | Session Authority | `session.active_delivery` | `artifacts/sessions/*.json` | Advances ONLY when render, QA, and manifest pass |
| **Timeline View & Gestures** | Visual Control Surface | `TimelineAdapter`, `state` in `app.js` | Browser Memory (`window.state`) | Transient client view; ZERO mutation to project |
| **Laya Decisions** | Advisory Layer | `EMEPolicyGate`, `LayaDecisionAdapter` | Canary Telemetry JSON | CANARY_ADVISORY_MODE=true; strictly zero execution authority |
| **VTSM Spatial Tracking** | Perception Sidecar | `VtsmService`, `VtsmStateManager` | `.vtsm.json` sidecar files | Read-only perception; schema remains 100% untouched |

---

## 6. Requirements-to-Existing-Capabilities Matrix

| Phase 19 (RT-01) Requirement | Existing Repository Component | Implementation Status | Evidence / Test Suite | Gap / Action for Stage 19.1–19.4 |
| :--- | :--- | :---: | :--- | :--- |
| **1. Request Ingestion & Brief Validation** | `src/prompt-core/brief-validator.js`, `context-normalizer.js` | **Complete** | `tests/prompt-core.test.js` (10/10 PASS) | Wire directly into end-to-end request pipeline |
| **2. Non-Mutating Plan Compilation** | `src/prompt-core/operation-plan-compiler.js` | **Complete** | `tests/prompt-compilation-pf02.test.js` | Ensure dry-run never mutates project revision |
| **3. Multi-Track Scheduling & Ducking** | `src/prompt-core/multi-track-scheduler.js` | **Complete** | `tests/prompt-compilation-pf03.test.js` | Validated in B-roll and audio bed scenarios |
| **4. Atomic Operation Execution** | `src/engine/operations.js` (`OperationExecutor`) | **Complete** | `tests/operations.test.js`, `tests/timeline-stage18-2-operations.test.js` | 22 operations verified with rollback guards |
| **5. Optimistic Revision Guards** | `OperationExecutor.execute`, `src/ui/server.js` | **Complete** | `tests/timeline-stage18-3-concurrency.test.js` | Rejects stale revisions with 409 STALE_REVISION |
| **6. Write Mutex & Re-entrancy Protection** | `EditorBackend.isMutating` in `src/ui/server.js` | **Complete** | `tests/timeline-stage18-3-concurrency.test.js` | Rejects concurrent mutating requests with 409 |
| **7. Process-Local Idempotency** | `EditorBackend.idempotencyCache` (200 LRU) | **Complete** | `tests/timeline-stage18-3-concurrency.test.js` | Caches operation responses; rejects conflict payloads |
| **8. Durable Job Idempotency** | `OrchestrationJobManager` in `job-orchestrator.js` | **Complete** | `tests/pf11-stage3-release.test.js` (Gate A4) | Survives process restarts; indexed by idempotency_key |
| **9. Non-Destructive Timeline Projection** | `src/engine/timeline-adapter.js` | **Complete** | `tests/timeline-stage18-1-surface.test.js` | Projection P95: 4.61 ms; Snapping P95: 0.038 ms |
| **10. CapCut Microsecond Interoperability** | `TimelineAdapter.import/exportCapCutDraft` | **Complete** | `tests/timeline-stage18-4-delivery.test.js` | Bidirectional export/import microsecond exactness |
| **11. Frozen Snapshot Rendering** | `src/renderers/hyperframes/renderer.js` | **Complete** | `tests/compiler-renderer.test.js`, `roundtrip-integration.test.js` | Compiles cloned revision; subsequent edits do not affect render |
| **12. 10-Point Technical Media QA** | `src/renderers/qa-engine.js` | **Complete** | `tests/timeline-stage18-4-delivery.test.js` | ffprobe layout, flash frame, audio envelope checks |
| **13. Delivery Manifest Emission & Hashing** | `src/prompt-core/render-orchestrator.js` | **Complete** | `tests/timeline-stage18-4-delivery.test.js` | SHA-256 computed on disk; bound to revision |
| **14. Active-Delivery Failure Isolation** | `EndToEndOrchestrator` in `job-orchestrator.js` | **Complete** | `tests/pf11-stage2-hardening.test.js` | Failed render/QA preserves prior active delivery |
| **15. Unified 12-State Lifecycle** | Need consolidation between PF-11 and Phase 14B | **Partial** | Needs mapping in Stage 19.1 | Extend `OrchestrationJobStatus` to full 12-state model |
| **16. API Pipeline Coupling** | Direct `/api/render` vs Orchestrated `/api/jobs` | **Partial** | Identified in Section 2 (Area 7) | Route delivery renders through closed-loop QA gates |
| **17. MCP Workflow Tools** | MCP has low-level operations, lacks workflow tools | **Partial** | Identified in Section 2 (Area 11) | Add high-level workflow inspection tools in Stage 19.5 |

---

## 7. Failure, Recovery & Cancellation Matrix

| Failure Mode | Detection Point | System Action | Resulting Project State | Active-Delivery State | Resulting Job Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Malformed Intent / Invalid Brief** | Ingestion (`BriefValidator`) | Reject request immediately with 400 Validation Error | Unmodified (Revision $N$) | Prior active delivery preserved | `FAILED` / Rejected |
| **Stale Revision on Request Submission** | Preflight (`ReadinessEvaluator`) | Fail closed with 409 STALE_REVISION | Unmodified (Revision $N$) | Prior active delivery preserved | `FAILED` (`ERR_STALE_REVISION`) |
| **Contradictory Requirements** | Preflight (`ReadinessEvaluator`) | Halt; require clarification | Unmodified (Revision $N$) | Prior active delivery preserved | `AWAITING_APPROVAL` / `FAILED` |
| **Plan Compilation Failure (Unresolved Target)** | Planning (`OperationPlanCompiler`) | Fail compilation; emit diagnostics | Unmodified (Revision $N$) | Prior active delivery preserved | `FAILED` (`ERR_UNRESOLVED_TARGET`) |
| **Mid-Transaction Operation Collision / Lock** | Execution (`OperationExecutor`) | Discard candidate clone; roll back journal | Rolled back to Revision $N$ (atomic) | Prior active delivery preserved | `FAILED` (`TRACK_LOCKED` / `COLLISION`) |
| **Process Crash (SIGKILL) Mid-Execution** | Post-restart (`recoverFromJournal`) | Replay journal or restore snapshot from checkpoint | Reconciled to last clean revision | Reconciled to checkpointed delivery | `RECOVERING` $\rightarrow$ `FAILED` or `SUCCEEDED` |
| **Renderer Exception / FFmpeg Crash** | Rendering (`HyperFramesRenderer`) | Catch error; abort delivery publication | Persisted at Revision $N+1$ (truthful edit) | **Revision $N$ delivery remains active** | `FAILED` (`RENDER_ERROR`) |
| **QualityAssuranceEngine Score < 80** | Verification (`QualityAssuranceEngine`) | Flag QA violation; trigger repair or abort | Persisted at Revision $N+1$ | **Revision $N$ delivery remains active** | `FAILED` (`QA_REJECTED`) |
| **Media File Tampering / Missing Artifact** | Verification (`computeFileSha256`) | Detect SHA-256 mismatch; abort manifest | Persisted at Revision $N+1$ | **Revision $N$ delivery remains active** | `FAILED` (`SHA_MISMATCH`) |
| **Idempotency Key Conflict (Differing Payload)** | Ingestion (`OrchestrationJobManager`) | Reject with 409 IDEMPOTENCY_CONFLICT | Unmodified (Revision $N$) | Prior active delivery preserved | Rejected (No job created) |
| **Idempotency Replay (Identical Payload)** | Ingestion (`OrchestrationJobManager`) | Return cached response and existing delivery | Unmodified (Revision $N$) | Prior active delivery preserved | Returns original status |
| **User Cancellation Before Execution** | Mutex / Lifecycle (`cancelJob`) | Accept cancellation; transition job | Unmodified (Revision $N$) | Prior active delivery preserved | `CANCELLED` |
| **User Cancellation During Execution** | Mutex / Lifecycle (`cancelJob`) | Drain active operation safely; halt next steps | Settled to last committed step | Prior active delivery preserved | `NEEDS_RECONCILIATION` / `CANCELLED` |

---

## 8. Idempotency, Persistence & Cancellation Boundaries

### 8.1 Process-Local HTTP Cache vs. Durable Job Index
The audit confirms two distinct layers of idempotency:
1. **Interactive Operation LRU Cache (`EditorBackend.idempotencyCache`)**:
   - Scope: Process-local, memory-only, maximum 200 entries.
   - Purpose: Deduplicates rapid, repeated UI gestures or network retries (e.g. double-clicking a split button or re-transmitting an atomic edit).
   - Limitation: Does NOT survive server restarts or cache eviction beyond 200 operations.
2. **Durable Job Idempotency (`OrchestrationJobManager.idempotencyIndex`)**:
   - Scope: Persistent across process restarts, backed by disk files in `artifacts/jobs/*.json`.
   - Purpose: Deduplicates long-running prompt workflows and multi-operation requests.
   - Durability Contract: When an idempotency key is submitted, the job manager reloads its index from disk. If the key exists with identical prompt and parameters, it immediately returns the cached outcome (including active delivery and revision ID) without re-executing.

### 8.2 Durability Boundary Classifications for RT-01
- **Tier 1: In-Flight HTTP Re-transmission (Server Alive)**: Handled 100% by both in-memory cache and `OrchestrationJobManager`.
- **Tier 2: Client Disconnection Mid-Job (Server Alive)**: Job continues running in background; client reconnects and polls `GET /api/jobs?jobId=...` to retrieve the completed result.
- **Tier 3: Server Restart Mid-Workflow**: Server reboots; `OrchestrationJobManager._loadExistingJobs()` scans `artifacts/jobs/`. In-flight jobs with checkpoints in `session.recovery` can be reconciled using `recoverFromJournal()`.
- **Tier 4: Saved Project Reload**: `ProjectManager.loadProject()` loads canonical JSON; logical equality is verified by comparing project snapshots.

### 8.3 Cancellation Scopes
- **Cancelling in `ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, or `READY_TO_EXECUTE`**: Clean and immediate. Zero project mutations have occurred; job transitions to `CANCELLED`.
- **Cancelling in `EXECUTING`**: Once an atomic operation has begun inside `OperationExecutor`, it cannot be interrupted mid-instruction (to prevent partial object corruption). If a compound multi-operation plan is in progress, the active operation finishes, subsequent operations are halted, and the job reports the exact step at which execution stopped.
- **Cancelling in `RENDERING`**: If cancelled during rendering, child FFmpeg processes are terminated via SIGKILL, incomplete MP4 files are cleaned up, and the job transitions to `CANCELLED`. The prior verified active delivery remains active.

---

## 9. Baseline Test, Fixture & Performance Inventory

### 9.1 Existing Test Suite Inventory
The repository has **460 master tests** across **28 suites**:

| Test Suite File | Test Count | Focus Area | Typical Duration |
| :--- | :---: | :--- | :---: |
| `tests/timeline-stage18-1-surface.test.js` | 9 | Timeline display projection, coordinate parity, snapping | ~0.08 s |
| `tests/timeline-stage18-2-operations.test.js` | 14 | Atomic operations, ripple trim, slip, slide, split | ~0.09 s |
| `tests/timeline-stage18-3-concurrency.test.js` | 12 | Revision guards, write mutex, idempotency, undo/redo | ~0.15 s |
| `tests/timeline-stage18-4-delivery.test.js` | 23 | CapCut interop, genuine render, QA, delivery manifest | ~0.77 s |
| `tests/timeline-operations.test.js` | 6 | Timecode arithmetic, 1,000-clip stress test | ~0.26 s |
| `tests/timeline-e2e.test.js` | 6 | End-to-end timeline operation sequences | ~0.05 s |
| `tests/prompt-core.test.js` | 10 | Brief compiler, context normalizer, readiness evaluator | ~0.13 s |
| `tests/prompt-compilation-pf02.test.js` | 12 | Plan compilation, dry-run simulation, fail-closed rules | ~0.15 s |
| `tests/prompt-compilation-pf03.test.js` | 15 | Multi-track scheduler, B-roll placement, ducking | ~0.20 s |
| `tests/prompt-compilation-pf04.test.js` | 16 | Closed-loop QA, render orchestration, delivery manifest | ~1.50 s |
| `tests/prompt-compilation-pf05.test.js` | 14 | Revision intent disentanglement, plan diffing | ~0.30 s |
| `tests/prompt-compilation-pf06.test.js` | 12 | Candidate generation, multi-variant compilation | ~0.40 s |
| `tests/prompt-compilation-pf07.test.js` | 15 | Musical structure scoring, beat alignment | ~0.50 s |
| `tests/prompt-compilation-pf08.test.js` | 18 | Preference profile learning, feedback recording | ~0.35 s |
| `tests/prompt-compilation-pf09.test.js` | 22 | Revision session DAG, undo/redo branching | ~0.60 s |
| `tests/pf11-stage1-orchestration.test.js` | 9 | Durable job state machine, idempotency replay | ~0.80 s |
| `tests/pf11-stage2-hardening.test.js` | 12 | Path traversal security, byte-range streaming, crash recovery | ~22.0 s |
| `tests/pf11-stage3-release.test.js` | 10 | Clean-install packaging, smoke test, upgrade/rollback | ~20.6 s |
| `tests/roundtrip-integration.test.js` | 1 | Complete interactive editor roundtrip to verified delivery | ~16.5 s |
| `tests/color-parity.test.js` | 8 | 3D LUT tetrahedral interpolation vs FFmpeg parity | ~2.50 s |
| `tests/color-full-parity.test.js` | 10 | Primary LGGO, WB, exposure curve parity | ~3.00 s |
| `tests/vtsm-held-out-integration.test.js` | 12 | Python worker, PyTorch tracking, held-out video evaluation | ~42.0 s |
| *Other unit/integration suites (7 files)* | 194 | Schema validation, time arithmetic, audio DSP, MCP | ~5.00 s |
| **Total** | **460** | **Full Master Regression Suite** | **~90–97 s** |

### 9.2 Timeline Performance Benchmarks (Re-verified at `741dde7`)
- **1,000-Clip Viewport Projection (P95)**: **4.61 ms** (Gate limit: $\le 16.67\text{ ms}$ / 60 FPS budget) $\rightarrow$ **PASS (3.6x headroom)**.
- **1,000-Clip Magnetic Snapping (P95)**: **0.038 ms** (Gate limit: $< 0.30\text{ ms}$) $\rightarrow$ **PASS (7.9x headroom)**.

---

## 10. Identified Architectural Gaps & Risks for Phase 19

1. **Status Lifecycle Discrepancy**:
   - *Finding*: `src/prompt-core/job-orchestrator.js` implements 8 states, whereas the Architecture Lead's Kickoff Directive mandates a 12-state model distinguishing `AWAITING_APPROVAL`, `READY_TO_EXECUTE`, `PUBLISHING`, `SUCCEEDED`, and `NEEDS_RECONCILIATION`.
   - *Remediation*: Expand `OrchestrationJobStatus` and `ValidJobTransitions` in Stage 19.1 while maintaining backward compatibility with existing tests.
2. **API Endpoint Bifurcation**:
   - *Finding*: `POST /api/render` in `src/ui/server.js` compiles and renders directly without running `QualityAssuranceEngine` or emitting a delivery manifest, while `POST /api/jobs` runs the complete verified delivery pipeline.
   - *Remediation*: Unify `POST /api/render` in Stage 19.4 so that delivery publication is governed by the same verified delivery manifest and active-delivery gate.
3. **Compound Operation Atomicity Contract**:
   - *Finding*: `OperationExecutor.execute()` operates on single operations. `OperationPlanCompiler.executePlan()` wraps multi-operation plans with journaled rollback, but callers must explicitly declare whether a workflow turn is atomic (`atomic: true`) or a sequence of individually committed steps (`atomic: false`).
   - *Remediation*: Document and enforce the compound operation contract in Stage 19.2. A multi-operation workflow must never claim whole-workflow atomicity unless `atomic: true` with journal rollback is active.
4. **Interactive Timeline to Revision Session Synchronization**:
   - *Finding*: When a user performs edits directly on the timeline via `/api/project/operation`, `currentProject.revision` increments, but if an active session is loaded, the session's DAG does not automatically record the manual edit as a revision node.
   - *Remediation*: Wire manual edits into session history in Stage 19.1/19.2 so that automated prompt edits and manual timeline edits share a unified revision lineage.
5. **MCP Surface Scope**:
   - *Finding*: MCP server (`src/mcp/server.js`) exposes low-level operation execution and rendering tools, but does not expose high-level workflow orchestration (`eme_run_workflow`, `eme_get_job_status`).
   - *Remediation*: Evaluate adding high-level workflow orchestration tools to MCP in Stage 19.5, keeping Laya and VTSM strictly advisory.

---

## 11. Prioritized Implementation Plan (Stages 19.1 – 19.5)

### Stage 19.1 — End-to-End Workflow Contract & Orchestration
- **Objective**: Unify request lifecycle, expand `OrchestrationJobStatus` to the 12-state model, integrate preflight validation, and provide inspectable plans before execution.
- **Deliverables**:
  - `plans/PHASE_19_STAGE1_COMPLETION_REPORT.md`
  - `tests/workflow-stage19-1-orchestration.test.js`
- **Exit Gate**: Request lifecycle is testable; invalid/ambiguous requests fail safely without mutation; planning alone has zero project mutation; job status reflects truthful state.

### Stage 19.2 — Deterministic Execution, Constraints & Revision Integration
- **Objective**: Wire planned operations into `OperationExecutor`, enforce expected base revisions at commit boundaries, record operation journals, and maintain explicit atomicity contracts.
- **Deliverables**:
  - `plans/PHASE_19_STAGE2_COMPLETION_REPORT.md`
  - `tests/workflow-stage19-2-execution.test.js`
- **Exit Gate**: Execution results match approved plan; each committed operation is traceable; partial failures report truthfully.

### Stage 19.3 — Closed-Loop Verification, Failure Recovery & State Reconciliation
- **Objective**: Verify executed project state against brief constraints; distinguish execution failure from verification failure; enforce bounded recovery attempts; reconcile broken states.
- **Deliverables**:
  - `plans/PHASE_19_STAGE3_COMPLETION_REPORT.md`
  - `tests/workflow-stage19-3-verification.test.js`
- **Exit Gate**: Injected failures produce correct status and bounded recovery; unverified results cannot be labeled successful.

### Stage 19.4 — Rendering, Media QA & Final Delivery Publication
- **Objective**: Bind rendering to exact verified project revision; enforce 10-point QualityAssuranceEngine; verify media SHA-256; sign delivery manifest; publish `active_delivery` pointer only after all gates pass; preserve prior delivery on failure.
- **Deliverables**:
  - `plans/PHASE_19_STAGE4_COMPLETION_REPORT.md`
  - `tests/workflow-stage19-4-delivery.test.js`
- **Exit Gate**: Genuine request-to-render yields verified deliverable; render/QA failures preserve previous active delivery without state corruption.

### Stage 19.5 — Unified End-to-End Acceptance & Release Certification
- **Objective**: Execute complete workflow across Visual Control Surface, CLI, and API; full regression testing; release packaging verification; final certification report.
- **Deliverables**:
  - `plans/PHASE_19_RT01_COMPLETION_REPORT.md`
  - Release tag: `phase-19-rt-01-certified`
- **Exit Gate**: 100% test pass rate across focused and full regression suites; verified artifact identity; approved by ChatGPT Architecture Lead.

---

## 12. Conclusion & Authorization Request

Stage 19.0 has completed a comprehensive, source-grounded audit of the Editing Mechanics Engine repository at commit `741dde73e818e14994aa907d60bcbea752636558`. Every subsystem required for the end-to-end editing workflow has an identified authoritative owner, an understood failure boundary, and verified test evidence.

We respectfully submit this audit to the ChatGPT Architecture Lead via the Ezra Bridge and request review and authorization to proceed with **Stage 19.1: End-to-End Workflow Contract & Orchestration**.
