# Phase 17 Stage 0: Deterministic Color Engine Audit & Contract Specification

**Document Version**: 1.0.0  
**Phase**: Phase 17 — Deterministic Color Engine (Stage 0: Audit & Contract Freeze)  
**Author**: Engineering Team  
**Architecture Lead**: ChatGPT Architecture Lead  
**Date**: October 20, 2026  
**Status**: COMPLETE — SUBMITTED FOR STAGE 1 AUTHORIZATION  

---

## 1. Executive Summary & Objective

In accordance with the **EME Roadmap Directive** issued by the ChatGPT Architecture Lead, this document establishes the formal **Stage 0 Audit and Versioned Operation Contract** for Phase 17 (Deterministic Color Engine).

The objective is to specify the smallest, reliable, deterministic, and non-destructive color grading pipeline built upon EME's proven transactional architecture (`OperationExecutor`, `TransactionJournal`, `ProjectManager`), guaranteeing:
1. **Mathematical Determinism**: Exact parity across CPU reference evaluation (`gradePixelRgb`), Visual Control Surface GPU/Canvas preview, and FFmpeg filtergraph render (`lut3d=file=...:interp=tetrahedral`).
2. **Strict Advisory Boundary for Laya**: The Decision Fabric's `eme-color-mood` triager produces non-authoritative recommendations. A recommendation confers zero execution authority.
3. **Certified LUT Vocabulary**: Operations permit only registered, verified LUT identifiers with frozen SHA-256 digests. Unknown LUT IDs and `needs_review` sentinels are strictly rejected.
4. **Zero Mask Coupling (VTSM Isolation)**: Spatial tracking sidecars (`schema/eme-vtsm-tracking.v1.schema.json`) remain strictly decoupled from color operations in Phase 17. No automated spatial grading masks are applied without a future, independently authorized contract.
5. **Project Schema Purity & Canonical Timebase**: `schema/eme-project.v1.schema.json` integrity is maintained with zero breaking schema migrations. Temporal scopes adhere strictly to `TICKS_PER_SECOND = 120,000` and half-open intervals `[start, end)`.

---

## 2. Existing Repository Color Assets Audit

