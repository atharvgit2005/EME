EME engineering direction: virtual camera, tracking HUD, and procedural SFX

Recommendation: initiate a narrowly scoped prototype spike, but do not extend EME’s canonical project schema with renderer-specific camera or shader details yet.

The strongest opportunity in mrsarac/ff-tracking is not to copy its entire rendering stack. It is to extract three reusable capabilities—camera projection, target tracking/HUD generation, and timeline-synchronized procedural audio—behind EME’s existing deterministic project model.

The critical architectural boundary is:

EME core: deterministic time, geometry, keyframes, target identity, validation, and operation semantics.

Rendering backend: Skia/SkSL, WebGL, Three.js, or another supported renderer performs GPU work.

Antigravity/REA: authors, inspects, and tests effects through explicit tools; neither becomes a runtime dependency of EME.

That preserves EME’s lightweight Node.js runtime while allowing a richer visual-effects pipeline.

One important qualification: the repository-specific findings in your brief are the supplied reconnaissance, not an independent audit of every source file, binary, shader, or benchmark. The recommendations below are based on those findings and the established EME architecture.

1. Architecture and runtime choice
Recommended design
Antigravity / REA

Creative direction, source analysis, effect authoring, QA

EME canonical project + deterministic core

Timeline · transforms · camera parameters · tracking targets · audio events · validation

Existing renderer

HyperFrames / FFmpeg

Ordinary editing and supported effects

Optional graphics backend

Skia/SkSL or WebGL

3D camera projection, DoF, shader effects

Tracking/HUD compiler

Pure geometry and timeline evaluation

Procedural audio backend

Deterministic event-to-audio rendering

Why this boundary matters

Keep the core deterministic and dependency-light; make GPU rendering an optional capability. “Zero-dependency” should describe the core package, not imply that every advanced effect can render without a graphics backend.

A practical implementation strategy:

Layer

	

Responsibility

	

Runtime requirement




EME core

	

Evaluate timeline, camera parameters, target positions, event timing

	

Existing Node.js runtime




Geometry module

	

Project coordinates, compute bounds and HUD primitives

	

Pure TypeScript/JavaScript; no rendering dependency




Renderer adapter

	

Compile supported effects into executable render operations

	

Backend-specific dependencies permitted




Shader package

	

Camera plane, focus blur, color treatments, scanlines, grain

	

GPU or shader-capable renderer




Audio module

	

Generate repeatable oscillator/envelope/pan events

	

Pure synthesis where practical; optional external encoding

Don't import Three.js, a browser, or a GPU library into the core just because one renderer needs it. Also, don't promise that HyperFrames supports a shader pass until a small compatibility test proves it. If it cannot support the required pass cleanly, use a dedicated optional renderer rather than bending EME's core around that limitation.

Which rendering technology?

First: pure geometry + renderer capability probe

Implement the camera model and HUD geometry without a GPU. Verify projection math and tracking coordinates before writing shaders. In parallel, test whether the existing HyperFrames path can accept a custom shader or rendered intermediate.

Second: optional shader backend

Reuse the repository's SkSL shader if its license and implementation allow it and a compatible Skia execution path is practical. Otherwise, prototype WebGL or another backend behind an adapter. Three.js is useful if EME needs broader 3D scene composition; it is not necessary just to tilt a flat plane.

Third: deterministic audio synthesis

Generate simple clicks, beeps, hums, and stereo panning independently of the GPU path. Render audio events into a PCM intermediate, then encode or mux through an already-supported audio workflow.

Important distinction: mathematical projection can be deterministic while the final GPU image is not bit-identical across different drivers, hardware, or shader compilers. EME should guarantee deterministic parameters and timing first, then define rendering reproducibility separately for each certified backend.

2. Schema design

I would not immediately add a large, mandatory camera object to every project or make a tracking_hud a special renderer-only track type.

Instead, use optional, versioned effect and target entities. Preserve existing 2D transforms as the fallback and keep backend-specific settings out of the canonical model.

A. Camera rig

Conceptual schema—not a claim that these properties already exist in your repository:

JSON
{
  "cameraRigs": [
    {
      "id": "camera-terminal-01",
      "version": 1,
      "scope": {
        "startTick": 0,
        "endTick": 720000
      },
      "projection": {
        "type": "perspective",
        "fieldOfViewDegrees": 42,
        "near": 0.1,
        "far": 1000
      },
      "transform": {
        "pitchDegrees": -8,
        "yawDegrees": 12,
        "rollDegrees": 0,
        "zoom": 1.15,
        "panX": 0,
        "panY": 0
      },
      "focus": {
        "mode": "target",
        "targetId": "target-heading",
        "focalDepth": 5,
        "aperture": 0.8
      },
      "keyframes": []
    }
  ]
}

