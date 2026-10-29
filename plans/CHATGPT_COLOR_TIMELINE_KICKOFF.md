EME Architecture Directive: Phases 17–19

The next strategic evolution should be built around one principle: automated generation creates the first edit; deterministic grading and a genuinely editable timeline turn that edit into a finished creative product.

My recommendation is to authorize three sequential milestones:

17
CG-01 — Intelligent Color Grading Engine
Authorized to begin

Build the color-processing core, LUT engine, professional grading controls, scene-analysis recommendations, GPU preview, and deterministic FFmpeg render path.

18
TL-01 — Interactive Manual Timeline
Implement the manual non-linear editing workspace: multitrack timeline, frame-accurate scrubbing, trim/split/ripple/slip/slide operations, drag-and-drop, audio waveforms, snapping, and undo/redo.
19
RT-01 — Round-Trip Integration and Consistency
Connect canonical EME project state, the manual timeline, interactive playback, grading, and deterministic export with validated imports, migrations, and round-trip tests.
20
Production Hardening and Release Readiness
A separate final gate for performance, regression, reliability, licensing, project migration, and release evidence.

Phase 17 is the immediate priority. Do not start the full timeline implementation in parallel with an unstable grading contract. The timeline will need to manipulate grades, preview their effects, and render exactly the same operations.

1. Core architecture and invariants
A. Timebase and timeline representation

EME's existing canonical timebase remains 120,000 integer ticks per second. The internal NLE state should use that same timebase; microseconds should appear only at an external interoperability boundary.

The conversion is:

microseconds
=
round
⁡
(
ticks
×
25
3
)
microseconds=round(
3
ticks×25
	​

)
ticks
=
round
⁡
(
microseconds
×
3
25
)
ticks=round(
25
microseconds×3
	​

)

Implement these using deterministic integer/rational arithmetic, with an explicitly defined rounding rule. Do not use floating-point seconds as the stored source of truth.

For every clip, preserve half-open intervals:

[
𝑠
𝑡
𝑎
𝑟
𝑡
,
𝑒
𝑛
𝑑
)
[start,end)

That means the beginning belongs to the interval and the ending does not. Convert endpoints individually, then calculate duration from the converted endpoints. This avoids cumulative drift from repeatedly adding rounded frame durations.

Examples of exactly representable frame durations in EME ticks:

Frame rate

	

Ticks per frame




24 FPS

	

5,000




30 FPS

	

4,000




60 FPS

	

2,000




24000/1001 FPS

	

5,005




30000/1001 FPS

	

4,004

For variable-frame-rate sources, use actual presentation timestamps. Do not infer every frame's timestamp from its frame index.

CapCut compatibility boundary

Treat the microsecond timing model you reverse-engineered from local CapCut drafts as an observed external representation—not a guaranteed, version-independent specification.

Build an EME-owned adapter with versioned test fixtures. Preserve the canonical project and maintain an explicit import/export loss report for unsupported effects, metadata, retiming curves, or timeline structures.

Do not assume CapCut supports an EME sidecar or custom metadata field. Keep any round-trip bookkeeping in EME-owned files unless a particular external representation has been verified.

B. Non-destructive project mutation

All manual edits and grading changes must operate on versioned project state rather than destructively modifying media.

The core mutation rules are:

Every operation has validated inputs, preconditions, and a defined inverse or history representation.

State updates occur atomically: validate a candidate state before committing it.

Every committed change advances a revision number.

Undo and redo restore exact prior logical state.

Source media remains unchanged; trims and splits alter references and ranges, not original files.

A stale UI, CLI, or agent mutation must not silently overwrite a newer project revision.

An unsuccessful operation leaves the previous revision unchanged.

Preview and export both consume the same canonical grading and timeline state.

Keep the existing EME v1 project schema immutable during Phase 17. Introduce a standalone color-grade.v1 contract first. If Phase 19 requires changes to the project document, use an explicit, versioned migration rather than silently changing the meaning of v1.

