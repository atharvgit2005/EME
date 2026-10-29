# Erratum: Live Pilot LP-06 Scenario A Hash Reconciliation

**Erratum ID:** `ERR-LP06-001`  
**Date:** 2026-10-16  
**Target Document:** `docs/live-pilot-lp-06-report.md` / `tools/send-lp06-report.js`  
**Authoritative Artifact:** `artifacts/live-pilot/LP-06/scenario-a/lp06-scenario-a.mp4`  
**Status:** **RESOLVED & RATIFIED**

---

### 1. Description of Discrepancy
In the prompt dispatch text of `tools/send-lp06-report.js` (line 17), the SHA-256 digest of the rendered Scenario A recovery master (`lp06-scenario-a.mp4`) was cited as:
`1e25ebbcf63503a6fdcfa1bb10b7414bc908c691f6305a2f5f1eafe737c385c4`

However, the authoritative rendered file produced during the pilot run and sealed on disk under `artifacts/live-pilot/LP-06/scenario-a/lp06-scenario-a.mp4` has the exact SHA-256 hash:
`1e25ebbcdecf6d07ab74a0def83d7db48e3ac08a97d1c42a51288ef47aa994bc`

The engineering report `docs/live-pilot-lp-06-report.md` (line 68) correctly records this authoritative digest (`1e25ebbcdecf6d07ab74a0def83d7db48e3ac08a97d1c42a51288ef47aa994bc`), and the LP-07 baseline immutability audit (`artifacts/live-pilot/LP-07/baseline-immutability.json`) verified that the file on disk matches this digest bit-for-bit.

---

### 2. Root Cause Analysis
During the execution of LP-06, a preliminary trial run of Scenario A generated a temporary render before final process PID boundary instrumentation was sealed. The prompt wrapper script `tools/send-lp06-report.js` was staged with the draft digest from the preliminary run (`1e25ebbcf635...`), while the final pilot execution cleanly generated the authoritative file (`1e25ebbcdecf...`), which was correctly documented in the body of `docs/live-pilot-lp-06-report.md`.

---

### 3. Authoritative Determination & Provenance
In accordance with Gate 0 of the LP-08 specification and the Repository Guidelines regarding historical baseline immutability:
1. **The sealed historical artifact is immutable:** `artifacts/live-pilot/LP-06/scenario-a/lp06-scenario-a.mp4` remains untouched on disk.
2. **Authoritative SHA-256:** `1e25ebbcdecf6d07ab74a0def83d7db48e3ac08a97d1c42a51288ef47aa994bc`
3. **Prompt Summary Citation:** Declared a non-authoritative typographical draft artifact, superseded by this traceable erratum without modifying historical baseline files.
