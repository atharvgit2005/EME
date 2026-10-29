# ChatGPT Architecture Lead: Phase 18 Architecture Kickoff Directive

**Date**: 2026-10-20T15:53:37.307Z  
**Conversation**: `https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a`  
**Milestone**: EME Phase 18: Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration (TL-01)  

---

nd sequencing (e.g. 18.0 Audit & Baseline, 18.1 Timeline Visual Surface & Scrubbing, 18.2 Atomic & Compound Operations, 18.3 Concurrency & Lock Enforcement, 18.4 Delivery & Interop Acceptance).
2. Key constraints, verification gates, and acceptance targets for Phase 18.
3. Guidance on user-facing timeline controls vs transient view state.
…
Show more
ChatGPT said:
EME Phase 18 — Architecture Kickoff Decision
AUTHORIZED: TL-01

Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration

Initial authorization: Begin Phase 18.0 — Audit, Baseline & Integration Contract. Implementation stages follow their explicit exit gates.

The supplied reconnaissance describes a strong starting point: an integer-tick timebase, reversible operations, a display adapter, snapping, and existing UI/backend infrastructure. The central Phase 18 objective is not to build another timeline engine. It is to expose the existing deterministic engine through a reliable, responsive, non-destructive interactive surface.

The architecture rule for this phase is:

The UI owns transient interaction state; the engine owns canonical project state and every committed edit.

A drag may update the displayed proposal many times, but it must not create dozens of project revisions. A successful user action should resolve into a validated engine operation, committed transactionally and reflected back in the UI from authoritative state.

The directive below authorizes Phase 18.0 immediately. Subsequent stages are gated by evidence rather than assumed complete from implementation reports.

Writing
EME Phase 18 — TL-01 Architecture Kickoff Directive

Title: Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration
Milestone: TL-01
Status: Authorized — Stage 18.0 may begin immediately
Architecture owner: ChatGPT Architecture Lead
Implementation environment: Existing EME repository and Visual Control Surface
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Mission and architectural boundary

Deliver an interactive timeline that allows users to inspect, scrub, select, move, trim, split, reorder, slip, slide, ripple-edit, and manage tracks without introducing a parallel editing engine or compromising canonical project state.

The existing EME engine remains authoritative. The Visual Control Surface acts as a responsive projection and interaction layer over it.

Non-negotiable architecture

One canonical project: OperationExecutor and the existing project-management infrastructure remain the authority for committed edits.

One timebase: MediaTime and TICKS_PER_SECOND = 120,000 remain authoritative. Canonical timeline positions and durations are integer ticks.

Half-open intervals: Preserve [startTick, startTick + durationTicks) semantics.

Non-destructive interaction: Pointer movement and visual previews must not mutate the canonical project.

Transactional edits: A completed user action must result in a validated engine operation, not a collection of direct frontend mutations.

Engine-owned reversibility: Undo and Redo use the existing inverse-operation and history mechanisms.

Concurrency safety: Every mutation must respect current revision/version checks, track locks, and existing conflict semantics.

Delivery isolation: Timeline edits must not directly repoint active delivery. Rendering and delivery verification stay within the established pipeline.

Scope isolation: Do not modify schema/eme-project.v1.schema.json, couple VTSM masks to timeline state, or grant Laya Decision Fabric execution authority.

Do not rewrite existing operations just to simplify frontend integration. First establish their contracts and reuse them wherever they satisfy the required behavior.

2. Phase structure and sequencing

The phase comprises five implementation stages followed by a final release gate. Each stage requires a written completion report and acceptance decision before the next stage is considered certified.

Stage 18.0 — Repository Audit, Baseline & Integration Contract

Status: Authorized now.

Required work:

Inspect the current OperationExecutor, transaction and inverse-operation implementations, project manager, timeline adapter, UI server routes, client state, track model, and existing timeline tests.

Trace actual data flow from canonical project state to TimelineAdapter, UI coordinates, pointer interaction, requested operation, engine execution, authoritative response, and refreshed projection.

Document how current selection, playhead position, zoom, scroll, snapping, track layout, track locks, and playback are represented.

Audit basic and compound operation payloads and their actual postconditions.

Identify existing event handlers and endpoints before designing replacements.

Establish reproducible baselines for correctness, performance, regression tests, and interop conversion.

Deliverable: plans/PHASE_18_STAGE0_INTEGRATION_AUDIT.md

The report must include:

Exact source paths and symbols involved.

Existing route and operation contracts.

A current-state data-flow diagram.

A proposed interaction-state model.

An operation-by-operation contract table.

