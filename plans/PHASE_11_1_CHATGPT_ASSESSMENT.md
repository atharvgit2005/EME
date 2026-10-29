Phase 11.1 — Reliability Evidence Closure

Workspace: /Users/atharvpaharia100/editing-mechanics-engine

Objective: Resolve outstanding discrepancies in the Phase 11 report and complete the required reliability evidence before starting Phase 12.

Tasks
1. Reconcile existing artifacts

Inspect the Phase 11 report, suite manifest, result files, QA calibration report, audio analysis output, and benchmark artifacts.

Establish whether the required methodology, results, failure-taxonomy, repeatability, and pixel-diff artifacts already exist.

Update existing documents instead of creating duplicate artifacts.

Preserve original benchmark projects and renders.

2. Correct QA calibration

Reconcile the reported five fixtures versus the four listed defective fixtures.

Include at least eight deliberately defective fixtures spanning text clipping, missing assets/fonts, orphan tracks, invalid bounds, unsupported effects, output mismatch, and missing/truncated output where feasible.

Include at least eight known-clean controls covering normal layouts, valid assets, intentional off-screen entrance animation, supported effects, and correctly rendered outputs.

Record expected findings before running the QA engine.

Compute TP, TN, FP, FN, sensitivity, specificity, and false-positive rate using their standard definitions.

Report fixture counts and results explicitly. Do not extrapolate small-fixture results to arbitrary production videos.

3. Complete failure-recovery coverage

Test missing fonts, stale revisions, and a controlled renderer failure in addition to the cases already reported.

For every failure, verify the expected error category, project-state integrity, revision behavior, output validity, and cleanup safety. Confirm that a subsequent valid operation succeeds where recovery is appropriate.

4. Verify audio measurements

Preserve the existing audio benchmark.

Record the exact FFmpeg command and version used for the reported measurements.

Distinguish mean volume, RMS level, maximum peak, and other measures accurately.

Measure RMS with an appropriate tool or filter if it is a required metric.

Verify intended cue placement and envelope behavior rather than relying only on a non-silent stream.

5. Perform controlled pixel repeatability tests

Render the same canonical project revision twice with identical documented settings.

Extract at least five matching timestamps, including keyframes and clip boundaries.

Compare decoded pixel arrays and report changed-pixel percentage and RMSE.

Separately compare a known visual edit against its baseline and generate a difference image.

Confirm the edit changed the intended area and did not cause unrelated visual changes.

Record project hashes, renderer configuration, time-sampling rules, and any observed variance.

6. Normalize performance evidence

For existing benchmark timings, distinguish:

Compilation time.

Render wall-clock time.

Output duration.

Rendering throughput factor.

Total time to verified delivery where available.

Repeat representative performance measurements at least twice under documented conditions. Do not infer a bottleneck from a single run.

7. Validate regression and documentation

Run the complete existing test suite and schema validator.

Clearly distinguish unit tests, fixture tests, integration tests, and fresh render executions.

Update docs/PHASE_11_REPORT.md with the reconciled results.

Ensure docs/benchmarks/phase-11-methodology.md, docs/benchmarks/phase-11-results.md, and docs/benchmarks/phase-11-failure-taxonomy.md exist and reflect actual findings.

Record unresolved failures instead of changing test expectations merely to obtain a pass.

Exit criteria

Phase 11.1 passes when the numerical claims are internally consistent, clean and defective QA fixtures are both evaluated, required failure classes are tested, repeatability has been measured, and performance results are clearly defined.

Finish with PASS, PARTIAL PASS, or BLOCKED. Do not introduce unrelated features, publish releases, or automatically start Phase 12.

Use required GSD actions to achieve the goals and wherever needed.
