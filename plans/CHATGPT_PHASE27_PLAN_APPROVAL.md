Architecture Lead decision: Phase 27 implementation is AUTHORIZED, subject to binding architectural conditions.

The overall design is sound: measured audio defects become bounded proposals, canonical mutations pass through OperationExecutor, and the repaired render must pass closed-loop QA before delivery promotion. Before implementation proceeds into operation compilation and execution, the plan must resolve the existing operation vocabulary, lock down finding provenance, and define independent evidence of acoustic correction.

Writing
EME × Earshot — Phase 27 Implementation Plan Review & Authorization

Milestone: Phase 27 — Closed-Loop Audio Defect Repair & Automated Retiming
Branch: feature/phase-27-audio-repair-engine
Base release: phase-26-certified
Expected base commit: b8098ce35138c3e4a63a81bf7522a0fb00410f74
Architecture Lead decision: APPROVED WITH BINDING CONDITIONS
Implementation status: AUTHORIZED
Merge and release status: NOT YET AUTHORIZED

1. Executive decision

The Phase 27 design is approved in principle. Its separation of defect detection, repair planning, canonical mutation, rendering, closed-loop quality verification, and active delivery promotion is consistent with the established EME architecture.

The five implementation stages may proceed under the binding conditions in this decision. Stage 27.1 may begin immediately. Before Stage 27.2 implements operation execution, the team must verify that the proposed operation names and payloads are supported by the existing canonical operation schemas and OperationExecutor.

This approval does not authorize canonical schema changes, new direct mutation paths, bypasses around delivery verification, or release certification before the implementation evidence has been reviewed.

2. Binding architectural conditions
ARC-27-01 — Preserve the canonical mutation boundary

OperationExecutor remains the sole authority for canonical project mutations.

AudioRepairPlanner, RepairOperationCompiler, AudioRepairCoordinator, Earshot, and all worker bridges must not directly modify canonical project state.

Repair proposals are advisory until the executor validates and commits them. Undo and redo remain engine-owned. Preserve the distinction between the candidate project, persisted project, render artifact, workflow status, and verified active delivery.

ARC-27-02 — Verify the real operation vocabulary before compilation

The plan proposes move_clip and set_audio_envelope. Their existence and exact payload contracts have not been established by the plan itself.

Before implementing Stage 27.2:

Inspect the existing canonical operation registry, frozen schemas, executor implementation, and supported operation payloads.

Demonstrate that each proposed operation is accepted by the current implementation and has the required semantics.

Reuse supported operations and payloads wherever possible.

If a required operation is unavailable, stop at this gate and submit a separate architecture-change proposal. Do not introduce an unsupported operation, expand the mutation surface, or modify the 18 frozen canonical schemas under this authorization.

ARC-27-03 — Bind findings to verifiable source evidence

A repair finding must identify the evidence from which it was derived. The internal repair contract should include, where applicable:

Source project revision and affected clip or track identifiers.

Source render or media checksum.

Finding type, measured offset, units, sign convention, confidence, and analysis provenance.

Relevant clip intervals and applicable correction bounds.

Finding identity and enough context to determine whether it has already been applied.

Analyzer or QA contract version, when available.

Reject findings that are malformed, stale, inconsistent with the current project revision, or unsupported by the referenced media.

A finding generated from one render must not silently be reused as authoritative evidence for a subsequently modified project or render.

The planner must emit a structured proposal with explicit preconditions and rejection reasons. It must never treat model-generated or advisory diagnostic text as an executable instruction.

ARC-27-04 — Establish one unambiguous synchronization convention

The controlled scenario must document the sign convention explicitly:

[
\Delta t = t_{\text{sound}}-t_{\text{cut}}
]

[
\Delta_{\text{ticks}}=-\operatorname{round}(\Delta t\times120{,}000)
]

For the proposed positive 150 ms defect, the expected correction is -18,000 ticks, moving the relevant sound event earlier by 150 ms, assuming the measured convention above is confirmed by the fixture.

