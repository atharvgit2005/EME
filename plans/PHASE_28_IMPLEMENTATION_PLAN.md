# Milestone Phase 28 Implementation Plan: Repair Policy, Conflict Resolution & Multi-Pass Orchestration

**Milestone**: Phase 28 — Repair Policy, Conflict Resolution & Multi-Pass Orchestration
**Feature Branch**: `feature/phase-28-repair-policy-orchestration`
**Certified Base Release**: `phase-27-certified` (`e53317ae7958a87dd17ae7aaaeecfdebd1a38a62`)
**Baseline Merge Commit**: `38cd2ee801b9677a1d7f2b8027af25d2be74ef4a`
**Architecture Lead Authority**: ChatGPT Architecture Lead
**Reference Authorization**: `plans/CHATGPT_PHASE27_FINAL_RELEASE_CERTIFICATION.md`
**Date**: October 22, 2026
**Status**: Ready for Architecture Lead Plan Review & Authorization

---

## 1. Executive Summary & Core Engineering Objectives

Building upon the certified Closed-Loop Audio Repair Engine from Milestone Phase 27, Phase 28 introduces deterministic multi-proposal policy, conflict resolution, anti-oscillation protection, and bounded multi-pass closed-loop repair orchestration.

In accordance with the Architecture Lead's Phase 28 kickoff directives, this implementation plan establishes four non-negotiable architectural controls:

1. **Conflict Detection & Deterministic Ordering**: Systematically identifies repair proposals that target the same clip, overlapping intervals, incompatible tracks, or mutually interfering acoustic properties. Enforces deterministic priority ordering and resolves safe combinations while rejecting unresolvable conflicts without partial mutation.
2. **Bounded Multi-Pass Execution**: Executes multi-stage repairs with an explicit pass budget (`maxPasses = 3`), clear termination criteria, and mandatory re-evaluation: each subsequent pass consumes fresh findings derived from the freshly rendered audio and revised project state—never reusing stale evidence.
3. **Oscillation & Duplicate-Repair Protection**: Tracks finding provenance, project revisions, operation outcomes, and acoustic metrics across iterations. Detects cyclic reversals ($\pm\Delta_{\text{ticks}}$) and un-converging repairs, terminating immediately with `OSCILLATION_DETECTED` and transitioning to `NEEDS_RECONCILIATION`.
4. **Closed-Loop Delivery Integrity**: Routes all project mutations exclusively through `OperationExecutor`, preserves active delivery throughout all passes, isolates failed candidates in quarantine, and enforces bit-for-bit canonical schema freeze with zero runtime npm dependencies.

---

## 2. Architectural Conditions & Binding Constraints

| Constraint ID | Category | Requirement & Invariant |
|:---|:---|:---|
| **ARC-28-01** | **Conflict Detection Boundary** | Multi-proposal sets must be validated for conflicts before execution. Proposals targeting overlapping timeline intervals on the same track, conflicting clip properties, or cyclic shifts must be partitioned into safe sequential passes or rejected. |
| **ARC-28-02** | **Deterministic Ordering Policy** | Proposals must be ordered deterministically: Structural/Retiming shifts precede level/peak attenuations (`SYNC_RETIME` $\prec$ `PEAK_ATTENUATION`); earlier timeline intervals precede later intervals; clip IDs are broken by deterministic lexicographic order. |
| **ARC-28-03** | **Bounded Pass Budget & Fresh Ingestion** | The multi-pass engine must enforce an explicit attempt budget (default 3 passes). Each pass must perform a full render and fresh Earshot QA audit. A subsequent pass must NEVER reuse findings from prior passes or stale project revisions. |
| **ARC-28-04** | **Anti-Oscillation & Convergence Protection** | The engine must maintain an execution journal across passes. If a proposal attempts to reverse a prior pass's shift ($|\Delta_k + \Delta_{k-1}| < \epsilon$) or if quality metric does not improve, execution terminates with `OSCILLATION_DETECTED` and status `NEEDS_RECONCILIATION`. |
| **ARC-28-05** | **Mandatory Conflicting Scenario** | The test suite must include a controlled scenario where two individually valid repairs conflict when combined (e.g. adjacent clips where retiming clip A collides with clip B, or competing shifts). The engine must resolve deterministically if policy permits, or halt safely preserving active delivery. |
| **ARC-28-06** | **Atomic Pass Rollback & Quarantine** | Any failure during a multi-pass cycle (QA regression, timeout, worker crash) must roll back all mutations executed during that cycle via verified inverse operations, quarantine the candidate, and leave the active delivery 100% untouched. |
| **ARC-28-07** | **Schema & Dependency Freeze** | All 18 canonical schemas in `schema/*.v1.schema.json` remain bit-for-bit frozen. The core `package.json` retains `"dependencies": {}` (zero external runtime npm dependencies). Internal policy schema placed in `src/audio/schemas/audio-repair-policy.v1.json`. |

