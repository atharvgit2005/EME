Formal Architecture Review: VTSM-02
Experimental Prototype: Accepted

VTSM-02 — Class-Agnostic Mask Tracking and Temporal Identity

The reported implementation demonstrates a meaningful advance: MobileSAM mask generation, timestamp-aware Kalman prediction, gated association, camera-motion estimation, and explicit occlusion and scene-cut handling.

Formal exit-gate decision: CONDITIONAL ACCEPTANCE. The implementation can be retained as the experimental candidate, but two quantitative claims must be reconciled before the complete benchmark is signed off.

Production status

Not approved

No production EME integration, release, or change to the certified baseline is authorized by this decision.

I have reviewed the report you supplied. I have not independently executed the repository or inspected its generated JSON and videos. The key issue is not whether the engineering is promising—it is. The issue is whether the numerical evidence supports every claim made in the exit report.

1. What I accept

Component

	

Technical assessment




MobileSAM hybrid inference

	

Accept as an experimental perception path




Kalman predictor with variable time deltas

	

Accept the architecture; retain adversarial validation




Gated Hungarian association

	

Accept the design and reported controlled tests




Occlusion lifecycle

	

Promising, particularly explicit null masks during disappearance




Scene-cut identity reset

	

Accept the tested policy, subject to broader validation




CPU/MPS profiling

	

Accept the reported measurements as the current performance baseline




Production isolation

	

Reported PASS; retain the repository integrity evidence

The most valuable engineering decision is that an occluded entity can remain tracked without the system inventing a segmentation mask. That distinction is essential: the system must represent what it predicts separately from what it actually observes.

2. Two issues prevent unconditional benchmark acceptance

Issue A — Camera-compensation results conflict

The primary ablation table reports:

Fixture

	

Kalman alone

	

Kalman + camera




B — Pan

	

0.71 px

	

0.71 px




D — Rotation/tilt

	

0.91 px

	

0.91 px

Yet the narrative claims camera compensation improves error from 1.82 to 0.74 px on the pan fixture, and from 1.45 to 0.88 px on rotation.

These results may describe different metrics—for example, raw screen-space error versus camera-compensated error—but the report does not establish that distinction.

Required: inspect the underlying per-frame predictions and metric code, identify the exact metric behind each number, and independently recalculate both comparisons. Do not simply edit the report to make the numbers agree.

Issue B — Aggregate throughput needs a consistent denominator

The report gives several different performance figures:

Single-prompt pipeline: 144.4 ms/frame, approximately 6.9 FPS on MPS.

Fixture-specific runs: generally around 2.7–3.7 FPS, with the low-texture fixture at 16.4 FPS.

Aggregate candidate performance: 15,283.6 ms and 5.35 FPS.

The figures could reflect different workloads, such as multiple prompts or a fast path that skips inference. However, they cannot be compared fairly without a documented measurement definition.

If 15,283.6 ms is the total time for a 60-frame clip, its effective throughput is about 3.93 FPS—not 5.35 FPS. If the field has another meaning, document that meaning explicitly.

Required: report total processed frames divided by total wall-clock time, together with per-fixture latency and the number of frames on which model inference was actually executed.

There are two additional interpretation issues to preserve in the final report.

First, the classical baseline's reported mean center error is 0.18 px versus 0.66 px for the full MobileSAM stack. Its reported mean IoU is also higher: 0.8536 versus 0.8385. The classical baseline performs better on these aggregate metrics for this fixture set. That is not surprising if the synthetic fixtures favor its color-based tracking approach, but it means VTSM-02 has not demonstrated aggregate accuracy superiority on the current controlled suite.

Second, the MobileSAM quality score of 0.9431—and the reported decoder scores above 0.96—must be distinguished from measured ground-truth mask IoU. A model-predicted mask-quality score is not an independent accuracy measurement.

These findings do not invalidate the system. They narrow the claims the evidence currently supports.

3. Roadmap decision

I recommend a short reconciliation task before starting the next implementation phase. Once the existing results are internally consistent, the next major milestone should be:

VTSM-03 — Efficient Temporal Propagation and Adaptive Re-segmentation.

The motivation is clear from the reported benchmark: fresh MobileSAM image encoding costs 122.9 ms at the MPS median. Repeating that operation on every frame makes the current pipeline unsuitable for a 20 FPS interactive preview on the measured configuration.

The next phase should investigate a hybrid strategy:

1. Keyframe segmentation

Run MobileSAM at shot starts, new-track events, and selected re-segmentation points.

2. Intermediate-frame propagation

Propagate masks using optical flow or another measured propagation method. Preserve track identity and uncertainty.

3. Adaptive correction

Re-run segmentation when confidence drops, propagation becomes unreliable, a new object appears, or motion changes sharply.

4. Validated temporal state