The numbers are illustrative defaults, not calibrated values from the repository.

Design choices:

Use degrees explicitly for human-authored angles; convert to radians inside the renderer.

Define the coordinate system, axis directions, handedness, angle order, and camera-forward direction in the schema documentation. Otherwise, different adapters will interpret the same camera differently.

Use rational or fixed-point timeline time consistent with EME's canonical timebase. Don't introduce floating-point seconds as the source of truth.

Define whether zoom means focal-length multiplier, field-of-view change, or image scale. These are not interchangeable.

Keep targetId separate from the camera transform. A focus target and a look-at target are related but distinct concepts.

Give the camera a timeline scope. A camera effect shouldn't accidentally influence clips outside its intended shot.

For an initial spike, you may not need a full perspective camera model. A single plane with pitch, yaw, roll, zoom, and pan could deliver the repository's signature effect with much less complexity.

B. Tracking targets

Avoid embedding computed pixel coordinates as authoritative project state. Store the target's identity and source of geometry; calculate its projected bounds at render time.

JSON
{
  "trackingTargets": [
    {
      "id": "target-heading",
      "source": {
        "type": "textElement",
        "id": "heading-01"
      },
      "coordinateSpace": "sourceCanvas",
      "trackingMode": "geometry",
      "lock": {
        "acquireFrames": 2,
        "releaseFrames": 2
      }
    }
  ]
}

Possible future source types:

textElement: derive a box from the actual layout and glyph metrics.

clip: derive a box from clip geometry or explicitly supplied bounds.

normalizedRect: track a defined region independent of output resolution.

externalTrack: consume previously generated tracking data.

Do not describe textElement geometry as exact glyph bounds unless the chosen text layout/rendering backend provides actual glyph metrics. Font fallback, shaping, ligatures, kerning, and line wrapping can all affect the box.

C. HUD as a declarative effect

A HUD is better represented as a compositing effect or overlay definition that references one or more targets, rather than a completely separate track implementation in the first version.

JSON
{
  "effects": [
    {
      "id": "hud-heading",
      "type": "trackingHud",
      "version": 1,
      "targetIds": ["target-heading"],
      "style": {
        "brackets": true,
        "crosshair": true,
        "connector": true,
        "coordinates": true,
        "lockIndicator": true
      },
      "timing": {
        "lockFrames": 2
      }
    }
  ]
}

The effect compiler can turn this definition into ordinary generated geometry, text, and keyframes where possible. That gives EME a reusable abstraction without forcing every renderer to implement a custom tracking_hud track type.

D. Schema and operation compatibility

Before editing eme-project.v1.schema.json, inspect its actual structure and migration strategy. My preference is:

Keep current v1 documents valid and unchanged.

Prototype the new objects in a versioned extension or a clearly isolated experimental schema branch.

Add validation for unknown fields, invalid target references, invalid camera ranges, overlapping scopes where prohibited, and unsupported backend requirements.

Ensure project serialization, revision checks, undo/redo, and atomic operations understand the new entities.

Only promote the extension into the canonical schema after the prototype passes end-to-end rendering and round-trip tests.

Don't let a project containing an unsupported camera silently render as a normal 2D composition. Preflight should say which feature is unsupported and what, if anything, can be rendered as a documented fallback.

3. Scope and roadmap

My recommendation is a small, time-boxed spike with three deliverables, not a broad rewrite of EME.

01

Recon

Phase A — Capability and licensing audit

Required first

Inspect ff-tracking source, its Cargo workspace, shader, and audio implementation.

Identify its actual rendering path, build requirements, and how the virtual camera and target bounds are computed.

Check licenses for the repository, shader code, dependencies, fonts, and any generated assets.

Probe HyperFrames for the minimum viable custom-rendering integration.

Capture baseline render time, memory, output dimensions, and audio behavior.

Exit gate: a written architecture decision, supported-backend matrix, and licensing/dependency inventory.

02

Prototype

Phase B — Camera projection and tracking HUD

Implement a pure geometry module with no GPU dependencies.

Support one flat source canvas, one virtual camera, one text target, and a generated HUD.

Add two-frame lock-on behavior, configurable focus target, and timeline-driven camera keyframes.

