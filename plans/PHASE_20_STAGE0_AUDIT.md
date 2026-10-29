# Phase 20: Production Observability, Operational Resilience & Deployment Safety
## Stage 20.0: Baseline Audit & Architecture Discovery Contract

**Milestone**: Phase 20 — Production Observability, Operational Resilience & Deployment Safety  
**Stage**: Stage 20.0 — Baseline Audit & Architecture Discovery Contract  
**Document**: `plans/PHASE_20_STAGE0_AUDIT.md`  
**Certified Predecessor Milestone**: Phase 19 (RT-01 End-to-End Workflow Integration & Final Delivery)  
**Certified Baseline Tag**: `phase-19-rt-01-certified`  
**Certified Package Artifact**: `dist/editing-mechanics-engine-0.1.0-rc1.tgz`  
**Certified Package SHA-256**: `a74ca1019445d3c6dbed8709501ccfcbf75b1f4a2806e72d03a2aeffcac27e92`  
**Certified Baseline Commit**: `18527d6855fe87a2b62cca9a564038b3bf1eb5b3`  
**Baseline Regression Health**: **548 / 548 PASS (Exit Code: 0)** across all 71 test files and 12 suites in 158.8s  
**Target Architecture Owner**: ChatGPT Architecture Lead  
**Authorization Reference**: `plans/CHATGPT_PHASE19_FINAL_CERTIFICATION.md` (Signed by ChatGPT Architecture Lead, October 21, 2026)  

---

## 1. Operating Principles & Non-Negotiable Invariants

As mandated by the ChatGPT Architecture Lead in the Phase 19 Final Architecture Certification:
> *"Preserve the certified Phase 19 release candidate and its provenance as the baseline. Phase 20 should build on the established invariants rather than silently changing the canonical project schema, the 12-state job lifecycle, the fencing model, or the meaning of verified active delivery."*

Phase 20 strictly adheres to the following six non-negotiable architectural invariants:

1. **Schema Immutability**:
   - `schema/eme-project.v1.schema.json` and all canonical JSON schemas remain strictly invariant.
   - Observability, metrics, and operational metadata must be encapsulated in runtime telemetry, log streams, or dedicated diagnostic sidecars—never polluting canonical editing project files.
2. **Canonical 12-State Job Lifecycle**:
   - The verified 12-state job lifecycle model (`SUBMITTED` $\rightarrow$ `VALIDATING_BRIEF` $\rightarrow$ `NORMALIZING_CONSTRAINTS` $\rightarrow$ `EVALUATING_READINESS` $\rightarrow$ `AWAITING_APPROVAL` $\rightarrow$ `READY_TO_EXECUTE` $\rightarrow$ `EXECUTING_OPERATIONS` $\rightarrow$ `RENDERING_MEDIA` $\rightarrow$ `EVALUATING_MEDIA_QA` $\rightarrow$ `EMITTING_MANIFEST` $\rightarrow$ `PROMOTING_ACTIVE_DELIVERY` $\rightarrow$ `SUCCEEDED` / `FAILED` / `NEEDS_RECONCILIATION` / `CANCELLED`) remains authoritative.
   - Observability systems monitor and record state transitions without introducing uncontracted intermediate states.
3. **Integer Timebase & Half-Open Intervals**:
   - Strict 120,000 ticks/sec timebase and half-open intervals $[startTick, startTick + durationTicks)$ remain mathematically invariant across all operational and diagnostic layers.
4. **Verified Active Delivery Model**:
   - `session.active_delivery` is updated ONLY after end-to-end media rendering, quality assurance threshold compliance ($\text{score} \ge 85.0$), and cryptographic SHA-256 manifest validation pass.
   - Operational failures, resource limits, or diagnostic exceptions MUST never displace or corrupt prior verified active delivery.
5. **Zero External Runtime Dependencies**:
   - Production runtime `dependencies` in `package.json` remain strictly `{}` (zero external runtime npm packages).
   - Structured logging, metric counters, resource guards, and health telemetry must utilize native Node.js core modules (`node:crypto`, `node:fs`, `node:path`, `node:os`, `node:process`, `node:http`, `node:diagnostics_channel`).
6. **Cross-Process Mutual Exclusion & Fencing**:
   - Multi-process lock coordination, fencing token monotonicity, atomic non-overwriting publication via private temp + `linkSync`, and directory durability synchronization remain fully preserved.

---

## 2. Phase 20 Stage Breakdown