Continue producing timestamps, masks, tracks, camera estimates, and honest uncertainty.

Do not assume optical flow will preserve masks accurately. It can drift under occlusion, blur, deformation, and scene cuts. Measure the speed–accuracy trade-off against the current full-frame MobileSAM pipeline.

Before declaring general class-agnostic capability, add natural-footage evaluation with independently annotated masks and identities. The existing synthetic suite is valuable for controlled geometry, but it cannot establish how well this system works on arbitrary real footage.

4. Immediate instructions for Antigravity

Use this copyable task to close the remaining issues without disturbing the accepted implementation.

Writing
VTSM-02R — Benchmark Reconciliation and VTSM-03 Readiness Gate

Architecture decision: VTSM-02 implementation accepted as an experimental candidate. Final quantitative exit-gate sign-off remains conditional on reconciliation.

Use the required GSD actions to achieve the goals and wherever needed.

Step 1 — Preserve the current evidence

Record the current Git revision, working-tree status, staged and unstaged changes, and existing untracked paths.

Preserve VTSM-01 and VTSM-02 source fixtures, raw predictions, benchmark JSON, overlays, and historical reports.

Do not modify production src/, bin/, schema/, package files, release artifacts, or historical Live Pilot evidence.

Do not overwrite existing results with corrected values. Create a separate reconciliation report and independent results file.

Step 2 — Reconcile camera compensation

Inspect the code and raw per-frame data for Fixtures B and D.

Identify the formulas, units, coordinate systems, and denominators for:

Raw screen-space trajectory error.

Camera-compensated trajectory error.

Camera transform estimation error.

The final error displayed in the ablation matrix.

Independently recompute the comparisons using the same prediction frames and ground truth.

Resolve why the primary table reports 0.71 versus 0.71 px for Fixture B and 0.91 versus 0.91 px for Fixture D, while the narrative claims larger improvements.

Do not change the implementation merely to manufacture an improvement. If camera compensation provides no measurable benefit under a particular metric, report that result accurately.

Step 3 — Reconcile throughput and latency

Inspect results/vtsm02_microbenchmark.json and results/vtsm02_benchmark_results.json.

For every configuration and fixture, report:

Number of source frames.

Number of frames requiring fresh image encoding.

Number of prompts and decoder calls.

Total measured wall-clock duration.

Median and P95 per-frame latency.

Time spent on encoding, decoding, propagation, association, and postprocessing.

Effective throughput calculated as processed frames divided by total wall-clock seconds.

Separate fixtures where inference is skipped from those requiring actual segmentation. Explain the difference between the single-prompt 144.4 ms/frame microbenchmark and the fixture-specific timings.

If the original figures use different aggregation methods, preserve them as historical measurements, label those definitions explicitly, and publish the correctly computed comparative metrics separately.

Step 4 — Verify metric semantics and test claims

Distinguish predicted mask-quality scores from measured ground-truth mask IoU.

Recompute aggregate center error, IoU, and identity metrics from saved per-frame predictions using fixed definitions.

Verify that fixture exclusions, missing detections, and occlusion intervals are handled consistently.

Inspect the lifecycle test for the contradictory statements about immediate versus tentative track confirmation and document the actual behavior.

Preserve failed or negative cases rather than excluding them to obtain a pass.

Step 5 — Produce the reconciliation result

Create:

docs/VTSM_02_RESULTS_RECONCILIATION.md

A separate machine-readable corrected comparison JSON.

An updated gate-by-gate disposition that references original and corrected artifacts.

Exact commands, exit codes, and relevant artifact hashes.

The report must distinguish confirmed results, corrected interpretations, failed targets, and remaining unknowns.

Keep VTSM-02 accepted as an experimental implementation, but do not declare its comparative performance gate fully passed until the numerical discrepancies are resolved.

Step 6 — Prepare, but do not prematurely implement, VTSM-03

After reconciliation, produce a brief VTSM-03 plan for keyframe segmentation, mask propagation, adaptive re-segmentation, natural-footage ground truth, and speed-versus-accuracy ablation.

Specify the frame-selection policy, propagation failure detectors, and re-segmentation triggers. Preserve the existing full-frame MobileSAM pipeline as the comparison baseline.

Do not integrate into production EME. Finish with an explicit PASS, FAIL, or BLOCKED decision and a recommendation for the next authorized phase.

Final disposition

VTSM-02 is accepted as an experimental implementation, with its quantitative exit gate pending reconciliation.

Do not discard it, rewrite it, or jump straight to a new segmentation model. Preserve this implementation as the full-frame baseline, resolve the two reporting issues, and then invest in VTSM-03's keyframe and propagation strategy.

The next meaningful milestone is not simply higher FPS. It is higher throughput while maintaining reliable identities, valid masks, and measurable accuracy. That is the capability EME ultimately needs from its temporal perception layer.