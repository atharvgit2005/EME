EME Architecture Review — PF-09 Sign-off and PF-10 Directive
1. PF-09 acceptance decision
PF-09: Provisionally Accepted

Review basis: the supplied PF-09 Acceptance Report, not an independent repository run or inspection of the rendered MP4.

The reported 50/50 tests and flagship workflow support acceptance of the core session architecture: versioned sessions, constraint-preserving revisions, verified delivery activation, revision history, undo/redo, stale-version rejection, and recovery.

The report also documents closure of the two PF-08 conditions: QA eligibility at the 79/80/81 boundary, and separate tracking of explicit rejection versus passive non-selection. 
Pasted text.txt

Final technical review items

Before declaring PF-09 fully certified, I would close three evidence gaps:

1. Crash-recovery coverage. The report describes checkpoint restoration and idempotence, but the listed PF09.9 test duration is only 0.8 ms. That does not invalidate the test, but the report does not establish that a real process was terminated and restarted at each critical persistence boundary. Verify journal, project, manifest, and active-pointer recovery with process-level failure injection.

2. Media identity. The baseline and revised delivery are both reported with the same SHA-256, 54b7e8…fbf87. 
Pasted text.txt
 This may be legitimate if the requested title movement is not reflected in the particular media artifact or the test uses a fixture, but it is suspicious for a revision intended to change visible timing. Confirm that the hash belongs to the stated revised MP4, then inspect frames around the old and new title intervals. If the title genuinely moves, explain any identical-hash result before signing off.

3. Undo/redo activation semantics. Confirm that restoring a previous revision activates its exact verified manifest and media without mutating the immutable artifact. If restoration requires rendering, the new render must pass verification before activation.

Decision: PF-09's core design and reported test battery are accepted. Full certification remains conditional on these narrow evidence checks. This is a report-based architectural review, not a claim that I independently ran the tests.

2. PF-10 — Timeline UI Surface Integration & Multi-Revision Visual Inspection

Authorization: PF-10 is authorized to begin, with the PF-09 closure checks running in parallel. Do not block UI architecture on a broad rework of PF-09; close the specific evidence gaps above while preserving the existing engine contracts.

The objective is to give EME a visual control surface for inspecting, comparing, and approving revisions. The UI must be a client of the engine—not a second implementation of the engine.

Target experience

Visual direction reference only; not a claim about the existing EME implementation.

PF-10 architecture and implementation directive
Writing
EME PF-10 — Timeline UI Surface Integration & Multi-Revision Visual Inspection
Mission

Implement PF-10 as the visual control surface for the existing Editing Mechanics Engine (EME).

Expose the engine's verified state through a usable timeline, preview monitor, candidate comparison, revision diffs, revision history, and explicit approval workflows.

The UI must accurately represent project state, engine execution state, verification state, and active-delivery state. It must never present a pending or failed render as a verified deliverable.

Use required GSD actions to achieve the goals and wherever needed.

Governing architectural invariant

The UI is a client of EME, not a competing editing engine.

All edits, revisions, candidate selection, undo/redo, execution, rendering, QA, semantic verification, and activation must use existing engine services and contracts.

Never duplicate planning, scheduling, constraint resolution, operation execution, rendering, or verification logic in the UI.

Do not change eme-project.v1 without explicit authorization and a versioned migration.

Stage 0 — Repository reconnaissance and PF-09 evidence closure

Before implementation:

Inspect the current repository, frontend architecture, CLI/service boundaries, project schema, operation registry, session schema, candidate contracts, revision history, and render/QA contracts.

Reuse the existing framework, build tooling, component system, styling conventions, and test infrastructure. Do not introduce a new frontend framework without a demonstrated need.

Identify the supported way for the UI to communicate with the EME engine. If a local API or bridge is missing, implement the smallest secure adapter consistent with the existing architecture. Do not expose arbitrary filesystem access or unrestricted command execution.

