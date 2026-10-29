# Phase 13 Benchmark Methodology & Quantitative Metrics

**Document:** `docs/phase-13-benchmark-methodology.md`  
**Date:** 2026-10-16  
**Status:** METHODOLOGY SPECIFICATION  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Quantitative Metrics Definitions

### 1.1 Source-Analysis Completeness
$$\text{Completeness} = \frac{\text{Assets with SHA-256} + \text{Streams Validated} + \text{Keyframes Extracted}}{\text{Total Declared Assets}} \times 100\%$$

### 1.2 Plan Compilation Determinism
$$\text{Determinism} = \frac{\text{Identical Compiled Operation Sequences}}{\text{Total Compilation Runs of Identical Plan}} = 1.000$$

### 1.3 Closed-Loop Correction Effectiveness
$$\text{Correction Rate} = \frac{\text{Defects Resolved within Budget (} \le 3 \text{ attempts)}}{\text{Total Deliberate Injected Defects}} = 100\%$$

### 1.4 Real-Time Factor (RTF)
$$\text{RTF} = \frac{\text{Render Duration (seconds)}}{\text{Media Timeline Duration (seconds)}}$$
- $\text{RTF} < 1.0$: Faster than real-time playback.
- $\text{RTF} > 1.0$: Compute-bound composition.

---

## 2. Decoded Pixel Repeatability Protocol

1. Extract still frames from identical plan compiles across independent runs at fixed timestamps ($t_1=0.5s$, $t_2=2.5s$, $t_3=5.0s$).
2. Decode frames to raw uncompressed RGB24 buffers via FFmpeg (`-f rawvideo -pix_fmt rgb24`).
3. Compute exact Root-Mean-Square Error (RMSE) across all channel bytes:
   $$\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (P_{A,i} - P_{B,i})^2}$$
4. Invariant: For identical source media and project plans, $\text{RMSE} = 0.000$ and $\text{Different Pixels} = 0.00\%$.
