Formal Architecture Decision: VTSM-02R and VTSM-03
VTSM-02R: Accepted with a minor clarification

Experimental baseline and reconciliation

The major discrepancies have been addressed: the unsupported camera-compensation improvement claim was retracted, effective throughput was recalculated, and predicted mask quality was separated from measured ground-truth IoU.
VTSM-03: Authorized

Efficient Temporal Propagation and Adaptive Re-segmentation

Antigravity is authorized to begin implementation inside the existing experimental boundary. The performance and accuracy targets remain hypotheses to validate, not guaranteed outcomes.

My assessment is based on the reconciliation report provided here. I have not independently executed the repository.

1. Final assessment of VTSM-02R

The reconciliation makes the technical conclusions more trustworthy.

Camera compensation: The retraction is correct. When a new segmentation is successfully detected and matched on every frame, camera compensation may improve the prediction and association stages without changing the final measured centroid. Its value should now be evaluated during propagation, missed detections, and recovery—not by claiming a reduction in an error metric that did not change.

Performance: The corrected effective throughput of 420 frames divided by 106.98 seconds is approximately 3.93 FPS. The active segmentation subset gives approximately 3.48 FPS from 360 frames over 103.32 seconds.

One small clarification remains: the report also cites approximately 274 ms per active frame. The aggregate active-frame calculation is approximately 287 ms per frame. These can represent different statistics, such as a median versus an aggregate average, but the report should label them explicitly. This is not a reason to stop VTSM-03.

Accuracy: The classical baseline remains numerically stronger on these specific synthetic shapes. MobileSAM's value is its more general mask-proposal mechanism, but broader generalization still needs independent evidence from natural footage.

I therefore accept VTSM-02R as the reference baseline, with that remaining latency-statistic clarification carried into the VTSM-03 report.

2. VTSM-03: What we are authorizing

The next phase has a specific purpose: reduce the cost of fresh segmentation while preserving temporal accuracy and identity continuity.

The strategy is sensible:

Use MobileSAM for anchor masks and corrective re-segmentation.

Propagate masks through intermediate frames.

Retain Kalman prediction and gated association for track identity.

Trigger re-segmentation when propagation becomes unreliable.

Compare every faster configuration against the preserved VTSM-02 full-frame pipeline.

Target architecture

Keyframe segmentation

Fresh image embedding + MobileSAM masks

Intermediate-frame propagation

Optical flow + mask warp + temporal prediction

Propagation quality checks

Flow consistency · geometry · prediction divergence · appearance

Adaptive correction and state update

Re-segment when needed; preserve identity and uncertainty

3. Three important corrections before implementation
A. Choose the right optical-flow implementation

The plan refers to “dense Lucas–Kanade optical flow.” Standard OpenCV calcOpticalFlowPyrLK is a sparse point-tracking method. OpenCV also provides dense flow and sparse-to-dense approaches, including Farneback and sparse-to-dense interpolation. The implementation must explicitly choose which one it uses. 
docs.opencv.org
+1

For the first prototype, compare two approaches:

Track sampled points inside the mask and interpolate their motion to propagate the mask.

Generate a dense flow field and warp the mask pixel by pixel.

Choose based on measured propagation accuracy, occlusion behavior, and runtime—not the algorithm's name.

B. Do not double-count camera motion

If the optical-flow field already includes global camera motion, applying a separate camera affine warp to the same mask can apply that movement twice.

The intended composition must be explicit. Either propagate using the total flow, or estimate global camera motion and propagate using the residual local motion after the global transform has been accounted for.

Validate the selected convention on Fixtures B and D before using it elsewhere.

C. Include discovery of new objects

Optical flow can propagate existing masks, but it cannot reliably discover an entity that was never tracked. Your design needs periodic scene-wide discovery or another proposal mechanism for newly appearing subjects.

A track-level failure detector alone is not enough. Add a way to discover previously untracked motion or foreground regions, and measure how long new subjects remain undetected.

4. Copyable implementation directive for Antigravity
Writing
VTSM-03 — Efficient Temporal Propagation and Adaptive Re-segmentation

