Phase 11 — Benchmark Coverage Closure & Evidence-Calibrated Reliability
Role

You are the benchmark architect, QA engineer, and reliability investigator for the Editing Mechanics Engine (EME).

Workspace: /Users/atharvpaharia100/editing-mechanics-engine

Previous phases: Phases 0–10 reported complete.

Current foundation: Canonical EME project schema, 13 editing operations, HyperFrames renderer, FFmpeg/ffprobe, MCP interface, manual editing UI, and automated QA engine.

Mission

Complete the gaps in the original Phase 10 benchmark specification and establish a reproducible, evidence-based assessment of editing reliability.

The latest Phase 10 report describes four completed benchmarks and 36 passing automated tests. The original specification required seven scenario categories:

A. Kinetic typography.
B. Footage assembly and editorial pacing.
C. Layered compositing.
D. Audio mixing.
E. Three-format aspect-ratio adaptation.
F. Multi-turn client revisions.
G. Invalid requests and failure recovery.

The delivered four-benchmark suite covers A–C and part of E, with some audio functionality embedded in other projects. It does not yet establish that D, E, F, and G have each passed their own acceptance criteria.

Close those gaps, verify the pixel-difference methodology, calibrate QA behavior against deliberate defects, and measure reliability and production efficiency.

This is a validation and targeted-improvement phase. Do not redesign the engine, train a custom model, or add a broad set of new editing features.

1. Audit and preserve existing evidence

Before making changes:

Inspect Git status, package configuration, the current branch, and existing artifacts.

Read docs/PHASE_10_REPORT.md, the benchmark suite manifest, individual benchmark manifests, tools/run-phase10-benchmarks.js, artifacts/phase-10/phase-10-benchmark-results.json, src/renderers/qa-engine.js, FrameInspector.computePixelDiff, operation contracts, and relevant tests.

Run existing tests and schema validation.

Confirm the actual files, metadata, project revisions, source asset manifests, and render commands behind each reported benchmark.

Determine whether the current tests rerun rendering or merely assert that existing output files and recorded scores exist.

Preserve previous outputs and original source projects. Generate new evidence under a dedicated Phase 11 artifact directory.

Do not accept a reported test result as independently verified until its underlying command and behavior have been checked.

Record the baseline in docs/PHASE_11_REPORT.md.

2. Reconcile the benchmark manifest

Create a versioned Phase 11 suite manifest that includes every required scenario.

Reuse the four existing benchmarks as baseline fixtures when their current manifests and project files are valid. Keep their original inputs unchanged.

The result schema must distinguish:

Manifest validity.

Project/schema validity.

Operation correctness.

Render success.

Metadata conformance.

Automated QA findings.

Pixel-level comparisons.

Human-rated creative quality.

End-to-end agent reliability.

Performance metrics.

Do not collapse these into a single unqualified pass score.

Every benchmark must record its project/asset references, required renderer capabilities, exact output profile, validation conditions, and acceptance criteria.

3. Complete the audio benchmark

Create a separate audio-focused test project with a target duration of 15–20 seconds.

Use appropriate existing staged assets only after confirming they exist and can be used for this test.

Required conditions:

Background audio spans the intended timeline.

Several sound events are placed at explicitly defined timeline positions.

Source ranges and timeline positions are distinguished.

Gain and envelope keyframes are represented in the canonical project.

Fade behavior is verified.

Output audio duration and stream metadata are checked.

The project's required audio operations are executed through EME.

Measure available objective indicators such as peak levels, RMS, integrated loudness where supported, and silence/gap intervals. Document the tool, configuration, measurement units, and limits of each measurement.

Where cue timing matters, compare the rendered audio events with the intended timestamps using available signal-analysis tools.

Do not call explicit volume keyframes automatic sidechain compression. Do not claim perceptually good mixing from metadata or peak measurements alone.

Store the project, render, measurements, and evidence under artifacts/phase-11/audio/.

4. Complete the three-format adaptation benchmark

Use one canonical creative project and create three intentional output adaptations:

Landscape: 1920 × 1080 (16:9).

Vertical: 1080 × 1920 (9:16).

Square: 1080 × 1080 (1:1).

Use 60 fps constant-frame-rate output unless the existing contract requires a documented different target for a specific fixture.

The adaptation system must account for canvas geometry, text placement, safe margins, and source-footage cropping.

Requirements:

Preserve text content and semantic hierarchy.

Preserve intended clip relationships and audio-envelope timing.

Prevent unintended clipping or off-canvas content.

Handle crop, fit, and reposition behavior explicitly.

Validate the project for each target profile.

Render all three versions.

Inspect representative frames from each version.

Compare the three results using a documented layout and content-preservation rubric.

Do not treat stretching one completed composition to three sizes as a successful adaptation.

