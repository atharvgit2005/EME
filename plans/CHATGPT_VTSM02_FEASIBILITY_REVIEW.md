VTSM-02 — Formal Phase 1 Review
Phase 1: PASS

Scope accepted: checkpoint provenance, basic inference, and feasibility of mask generation

Decision: Proceed to Phase 2 — Modular Tracking Implementation.

The report supports proceeding with the experimental pipeline. It does not yet establish real-time video performance, a fully ONNX-only execution path, or reliable temporal identity.

The feasibility work has uncovered the most important architectural trade-off for this phase: generating masks is feasible, but doing it efficiently for every frame is a different problem.

The official MobileSAM repository documents prompt-guided segmentation, automatic mask generation, and ONNX export. Its published performance figures are based on GPU testing and cannot be assumed to apply to your Apple Silicon environment. Your measured results should govern our decisions. 
GitHub
+1

1. Three constraints to resolve before building

A. Do not promise 50 ms per frame yet

The report gives approximately 599 ms median for image encoding and 42.87 ms for one decoder prompt. If the encoder's 599 ms measurement is the CPU result stated in the summary, encoding alone allows roughly 1.7 frames per second, before tracking or postprocessing.

The proposed 50 ms figure accounts for the decoder, not the complete inference pipeline. A fresh frame normally needs a fresh image embedding. Reusing an embedding across several prompts for the same image is valid; reusing it for a different frame is not equivalent to analyzing that new frame.

Directive: Measure warm CPU and MPS inference, then full end-to-end tracking latency. Do not set a real-time acceptance requirement until we have those results.

B. Treat the model as a hybrid pipeline until proven otherwise

The report explicitly places the TinyViT image encoder in PyTorch. It is not clear from the report alone whether the decoder timing comes from ONNX Runtime or PyTorch.

Directive: Record the actual backend used for every model component. Phase 2 may proceed with a hybrid pipeline, but do not claim the complete pipeline is ONNX-only unless the complete path is demonstrated.

C. Mask proposals are not persistent entities

The reported 224 regions are candidate masks, not 224 verified objects. They can include overlapping regions, background segments, and multiple masks for one object.

Similarly, a score of 0.9431 is not proven ground-truth IoU unless it was calculated against an independent annotation. If it is the model's predicted-IoU output, record it as an estimated mask-quality score.

Directive: Temporal association must decide which observations belong to the same track; never equate the mask count with the entity count.

2. Exact execution order for Phase 2
01

Complete the performance microbenchmark

Measure warm CPU and MPS performance separately, actual model input resolution, preprocessing, encoder latency, decoder latency for multiple prompts, mask postprocessing, and total tracking time across a short video. Record median and P95.

02

Implement the mask-proposal adapter

Run AMG at shot starts or when new proposals are needed. Within a frame, reuse its image embedding for multiple prompts. Across frames, either encode the new image or use a separately validated propagation method.

03

Build the timestamp-aware Kalman predictor

Track position, velocity, width, and height. Calculate time deltas from source timestamps rather than assuming constant FPS. Represent uncertainty and allow predictions to become less certain as observations are missed.

04

Integrate camera compensation and gated association

Estimate global motion from appropriate background features. Apply compensation only when the estimate is sufficiently reliable. Associate detections using motion gates, mask or box overlap, and size/shape consistency, with Hungarian assignment for competing candidates.

05

Implement track lifecycle management

Support tentative, confirmed, temporarily occluded, lost, and terminated tracks. Specify reappearance policy, expiration thresholds, and identity resets at hard scene cuts.

06

Run the ablation benchmark

Compare the existing classical baseline against mask proposals alone, Kalman plus association, and camera compensation enabled versus disabled. Retain the original VTSM-01 fixtures and ground truth unchanged.

3. Copy this directive to Antigravity
Writing
VTSM-02 — Phase 2 Execution Authorization

Decision: Phase 1 accepted for model feasibility. Phase 2 authorized.

Use the required GSD actions to achieve the goals and wherever needed.

Scope and safety

Continue inside experiments/visual-temporal-state/ only. Preserve VTSM-01 fixtures, baseline code, ground truth, results, and existing user changes. Do not modify production EME components, package files, certified release artifacts, or historical Live Pilot evidence. Do not train or fine-tune model weights.

Proceed autonomously through modular implementation, controlled benchmarks, and documentation, subject to the existing stop conditions for ambiguous licensing, downloads exceeding 1 GB, privileged access, system-wide changes, or any work outside the authorized experimental boundary.

Step 1 — Performance microbenchmark

Before integrating the full tracker, create a reproducible profiling harness.

Measure, separately:

Cold-start and warm-up costs.

CPU versus MPS steady-state encoder latency.

Actual input tensor dimensions and preprocessing cost.

Decoder latency for 1, 4, and 16 prompts sharing the same image embedding.

Total per-frame latency and mask-generation latency.

A representative short video with multiple tracked entities.

Median, P95, throughput, and peak memory where available.

