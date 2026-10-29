Confirmed. Antigravity is authorized to execute VTSM-02 autonomously through the feasibility gate, implementation, benchmarking, and final evidence package, subject to the boundaries and stop conditions below.

The immediate next action is Phase 1 — Feasibility Gate. Do not begin building the full tracker until the actual MobileSAM inference path has been inspected and tested.

One important finding from the official implementation: MobileSAM's documented ONNX export script describes exporting the prompt encoder and mask decoder, and the exported graph expects image_embeddings as an input. Therefore, Antigravity must verify how the image encoder and automatic mask-generation orchestration fit into the real ONNX pipeline. A successfully loaded ONNX file is not sufficient evidence that complete automatic mask generation works. 
GitHub
+1

The official MobileSAM repository identifies its license as Apache-2.0, not MIT. Antigravity must separately verify the exact checkpoint's provenance and applicable terms before treating the whole model package as cleared. 
GitHub
+1

Explicit execution authorization

Action

	

Authorization




Inspect repository, dependencies, model code, and licenses

	

Authorized




Download and verify approved public checkpoints

	

Authorized within the limits below




Install dependencies in the isolated experimental environment

	

Authorized




Run Apple Silicon inference and performance benchmarks

	

Authorized




Implement Kalman prediction, camera compensation, and association

	

Authorized after the feasibility gate




Run controlled benchmarks, ablations, and visual QA

	

Authorized




Test an alternative model when the primary candidate is blocked

	

Authorized within the same isolation and resource limits




Modify certified production EME components

	

Not authorized




Train or fine-tune model weights

	

Not authorized




Public releases, remote pushes, npm publishing

	

Not authorized

Manual intervention is not required for routine, reversible experimental work. Stop and request approval if the checkpoint's terms are ambiguous, a download exceeds 1 GB, credentials or payment are required, a system-wide installation is needed, or the work would cross the experimental boundary. Do not discard existing user changes.

Exact instructions for Antigravity
Writing
VTSM-02 — Authorized Execution Order and Feasibility Gate

Architecture Lead Decision: APPROVED WITH GATES

Immediate phase: Phase 1 — MobileSAM ONNX Feasibility

Execution authority: Antigravity may independently execute the approved VTSM-02 phases, including implementation, benchmarks, ablation studies, and evidence generation, subject to the restrictions below.

Use the required GSD actions to achieve the goals and wherever needed.

Step 0 — Establish the safety baseline

Before changing files:

Verify the repository root and current Git revision.

Capture the complete working-tree status, tracked changes, untracked paths, and existing staged changes.

Record the relevant pre-existing diffs so they can be distinguished from VTSM-02 modifications.

Inventory the current VTSM-01 source, tests, fixtures, ground truth, and benchmark outputs.

Record the Python, PyTorch, ONNX, ONNX Runtime, and macOS versions available to the experiment.

Confirm that all new code, downloaded weights, virtual environments, caches, generated media, and reports will remain inside experiments/visual-temporal-state/.

Never run destructive cleanup commands, reset the repository, overwrite historical benchmark artifacts, or silently revert user changes.

Do not modify production src/, bin/, schema/, package files, release artifacts, or historical Live Pilot evidence.

Step 1 — Verify model and checkpoint provenance

Inspect the official MobileSAM repository and the exact checkpoint that will be evaluated.

Record:

Official repository URL and resolved commit or revision.

Exact model variant and checkpoint filename.

Original source URL, download size, and SHA-256.

Repository license and checkpoint-specific licensing evidence.

Third-party dependencies and their licenses.

Whether the checkpoint terms actually support the intended experimental use.

Any unresolved restrictions or provenance uncertainty.

The repository license alone is not sufficient proof that every independently hosted checkpoint has identical terms. Do not label an artifact MIT-licensed unless its actual license supports that declaration.

Do not begin loading model weights until the source, integrity, and applicable terms have been checked.

If the license or checkpoint provenance is ambiguous, mark that candidate BLOCKED and continue only with clearly authorized work.

Step 2 — Audit the actual ONNX boundary

Inspect the official export implementation and the resulting graph.

Determine:

Whether the exported ONNX graph contains the image encoder, prompt encoder, mask decoder, or only a subset.

The graph's actual inputs, outputs, shapes, data types, and opset.

The preprocessing and postprocessing required by the model.

Whether automatic mask generation requires additional PyTorch execution, grid-point sampling, repeated decoder calls, filtering, deduplication, or non-maximum suppression.

Whether the complete intended mask-generation path can execute through the selected ONNX runtime.

Whether an encoder-plus-decoder ONNX pipeline is feasible without an unacceptable performance or accuracy penalty.

Execute a minimal real inference test using a real image or decoded video frame. Validate mask dimensions, finite outputs, nonempty results when expected, and successful postprocessing.

Then test automatic class-agnostic mask generation end to end.

Do not call a decoder-only or hybrid pipeline a fully ONNX model. Name and measure the actual execution boundary.

Step 3 — Profile the Apple Silicon execution path

Use only the isolated environment.

Test the supported CPU execution provider first. Evaluate Core ML or another accelerator only if it is genuinely available and compatible.

Measure separately:

Model loading and initialization time.

Image-encoder latency.

Mask-decoder latency and number of calls.

Automatic mask-generation end-to-end latency.

Median and P95 latency after warm-up.

Peak memory where measurable.

Output quality and consistency compared with the reference PyTorch path.