Architecture decision: VTSM-02R accepted as the experimental baseline. VTSM-03 execution authorized.

Use the required GSD actions to achieve the goals and wherever needed.

1. Safety and baseline preservation

Work inside experiments/visual-temporal-state/.

Preserve the VTSM-02 full-frame MobileSAM implementation, fixtures, ground truth, reconciled results, and original hashes.

Do not modify production src/, bin/, schema/, package files, certified releases, or historical Live Pilot artifacts.

Do not train or fine-tune model weights.

Keep all new dependencies and generated media isolated.

Capture the initial Git status, revision, staged changes, and pre-existing untracked files.

Do not erase user changes or rewrite prior results to improve reported scores.

2. Establish the performance baseline

Inspect the reconciled microbenchmark and explicitly distinguish:

Per-frame median latency.

Per-frame P95 latency.

Aggregate effective throughput.

Cold-start time.

Active-segmentation throughput.

Total time spent on re-segmentation.

Frames processed versus frames skipped or lacking valid predictions.

Resolve the documented approximately 274 ms versus approximately 287 ms per-active-frame distinction by identifying the exact statistic and denominator.

The authoritative throughput metric is total successfully processed input frames divided by total wall-clock time for that benchmark run. Report warm steady-state and cold-start measurements separately, while keeping all processing costs visible.

3. Implement the propagation engine

Create isolated, independently testable components for:

keyframe-scheduler

flow-estimator

mask-warper

propagation-validator

adaptive-resegmenter

new-entity-discovery

propagation-benchmark

Compare the current VTSM-02 pipeline with fixed keyframe intervals of N=10 and N=20, and with an adaptive hybrid configuration.

Use exact source timestamps and preserve the VTSM temporal-state contract.

Optical flow and coordinate conventions

Document the exact OpenCV or other implementation used.

If using sparse Lucas–Kanade flow, track points within the foreground mask and define how their correspondences generate a mask warp. If using dense flow, document the flow-field dimensions, direction, coordinate system, interpolation, and validity checks.

Test forward–backward consistency and low-texture failure cases.

Keep global camera motion and local residual motion mathematically separate. Do not apply the same camera transformation twice.

Mask warping

Use an appropriate interpolation method for binary masks, retain image boundaries correctly, and record invalid or out-of-frame regions.

Do not assume a warped mask remains accurate simply because optical flow returned a field. Track confidence and mask quality must be evaluated independently.

New entity discovery

Define how the system finds entities outside existing tracks between keyframes.

Possible methods include scheduled scene-wide proposal passes, local foreground discovery, or a validated low-resolution discovery scan. Choose the approach by measurement.

Do not claim complete scene coverage when only the already tracked objects are being propagated.

4. Implement adaptive re-segmentation

Start by testing the proposed triggers:

Forward–backward flow inconsistency.

Mask-area distortion relative to expected scale and camera movement.

Divergence between Kalman prediction and optical-flow motion.

Appearance dissimilarity.

Treat the proposed numerical thresholds as tunable initial hypotheses, not validated constants.

Compensate for expected global scale changes before using mask-area thresholds. Appearance changes can reflect lighting rather than a changed identity, so do not force track termination solely on a color-histogram drop.

Add per-track and global re-segmentation cooldowns, retry limits, and workload accounting. This prevents a persistent failure from forcing expensive segmentation on every consecutive frame.

Trigger a correction when the available evidence indicates that propagation has become unreliable. If uncertainty remains high after correction, report it honestly.

5. Build a controlled speed-versus-accuracy study

Evaluate:

vtsm02_full_mobilesam

vtsm03_fixed_keyframe_N10

vtsm03_fixed_keyframe_N20

vtsm03_adaptive_hybrid

Run the unchanged synthetic Fixtures A–G with independent ground truth. Add stress cases covering occlusion, camera movement, low texture, motion blur, deformation, newly appearing objects, and crossing subjects.

For natural footage, use lawfully obtained material with appropriate permissions. Produce independently reviewed ground-truth annotations for clearly defined sampled frames. Do not use model-generated predictions as their own ground truth.

