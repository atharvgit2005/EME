# Architecture Decision: EME × Laya — Canary Observation Phase 2

**Source**: ChatGPT Architecture Lead (session `6ad4ae37-23ec-83ee-b1df-5274a2f04e1a` via Ezra Bridge)  
**Date**: October 20, 2026  
**Decision**: **`CONTINUE_CANARY`**  

---

## Architectural Directives

```
EME × Laya — Canary Observation Phase 2

Architecture decision: CONTINUE_CANARY.

Use required GSD actions to achieve the goals and wherever needed.

1. Preserve the current deployment
Keep CANARY_ADVISORY_MODE=true only in the designated internal canary environment.
Preserve the frozen Candidate 2 manifest and all existing certification evidence.
Keep DeterministicRouter authoritative.
Do not grant Laya execution privileges or expand the canary to unrestricted production traffic.

2. Investigate all three disagreements
For each of the three reported disagreements, record:
The original request and its expected route.
The deterministic baseline decision.
Laya's advisory recommendation.
Whether the disagreement was intentional, harmless, ambiguous, or incorrect.
Whether it reveals a genuine opportunity to improve EME.
Do not change routing policy merely to increase the agreement percentage. The goal is better decisions, not agreement for its own sake.

3. Expand representative observation
Collect a broader and more diverse sample across supported single-step requests, compound editing briefs, ambiguous instructions, colloquial prompts, unsupported effects, and prerequisite failures.
Track route-level agreement, escalation precision and recall where ground truth is available, fallback behavior, latency, and investigated disagreements.
Keep operational metrics separate from dedicated adversarial safety-test results. Do not interpret a zero-failure result on a small observational sample as proof of negligible risk.

4. Preserve and verify safety
Continue checking:
Zero execution-privilege leaks.
Zero forbidden actions, constraint leaks, or prerequisite bypasses.
Zero needs_review sentinel leakage into executable LUT identifiers.
Zero unauthorized project mutations.
Working circuit-breaker and manual rollback paths.
Safe behavior after application restart.
Retain durable safety-incident records separately from the bounded FIFO operational telemetry.

5. Produce the next report
Update docs/LAYA_ADVISORY_CANARY_OBSERVATION_REPORT.md or create a versioned Phase 2 report documenting the observation period, sample composition, all disagreements, safety results, latency methodology, feature-flag state, and rollback verification.
End with a recommendation to continue, expand, or disable the canary.

Exit condition: Representative evidence supports the usefulness of Laya, no safety invariant has been breached, rollback remains verified, and the next exposure decision is explicitly reviewed. This phase does not authorize Laya to become the authoritative router.
```
