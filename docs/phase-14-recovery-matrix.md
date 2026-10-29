# Phase 14 12-Case Recovery Matrix Specification & Verification

**Document:** `docs/phase-14-recovery-matrix.md`  
**Date:** 2026-10-16  
**Status:** VERIFIED SPECIFICATION  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. 12-Case Recovery Matrix

| Case | Fault Condition | Engine Behavior | Verified Invariant |
|---|---|---|---|
| **1** | Missing source before analysis | Fails fast during validation; job set to `FAILED` | 0 mutations, returns `ERR_ASSET_MISSING` |
| **2** | Source modified after analysis | `verifyAssetIntegrity` detects SHA-256 hash mismatch | Halts job, prevents stale corrupt render |
| **3** | Invalid plan rejected before mutation | Preflight validation fails with `ERR_PLAN_INVALID` | Base project remains at Revision 0 |
| **4** | Stale project revision | `expectedBaseRevision` mismatch rejected | Zero mutation, original revision preserved |
| **5** | Failure after some operations committed | Subsequent invalid op fails cleanly | Revision reflects only successfully committed ops |
| **6** | Renderer failure with partial cleanup | Partial render temp files unlinked | No corrupt `.tmp` files left on disk |
| **7** | Interruption during rendering | Job set to `SUSPENDED` | Resume picks up cleanly from checkpoint |
| **8** | Interruption between render & QA | Output file preserved, job suspended | Resume proceeds directly to `QA_EVALUATING` |
| **9** | Resume after process restart | Job reloaded from disk with valid state history | Full state history and parameters preserved |
| **10** | Cancellation during job | Job marked `CANCELLED` | Pipeline immediately halts, resources freed |
| **11** | Duplicate request / retry | Idempotent operation re-execution rejected | No duplicate tracks or duplicate clips created |
| **12** | Recovery followed by valid op | Retried job successfully completes | Workflow transitions cleanly from `FAILED` -> `COMPLETED` |
