Reporting on completion of EME × Laya — M6 Candidate 2 Remediation & Certification.

We have fully implemented all three controls from your Remediation Directive, resolved all Candidate 1 defects, created an immutable Candidate 2 identity, and completed the dual evaluation:

1. Candidate 2 Remediation & Identity Freeze:
- Identifier: eme-v0.1.0-rc1-candidate2 (Candidate 1 eme-v0.1.0-rc1-candidate permanently preserved as frozen baseline).
- Backend Provenance: Fully disclosed that no local fine-tuned weights checkpoint exists on disk. Improvements are strictly from deterministic routing, policy gate hardening, and test contract alignment.
- Manifest generated at src/decision-fabric/artifacts/m6-candidate2-manifest.json with complete SHA-256 hashes of all components.

2. Remediation Implemented:
- DeterministicRouter: Added natural language phrasing coverage and explicit disambiguation for SRT/caption export vs render_export.
- EMEPolicyGate: Hardened prerequisite gates to deterministically enforce:
  - source_media_available === false blocks media operations
  - media_integrity_passed === false blocks delivery/export
  - timeline_editable === false blocks timeline mutations
  - audio_sync_passed === false blocks final export
  - non-executable needs_review sentinel strictly isolated from executable LUT identifiers.
- Test Contract: Reconciled candidateLutId and candidateLook in evaluation harness.

3. Candidate 2 Evaluation Results (320 Cases Evaluated):
- Gate 1 (Semantic Intent Routing): 91.11% accuracy (41/45) and 0.9475 macro-F1 on fresh blind battery (surpasses >= 90.0% and >= 0.900). Candidate 1 regression accuracy: 90.74% (49/54).
- Gate 2 (Planning Escalation Safety): 95.83% recall (23/24) on fresh positive planning set; 100.0% recall (64/64) on complex planning holdout with Clopper-Pearson 95% one-sided lower bound of 95.43% (surpasses >= 95.0%).
- Gate 3 (Supported Color Mood): 100.0% exact mapping (8/8) on fresh supported briefs (surpasses >= 90.0%).
- Gate 4 (Unsupported VFX & Sentinel): 100.0% review recall (6/6); 0 sentinel leaks into executable LUT ID.
- Gate 5 (Hard Safety Invariants): 0 forbidden action leaks, 0 constraint leaks, 0 prerequisite bypasses, 0 dialogue quote bleeds.
- Gate 6 (Runtime Failures): 100.0% safe fail-closed and deterministic fallback (6/6).
- Gate 7 (Shadow State Invariance): 100% verified. Bit-for-bit identical project fixture before and after (SHA-256 e8c55be7b5e90020b72e3835bc8c04cb2f9bdd7503411dd4707c4d4a8d4ae4a3, 0 mutations).
- Master Test Suite: 26/26 Decision Fabric tests green in 318ms; 333/334 master test suite green.

4. Deliverables Produced:
- docs/LAYA_M6_BLIND_CERTIFICATION_REPORT.md
- src/decision-fabric/reports/m6-candidate2-certification-report.json
- src/decision-fabric/artifacts/m6-candidate2-manifest.json
- src/decision-fabric/data/m6-candidate2-fresh-blind-battery.json (110 fresh items with cryptographically verified 0% leakage against all 731 prior prompts)

Final Recommended Decision: PASS.

We request your review of this certification report and your directive on whether manual verification is required or if we have authorization to enable the limited advisory canary behind feature flag CANARY_ADVISORY_MODE.
…
Show more
ChatGPT said:
EME × Laya — M6 Candidate 2 Architecture Review
Candidate 2: Promising, conditionally accepted

Reported metrics meet the stated routing and planning thresholds.

Advisory canary: Not authorized yet

One master-suite test is failing, and the independent evaluation evidence needs reconciliation.

Your remediation plan has produced encouraging results. I agree with the architectural direction: fix routing and policy defects deterministically rather than pretending those improvements came from a newly trained model.

However, 333/334 tests passing is not a fully green certification suite. The remaining failure must be investigated before I authorize the canary. The previous M6 criteria also require safety gates and shadow consistency to pass before promotion. 
Pasted text(20261018-104511).txt

1. What passes, and what remains unresolved?

Acceptance area

	

Reported result

	

Decision




Semantic routing

	

41/45; 91.11% accuracy

	

Meets stated threshold




Macro-F1

	

0.9475

	

Meets stated threshold




Fresh planning cases

	

23/24; 95.83% recall

	

Meets threshold, but limited sample




Existing planning holdout

	

64/64

	

Meets threshold




Supported color mapping

	

8/8

	

Meets threshold




Unsupported effects

	

6/6 review recall

	

Meets threshold




Hard safety invariants

	

Zero reported leaks

	

Pass as reported




Shadow state invariance

	

Zero reported mutations

	

Pass as reported




Master regression suite

	

333/334

	

Unresolved failure

There are two additional points to reconcile.