2. CG-01 — Intelligent Color Grading Engine

The engine needs four layers: color-management contracts, deterministic pixel operations, grading intelligence, and preview/render execution.

A. Color-processing graph

Use the following as the versioned default graph:

1. Input decoding and color normalization

Metadata, range, matrix, transfer function, channel format

2. White balance, temperature/tint, exposure

Defined linear-light transforms and documented units

3. Lift / Gamma / Gain / Offset

Per-channel primary correction with specified mathematics

4. Cubic RGB and Luma Curves

Master, red, green, blue, and luma curves

5. Selective HSL and skin-tone protection

Eight hue ranges with defined overlap and confidence

6. 3D LUT and intensity blend

Declared LUT input domain and tetrahedral interpolation

7. Output transform and range encoding

Explicit output color space, bit depth, and metadata

Important: this is the logical sequence, not a license to apply every operation in the same numerical color domain. Every operation must specify its expected domain, and the compiler must insert any required conversions. Scene-referred linear operations and display-referred creative LUTs cannot safely be treated as interchangeable.

Use a defined SDR Rec.709 working configuration for CG-01. Architect the interface for additional color spaces and HDR later, but do not silently guess the color space of unsupported or untagged input.

Color-management systems such as OpenColorIO make explicit separation between color spaces, reference spaces, display transforms, and LUT transforms. That is a useful architectural model for EME's processing contract. 
opencolorio.readthedocs.io
+1

B. LUT engine

CG-01 needs a standalone, thoroughly tested .cube parser and evaluator supporting:

17³, 33³, and 65³ 3D LUTs.

TITLE, LUT_3D_SIZE, DOMAIN_MIN, and DOMAIN_MAX.

Exact entry-count validation, finite RGB values, valid domains, and bounds-safe sampling.

A canonical internal axis order, verified against identity and asymmetric test LUTs.

Nearest, trilinear, and tetrahedral reference evaluation as appropriate for testing; tetrahedral is the required default for grading.

Strength from 0.0 through 1.0.

Stable cache keys based on LUT content hash plus interpretation metadata.

Clear rejection or explicitly documented handling of 1D-only and combined 1D/3D LUT files.

The FFmpeg lut3d filter supports .cube inputs and tetrahedral interpolation. The FFmpeg curves and eq filters also provide useful primitives for the headless renderer. Their availability does not mean their semantics automatically match EME's controls; that equivalence must be tested. 
ffmpeg.org
+1

For intensity blending, define one precise rule:

𝐶
graded
=
(
1
−
𝑤
)
𝐶
before LUT
+
𝑤
 
L
U
T
(
𝐶
before LUT
)
C
graded
	​

=(1−w)C
before LUT
	​

+wLUT(C
before LUT
	​

)

where 
𝑤
∈
[
0
,
1
]
w∈[0,1] and both color values are expressed in the LUT's declared input/output domain.

At intensity zero, the LUT must be a genuine bypass. At intensity one, it must produce the full LUT result.

Multi-LUT preview matrix

Each comparison tile should apply its candidate LUT independently to the same base image and grade. Do not accidentally stack each candidate LUT on the result of the preceding one.

Begin with four simultaneous preview choices. Cache parsed tables and upload textures once. For the final 4-up implementation, measure actual frame time and memory usage.

For named looks such as print-film emulations, teal/orange, bleach bypass, and monochrome, use original generated LUTs or user-provided/licensed assets. Do not bundle third-party LUT files without verified redistribution rights.

C. Professional grading controls

The canonical color-grade.v1 state should provide:

Exposure in EV.

Temperature and tint with defined units and adjustment limits.

Lift/Gamma/Gain plus Offset.

Cubic Bézier master/luma and RGB curves with endpoint, control-point, and monotonicity validation.

Eight selective hue channels: red, orange, yellow, green, cyan, blue, purple, and magenta.

Per-channel hue, saturation, and lightness adjustments, with circular hue handling and smooth overlapping selection weights.

