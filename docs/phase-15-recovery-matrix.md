# Phase 15 Canonical 12-Case Recovery Matrix Specification & Evidence

**Document:** `docs/phase-15-recovery-matrix.md`  
**Date:** 2026-10-16  
**Status:** FULLY CLOSED & VERIFIED  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Canonical 12-Case Recovery Matrix

Every case maps directly to executable tests in `tests/phase-14/recovery-matrix.test.js` and `tests/phase-15/true-crash.js`:

| Case ID | Fault Condition | Injected Fault | Expected Result | Observed Result | Test / Artifact Proof | Recovery Status |
|---|---|---|---|---|---|---|
| **Case 1** | Missing source before analysis | Nonexistent video path referenced | `ERR_ASSET_MISSING`, Job fails fast | `status: FAILED`, zero disk side effects | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 2** | Source modified after analysis | File bytes altered out-of-band | SHA-256 mismatch detected on resume | Resumption blocked, error logged | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 3** | Invalid plan rejected | Empty operations / bad schema | Preflight reject before mutation | Project remains unmutated at Rev 0 | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 4** | Stale project revision | `expectedBaseRevision` mismatch | Atomic operation reject | Current revision strictly preserved | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 5** | Partial operation failure | Second operation in sequence invalid | Reverts uncommitted mutation | Rev strictly reflects first valid op | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 6** | Renderer failure with cleanup | Crash during MP4 render | Unlinks `.tmp` render files | 0 corrupt partial artifacts remain | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 7** | Interruption during rendering | Process paused / suspended | Job set to `SUSPENDED` | Atomic state preserved on disk | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 8** | Interruption between render & QA | Paused before VQA | Render preserved, status suspended | Resumes directly to `QA_EVALUATING` | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 9** | True Process Crash & Interruption | SIGKILL (`kill -9`) sent to child process | External process terminated mid-execution | State reconstructed from atomic disk JSON | `tests/phase-15/true-crash.js` | **PASS** |
| **Case 10** | Cancellation during execution | User abort signal | Job marked `CANCELLED` | Execution halts immediately | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 11** | Idempotent replay | Duplicate track creation | `DUPLICATE_ID` rejected | Replay does not duplicate mutations | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
| **Case 12** | Valid retry recovery | Retry from recovered checkpoint | Transition `FAILED` -> `COMPLETED` | Workflow successfully completes | `tests/phase-14/recovery-matrix.test.js` | **PASS** |
