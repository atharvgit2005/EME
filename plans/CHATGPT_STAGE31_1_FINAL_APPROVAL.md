EME × Earshot — Architecture Lead Decision

Decision: Protocol v1.3.0 resolves the previous arithmetic and complexity findings. Unconditional Stage 31.1 acceptance remains pending three targeted evidence clarifications. Full scored Stage 31.2 execution is not yet authorized.

The revised quota arithmetic is now correct: 11 defect classes, 26 defect cases, 6 clean-control runs, 2 ambiguous cases, 2 unsupported cases, and 36 total benchmark cases. The two projects reported to have more than four tracks also satisfy the numerical quota, assuming the source inventory verifies those counts.

The remaining issues concern whether the corpus entries and scoring rules substantiate the benchmark claims—not whether the arithmetic adds up.

Decision summary

Defect-case and benchmark totals

Accepted

Duration and track-count quotas

Consistent as reported

CORPUS-06 project provenance

Clarification required

CORPUS-04 clean-control validity

Clarification required

Metric behavior for undefined results

Clarification required

Stage 31.1 final acceptance

Pending

Stage 31.2 scored execution

Not authorized
Writing
EME × Earshot
Architecture Lead Ruling — Stage 31.1 Protocol v1.3.0

Phase: 31 — Real-Project Validation & Diverse Defect Benchmark
Stage Reviewed: 31.1 — Corpus Definition, Ground Truth, and Benchmark Protocol
Reported Branch: feature/phase-31-real-project-validation
Reported Commit: fba01a4
Protocol Revision: v1.3.0
Decision: PARTIAL ACCEPTANCE; THREE TARGETED CLARIFICATIONS REQUIRED

1. Findings accepted

The following items are accepted on the evidence submitted:

Historical protocol revisions v1.0.0, v1.1.0, and v1.2.0 are reported preserved.

The revised short-form and standard-commercial tiers agree with the listed durations.

Eleven scored defect classes require 26 independently counted defect instances.

Six clean-control runs, two ambiguous cases, and two unsupported cases are separately enumerated.

The total of 36 cases and 36 ground-truth decisions is mathematically consistent.

CORPUS-01 and CORPUS-05 are reported to have five tracks each, satisfying the requirement for at least two projects with strictly more than four tracks, subject to source verification.

The clean-control false-alarm formula is explicitly run-based, and its six-run resolution is disclosed.

The Stage 31.1 suite reports 9/9 PASS and the combined arithmetic is 338 + 9 = 347 tests.

These items are acknowledged as reported. The repository, corpus files, source media, and manifest digests have not been independently inspected or recalculated by this decision.

2. Finding A — CORPUS-06 project provenance

Status: OPEN.

The submitted inventory identifies CORPUS-06's source as:

assets/creator_reel_soundtrack_20s.wav

The same entry is described as a pristine 20-second, 60-fps, 9:16 master reference with two stereo master tracks.

A WAV file can provide audio samples, channel count, sample rate, and duration. By itself, it does not establish an editing project's timeline structure, video frame rate, aspect ratio, or timeline-track inventory.

This does not prove that a corresponding editing project is absent. It means the reported source path does not, on its own, substantiate those project-level attributes.

Required correction

Provide one of the following:

Option 1 — Supply the actual project fixture.

Identify the project or timeline file that references the WAV, including its stable project ID, exact path, project format, duration, frame rate, aspect ratio, track inventory, checksum, and relationship to the audio asset.

Option 2 — Reclassify CORPUS-06 as an audio reference asset.

If there is no editing-project wrapper, do not count the WAV itself toward the six distinct editing-project requirement. Supply a replacement permissioned editing project that provides the required project-level metadata, or revise the corpus minimum through an explicit protocol change before scoring.

Do not infer project complexity from an audio asset's channel count.

3. Finding B — CORPUS-04 clean-control validity

Status: OPEN.

CORPUS-04 is described as a creator reel with audio defects, with its source identified as:

fixtures/qa-audio-defects-manifest.json

