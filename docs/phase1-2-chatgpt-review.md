Architecture review: Phase 1 & 2 completion and Phase 3 authorization

Verdict: APPROVED TO BEGIN PHASE 3 — with explicit prototype-only constraints and a few corrections to the acceptance criteria.

On the evidence in your completion report, the hybrid architecture is a sensible next step. The mathematical module has a defined interface, the CSS and WebGL approaches reportedly render through HyperFrames, and the native Rust/Skia route introduces a toolchain dependency that is unnecessary for the first prototype.

I am treating the test counts, render timings, frame inspections, and isolation claims as reported results, not independently verified facts: I have not executed the local probes or inspected the archived artifacts.

The key architectural decision is sound: preserve crisp, seekable DOM typography as the default, and add GPU post-processing only when an effect requires it. Phase 3 should now prove that the two paths compose correctly in one end-to-end project—not merely that each works independently.

1. Review of the findings

Area

	

Assessment

	

Decision




Pure projection module

	

Good separation of geometry from rendering

	

Proceed; add edge-case tests as the prototype evolves




CSS 3D + GSAP

	

Promising for crisp typography and seekable animation

	

Use as the default composition path




WebGL post-processing

	

Appropriate for per-pixel lens effects

	

Use as an optional, capability-gated effect




Rust/Skia companion

	

Reported probe failed because Cargo was unavailable

	

Defer; this does not prove the renderer is inherently incompatible




Procedural audio

	

Fits the lightweight core objective

	

Proceed with a standalone experiment-only synthesizer




Licensing

	

Inventory exists

	

Verify actual licenses and dependency versions before redistribution

Three corrections to the architecture

1. CSS 3D does not have zero overhead. It avoids an additional shader pass, but layout, paint, compositing, and rendering still cost time. Call it the default, lower-complexity path until performance measurements establish the actual overhead.

2. Define the transform ownership. projection.js should own the canonical camera mathematics. Its output should feed the CSS transform, while the HUD should use the same projected coordinates. Avoid applying camera transforms independently in CSS and JavaScript in ways that double-apply rotation, zoom, or perspective.

3. Make post-processing order explicit. If WebGL processes the whole composition, typography may need rasterization. That can introduce texture-resolution limits, blur, alpha-edge artifacts, and extra memory use. The prototype must compare:

CSS composition without post-processing.

CSS composition followed by a WebGL pass.

HUD alignment before and after that pass.

A sensible initial pipeline is:

DOM source → camera transform → HUD overlay → optional optical post-process → encoded video

Treat this as a starting point, not a fixed rule. The HUD may need to be composited after the optical pass if it should remain sharp and undistorted. The intended visual design should decide the order.

2. Phase 3 acceptance criteria

I approve the proposed vertical slice, with these gates added before the agent begins implementation.

Phase 3 — Definition of done

0 of 8 acceptance gates checked

Check all

Isolation

All new code, fixtures, logs, and renders stay under experiments/tracking-camera/; protected production and release files remain unchanged.

Camera and HUD

Known target bounds are within 1 output pixel of the independent projected-geometry reference for the selected test frames.

Seekability

Rendering frames in sequence or requesting the same timestamps out of order produces the same camera state and HUD coordinates.

WebGL composition

The optional post-process is exercised through HyperFrames and its output is inspected for alpha, clipping, text sharpness, and HUD alignment.

Audio synchronization

Synthesized event timing is sample-accurate in the PCM output; final mux timing is measured against video frames and reported.

Audio safety

No NaN/Inf samples, unintended clipping, channel reversal, or unexplained gain changes.

Reproducibility

Record input hashes, seeds, tool versions, commands, output hashes, and repeat-render comparisons.

Regression safety

Run relevant existing tests and verify the certified baseline is unchanged.

These are acceptance gates for the spike, not a new production certification standard. If a gate fails, document the failure and its impact rather than weakening the criterion after seeing the result.

3. Specific implementation constraints
Procedural audio

There is one source discrepancy to resolve before synthesizing the hum: the earlier reconnaissance described 50 Hz mains hum, while this proposal specifies 60 Hz. Since the stated target environment is India, use 50 Hz plus harmonics as the initial default, unless direct inspection of tools/sfx.py confirms that the intended reference deliberately uses 60 Hz. Make the frequency configurable.

For the pentatonic beeps, A4/C5/D5/E5/G5 is a coherent A-minor-pentatonic palette. Keep the event timing, oscillator phase, envelope, and seed deterministic. Do not introduce randomness that depends on the order in which frames are requested.

Camera and tracking

Preserve the established Rz × Ry × Rx rotation convention and document units.

Test near-plane clipping, invalid camera parameters, and targets partly outside the viewport.

Define whether the HUD follows the distorted image or remains in undistorted screen space.

Use a stable target ID, not a transient array index.

Keep computed screen coordinates as derived state, not authoritative project data.

Performance

The reported 9.2-second and 11.3-second runs are useful baselines, but they do not establish the relative cost of the individual rendering paths unless the test environment, output settings, and measurement procedure were identical.