Render one short clip through the selected optional backend.

Compare computed target bounds against known test geometry.

Exit gate: deterministic geometry tests, correct target alignment, and one successfully rendered camera/HUD clip.

03

Audio + QA

Phase C — Procedural SFX and integration gate

Add seeded oscillator-based clicks and lock-on beeps.

Derive stereo pan from the target's normalized horizontal position.

Align sound events to canonical timeline ticks.

Test seek/re-render behavior, clipping, channel balance, and repeatability.

Run the existing EME regression suite and compare outputs against the baseline.

Exit gate: an integrated demonstration, test evidence, performance measurements, and an explicit go/no-go recommendation.

Keep the first spike deliberately narrow: one 3840×2160 source canvas, one text target, one camera move, one HUD, a short focus transition, and a few procedural audio cues. Do not start with arbitrary 3D scenes, real-time computer-vision tracking, a full editor UI, or every shader palette.

Acceptance criteria

Area

	

Required evidence




Core isolation

	

Existing core runs without new GPU or graphics dependencies




Geometry

	

Known projected bounds match the reference calculation within a defined tolerance




Timing

	

Same project, frame rate, and seed produce identical event/frame schedules




Tracking

	

Target remains aligned during camera movement and scaling




Shader

	

Backend capability is detected; unsupported effects fail preflight clearly




Audio

	

Stable event timing and stereo pan; no unexpected clipping




Integration

	

Existing projects serialize, load, and render without regression




Performance

	

Baseline and prototype timings are measured on the certified machine




Provenance

	

Dependency, license, test, and artifact records are captured

Don't set a performance threshold arbitrarily before measuring the existing render path. Record the baseline first, then set an acceptable overhead for the spike.

4. Where REA fits

Use REA, but source-first rather than binary-first.

The highest-value initial questions are:

How does the lens implementation map screen coordinates onto the tilted plane?

How are glyph bounds produced, and are they based on actual layout metrics or predefined geometry?

How are focus distance and circle of confusion mapped to blur radius?

Which shader operations are expensive, and which can be simplified without visibly changing the result?

How are audio events scheduled and panned relative to the target?

Which rendering operations are tied to Skia/Metal, and which are renderer-independent mathematics?

Then use profiling to identify genuine bottlenecks. Binary disassembly and GPU instruction analysis can be useful if source inspection and ordinary profiling leave an important question unresolved. They should not be the first milestone.

Also, distinguish Metal dispatch analysis from SkSL source analysis. The latter can establish intended shader behavior; the former requires evidence that the relevant code actually runs through the Metal path and suitable profiling or capture tooling. Do not infer GPU instruction latency merely from shader source or CPU wall-clock timings.

The practical goal is to extract a portable effect model—not to reproduce every low-level optimization in the original project.

5. Antigravity execution prompt

Use the following as the first task. It explicitly stops the agent from modifying the certified release baseline prematurely.

Writing
EME Experimental Spike — ff-tracking Camera, HUD & Procedural Audio
Objective

Evaluate and prototype the most reusable procedural motion-graphics capabilities from mrsarac/ff-tracking for the Editing Mechanics Engine (EME).

Repository: https://github.com/mrsarac/ff-tracking

EME workspace: /Users/atharvpaharia100/editing-mechanics-engine

REA workspace: /Users/atharvpaharia100/REA

The existing editing-mechanics-engine@0.1.0-rc1 candidate has completed its internal LP-08 certification sequence. Treat the certified baseline as read-only during this spike. Do not create or publish a new public release.

Mandatory operating instructions

Inspect the actual repositories, files, schemas, tests, and scripts before making assumptions.

Use required GSD actions to achieve the goals and wherever needed.

Do not claim a test, benchmark, shader path, or capability passed unless its execution and evidence support that claim.

Separate observed facts, repository claims, hypotheses, and recommendations in the final report.

Preserve EME's canonical timebase, rational frame-rate semantics, half-open intervals, atomic operations, revision checks, serialization behavior, and renderer capability preflight.

Keep the EME core dependency-light and free of mandatory GPU, browser, or graphics dependencies.

Put backend-specific rendering in an optional adapter.

Do not alter the certified baseline or its release artifacts. Work in an isolated experimental branch or worktree, and record the base commit.

Do not perform destructive cleanup, install unreviewed binaries, or execute untrusted build scripts without inspecting them first.

Do not publish packages, tags, releases, or repository changes externally.

