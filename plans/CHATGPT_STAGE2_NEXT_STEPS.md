Please specify your exact guidance, priorities, and next steps for Stage 2 kickoff:
1. Specific API endpoint conventions and state-ownership requirements between the backend and Visual Control Surface (/api/color/preview vs /api/preview/frame).
2. UI comparison model preference: instant bypass toggle (hold-to-compare) vs interactive split-screen wipe.
3. Deliverable format for the Stage 2A audit before entering Stage 2B/2C implementation.
4. Any particular risk areas or constraints you want us to keep front of mind as we begin.
…
Show more
ChatGPT said:
EME Phase 17 Stage 2 — Architecture Kickoff Directive

Decision: Stage 2 is authorized to begin with Stage 2A. The implementation priority is to establish one reliable color-editing path from draft preview through transactional commit to verified final render. Do not begin by adding UI controls independently of the engine.

The governing principle remains: preview is non-mutating; Apply is transactional; Undo/Redo use the existing operation system; final delivery is published only after verification.

1. API conventions and state ownership
Recommended route design

Use POST /api/color/preview as the Visual Control Surface’s color-preview contract, provided Stage 2A confirms that this can be implemented as a thin adapter over the existing preview service.

Retain /api/preview/frame for existing generic frame-preview behavior. Do not create a second rendering engine, fork the FFmpeg compilation path, or break current callers. If the audit shows that /api/preview/frame is already the established color-preview contract, document that finding and propose the smallest compatible extension before changing routes.

The endpoint name matters less than having one authoritative rendering implementation and a well-defined contract.

State ownership

State

	

Authoritative owner

	

Rule




Persisted project grade

	

Project state and OperationExecutor

	

Changes only through validated operations




In-progress grade draft

	

Visual Control Surface

	

Ephemeral; discardable without project mutation




Preview execution

	

Existing backend preview service

	

Uses an explicit candidate grade; no persistence




Project revision and locking

	

Existing engine transaction model

	

Enforce base-revision and concurrency checks




Undo/Redo history

	

Existing operation infrastructure

	

No parallel UI history stack




Final rendered output and active-delivery pointer

	

Existing delivery pipeline

	

Update only after successful verification

A draft must never appear committed merely because a preview succeeded. Conversely, a successful Apply must not depend on a preview image having loaded successfully.

Preview request contract

Adapt the field names to the existing repository conventions, but preserve these semantics:

Identity: project/session, source media identity, frame tick and base project revision.

Draft: the complete candidate grade or a fully resolved candidate-grade representation, including a registered LUT ID where applicable.

Request identity: a unique request ID and draft version, enabling stale-response rejection.

Validation: schema validation, finite numeric values, supported parameter bounds and certified-LUT registry validation.

Response: request identity, source/frame identity, base revision, candidate-grade identity or hash, preview result and structured errors.

Use the existing 120,000 ticks-per-second basis. Do not silently reinterpret frame positions as seconds or frame indices.

A preview request must not persist a grade, increment the project revision, create an undo entry, or change active delivery. Cancel must discard the draft, invalidate outstanding requests and restore the committed grade in the UI.

Stale-response protection

Enforce this in the UI even if the server also supports cancellation. A response is displayable only when its request ID, draft version, source media, frame tick and base revision still match the current view. Abort superseded requests where supported; otherwise, ignore their results. A late response must never replace a newer preview.

2. Comparison model: choose hold-to-compare first

Decision: implement an instant original/graded bypass with hold-to-compare as the default interaction. Include a persistent Original/Graded toggle as an accessible alternative. Defer the interactive split-screen wipe until the core workflow is certified.

Why this order:

Bypass makes it straightforward to compare the exact same frame, crop, playback position and source.

It has lower implementation and rendering complexity than a wipe and is less likely to introduce synchronization or performance defects.

Holding the control to reveal the original makes quick A/B checks natural during adjustment.

Required behavior:

Original mode displays the ungraded source; Graded mode displays the draft or committed grade as appropriate.

Switching modes must not commit changes or trigger an additional project mutation.

Both views must use the same source frame, timebase, scaling and display path so the comparison is meaningful.

Mouse, touch and keyboard interactions must work. A hold control must revert on release, cancellation and focus loss, and must not require a user to keep a mouse button pressed to access the original view.

Clearly label the comparison state. Do not imply that a draft is committed.

A split-screen wipe can be evaluated after Stage 2 acceptance as a separate UI enhancement. It is not a Stage 2 blocker.

3. Stage 2A audit deliverable and gate

Before implementing Stage 2B or 2C, submit plans/PHASE_17_STAGE2A_INTEGRATION_AUDIT.md. It must describe the actual repository state, not the intended architecture alone.

Include the following sections:

Section

	

Required contents




Repository inventory

	

Exact UI components, API routes, preview services, engine operations, state stores, renderers and relevant tests




Current data flow

	

From Visual Control Surface input through backend preview to displayed image; separately trace Apply through final render and delivery publication




API decision

	

Existing route contracts, callers, validation, response shapes and the final route recommendation with backward-compatibility impact




State ownership

	

A table identifying draft, persisted grade, revision, preview job, undo/redo, render output and active delivery owners




Gap analysis

	

What already exists, what is missing, and what needs adaptation; cite exact file paths and symbols




Concurrency and failure analysis

	

Stale responses, project revision changes, concurrent Apply, preview cancellation, render failures and partial delivery updates




Test plan

	

Existing suites, gaps, new tests, deterministic fixtures and expected acceptance thresholds




Risk register

	

Each material risk, likelihood/impact, mitigation and a test that demonstrates the mitigation




Implementation sequence

	

Small changes grouped into Stage 2B–2F, with dependencies and explicit exit criteria

