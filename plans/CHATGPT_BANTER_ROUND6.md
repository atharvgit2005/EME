Architecture Lead's decision: run the three held-out gauntlets first. Do not deploy the warm worker daemon yet.

You've reached the point where the biggest risk is optimizing a pipeline whose failure behavior has not been fully validated. Freeze the current VTSM-03 implementation, establish its correctness on unseen footage, and then optimize the runtime without changing the algorithm underneath your benchmark.

1. The execution order
01
Test B — Disappearance and Reappearance
First

Start with the clearest safety invariant: the system must distinguish an unobserved subject from an observed subject.

Verify that full occlusion produces no fabricated observed masks, the track remains in an appropriate occluded state, and reappearance does not accidentally create a new identity or attach the old ID to another object.

Measure: false observed masks during occlusion, re-acquisition delay, identity continuity, and mask IoU before and after recovery.

02
Test C — Identity Collision
Second

Challenge the Hungarian associator with two similar-looking subjects crossing paths while the camera pans.

Measure: identity switches, fragmentation, incorrect re-identification, and per-track trajectory error. A tracker can have excellent average center error while swapping the identities of two subjects.

03
Test A — Pine-Branch Gauntlet
Third — hardest generalization test

Finally, test the adaptive propagation system against handheld camera shake, high-frequency foliage, blur, and a runner weaving between branches.

Measure: mask leakage into the background, boundary accuracy, flow failures, correction-trigger precision, re-segmentation rate, and tail latency.

Important: freeze the parameters before running these tests, and execute all three without tuning between them. If you adjust thresholds after seeing Test B, Tests C and A are no longer fully independent of your development decisions.

For Test A, define how boundary annotation tolerance is handled. Zero confident leakage onto unrelated branches is a reasonable safety objective; literal zero erroneous pixels in every natural-footage mask may be too brittle without precise pixel-level ground truth.

2. One correction to the studio-speech finding

The latest finding is a useful correction: the creator track was reportedly visible for 121 out of 121 frames. The 84.2% regime-level figure apparently included the foreground desk entity, which was correctly marked occluded during interactions.

That should be recorded as two separate metrics:

Creator visibility: 121/121 frames, or 100%.

All-entity visibility: the aggregate across the creator and desk tracks, with occlusion explicitly represented.

If the creator's hands hide only part of the desk, use partially_occluded where the annotation supports it. A track-level decision to mark the entire desk as occluded should be based on the defined visibility policy, not just the presence of an occluder.

This distinction matters because a truthful tracker should not be penalized for correctly reporting occlusion, but neither should it be allowed to hide tracking failures behind an overly broad occlusion label.

3. When to build the warm worker daemon

After the held-out results are recorded, proceed with the persistent worker and performance investigation.

The daemon is a sensible candidate, but don't assume that it will deliver 20+ FPS merely by removing process startup overhead. Your reported 18.89 ms propagation median already shows that the intermediate path is relatively fast. You need to determine how much time is actually spent in process-boundary marshaling, frame transfers, MPS synchronization, keyframe encoding, and corrective inference.

The daemon should then be benchmarked against the frozen VTSM-03 implementation using the same frames, configuration, and accuracy checks.

Measurement

	

Requirement




Effective throughput

	

At least 20 FPS over the complete evaluation run




P50/P95 latency

	

Report separately for propagation, keyframes, and corrective segmentation




Identity and mask quality

	

No regression beyond the predefined tolerances




Memory and stability

	

No unbounded buffer growth or stale-frame reuse




Reproducibility

	

Equivalent state output under the same deterministic test conditions

Pinned memory, reusable buffers, and a persistent inference process may help, but verify the actual transfer and synchronization costs before selecting an implementation. Keep separate metrics for average throughput and responsiveness; one does not guarantee the other.

4. Explicit directive for Antigravity
Writing
VTSM-03 — Held-Out Validation Before Runtime Optimization

Use the required GSD actions to achieve the goals and wherever needed.

Authorization: Execute held-out Tests B, C, and A against the frozen VTSM-03 adaptive-hybrid implementation before modifying the runtime architecture.

Record the repository revision, working-tree state, configuration, thresholds, model hashes, and benchmark input hashes.

Freeze the evaluation configuration. Do not tune against any of the three held-out tests.

Execute Test B (disappearance/reappearance), Test C (identity collision), and Test A (pine-branch gauntlet) with independent ground truth.

Save raw predictions, per-frame mask and identity metrics, failure-event logs, corrective trigger logs, and inspected overlays.

Report per-test PASS, FAIL, or BLOCKED. Do not claim success merely because all six existing unit tests pass.

Diagnose failures using separate development footage. Preserve the original held-out results and do not silently replace failed predictions.

Only after the baseline held-out results are recorded, begin the warm persistent worker daemon as a separate performance experiment.

Compare the daemon and the frozen baseline on identical evaluation inputs. Measure total effective throughput, P50/P95 latency, keyframe encoding, corrective segmentation, process overhead, transfer overhead, memory, and frame freshness.

Verify that the daemon introduces no stale-frame reuse, dropped-frame concealment, or temporal-state inconsistency.

Keep all work inside experiments/visual-temporal-state/. Do not modify production EME, certified releases, or historical pilot evidence.

The 20 FPS target remains open until demonstrated end to end with accuracy and identity constraints satisfied.

Finish with docs/VTSM_03_HELD_OUT_RESULTS.md and a separate runtime optimization report. Recommend production-integration review only after the accuracy, safety, and performance gates are supported by reproducible evidence.

Final decision

Run B → C → A first, then build the daemon.

The held-out tests tell us whether the current perception architecture is trustworthy. The daemon tells us whether that architecture can run fast enough. Those are two different questions, and we should answer them in that order.

The Orange Cone stays in storage—but the 20 FPS target stays open until the complete pipeline, not just the propagation loop, proves it can meet it.