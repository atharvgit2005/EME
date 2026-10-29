You said:

# Full Detailed Phase 1 Research Report & Artifacts




Here is the complete, unabridged documentation for Phase 1 — Software Reconnaissance Using REA from our local workspace:




---




## 1. Primary Software Reconnaissance Report (`docs/research/phase-1-software-reconnaissance.md`)




# Phase 1 — Software Reconnaissance Research Report




**Project**: Editing Mechanics Engine (EME)  
**Date**: 2026-10-15  
**Auditor / Driver**: Antigravity  
**Recon Tools Used**: REA CLI v6.5.0, Local Project Artifact Inspection, Web Research  
**Phase 1 Verdict**: **PASS**




---




## 1. Executive Summary




Phase 1 conducted evidence-based software reconnaissance across four candidate systems to determine the optimal architectural foundations for our AI-operated video editor:
1. **HyperFrames** (`heygen-com/hyperframes`): Browser-based deterministic rendering engine powered by HTML/CSS and paused GSAP timelines.
2. **MakeMyClip Editor** (`MakeMyClip/editor`): Agent-centric editing architecture built around MCP tool schemas and deterministic FFmpeg commands.
3. **Motion Canvas** (`motion-canvas/motion-canvas`): Procedural programmatic animation engine utilizing ES6 generators and reactive Signals.
4. **OpenCut & OpenCut Classic** (`OpenCut-app/OpenCut`): Full-scale video editor timeline architecture featuring high-precision integer ticks (`MediaTime`) and ripple editing models.




