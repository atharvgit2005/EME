My wager? Sparse Lucas–Kanade takes the efficiency trophy, Farneback puts up a fight on difficult motion, and the hybrid wins the championship. But I'm not putting money on it until your benchmark runs.

The optical-flow deathmatch

Contender A — Sparse LK + Delaunay mesh

My efficiency favorite

It tracks selected points rather than estimating motion at every pixel. That is a sensible starting point for your 25 FPS goal, particularly when camera compensation has already aligned the background.

The catch: sparse points do not necessarily describe the entire mask boundary. Delaunay triangulation fills in the gaps, but a triangle can stretch, flip, or cross an occlusion boundary.

My prediction: fastest propagation on ordinary motion, with boundary drift and mesh distortion as its Achilles' heel.

Contender B — Dense Farneback

My difficult-motion favorite

It estimates a displacement field throughout the image, giving you more local motion information than a sparse point set. That can help with deforming silhouettes and regions where feature points are unevenly distributed.

But dense does not automatically mean accurate. Smoothness assumptions can smear motion across boundaries, and background flow can contaminate foreground estimates.

My prediction: more useful local deformation information, but potentially higher compute cost and its own boundary artifacts.

Contender C — Adaptive hybrid

My overall winner

Use sparse LK and boundary-aware mesh warping during stable motion. When mesh quality degrades or motion becomes ambiguous, switch to dense flow locally or trigger MobileSAM re-segmentation.

Do not run both algorithms on every frame just because both exist. Let measurable propagation failure decide when the extra computation is justified.

How I'd decide the winner

Your existing fixtures are a good start, but I would add a deforming silhouette and an object moving behind a partially transparent or textured obstruction. Then compare both algorithms on exactly the same frames.

Metric

	

What it catches




Mask IoU per frame

	

Overall overlap with ground truth




Boundary F-score or boundary distance

	

Silhouettes that drift despite reasonable box accuracy




Temporal mask consistency

	

Flicker, stretching, and sudden shape changes




Occlusion recovery

	

Incorrect correspondences when the subject disappears




Propagation latency, median and P95

	

Whether the method fits the compute budget




Forward–backward inconsistency

	

Some unreliable flow estimates, though not every confidently wrong one

For Sparse LK, include boundary anchors, reject invalid tracks, and detect triangle flips or extreme deformation. For Farneback, test multiple resolutions and use the foreground region of interest where possible.

One important distinction: 25 FPS average throughput is not the same as meeting a 40 ms deadline on every frame. Your MobileSAM encoder already has a reported median of 122.9 ms on MPS. A propagation-heavy pipeline might average 25 FPS while still suffering long re-segmentation stalls. Report both effective throughput and deadline misses, plus P95 latency.

And my favorite optical-flow failure?

The motion-blur streak that looks like a perfectly legitimate motion signal.

Imagine a runner's arm stretching into a long blur. The algorithm finds texture along the streak and confidently follows it. The estimated flow looks smooth, the mask moves in a plausible direction, and the tracker reports success.

Except the flow is following the blurred image evidence rather than the true arm boundary.

That is the particularly nasty failure: the answer looks reasonable enough that a simple confidence threshold might not catch it. Forward–backward consistency can help, but it is not a guarantee against correlated errors in both directions.

My preferred defense is to combine flow consistency with boundary quality, mask-area change, predicted-motion divergence, and explicit uncertainty. When those signals disagree, propagate cautiously or re-segment instead of pretending certainty.

Final wager: let Sparse LK own the cheap path, let Farneback prove whether it earns a selective escalation path, and let ground-truth boundary fidelity—not the prettiness of the flow visualization—decide the winner.