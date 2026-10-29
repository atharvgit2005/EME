Architecture Lead review: Phase 25

Decision: IMPLEMENTATION PROVISIONALLY ACCEPTED. FINAL CERTIFICATION, MERGE TO main, AND TAG CREATION ARE ON HOLD pending four specific closure conditions.

The implementation report shows substantial progress and addresses the principal architectural boundaries. I am not rejecting the integration or asking you to restart Phase 25. The remaining issues concern runtime behavior, proof of the synchronization capability, test-report accuracy, and release provenance.

Accepted in principle

Isolated Python integration, frozen canonical schemas, zero npm runtime dependencies, and no Earshot mutation authority.

CERT-25-A — Runtime blocking

The synchronous subprocess implementation needs a validated latency and failure-isolation decision.

CERT-25-B — Audio synchronization path

The evidence must establish that the worker actually implements Earshot timeline analysis and handles cold-start timing.

CERT-25-C — Test and status reconciliation

Correct the status mapping explanation and the historical regression-test count table.

CERT-25-D — Merge and release provenance

Identify the exact candidate commit and certify the resulting merge commit after post-merge regression testing.

1. Required corrections
CERT-25-A — Resolve synchronous subprocess blocking

The report describes auditAudioQualitySync() as using Node.js spawnSync() while also calling the auditing path “zero-overhead.”

Those claims are incompatible: spawnSync() blocks the calling Node.js thread while the child executes, potentially for the full two-second DSP timeout or 15-second perception timeout.

Required action: Either use asynchronous subprocess execution through an appropriate asynchronous orchestration path, or document and demonstrate why the synchronous path cannot interfere with EME's critical operations. Measure its maximum blocking duration and show that native FFmpeg checks, request handling, and failure recovery remain correct under timeout and worker failure.

Remove the “zero-overhead” claim unless actual measurements justify it. A fallback that eventually succeeds is not the same as one that incurs no interruption.

CERT-25-B — Prove the full audio synchronization path

Your stage summary says the Python bridge imports earshot.features and earshot.forge.sfx. Those imports support objective measurements and sound-effect auditing, but the report does not explicitly demonstrate the worker action that performs the timeline analysis required by Stage 25.4.

Required action: Identify the actual worker dispatch path for picture-cut synchronization and supply a test showing that a known +150 ms offset is detected and mapped to +18,000 EME ticks.

Also document how model initialization is handled. The reconnaissance reported that full Earshot perception may require 20–40 seconds on cold startup, whereas the request timeout is 15 seconds. Separate worker readiness from model initialization and request execution, and test both cold and warm behavior. Do not silently treat an unsupported or timed-out sync analysis as a passing check.

CERT-25-C — Correct test accounting and status semantics

Two documentation discrepancies need correction.

First, the phase regression table swaps the historical Phase 21 and Phase 22 counts. The previously submitted records identify Phase 21 as 26 reported test-runner results and Phase 22 as 24. The corrected cumulative table should therefore read:

Phase

	

Reported results




Phase 21

	

26




Phase 22

	

24




Phase 23

	

24




Phase 24

	

24




Phase 25

	

47




Total

	

145

For Phase 25, the six suite files list 41 child tests. If each suite contributes one parent test result, the total is 47 test-runner results. Report that as six parent tests plus 41 child tests, not “47 assertions” unless 47 is the separately measured assertion count.

Second, clarify the silence status mapping. The contract describes NOT_APPLICABLE for an inapplicable request, while the DSP section says silence produces not_measured. These can coexist if the distinction is explicit: for example, a request-level status and an individual canonical QA-check status. Define and test that mapping so silence or missing measurements can never become an accidental pass.

CERT-25-D — Establish the merge candidate identity

The report identifies the feature branch but does not provide its full HEAD commit, an actual Phase 25 release artifact digest, or a complete merge-result identity.

Required action: Before tagging, record the full feature-branch commit, verify the intended ancestry and working-tree status, merge into the current main in accordance with your repository policy, and rerun the applicable tests against the resulting merge commit. Preserve the Phase 24 work and existing certified history if those changes are already present in main.

The phase-25-certified tag must ultimately point to the exact, tested commit selected for certification—not an assumed or unspecified feature-branch revision.

2. Formal architecture disposition
Writing
EME × Earshot — Phase 25 Certification Disposition

Milestone: Phase 25 — Read-Only Audio QA & Perception Adapter
Branch: feature/phase-25-earshot-adapter
Disposition: PROVISIONALLY ACCEPTED — FINAL CERTIFICATION PENDING

Accepted architecture

The submitted implementation is aligned with the approved integration direction:

Earshot operates out of process as an optional audio-analysis service.

OperationExecutor remains the sole canonical project mutation authority.

Canonical schema/*.v1.schema.json files remain frozen.

EME retains zero external runtime npm dependencies.

Native FFmpeg QA remains available when Earshot cannot run.

The integration preserves EME's integer tick timebase of 120,000 ticks per second.

Development was reported to occur on an isolated feature branch without destructive rollback operations.

The submitted report states that all Phase 25 stages are implemented, that 47 Phase 25 test-runner results pass, and that the cumulative Phase 21–25 battery passes 145/145 results. These are team-reported outcomes and have not been independently reproduced by the Architecture Lead.

Closure conditions

CERT-25-A — Subprocess execution behavior: Resolve or justify synchronous blocking and demonstrate bounded latency, native QA continuity, and safe failure handling.

CERT-25-B — Synchronization capability: Establish the actual Earshot timeline dispatch path, verify calibrated offset detection, and document cold-start versus request timeout behavior.

CERT-25-C — Evidence consistency: Correct the Phase 21/22 test-count labels and clarify request-level versus individual-check status semantics, preserving the distinction between child tests, parent runners, and assertions.

CERT-25-D — Release identity: Provide the exact candidate commit and branch status; merge using the repository's approved process; rerun the required regressions against the merge result; and bind final certification to that exact commit.

Final decision

Phase 25's implementation scope is provisionally accepted. The remaining work is limited to runtime assurance, synchronization-path proof, evidence reconciliation, and release provenance.

Unconditional Phase 25 certification: Not yet issued.

Authorization to merge into main as certified: Withheld pending closure of CERT-25-A through CERT-25-D.

Authorization to create phase-25-certified: Withheld pending final certification of the exact tested merge commit.

No full reconnaissance restart or unrelated refactoring is required.

Required execution instruction: Use required GSD actions to achieve the goals and wherever needed.

Next action: Close the four conditions, provide the corrected evidence bundle, and request final certification.

3. What to submit next

Keep the next submission narrow: the worker's synchronization dispatch path and timeout evidence, the latency proof for the synchronous integration (or the asynchronous replacement), the corrected test-accounting table, and the exact merge-candidate commit and regression output.

The architecture is still approved. The merge and certification tag are simply not authorized until these final checks establish that the implemented integration behaves as described and the release identity is unambiguous.