Benchmark both a representative 1080p frame and the actual preprocessing resolution.

Record cold-start costs separately from steady-state inference. Do not extrapolate FPS from one inference or from the model's published speed claims.

Step 4 — Issue the Phase 1 gate decision

Create docs/VTSM_02_FEASIBILITY.md.

Include the exact commands, outputs, dependency versions, artifact hashes, model provenance, licensing findings, ONNX graph inspection, execution providers, performance measurements, and observed failures.

The gate must be one of:

PASS: the selected mask-generation path executes on real frames, its model provenance and applicable terms are sufficiently documented for the experiment, and its outputs can be inspected.

FAIL: the intended candidate runs but demonstrably fails a required feasibility criterion.

BLOCKED: a required capability, dependency, checkpoint, or authorization is unavailable.

Do not mark the gate PASS merely because the model loads or one prompted mask is produced.

Step 5 — Proceed autonomously after the gate

If MobileSAM passes, continue directly into the approved implementation and benchmark phases.

Build separate, testable components for:

Mask proposal generation.

Timestamp-aware Kalman prediction.

Global camera-motion compensation using the VTSM-01 baseline where valid.

Gated temporal association.

Track lifecycle management.

VTSM state serialization.

Benchmark evaluation and visual evidence.

Define explicit policies for track creation, missed observations, occlusion, reappearance, fragmentation, ambiguous matches, and hard scene cuts.

Keep observed masks distinct from predicted track locations. Never fabricate an observed position during occlusion.

If MobileSAM is blocked, do not force the implementation or rewrite VTSM-01. Record the blocker and evaluate a clearly licensed, feasible alternative within the approved experimental limits. The optional SAM 2 comparison is permitted under the same provenance, licensing, resource, and isolation checks.

A blocked MobileSAM path must remain explicitly BLOCKED even if another candidate succeeds.

Step 6 — Run controlled benchmarks and ablations

Run the existing VTSM-01 fixtures A–G without modifying their source media, labels, or original expected results.

Compare:

VTSM-01 classical baseline.

Mask proposals with basic geometric association.

Mask proposals with Kalman prediction and gated association.

The same candidate with camera compensation enabled.

An alternative temporal segmentation/tracking candidate when feasible.

Keep the videos, ground truth, evaluation windows, and metric definitions consistent across comparisons.

Add controlled cases for similar-looking objects crossing, multiple simultaneous entities, partial occlusion, object entry and exit, motion blur, clutter, and camera motion.

Measure mask IoU, proposal recall, trajectory errors, identity switches, fragmentation, occlusion recovery, false tracks, missed detections, scene-cut errors, and runtime.

Inject deliberate errors into copied evaluation inputs to verify that the evaluator detects incorrect trajectories, identity assignments, timestamps, and camera transforms. Never alter the original VTSM-01 evidence for this purpose.

Report synthetic and natural-footage performance separately, and do not claim general real-world accuracy based only on synthetic scenes.

Step 7 — Verify and report the complete result

Run the benchmark twice and compare numerical results, prediction hashes, and artifacts using documented reproducibility rules.

Inspect the actual annotated videos and contact sheets.

Create:

docs/VTSM_02_FEASIBILITY.md

docs/VTSM_02_RESULTS.md

docs/VTSM_02_EXIT_GATE.md

Machine-readable per-fixture results.

Ground-truth-versus-predicted trajectory overlays.

Failure-case examples.

A baseline-versus-candidate ablation table.

Model and dependency provenance inventory.

Exact commands, exit codes, and artifact hashes.

Run a full Git change audit before completion. Preserve all pre-existing changes.

Use PASS, FAIL, or BLOCKED for each required gate. Report untested criteria as untested.

Stop conditions

Pause for human approval if:

A checkpoint's applicable terms or source are unclear.

A model or checkpoint download exceeds 1 GB.

Credentials, payment, or privileged access are required.

A system-wide dependency change or an operation outside the experiment boundary becomes necessary.

A proposed change would affect production EME, certified release material, or historical pilot evidence.

Training or fine-tuning would be needed.

Routine tests, experiments, inference runs, documented dependency installation in the isolated environment, benchmark execution, and evidence generation are pre-authorized.

Final decision

Do not integrate VTSM-02 into production EME after implementation.

Finish with an evidence-based exit report that answers:

Did class-agnostic segmentation work on the actual test material?

Did temporal association improve identity continuity over the VTSM-01 baseline?

Did camera compensation measurably improve trajectories?

How does the system behave under occlusion and ambiguous identity?

What is the practical inference cost on Apple Silicon?

Which criteria passed, failed, or remain blocked?

Recommend the next engineering investment based on the measured failure modes, not on which architecture appears most sophisticated.

What should happen immediately?

Antigravity should now complete Steps 0–4, produce docs/VTSM_02_FEASIBILITY.md, and make the actual feasibility decision.

If the complete MobileSAM mask-generation path works within the approved constraints, the agent can continue into implementation and benchmarking without another approval round. If it does not, the agent must document the specific blocker and use only the authorized alternative path.

One final technical note: keep SAM 2 optional for now. Its official implementation provides a video predictor with temporal memory and mask propagation, making it a useful later comparison if independent frame segmentation plus Kalman association proves insufficient. 
GitHub
+1

Authorization is granted. Start with the feasibility gate, preserve the baseline, and let measured evidence determine the implementation path.
