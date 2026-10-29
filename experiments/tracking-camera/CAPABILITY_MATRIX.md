# Renderer Capability Matrix: Tracking Camera & HUD Pipeline

**Date:** 2026-10-16  
**Target Environment:** macOS arm64 (Apple Silicon M3), Node.js v20.20.1 / Node.js v22 pinned toolchain, HyperFrames v0.8.162, Headless Chromium 152.0.7977.30 (`--use-gl=angle --use-angle=metal`).  
**Baseline Release:** `editing-mechanics-engine@0.1.0-rc1` (commit `9ad6109b6695e3596b687dc6ea7a99d32f3723b2`).  
**Isolation Guarantee:** All experiments strictly contained in `experiments/tracking-camera/`. Zero changes to production `src/`, `bin/`, or sealed release artifacts.

---

## 1. Candidate Capability & Benchmark Summary

| Evaluation Dimension | Candidate A: CSS 3D + GSAP | Candidate B: WebGL Shader Canvas | Candidate C: Native Skia/Rust |
| :--- | :--- | :--- | :--- |
| **Execution Command** | `HyperFramesRenderer.render` | `HyperFramesRenderer.render` | `cargo run --release` |
| **Exit Code** | **0 (PASS)** | **0 (PASS)** | **127 (FAIL - Cargo not found)** |
| **Render Elapsed Time** | **11.3 s** (3.0s @ 30fps, 90 frames) | **9.2 s** (3.0s @ 30fps, 90 frames) | N/A (Build blocked) |
| **Output File Size** | 2.06 MB (1920x1080 H.264) | 3.58 MB (1920x1080 H.264) | N/A |
| **GPU Acceleration** | ANGLE Metal (Apple M3) | ANGLE Metal (Apple M3) | Skia Metal/Vulkan (theoretical) |
| **Per-Pixel Optical Effects** | Limited (CSS filter/SVG filter only) | **Full** (Chromatic aberration, scanlines, DoF, vignette) | **Full** (Direct SkSL execution) |
| **Text & Glyph Fidelity** | **Native DOM** (Perfect vector crispness) | Texture-backed (Requires canvas rasterization) | Skia SkParagraph / HarfBuzz |
| **Timeline Synchronization** | `gsap.timeline` + seek | `gsap.timeline` + seek + uniforms | Custom tick loop |
| **Dependency Footprint** | **0 new dependencies** (Built-in) | **0 new dependencies** (Built-in) | Rust toolchain, `skia-safe`, LLVM (~5 GB) |
| **Portability & Isolation** | 100% portable across web & CLI | 100% portable across web & CLI | Low (Requires native compilation per OS) |

---

## 2. Detailed Technical Findings

### Candidate A: CSS 3D Transforms + GSAP (`probes/css-3d-probe/`)
- **Mechanism:** The camera perspective is simulated using CSS `perspective: 1100px;` and 3D transforms (`rotateX`, `rotateY`, `rotateZ`, `translate3d`) on `#world-plane`. The 2D tracking HUD exists in an untransformed `#hud-layer` overlay, with screen-space coordinates computed from `experiments/tracking-camera/projection.js`.
- **Performance:** Rendered 90 frames of 1080p video in 11.3s with zero dropped frames. Frame capture utilized screenshot streaming with Metal hardware acceleration.
- **Verification:** Verified via `FrameInspector.inspectFromVideo` at `t=0.5s` and `t=2.0s`. Typography and border rendering are pixel-perfect without rasterization artifacts.
- **Best Use Case:** High-fidelity UI demonstrations, terminal code flythroughs, readable text-heavy motion graphics.

### Candidate B: WebGL Shader Canvas (`probes/webgl-shader-probe/`)
- **Mechanism:** Full-screen WebGL canvas executing a custom ray-to-plane projection fragment shader. Directly replicates `ff-tracking`'s `lens.sksl` features:
  - Perspective projection with ray-plane intersection.
  - Wavelength-dependent chromatic aberration (radial RGB offset).
  - CRT horizontal scanlines (`sin(y * freq)`).
  - Radial smoothstep lens vignette.
  - GSAP timeline updates shader uniforms (`u_time`, `u_tilt`, `u_zoom`) synchronously on every tick.
- **Performance:** Rendered 90 frames of 1080p video in **9.2s** (1.2x faster than Candidate A due to pure GPU fragment processing).
- **Verification:** Extracted frames at `t=0.5s`, `t=1.5s`, and `t=2.5s` confirm hardware shader execution on ANGLE Metal, showing pronounced cinematic chromatic aberration and CRT scanline styling.
- **Best Use Case:** Authentic cinematic tracking shots, glitch aesthetics, sci-fi HUD overlays with optical aberrations.

### Candidate C: Native Skia/Rust Companion
- **Mechanism:** Inspecting `mrsarac/ff-tracking`'s native binary pipeline (`hud` + `lens`).
- **Obstacle:** Neither `cargo` nor Rust is present on the environment. Building `skia-safe` on macOS requires Ninja, Clang, Python, and downloading prebuilt Skia binaries or compiling Skia from source.
- **Conclusion:** Violates EME's core mandate of zero external runtime dependencies and lightweight self-contained operation.

---

## 3. Recommended Hybrid Architecture for EME

Based on empirical probe results, the optimal architecture for EME is a **Composable 2-Tier Strategy**:

1. **Tier 1 (CSS 3D DOM Layer - Default):**
   - Uses `projection.js` to compute CSS 3D transform matrices and 2D HUD bounding boxes.
   - Ideal for standard EME workflows: text remains searchable, scalable, and crisp.
   - Zero WebGL overhead.

2. **Tier 2 (WebGL Lens Post-Processing Filter - Optional Opt-In):**
   - When a project specifies optical effects (`effects: [{ type: "lensAberration", intensity: 0.8 }]`), the rendered content is passed through the WebGL shader canvas as a post-processing pass.
   - Both tiers run natively within HyperFrames on headless Chromium with zero added dependencies.
