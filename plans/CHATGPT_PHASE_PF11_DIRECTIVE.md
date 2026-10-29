# EME Phase PF-11 — End-to-End Orchestration, Production Hardening, Packaging & Release Automation

**Directive Date**: October 19, 2026  
**Prerequisite**: PF-10 Stages 1–3, accepted based on supplied completion reports  
**Milestone Objective**: Prove and package a reliable end-to-end editing workflow using the existing EME engine.  
**Required Completion Report**: `plans/PF11_COMPLETION_REPORT.md`  
**Directive Location**: `plans/CHATGPT_PHASE_PF11_DIRECTIVE.md`  

---

## 1. Mandatory Engineering Instructions

Before modifying anything, inspect the repository, current architecture, package scripts, existing test suites, renderer integrations, revision/session contracts, artifact storage, and existing deployment or packaging strategy.

Treat actual source code and reproducible execution results as authoritative. Previous milestone reports are useful context, not substitutes for source inspection.

Use required GSD actions to achieve the goals and wherever needed.

### Core Architectural Invariants
1. The engine remains the sole authority for intent compilation, planning, deterministic execution, revision state, rendering, media QA, semantic verification, candidate eligibility, and active-delivery publication.
2. Preserve `TICKS_PER_SECOND = 120,000`, integer timeline timing, and half-open intervals `[start, end)`.
3. Execute editing changes through the existing `OperationExecutor` and established transaction, locking, revision, undo/redo, and recovery contracts.
4. Preserve `schema/eme-project.v1.schema.json`. Do not make incompatible schema changes. Any genuinely necessary contract change must be justified, versioned, and covered by backward-compatibility tests.
5. Keep existing HyperFrames and FFmpeg rendering integrations unless a demonstrated defect requires a narrowly scoped correction.
6. Never publish an unverified render as the active verified delivery.
7. Never replace valid delivery state with a failed, incomplete, stale, or unrelated artifact.
8. Do not introduce a parallel planner, timeline solver, QA scorer, revision state machine, or candidate-selection engine in the UI or orchestration layer.
9. Do not add dependencies, cloud services, deployment platforms, or unrelated editing features without demonstrating that they are necessary.

Implement and certify PF-11 in the three stages below. Report each stage separately and stop to investigate any failed gate rather than weakening tests.

---

## 2. Stage 1 — End-to-End Orchestration Integration

### Objective
Connect the existing engine components into one reliable end-to-end workflow, with authoritative state transitions and verifiable outputs.

### Required Workflow
Establish and document the actual integration path:
1. Receive and validate a user request.
2. Compile the request through the existing prompt-to-plan pipeline.
3. Validate hard constraints, operation legality, baseline revision, and required media.
4. Execute the plan through existing execution and transaction mechanisms.
5. Render through the existing rendering integration.
6. Run media QA and semantic verification against the actual output.
7. Produce and verify the delivery manifest, media identity, and SHA-256 hash.
8. Publish the new active delivery only after all required verification gates pass.
9. Refresh the authoritative session and visual control surface.
10. Persist sufficient history and recovery information to diagnose and recover from failures.

Use the existing PF-05, PF-06, PF-07, PF-08, PF-09, and PF-10 components where their current contracts support these steps. Do not duplicate their responsibilities.

### Job Lifecycle and Reliability
First determine whether current render and revision requests can exceed normal HTTP request timeouts. If so, implement a durable orchestration-job lifecycle using the repository's existing conventions.

At minimum, distinguish:
- `Accepted`
- `Validating/planning`
- `Executing`
- `Rendering`
- `Verifying`
- `Committed`
- `Failed`
- `Recovering`, when applicable

Use persisted job identity and an idempotency strategy so that retries after network timeouts cannot accidentally execute the same revision twice or publish conflicting deliveries. Provide authoritative progress retrieval if asynchronous execution is needed. A browser spinner alone does not establish job progress.

Do not introduce an independent client-side job state machine. The backend must define authoritative lifecycle state and valid transitions.

### Required End-to-End Acceptance Fixture
Locate an existing deterministic test fixture with approved media and known timeline expectations. Prefer an established PF-03/PF-05 fixture rather than inventing new media assumptions.

Run a full prompt-to-delivery scenario that:
1. Produces the fixture's specified vertical-video sequence, timing, title, transitions, and audio requirements.
2. Enforces all applicable hard constraints.
3. Executes the actual operation pipeline.
4. Invokes a real render through the configured renderer.
5. Runs actual media QA and semantic verification.
6. Produces a delivery manifest whose media hash matches the output file.
7. Publishes the active delivery only after all gates pass.

Record the precise prompt, input fixture identities, expected atomic operations, constraints, plan hash, execution evidence, render details, QA report, semantic results, manifest identity, and media hash.

Do not count a mocked render or a fabricated verification response as a successful end-to-end test.

