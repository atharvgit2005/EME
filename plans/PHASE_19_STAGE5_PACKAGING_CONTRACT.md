# EME Phase 19 (RT-01) — Stage 19.5 Packaging Contract
## Reproducible Packaging, Release Candidate Qualification & Operational Readiness

**Document Version:** 1.0.0  
**Timestamp:** 2026-10-21T02:05:00Z  
**Target Milestone:** RT-01 / Stage 19.5  
**Candidate Commit:** `6fd44eebcee27b3767c464752faedb094e16edad`  
**Parent Commit:** `7220db8bedb68423ada4c60ae39e9ed319c9c13f`  
**Branch:** `main`  

---

### 1. Architectural Scope & Objectives

Stage 19.5 establishes the end-to-end reproducible packaging, clean-environment qualification, and operational handoff readiness for the Editing Mechanics Engine (EME).

Traceability chain strictly enforced:
$$\text{Identified Source Commit} \to \text{Prerequisites Validation} \to \text{Clean Build/Pack} \to \text{Isolated Sandbox Installation} \to \text{Packaged End-to-End Smoke Tests} \to \text{Provenance & Checksum Integrity} \to \text{Release Candidate Decision}$$

---

### 2. Mandatory Entry Gates Resolution

#### Gate A: Stage 19.3 Recovery Evidence Closure
1. **Lock Acquisition & In-Lock Revalidation**:
   - Order strictly enforced in `src/prompt-core/job-orchestrator.js` (`runWorkflow` and `executeApprovedJob`) and `src/ui/server.js`:
     $$(1)\; \text{Acquire Mutex } (\text{this.isMutating}) \to (2)\; \text{In-Lock Revalidate } (\text{plan\_hash}, \text{base\_revision}, \text{target IDs}, \text{track locks}) \to (3)\; \text{Execute OperationExecutor} \to (4)\; \text{Persist Journal/Evidence} \to (5)\; \text{Release Mutex}$$
   - Deterministic test: `tests/workflow-stage19-3-recovery.test.js` (`RT01-S3.M`) — **PASS**.
2. **Non-Atomic Failure Honesty**:
   - Under `atomic: false`, failures during multi-operation plans record the exact step that failed, preserve earlier committed operations, and maintain current revision $R_0 + N$ without misrepresenting partial execution as an atomic rollback.
   - Deterministic test: `RT01-S3.F` — **PASS**.
3. **Cancellation across 5 Boundaries**:
   - Formally verified across: (a) Pre-execution, (b) In-flight pre-commit, (c) In-flight post-partial-commit, (d) Rendering, and (e) Publication. Terminal immutability protects completed states from late callbacks.
   - Deterministic test: `RT01-S3.I` — **PASS**.
