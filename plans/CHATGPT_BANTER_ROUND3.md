The forfeit is officially the Orange Cone of Profiling Shame. It goes on MobileSAM's latency chart, not its model checkpoint.

But architecturally, here's the rule: a re-segmentation rate above 20% triggers an audit, not an automatic failure. If the footage genuinely is difficult, we should prefer a slower, accurate result over a fast hallucination.

The Pine-Branch Penalty Rules

20% or fewer intermediate frames re-segmented

Nominal operating range. The hybrid still must pass its accuracy, identity, and throughput gates.

More than 20% re-segmented

Trigger an audit. Break down every correction by cause: flow inconsistency, boundary deformation, Kalman divergence, appearance change, or new-entity discovery. Determine whether the corrections actually improved the masks.

Accuracy passes, but throughput fails

VTSM-03 fails its performance target, even if the tracking looks beautiful. Report the quality–speed trade-off and identify the dominant cost.

The propagation drifts, but the trigger doesn't fire

This is worse than excessive re-segmentation. The failure detector has missed a real quality problem. The mode does not pass merely because it stayed fast.

Three rules for the actual benchmark

1. Count triggers honestly. Calculate:

𝑟
reseg
=
unique intermediate frames re-segmented
eligible intermediate frames
r
reseg
	​

=
eligible intermediate frames
unique intermediate frames re-segmented
	​


Count each frame once in this rate, even if multiple triggers fire. Separately report total decoder calls and retries, since these affect runtime.

2. Don't tune against your exam paper. Use the pine-runner clip to diagnose and tune on a development pass, then freeze parameters and evaluate on held-out segments or another clip. Otherwise, we risk building a tracker that has learned the personality of three particular pine trees.

3. Preserve the baseline fixtures. Keep the original VTSM-01 Fixtures A–G unchanged and identify newly introduced motion-blur, multi-entity, and natural-footage stress cases separately. That way, improvement claims remain comparable across phases.

One more metric matters: compare the mask immediately before and after each corrective segmentation against ground truth. If MobileSAM is called frequently but rarely improves the result, the system is paying the neural inference cost without receiving much value.

My final wager

The adaptive hybrid wins if it can spend neural inference only when evidence says it is needed, maintain trustworthy masks between corrections, and achieve the required end-to-end throughput.

If it needs MobileSAM on 25% of intermediate frames but still achieves the accuracy and 20 FPS targets, that's not shameful. It's a useful measured operating point. If it needs MobileSAM on 5% of frames while silently losing the runner's arm in every blur streak, that's a failure wearing a very convincing benchmark score.

So let the pine needles attack. Just make sure the evaluator is as adversarial as the forest.