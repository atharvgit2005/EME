# Phase PF-07 Specification: Candidate Generation & Multi-Variant Exploration

**Editing Mechanics Engine (EME) — Architectural Specification**  
**Milestone:** Phase PF-07  
**Status:** In Progress / Authorized by ChatGPT Architecture Lead  
**Predecessors:** PF-01, PF-02, PF-03, PF-04, PF-05, PF-06  

---

## 1. Architectural Intent & Scope

Phase PF-07 extends EME from single-stream linear compilation to **controlled multi-variant exploration**. When a creator requests:
> *"Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one."*

The engine must **never** treat this as three wild, unconstrained generation attempts. Instead, it must execute controlled exploration with strict mathematical guarantees:
1. **Identical Baseline Constraints:** All candidates inherit 100% of the mandatory hard constraints from the parent brief (timeline duration, primary clip order, audio ceiling, dialogue protection, title interval, B-roll cutaway interval).
2. **Authorized Variation Dimensions:** Candidates differ solely along explicitly authorized, measurable dimensions (e.g. cut density, transition type, typographic styling).
3. **Sandbox Isolation:** Each candidate compiles and executes against an independent clone of the project state with its own isolated execution journal. Zero cross-candidate state contamination.
4. **Independent Dual-Gate Verification:** Each candidate undergoes independent closed-loop rendering, physical decode QA (FFprobe), and 7-criterion semantic intent verification.
5. **Failure Isolation:** If one candidate fails a hard gate (e.g. injected render error or clip sequence violation), it is marked `failed` without invalidating passing sibling candidates.
6. **Deterministic Plan Identity:** Identical baseline project, brief, and variation profiles yield byte-identical canonical plan hashes.
7. **User Selection & Revision Chain:** The creator can inspect the comparison matrix and select a candidate. The selection resolves to the exact candidate ID and manifest, and can be revised iteratively via Phase PF-06 (`RevisionOrchestrator`) without mutating siblings.

---

## 2. Canonical Contracts & Data Structures

### 2.1 Candidate Set Contract (`schema/eme-candidate-set.v1.schema.json`)
The overall multi-variant run is captured in a single versioned contract:
- `candidate_set_id`: `cset-<hex>`
- `request`: Original prompt, `brief_id`, `baseline_run_id`, `target_duration_ticks`.
- `hard_constraints`: Complete list of immutable constraints preserved across all variants.
- `authorized_variation_dimensions`: `["pacing", "transitions", "typography"]`.
- `candidates`: Array of 1 to 3 candidate objects containing:
  - `candidate_id`: e.g. `cand-dynamic`, `cand-cinematic`, `cand-editorial`
  - `variation_profile`: `{ name, description, pacing, transition_style, typography_style }`
  - `canonical_plan_hash`: SHA-256 of candidate plan
  - `execution`: `{ status, executed_steps, base_revision, final_revision, journal_path }`
  - `render_job_id`: Unique render job identifier
  - `qa_summary`: Independent Media QA score and checks
  - `semantic_verification`: 7-criterion semantic validation status
  - `deliverable`: `{ media_path, sha256, manifest_path, manifest_id }`
  - `status`: `"verified"` | `"failed"` | `"incomplete"`
- `comparison_matrix`: Measurable differences (cuts count, transition style, pacing density, QA score, SHA-256).
- `selection`: `{ selected_candidate_id, selected_manifest_id, selected_at, selection_provenance }`.
- `status`: `"ready"` | `"partially_verified"` | `"all_failed"` | `"selection_committed"`.

---

## 3. The Three Canonical Variation Profiles

To ensure diversity while preserving hard constraints, Phase PF-07 implements 3 deterministic variation profiles:

| Profile | Key Characteristics | Pacing & Cuts | Transition Style | Typography & Energy |
|---|---|---|---|---|
| **Dynamic** (`cand-dynamic`) | High-energy, punchy | Tighter beat sync on primary cuts; rapid cuts within clip boundaries | Fast whip/dissolve accents | Bold, punchy tracking |
| **Cinematic** (`cand-cinematic`) | Fluid, seamless | Longer visual beats; seamless motion continuity | True 1.0s cross-dissolve handles | Elegant typography, restrained motion |
| **Editorial** (`cand-editorial`) | Story-driven, structured | Precise narrative cuts, clean phrasing | Clean hard cuts / subtle dissolve | Typography-led visual hierarchy |

---

## 4. Acceptance Gates (PF-07 Battery)

1. **PF-07.1 Flagship Certification:** 3 candidates generated, executed, rendered, and verified from 12s vertical social fixture.
2. **PF-07.2 Hard Constraint Preservation:** 100% compliance across all 3 candidates (duration 1440k ticks, clip order, title interval, B-roll interval).
3. **PF-07.3 Candidate State Isolation:** Executions run in isolated sandboxes; project state and journals have zero overlap.
4. **PF-07.4 Measurable Variation Validity:** Every candidate differs in at least one authorized dimension (cuts count, transition type, or styling).
5. **PF-07.5 Failure Isolation:** A forced failure in one candidate (e.g. clip order violation or corrupt media) fails that candidate only; siblings remain verified.
6. **PF-07.6 Candidate Selection Provenance:** Selecting a candidate records exact candidate ID and manifest ID, publishing the selected delivery run.
7. **PF-07.7 Iterative Revision Chaining:** Applying a PF-06 conversational revision on the selected candidate produces a new verified revision without mutating siblings or prior baseline.
8. **PF-07.8 Plan Determinism:** Identical inputs and variation profiles yield byte-identical canonical plan hashes.
9. **PF-07.9 Schema Validation:** Emitted candidate set documents strictly validate against `eme-candidate-set.v1.schema.json`.
10. **PF-07.10 Regression Freedom:** Full repository test suite (212+ tests) remains 100% green.
