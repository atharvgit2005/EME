# Phase 17: Intelligent Color Grading Engine (CG-01) Plan

**Milestone**: CG-01  
**Lead Authority**: ChatGPT Architecture Lead (Directive: `plans/CHATGPT_COLOR_TIMELINE_KICKOFF.md`)  
**Objective**: Build a versioned, non-destructive, mathematically precise color grading subsystem with CPU reference oracle, 3D LUT engine, professional grading controls (Lift/Gamma/Gain, Bézier curves, 8-channel HSL), scene intelligence (True Tone & skin tone protection), GPU real-time preview (60 FPS / P95 $\le 16.67$ ms), and deterministic FFmpeg render compilation with validated parity.

---

## Subphases & Task Breakdown

### Subphase 17.1: Contracts & Reference Math
- [ ] Create `schema/eme-color-grade.v1.schema.json`:
  - Versioned schema for grading state (`schemaVersion: "1.0.0"`, `gradeId`, `enabled`, `revision`).
  - Exposure (EV), Temperature (K or offset), Tint (green-magenta).
  - Lift, Gamma, Gain, Offset per-channel RGB arrays.
  - Cubic Bézier curves (Master/Luma, Red, Green, Blue) with control points (`anchor`, `left_control`, `right_control`).
  - 8-Channel selective HSL adjustments (`hue`, `saturation`, `lightness`).
  - Creative 3D LUT reference (`assetId`, `sha256`, `domain`, `interpolation`, `intensity`).
  - Skin protection configuration (enable, weight, tolerance).
  - Separate `sceneAnalysis` recommendations container (provenance, confidence, non-mutating).
- [ ] Create `src/engine/color-grade.js`:
  - Validator and factory methods for canonical grading state.
  - Atomic validation and state immutability helpers.
- [ ] Create `src/engine/color-space.js`:
  - Documented Rec.709 / sRGB transfer function and matrix conversions.
  - Linear-light $\leftrightarrow$ non-linear working domain conversions.
  - Numerical bounds and clipping safety.

### Subphase 17.2: 3D LUT Engine
- [ ] Create `src/engine/lut-parser.js`:
  - Parser for `.cube` format supporting 17³, 33³, 65³ grids.
  - Headers: `TITLE`, `LUT_3D_SIZE`, `DOMAIN_MIN`, `DOMAIN_MAX`.
  - Strict validation: exact RGB entry counts, finite values, domain bounds.
  - Content SHA-256 caching and metadata extraction.
- [ ] Create `src/engine/lut-evaluator.js`:
  - High-precision CPU evaluator supporting:
    - Nearest neighbor.
    - Trilinear interpolation.
    - **Tetrahedral interpolation** (canonical default for color grading).
  - Exact intensity blending: $C_{\text{graded}} = (1 - w) \cdot C_{\text{in}} + w \cdot \text{LUT}(C_{\text{in}})$.
  - Exact bypass at $w=0.0$, full LUT at $w=1.0$.
- [ ] Programmatic Reference LUT Fixture Generator:
  - Generate identity LUT, inverted LUT, channel permutation LUT, contrast ramp, and cinematic teal/orange test LUT.

### Subphase 17.3: Professional Grading Controls
- [ ] Create `src/engine/color-operations.js`:
  - **Exposure**: Linear-light gain $C_{\text{linear}} \times 2^{\text{EV}}$.
  - **White Balance**: CCT/Tint color matrix in linear space.
  - **Lift / Gamma / Gain / Offset**: Per-channel formula:
    $$C' = \text{Offset} + \text{Gain} \times \left( \text{Lift} \times (1 - C) + C \right)^{\frac{1}{\text{Gamma}}}$$
  - **Cubic Bézier Curves**: Cubic Bézier spline solver mapping $x \to y$ for Master, Luma, R, G, B with monotonicity checks.
  - **8-Channel Selective HSL**: Circular hue distance calculation with smooth Gaussian/Hermite overlap weights across Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta.
  - **Skin-Tone Protection**: Vectorscope I-line angle ($\approx 123^\circ$ in YCbCr / $+33^\circ$ from Q axis) with adaptive preservation weighting.

### Subphase 17.4: GPU Interactive Preview & Multi-LUT Matrix
- [ ] Create `src/renderers/color-preview.js` & Shader Pipeline:
  - GPU shader implementation (WebGL2 / Canvas GL / headless Metal-compatible fragment shader) executing the canonical grading graph.
  - 1080p execution target: P95 $\le 16.67$ ms/frame (60 FPS interactive path).
  - 4-Up Multi-LUT Preview Matrix: Generates independent 4-tile comparison applying distinct LUT candidates to the identical base frame.

### Subphase 17.5: Deterministic FFmpeg Render Compiler & Parity Audit
- [ ] Create `src/renderers/ffmpeg-color-compiler.js`:
  - Translates canonical `color-grade.v1` into deterministic FFmpeg filtergraph:
    - `eq` filter for exposure/gamma/saturation adjustments.
    - `curves` filter for cubic Bézier spline interpolation.
    - `lut3d` filter for 3D `.cube` evaluation with `interp=tetrahedral`.
  - Generates reproducible shell commands and execution manifests with input/output SHA-256 hashes.
- [ ] Parity Verification Harness (`tests/color-parity.test.js`):
  - Compare lossless decoded PNG frames rendered via FFmpeg against reference CPU oracle across all test fixtures.
  - Acceptance threshold: Mean absolute error $\le 1.5$ code values (8-bit), P99 $\le 4.0$ code values.

### Subphase 17.6: Scene Intelligence, True Tone & Exit Gate
- [ ] Create `src/engine/scene-intelligence.js`:
  - Image scene statistics: White point estimation (Grey World & White Patch), exposure histogram (shadow/highlight clipping risk).
  - CCT (Correlated Color Temperature) and tint estimation with confidence score.
  - Skin tone detection (YCbCr / HSV mask) and vectorscope representation.
  - Non-mutating recommendation generator (requires user acceptance before grade mutation).
- [ ] Documentation & Exit Gate:
  - `docs/CG_01_BASELINE.md`: Environment & hardware profile.
  - `docs/CG_01_COLOR_CONTRACT.md`: Complete mathematical specification of all color operations.
  - `docs/CG_01_RESULTS.md`: Detailed test telemetry, parity distributions, and benchmark FPS.
  - `docs/CG_01_EXIT_GATE.md`: Formal exit gate record for ChatGPT sign-off.