Record exact runtime providers and component boundaries. The reported 42.87 ms decoder latency must not be treated as total per-frame processing time.

A different source frame normally requires a fresh image embedding. Cache embeddings for multiple prompts on the same frame, but do not silently reuse a previous frame's embedding as if it represented the current frame.

Evaluate whether MPS offers a useful steady-state improvement after warm-up. Do not assume the cold-start timing establishes either success or failure of GPU acceleration.

Step 2 — Implement the modular pipeline

Create testable components for mask proposals, motion prediction, camera compensation, association, track management, and VTSM state serialization.

Keep mask proposals, observed entity states, predicted states, and semantic object labels distinct.

Implement a timestamp-aware Kalman state containing bounding-box center, dimensions, and velocity, with documented covariance and measurement-update behavior.

Implement deterministic gated association using motion consistency, box or mask overlap, size/shape consistency, and Hungarian assignment. Add appearance features only if their additional cost and value can be measured.

Use the VTSM-01 global-motion estimate only when its confidence and inlier evidence are adequate. Apply camera compensation before calculating association costs, and document transform direction and coordinate conventions.

When a hard scene cut occurs, apply the explicit shot-identity policy and reject invalid cross-shot associations.

During occlusion, a track may remain alive as a prediction, but the state must not claim an observed mask or exact position that does not exist.

Step 3 — Add adversarial lifecycle tests

Cover:

New-track creation and confirmation.

Short and long missed-observation intervals.

Temporary occlusion and reappearance.

Two similar-looking objects crossing.

Multiple simultaneous tracks.

False duplicate proposals and overlapping masks.

Camera movement plus independent subject motion.

Scene cuts and identity-reset policy.

Low-texture inputs and invalid camera-motion estimates.

Out-of-order, repeated, and variable-interval timestamps.

Add negative controls that deliberately perturb mask locations, identity assignments, and timestamps. Verify that the tests and evaluation metrics detect these failures.

Step 4 — Run ablations

Use unchanged VTSM-01 Fixtures A–G and add controlled multi-object stress fixtures with independently generated ground truth.

Compare the classical baseline, mask proposals with basic association, Kalman-gated association, and camera compensation enabled versus disabled.

Report mask IoU only against ground-truth masks. Treat model-predicted IoU as a model quality estimate, not measured ground-truth accuracy.

Report proposal recall, trajectory center error and percentiles, identity switches, fragmentation, occlusion recovery, false tracks, missed objects, scene-cut errors, and end-to-end latency.

Define metric denominators and exclusion rules before evaluation. Publish per-fixture and aggregate results, preserving all failed cases.

Step 5 — Set honest performance expectations

Do not promise approximately 50 ms per frame based on decoder latency alone.

If fresh image encoding is too slow for the intended use, evaluate alternatives as separate measured experiments:

MPS acceleration, if useful.

Lower-resolution inference with separately measured accuracy impact.

Adaptive keyframe segmentation with validated propagation or optical-flow tracking on intermediate frames.

Prompting only for selected tracks on the current frame.

A later comparison with a video-native temporal segmentation model.

Any keyframe or propagation strategy must be tested for drift and identity errors. Do not assume it preserves segmentation quality automatically.

Real-time throughput is not a required gate for this phase; accurately measured end-to-end performance is required.

Step 6 — Deliverables and exit gate

Produce:

docs/VTSM_02_RESULTS.md

docs/VTSM_02_EXIT_GATE.md

Profiling results JSON.

Per-fixture tracking metrics.

Baseline-versus-candidate ablation table.

Ground-truth and prediction overlays.

Occlusion, identity-switch, cut-boundary, and uncertain-motion examples.

Exact execution commands, exit codes, environment versions, model provenance, and artifact hashes.

Run the complete controlled benchmark twice and compare outputs. Inspect actual overlays. Audit the full working-tree diff and preserve all pre-existing changes.

Use PASS, FAIL, or BLOCKED for every required gate. Do not claim production suitability, real-time performance, or general real-world robustness unless it is directly measured.

Finish with a recommendation based on the dominant measured failure mode. Stop before production EME integration.

4. What constitutes a successful VTSM-02?

I would not require real-time playback yet. I would require the system to demonstrate that it tracks correctly and that its costs are understood.

Gate

	

Required evidence




Fresh-frame segmentation

	

Valid masks generated from actual current-frame image embeddings




Track continuity

	

Stable identities across ordinary movement and short occlusions




Camera compensation

	

Measurable improvement or an honest finding that it does not help




Identity safety

	

No invalid carryover across tested hard cuts




Uncertainty

	

No fabricated observations when the model loses the subject




Performance

	

End-to-end timing, including encoding, decoding, association, and postprocessing




Reproducibility

	

Repeatable metrics or documented nondeterminism

My final directive: proceed autonomously with Phase 2. Resolve the full-pipeline latency question first, then build Kalman prediction, camera compensation, gated association, and lifecycle management as separate components. Keep all of it experimental until the benchmark shows that the complete system improves temporal identity over VTSM-01.
