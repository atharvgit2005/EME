# Phase 19 (RT-01) — Stage 19.2A: Golden Workflow Contract & Fixture Specification

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.2 — End-to-End Golden Workflows, Multi-turn Revision DAGs & Cross-System Integration  
**Document**: `plans/PHASE_19_STAGE2A_GOLDEN_WORKFLOW_CONTRACT.md`  
**Architecture Lead Directive**: Section 3 of `plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md`  
**Prerequisites**: Stage 19.1 Implementation Accepted (`plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md`)  

---

## 1. Executive Summary & Architecture Foundation

The governing principle of EME Stage 19.2 is:
> **One canonical project, one authoritative operation engine, one validated workflow lifecycle, and a traceable revision lineage across editing turns.**

This document establishes the exact deterministic specifications for the **10 Mandatory Golden Workflow Scenarios** (Scenarios A through J). These golden workflows test and certify the real integration path connecting:
1. **Request Intake & Preflight**: `extractIntentEnvelope`, `compileEditBrief`, `ReadinessEvaluator`.
2. **Plan Compilation & Scheduling**: `OperationPlanCompiler`, `MultiTrackScheduler`.
3. **Approval & Clarification Gates**: `submitApproval` (`action: 'approve'` vs `action: 'clarify'`).
4. **Deterministic Timeline Operations**: `OperationExecutor` (22 canonical operations).
5. **Session DAG & Provenance**: `RevisionSessionManager`, `session.history`, `concurrency.version`.
6. **Durable Job State Machine**: `OrchestrationJobManager` (canonical 12 states).
7. **Delivery Publication & Verification**: `RenderOrchestrator`, `QualityAssuranceEngine`, fail-safe `active_delivery` preservation.

---

## 2. Deterministic Golden Fixture Baseline

All golden workflow scenarios execute against version-controlled, reproducible fixtures with fixed deterministic timebases:
- **Canonical Timebase**: `ticksPerSecond: 120,000`, `endpointConvention: "half-open"`.
- **Primary Visual Track**: `track_v_main` (1080x1920 vertical canvas, 30 fps).
- **Secondary Visual Track**: `track_v_broll`.
- **Graphics Track**: `track_graphics` (title and caption overlays).
- **Audio Track**: `track_a_music` (soundtrack).
- **Baseline Project Fixture**: `fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json` (duration 1,440,000 ticks = 12.0s).
- **Baseline Beat Analysis**: `fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json`.

---

## 3. The 10 Golden Workflow Scenarios (A through J)

### Scenario A: Valid Single-Turn Edit
- **Objective**: Execute a clear, supported request through the entire automated pipeline to terminal success.
- **Initial State**:
  - Session: `sess-golden-A`, State: `ready`, Revision: `rev-0`, Concurrency Version: 1.
  - Active Delivery: `manifest_id: "mf-001"`, Media: `clean-12s.mp4`, Revision: `rev-0`.
- **User Request**: `"Move headline title 1 second later on track_graphics. Preserve duration."`
- **Preflight & Intent**:
  - `extractIntentEnvelope` resolves target `track_graphics` and change delta (+120,000 ticks).
  - `compileEditBrief` status: `ready`.
- **Plan Compilation**:
  - Single operation: `move_clip` on headline clip from `startTick: 0` to `startTick: 120000`.
  - Plan base revision: `project.revision`.
  - Plan hash: SHA-256 over canonical operations.
- **Approval Requirement**: None (`requireApproval: false`).
- **Execution**:
  - Preconditions validated against live project revision.
  - `OperationExecutor` executes `move_clip`.
- **Post-Execution & Delivery**:
  - Render generated and verified by `QualityAssuranceEngine` (Score $\ge 90$).
  - Signed delivery manifest emitted (`manifest_id: "mf-rev-1"`).
  - Session DAG appends `rev-1` (`origin: 'prompt_workflow'`).
  - `session.active_delivery` atomically swaps to `mf-rev-1`.
  - Job status reaches terminal `SUCCEEDED`.

---

### Scenario B: Clarification Before Execution
- **Objective**: Ensure that ambiguous targets or contradictory constraints halt non-mutating in `AWAITING_APPROVAL` with `awaitingReason: 'clarification'`.
- **Initial State**:
  - Session: `sess-golden-B`, State: `ready`, Revision: `rev-0`.
- **User Request**: `"Make warmer by changing color grade. Preserve existing color grade unchanged."`
- **Preflight & Intent**:
  - `ReadinessEvaluator` detects explicit contradiction between color modification request and invariant preservation constraint.
  - `validation.status: 'needs_clarification'`.
