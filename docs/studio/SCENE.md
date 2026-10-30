# Scene tracking prototype

EME can track a user-selected region through the beginning of a video, preserve
source-bound scene evidence, and show that same evidence in Studio and the local
IDE. This is the first implementation of the shared visual-understanding layer.

## Use Studio

Run `npm start`, open http://127.0.0.1:4720, and import a video. Under its media card,
click **Understand scene**. Draw a box around the complete subject in the first
frame, or expand **Adjust selection in source pixels** for precise coordinates.
Choose up to 15 seconds and click **Track selected subject**. Scrub or play the
result to inspect segmentation, propagated geometry, and missing observations.

Orange boxes indicate model segmentation. Teal boxes indicate optical-flow
propagation. Dashed boxes are predictions without observed geometry. Model scores
and flow support are uncalibrated diagnostics. A low-quality anchor, lost track,
or cut requires a new selection; the worker does not manufacture visible masks.
Select a continuous shot for this prototype. Reselection currently starts at the
first frame; correction anchors inside a shot are a later capability.

Scene analysis is advisory. It does not modify the canonical project or approve
edits. The [hackathon demo](HACKATHON_DEMO.md) now consumes this evidence to propose
and verify a static title clear of the selected region, with browser review.
A dynamic crop renderer, grading, depth/normals/gaze and soft mattes remain outside
the tracking prototype.

## Configure the local worker

Node and FFmpeg are required. The optional Python worker needs PyTorch,
torchvision, OpenCV, NumPy, timm, and a MobileSAM source checkout plus its checkpoint.
A tested dependency snapshot is in `requirements/scene-m3.txt`. The M3 validation
reused an existing environment; a fresh install of every dependency was not tested.

For a separate environment, the setup shape is:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements/scene-m3.txt
mkdir -p .eme/dependencies
git clone https://github.com/ChaoningZhang/MobileSAM .eme/dependencies/MobileSAM
git -C .eme/dependencies/MobileSAM checkout f706ad9c4eb7f219c00d9050e46328518ffb65d2
node bin/eme-scene.js configure \
  --python "$PWD/.venv/bin/python" \
  --mobilesam "$PWD/.eme/dependencies/MobileSAM" \
  --device mps
```

The checkout's `weights/mobile_sam.pt` must exist. The checkpoint used here has
SHA-256 `6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f`.
Configuration is stored privately in `.eme/studio/scene/config.json`; local paths
and model weights are not committed. To reuse a working environment, pass its
absolute Python and MobileSAM paths to the same configure command.

Environment overrides are `EME_SCENE_PYTHON`, `EME_MOBILESAM_HOME`,
`EME_MOBILESAM_WEIGHTS`, and `EME_SCENE_DEVICE`. MPS is the default for this
prototype; request `--device cpu` explicitly for a CPU run. An unavailable requested
backend fails instead of silently switching devices.

```sh
node bin/eme-scene.js doctor
node bin/eme-scene.js track --input /absolute/shot.mp4 \
  --box 100,40,400,600 --seconds 6 --label "Selected speaker"
node bin/eme-scene.js query --id ANALYSIS_ID --start 0 --end 120000
node bin/eme-scene.js preview --id ANALYSIS_ID \
  --input /absolute/shot.mp4 --output /absolute/review.mp4
