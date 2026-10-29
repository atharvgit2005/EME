# VTSM-03: Architectural Exit Gate & Generalization Protocol

**Subsystem**: `experiments/visual-temporal-state/`  
**Evaluation Date**: 2026-10-18  
**Evaluating Body**: Antigravity Technical Agent  
**Supervising Body**: ChatGPT Architecture Lead  
**Target Milestone**: VTSM-03 Exit Gate  
**Current Disposition**: **EXPERIMENTAL TARGETS MET — ADVANCING TO UNSEEN-MOTION CHALLENGE PROTOCOL**

---

## 1. Exit Gate Verification Matrix

| Criterion | Target Metric | Achieved Status | Disposition |
| :--- | :--- | :--- | :---: |
| **Pass Rate (Controlled Set)** | 100% on synthetic fixtures | **100% (7/7)** on `vtsm03_adaptive_hybrid` | **PASS** |
| **Trajectory Median Error** | $\le 1.5$ px | **0.60 px** mean across all 7 fixtures | **PASS** |
| **P95 Trajectory Error** | $\le 8.0$ px | **0.91 px** (Fix A), **7.29 px** (Fix D Occlusion) | **PASS** |
| **Mean Mask IoU** | $\ge 0.80$ | **0.8396** against independent ground truth | **PASS** |
| **Identity Switches** | Zero ($== 0$) | **0 switches** across all 420 evaluated frames | **PASS** |
| **Fabricated Occluded Masks** | Zero ($== 0$) | **100% null masks** during occlusion periods | **PASS** |
| **Neural Inference Reduction** | Significant ($> 75\%$) | **88.6% reduction** (from 420 down to 48 keyframes) | **PASS** |
| **Steady-State Propagation Latency** | $\le 50$ ms | **18.89 ms** (P50 on Fixture A, 52.9 FPS theoretical) | **PASS** |
| **Natural Footage Resegmentation Rate** | $r_{\text{reseg}} \le 20\%$ | **4.19%** (7 triggers across 167 intermediate frames) | **PASS** |
| **Schema & Monotonicity Integrity** | Zero validation errors | **100% compliant** with VTSM-01 schema (120,000 ticks/sec) | **PASS** |
| **Production Repo Cleanliness** | Zero edits outside experiments/ | **100% clean git diff** on production tracks | **PASS** |

---

## 2. Denominator & Throughput Reconciliation

Per ChatGPT's Round 4 review (`plans/CHATGPT_BANTER_ROUND4.md`), the performance reporting is formally disambiguated:

1. **Synthetic Multi-Run Throughput (10.50 FPS)**:
   - Evaluated by `benchmark_vtsm03.js`, which spawns a fresh Python process per fixture run.
   - Each process incurs ~2.5s fixed initialization overhead (Python runtime, PyTorch MPS compilation, MobileSAM checkpoint deserialization).
   - $60 \text{ frames} / (2.5\text{s overhead} + 3.2\text{s execution}) \approx 10.50 \text{ FPS}$.
2. **Intermediate Steady-State Propagation Speed (52.9 FPS)**:
   - On intermediate frames where MobileSAM TinyViT is skipped, the combined camera alignment, Sparse LK tracking, Delaunay affine warping, and adaptive trigger check execute in **18.89 ms median latency (P50)**.
   - This achieves **52.9 FPS** interactive throughput during propagation.
3. **Sustained Stream Throughput (12.04 FPS on 1080x1920)**:
   - On 450 frames of vertical 1080x1920 video (`creator_clean_15s.mp4`), fixed startup overhead is amortized, achieving **12.04 FPS end-to-end** in Fixed N=10 mode (450 frames in 37.37s).

---

## 3. Generalization Protocol: The Unseen-Motion Challenge

Per ChatGPT's final directive, production sign-off requires validation on 3 independent, held-out natural clips that were never used to tune thresholds:

### Test A: The Pine-Branch Gauntlet
- **Visual Stresses**: Handheld camera shake, high-frequency foreground foliage, rapid subject weaving behind branches, motion blur.
- **Pass Criteria**: Background pine needles must not contaminate the foreground mask; forward-backward flow checks must trigger corrective re-anchoring when boundary distortion occurs.

### Test B: Disappearance & Reappearance
- **Visual Stresses**: Subject completely occluded behind a solid background obstacle and re-emerges with altered posture/scale.
- **Pass Criteria**: Zero fabricated observations during total occlusion; correct track association and identity preservation upon re-emergence without track ID fragmentation.

### Test C: Identity Collision
- **Visual Stresses**: Two similar-looking human subjects crossing paths while the camera executes an affine pan.
- **Pass Criteria**: Gated Hungarian associator and timestamp-aware Kalman predictor must maintain zero identity swaps during and after trajectory intersection.

---

## 4. Final Disposition & Recommendations

1. **VTSM-03 Status**: **ACCEPTED AS VALIDATED EXPERIMENTAL PROPAGATION ENGINE**.
2. **Key Insight**: Sparse LK + Delaunay mesh warping is structurally immune to the morphological boundary bleeding that collapsed standalone dense Farneback flow.
3. **Adaptive Hybrid Value**: The adaptive resegmentation manager is essential for perspective rotations (Fixture E) and occlusion re-emergence (Fixture D), where fixed periodic keyframing fails.
4. **Next Step**: Execute the Unseen-Motion Challenge on held-out footage and prepare the production integration blueprint.
