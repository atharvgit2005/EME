# Phase PF-06 Engineering Report: Conversational Revision, Constraint Preservation & Verified Iteration

**Editing Mechanics Engine (EME) — Core Architectural Certification**  
**Milestone:** Phase PF-06  
**Status:** Certified & 100% Green (212/212 Tests Passing)  
**Date:** 2026-10-18  

---

## 1. Executive Summary

Phase PF-06 establishes the conversational revision and verified iteration engine for EME. While Phase PF-05 established autonomous compilation from a clean slate to a verified deliverable manifest, real-world human editing is inherently conversational and iterative. 

Phase PF-06 enforces an unyielding architectural standard: **a conversational edit must never be treated as a "re-prompt from scratch."** Instead, the revision engine:
1. **Disentangles Intent:** Separates explicit delta requests from preserved baseline constraints.
2. **Rejects Conflicts Fail-Closed:** Prevents silent violations or reinterpretation of prior hard constraints.
3. **Applies Minimal Mutations:** Modifies strictly the targeted clips/tracks while ensuring unaffected tracks have zero diff.
4. **Guarantees Transactional Atomicity:** Recovers baseline revision upon step failure or process crash.
5. **Maintains Deliverable Immutability:** A failed or interrupted revision never overwrites or corrupts previously published deliverable manifests.
6. **Performs Closed-Loop Reverification:** Renders and independently decodes revised media, asserting both audio/video signal compliance and semantic intent satisfaction before publishing an updated manifest.
7. **Supports Auditable Undo/Redo:** Reverts project state to the prior verified baseline with full provenance.

---

## 2. Architectural Components Implemented

### 2.1 Canonical Schema (`schema/eme-revision-run.v1.schema.json`)
The revision lifecycle is governed by an immutable JSON schema contract that tracks:
- `revision_run_id`: Unique identifier for the revision execution.
- `prior_run_id`: Provenance reference to the predecessor `eme-delivery-run.v1` document.
- `intent_disentanglement`: Explicit deltas, preserved baseline constraints, and detected conflicts.
- `plan_diff`: Structural delta recording added, removed, and modified operations, plus unchanged count.
- `execution_result`: Transaction status (`committed`, `rolled_back`, `conflict_blocked`), revision deltas, and execution journal path.
- `reverification`: Closed-loop Media QA results and 7-criterion semantic intent reverification.
- `deliverable`: Verified MP4 path, SHA-256 digest, and delivery manifest (or null if unverified).
- `status`: Overall lifecycle status (`verified`, `failed`, `rolled_back`, `conflict_blocked`).

### 2.2 Revision Intent Disentangler (`RevisionIntentCompiler`)
- Analyzes natural language revision instructions against the predecessor deliverable run and live project.
- Isolates explicit deltas (e.g., "move headline title 2 seconds later", "replace B-roll with cutaway footage").
- Extracts active hard constraints from the prior brief and plan (e.g., duration bounds, primary clip order, audio ceiling, dialogue protection).
- Detects direct contradictions fail-closed: if the revision requests a property change that violates an explicit hard constraint (e.g., changing 12s duration to 20s when duration is locked), compilation halts immediately with diagnostic blocking issues.
- Recognizes conversational undo requests ("undo that", "revert to previous version") and routes to transactional state restoration.

### 2.3 Minimal Mutation Planner (`RevisionPlanCompiler`)
- Produces an atomic `OperationPlan` containing solely the delta operations required.
- Employs canonical operations (`move_clip`, `modify_clip`, `add_asset`, `trim_clip`) conforming strictly to `OperationExecutor`.
- Tracks `plan_diff` metrics to guarantee unaffected tracks and clips receive zero mutations.
- Generates deterministic plan identifiers using SHA-256 hashes of `priorRunId + explicitChanges`, ensuring byte-identical reproducibility.

