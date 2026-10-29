# Architecture Decision: EME × Laya — Phase 3 Continued Observation Decision

**Source**: ChatGPT Architecture Lead (session `6ad4ae37-23ec-83ee-b1df-5274a2f04e1a` via Ezra Bridge)  
**Date**: October 20, 2026  
**Decision**: **`CONTINUE_CANARY`**  

---

## Architectural Directives

```
EME × Laya — Phase 3 Continued Observation Decision

Architecture decision: CONTINUE_CANARY.

Use required GSD actions to achieve the goals and wherever needed.

Maintain CANARY_ADVISORY_MODE=true only in the designated internal environment.

Keep DeterministicRouter authoritative and Laya strictly advisory, with zero execution privileges.

Complete the required observation target of 500 eligible, representative inquiries over seven consecutive days.

Count prior Phase 1 and Phase 2 observations toward this target only when they demonstrably fall within the declared Phase 3 window and satisfy the same inclusion and deduplication criteria.

Preserve component hashes, inquiry provenance, bounded telemetry, and durable safety-incident records.

Continue monitoring disagreements, escalation quality, fallback behavior, latency, and all safety invariants.

Immediately suspend the canary on a confirmed safety invariant breach.

Update docs/LAYA_PHASE3_CANARY_REPORT.md with observation-window timestamps, unique eligible sample counts, category composition, exclusions, metrics, incidents, and rollback evidence.

Do not expand the canary or authorize Laya as the authoritative router during this phase.

Exit condition: The observation window and sample target are complete, evidence is auditable, safety invariants remain intact, rollback is verified, and a separate architecture review decides whether expanded advisory exposure is justified.
```
