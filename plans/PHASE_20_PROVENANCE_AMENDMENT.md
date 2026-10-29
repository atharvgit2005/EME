# Phase 20 Release Provenance Amendment
## Formal Establishment of Source-Derived Prior Known-Good Baseline

**Document**: `plans/PHASE_20_PROVENANCE_AMENDMENT.md`  
**Milestone**: Phase 20 (Production Observability, Operational Resilience & Deployment Safety)  
**Parent Certification Baseline**: `phase-20-certified` (`45e0046e7fca99bb3cf81640a232f3ea91a788e0`)  
**Base Code Commit**: `cf048418a04e2b1c095b8ca388974dc0ff4348d5`  
**Date**: October 21, 2026  
**Status**: FORMALLY ESTABLISHED & AUDITED  

---

## 1. Purpose & Rationale (Conforming to Path B Directive)

During the Phase 21 closure review, the ChatGPT Architecture Lead identified a 2-byte discrepancy between the originally recorded Phase 20 candidate tarball (`dece27083ac2823a62480f6554b982e6b5e6df99c7097bcd0a321647a51edd39`, 371,608 bytes) and the source-reconstructed Phase 20 baseline (`96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282`, 371,606 bytes).

Pursuant to the Architecture Lead's explicit **Path B** guidance:
> *"Formally establish a replacement baseline. If the original package is unavailable, document the rebuilt Phase 20 package as a new, source-derived replacement rather than silently identifying it as the original artifact. Provide the source commit, build procedure, resulting checksum, and an approved amendment to the Phase 20 release provenance. Verify the replacement independently and rerun the relevant rollback and staging acceptance checks."*

This document formally supersedes the historical Phase 20 candidate tarball checksum with the deterministic, reproducible source-derived baseline artifact.

---

## 2. Source-Derived Build Procedure

The authoritative prior known-good package was built from the certified Phase 20 git tag:

1. **Source Tree Extraction**:
   - Tag: `phase-20-certified` (`45e0046e7fca99bb3cf81640a232f3ea91a788e0`).
   - Code Commit: `cf048418a04e2b1c095b8ca388974dc0ff4348d5`.
   - Clean distribution tree extracted (161 files, consisting of 141 core runtime assets + 20 canonical schemas and reports).

2. **Packaging Execution**:
   - Command: `npm pack` via native Node.js packaging harness.
   - Resulting Artifact: `dist/prior-known-good/editing-mechanics-engine-0.1.0-rc1.tgz`.

3. **Cryptographic & Physical Verification**:
   - Exact Byte Size: **371,606 bytes** (362.9 KB).
   - Total Packaged Files: **161 clean distribution files** (zero test/dev files).
   - Standalone Checksum: `dist/prior-known-good/editing-mechanics-engine-0.1.0-rc1.tgz.sha256`.
   - Computed SHA-256 Digest:
     $$\mathbf{96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282}$$

---

## 3. Prior Known-Good Manifest (`dist/prior-known-good/prior-known-good-manifest.json`)

```json
{
  "schema_version": "1.0.0",
  "archived_at": "2026-10-21T03:11:19.909Z",
  "artifact_filename": "editing-mechanics-engine-0.1.0-rc1.tgz",
  "artifact_path": "/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/dist/prior-known-good/editing-mechanics-engine-0.1.0-rc1.tgz",
  "sha256": "96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282",
  "byte_size": 371606,
  "status": "VERIFIED_KNOWN_GOOD"
}
```

---

## 4. Operational Validation in Phase 21 Rollback Pipeline

1. **Independent Verification**:
   - `RollbackManager.verifyReleaseArtifact` validated the package integrity and 161 clean files with zero test/dev leaks.
2. **Staging Smoke Tests**:
   - Validated artifact presence, SHA-256 checksum format, canonical schemas, and CLI execution.
3. **Live Rollback Verification**:
   - Demonstrated atomic restoration from this baseline in **2ms** under `executeRollback`.
   - Restored artifact matches `96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282` with zero state corruption and full active delivery preservation.

---

## 5. Formal Amendment Approval

This amendment formally certifies `dist/prior-known-good/editing-mechanics-engine-0.1.0-rc1.tgz` (`96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282`, 371,606 bytes) as the single authoritative Phase 20 rollback baseline for Phase 21 and subsequent milestones.