Store all three project files, renders, frame samples, and comparison results under artifacts/phase-11/aspect-adaptation/.

5. Complete the multi-turn revision benchmark

Start from an untouched copy of an existing benchmark project.

Execute at least five sequential changes through the actual EME operation interface, preferably through the real Antigravity-to-MCP workflow.

The revision sequence must span multiple categories:

Change existing text content or typography.

Adjust a timeline position or trim.

Update an animation keyframe or transform.

Change an effect parameter where supported.

Modify an audio-envelope point or other relevant mix property.

For every turn:

Record the editing request.

Record the structured plan.

Record the exact operation and arguments.

Record its success/error result.

Record the resulting project revision.

Validate the new canonical state.

Verify that unrelated project objects remain unchanged.

After the fifth change:

Save the project.

Reload it.

Validate it.

Render the final version.

Inspect frames and available audio evidence.

Compare the initial and final projects.

Preserve stable IDs for ordinary modifications. Use state diffs to demonstrate that unrelated entities were not altered.

If full live Antigravity automation is not available, clearly distinguish manually initiated agent runs from automated integration tests. Do not claim an agent-driven workflow if the edits were scripted directly against the operation executor.

Store each revision, operation trace, final render, and comparison under artifacts/phase-11/multi-turn/.

6. Complete the invalid-request and recovery benchmark

Create a separate set of controlled negative tests.

Include at least:

Missing asset.

Missing font.

Unsupported renderer feature.

Invalid source trim.

Invalid keyframe timing.

Conflicting timeline placement.

Stale revision or malformed operation request.

A simulated or safely controlled renderer failure.

For each case, specify the expected error code/category, recovery recommendation, and required state invariant.

Verify:

Failed mutations leave canonical project content unchanged.

Failed mutations do not increment project revision.

Invalid renders are not reported as successful.

Required effects are not silently omitted.

Project files are not truncated or partially overwritten.

Output cleanup removes only temporary files created by the test.

A subsequent valid operation can succeed when recovery is appropriate.

Use disposable projects and dedicated output directories. Do not perform destructive tests against original benchmark artifacts.

Report the number of negative cases tested, the number detected correctly, false-success incidents, state-corruption incidents, and unresolved cases.

Store results under artifacts/phase-11/failure-recovery/.

7. Correct the pixel-difference evaluation methodology

Audit FrameInspector.computePixelDiff.

The following distinction is mandatory:

Comparing Benchmark A with Benchmark C can demonstrate that two different projects look different.

It cannot demonstrate that either project is better or more accurate.

Comparing a decoded frame with an identical copy can demonstrate pixel equality for that frame.

It cannot by itself establish that a whole editing session has zero timing drift.

Retain the decoded-pixel implementation, but strengthen its validation.

Required comparison modes

A. Deterministic identity comparison

Render the same canonical project with the same renderer/configuration at least twice. Compare decoded frames at the same requested timestamps.

Report:

Project and revision fingerprints.

Renderer and encoding configuration.

Matching timestamps.

Image dimensions and color format.

Exact decoded pixel equality.

Pixel mismatch percentage and RMSE where non-zero.

Any allowed tolerance and why it exists.

Prefer lossless frame extraction or a common decoding pipeline. Account for color conversion and scaling.

B. Controlled edit comparison

Use a project where one intentional visual change has been applied.

Compare the decoded baseline and modified frames at matched timestamps. Produce an image-difference artifact and explain which pixels or areas changed.

Verify that the changed region corresponds to the edited object rather than a full-frame timing mismatch or unrelated state change.

C. Temporal consistency

For selected frames near clip boundaries, keyframes, and transitions:

Verify frame selection follows the canonical timebase.

Check that sampling uses the intended project revision.

Ensure the same timestamp is not mistakenly mapped to different frames.

Compare expected and actual state around half-open interval boundaries.

Generate test fixtures in which a defect is known in advance, so the expected outcome is unambiguous.

Do not fabricate perceptual similarity claims from an MSE/RMSE value alone.

8. Calibrate the automated QA engine

Audit src/renderers/qa-engine.js.

Create fixtures with deliberate defects that the engine should detect:

Text outside the canvas.

An off-screen animated element whose behavior must be classified correctly depending on its entrance/exit timing.

A missing referenced asset.

An invalid track reference.

A clip outside allowed composition bounds.

An unsupported required effect.

A mismatched output dimension or frame rate.

A missing or truncated render output.

An audio stream that is absent when required.

For each fixture, specify expected finding type and severity before running QA.

Measure:

Correctly detected defects.

Missed defects.

False positives.

False negatives.

Findings whose severity is incorrect.

Do not tune the test expectations after viewing a failure simply to manufacture a pass. If the rule was wrong or ambiguous, document the specification change and add a regression test.

Separate QA dimensions