- **Execution Boundary**:
  - Execution is **blocked**.
  - Job transitions to `AWAITING_APPROVAL` with `awaitingReason: 'clarification'`.
  - Canonical project content and revision remain **100% unaltered**.
  - `session.active_delivery` remains pointed at `rev-0`.
- **Clarification Turn**:
  - Caller submits `action: 'clarify'` with `clarification: 'User confirms: adjust white balance warmer only'`.
  - Job transitions back to `PLANNING` for deterministic recompilation.

---

### Scenario C: Approval of a Valid Plan
- **Objective**: Verify that workflow pauses non-mutating in `AWAITING_APPROVAL` and that approval strictly verifies plan hash and base revision.
- **Initial State**:
  - Session: `sess-golden-C`, Revision: `rev-0`.
- **User Request**: `"Trim clip_1 by 1 second"`, with `options.requireApproval: true`.
- **Preflight & Planning**:
  - Plan compiled with `plan_hash: "hash-c-001"`, `base_revision: 1`.
  - Job transitions: `ACCEPTED` $\to$ `PLANNING` $\to$ `AWAITING_APPROVAL` (`awaitingReason: 'approval'`).
- **Non-Mutating Pause**:
  - Zero project mutations, zero disk render files.
- **Verification Gates**:
  1. Approval with mismatched plan hash (`hash-different`) $\to$ **Throws Error / Fails Closed**.
  2. Approval with mismatched base revision (`base_revision: 99`) $\to$ **Throws Error / Fails Closed**.
  3. Approval with matching hash and base revision $\to$ Transitions to `READY_TO_EXECUTE` and executes to completion.

---

### Scenario D: Multi-Turn Revision Session
- **Objective**: Chain multiple consecutive prompt revisions while maintaining strict predecessor tracking and context continuity.
- **Initial State**: Base session at `rev-0`.
- **Turn 1**:
  - Request: `"Trim clip_1 by 500ms"`.
  - Execution: Revisions advance $1 \to 2$.
  - Lineage: Node `rev-1` created with `predecessor_id: 'rev-0'`.
  - Active Delivery: Swaps to `rev-1`.
- **Turn 2**:
  - Request: `"Add 1-second B-roll cutaway during middle section"`.
  - Context: Resolves project at `rev-1`.
  - Lineage: Node `rev-2` created with `predecessor_id: 'rev-1'`.
  - Active Delivery: Swaps to `rev-2`.
- **Turn 3**:
  - Request: `"Shift headline text to start at 2 seconds"`.
  - Context: Resolves project at `rev-2`.
  - Lineage: Node `rev-3` created with `predecessor_id: 'rev-2'`.
  - Active Delivery: Swaps to `rev-3`.
- **Invariant**: Every turn correctly verifies that `base_revision` equals the predecessor's revision.

---

### Scenario E: Manual Timeline Edit Between Automated Turns
- **Objective**: Demonstrate that manual Visual Control Surface edits seamlessly synchronize into the revision session DAG and update the base revision for subsequent prompt turns.
- **Initial State**: Session at `rev-1` (after an automated prompt edit).
- **Sequence**:
  1. **Manual Visual Control Surface Operation**:
     - User executes `split_clip` via `POST /api/project/operation`.
     - `OperationExecutor` executes split on `currentProject` (revision advances $2 \to 3$).
     - Server synchronizes DAG: appends `{ revision_id: 'rev-manual-3', predecessor_id: 'rev-1', origin: 'manual_vcs', status: 'committed', _project }` to `session.history`.
     - `session.concurrency.version` increments.
     - **Active Delivery Invariant**: `session.active_delivery` continues pointing to `rev-1` (manual edit is unrendered).
  2. **Subsequent Automated Prompt Workflow**:
     - User requests `"Move headline title 1 second later"`.
     - The orchestrator resolves `effectiveProject` to `rev-manual-3`.
     - Plan compiles on base revision 3.
     - New revision `rev-4` is committed with `predecessor_id: 'rev-manual-3'`.
     - Upon render and QA pass, `session.active_delivery` updates to `rev-4`.

---

### Scenario F: Stale Plan Rejection
- **Objective**: Guarantee that plans compiled against a superseded revision cannot be executed against newer project snapshots.
- **Initial State**: Canonical project at revision $N$.
- **Sequence**:
  1. Caller compiles an operation plan expecting base revision $N$.
  2. Before execution occurs, another authorized operation (e.g. manual edit or concurrent job) executes, advancing canonical project to $N+1$.
  3. Caller attempts to execute original plan with `expectedBaseRevision: N`.
- **Outcome**:
  - Pre-execution guard rejects execution with `409 STALE_REVISION`.
  - Live project remains at revision $N+1$.
  - Job transitions to `FAILED` with explicit error: `Stale base revision: expected N, current N+1`.

---

