EME × Earshot — Phase 31 Architecture Lead Directive

Phase 31 will focus on proving EME's real-world editing accuracy across diverse projects and defect classes, building on the reliability and recovery controls established in Phase 30.

One important boundary: Phase 30 already includes a real-project recovery benchmark. Phase 31 expands the scope from whether EME recovers safely to whether EME identifies, diagnoses, and proposes correct repairs across diverse editing projects. These are separate acceptance objectives.

The directive below authorizes planning and corpus preparation. Full benchmark execution is conditional on verifying that Phase 30 has passed its mandatory certification gates.

Writing
EME × Earshot
Phase 31 — Real-Project Validation & Diverse Defect Benchmark

Document Type: Formal Architecture Lead Specification and Execution Directive
Phase: 31
Status: DIRECTIVE ISSUED — BENCHMARK EXECUTION SUBJECT TO ENTRY GATE
Predecessor: Phase 30 — Production Reliability, Crash Recovery & Fault-Injection Certification
Scope: Real-project validation, repair accuracy, defect coverage, audio/render verification, and benchmark reproducibility
Execution Mode: Non-destructive and shadow evaluation
Validation Strategy: Representative editing-project corpus + diverse defect taxonomy + independent ground truth
Release Policy: Strict — every canonical safety-invariant failure blocks certification
Future Scope: Stops at Phase 31. Phase 32 and Phase 33 are explicitly out of scope.

1. Architecture Lead decision

Phase 31 is approved as the next planned EME × Earshot benchmark milestone.

The mission is to establish whether EME's existing editing, validation, confidence, repair-proposal, and audio-verification mechanisms behave correctly across a representative range of real editing projects.

The following scope is locked for this directive:

Establish a versioned corpus of representative editing projects.

Define a reproducible defect taxonomy with explicit ground-truth records.

Evaluate detection, diagnosis, repair proposals, confidence-based routing, and abstention.

Validate candidate outputs using actual offline renders and applicable Earshot QA checks.

Preserve non-destructive shadow evaluation throughout the benchmark.

Produce a reproducible evidence bundle suitable for independent Architecture Lead review.

Enforce all inherited canonical architecture invariants without exception.

Stop at Phase 31 and present the certification decision. Do not automatically initiate another roadmap phase.

Phase 31 is a validation and evidence milestone. It does not authorize production rollout, uncontrolled autonomous repair, or changes to canonical mutation authority.

1.1 Relationship to Phase 30

Phase 30 tests production reliability: crash recovery, state integrity, concurrency, durable idempotency, artifact integrity, compensation, and recovery behavior.

Phase 31 tests editing quality and generalization across a diverse corpus: whether the engine correctly identifies defects, distinguishes clean content from defective content, proposes technically valid repairs, and produces outputs that satisfy the applicable QA expectations.

Phase 31 may reuse Phase 30's verified test harnesses and recovery protections, but it must not substitute Phase 30 fault-injection results for Phase 31 benchmark results.

1.2 Entry gate

Before benchmark execution, verify:

Phase 30 has received formal certification.

The actual certified Phase 30 source commit, tag if created, and release provenance are recorded.

The applicable predecessor regression suite passes on the verified source.

Non-destructive execution, isolated render destinations, and evidence preservation have been tested.

The benchmark can execute without modifying original user projects or promoting active deliveries.

If Phase 30 is not certified, planning, corpus inventory, licensing checks, taxonomy design, and protocol preparation may proceed. Execution of the full benchmark remains blocked until the entry gate is satisfied.

A previously reported test result or a completed directive is not itself proof that a phase has passed certification.

2. Mission and success definition
2.1 Mission

Evaluate EME on representative real editing projects with known or independently reviewed defects, measuring whether it can:

Detect existing defects accurately.

Distinguish defects from valid editing choices.

Localize the affected timeline region or project element.

Explain the evidence supporting a defect diagnosis.

Propose an appropriate repair or explicitly abstain.

Respect confidence thresholds and human-approval requirements.

Preserve timing, synchronization, project structure, and unrelated content.

Produce audio renders that satisfy the applicable technical QA requirements.

Maintain the original project and existing active delivery throughout the evaluation.

The benchmark must evaluate actual engine behavior. A mocked response, manually supplied expected answer, or synthetic-only fixture cannot stand in for a completed real-project evaluation.

2.2 Success definition

Phase 31 is eligible for certification only when:

The corpus is representative, versioned, permissioned, and reproducible.

Ground truth is established before final benchmark scoring.

Each mandatory defect class has the required coverage and valid evidence.

Clean controls and defective examples are both evaluated.

Detection, diagnosis, proposal quality, confidence routing, and abstention are evaluated separately.

Representative candidate repairs are rendered through the actual approved rendering path.

Earshot QA is run on the actual resulting audio artifacts wherever audio is within scope.

Candidate projects and artifacts are compared against the expected outcomes.

All safety and architecture invariants pass.

The complete regression baseline and release provenance reconcile.

A final certification dossier presents results, limitations, failures, and remaining unsupported cases.

The final report must distinguish between successful detection, a correct diagnosis, a valid proposal, and a verified repair. These are different outcomes and must never be collapsed into one pass count.

3. Canonical architecture invariants

The following invariants are mandatory across every Phase 31 stage and every benchmark fixture.

3.1 Canonical timing

The canonical timebase remains exactly 120,000 ticks per second.

Use integer timing arithmetic.

Use half-open intervals: [startTick, startTick + durationTick).

