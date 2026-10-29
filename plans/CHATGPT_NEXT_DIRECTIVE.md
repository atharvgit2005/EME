My recommendation: Phase 34.8 is closed. The next milestone should be Phase 35 — Real-World Editing Workflow, Creative Iteration & Production Validation.

EME has the essential editing mechanics now: subject-aware reframing, optical distortion, curved typography, multi-track audio, native rendering, and a local MCP interface through which Antigravity controls execution.

The next challenge is not adding more effects. It is proving that Antigravity can use these capabilities to produce genuinely good videos from real editing briefs, inspect the results, correct mistakes, and deliver a finished edit reliably.

We should move from building components to validating the editing experience.

Phase 35 — proposed architecture directive

35.1 — Real-project editing benchmarks

Run three meaningfully different editing workflows using actual local footage, transcripts, and available assets. At least one should involve multiple source clips and a longer output than the previous 15-second validation reel.

35.2 — Creative revision loop

Antigravity reviews EME's rendered output and QA results, identifies deficiencies, proposes a revised Creative Plan, and submits it for validation and approval. Every revision must preserve plan provenance and execution safeguards.

35.3 — Reliability and delivery

Verify interrupted jobs, missing assets, unsupported effects, failed renders, stale plans, and retries. Failed revisions must not destroy the previous verified delivery.

35.4 — Final quality acceptance

Inspect actual rendered videos and audio. Compare each output against its original brief, record remaining defects, and determine whether EME is ready for practical use.

The critical architecture rule

We are not reopening the LLM integration.

Antigravity IDE remains the only AI reasoning environment.

EME remains the deterministic editing, execution, rendering, and verification engine.

Communication continues through the local MCP tools.

No external model APIs, provider keys, hidden inference services, or additional AI integrations.

User approval remains required for execution according to the existing approval and threat-model rules.

The revision loop uses the same Antigravity agent. It does not introduce a separate AI judge.

Antigravity implementation prompt
Writing
EME Phase 35 — Real-World Editing Workflow, Creative Iteration & Production Validation
Architectural Authorization

Phase 34.8 is formally closed. Continue from the actual current repository HEAD.

The approved architecture is:

Antigravity IDE Agent = sole AI reasoning and creative direction layer.

EME = deterministic local editing engine, canonical execution authority, rendering system, audio pipeline, and delivery verification layer.

Communication = existing local stdio MCP server.

Do not introduce additional LLM integrations, provider APIs, API keys, remote inference services, or another AI judge.

Use required GSD actions wherever applicable. Begin with a bounded repository inspection, then implement only changes justified by real integration defects. This phase prioritizes actual editing outcomes over adding features.

Workstream 1 — Real-project benchmark suite

Select at least three meaningfully different editing briefs and execute them through the actual Antigravity-to-EME workflow.

Where suitable local assets are available, include:

A talking-head creator reel requiring natural 9:16 composition, legible captions, and speech-aware music.

A cinematic or founder-style reel requiring deliberate narrative structure, distinctive visual treatment, and motivated audio accents.

A multi-clip social or promotional edit requiring clip sequencing, pacing, transitions, graphics, and multiple audio events.

These are benchmark categories, not fixed templates. Plans must respond to the actual brief and available media.

Use real local footage, transcripts, tracking observations, and existing music/SFX assets. Do not fabricate media, metadata, or renderer capabilities. Do not download external assets or modify licensing claims merely to fill a benchmark slot.

At least one benchmark must use multiple source clips and produce a meaningfully longer edit than the previous 15-second validation sample. Choose duration according to the source material and brief rather than imposing an arbitrary length.

If appropriate source media is unavailable, report the specific blocked benchmark instead of substituting a synthetic fixture and calling it a real-project success.

Workstream 2 — Validate the real IDE-driven workflow

For every benchmark, demonstrate the actual interaction path:

User provides a creative brief to Antigravity.

Antigravity obtains grounded context through the registered EME tools.

Antigravity makes concrete editorial decisions and generates a structured Creative Plan.

EME validates the plan and its source references, timing, constraints, and capabilities.

EME compiles the plan into canonical operations.

EME performs a non-mutating dry run.

The user reviews the exact proposed plan and provides approval through the existing approved workflow.

OperationExecutor executes the approved operations.

EME renders the video and mixes audio through its native pipeline.

QA runs on the final artifact and returns structured evidence.

Antigravity reviews the evidence and summarizes the result and remaining limitations.

Mocks may support automated CI tests but cannot count as proof of actual IDE orchestration or creative quality.

Keep the live-model credential status separate from deterministic tests. No external model API calls are permitted in the IDE-driven workflow.

Workstream 3 — Grounded creative revision loop

Implement or complete a bounded iteration procedure using the existing EME tools and capabilities.

After an initial render:

Antigravity inspects available frame extracts, audio measurements, renderer reports, and QA findings.

It identifies defects relative to the user's original brief.

It proposes a revised Creative Plan with explicit reasons for each material change.

EME validates the revision against current project state and renderer capabilities.

A dry run checks feasibility before execution.

The user reviews and approves the revised plan through the existing approval mechanism.

EME executes, renders, and verifies the revision.

Prioritize concrete issues such as:

Subject misalignment or avoidable shoulder clipping.

Graphics obstructing faces.

Curved typography that is misplaced or illegible.

Requested optical effects that are missing or incorrectly rendered.

Generic or repetitive editing decisions.

Incorrect clip timing or narrative pacing.

Poor soundtrack selection, ineffective ducking, or abrupt audio transitions.