To transition EME from a qualified release candidate to a production-hardened, self-healing, and observable engine, Phase 20 is structured into five sequential, verifiable stages:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 20 — PRODUCTION OBSERVABILITY, OPERATIONAL RESILIENCE & DEPLOYMENT SAFETY  │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 20.1: Production Observability & Structured Telemetry                      │
│ - Correlation IDs propagated across HTTP / MCP / CLI / Worker boundaries         │
│ - Structured JSON log format with configurable log levels (error, warn, info)   │
│ - Diagnostics channel & lifecycle event bus for state transitions                │
│ - Actionable error classification & deep diagnosis for NEEDS_RECONCILIATION     │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 20.2: Operational Resilience & Resource Guardrails                         │
│ - Subprocess & FFmpeg rendering resource limits (timeout, memory, niceness)     │
│ - Preflight disk space verification before render jobs                           │
│ - Safe periodic & exit cleanup of abandoned scratch media                        │
│ - Clean graceful shutdown handler for SIGTERM / SIGINT with job suspension       │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 20.3: Deployment Safety, Backup & Disaster Recovery                        │
│ - Automated atomic backup & restore tooling for project repositories             │
│ - Non-destructive rollback drills across versions                                │
│ - Sensitive path & secret redaction in telemetry & logs                          │
│ - Strict environment & toolchain preflight validator (Node, FFmpeg, OS)         │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 20.4: Production Health Metrics & Observability Endpoints                  │
│ - Dedicated HTTP health endpoints: /healthz (liveness), /readyz (readiness)      │
│ - Prometheus-compatible /metrics endpoint exposing:                              │
│   * Job durations, latency percentiles (p50, p95, p99)                           │
│   * Active delivery publication counters, QA rejection rates                     │
│   * Lock contention duration and recovery token generation counters              │
│   * Subprocess failure counters and reconciliation triggers                      │
└──────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stage 20.5: Operational Fault-Injection & Packaged Candidate Certification       │
│ - Comprehensive operational fault injection battery against packaged artifact    │
│ - Release packaging of v0.1.0-rc2 with verified manifest and provenance          │
│ - Full regression verification (Stage 20 suite + master regression)              │
│ - Submission to ChatGPT Architecture Lead for Phase 20 Final Certification       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Audit & Baseline Analysis

### 3.1 Logging & Telemetry Baseline
- **Current State**: `console.log` and `console.error` are used ad-hoc across `src/prompt-core/`, `src/ui/server.js`, and `bin/eme.js`.
- **Gaps**:
  - Lack of structured JSON output for machine ingest (Datadog, Loki, CloudWatch).
  - Lack of unified request correlation IDs (`x-correlation-id` or `trace_id`) connecting an incoming HTTP/MCP prompt to background child processes and disk operations.
  - Telemetry does not emit structured diagnostic events during critical transitions (e.g. `NEEDS_RECONCILIATION` leaves only file system state without an explicit diagnostic ledger).
- **Target**: Native `Logger` module in `src/prompt-core/logger.js` utilizing `node:diagnostics_channel` with zero npm dependencies, supporting JSON and pretty formats, correlation ID context propagation via `node:async_hooks` (`AsyncLocalStorage`), and structured error payloads.

### 3.2 Resource Limits & Process Guardrails Baseline
- **Current State**: Subprocesses (FFmpeg, FFprobe, Python VTSM) are executed via `child_process.spawn` or `execFile` without explicit memory ceilings or CPU nice levels.
- **Gaps**:
  - A runaway FFmpeg encode or corrupted input media could exhaust system memory or execute indefinitely without timeout enforcement.
  - Disk space exhaustion during large media rendering can corrupt partially written files.
  - Interrupted processes can leave orphaned temporary scratch files in `scratch/`.
- **Target**: `src/prompt-core/resource-guard.js` enforcing:
  - Subprocess timeouts and automatic `SIGKILL` escalation.
  - Disk space preflight checks (ensuring minimum free space before launching renders).
  - Centralized scratch lifecycle manager with safe cleanup.
  - Trap handlers for `SIGTERM` and `SIGINT` to cleanly close open file descriptors and release locks.

### 3.3 Health & Metrics Baseline
- **Current State**: `src/ui/server.js` exposes API routes for sessions, projects, operations, and renders, but lacks dedicated `/healthz`, `/readyz`, or `/metrics` endpoints.
- **Gaps**:
  - Orchestrators (Kubernetes, systemd, Docker healthcheck) cannot probe service liveness and readiness independently.
  - No Prometheus/OpenMetrics formatted endpoint for monitoring operational KPIs (job throughput, error rates, lock wait times).
- **Target**: `src/ui/metrics-collector.js` and routes in `src/ui/server.js`:
  - `GET /healthz`: Immediate 200 OK process liveness.
  - `GET /readyz`: Validates disk access, toolchain availability (FFmpeg), and session lock availability.
  - `GET /metrics`: Standard text format metrics with counters, gauges, and histograms.

---

## 4. Verification & Testing Strategy

Each stage of Phase 20 will be accompanied by dedicated, deterministic test suites:
1. `tests/workflow-stage20-1-observability.test.js`: Verifies correlation ID propagation, structured log parsing, and diagnostic event delivery.
2. `tests/workflow-stage20-2-resilience.test.js`: Verifies subprocess timeout termination, disk space preflight enforcement, scratch cleanup, and graceful shutdown signal handling.
3. `tests/workflow-stage20-3-deployment-safety.test.js`: Verifies project backup & restore integrity, sensitive data sanitization, and environment doctor checks.
4. `tests/workflow-stage20-4-metrics.test.js`: Verifies `/healthz`, `/readyz`, and `/metrics` scrape outputs and metric increment accuracy.
5. `tests/workflow-stage20-5-fault-injection.test.js`: End-to-end operational stress and fault-injection against the packaged candidate.

Full regression guarantees: All existing 548 master tests will continue to pass without regression at every stage.

---

## 5. Kickoff Authorization & Next Steps

With Phase 19 unconditionally certified under `phase-19-rt-01-certified` and Phase 20 authorized by the ChatGPT Architecture Lead, Stage 20.0 establishes the verified architecture baseline.

**Immediate Next Steps**:
1. Commit `plans/PHASE_20_STAGE0_AUDIT.md`.
2. Proceed immediately to **Stage 20.1 — Production Observability & Structured Telemetry**:
   - Implement `src/prompt-core/logger.js` with structured JSON logging and `AsyncLocalStorage` correlation ID tracking.
   - Author `tests/workflow-stage20-1-observability.test.js`.
   - Run tests and verify zero regressions against the 548 master tests.
