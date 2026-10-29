# VTSM-03: Efficient Temporal Propagation and Adaptive Re-segmentation Plan

**Subsystem**: `experiments/visual-temporal-state/`  
**Planning Date**: 2026-10-18  
**Author**: Antigravity Technical Agent  
**Supervising Body**: ChatGPT Architecture Lead  
**Status**: **PREPARED FOR AUTHORIZATION (EXPERIMENTAL PROPOSAL ONLY — NOT YET EXECUTED)**

---

## 1. Motivation and Problem Statement

The empirical results from VTSM-02 demonstrated that:
1. MobileSAM's TinyViT image encoder requires **122.9 ms per frame** on Apple Silicon MPS GPU (~437 ms on CPU).
2. Generating fresh image embeddings on every frame caps full-pipeline end-to-end throughput at **~3.5 – 3.9 FPS**, which cannot support interactive preview during playback (target $\ge 20$ FPS).
3. MobileSAM's mask decoder, by contrast, is extremely lightweight (**13.7 ms** for a single prompt on MPS).
4. Full-frame segmentation on every frame is redundant when subject motion and visual deformation between adjacent frames ($\Delta t \approx 33$ ms) are small.

**Objective**: Implement **VTSM-03 (Efficient Temporal Propagation and Adaptive Re-segmentation)** to achieve **$\ge 20$ FPS throughput** on Apple Silicon MPS while maintaining tracking accuracy ($\le 1.5$ px median center error) and zero identity switches.

---

## 2. 4-Pillar Technical Architecture

```
                    +------------------------------------+
                    |        Input Video Frames          |
                    +-----------------+------------------+
                                      |
                       Is Keyframe or Re-segmentation?
                                     / \
                               YES  /   \  NO
                                   /     \
  +-------------------------------+       +---------------------------------+
  |      KEYFRAME SEGMENTATION    |       |     INTERMEDIATE PROPAGATION    |
  |  - TinyViT Encoder (122.9 ms) |       |  - Dense Optical Flow Warp      |
  |  - Prompt Decoder (13.7 ms)   |       |  - Camera Affine Compensation   |
  |  - Refresh Track Mask Embed   |       |  - Latency: ~3 - 5 ms / frame   |
  +---------------+---------------+       +----------------+----------------+
                  \                                        /
                   \                                      /
                    +-----------------+------------------+
                                      |
                     +----------------v-----------------+
                     |   ADAPTIVE FAILURE DETECTORS     |
                     |  - Forward-backward flow error   |
                     |  - Mask area distortion (> 30%)  |
                     |  - Kalman centroid divergence    |
                     |  - Appearance confidence drop    |
                     +----------------+-----------------+
                                      |
                             Failure Triggered?
                                     / \
                               YES  /   \  NO
                                   /     \
             Trigger Immediate Re-seg     Accept Propagated Mask
```

### Pillar 1: Keyframe Frame-Selection Policy
MobileSAM TinyViT full-frame encoding is executed strictly at:
1. **Shot Starts & Cut Boundaries**: Frame 0 and every frame $t_{cut}$ identified by the shot boundary detector.
2. **New Track Initiation**: When an unconfirmed detection enters `STATE_CONFIRMED`.
3. **Periodic Anchor Points**: Every $N = 10$ frames (0.33 s at 30 FPS) to prevent compounding optical drift.

### Pillar 2: Intermediate Frame Mask Propagation
For frames between keyframes ($t \in (k, k+N)$):
1. Compute forward Lucas-Kanade optical flow between frame $t-1$ and frame $t$ within the dilated entity bounding box.
2. Warp the binary mask and boundary points using the estimated pixel flow field:
   $$M_t(x + u, y + v) = M_{t-1}(x, y)$$
3. Apply camera compensation affine warp to maintain global background alignment.
4. Total propagation compute latency: **~3.5 ms per frame** (enabling $\approx 25 - 30$ FPS aggregate pipeline throughput).

