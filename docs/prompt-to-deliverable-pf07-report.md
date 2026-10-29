# Phase PF-07 Engineering Report: Candidate Generation & Multi-Variant Exploration

**Editing Mechanics Engine (EME) — Core Architectural Certification**  
**Milestone:** Phase PF-07  
**Status:** Certified & 100% Green (222/222 Tests Passing)  
**Date:** 2026-10-19  

---

## 1. Executive Summary

Phase PF-07 introduces **controlled multi-variant candidate generation and exploration** to the Editing Mechanics Engine. While Phase PF-05 established single-stream autonomous compilation and Phase PF-06 established conversational revisions, Phase PF-07 solves the creative exploration problem: **allowing a creator to explore multiple meaningfully distinct editing styles without losing approved constraints or restarting from scratch.**

Phase PF-07 enforces strict architectural guarantees:
1. **Never "Random Re-Prompting":** Generation is deterministic and guided by explicit, authorized variation profiles (Dynamic, Cinematic, Editorial).
2. **100% Hard Constraint Preservation:** All candidates strictly inherit the parent brief's hard constraints (composition duration, primary clip progression, audio ceiling, dialogue protection, headline interval, and B-roll cutaway interval).
3. **Complete Sandbox Isolation:** Each candidate compiles, executes, and renders in an isolated sandbox with its own journal and state snapshot. Zero cross-candidate contamination.
4. **Independent Dual-Gate Verification:** Each candidate must independently pass physical media decoding QA (FFprobe/FFmpeg) AND 7-criterion semantic intent verification.
5. **Clean Failure Isolation:** A failure in one candidate (e.g., render crash or clip sequence violation) isolates completely; passing siblings remain verified.
6. **Selection Provenance & Downstream Revision Chaining:** Creator selection binds to the exact candidate ID and manifest ID, and can be revised conversationally via Phase PF-06 without mutating sibling variants or predecessor baselines.

---

## 2. Architectural Components Implemented

### 2.1 Canonical CandidateSet Contract (`schema/eme-candidate-set.v1.schema.json`)
The candidate generation and selection lifecycle is governed by an immutable JSON schema contract that tracks:
- `candidate_set_id`: Unique identifier (`cset-<hex>`).
- `request`: Original prompt, parent `brief_id`, `baseline_run_id`, target duration.
- `hard_constraints`: List of mandatory immutable constraints preserved across all variants.
- `authorized_variation_dimensions`: Explicitly allowed dimensions (`["pacing", "transitions", "typography"]`).
- `candidates`: Array of up to 3 candidate objects, each with isolated execution metrics, canonical plan hashes, media QA scores, semantic verification status, and deliverable manifests.
- `comparison_matrix`: Measurable differences across variants (cuts count, transition style, pacing style, QA score, SHA-256).
- `selection`: Creator selection details (`selected_candidate_id`, `selected_manifest_id`, `selected_at`, `selection_provenance`).
- `status`: Overall lifecycle status (`ready`, `partially_verified`, `all_failed`, `selection_committed`).

### 2.2 Variation Profile Generator & Plan Compiler (`CandidateVariantCompiler`)
- Generates 3 canonical variation profiles:
  - **Dynamic (`cand-dynamic`):** High-energy pacing, rapid beat accent cuts, 0.5s quick dissolve, bold punchy typography.
  - **Cinematic (`cand-cinematic`):** Fluid continuity, balanced pacing on beats 8 and 16, true 1.0s cross-dissolves, elegant tracking typography.
  - **Editorial (`cand-editorial`):** Structured narrative framing, story-phrased cuts, 0.8s subtle transitions, typographic hierarchy.
- Compiles independent `OperationPlan`s with profile-specific parameters and deterministic SHA-256 plan hashes.