### Stage 1 Gates
- **Successful request**: reaches committed state with a real, playable, verified output.
- **Invalid request**: fails before execution without changing the active delivery.
- **Operation failure**: rolls back or recovers according to existing transaction guarantees.
- **Render failure**: leaves the previous verified delivery active.
- **QA or semantic failure**: does not publish the failed render.
- **Duplicate submission or timeout retry**: does not cause duplicate execution or competing commits.
- **Concurrent mutation**: stale revisions are rejected and the authoritative session remains consistent.
- **Process interruption at documented persistence boundaries**: recovery is safe and idempotent.
- **Successful rerun after recovery**: produces a valid delivery without corrupting history.

---

## 3. Stage 2 — Production Hardening and Release Readiness

### Objective
Close inherited PF-10 release gates and demonstrate that media identity, project state, and delivery publication remain trustworthy under adversarial conditions.

### A. Media Access and Security
- Audit the complete `/api/media` authorization path and its callers.
- Test path traversal, encoded traversal, unauthorized existing files, symlinks, symlink replacement and time-of-check/time-of-use races, malformed byte ranges, unsupported multiple ranges, invalid ranges, and superseded artifacts.
- Prefer an opaque, authorized media ID bound server-side to an exact artifact or immutable manifest. Avoid accepting arbitrary filesystem paths from the browser.
- Authorization must remain valid for the requested artifact throughout file access. Real-path checks alone are not sufficient if the underlying file or symlink can change after validation.
- Verify HTTP range behavior, correct status codes, MIME handling, and that no path outside the intended media registry can be exposed.

### B. Artifact Identity and Manifest Integrity
Enforce exact identity relationships:
`revision/candidate → immutable manifest → authorized media artifact → SHA-256`

Verify that:
1. Candidate activation rechecks the selected candidate set, candidate ID, eligibility, expected version, manifest identity, and media integrity on the server.
2. Historical inspection cannot accidentally display active-delivery media under a historical revision label.
3. Candidate preview remains non-mutating.
4. A declared SHA-256 matches the actual bytes served and rendered.
5. Missing, superseded, or mismatched artifacts fail closed with explicit errors.
6. A manifest marked verified cannot be published without passing the actual required gates.

Review the PF-10 revision-media lookup contract carefully. Do not assume a revision ID is automatically a valid media ID unless the server's registry explicitly establishes that binding.

### C. Persistence, Recovery, and Compatibility
- Exercise process termination between snapshot persistence, revision/history updates, session-version changes, manifest publication, and active-delivery pointer updates.
- After restarting, recovery must produce a coherent state: either a fully committed verified delivery or a recoverable prior state, never a half-published result.
- Audit the PF-10 addition of `project_path` to `schema/eme-revision-session.v1.schema.json`. Verify compatibility with existing persisted sessions and older valid documents. Preserve the versioned contract unless a justified migration is required.
- Investigate the previously flagged suspicious output identity in the PF-09 title-move test. Confirm that a title timing change is visible at the expected rendered frames and that identical hashes are not being mistaken for successful visual revision.
- Where candidate profiles are intended to differ, verify their actual rendered outputs and semantic differences. Mock-only fallback results cannot establish profile differentiation.

### Stage 2 Gates
All adversarial security tests pass; persisted-session compatibility is demonstrated; process-kill recovery is reproducible; historical and candidate media identities are exact; real output frames prove intended changes; and all prior phase regressions remain green.

---

## 4. Stage 3 — Production Packaging and Release Automation

### Objective
Produce a clean, verifiable, installable release using the deployment target and packaging conventions established in the repository audit.

Do not assume that a cloud deployment is required. If no deployment target is documented, package the current application for its intended local runtime and document any platform requirements.

### A. Clean Production Build
Provide a reproducible build/package procedure that:
1. Uses the existing dependency lockfile and a clean dependency installation.
2. Runs applicable type checks, unit tests, integration tests, and production build steps.
3. Checks required runtime versions and the availability/versions of FFmpeg, FFprobe, HyperFrames, and other actual runtime prerequisites.
4. Excludes development-only assets, secrets, credentials, local user data, temporary files, and unnecessary build artifacts.
5. Preserves necessary schemas, migration assets, configuration templates, runtime resources, license notices, and operational documentation.
6. Fails clearly when a required dependency or configuration is missing.

Inspect existing scripts first. Add only the necessary package scripts or release tooling, using the project's established naming conventions.

### B. Release Manifest and Artifact Integrity
Generate a release manifest containing, where applicable:
- Application version and source commit.
- Build/runtime compatibility requirements.
- Dependency-lockfile identity.
- Required schema versions.
- Release artifact filename, size, and SHA-256.
- Required external runtime prerequisites.
- Build and verification results.

Record any nondeterministic build inputs and distinguish them from content-integrity checks. Do not claim reproducible builds unless repeated clean builds demonstrate the stated reproducibility.

