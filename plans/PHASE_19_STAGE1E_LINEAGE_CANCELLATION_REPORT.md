# Phase 19 (RT-01) — Stage 19.1E: Revision Lineage & Cancellation Contract Report

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.1E — Revision Lineage and Cancellation Contract  
**Document**: `plans/PHASE_19_STAGE1E_LINEAGE_CANCELLATION_REPORT.md`  
**Prerequisite**: Stages 19.1A through 19.1D Reports  
**Architecture Lead Directive**: Section 6 of `plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md`  

---

## 1. Executive Summary

This report establishes the contracts for:
1. **Manual Timeline Edit Lineage**: Synchronizing direct Visual Control Surface operations (`POST /api/project/operation`) with the revision session DAG history (`session.history`), ensuring manual edits never invisibly diverge from automated prompt revisions.
2. **Transaction-Bounded Cancellation**: Defining cancellation as an orderly settlement at valid transaction boundaries rather than an unsafe mid-instruction interrupt.

---

## 2. Manual Timeline Edit Lineage Contract

### 2.1 Problem Identified in Audit
Direct Visual Control Surface operations (e.g. split, trim, ripple delete, move, color grade adjustment) execute through `OperationExecutor.execute()` on `POST /api/project/operation`. While this correctly increments `currentProject.revision`, previous implementations did not append a corresponding node to `session.history`. As a result, subsequent prompt-driven workflows checking `session.active_delivery.revision_id` could perceive an inconsistent project state.

### 2.2 Synchronized Lineage Specification
Whenever `POST /api/project/operation` commits successfully and an active session is loaded:
1. **Append Manual History Node**:
   ```javascript
   const currentRev = this.currentProject.revision;
   const prevRevId = this.activeSession.active_delivery?.revision_id || 
                     (this.activeSession.history.length > 0 ? this.activeSession.history[this.activeSession.history.length - 1].revision_id : 'rev-0');
   const nextRevId = `rev-manual-${currentRev}`;

   this.activeSession.history.push({
     revision_id: nextRevId,
     predecessor_id: prevRevId,
     origin: 'manual_vcs',
     operation: {
       type: op.type,
       operationId: opId || `op-manual-${Date.now()}`
     },
     status: 'committed',
     timestamp: new Date().toISOString(),
     _project: structuredClone(this.currentProject)
   });
   ```
2. **Active-Delivery Preservation**:
   - `this.activeSession.active_delivery` is **NOT** modified by manual edits. It continues to point to the last verified render deliverable.
   - The UI displays that the current timeline revision is unrendered relative to the active delivery.
3. **Automated Base Revision Currency**:
   - When a subsequent automated prompt workflow runs, it resolves `effectiveProject` to the latest manual revision snapshot (`_project`).
   - If the request specified an `expectedBaseRevision` that does not match this manual revision, it fails closed with `409 STALE_REVISION`, preventing race conditions between human and AI editing.

---

## 3. Orderly Cancellation Contract

### 3.1 Pre-Execution Phase (`ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, `READY_TO_EXECUTE`)
- **Action**: Immediate cancellation accepted.
- **Project State**: Revision $N$ (completely unaltered).
- **Session State**: `active_delivery` preserved; DAG history unchanged.
- **Job Status**: Terminal `CANCELLED`.
- **Side Effects**: 0 disk or media side effects.

### 3.2 Execution Phase (`EXECUTING`)
- **Atomic Operations Invariant**: An active instruction inside `OperationExecutor` runs to completion to avoid memory corruption.
- **Multi-Operation Plans (`atomic: true`)**:
  - The staged candidate clone is discarded.
  - The execution journal records status: `cancelled`.
  - Canonical project remains at revision $N$.
  - Job transitions to `CANCELLED`.
- **Multi-Operation Plans (`atomic: false`)**:
  - Remaining unexecuted steps are halted.
  - Completed steps remain committed at revision $N+k$.
  - Job transitions to `CANCELLED` with metadata `{ cancelled_at_step: k, committed_revision: N+k }`.

### 3.3 Rendering Phase (`RENDERING`)
- **Process Termination**: Child process tree (`ffmpeg`, headless browser) is sent `SIGTERM`, followed by `SIGKILL` if still alive after 2,000 ms.
- **Artifact Hygiene**: Incomplete, truncated `.mp4` or `.tmp` files are purged from disk.
- **Publication Prevention**: Delivery manifest is NOT emitted; `active_delivery` remains untouched.
- **Job Status**: Terminal `CANCELLED`.

### 3.4 Verification & Publication Phase (`VERIFYING`, `PUBLISHING`)
- Once `PUBLISHING` begins writing the signed manifest and swapping the `active_delivery` pointer, cancellation is rejected with `409 CONFLICT` (point of no return reached).
- If the response was lost, recovery inspects the manifest to determine whether publication completed before reporting final status.