---

## 3. Implementation Stages & Exit Gates

### Stage 28.1: Proposal Conflict Detector & Dependency Graph
- **Objective**: Develop `RepairConflictDetector` and formal Draft 2020-12 policy schema.
- **Components**:
  - `src/audio/schemas/audio-repair-policy.v1.json`: Schema defining conflict types (`CLIP_OVERLAP`, `SPATIAL_COLLISION`, `MUTUALLY_EXCLUSIVE`, `PROPERTY_INTERFERENCE`), resolution policies, and dependency graphs.
  - `src/audio/repair/repair-conflict-detector.js`: Analyzes candidate proposal arrays against project timeline and track layout; partitions proposals into independent batches, sequential dependencies, and unresolvable conflicts.
- **Verification Plan (`tests/workflow-stage28-1-conflict-detector.test.js`)**:
  - `CFT-01`: Validates compliant repair policy schema.
  - `CFT-02`: Detects spatial interval collisions on the same track between multiple retiming proposals.
  - `CFT-03`: Identifies property interference on the same clip (e.g., competing envelope keyframes).
  - `CFT-04`: Resolves independent safe proposals across different tracks/intervals into a parallel batch.
  - `CFT-05`: Constructs deterministic DAG ordering (`SYNC_RETIME` before `PEAK_ATTENUATION`).
  - `CFT-06`: Rejects unresolvable mutually exclusive proposals with explicit diagnostic codes.
  - `CFT-07`: Stale revision protection across multi-proposal sets.

### Stage 28.2: Multi-Pass Repair Orchestrator & Bounded Pass Engine
- **Objective**: Implement `MultiPassRepairOrchestrator` coordinating sequential passes.
- **Components**:
  - `src/audio/repair/multi-pass-orchestrator.js`: High-level orchestrator executing pass loop: Plan $\to$ Detect Conflicts $\to$ Execute Non-Conflicting Batch $\to$ Rerender $\to$ Fresh QA $\to$ Repeat or Promote.
- **Verification Plan (`tests/workflow-stage28-2-multi-pass-orchestrator.test.js`)**:
  - `MPS-01`: Enforces bounded pass budget (`maxPasses = 3`) and terminates cleanly when all defects resolve.
  - `MPS-02`: Fresh finding ingestion: Pass 2 consumes strictly fresh QA findings from Pass 1's render.
  - `MPS-03`: Step-by-step revision fencing: verifies base revision advances monotonically ($R \to R+1 \to R+2$).
  - `MPS-04`: Pass budget exhaustion (`MAX_PASSES_EXCEEDED`): halts without promotion if defects persist after 3 passes.
  - `MPS-05`: Preserves active delivery intact throughout multi-pass iteration until final promotion.
  - `MPS-06`: Transactional multi-pass rollback: failure on Pass 2 rolls back both Pass 1 and Pass 2 mutations via chained inverse operations.

### Stage 28.3: Anti-Oscillation & Convergence Guard
- **Objective**: Develop `RepairConvergenceGuard` to detect cyclic repairs and non-converging loops.
- **Components**:
  - `src/audio/repair/repair-convergence-guard.js`: Inspects multi-pass history journal, tracks cumulative tick shifts and volume gain adjustments per clip, and detects oscillations.
- **Verification Plan (`tests/workflow-stage28-3-convergence-guard.test.js`)**:
  - `CVG-01`: Detects sign-reversing oscillation (e.g., $+12,000\text{ ticks}$ on Pass 1 followed by $-12,000\text{ ticks}$ on Pass 2).
  - `CVG-02`: Detects repetitive identical proposals across consecutive passes.
  - `CVG-03`: Enforces cumulative shift cap ($|\sum \Delta_{\text{ticks}}| \le 240,000\text{ ticks}$) across passes.
  - `CVG-04`: Enforces cumulative attenuation limit (maximum 12 dB total reduction across passes).
  - `CVG-05`: Transitions to `OSCILLATION_DETECTED` and flags `NEEDS_RECONCILIATION` without modifying active delivery.
  - `CVG-06`: Diagnostic journal verification: audit record captures full history of attempted corrections and convergence metrics.