Evaluation denominators: Candidate 1's reported 49/54 and Candidate 2's 41/45 use different sample sizes. Those numbers do not establish a direct improvement or regression unless you evaluate both candidates on the same frozen prompts with the same labels and scoring logic.

Blind-label verification: The report describes independently authored prompts and zero overlap, which is good. It does not fully describe how the gold labels were independently assigned and adjudicated. We need that evidence before treating the blind-set accuracy as definitive.

2. Is manual verification required?

Yes, targeted manual verification is required before the canary. You do not need a human to manually approve every normal routing decision in production.

The required review is narrower:

Inspect the one failing master-suite test and establish its root cause.

Independently review the gold labels for ambiguous and compound requests, plus every Candidate 2 misclassification.

Manually review all reported safety-sensitive cases involving negation, missing prerequisites, quoted commands, and unsupported operations—or document the independent human adjudication already performed.

Verify that the reported zero-mutation result actually compares the before-and-after project state and that the test exercises the real shadow integration.

If the failed test is directly related to a safety invariant, routing policy, data integrity, or shadow isolation, it is a hard blocker. If it is demonstrably unrelated, document that finding and the disposition explicitly rather than quietly accepting a red suite.

3. Next directive for Antigravity
Writing
EME × Laya — M6 Candidate 2 Final Gate Closure

Architecture decision: Conditional acceptance of Candidate 2. Limited advisory canary remains unauthorized pending closure of the final gates.

Use required GSD actions to achieve the goals and wherever needed.

Do not redesign the Decision Fabric or fine-tune the model as part of this task. The reported Candidate 2 changes are deterministic routing, policy, and contract corrections; preserve that provenance.

Gate 1 — Resolve the failing master-suite test

Identify the exact failing test, assertion, stack trace, and reproducible command.

Determine whether the failure is caused by a product defect, regression, test-contract mismatch, environmental flake, or unrelated subsystem.

If it is a real defect, fix the smallest responsible component and add a regression test.

Rerun the affected suite and the complete master suite.

Do not weaken assertions, delete coverage, or silently skip the failure.

Required outcome: a fully passing applicable suite, or an explicitly documented finding demonstrating why a narrowly quarantined test is unrelated to Candidate 2 and all safety-critical paths. Any safety-related uncertainty blocks the canary.

Gate 2 — Reconcile evaluation provenance

Update the Candidate 2 report to include:

Exact numerator and denominator for every metric.

Exact prompt IDs and category membership for each scored subset.

The complete inventory explaining how the 110 fresh prompts, 64-case holdout, prior 146-case battery, and stated 320 total relate.

A consistent definition of accuracy, macro-F1, compound recall, unsupported-effect recall, and safety violations.

An explanation of the Candidate 1 49/54 result versus Candidate 2 41/45.

Run both Candidate 1 and Candidate 2 on the same frozen comparison subset wherever a direct comparison is claimed. Preserve the original Candidate 1 results and manifests.

Gate 3 — Human gold-label verification

Document the annotation and adjudication process for the blind evaluation.

If independently blinded, human-reviewed labels and adjudication records already exist, audit those records and all disagreements. Otherwise, arrange blind review by qualified reviewers who cannot see candidate predictions before assigning labels.

Review all Candidate 2 misclassifications and safety-sensitive cases. Mark genuinely ambiguous examples appropriately rather than forcing unreliable gold labels.

Gate 4 — Reconfirm safety and shadow isolation

Run the real shadow integration against the frozen candidate and verify:

Zero forbidden-action leaks.

Zero constraint leaks.

Zero prerequisite bypasses.

Zero executable needs_review sentinel leakage.

Safe fallback for timeout, malformed output, unknown labels, and unavailable artifacts.

No unauthorized timeline, LUT, render, export, or project-state mutation.

Baseline routing remains authoritative.

Do not allow the Laya recommendation to become the planner's active decision input during this verification.

Gate 5 — Final decision package

Update docs/LAYA_M6_BLIND_CERTIFICATION_REPORT.md and src/decision-fabric/reports/m6-candidate2-certification-report.json with the resolved test failure, reconciled metrics, human-review evidence, exact commands, and final results.

Submit a final PASS, CONDITIONAL PASS, or FAIL recommendation.

If all gates pass, request authorization for a restricted advisory canary behind CANARY_ADVISORY_MODE. Candidate 2 must remain advisory-only; EME's deterministic router and policy enforcement retain authority. Do not activate live routing or grant Laya execution privileges as part of this closure task.

4. What happens if these gates pass?

Then my recommendation is to authorize the limited advisory canary.

Keep CANARY_ADVISORY_MODE disabled by default. Enable it only for a controlled, observable test cohort. Record the baseline decision and Laya's recommendation independently, enforce all normal EME policies, and provide an immediate feature-flag rollback.

The canary should answer one practical question: Does Laya make genuinely useful recommendations on real editing requests without introducing safety or workflow regressions?

That—not a bigger test count, an impressive latency number, or a claim of zero hallucinations—is the evidence we need before considering a broader rollout.

ChatGPT can make mistakes. Check important info.
Latest response




Think