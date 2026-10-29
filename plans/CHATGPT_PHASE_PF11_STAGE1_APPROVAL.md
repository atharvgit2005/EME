Writing

PF-11 Stage 1 is conditionally accepted based on the supplied report. PF-11 Stage 2 is authorized.

Implement Stage 2 in the approved order: media access security, exact artifact identity and manifest integrity, persisted session/schema compatibility, and actual rendered-frame verification.

Before editing, audit the existing implementation and identify concrete defects and test gaps. Preserve existing architecture and versioned project-schema contracts. Do not create parallel orchestration, planning, rendering, or QA systems.

Include additional process-kill/restart and concurrent-idempotency verification wherever Stage 1 evidence relies on simulation or does not cover the relevant boundary.

Use required GSD actions to achieve the goals and wherever needed.

Create plans/PF11_STAGE2_COMPLETION_REPORT.md. Report exact source files changed, adversarial test cases, test commands and counts, real-render evidence, media hashes, compatibility results, recovery behavior, unresolved defects, and explicit release blockers.

Do not declare production certification solely because the regression suite is green. Request architecture review after the evidence is complete.