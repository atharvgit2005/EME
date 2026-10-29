Phase 12 — Reference-to-Edit Planning & Deterministic Execution
Role

You are the systems architect and implementation engineer for the Editing Mechanics Engine (EME).

Workspace: /Users/atharvpaharia100/editing-mechanics-engine

Foundation: Canonical EME project model, typed editing operations, HyperFrames rendering adapter, FFmpeg/ffprobe, MCP tools, manual editing interface, QA engine, and benchmark harness.

Orchestration model: Antigravity remains the creative director and execution coordinator. EME owns deterministic planning validation, project semantics, and operation execution.

Mission

Implement a model-agnostic bridge that converts a natural-language creative brief and available reference evidence into a structured, validated editing plan that can be compiled into explicit EME operations.

The full workflow must be:

Brief + assets + references → source analysis → structured editing plan → preflight validation → EME operations → canonical project → render → inspection → bounded correction → delivery

The purpose is not to build another AI model. It is to make planning, validation, and execution predictable regardless of which model or coding-agent harness generates the initial plan.

Phase 12A — Entry gate

Inspect the repository, Git status, Phase 11 report, benchmark manifests, canonical project schema, operation catalog, MCP tools, renderer adapters, UI, and QA engine.

Run the existing unit suite and schema validator.

Verify completion of Phase 11.1 reliability closure, or record precisely which evidence remains incomplete.

Preserve all prior source projects and generated evidence.

Document which source-analysis tools are already available and which require additional dependencies.

Do not install tools or train models without a justified need and appropriate approval.

Do not rewrite the editing engine or change its canonical schema unnecessarily.

Phase 12B — Define source analysis

Create an explicit source-analysis artifact format independent of the canonical project.

The analysis pipeline should support the sources available in the workspace:

Video analysis

Probe resolution, duration, frame rate, streams, and available metadata.

Generate representative frames and contact sheets.

Identify candidate scene boundaries using available tools.

Record selected timestamps and observations with source references.

Identify important visual compositions, text placements, shots, and transitions where the available analysis supports them.

Audio analysis

Detect available audio streams and basic properties.

Generate transcription with word timestamps if an appropriate local tool is already installed or approved.

Identify candidate pauses, cue positions, and beats when tools can measure them.

Record signal measurements and analysis confidence.

Keep transcript data and signal evidence separate from editorial decisions.

Visual references

Treat reference frames and reference videos as evidence for style, pacing, framing, and transitions.

Record the timestamps of supporting examples.

Separate objectively measurable observations from subjective interpretations.

Do not claim exact reconstruction from a few sampled frames.

Each observation should contain relevant source IDs, timestamps, measured values where applicable, confidence/uncertainty information, and provenance.

Do not assume that every asset contains speech, music, detectable scene changes, or recognizable objects.

Phase 12C — Create the structured editing-plan contract

Create a versioned schema for an intermediate editing plan.

Use a separate plan model rather than overloading the canonical project schema.

The plan should describe:

Brief and intended outcome.

Output profile.

Scene or sequence structure.

Timeline allocation.

Source assets and evidence references.

Proposed clips and layer relationships.

Text content and typography intentions.

Motion and transition intentions.

Audio cues and volume-envelope intent.

Required editing operations.

Dependencies between operations.

Preconditions and expected postconditions.

Required renderer capabilities.

Missing assets or assumptions.

Validation results and unresolved issues.

Distinguish three representations:

Source analysis: What is observed in available media.

Editing plan: What the system intends to create and why.

Canonical EME project: The exact executable editing state.

The plan schema must not replace or duplicate the canonical project model.

Create a formal JSON Schema for the editing plan and at least three valid examples drawn from different benchmark genres.

Phase 12D — Plan validation and compilation

Implement a deterministic plan-validation and compilation layer using existing project and operation services.

The validator must check:

Plan-schema validity.

Source asset existence and availability.

Required font/asset references.

Timeline constraints and supported timebase semantics.

Dependencies between planned actions.

Conflicting edits and ambiguous targets.

Renderer capability requirements.

Unsupported operations and effects.

Output profile requirements.

Whether an operation needs user confirmation.

Whether an assumption is safe to proceed with.

The compiler should map approved plan steps into explicit EME operations. It must not directly mutate canonical project JSON or bypass the operation executor.

Define stable structured errors for invalid plans. Identify the plan step, relevant object/asset, and recovery suggestion where possible.

Support a dry-run mode that validates a plan and reports the expected operation sequence without mutating the project.

For an accepted plan, produce a trace connecting plan-step IDs to operation IDs and resulting project revisions.

Preserve operation atomicity. If a sequence consists of separate committed operations, do not pretend the entire sequence is one atomic transaction.