### 2.4 Closed-Loop Revision Orchestrator (`RevisionOrchestrator`)
- Executes the compiled revision plan through `OperationExecutor` with transactional step journaling.
- If execution encounters an error or injected failure, atomically rolls back project state to the baseline revision and writes the failure journal.
- Dispatches revised composition to `RenderOrchestrator.runClosedLoop`.
- If rendering or media QA fails, preserves the prior deliverable manifest intact and marks the revision run as `failed` without overwriting prior outputs.
- Performs dual-gate reverification: Media QA (decoding, blank-frame flash, audio ceiling) AND Semantic Intent Reverification (`CRIT_TIMELINE_DURATION`, `CRIT_CLIP_ORDER`, `CRIT_BROLL_INTERVAL`, `CRIT_TITLE_OVERLAY`, `CRIT_TRANSITION_EFFECT`, `CRIT_NEGATIVE_INVARIANTS`, `CRIT_MEDIA_QA_GATES`).
- Upon full verification, publishes the updated deliverable manifest and writes the immutable `eme-revision-run.v1` document.

### 2.5 CLI Integration (`eme prompt revise`)
Exposes conversational revision capabilities directly via the EME CLI:
```bash
eme prompt revise \
  --prompt "Move headline title 2 seconds later" \
  --prior-run artifacts/deliverables/prior-run.json \
  --project project.json \
  --output-dir artifacts/deliverables
```

---

## 3. Test Battery Verification (PF-06)

All 8 rigorous specification tests pass with 100% green status:

| Test ID | Test Name | Assertion Highlights | Result |
|---|---|---|---|
| **PF-06.1** | Flagship Certification: Conversational Title Move Revision | Title moved from 1s to 3s; duration 3s preserved; minimal mutation (1 op modified, >=8 unchanged); Media QA score 100; verified manifest published | **PASS** |
| **PF-06.2** | B-Roll Replacement | Replaces cutaway asset while preserving interval [4.0s, 6.0s), soundtrack, and primary cuts; registers new asset cleanly | **PASS** |
| **PF-06.3** | Hard Constraint Conflict Rejection | Incompatible request (change 12s to 20s against duration lock) fails closed; status `conflict_blocked`; zero project mutation | **PASS** |
| **PF-06.4** | Prior Deliverable Preservation on QA Failure | Simulated QA failure leaves predecessor delivery manifest and media byte-for-byte intact and active; rev status `failed` | **PASS** |
| **PF-06.5** | Transactional Interruption & Recovery | Injected failure at step boundary triggers atomic rollback to project baseline revision; journal records recovery | **PASS** |
| **PF-06.6** | Auditable Undo / Redo | Conversational undo request ("undo that") restores prior verified project state and baseline revision with complete provenance | **PASS** |
| **PF-06.7** | Minimal Mutation Invariant | Title move generates exactly 1 modified operation; added = 0, removed = 0; unaffected audio/video tracks have zero diff | **PASS** |
| **PF-06.8** | Plan Determinism | Identical revision instructions on identical project baseline yield byte-identical canonical plan hashes | **PASS** |

---

## 4. Repository-Wide Test Suite Status

```
ℹ tests 212
ℹ suites 1
ℹ pass 212
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27812.154375
```
**Total Repository Tests:** 212 / 212 Passing (100% Green across all phases).

---

## 5. Architectural Invariants Certified

1. **Sole Authority Mutation Invariant:** All project state changes flow strictly through `OperationExecutor`.
2. **Hard Constraint Non-Compromise Invariant:** The engine refuses to rewrite or silently soften hard creative constraints.
3. **Immutable Delivery Invariant:** Prior published manifests are read-only and immutable; revisions never overwrite historical artifacts.
4. **Minimal Blast Radius Invariant:** Edits affect only the required AST nodes; unrelated tracks/clips remain untouched.
5. **Dual-Gate Verification Invariant:** Media passes both physical decoding QA (FFprobe) and semantic intent satisfaction before publication.
