# VTSM-01: Licensing and Model Provenance Inventory

## 1. Scope & Isolation Guarantee
All dependencies, algorithms, and pretrained model checkpoints utilized in `experiments/visual-temporal-state/` are strictly isolated within this experimental directory.
**Zero production packages, dependencies, or licenses in EME (`package.json`, `src/`, `bin/`) are affected.**

---

## 2. Environment & Dependency Inventory

| Component | Version | Distribution / Source | License | Purpose / Role |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js** | v20.20.1 | Official Node.js runtime | MIT | Test runner, schema validation, fixture generation, metrics evaluator |
| **Python** | 3.12 (arm64) | Isolated `.venv` | PSF License | Perception runtime, classical baseline vision, video processing |
| **OpenCV** | 5.0.0 (`opencv-python-headless`) | PyPI (isolated `.venv`) | Apache-2.0 | Shot detection, LK optical flow, RANSAC affine camera estimation, contour tracking |
| **NumPy** | 2.5.4 | PyPI (isolated `.venv`) | BSD-3-Clause | Vectorized array transformations, affine decompositions |
| **PyTorch** | 2.14.1 | PyPI (isolated `.venv`) | BSD-3-Clause | Deep learning inference framework (MPS / Apple Silicon) |
| **Ultralytics** | 8.4.180 | PyPI (isolated `.venv`) | AGPL-3.0 | Evaluation candidate for learned tracking (ByteTrack / YOLO) |
| **FFmpeg** | 8.0.1 (system) | Homebrew binary | LGPL-2.1+ / GPL | Frame generation pipe, MP4 encoding |

---

## 3. Pretrained Model Provenance (Learned Candidate Benchmark)

When benchmarking learned tracking candidates in Section 6:

### Ultralytics YOLO11 Nano (`yolo11n.pt`)
- **Architecture**: YOLO11 Nano (detection + tracking)
- **Parameters**: 2.6M parameters
- **Source**: `https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt`
- **File Size**: 5.6 MB (5,622,342 bytes)
- **License**: AGPL-3.0
- **Tracking Algorithm**: ByteTrack (`bytetrack.yaml`)
- **Evaluation Role**: Compared against classical vision baseline on real & synthetic motion sequences.
- **Licensing Constraint**: AGPL-3.0 is permissible **only** inside this isolated experimental subsystem for benchmark research. It must **never** be imported into EME production code (`src/` or `bin/`).

---

## 4. Algorithmic Baseline Provenance (Classical Vision)

The primary reference pipeline implemented in `src/baseline/pipeline.py` uses 100% permissively licensed (Apache 2.0 / MIT / BSD), fully auditable classical computer vision algorithms:
1. **Shot Boundary Detection**: HSV 2D-Histogram Bhattacharyya distance ($D_B \ge 0.55$) — Apache 2.0.
2. **Feature Tracking**: Shi-Tomasi Corner Detector (`cv2.goodFeaturesToTrack`) + Lucas-Kanade pyramidal optical flow (`cv2.calcOpticalFlowPyrLK`) — Apache 2.0.
3. **Camera Transform Estimation**: RANSAC Partial Affine Decomposition with Optical Center Origin Correction ($c_x=960, c_y=540$) — Apache 2.0.
4. **Entity Detection**: High-contrast saliency segmentation + contour bounding box analysis — MIT.
5. **Association & Identity**: Hungarian/IoU SORT tracking with temporal occlusion coasting (velocity propagation) and cut-boundary ID reset — MIT.

---

## 5. Synthetic Fixtures Provenance
- All 7 synthetic test fixtures (`fixture_a.mp4` through `fixture_g.mp4`) are generated procedurally by `src/fixtures/generator.js` without any external copyrighted or proprietary video footage.
- Fixtures are released under MIT for reproducible automated benchmarking.
