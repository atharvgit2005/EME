# Phase 21: Production Readiness, Security Hardening & Controlled Rollout
## Stage 21.0: Baseline Audit & Architecture Discovery Contract

**Milestone**: Phase 21 — Production Readiness, Security Hardening & Controlled Rollout  
**Stage**: Stage 21.0 — Baseline Audit & Architecture Discovery Contract  
**Document**: `plans/PHASE_21_STAGE0_AUDIT.md`  
**Certified Predecessor Milestone**: Phase 20 (Production Observability, Operational Resilience & Deployment Safety)  
**Certified Baseline Tag**: `phase-20-certified` (`35b7dc6e73f5478e6b0edac0981f67127c14e5e4`)  
**Certified Baseline Commit**: `45e0046e7fca99bb3cf81640a232f3ea91a788e0`  
**Release Candidate Artifact**: `dist/editing-mechanics-engine-0.1.0-rc1.tgz`  
**Release Candidate SHA-256**: `dece27083ac2823a62480f6554b982e6b5e6df99c7097bcd0a321647a51edd39`  
**Release Candidate Size**: 371,608 Bytes (161 clean distribution files)  
**Baseline Test Batteries**:
- **Phase 20 Subtotal**: **59 / 59 PASS** across 6 dedicated test suites
- **Master Regression Battery**: **607 / 607 PASS (Exit Code: 0, 0 Failures)** across all 12 test suites  
**Target Architecture Owner**: ChatGPT Architecture Lead  
**Authorization Reference**: `plans/CHATGPT_PHASE20_FINAL_CERTIFICATION.md` (Signed by ChatGPT Architecture Lead, October 21, 2026)  

---

## 1. Operating Principles & Non-Negotiable Invariants

As mandated by the ChatGPT Architecture Lead in the Phase 20 Final Architecture Certification:
> *"The certified Phase 19 and Phase 20 invariants remain in force: the canonical 12-state lifecycle, immutable schemas, the 120,000-ticks-per-second integer timebase, authoritative mutation and fencing controls, verified active-delivery promotion, fail-closed recovery, and zero external runtime npm dependencies unless an architecture change is explicitly reviewed and approved.*  
> *Final decision: Phase 20 certified. Phase 21 authorized. The next milestone should demonstrate that EME can be deployed, monitored, recovered, and rolled back safely—not merely that its feature and regression suites pass."*

Phase 21 strictly upholds seven non-negotiable architectural invariants:

1. **Canonical 12-State Job Lifecycle**:
   - The verified 12-state job lifecycle model remains invariant:
     $$\text{ACCEPTED} \to \text{PLANNING} \to \text{AWAITING\_APPROVAL} \to \text{READY\_TO\_EXECUTE} \to \text{EXECUTING} \to \text{VERIFYING} \to \text{RENDERING} \to \text{PUBLISHING} \to \text{SUCCEEDED} \,/\, \text{FAILED} \,/\, \text{CANCELLED} \,/\, \text{NEEDS\_RECONCILIATION}$$
   - Any unresolvable delivery ambiguity or compromised state must deterministically enter `NEEDS_RECONCILIATION`.
2. **Schema Immutability**:
   - `schema/eme-*.v1.schema.json` and all canonical JSON schemas remain strictly invariant.
   - All SLO metrics, security contexts, audit trails, and rollout state must be managed via dedicated runtime controllers, diagnostics channels, or operational sidecars—never polluting core editing project schemas.
3. **Integer Timebase & Half-Open Intervals**:
   - Strict 120,000 ticks/sec timebase and half-open intervals $[startTick, startTick + durationTicks)$ remain mathematically invariant across all engines, renderers, and timeline operators.
4. **Authoritative Mutation & Fencing Controls**:
   - Single-writer lease exclusivity, fencing token monotonicity, atomic non-overwriting publication via private temp staging and hardlink promotion, and directory-level durability synchronization remain inviolable.
5. **Verified Active Delivery Promotion**:
   - `session.active_delivery` is updated ONLY after end-to-end rendering, cryptographic SHA-256 manifest validation against media bytes, and passing QA score ($\ge 85.0$) with manifest-certified binding.
   - Any operational failure, timeout, crash, or drill MUST NEVER displace or corrupt previous verified active delivery.