Where failure recovery is appropriate, stop execution, inspect the canonical project state, and establish a safe continuation point. Do not replay operations blindly.

Phase 12E — Integrate source analysis with Antigravity

Keep the creative-planning responsibility in the configured agent/model.

Provide Antigravity with:

Structured analysis artifacts.

Asset metadata.

Renderer capability reports.

The editing-plan schema.

Plan validation and dry-run tools.

Operation execution tools.

Render and inspection results.

Do not create a proprietary model dependency or require one specific language model.

The system must allow a different agent to submit a valid editing plan and use the same validator/compiler/runtime.

Provide appropriate human-confirmation gates for destructive edits, unresolved licensing/asset concerns, unclear creative requirements, and other high-impact decisions.

Phase 12F — Structured correction loop

Use the current QA engine and renderer inspection workflow.

The correction loop must:

Render the validated project.

Collect available objective diagnostics and selected frames.

Associate each finding with the affected object or timestamp.

Classify the issue as technical, temporal, visual/layout, audio, or subjective creative quality.

Propose a bounded, explicit corrective operation.

Validate and apply the correction.

Render and inspect the affected result again.

Record whether the specific finding improved.

Stop after the documented correction limit and report unresolved defects honestly.

Do not manufacture corrections when none are justified. Do not treat a mechanical QA score as proof of creative quality.

Phase 12G — Run three end-to-end scenarios

Use at least three source/brief combinations:

Scenario A: Reference-driven typography

A short motion-graphics video with multiple typography styles, timed animations, transitions, and appropriately placed audio.

Scenario B: Footage-based narrative edit

A multi-clip sequence with source trimming, timeline assembly, titles or lower thirds, and a controlled audio bed.

Scenario C: Complex compositing

A layered visual effect with explicit layer ordering, typed effects, and a documented output profile.

For each scenario:

Analyze the actual source material.

Generate a structured plan.

Validate and dry-run the plan.

Execute the plan through EME.

Validate the canonical project.

Render and verify metadata.

Inspect relevant frames.

Perform corrections only where justified.

Produce a traceable final deliverable.

Use the existing benchmark suite as regression coverage. Preserve original benchmark inputs and outputs.

Phase 12H — Evaluate generalization

Measure at minimum:

Editing-plan schema-validity rate.

Plan preflight pass rate.

Valid-operation rate.

First-pass project completion rate.

Render success rate.

Correction count.

Number of unsupported requested features.

Project-integrity regressions.

Time spent planning, executing operations, rendering, inspecting, and correcting.

Final technical acceptance outcome.

Human-rated creative quality for reviewed samples.

Use explicit denominators and distinguish test cases from individual operations.

Report Unknown where a metric was not collected. Do not invent targets after seeing results in order to declare success.

Classify failures by whether they originate in source analysis, creative planning, plan validation, operation execution, renderer limitations, asset availability, or QA.

Do not train or fine-tune a model in this phase. If a repeated failure suggests custom model development, write a proposal based on measured results.

Phase 12I — Required artifacts

Create or update, following established repository conventions:

docs/PHASE_12_REPORT.md

docs/architecture/phase-12-reference-to-edit-pipeline.md

docs/architecture/phase-12-editing-plan-contract.md

docs/architecture/phase-12-failure-taxonomy.md

A versioned editing-plan JSON Schema.

Source-analysis schema and example artifacts.

At least three example editing plans.

Plan validation and dry-run tests.

Operation-trace schema or documentation.

End-to-end scenario manifests.

Per-scenario project, operation traces, renders, frames, metadata, and QA evidence under artifacts/phase-12/.

Do not duplicate the canonical EME project schema.

Phase 12J — Definition of done

Phase 12 passes only when:

Source-analysis evidence is represented independently of editorial decisions.

Editing plans validate against a versioned machine-readable schema.

The plan validator checks assets, time constraints, dependencies, and renderer capabilities.

Dry-run produces a deterministic operation sequence without modifying the project.

Accepted plans compile into the existing EME operation executor.

Operation traces preserve links from planned steps to actual edits and project revisions.

The three end-to-end scenarios produce valid, inspectable outputs.

The correction loop records evidence of improvement when a correction is made.

Existing benchmarks and regression suites continue to pass.

Metrics and unresolved failure categories are reported honestly.

The pipeline remains independent of a particular model provider.

No custom model training or public release is initiated without separate approval.

Finish with PASS, PARTIAL PASS, FAIL, or BLOCKED using actual evidence. Do not automatically start Phase 13.

Preserve user work. Do not commit, push, publish, or release without explicit approval.

Use required GSD actions to achieve the goals and wherever needed.