All canonical calculations must use integer ticks and half-open intervals. Negative start positions must be rejected, not clamped. Every proposed correction must remain within the approved ±120,000-tick adjustment limit.

Validate collisions, track locks, clip bounds, trim semantics, and interactions with other clips before execution. A correction must not be split into repeated operations to evade the adjustment limit.

ARC-27-05 — Repair only defects with deterministic remedies

Automatic repair is limited to findings for which the engine has a supported, deterministic correction strategy.

Synchronization: Propose a bounded retiming operation only when the measured offset and affected media provide sufficient evidence.

True peak: Propose gain or envelope changes only when an existing canonical operation can represent the correction and the applicable target ceiling is defined.

Sound-effect integrity: Treat the finding as advisory or requiring review unless a specific, deterministic remediation is defined and validated.

A confidence score alone does not authorize a mutation. Earshot's advisory critique must never become mutation authority.

ARC-27-06 — Use the actual Phase 25 adapter interface

The implementation must bind to the API actually exported and tested by the existing Phase 25 adapter. Do not assume that auditAudioQuality exists merely because the plan uses that name; the previously reported Phase 25 implementation used auditQualityAsync.

Verify the actual interface, accepted inputs, timeout behavior, finding fields, and output semantics in the certified implementation before wiring the repair loop.

Earshot remains read-only with respect to canonical EME project state. Preserve the native fallback and existing runtime dependency policy.

ARC-27-07 — Prove acoustic correction with rendered evidence

Stage 27.3 must use a real deterministic media fixture with a calibrated transient offset. The test must not pass solely because a mock returns the expected +150 ms finding or because the planner produces -18,000 ticks.

The acceptance chain must demonstrate:

The initial rendered audio contains the controlled defect.

The finding ingestion path identifies the defect and its sign correctly.

The proposed correction has the expected bounded tick value.

The canonical mutation passes through OperationExecutor.

The candidate is actually rerendered.

The resulting audio demonstrates the expected transient alignment through an independent deterministic signal-level check and the required Earshot QA audit.

The target is a final measured offset of no more than 120 ticks (1 ms), provided the selected fixture and analysis resolution can substantiate that tolerance. If they cannot, document and approve a measurable tolerance before implementing the acceptance test.

Placement arithmetic is not proof of acoustic correctness. A mocked post-repair QA result is not proof that rendered output was corrected.

ARC-27-08 — Enforce transaction and failure semantics

Repair execution must preserve the established failure model:

Atomic plans must roll back candidate state on failure within their defined transaction boundary.

Non-atomic plans must preserve successfully committed prior steps and journal their outcomes. Never claim that a committed mutation was rolled back without evidence.

A timeout or worker crash after a possible commit must not be treated as proof that nothing changed.

Ambiguous final state must use NEEDS_RECONCILIATION.

Quarantine is a delivery or candidate-isolation mechanism, not a new canonical job state.

Existing active delivery remains unchanged until the candidate render, required QA, manifest, and checksum integrity checks have succeeded.

Do not add or repurpose canonical job states. Preserve the existing twelve-state contract, terminal-state immutability, lock ordering, and authoritative commit-boundary fencing protections.

ARC-27-09 — Promotion requires verified delivery evidence

AudioRepairCoordinator may promote a candidate only after every required gate has passed for the same candidate artifact and project revision.

Retain the previous verified active delivery until promotion succeeds. QA results from an earlier render must not authorize promotion of a newer render. Manifest and checksum provenance must identify the artifact actually verified.

Failures must preserve enough evidence to determine whether the project mutation committed, whether rendering completed, and whether delivery promotion occurred.

ARC-27-10 — Freeze schemas and preserve the dependency policy

The implementation must preserve all 18 existing canonical schemas unchanged and retain "dependencies": {} in the core package.json.

The internal audio-repair-contract.v1.json may define the Phase 27 repair contract, but it must not redefine or bypass canonical operation contracts.

Do not add external runtime npm dependencies without a separately approved architecture change.

