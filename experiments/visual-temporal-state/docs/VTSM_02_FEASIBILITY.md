# VTSM-02 Feasibility Gate Report: MobileSAM Perception Pipeline

**Audit Date:** 2026-10-17  
**Subsystem:** `experiments/visual-temporal-state/`  
**Gate Disposition:** **PASS** (Model Provenance & Execution Feasibility Verified)  
**Evaluator:** Antigravity Autonomous Agent (per ChatGPT Architecture Lead Authorization)

---

## 1. Safety Baseline & Workspace Isolation

- **Repository Root:** `/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine`
- **Protected Boundaries:**
  - Production `src/`, `bin/`, `schema/`, `package.json`, release artifacts, and live-pilot evidence remain **100% bit-for-bit untouched**.
  - All perception weights, dependencies, and artifacts are strictly isolated in `experiments/visual-temporal-state/`.
- **Pre-existing Working Tree State:** Cataloged and preserved. Zero destructive git commands executed.

---

## 2. Checkpoint Provenance & Licensing Audit

| Property | Value / Verification |
| :--- | :--- |
| **Model Architecture** | MobileSAM (`vit_t` TinyViT Image Encoder + Lightweight Mask Decoder) |
| **Official Repository** | [ChaoningZhang/MobileSAM](https://github.com/ChaoningZhang/MobileSAM) |
| **Checkpoint Path** | `experiments/visual-temporal-state/third_party/MobileSAM/weights/mobile_sam.pt` |
| **File Size** | 40,728,226 bytes (38.84 MB) |
| **SHA-256 Hash** | `6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f` |
| **License** | **Apache License 2.0** (verified in-tree: `third_party/MobileSAM/LICENSE`) |
| **Dependencies** | PyTorch 2.14.1 (BSD-3), Torchvision 0.29.1 (BSD-3), timm 1.0.30 (Apache-2.0), OpenCV 5.0.0 (Apache-2.0) |
| **Commercial Terms** | Permissive Apache-2.0 license allows modification and internal research with standard attribution notice retention. |

---

## 3. Execution Pipeline & ONNX Boundary Audit

1. **Architecture Boundary Discovery:**
   - In MobileSAM's official pipeline, the **Image Encoder** is a TinyViT network producing a `(1, 256, 64, 64)` spatial feature embedding.
   - The **Prompt Encoder + Mask Decoder** takes the precomputed image embedding, point coordinates/labels, and optional mask prompts to produce high-resolution segmentations.
   - The standard ONNX export pipeline only exports the prompt encoder and mask decoder; the TinyViT image encoder is designed to run in PyTorch.
2. **Apple Silicon Execution Profiling (macOS arm64):**
   - **Model Cold Load Time:** 164.0 ms (CPU), 1417.8 ms (MPS Apple Silicon GPU initialization).
   - **1080p Image Encoder Latency (Steady-State):**
     - Median: **599.05 ms**
     - P95: **948.61 ms**
   - **Mask Decoder Latency (Single Prompt):**
     - Median: **42.87 ms**
     - P95: **72.24 ms**
   - **Candidate Mask Quality:** 3 candidate masks produced per prompt, peak IoU confidence score: **0.9431**.
   - **Automatic Mask Generation (AMG) 16x16 Grid (256 Points):**
     - Total Latency: **18.52 s**
     - Masks Generated: **224 candidate visual regions** (filtered for stability & minimum area).
3. **Execution Provider Strategy:**
   - For real-time frame tracking, full-grid AMG per frame (18.5s) is too costly for continuous video processing.
   - **Recommended Tracking Strategy for Phase 2:**
     - **Keyframe / Shot-Start Region Proposal:** Run AMG (or bounding-box saliency / Hungarian proposals) at shot starts or scene transitions.
     - **Intra-Shot Temporal Tracking:** Track persistent entity centroids using Kalman filter predictions to provide directed point/box prompts to the MobileSAM Mask Decoder (42.8 ms/frame), achieving fast (~50 ms) continuous mask generation and track maintenance!

---

## 4. Visual Evidence Artifacts

- **Prompted Mask Verification Overlay:**  
  `artifacts/feasibility/prompted_mask_overlay.png` (verified high-confidence segmentation on test frame).
- **Automatic Mask Generation (AMG) Density Overlay:**  
  `artifacts/feasibility/amg_masks_overlay.png` (verified 224 segmented entities across 1080p canvas).
- **Machine-Readable Feasibility Summary:**  
  `artifacts/feasibility/feasibility_summary.json`

---

## 5. Gate Disposition & Next Step

```
[ PHASE 1 FEASIBILITY GATE: PASS ]
```

- **Criteria Met:**
  - Checkpoint provenance, SHA-256 hash, and Apache-2.0 license verified.
  - Native inference successfully executed on 1080p video frames with quantified latency.
  - Architectural boundary (TinyViT encoder + prompt decoder) established.
- **Immediate Next Step:** Proceed autonomously to **Phase 2 — Modular Tracking Implementation** (`mask-proposal`, `motion-predictor`, `camera-compensation`, `association`, and `track-manager`).
