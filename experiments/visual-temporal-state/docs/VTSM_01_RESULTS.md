# VTSM-01: Visual Temporal State Model Foundation Benchmark Results

**Subsystem**: `experiments/visual-temporal-state/`  
**Evaluation Date**: 2026-10-17  
**Platform**: macOS arm64 (Apple Silicon M3), Node.js v20.20.1, Python 3.12 (.venv)  
**Status**: **ALL ACCEPTANCE TARGETS ACHIEVED (7/7 FIXTURES PASSED)**

---

## 1. Executive Summary

The VTSM-01 experiment successfully validates that the Editing Mechanics Engine (EME) can establish and reason over persistent visual temporal state from video streams, moving beyond single-frame static inspections to continuous scene comprehension.

All core subsystem deliverables have been implemented, verified, and benchmarked within the isolated experimental workspace:
1. **Canonical Temporal Schema (`schema/vtsm-state.v1.schema.json`)**: Formulates strict numeric contracts for frame observations, persistent entity tracks, rational presentation timebases (120,000 tick/sec integer clock), global camera motion transforms, and discrete scene events.
2. **Deterministic Timebase Bridge (`src/timebase.js`)**: Bridges EME's integer microsecond ticks with video rational frame rates (e.g. 30/1, 24/1, 60/1) with zero non-monotonic timestamp anomalies and lossless roundtripping.
3. **Controlled Synthetic Ground-Truth Suite (`fixtures/`)**: Procedural generation of 7 distinct 1080p @ 30 FPS clips (60 frames each) modeling translation, zoom, rotation, occlusion, scene cuts, and low-texture ambiguity with exact mathematical ground-truth JSONs.
4. **Transparent Classical Vision Baseline (`src/baseline/pipeline.py`)**: End-to-end pipeline combining HSV histogram Bhattacharyya distance for shot transitions, Shi-Tomasi + Lucas-Kanade pyramidal optical flow, RANSAC partial affine camera estimation with optical center compensation, and SORT-style Hungarian entity tracking.
5. **Learned Tracking Candidate Benchmark (`src/baseline/benchmark_learned.py`)**: Evaluated Ultralytics YOLO11 Nano + ByteTrack against the classical baseline across synthetic and natural footage, establishing trade-offs in generalization, compute footprint, and licensing constraints.
6. **Visual Evidence Generation (`src/baseline/visual_evidence.py`)**: Generated side-by-side annotated videos and high-resolution contact sheets displaying ground-truth vs. predicted bounding boxes, persistent IDs, trajectory trails, and real-time camera HUD overlays.

---

## 2. Quantitative Acceptance Targets vs. Achieved Results

| Acceptance Criterion | Formal Target | Achieved Baseline Result | Status |
| :--- | :--- | :--- | :--- |
| **Schema Validation** | 100% valid schema compliance | **100% (7/7 fixtures pass `assertValid`)** | **PASS** |
| **Timestamp Monotonicity** | Zero ordering or PTS violations | **0 violations across all 420 frames** | **PASS** |
| **Trajectory Center Error (Median)** | $\le 3.0$ px at 1080p | **0.00 – 0.40 px (Mean across suite: 0.18 px)** | **PASS** |
| **Trajectory Center Error (P95)** | $\le 8.0$ px at 1080p | **0.00 – 0.60 px (Mean across suite: 0.34 px)** | **PASS** |
| **Camera Translation Error (Median)**| $\le 2.0$ px/frame | **0.00 – 0.07 px/frame** | **PASS** |
| **Scene-Cut Detection ($F_1$)** | $F_1 \ge 0.95$ | **$F_1 = 1.00$ (Precision: 1.00, Recall: 1.00)** | **PASS** |
| **Identity Switches** | 0 switches on continuous tracks | **0 switches across all fixtures** | **PASS** |
| **Uncertainty Calibration** | Explicit low confidence on ambiguous input | **59/59 low-confidence frames on Fixture G** | **PASS** |

