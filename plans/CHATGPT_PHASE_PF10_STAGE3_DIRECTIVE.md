Writing
EME PF-10 Stage 3 — Multi-Revision Visual Inspection, Candidate Comparison & Conversational Revision

Status: Authorized to begin
Prerequisites: PF-10 Stage 1 and Stage 2
Primary objective: Complete the visual control surface for inspecting revision history, comparing verified candidate deliveries, and requesting conversational revisions while preserving engine authority, immutable delivery provenance, and PF-09 session semantics.

Use required GSD actions to achieve the goals and wherever needed.

0. Non-negotiable architectural invariants

The engine and RevisionSessionManager remain the sole authorities for session state, revision history, undo/redo, candidate eligibility, operation execution, QA, and active delivery.

The frontend must not implement a parallel planner, executor, QA engine, candidate scorer, revision state machine, or history database.

Every mutation must use the existing authoritative backend contract, including expectedVersion wherever required.

Historical inspection, comparison, and diff viewing must never change the active delivery.

Only an explicitly selected, eligible candidate with its exact verified manifest may become active through the authoritative selection endpoint.

A requested revision is not a verified delivery. A revision may become active only after the backend confirms successful execution and verification.

Preserve schema/eme-project.v1.schema.json. Do not change project schema or invent backend fields to simplify frontend implementation.

Preserve all existing PF-09 undo/redo, branching, recovery, immutable history, and concurrency behavior.

1. Reconnaissance and contract verification

Before implementation, inspect:

src/ui/public/index.html

src/ui/public/index.css

src/ui/public/app.js

src/ui/server.js

src/prompt-core/revision-session.js

src/prompt-core/prompt-deliverable-orchestrator.js

Candidate orchestrator and preference evaluation/feedback modules

Existing schemas and tests for revision sessions, candidate sets, delivery manifests, and PF-10 Stage 1/2

Verify actual request and response contracts for:

GET /api/session

GET /api/session/history

GET /api/session/diff

GET /api/candidates

GET /api/timeline?revisionId=...

POST /api/session/select

POST /api/session/revise

POST /api/session/undo

POST /api/session/redo

POST /api/session/recover

The existing media endpoint

Document required fields, error responses, revision identifiers, candidate-set identifiers, manifest references, concurrency versions, and media provenance.

Do not assume endpoint signatures or field names based only on earlier reports. Reuse existing contracts; propose backend changes only when a real gap is demonstrated.

2. Feature A — Revision History DAG

Implement a revision history panel backed by GET /api/session/history.

Required UI

Render revisions as a directed graph or clearly structured tree, showing predecessor relationships and branches.

Distinguish committed, failed, active, and superseded revisions using both labels and visual styling.

Display available revision ID, predecessor ID, timestamp, status, manifest ID, and verification information.

Clearly identify the active verified delivery.

Distinguish a failed attempt from a committed revision.

Show branch relationships after undo followed by a new revision; do not falsely represent history as a single linear sequence.

Provide an explicit action to inspect a historical revision.

Provide a clear action to return to the active delivery.

Display loading, empty, unavailable, and API error states.

Historical inspection behavior

When the user inspects a revision:

Resolve the exact revision through the authoritative history and timeline APIs.

Load its persisted project snapshot and, where available, the exact media artifact belonging to that revision.

Display an explicit HISTORICAL REVISION — READ-ONLY state.

Keep the inspected revision ID separate from the active delivery ID.

Do not call selection, revision, undo, redo, or recovery endpoints merely to inspect history.

Do not mutate the project pointer or active delivery.

If historical media is unavailable or cannot be authoritatively resolved, show the historical timeline with an explicit media-unavailable state. Never silently show unrelated active-delivery media as if it belonged to the inspected revision.

Use GET /api/session/diff to compare revisions when its required snapshots are available. If a snapshot is missing, show DIFF UNAVAILABLE; never synthesize an authoritative-looking diff.

Diff presentation

Where supported by the actual engine diff:

Added and removed clips

Modified clip properties

Start-time and duration changes

Track reassignment

Effect and color-grade changes

Total project duration changes

Clearly distinguish direct changes from derived changes only when the backend supplies sufficient provenance. Otherwise, display the observed snapshot difference without guessing the cause.

3. Feature B — Candidate Comparison Cards

Implement a comparison panel backed by GET /api/candidates and authoritative candidate-set data.

Required UI

Display available candidates in comparison cards, including actual available fields for:

Candidate ID and profile

Eligibility and verification status

QA score and hard-gate status

Preference satisfaction

Musical alignment

Composite score and rank, when supplied by the engine

Manifest ID and media SHA-256

Resolution, frame rate, and duration when available

Provide a comparison view that makes meaningful differences between candidates easy to inspect. Reuse the existing preview player where possible rather than creating a second playback implementation.

When candidate media is available, let the user preview candidates without activating them. Candidate previews must be bound to the exact candidate/manifest pair. Clearly distinguish a candidate preview from the active delivery.

Selection semantics

Show a selection action only when the backend reports the candidate as eligible, while still treating the server as the final authority.

On selection, submit the exact candidate-set ID and candidate ID required by the actual API, along with the current expectedVersion.

Do not send a client-computed score as evidence of eligibility.

Handle 409 STALE_VERSION, 409 CONFLICT, 422 NOT_ELIGIBLE, and other actual server errors without optimistic activation.

After a successful selection response, refetch authoritative session state and history.

Do not mark a candidate active until the server confirms the selected delivery and manifest.

Preserve sibling candidates and prior verified deliveries. Selection must not delete or rewrite candidate artifacts.

If the API cannot uniquely bind a candidate to its immutable manifest, stop and document the contract gap instead of guessing.

