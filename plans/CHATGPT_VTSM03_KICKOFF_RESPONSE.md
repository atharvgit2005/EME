VTSM-03 kickoff review

Confirmed: the kickoff plan aligns with the architecture I authorized. Proceed with implementation and benchmarking inside experiments/visual-temporal-state/.

The plan addresses the three key requirements: efficient mask propagation, correct separation of camera and subject motion, and discovery of previously untracked entities between keyframes.

I approve the proposed module breakdown and both optical-flow candidates. Before running the full benchmark, I want four safeguards incorporated so the results demonstrate genuine improvements rather than merely faster processing.

1. Four additional safeguards

A. Make flow direction explicit. OpenCV's Farneback method produces a dense flow field, while Lucas–Kanade tracks selected points. They should be compared as separate propagation strategies. 
docs.opencv.org

For mask warping, cv2.remap uses a destination-to-source lookup map, so a forward flow field cannot automatically be passed in as the correct remap map. Use an appropriate backward-flow map or a validated forward-warping implementation, and test both directions on known synthetic translations. 
docs.opencv.org

B. Compensate camera motion exactly once. Your equation

𝑣
local
=
𝑣
total
−
𝑣
camera
v
local
	​

=v
total
	​

−v
camera
	​


is a useful conceptual model, but rotation and scale produce position-dependent motion. Estimate the global transform from background features, align the previous frame or mask into the current coordinate system, and then estimate residual local motion. Document the coordinate system and transform direction for every stage.

C. Make new-entity discovery resistant to camera movement. Frame differencing alone will produce many false proposals during a camera pan, lighting change, or scene cut. Apply it to camera-aligned frames where possible, gate proposals by region size and motion evidence, and add a periodic discovery fallback. Measure both time-to-discovery and false proposals per minute.

D. Keep throughput separate from responsiveness. A keyframe still takes around 123 ms for the encoder on MPS, even if the amortized cost is low. Report effective FPS, median/P95 latency, frame-deadline misses, and input-to-output delay separately. A pipeline processing 20 frames per second on average does not necessarily deliver a responsive 20 FPS preview.

2. Required benchmark comparison

Configuration

	

Primary purpose




VTSM-02 full-frame MobileSAM

	

Reference quality and timing




Fixed keyframe N=10

	

Short propagation intervals




Fixed keyframe N=20

	

Longer intervals and drift behavior




Adaptive hybrid

	

Accuracy/runtime trade-off with correction triggers




Sparse LK vs. dense flow

	

Propagation quality and runtime comparison

For every configuration, retain the original ground truth and evaluate every input frame, not just keyframes. Measure mask IoU, boundary drift, center error, identity switches, missed entities, time-to-discovery, propagation failures, and re-segmentation frequency.

Do not select a flow method based on speed alone. A faster method that silently accumulates mask drift is not an improvement.

3. Final execution directive for Antigravity
Writing

VTSM-03 kickoff is approved. Proceed autonomously with the implementation and benchmark plan, incorporating the four safeguards above.

Before the full run:

Validate sparse and dense flow direction on known translations, rotations, and scale changes.

Verify that camera motion is not double-applied and that the residual flow uses consistent coordinates.

Validate new-entity discovery under camera pans, lighting changes, occlusion, and scene cuts.

Verify that ground-truth evaluation includes propagated frames and keyframes equally.

Freeze metric definitions and benchmark inputs before comparing configurations.

For the final report, separate effective throughput, median and P95 latency, deadline-miss rate, and input-to-output delay. Include per-frame mask quality over the propagation interval, not only immediately after segmentation.

Retain VTSM-02 as the untouched reference baseline. Keep all changes inside experiments/visual-temporal-state/. Do not modify production EME, certified release artifacts, or historical pilot evidence.

The 20 FPS, 50 ms median, 1.5 px median center error, 0.80 mean mask IoU, and zero identity-switch targets remain goals to measure—not pre-approved claims. If a target fails, report the measured outcome and dominant cause honestly.

Finish with per-gate PASS, FAIL, or BLOCKED decisions, inspected visual evidence, exact commands, and reproducible result hashes. Do not integrate VTSM-03 into production EME at phase completion.

Final decision: authorized to proceed. Start with the flow-direction and camera-composition tests, then run N=10 and N=20 before adding adaptive triggers. That ordering will make it clear whether performance gains come from propagation itself or from the additional correction logic.