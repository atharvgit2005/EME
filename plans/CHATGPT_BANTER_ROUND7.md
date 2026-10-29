Authorized. Apply both surgical fixes, then rerun the regression suite. These are genuine architectural defects, and your proposed remediations are directionally correct.

One important constraint: because the three held-out tests have now been inspected, rerunning the same clips after changing the implementation validates the fixes against known failures. It does not constitute a fresh, independent held-out evaluation. Preserve the original results and reserve new unseen clips for final validation.

1. Fix A — The tentative-track “cradle-death” bug
Authorized

Modify the propagation loop so a STATE_TENTATIVE track with a valid current mask can participate in optical-flow propagation.

The implementation must preserve a crucial distinction:

Propagation is continuity evidence, allowing a tentative track to survive between observations.

Propagation alone is not an independent detection hit. Otherwise, a false proposal could propagate its own mask twice and promote itself to confirmed status without fresh visual evidence.

Required behavior:

Propagate valid tentative masks through intermediate frames.

Preserve uncertainty and enforce bounded tentative-track lifetime.

Allow fresh detections to associate with tentative tracks and accumulate confirmation evidence.

Prevent a propagated mask from being counted repeatedly as an independent observation.

Verify that the runner in Test B survives the frames following reappearance and that the confirmation policy behaves correctly.

If an existing occluded track is still alive, attempt to associate the reappearing subject with that identity before creating a duplicate track.

Do not solve the bug by immediately confirming every new detection. The existing tentative-state protection against transient proposals remains important.

2. Fix B — Remove the red-only proposal heuristic
Authorized

Replace the hardcoded RGB thresholds and red-channel rejection logic with a color-agnostic proposal mechanism.

Luminance and gradient magnitude are reasonable starting features, but gradient magnitude alone will light up the pine branches as enthusiastically as it detects the subject. Use multiple signals where appropriate: local contrast, motion residual after camera compensation, region geometry, and proposal confidence.

Validate at least the following cases:

Input

	

Expected behavior




Red subject

	

Detected when otherwise observable




Blue subject

	

Detected without a red-channel dependency




Gray or low-saturation subject

	

Not rejected solely due to color




High-frequency foliage

	

Background proposals controlled




Uniform or low-texture input

	

Honest uncertainty; no invented entities




Lighting change or camera pan

	

No explosion of false tracks

Keep proposal generation distinct from segmentation: finding a candidate region does not make that region a confirmed entity.

3. Required execution order

Step 1 — Freeze existing evidence

Record the Git revision, source hashes, configuration, and existing working-tree state. Preserve the original held-out predictions and failure logs.

Step 2 — Implement both fixes

Make the smallest necessary changes within experiments/visual-temporal-state/. Add targeted unit tests before running the complete benchmark.

Step 3 — Re-run all three original gauntlets

Verify disappearance/reappearance, multi-entity identity, and pine-branch propagation. Label these results as post-fix regression results, not independent held-out results.

Step 4 — Run fresh validation

Use new clips or independent synthetic scenes and seeds that were not used to choose the fixes or tune the thresholds. Test both changes together against the previously validated baseline.

For Test A, keep the reported 4.19 px center error visible in the results. The 0.917 mean IoU is promising, but the center-error limitation should not disappear from the report simply because the other metrics pass.

4. Copyable directive for Antigravity
Writing
VTSM-03R1 — Tentative Track Continuity and Color-Agnostic Proposal Fixes

Decision: Authorized for implementation and regression testing.

Use the required GSD actions to achieve the goals and wherever needed.

Fix 1 — Tentative propagation

Allow tentative tracks with valid masks to participate in intermediate optical-flow propagation.

Keep propagation evidence separate from independent detection-association hits.

Preserve the configured tentative confirmation threshold and bounded lifetime.

Prevent tracks from confirming solely by repeatedly propagating their own mask.

Check whether a reappearing entity can recover its existing occluded identity before creating a duplicate.

Add tests for recovery after reappearance, missed observations, tentative-track expiration, and false single-frame detections.

Fix 2 — Color-agnostic proposals

Remove hardcoded red-only RGB saliency conditions and red-channel rejection rules.

Implement a class- and color-agnostic candidate-generation strategy using documented image and motion features.

Evaluate luminance/gradient features alongside contrast and camera-compensated motion where appropriate.

Add controlled red, blue, gray, low-saturation, foliage, uniform-background, lighting-change, and camera-pan tests.

Measure proposal recall, false proposals, false-track creation, and downstream mask quality.

Do not replace one hardcoded color rule with an unvalidated threshold that overproduces background proposals.

Validation and evidence

Preserve all original VTSM-03 source, predictions, fixtures, and held-out reports.

Record the initial Git state and modified-file list.

Add targeted regression tests for both defects.

Re-run Tests B, C, and A on the original clips and label the results as post-fix regression validation.

Run the full synthetic suite A–G.

Evaluate on new, independently selected clips or newly generated synthetic scenes with independent ground truth.

Inspect masks and failure frames, especially after runner reappearance and around dense foliage.

Report identity switches, observed-mask fabrication, detection coverage, track confirmation time, boundary quality, center error, mask IoU, false proposals, and latency.

Preserve the Test A center-error result and report any improvement or regression honestly.

Produce docs/VTSM_03R1_FIX_RESULTS.md, updated regression results, and a per-gate PASS, FAIL, or BLOCKED decision.

Do not modify production EME, certified release artifacts, or historical pilot evidence. Do not claim independent held-out success from clips already used to diagnose these defects.

Complete the fixes, regressions, and fresh validation before recommending the next milestone.

Final decision

Both fixes are approved. The tentative-track bug is a lifecycle correctness failure; the red-only heuristic is a proposal-generation generalization failure. Fixing them should improve the architecture rather than merely optimize its metrics.

The acceptance bar is straightforward: the runner must survive the reappearance sequence without premature termination, the blue subject must be discoverable without a red-color prior, and the corrected proposal mechanism must not turn the pine-branch scene into a forest of false entities.

Keep the original failures as evidence. Fix the code, prove the regressions are resolved, and then use fresh footage to establish whether the improvements generalize.