4. Feature C — Conversational Revision Form

Implement a conversational revision panel that submits natural-language requests through POST /api/session/revise.

Input and confirmation flow

Provide a text area for the user's requested change.

Display the current session/revision context and concurrency version.

Disable duplicate submission while a mutation is in flight.

Show an explicit review stage before execution when the backend exposes a compiled intent or proposed change summary.

Show requested changes, preserved hard constraints, conflicts, and unsupported requests only when these are supplied by authoritative compiler results.

Allow the user to cancel before submitting.

Submit through the existing revision API and preserve the PF-09 state machine.

Do not invent a client-side intent parser or pretend that a frontend-generated summary is the engine's compiled plan. If the current endpoint does not support a separate preview/dry-run operation, document the limitation and use the supported revision flow. Do not invent a dry-run endpoint.

Revision safeguards

Include expectedVersion and other required session identifiers from the latest authoritative session state.

Respect the current session's hard constraints, including clip order, soundtrack, total duration, track requirements, and other explicitly preserved constraints.

Treat conflicting requests as engine-reported conflicts; do not silently relax constraints.

Display clear progress while a revision is being processed.

On success, refetch the authoritative session, history, timeline, and delivery metadata as needed.

On failure, display the failure and retain the last verified active delivery.

Handle request timeouts without blindly resubmitting a potentially committed revision. Use an existing idempotency mechanism if available; otherwise, refetch session/history and reconcile the outcome before enabling another submission.

Prevent stale asynchronous responses from overwriting a newer session.

Do not automatically undo, select a fallback candidate, or retry with modified creative constraints.

Undo, redo, and recovery

Expose existing PF-09 undo/redo/recovery controls only through the authoritative endpoints and according to backend readiness flags.

Submit the current expected version where required.

Disable controls when the authoritative session says the action is unavailable.

Refetch state after completion.

Preserve correct branch semantics when a new revision is created after undo.

Keep the last verified delivery visible until the engine confirms the new verified result.

Recovery must use the existing recovery endpoint and must not manufacture a successful session state locally.

5. State architecture and interaction rules

Use a clear separation between:

Active delivery: the currently authoritative verified output.

Inspected revision: a read-only historical snapshot.

Previewed candidate: an unselected candidate artifact.

Pending revision: an in-flight mutation.

Failed revision attempt: a recorded failure that does not imply a new active delivery.

These states must never be conflated.

Use the existing fetchAuthoritativeSession pattern or an equivalent centralized synchronization mechanism. Guard against stale responses. Avoid polling on every playback frame.

All graph, card, diff, and revision form components must consume authoritative response data. Frontend-derived display formatting is allowed; frontend-derived execution, eligibility, verification, or history semantics are not.

Keep the existing dark editing UI coherent, accessible, responsive, and keyboard-operable. Provide readable labels, visible focus, non-color status indicators, and explicit empty/error states.

6. Required tests

Add a dedicated Stage 3 test suite, preferably tests/ui-pf10-stage3.test.js, covering at least:

Revision DAG displays predecessor links and branches from authoritative history.

Failed and committed revisions are visually and semantically distinct.

Historical inspection does not mutate active delivery or project pointer.

Historical media is correctly bound to its revision or shown unavailable.

Missing snapshots produce an explicit unavailable diff.

Diff fields reflect the backend snapshot diff without fabricated changes.

Candidate cards bind to exact candidate and manifest identifiers.

Ineligible candidates cannot be activated by frontend actions.

Candidate preview does not change the active delivery.

Selection uses the current expectedVersion; stale selection fails safely.

Successful selection updates the UI only after authoritative confirmation.

Revision submission includes required session/version context.

Revision success refetches authoritative state and history.

Revision failure preserves the last verified delivery.

Conflicts and hard-constraint violations are displayed without silently changing the request.

A timed-out or duplicated submission is reconciled without blindly executing twice.

Undo/redo and branch behavior remain correct after multiple revisions.

Stale asynchronous responses cannot overwrite newer state.

Empty, missing, malformed, and unknown backend fields fail visibly and safely.

Existing PF-10 Stage 1, PF-10 Stage 2, Phase 8, PF-07, PF-08, and PF-09 regression tests remain green.

Use real backend payload fixtures where possible. Include integration tests for critical mutation flows; frontend-only mocks are insufficient evidence for server contract correctness.

7. Stage 3 acceptance gates

Stage 3 is accepted only when all of the following are demonstrated:

History graph faithfully represents authoritative revision and branch relationships.

Historical inspection is read-only and never confuses historical media with active delivery media.

Diffs come from persisted snapshots and fail closed when unavailable.

Candidate previews remain distinct from active delivery.

Selection binds the exact eligible candidate and verified manifest through the authoritative API.

Conversational revisions use the existing session and concurrency contracts.

Failure, timeout, and stale-version paths preserve the last verified delivery.

Undo/redo/recovery semantics remain engine-owned.

No parallel planner, executor, scorer, verification engine, or revision state machine is introduced.

New tests and all relevant existing regressions pass.

An engineering report lists changed files, test commands and actual results, contract gaps, limitations, and release gates.

Do not expand into unrelated rendering-engine changes, new project schema versions, or additional timeline-editing capabilities. Complete this stage before proposing the next milestone.

8. Final engineering report

Submit plans/PF10_STAGE3_COMPLETION_REPORT.md containing:

Architecture and implementation summary.

Backend contracts consumed and any contract gaps discovered.

History DAG, historical preview, candidate comparison, and revision form behavior.

Failure handling and concurrency guarantees.

Tests run, exact commands, and actual results.

Remaining limitations and release gates.

Explicit confirmation that active delivery and project state are never mutated by historical inspection or candidate preview.