Add a sequence diagram or equivalent step-by-step flow for Preview, Apply, Cancel, Undo/Redo, and failed final render. Mark every point where state can change.

Stage 2A exit gate

Do not proceed to implementation until the audit demonstrates that the proposed path reuses the existing preview and operation infrastructure, identifies the actual commit boundary, and explains how failures preserve committed project state and the current active delivery.

Any material uncertainty about those points must be recorded as a blocker, not treated as an assumption. Once the audit is ready, request a short architecture review of that artifact before proceeding.

4. Execution priorities: Stage 2B–2F
2B

Color preview integration

Connect the Visual Control Surface to the existing preview service. Implement ephemeral drafts, request cancellation or invalidation, stale-response rejection, bounded concurrency and structured errors. Prove that preview-only interaction does not mutate project state or active delivery.

Exit gate: tests demonstrate that an outdated response cannot overwrite a newer draft and preview failures leave committed state unchanged.

2C

Schema-backed grade controls

Implement certified LUT selection, LUT intensity, exposure, white-balance temperature/tint, LGGO, curves, eight-channel HSL and skin protection. Bind every control to the approved grade schema and reuse its current constraints. Advanced controls may be placed behind a collapsible section, but must not be silently omitted from the promised scope.

Exit gate: displayed values, serialized drafts, preview inputs and committed values agree; invalid or unregistered values are rejected.

2D

Transactional Apply, Cancel, Undo and Redo

Route changes through existing OperationExecutor operations: attach_color_grade, adjust_color_params and remove_color_grade. Enforce the expected base revision and existing lock rules. A conflict must trigger a safe reload or recovery path rather than overwrite newer work.

Exit gate: one successful Apply creates the intended committed change; Cancel creates none; Undo and Redo restore the exact expected states; a failed transaction creates no partial commit.

2E

End-to-end delivery verification

Use a deterministic media fixture. Preview the original, adjust the draft, verify the preview is non-mutating, Apply, render through the existing FFmpeg pipeline, run delivery QA, verify the published file's SHA-256 against its manifest, then test Undo and Redo.

Deliberately force a render failure and verify that the current active delivery remains intact. Repeat the frozen Stage 1 CPU-versus-FFmpeg CIE76 parity protocol without changing its methodology or thresholds.

Exit gate: actual preview-to-delivery behavior passes, not just mocked service tests.

2F

Comprehensive regression and release review

Run focused color tests, existing operation and render suites, the complete master regression suite, type checks and build checks available in the repository. Preserve failure logs and report exact executed commands and exit codes.

Deliver plans/PHASE_17_STAGE2_COMPLETION_REPORT.md with evidence, known limitations, artifact hashes and a final PASS, CONDITIONAL PASS or FAIL decision.

5. Hard constraints and risk areas

These constraints apply throughout Stage 2.

Rendering and color correctness. Do not introduce a second implementation of grade evaluation or compile a preview-specific color pipeline that diverges from the final renderer. The preview and final delivery must use compatible grade semantics, LUT interpretation, operation ordering and color-space handling. A visually plausible screenshot does not establish parity.

Frozen numerical parity criteria. Preserve the approved Stage 1 protocol and acceptance thresholds:

Metric

	

Acceptance threshold




Mean CIE76 ΔE*ab

	

< 0.85




P95 CIE76 ΔE*ab

	

< 1.80




P99 CIE76 ΔE*ab

	

< 2.50




Maximum CIE76 ΔE*ab

	

< 3.50




Mean RGB digital-number MAE

	

< 0.75

Report the fixture, sample count, processing parameters, measurement results and comparison method. Do not weaken thresholds or change the protocol to make results pass. Also record any material difference between the interactive preview path and the actual final-render output.

Transactional safety. Treat a project revision conflict as a real conflict, not a warning to ignore. A failed Apply, Undo, Redo or final render must not silently corrupt project state or replace an earlier valid delivery. Verify that delivery publication happens only after required QA and integrity checks succeed.

Resource control. Interactive previews can become expensive under rapid slider movement. Use bounded queues or concurrency, cancel superseded work where possible, and avoid unbounded frame caches. Measure responsiveness rather than assuming cancellation alone prevents resource pressure.

Isolation. Keep the existing project schema unchanged, the 120,000-tick timebase intact, VTSM tracking sidecars isolated from grade state, and Laya advisory-only. Do not introduce region-specific masks or couple the color engine to VTSM as part of this stage.

Evidence quality. Clearly separate unit tests, mocked integration tests, actual media-render tests and full end-to-end tests. A green mock suite does not prove that a real FFmpeg delivery is correct.

6. Stage 2 completion report requirements

The completion report must include:

A Stage 2A audit disposition and a concise account of the implemented integration path.

A requirement-by-requirement acceptance matrix linking each claim to actual test names, commands and results.

Preview race and failure tests, draft discard, invalid grade/LUT rejection, revision conflict, Apply/Undo/Redo, delivery integrity and failed-render preservation.

Frozen-protocol color parity measurements and a genuine end-to-end render result.

Full regression, typecheck and build results, plus commit and release-artifact identifiers where applicable.

Any deviations, known gaps and follow-up work. Do not classify unresolved acceptance requirements as passed.

The required implementation directive remains: “Use required GSD actions to achieve the goals and wherever needed.”

Immediate next action

Start with Stage 2A only: inspect the existing routes, preview implementation, Visual Control Surface state model, OperationExecutor, and active-delivery publication path. Submit plans/PHASE_17_STAGE2A_INTEGRATION_AUDIT.md for architecture review before implementation begins.

Stage 2 is successful only when a user can safely adjust a grade, see the correct preview, explicitly commit or discard it, reverse committed edits, and produce a verified final render without compromising existing project state or delivery.

ChatGPT can make mistakes. Check important info.
Latest response




Think