### Primary Recommendation: **Decoupled Three-Layer Engine Architecture**
- **Layer 1: Agent Orchestrator & Controller (Antigravity)**: Exposes high-level editing tools, brief translation, and visual evaluation via structured CLI & MCP interfaces (adopting the tool schemas and operation logs of **MakeMyClip**).
- **Layer 2: Core Editing Mechanics Engine (Custom EME)**: Clean-room declarative project model maintaining the canonical timeline, integer tick timing (inspired by **OpenCut**'s `MediaTime`), track constraints, keyframe interpolation, and audio volume envelopes.
- **Layer 3: Pluggable Rendering & Compositing Adapter**:
  - **Primary Adapter**: **HyperFrames** for high-craft animated typography, layout, SVG vector graphics, and CSS blend modes.
  - **Secondary / Headless Fallback**: Direct **FFmpeg** pipeline for pure video clipping, format transcoding, and complex filtergraph blending.




---




## 2. In-Depth Candidate Architecture Summaries




### Candidate A: HyperFrames (`v0.8.82`)
- **Architecture**: Takes an HTML/CSS document where elements declare timing attributes (`data-start`, `data-duration`, `data-track-index`) and registers a paused seekable GSAP timeline on `window.__timelines["id"]`.
- **Rendering Loop**: Launches headless Chromium via CDP (`--remote-debugging-port`), steps time deterministically frame-by-frame via `beginframe` / `screenshot`, extracts audio tags, and muxes with FFmpeg.
- **Strengths**:
  - Superior typography rendering: Any Google / local TTF font via `@font-face` renders with zero font-drift or baseline clipping.
  - Full modern CSS: Flexbox, CSS Grid, blend modes (`mix-blend-mode: difference`, `multiply`), filters (`blur`, `contrast`, `invert`), SVG clipping paths, and drop shadows.
  - Local pre-existing experience and verified skills on this development machine (`.hyperframes/config.json`, 13 local successful renders logged).
- **Limitations**:
  - Requires writing HTML/CSS/DOM structures rather than a raw timeline JSON unless wrapped in an engine compiler.
  - Heavy video decode overhead if dozens of concurrent 4K video clips are layered.




### Candidate B: MakeMyClip Editor
- **Architecture**: Designed specifically for coding agents (Claude, Cursor, Antigravity) with structured tool inputs (JSON schemas) that mutate project state and compile to deterministic FFmpeg filtergraphs.
- **Strengths**:
  - Best-in-class agent ergonomics: Simple operations (`cut_clip`, `add_overlay`, `adjust_volume`, `generate_preview`) with validation and descriptive error recovery.
  - Strict operation logging and snapshot rollbacks.
- **Limitations**:
  - Motion graphics and kinetic typography are extremely rigid: FFmpeg `drawtext` cannot easily match modern kinetic typography, letter-spacing animation, or spring physics.




### Candidate C: Motion Canvas (`v3.16.x`)
- **Architecture**: Declarative 2D vector animation system where animations are ES6 generator functions (`function*`) using `yield* all(...)` and reactive Signals.
- **Strengths**:
  - Beautiful math for spring physics, cubic-bezier easing, and coordinate transformations.
  - Audio event synchronization (`waitUntil('marker')`).
- **Limitations**:
  - Code-first TypeScript model requires Vite bundling. Difficult for an agent to perform non-linear timeline editing or clip ripple shifting compared to a structured JSON schema.




### Candidate D: OpenCut & OpenCut Classic
- **Architecture**: Dual-tier architecture transitioning from a Next.js web application to a high-performance Rust WASM core. Uses a 120,000 tick-per-second integer timeline (`MediaTime`) to prevent floating-point rounding creep across edits.
- **Strengths**:
  - Production-grade multi-track data structures and ripple-editing algorithms.
- **Limitations**:
  - Active rewrite under GPL-3.0. To avoid copyleft viral licensing, we must avoid importing or linking any OpenCut source code directly.




---




## 3. Benchmark Feasibility Assessment




### Benchmark A: Reference-Driven Motion Graphics Edit (10–15s MP4)
- **Target**: Kinetic typography (Instrument Serif, Syne, Archivo Black), multi-track layering, transparent alpha transition overlay, synchronized SFX hits, and background music.
- **Feasibility with HyperFrames + EME**: **100% FEASIBLE (PASS)**.
  - Typography: Native CSS + `@font-face` using our staged `assets/fonts`.
  - Transitions: Alpha-channel WebM overlay supported natively via `<video>` tags with transparency.
  - Audio: Staged `snowfall.mp3` and tactical SFX (`07_riser`, `10_camera_click`) aligned via `data-start` and volume attributes.




### Benchmark B: Layered Compositing Stress Test (X-Ray / Difference Blending)
- **Target**: Layer duplication, exposure/curve adjustment, difference blend mode, synchronized footage playback.
- **Feasibility with HyperFrames + EME**: **100% FEASIBLE (PASS)**.
  - Layering: Two synchronized video clips placed on separate tracks (`data-track-index="0"` and `"1"`).
  - Invert & Exposure: CSS `filter: invert(1) contrast(150%) brightness(120%)`.
  - Blend Mode: CSS `mix-blend-mode: difference` (or FFmpeg `blend=all_mode=difference`). Both paths are executable.




---




## 4. Architectural Boundaries for the Editing Mechanics Engine




1. **Canonical Project Representation**:
   - The engine defines a versioned JSON schema (`schema/project.schema.json`): frame rate, resolution, duration in integer ticks, array of tracks, array of clips, keyframe timelines, and audio mixes.
2. **Frame-Accurate Timing**:
   - The EME compiler computes exact frame numbers ($frame = tick \times fps / ticksPerSecond$), ensuring zero float drift.
3. **Renderer Independence**:
   - The EME compiler generates an intermediate representation that compiles into:
     - HyperFrames HTML bundle (`renderers/hyperframes/`) OR
     - Pure FFmpeg Filtergraph script (`renderers/ffmpeg/`).
   - If HyperFrames is swapped or updated, the canonical project schema and agent tools remain 100% untouched.
4. **Agent Interface (Antigravity)**:
   - Exposes discrete commands: `create_project`, `add_clip`, `set_typography`, `apply_keyframe`, `add_transition`, `render_preview`, `inspect_frame`.




---




## 5. REA Investigation Role & Evidence




REA (Reverse Engineering Anything) v6.5.0 was executed locally to establish evidence recording standards:
- **Evidence Output**: Recorded in [docs/research/evidence/phase-1/rea-providers.json](file:///Users/atharvpaharia100/editing-mechanics-engine/docs/research/evidence/phase-1/rea-providers.json).
- **Capability Verified**: 153 CLI commands, 207 MCP tools operational under `/Users/atharvpaharia100/.local/bin/rea`.
- **Role in Phase 1 & Beyond**: REA serves as our inspection engine to audit binary dependencies, inspect native dylibs (e.g. FFmpeg libraries, Chromium renderers), and evaluate compiled assets.




---




## 6. Phase 1 Exit Criteria & Phase 2 Entry Gate




### Checklist:
- [x] All 4 candidate projects evaluated with verified strengths and limitations.
- [x] Capability matrix completed ([docs/research/phase-1-capability-matrix.csv](file:///Users/atharvpaharia100/editing-mechanics-engine/docs/research/phase-1-capability-matrix.csv)).
- [x] Source & license ledger completed ([docs/research/phase-1-source-and-license-ledger.md](file:///Users/atharvpaharia100/editing-mechanics-engine/docs/research/phase-1-source-and-license-ledger.md)).
- [x] Open questions and postponed decisions documented ([docs/research/phase-1-open-questions.md](file:///Users/atharvpaharia100/editing-mechanics-engine/docs/research/phase-1-open-questions.md)).
- [x] Both Benchmark A and Benchmark B proven feasible.
- [x] Decoupled architecture recommendation established.




### Verdict: **PASS**




### Phase 2 Next Scope:
1. Define the versioned declarative project schema (`schema/project.schema.json`).
2. Implement project validation rules (detect overlapping conflicts, missing asset paths, invalid tick bounds).
3. Specify operation contracts for agent tools (`create`, `add_track`, `insert_clip`, `animate_property`, `render`).





---




## 2. Candidate Capability Matrix (`docs/research/phase-1-capability-matrix.csv`)




```csv
Candidate,Version/Commit,Agent Access,Project Model,Timing,Timeline,Motion,Typography,Compositing,Transitions,Audio,Determinism,Validation,Recovery,Manual Editing,Local-First,Licen

…
Show more
ChatGPT said:

After reviewing the detailed Phase 1 documentation, I would keep the overall Phase 2 plan but refine several important technical decisions. Your research makes the intended architecture clearer, especially the division between the canonical project, agent operations, and rendering adapters.

What I would refine before execution
Keep

Three-layer architecture

Antigravity owns orchestration, EME owns project state and editing semantics, and rendering adapters execute the compiled project.

Refine

Integer-tick timing

Don't automatically adopt OpenCut's 120,000-tick timebase. Test it against fractional frame rates and audio sample positions, then compare it with rational time values. Choose a representation that can express every required timestamp exactly or preserve exact rational values until a defined renderer boundary.

Refine

HyperFrames and FFmpeg

Treat HyperFrames as the primary candidate for typography and browser-based composition. Use FFmpeg for media operations and compatible compositing. Don't promise automatic fallback for arbitrary effects: both backends must explicitly declare their capabilities, and output equivalence must be tested.

Resolve

Licensing

Your report calls HyperFrames proprietary/dual-license and states that external CLI invocation avoids incorporating proprietary code. This is not sufficient by itself to establish permission for every intended use. Keep the licensing question open until the applicable terms are verified. Also verify the exact license of each package and binary before distribution.

Narrow

Phase 2 scope

Specify the full contract, but mark each operation as MVP, later, or deferred. Validate schemas and benchmark examples now; implement runtime validation, rendering, and the actual engine in Phase 3.

Refined Phase 2 execution prompt

Use this version instead of the earlier Phase 2 prompt. It incorporates your local findings and makes the timing, renderer, licensing, and implementation boundaries explicit.

Writing
Phase 2 — Define the Editing Mechanics Engine Contract
Role and context

Act as the system architect for the Editing Mechanics Engine (EME), an agent-operated video editing system.

Workspace: /Users/atharvpaharia100/editing-mechanics-engine

Completed phases: Phase 0 — Environment and REA Readiness (PASS); Phase 1 — Software Reconnaissance (PASS).

Research sources:

docs/research/phase-1-software-reconnaissance.md

docs/research/phase-1-capability-matrix.csv

docs/research/phase-1-source-and-license-ledger.md

docs/research/phase-1-open-questions.md

docs/research/evidence/phase-1/rea-providers.json

1. Goal

Deliver an implementation-ready, versioned contract for EME before implementing its runtime.

The system must allow coding agents to construct and revise structured editing projects through deterministic, validated operations. The canonical project representation must remain independent of the chosen rendering framework.

The architecture has three layers:

Agent orchestrator: Antigravity interprets creative intent, plans work, calls tools, and evaluates rendered outputs.

Editing Mechanics Engine: Owns the canonical project, time representation, clip/layer semantics, editing operations, validation rules, and renderer-independent compilation.

Renderer adapters: Execute supported operations through HyperFrames, FFmpeg, or future compatible backends.

REA remains a research and inspection tool, not part of the required production rendering path.

2. Phase boundaries

This is a design and specification phase.

Allowed:

Inspect repository files, existing dependencies, and Phase 1 evidence.

Create documentation, JSON Schemas, examples, and architecture decision records.

Validate schemas and example files using tools already available.

Run non-destructive checks and record exact results.

Update the GSD plan or task tracking when GSD is available.

Not allowed:

Implement the EME runtime.

Install rendering frameworks or dependencies.

Implement CLI/MCP servers.

Implement HyperFrames or FFmpeg adapters.

Produce benchmark videos.

Start the visual editor or train a model.

Commit or push changes without explicit approval.

Inspect Git status first. Preserve user changes and existing project conventions.

3. Reconcile Phase 1 findings

Read all five research artifacts listed above.

Treat the report's claims as hypotheses to reconcile with the recorded evidence. In particular:

Confirm the actual HyperFrames version and supported timing, compositing, audio, and font behaviors.

Preserve the distinction between MakeMyClip's operation patterns and EME's own canonical model.

Use Motion Canvas as a reference for animation mathematics rather than making its generator runtime the canonical representation.

Use OpenCut's timing ideas as conceptual references only; do not copy GPL-licensed code into EME.

Verify current licensing and terms for HyperFrames, GSAP, FFmpeg and relevant bundled assets. Do not claim that invoking a tool through a subprocess eliminates all licensing or distribution obligations.

Mark any question that cannot be resolved from available evidence as open.

Do not spend Phase 2 repeating the full Phase 1 audit. Focus on decisions needed to specify the contract.

4. Specify the canonical project model

Create a machine-readable JSON Schema for version one of the project format.

The project model must describe:

Project settings

Stable project ID.

Explicit schema version.

Project revision.

Canvas dimensions.

Rational frame rate.

Output profile.

Track/layer collection.

Asset manifest.

Clips and visual/audio elements.

Animation/keyframe data.

Transitions and effects.

Avoid storing multiple authoritative copies of derived values.

Assets

Represent video, audio, still images, fonts, transparent overlays, and other supported visual resources.

Specify stable IDs, portable asset references, available metadata, optional hashes, and missing-asset behavior. Support project-relative assets rather than requiring machine-specific absolute paths.

Do not assume every asset has known duration, frame rate, audio streams, or alpha support.

Tracks and layers

Define ordering, visual versus audio tracks, clip overlap semantics, mute/disabled behavior, and compositing order.

Specify whether ordering is represented by explicit z-order, track order, or a rigorously defined combination. There must be one unambiguous rule for which visual element appears above another.

Clips

Define at least video clips, audio clips, text clips, and graphic/image clips.

Specify source in/out points, timeline placement, duration semantics, playback speed for the initial supported model, transforms, opacity, effect stacks, and animation references.

State the endpoint convention explicitly. Prefer half-open intervals [start, end) throughout the project model.

Do not add variable-speed time remapping to the MVP unless Phase 1 evidence demonstrates it is essential.

Typography

Specify text content, font references, size and units, alignment, positioning, line spacing, dimensions, fill/stroke, opacity, transforms, and animation.

Define missing-font and font-fallback behavior. Unexpected substitutions must be reported.

Effects, compositing, and transitions

Use typed effect definitions with validated parameters rather than unrestricted arbitrary JSON.

Specify opacity, blend modes (including Difference), exposure/curves where supported, masks, transition types, transparent overlay assets, order of operations, and unsupported-feature errors.

Separate renderer-independent effect intent from backend-specific implementation details.

Audio

Specify audio sources, placement, trim ranges, gain units, fade envelopes, mute behavior, background music, and timed sound effects.

Define how audio timeline values are converted into samples or renderer timestamps. Automatic sidechain ducking is not required for the MVP; the model must permit explicit volume envelopes.

5. Resolve the exact time model

Produce an ADR comparing these approaches:

Integer ticks using a documented timebase.

Rational time values.

Integer ticks with exact rational conversion metadata or another justified hybrid.

Evaluate the report's proposed 120,000 ticks per second; do not automatically accept it.

Test the mathematical representation against:

24 fps.

25 fps.

30 fps.

24000/1001 fps.

30000/1001 fps.

Audio positions on common integer sample-rate grids, including 44,100 Hz and 48,000 Hz.

Clip boundaries and durations.

Frame extraction at boundary timestamps.

Source time versus timeline time.

Conversion to backend-required timestamp units.

Show the arithmetic and identify exactly where rounding is permitted.

A finite tick rate is not automatically exact for every possible frame rate and sample rate. If the chosen timebase cannot represent a required timestamp exactly, either choose a better representation or specify a lossless rational form.

Use integer arithmetic or an exact rational representation in the authoritative model. Do not make floating-point seconds authoritative.

Define:

The canonical time unit or rational format.

Frame-rate representation.

Source-media timestamp representation.

Timeline time representation.

Endpoint and duration semantics.

Frame-index mapping and its rounding rule.

Audio sample mapping and its rounding rule.

Overflow, invalid values, and conversion errors.

Document how every renderer adapter must respect the same rules.

6. Specify deterministic animation

Define keyframes by property, value type, timestamp, interpolation mode, and easing parameters.

Specify:

Local-clip versus project-global time.

Hold and linear interpolation.

Parameterized cubic Bézier easing.

Values before the first and after the last keyframe.

Validation of invalid keyframe sequences and property types.

Deterministic evaluation at an exact project timestamp.

Spring animation may be designed as a future extension. Include it in version one only if its behavior, sampling, and parameters can be defined deterministically without dependence on playback timing or simulation history.

Do not make JavaScript generators, wall-clock playback, or any renderer-specific timeline object the canonical animation format.

7. Define the versioned editing-operation protocol

The operation protocol must be independent of CLI and MCP transport.

Specify a request envelope with suitable fields for:

Protocol version.

Operation ID and type.

Project ID.

Expected revision.

Validated arguments.

Optional idempotency key.

Optional rationale/provenance.

Define a structured result containing status, updated project revision where relevant, affected object IDs, warnings, structured errors, and recovery guidance.

Document atomicity and retry semantics. A rejected operation must leave the project unchanged. State-changing successful operations increment the project revision; read-only operations do not.

Define conflict behavior for stale expected revisions and duplicate requests.

Operation catalog

Classify every operation as:

MVP: required for the first working vertical slice.

Next: needed for one of the two benchmarks after the first vertical slice.

Deferred: specified as a future extension, not required in the first implementation.

The catalog should include project creation/inspection, asset registration, track and clip operations, transforms, text, keyframes, effects, transitions, audio adjustment, validation, capability inspection, rendering, and frame inspection.

For each operation, document:

Purpose.

Input schema.

Preconditions.

State changes.

Postconditions.

Failure cases and error codes.

Revision behavior.

Whether it invalidates previous renders.

Applicable benchmark and implementation priority.

Define undo/redo and operation-history requirements at the design level, but do not implement them.

8. Define validation and errors

Separate structural schema validation from semantic validation and renderer capability validation.

At minimum, cover:

Missing or invalid fields.

Duplicate IDs.

Missing assets.

Invalid source ranges or durations.

Invalid frame rates and time values.

Invalid keyframes or easing parameters.

Invalid references to tracks and clips.

Undefined or conflicting layer ordering.

Unsupported effects and blend modes.

Missing required fonts.

Incompatible output profiles.

Stale revisions.

Render failures.

Errors must use stable machine-readable codes, clear messages, relevant object/property references, and recovery suggestions where possible.

The contract must distinguish warnings from errors and never mark a render as fully successful if required operations were omitted.

No runtime validator is to be implemented in this phase. Define the rules so Phase 3 can implement them without inventing semantics.

9. Define the renderer-adapter interface

Specify a framework-independent adapter boundary.

It should cover:

Backend identity and version.

Capability reporting.

Renderability checks.

Compilation from canonical project state to backend-specific execution plan.

Rendering and output metadata.

Selected-frame extraction or inspection.

Structured warnings, failures, and diagnostic evidence.

Define capability reporting for fonts, media types, frame rates, alpha, blend modes, effects, transitions, audio operations, and output settings.

Explicitly differentiate:

Feature supported natively.

Feature supported through an approximation.

Feature unsupported.

Feature not yet verified.

Approximation must be explicit and require a declared policy; no silent degradation.

HyperFrames is the leading candidate for typography and HTML/CSS composition. FFmpeg is a candidate for clipping, encoding, audio, and supported filtergraph/compositing operations. These are architecture decisions to document—not adapters to implement in Phase 2.

Do not promise universal fallback. Some browser-based and FFmpeg effects will not be visually equivalent.

10. Define the agent API and project lifecycle

Specify a common operation service exposed through future CLI and MCP interfaces.

Clearly separate read-only inspection tools from state-changing operations.

Define the project lifecycle:

Create/load project.

Inspect assets and capabilities.

Propose operations.

Validate operation and project state.

Apply operation atomically.

Compile and validate renderability.

Render selected output.

Inspect frames/audio and diagnostics.

Apply bounded corrections to the same project revision chain.

Define project revision, operation history, render provenance, and stale-result behavior.

The future manual editor must use the same canonical project model, not maintain an incompatible parallel timeline.

11. Define both benchmark project examples

Create JSON examples that conform to the proposed project schema. They are specifications only; do not render them.

Benchmark A — Reference-driven motion graphics

10–15 seconds, with multiple text/graphic elements, fonts, layered composition, keyframed transforms/opacity, at least one transition, background music, and timed SFX.

Use the staged asset inventory and actually inspected reference details. Do not invent reference-specific art direction.

Benchmark B — Layered X-ray/Difference compositing

Represent source footage, duplicate synchronized layers, defined layer order, exposure/curve treatment where available, Difference blending, and an output profile.

List the required capabilities for each benchmark and specify what happens if an adapter cannot support any mandatory effect.

Use explicit asset references or clearly documented example URIs that can be resolved during Phase 3. Avoid examples that appear production-ready while silently depending on nonexistent files.

12. Required artifacts

Follow current repository conventions, adjusting paths if needed:

docs/architecture/phase-2-mechanics-engine-contract.md

schemas/eme-project.schema.json

schemas/eme-operation.schema.json

docs/architecture/phase-2-renderer-adapter-contract.md

docs/architecture/phase-2-operation-catalog.md

docs/architecture/phase-2-contract-test-plan.md

docs/architecture/examples/benchmark-a-motion-graphics.example.json

docs/architecture/examples/benchmark-b-difference-compositing.example.json

docs/architecture/decisions/ADR-001-time-representation.md

docs/architecture/decisions/ADR-002-canonical-project-and-ownership.md

docs/architecture/decisions/ADR-003-operation-and-revision-semantics.md

docs/architecture/decisions/ADR-004-renderer-adapter-boundary.md

Add further ADRs only for significant decisions that need separate justification.

13. Contract checks

Use available tools to validate what can be validated without installing anything.

Check:

Both JSON examples conform to the chosen project schema.

Schema references and reusable definitions resolve.

Required schema fields and enumerations are internally consistent.

Timing examples are mathematically verified.

Operations have defined success, failure, and revision semantics.

Unsupported renderer capabilities are represented explicitly.

Asset references and example assumptions are documented.

Test plan covers structural, semantic, temporal, operations, renderer capabilities, and both benchmarks.

Report schema checks, static checks, mathematical verification, and runtime checks separately. Do not claim runtime tests passed if only documents have been validated.

14. Licensing and implementation boundaries

Preserve the Phase 1 licensing ledger. Any change to licensing assumptions must be explained and backed by verified evidence.

Do not include OpenCut GPL source in the project. Do not import or bundle HyperFrames or other third-party runtime code in this phase.

Document that subprocess isolation alone does not automatically resolve every licensing or distribution question.

Keep the core schema and editing semantics independent of a particular renderer license.

15. Definition of done

Phase 2 is PASS only when:

The actual Phase 1 evidence has been inspected.

The canonical project schema is versioned and valid.

Time semantics are mathematically justified and explicit.

The operation protocol and revision/atomicity semantics are fully specified.

Renderer capability negotiation is defined.

Agent-facing operations are transport-independent.

Both benchmark example projects conform to the schema.

The test plan covers timing, edits, invalid inputs, and unsupported effects.

The four required ADRs record the principal architectural decisions.

Phase 3 can begin implementation without inventing core project or operation semantics.

Final report

Report:

Files created or changed.

Major architecture choices and rejected alternatives.

Time-representation arithmetic and conclusions.

MVP versus Next versus Deferred operations.

Schema validation and other checks actually run.

Remaining unresolved questions and risks.

Exact Phase 3 implementation scope and testable milestones.

Finish with PASS or BLOCKED, with evidence. Do not begin Phase 3, install packages, or commit/push without authorization.

Use required GSD actions to achieve the goals and wherever needed.

My final recommendation

Keep Phase 2 strictly focused on the contract. The main risk isn't whether we can write a JSON schema; it's designing time and renderer semantics that work together without locking the entire system to HyperFrames.

Once this phase passes, Phase 3 should be a small, working vertical slice—not every editing operation at once. Start with project creation, text, keyframe animation, validation, deterministic frame rendering, and inspection. Then expand toward the full motion-graphics and Difference-compositing benchmarks.