6. **Fail-Closed Recovery**:
   - When encountering missing manifests, checksum mismatches, stale fencing tokens, or disk exhaustion, execution fails closed immediately and safely.
7. **Zero External Runtime Dependencies**:
   - Production runtime `dependencies` in `package.json` remain strictly `{}` (zero external runtime npm packages). All security hardening, rate limiting, path guards, alerting, and rollback logic must use native Node.js core modules (`node:crypto`, `node:fs`, `node:path`, `node:os`, `node:process`, `node:http`, `node:diagnostics_channel`).

---

## 2. Phase 21 Priorities & Stage Breakdown

Phase 21 transitions EME from a certified engine to a production-ready, security-hardened, and controllably deployable system, organized into five sequential, test-driven stages:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 21 — PRODUCTION READINESS, SECURITY HARDENING & CONTROLLED ROLLOUT         │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 21.1: Production SLOs, Telemetry Health & Alerting Engine                  │
│ - Define & enforce Service-Level Indicators (SLIs) and Objectives (SLOs)         │
│ - Workflow Success Rate (>= 99.5%), Job Latency (p50/p95/p99), Contention (<50ms)│
│ - Recovery Time Objective (RTO <= 2.0s), Recovery Point Objective (RPO = 0)     │
│ - Threshold-based alerting engine distinguishing user vs telemetry failures      │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 21.2: Comprehensive Security Hardening & Threat Modeling                   │
│ - HTTP control surface & API security (path traversal, request size/DoS guards)  │
│ - Authorization boundaries, correlation-ID injection guards, CRLF sanitization   │
│ - Deep sensitive-data redaction across error logs, traces, and worker environments│
│ - Strict distinction between SHA-256 content integrity and PKI digital signatures│
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 21.3: Real Disaster Recovery & Operational Drills                          │
│ - Real backup restoration drill with tampered/corrupted archive fail-closed tests│
│ - Hard crash & resource starvation drill (SIGKILL, storage exhaustion, orphans)  │
│ - Fencing race condition drill: concurrent workers with stale tokens fail safe   │
│ - Verification that previous active delivery remains intact under all failures    │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 21.4: Controlled Deployment, Canary & Rollback Pipeline                    │
│ - Reproducible release packaging with immutable artifact checksums               │
│ - Staging smoke tests & automated canary rollout evaluation criteria             │
│ - Documented & automated rollback procedure with prior known-good preservation    │
│ - Live rollback drill demonstrating zero downtime and zero state corruption      │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 21.5: Production Release Acceptance & Milestone Certification              │
│ - Clean working tree verification & reproducible package provenance              │
│ - Comprehensive security & resilience test execution                             │
│ - Full master regression battery verification (607+ tests)                       │
│ - Final Completion Report submission to ChatGPT Architecture Lead                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Audit & Readiness Analysis

### 3.1 Observability & Telemetry Subsystem (Baseline from Phase 20)
- **Current State**:
  - `src/utils/logger.js`: Structured JSON logging with correlation IDs, levels (`error`, `warn`, `info`, `debug`), and sensitive data redaction.
  - `src/utils/metrics.js`: Prometheus v0.0.4 text format exposition with counters, gauges, histograms.
  - `src/utils/diagnostics-channel.js`: Decoupled pub/sub event bus for job transitions, locks, and delivery events.
  - `src/ui/server.js`: Exposes `/metrics`, `/healthz`, `/readyz`.
- **Phase 21 Gap**:
  - Lack of formal Service-Level Objectives (SLOs) enforcement and automated breach alerting.
  - Telemetry errors currently log but do not surface separate alerting channels from workflow execution errors.

### 3.2 Security Surface & Threat Vectors
- **Current State**:
  - `src/utils/redactor.js`: Redacts tokens, keys, and home directory paths.
  - `src/utils/doctor.js`: Validates Node.js >= 20, FFmpeg, FFprobe, and write permissions.