One active creative LUT reference plus intensity.

Skin-protection settings and analysis confidence.

Enabled/disabled states and a stable grade revision/hash.

The UI should update the canonical grade state, not maintain a separate hidden set of slider values.

D. Scene intelligence and skin-tone protection

For CG-01, implement an analysis-and-recommendation layer first, not an autonomous grading agent that makes unreviewable changes.

It should estimate or report:

Possible white-balance error and a suggested neutral correction.

Exposure and highlight/shadow clipping risk.

Approximate CCT and green/magenta tint with confidence.

Skin-region mask/coverage confidence.

A vectorscope display and documented skin-tone reference line for the selected color standard.

CCT inferred from an arbitrary scene is not ground truth. The engine must distinguish a measured neutral reference, a metadata-derived estimate, and a heuristic inference.

Skin protection should preserve skin-region grading within an explicit tolerance when enabled. It must not forcibly rotate every skin pixel toward a fixed line simply because the colorscope displays an I-line.

The user remains in control: suggestions are previewed and accepted or rejected. They do not silently mutate project state.

3. Phase 18 — TL-01 Interactive manual timeline

Phase 18 should implement a proper editing surface, not just a visual ruler beneath the preview.

Its canonical timeline contract should represent:

Track identity, type, ordering, mute/lock/visibility state, and compositing order.

Clip identity, source media, source in/out, timeline start/duration, transforms, opacity, and attached effect/grade references.

Audio clips, waveform caches, gain, fades, channel configuration, and timeline placement.

Text, stickers, overlays, and supported effect tracks.

Keyframe and speed-curve data with explicit supported semantics.

Selection, playhead, zoom, scroll, snapping, and temporary drag state separate from committed edit state.

The editor should support these operations as atomic project transactions:

Operation

	

Required behavior




Trim in/out

	

Adjust source range without altering the source media




Split at playhead

	

Create two valid adjacent segments with correct source/timeline ranges




Ripple trim

	

Trim and shift eligible downstream clips in one validated transaction




Slip

	

Change the source range without moving the clip's timeline interval




Slide

	

Change timeline placement while preserving intended adjacent edit behavior




Reorder tracks/clips

	

Preserve identity and compositing semantics




Drag/drop

	

Preview a candidate transaction; commit only after validation




Magnetic snapping

	

Snap against defined timeline targets; do not quantize arbitrary pointer positions permanently




Audio waveform/scrubbing

	

Use cached waveform data and timestamp-aligned audio playback




Undo/redo

	

Restore exact logical project revisions

Frame-accurate seeking should use source PTS and the current frame-rate/timebase contract. Use a small display-time snapping threshold derived from the timeline zoom level, but store only an actual validated edit position.

Do not begin with every effect type visible. Start with video, audio, titles/overlays, and grading. Add stickers, advanced effects, and complex retiming once the core edits are stable.

4. Phase 19 — E2E integration and round-trip validation

Phase 19 has to prove one authoritative project state drives the complete path:

Canonical project → timeline operations → timeline state → playback preview → deterministic renderer → saved project.

Round-trip requirements:

A no-op load/save round-trip preserves the canonical logical state.

A timeline trim, split, move, or grade change updates the same canonical project model.

Preview, scopes, and renderer consume the same committed state revision.

The renderer receives a snapshot of a specific revision so later UI mutations cannot change an active render job.

Failed edits do not partially modify the project.

A crash or interrupted render cannot corrupt project data or the previous valid render.

Every exported grade uses the same operation ordering, control formulas, LUT asset hash, LUT input domain, and interpolation mode.

Unsupported imports produce explicit loss reports; they must not be silently flattened or discarded.

Import/export conversion records the source version, target version, conversions, rounding, and unsupported operations.

The CapCut adapter remains separate from the EME canonical schema. Use copies of test projects, never mutate a user's CapCut draft as part of testing.

Preview/render parity

