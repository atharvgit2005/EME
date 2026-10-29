Phase 15 — Independent Acceptance, Reliability Hardening & Release-Candidate Readiness
Mission

Independently verify the existing Editing Mechanics Engine (EME), close inherited evidence gaps, prove durable recovery through real process interruption, verify every accepted output against its manifest, and establish an evidence-backed internal release-candidate decision.

Use required GSD actions to achieve the goals and wherever needed.

Operating rules

Inspect the actual repository and current artifacts before changing files.

Preserve all existing regression tests and safeguards.

Do not equate a report claiming PASS with independently reproduced evidence.

Do not create features unrelated to reliability, acceptance, or packaging.

Do not publish a public release or begin Phase 16.

15A. Audit and inherited evidence

Create docs/PHASE_15_BASELINE.md.

Map every Phase 11.1–14 acceptance requirement to:

implementation;

named automated test;

command actually executed;

machine-readable result or artifact;

current status (CLOSED, OPEN, NOT APPLICABLE);

any remaining limitation.

Explicitly investigate the known gaps in pixel-repeatability frame indices, localized edit containment, repeated performance measurements, and failure/recovery evidence. Do not mark an item closed solely because a newer suite passes.

15B. True crash and recovery testing

Use separate processes to exercise interruption during lifecycle persistence, after an operation commits, during render, between render and QA, after QA and before final-manifest acceptance, and during resume.

Terminate and restart the process where the scenario requires it. Reconstruct state from persisted data, validate the project revision and operation history, and ensure retries do not duplicate committed operations.

Verify that partial output artifacts never become accepted final outputs. Document the actual durability guarantees of atomic JSON writes and the results of interruption tests.

15C. Complete the canonical 12-case recovery matrix

Write docs/phase-15-recovery-matrix.md. Name all original cases 1–12 and map every case to a specific executable test, fault injection, expected result, observed result, project-state check, artifact check and recovery outcome.

Investigate the Phase 14 report's unlabelled Case 9. Preserve its intended semantics and demonstrate it explicitly; do not invent a replacement for it.

Add tests for interrupted saves and concurrent conflicting mutations as supplementary cases. Retain the original cases and identifiers.

15D. Output-manifest verification

Implement or extend eme verify-artifacts.

Validate manifest schema, required fields, file existence, input/output SHA-256 hashes, asset identities, source-analysis and plan linkage, project revisions, output metadata, QA references and accepted completion status.

Test against the real Phase 14 outputs. Deliberately modify an output, remove a referenced source and corrupt a manifest; verify every invalid case is rejected. Record machine-readable results and never overwrite an accepted output on failed verification.

15E. Orchestration consistency

Use the current architecture. Keep the canonical project model unchanged.

Test CLI, MCP and local UI against shared validation, revision handling, approval, cancellation and recovery rules. Exercise conflicting mutations, duplicate requests, approval for stale plans, and resume after asset changes.

Add safe locking or coordination only where required by observed races. Demonstrate idempotency through actual state/revision comparison, not solely matching response messages.

15F. Independent acceptance runs

Repeat all three Phase 14 workflows and create a recovery-focused acceptance task.

For every run, preserve the real inputs and their hashes, analysis, plan version, executed operation IDs, project revisions, render, decoded-frame comparisons, QA findings and final manifest.

Probe actual rendered media with the available tools. Record exact frame indices/timestamps for repeatability checks. Keep identical-render comparisons separate from intended-edit differences and verify containment masks programmatically when making localized-change claims.

At least one workflow must survive a genuine process interruption and restart. A simulated suspended state alone does not satisfy this criterion.

15G. Performance and security audit

Measure repeated representative renders; retain raw timings, sample count, median and range. Use these documented formulas:

render_duration_ratio = render_time_sec / output_duration_sec

playback_speed_factor = output_duration_sec / render_time_sec

Audit path traversal, symlink escape, malformed/untrusted plan and manifest data, unsafe output overwrites, temporary artifact cleanup and process argument safety.

Test and document the actual runtime and platform configurations. Do not claim untested compatibility.

15H. Regression and package verification

Run the full existing suite before and after changes, add the new tests and save raw logs. Investigate intermittent failures rather than hiding or rerunning them until they pass.

If all hard criteria pass, prepare an internal release candidate:

build reproducibly;

inspect package inventory and dependency pins;

review licenses and third-party notices;

perform a clean-install test in a fresh directory;

run eme doctor and capability checks;

complete one representative render and validate its output manifest.

Do not publish the package or remove safeguards.

Required deliverables

At minimum:

docs/PHASE_15_BASELINE.md

docs/PHASE_15_REPORT.md

docs/phase-15-recovery-matrix.md

docs/phase-15-crash-consistency.md

docs/phase-15-manifest-verification.md

docs/phase-15-performance-results.md

docs/phase-15-security-audit.md

docs/phase-15-release-checklist.md

Output-manifest verifier, fault-injection helpers and named tests.

Machine-readable acceptance and integrity evidence under artifacts/phase-15/.

Full regression log, clean-install log and inherited-evidence closure matrix.

Follow repository naming conventions where appropriate, but maintain all specified evidence requirements.

Definition of done

Return an overall verdict and a requirement-by-requirement matrix. A PASS requires genuine process-restart recovery, complete recovery-case mapping, verified artifact hashes and metadata, consistent approval/revision behavior, successful end-to-end acceptance, reproducible performance and pixel evidence, passing regressions and a successful clean-install internal candidate.

For each claim, clearly distinguish direct test evidence from a report or assumption. Retain unresolved items explicitly. Do not publish a public release, train a custom model, change the canonical project model or start Phase 16.