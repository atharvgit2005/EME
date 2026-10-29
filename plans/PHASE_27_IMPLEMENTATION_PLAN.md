# Milestone Phase 27 Implementation Plan: Closed-Loop Audio Defect Repair & Automated Retiming

**Milestone**: Phase 27 — Closed-Loop Audio Defect Repair & Automated Retiming
**Branch**: `feature/phase-27-audio-repair-engine`
**Base Certified Release**: `phase-26-certified` (`b8098ce35138c3e4a63a81bf7522a0fb00410f74`)
**Architecture Lead Authority**: ChatGPT Architecture Lead
**Reference Authorization**: `plans/CHATGPT_PHASE26_UNCONDITIONAL_RELEASE_CERTIFICATION.md`
**Date**: October 22, 2026
**Status**: Ready for Architecture Lead Plan Review & Authorization

---

## 1. Executive Summary & Architectural Scope

Following the unconditional certification of **Milestone Phase 26** (`phase-26-certified`), Phase 27 delivers the next major subsystem: **Closed-Loop Audio Defect Repair & Automated Retiming**.

Phase 25 provided read-only audio perception and objective QA (`EarshotAdapter`), while Phase 26 introduced declarative sound kits and deterministic role placement (`EarshotSoundKit` & `RolePlacementEngine`). Phase 27 closes the loop: consuming measured audio defects, synthesizing minimal bounded repair operations, executing mutations exclusively through the canonical `OperationExecutor`, rerendering the master media, and validating the acoustic outcome with closed-loop QA before promoting a delivery.

### Absolute Architectural Invariants:
1. **Zero Direct Mutation from Perception**: Neither Earshot, nor the worker bridge, nor perception adapters may mutate canonical project state. All changes are proposed as canonical operations and executed exclusively by `OperationExecutor`.
2. **Separation of Proposal vs. Render vs. Delivery**:
   - Proposed Repair $\to$ Committed Mutation $\to$ Rerendered Output $\to$ Closed-Loop QA Audit $\to$ Active Delivery Promotion.
   - Placement arithmetic alone is never accepted as proof of acoustic correctness; only rerendered audio passing QA satisfies acceptance.
3. **Safe Bounds & Reversible Transactions**:
   - Audio repairs enforce non-negative start tick bounds ($t_{\text{start}} \ge 0$).
   - Bounded retiming windows (default max $\pm 1000\text{ms}$ / $\pm 120,000\text{ ticks}$).
   - Pre-condition verification against project revision.
   - Ambiguous states transition to `NEEDS_RECONCILIATION`; existing active delivery is preserved untouched on failure.
4. **Frozen Canonical Schemas & Zero Runtime Dependencies**:
   - Preserves all 18 canonical schemas in `schema/*.v1.schema.json`.
   - Core `package.json` preserves `"dependencies": {}`.
   - Internal repair contract schemas reside in `src/audio/schemas/`.

---

## 2. Stage Breakdown & Deliverables

### Stage 27.1: Repair Finding Ingestion & Candidate Proposal Engine
- **Deliverables**:
  - `src/audio/schemas/audio-repair-contract.v1.json`: Draft 2020-12 schema defining structured repair proposals, findings, actions, and safety boundaries.
  - `src/audio/repair/audio-repair-planner.js`: Core planner converting `EarshotAdapter` findings (`CHK_EARSHOT_SYNC`, `CHK_EARSHOT_TRUE_PEAK`, `CHK_EARSHOT_SFX_INTEGRITY`) into actionable repair proposals:
    * `SYNC_RETIME`: Converts measured cut-transient offset ($t_{\text{sound}} - t_{\text{cut}}$) into exact tick shift: $\Delta_{\text{ticks}} = -\text{round}(\Delta_{\text{offset}} \times 120,000)$.
    * `PEAK_ATTENUATION`: Reduces clip gain/envelope when true-peak ceiling is exceeded.
    * Bounds checking: Rejects shifts that would cause $t_{\text{start}} < 0$ or cause track collision with non-retimeable clips.
- **Verification**: `tests/workflow-stage27-1-repair-planner.test.js` (Unit validation of finding ingestion, calculation accuracy, bounds enforcement, and rejection of unsafe shifts).