Existing test commands/results and identified coverage gaps.

Timing and performance baseline measurements, including fixture and environment details.

Risks, dependencies, implementation order, and explicit exit criteria.

Exit gate: The audit demonstrates that the team understands the existing source-to-display path and operation commit boundary. Any unresolved uncertainty concerning locking, inverse operations, time conversion, or transaction behavior must be recorded explicitly.

Do not begin broad UI or engine refactoring until the audit is reviewed.

Stage 18.1 — Timeline Visual Surface, Scrubbing & Transient Interaction State

Implement or complete the read-only interactive timeline surface using existing canonical state and TimelineAdapter.

Required capabilities:

Render tracks and clips from authoritative timeline projections.

Render clip boundaries, duration, track identity, selection, playhead, and current viewport scale.

Support horizontal scrolling and zooming without modifying project time positions.

Support click-to-select, deselection, and playhead scrubbing.

Implement precise tick-to-pixel and pixel-to-tick conversion through a documented mapping.

Reuse existing magnetic snapping against clip boundaries and playhead.

Keep selection, hover, drag previews, zoom, scroll, and comparison overlays in transient UI state unless an existing documented persistence contract says otherwise.

Synchronize display state after authoritative project changes without losing valid view context unnecessarily.

Critical behavior: Scrubbing moves the playhead projection; it is not a clip-edit operation. Scrubbing, selection, zooming, and scrolling must not create project revisions, undo entries, or delivery mutations.

The timeline must distinguish a visual proposal from committed state. An interaction may display a proposed location, but the canonical project must remain unchanged until an explicit operation is accepted by the engine.

Exit gate:

Selection and scrubbing work using integer-tick semantics.

Repeated zoom and scroll operations do not accumulate timeline-time drift.

Snapping uses the established implementation rather than a second frontend algorithm.

Out-of-order timeline responses cannot replace a more recent authoritative projection.

Tests prove that view-only actions do not invoke mutation endpoints.

The 1,000-clip performance baseline remains satisfied.

Deliverable: plans/PHASE_18_STAGE1_COMPLETION_REPORT.md

Stage 18.2 — Atomic Editing & Compound Editorial Operations

Integrate the existing operations into the visual surface. Do not introduce new operation semantics unless the audit identifies a genuine missing engine capability and a separate design decision approves it.

Basic operations

insert_clip

trim_clip

move_clip

split_clip

delete_clip

reorder_tracks

Compound editorial operations

ripple_delete

ripple_trim

slip_clip

slide_clip

Track state

set_track_state, including existing mute, lock, and visibility semantics.

Define explicit interaction-to-operation mappings. For example:

Completing a clip drag proposes one move_clip operation.

Completing a trim proposes one validated trim_clip operation.

Splitting at a valid interior position dispatches split_clip.

Ripple editing dispatches the existing compound operation rather than a frontend-generated series of independent edits.

Track reordering dispatches the authoritative track-reorder operation.

A drag may generate many visual updates, but a successfully committed gesture should generate only the intended logical operation. Pointer movement alone must never repeatedly commit operations.

Before committing, verify that the proposed change remains valid against the latest authoritative revision. After the operation succeeds, reconcile the display against the engine's result rather than assuming the proposed local position was accepted.

Operation-specific invariants

Trim: Keep source trim coordinates and timeline position/duration distinct. Respect the operation's actual semantics for the edited edge and preserve valid source ranges.

Move: Change timeline placement through the canonical operation while preserving source ranges and duration unless the established operation explicitly specifies otherwise.

Split: Require a valid split point inside the clip's half-open timeline interval. Ensure the output segments preserve the intended source continuity and duration accounting according to the existing operation contract.

Slip: Preserve the clip's timeline placement and duration while adjusting its source range according to existing engine semantics.

Slide: Use the established compound operation's exact neighbor-adjustment and boundary behavior. Do not emulate it with unrelated move/trim operations.

Ripple operations: Verify exactly which downstream clips and intervals are affected. No unrelated track or clip may shift as a side effect.

Track state: Enforce locked-track restrictions on edits. Do not assume that mute or visibility is equivalent to a lock; honor the existing engine contract.

Exit gate:

Each supported operation has explicit success, invalid-input, locked-track, and stale-revision tests where applicable.

Canonical before/after snapshots prove the expected changes and preservation invariants.

Undo restores the intended prior state; Redo reapplies the change.

Failed validation or execution leaves no partial canonical mutation.

No operation is implemented through direct project-object mutation in the frontend.

Deliverable: plans/PHASE_18_STAGE2_COMPLETION_REPORT.md