4. **12-State Recovery Matrix**:
   - Authoritative matrix in `plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md` maps all 12 canonical states (`ACCEPTED`, `PLANNING`, `AWAITING_APPROVAL`, `READY_TO_EXECUTE`, `EXECUTING`, `VERIFYING`, `RENDERING`, `PUBLISHING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `NEEDS_RECONCILIATION`) to restart actions and failure destinations.

#### Gate B: Test Inventory Reconciliation
- **Exact Test Script**: `npm test` runs `node --test tests/*.test.js tests/**/*.test.js`.
- **Runner-Discovered Test Files**: **60 test files** matched by the runner glob.
- **Runner Suites**: **12 runner suites** (`describe()` blocks discovered by Node test runner across 4 specific files: `laya-validation-checkpoints.test.js` [1], `timeline-stage18-2-operations.test.js` [5], `timeline-stage18-3-concurrency.test.js` [1], `timeline-stage18-4-delivery.test.js` [5]).
- **Individual Tests**: **513 tests** (`test()` or `it()` cases executed and reported as `pass 513`).
- **Functional Subsystem Areas**: **14 functional domain areas** grouping the tests:
  1. Canonical Schemas & Contracts
  2. Project State & Revision VCS
  3. Timebase & Half-Open Intervals (120,000 Ticks/sec)
  4. Track & Clip Structural Geometry
  5. Timeline Operations & Rollback Engine
  6. Audio Rhythmic & Beat Analysis
  7. Color Grading Engine & 3D LUTs
  8. Visual Tracking & Spatial Mechanics (VTSM-04)
  9. Prompt Compiler & Dry-Run Engine
  10. Laya Advisory Decision Fabric
  11. Workflow Integration (RT-01 Stage 19.1)
  12. Multi-Turn Session DAG & Lineage (RT-01 Stage 19.2)
  13. Concurrency, Mutex & Crash Recovery (RT-01 Stage 19.3)
  14. Delivery Path Unification & Preview Isolation (RT-01 Stage 19.4)

#### Gate C & D: Immutable Candidate Identity & Full Regression
- **Candidate Commit SHA**: `6fd44eebcee27b3767c464752faedb094e16edad`
- **Parent Commit SHA**: `7220db8bedb68423ada4c60ae39e9ed319c9c13f`
- **Full Regression Command**: `npm test -- --test-concurrency=1`
- **Battery Result**: **513 / 513 PASS in 170.98s (Exit Code: 0)** across all 12 runner suites and 60 test files.

---

### 3. Distribution Targets & Runtime Requirements

- **Supported Operating Systems**:
  - macOS (Apple Silicon `darwin-arm64`, Intel `darwin-x64`)
  - Linux (`linux-x64`, `linux-arm64`)
- **Runtime Prerequisites**:
  - Node.js >= 20.0.0
  - FFmpeg >= 5.0 (with libx264, aac support)
  - FFprobe >= 5.0
- **External Dependencies**:
  - **Zero** external runtime npm packages (`dependencies: {}` in `package.json`). Native Node.js built-ins (`node:crypto`, `node:fs`, `node:path`, `node:http`, `node:child_process`) provide full execution.

---

### 4. Package Contents & Exclusion Boundaries

#### Included in Release Distribution Tarball:
- `bin/eme.js`: Production CLI executable
- `bin/eme-mcp.js`: Model Context Protocol stdio server
- `src/`: Complete core engine (`cli/`, `compiler/`, `decision-fabric/`, `engine/`, `geometry/`, `operations/`, `prompt-core/`, `renderers/`, `ui/`)
- `schema/`: All 7 canonical JSON schemas (`eme-project.v1`, `eme-revision-session.v1`, `eme-delivery-manifest.v1`, `eme-media-qa-report.v1`, `eme-render-job.v1`, `eme-candidate-set.v1`, `eme-operation-plan.v1`)
- `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`

#### Strictly Excluded from Package:
- Tests and test mocks (`tests/`, `fixtures/`)
- Temporary build outputs, renders, and artifacts (`dist/`, `artifacts/`, `ui-renders/`, `temp-*`)
- Scratch scripts and benchmarks (`scratch/`, `benchmarks/`, `tools/`)
- Local credentials, `.env`, `.git/`

---

### 5. Packaging & Integrity Verification Procedure

1. **Packaging Command**:
   ```bash
   npm run package
   # Executes node scripts/package-release.js
   ```
2. **Artifact Outputs in `dist/`**:
   - `editing-mechanics-engine-0.1.0-rc1.tgz`
   - `editing-mechanics-engine-0.1.0-rc1.tgz.sha256`
   - `release-manifest.json`
3. **Clean Installation Smoke Test**:
   - Extract tarball into clean, isolated sandbox directory (`artifacts/test_stage19_5_sandbox/`).
   - Run `bin/eme.js doctor` from sandbox to verify external tooling.
   - Run `bin/eme.js init` and `bin/eme.js validate` on clean projects.

---

### 6. Ten Packaged Acceptance Scenarios (tests/workflow-stage19-5-packaging.test.js)

1. **Scenario A (CLI Startup & Contract)**:
   - Packaged CLI executes from sandbox; `eme --help`, `eme doctor`, `eme capabilities` return valid structured output with exit code 0; invalid arguments return code 1.
2. **Scenario B (REST Startup & Route Contracts)**:
   - Packaged HTTP server starts from sandbox; exposes `/api/status`, `/api/timeline`, `/api/project/operation`, `/api/jobs`, `/api/render`, `/api/deliver`; rejects malformed payloads with 400.
3. **Scenario C (Project Schema & Revision Integrity)**:
   - Packaged engine initializes, mutates, and reloads projects while strictly preserving schema version `1.0.0`, rational timebase (120,000 ticks/sec), and integer revisions.
4. **Scenario D (Preview Isolation from Package)**:
   - Packaged service processes `/api/render` in preview mode; renders to isolated scratch dir; returns `active_delivery: null` with zero manifest emission.
5. **Scenario E (Packaged Closed-Loop Delivery)**:
   - Packaged service executes real delivery via `RenderOrchestrator.runClosedLoop`; produces media deliverable, verified manifest, and promotes `session.active_delivery`.
6. **Scenario F (QA & Integrity Rejection)**:
   - Simulated QA score failure (< 85.0) or SHA-256 hash tampering aborts deliverable publication and fails closed.
7. **Scenario G (Recovery & Restart across Process Lifecycle)**:
   - Sandbox server process restarted mid-flight; durable state recovery reconciles interrupted jobs and recovers safely.
8. **Scenario H (Durable Idempotency in Package)**:
   - Duplicate request with identical idempotency key returns cached job/deliverable; conflicting reuse returns 409 `IDEMPOTENCY_CONFLICT`.
9. **Scenario I (Last-Known-Good Active Delivery Preservation)**:
   - Adversarial battery of failed renders, QA rejections, and invalid operations strictly preserves initial verified active delivery.
10. **Scenario J (Startup/Shutdown Persistence)**:
    - Service persists revision sessions and job journals to disk; cold restart reloads state without corruption or data loss.

---

### 7. Invariants Preserved Under Packaging

1. `schema/eme-project.v1.schema.json` is strictly read-only and unmutated.
2. `TICKS_PER_SECOND = 120,000` integer timebase and half-open intervals preserved.
3. `OperationExecutor` remains the single canonical timeline mutation engine.
4. Canonical 12-state job lifecycle model strictly enforced.
5. Laya Decision Fabric advisory-only mode (`CANARY_ADVISORY_MODE=true`) maintained.
6. Absolute separation of project state, revision VCS, job status, delivery manifest, and active delivery pointer.