Run and document the PF-09 closure checks:

Process-level crash recovery at critical persistence boundaries.

Baseline versus revised media hash verification.

Actual rendered title timing before and after the flagship revision.

Undo/redo activation and immutable artifact preservation.

Do not conceal unresolved PF-09 findings. Record them in the PF-10 report and distinguish blockers from parallel follow-ups.

Stage 1 — UI architecture and state model

Create a versioned UI-facing view model or adapter over existing contracts. Prefer derived read-only state instead of a second authoritative store.

The view model should expose:

Project identity, dimensions, frame rate, and integer tick timebase.

Track identities, track types, ordering, and lock state.

Clip identities, source references, start/end ticks, duration, effects, and relevant animated properties.

Audio envelopes and waveform metadata where available.

Current session, active revision, predecessor, candidate set, and selected candidate.

Revision history and undo/redo availability.

Current execution, render, QA, semantic-verification, recovery, and activation status.

Media paths or safe preview URLs for actual artifacts.

Revision diffs, constraint outcomes, and relevant manifest/hash identities.

Keep the existing canonical timebase: TICKS_PER_SECOND = 120000, with half-open intervals [start, end).

The UI may format ticks into human-readable timecode, but must not round-trip edits through floating-point seconds if that loses integer-tick precision.

Define clear loading, empty, stale, unavailable, failed, and recovery-required states. Never silently substitute fake project data for unavailable engine data in production.

Stage 2 — Timeline surface

Build a functional multi-track timeline with:

A time ruler with readable timecode and frame-aware positioning.

Track lanes with labels and correct stacking/order.

Video and B-roll clip blocks positioned from canonical start/end ticks.

Title/graphics clips and their timing intervals.

Audio clips and waveform visualization when real waveform data is available.

Distinguishable selected, locked, muted, disabled, pending, and failed states where supported.

Horizontal scrolling and zoom.

Fit-to-project and playhead navigation.

Clip selection and property inspection.

A project overview showing total duration and relevant output settings.

Timeline geometry must be derived from canonical tick positions and the current viewport transform. Zooming must not mutate project data.

Provide a useful empty state and a clear explanation when a clip type or metadata is not supported by the current renderer.

Editing interactions

Implement only interactions that can be translated into supported EME operations.

For move, trim, or property changes:

Preview the proposed change in the UI.

Compile or request a revision through the existing engine.

Enforce locked-track and hard-constraint rules through authoritative engine services.

Display validation errors before execution when available.

Apply the resulting authoritative project state only after the engine reports a successful commit.

Keep pending state separate from committed state.

On rejection or failure, restore the authoritative view without losing the user's current inspection context.

Do not directly mutate project files from UI handlers or bypass OperationExecutor.

If an interaction cannot be safely mapped to a supported operation, expose it as read-only rather than implementing a parallel mutation path.

Stage 3 — Preview monitor and verified media

Implement a preview monitor that plays the actual engine-generated media artifact.

Show the correct artifact identity and status:

Pending render

Render in progress

QA running

Verification failed

Verified

Active delivery

Superseded revision

Keep these states visually distinct.

The preview monitor must not imply that the source timeline is rendered when the displayed video is an older delivery. Show the revision ID or equivalent identity associated with the preview.

Support seeking and playback. Where possible, synchronize preview time with the timeline playhead. Respect the media's actual frame rate and duration.

For pending edits, either display an explicitly labeled draft preview or continue showing the last verified render with a clear stale/pending indicator.

Never mark a preview verified merely because the media element can play it.

Stage 4 — Multi-revision inspection and diffing

Build a revision-history panel containing:

Revision ID and predecessor.

User request or revision summary.

Timestamp and status.

Plan identity and operation count.

QA and semantic-verification outcomes.

Media and manifest identities.

Active/superseded status.

Failure or recovery information where applicable.

Selecting a historical revision for inspection must not silently activate it.