Preserve frame, clip, transition, marker, and audio-event timing using the established canonical semantics.

Convert between samples, frames, and ticks only through the approved conversion paths.

Use the established sample-level tolerance of 48 samples at 48 kHz, equivalent to 1 ms, wherever the applicable certified alignment requirement governs the measurement. Do not generalize this tolerance to unrelated measurements without an approved specification.

3.2 Frozen canonical schemas

The existing 18 schema/*.v1.schema.json canonical schemas remain frozen.

Do not change canonical schema content to accommodate a benchmark finding.

Store benchmark labels, annotations, provenance, and defect ground truth in separate benchmark metadata or approved sidecars.

Any proposed canonical schema change requires a separate architecture-change approval, migration plan, and compatibility verification.

3.3 Mutation authority

OperationExecutor remains the sole canonical project mutation authority.

Benchmark analysis, defect localization, proposal generation, scoring, and diagnostic tooling must not introduce alternate canonical project mutation paths.

Undo and Redo remain engine-owned.

Shadow evaluation must not commit proposed edits to the original project.

3.4 Active-delivery safety

session.active_delivery must remain unchanged throughout benchmark evaluation.

A candidate render is not an active delivery.

A candidate can only satisfy delivery verification requirements after the established render, fresh QA, manifest, and checksum-integrity checks succeed.

Phase 31 must not promote candidate artifacts into production or silently replace an existing verified delivery.

3.5 Canonical job states

The canonical job-state set remains exactly:

ACCEPTED, PLANNING, AWAITING_APPROVAL, READY_TO_EXECUTE, EXECUTING, VERIFYING, RENDERING, PUBLISHING, SUCCEEDED, FAILED, CANCELLED, NEEDS_RECONCILIATION.

Do not add canonical states such as BENCHMARKING, SCORING, SHADOW_REPAIR, or BENCHMARK_FAILED. Benchmark progress and experiment status must be held in the benchmark run records or approved internal diagnostics.

3.6 Existing lifecycle and recovery invariants

Preserve all applicable predecessor rules, including:

Atomic plans discard uncommitted candidate state on failure.

Non-atomic plans preserve previously committed work and journal it.

A committed mutation must never be misreported as rolled back.

Terminal job states remain immutable against late callbacks.

Genuine ambiguity routes to NEEDS_RECONCILIATION.

Deterministic operation failures route to FAILED.

User cancellation routes to CANCELLED.

A missing or corrupt artifact discovered after a previously successful operation does not erase historical success; emit INTEGRITY_DRIFT_ALERT.

Durable fencing tokens are monotonic and checked at authoritative commit boundaries.

Lock ordering remains session lock before job lock, with reverse release order.

Process-local caches are not treated as durable idempotency.

Uncertain ownership or liveness fails closed.

Decision-ledger provenance and exact human-approval binding remain intact.

3.7 Other inherited restrictions

VTSM masks remain in .vtsm.json sidecars rather than canonical schemas.

Laya remains advisory-only under CANARY_ADVISORY_MODE=true.

Confidence scores remain gating-only and cannot override hard validation.

Human approvals remain bound to the exact request, proposal, candidate revision, and evidence.

No external runtime npm dependencies may be added without separate approval.

Benchmark fixtures must not expose confidential user material unnecessarily.

No release tag may be rewritten to conceal provenance inconsistencies.

If benchmark instrumentation violates any canonical safety invariant, the stage fails even if all benchmark scores are otherwise acceptable.

4. Stage-by-stage engineering plan

Phase 31 consists of six sequential stages, each with independent acceptance criteria.

Stage 31.1 — Corpus Definition, Ground Truth, and Benchmark Protocol
Objective

Establish a permissioned, reproducible, representative editing-project corpus and freeze the benchmark protocol before running scored evaluations.

Required work
A. Repository and engine reconnaissance

Inspect the verified Phase 30 release and current EME implementation.

Identify supported project formats, timeline features, render paths, audio analysis components, and applicable Earshot QA interfaces.

Identify the defect classes the existing engine claims or is intended to support.

Record unsupported or only partially supported capabilities rather than assuming they work.

Map each planned benchmark assertion to an actual engine component and a reproducible verification method.

B. Corpus specification

Create a machine-readable project inventory with:

Unique project ID.

Project version and provenance.

Project format and relevant editor or engine version.

Permission and licensing status.

Timeline duration and complexity.

Track inventory.

Relevant clip, transition, marker, and audio characteristics.

Available source-media inventory.

Sidecar and mask metadata inventory.

Known defects and ground-truth references, where applicable.

Baseline render and QA availability.

Privacy and redaction requirements.

Known unsupported features or validation limitations.

C. Ground-truth protocol

Ground truth must be established independently from the final EME output.

For each case:

Record the expected defect class, location, severity, and affected properties.

Record the expected diagnostic evidence.

Specify the acceptable repair behavior or why the correct decision is to abstain.

Identify unacceptable collateral changes.

Record tolerances and acceptance rules before scoring.

Have qualified reviewers resolve disagreements or label the case as ambiguous.

A model-generated answer must never be used as its own independent ground truth.

D. Benchmark freeze

Version and hash the corpus manifest, scoring rules, defect taxonomy, and expected outcomes before the scored run begins.

Deliverables

Corpus inventory.

Corpus selection rationale.

Licensing and privacy review.

Defect taxonomy.

Ground-truth protocol.

Benchmark scoring specification.

Support and limitation matrix.

Architecture invariant traceability matrix.

Frozen benchmark manifest.

Acceptance criteria

Every included project has documented provenance and permission.

Every scored case has a stable identifier and reproducible input.

Ground truth is independent and sufficiently specific to support objective scoring.

Clean controls and defective cases are both represented.

Scoring criteria are frozen before benchmark results are inspected.

Each planned evaluation maps to an existing engine capability or an explicitly documented research question.

Phase 30 entry-gate evidence has been verified before benchmark execution is authorized.

Stage 31.1 is blocked if ground truth is circular, project inputs cannot be reproduced, or the benchmark's scoring rules can be changed after results become visible without a documented new benchmark version.

Stage 31.2 — Representative Project Corpus and Defect Taxonomy
Objective

Build the approved set of diverse real-project fixtures and ensure that the corpus covers relevant editing complexity, audio behavior, metadata, and defect classes.

Required work

Select distinct source projects rather than counting many copies of one project as independent diversity.

Preserve originals and compute input checksums.

Classify project complexity and feature coverage.

Separate naturally occurring defects from controlled defect injections.

Include valid clean controls and difficult negative cases.

Record any project-format conversion and verify that conversion did not silently remove relevant features.

Prepare isolated working copies for benchmark execution.

Ensure each mandatory defect class has adequate coverage for meaningful conclusions.

Controlled defect injection into a copy of a real project is allowed for exact ground truth, but those examples must be labeled as seeded defects in real-project fixtures, not naturally occurring defects.

Required corpus dimensions

The corpus must represent the following dimensions wherever the supported EME project population makes them applicable.

Timeline complexity

Short, simple timelines.

Medium-length timelines with multiple edits and transitions.

Long timelines with numerous clips or tracks.

Dense editing regions containing many adjacent events.

Projects with gaps, overlapping elements, or timing-sensitive sequences.

Track structure

Single-track and simple multitrack projects.

Multiple synchronized audio and video tracks.

Separated dialogue, music, ambience, and effects tracks where present.

Projects with track-level gain, clip-level gain, automation, or other supported audio properties.

Projects with linked or grouped content, if supported by the relevant implementation.

Synchronization and drift

Correctly synchronized clean controls.

Constant offset or drift defects.

Gradually accumulating drift where the format and ground truth permit it.

Localized sync discrepancies.

Misaligned edit points or transition boundaries.

Uncertain or ambiguous synchronization cases that should trigger review rather than speculative repair.

Audio behavior

Normal-level clean audio.

Excessive peaks or clipping.

Unwanted discontinuities, clicks, or abrupt edits.

Inappropriate gain or level changes.

Silence or unintended gaps where the expected content is known.

Distortion, discontinuities, or other supported measurable defects.

Cases where apparently unusual levels are intentional and must not be “corrected” automatically.

Transitions and continuity

Clean cuts and expected transitions.

Overlaps, fades, and crossfades.

Missing or malformed supported transition data.

Transition durations inconsistent with the approved expected result.

Unintended gaps, discontinuities, or abrupt changes.

Legitimate creative transitions that resemble defects but must be preserved.

Sidecar metadata

Projects without optional sidecars.

Projects with valid .vtsm.json masks.

Projects with known sidecar/project revision mismatches.

Missing, malformed, or contradictory sidecar metadata in isolated copies.

Cases where the sidecar is valid and must remain unchanged.

Only test sidecar defect classes that are applicable to the actual implementation and explicitly covered by ground truth.

Minimum corpus coverage policy

The exact corpus size must be justified by available source projects, feature diversity, and the number of independently scored defect cases. Do not inflate the count with trivially duplicated projects.

The frozen Stage 31.1 benchmark protocol must specify:

The minimum number of distinct source projects.

The minimum number of independent cases per mandatory defect class.

The clean-control count.

The complexity distribution.

The number of independently reviewed ground-truth cases.

The rules for excluding unusable fixtures.

The procedure for expanding the corpus when an important capability lacks adequate coverage.

Do not reduce these requirements after seeing disappointing results. Any change must create a new benchmark version and preserve the original results.

Deliverables

Versioned project corpus.

Project complexity matrix.

Defect coverage matrix.

Clean-control inventory.

Naturally occurring versus seeded-defect classification.

Exclusion register.

Input checksum inventory.

Acceptance criteria

Each mandatory defect class has documented coverage.

Every case has a known expected outcome or is explicitly classified as ambiguous.

The corpus includes real editing projects with meaningful diversity.

Source projects remain unchanged.

Any conversion, missing media, or unsupported feature is documented.

Corpus and fixture versions reconcile with the frozen manifest.

Stage 31.3 — Non-Destructive Shadow Evaluation
Objective

Run EME's actual detection, diagnosis, confidence, routing, and repair-proposal pipeline against the approved corpus without committing proposed changes to the original projects.

Required execution flow

For each benchmark case:

Load the frozen project fixture in an isolated workspace.

Validate its project structure and canonical timing.

Capture the initial project revision and checksum inventory.

Run the normal EME inspection and detection pipeline.

Record detected defects, affected regions, and supporting evidence.

Record the proposed diagnosis, confidence score, recommended action, and abstention or escalation decision.

Compare the observed decision with the frozen ground truth.

If testing candidate repairs, construct them only in the approved isolated candidate workspace.

Preserve the original project revision, media, sidecars, and active-delivery identity.

Record the actual results, including no-detection, false-positive, incorrect-localization, abstention, and error cases.

Shadow-mode boundaries

No proposal may mutate the original canonical project.

No candidate may bypass OperationExecutor.

If the test requires exercising a canonical mutation, do so only through the approved execution path in an isolated disposable project.

No candidate delivery may replace session.active_delivery.

No benchmark may publish or transmit production content.

External services, if required by the approved workflow, must be explicitly configured and isolated. Do not silently change engine behavior to obtain a preferred result.

Required evaluation metrics

Calculate and report, where applicable:

Defect detection precision and recall.

False-positive rate on clean controls.

Missed-defect rate.

Localization accuracy.

Diagnosis accuracy by defect class.

Correct-repair-proposal rate.

Collateral-change incidence.

Correct abstention rate on ambiguous or unsupported cases.

Incorrect automatic-eligibility rate.

Human-escalation accuracy.

Confidence calibration measures, with sufficient sample size and clear limitations.

Performance and runtime measurements where they can be collected reproducibly.

Do not merge fundamentally different outcomes into a single score. Provide class-level results and denominators, and include uncertainty where the sample size limits interpretation.

Deliverables

Per-case shadow-evaluation records.

Detection and localization metrics.

Diagnosis and repair-proposal metrics.

Confidence and escalation report.

False-positive and false-negative review.

Abstention report.

Original-state preservation checks.

Acceptance criteria

All mandatory scored cases have actual engine outputs or a documented inconclusive outcome.

The engine's output is compared against independently established ground truth.

Clean controls are evaluated for false positives.

Confidence thresholds and safety gates are respected.

Unsupported or uncertain cases are not silently counted as successful repairs.

No original project or active delivery is modified.

All results reconcile with the frozen benchmark version.

Stage 31.4 — Candidate Repair, Render, and Earshot QA Validation
Objective

Determine whether selected repair proposals yield technically valid project candidates and whether their actual rendered outputs satisfy applicable audio and structural QA expectations.

A correct diagnosis is not sufficient. The repair must preserve unrelated content and produce a valid output.

Required work
A. Candidate generation

Select repair proposals according to the frozen benchmark protocol.

Generate a candidate in an isolated workspace.

Record the source revision and exact proposed operations.

Preserve a machine-readable change inventory.

Apply changes only through the approved execution path when canonical mutation is necessary.

Reject any candidate that fails hard validation, regardless of confidence.

B. Structural and temporal verification

Verify, where applicable:

Canonical schema validity.

Integer tick arithmetic and half-open intervals.

Expected clip, event, and transition positions.

Track and clip identity preservation.

Absence of unintended gaps and overlaps.

Required sidecar integrity.

Preservation of unrelated project properties.

Undo/Redo behavior where applicable to the candidate workflow.

Exact difference between expected and observed mutations.

C. Actual offline rendering

For every required audio-relevant test case:

Render the candidate through the actual supported EME rendering path.

Preserve the unmodified baseline render for comparison.

Capture renderer identity, settings, source project identity, and render configuration.

Compute output artifact checksums.

Run fresh Earshot QA against the actual candidate artifact.

Compare measurements with the applicable certified thresholds and independent ground truth.

Record whether the defect was removed, retained, introduced, or changed into another defect.

Preserve render or QA failures as first-class results.

A mocked Earshot response or manually entered measurement does not satisfy the audio-render requirement.

D. Audio metrics

Collect applicable measures such as:

Sample-level or timeline-level synchronization error.

Transient alignment where the defect class requires it.

True peak.

Clipping count.

Loudness or level measurements where defined by the existing QA contract.

Discontinuity or click detection where supported.

Audio gaps and unexpected silence.

Differences between the reference and candidate output.

Relevant Earshot QA warnings and failures.

Use the established approved QA thresholds. Do not invent or loosen a threshold to make a candidate pass.

The existing transient-alignment criterion of no more than 48 samples at 48 kHz applies only where that certified requirement governs the test. The established −1.0 dBTP ceiling applies where the relevant audio delivery specification requires it. Other metrics must use their own documented, preapproved limits.

E. Active-delivery protection

Compare session.active_delivery before and after each case.

Do not activate a benchmark candidate.

Confirm that candidate promotion cannot occur through the benchmark path.

Preserve the prior verified delivery and its integrity evidence.

Deliverables

Candidate change records.

Baseline and candidate render inventory.

Earshot QA reports.

Audio and synchronization measurements.

Candidate-versus-reference comparisons.

Structural validation report.

Active-delivery preservation evidence.

Acceptance criteria

Every required render is produced through the actual supported render path.

Earshot QA examines actual candidate artifacts.

Mandatory technical thresholds pass.

A claimed repair does not merely hide or relocate the defect.

No unacceptable collateral changes are detected.

All relevant artifact checksums and manifests reconcile.

Original projects and verified active deliveries remain unchanged.

Any failed render, failed QA, or unresolved measurement remains a failure or inconclusive result rather than being omitted.

Stage 31.5 — Statistical Evaluation, Regression, and Failure Analysis
Objective

Determine how consistently EME performs across projects and defect classes, identify systematic failure patterns, and establish whether the observed results support the claims made about the engine.

Required work
A. Stratified analysis

Report results independently for:

Project complexity tier.

Project format or supported feature family.

Defect class.

Naturally occurring versus seeded defects.

Clean controls versus defective cases.

Automatic-eligible, human-review, and abstention decisions.

Audio-relevant versus non-audio cases.

Avoid allowing numerous easy examples from one project to conceal failures on harder projects.

B. False-positive and false-negative analysis

For each meaningful error:

Preserve the input and relevant output evidence.

Determine whether the cause was detection, localization, diagnosis, confidence routing, repair planning, execution, rendering, or QA.

Determine whether the defect reflects an implementation error, an inadequate specification, an unsupported feature, or ambiguous ground truth.

Record whether the proposed repair caused collateral changes.

Record any missed escalation or unjustified automatic eligibility.

Link remediation to the applicable test cases.

C. Regression testing

Run the complete applicable predecessor regression baseline.

Run all Phase 31-specific tests.

Test that benchmark instrumentation itself does not change EME decisions relative to the equivalent non-instrumented path, except for expressly approved isolated test hooks.

Preserve any failed results and rerun evidence separately.

Check canonical schemas, runtime dependencies, job states, mutation authority, and active-delivery behavior.

D. Statistical integrity

Freeze the scoring protocol before scored evaluation.

Report the numerator, denominator, and exclusions behind every metric.

Include class-specific outcomes rather than reporting only aggregate averages.

Use appropriate uncertainty estimates when sample sizes are limited.

Do not claim generalization to project types or defect classes not adequately represented.

Do not treat multiple variants of one source project as fully independent source projects.

Do not select only the best-performing cases for the final report.

Deliverables

Master benchmark results.

Per-class performance table.

False-positive and false-negative register.

Collateral-change report.

Confidence and escalation analysis.

Regression report.

Root-cause analysis.

Limitations and unsupported-capability register.

Remediation and retest matrix.

Acceptance criteria

Results are reproducible from the frozen corpus and protocol.

All mandatory classes have the required denominators.

No failures have been hidden by exclusions or aggregate scoring.

Every material defect in the implementation has been fixed and retested or remains an explicit certification blocker.

Safety invariants remain intact throughout testing.

Conclusions are limited to the evidence that the corpus supports.

Stage 31.6 — Evidence Reconciliation and Final Certification
Objective

Produce a source-bound benchmark dossier and obtain a formal Architecture Lead go/no-go decision.

Required work

Reconcile the source commit and branch with the tested benchmark implementation.

Verify the corpus manifest and all input checksums.

Reconcile all expected and observed results.

Reconcile raw test outputs with reported pass/fail totals.

Verify the baseline and candidate render checksums.

Verify Earshot QA report provenance.

Confirm active-delivery preservation.

Verify canonical schema and runtime dependency inventories.

Produce the final release or benchmark artifact manifest.

Preserve unresolved cases, unsupported capabilities, and failed runs.

Obtain the Architecture Lead's formal certification decision.

Acceptance criteria

Every mandatory stage has a recorded pass status.

The benchmark corpus, ground truth, raw outputs, and reports are versioned and traceable.

All applicable real audio renders and Earshot QA evidence are present.

The complete regression baseline passes.

No mandatory safety case is failed or inconclusive.

Package or benchmark bundle checksums and provenance reconcile.

Phase 31 limitations are explicitly documented.

No Phase 32 or Phase 33 work is started or implicitly authorized.

Completion of Stage 31.6 permits a certification request. It does not, by itself, grant certification.

5. Defect taxonomy and ground-truth rules

The following is the required defect taxonomy for planning. Stage 31.1 must map each class to actual supported engine capabilities and define exact expected outcomes before scoring.

Family	Defect classes	Required expected-outcome evidence
Timeline structure	Gaps, unintended overlaps, invalid durations, boundary inconsistencies	Exact affected intervals, expected structural relationships
Synchronization	Constant offsets, drift, local desynchronization	Reference timing, measured offset, allowed tolerance
Audio level	Excessive peaks, clipping, inappropriate gain	Baseline measurements, approved limits, candidate measurements
Audio continuity	Clicks, discontinuities, unexpected gaps or silence	Reference region, measurement method, expected repair behavior
Transitions	Invalid or missing supported transition metadata, incorrect durations, discontinuities	Transition boundaries, type, duration, expected continuity
Sidecar metadata	Missing, malformed, stale, or inconsistent .vtsm.json data	Original metadata, expected relationship to project revision
Structural consistency	Broken references or inconsistent supported project relationships	Expected references, structural validator output
False-positive controls	Valid creative choices that resemble defects	Explicit expected no-repair or abstention outcome
Ambiguous cases	Conflicting evidence or insufficient information	Expected human review or reconciliation decision
Unsupported cases	Features outside the verified capability envelope	Expected safe abstention or documented unsupported status
5.1 Defect record schema

Each defect instance must have a stable identifier and, at minimum:

case_id

project_id

project_version

defect_id

defect_family

defect_class

origin_type — naturally occurring, seeded in a real-project copy, or clean control

severity

affected_track_ids

affected_clip_ids

expected_interval

expected_observation

ground_truth_evidence_refs

expected_action — diagnose, repair proposal, abstain, or escalate

expected_repair_properties

permitted_tolerance

prohibited_collateral_changes

review_status

protocol_version

The above is a proposed benchmark metadata contract. It must not be inserted into the frozen canonical project schemas.

5.2 Independent ground truth

Where deterministic project metadata establishes ground truth, preserve the metadata and record how it maps to the visible or rendered defect.

Where the expected result requires expert judgment, record the reviewer decision and the supporting evidence.

For ambiguous cases, preserve the ambiguity. Do not force an artificial correct answer just to produce a binary score.

For seeded defects:

Preserve the original project.

Record the exact change to the isolated copy.

Hash both original and modified inputs.

Record the injection procedure.

Verify that unrelated project properties did not change as a side effect.

6. Execution modes and validation methodology

Phase 31 requires a fixed execution protocol. Every case must declare which mode it uses.

Mode A — Frozen baseline capture

Purpose: establish the reference behavior before applying any proposed repair.

Required actions:

Hash and inventory project files and relevant source media.

Record the project revision and schema validation result.

Capture timeline structure, track relationships, and relevant metadata.

Generate the baseline render when applicable.

Run baseline Earshot QA on actual audio output when required.

Preserve the active-delivery identity.

Record pre-existing warnings and defects.

A defective input must not be mislabeled as a valid baseline merely because the initial renderer succeeds.

Mode B — Shadow diagnosis

Purpose: evaluate detection and diagnosis without committing a mutation.

Required actions:

Run the actual supported EME inspection pipeline.

Record all findings, locations, supporting evidence, and confidence values.

Record routing and approval requirements.

Compare the output with frozen ground truth.

Preserve no-detection and false-positive cases.

No proposed mutation may be applied to the source project.

Mode C — Isolated candidate repair

Purpose: evaluate whether a proposed repair can produce the expected result.

Required actions:

Create a disposable candidate copy.

Apply changes through the approved execution path.

Record every intended mutation.

Validate project structure and canonical timing.

Reject candidates failing hard validation.

Preserve the previous verified active delivery.

Mode D — Offline render and Earshot QA

Purpose: measure the actual repaired output.

Required actions:

Render the candidate using the real supported rendering path.

Save the output artifact and checksum.

Run fresh Earshot QA.

Compare baseline and candidate measurements.

Verify that the defect was corrected without unacceptable collateral damage.

Record QA failures and renderer failures.

Mode E — Ground-truth comparison

Purpose: score the actual engine outcome.

For each case, compare:

Detected defect versus expected defect.

Observed location versus expected location.

Diagnosis versus ground truth.

Proposed action versus expected action.

Actual candidate changes versus expected changes.

Actual render and QA versus expected render and QA properties.

Original project and active delivery before versus after evaluation.

An evaluation is not passing just because the final render looks or sounds acceptable. The output must also satisfy structural requirements and preserve unrelated content.

7. Benchmark scoring and acceptance thresholds

All thresholds must be documented before scored execution.

7.1 Non-negotiable safety thresholds

These are absolute:

Zero unauthorized canonical mutations.

Zero active-delivery promotions by the benchmark.

Zero stale-worker authoritative commits.

Zero canonical schema changes without separate approval.

Zero cases where confidence overrides hard validation.

Zero cases where a committed mutation is reported as rolled back.

Zero cases where genuine ambiguity is guessed rather than reconciled.

Zero silent loss of benchmark evidence.

Zero unverified candidate deliveries promoted as active.

Any observed violation blocks certification until the defect is remediated and its full regression implications are assessed. A fix does not erase the original failure evidence.

7.2 Quality metrics

Detection quality, localization, diagnosis, repair proposal accuracy, abstention, and QA outcomes must be reported independently.

Stage 31.1 must establish the quality thresholds for each mandatory defect class before results are revealed. Each threshold must include:

Metric definition.

Numerator and denominator.

Minimum sample size.

Expected baseline or reference value, if available.

Acceptable result and failure boundary.

Treatment of ambiguous and unsupported cases.

Reviewer and approval record.

Do not claim a universal quality threshold is scientifically justified without a corresponding benchmark protocol or approved acceptance rationale.

7.3 Threshold changes

A threshold cannot be lowered simply because EME failed the benchmark.

If evidence shows that a threshold is ill-defined or the ground truth is invalid, create a revised benchmark protocol with a new version identifier, preserve the original results, document the justification, and obtain review before running the revised protocol.

7.4 Inconclusive results

A required case is inconclusive if, for example:

The fault did not occur at the intended point.

Ground truth cannot be established.

Required media or evidence is unavailable.

The render or QA process was not actually executed.

The expected comparison cannot be computed reliably.

A mandatory inconclusive case prevents full certification until resolved or formally removed through an approved, evidence-based protocol revision. It must never silently count as a pass.

8. Evidence bundle and benchmark artifact specification

Each stage must produce a versioned evidence bundle. Stage 31.6 consolidates the evidence into the master certification dossier.

8.1 Proposed directory structure

Reuse existing repository conventions if equivalent directories already exist. This is a proposed layout, not a claim that these paths currently exist.

artifacts/
  phase-31/
    protocol/
      phase-31-protocol.md
      corpus-manifest.json
      defect-taxonomy.json
      scoring-rules.json
      invariant-test-map.json
      exclusions.json

    corpus/
      project-inventory.json
      licensing-and-privacy.md
      source-checksums.sha256
      fixture-provenance.json
      ground-truth/
        ground-truth-manifest.json

    stage-31.1/
      entry-gate.json
      protocol-review.md
      stage-report.md

    stage-31.2/
      project-complexity-matrix.json
      defect-coverage-matrix.json
      clean-control-inventory.json
      stage-report.md

    stage-31.3/
      shadow-run-manifest.json
      per-case-results.jsonl
      detection-metrics.json
      diagnosis-metrics.json
      escalation-metrics.json
      stage-report.md

    stage-31.4/
      candidate-change-inventory.json
      render-manifest.json
      earshot-qa-results.jsonl
      artifact-checksums.sha256
      baseline-comparisons.json
      stage-report.md

    stage-31.5/
      per-class-results.json
      false-positive-register.json
      false-negative-register.json
      collateral-change-report.md
      regression-results.txt
      limitations.md
      stage-report.md

    stage-31.6/
      complete-test-results.json
      corpus-reconciliation.json
      provenance-manifest.json
      evidence-inventory.sha256
      certification-dossier.md

Raw media and rendered outputs may be held in a separately controlled artifact store if size or privacy requires it. In that case, the evidence bundle must contain resolvable artifact references, checksums, access restrictions, and retention requirements.

8.2 Per-case result record

Each executed case must record, as applicable:

Protocol and corpus version.

Project, case, and defect identifiers.

Exact source commit.

Environment and relevant runtime versions.

Input and sidecar checksums.

Initial project revision.

Baseline defect classification.

Ground-truth reference.

Actual detected findings and locations.

Actual confidence and routing decisions.

Proposed or executed candidate changes.

Structural validation results.

Baseline and candidate render checksums.

Earshot QA result and raw measurement references.

Active-delivery identity before and after evaluation.

Expected versus observed result.

Final classification: pass, fail, or inconclusive.

Failure rationale and evidence references.

Retry or rerun linkage, where applicable.

8.3 Provenance and integrity

Preserve raw results alongside summaries.

Hash finalized evidence artifacts and inventory them.

Separate original evidence from subsequent rerun evidence.

Record actual test output rather than copying expected results into the report.

Do not embed a package's own hash in a way that creates an undefined self-referential checksum.

Ensure manifests describe the exact committed source and actual benchmark artifacts.

Keep confidential source media out of public release archives unless its distribution is explicitly authorized.

8.4 Reproducibility

A reviewer must be able to determine:

Which source commit was evaluated.

Which corpus version was used.

Which ground truth and thresholds applied.

Which tests actually ran.

Which artifacts were measured.

Which checksums belong to each input and output.

How each pass, fail, or inconclusive result was derived.

9. Strict certification and release policy
9.1 Mandatory gates

Phase 31 may be certified only if all the following gates pass:

Gate A — Entry and provenance

Phase 30 certification verified.

Source lineage and benchmark environment reconciled.

No unexplained changes to the baseline.

Gate B — Corpus integrity

Required corpus coverage satisfied.

Licensing and privacy conditions met.

Input checksums reconciled.

Ground truth independent and frozen.

Gate C — Shadow evaluation

Mandatory cases executed.

Class-level metrics generated.

False positives, missed defects, abstentions, and escalation errors reported.

Gate D — Candidate correctness

Required candidates tested in isolated workspaces.

Structural validation passes.

No unacceptable collateral changes.

Gate E — Render and audio QA

Mandatory real renders completed.

Earshot QA measurements trace to the actual artifacts.

Required audio, synchronization, and structural thresholds met.

Gate F — Canonical safety

Every canonical invariant passes.

No unauthorized mutations.

Original project and active delivery preserved.

Gate G — Regression and release evidence

Complete required regression suite passes.

No mandatory test is skipped or silently excluded.

Provenance and evidence manifests reconcile.

A single failed mandatory safety gate makes the result NO-GO, regardless of the aggregate benchmark score.

9.2 Blocking conditions

Certification is blocked by any of the following:

A canonical invariant violation.

A benchmark run that mutates an original project.

Unauthorized active-delivery promotion.

Missing or untraceable ground truth.

Altered scoring thresholds without a versioned protocol change.

Missing mandatory project or defect coverage.

Render or QA evidence that cannot be tied to actual output artifacts.

A required defect class with insufficient evidence to make the required acceptance decision.

Hidden false positives, omitted failures, or unsupported claims of generalization.

A failed mandatory regression test.

An unresolved runtime dependency or canonical schema change.

Inconsistent source, corpus, artifact, or evidence provenance.

9.3 Permitted exceptions

Only explicitly non-safety issues may be accepted as documented limitations, and only after Architecture Lead approval.

An exception requires:

Reproducible evidence.

An impact assessment.

A rationale for why the issue does not violate a mandatory acceptance criterion.

A tracked remediation or follow-up decision.

Explicit written approval.

No exception can waive a canonical safety invariant.

9.4 Final decision states

The Architecture Lead's decision must be one of:

CERTIFIED — all required gates pass; formal phase certification may be recorded.

BLOCKED — a mandatory requirement has failed or remains unresolved.

INCONCLUSIVE — the evidence is insufficient to determine compliance.

Certification is a separate decision from issuing this directive.

10. Required GSD workflow and actions

Mandatory instruction: use required GSD actions to achieve the goals and wherever needed.

Use the actual GSD workflow, phase structure, and supported actions available in the repository or authorized development environment. Discover the installed workflow before invoking actions. Do not invent GSD command names or claim an action succeeded without its real output.

10.1 Required execution sequence
Action 1 — Inspect repository and GSD state

Inspect the current repository, applicable GSD instructions, roadmap, prior phase records, architecture documentation, and verification conventions.

Confirm the actual Phase 30 status rather than inferring it from the existence of its directive.

Action 2 — Verify the entry gate

Record the certified Phase 30 release commit and tag if present, regression baseline results, and source provenance.

If Phase 30 is not certified, document the blocked benchmark-execution status while allowing non-destructive protocol and corpus preparation to continue.

Action 3 — Create the Phase 31 plan

Use the project's actual GSD planning workflow to create the Phase 31 plan and all six stages.

Record stage dependencies, entry gates, deliverables, verification actions, and acceptance criteria.

Action 4 — Establish traceability

Create traceability links across:

Canonical invariant.

Corpus project and defect class.

Test scenario.

Expected behavior.

Actual engine component.

Evidence artifact.

Stage acceptance criterion.

Action 5 — Execute stage by stage

Use supported GSD execution actions to complete each stage in sequence.

Do not mark a stage complete solely because code has been written, a benchmark script has been created, or a feature appears to work.

Action 6 — Verify and preserve evidence

Use the established GSD verification and testing workflows.

Capture actual commands or actions, exit statuses, test denominators, raw outputs, artifact checksums, and evidence paths.

Preserve failures and rerun results separately.

Action 7 — Run independent benchmark tracks

Complete the shadow diagnosis evaluation, candidate-repair validation, and real audio render/Earshot QA procedures.

Maintain explicit distinctions between naturally occurring defects and seeded defects in real-project copies.

Action 8 — Perform master regression and reconcile provenance

Run the required regression suite and validate the final benchmark manifests, source commit, corpus version, and artifact checksums.

Action 9 — Request certification

Prepare the complete certification dossier and submit a formal Architecture Lead decision request.

Do not use a phase-close action to represent certification until all required evidence and gates have passed.

10.2 GSD status rules

Mark a stage PASS only when its acceptance criteria have been demonstrated.

Mark a stage BLOCKED when a mandatory requirement fails or awaits resolution.

Mark a stage INCONCLUSIVE when the evidence cannot establish the expected behavior.

Keep stage state, job state, and benchmark run state distinct.

Do not create new canonical job states to represent GSD progress.

Preserve actual failures, remediation records, and test outputs.

If the GSD framework lacks an action required by the plan, document the limitation and use the closest supported mechanism without falsely claiming the original action ran.

11. Stage-level Architecture Lead reports

At the end of every stage, submit a report containing:

A. Identity

Phase and stage.

Source branch and exact commit.

Corpus and protocol versions.

GSD status.

B. Scope

Work completed.

Files or components changed.

Architecture constraints reviewed.

Deviations from the directive.

C. Evidence

Actual test commands or GSD actions.

Passing, failing, skipped, and inconclusive counts.

Raw output references.

Corpus, render, and evidence checksums where applicable.

D. Quality results

Metrics and their denominators.

Per-defect-class findings.

False-positive and false-negative analysis.

Candidate repair outcome.

Render and Earshot QA results where applicable.

E. Safety

Original-project preservation.

Active-delivery preservation.

Mutation-authority verification.

Canonical schema and timing verification.

Any detected invariant violation.

F. Decision requested

PASS, BLOCKED, or INCONCLUSIVE.

Remaining blockers.

Explicit request to proceed to the next stage.

12. Final Phase 31 certification checklist

Every applicable mandatory item must be marked complete with evidence.

Phase 30 certification and source lineage verified.

GSD plan and six stages recorded.

Corpus inventory and permission review complete.

Corpus and ground truth frozen before scored execution.

Project diversity and defect coverage demonstrated.

Clean controls evaluated.

Naturally occurring and seeded defects reported separately.

Shadow diagnosis completed.

Detection, localization, diagnosis, confidence, and abstention evaluated independently.

Candidate repairs evaluated in isolated workspaces.

Real audio renders produced through the actual supported render path wherever required.

Earshot QA tied to actual artifacts.

Required audio and timing thresholds pass.

Original projects preserved.

Active delivery preserved.

All 18 canonical schemas remain unchanged.

Canonical timebase and half-open intervals preserved.

OperationExecutor remains the sole canonical project mutation authority.

Canonical job states remain unchanged.

Zero unauthorized canonical mutations.

Zero unresolved mandatory safety failures.

Complete regression baseline passes.

All mandatory defects have adequate evidence and accepted outcomes.

Corpus, render, manifest, and evidence checksums reconcile.

Unsupported cases and limitations are documented.

Master GSD records agree with actual test and stage outcomes.

Final Architecture Lead decision recorded.

Any unchecked mandatory item prevents certification.

13. Immediate next actions

Start with the following:

Verify Phase 30 status and provenance. Determine its actual certification state and capture the relevant source and regression evidence.

Inspect the installed GSD workflow and EME capabilities. Map supported project formats, render paths, Earshot QA interfaces, and relevant architecture components.

Produce Stage 31.1 deliverables. Define the project corpus, defect taxonomy, independent ground-truth methodology, and frozen scoring protocol.

Review the mandatory coverage matrix. Confirm that the proposed corpus adequately represents timeline complexity, synchronization, audio levels, transitions, sidecar metadata, and clean negative cases.

Obtain Stage 31.1 acceptance before scored execution. Do not begin formal benchmark scoring until the protocol and its acceptance criteria are frozen.

Do not refactor the whole engine, modify canonical schemas, add runtime dependencies, or introduce autonomous production behavior to make the benchmark easier to pass.

Final Architecture Lead directive

Phase 31 — Real-Project Validation & Diverse Defect Benchmark — is approved for planning and controlled corpus preparation. Full benchmark execution is conditional on verified Phase 30 certification and the Stage 31.1 protocol gate.

The objective is not to produce an impressive aggregate score. It is to produce trustworthy evidence about where EME works, where it fails, which defects it can repair safely, and where it must defer to human judgment.

The original project, canonical state, source provenance, and verified active delivery must remain protected throughout evaluation.

Phase 31 ends with a formal certification decision. No subsequent roadmap phase is authorized by this directive.

Immediate next step

Begin with the Phase 30 entry-gate verification and Stage 31.1 corpus protocol. The first useful engineering output should be the actual corpus-coverage matrix and the list of supported EME/Earshot test paths—not benchmark scores.

That gives us a defensible benchmark before any results can influence the scoring criteria.