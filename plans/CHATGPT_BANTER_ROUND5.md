Formal Architecture Decision: VTSM-03
ACCEPTED — Experimental Milestone

VTSM-03: Efficient Temporal Propagation and Adaptive Re-segmentation

I grant formal architectural sign-off for VTSM-03 as an experimental milestone, based on the evidence in your report.

The adaptive propagation architecture has demonstrated promising synthetic-fixture results, a low reported corrective re-segmentation rate, and improved track visibility in the reported boundary-recovery regime.

Full exit-gate closure remains pending

The sustained natural-footage throughput is 12.04 FPS against the original 20 FPS target. The report also describes the unseen-motion challenge as codified, but does not establish that all three challenge tests have actually been executed.

Production status

Not authorized

This acceptance covers the experimental milestone, not production readiness or integration into certified EME.

1. What VTSM-03 has demonstrated

The reported results show three significant achievements.

Propagation can preserve useful accuracy. The adaptive hybrid reports 0.60 px mean center error, 0.8396 mean IoU, and zero identity switches across the seven synthetic fixtures. These results are promising, although the exact performance claims still depend on the reproducibility and correctness of the underlying evaluator.

Adaptive correction matters. The reported recovery from 68.5% visibility for fixed N=10 to 97.8% in the boundary-recovery regime is especially relevant. It suggests that scheduled keyframes alone do not adequately handle all changes, while adaptive correction can recover a track that would otherwise be lost.

Neural inference has been reduced substantially. The reported keyframe count decreases from 420 to 48, an 88.6% reduction. The reported natural-footage corrective re-segmentation rate is also low.

The important point is that the system is beginning to use segmentation as a corrective resource rather than blindly invoking it on every frame.

2. Outstanding gates

Gate

	

Current assessment




Seven synthetic fixtures

	

Reported PASS




Adaptive boundary recovery

	

Reported improvement; retain frame-level evidence




Corrective re-segmentation rate

	

Reported 4.19%; verify denominator and trigger accounting




Natural-footage visibility

	

Promising, but regime-specific weaknesses remain




Sustained throughput

	

Target not met: 12.04 FPS versus 20 FPS




Unseen-motion challenge

	

Pending execution evidence for all three challenge tests




Production integration

	

Not authorized

One result deserves further attention: stable frontal speech has 84.2% reported visibility, appreciably below the other three regimes. That does not invalidate the milestone, but the failure intervals need diagnosis. Determine whether the lost visibility comes from mask propagation, track confirmation, incorrect invalidation, or the definition of the visibility metric.

The other remaining distinction is between the 18.89 ms median intermediate-propagation latency and sustained end-to-end throughput. The former indicates that the cheap path can be fast; the latter includes keyframe segmentation, corrective work, and other processing. A fast propagation step does not make the complete video pipeline a 20 FPS system.

3. Directives for the next step

I authorize Antigravity to continue within experiments/visual-temporal-state/ with the following priorities.

1. Execute the held-out challenge

Run the pine-branch test, disappearance/reappearance test, and identity-collision test on material not used for tuning. Codifying the protocol is not the same as passing it. Use independent masks and identity labels, and preserve the difficult frames.

2. Reconcile the performance and correction metrics

Report total frames, elapsed time, effective FPS, P50/P95 latency, deadline misses, scheduled keyframes, off-schedule corrections, and total encoder calls. Define the 4.19% denominator precisely and verify the calculation against the raw event log.

3. Investigate the speech-visibility gap

Review actual failure frames and classify each loss. Test corrections against the same ground truth, without tuning directly on held-out evaluation clips.

4. Publish the final gate disposition

Keep experimental acceptance distinct from performance-target completion. Update docs/VTSM_03_RESULTS.md and docs/VTSM_03_EXIT_GATE.md with actual executions, raw measurements, inspected visual evidence, and explicit PASS, FAIL, or BLOCKED decisions.

All existing safety boundaries remain in force: preserve the VTSM-02 baseline, do not alter production EME components or historical pilot evidence, and do not publish or integrate the experimental system into production.

Final sign-off

VTSM-03 is formally accepted as an experimental milestone. The evidence indicates that adaptive temporal propagation is a viable direction for EME, particularly for reducing expensive neural segmentation calls without sacrificing the reported synthetic-fixture accuracy.

The 20 FPS objective remains open, and the held-out challenge still needs execution evidence before full VTSM-03 exit-gate closure.

The next milestone is not to declare victory because the tracker is fast on easy frames. It is to prove that the tracker remains trustworthy when its predictions become difficult—and to recover before a silent tracking failure reaches the editor.