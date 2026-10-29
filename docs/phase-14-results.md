# Phase 14 Quantitative Results & Manifest Ledger

**Document:** `docs/phase-14-results.md`  
**Date:** 2026-10-16  
**Status:** VERIFIED & REPRODUCIBLE  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Acceptance Workflows Execution Ledger

| Workflow | Genre / Aspect | Timeline Duration | Render Time | `render_duration_ratio` | `playback_speed_factor` | QA Score | Output SHA-256 |
|---|---|---|---|---|---|---|---|
| **Workflow A** | Vertical Reference Edit (9:16) | 15.0s (1.8M ticks) | 14.31s | **0.954** | **1.048x** | **100/100** | `34e4beb1fde1ebc37b6c7acdd3c275d187c3bbb0c79f7c3d0b364fa3c7e90e39` |
| **Workflow B** | Narrative Assembly (16:9) | 12.0s (1.44M ticks) | 42.77s | **3.564** | **0.281x** | **100/100** | `f548c42e2eed3f0cc05d8e2c06338fc538f4239dfe9154803c863294bb53e050` |
| **Workflow C** | Multi-Turn Revision & Resume (9:16) | 10.0s (1.2M ticks) | 36.82s | **3.682** | **0.272x** | **100/100** | `b141044d9d2f21c0750cf6e2010e4346fead474e8ea9f74bdcda686467b02b89` |

---

## 2. 12-Case Failure & Recovery Matrix Results

All 12 failure cases passed automated regression in `tests/phase-14/recovery-matrix.test.js`:
1. Missing source before analysis: **PASS** (`ERR_ASSET_MISSING` caught)
2. Source modified after analysis: **PASS** (Hash mismatch detected on resume)
3. Invalid plan rejected before mutation: **PASS** (Zero project mutation)
4. Stale project revision: **PASS** (Revision preserved)
5. Partial operation failure: **PASS** (Prior committed revision strictly preserved)
6. Renderer failure cleanup: **PASS** (Partial render artifacts cleaned)
7. & 8. Suspension & resume: **PASS** (Clean resumption from disk state)
9. Restart preservation: **PASS** (All metadata reloaded)
10. Long-running cancellation: **PASS** (Immediate halt with `CANCELLED`)
11. Replay idempotency: **PASS** (Duplicate operation rejected, revision unmutated)
12. Recovery with valid follow-up: **PASS** (`FAILED` -> `COMPLETED`)

---

## 3. Pixel Repeatability & Review Change Diff Verification

- **Workflow A Review Change Diff ($t=1.0s$):**
  - Original Text: "REFERENCE TO EDIT"
  - Reviewed Text: "ORCHESTRATED WORKFLOW"
  - Changed Pixels: **0.16%** strictly localized to headline typography with zero background drift.
