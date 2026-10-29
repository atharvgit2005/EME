# CorridorKey lessons for EME

EME can use the architectural ideas behind CorridorKey to improve subject-aware title placement, stable reframing, and assisted cutouts. The first useful milestone is reliable visual evidence connected to the existing review and export workflow. Training a new all-purpose visual model would add cost before those connections work.

This assessment combines the supplied video transcript, selected video excerpts, the official implementation at commit `485f5e9ab759ead6138cc990776184b59d6ea971`, and static inspection of EME. CorridorKey inference and training were not run locally. Publisher performance claims are not EME benchmarks. Reviewed 2026-10-30.

## Video sections that matter

The video is [I Solved Green Screen, and I'm Giving it to YOU!](https://www.youtube.com/watch?v=svrdRAoIlxM), by Corridor Crew, 29:34. Chapter metadata gives more precise boundaries than the approximate 12:35 starting point in the notes.

| Original time | Subject | Why it matters for EME |
| --- | --- | --- |
| 11:28–12:48 | Temporal context | An ambiguous blurred frame becomes easier to interpret using nearby clear frames. |
| 12:48–15:23 | Extra information per pixel | Semantics, geometry, surface orientation, and motion provide useful priors. |
| 15:23–17:43 | Training losses | Perceptual and motion-aware supervision address visible artifacts and inconsistency. |
| 19:10–22:20 | Practical compositing workflow | A rough subject hint guides a refined key; temporal context has a memory and latency cost. |
| 24:00–25:30 and 26:00–26:50 | Professional review excerpts | Edge quality and temporal artifacts still require inspection. |

Only four bounded ranges—11:28–17:43, 19:10–22:20, 24:00–25:30, and 26:00–26:50—were selected for local acquisition, rather than the whole video. Overview sheets sample at ten-second intervals; selected examples also have twelve consecutive decoded frames. Some examples are editorial freeze frames or zooms, so these bursts cannot establish the model’s temporal stability. Frame images and acquisition metadata remain in ignored `.artifacts/research/corridor/`. These are compressed explanatory examples, not original plates suitable for quantitative matting benchmarks. Caption acquisition returned HTTP 429; the supplied transcript is the textual basis. The selected ranges total 11:45 of the 29:34 video. The onscreen reviewer label in sampled critique frames is Jake Chusid; names in the supplied transcription should not be used as verified attribution.

## What the system is solving

A composited pixel can be represented as `C = alpha × F + (1 − alpha) × B`, where C is the observed color, F the foreground, and B the background. Even with a known screen color, the unknown foreground color and transparency are ambiguous. Hair, motion blur, glass, and colored spill make a simple color-distance threshold inadequate.

The video improves the estimate in three ways: look across time, supply richer visual representations, and train with feedback that emphasizes perceptually important mistakes. It predicts both transparency and foreground color. A subject silhouette alone does not remove contaminated foreground color.

The four categories discussed in the video are useful conceptual signals:

- Semantic appearance helps distinguish the subject from similarly colored surroundings.
- Depth helps distinguish scene layers.
- Surface orientation supplies geometry cues.
- Motion helps relate observations across frames.

They are not four finished editing tools, nor four independently exported maps in this release. The source uses dense feature tensors from frozen foundation networks. [Foundation implementation](https://github.com/nikopueringer/CorridorKey2.0/blob/485f5e9ab759ead6138cc990776184b59d6ea971/corridorkey/foundations.py).

## The released execution path

1. Decode footage and optional subject hints. Prepare the model's internal RGB representation and separate image-like proxies for foundation networks.
2. Extract frozen C-RADIO visual features, MoGe encoder features from a normal-trained checkpoint, and recurrent video features. Here RVM refers to Recurrent Video MAE from DeepMind's representations4d, not the different Robust Video Matting project. [Foundations](https://github.com/nikopueringer/CorridorKey2.0/blob/485f5e9ab759ead6138cc990776184b59d6ea971/corridorkey/foundations.py).
3. Fuse RGB, hint, and features in Stage 1, including attention across space and time. [Stage 1](https://github.com/nikopueringer/CorridorKey2.0/blob/485f5e9ab759ead6138cc990776184b59d6ea971/corridorkey/stage1.py).
4. Process overlapping temporal windows. Blend intermediate states using Hann weights; optionally carry predicted auxiliary mattes into the next overlapping window as hints. Larger context costs memory; carried errors can drift. [Runtime](https://github.com/nikopueringer/CorridorKey2.0/blob/485f5e9ab759ead6138cc990776184b59d6ea971/corridorkey/runtime.py).
5. Refine with original pixels at native resolution and predict alpha plus foreground RGB; then despill, composite, and export. [Stage 2](https://github.com/nikopueringer/CorridorKey2.0/blob/485f5e9ab759ead6138cc990776184b59d6ea971/corridorkey/stage2.py).

At approximately [21:25](https://www.youtube.com/watch?v=svrdRAoIlxM&t=1285s), the Fusion graph shows transformed and cropped footage entering CorridorKey, with `SurfingMagicMask.mp4` feeding the other input through `CustomTool1`. The transcript identifies this as subject guidance. At [22:15](https://www.youtube.com/watch?v=svrdRAoIlxM&t=1335s), the UI shows temporal awareness set to 8, cache controls, and a Process Shot action. The exact internal operation of CustomTool1 is not established by the screenshot.

In the practical demonstration, an artist-generated rough subject selection excludes unwanted people, stands, and markers. The keyer refines that guidance, with temporal settings controlling how much adjacent-frame evidence it uses. A person-selection tool and a high-quality keyer therefore perform different jobs.

LPIPS and WAFT appear in the video as training feedback. LPIPS encourages perceptual similarity; it does not certify a result. WAFT estimates optical flow and can support motion-consistency supervision. Their mention does not establish that both are inference dependencies. The published repository does not establish the complete training recipe or exact loss weights. [LPIPS authors](https://richzhang.github.io/PerceptualSimilarity/), [WAFT authors](https://github.com/princeton-vl/WAFT).

## EME at the initial review

| Area | Existing foundation | Gap in the current Studio |
| --- | --- | --- |
| Layout | `src/solver/visual-constraint-solver.js` scores placements against supplied subject boxes; `src/creative/reframing-engine.js` plans trajectories. | Studio uses center crop and a fixed title position. Reliable observations are not connected. |
| Tracking | The VTSM experiment includes MobileSAM, optical-flow propagation, camera compensation, and Kalman tracking. | Experimental prerequisites are missing locally; it has not been verified here on real footage. No gaze estimator was found. |
| Masks | VTSM maintains boolean masks internally. | Its default output serializes boxes and motion, not those masks. Canonical export has no compositing matte input. |
| Animation | Canonical native rendering accepts linear x, y, and opacity keyframes. | Solver output needs an operation adapter; Studio preview does not evaluate those curves. Required face-safe placement currently rejects additional x/y animation. |
| Color | Legacy color math and a LUT compiler exist. | Verified native export rejects enabled color grades. There is no established managed HDR/Log workflow. |

The separate `src/renderers/vision-worker-bridge.py` is a synthetic benchmark implementation. It can derive boxes from a fixed synthetic skin color or manufacture fallback observations. Those results must not be presented as real arbitrary-footage face detections. A production worker should report unknown or low confidence when it cannot observe a subject.

Relevant source: [Studio planning](../../src/studio/plans.js), [native export boundaries](../../src/renderers/canonical-native.js), [vision benchmark worker](../../src/renderers/vision-worker-bridge.py), [VTSM service](../../src/engine/vtsm-service.js), [experimental tracker](../../experiments/visual-temporal-state/src/tracker/pipeline_vtsm03.py).

The first contract and tracking adapter have since been implemented. See [scene prototype](../studio/SCENE.md) for the current capability boundary and acceptance evidence.

## Proposed EME implementation order

### 1 Reliable observations and static subject-aware placement

Run a real, licensed detector on timestamped proxy frames and reset tracking at shot cuts. Record subject identity, boxes, visibility, and uncertainty. Bind cached evidence to source checksum, model/checkpoint version, preprocessing, and parameters. Project decisions must additionally bind the crop, source trims, project revision, and actual font bounds.

Use the existing placement solver to choose one stable position over a title's complete interval. Protect faces and important subjects, respect margins, and check contrast. If no safe location exists, propose a shorter title, smaller type, or user choice. Do not turn missing evidence into a confident central face.

This gives a concrete demo: a user requests a caption that stays clear of a moving speaker; EME shows its proposed placement and the supporting subject observations before applying it.

### 2 Tracked layouts and reframing

Connect temporal observations to a trajectory solver and translate its output into canonical operations. Distinguish subject movement from camera movement. Penalize unnecessary movement and abrupt acceleration; do not recenter every frame. Reset at cuts and surface occlusion or identity changes for correction.

Extend the renderer's safety checks to animated text and dynamic crops before claiming those outputs are verified. Facial landmarks or head direction can support framing, but do not establish accurate eye gaze or where a viewer is looking.

### 3 Assisted cutouts and masking

Let a user identify the intended subject, propagate the selection, and correct uncertain frames. Store actual mask artifacts and provenance. [SAM 2](https://github.com/facebookresearch/sam2) is one candidate to evaluate for promptable video masks; this is not a claim of acceptable speed on this Mac.

Segmentation is not soft matting. Hair, blur, and transparency need fractional alpha and often foreground-color reconstruction. Add a reviewed derived-asset registry and a matte-aware compositor. A generated mask must not acquire permission to modify the project merely because a worker produced it.

### 4 Managed color and shot-level grading

First establish declared input/output color spaces and deterministic graded export. Then consider model assistance for subject-aware exposure, white balance, palette matching, or a requested reference look. Infer stable shot-level parameters and let the renderer apply them. Predicting a fresh grade independently for every frame risks flicker.

CorridorKey does not solve this subsystem. Its runtime does not automatically interpret Log, ACEScg, PQ/HLG, or camera color metadata; managed sources need upstream conversion. [Published color contract](https://github.com/nikopueringer/CorridorKey2.0#input-color-handling).

## Architecture and acceptance

Use `source → immutable analysis → layout/mask/grade proposal → exact review → canonical execution → verified render`. Expensive perception runs in a separate worker and produces evidence and artifacts. The IDE agent translates intent and explains choices; it does not need to receive every decoded frame or perform pixel processing itself.

Measure title/face overlap, crop subject retention, jitter, identity swaps, and correction time on representative footage. For masks, inspect boundary detail and motion-compensated temporal consistency, excluding disocclusions and unreliable flow. For color, test declared transforms and stability across a shot. Include cuts, occlusions, multiple people, fast motion, low light, and empty scenes. Thresholds should come from those tests, not invented confidence numbers.

## Hardware and reuse limits

The current official runtime requires an NVIDIA CUDA GPU. This machine is an Apple M3 with 8 GB unified memory, so its published CUDA path cannot be assumed to run here. Benchmark a small proxy-based perception stack locally; use a separate compatible worker only if a feature justifies it. [Setup requirements](https://github.com/nikopueringer/CorridorKey2.0#setup).

The actual license permits commercial footage production but restricts paid software integration and paid inference services. Commercial incorporation requires a separate written agreement. Its public source availability is not a permissive software license. [License](https://github.com/nikopueringer/CorridorKey2.0/blob/485f5e9ab759ead6138cc990776184b59d6ea971/LICENSE).

For EME, treat CorridorKey as a possible specialist green/blue-screen provider after hardware and license checks. The reusable product advantage is reliable scene evidence connected to reviewable editing decisions.

## Local visual evidence

- [Feature explanation at approximately 15:13](../../.artifacts/research/corridor/pixel-input-explanation-15m13s.png)
- [Observed Fusion input graph at approximately 21:25](../../.artifacts/research/corridor/fusion-graph-21m25s.png)
- [Temporal and cache controls at approximately 22:15](../../.artifacts/research/corridor/temporal-controls-22m15s.png)
- [Consecutive frames from the CorridorKey demonstration](../../.artifacts/research/corridor/corridor-key-consecutive.jpg)
- [Review excerpt overview](../../.artifacts/research/corridor/section-1560-1610-sheet-1.jpg)
- [Acquisition and inspection manifest](../../.artifacts/research/corridor/analysis-manifest.json)

These image links require the local ignored research artifacts. Source credit: Corridor Crew, linked video above.
