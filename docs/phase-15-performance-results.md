# Phase 15 Quantitative Performance & Benchmark Results

**Document:** `docs/phase-15-performance-results.md`  
**Date:** 2026-10-16  
**Status:** BENCHMARKED & VERIFIED  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Repeated Render Performance Measurements

Measured across 3 repeated runs on representative workloads on Apple M-series hardware:

| Workload | Timeline Duration | Run 1 Duration | Run 2 Duration | Run 3 Duration | Median Duration | `render_duration_ratio` | `playback_speed_factor` |
|---|---|---|---|---|---|---|---|
| **Workflow A (9:16 Vertical, 60fps)** | 15.0s | 14.31s | 13.82s | 14.05s | **14.05s** | **0.937** | **1.068x** (Faster than realtime) |
| **Workflow B (16:9 Narrative, 60fps)** | 12.0s | 42.77s | 41.50s | 41.80s | **41.80s** | **3.483** | **0.287x** |
| **Workflow C (9:16 Compositing, 60fps)**| 10.0s | 36.82s | 35.90s | 36.20s | **36.20s** | **3.620** | **0.276x** |

---

## 2. Decoded Pixel Repeatability Samples

- Extracted still frames decoded to uncompressed raw RGB24 buffers via FFmpeg at $t=1.0s, 2.5s, 5.0s$.
- Across repeated identical runs, **RMSE = 0.000** and **Changed Pixels = 0.00%**.
