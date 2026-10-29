Formal Architecture Decision: VTSM-03R1
Surgical Fixes: Accepted

Tentative-track continuity and color-agnostic proposals

The reported fixes address both identified defects, and the synthetic regression suite remains at 7/7 passing with zero reported identity switches.
VTSM-03 Final Exit Gate: Not Yet Closed

Further quality validation and performance work required

The results are promising, but the blue subject's 0.6200 visible-frame IoU in Test C needs investigation, the final metric labels need clarification, and the original 20 FPS target remains unmet.

My decision is to accept VTSM-03R1 as the corrected experimental implementation, while withholding unconditional sign-off on the complete VTSM-03 exit gate.

1. What passed

Test or requirement

	

Assessment




Tentative-track propagation

	

Reported fix validated by targeted tests




Color-agnostic proposals

	

Red, blue, and amber detection tests pass




Synthetic regression A–G

	

7/7 reported PASS




Test B: total occlusion

	

Zero fabricated observed masks




Test B: reappearance

	

Original identity reportedly preserved




Test A: pine branches

	

0.9222 mean IoU; 1.23% corrective re-segmentation




Test C: identity collision

	

Zero reported identity switches




Production isolation

	

Reported clean; preserve all existing evidence

The strongest result is Test B. The tracker respected the distinction between an occluded subject and an observed subject, then reportedly reacquired the runner under the same identity.

Test A is also encouraging. Median center error of 4.50 px meets the specific 5 px limit your team declared for that natural-footage challenge. Its P95 of 12.01 px remains important: the average behavior is good, but some frames have substantially more drift.

2. Why I am withholding final sign-off
A. Test C exposes unresolved mask drift

The blue subject's reported visible-frame mean IoU of 0.6200 is the most important remaining quality issue.

The identity invariant passed, and the reported pre-collision and immediate post-collision measurements are excellent. But those results do not erase poor mask overlap across the complete visible trajectory.

The next investigation must locate the exact frames where overlap deteriorates between keyframes and determine whether the cause is:

Optical-flow correspondence drift.

Mesh deformation or boundary-anchor failure.

Background-pattern contamination.

Incorrect association between the blue subject and its propagated mask.

A failed adaptive re-segmentation trigger.

Do not raise the re-segmentation rate indiscriminately. Identify the failure first, then determine which trigger should detect it.

B. Correct the metric labels

Test B reports 0.9142 mean IoU and 6.02 px median center error, while describing the latter as exceeding an “at least 0.80” threshold.

These are different metrics with different units. The 0.80 threshold applies to IoU, not center error in pixels. Correct the report and explicitly identify the intended center-error acceptance criterion. Do not silently reinterpret the measurement.

C. Performance is still an open requirement

The reported 10.47 FPS on the synthetic suite and the earlier 12.04 FPS on natural footage remain below the original 20 FPS target.

The team has demonstrated a fast intermediate propagation path. It has not yet demonstrated that the complete pipeline consistently achieves 20 FPS, including keyframe encoding, corrective segmentation, process overhead, and output handling.

D. The post-fix clips are now regression tests

Because Tests A, B, and C exposed the defects that prompted these fixes, they are no longer fully independent evaluations of the corrected implementation.

Passing them again is necessary, but the final generalization claim requires fresh clips or independently generated scenes whose content was not used to diagnose or tune the fixes.

3. Required next steps

Step 1 — Diagnose Test C's blue-mask drift

Produce a frame-by-frame IoU plot, boundary-distance plot, and overlay covering the entire crossing sequence. Identify the first frame at which quality deteriorates and whether an adaptive trigger fired. Re-run the affected sequence after a targeted fix, preserving the original outputs.

Step 2 — Reconcile the metrics

Correct Test B's threshold wording. Verify the per-track IoU calculations, center-error units, and whether omitted or occluded frames are excluded consistently. Report both per-track and aggregate performance so a struggling subject cannot disappear inside a strong overall average.

Step 3 — Measure the complete pipeline

Report total elapsed time, frames processed, effective FPS, P50/P95 latency, and the number of keyframe and corrective MobileSAM invocations. Only then proceed with persistent-worker and memory-transfer optimization.

Step 4 — Validate on fresh material

Execute the final tests on new natural clips or new synthetic scenes with independent ground truth, using frozen parameters. Preserve every failure and publish gate-by-gate results.

