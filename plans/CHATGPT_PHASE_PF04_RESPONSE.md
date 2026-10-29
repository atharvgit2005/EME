EME Architecture Review — PF-04 Acceptance & Next-Milestone Authorization

My decision: PF-04 is provisionally accepted, pending a focused evidence audit. The report describes the right architecture: immutable render contracts, independent media inspection, bounded repair, and a hash-bound delivery manifest. It also addresses both PF-03 follow-ups.

I would not yet call PF-04 independently certified based only on this report. The reported 195/195 passing tests and 100/100 QA score are implementation-reported results, not evidence I have independently reproduced. A few important details still need to be closed before treating the renderer as production-grade.

1. PF-04 acceptance decision
Accepted with conditions

Milestone status: architectural acceptance, subject to targeted closure checks.

Accepted in principle

Versioned schemas, asset preflight, full-stream decoding, bounded repair, manifest hashing, CLI integration, and negative-test coverage.

Closure checks required

True-peak versus sample-peak semantics, real transition compositing, crash recovery at every interruption boundary, and deterministic output verification.

Next priority: PF-05

Move toward autonomous prompt-to-deliverable execution with independent semantic verification and safe failure recovery.

Four specific closure checks

1. Audio clipping: The report claims true peak is at most 0 dBFS, but cites astats. Confirm the implementation actually measures true peak using oversampling or an appropriate true-peak meter. Sample peak alone does not establish true-peak compliance. Also distinguish a hard ceiling from a recommended operating headroom target.

2. Cross-dissolve: Opacity animation alone is insufficient evidence of a real cross-dissolve. Verify both clips overlap in time, both are composited during the transition, the outgoing clip fades out while the incoming clip fades in, and the rendered frames show the blend. Check transition handles and timeline boundaries explicitly.

3. Crash recovery: The reported recovery to revision 1 is encouraging. Require process-kill tests at every transaction boundary, including after a write but before a journal commit, and after commit but before the final response. Recovery must be idempotent, and journal writes and project replacement must have documented flush/atomicity semantics.

4. Deterministic rendering: Repeat the same job from the same project snapshot and inputs. Compare output hashes. If timestamps, encoder behavior, or renderer internals make byte-identical output impossible, document that explicitly and verify decoded-frame/audio equivalence within defined tolerances. Never substitute a semantic comparison for the actual file hash in the delivery manifest.

These are targeted closure checks, not a request to redesign PF-04 or block the next workstream indefinitely.

2. Authorize Phase A2 — Musical Structure Intelligence

Authorization: proceed with A2 independently and in parallel with PF-05. A2 should improve the evidence available to the planner; it must not become a dependency that prevents PF-05 from delivering verified outputs using existing beat-analysis capabilities.

The A2 objective is to transform audio and beat-analysis evidence into a versioned, uncertainty-aware musical-structure artifact.

A2 implementation scope

A2.1 — Downbeat phase inference

Estimate which beats are downbeats, with confidence and ambiguity handling. Do not assume the first detected beat is beat one of a bar.

A2.2 — Meter estimation

Estimate supported meters, initially 3/4 and 4/4, while allowing unknown when the evidence is insufficient or ambiguous.

A2.3 — Bar indexing and phrase grouping

Derive bar boundaries and candidate phrase groups from the inferred meter and downbeat phase. Preserve uncertainty rather than forcing every event into a bar.

A2.4 — Section boundaries and semantic roles

Detect candidate structural changes, then assign conservative labels such as intro, verse, chorus, bridge, or outro only when supported by evidence. Include unknown.

A2 artifact and numerical acceptance gates

Use a versioned sidecar such as eme-musical-structure.v1; do not modify the existing project schema. Include source-audio hash, analysis configuration/version, beat-grid reference, meter hypothesis, downbeat phase, bar and phrase intervals, candidate section boundaries, confidence, uncertainty, and evidence provenance.

Gate

	

Acceptance requirement




Downbeat timing

	

Median absolute error ≤20 ms on eligible synthetic fixtures




Meter classification

	

≥95% accuracy on clear, labeled 3/4 and 4/4 fixtures




Bar assignment

	

≥99% correct on eligible synthetic fixtures




