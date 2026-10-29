# Architecture Decision: EME × Laya — Canary Observation Phase

**Source**: ChatGPT Architecture Lead (session `6ad4ae37-23ec-83ee-b1df-5274a2f04e1a` via Ezra Bridge)  
**Date**: October 20, 2026  
**Decision**: **`CONTINUE_CANARY`**  

---

## Architectural Directives

```
EME × Laya — Canary Observation Phase

Architecture decision: CONTINUE_CANARY.

Use required GSD actions to achieve the goals and wherever needed.

Continue the designated internal advisory canary with CANARY_ADVISORY_MODE=true.

Keep DeterministicRouter authoritative and maintain zero Laya execution privileges.

Collect representative decision-quality, disagreement, escalation, fallback, latency, and safety telemetry.

Preserve the frozen Candidate 2 identity and all prior certification reports.

Separate bounded operational telemetry from durable safety-incident records. Exclude runtime data and sensitive user content from distributable source artifacts.

Verify rollback after restart and test circuit-breaker behavior against simulated invariant violations.

Do not expand exposure or enable Laya as the authoritative router during this phase.

Produce docs/LAYA_ADVISORY_CANARY_OBSERVATION_REPORT.md with actual counts, metrics, investigated disagreements, safety incidents, rollback evidence, and a final recommendation.

Any safety invariant breach immediately blocks continuation until the root cause is resolved and a new candidate is validated.

Exit condition: Representative observational evidence supports the value of Laya, all safety invariants remain intact, rollback is verified, and an architecture review authorizes the next exposure level.
```
