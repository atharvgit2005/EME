# Visual contracts and rendered acceptance — 2026-10-27

Native renderer /3 has an explicit backend matrix shared by MCP and creative context.
Unknown capability names, unknown coefficients, SVG/path curves, unsupported motion,
nonlinear native animation, ignored options and incompatible output profiles fail
explicitly. Distortion uses FFmpeg cx/cy/k1/k2/interpolation; p1/p2/k3 are not advertised.
Brightness/contrast use the existing factor contract, including zero; blur uses radius.
HyperFrames rejects native-only payloads instead of discarding them. Native color grades,
blend modes, transitions other than the existing optical/typography payloads, pop/slide,
noncentral anchors and nonlinear generic easing remain unsupported.

Curved glyph frames now reach the native verified artifact, including color, fade,
reveal and sweep. Plain linear opacity/x/y channels also render. The demonstration
sequence renderer uses a real animation sequence rather than one static overlay.
Unsupported SVG geometry and spacing cannot silently become arcs/defaults. Bound font
assets are required for a specifically requested family. The rasterized font hash is
recorded; compiler-selected fonts become bound physical inputs in execution records.

Reframing reads `editorial_decisions.reframing.crop_rect`. Native cropping precedes canvas
scaling without applying a second crop transform. Crops are checked against actual source
dimensions. Annotation mapping uses per-source dimensions, separate x/y scaling, source
trims, clip offsets and half-open ranges. Required face-safe graphics need complete active
frame annotation coverage. Placement uses the union of actual raster alpha bounds over
animation frames. The renderer checks those bounds again, binds the exact video composition,
and refuses missing/changed/infeasible evidence. Face-safe optical composition or additional
position animation is explicitly unsupported. Annotations remain provided evidence, not
proof of face recognition; no detector output is fabricated.

Verification on Node 20.20.1:
`node --test tests/visual-canonical.test.js` exited 0: 11 tests, 0 failed/skipped,
11861.931958 ms. Includes coefficient/capability contracts, multiple dimensions/crops,
source trims/offsets, missing/infeasible/changed face evidence, actual distortion versus
control (mean absolute pixel difference 47.3004), curved color/movement/interval checks,
linear animation, brightness/contrast/blur and real 24/1 and 30000/1001 fps output with
frame-derived sync. The expanded native runner additionally covers canonical execution,
QA failures, publication races/crashes, contracts and audio. Focused approval/core plus
lock/fencing regressions remain 114/114 after correcting the synthetic plan's hardcoded
30 fps to its actual 60 fps project. The new profile check revealed that fixture mismatch;
no guard was relaxed. Raw logs are preserved by the bounded runners.

Representative source benchmark: read-only existing before/after fixture, SHA-256
`e862ac7f00299b20fdb3161d33f6fdb6c34645787dcfc9eae2a7d8626a6ca414`.
A deterministic mock plan selects its left portrait panel and retains source dialogue with
an explicitly approved peak-control envelope. Provided conservative face rectangles are
labeled manual annotations; they are not claimed as measured tracking. The committed
snapshot produces animated yellow “CANONICAL EDIT” below the annotated head region.

Accepted artifact SHA-256:
`23216934e00abead255cc6ed47b13d186126b76e9018802463a1406ff9b2c427`.
540x960 H264, 30 fps, 60 frames, 2.000s video/audio, AAC stereo 48 kHz;
−14.0 LUFS, −5.0 dBFS true peak, zero clipped samples. Project revision 8;
snapshot `3f40fd17c34b66e74b48d61054dc505fc02b52cefe1e88e7233776d377d7346d`;
Creative Plan fingerprint `70421680e0e0953c100ce68950b9aaf4a49ac05b15d1e4fdd493bf92cde8b6e6`.
Its benchmark.json retains the brief, input path/hash, plan, signed execution, manifest,
QA, provenance and frame paths locally. The initial linear-only headroom failure and
an explicitly unverified visual-only preview were also retained, never promoted as passing.

Agent visual observations at 0.5s/1.5s: filled portrait canvas, no added letterbox bars,
yellow curved caption moves below the head without face overlap. The human user then
explicitly replied: “I reviewed visuals and audio; acceptable.” This acceptance is bound
to the artifact checksum above and those frames. It is separate from the automated fixture
PTY confirmation and deterministic mock reasoning; no live Antigravity inference or
physical-human authentication is claimed. Rights clearance remains unverified.

Changed files: canonical adapter and shared capability/graphic rasterizers; composition,
curved typography/rasterizer, reframing, context, compiler, MCP capabilities; HyperFrames
capability checks/factor defaults; visual tests, bounded runner, deterministic benchmark
script, and conforming test fixtures. Canonical schema bytes remain unchanged.