- **Phase 21 Gap**:
  - HTTP Server (`src/ui/server.js`) static file serving needs formal path-traversal sanitization audits against directory escape (`../`).
  - Request body parser lacks explicit byte-size ceiling protection against unbounded memory exhaustion DoS.
  - Subprocess spawning in `src/engine/subprocess-guard.js` must sanitize environment variables to prevent credential leakage into untrusted child environments.

### 3.3 Disaster Recovery & Resilience (Baseline from Phase 20)
- **Current State**:
  - `src/utils/backup.js`: Creates atomic `.tar.gz` snapshots with SHA-256 manifests; restores with fail-closed integrity checks.
  - `src/utils/scratch.js`: Manages isolated scratch workspaces and garbage collects abandoned temporary directories.
  - `src/utils/shutdown.js`: Graceful termination coordinator with SIGTERM/SIGINT handlers.
- **Phase 21 Gap**:
  - Recovery drills must be tested against simulated hard crashes (`kill -9`), storage exhaustion (0 bytes free), and corrupted partial backup manifests under active job execution.
  - Recovery Time Objective (RTO) and Recovery Point Objective (RPO) need automated verification harnesses.

### 3.4 Deployment, Canary & Rollback Pipeline
- **Current State**:
  - `scripts/package-release.js`: Generates clean production tarball `dist/editing-mechanics-engine-0.1.0-rc1.tgz` with standalone `.sha256` and `release-manifest.json`.
- **Phase 21 Gap**:
  - Canary rollout health evaluation criteria and automated rollback triggers are not codified.
  - No automated rollback script to revert a deployment to the prior known-good release artifact.

---

## 4. Stage 21.1 Detailed Implementation Plan: Production SLOs & Health Alerting

### 4.1 Service-Level Indicators (SLIs) & Objectives (SLOs) Specification
1. **Workflow Availability SLI/SLO**:
   - $SLI_{avail} = \frac{\text{Successful Terminal Jobs (SUCCEEDED)}}{\text{Total Non-Cancelled Terminal Jobs}} \times 100\%$
   - **SLO Target**: $\ge 99.5\%$ over a rolling 1-hour window.
2. **Job Execution Latency SLI/SLO**:
   - Measures end-to-end duration from `ACCEPTED` to `SUCCEEDED`.
   - **SLO Targets**:
     - $p50 \le 5.0\text{s}$
     - $p95 \le 15.0\text{s}$
     - $p99 \le 30.0\text{s}$
3. **Lock Contention SLI/SLO**:
   - Duration waiting to acquire project directory lease.
   - **SLO Target**: $p99 \le 50\text{ms}$.
4. **Media QA Quality SLI/SLO**:
   - Rejection rate of rendered candidates failing $\ge 85.0$ threshold.
   - **SLO Target**: $\le 5.0\%$ rejection rate under nominal conditions.
5. **Operational Recovery SLI/SLO**:
   - **Recovery Time Objective (RTO)**: $\le 2.0\text{s}$ from crash restart to clean reconciliation.
   - **Recovery Point Objective (RPO)**: $0$ loss of committed deliverable state.

### 4.2 Architecture of `src/utils/slo-monitor.js`
- Pure Node.js module implementing:
  - Rolling-window windowed telemetry buffers (1-minute, 5-minute, 1-hour).
  - SLI evaluation against defined targets.
  - Alert notification dispatcher supporting structured alert payloads:
    - Alert Severity (`CRITICAL`, `WARNING`, `INFO`)
    - Alert Category (`WORKFLOW_SLO_BREACH`, `LATENCY_SLO_BREACH`, `CONTENTION_SLO_BREACH`, `TELEMETRY_FAILURE`)
    - Actionable remediation advice.
  - Separation of Concerns: Telemetry failures explicitly flagged as `TELEMETRY_FAILURE` to prevent masking user-facing engine health.

---

## 5. Exit Criteria for Stage 21.0
- [x] Phase 20 officially certified and tagged `phase-20-certified` in git.
- [x] Phase 21 authorized with seven non-negotiable invariants reaffirmed.
- [x] Stage 21.0 audit document established and aligned with Architecture Lead directives.
- [x] Ready to commence Stage 21.1: Production SLOs & Health Alerting Engine.