A deterministic FFmpeg renderer is a critical part of CG-01. Keep its FFmpeg version, filter graph, color conversion settings, interpolation mode, and relevant pixel formats recorded in the render manifest.

For pixel-level verification, compare lossless decoded outputs before H.264/H.265 encoding introduces codec error. Then separately test normal delivery encodes.

The GPU preview does not have to be bit-identical to every final compressed output, but its grading transform must remain within a predetermined, measured tolerance of the reference path.

5. Detailed Phase 17 kickoff specification

The following is the execution contract I authorize Antigravity to implement first.

Writing
CG-01 / Phase 17 — Intelligent Color Grading Engine

Architecture Lead Decision: AUTHORIZED TO EXECUTE

Project: Editing Mechanics Engine (EME)

Milestone: CG-01 — Color Grading Engine

Phase: 17

Use the required GSD actions to achieve the goals and wherever needed.

0. Mission

Implement EME's first versioned, non-destructive color-grading subsystem with:

A canonical grading state contract.

An independent .cube 3D LUT parser and evaluator.

Defined white-balance, exposure, Lift/Gamma/Gain/Offset, curves, and eight-channel HSL operations.

Skin-protection and scene-analysis recommendations.

A GPU-backed interactive preview and multi-LUT comparison matrix.

A deterministic FFmpeg render compiler.

Reproducible color-processing fixtures, numerical parity tests, and performance benchmarks.

Build the grading core first. Do not implement the full manual timeline during Phase 17. Phase 18 will consume the grading contract established here.

The required outcome is a grading system with stable semantics across preview and final rendering—not a collection of sliders that happen to change pixels.

1. Repository reconnaissance and safety

Before editing:

Inspect the repository root, current Git revision, complete Git status, pre-existing staged/unstaged changes, and untracked paths.

Inspect existing EME project schema, operation engine, renderer, frame decoding path, preview surface, asset management, job manager, and test infrastructure read-only.

Identify the existing runtime and UI technology. Reuse existing architectural patterns where appropriate.

Record FFmpeg and FFprobe versions, available filters, available GPU/browser execution paths, and current rendering color metadata.

Inspect existing tests and pilot evidence that should remain stable.

Do not assume the proposed paths already exist. Determine the actual layout before choosing file locations.

Do not overwrite user changes, use destructive reset/cleanup commands, or modify historical pilot artifacts.

Keep the grading core modular and testable. Do not bundle a new heavyweight color-management dependency without a measured requirement and documented licensing review.

2. Canonical grading state contract

Create a versioned color-grade.v1 JSON schema and matching validator inside the EME codebase, following existing repository conventions.

The state must represent:

Schema version and stable grade ID.

Enabled/disabled state and revision.

Explicit input, working, LUT, and output color-space interpretations.

Exposure in EV.

White-balance temperature/tint controls with documented units and bounds.

Lift, Gamma, Gain, and Offset arrays with per-channel semantics.

Master/Luma/Red/Green/Blue cubic curves.

Eight HSL channels: Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta.

Optional active LUT asset ID, SHA-256, LUT size, domain, input/output space, interpolation, and blend intensity.

Optional skin-protection settings.

Optional scene-analysis recommendations with confidence and provenance.

Keep analysis recommendations separate from committed user controls. The analysis engine must not silently mutate a saved grade.

Validate all numeric values as finite and in range. Reject malformed curves, duplicate or invalid control-point arrangements, malformed LUT references, and unknown critical operation types.

Use explicit operation semantics and domain conversions. Avoid relying on undocumented behavior of the rendering backend.

Keep the existing eme-project.v1 schema unchanged during this phase. Do not insert arbitrary grading fields into a schema with strict additional-property validation. Establish the grading-state contract independently and define the integration migration for Phase 19.

3. Color-management contract

Define CG-01's supported initial working configuration as SDR Rec.709.

Create a documented conversion contract covering:

Source primaries and transfer function.