Measure the integrated pipeline using the same source, 90-frame duration, resolution, frame rate, and output settings. Report total render time and, where possible, separate source composition, shader, and muxing time.

4. Authorized kickoff prompt for Antigravity
Writing
Phase 3 Authorized: EME Tracking Camera & HUD Vertical Prototype
Authorization and scope

Proceed with Phase 3 in:

experiments/tracking-camera/prototype/

The Phase 1 and Phase 2 completion report is the current planning baseline. The reported CSS 3D and WebGL probe results have not been independently certified by this architecture review.

The certified EME v0.1.0-rc1 baseline and all protected production/release paths must remain unchanged. Do not modify the canonical production schema, introduce mandatory runtime dependencies, publish packages, or create release tags.

Use required GSD actions to achieve the goals and wherever needed.

1. Inspect before implementing

Read the actual experimental projection module, its tests, the capability matrix, both renderer probes, and the original ff-tracking camera, HUD, shader, and audio sources.

Verify the coordinate conventions, transform order, focal-depth behavior, target-box semantics, and audio event timing against the original source. Record any differences between the proposed design and verified source behavior.

Resolve the 50 Hz versus 60 Hz hum discrepancy by inspecting the source. Use 50 Hz as the initial default unless the intended reference establishes otherwise; make it configurable.

Verify the licensing inventory against actual repository license files and dependency versions.

2. Build the minimal vertical slice

Implement only the experimental prototype:

A deterministic 1920×1080 synthetic terminal source.

A camera controller driven by the existing pure projection module.

A designated text target with a stable ID.

A tracking HUD with brackets, crosshair, coordinates, and two-frame lock acquisition.

A CSS 3D + GSAP default composition path.

An optional WebGL optical pass for selected lens effects.

A standalone, dependency-free procedural audio synthesizer.

A final video render and synchronized audio mux through the existing supported workflow.

Keep all new source code, fixtures, test outputs, reports, and rendered artifacts under the experiment directory wherever practical. Do not add dependencies to the EME core.

3. Camera and HUD correctness

The projection module must remain the canonical source of camera mathematics. Avoid double-applying camera transforms between JavaScript and CSS.

Use independent reference fixtures to verify target projection. For selected test frames, require projected target bounds to match the independent reference within 1 output pixel, using a documented rounding convention.

Cover identity transforms, individual and combined rotations, zoom, aim drift, near-plane clipping, out-of-frame targets, degenerate geometry, and invalid input rejection.

Verify that sequential and out-of-order frame requests produce identical camera state and target coordinates.

Document whether the HUD is intended to remain sharp in screen space or be distorted together with the image. Implement the selected behavior consistently across both render paths.

4. WebGL integration

Execute the optional shader pass through the actual HyperFrames pipeline.

Compare:

CSS composition without the shader.

CSS composition with WebGL post-processing.

HUD alignment and text sharpness before and after post-processing.

Inspect alpha handling, texture dimensions, clipping, color changes, frame timing, shader compilation, and the actual renderer/backend used.

If the WebGL path fails, preserve the CSS-only working prototype and document the failure. Do not silently replace the shader with an approximation.

5. Procedural audio

Implement the hum, keystroke clicks, and lock-on beep events in a standalone experiment-only script.

Use canonical timeline ticks for event scheduling and deterministic oscillator/envelope evaluation. Make the seed and synthesis parameters explicit.

Test left, center, and right stereo positions. Check sample finiteness, clipping, channel orientation, and event placement in decoded PCM.

Measure synchronization in the PCM output and after final muxing. Report sample-level event timing and the final A/V offset; do not claim synchronization solely because the output file contains both streams.

6. Verification and evidence

Run focused tests plus relevant existing EME regression tests.

Produce:

A short rendered video with representative timestamps.

Extracted still frames showing camera projection and HUD alignment.

Decoded audio inspection and event timing results.

Performance comparison using identical render settings.

Repeat-render comparison with explicit tolerances.

Commands, exit codes, environment/tool versions, artifact paths, and SHA-256 hashes.

A test matrix that distinguishes PASS, FAIL, NOT DEMONSTRATED, and NOT APPLICABLE.

A final report listing all changed files and confirming whether protected production/release files remain unchanged.

Do not claim bit-identical GPU output across different render environments without evidence. Do not claim production readiness or promote the experimental schema into the canonical EME schema.

Completion criteria

Complete the vertical slice only when the camera, HUD, optional shader pass, and procedural audio have been exercised together in a rendered artifact and the acceptance evidence has been captured.

If any critical gate fails, report the failure, preserve the working parts, and recommend the next smallest corrective experiment rather than expanding the scope.

Final decision

Phase 3 is authorized. Build the integrated demo, measure it, and preserve the certified baseline. The success criterion is not visual resemblance alone: it is a reusable, deterministic camera/HUD model with an optional effects backend and correctly synchronized audio, all demonstrated through EME's real render pipeline.
