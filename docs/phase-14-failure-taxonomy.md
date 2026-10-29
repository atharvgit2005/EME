# Phase 14 Failure Taxonomy & Recovery Protocol

**Document:** `docs/phase-14-failure-taxonomy.md`  
**Date:** 2026-10-16  
**Status:** SPECIFICATION  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Job Orchestration Failure Taxonomy

| Failure Type | Error Code | Emitting Phase | Resolution / Recovery Strategy |
|---|---|---|---|
| **Asset Missing** | `ERR_ASSET_MISSING` | `INGESTING` | Verify file exists on local filesystem before submitting job |
| **Asset Modified** | `ERR_ASSET_HASH_MISMATCH` | `ANALYZING` / `RESUME` | Re-analyze source media and recompile editing plan |
| **Invalid Plan** | `ERR_PLAN_INVALID` | `PLANNING` | Validate plan structure against `eme-editing-plan.v1.schema.json` |
| **Approval Rejected** | `ERR_APPROVAL_DENIED` | `AWAITING_APPROVAL` | Revise proposed plan or obtain authorized user sign-off |
| **Operation Conflict** | `ERR_OPERATION_COLLISION` | `EXECUTING` | Adjust clip timing or track layout |
| **Renderer Crash** | `ERR_RENDERER_CRASH` | `RENDERING` | Clean up partial `.tmp` artifacts and retry render |
| **Process Interrupted** | `ERR_PROCESS_INTERRUPTED` | `ANY` | Transition job to `SUSPENDED` and resume from last valid state |