Stage 18.3 — Concurrency, Lock Enforcement & Recovery Hardening

Harden the integrated interaction path under real asynchronous behavior.

Required coverage:

Revision/version conflicts during drag, trim, split, ripple, and track operations.

A track becoming locked while a gesture is in progress.

A project or clip changing while a proposal is being displayed.

Two competing mutations against the same project revision.

Duplicate submissions caused by rapid clicks, retries, or repeated pointer-up events.

Undo/Redo requests racing with a new mutation.

A server error, validation failure, or disconnected client during a mutation.

Stale projection responses arriving after a successful operation.

Recovery and resynchronization after an operation whose server outcome is not initially known to the client.

The UI must not force a stale edit into a newer project revision. On conflict, reject the proposal, explain what happened, and refresh authoritative state while preserving valid user view context where possible.

If an operation's outcome is ambiguous because the connection failed, do not blindly resubmit a non-idempotent command. Use the existing request identity, idempotency, or reconciliation facilities if present; otherwise add and test a narrow, documented safeguard before claiming reliable recovery.

Exit gate:

Stale revisions fail safely.

Locked tracks cannot be modified through the UI or a direct API request.

Duplicate requests cannot create duplicate logical edits.

Failed operations cannot corrupt undo/redo history.

A fresh authoritative projection resolves client/engine disagreement.

Existing revision monotonicity and transaction guarantees remain intact.

Deliverable: plans/PHASE_18_STAGE3_COMPLETION_REPORT.md

Stage 18.4 — Delivery Integration, CapCut Interop & Timeline Acceptance

Validate the complete editing workflow from interaction through engine state and any relevant interop or delivery boundaries.

End-to-end timeline scenario

Use a deterministic fixture and record canonical snapshots at each step:

Load a project with multiple tracks and clips.

Select a clip and scrub the playhead to a known tick.

Move a clip using snapping.

Trim a clip while respecting source-range constraints.

Split another clip at a valid interior tick.

Execute a ripple edit and verify all expected downstream changes.

Slip or slide a clip using the established compound-operation contract.

Attempt an edit on a locked track and verify rejection.

Undo each committed operation in reverse order and verify the initial state is restored.

Redo the operations and verify the expected edited state is reconstructed.

Export or adapt the project through the existing CapCut draft conversion boundary where applicable, then re-import or round-trip the supported fields.

Confirm project schema validity, integer-tick correctness, and the absence of unintended delivery-pointer changes.

Not every operation must be combined into a single project if that would invalidate the test fixture. Use isolated fixtures for failure cases and operation-specific invariants as needed.

Interop rules

Reuse the existing rational microsecond-to-tick adapter.

Keep conversion deterministic and explicitly define the rounding policy for values that cannot be represented exactly.

Test round trips on representable values and document expected bounded differences for non-representable values.

Never silently convert canonical ticks through floating-point seconds as an intermediate source of truth.

Do not change project-schema version or canonical semantics merely to simplify CapCut conversion.

Report unsupported or lossy interop fields explicitly.

Delivery boundary

A timeline edit must not directly update the active-delivery pointer. Any render triggered by the established pipeline must retain its existing verification and publication gates. Render or QA failure must preserve the prior verified delivery and truthful project revision state.

Exit gate: The complete deterministic workflow passes, interop results are documented, project invariants are preserved, and no delivery or revision corruption occurs in injected failure tests.

Deliverable: plans/PHASE_18_STAGE4_COMPLETION_REPORT.md

Stage 18.5 — Final Regression, Performance & Certification

Run the complete release candidate through focused timeline suites, existing engine regressions, interop tests, UI integration tests, type checks, and build checks available in the repository.

Produce:

plans/PHASE_18_TL01_COMPLETION_REPORT.md

The report must include an acceptance matrix connecting each requirement to actual tests and results, exact test commands and exit codes, performance data, known limitations, the release commit SHA, and the final disposition: PASS, CONDITIONAL PASS, or FAIL.

No report may label an unexecuted test or unmeasured performance target as passing.

Final acceptance: All mandatory gates are satisfied; the full master regression passes; no schema, timebase, operation-transaction, VTSM-isolation, or Laya-authority invariant has regressed. Tagging or promotion requires a separate explicit release decision after the evidence review.

3. User-facing controls versus transient view state

The implementation must classify every state field by ownership before wiring controls.

