# Scene prototype acceptance

Verified locally on 2026-10-30 using an Apple M3 with 8 GB unified memory.
The worker used actual MobileSAM inference on MPS, with optical flow and physics
on CPU. No synthetic detector fallback or external model API was used.

The default acceptance suite passed 186 tests: 165 existing engine tests, seven
Studio tests, and fourteen scene-contract/adapter/API tests. Mock worker tests
establish transport and authority behavior, not model accuracy. Three additional
OpenCV/Kalman physics tests passed on the M3 runtime.

## Actual model checks on controlled footage

Each case runs the production adapter and worker against a generated clip with
known geometry. These tests do not establish accuracy on arbitrary natural footage.
IoU below measures observed bounding boxes against controlled geometry, not alpha
matting quality. Missing observations are deliberately not counted as detections.

| Case | Observed frames | Mean box IoU | False visible during absence | Worker ms | Total wall ms |
| --- | --- | --- | --- | --- | --- |
| motion | 30/30 | 0.999 | 0 | 2398 | 6195 |
| occlusion | 10/30 | 1.000 | 0 | 2306 | 9773 |
| cut | 15/30 | 1.000 | 0 | 1395 | 6006 |
| vfr | 30/30 | 0.998 | 0 | 1421 | 6008 |

Occlusion and hard-cut runs stopped producing observed masks at the expected
absence. They did not automatically reacquire the subject when it reappeared.
Variable-frame-rate input retained variable presentation intervals. The physics
checks cover variable-dt prediction/covariance, camera displacement sign, and
avoiding double application of camera movement.

## Real footage and browser flow

A local four-second excerpt from the user-referenced Corridor Crew video was
selected and tracked through Studio. It retained observed output on all 120 frames,
including 12 segmentation and 108 propagated frames. There is no independent
frame-by-frame ground truth for this excerpt, so this is an execution and visual
inspection demonstration rather than an accuracy benchmark.

The accepted real-footage worker run took 4320 ms. This includes model setup in the worker but excludes its separate doctor/provenance process, HTTP, and browser overhead. It reported 505 MB peak worker RSS; this is not total system or GPU memory.

REA drove a temporary Chrome profile through selection controls, actual analysis,
and scrubbing. The final accessibility state showed 120/120 observed frames and
MPS segmentation. A second browser scenario scrubbed an occluded frame and verified
that the mask was hidden and the readout stated LOST with no observed mask. Both
scenarios completed with no retained page-error events, and REA terminated its
owned browser processes. Numeric selection controls were exercised; pointer-drag
selection was not automated in this verification.

The real production stdio MCP scene-query tool returned a source-bound, complete
visible interval. Analysis did not modify the canonical project. Unit/integration
checks separately cover stale source bytes, mask tampering, changed hints, fixture
rejection, cancellation, missing prerequisites, and browser/agent authority.

Real analysis ID: `f601a839d860fdd8ad92064bea54318cb22a3656a9947ac092c8a459f2d4bfec`.

REA continuous-shot Evidence: `ev_38ab03206fbea23e07be15c700f91a7b5fcd1f82a8598f736b2920d2a802299b`.

REA occlusion Evidence: `ev_a9c882ceef92ad800190d46eae697a1bd8b12ee4602813a6bb11573e9ace009c`.

Checkpoint SHA-256: `6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f`.

Provider code SHA-256: `c89b01e2b696e623b5e1de9eacd6691e8158b9bfa5ca67a94359ed794a754892`.

Raw reports, screenshots, preview MP4, and media remain local under ignored
`.artifacts/scene/`; immutable analyses and private runtime configuration remain
under `.eme/studio/scene/`. No checkpoint, credentials, external runtime, or source
video is committed.

## Current limits

One selected region per analysis, anchored at the first frame, at most fifteen
seconds, on a proxy no wider than 640 pixels. Binary segmentation is not soft
matting. Cut, appearance, and flow checks are heuristics and can miss failures.
Rotated sources are rejected. Mid-shot correction anchors, automatic re-identification,
production placement consumers, depth/normals, color grading, and new partner
integrations are outside this first prototype. The user can inspect saved evidence
and explicitly rerun the analysis with a new selection.