### Stage 28.4: Conflicting Defect Certification Scenario (Controlled Mandatory Test)
- **Objective**: Implement the Architecture Lead's mandatory certification test fixture with two conflicting repairs.
- **Components**:
  - `tests/workflow-stage28-4-conflicting-repair-scenario.test.js`:
    * Generates synthetic audio fixture with two valid but mutually conflicting defects: Clip A has a $+150\text{ms}$ sync offset requiring a $-18,000\text{ tick}$ shift, while adjacent Clip B occupies the target interval ($120,000\text{ ticks}$).
    * Demonstrates:
      1. Both defects are independently valid findings in raw QA.
      2. `RepairConflictDetector` detects spatial interval collision on track.
      3. Engine evaluates policy: if track reallocation is enabled, moves Clip B or auto-allocates track; if track is locked, rejects conflicting batch deterministically.
      4. Safe halt to `NEEDS_RECONCILIATION` with active delivery 100% intact when conflict cannot be safely auto-resolved.
- **Verification Plan**:
  - `CSC-01`: Dual defect fixture generation and baseline render.
  - `CSC-02`: Earshot QA detects both desync and collision-adjacent defects.
  - `CSC-03`: Conflict detector flags spatial collision between Clip A retiming and Clip B placement.
  - `CSC-04`: Resolvable path: multi-track reallocation policy safely separates clips and passes closed-loop QA.
  - `CSC-05`: Unresolvable path: locked track policy rejects proposal, prevents mutation, and preserves active delivery.
  - `CSC-06`: Full failure journal records conflict diagnostics and reconciliation instructions.

### Stage 28.5: Closed-Loop Multi-Pass End-to-End Verification & Cumulative Regression
- **Objective**: Full end-to-end integration across all subsystems with live Earshot worker and cumulative regression battery.
- **Components**:
  - `tests/workflow-stage28-multi-pass-repair.test.js`:
    * Multi-pass scenario: Pass 1 repairs sync defect; Pass 2 repairs true-peak overflow revealed after sync alignment; Pass 3 verifies clean master render.
    * Promotes final delivery only after all passes succeed.
- **Verification Plan**:
  - `E2E-01`: Full 2-pass sequential repair (sync retiming on Pass 1 $\to$ true-peak attenuation on Pass 2 $\to$ clean render promotion).
  - `E2E-02`: Live integration with `EarshotWorkerClient` across multi-pass rerender cycles.
  - `E2E-03`: Unbroken delivery provenance: previous active delivery archived only after final pass succeeds.
  - `E2E-04`: Full audit journal sealing all pass metrics, operations, and SHA-256 digests.
  - `E2E-05`: Cumulative regression battery execution across Phases 21 through 28.

---

## 4. Test Accounting & Target Matrix

| Stage | Planned Discrete Test Cases | Test Identifiers | Target Passing Count |
|:---|:---:|:---|:---:|
| **Stage 28.1** | 7 | `CFT-01` to `CFT-07` | 7 (8 reported with suite runner) |
| **Stage 28.2** | 6 | `MPS-01` to `MPS-06` | 6 (7 reported with suite runner) |
| **Stage 28.3** | 6 | `CVG-01` to `CVG-06` | 6 (7 reported with suite runner) |
| **Stage 28.4** | 6 | `CSC-01` to `CSC-06` | 6 (7 reported with suite runner) |
| **Stage 28.5** | 5 | `E2E-01` to `E2E-05` | 5 (6 reported with suite runner) |
| **Phase 28 Subtotal** | **30** | — | **35 reported by Node `--test`** |
| **Cumulative Baseline** | 212 | Phases 21–27 verified baseline | 212 |
| **Total Target Battery** | **242 discrete** | Phases 21–28 cumulative battery | **247 reported by Node `--test`** |

---

## 5. Deliverables & Production Invariants

1. **New Production Modules**:
   - `src/audio/schemas/audio-repair-policy.v1.json` (Draft 2020-12 repair policy contract)
   - `src/audio/repair/repair-conflict-detector.js` (Conflict detection & dependency ordering)
   - `src/audio/repair/multi-pass-orchestrator.js` (Multi-pass repair coordinator)
   - `src/audio/repair/repair-convergence-guard.js` (Oscillation & duplicate-repair protection)
2. **Production Package Expectation**:
   - Phase 27 clean package: **169 files**
   - Phase 28 clean package: **173 files** (exactly +4 production modules)
   - Zero runtime npm dependencies: `"dependencies": {}` preserved in `package.json`.
   - Canonical Schemas: All 18 canonical schemas in `schema/*.v1.schema.json` 100% frozen.
3. **Execution Directive**: `Use required GSD actions to achieve the goals and wherever needed.`