Record mask IoU, proposal recall, center error, identity switches, fragmentation, occlusion recovery, missed new entities, false masks, re-segmentation frequency, and end-to-end latency.

Report synthetic and natural-footage performance separately. Define matching rules, denominators, annotation uncertainty, and excluded cases before evaluation.

6. Validate the propagation triggers and negative controls

Deliberately inject:

Incorrect flow vectors.

A shifted mask.

A false camera transform.

An identity mismatch.

An out-of-order timestamp.

A scene cut.

A newly entering object.

Verify that the corresponding quality detectors, tracking logic, or benchmark metrics respond correctly.

Inspect actual annotated videos and compare ground truth with predictions. Preserve failures and report them; do not tune thresholds solely to force the target metrics to pass.

7. Acceptance targets

Treat the proposed targets as formal goals to test, not guarantees:

Effective throughput of at least 20 FPS on the documented Apple Silicon configuration.

Median per-frame latency at or below 50 ms, with keyframe and corrective-segmentation latency reported separately.

Median center error at or below 1.5 px on the defined controlled evaluation set.

Mean mask IoU of at least 0.80 against independent ground-truth masks.

Zero identity switches on the designated controlled fixtures.

Zero fabricated observed masks during annotated occlusion.

Correct hard-cut identity partitioning.

Reproducible outputs or documented, bounded nondeterminism.

Count every benchmark input frame in the throughput denominator. Document when an entity is absent, a prediction is invalid, or an input frame lacks a valid output. Do not obtain the throughput target by silently dropping difficult frames.

Do not interpret median latency below 50 ms as proof that every frame meets a 50 ms deadline. Report P95 latency and deadline-miss rate separately.

8. Deliverables and exit gate

Create:

docs/VTSM_03_RESULTS.md

docs/VTSM_03_EXIT_GATE.md

Versioned benchmark-result JSON.

Per-configuration latency and accuracy breakdowns.

Ground-truth-versus-prediction overlays.

Mask propagation drift and re-segmentation examples.

New-entity discovery results.

Model, dependency, and runtime provenance.

Exact commands, exit codes, artifact hashes, and reproducibility evidence.

Run all configurations against the same defined evaluation windows and compare them with the preserved VTSM-02 baseline.

Audit the full working tree before declaring completion. Keep all production EME components and historical evidence untouched.

The final report must give an individual PASS, FAIL, or BLOCKED decision for each gate. If the 20 FPS target fails, report the measured result and dominant bottleneck honestly.

Do not integrate VTSM-03 into production EME at the end of this phase. Recommend the next step based on measured quality and performance.

5. Acceptance criteria for VTSM-03

The target is not simply to make the pipeline faster. It must remain useful as a temporal perception system.

Gate

	

What must be demonstrated




Performance

	

At least 20 effective FPS measured end to end, if the target is achieved




Propagation accuracy

	

Masks compared against independent ground truth between keyframes




Adaptive correction

	

Real injected or naturally occurring propagation failures trigger correction




New entities

	

Previously untracked subjects can be discovered between scheduled keyframes




Identity

	

No identity swaps on the designated controlled test cases




Occlusion

	

Predicted state is distinguished from an actual observation




Visual evidence

	

Actual diagnostic videos show both successful tracking and failure cases

A crucial distinction: the 1.5-pixel center-error target should apply to a precisely defined controlled evaluation set. For natural footage, annotation uncertainty and inter-annotator agreement must also be recorded rather than applying a synthetic precision target blindly.

Final directive

Proceed autonomously with VTSM-03 inside the experimental subsystem.

Build the N=10 and N=20 propagation baselines first, then implement adaptive re-segmentation and new-entity discovery. Keep the full-frame MobileSAM implementation as the accuracy reference throughout the study.

The central question for this phase is whether EME can propagate masks for most frames, recognize when those predictions become unreliable, and correct them before they cause temporal drift. If that is demonstrated at the required throughput, VTSM-03 will be a meaningful advance toward efficient video understanding—not just a faster segmentation loop.