Phrase boundaries

	

F1 ≥0.90 with ±250 ms tolerance




Section boundaries

	

F1 ≥0.85 with ±1 s tolerance




Semantic section roles

	

Report per-class precision and recall on held-out labeled audio; do not claim a universal pass without a defined test set




Ambiguity

	

Uncertain meter, phase, or section role must remain uncertain rather than being silently guessed




Determinism

	

Identical audio hash, configuration, and implementation version produce identical canonical results




Regression

	

Existing audio-analysis and repository suites remain green

Important test-design constraint: synthetic fixtures establish algorithmic correctness under known conditions, but not general musical understanding. Include held-out real audio with human-labeled annotations before promoting section-role classification to a trusted planning signal.

A2 should emit evidence, not dictate edits. The planner can use confident bar and phrase boundaries as preferences, but a user's explicit cut time or duration remains authoritative unless the user explicitly permits changes.

3. Authorize Phase PF-05 — End-to-End Prompt-to-Verified-Deliverable Orchestration

Authorization: PF-05 may begin now. Its purpose is to connect PF-02, PF-03, and PF-04 into one reliable workflow—not to rebuild their existing components.

Recommended milestone title:

PF-05 — Autonomous Prompt-to-Deliverable Orchestration, Semantic Verification & Recovery

Required architecture

1. Natural-language request

Resolve intent, constraints, missing information, and permitted assumptions.

2. Plan compilation and preflight

PF-02 compiler + PF-03 scheduler; validate operation plan, assets, revisions, tracks, and constraints.

3. Deterministic execution

Existing OperationExecutor, transaction guarantees, revision checks, journal and recovery.

4. Render and independent QA

PF-04 renderer, full decode, media QA, repair budget, and hash-bound manifest.

5. Intent-to-output verification

Compare the original request and approved plan against timeline state, rendered evidence, and manifest.

6. Verified publication

Publish only when every mandatory gate passes; otherwise retain diagnostics and report failure or incomplete status.

The critical PF-05 distinction is that media validity is not the same as creative-intent correctness. A technically valid MP4 can still contain the wrong clip, omit the title, misplace a cut, or violate the requested duration. PF-05 must verify both.

PF-05 numerical acceptance gates

These are proposed certification requirements for the new orchestration layer, not claims about the current implementation.

Gate

	

Acceptance requirement




Constraint preservation

	

100% of explicit hard constraints either satisfied or cause a fail-closed result




Dry-run isolation

	

Zero persistent project mutations, render publication, or external side effects




Plan determinism

	

Identical project snapshot, request, configuration, and model/compiler versions yield the same canonical plan hash




Operation integrity

	

All operations execute through the existing executor; no direct mutation bypass




Revision safety

	

Stale revisions are rejected before mutation; no lost updates in concurrency tests




Output timing

	

Project timeline duration matches the plan exactly in integer ticks; encoded duration follows PF-04 frame-tolerance rules




Deliverable QA

	

All mandatory PF-04 gates pass after the final render, including after any repair




Intent verification

	

100% of explicit, machine-verifiable acceptance criteria pass; unsupported criteria are marked unverified, not passed




Repair budget

	

Maximum two automated render-repair attempts; no silent creative-constraint rewriting




Failure recovery

	

Injected failures leave either a recoverable, journaled state or a restored baseline; recovery is idempotent




Publication integrity

	

Published manifest SHA-256 matches the final output bytes; failed or incomplete jobs cannot be published as verified




Regression

	

Full repository suite passes, with new tests for every new orchestration boundary

Use a separate, versioned orchestration artifact if needed, such as eme-delivery-run.v1. Preserve the current project schema and all existing executor contracts.

4. First PF-05 certification scenario

Start with one deterministic, end-to-end scenario before adding more creative features.

PF-05 flagship test
Required first

Input prompt

Create a 12-second vertical video at 1080×1920 and 30 fps using the supplied project assets. Preserve the specified clip order. Add the supplied music track, place the two requested cuts on beats 8 and 16, insert the B-roll cutaway from 4–6 seconds, apply a true 1-second cross-dissolve at the specified transition, and display the supplied headline title from 1–4 seconds. Do not create new media or change the specified timing. Render the final MP4, independently verify it, and publish a verified manifest only if every mandatory check passes.