```

The review MP4 is a labeled, silent 30 fps tracking proxy sampled from original
frame intervals, not a canonical edited export. Original variable timestamps stay
in the scene evidence. The preview command refuses an existing output file.

## Contract and adapter

`schema/eme-scene.v1.schema.json` describes one user-selected track per analysis.
`src/scene/contract.js` reuses EME's schema validator and canonical digest functions,
then enforces temporal coverage, source coordinates, visibility/mask separation,
artifact bindings, raw confidence conventions, and source/request identity.
Synthetic observation fixtures are refused by production queries.

`src/scene/service.js` probes actual frame PTS with ffprobe, normalizes them to
120000 ticks/second, validates the anchor, runs a bounded Python worker, verifies
output identity and mask bytes, and stores immutable results. Cache keys include
source and timing, anchor, settings, model/code provenance, proxy, and adapter
identity. Changed subject hints or processing code cannot reuse an unrelated result.
Incomplete, cancelled, and failed jobs are not registered as successful analyses.

`src/scene/tracking-worker.py` reuses existing EME modules:

- `tracker/proposals.py`: real MobileSAM segmentation, with configurable SDK path
  and the synthetic-scene dark-region rejection disabled for this provider.
- `propagation/flow_warper.py`: sparse LK forward/backward checks and mask warping.
- `tracker/kalman.py`: variable-time-step box prediction and growing uncertainty.
- `tracker/camera.py`: camera-motion diagnostics; flow already operates in image
  coordinates, so camera displacement is not applied to the mask a second time.

The worker uses a 640-pixel-wide proxy at most. Segmentation runs on the selected
PyTorch backend; OpenCV flow and physics run on CPU. Actual binary PNG masks are
retained and bound to frames, rather than discarded after generating boxes.
Rotation-tagged inputs are explicitly rejected until orientation mapping is added.
Analysis covers only the selected initial interval, not the rest of a longer clip.
Color/appearance gates and cut detection are heuristics, not calibrated guarantees.

The legacy VTSM service and synthetic benchmark worker remain separate. The new
adapter does not use the benchmark worker or its manufactured fallback detections.
It also does not rely on the legacy state manager's declared default provenance.

## IDE interface and authority

Studio exposes a fourth tool, `eme_studio_get_scene`, alongside inbox, proposal,
and reply tools. The inbox lists available analysis IDs. Query an interval using
`analysisId`, `startTick`, `endTick`, and `requireVisible` (default true).
An interval containing missing observations returns `insufficient_evidence`.
Coordinates are source pixels, not project canvas coordinates. Consumers still
need verified trim/crop/transform mapping and complete coverage before using this
for a protected placement or render decision.

Browser analysis/cancellation require the same local origin and review capability
as other Studio POSTs. The IDE query uses the separate agent capability and grants
no execution authority. Studio reads source freshness before serving evidence;
unchanged preview reads reuse a checksum keyed by file identity and timestamps.
Tracking jobs independently hash the source before and after processing. Mask
bytes are verified on access, and stale/altered data fails closed.

## Checks and local evidence

```sh
npm test
npm run verify:scene:m3
```

The default suite exercises contracts, cache invalidation, actual ffprobe timing,
worker cancellation, source drift, mask tampering, read-only Studio jobs, and the
production stdio scene-query tool. Its transport tests use explicit test-only mock
workers and do not establish model accuracy. The M3 command requires actual MPS,
runs three OpenCV/Kalman physics checks, and executes real MobileSAM inference on
controlled motion, occlusion, hard-cut, and variable-frame-rate clips.

Local acceptance artifacts are under ignored `.artifacts/scene/`, with immutable
analyses and private runtime configuration under `.eme/studio/scene/`.
[Acceptance results](SCENE_ACCEPTANCE.md) distinguish controlled tests from the
real-footage/browser demonstration.

## ff-tracking reference and later work

The inspected `ff-tracking` repository draws known glyph positions, projects a
virtual camera onto a plane, and shares a single frame table between rendering,
HUD, and audio. It does not estimate subjects from arbitrary footage. Its useful
pattern here is one authoritative coordinate/time representation for all consumers.
Studio's boxes, masks, IDE queries, and review proxy read the same analysis.

Its plane-projection and depth-of-field implementation is a reference for later
motion-graphics work. No Rust/Skia runtime or simulated camera was added to the
perception adapter. TigerGraph, Socket, AIGI, and Wispr Flow remain a subsequent
hackathon integration phase, after this prototype's contract and evidence are
stable; no new live partner integration is claimed here.
