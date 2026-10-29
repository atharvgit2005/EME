# Phase 17 Stage 1: Implementation Plan & Core Color Operation Hardening

**Document Version**: 1.0.0  
**Phase**: Phase 17 — Deterministic Color Engine  
**Stage**: Stage 1 — Implementation Plan & Core Operation Hardening  
**Author**: Engineering Team  
**Architecture Lead**: ChatGPT Architecture Lead (Authorized in `plans/CHATGPT_PHASE17_STAGE0_REVIEW.md`)  
**Date**: October 20, 2026  
**Status**: APPROVED & IN EXECUTION  

---

## 1. Objective & Scope

Under the formal authorization from the ChatGPT Architecture Lead:
- **Primary Goal**: Harden the deterministic color engine so that color grade attachment, parameter adjustment, removal, rendering, and transactional undo/redo behave predictably under valid requests, invalid input, concurrent edits, and execution failures.
- **Invariants Enforced**:
  1. **Strict Deterministic Authority**: Deterministic Color Engine is 100% authoritative for color mutations.
  2. **Advisory Decision Fabric**: Laya's `eme-color-mood` recommendations remain strictly advisory. Sentinels `needs_review` and `keep_current` are non-executable.
  3. **Zero Mask Coupling (VTSM Isolation)**: Spatial tracking sidecars (`schema/eme-vtsm-tracking.v1.schema.json`) remain strictly uncoupled from color operations.
  4. **Timebase & Schema Invariance**: `schema/eme-project.v1.schema.json` remains untouched; `TICKS_PER_SECOND = 120,000` and half-open intervals `[start, end)` preserved.
  5. **Transaction Atomicity & Reversibility**: Reversible state transitions with exact inverse operations recorded in `TransactionJournal`.
  6. **Mathematical Render Parity**: Clearly defined, reproducible color difference metric (CIE76 $\Delta E_{ab}^*$) between CPU reference and FFmpeg headless rendering.

---

## 2. Component Architecture & Responsibilities

| Subsystem / File | Responsibility |
| :--- | :--- |
| `src/engine/lut-registry.js` | Certified LUT Registry. Validates certified LUT IDs, rejects sentinels, verifies disk file existence and cryptographic SHA-256 digests. |
| `src/engine/color-grade.js` | Schema validation, default grade generation, deep cloning, and canonical grade hashing. |
| `src/engine/color-operations.js` | Reference 6-stage pixel pipeline (Linear Exp/WB -> LGGO -> Curves -> 8-ch HSL -> Skin Protection -> 3D LUT -> Rec.709). |
| `src/engine/operations.js` | Implements `attach_color_grade`, `adjust_color_params`, `remove_color_grade` in `OperationExecutor`. Enforces `expectedBaseRevision`, track lock checks, parameter bounds, atomicity, and inverse operation generation. |
| `src/engine/transaction-journal.js` | Records atomic operations and exact inverse operations for 100% reversible undo/redo. |
| `src/renderers/ffmpeg-color-compiler.js` | Compiles validated color grades to 3D `.cube` LUTs and builds deterministic `lut3d=file=...:interp=tetrahedral` filtergraphs. |
| `tests/color-stage1-hardening.test.js` | Comprehensive Stage 1 test battery covering valid operations, bounds violations, sentinel rejections, rollback, undo/redo, and render parity. |

---

## 3. Detailed Operation Specifications

### 3.1 Precedence & Hierarchy Semantics
- **Clip-level grade**: Explicitly set on `clip.colorGrade`. Takes absolute precedence for that clip.
- **Project-level grade**: Set on `project.colorGrade`. Applies as the default to all clips that do not have their own `clip.colorGrade`.
- **Ungraded fallback**: If neither `clip.colorGrade` nor `project.colorGrade` is set (or if `enabled === false`), clip renders unaltered in its native Rec.709 transfer characteristics.

### 3.2 Operation 1: `attach_color_grade`
- **Target**: Either `clipId` (must exist on an unlocked track) or `projectLevel: true`.
- **Payload**: Full canonical `grade` object or `gradeId`.
- **Validation**:
  - Validates against `schema/eme-color-grade.v1.schema.json`.
  - If `grade.lut && grade.lut.enabled`: requires valid certified `lutId` matching registered SHA-256.
  - Rejects unknown LUT IDs (`ERR_UNREGISTERED_LUT_ID`) and sentinels (`ERR_SENTINEL_NOT_EXECUTABLE`).
  - Rejects NaN/Infinity or out-of-bounds parameters.
- **Inverse Operation**:
  - If previous grade existed: `attach_color_grade` with previous grade.
  - If no previous grade existed: `remove_color_grade` for that target.

### 3.3 Operation 2: `adjust_color_params`
- **Target**: `clipId` or `projectLevel: true`. Target must already have an attached color grade (throws `ERR_NO_ATTACHED_GRADE` otherwise).
- **Payload**: `adjustments` object containing partial parameter paths.
- **Supported adjustment paths**:
  - `enabled`: boolean
  - `exposure`: number in `[-6.0, 6.0]`
  - `whiteBalance`: `{ temperature?: [-1.0, 1.0], tint?: [-1.0, 1.0] }`
  - `primary`: `{ lift?: [3], gamma?: [3], gain?: [3], offset?: [3] }` with finite values.
  - `curves`: `{ master?, red?, green?, blue?, luma? }` with non-decreasing monotonic Bézier points.
  - `hsl`: `{ [channel]?: { hue?: [-180, 180], saturation?: [-1, 1], lightness?: [-1, 1] } }`
  - `lut`: `{ enabled?: boolean, lutId?: string, intensity?: [0.0, 1.0], interpolation?: string }`
  - `skinProtection`: `{ enabled?: boolean, weight?: [0, 1], tolerance?: [0, 1] }`