Report independent outcomes for:

Structural/project integrity.

Renderer and asset conformance.

Temporal correctness.

Visual/layout integrity.

Audio/output integrity.

Creative quality assessment.

Automated metrics must not claim to determine artistic quality. Where creative quality is evaluated, provide an explicit human-review rubric or clearly label the assessment as unverified.

A score of 100/100 may be reported for a narrowly defined mechanical checklist, but must not imply overall creative perfection.

9. Normalize performance measurement

Extend the results schema to distinguish:

Output duration.

Compilation time.

Render wall-clock time.

Output duration divided by render time (real-time throughput factor).

Render time divided by output duration (seconds of rendering per second of output).

Inspection/QA time.

Agent-planning time, when measured.

Tool-call count, when available.

Correction count.

Total time to verified delivery.

Use consistent units and formulas. Include units in every metric name or associated schema.

Run repeated measurements on representative workloads and report variability rather than claiming a universal render-performance figure based on one run.

Separate cold-start timings from warm runs when this is measurable.

Do not optimize the renderer, migrate languages, or introduce a new execution framework unless a repeated measurement identifies a significant bottleneck.

10. Repeatability and provenance

Every benchmark result must record:

Benchmark ID and manifest version.

Run identifier and date.

Canonical project hash/revision.

Input asset manifest or hashes where appropriate.

EME package version.

Renderer/tool versions.

Output profile.

Relevant render settings.

Actual invocation or reproducible command.

Validation and QA results.

Artifact paths.

Failure and correction history.

Run at least two comparable executions for representative identity/repeatability tests. Additional runs should be driven by variance or a specific uncertainty.

Avoid storing sensitive machine information or credentials.

11. Regression testing

Run the full existing suite after changes, including:

Current unit tests.

Schema validation.

MCP/CLI integration tests.

UI/backend tests.

Phase 4 benchmark regression.

Phase 7 scenarios.

Phase 8/9 editor correction workflow.

Phase 10 benchmark manifests and rendered-artifact checks.

All new Phase 11 tests.

Separate lightweight unit checks from expensive render integration tests.

A passing artifact-existence test is not a substitute for a fresh render. Record which video outputs were actually regenerated.

Do not weaken previous tests simply to obtain a passing result.

12. Required deliverables

Create or update:

docs/PHASE_11_REPORT.md

docs/benchmarks/phase-11-methodology.md

docs/benchmarks/phase-11-results.md

docs/benchmarks/phase-11-failure-taxonomy.md

benchmarks/manifests/phase-11-suite.json

benchmarks/manifests/phase-11-audio.json

benchmarks/manifests/phase-11-aspect-adaptation.json

benchmarks/manifests/phase-11-multi-turn.json

benchmarks/manifests/phase-11-failure-recovery.json

artifacts/phase-11/audio/

artifacts/phase-11/aspect-adaptation/

artifacts/phase-11/multi-turn/

artifacts/phase-11/failure-recovery/

artifacts/phase-11/pixel-diff/

artifacts/phase-11/repeatability/

Follow the existing repository's naming and artifact conventions if a clear convention already exists, while preserving the substance of every required deliverable.

13. Definition of done

Phase 11 passes only when:

The complete A–G benchmark coverage is present and its results are traceable.

The standalone audio benchmark has been rendered and evaluated.

Three independently adapted aspect-ratio outputs have been rendered and inspected.

The five-turn revision benchmark passes its state-integrity criteria.

Invalid requests fail correctly without state corruption or false-success renders.

Pixel comparisons operate on decoded images and have validated identity and controlled-edit modes.

QA detection has been tested against intentionally defective fixtures.

Technical correctness is reported separately from creative quality.

Performance metrics have consistent definitions and units.

Repeated runs provide evidence of repeatability for selected workloads.

Previous regression suites pass.

The final report identifies the next highest-impact failure class based on evidence.

A subset of results may be accepted as partial progress, but the full phase must not be marked PASS while mandatory categories remain untested.

14. Final report and execution restrictions

Update docs/PHASE_11_REPORT.md with:

Initial audit findings.

Completed benchmark categories and gaps.

Rendered artifact metadata.

Audio measurement methodology/results.

Aspect-adaptation comparisons.

Multi-turn project and operation traces.

Failure/recovery results.

Pixel-identity and controlled-edit comparisons.

QA calibration metrics.

Performance methodology and normalized results.

Full regression outcomes.

Prioritized failure taxonomy.

Recommendation for Phase 12.

Preserve previous user work and original benchmark artifacts. Do not commit, push, publish, or release without explicit approval.

Use required GSD actions to achieve the goals and wherever needed.

Finish with PASS, PARTIAL PASS, FAIL, or BLOCKED, supported by actual evidence. Do not automatically begin Phase 12.
