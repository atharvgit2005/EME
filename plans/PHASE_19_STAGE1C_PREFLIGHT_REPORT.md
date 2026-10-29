# Phase 19 (RT-01) — Stage 19.1C: Preflight & Non-Mutating Planning Report

**Milestone**: RT-01 — End-to-End Workflow Integration & Final Delivery  
**Stage**: Stage 19.1C — Request Intake, Preflight and Non-Mutating Planning  
**Document**: `plans/PHASE_19_STAGE1C_PREFLIGHT_REPORT.md`  
**Prerequisite**: Stage 19.1A Lifecycle Contract & Stage 19.1B Compatibility Report  
**Architecture Lead Directive**: Section 4 of `plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md`  

---

## 1. Executive Summary

This report documents the integration of the preflight ingestion and planning pipeline across:
- `src/prompt-core/context-normalizer.js` (`ContextNormalizer`)
- `src/prompt-core/reference-resolver.js` (`ReferenceResolver`)
- `src/prompt-core/constraint-normalizer.js` (`ConstraintNormalizer`)
- `src/prompt-core/readiness-evaluator.js` (`ReadinessEvaluator`)
- `src/prompt-core/brief-validator.js` (`BriefValidator`)
- `src/prompt-core/operation-plan-compiler.js` (`OperationPlanCompiler`)
- `src/prompt-core/multi-track-scheduler.js` (`MultiTrackScheduler`)

### Core Guarantee Attested:
**Zero Project Mutation During Planning & Dry-Run**: All preflight validations, reference resolutions, constraint checks, and dry-run simulations execute against isolated deep clones of the project snapshot (`structuredClone(project)`). The canonical live project, its monotonic revision counter, the Undo/Redo stacks, and `session.active_delivery` remain strictly untouched.

---

## 2. Request Intake & Context Binding Pipeline

For every editing request submitted via API, CLI, or internal orchestrator:

1. **Immutable Request Identity**:
   - `request_id`: Assigned globally unique UUID or monotonic sequence (`req-${timestamp}-${random}`).
   - `idempotency_key`: Extracted from caller headers / parameters.
2. **Context Normalization (`ContextNormalizer`)**:
   - Computes canonical `snapshot_sha256` of `project` snapshot.
   - Extracts `base_revision`, `timebase_ticks_per_second` ($120,000$), `available_asset_ids`, and `selected_entity_ids`.
3. **Reference Resolution (`ReferenceResolver`)**:
   - Maps semantic selectors (`dialogue`, `music`, `interview_01`, `broll`) to concrete immutable IDs in `project.clips`, `project.tracks`, or `project.assets`.
   - If referenced targets are missing or cannot be resolved, returns `unresolved: true` with failure reason.
4. **Constraint Normalization (`ConstraintNormalizer`)**:
   - Normalizes negative prohibitions (e.g. `forbid_effect: music_content_added`) and positive invariants (e.g. `preserve_property: color_grade`, `preserve_fields: timing`) into typed zero-tolerance contracts.
5. **Readiness Evaluation (`ReadinessEvaluator`)**:
   - Evaluates:
     - Revision currency: `brief.project_snapshot.base_revision === currentProject.revision`.
     - Contradictory instructions: e.g. "make warmer" vs "preserve existing color grade" $\to$ flags `CONFLICT_COLOR_GRADE`.
     - Missing assets: unresolvable media paths $\to$ flags `ERR_MISSING_ASSETS`.
     - Ambiguities: blocking ambiguities require user resolution.
   - Returns status: `'ready'`, `'needs_clarification'`, or `'blocked'`.
6. **Schema Validation (`BriefValidator`)**:
   - Validates candidate EditBrief against `schema/eme-edit-brief.v1.schema.json`.

---

## 3. Plan Compilation & Dry-Run Simulation

1. **Declarative Plan Generation (`OperationPlanCompiler.compilePlan`)**:
   - Compiles requested changes into canonical operations supported by `OperationExecutor`.
   - Invokes `MultiTrackScheduler` to place B-roll overlays, music beds, and SFX cues while respecting track collision avoidance, audio ducking, and beat alignment tolerances.
2. **Reproducible Plan Identity & Hash**:
   - `plan_id`: Unique identifier (`plan-${timestamp}-${random}`).
   - `plan_hash`: SHA-256 computed over canonical stringified operations array via `OperationPlanCompiler.computePlanHash(plan)`.
3. **Dry-Run Simulation**:
   - Executes proposed operations against an isolated candidate clone:
     `OperationExecutor.execute(candidateClone, op)`
   - Verifies that all operations succeed, no track locks are violated, and no intervals overlap on single tracks.
   - **Live Project Remains Untouched**: The candidate clone is discarded after simulation.

---

## 4. Approval vs. Clarification Routing

| Preflight Outcome | Readiness Status | Next Lifecycle State | Action Required |
| :--- | :---: | :---: | :--- |
| **All Checks Passed & Policy Allows Auto-Run** | `'ready'` | `READY_TO_EXECUTE` | Job proceeds to execution queue. |
| **All Checks Passed & Policy Requires Approval** | `'ready'` | `AWAITING_APPROVAL`<br>(`awaitingReason: 'approval'`) | Plan and hash exposed to user; execution suspended until confirmed. |
| **Contradictory Instructions / Unresolved Ambiguity** | `'needs_clarification'` | `AWAITING_APPROVAL`<br>(`awaitingReason: 'clarification'`) | Clarification requested from user; response triggers replanning. |
| **Missing Assets / Stale Base Revision / Schema Invalid** | `'blocked'` | `FAILED` | Request rejected immediately with actionable error code; 0 mutations. |

---

## 5. Exit Gate Verification

- [x] Immutable request context and project snapshot SHA-256 bound before planning.
- [x] Reference resolver, constraint normalizer, and readiness evaluator integrated fail-closed.
- [x] OperationPlan dry-run executes on isolated clone with zero live project mutations.
- [x] Plan hash and plan ID persisted before execution.
- [x] Approval and clarification reasons explicitly distinguished.
