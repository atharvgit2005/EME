Architecture Lead review — Phase 26

Decision: APPROVED WITH BINDING IMPLEMENTATION CONSTRAINTS. GO AHEAD.

You are authorized to commence implementation of Stages 26.1 through 26.5 on feature/phase-26-sound-kit-engine.

The plan follows the right architecture: Earshot generates sound assets and measures their transient positions; EME decides where those assets belong; OperationExecutor remains the only authority that mutates the canonical project.

I also checked Earshot's published kit implementation. Its kit.py exposes initialization, planning, rendering, and lockfile generation, and the lock records measured onset, peak, end, duration, and take-integrity metadata. One important behavior is that rendering can remove files from an existing output directory when they are no longer referenced by its previous lock. That behavior must be isolated from EME's existing assets. See the Earshot kit implementation.

1. Architecture decisions

Asset generation and project mutation remain separate

EarshotKitClient generates and validates WAV assets and kit.lock.json. RolePlacementEngine computes placement proposals. Only OperationExecutor may apply timeline changes.

Physical transient alignment is approved

Use the measured alignment offset from the generated take, not its nominal duration or assumed waveform position. Convert timestamps using EME's canonical time utilities at 120,000 ticks per second.

Phase 25 verification remains authoritative for final audio QA

Run Earshot inspection against the rendered result. A placement calculation alone does not certify audible synchronization or final true-peak compliance.

Native SFX and runtime dependency invariants remain unchanged

Earshot stays in its external Python environment. EME's native sound catalog and procedural synths remain the fallback; canonical schemas remain frozen.

2. Mandatory corrections to the implementation plan

These are binding constraints for implementation, not reasons to delay starting Stage 26.1.

Correction A — Never render into an existing canonical asset directory

Earshot's kit-rendering behavior can delete files referenced by an old lock when the new kit no longer contains them. Do not point it at a shared or canonical asset directory.

Instead, each generation run must use a unique, isolated staging directory:

Generate the kit and WAV takes in a fresh staging directory.

Validate the lockfile, expected file inventory, metadata, and audio hashes.

Confirm that each role and take maps to exactly one expected file.

Promote validated assets through EME's controlled asset-publication process.

Preserve existing assets and prior verified deliveries, even when the new kit removes or renames roles.

Never let Earshot's internal cleanup determine which existing EME assets are deleted.

Correction B — Use the real EME operation vocabulary

The Phase 26 plan names add_clip, but the previously documented EME executor supports insert_clip for audio-track insertion.

Stage 26.1/26.4 must verify the operation types against the actual canonical operation schema and the executor on the Phase 25-certified baseline. Use the supported operation type—currently documented as insert_clip—unless the authoritative code establishes otherwise.

Do not introduce a new add_clip operation or modify frozen schemas just to fit this integration.

Correction C — Strengthen asset integrity and provenance

Earshot's lock contains SHA-1 metadata for generated takes. Validate that upstream hash, but also calculate an EME-side SHA-256 digest for each accepted WAV asset.

The internal generated-asset record must bind the audio to its source information, including:

Earshot version and bank version.

Kit definition and role.

Planned and actual seed, including any audit reroll.

Audio file path, duration, sample rate, measured onset/peak/end, and integrity hashes.

Relevant source or licensing provenance where applicable.

The Earshot bank implementation documents the versioned bank and its rendering metadata. Use those measurements as inputs, but do not mistake a cached take key or an upstream SHA-1 for EME's complete asset-provenance record.

Correction D — Placement calculations must fail safely

For a target event
𝑡
𝑒
t
e
	​

 and a measured alignment point
𝑡
𝑎
t
a
	​

:

𝑡
start
=
𝑡
𝑒
−
round
⁡
(
𝑡
𝑎
×
120,000
)
t
start
	​

=t
e
	​

−round(t
a
	​

×120,000)

The resulting placement proposal must be rejected or explicitly resolved through an approved policy if it would produce a negative start, invalid duration, unavailable track, stale base revision, or another project-constraint violation. Do not silently clamp timestamps, since that would change the requested alignment.

Select takes deterministically using a stable seed and stable event identity. An unchanged kit definition, pinned Earshot/bank versions, and equivalent runtime environment should produce repeatable output. Verify that repeatability empirically rather than assuming cross-platform byte identity.