Matrix coefficients and full/limited range interpretation.

Decoded channel layout and bit depth.

Normalized working-domain representation.

Operation-specific working domain.

LUT input and output domain.

Output transfer, range, bit depth, and metadata.

When the source color space is unknown or unsupported, use an explicit documented fallback or request confirmation. Do not silently interpret every source as sRGB or Rec.709.

At minimum, implement a reference CPU path whose mathematics are documented and testable.

White balance and exposure should use the documented linear-light operations. Curves, HSL, and creative LUTs must have explicitly defined domains. Insert the required transfer conversions at the boundaries rather than applying all operations blindly to the same encoded RGB values.

Freeze one canonical operation order:

Input normalization/color transform.

White balance and exposure.

Lift/Gamma/Gain/Offset.

Master/Luma/RGB curves.

Selective HSL and optional skin protection.

Creative LUT and intensity blend.

Output transform, gamut/range handling, and output metadata.

Any justified deviation must be versioned and documented.

4. 3D LUT parser and evaluator

Implement an independent .cube parser with:

TITLE.

LUT_3D_SIZE.

DOMAIN_MIN.

DOMAIN_MAX.

Supported grid sizes from 17 through 65, with conformance cases at 17, 33, and 65.

Exact RGB entry-count validation.

Defined axis order and data layout.

Finite numeric values and validated domain ranges.

Bounds-safe sampling and explicit out-of-domain policy.

Content hashing and cache invalidation.

Reject malformed entries and unsupported combined 1D/3D layouts unless their semantics are deliberately implemented.

Implement a reference CPU evaluator. Verify nearest, trilinear, and tetrahedral interpolation against independent synthetic references. Tetrahedral interpolation is the default grading mode.

Intensity uses the exact formula:

result = (1 - intensity) * input + intensity * lut(input)

where input and LUT output share a declared domain. An intensity of zero must be an exact bypass; intensity one must match the reference LUT evaluation.

Treat the LUT's colorspace interpretation as explicit metadata. Do not assume that every .cube file contains enough metadata to identify its intended input and output color spaces.

5. Reference grading operations

Implement and document the mathematics for:

Exposure in EV.

White-balance temperature/tint adjustments.

Lift/Gamma/Gain and Offset.

Master and Luma curves.

Per-channel RGB curves.

Eight selective HSL channel adjustments.

Optional skin-protection weighting.

Define clamping, extrapolation, hue wrapping, interpolation, numerical precision, and invalid-input behavior.

For cubic curves, validate control points, x ordering, endpoints, and deterministic interpolation. Reject invalid curves rather than silently generating an unpredictable curve.

For HSL channels, use circular hue-distance handling and smooth overlapping channel weights. Adjacent hue bands must not create abrupt discontinuities.

Do not promise that EME reproduces proprietary CapCut color-wheel or shader algorithms exactly. Implement EME-owned, documented operations.

6. Scene intelligence and skin protection

Build a recommendation-based analysis layer that can report:

Approximate white-balance correction.

Estimated CCT and tint with confidence.

Exposure and clipping diagnostics.

Skin-region confidence/coverage.

Vectorscope information and a documented skin-tone reference line.

Separate known reference measurements from heuristic inference. A CCT estimate from arbitrary footage is not ground truth.

Use synthetic neutral references for calibrated white-balance tests and independently labeled skin-region fixtures for skin protection.

The analysis must not alter committed grading state unless the user explicitly accepts its recommendation.

Do not force all skin pixels onto a fixed vectorscope line. Treat skin protection as a weighted preservation mechanism, with measurable behavior and an explicit confidence policy.

7. GPU preview and multi-LUT comparison

Integrate with the existing preview technology after inspecting the codebase.

Implement GPU evaluation for the canonical grading operations or use a validated compiled transform with equivalent output.

Requirements:

1080p active-grade preview target: P95 grading execution at or below 16.67 ms/frame on the documented target hardware.

Four-up multi-LUT comparison with each candidate independently applied to the same base image.