---

## 3. Fixture-by-Fixture Performance Breakdown

### Fixture A: Static Camera, Moving Subject
- **Dynamics**: Linear diagonal subject displacement ($x: 200 \rightarrow 1380, y: 250 \rightarrow 650$) across stationary background.
- **Trajectory Median Error**: **0.25 px** ($\le 3.0$ px target).
- **Trajectory P95 Error**: **0.47 px** ($\le 8.0$ px target).
- **Max Center Error**: 0.49 px | **Mean IoU**: 0.9969.
- **Camera Translation Error**: **0.00 px/frame** (Zero false camera motion detected).
- **ID Switches**: 0 | **Lost Track Frames**: 0.
- **Verdict**: **PASS**

### Fixture B: Horizontal Camera Pan (+12 px/frame) with Moving Subject
- **Dynamics**: World camera pan ($dx = +12.0$ px/frame) with foreground subject moving at $+4$ px/frame in world coordinates ($-8$ px/frame apparent screen velocity).
- **Trajectory Median Error**: **0.00 px** ($\le 3.0$ px target).
- **Trajectory P95 Error**: **0.00 px** ($\le 8.0$ px target).
- **Mean IoU**: 1.0000.
- **Camera Translation Error**: **0.00 px/frame** (RANSAC accurately recovered $dx = +12.0$ px/frame).
- **Camera Compensated Motion**: Correctly decomposed $+4.0$ px/frame world motion from $-8.0$ px/frame raw screen motion.
- **ID Switches**: 0.
- **Verdict**: **PASS**

### Fixture C: Camera Zoom (1.0x -> 1.5x) with Stationary Subject
- **Dynamics**: Pure camera optical zoom centered at $(960, 540)$ with stationary centered subject.
- **Trajectory Median Error**: **0.00 px** ($\le 3.0$ px target).
- **Trajectory P95 Error**: **0.00 px** ($\le 8.0$ px target).
- **Mean IoU**: 0.9942.
- **Camera Scale Accuracy**: Mean scale ratio error = **0.0001** (recovered frame delta scale $1.0084$).
- **Camera Center Translation Error**: **0.07 px/frame** (Optical center origin compensation prevented zoom from being misclassified as translation).
- **ID Switches**: 0.
- **Verdict**: **PASS**

### Fixture D: Camera Rotation/Tilt with Parabolic Subject Motion
- **Dynamics**: Continuous camera rotation ($-0.15 \rightarrow +0.15$ rad, $\Delta \theta = +0.00508$ rad/frame) combined with parabolic subject arc.
- **Trajectory Median Error**: **0.40 px** ($\le 3.0$ px target).
- **Trajectory P95 Error**: **0.60 px** ($\le 8.0$ px target).
- **Max Center Error**: 0.61 px | **Mean IoU**: 0.9934.
- **Camera Translation Error**: **0.01 px/frame** ($\le 2.0$ px/frame target).
- **Camera Rotation Accuracy**: Mean rotation error = **0.0000 rad** (exact match with $0.00508$ rad/frame).
- **ID Switches**: 0.
- **Verdict**: **PASS**

### Fixture E: Temporary Occlusion Behind Foreground Pillar
- **Dynamics**: Subject traverses horizontally ($x: 300 \rightarrow 1500$) passing behind a dark foreground pillar ($x: 860..1060$), undergoing complete visual disappearance for 16 frames (frames 22–37) before reappearing.
- **Trajectory Median Error (Visible Frames)**: **0.27 px** ($\le 3.0$ px target).
- **Trajectory P95 Error**: **0.42 px** ($\le 8.0$ px target).
- **Occlusion Handling**: Zero false-positive observations emitted during total occlusion; visibility state correctly transitioned `visible` $\rightarrow$ `occluded` $\rightarrow$ `visible`.
- **Re-identification / Track Recovery**: Successfully recovered persistent track ID `ent_01` upon exit from pillar with 0 identity switches.
- **Verdict**: **PASS**

