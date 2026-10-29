# Phase 11 & Phase 11.1 Benchmark Methodology

## 1. Scope & Foundation
The Editing Mechanics Engine (EME) benchmarking methodology establishes an empirical, reproducible framework for evaluating AI-driven timeline assembly, multi-format adaptation, signal fidelity, and atomic state recovery.

All benchmarks execute strictly over the canonical integer timebase:
$$\text{Ticks per Second} = 120,000$$
All frames are sampled according to half-open intervals $[t_{\text{start}}, t_{\text{end}})$.

---

## 2. Benchmark Categories & Acceptance Rules

| Category | Benchmark Name | Target Duration | Canvas / FPS | Acceptance Condition |
|---|---|---|---|---|
| **A** | Reference Kinetic Typography | 15.0s (1.8M ticks) | 1080×1920 (9:16) @ 60fps | Staggered text entrances, zero clipping, audio sync |
| **B** | Footage Assembly & Editorial Pacing | 20.0s (2.4M ticks) | 1920×1080 (16:9) @ 60fps | Multi-act narrative cuts, PiP inset, continuous soundtrack |
| **C** | Layered Compositing & Effect Order | 10.0s (1.2M ticks) | 1080×1920 (9:16) @ 60fps | Mathematical difference blend mode, invert & contrast |
| **D** | Audio Mixing & Dynamic Envelopes | 16.0s (1.92M ticks) | 1920×1080 (16:9) @ 60fps | Peak $< 0\text{ dBFS}$, non-silent RMS, ducking automation |
| **E** | 3-Format Aspect Adaptation | 3.0s (360K ticks) | 16:9, 9:16, 1:1 @ 60fps | Safe margins, zero truncation, content preservation |
| **F** | 5-Turn Sequential Revisions | 15.0s (1.8M ticks) | 1080×1920 (9:16) @ 60fps | Monotonic revisions $R_1 \to R_6$, zero side effects |
| **G** | Failure Recovery & Invariants | Disposable | Any | 100% rejection of invalid requests, zero state mutation |

---

## 3. Quantitative Measurement Methodology

### 3.1 Decoded Raw Pixel Comparisons
To prevent compression-header artifacts from skewing results, PNG frames are decoded into raw RGB24 buffers:
$$\text{MSE} = \frac{1}{N} \sum_{i=1}^N \frac{(R_{A,i} - R_{B,i})^2 + (G_{A,i} - G_{B,i})^2 + (B_{A,i} - B_{B,i})^2}{3}$$
$$\text{RMSE} = \sqrt{\text{MSE}}$$
- **Identity target**: $0.00\%$ changed pixels, $\text{RMSE} = 0.000$.
- **Localized edit target**: Changed pixels bounded to modified bounding box ($< 15\%$).

### 3.2 Automated Quality Assurance Calibration
The QA engine is calibrated against an $8 \times 8$ matrix (8 deliberate defects vs. 8 clean controls):
- **Sensitivity (Recall)**: $\frac{\text{TP}}{\text{TP} + \text{FN}} = 100.0\%$
- **Specificity**: $\frac{\text{TN}}{\text{TN} + \text{FP}} = 100.0\%$
- **False Positive Rate**: $0.0\%$