### Stage 27.2: Canonical Operation Compilation & Precondition Validation
- **Deliverables**:
  - `src/audio/repair/repair-operation-compiler.js`: Compiles repair proposals into canonical operations:
    * `move_clip`: Shifts clip start time by $\Delta_{\text{ticks}}$.
    * `set_audio_envelope`: Adjusts gain curves or adds ducking nodes.
  - Precondition validation against current project revision, track locking status, and timeline consistency.
  - Routes mutations strictly through `OperationExecutor` with transactional undo/redo rollback capability.
- **Verification**: `tests/workflow-stage27-2-operation-compiler.test.js` (Validates operation compilation, schema adherence, atomic execution, rollback preservation).

### Stage 27.3: Deterministic Controlled Audio-Sync Defect Scenario (Fixture & Execution)
- **Deliverables**:
  - Synthetic controlled project fixture with calibrated $+150\text{ms}$ (+18,000 ticks) audio transient latency relative to video cut.
  - End-to-end execution of the 5-step repair loop:
    1. **Detect**: `EarshotAdapter.auditAudioQuality` detects $+150\text{ms}$ sync offset ($0.99+$ confidence).
    2. **Plan**: `AudioRepairPlanner` formulates `SYNC_RETIME` proposal with $-18,000\text{ ticks}$ shift.
    3. **Execute**: `OperationExecutor` executes `move_clip` operation; project advances to revision $R+1$.
    4. **Verify**: Rerenders master mix via `mixAudioLayers`; runs `EarshotAdapter` on rendered audio. Rerendered audio measures $\le 1\text{ms}$ sync offset.
    5. **Acoustic Confirmation**: Proof that physical sound transient aligns with the visual cut in the actual rendered audio.
- **Verification**: `tests/workflow-stage27-3-sync-repair-scenario.test.js`.

### Stage 27.4: Active Delivery Promotion & Failure Isolation
- **Deliverables**:
  - `src/audio/repair/audio-repair-coordinator.js`: High-level lifecycle coordinator managing the repair, rerender, QA, and delivery promotion pipeline.
  - Delivery promotion invariants:
    * Existing active delivery preserved completely untouched until every QA check passes on the new render.
    * On QA failure or timeout: Project rolls back mutation or marks candidate as quarantined; existing active delivery remains active.
    * Ambiguous final states (e.g., render success but QA worker crash) set delivery status to `NEEDS_RECONCILIATION`.
    * Never reports a mutation as rolled back if project state could not be verified.
- **Verification**: `tests/workflow-stage27-4-delivery-protection.test.js` (Validates promotion gating, failure rollback, quarantine, and state consistency).

### Stage 27.5: Closed-Loop End-to-End Verification & Cumulative Regression
- **Deliverables**:
  - Multi-defect repair scenario: handles sync defect + true-peak overflow sequentially.
  - Comprehensive end-to-end workflow test connecting brief $\to$ placement $\to$ initial render $\to$ defect detection $\to$ automated repair $\to$ rerender $\to$ closed-loop QA certification.
  - Full cumulative regression battery across Phases 21 through 27 (targeting 177+ passing tests).
- **Verification**: `tests/workflow-stage27-audio-repair.test.js`.

---

## 3. Test Accounting Matrix

| Stage | Test Suite File | Planned Tests | Focus |
|:---|:---|:---:|:---|
| **27.1** | `tests/workflow-stage27-1-repair-planner.test.js` | 7 | Finding ingestion, tick math, bounds checking, rejection of invalid offsets |
| **27.2** | `tests/workflow-stage27-2-operation-compiler.test.js` | 6 | Canonical operation translation, revision checks, OperationExecutor execution |
| **27.3** | `tests/workflow-stage27-3-sync-repair-scenario.test.js` | 6 | Controlled +150ms defect detection, retiming, rerender, and acoustic verification |
| **27.4** | `tests/workflow-stage27-4-delivery-protection.test.js` | 6 | Active delivery preservation, failure rollback, NEEDS_RECONCILIATION |
| **27.5** | `tests/workflow-stage27-audio-repair.test.js` | 5 | End-to-end multi-defect closed-loop repair and cumulative regression |
| **Total** | **Phase 27 Battery** | **30** | **Complete Closed-Loop Audio Defect Repair Engine** |

---

## 4. Execution Directives & Prompts
In strict adherence to the Architecture Lead's authorization:
- Execution prompt directive: `Use required GSD actions to achieve the goals and wherever needed.`
- All operations adhere to frozen schemas and zero runtime dependencies.
- Submissions will be sent to ChatGPT Architecture Lead for formal Plan Authorization prior to merging.