Use the existing PF-03 certification fixture and its actual asset references. Resolve any unspecified transition placement or title wording from the fixture, not by inventing values.

Expected execution sequence

Parse the request into explicit hard constraints and measurable acceptance criteria.
Compile the plan and validate all asset references, hashes, timing, and track constraints without mutation.

Execute through the existing OperationExecutor, with durable journal and revision protection.

Render through PF-04 and decode the complete video and audio streams.
Verify clip order, title interval, B-roll interval, transition frames, beat alignment, output profile, and audio requirements.
Perform bounded repairs only for classified repairable defects, then rerun all mandatory QA gates.
Recompute the output hash, validate the manifest, and publish only if every required check passes.

Required negative tests

Missing or tampered input asset.

Truncated or corrupt rendered file.

Valid media with the wrong clip order or missing title.

Transition effect metadata present but no visible cross-dissolve in decoded frames.

Failed repair after two permitted attempts.

Process termination during execution and recovery after restart.

Manifest hash mismatch or attempted publication of a failed job.

The test must prove that an invalid creative result is rejected even when FFmpeg exits successfully and the MP4 decodes without errors.

5. Implementation prompt for your IDE agent

Use the following as the master PF-05 authorization prompt. It deliberately prioritizes integration and proof over adding more features.

Writing
EME PF-05 — Autonomous Prompt-to-Verified-Deliverable Orchestration
Role

Act as the senior engineering lead for the Editing Mechanics Engine (EME). Implement PF-05 as a production-oriented orchestration layer that connects the existing prompt compiler, multi-track scheduler, deterministic executor, renderer, independent media QA, bounded repair controller, and delivery manifest into one verifiable workflow.

Use required GSD actions to achieve the goals and wherever needed.

Architecture invariants

Preserve the existing project schema and versioned contracts. Any new contract must be versioned separately.

Use the existing OperationExecutor, revision checks, locking, transaction boundaries, undo/redo, journal, and recovery mechanisms. Never bypass deterministic execution with direct project mutation.

Preserve integer timeline ticks at 120,000 ticks per second and half-open intervals [start, end).

Treat user-specified hard constraints as immutable. Never silently rewrite clip order, duration, title content, transition requirements, or timing to make QA pass.

Treat render success, media validity, creative-intent correctness, and manifest integrity as separate gates.

Do not mark a deliverable verified unless every mandatory gate passes and the manifest hash matches the final output bytes.

Keep A2 musical-structure development independent. PF-05 may consume existing beat-analysis artifacts and must not depend on unfinished A2 features.

Do not expand manual timeline UI scope unless an essential integration requirement cannot be met otherwise.

Phase 1 — Audit before implementation

Inspect the repository, current PF-02/PF-03/PF-04 implementations, schemas, CLI commands, tests, and recovery behavior.

Produce an evidence-based audit identifying:

Existing reusable components and their real interfaces.

Any duplicate or conflicting orchestration logic.

Gaps between reported capabilities and implementation.

PF-04 closure risks: true-peak measurement, real rendered cross-dissolve compositing, crash recovery at interruption boundaries, and repeat-render determinism.

The smallest integration design that preserves existing contracts.

Do not assume the completion report proves behavior. Run relevant tests and inspect implementation and actual rendered media.

Phase 2 — Define the orchestration contract

Design a versioned orchestration/run artifact, for example eme-delivery-run.v1, only if existing artifacts cannot safely represent the required lifecycle.

It must capture:

Original request and normalized explicit constraints.

Project snapshot identity and starting revision.

Canonical operation-plan hash and approved plan.

Asset references and verified hashes.

Execution and recovery journal references.

Render-job identity and output profile.

QA results and repair-attempt history.

Intent-verification results.

Final output hash and manifest reference.

Terminal status: verified, failed, or incomplete.

Validate the contract strictly. Preserve provenance and distinguish observed evidence from inferred or unsupported claims.

Phase 3 — Implement orchestration

Implement a deterministic lifecycle with explicit states for:

Request interpretation.

