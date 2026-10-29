# Phase 19 (RT-01) — Stage 19.2B: Multi-Turn Revision DAG & Provenance Integration Report

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.2C — Multi-Turn Revision DAG & Provenance Integration  
**Document**: `plans/PHASE_19_STAGE2B_REVISION_LINEAGE_REPORT.md`  
**Architecture Lead Directive**: Section 4 of `plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md`  
**Prerequisites**: Stage 19.2A Golden Workflow Contract (`plans/PHASE_19_STAGE2A_GOLDEN_WORKFLOW_CONTRACT.md`)  

---

## 1. Executive Summary

A critical architecture distinction affirmed by the ChatGPT Architecture Lead is:
> **The project/revision DAG records canonical project evolution. The job history records requests, planning, execution, verification, and delivery lifecycle.**

This report establishes the contracts and integration rules ensuring that automated prompt workflows and manual Visual Control Surface edits share a single, coherent, immutable revision lineage without conflating project mutations with workflow lifecycle events.

---

## 2. Dual History Architecture: Project DAG vs. Job Lifecycle

```
========================================================================================
1. PROJECT REVISION DAG (Authoritative project state over time)
Managed by: RevisionSessionManager (session.history) + OperationExecutor
----------------------------------------------------------------------------------------
rev-0 (Init)
  │
  ├──> rev-1 (Prompt: trim clip_1) [origin: prompt_workflow, job: job_101]
  │      │
  │      └──> rev-manual-3 (Manual: split clip_2) [origin: manual_vcs, op: split_clip]
  │             │
  │             └──> rev-4 (Prompt: move title) [origin: prompt_workflow, job: job_102]
========================================================================================

========================================================================================
2. WORKFLOW JOB LIFECYCLE (Request intake, planning, execution, rendering, delivery)
Managed by: OrchestrationJobManager (artifacts/jobs/*.json)
----------------------------------------------------------------------------------------
job_101: ACCEPTED -> PLANNING -> READY_TO_EXECUTE -> EXECUTING -> RENDERING -> VERIFYING -> PUBLISHING -> SUCCEEDED
job_102: ACCEPTED -> PLANNING -> READY_TO_EXECUTE -> EXECUTING -> RENDERING -> VERIFYING -> PUBLISHING -> SUCCEEDED
========================================================================================
```

### Key Principles:
1. **A project revision is not a job**:
   - A single job may execute multiple operations (e.g. split, move, color grade) resulting in one revision bump.
   - A manual edit executes an operation directly and produces a revision *without* creating a prompt job.
2. **Explicit Provenance Fields**:
   - Every history entry in `session.history` must record its `origin`:
     - `prompt_workflow`: Triggered by natural language prompt via `POST /api/jobs` or `POST /api/session/revise`. Includes `job_id`, `plan_hash`, `prompt`, `manifest_id`, and `qa_score`.
     - `manual_vcs`: Triggered by direct timeline manipulation via `POST /api/project/operation`, `POST /api/project/undo`, or `POST /api/project/redo`. Includes `operation: { type, operationId }` and `_project` snapshot.
3. **No Fabrication of Artifacts**:
   - For `manual_vcs` edits, the engine does **not** fabricate a prompt, plan hash, render deliverable, or delivery manifest.
   - `session.active_delivery` remains pointed at the last verified rendered deliverable. The UI clearly reflects that the current timeline state is *unrendered* relative to active delivery.

---

## 3. Multi-Turn Context Resolution Rules

When a user submits a follow-up prompt in a multi-turn session:
1. **Authoritative Project Resolution**:
   - The orchestrator inspects `session.history` in reverse chronological order to find the latest committed project snapshot (`_project` or `_executedProject`).
   - If manual edits occurred after the last delivery, the automated prompt builds on the manual revision snapshot.
2. **Concurrency Verification**:
   - If the request includes `expectedBaseRevision`, it is compared against `effectiveProject.revision`.
   - Any mismatch immediately fails closed with `409 STALE_REVISION`, preventing race conditions.
3. **Fresh Planning over Stale Cache**:
   - Each follow-up turn evaluates the prompt against the current snapshot.
   - Stale operation lists or cached plans from prior turns are never reused blindly.
   - Constraints from `session.hard_constraints` are re-evaluated against the new project geometry.

---

## 4. Branching, Undo and Redo Lineage

EME adheres to monotonic revision semantics for undo and redo:
1. **Monotonic Revision Numbers**:
   - An Undo operation advances canonical `project.revision` by 1, restoring the prior clip state while maintaining monotonic progression ($N \to N+1$).
   - A Redo operation also advances `project.revision` by 1 ($N+1 \to N+2$).
2. **Branching After Undo**:
   - When a user performs an Undo and then executes a new operation (prompt or manual), a new revision branch is formed.
   - The predecessor ID explicitly links to the restored state, preserving auditable tree history without overwriting historical nodes.
3. **Active Delivery Invariant**:
   - Undoing an edit does not delete or overwrite the historical delivery manifest.
   - `active_delivery` points only to explicitly verified deliverables.

---

## 5. Unique Revision Identifiers & Collision Prevention

To eliminate any chance of revision ID collision across sessions or multi-branch workflows:
- Automated revisions use: `rev-<session_id_suffix>-<index>-<hash>` or `rev-<index>`.
- Manual VCS revisions use: `rev-manual-<project.revision>-<timestamp_hash>`.
- Predecessor IDs explicitly bind each node to its exact parent, preventing orphan branches.

---

## 6. Exit Gate Attestation

- [x] Dual history separation between Project DAG and Job Lifecycle enforced.
- [x] Explicit provenance tags (`origin: 'prompt_workflow'` vs `origin: 'manual_vcs'`) implemented.
- [x] Multi-turn context resolution checks latest committed project in history.
- [x] Stale base revisions rejected before plan execution (409).
- [x] Active delivery remains untampered by manual or unrendered revisions.