### Pillar 3: Adaptive Re-segmentation Triggers (Failure Detectors)
If intermediate optical propagation encounters any of the following 4 conditions, the pipeline immediately triggers an out-of-cycle MobileSAM re-segmentation on that frame:
1. **Forward-Backward Flow Consistency Violation**:
   $$\| (u_{fwd} + u_{bwd}, v_{fwd} + v_{bwd}) \|_2 > 3.0 \text{ px on } > 15\% \text{ of mask pixels}$$
2. **Mask Geometric Deformation (Area Shrinkage / Expansion)**:
   $$\frac{\text{Area}(M_t)}{\text{Area}(M_{t-1})} < 0.70 \quad \text{or} \quad \frac{\text{Area}(M_t)}{\text{Area}(M_{t-1})} > 1.35$$
3. **Kalman Prediction vs Optical Centroid Divergence**:
   $$\| \mathbf{c}_{kalman}(t) - \mathbf{c}_{flow}(t) \|_2 > 25.0 \text{ px}$$
4. **Appearance Dissimilarity**:
   Normalized color histogram correlation within the mask drops below $\rho < 0.75$.

### Pillar 4: Natural-Footage Ground Truth Suite
In addition to the 7 synthetic fixtures (A through G), VTSM-03 will evaluate a curated natural footage benchmark:
- **Clip N-01**: Human creator speaking with hand gestures and head movement (foreground face/torso mask).
- **Clip N-02**: Outdoor runner with dynamic background motion and temporary occlusion behind a tree.
- **Clip N-03**: Handheld smartphone camera pan with variable motion blur.
Ground truth will consist of independently validated frame masks and bounding boxes.

---

## 3. Controlled Speed-vs-Accuracy Ablation Matrix

VTSM-03 will evaluate 4 systematic configurations:
1. **`vtsm02_full_mobilesam` (Baseline)**: Full MobileSAM encoding on every frame (~3.5 FPS).
2. **`vtsm03_fixed_keyframe_N10`**: Keyframes every 10 frames with pure optical flow propagation (no adaptive re-segmentation).
3. **`vtsm03_fixed_keyframe_N20`**: Keyframes every 20 frames with pure optical flow propagation.
4. **`vtsm03_adaptive_hybrid`**: Dynamic keyframes + optical flow + 4 adaptive re-segmentation triggers.

### Target Performance Metrics
| Metric | Full MobileSAM Baseline | VTSM-03 Target |
| :--- | :--- | :--- |
| **Pipeline Throughput** | ~3.5 – 3.9 FPS | **$\ge 20.0$ FPS** |
| **Per-Frame Median Latency** | ~274 ms | **$\le 50$ ms** |
| **Trajectory Center Error** | 0.66 px | **$\le 1.50$ px** |
| **Mean Mask IoU** | 0.8385 | **$\ge 0.8000$** |
| **Identity Switches** | 0 switches | **0 switches** |
| **Occlusion Fabrications** | 0 fabricated masks | **0 fabricated masks** |

---

## 4. Execution Boundary & Safety Guarantees

1. **Isolation**: All implementation remains strictly inside `experiments/visual-temporal-state/src/propagation/`, `fixtures/`, and `tests/`.
2. **Production Code**: Zero modifications to production `src/`, `bin/`, `schema/`, `package.json`, release tags, or historical Live Pilot evidence.
3. **Comparison Baseline**: The VTSM-02 full-frame pipeline (`src/tracker/pipeline_vtsm02.py`) is preserved bit-for-bit as the gold-standard accuracy baseline.
4. **Hardware Verification**: Benchmarked on macOS arm64 (Apple Silicon M3) under warm MPS acceleration.

---

## 5. Recommendation & Roadmap Decision

- **VTSM-02R Disposition**: **PASS (Reconciliation Complete)**.
- **VTSM-03 Status**: Ready for implementation upon authorization by ChatGPT Architecture Lead.