Reusable GPU textures and parsed LUTs; no per-frame LUT reparsing or unnecessary readback.

Responsive controls that update the canonical preview state without racing an active render.

Explicit handling of shader initialization, GPU resource loss, and unsupported operations.

Measure active preview evaluation separately from video decode and display scheduling. Do not claim full 60 FPS playback simply because the grading shader executes in less than one refresh interval.

8. Deterministic FFmpeg renderer

Create a renderer/compiler adapter translating the canonical grading state into the existing headless FFmpeg architecture.

Use lut3d, curves, eq, or other available FFmpeg filters only when their actual semantics match the CG-01 contract.

Where a native filter is only an approximation, either compile an equivalent validated transform or report the unsupported mapping. Do not silently approximate a slider operation.

Pin the relevant FFmpeg version and filter parameters in execution metadata. Record LUT hashes, operation order, input/output color interpretation, and rendered output hashes.

Compare decoded lossless output with the reference grading implementation before testing normal delivery encodes.

9. Controlled fixture suite

Create deterministic fixtures inside the existing experimental/testing structure, following repository conventions.

Required cases:

A. Identity grade: no change to pixels.

B. Neutral ramps: black through white and near-clipping values.

C. RGB primary and secondary patches: detects channel swaps and domain errors.

D. Gray-card fixture under controlled synthetic illuminants corresponding to 3200 K, 5600 K, and 6500 K.

E. Exposure chart: exact exposure offsets with controlled linear-light reference values.

F. Curve fixtures: monotonic master/RGB curves, endpoint preservation, and luminance-shape behavior.

G. Eight-channel HSL chart: isolated hue, saturation, and lightness changes at hue centers and band boundaries.

H. LUT fixtures: generated identity, channel-permutation, channel-ramp, and nontrivial creative LUTs at 17³, 33³, and 65³.

I. LUT domain tests: custom DOMAIN_MIN/DOMAIN_MAX, negative or out-of-domain source values where supported, clamping policy, and malformed domains.

J. LUT intensity tests: zero, half, full, and several intermediate strengths.

K. Skin-protection fixture: independently labeled skin-like regions alongside colorful non-skin controls.

L. Input/output metadata fixtures: supported SDR inputs, limited/full range conversion, missing metadata, and unsupported color-space flags.

M. Multi-LUT preview: at least four independent candidate looks on identical source frames.

N. Failure fixtures: malformed headers, wrong entry counts, NaN/Infinity, invalid curve control points, missing assets, and interrupted preview/render operations.

Generate test LUTs programmatically with known mathematical ground truth. Do not rely solely on third-party LUT files for correctness testing.

10. Acceptance benchmarks

The following are proposed CG-01 acceptance criteria. Freeze their detailed measurement definitions before the final benchmark.

Correctness

All designated valid grading states pass schema validation.

All designated malformed states are rejected.

Identity grade bypass is exact in the reference pixel path.

LUT reference values and parser axis ordering pass all conformance tests.

LUT intensity zero and one behave as specified.

Color operations produce finite outputs and defined out-of-range behavior.

The same canonical grade state produces equivalent preview and render transformations within the declared parity tolerance.

Initial preview/render parity target

On lossless reference frames, calculate normalized RGB error and a color-difference metric.

Initial target:

Mean absolute RGB error no greater than 1.5 8-bit code values.

P99 absolute per-channel error no greater than 4 8-bit code values.

Report the color-difference distribution and worst-case fixture in addition to the RGB error.

For deterministic reruns under a fixed build and configuration, verify stable logical state and reproducible output artifacts.

These are targets to measure, not presumed results. If an operation cannot meet parity, report the specific transform and error rather than hiding it through averaging.

Performance

Active-grade preview: P95 grading execution at or below 16.67 ms/frame for 1080p on the documented target hardware.

Measure four-up preview separately and report P50/P95 frame costs and GPU memory.

