Formal Architecture Sign-Off: VTSM-03R3
MILESTONE VTSM-03 COMPLETE

Efficient Temporal Propagation and Adaptive Re-segmentation

Formal decision: ACCEPTED under ADR-VTSM03-01.

Based on the submitted VTSM-03R3 evidence, I approve closure of VTSM-03 as an experimental architecture milestone. The keyframe-latency limitation is explicitly documented, the interactive propagation path and standard-shot performance meet their scoped targets, and the difficult tracking cases have documented recovery behavior.

Production status remains separate

Completion of the experimental milestone does not authorize integration into the certified EME production baseline. VTSM-04 must validate the asynchronous keyframe architecture before production readiness can be considered.

1. Final acceptance assessment

Acceptance area

	

Final disposition




Synthetic regression suite A–G

	

Reported PASS, 7/7




Occlusion honesty and reappearance

	

Reported PASS




Multi-entity identity preservation

	

Reported PASS




Pine-branch mask quality and recovery

	

Reported PASS against declared criteria




Interactive propagation performance

	

52.9 FPS for one track; 41.0 FPS for two tracks




Standard-shot hybrid performance

	

25.1 FPS at the reported K=20 setting




Dense synchronous workload

	

Documented limitation; 11.03–14.55 FPS




Production isolation

	

Reported clean and unchanged




Overall experimental milestone

	

COMPLETE under the approved ADR

The acceptance is based on the report supplied by Antigravity; I have not independently executed the repository or recalculated its artifacts.

2. Why the architectural decision is accepted

The key decision is to separate interactive propagation performance from the cost of generating fresh neural segmentation anchors.

The measured propagation path is comfortably below the 50 ms per-frame target, and the standard-shot K=20 configuration reports 25.1 FPS. The dense synchronous workload remains slower, but that constraint is no longer being represented as if every workload must independently achieve 20 FPS under the same execution model.

ADR-VTSM03-01 assigns asynchronous background keyframe encoding and double-buffering to VTSM-04. This is an explicit architecture decision supported by the reported component measurements and workload breakdown.

One documentation correction should accompany the archived report: the illustrative 65.06 ms/frame calculation predicts about 15.37 FPS, whereas the measured dense workload is reported at 85–95 ms/frame. The difference should be labeled as modeled versus measured performance and attributed to the additional execution overhead. This is a documentation clarification, not a reason to reopen the accepted experimental milestone.

3. Roadmap directive

VTSM-03 is now closed. Preserve the accepted implementation and all evidence as the reference for VTSM-04.

The next milestone should focus on asynchronous keyframe encoding and responsive temporal-state updates: keep propagation available to the interactive path while expensive segmentation runs in the background, then publish fresh results without corrupting frame order or track identity.

VTSM-04 must demonstrate that this scheduling approach preserves masks, identity continuity, frame freshness, and failure recovery while improving sustained throughput. Until those tests pass, production integration remains unauthorized.

Final declaration

MILESTONE VTSM-03 COMPLETE.

The experimental milestone is formally accepted under ADR-VTSM03-01. The remaining dense-workload performance limitation is documented and carried forward to VTSM-04; it is not being misrepresented as a universal 20 FPS achievement.

Preserve the baseline, archive the reconciliation evidence, and proceed to the next milestone.