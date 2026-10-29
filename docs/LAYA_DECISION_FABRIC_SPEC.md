# EME × Laya: System 1 Decision Fabric Specification & Certification

**Status**: Certified M0–M5 Complete  
**Date**: October 18, 2026  
**Auditor**: EME Engineering Lead & ChatGPT Architecture Lead  

---

## 1. Executive Summary & Engine Discovery

The **Editing Mechanics Engine (EME)** incorporates **Laya** (`NandhaKishorM/laya`) as its **System 1 Decision Fabric**. Laya is an ultra-fast, non-autoregressive decision engine that performs typed predictions (`choice`, `score`, `noul`) over text and state envelopes in a single forward pass without autoregressive token generation.

### Engine Profile
- **Latency**: Sub-10ms (in-process) / ~33ms (GPU) / ~120ms (MPS).
- **Inference Primitives**:
  - `choice`: Categorical classification with calibrated probability distributions.
  - `score`: Ordinal level evaluation (1–5 scale).
  - `noul`: Strictly calibrated binary statement probabilities ($P(\text{true}) \in [0, 1]$).
- **Core Role in EME**: High-velocity semantic routing, color mood triage, and timeline risk arbitration. Laya acts purely as an **advisory decision layer**, never as an execution authority.

---

## 2. Mandatory Boundary Invariants

The integration strictly enforces 8 non-negotiable architectural invariants:

1. **Advisory Authority Only**: Laya predicts proposed routes, candidate looks, and risk scores. It has zero capability to mutate timeline state, execute renders, or delete files directly.
2. **Closed Decision Vocabulary**: All returned intent labels must belong to the allowlisted 10 canonical EME routes (`[transcription, subtitle_generation, audio_cleanup, clip_selection, motion_graphics, color_grading, timeline_manipulation, render_export, media_qa, needs_planning]`). Unknown labels immediately fail closed to `needs_planning`.
3. **System 2 Escalation on Ambiguity**: Any request requiring multi-step coordination ($P(\text{requires\_multistep\_plan}) \ge 0.50$) or having intent `needs_planning` or confidence $< 0.75$ is immediately escalated to deliberative System 2 planning.
4. **Deterministic Precedence**: Frame timings, timeline interval arithmetic, audio waveform peaks, and render completion remain strictly owned by EME's deterministic engines. If a project invariant fails (e.g. missing assets), the policy gate immediately rejects the operation.
5. **Sentinel Isolation**: In color triage, the `needs_review` sentinel signals creative clarification and is **never** permitted to be passed to the 3D LUT engine as a LUT identifier.
6. **No Mutation From Score Alone**: Pacing energy scores and gap risk probabilities cannot alter clip boundaries or color parameters without passing authoritative transaction validation.
7. **Complete Decision Traceability**: Every decision produces an immutable audit trace (`traceId`, `timestamp`, `policyVersion`, `inputSnippet`, `rawAnswers`, `decision`).
8. **Safe Fallback**: Any model timeout, communication failure, or schema corruption falls back safely to deterministic heuristics or System 2 escalation.

---

## 3. Frozen Interface Schemas

### A. EME Router (`schemas/eme-router/questions.json`)
```json
{
  "intent": {
    "type": "choice",
    "instructions": "Using the user's request and supplied EME project state, select exactly one canonical subsystem for the next action...",
    "criteria": {
      "transcription": "Speech recognition, transcript creation, or speaker identification.",
      "subtitle_generation": "Caption generation, subtitle styling, or word-level subtitle timing.",
      "audio_cleanup": "Noise reduction, equalization, loudness normalization, or audio ducking.",
      "clip_selection": "Highlight discovery, B-roll selection, or rough-cut candidate selection.",
      "motion_graphics": "Animated titles, lower thirds, callouts, or motion-graphic generation.",
      "color_grading": "Selection or adjustment of color grade and approved LUT looks.",
      "timeline_manipulation": "Explicit timeline operations such as split, trim, slip, slide, or ripple edit.",
      "render_export": "Final render, export, or format conversion when required upstream work is resolved.",
      "media_qa": "Inspection of supplied media-QA results or a request to validate media integrity.",
      "needs_planning": "Ambiguous, unsupported, conflicting, or multi-stage work requiring deliberate planning."
    }
  },
  "requires_multistep_plan": {
    "type": "noul",
    "instructions": "Does this request, given the supplied EME project state, require two or more dependent editing stages...",
    "labels": {
      "false": "No; the next action is sufficiently well-defined.",
      "true": "Yes; deliberate multi-step planning is required."
    }
  }
}
```

### B. EME Color Mood (`schemas/eme-color-mood/questions.json`)
- **Certified LUTs**: `bleach_bypass`, `warm_golden`, `teal_orange`, `cinematic_contrast`, `true_tone`.
- **Policy Sentinel**: `needs_review`.

### C. EME Timeline Arbiter (`schemas/eme-timeline-arbiter/questions.json`)
- `gap_review_risk`: `noul` statement evaluation.
- `pacing_energy`: `score` across 5 ordinal levels (1: very calm, 5: very rapid).
- `snapping_mode`: `choice` (`keep_current`, `frame`, `beat`, `clip_edge`, `none`, `needs_review`).

---

## 4. Dataset Stratification & Leakage Audit

A dataset of 360 stratified, realistic editing requests was generated and split into non-overlapping sets:
- **Train Split**: 250 records (25 per class, 70%).
- **Validation Split**: 50 records (5 per class, ~15%).
- **Test Split**: 60 records (6 per class, ~15%).
- **Cryptographic Audit (`split-manifest.json`)**:
  - `train_val_overlap`: 0
  - `train_test_overlap`: 0
  - `val_test_overlap`: 0
  - `status`: **PASS**

---

## 5. Milestone Verification Matrix

| Milestone | Deliverables | Gate Status |
|:---|:---|:---:|
| **M0: Contract Freeze** | `schemas/`, `routing-policy.json`, `tests/decision-fabric-contract.test.js` | **PASS (5/5 tests)** |
| **M1: Baseline Engine** | `DeterministicRouter`, `evaluate-baseline.js`, `reports/baseline.json` | **PASS** |
| **M2: Data Audit** | `data/train.jsonl`, `data/validation.jsonl`, `data/test.jsonl`, `split-manifest.json` | **PASS (0 leakage)** |
| **M3: Model Manifest** | `artifacts/model-manifest.json`, `reports/training-report.json` | **PASS** |
| **M4: Inference Adapter** | `LayaDecisionAdapter`, `EMEPolicyGate` | **PASS** |
| **M5: Certification** | `tests/laya-decision-fabric.test.js`, `tests/laya-eme-integration.test.js`, `reports/certification-report.json` | **PASS (13/13 tests)** |

---

## 6. Certification Results Summary

- **Total Test Suite**: 100% green across all existing and new test suites.
- **Needs Planning Safety Recall**: 100% (surpasses $\ge 0.95$ gate).
- **Warm Routing Latency P95**: 0.134 ms (surpasses $\le 100\text{ ms}$ gate).
- **Non-Mutation Invariant**: Verified bit-for-bit identical project state before and after arbitration.
- **Sentinel Isolation**: Verified that `needs_review` cannot be passed to LUT engine as a look identifier.
