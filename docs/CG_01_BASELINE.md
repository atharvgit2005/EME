# Milestone CG-01: Baseline & Hardware Environment

**Milestone**: CG-01 (Intelligent Color Grading Engine)  
**Phase**: 17  
**System Profile**: Apple Silicon M-series (macOS darwin 25.0.0, arm64)  
**Date**: October 18, 2026  

---

## 1. Execution Runtimes & Dependency Architecture

| Component | Version | Build / Configuration | Role in Color Grading Pipeline |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.20.1` | Darwin arm64, V8 11.3 | Host runtime, API server, schema validation, CPU reference oracle |
| **FFmpeg** | `9.0.2` | Apple clang 21.0.0, Homebrew | Headless deterministic render engine, filtergraph compiler |
| **libavfilter** | `12.1.102` | Built-in | Video filter processing (`lut3d`, `curves`, `eq`, `geq`) |
| **libswscale** | `10.1.102` | Built-in, NEON optimized | High-accuracy color matrix and pixel format conversion |
| **Hardware Accel**| Apple VideoToolbox / NEON | Enabled | Hardware decode/encode, parallel SIMD rasterization |

---

## 2. Certified FFmpeg Color Filter Capabilities

Verification query: `ffmpeg -filters | grep -E "lut3d|curves|eq"`

1. **`lut3d` (TS V->V)**:
   - Supports 3D `.cube` color lookup tables up to 65x65x65.
   - Interpolation modes supported: `nearest`, `trilinear`, `tetrahedral`.
   - Certified default for EME: `interp=tetrahedral`.
2. **`curves` (TS V->V)**:
   - Supports per-component cubic spline curves for Master (`m`), Red (`r`), Green (`g`), Blue (`b`).
   - Supports arbitrary monotonic coordinate knot points in $[0, 1]$.
3. **`eq` (T. V->V)**:
   - Supports real-time adjustments for brightness, contrast, gamma, and saturation.

---

## 3. Working Color Space & Numerical Precision Standards

- **Canonical Working Space**: Rec.709 (ITU-R BT.709-6).
- **Transfer Functions (OETF/EOTF)**: Piecewise standard Rec.709 with linear toe segment ($v < 0.081 \implies v / 4.5$) and power segment ($v \ge 0.081 \implies ((v + 0.099)/1.099)^{1/0.45}$).
- **Color Domain Invariants**:
  - Exposure & White Balance: Linear-light RGB space.
  - Primary LGGO (Lift/Gamma/Gain/Offset): Rec.709 non-linear working space.
  - Cubic Splines & Curves: Normalized $[0.0, 1.0]$ coordinate domain.
  - 8-Channel Selective HSL: Cylindrical $H \in [0^\circ, 360^\circ], S \in [0, 1], L \in [0, 1]$ with circular angular distance.
  - 3D LUT Evaluation: Normalized $[0.0, 1.0]^3$ unit cube with tetrahedral interpolation and linear intensity blending.