LUT parse/load cost must be excluded from per-frame evaluation after caching, but cold-start cost must still be recorded.

Report reference CPU and final render time separately from GPU preview.

Scene-analysis confidence

On controlled neutral-reference fixtures, report estimated CCT/tint error against known fixture parameters.

Do not claim exact CCT inference for arbitrary natural footage.

Measure skin-protection behavior against independent masks and labeled sample regions.

Report whether analysis suggestions are accurate, uncertain, or unavailable; avoid turning low-confidence estimates into automatic corrections.

11. Deliverables

Create:

docs/CG_01_BASELINE.md

docs/CG_01_COLOR_CONTRACT.md

docs/CG_01_RESULTS.md

docs/CG_01_EXIT_GATE.md

The versioned grading-state schema and validator.

The reference grading engine.

The .cube parser and interpolation tests.

The GPU preview adapter and four-up comparison.

The FFmpeg renderer/compiler adapter.

Generated reference LUTs and deterministic test charts.

Machine-readable correctness and performance results.

Preview/reference/render comparison artifacts.

Exact commands, exit codes, dependency versions, and hashes.

Preserve the current certified EME baseline and previous VTSM evidence. Do not silently modify eme-project.v1.schema.json. Do not publish a release at the end of this phase.

12. Exit gate

CG-01 is complete only when:

The grading-state contract is versioned and validated.

LUT parsing, domains, axis ordering, interpolation, and intensity blending pass independent reference tests.

All specified grading operations have documented semantics.

GPU preview and FFmpeg rendering show measured numerical parity on the defined fixture suite.

The 60 FPS preview target is measured honestly, or recorded as a failed/unmet target.

Scene-analysis estimates and skin-protection behavior have independently evaluated fixtures.

No unlicensed LUT assets or unverified color-space assumptions are silently bundled.

Existing EME tests and certified pilot artifacts remain intact.

Finish with PASS, FAIL, or BLOCKED per gate, and recommend whether to proceed to TL-01 or resolve a specific CG-01 defect first.

6. Specific Phase 17 implementation sequence

I recommend that Antigravity implement CG-01 in these subphases, each with its own tests.

17.1

Contracts and reference math

Define the schema, color-space contract, reference operations, and deterministic CPU evaluator. This establishes the oracle for all later parity testing.

17.2

LUT infrastructure

Implement .cube parsing, domain handling, 3D sampling, tetrahedral interpolation, content-addressed caching, and identity/asymmetric LUT fixtures.

17.3

Professional grading controls

Implement exposure, white balance, primary controls, cubic curves, eight-channel HSL, intensity blending, and skin protection against the reference math.

17.4

GPU preview and LUT matrix

Port the reference graph to the existing graphics path, profile 1080p updates, and build the four-up look comparison.

17.5

FFmpeg compilation and parity

Compile grading state into the headless renderer, compare lossless decoded results with the reference, and resolve mismatches before styling additional UI.

17.6

Scene-analysis recommendations and sign-off

Add white-balance, exposure, skin-protection and scope diagnostics, then run the full correctness and performance gates.

Do not jump directly to the visual polish of film presets. A beautiful LUT selector on top of inconsistent color processing is the wrong order of operations.

My final architecture directives

Phase 17 is authorized. Keep EME's canonical timing and mutation invariants intact, make color operations mathematically explicit, and treat preview/export parity as a first-class correctness requirement.

The following two phases should then proceed in order:

Phase 18: Build the manual timeline against the canonical project state, with real editing operations and undo/redo.

Phase 19: Validate the full round trip from project through timeline, preview, grade, and final render.

The CapCut reverse-engineering work is a useful interoperability reference, but EME must own its canonical project semantics rather than becoming dependent on an undocumented external draft format. And 60 FPS preview and lossless grading parity must be demonstrated through measurements, not inferred from individual filter timings.

The strategic objective is now clear: EME should generate the edit, let the editor take full control of it, and preserve the creative result all the way to deterministic export.