### 2.1 Schema & Data Models
- **`schema/eme-color-grade.v1.schema.json`**:
  - Full Draft 2020-12 JSON Schema defining the canonical color grading state.
  - Required top-level fields: `id`, `schemaVersion` ("1.0.0"), `revision`, `enabled`, `colorSpaces`, `exposure`, `whiteBalance`, `primary`, `curves`, `hsl`.
  - Color spaces: `input` (rec709, srgb, rec2020, display-p3, apple-log), `working` (rec709-linear, rec709), `lutDomain` (rec709, log), `output` (rec709, srgb).
  - Exposure: EV stops `[-6.0, 6.0]`.
  - White balance: temperature `[-1.0, 1.0]`, tint `[-1.0, 1.0]`.
  - Primary (LGGO): lift `[-1.0, 1.0]`, gamma `[0.1, 5.0]`, gain `[0.0, 5.0]`, offset `[-1.0, 1.0]`.
  - Curves: master, red, green, blue, luma with monotonic Bézier control points in `[0.0, 1.0]`.
  - HSL: 8 channels (`red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `magenta`) with hue `[-180, 180]`, saturation `[-1.0, 1.0]`, lightness `[-1.0, 1.0]`.
  - 3D LUT block: `enabled`, `assetId`, `path`, `sha256`, `size` (17, 33, 65), `interpolation` ("tetrahedral", "trilinear", "nearest"), `intensity` `[0.0, 1.0]`.
  - Skin protection: `enabled`, `weight` `[0.0, 1.0]`, `tolerance` `[0.0, 1.0]` in Rec.709 YCbCr skin locus.
- **`schema/eme-project.v1.schema.json`**:
  - Clip entity supports optional `colorGrade` property referencing either an inlined grade object or a grade identifier.

### 2.2 Mathematical Engine Modules
- **`src/engine/color-space.js`**:
  - Gamma 2.4 / sRGB / Rec.709 transfer functions and linearizations.
  - RGB <-> HSL conversions with circular hue distance metrics.
  - Rec.709 RGB <-> YCbCr matrices.
- **`src/engine/color-operations.js`**:
  - Canonical 6-stage pixel pipeline:
    1. Exposure & White Balance in linear-light space (`2^EV` gain + temperature/tint).
    2. Primary LGGO in Rec.709 working domain.
    3. Cubic Bézier curves for R, G, B, Master, and Luma.
    4. 8-channel smooth bell-curve HSL selective adjustments.
    5. Rec.709 YCbCr skin locus preservation blend.
    6. 3D Creative LUT interpolation and intensity blend.
  - Buffer grading: `gradeImageBuffer` for multi-threaded / typed array rendering.
- **`src/engine/lut-parser.js` & `src/engine/lut-evaluator.js`**:
  - High-performance .cube 3D LUT parser (supports 17³, 33³, 65³).
  - Tetrahedral interpolation with simplex decomposition for artifact-free color transforms.
  - In-memory LUT caching with SHA-256 fingerprinting.

### 2.3 Render & Compiler Pipeline
- **`src/renderers/ffmpeg-color-compiler.js`**:
  - Consolidates arbitrary grade parameter graphs into a unified 3D .cube LUT file (`artifacts/compiled_luts/`).
  - Generates deterministic FFmpeg filtergraph: `lut3d=file='...':interp=tetrahedral`.
  - Headless render pipeline with lossless verification (<1% dE vs CPU ground truth).
- **`src/renderers/color-preview.js`**:
  - Fast single-frame extraction and live grade application for the Visual Control Surface.

### 2.4 Decision Fabric Laya Triage
- **`src/decision-fabric/policy/routing-policy.json`**:
  - Certified closed vocabulary: `["bleach_bypass", "warm_golden", "teal_orange", "cinematic_contrast", "true_tone"]`.
  - Policy sentinels: `needs_review` strictly disallowed in `lut_engine`.
  - Invariant: `advisory_only: true`, `allow_direct_mutations: false`.

---

## 3. Certified LUT Inventory & Registry

All color operations referencing a 3D LUT must resolve strictly through the **EME Certified LUT Registry**:

| LUT ID | Canonical Display Name | File Path | Grid Size | SHA-256 Digest |
| :--- | :--- | :--- | :--- | :--- |
| `bleach_bypass` | Bleach Bypass Contrast | `assets/luts/bleach_bypass_33.cube` | 33³ | `07c89b3f3b97b0a8848f07ad0eec5e533c3935eeae371804c2642a8b9fcfbb15` |
| `warm_golden` | Warm Golden Hour | `assets/luts/night_warm_yellow_33.cube` | 33³ | `15e4f20be0dbbbd6a2f3d64cb23cb3be5d6eefceb3ea1e76ee8a9e7f7b3df626` |
| `teal_orange` | Cinematic Teal & Orange | `assets/luts/cine_teal_orange_33.cube` | 33³ | `f931d871b692faeb755ae0df5ee040378e906411475752ba14a413155122cb47` |
| `cinematic_contrast` | Cinematic Contrast | `assets/luts/cine_freedom_33.cube` | 33³ | `c5e128cb59a35d97034c4f346b026694e803d207ec29a6566da4bb3fc607f2d4` |
| `true_tone` | True Tone Natural Enhance | `assets/luts/quality_enhance_33.cube` | 33³ | `4859a224a1b8db52ce46d5c589b2512f4c1c9aa189dbce219a1fe186e8ca372e` |

### Enforcement Rules:
1. **Closed Vocabulary**: Any operation requesting a LUT outside this registry is rejected with `ERR_UNREGISTERED_LUT_ID`.
2. **Sentinel Rejection**: A recommendation of `needs_review` or `keep_current` from Laya cannot be executed as an operation; doing so throws `ERR_SENTINEL_NOT_EXECUTABLE`.
3. **Checksum Verification**: On engine startup or first load, LUT file SHA-256 is verified against the registry manifest.

---

## 4. Phase 17 Color Operation Contract

We define three first-class, atomic operations within EME's `OperationExecutor`:

### 4.1 Operation 1: `attach_color_grade`
Attaches or replaces a color grade on a specific timeline clip or at the global project level.

```json
{
  "type": "attach_color_grade",
  "expectedBaseRevision": 14,
  "params": {
    "clipId": "clip_main_v1",
    "projectLevel": false,
    "grade": {
      "id": "grade_warm_summer",
      "schemaVersion": "1.0.0",
      "revision": 0,
      "enabled": true,
      "exposure": 0.25,
      "whiteBalance": { "temperature": 0.15, "tint": 0.0 },
      "primary": {
        "lift": [0.0, 0.0, 0.0],
        "gamma": [1.0, 1.0, 1.0],
        "gain": [1.05, 1.0, 0.95],
        "offset": [0.0, 0.0, 0.0]
      },
      "curves": { ... },
      "hsl": { ... },
      "lut": {
        "enabled": true,
        "lutId": "warm_golden",
        "intensity": 0.8,
        "interpolation": "tetrahedral"
      }
    }
  }
}
```

### 4.2 Operation 2: `adjust_color_params`
Atomically updates specific grading parameters of an existing attached grade without clobbering other settings.

```json
{
  "type": "adjust_color_params",
  "expectedBaseRevision": 15,
  "params": {
    "clipId": "clip_main_v1",
    "adjustments": {
      "exposure": 0.5,
      "lut": {
        "intensity": 0.65
      }
    }
  }
}
```

### 4.3 Operation 3: `remove_color_grade`
Detaches the color grade from the target clip or project, restoring un-graded source rendering.

```json
{
  "type": "remove_color_grade",
  "expectedBaseRevision": 16,
  "params": {
    "clipId": "clip_main_v1",
    "projectLevel": false
  }
}
```

---

## 5. Non-Destructive Execution & Rollback Semantics

1. **Transaction Lifecycle**:
   - `OperationExecutor.execute(project, operation)` deep-clones the candidate project state.
   - Validates `expectedBaseRevision` against current project revision (concurrency lock).
   - Validates clip existence and verifies track lock status (`_assertTrackNotLocked`).
   - Validates grade payload against `schema/eme-color-grade.v1.schema.json` and mathematical bounds.
   - If validation fails, transaction aborts instantly; candidate state is discarded; zero partial mutation occurs.
   - On success, project revision increments monotonically (`revision + 1`); transaction is committed to `TransactionJournal`.
2. **Reversibility (Undo / Redo)**:
   - Every color operation records an exact inverse operation in the undo stack.
   - Inverse of `attach_color_grade` is `remove_color_grade` (or restoring prior grade if replacing).
   - Inverse of `adjust_color_params` is restoring previous parameter values.
   - Inverse of `remove_color_grade` is re-attaching the removed grade.

---

## 6. Preview vs. Committed Render Semantics

| Feature | Visual Preview Path | Committed Render Path |
| :--- | :--- | :--- |
| **Trigger** | UI playhead scrub, parameter slider drag | Explicit user action, API commit |
| **Project Mutation** | None (ephemeral projection) | Yes (atomic `OperationExecutor` commit) |
| **Compute Engine** | `src/engine/color-operations.js` / WebGL shader | `src/renderers/ffmpeg-color-compiler.js` |
| **Interpolation** | Tetrahedral (exact) | Tetrahedral (exact via FFmpeg `lut3d`) |
| **Color Space** | Rec.709 display canvas | Rec.709 lossless broadcast/web export |
| **Latency Budget** | $< 16$ ms (60 FPS interactive) | Asynchronous batch job |

---

## 7. Architectural Guardrails & Invariants

1. **Deterministic Authority**: All color adjustments and LUT applications execute strictly through EME's deterministic execution engine.
2. **Laya Decision Fabric Advisory Boundary**: Laya's `eme-color-mood` classifier suggests candidate LUT IDs with a confidence score. A suggestion is strictly advisory. It cannot directly mutate project state or dispatch an execution command without explicit user or API client ratification.
3. **Zero Mask-to-Color Coupling**: VTSM tracking sidecars (`schema/eme-vtsm-tracking.v1.schema.json`) remain strictly uncoupled from Phase 17 color operations. Applying a grade applies globally to the target clip. Regional/masked grading is reserved for a future, separately reviewed milestone.
4. **Timebase Invariant**: Timeline durations and clip boundaries remain expressed in canonical integer ticks (`TICKS_PER_SECOND = 120,000`) and half-open intervals `[start, end)`.

---

## 8. Stage 0 Verification Battery & Stage 1 Exit Gate

### 8.1 Verification Test Battery (Planned for Stage 1 Implementation):
1. **Registry & Vocabulary Enforcement**: Verify unknown LUT strings are rejected with clean error codes.
2. **Parameter Validation Bounds**: Verify exposure, lift, gamma, gain, and curve out-of-bounds inputs fail safely before execution.
3. **Transaction Atomicity & Undo/Redo**: Verify project revisions increment monotonically, undo perfectly restores previous visual state, and redos re-apply cleanly.
4. **End-to-End Render Parity**: Verify FFmpeg rendered output matches CPU reference pixel values with $< 1\%$ mean $\Delta E$.
5. **Laya Canary Isolation**: Verify that injecting simulated Laya recommendations into the session does not cause automatic or silent project mutations.

### 8.2 Stage 0 Exit Gate Determination
All requirements of Stage 0 are satisfied:
- Existing color code and assets audited.
- Certified LUT inventory frozen with SHA-256 digests.
- Versioned operation contract and parameters specified.
- Architectural guardrails (advisory-only Laya, zero VTSM mask coupling, 120k timebase) codified.

**Recommendation**: **STAGE 0 COMPLETE — READY FOR PHASE 17 STAGE 1 AUTHORIZATION**.
