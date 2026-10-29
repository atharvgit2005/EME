Formal Architecture Decision: VTSM-03R2
VTSM-03R2: Accepted as an Experimental Revision

Bug fixes, identity recovery, and regression validation

I accept the reported correction of occlusion-truncation poisoning, the camera-aligned motion-prior fix, and the associated improvements to the experimental tracker.
VTSM-03 Overall Exit Gate: Still Open

Performance and tail-error requirements remain unresolved

I cannot honestly declare the entire phase complete while the reported end-to-end throughput remains below the approved 20 FPS target.

The results are substantially stronger. But the question is whether all completion criteria have been met, not whether the latest fixes work.

1. What receives formal sign-off

Area

	

Decision




Test B: Occlusion safety and identity recovery

	

Reported PASS




Test C: Blue-mask drift correction

	

Reported improvement from 0.6200 to 0.9661 IoU




Test C: Identity switches

	

Reported zero switches




Test A: Pine-branch mask quality

	

Reported IoU 0.8634, above the 0.80 target




Corrective re-segmentation

	

11.39%, below the 20% budget




Synthetic regression A–G

	

Reported 7/7 PASS




Production isolation

	

Reported PASS

These are meaningful achievements. In particular, reconstructing the subject's canonical unoccluded extent rather than trusting a box clipped by an occluder is a justified correction. The motion-prior coordinate fix also addresses a plausible source of texture-period snapping.

This is approval of the experimental revision based on your report, not independent execution of the repository.

2. Why I cannot declare COMPLETE

The performance requirement remains unmet.

End-to-end throughput

10.5–12.04 FPS

Approved target: at least 20 FPS

The reported intermediate propagation latency of 18.89 ms is encouraging, but it does not include the full cost of keyframe encoding, corrective segmentation, and other pipeline work. The persistent-worker optimization is the next logical step.

Tail errors require explicit review

Test A: P95 center error 61.63 px

The median of 4.26 px meets the stated handheld-footage tolerance, but the P95 indicates that some frames may have severe drift. Before final closure, inspect these worst-case frames and determine whether they represent brief recoverable failures or a systematic propagation weakness.

Identity Collision needs a threshold audit

Amber subject: median center error 12.04 px

Zero identity switches is excellent, and the 0.8232 mean IoU passes the stated IoU threshold. However, the center-error result must be assessed against the correct predeclared threshold for that test. If the synthetic 1.5 px criterion applies, it has not passed.

3. Final instructions

The next phase of work should concentrate on these remaining issues, without changing the accepted R2 baseline:

Optimize runtime. Profile the proposed persistent worker, buffer reuse, and MPS transfer overhead. Compare against R2 on identical input footage, including every keyframe and corrective re-segmentation.

Investigate tail failures. Inspect the frames responsible for Test A's 61.63 px P95 error and record whether the adaptive triggers fired appropriately.

Resolve metric eligibility. Apply the predeclared center-error thresholds to each test category. Do not weaken thresholds after observing the results.

Revalidate after optimization. Confirm that improved throughput does not regress IoU, identity continuity, occlusion honesty, or recovery behavior.

Preserve the evidence. Keep R2 artifacts and original held-out results immutable; record new results separately.

Production EME integration remains unauthorized.

Final disposition

VTSM-03R2: ACCEPTED.

VTSM-03 overall: NOT YET COMPLETE.

The fixes are accepted, and the tracker has made credible progress. But the 20 FPS end-to-end target remains open, and the high-tail errors require a documented decision against the established criteria.

I will grant final exit-gate closure when the complete pipeline meets the approved performance target—or when an explicit, evidence-backed architecture decision formally changes that requirement—and the remaining accuracy gates are resolved.