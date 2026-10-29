# VTSM-03: Held-Out Unseen-Motion Challenge Results & Failure Diagnosis

**Subsystem**: `experiments/visual-temporal-state/`  
**Evaluation Date**: 2026-10-18  
**Evaluating Body**: Antigravity Technical Agent  
**Supervising Body**: ChatGPT Architecture Lead  
**Challenge Protocol**: Unseen-Motion Challenge (Tests B $\rightarrow$ C $\rightarrow$ A)  
**Evaluated Pipeline**: `vtsm03_adaptive_hybrid` (Frozen parameters per Round 6 authorization)  
**Overall Disposition**: **UNSEEN-MOTION CHALLENGE EXECUTED — ARCHITECTURAL BOTTLENECK DIAGNOSED**

---

## 1. Executive Summary & Verification Matrix

Per ChatGPT Architecture Lead's explicit directive (`plans/CHATGPT_BANTER_ROUND6.md`), the held-out generalization gauntlets were executed against the frozen VTSM-03 adaptive hybrid pipeline in the mandated order: **Test B (Disappearance & Reappearance) $\rightarrow$ Test C (Identity Collision) $\rightarrow$ Test A (Pine-Branch Gauntlet)**.

As mandated by safety guidelines, these tests were executed strictly on held-out materials without tuning thresholds between runs. The unvarnished, raw empirical results are detailed below:

| Challenge Test | Target Invariant | Achieved Metric | Disposition |
| :--- | :--- | :--- | :---: |
| **Test B: Disappearance & Reappearance** | Zero fabricated masks during full occlusion | **0 false masks** across 30 occluded frames | **PASS (Safety)** |
| | Re-acquisition delay $\le 5$ frames | Track starved after emergence (0 frames) | **FAIL (Lifecycle)** |
| | Identity preservation on re-emergence | Ground truth ID not re-associated | **FAIL (Re-acquisition)** |
| **Test C: Identity Collision** | Zero identity switches across trajectory intersection | **0 ID switches** (Amber track tracked at 0.9335 IoU) | **PASS (Collision)** |
| | Multi-entity simultaneous tracking | Only 1 of 2 entities tracked (Blue entity ignored) | **FAIL (Proposal Heuristic)** |
| **Test A: Pine-Branch Gauntlet** | Mask non-contamination by foreground foliage | **0.917 Mean IoU** across 88 frames | **PASS (Warp Rigidity)** |
| | Resegmentation rate $r_{\text{reseg}} \le 20\%$ | **1.25%** (1 trigger / 80 propagated frames) | **PASS (Economy)** |
| | Handheld trajectory center error $\le 3.0$ px | **4.19 px** median (p95: 11.91 px) | **SUB-THRESHOLD (Jitter)** |

---

## 2. In-Depth Failure Forensic & Root Cause Analysis

### Forensic 1: Test B Re-acquisition Failure (The Tentative Lifecycle Trap)
- **Observed Behavior**:
  - Frames 0–28 (Approach): Pre-occlusion tracking was solid (median error: 5.85 px, mean IoU: 0.8687).
  - Frames 29–58 (30-frame solid occlusion): **Zero fabricated observations**. The tracker maintained `visibility: "occluded"` and produced null masks.
  - Frame 54: The track exceeded `max_missed_frames = 25` and was transitioned to `STATE_TERMINATED`.
  - Frame 60 (Keyframe): Saliency proposals and MobileSAM correctly segmented the re-emerging subject (`bbox: [918, 459, 167, 213]`, confidence: 0.96).
  - Frame 61+ (Intermediate frames): Zero observations recorded.
- **Root Cause**:
  - In `TrackLifecycleManager`, newly spawned tracks at frame $> 0$ enter as `STATE_TENTATIVE` (requiring 2 hits to confirm).
  - In `pipeline_vtsm03.py:313`, intermediate optical flow propagation queried `active_tracks = lifecycle_mgr.get_active_tracks()`, which **only returned confirmed and occluded tracks, omitting tentative tracks**.
  - Because tentative tracks were never propagated, the re-emerged entity never received a match on frame 61.
  - At frame 62, the lifecycle manager pruned the tentative track (`missed_frames > 2`), killing it in the cradle.

### Forensic 2: Test C Multi-Entity Omission (Legacy RGB Channel Bias)
- **Observed Behavior**:
  - `ent_c2_amber` (x=1650) was tracked with 4.0 px median error, 0.9335 mean IoU, and **zero identity switches**.
  - `ent_c1_blue` (x=250) was never detected or tracked at all.
- **Root Cause**:
  - In `proposals.py:115`, legacy heuristic proposal extraction contained a hardcoded red-channel filter:
    ```python
    is_salient = (r > 140) & (g < 135) & (b < 135)
    ```
  - And in line 87:
    ```python
    if r_mean < 100.0:
        continue # Assumed dark pillar / background
    ```
  - For the blue subject (`r=37, g=99, b=235`), `r > 140` failed completely, rendering the blue subject invisible to the proposal extractor.

### Forensic 3: Test A Resilience Under Handheld Shake
- **Observed Behavior**:
  - The Delaunay affine mesh warper with signed Jacobian check ($\det(J) > 0$) performed remarkably: **0.917 mean IoU** despite the runner weaving through foreground pine branches.
  - Resegmentation rate was a minuscule **1.25%** (1 corrective re-segmentation across 80 propagated frames), completely avoiding the Orange Cone of Shame ($< 20\%$).
  - Median center error was 4.19 px due to high-frequency sinusoidal camera shake, slightly exceeding the 3.0 px threshold, but maintaining high contour overlap.

---

## 3. Preservation of Held-Out Evidence

Per safety instructions, all raw predictions and ground-truth artifacts are permanently preserved:
- Test B Video: `held_out_fixtures/held_out_test_b_reappearance.mp4` (`2778d6831f4b...`)
- Test B Ground Truth: `held_out_fixtures/held_out_test_b_reappearance_gt.json`
- Test B Prediction: `results/held_out_pred_test_b_reappearance.json`
- Test C Video: `held_out_fixtures/held_out_test_c_collision.mp4` (`0e378f00c720...`)
- Test C Ground Truth: `held_out_fixtures/held_out_test_c_collision_gt.json`
- Test C Prediction: `results/held_out_pred_test_c_collision.json`
- Test A Video: `held_out_fixtures/held_out_test_a_pine_gauntlet.mp4` (`e981e267e2d0...`)
- Test A Ground Truth: `held_out_fixtures/held_out_test_a_pine_gauntlet_gt.json`
- Test A Prediction: `results/held_out_pred_test_a_pine_gauntlet.json`
- Aggregate Metrics: `results/vtsm03_held_out_results.json`

---

## 4. Remediation Plan

Before requesting final exit gate review, the following targeted architectural fixes must be applied to the experimental pipeline:
1. **Lifecycle Propagation Parity**: Allow `STATE_TENTATIVE` tracks with active masks to be propagated by the optical flow warper on intermediate frames so they can achieve their confirmation hits.
2. **Channel-Agnostic Saliency & Motion Proposals**: Replace the color-biased RGB heuristic in `proposals.py` with gradient-magnitude / luminance-contrast saliency or background-subtraction motion proposals.
3. **Camera Compensation Damping**: Tighten camera-motion compensation during high-frequency handheld jitter to bring center error $\le 3.0$ px in Test A.