Phase 1 — Reconnaissance

Inspect the ff-tracking source before building or executing it.

Investigate:

Workspace structure, entry points, dependency graph, licenses, and build requirements.

The flat, lens, hud, and score components described in the supplied reconnaissance.

Camera projection equations, coordinate systems, depth-of-field calculation, and focus-target representation.

How text and glyph bounds are obtained and whether they represent actual glyph metrics or predefined geometry.

Shader effects, rendering backend requirements, and potential intermediate-image interfaces.

Procedural audio generation, timing, stereo panning, clipping control, and output format.

Which capabilities can be represented independently of the original renderer.

Inspect REA's available analysis tools and documented workflow. Use source-level analysis first. Use binary or GPU-level analysis only when justified by a concrete unanswered question.

Audit licensing and transitive dependencies. Do not assume that an open-source repository makes every dependency or asset unrestricted.

Phase 2 — EME compatibility probe

Inspect EME's actual project schema, canonical timebase, operation system, renderer adapters, test framework, and existing pilot conventions.

Determine whether HyperFrames can execute the required custom shader or accept a rendered intermediate without invasive changes. Verify this experimentally rather than assuming support.

Compare viable approaches:

pure geometry module plus existing renderer;

optional Skia/SkSL rendering adapter;

optional WebGL or Three.js adapter;

pre-rendered effect intermediate consumed by the existing pipeline.

Recommend the least complex approach that meets the visual requirement. Keep core dependencies unchanged.

Deliver a capability matrix with evidence, constraints, estimated integration effort, and a go/no-go decision.

Phase 3 — Minimal experimental prototype

Only proceed if the compatibility probe identifies a viable path. Implement the smallest useful prototype:

One 3840×2160 source canvas.

One text target.

One virtual camera with pitch, yaw, roll, zoom, pan, and timeline keyframes.

One computed tracking bounding box.

One HUD with target brackets, crosshair, coordinates, and two-frame lock-on behavior.

One focus target and a minimal focus transition, if supported by the selected backend.

A few deterministic procedural sound events, including a click and a lock-on beep, with stereo panning based on normalized target position.

Implement camera and HUD geometry as pure functions wherever practical. Keep renderer-specific shader execution isolated behind an optional adapter.

Do not introduce mandatory dependencies or silently degrade unsupported effects. Use an experimental schema or extension until compatibility and migration behavior are proven. Do not change the canonical schema without documenting backward compatibility and obtaining evidence from tests.

Phase 4 — Verification

Add focused automated tests for:

Coordinate projection, transform order, and known bounding boxes.

Camera keyframe evaluation and boundary conditions.

Target identity, missing references, and invalid parameter rejection.

Two-frame lock-on timing and timeline seeks.

Rational frame rates and canonical tick conversion.

Stable event timing and seeded audio synthesis.

Stereo pan at left, center, and right positions.

Audio clipping and output inspection.

Unsupported backend capability detection.

Project serialization round trips and existing-project compatibility.

Existing EME regressions.

Render a short artifact and inspect representative frames and decoded audio. Record actual commands, exit codes, environment versions, artifact paths, hashes, and measurements.

Compare prototype performance with the existing render path on the same machine. Do not assert bit-identical cross-platform GPU output unless it has actually been demonstrated.

Required deliverables

Create an experimental report containing:

Executive recommendation and go/no-go decision.

Verified repository architecture and licensing/dependency findings.

Proposed EME architecture and schema design.

Minimal implementation summary and changed-file inventory.

Test matrix with pass/fail status and evidence.

Rendered artifact details and visual/audio inspection results.

Baseline-versus-prototype performance measurements.

Known limitations, unresolved risks, and next-step recommendation.

Explicit statement that the LP-08 certified baseline was not modified.

If the renderer compatibility probe fails, stop before implementing the full prototype. Report the evidence and recommend the next viable backend instead.

Completion rule

Do not declare the feature production-ready merely because a demo renders. The spike is complete when its evidence supports a clear decision about whether and how to integrate the capability into EME.

Final engineering decision

Proceed with the spike. Do not yet commit to a permanent camera schema or a custom GPU renderer.

The order matters: establish portable geometry, prove the rendering boundary, then add the HUD and audio. If the first prototype succeeds, EME gains a reusable procedural-effects system rather than a one-off clone of a terminal animation. If it fails, the capability probe should identify whether the blocker is HyperFrames integration, shader portability, text-bound accuracy, or performance—before those constraints spread through the canonical schema.