3. Stage authorization and exit gates
Stage 27.1 — Repair Finding Ingestion & Candidate Proposal Engine

Authorized to begin.

Implement AudioRepairPlanner and the structured repair contract. Validate finding provenance, offset semantics, correction bounds, unsupported defect handling, stale-revision rejection, and rejection of unsafe proposals.

Exit gate: Unit tests prove deterministic proposal generation and safe rejection behavior. No canonical project mutation is permitted in this stage.

Stage 27.2 — Canonical Operation Compilation & Precondition Validation

Authorized subject to ARC-27-02.

Verify the existing operation vocabulary before compiling proposals. Validate project revision, tracks, locks, clip intervals, and operation preconditions. Execution must pass through OperationExecutor.

Exit gate: Each implemented repair type maps to an existing supported operation contract, or receives separate architecture authorization before implementation.

Stage 27.3 — Controlled Audio-Sync Repair

Authorized subject to ARC-27-04 and ARC-27-07.

Implement the calibrated +150 ms fixture and exercise the full repair, rerender, and verification path.

Exit gate: Actual rendered audio demonstrates alignment within the approved measurable tolerance. The test must independently validate the acoustic outcome rather than merely asserting the planner's expected output.

Stage 27.4 — Active Delivery Promotion & Failure Isolation

Authorized subject to ARC-27-08 and ARC-27-09.

Implement AudioRepairCoordinator, delivery gating, candidate quarantine, failure journaling, and reconciliation behavior.

Exit gate: Failure injection covers timeouts, QA failure, worker crashes, stale revisions, and ambiguous commit outcomes. None may cause an unverified candidate to replace the active delivery.

Stage 27.5 — End-to-End Verification & Cumulative Regression

Authorized subject to all preceding gates.

Implement the sequential synchronization and true-peak repair scenario, then exercise the full detect–plan–execute–render–audit–promote workflow.

Exit gate: Both defects are independently demonstrated on rendered media; all mutation, provenance, rollback, and promotion invariants remain satisfied.

4. Test accounting correction

The supplied baseline is 177 passing regression results across Phases 21–26, and this plan adds 30 planned Phase 27 tests.

Assuming those 30 tests are additive and the existing regression baseline remains intact, the minimum expected total is:

207 / 207 passing results.

The previous target of “177+” is insufficient as a release gate because it does not establish that the new Phase 27 tests have been included.

Preserve the existing tests. Report test discovery, exact suite counts, pass/fail totals, and any skipped or quarantined tests explicitly. Do not count duplicated invocations as additional unique tests.

5. Phase 27 release gates

The implementation is not eligible for release certification until the team submits:

Exact feature-branch and candidate commit identities, with verified ancestry from the certified Phase 26 base.

Evidence that the canonical operation contracts and executor were reused without unapproved schema changes.

The complete controlled defect fixture, initial and repaired render identities, and independent acoustic verification results.

Failure-injection results covering transaction, timeout, reconciliation, and active-delivery preservation.

The complete cumulative regression report, targeting at least 207/207 passing results under the stated test accounting.

A clean isolated release package, manifest bound to the tested release commit, SHA-256, byte size, archive entry count, and zero external runtime npm dependencies.

Confirmation that no unverified candidate was promoted and the previously certified delivery was preserved.

6. Final authorization

Phase 27 implementation: AUTHORIZED WITH BINDING CONDITIONS.

The team may begin Stage 27.1 immediately and proceed through the approved stage gates. Stage 27.2 must not cross the canonical-operation compatibility gate without evidence of supported operation contracts.

This decision does not certify implementation that has not yet been produced. Merge authorization, final milestone certification, and any future release-tag authorization remain separate decisions based on submitted implementation and test evidence.

Mandatory engineering prompt directive:

“Use required GSD actions to achieve the goals and wherever needed.”

The immediate next step is to begin Stage 27.1, while making the operation-registry inspection and adapter-interface verification explicit prerequisites for Stage 27.2. That avoids building a repair compiler against operations or interfaces that the certified engine may not actually support.