### 2.3 Candidate Orchestration Engine (`CandidateOrchestrator`)
- Clones project state into isolated sandboxes for each candidate profile.
- Executes operations via `OperationExecutor` with per-candidate transaction journals.
- Renders deliverables and conducts independent media QA via `RenderOrchestrator.runClosedLoop`.
- Reverifies semantic intent satisfaction with `PromptDeliverableOrchestrator.verifyIntentToOutput`.
- Emits candidate deliverable manifests for verified candidates and builds the comparative matrix.
- `selectCandidate`: Verifies candidate status, records selection provenance, and outputs a canonical `eme-delivery-run.v1` document ready for downstream revisions.

### 2.4 CLI Integration
Exposes candidate generation and selection directly via the EME CLI:
```bash
# Generate 3 verified candidate variants
eme prompt candidates \
  --project project.json \
  --prompt "Generate three different editing styles. Vary pacing and transition style only." \
  --beat-analysis beat-analysis.json \
  --out artifacts/deliverables

# Select preferred candidate
eme prompt select-candidate \
  --candidate-set artifacts/deliverables/cset-xxx-candidate-set.json \
  --candidate-id cand-cinematic \
  --out artifacts/deliverables
```

---

## 3. Test Battery Verification (PF-07)

All 10 specification tests pass with 100% green status ([`tests/prompt-compilation-pf07.test.js`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/prompt-compilation-pf07.test.js)):

| Test ID | Test Name | Assertion Highlights | Result |
|---|---|---|---|
| **PF-07.1** | Flagship Certification: 3 Distinct Verified Candidates Generated | 3 candidates generated, executed, rendered, QA verified (score >= 80), semantic intent verified, and manifests emitted; status `ready` | **PASS** |
| **PF-07.2** | Hard Constraint Preservation | 100% compliance across all 3 candidates (exact duration 1440k ticks, clip order, title overlay, B-roll interval) | **PASS** |
| **PF-07.3** | Candidate State Isolation | Sandboxes are completely isolated; unique journals and distinct plan hashes across all candidates | **PASS** |
| **PF-07.4** | Measurable Variation Validity | Profiles differ measurably in transition duration (0.5s, 0.8s, 1.0s) and typography styling | **PASS** |
| **PF-07.5** | Failure Isolation (Render Error) | Injected render failure in `cand-cinematic` fails only that candidate; `cand-dynamic` and `cand-editorial` remain verified; status `partially_verified` | **PASS** |
| **PF-07.6** | Failure Isolation (Semantic Violation) | Injected clip order swap in `cand-dynamic` fails semantic verification; siblings remain verified with intact manifests | **PASS** |
| **PF-07.7** | Candidate Selection Provenance | Selecting `cand-editorial` resolves exact candidate ID and manifest ID, producing conforming delivery run | **PASS** |
| **PF-07.8** | Fail-Closed Selection Rejection | Attempting to select a failed or unverified candidate is rejected fail-closed | **PASS** |
| **PF-07.9** | Iterative Revision Chaining | Selected candidate chains directly into PF-06 `RevisionOrchestrator.runRevision` without mutating predecessor candidate set | **PASS** |
| **PF-07.10** | Plan Determinism | Identical inputs and variation profiles yield byte-identical canonical plan hashes | **PASS** |

---

## 4. Repository-Wide Test Suite Status

```
ℹ tests 222
ℹ suites 1
ℹ pass 222
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30141.087292
```
**Total Repository Tests:** 222 / 222 Passing (100% Green across all phases).

---

## 5. Architectural Invariants Certified

1. **Deterministic Multi-Variant Invariant:** Candidates are compiled from explicit authorized variation profiles, not random generation.
2. **Zero-Contamination Isolation Invariant:** Candidate execution states and journals are completely independent.
3. **Hard Constraint Non-Compromise Invariant:** Mandatory constraints cannot be relaxed to force candidate variety.
4. **Failure Containment Invariant:** A failed candidate cannot invalidate or block passing sibling candidates.
5. **Selection Traceability Invariant:** Selection records exact candidate identity, manifest hash, and timestamp.
6. **Revision Chain Invariant:** Selected candidates seamlessly accept conversational revisions via PF-06.