Implement a revision-diff view comparing the current inspection target with a chosen predecessor or sibling. Show, where supported:

Added, removed, moved, and trimmed clips.

Start/end/duration changes.

Title timing and typography changes.

Transition/effect changes.

Audio-envelope and audio-clip changes.

Track-order changes.

Asset-reference changes.

Explicitly preserved constraints.

Derived changes caused by the engine.

Distinguish direct user-requested changes from derived changes.

Use actual before/after project snapshots and canonical engine results. Do not infer that a property changed merely because a revision prompt mentioned it.

Provide a way to inspect the exact verified media associated with either revision.

Stage 5 — Candidate comparison and selection

Integrate PF-07/PF-08 candidate sets.

Provide a comparison surface for Dynamic, Cinematic, Editorial, and any future profiles supported by the candidate contract.

For each candidate show:

Actual preview media.

Candidate ID and profile.

Eligibility and hard-gate status.

QA score and semantic-verification status.

Preference satisfaction and musical alignment where available.

Overall ranking and reasons for ranking.

Authorized variation dimensions.

Media hash or artifact identity.

Selection status.

A failed or ineligible candidate must not appear selectable.

Do not manufacture scores or labels when the engine has not supplied evidence. Clearly distinguish unavailable measurements from zero-valued measurements.

Selection must call the existing candidate-selection/session service and bind the exact candidate and verified manifest. Never activate a candidate through a UI-only state update.

Stage 6 — Conversational revision panel

Provide a focused natural-language revision input connected to the existing PF-09 session workflow.

Display:

The user's requested changes.

Parsed intent or change summary when the engine exposes it.

Constraints preserved by the compiler.

Conflicts or unsupported requests.

The proposed revision plan and affected clips/properties.

Pending execution and rendering status.

Independent QA and semantic-verification results.

The final verified revision and manifest identity.

The user must be able to review a proposed change before applying it where the existing workflow supports that step.

The UI must not claim that an operation succeeded until the engine confirms the result.

Use existing session state, optimistic concurrency/version checks, recovery, and error contracts. Handle stale sessions by refreshing authoritative state and presenting a useful conflict message; do not silently overwrite another revision.

Stage 7 — Undo, redo, approval, and recovery

Implement visible, functional controls for:

Undo.

Redo.

Inspect previous revision.

Compare revisions.

Select a candidate.

Apply a revision.

Approve or activate a verified delivery where required.

Inspect failed execution and recovery state.

Retry or recover only through supported engine operations.

Disable controls when their preconditions are not satisfied.

Undo and redo must use PF-09 history semantics. Do not simulate them by editing the frontend store or reverting arbitrary project JSON.

A historical revision may be inspected without being activated. If activation requires re-rendering, verification must complete before the active-delivery pointer changes.

If recovery is required, explain the state and offer the supported recovery action. Never offer an unsafe action that could replace the last verified delivery.

Stage 8 — Design system and interaction quality

Use a restrained, professional dark editing-workstation aesthetic consistent with the existing EME product.

Prioritize:

Clear information hierarchy.

High contrast and readable typography.

Precise timeline geometry.

Subtle separators and restrained accent colors.

Compact but understandable status indicators.

Keyboard accessibility and visible focus states.

Accessible labels and tooltips for icon-only controls.

Responsive layout without hiding critical verification status.

Clear empty, loading, error, stale, and recovery-required states.

Avoid decorative clutter, excessive gradients, oversized cards, fake activity indicators, and nonfunctional controls.

Every visible button, menu, slider, timeline interaction, and selection must have a real implemented behavior or be explicitly disabled with a reason.

Stage 9 — Testing and certification
Unit tests

Tick-to-pixel and pixel-to-tick mapping, including rounding and frame boundaries.

Zoom, scroll, and viewport calculations.

Clip geometry and half-open interval rendering.

Diff rendering from authoritative before/after snapshots.