Incorrect output dimensions or duration.

Do not rerun the entire workflow blindly after every QA warning. Use the original brief, actual evidence, and supported capabilities to make the smallest justified correction.

Do not let Antigravity edit canonical project state directly. It proposes changes through a new or revised validated plan.

Every materially changed plan must be revalidated. Existing approval tokens must not authorize modified plans or stale project revisions.

Preserve a traceable history of the original brief, accepted plans, revisions, execution results, and rendered artifacts. Replay must not silently regenerate previously accepted creative decisions.

Workstream 4 — Reliability and failure recovery

Test failures across the actual workflow rather than only individual helpers.

Cover:

Missing or corrupt source media.

Missing transcript or unreliable VTSM tracking.

Missing soundtrack or SFX assets.

Unsupported requested effects.

Invalid Creative Plans and infeasible spatial constraints.

Stale project revisions and expired or consumed approval tokens.

Interrupted rendering, renderer failure, and audio-mixing failure.

Repeated tool calls and interrupted jobs.

Failed replacement renders and active-delivery promotion.

Verify that EME fails clearly, preserves relevant evidence, and never claims that an incomplete artifact was successfully delivered.

The previous verified active delivery must remain intact if a replacement fails.

Preserve the existing canonical job-state vocabulary, locking order, durable idempotency, fencing, terminal-state protections, Undo/Redo ownership, and rollback semantics.

Do not claim that a failed operation was rolled back if earlier non-atomic steps already committed.

Workstream 5 — Rendered quality evaluation

For every successful benchmark, inspect actual rendered frames and listen to representative audio sections.

Verify:

Output resolution, frame rate, duration, and audio/video synchronization.

Subject framing, headroom, shoulder visibility where reliable tracking permits, and face-safe placement.

Actual optical distortion when requested.

Actual curved glyph placement and animation when requested.

Narrative continuity, useful pacing, and absence of arbitrary generic overlays.

Soundtrack suitability, dialogue intelligibility, SFX timing, and smooth ducking/recovery.

Correct final loudness, true peak, clipping, and render integrity.

Consistency between the original brief, accepted plan, project revision, rendered output, and delivery manifest.

Use deterministic QA for objective checks and Antigravity for advisory creative assessment using the available local evidence. Do not introduce a separate model or automated inference service.

Distinguish technical PASS from creative acceptance. A file can pass rendering and loudness checks while still being a poor edit.

Record each identified defect with a timestamp or frame reference, severity, evidence, and proposed correction. Confirm that corrections actually improve the rendered output.

Workstream 6 — Measurable acceptance

Create a concise benchmark report with one entry per editing brief.

Each entry must include:

Input assets and original brief.

Creative Plan identity and hash.

Whether actual Antigravity orchestration was used.

Operations executed and the project revision.

Rendered artifact path, duration, dimensions, and checksum.

Relevant visual and audio QA results.

Human-reviewed strengths and defects.

Revision history and whether corrections were effective.

Final disposition and unresolved limitations.

Use PASS, FAIL, or BLOCKED for individual acceptance gates. Do not hide missing evidence behind a single aggregate score.

Run all relevant regression suites and record actual commands, raw summaries, and exit codes.

Non-negotiable architecture invariants

Preserve:

Antigravity IDE as the sole AI reasoning environment.

No external model-provider inference in the IDE-driven workflow.

Existing local MCP integration.

Canonical timebase of 120,000 integer ticks per second and half-open intervals.

OperationExecutor as the sole canonical mutation authority.

The existing human-approval process and documented same-user shell/PTY threat boundary.

Durable plan persistence and replay.

Project-revision validation, locking, fencing, idempotency, and Undo/Redo ownership.

Existing canonical schema compatibility requirements.

Audio integrity, renderer capability truthfulness, and verified active-delivery promotion.

Zero unnecessary runtime dependencies.

Preserve unrelated Git changes, fixtures, and forensic evidence. Do not perform destructive resets or cleans.

Scope restrictions

Do not add new visual effects merely to increase feature count.

Do not add a separate LLM, AI judge, provider API, or inference SDK.

Do not fine-tune models.

Do not rebuild the renderer, audio engine, approval system, or Creative Plan schema unless an actual reproducible integration defect requires a minimal correction.

Do not claim production readiness based only on mocks, unit tests, short synthetic clips, or successful MP4 creation.

Definition of done

Phase 35 is ready for architectural review when:

At least three distinct editing briefs have been exercised, with any unavailable benchmark explicitly marked BLOCKED.

Successful benchmarks use actual Antigravity-generated plans and the native EME execution path.

At least one benchmark demonstrates a meaningful multi-clip edit with realistic duration.

At least one edit undergoes a documented QA-driven revision through a newly validated and approved plan.

Final artifacts have been inspected and evaluated against their original briefs.

Failure handling and delivery preservation have been verified.

Regression suites pass with exact, auditable results.

All unresolved defects and live-integration limitations are reported honestly.

Begin with the existing implementation. Fix only demonstrated defects, execute the benchmark workflows, collect evidence, and return a concise engineering acceptance dossier. Do not stop after writing an implementation plan.

What success looks like

At the end of Phase 35, I want to see three genuinely different videos, at least one meaningful revision, and clear evidence explaining why the output satisfies each brief.

If the edits are technically correct but still look generic, we should investigate the quality of Antigravity's editorial decisions and the information EME provides to it—not add another API or rendering subsystem.

The next milestone is about proving that EME can make good use of the engine we've built, reliably, on real editing tasks.