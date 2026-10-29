Phase 13 — Evidence-Grounded Editing & Closed-Loop Creative QA
Mission

Upgrade the existing Editing Mechanics Engine (EME) so it can analyze source media into explicit, timecoded evidence; create auditable editing plans from that evidence; compile plans into deterministic, validated operations; render through the existing adapter; inspect the result; and make bounded, evidence-linked corrections.

The objective is not simply to make three more videos. The objective is to make the editing pipeline more traceable, safer under failure, and capable of correcting identified defects.

Use required GSD actions to achieve the goals and wherever needed.

Phase 13A — Audit before implementation

Inspect the actual repository, current schemas, planning modules, operation registry, renderer capabilities, existing benchmark plans, reports, tests and artifacts before changing anything.

Produce docs/PHASE_13_BASELINE.md containing:

A requirements-to-implementation-to-evidence matrix.

The pre-change regression results and environment details.

Every outstanding Phase 11.1 reliability-closure item.

Every Phase 12 requirement that is implemented, partial, or missing.

A list of planned changes and affected files.

Do not infer filesystem state from previous chat reports. Inspect the repository and record observed facts. Do not rewrite working modules without evidence that changes are needed.

Phase 13B — Structured source analysis

Extend the existing source analyzer to generate structured, reproducible evidence for video, images, audio and applicable typography assets.

For each relevant asset, record file identity, resolved source path, available hash, tool/version, metadata extraction method and any errors.

For video, collect streams, dimensions, rational frame rate, duration, timebase, rotation/display geometry, audio-stream information and available color metadata. Generate representative frames/contact sheets with exact frame indices and timestamps. Implement scene-boundary candidates where supported and preserve the detection method and evidence.

For audio, record stream configuration, silence intervals, and accurately labeled peak, RMS and loudness measurements when available. Do not confuse volumedetect mean volume with true RMS. Run transcription, beat detection or semantic analysis only when an available tool actually provides that capability.

For fonts and image assets, record relevant metadata, dimensions, missing resources and font availability where detectable.

Create schema/eme-source-analysis.v1.schema.json and reusable source-analysis examples. Preserve the distinction between measured facts, model inferences, confidence, uncertainty and unavailable analysis. Never manufacture source facts.

Phase 13C — Evidence-linked editing plan

Review schema/eme-editing-plan.v1.schema.json. Make only the changes needed to support auditable source-to-plan decisions.

Represent the creative brief, output profile, scenes, clip/layer decisions, text, motion, transitions and audio intent. Each source-dependent decision must reference the relevant analysis evidence. Include dependencies, preconditions, asset requirements, renderer capabilities, assumptions, unresolved decisions and expected outcomes.

Keep source analysis, editing plan and canonical EME project as three separate representations.

Preserve model independence: Antigravity or another authorized agent may perform creative interpretation, but execution semantics must remain deterministic and model-agnostic.

Phase 13D — Deterministic plan compilation and safe execution

Harden src/planning/plan-compiler.js or its existing equivalent.

Equivalent valid inputs, project state and pinned tool/capability versions must yield the same normalized operation sequence.

Add actionable, stable error codes for invalid plans, missing assets, unsupported effects, impossible timing, conflicts, stale revisions and unmet preconditions.

Validate the full plan before its first mutation and prove that dry-run performs no mutation and creates no misleading successful render output.

Record plan identifiers, source-analysis identifiers, step identifiers, compiled operation identifiers, project revisions and render outputs.

Explicitly handle partial execution failure. Do not claim the complete plan is transactionally atomic when individual operations commit independently.

Test renderer failure, partial output cleanup, stale revisions and subsequent valid recovery.

Never silently substitute an unsupported visual effect.

Write regression tests for determinism, state integrity, rejection behavior and recovery.

Phase 13E — Bounded closed-loop QA

Implement a controlled pipeline:

Render the accepted plan.

Inspect output metadata and precisely indexed decoded frames.

Check clip boundaries, keyframes, text bounds, blank/frozen frames and visible transitions where measurable.

Analyze audio continuity, silence, peak and RMS behavior where supported.

Emit evidence-backed QA findings with severity, measured value, timestamp/region and affected operation or plan step.

Propose targeted corrections tied to specific findings.

Revalidate, rerender and verify whether each finding was resolved.

Permit a maximum of three automated correction attempts per render task. Stop on acceptance, exhaustion of the attempt budget, or a decision requiring human input. Record attempts, unresolved findings and regressions.

Separate technical validity, measurable perceptual/temporal checks and creative acceptance. Do not describe a generic score of 100/100 as proof of creative success.

Phase 13F — Three end-to-end scenarios

Run all three through source analysis, evidence-linked planning, dry-run validation, execution, rendering, QA and reporting:

A. Reference-driven kinetic typography. Preserve reference identity and show which properties the plan attempts to reproduce.

B. Footage-based narrative assembly. Show sampled frames, source timestamps, scene-boundary candidates, clip selections and relevant audio evidence.

C. Layered compositing. Demonstrate actual capabilities, dependencies and successful rendering; inject an unsupported effect and verify safe rejection.

At least one scenario must contain a deliberately introduced defect that the QA pipeline identifies and corrects through the bounded loop. Also execute a failure-recovery test involving state/output integrity and a successful later operation.

Preserve the source assets, analysis JSON, plan, operation trace, rendered output, QA report and test evidence for each scenario.

Phase 13G — Metrics and reproducibility

Report defined numerator/denominator metrics for source-analysis completeness, evidence linkage, plan acceptance, compilation determinism, render success, QA defect detection, false positives/negatives, correction effectiveness and remaining issues.

Record raw render timings, sample counts, median/range and correctly defined real-time factors. For repeatability, compare decoded pixel arrays at exact frame indices/timestamps. Keep identical-input render comparisons separate from controlled-edit comparisons.

Document the QA fixtures and expected classifications. Avoid choosing thresholds after seeing the results solely to obtain a pass.

Phase 13H — Compatibility and regression

Preserve every existing regression test. Run the complete suite before and after changes. Verify that earlier Phase 12 plans still work and that unsupported or malformed inputs fail predictably.

Include paths with spaces, absent assets, stale revisions and renderer failure. Save actual command output and machine-readable test results.

Resolve outstanding Phase 11.1 evidence gaps where practical. For every item not resolved, state that clearly; do not declare it closed merely because a larger test suite passes.

Required deliverables

At minimum, provide:

docs/PHASE_13_BASELINE.md

docs/PHASE_13_REPORT.md

docs/phase-13-architecture.md

docs/phase-13-benchmark-methodology.md

docs/phase-13-results.md

docs/phase-13-failure-taxonomy.md

schema/eme-source-analysis.v1.schema.json

Updated editing-plan schema/examples only when justified

Source-analysis fixtures, three evidence-linked plans, operation traces, QA findings and correction history

Reproducible artifacts and raw measurements under artifacts/phase-13/

Regression tests and the complete test-run log

Definition of done

Pass only when source analysis provides timecoded evidence; plans are auditable and separate from project state; compilation and preflight are deterministic; failure handling preserves state and output integrity; all three scenarios reach render and QA; a targeted correction is detected, applied and verified within the attempt limit; pixel/performance evidence is reproducible; and existing regressions pass.

Provide a requirement-by-requirement verdict with artifact paths and commands. Distinguish independently observed facts from claims that could not be reproduced. Report PASS, PARTIAL PASS, FAIL or BLOCKED honestly.

Do not train a custom model, introduce a competing canonical project model, rewrite the rendering engine, publish a release or begin Phase 14 in this phase.