View-model mapping from engine contracts.

Status precedence and unavailable-data handling.

Selection and control enablement rules.

Integration tests

Load a real project and display correct track/clip positions.

Select a candidate and bind its verified manifest to a session.

Submit a revision and display pending, verifying, failed, and verified states.

Refresh the UI and recover the same authoritative session state.

Display actual before/after revision diffs.

Undo and redo across multiple revisions.

Reject stale session versions.

Preserve the previous verified preview after a failed revision.

Verify that candidate previews and manifest identities match their selected records.

Recover cleanly after engine restart.

Adversarial and failure tests

Missing or invalid media.

Stale project and session versions.

Failed rendering and failed semantic verification.

Manifest/media hash mismatch.

Interrupted engine communication.

Duplicate submission and concurrent user actions.

Unsupported clip or effect types.

Empty projects and very long timelines.

Locked tracks and rejected mutations.

Recovery-required sessions.

Visual and end-to-end tests

Use a reproducible fixture with multiple video tracks, a graphics/title track, B-roll, transitions, and audio.

Verify:

Timeline positions agree with canonical tick values.

The title's old and revised intervals match the actual rendered media.

Candidate profiles display the correct profile-specific artifacts.

Historical previews correspond to their manifests.

Failed revisions never appear active or verified.

Undo/redo and branching produce the expected UI state.

Capture screenshots or other visual artifacts for representative states. Visual tests must supplement, not replace, behavioral tests.

Run the existing regression suite and report exact test counts. Do not claim browser-level or physical-render verification unless those checks were actually executed.

Deliverables

Functional multi-track timeline surface.

Actual media preview monitor with verification status.

Revision history and before/after diff view.

Candidate comparison and selection.

Conversational revision panel.

Functional undo/redo and recovery controls.

Versioned UI adapter/view-model contract where needed.

Unit, integration, failure, and end-to-end tests.

Visual evidence and a reproducible certification fixture.

PF-10 engineering report with changed files, commands, exact results, known limitations, and evidence paths.

Acceptance gates

PF-10 is eligible for sign-off only when:

The timeline renders authoritative project data accurately.

All mutation paths route through existing EME services.

Preview identity and verification status are truthful.

Candidate selection binds the exact verified candidate and manifest.

Revision diffs are derived from actual project snapshots.

Undo/redo and session recovery preserve PF-09 semantics.

Stale and concurrent updates fail safely.

No failed or unverified artifact can become active through the UI.

All visible controls work or are explicitly disabled.

Automated regression tests pass and visual/end-to-end evidence is supplied.

The existing project schema remains unchanged unless separately authorized.

The PF-09 closure findings are documented and resolved or explicitly classified.

Out of scope

Replacing the deterministic engine with frontend editing logic.

A second project-state authority.

Autonomous preference learning.

Unverified one-click activation.

Full custom compositing/rendering logic in the browser.

Unrequested schema migrations.

Cosmetic-only mockups presented as a completed integration.

After implementation, stop and submit the PF-10 engineering report for architecture review. Do not automatically begin PF-11.

3. Recommended PF-10 implementation order

Engine adapter and read-only timeline. Load real project/session data and verify time mapping before implementing edits.

Preview and revision history. Bind every preview to its actual manifest and display authoritative status.

Diff and candidate comparison. Reuse PF-06/PF-08 outputs instead of reconstructing decisions in the UI.

Revision controls. Wire conversational revisions, undo/redo, approval, and recovery to existing services.

Certification. Run failure scenarios, regression tests, and visual checks using real rendered artifacts.

The most important gate is not whether the timeline looks correct. It is whether the timeline, revision history, preview monitor, and active delivery all agree with the same authoritative engine state.

Next step: Give the PF-10 directive to your IDE agent. Have it return its repository reconnaissance and proposed component/service map before it starts large-scale implementation; that will expose architectural mismatches early without prematurely locking you into the wrong UI structure.