### Fixture F: Hard Scene Cut with Similar-Looking Subjects
- **Dynamics**: Abrupt scene cut at frame 30 ($t = 1.0$s) switching from blue tech background to amber background, with similar red subject jumping from right to left across the cut.
- **Scene-Cut Precision**: **1.00** | **Recall**: **1.00** | **$F_1$ Score**: **1.00** ($\ge 0.95$ target).
- **Shot Partitioning**: Correctly created `shot_01` (frames 0–29) and `shot_02` (frames 30–59).
- **Cut Identity Policy**: Complied with `reset_on_cut` policy; track ID gracefully transitioned from `ent_01` to `ent_02` without conflating disjoint subjects across the cut.
- **Trajectory Median Error**: **0.34 px** | **P95 Error**: **0.53 px**.
- **Verdict**: **PASS**

### Fixture G: Low-Texture Smooth Gradient (Stress Test)
- **Dynamics**: Continuous subtle gradient without high-frequency edges or texture (Laplacian variance $< 2.0$).
- **Uncertainty Target**: Must report explicit low confidence or invalid camera transform rather than false precision.
- **Achieved Calibration**: **59/59 frames** correctly marked `valid: false` with low confidence ($0.20 - 0.40$). Zero spurious camera motion or hallucinated entity tracks.
- **Verdict**: **PASS**

---

## 4. Pretrained Learned Candidate Benchmark

We benchmarked **Ultralytics YOLO11 Nano (`yolo11n.pt`) with ByteTrack** (`bytetrack.yaml`) in our isolated `.venv` to establish an empirical comparison with the classical baseline:

### Checkpoint Provenance
- **Model Checkpoint**: `yolo11n.pt` (Downloaded to `experiments/visual-temporal-state/yolo11n.pt`)
- **Parameters**: 2.6M parameters
- **File Size**: 5,613,764 bytes (5.35 MB)
- **SHA-256 Checksum**: `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1`
- **License**: **AGPL-3.0** (Ultralytics)

### Comparative Benchmark Results

| Dimension | Classical Vision Baseline (`src/baseline/pipeline.py`) | Learned Candidate (`YOLO11n + ByteTrack`) |
| :--- | :--- | :--- |
| **Inference Latency** | **35 – 55 ms/frame** (18 – 28 FPS on CPU) | **62.5 – 246.4 ms/frame** (4 – 16 FPS on CPU) |
| **Memory / Footprint** | Lightweight (~40 MB RAM, 0 MB model weights) | Heavyweight (~650 MB PyTorch tensor runtime, 5.35 MB checkpoint) |
| **Synthetic Shape Recall** | **100% (60/60 frames tracked)** | **0% (0/60 frames detected)** — COCO category blind spot |
| **Natural Video Recall** | Saliency / motion dependent | **100% (60/60 frames tracked on `creator_clean_15s.mp4`)** |
| **Camera Motion Decomp** | **Full 2D Partial Affine (dx, dy, scale, rot)** | None (requires external gyro or SLAM model) |
| **Licensing Feasibility** | **100% Permissive (Apache 2.0 / MIT)** | **BLOCKED for EME Production (AGPL-3.0 copyleft)** |

### Key Insight
Pretrained object detection models trained on standard datasets (COCO) exhibit strong semantic bias toward specific real-world classes (e.g. `person`, `car`). They fail completely zero-shot on synthetic geometric shapes, stylized UI elements, and motion graphics. Conversely, the classical baseline operates directly on physical visual signals (color saliency, optical gradients, feature corners), making it uniformly applicable across graphic and natural video domains with zero weight bloat.

---

## 5. Visual Evidence Artifacts

The following visual artifacts were generated and saved in `experiments/visual-temporal-state/artifacts/`:

