Phase 14 — Production Workflow Orchestration & Real-World Acceptance
Mission

Make the existing Editing Mechanics Engine (EME) a reliable, resumable, agent-operated editing workflow. Integrate its source analysis, evidence-linked plans, deterministic compiler, renderer and bounded QA into a durable job lifecycle with asset-integrity checks, approval gates, safe recovery and reproducible final-output manifests.

Use required GSD actions to achieve the goals and wherever needed.

Critical instructions

Inspect the actual repository before implementing anything. Do not rely exclusively on previous chat reports.

Preserve the existing canonical EME project model and renderer adapter architecture.

Preserve all existing tests; add coverage rather than replacing valid tests with superficial mocks.

Separate measured implementation results from assumptions or claims that were not reproduced.

Do not publish a release or start Phase 15.

Do not train a custom model or rewrite the engine without demonstrated evidence that it is required.

14A — Baseline and inherited evidence

Create docs/PHASE_14_BASELINE.md.

Inventory the real source files, schemas, tests, generated artifacts and current workflow boundaries. Run the existing regression suite and preserve the raw log.

Review the unfinished evidence from Phase 11.1 and Phase 13. In particular:

repeated performance measurements and a consistent definition of render factors;

pixel-repeatability samples with exact decoded frame indices and timestamps;

machine-checked containment for intentional edit differences;

complete stale-revision, renderer-failure, partial-output and recovery evidence;

explicit Phase 11.1 closure status.

Reconcile Phase 12/13 requirements against current artifacts. Do not silently declare inherited issues resolved.

14B — Durable job lifecycle

Implement a persisted job/workflow layer that orchestrates the existing analysis, plan validation, execution, render and QA services. Do not create a second canonical editing project.

Support explicit lifecycle states for creation, ingest, analysis, planning, approval, validation, execution, rendering, QA, correction, completion, failure, cancellation and suspension/resumption.

Persist job ID, source-analysis ID, plan ID/version, canonical project ID and revision, state transitions, operation outcomes, timestamps, relevant errors, render outputs and recovery information.

Requirements:

Validate each state transition.

Persist transitions safely.

Support cancellation and safe resume after process restart.

Make repeatable requests idempotent where retry is allowed.

Do not repeat already committed mutations blindly.

Recheck source hashes and renderer capabilities on resume.

Distinguish execution failure, render failure, QA failure and accepted completion.

Record partial operation execution accurately.

Choose a lightweight persistence mechanism appropriate for the existing local application. Avoid unnecessary infrastructure.

14C — Shared agent/user workflow

Route CLI, MCP and local UI workflows through the same orchestration/service boundary and canonical project state.

The agent must be able to submit a creative brief and authorized source assets, request analysis, create an evidence-linked plan, dry-run it, obtain required approval, execute, render, inspect findings, apply permitted targeted corrections and present a final manifest.

Introduce approval gates for destructive or high-impact edits, changed source assets, unresolved material assumptions and unsupported requirements. Approval policy must be explicit and auditable.

Expose useful progress, cancellation, errors, operation history and the current project revision. Never report a task complete before output validation and required QA succeed.

14D — Asset integrity and artifact hygiene

Use stable asset identities and content hashes. Detect changed or missing sources. Preserve path safety and renderer capability checks.

Separate temporary files, intermediate renders and accepted final outputs. Ensure failure or cancellation cannot silently overwrite an accepted output. Define safe cleanup behavior and test it.

Each accepted final output must have a machine-readable manifest containing:

input asset IDs and hashes;

source-analysis ID/version;

editing-plan ID/version;

project ID/revision;

executed operation IDs and relevant revisions;

output hash/path;

codec, stream metadata, dimensions, frame rate and duration;

relevant audio measurements;

QA result, unresolved findings and correction history.

14E — Failure, restart and recovery matrix

Test all of the following, recording expected and actual behavior:

Missing source before analysis.

Source modified after analysis.

Invalid plan rejected before mutation.

Stale project revision.

Failure after some operations have committed.

Renderer failure with partial artifact cleanup.

Process interruption during rendering.

Process interruption between render and QA.

Resume after a process restart.

Cancellation during a long-running job.

Duplicate request/retry.

Successful recovery followed by a new valid operation.

For each case, inspect project state, revisions, operation history, final/temporary output files and recovery behavior. Demonstrate that retries do not silently duplicate mutations or overwrite accepted output. Preserve machine-readable evidence and logs.

14F — Three realistic acceptance workflows

Use media the project is permitted to process. Preserve the input manifest, source analysis, plan, execution trace, output, QA report and final manifest.

A. A 15–30 second vertical reference-driven edit combining footage, typography and audio. Include a deliberate review change and verify that it is applied.

B. A 30–60 second multi-clip narrative assembly with source-timestamp provenance, clip-selection rationale and audio decisions. Exercise missing or changed asset handling.

C. A multi-turn revision task modifying multiple aspects of an existing project while preserving unrelated content. Introduce a recoverable failure or interruption and demonstrate correct resume and final-output acceptance.

Run each workflow through the same job orchestration lifecycle. Record actual render durations rather than inventing performance targets.

14G — Metrics and repeatability

Record counts and results for:

valid/invalid job transitions;

successful, failed, cancelled and resumed tasks;

duplicate requests and duplicate mutations;

source-integrity checks and detections;

operation and rendering outcomes;

failed-output cleanup;

QA findings, corrections, attempt counts and regressions;

approval requests and manual interventions;

performance runs, raw durations, median and range;

output manifest completeness.

Correct the historical naming inconsistency. Use separate, explicitly named fields:
render_duration_ratio = render_time_sec / output_duration_sec
and
playback_speed_factor = output_duration_sec / render_time_sec.

If using a different definition, document it explicitly and convert prior results before comparing them.

For pixel repeatability, retain exact frame indices/timestamps and decoded-array metrics. Separate identical-render comparisons from intentional-edit differences and preserve the difference mask where relevant.

14H — Regression and compatibility

Preserve the full existing test suite and rerun Phase 12/13 scenarios. Add real tests for lifecycle state persistence, restart/resume, cancellation, idempotency, changed assets, failure cleanup and revision integrity.

Run the full test suite after implementation. Save command output, environment details and machine-readable results. Do not treat passing unit tests alone as proof that end-to-end acceptance passed.

Required deliverables

Create:

docs/PHASE_14_BASELINE.md

docs/PHASE_14_REPORT.md

docs/phase-14-architecture.md

docs/phase-14-job-lifecycle.md

docs/phase-14-recovery-matrix.md

docs/phase-14-acceptance-methodology.md

docs/phase-14-results.md

docs/phase-14-failure-taxonomy.md

A versioned job/workflow record schema or equivalent documented contract.

Three end-to-end acceptance packages, operation traces, manifests and QA evidence.

Automated tests and raw logs.

Machine-readable metrics/artifacts under artifacts/phase-14/.

Adapt filenames if repository conventions require it, but preserve the specified deliverables and evidence.

Definition of done

Pass only when a job can move through the complete pipeline with durable state, safe resume/cancellation, source integrity checks, traceable operations, validated final outputs, reproducible manifests and demonstrated recovery. All three acceptance workflows must complete, existing regressions must pass, and inherited reliability gaps must be explicitly closed or retained as documented open items.

Provide a requirement-by-requirement evidence matrix and report PASS, PARTIAL PASS, FAIL or BLOCKED. Clearly distinguish claims in logs from facts reproduced by tests. Do not publish a release or begin Phase 15.