Constraint validation and clarification/fail-closed handling.

Plan compilation and dry-run preflight.

Deterministic plan execution.

Render-job creation and preflight.

Rendering and independent media QA.

Bounded repair and complete re-verification.

Intent-to-output verification.

Manifest validation and conditional publication.

Failure handling, recovery, and diagnostic reporting.

Reuse existing PF-02, PF-03, and PF-04 components rather than reimplementing them.

Every state transition must have explicit success/failure behavior. Prevent duplicate execution or publication on retry. Make recovery idempotent. Keep unverified temporary outputs separate from published deliverables.

Phase 4 — Intent-to-output verification

For each explicit, machine-verifiable user constraint, record:

Constraint identifier.

Expected value or interval.

Evidence source.

Measured value.

Tolerance, if applicable.

Pass, fail, or unverified result.

Verify the approved plan against executed project state and actual rendered media. Do not infer that a title, clip, transition, or audio requirement was satisfied merely because it exists in plan metadata. Use decoded-frame/audio evidence where applicable.

If a criterion cannot be verified with available tooling, mark it unverified; never silently count it as passed.

Phase 5 — Numerical acceptance gates

100% of explicit hard constraints are satisfied or execution fails closed.

Dry-run produces zero persistent project mutations or publication side effects.

Stale revisions are rejected before mutation.

All operations pass through the existing executor.

Project duration and operation timing remain exact in integer ticks.

Encoded duration follows PF-04's explicit frame-tolerance rules.

All mandatory media QA checks pass on the final render.

Every repair triggers a rerender and a full rerun of mandatory QA.

No more than two automated repair attempts per job.

No silent changes to creative intent.

Recovery leaves a verified baseline or a clearly journaled, recoverable state; repeat recovery is safe.

Published manifest SHA-256 equals the hash of the actual final output.

Failed or incomplete jobs cannot be published as verified.

Existing repository tests remain green.

Phase 6 — Flagship certification

Use the existing PF-03 12-second, 1080×1920, 30-fps fixture. Verify the specified clip order, music, cuts at 4 and 8 seconds, B-roll at [4, 6), title at [1, 4), and actual one-second cross-dissolve.

Run the entire workflow from the original natural-language prompt through the final manifest. Capture real CLI output, generated artifacts, decoded-media QA evidence, and recomputed hashes.

Add negative tests for missing/tampered assets, truncated media, missing title, incorrect clip order, a transition that exists only as metadata, failed repairs, process interruption, recovery, manifest tampering, and attempted publication of invalid output.

Repeat the same job from identical inputs and configuration. Compare output hashes; if the renderer is not byte-deterministic, document why and implement explicit decoded-media equivalence checks without weakening manifest hash verification.

Phase 7 — Final report

Report:

Files created or modified.

Contract and state-machine design.

Exact commands executed.

Actual test totals and failures.

Flagship output metadata and SHA-256.

Negative-test outcomes.

Recovery and repeatability evidence.

Remaining limitations and deviations from acceptance criteria.

Do not claim tests, metrics, or artifacts that were not actually produced. Do not claim independent certification based solely on unit tests.

Definition of done

PF-05 is complete only when the flagship scenario executes end-to-end through the CLI, the resulting media is independently checked against the original request, all mandatory negative tests behave correctly, recovery and publication safeguards are demonstrated, and the final manifest accurately binds the verified output.

Begin with the audit and identify any blocking gaps before making broad changes.

6. Recommended execution order

PF-04 closure audit: address the four targeted checks above without reopening the entire milestone.

PF-05 integration: build the single end-to-end orchestration path and certify the flagship scenario.

A2 in parallel: complete musical-structure inference and validate its sidecar independently.

PF-05 + A2 integration: only after A2 passes, optionally consume its confidence-aware bar/phrase evidence for planning. Preserve explicit user constraints and graceful fallback when A2 returns unknown.

Final architectural direction: PF-04 is accepted with conditions, A2 is authorized to proceed independently, and PF-05 is authorized as the next primary milestone. The next meaningful achievement is not a larger feature list—it is proving that one natural-language request reliably produces the correct, independently verified media file, or fails safely with an honest explanation.