# Phase 15 Crash Consistency & Durability Guarantees

**Document:** `docs/phase-15-crash-consistency.md`  
**Date:** 2026-10-16  
**Status:** SPECIFICATION & EVIDENCE  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Atomic Persistence Mechanics

To guarantee durability without external database daemons, `JobManager` employs atomic rename semantics:

```javascript
saveJob(job) {
  job.updatedAt = new Date().toISOString();
  const p = this._getJobPath(job.jobId);
  const tmp = `${p}.tmp_${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2), 'utf8');
  fs.renameSync(tmp, p); // Atomic POSIX rename replaces target file atomically
  return job;
}
```

- **POSIX Rename Guarantee:** An atomic rename guarantees that readers observe either the complete previous file version or the complete new version—never a torn or half-written JSON structure.
- **True Crash Proof:** Verified via `tests/phase-15/true-crash.js` where `kill -9` was issued mid-execution, leaving the on-disk state 100% valid JSON at status `EXECUTING`.