1. **`artifacts/fixture_a_annotated.mp4`**:
   - Full 60-frame 1080p MP4 comparing predicted bounding boxes (cyan) and persistent trajectory trails against ground-truth bounding boxes (green) and trail paths.
   - HUD banner displays real-time camera motion estimates, confidence, and timestamp.
2. **`artifacts/fixture_e_annotated.mp4`**:
   - Full 60-frame 1080p MP4 illustrating temporal occlusion behavior, showing smooth trajectory coasting, zero false positives during pillar transit, and instantaneous re-acquisition.
3. **`artifacts/vtsm_contact_sheet.png`**:
   - High-resolution 3×3 matrix (1920×1080 canvas) capturing key milestone frames across all 7 fixtures (Fixture A motion, Fixture B pan, Fixture C zoom, Fixture D tilt, Fixture E occlusion, Fixture E recovery, Fixture F cut before, Fixture F cut after, Fixture G ambiguous low-texture).

---

## 6. Failure Taxonomy & Boundary Limitations

Through rigorous benchmarking across controlled stress conditions, we identified the following boundary conditions:

1. **Camera Origin Coupling under Pure Rotation**:
   - *Phenomenon*: Standard affine decomposition around the top-left origin $(0, 0)$ introduces apparent translation artifacts during pure rotation or zoom.
   - *Mitigation*: Implemented optical center offset compensation relative to image center $(c_x, c_y) = (960, 540)$:
     $$\Delta X_{center} = tx - c_x(1 - a) - c_y \cdot b, \quad \Delta Y_{center} = ty - c_y(1 - a) + c_x \cdot b$$
     which brought camera translation error down from 11.2 px/frame to 0.01 px/frame.
2. **Motion Ambiguity on Low-Frequency Textures (Laplacian Variance $< 8.0$)**:
   - *Phenomenon*: Blank skies, smooth gradients, and extreme motion blur cause Lucas-Kanade optical flow equations to become singular.
   - *Mitigation*: Evaluator verifies Laplacian texture variance before feature extraction; if insufficient features exist, the frame is explicitly flagged `valid: false` with low confidence ($0.20$), avoiding hallucinated drift.
3. **Identity Preservation Across Cuts**:
   - *Phenomenon*: Similar appearance on both sides of a hard scene cut can cause naive trackers to merge distinct entities.
   - *Mitigation*: Shot boundary detection strictly enforces `reset_on_cut` policy, spawning a new entity ID upon cut transition.

---

## 7. Recommendations for VTSM-02

1. **Class-Agnostic Foreground Segmentation**:
   - Integrate an Apache-2.0 or MIT licensed class-agnostic segmenter (e.g. MobileSAM or FastSAM with ONNX runtime) behind an isolated subprocess worker to replace color saliency with zero-shot arbitrary object masking.
2. **Kalman State Estimator**:
   - Augment SORT tracking with a constant-acceleration Kalman filter to provide smooth velocity predictions during multi-frame occlusions.
3. **Multi-Entity Relational Graph**:
   - Extend the temporal state model schema to include inter-entity spatial relationships (e.g., `left_of`, `in_front_of`, `approaching`).
4. **EME Production Integration Boundary**:
   - Keep all heavyweight Python / PyTorch / OpenCV perception modules behind an asynchronous JSON/IPC process adapter. EME production code should consume only the validated `vtsm-state.v1` JSON state documents.

---

## 8. Verification of Clean Production Baseline

A final check of the Git working tree confirms that **zero modifications** were made to production EME files:
- Production `src/`: **Clean & Unmodified**
- Production `bin/`: **Clean & Unmodified**
- Production `schema/`: **Clean & Unmodified**
- Production `package.json`: **Clean & Unmodified**
- All experimental files, schemas, scripts, virtual environments, checkpoints, and outputs are strictly contained in `experiments/visual-temporal-state/`.