Produce a versioned archive or installer appropriate to the existing product target and a separate checksum. Verify the final packaged contents rather than relying only on the source-tree build passing.

### C. Install, Upgrade, and Rollback
Test the packaged application in a clean environment or isolated installation directory.

Demonstrate:
- Fresh installation/startup.
- Runtime prerequisite validation.
- Health check and session initialization.
- A real end-to-end fixture render and verification.
- Upgrade from the previous compatible package, if one exists.
- Preservation of existing user projects and persisted sessions.
- Failure during installation or upgrade without leaving a partially active release.
- Rollback to the prior known-good release.
- Release checksum verification.
- Clean shutdown and restart with coherent session recovery.

Updates and release activation must not overwrite user projects or publish a broken binary as the current release. If the existing system supports automatic update discovery, verify its trust and integrity model; do not introduce an untrusted remote-update mechanism merely to claim update automation.

### D. Release Automation
Add a single documented release workflow that runs the required validation, builds the package, creates the release manifest and checksum, performs package-level smoke tests, and writes a clear pass/fail summary.

A release must be blocked if required tests, security checks, package validation, or end-to-end delivery checks fail.

Do not publish externally or release to end users automatically unless an existing authorized distribution target and release procedure explicitly require it.

---

## 5. Required Test and Evidence Strategy

Extend existing test suites instead of replacing them.

Provide automated coverage for:
- End-to-end prompt → execution → render → QA → semantic verification → manifest → active-delivery publication.
- Rejection of invalid requests and failed verifications.
- Duplicate/retried requests, concurrency conflicts, and timeout recovery.
- Process-kill recovery at critical persistence boundaries.
- Media authorization and artifact identity.
- Candidate selection and historical inspection.
- Session/schema backward compatibility.
- Clean build and packaged application startup.
- Packaged real-render smoke test, checksum validation, and upgrade/rollback behavior.

Retain existing tests for PF-07, PF-08, PF-09, PF-10 Stages 1–3, and the base EditorBackend. Run the complete applicable regression suite after integration.

Report test counts by suite and the exact commands executed. Distinguish mocked unit tests, HTTP integration tests, process-crash tests, and tests that invoke real rendering tools.

Every reported PASS must correspond to an executed assertion. Do not weaken an acceptance criterion, hide a failure, or replace a failing real integration test with a mock solely to achieve a green suite.

---

## 6. Architectural and Release Invariants

PF-11 must preserve:
- The active verified delivery when a revision, render, QA, or verification step fails.
- Engine-owned hard constraints, execution semantics, and authoritative revision/session state.
- Immutable manifest and media identity binding.
- Correct optimistic concurrency and idempotent recovery.
- Explicit distinction between candidate preview, historical inspection, pending jobs, failed attempts, and active delivery.
- Read-only behavior for inspections and previews.
- Existing schema compatibility unless an approved versioned migration is proven necessary.

Do not expand into new creative-editing features, a new UI redesign, a replacement render engine, or a new AI planning model in this milestone.

---

## 7. Required Completion Report

Create `plans/PF11_COMPLETION_REPORT.md` containing:
- Actual source files changed and architectural responsibilities.
- End-to-end data flow and state-transition diagram.
- Stage-by-stage implementation and gate results.
- The exact acceptance prompt and fixture identities.
- Atomic operation sequence and execution evidence.
- Render metadata and actual media QA results.
- Semantic verification results and manifest/hash verification.
- Security, compatibility, crash-recovery, and concurrency test evidence.
- Full regression commands, suite counts, failures, and limitations.
- Packaging instructions, runtime requirements, artifact checksums, install/upgrade/rollback results.
- Any unresolved issues with severity and their release impact.
- A final decision of PASS, CONDITIONAL PASS, or FAIL, with explicit justification.
- Include the path, version, and SHA-256 of the final release artifact when a package is produced.

---

## 8. Final Acceptance Criteria

PF-11 is eligible for production certification only when:
- The real end-to-end fixture completes successfully and produces a verified, playable artifact.
- Failures preserve the previous verified active delivery.
- Retry, concurrency, process-recovery, and artifact-identity guarantees are demonstrated.
- The inherited PF-10 security and compatibility gates are closed.
- All required existing and new regression tests pass.
- A clean packaged installation starts and successfully performs the acceptance workflow.
- Integrity-checked installation, upgrade, and rollback work for the documented target.
- Release artifacts and test evidence are reproducible enough for another engineer to verify.

A green test suite alone does not certify production readiness. Certification requires both passing tests and evidence that the actual packaged application works end to end.

**Execution Order**:
1. Repository audit
2. Stage 1 integration & Stage 1 certification
3. Stage 2 hardening & Stage 2 certification
4. Stage 3 packaging & clean-install verification
5. Final regression
6. Completion report and release decision