The protocol also includes RUN-CLEAN-04 as a clean-control run on CORPUS-04.

These descriptions may be consistent if the benchmark preserves an independently verified clean baseline and applies the defects only to separate candidate copies. The addendum does not explicitly establish that separation.

Required correction

Identify the exact immutable input used for RUN-CLEAN-04 and establish:

Its source project or fixture identity and checksum.

Whether the original is genuinely clean or contains the stated audio defects.

Whether any defect injection or repair occurred before the clean-control run.

How the clean state is independently established without relying on EME's prediction.

How the defective evaluation case is kept separate from the clean-control run.

If the existing source is defective, RUN-CLEAN-04 cannot count as a clean control unless a separately identified, independently validated clean baseline exists.

Preserve the six-run denominator only if all six executions actually qualify as clean-control runs under the frozen protocol.

4. Finding C — Undefined metric outcomes

Status: OPEN.

The protocol establishes the clean-control false-alarm formula and a strict zero-false-alarm requirement at six runs. However, the submitted addendum does not specify the final disposition of all potentially undefined classification metrics.

For example, precision is:

Precision = TP / (TP + FP)

If a detector makes no positive predictions, the denominator is zero. The metric is undefined, not automatically zero or one.

Required correction

Freeze an explicit rule for at least:

Precision when there are no predicted positives.

Recall when there are no ground-truth positive instances in an eligible scoring set.

Localization IoU when no valid predicted region exists.

Class-level macro-averaging when a metric is undefined for one or more required classes.

Micro-averaging when the global denominator is zero.

Cases rendered unscorable due to invalid inputs or missing reference evidence.

For mandatory defect classes, an undefined required metric must not silently count as a pass. Use the previously approved scoring policy or define a conservative explicit disposition such as INCONCLUSIVE, requiring resolution before certification.

Keep the original numerical thresholds unchanged unless a separately reviewed, versioned protocol revision is approved before scored evaluation.

5. Protocol integrity and versioning

Protocol v1.3.0 and its manifest must remain part of the historical record.

If these clarifications reveal missing or incorrect protocol fields:

Create a new versioned protocol revision.

Preserve v1.0.0 through v1.3.0 byte-exact.

Document the corrections and their rationale.

Update affected inventory and scoring files.

Regenerate the relevant SHA-256 digests and frozen manifest.

Rerun the affected protocol tests and required regression checks.

Reconcile actual source-project counts, clean-control eligibility, case counts, and reviewed ground-truth decisions.

No scored benchmark result may influence the revised acceptance thresholds or eligibility rules retroactively.

6. Stage 31.1 acceptance criteria

Unconditional acceptance may be granted when:

CORPUS-06 is substantiated as a real editing project or replaced/reclassified through an approved protocol change.

CORPUS-04's clean-control input is shown to be genuinely clean and isolated from defect-seeded evaluation.

The six clean-control runs are all valid under the frozen protocol.

Undefined metric outcomes and their effect on certification are explicitly specified.

The frozen protocol manifest matches the final protocol files.

Affected validation tests and required regression checks pass.

All required ground-truth decisions remain independently reviewed before scored execution.

7. Stage 31.2 authorization boundary

Full scored Stage 31.2 execution remains unauthorized.

The team may continue non-scored work, including project-source verification, permission checks, checksum collection, candidate fixture preparation, and clean-baseline validation in isolated workspaces.

Do not begin scored benchmark runs or inspect scored outcomes to alter the protocol before unconditional Stage 31.1 acceptance.

Final disposition: Protocol v1.3.0 resolves the prior arithmetic and stated complexity quotas. Stage 31.1 acceptance remains pending the three targeted clarifications above.

Next action

Submit a focused addendum with the actual CORPUS-06 project file or its approved replacement, the independently verified clean input for RUN-CLEAN-04, and the scoring rules for undefined metrics.

Those three points are the remaining gates. Once they are reconciled and the manifest and affected tests pass, Stage 31.1 can be accepted without reopening the already-resolved case-count and complexity work.