### Scenario G: Atomic Multi-Operation Failure (`atomic: true`)
- **Objective**: Certify that compound multi-step plans roll back cleanly on failure, leaving live canonical project content and revision completely unaltered.
- **Initial State**: Project at revision $N$.
- **Sequence**:
  1. Plan contains 3 operations: Step 0 (split), Step 1 (move), Step 2 (trim).
  2. Execution options specify `atomic: true` and inject synthetic failure at Step 1.
- **Outcome**:
  - Step 0 executes against isolated staged clone candidate.
  - Step 1 fails.
  - Staged clone is **discarded**.
  - Execution journal written to disk with `status: 'rolled_back'`, `executed_steps: 1`, `failed_step_index: 1`.
  - Canonical project remains strictly at revision $N$ with original clip layout.
  - Job status transitions to `FAILED`.

---

### Scenario H: Non-Atomic Partial Failure (`atomic: false`)
- **Objective**: Certify that non-atomic plans record partial progress accurately without misrepresenting outcome as a rollback or full success.
- **Initial State**: Project at revision $N$.
- **Sequence**:
  1. Plan contains 3 operations. Execution options specify `atomic: false` with failure injected at Step 2.
- **Outcome**:
  - Steps 0 and 1 execute and commit sequentially to live project (advancing revision to $N+2$).
  - Step 2 fails.
  - Remaining unexecuted steps are halted.
  - Execution journal records `status: 'partially_executed_failed'`, `executed_steps: 2`, `failed_step_index: 2`, `committed_revision: N+2`.
  - Job transitions to `FAILED`.
  - Caller receives exact metadata indicating partially committed steps and final revision.

---

### Scenario I: Duplicate Workflow Submission & Idempotency
- **Objective**: Certify durable job idempotency preventing duplicate execution or competing commits.
- **Initial State**: Job manager initialized with storage directory.
- **Sequence**:
  1. Submit workflow with `idempotencyKey: 'idemp-golden-001'` and prompt $P_1$.
  2. Job runs to terminal `SUCCEEDED`.
  3. Retry request identical in key and payload:
     - Returns cached outcome immediately (`fromCache: true`) without re-execution.
  4. Submit conflicting request with same `idempotencyKey: 'idemp-golden-001'` but different prompt $P_2$:
     - Rejects immediately with `409 IDEMPOTENCY_CONFLICT`.

---

### Scenario J: Failed Workflow Preserves Prior Verified Delivery
- **Objective**: Guarantee that when an edit commits operations but fails during rendering or QA verification, the prior verified active delivery remains active.
- **Initial State**: Session has verified `active_delivery: { revision_id: 'rev-0', manifest_id: 'mf-initial' }`.
- **Sequence**:
  1. Workflow executes operations successfully, advancing project revision.
  2. Render failure or media QA audit failure is triggered (`simulateRenderFail: true` or `simulateQaFail: true`).
- **Outcome**:
  - Failed revision recorded in `session.history` with `status: 'failed'`.
  - Job transitions to `FAILED`.
  - **Non-Negotiable Invariant**: `session.active_delivery` strictly remains `{ revision_id: 'rev-0', manifest_id: 'mf-initial' }`.
  - Unverified or broken media is never published as active.

---

## 4. Multi-Turn Revision DAG & Provenance Data Model

To ensure strict separation between the **Project Revision DAG** and the **Workflow Job Lifecycle**, each revision node records:
```json
{
  "revision_id": "rev-manual-3",
  "predecessor_id": "rev-1",
  "origin": "manual_vcs",
  "operation": {
    "type": "split_clip",
    "operationId": "op-manual-1771480000"
  },
  "status": "committed",
  "timestamp": "2026-10-21T00:15:00.000Z",
  "_project": { /* full canonical project snapshot at revision 3 */ }
}
```

For prompt-driven revisions:
```json
{
  "revision_id": "rev-4",
  "predecessor_id": "rev-manual-3",
  "origin": "prompt_workflow",
  "prompt": "Move headline title 1 second later",
  "job_id": "job_1771481000",
  "plan_hash": "a1b2c3d4e5f6...",
  "status": "committed",
  "manifest_id": "mf-rev-4",
  "media_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "media_path": "artifacts/deliverables/rev-4-master.mp4",
  "qa_score": 98,
  "timestamp": "2026-10-21T00:16:00.000Z",
  "_project": { /* full canonical project snapshot at revision 4 */ }
}
```

---

## 5. Verification Fixture & Test Suite Architecture

The 10 golden scenarios are codified into the test suite `tests/workflow-stage19-2-execution.test.js`:
- Each test runs deterministically with synthetic or pre-compiled assets.
- No network dependencies or non-deterministic delays.
- Clean isolation of temporary test output directories under `artifacts/test-stage19-2/`.