Correction E — Keep automatic dialogue ducking conservative

Dialogue ducking may use the existing audio-envelope operation only when the required dialogue intervals are explicitly available and the current operation planner supports the change. Do not let uncertain Earshot semantic labels directly authorize audio-envelope mutations.

The implementation must not introduce a new mutation path.

Correction F — Bound generation resources

The 30-second maximum whole-kit timeout is a target to validate, not an assumed performance guarantee. Measure generation time across the intended presets and role/take counts.

Enforce bounded concurrency, output size, total generated duration, and process execution. On timeout, malformed output, lockfile mismatch, or failed audit, preserve existing assets and report a generation failure. Do not publish partial kits.

3. Approved execution sequence

Stage



Objective



Acceptance gate




26.1



Contract and lockfile validation



Reject malformed roles, unsafe paths, inconsistent metadata, missing assets, and hash mismatches.




26.2



Isolated generator bridge



Prove bounded execution, deterministic regeneration, safe staging, and no mutation or deletion of pre-existing assets.




26.3



Sound-kit catalog



Resolve roles and takes deterministically; verify file integrity before making assets available to the planner.




26.4



Role placement



Produce valid canonical EME operation proposals using measured transient offsets. No direct project mutation.




26.5



Closed-loop verification



Execute proposals through OperationExecutor, render, run Phase 25 QA, and evaluate synchronization, peak compliance, and existing regression tests.

Non-negotiable invariants

All seven established EME invariants remain binding: canonical lifecycle semantics, frozen canonical schemas, integer tick timing, exclusive mutation authority, durable fencing, verified active-delivery promotion, and separation of project state from rendered artifacts and delivery records. Zero external runtime npm dependencies remains mandatory as well.

4. Formal authorization
Writing
EME × Earshot — Phase 26 Implementation Authorization

Milestone: Phase 26 — Declarative Sound Kit & Role Placement Engine
Branch: feature/phase-26-sound-kit-engine
Baseline: Phase 25 certified release, commit 10a046614db0a70707981c360556c454b194c75a
Decision: APPROVED WITH BINDING IMPLEMENTATION CONSTRAINTS
Authorization: GO AHEAD

Authorized scope

The engineering team is authorized to implement Stages 26.1 through 26.5:

Sound-kit contract and lockfile validation.

Isolated Python sound-kit generation bridge and client.

Sound-kit ingestion and deterministic role catalog.

Deterministic role-placement proposal engine.

End-to-end execution, rendered-audio verification, and regression certification.

Binding conditions

Earshot may generate and measure assets but may not mutate the canonical EME project or promote a delivery.

All audio timeline changes must use an operation type supported by the existing canonical operation schema and must be executed by OperationExecutor.

Generation must occur in isolated staging directories. Earshot cleanup must never remove or overwrite existing canonical assets or prior verified deliverables.

Verify each generated asset's upstream lock integrity and maintain EME-side SHA-256 asset provenance.

Use measured onset/peak/end metadata and canonical integer tick conversion.

Validate placement proposals against current project revisions, tracks, time boundaries, and interval constraints.

Preserve all frozen canonical schemas and zero external runtime npm dependencies.

Use Phase 25's certified QA adapter to verify the final rendered audio.

Preserve existing audit logs, assets, and certified history. No destructive repository rollback procedures are authorized.

Phase completion criteria

Phase 26 may be submitted for certification when all five stages pass, deterministic generation has been demonstrated for the pinned runtime and bank version, asset integrity and staging isolation are verified, role-placement math passes the stated tolerance, the end-to-end rendered audio passes its objective QA requirements, and all required cumulative regressions pass.

No sound-kit generation or placement operation may bypass the established mutation and delivery-promotion controls.

Required execution instruction: Use required GSD actions to achieve the goals and wherever needed.

Final decision: Stop planning. Go ahead with Phase 26 implementation under these binding constraints.

Architecture Lead: ChatGPT

5. Immediate next action

Start with Stage 26.1. Establish the validator against a few real Earshot kit.json and kit.lock.json samples, and test the rejection cases before building the subprocess bridge. That will anchor subsequent stages to the real asset format instead of a parallel, assumed schema.

Phase 26 implementation is authorized. Proceed on the feature branch, preserve the Phase 25 baseline, and do not begin automatic sound placement until the lockfile validator and isolated asset-generation stages pass their gates.