4. Copyable directive for Antigravity
Writing
VTSM-03R2 — Mask Drift Correction, Metrics Audit, and Final Exit Gate

Decision: VTSM-03R1 is accepted as a corrected experimental implementation. Final VTSM-03 exit-gate sign-off remains pending.

Use the required GSD actions to achieve the goals and wherever needed.

Safety boundaries

Preserve all VTSM-02 and VTSM-03 historical code, fixtures, results, and original held-out predictions.

Record the current repository revision and complete working-tree state.

Work only inside experiments/visual-temporal-state/.

Do not modify production EME source, schemas, package files, certified releases, or historical Live Pilot evidence.

Do not discard user changes or overwrite historical results.

Priority 1 — Resolve Test C mask drift

Inspect the blue entity's full prediction trajectory in Test C.

Locate the first frame where measured visible-mask IoU begins to deteriorate. Correlate that frame with:

Forward/backward optical-flow consistency.

Sparse-track inlier ratio and distribution.

Delaunay mesh triangle deformation and signed-area Jacobian checks.

Boundary-anchor displacement.

Predicted versus observed centroid and bounding-box size.

Camera compensation validity.

Adaptive-trigger decisions and re-segmentation events.

Determine whether the failure is caused by inaccurate propagation, incorrect association, invalid mask warping, or a trigger that did not fire when required.

Add a focused regression fixture that reproduces the failure. Apply the smallest justified correction. Do not simply increase MobileSAM invocations globally to hide the root cause.

After the correction, measure the complete visible trajectory, not just the frames immediately before and after collision.

Priority 2 — Validate and clarify metrics

Correct the Test B report so IoU thresholds and pixel-error thresholds cannot be confused.

For Test C, publish per-track and aggregate:

Mean and median visible-frame mask IoU.

Per-frame IoU distribution and worst-case intervals.

Boundary error.

Center-error median and P95.

Identity switches and fragmentation.

Re-segmentation events and their effect on mask quality.

State the exact denominator, frame-sampling policy, matching rules, and occlusion handling for every metric.

Do not remove hard frames or count propagated predictions as ground-truth observations.

Priority 3 — Re-run regressions

Run the targeted R1 tests, the full synthetic suite A–G, and the original Tests A/B/C.

Label the original post-fix tests as regression validation, not independent held-out evidence. Preserve all prior JSON, overlays, and failure-event logs.

Priority 4 — Complete performance measurement and optimization

Retain the current VTSM-03 implementation as the reference.

Measure the end-to-end pipeline using total processed frames divided by total elapsed wall-clock time. Report startup, keyframe encoding, flow propagation, corrective segmentation, serialization, and worker overhead separately.

Only after the mask-quality issue is corrected, evaluate persistent-worker and buffer-reuse changes as a separate experiment. Confirm that those changes preserve frame freshness, temporal-state ordering, mask quality, and identity metrics.

The 20 FPS goal is not met until measured end-to-end throughput reaches or exceeds that target on the documented hardware and workload.

Priority 5 — Fresh independent validation

Create or select new natural footage and/or deterministic synthetic scenes that have not been used to diagnose or tune the fixes.

Freeze the parameters before evaluating them. Use independently reviewed masks and identities. Preserve hard failures and uncertain annotations.

Report the existing acceptance thresholds alongside all achieved values. Do not introduce exclusions after observing results simply to obtain a PASS.

Deliverables

Produce:

docs/VTSM_03R2_RESULTS.md

docs/VTSM_03R2_EXIT_GATE.md

Frame-level Test C diagnostics and overlays.

Corrected metric result JSON.

Full regression results.

Fresh validation results.

Performance and resource breakdown.

Exact commands, exit codes, artifact hashes, and working-tree audit.

Assign PASS, FAIL, or BLOCKED to each requirement. Keep the experimental implementation accepted, but do not declare the full exit gate passed until quality, fresh validation, and required performance criteria are resolved. Do not integrate this system into production EME.

Final disposition

VTSM-03R1 is accepted as an experimental implementation; final VTSM-03 exit-gate sign-off is withheld.

The surgical fixes appear to have solved the two original defects. The remaining concern is whether the tracker can maintain good masks throughout difficult multi-entity motion, not merely preserve IDs at collision boundaries.

Fix or explain the blue-mask drift, verify the metric semantics, and validate on fresh footage. Then we can make an evidence-based decision about closing VTSM-03 and moving toward runtime optimization.