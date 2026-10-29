# VTSM-01 — Baseline Reconnaissance and Boundary Specification

**Experiment:** Visual Temporal State Model Foundation & Benchmark (VTSM-01)  
**Date:** 2026-10-17  
**Status:** Reconnaissance Complete // Baseline Documented  
**Workspace:** `experiments/visual-temporal-state/` (Isolated Experimental Subsystem)  

---

## 1. Existing Capabilities in EME (Read-Only Certified Baseline)

EME (`editing-mechanics-engine@0.1.0-rc1`) possesses robust deterministic execution and timeline synchronization primitives, but lacks internal perceptual reasoning about the visual contents of video clips:

1. **Deterministic Integer Timebase (`src/engine/time.js`)**:
   - 120,000 integer ticks per second (`TICKS_PER_SECOND = 120000`).
   - Exact rational frame rate representation `{ numerator, denominator }` (e.g., $24000/1001$, $30000/1001$, $60000/1001$, $30/1$, $60/1$).
   - Half-open time interval algebra `[start, start + duration)`.
   - Exact tick-to-second and second-to-tick bijective conversion.

2. **Source Media Inspection (`src/planning/source-analyzer.js`)**:
   - FFprobe stream probing (dimensions, container format, pixel format, audio channels, sampling rates).
   - Cryptographic SHA-256 payload digest calculation.
   - Exact audio signal metrics via `astats` (true peak dBFS, true RMS dBFS, silence detection).

3. **Deterministic Frame Inspection (`src/renderers/inspector.js`)**:
   - Sample-accurate still extraction at exact timestamp or integer tick via FFmpeg.
   - Inspection of rendered MP4 frames for visual conformance.

4. **Closed-Loop Visual & Audio QA Engine (`src/renderers/qa-engine.js`)**:
   - Inter-clip cut continuity & single-frame blank flash detection.
   - Canvas boundary clipping analysis.
   - Aggregate quality scoring.

5. **3D Camera Projection Mathematics (`experiments/tracking-camera/projection.js`)**:
   - Mathematical coordinate models:
     - **Canvas Space**: 2D origin at top-left $(0, 0)$, dimensions $(W, H)$.
     - **Camera Space**: 3D right-handed Cartesian space ($+X$ right, $+Y$ down, $+Z$ forward, image plane centered at $Z = 1.0$).
     - **Camera Angles**: Euler angles in radians (`tilt_x` pitch, `tilt_y` yaw, `roll` clockwise roll).
     - **Screen Space**: Viewport dimensions $(res\_w, res\_h)$.
   - Ray-to-plane intersection (`unprojectScreenPoint`) and perspective projection (`projectPoint`, `projectRect`).

---

## 2. Missing Capabilities in Current Architecture

Currently, EME operates on clips as opaque rectangular layers. It lacks the ability to:
1. **Detect Shot Boundaries**: Cannot automatically locate scene cuts, transitions, or flash frames in continuous footage.
2. **Track Visual Entities Over Time**: Cannot identify, track, or maintain persistent identities for subjects (e.g., creators, faces, products, vehicles) across multiple frames.
3. **Estimate Camera Motion from Video Pixels**: Cannot derive real-world camera translation ($\Delta X, \Delta Y$), zoom ($\Delta Z$), or rotation ($\Delta \theta$) from optical flow or feature correspondences.
4. **Distinguish Residual Entity Motion from Camera Movement**: Cannot separate background motion (induced by camera panning) from foreground object motion.
5. **Represent Occlusions & Entity Life Cycles**: Lacks representation for entrances, exits, full/partial occlusions, and re-identification.
6. **Quantify Visual Uncertainty**: Lacks confidence scores for tracking state, often risking hallucinated zero-values during ambiguous or blank frames.

---

## 3. The Intended Boundary: EME vs. Temporal Perception

To protect EME's core mandate of lightweight, zero-dependency, zero-drift determinism:

```
+-------------------------------------------------------------------------+
|                  Perception Subsystem (VTSM-01 Isolated)                |
|  - Computer Vision / Learned Perception Process Boundary                |
|  - Shot boundary detection (HSV histogram / luminance delta)            |
|  - Optical flow & feature correspondence (Lucas-Kanade / ORB / RANSAC)   |
|  - Global affine / homography camera estimation                         |
|  - Entity tracking & state management (SORT / Kalman / Bounding Boxes)  |
|  - Generates: schema/vtsm-state.v1.schema.json                          |
+-------------------------------------------------------------------------+
                                    |
                                    | (JSON serialization / validation)
                                    v
+-------------------------------------------------------------------------+
|                      EME Integration Boundary                           |
|  - Re-maps Presentation Time Stamps (PTS) -> Integer Ticks (120k/s)     |
|  - Maps Normalized Bounding Boxes -> Screen Space Coordinates           |
|  - Feeds camera motion parameters into projection.js (tilt, aim, zoom)  |
|  - Uses confidence values to gate automated editorial decisions         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                      Production EME Timeline & Engine                    |
|  - HyperFrames / Canvas / Remotion Renderers                            |
|  - Fully deterministic, reproducible, zero external runtime deps        |
+-------------------------------------------------------------------------+
```

### Boundary Guarantees:
1. **Zero Production Mutation**: Production `src/`, `bin/`, `schema/`, and `package.json` are strictly read-only.
2. **Process Isolation**: All computer vision and heavy model dependencies reside exclusively in `experiments/visual-temporal-state/` (in an isolated virtual environment or standalone scripts).
3. **Finite Numeric Representation**: Every sample in `vtsm-state.v1` must be a finite number. No `NaN`, `null` (unless explicitly nullable), or infinity.
4. **Explicit Confidence**: Zero motion is never reported when tracking is lost or ambiguous. A lost track is marked `state: "lost"` or `confidence: 0.0`.
5. **Deterministic Integer Timebase**: Timestamps are translated to canonical integer ticks ($t_{tick} = \text{round}(PTS \times 120,000)$) at the EME ingestion boundary.
