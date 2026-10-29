# Phase 14 Job Lifecycle State Machine

**Document:** `docs/phase-14-job-lifecycle.md`  
**Date:** 2026-10-16  
**Status:** SPECIFICATION  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Lifecycle State Machine

```
CREATED
  │
  ▼
INGESTING
  │
  ▼
ANALYZING
  │
  ▼
PLANNING ──► AWAITING_APPROVAL ──┐
  │                              │ (approved)
  ▼                              ▼
VALIDATING ◄─────────────────────┘
  │
  ▼
EXECUTING
  │
  ▼
RENDERING
  │
  ▼
QA_EVALUATING ──► CORRECTING ──► RENDERING
  │
  ▼
COMPLETED
```

### Terminal and Recovery States
- `FAILED`: Set upon any unhandled error or validation fault. Can transition to `VALIDATING` or `EXECUTING` during recovery.
- `CANCELLED`: Terminal state when user aborts.
- `SUSPENDED`: Pause state for safe process restarts; resumes safely into `VALIDATING`, `EXECUTING`, or `RENDERING`.

---

## 2. Idempotency Guarantees

1. **Replay Invariant:** Replaying an already executed operation (e.g. `add_track` with identical ID) fails cleanly with `DUPLICATE_ID` and **does not** advance project revision.
2. **Hash Check on Resume:** When resuming a suspended or failed job, `JobManager.verifyAssetIntegrity` recomputes SHA-256 for all declared input assets, aborting immediately if files were deleted or modified out-of-band.
