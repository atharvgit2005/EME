Review verdict: Approved with constraints

Proceed with Phase 1 and Phase 2 as an isolated, evidence-producing reconnaissance spike. Your boundaries are right: keep the certified EME baseline immutable, extract the mathematics independently, and establish the actual renderer capabilities before implementing complex shaders.

I would add five constraints before execution:

Treat extracted equations as hypotheses until verified against the original source and rendered reference frames. A mathematically plausible camera can still use the wrong axis convention, rotation order, or focal-length interpretation.

Separate geometric accuracy from font-layout accuracy. A 0.6 em character advance is a monospace approximation, not a universal JetBrains Mono or Inter metric. Font size, shaping, kerning, ligatures, and actual renderer measurements must be accounted for.

Test the existing HyperFrames execution path, not just whether CSS or WebGL works in a standalone browser. A capability only counts as supported if it works in the actual render pipeline.

Do not assume the license inventory is verified. Confirm the repository's actual license files and the exact font and RNG implementation and version being used.

Keep the spike additive and disposable. No production schema edits, dependency changes, release-artifact changes, or new production dependencies during these two phases.

The key outcome is not “a shader ran.” It is a capability matrix that establishes which implementation path can deliver the effect with acceptable correctness, determinism, and integration cost.

1. Establish these test tolerances before execution

Use the following as initial acceptance thresholds. They are engineering targets for the spike, not claims about the original repository's accuracy.

Test

	

Initial acceptance threshold




Pure projection math

	

Maximum absolute error of 
10
−
6
10
−6
 canvas pixels against an independently calculated reference for well-conditioned test cases




Projected target bounds

	

Within 1 pixel of a trusted reference after applying the same rounding convention




Identity transform

	

Exact identity within floating-point tolerance; no unintended translation or scaling




Rotation order

	

Explicitly documented and covered by noncommuting rotation tests




Frame/tick conversion

	

Exact integer results for supported rational frame rates; no accumulated frame drift




Repeated evaluation

	

Identical geometry and event schedules for identical inputs




Font metrics

	

Compare actual measured advances and line bounds; do not impose a universal 0.6 em rule




HyperFrames integration

	

Successful render through the real pipeline, with decoded output inspected




WebGL/shader path

	

No silent fallback; record actual renderer, GPU/software mode, shader compilation, and output




Audio event scheduling

	

Event ticks remain stable under seeking and rerendering




Audio pan

	

Correct left/center/right behavior; no channel reversal




Baseline integrity

	

No changes to certified production files or release artifacts

For projection math, 
10
−
6
10
−6
 pixels is a useful numerical unit-test tolerance when comparing two equivalent double-precision calculations. It is not a realistic tolerance for a rendered image or a different GPU implementation. The 1-pixel bounds threshold is the more practical integration target.

Important geometry distinction

Your plan says to map flat-canvas coordinates into projected screen-space bounding boxes. Define exactly which box is being tested:

Projected rectangle: project the four corners and take their screen-space axis-aligned bounding box.

Visible glyph bounds: use actual glyph/layout geometry, then project that geometry.

Visible rendered bounds: inspect the final pixels, which can differ because of antialiasing, clipping, blur, and depth-of-field.

These are three different measurements. Start with projected rectangles, then add rendered-image checks. Do not treat the axis-aligned bounding box of a projected rectangle as the exact visible glyph boundary.

2. Phase 1 — mathematical extraction requirements

The extraction should produce a small, documented set of pure functions, not just one large projection implementation.

Suggested function boundaries:

JavaScript
projectPoint(point, camera, viewport)
intersectRayWithPlane(origin, direction, plane)
projectRect(rect, camera, viewport)
computeProjectedBounds(points)
evaluateCameraAtTick(camera, tick)
evaluateTrackingLock(state, frameIndex)
computeAudioPan(normalizedX)

These are proposed interfaces; adapt them after inspecting the original source.

Required mathematical tests

Identity camera: source coordinates map to the expected viewport.

Translation and zoom: known input points produce analytically predictable output.

Pitch, yaw, and roll: test each axis independently and in combinations.

Rotation order: test cases where changing the order changes the result.

Ray-plane intersection: parallel rays, intersections behind the camera, near-zero denominators, and valid intersections.

Degenerate geometry: zero-size rectangles and targets outside the viewport.

Clipping: target partially or entirely outside the frame.

Invalid inputs: NaN, infinity, invalid focal lengths, and unsupported parameter ranges must fail validation rather than propagate silently.

Numerical stability: extreme camera configurations must be rejected or explicitly handled.

Document the coordinate conventions before implementing these functions: origin, axis directions, handedness, camera-forward direction, viewport origin, and angle units.

