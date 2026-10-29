# Editing Mechanics Engine (EME) - Phase PF-06 Specification
## Conversational Revision, Constraint Preservation & Verified Iteration

**Date:** October 18, 2026  
**Status:** In Progress / Architecture & Implementation  
**Predecessor Milestones:** PF-01, PF-02, PF-03, PF-04, PF-05 (Accepted / Certified)  
**Reference Directive:** `plans/CHATGPT_PHASE_PF05_RESPONSE.md`  

---

### 1. Architectural Mission

PF-06 elevates EME from a single-shot prompt compiler into an interactive, conversational editing system capable of iterative revisions. The engine allows a user to conversationally request changes to a previously verified deliverable (e.g. "Move the headline title 2 seconds later", "Replace the B-roll but keep the music and duration", "Make the cut faster but preserve 12 seconds", "Undo the last revision") while upholding the following core invariants:

1. **Strict Constraint Preservation**: All hard constraints established in previous turns (duration, primary clip order, track locks, audio ceilings) remain active and enforced unless explicitly and legitimately modified.
2. **Minimal Mutation**: Only the explicit operations requested by the user and their strict, verifiable dependencies are modified. Unrelated clips, grades, transitions, and audio tracks remain untouched.
3. **Conflict Detection & Fail-Closed Behavior**: If a requested revision contradicts an existing hard constraint (e.g. requesting an edit that exceeds 1,440,000 ticks when 12s duration is locked), the engine halts with `conflict` or `needs_clarification`. It NEVER silently reinterprets or mutates constraints.
4. **Immutable Prior Deliverables**: Every verified delivery run produces an immutable release package (media + manifest + run document). A failed revision NEVER overwrites, corrupts, or invalidates a previously verified deliverable.
5. **Auditable Undo / Redo**: Reverting a revision restores the exact prior project revision state and revision semantics with auditable provenance.

---

### 2. Contract Definition: `eme-revision-run.v1.schema.json`

The revision contract (`schema/eme-revision-run.v1.schema.json`) defines:
- **`revision_run_id`**: Unique identifier for the revision iteration (`revrun-xxxx`).
- **`prior_run_id`**: Unique identifier of the baseline `eme-delivery-run.v1` document.
- **`prior_manifest_id`**: SHA-256 bound manifest of the baseline deliverable.
- **`raw_revision_prompt`**: User's natural language modification request.
- **`intent_disentanglement`**:
  - `explicit_changes`: Array of user-demanded modifications.
  - `preserved_constraints`: Array of unchanged constraints carried forward.
  - `derived_changes`: Dependent adjustments (e.g. handle adjustments).
  - `detected_conflicts`: Any irreconcilable contradictions.
- **`plan_diff`**:
  - `added_operations`: Operations introduced in this revision.
  - `removed_operations`: Operations discarded from the previous plan.
  - `modified_operations`: Operations with updated parameters.
  - `unchanged_operations_count`: Operations preserved identically.
- **`execution_result`**:
  - `base_revision`: Project revision prior to revision execution.
  - `final_revision`: Project revision after revision execution.
  - `status`: `committed`, `rolled_back`.
- **`reverification`**:
  - `media_qa_summary`: Full re-inspection of the revised deliverable.
  - `semantic_intent_summary`: Verification that explicit changes took effect and preserved constraints held.
- **`deliverable`**: New immutable deliverable (if verified) or `null` (if failed).
- **`status`**: `verified`, `failed`, `conflict_blocked`, `rolled_back`.

---

### 3. Engine Components & Workflow

```
[Prior DeliveryRun + Current Project]
             │
             ▼
┌──────────────────────────────────────────────┐
│       RevisionIntentCompiler                 │
│  - Parses natural language revision prompt   │
│  - Disentangles explicit vs preserved vs dep │
│  - Detects hard constraint contradictions    │
└──────────────────────┬───────────────────────┘
                       │ Valid / No Conflict
                       ▼
┌──────────────────────────────────────────────┐
│       RevisionPlanCompiler                   │
│  - Minimal mutation diffing                  │
│  - Dry-run validation of revised plan        │
│  - Computes new canonical plan hash          │
└──────────────────────┬───────────────────────┘
                       │ Plan Approved
                       ▼
┌──────────────────────────────────────────────┐
│       OperationExecutor (Transactional)      │
│  - Executes diff operations                  │
│  - Writes execution journal                  │
│  - Idempotent rollback on failure            │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│       Closed-Loop QA & Semantic Recheck      │
│  - Render revised MP4                        │
│  - 9-check FFprobe/FFmpeg independent QA     │
│  - 7-criteria Intent-to-Output verification  │
└──────────────────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼ PASS                    ▼ FAIL
┌──────────────────┐      ┌──────────────────────────────┐
│ Publish New      │      │ Fail Closed:                 │
│ Immutable        │      │ - Keep Prior Deliverable OK  │
│ Manifest & Run   │      │ - Restore Baseline Revision  │
└──────────────────┘      └──────────────────────────────┘
```

---

### 4. Certification Scenarios (PF-06 Battery)

1. **PF-06.1 Flagship Title Move**: Move headline title later by 2.0s while preserving exact 3.0s duration, primary clip order, B-roll, and music.
2. **PF-06.2 B-Roll Replacement**: Replace B-roll source asset while preserving interval `[4.0s, 6.0s)`, music, and primary cut points.
3. **PF-06.3 Hard Constraint Conflict Rejection**: Request an incompatible duration change (e.g. 20s) and verify the engine fails closed with structured conflict diagnostics rather than mutating constraints.
4. **PF-06.4 Prior Deliverable Preservation on QA Failure**: Cause the revised render or semantic verification to fail, and verify that the prior verified deliverable and manifest remain untouched and publishable.
5. **PF-06.5 Transactional Interruption & Recovery**: Simulate failure injection mid-revision and prove idempotent recovery to baseline project revision.
6. **PF-06.6 Auditable Undo / Redo**: Undo revision 2 back to revision 1; verify project state and revision provenance are restored.
7. **PF-06.7 Minimal Mutation Invariant**: Assert that operations targeting unaffected tracks (e.g. audio track) have zero diff.
8. **PF-06.8 Determinism**: Repeating the identical revision request from the same baseline produces byte-identical canonical plan hashes.