State or control	Owner	Persisted project mutation?
Playhead position	Timeline/playback view state, unless an existing project contract specifies otherwise	No
Selection and hover	Visual Control Surface	No
Zoom and horizontal scroll	Visual Control Surface	No
Magnetic snap indicator and drag ghost	Visual Control Surface	No
Pending move/trim/ripple proposal	Transient interaction state	No
Committed clip position/duration/source range	Canonical project and engine operations	Yes, through an operation
Track ordering or committed track state	Canonical project and engine operations	Yes, through an operation
Undo/Redo availability	Derived from engine-owned history	No UI-owned history
Active delivery and render verification	Existing delivery/session subsystem	Only through the established verified delivery flow
Recommended gesture lifecycle

Idle → Gesture active → Proposal preview → Validation → Commit request → Authoritative reconciliation → Idle

During a gesture, render a visual proposal or ghost. Do not rewrite the canonical project object to make the timeline appear responsive.

On pointer release, validate the intended operation against the current revision and dispatch it. On success, project the engine response. On rejection, cancel or visibly invalidate the proposal and resynchronize.

Cancellation, Escape, pointer-cancel, and loss of capture should clear transient proposals without dispatching a mutation.

For keyboard shortcuts, respect focused inputs and editing controls. A shortcut intended for timeline operations must not unexpectedly trigger while the user is typing into a text field.

The UI may optimistically display an interaction proposal, but it must never present an unconfirmed proposal as committed engine state.

4. Verification targets and performance gates

Use these targets for TL-01, recording actual results and test environment.

Area	Acceptance target
Canonical time representation	Integer ticks; no timebase drift
Interval semantics	Half-open [start, end) preserved
Projection and snapping	Preserve reported existing baselines; magnetic-snap P95 remains below 0.3 ms on the established benchmark fixture
Large timeline rendering	1,000-clip fixture meets the 16.67 ms frame-budget target for relevant interactive projection work
Scrubbing and selection	Zero project mutation and zero undo entries
Gesture commits	One intended logical operation per completed gesture
Transaction failures	Zero partial canonical mutations
Lock enforcement	Zero successful forbidden edits
Revision conflicts	Fail closed and reconcile to authoritative state
Undo/Redo	Exact expected state restoration for supported operation fixtures
Interop	Deterministic rational conversions and documented rounding behavior
Delivery isolation	Failed rendering or QA cannot replace the previous verified active delivery
Regression	All mandatory tests and the full master suite pass

Performance measurements must include clip count, operation, repetitions, environment, and percentile calculation. Keep UI event/render performance separate from backend command latency and FFmpeg delivery latency.

If an existing benchmark differs in methodology, report both its original baseline and the newly measured result rather than silently changing how success is calculated.

5. Cross-cutting constraints and prohibited shortcuts

Throughout Phase 18:

Do not alter schema/eme-project.v1.schema.json without an explicitly approved schema-change proposal.

Do not add a second timeline solver, independent operation engine, frontend undo stack, or parallel snapping implementation.

Do not bypass OperationExecutor to make drag interactions appear faster.

Do not use floating-point seconds as the authoritative representation of timeline position or duration.

Do not silently discard source trim metadata during move, trim, split, slip, or slide.

Do not allow UI affordances to override backend lock or revision checks.

Do not permit preview state to contaminate canonical project state.

Keep VTSM masks in their existing sidecar boundary.

Keep Laya advisory-only under CANARY_ADVISORY_MODE; timeline mutations must remain deterministic and engine-authorized.

Preserve active-delivery integrity and the existing render-verification publication path.

Record deviations, unsupported cases, and assumptions explicitly.

6. First action and review protocol

Begin with Stage 18.0.

Inspect the repository and author plans/PHASE_18_STAGE0_INTEGRATION_AUDIT.md. Do not infer implementation details solely from the reconnaissance summary. Cite actual source paths, operation symbols, route contracts, test commands, and measured baselines in the audit.

Submit that artifact for architecture review before broad implementation begins. If the audit confirms that the existing operation, projection, timebase, and concurrency contracts support the proposed flow, authorize Stage 18.1 and subsequent implementation in the stated sequence.

Definition of success

TL-01 succeeds when users can interact with a responsive timeline, preview edits without mutating canonical state, commit supported operations through the existing engine, recover safely from conflicts, use Undo/Redo reliably, preserve integer-tick accuracy, and maintain the integrity of project state and verified delivery throughout.

End of directive.

Immediate next step: have the IDE agent execute Stage 18.0 and return the audit report—not code changes yet. The first review should settle the actual UI-to-engine interaction path, the existing operation contracts, and the behavior of locks and revision conflicts.

ChatGPT can make mistakes. Check important info.
Latest response




Think