Font metrics

For JetBrains Mono and Inter, use a deterministic reference fixture with the exact font files and renderer used by the prototype.

Record:

Font family and file hash.

Font size and weight.

Actual advance width per glyph or string.

Line height and line wrapping.

Whether shaping, kerning, ligatures, or fallback fonts are enabled.

A monospace advance near 0.6 em may be useful as a rough fixture expectation, but do not hardcode it as a general text-layout rule. Inter is proportional, and actual measurements depend on the selected font configuration and shaping path.

3. Phase 2 — renderer capability matrix

Run the three approaches through the same minimal test composition so their results are comparable.

A. CSS 3D transforms + GSAP
Probe first

Test: perspective, transform origin, camera movement, and animated target alignment.

Pass condition: the effect renders correctly through the actual HyperFrames path, and the final output preserves the expected perspective and animation timing.

Limitation to investigate: CSS transforms alone do not establish that a custom per-pixel SkSL shader, depth-of-field effect, or full-screen post-processing chain is available.

B. WebGL custom shader canvas
Probe second

Test: render the flat source into a texture, execute a minimal camera-projection shader, and export a frame through HyperFrames.

Pass condition: the real render process executes the shader and produces the expected decoded output. Capture shader compilation results, renderer information, and whether GPU or software rendering was used.

Limitation to investigate: a WebGL context working interactively is not proof that the same context, texture lifecycle, or export path works in the render environment.

C. Optional Skia/SkSL adapter or pre-rendered intermediate
Fallback path

Test: determine whether the existing environment can execute the original shader or consume a rendered intermediate without invasive changes to EME.

Pass condition: a short artifact is generated and consumed by the existing pipeline with correct dimensions, color handling, timing, and audio synchronization where applicable.

Limitation to investigate: pre-rendering can simplify integration but may add storage, latency, and iteration cost. SkSL source compatibility does not guarantee a usable Skia runtime.

For each candidate, capture the same evidence:

Exact command and exit code.

Actual render engine and version.

Screenshot or decoded frame from the produced artifact.

Target coordinates before and after projection.

Render duration and peak memory, where measurable.

Whether the capability works in a clean run without an interactive browser session.

Failure reason and required dependencies.

A candidate that cannot be executed in the actual pipeline should be marked Not Demonstrated, not Pass. If a path fails because of environment setup, distinguish that from a proven technical incompatibility.

4. Procedural audio preparation

Keep audio preparation limited to event algebra and a tiny offline fixture. No external audio dependency needs to enter EME core.

For a target at normalized horizontal position 
𝑥
x, where 
𝑥
∈
[
0
,
1
]
x∈[0,1], a simple linear pan convention is:

𝑝
=
2
𝑥
−
1
p=2x−1

This yields left at 
−
1
−1, center at 
0
0, and right at 
+
1
+1. Document the convention so the eventual audio backend interprets it consistently.

For a click or beep event, model the canonical event as:

JSON
{
  "id": "lock-beep-01",
  "startTick": 24000,
  "durationTicks": 6000,
  "targetId": "target-heading",
  "normalizedX": 0.75,
  "type": "lockBeep",
  "seed": 42
}

These numbers are illustrative only. The important constraints are that event timing uses EME's canonical ticks, the event references a stable target, and any randomness is seeded.

Test these behaviors:

The event starts on the same tick after seeking and rerendering.

Stereo panning follows the target's normalized position.

Events outside their timeline interval are not emitted.

Synthesis produces finite samples without unintended clipping.

Output sample rate, channel count, and encoding are explicitly specified.

Overlapping sounds are mixed with a documented gain policy.

Do not implement sophisticated synthesis or claim audio fidelity in this phase. Prove the scheduling model first.

5. Workspace isolation and final go/no-go

One final safeguard: if experiments/tracking-camera/ is created inside the main repository, the experiment is isolated by directory but not by Git history. A separate Git worktree based on the certified commit is safer. If you must use the requested directory, record the baseline commit and verify that all protected production and release paths remain unchanged.

At the end of Phase 1 and Phase 2, the report should answer these four questions clearly:

Are the camera and HUD calculations portable, independently testable mathematics?

Can the existing HyperFrames render pipeline execute the required effect without invasive changes?

Which rendering approach provides the best trade-off between fidelity, complexity, portability, and runtime cost?

Is there enough evidence to justify a Phase 3 prototype, and what exact limitations must it accept?

Approval is granted to begin Phase 1 and Phase 2 under these constraints. Do not start complex shader development or change the canonical EME schema until the capability matrix contains observed evidence and a defensible implementation choice.