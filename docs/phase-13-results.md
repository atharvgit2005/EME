# Phase 13 Quantitative Results & Evidence Ledger

**Document:** `docs/phase-13-results.md`  
**Date:** 2026-10-16  
**Status:** VERIFIED & REPRODUCIBLE  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. End-to-End Scenarios Performance & Quality Summary

| Scenario | Canvas | Duration | Steps | Render Time | Real-Time Factor (RTF) | QA Score | Verdict | Deliverable MP4 |
|---|---|---|---|---|---|---|---|---|
| **Scenario A** (Kinetic Typography) | 1080×1920 (9:16) | 15.0s (1.8M ticks) | 8 ops | 10.79s | **0.72x** (faster than realtime) | **100/100** | **PASS** | `artifacts/phase-13/scenario-a/scenario-a.mp4` |
| **Scenario B** (Narrative Assembly) | 1920×1080 (16:9) | 12.0s (1.44M ticks) | 10 ops | 41.62s | **3.47x** | **100/100** | **PASS** | `artifacts/phase-13/scenario-b/scenario-b.mp4` |
| **Scenario C** (Layered Compositing) | 1080×1920 (9:16) | 10.0s (1.2M ticks) | 11 ops | 38.82s | **3.88x** | **100/100** | **PASS** | `artifacts/phase-13/scenario-c/scenario-c.mp4` |

---

## 2. Decoded Pixel Repeatability & Localized Edit Diff

- **Identical Render Self-Diff (Scenario A at $t=1.0s$):**
  - Total Pixels: 2,073,600 (1080×1920)
  - Changed Pixels: **0** (**0.00%**)
  - RMSE: **0.000**
  - Determinism verdict: **PERFECT 100% REPEATABILITY**

- **Defect vs. Closed-Loop Corrected Frame Diff (Attempt 1 vs. Attempt 2 at $t=1.0s$):**
  - Changed Pixels: **3,701** (**0.18%**)
  - RMSE: **8.709**
  - Localized modification confirmed: Change strictly isolated to headline typography repositions and size downscaling without any background corruption.

---

## 3. Bounded Closed-Loop Creative QA Performance

- **Attempt Budget:** 3 attempts maximum.
- **Attempts Utilized:** 2 attempts.
- **Injected Defect:** Layout boundary text clipping (`x=1050`, `fontSize=120` on 1080w canvas).
- **Detection Cycle (Attempt 1):**
  - QA Score: **90/100** (1 warning: Possible text clipping on clip `clip_hero_title`).
  - Finding Generated: `finding_1_text_clipping` (Severity: `HIGH`, Metric: `text_boundary_overflow`).
  - Proposed Correction: `modify_clip` (`transform.x = 540`, `anchorX = 0.5`, `fontSize = 84`).
- **Correction & Verification Cycle (Attempt 2):**
  - Re-rendered MP4: `artifacts/phase-13/qa-loop/attempt-2.mp4` (456,034 bytes).
  - QA Score: **100/100** (0 warnings).
  - Verdict: **ACCEPTED / RESOLVED**.