- **Partial Update Guarantee**:
  - Any parameter not explicitly specified in `adjustments` is strictly preserved.
  - Deep merge performs type and bounds checking on every modified node.
  - Unknown paths cause transaction abort (`ERR_INVALID_PARAM_PATH`).
- **Inverse Operation**:
  - Exact `adjust_color_params` specifying previous values of all modified paths.

### 3.4 Operation 3: `remove_color_grade`
- **Target**: `clipId` or `projectLevel: true`.
- **Validation**:
  - Target must exist and track must not be locked.
  - Target must currently have a color grade (throws `ERR_NO_GRADE_TO_REMOVE` if already absent).
- **Execution**: Deletes the `colorGrade` property from target clip or project.
- **Inverse Operation**:
  - `attach_color_grade` restoring the exact grade that was removed.

---

## 4. Reproducible Color-Parity Certification Protocol

To satisfy ChatGPT's directive to define an unambiguous, reproducible measurement protocol rather than a loose percentage:

### 4.1 Metric Definition: CIE76 $\Delta E_{ab}^*$
1. **Color Space**: Both CPU reference output and FFmpeg decoded output are represented as Rec.709 RGB with standard transfer function in 8-bit unsigned integer depth ($[0, 255]$).
2. **Linearization & Conversion**:
   - Normalized RGB values $[0, 1]$ linearized via Rec.709 / sRGB inverse transfer function:
     $$C_{\text{linear}} = \begin{cases} C / 12.92 & C \le 0.04045 \\ \left(\frac{C + 0.055}{1.055}\right)^{2.4} & C > 0.04045 \end{cases}$$
   - Linear RGB converted to CIE $XYZ$ using standard D65 matrices:
     $$\begin{bmatrix} X \\ Y \\ Z \end{bmatrix} = \begin{bmatrix} 0.4124564 & 0.3575761 & 0.1804375 \\ 0.2126729 & 0.7151522 & 0.0721750 \\ 0.0193339 & 0.1191920 & 0.9503041 \end{bmatrix} \begin{bmatrix} R_{\text{linear}} \\ G_{\text{linear}} \\ B_{\text{linear}} \end{bmatrix}$$
   - CIE $XYZ$ converted to CIE $L^*a^*b^*$ relative to standard 2° D65 illuminant ($X_n=0.95047, Y_n=1.00000, Z_n=1.08883$).
3. **Difference Formula**:
   $$\Delta E_{ab}^* = \sqrt{(L_1^* - L_2^*)^2 + (a_1^* - a_2^*)^2 + (b_1^* - b_2^*)^2}$$
4. **Channel Digital Number (DN) MAE**:
   $$\text{MAE} = \frac{1}{3N} \sum_{i=1}^N (|R_1 - R_2| + |G_1 - G_2| + |B_1 - B_2|)$$

### 4.2 Test Fixtures & Palette
- **Resolution**: 1024x1024 synthetic reference card (`tests/fixtures/color_parity_card_1024.png`).
- **Regions**:
  1. 32-step neutral grayscale gradient ($Y \in [0, 255]$).
  2. Full saturation primaries and secondaries (Red, Green, Blue, Cyan, Magenta, Yellow).
  3. Continuous 2D hue-saturation color wheel.
  4. Real-world skin tone reference patches across 6 Fitzpatrick skin categories.
  5. Extreme shadow ($[0, 10]$) and highlight ($[245, 255]$) clipping zones.

### 4.3 Acceptance Thresholds:
| Metric | Acceptance Threshold | Physical Meaning |
| :--- | :--- | :--- |
| **Mean $\Delta E_{ab}^*$** | **$< 0.85$** | Well below Just Noticeable Difference (JND $\approx 1.0$) |
| **95th Percentile $\Delta E_{ab}^*$** | **$< 1.80$** | No visible distortion across 95% of pixels |
| **Max $\Delta E_{ab}^*$** | **$< 3.50$** | Guarded 8-bit quantization / tetrahedral boundary error |
| **Mean RGB DN MAE** | **$< 0.75$ DN** | Sub-digital-number rounding agreement |

---

## 5. Execution Roadmap

1. **Stage 1A**: Contract and implementation plan freeze (this document).
2. **Stage 1B**: Create `src/engine/lut-registry.js` with certified vocabulary and SHA-256 checks.
3. **Stage 1C**: Implement `_opAttachColorGrade`, `_opAdjustColorParams`, `_opRemoveColorGrade` with bounds checking and inverse operation logging in `src/engine/operations.js`.
4. **Stage 1D**: Verify FFmpeg render compiler against the CIE76 $\Delta E_{ab}^*$ parity protocol.
5. **Stage 1E**: Implement and run `tests/color-stage1-hardening.test.js` and execute full master regression suite.
6. **Stage 1F**: Publish `plans/PHASE_17_STAGE1_COMPLETION_REPORT.md`.
