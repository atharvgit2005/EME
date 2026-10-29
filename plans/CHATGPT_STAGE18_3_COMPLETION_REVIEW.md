# ChatGPT Architecture Lead: Stage 18.3 Formal Review & Stage 18.4 Authorization

**Date**: 2026-10-20T16:41:42.009Z  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.3 Review & Stage 18.4 Authorization  

---

EME Phase 18 — Stage 18.3 Architecture Review

Decision: Stage 18.2 is accepted with the submitted addendum. Stage 18.3 is conditionally accepted for its reported in-process concurrency and idempotency behavior. Stage 18.4 is authorized to begin, starting with its integration audit and deterministic acceptance fixtures.

The write mutex, revision guards, bounded idempotency cache, and track-lock enforcement address the core concurrency risks. The report also appropriately discloses that the cache is in-memory and does not establish durable idempotency across process restarts.

Two verification items remain open: whether an operation whose response is lost can be retried with the same operation ID, and whether the master test command actually includes the new Stage 18.3 tests. These can be resolved alongside Stage 18.4 work, but must be closed before final TL-01 certification.

Writing
EME Phase 18 — Stage 18.4 Implementation Directive

Milestone: TL-01 — Non-Destructive Interactive Timeline Engine
Stage: 18.4 — Delivery Integration, CapCut Interop & Timeline Acceptance
Authorization: GO — Begin Stage 18.4A immediately
Prior-stage disposition: Stage 18.2 accepted; Stage 18.3 conditionally accepted within its explicitly reported in-process recovery boundary
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Objective

Certify the complete timeline workflow across canonical project editing, save/load, CapCut draft interoperability where supported, and the existing verified delivery pipeline.

The phase must demonstrate that user-facing edits produce the expected canonical project, survive the explicitly supported persistence boundary, preserve timing and source metadata during interop, and generate verified output through the existing render and QA process.

Do not build a second rendering or timeline engine. Do not change the canonical project schema merely to simplify delivery or CapCut conversion.

2. Stage 18.3 close-out items

These items must be resolved during Stage 18.4 before final TL-01 acceptance.

A. Response-loss retry identity

Add a deterministic test that allows a mutation to commit successfully, deliberately drops its HTTP response, and then retries the exact serialized request using the same operationId.

Verify that:

The canonical edit is committed only once.

The project revision advances only once for that logical operation.

The retry returns or exposes the previously committed outcome.

Reusing that operation ID with a different payload is rejected.

An actual retry retains the original operation ID rather than generating a new one.

An unresolvable outcome is surfaced as uncertain and triggers reconciliation instead of a blind new mutation.

The disclosed 200-entry in-memory LRU cache is acceptable as a process-local mechanism only. Do not claim exactly-once behavior across process restart or cache eviction. Any such guarantee requires a durable operation-outcome mechanism and separate verification.

B. Master regression inclusion

Reconcile the Stage 18.3 report's 425/425 master count with its 11 newly added concurrency tests and the expanded 46-test timeline suite.

Inspect the actual npm test command and determine whether it discovers and executes tests/timeline-stage18-3-concurrency.test.js.

If the file is excluded, update the test runner or document the intended suite boundary and execute the complete required regression command. Report the exact commands, counts, and exit codes; do not assume that a passing focused suite is included in the master result.

Deliverable: update plans/PHASE_18_STAGE3_COMPLETION_REPORT.md or create plans/PHASE_18_STAGE3_CLOSEOUT_ADDENDUM.md with the evidence and disposition.

3. Stage 18.4A — Delivery & Interop Contract Audit

Inspect the actual paths for project save/load, CapCut import and any supported export/adaptation, media/source resolution, render invocation, QA verification, delivery manifests, SHA-256 generation, and active-delivery publication.

Document:

Which canonical fields survive the interop boundary.

The rounding policy for timestamps that cannot be represented exactly in both formats.

Which effects, transforms, animations, media references, or other fields are unsupported or lossy.

How project persistence differs from transient in-memory editing state.

How an edited project revision becomes a rendered candidate and a verified active delivery.

Which failure stages preserve the prior active-delivery pointer.

What evidence binds project revision, manifest, rendered media, and hash together.

Deliverable: plans/PHASE_18_STAGE4A_DELIVERY_INTEROP_AUDIT.md.

Do not describe export or round-trip functionality as supported until the actual code and tests establish that capability. If the repository only supports import for a given format, explicitly state that boundary.

Exit gate: The audit identifies the authoritative path from committed project state through supported interop and rendering to verified delivery publication.

4. Stage 18.4B — Deterministic End-to-End Timeline Workflow

Build a deterministic fixture with multiple tracks, multiple clips, source trim ranges, and the media types required for the supported test scenarios.

Execute the workflow through the actual API and engine:

Load and validate the starting project.

Insert a supported asset into a compatible track.

Move a clip using snapping.

Trim an in-point and out-point, verifying the atomic operation contracts.

Split a clip at a valid interior tick.

Execute a ripple delete or ripple trim and verify the expected downstream changes.

Exercise slip and slide operations with source-range and neighbor-boundary assertions.

Reorder tracks and change track state through the canonical operations.

Attempt an invalid or locked-track operation and verify that it fails without a partial commit.

Exercise Undo and Redo and compare canonical edit content against the expected snapshots.

Save the edited project through the supported project persistence route.

Reload it through the supported load path and validate the canonical result.

Use isolated fixtures when combining operations would make a test ambiguous. Record exact snapshots and the expected revision progression.

Acceptance: Every committed edit is attributable to an authoritative operation; failed operations do not leave partial canonical state; reload preserves the fields guaranteed by the project save contract.

5. Stage 18.4C — CapCut Interoperability Verification

Use the existing TimelineAdapter conversion path and current CapCut draft fixtures.

Test the supported import/round-trip boundary, including:

Microsecond-to-tick rational conversion.

Clip ordering, track mapping, timeline starts and durations.

Source trim-in and trim-out fields.

Media and asset references.

Supported transforms and other fields actually represented by both formats.

Unsupported, missing, or lossy fields.

Boundary values and timestamps not exactly representable in the destination time unit.

Maintain the 120,000-ticks-per-second canonical timebase and half-open intervals [startTick, startTick + durationTicks).

Never silently coerce an invalid time into a plausible position. Use the adapter's documented rounding behavior and report any loss explicitly.

For representable values, require exact round-trip equality. For non-representable values, assert the documented bounded conversion difference. Do not invent new export capabilities or promise lossless round-tripping for unsupported fields.

Acceptance: The supported interop contract is reproducible, correctly bounded, and documented. All unsupported or lossy cases have explicit tests and visible diagnostic behavior where applicable.

6. Stage 18.4D — Actual Rendering and Delivery Verification

Use the existing EME rendering pipeline, including the established render compiler and FFmpeg/HyperFrames components where applicable.

Render an output derived from the edited project—not a mock or manually substituted media file.

Verify:

The render input matches the intended canonical project revision.

The output media exists, has the expected technical properties, and passes required Media QA.

The delivery manifest points to the exact output.

The manifest SHA-256 matches the rendered file bytes.

Verification status is assigned by the authoritative backend, not inferred from a client-side loading event.

The active-delivery pointer changes only after all required render, QA, and integrity gates pass.

Inject failures at rendering, media QA, manifest validation, and hash verification.

On failure, preserve the previous verified active delivery. Do not silently revert the canonical project revision merely because its render failed. The project may contain newer committed edits while its active delivery remains the last verified output; present that state accurately.

Acceptance: At least one genuine edited-project render passes the complete verification path, and all failure cases preserve the prior verified delivery.

7. Stage 18.4E — Timeline & Interop Acceptance Matrix

Deliver a machine-readable or documented acceptance matrix linking every requirement to an actual test, fixture, and result.

Include at minimum:

Verification area	Required outcome
Canonical editing workflow	Expected project content and revision progression
Save/load persistence	Reloaded canonical fields match the saved project contract
Undo/Redo	Canonical edit content restored as specified; revision metadata remains monotonic
Timebase and intervals	Integer ticks and half-open interval semantics preserved
CapCut conversion	Exact round trips for representable fields; documented bounded differences otherwise
Source integrity	Media references and source trim ranges remain valid
Render and QA	Actual edited project produces a verified output
Manifest and hash	Published manifest matches the exact output bytes
Failure injection	Previous verified active delivery remains intact
Concurrency close-out	Lost-response retry and master-suite inclusion are explicitly resolved
Regression	All required timeline and project suites pass
8. Performance and regression requirements

Preserve the Stage 18.1 coordinate contract and benchmark targets:

Timeline projection: P95 at or below 16.67 ms on the established 1,000-clip fixture.

Magnetic snapping: P95 below 0.30 ms on the established snapping fixture.

Record fixture sizes, test repetitions, environment, and percentile calculations.

Measure and report operation latency separately from render duration and full delivery latency. Do not treat the entire FFmpeg render as an interactive-frame performance measurement.

Run the focused Stage 18.4 tests, consolidated timeline and interop suites, render/delivery verification tests, and full master regression. Report actual commands, exit codes, test counts, and failures.

9. Final deliverables

Submit:

plans/PHASE_18_STAGE4A_DELIVERY_INTEROP_AUDIT.md

plans/PHASE_18_STAGE4_COMPLETION_REPORT.md

Update the Stage 18.3 close-out evidence as specified above.

The final report must include source paths, operation and delivery flow, requirements-to-tests traceability, actual rendering and manifest evidence, interop limitations, regression results, release commit SHA, and a final PASS / CONDITIONAL PASS / FAIL disposition.

10. Non-negotiable invariants

Do not modify schema/eme-project.v1.schema.json without a separately approved schema-change proposal.

Preserve TICKS_PER_SECOND = 120,000 and half-open interval semantics.

Keep all project mutations within validated engine operations and authoritative commit boundaries.

Do not claim durable idempotency beyond the tested persistence boundary.

Keep VTSM masks isolated in sidecar storage.

Keep Laya advisory-only under the existing canary boundary.

Preserve the previous verified active delivery whenever a new render or QA operation fails.

Distinguish in-memory project changes from saved project state and from verified delivery state.

11. Stage 18.4 completion gate

Stage 18.4 is accepted only when the deterministic timeline workflow, supported interop contract, save/load boundary, genuine render, manifest integrity, failure isolation, and required regressions all pass with reproducible evidence.

This directive authorizes implementation and verification work. It does not pre-authorize release tagging or final Phase 18 certification; those require review of the completed report.

End of directive.

Immediate next step

Start with Stage 18.4A, while running the two Stage 18.3 close-out checks in parallel. This keeps delivery work moving without overstating the recovery guarantee or master-regression coverage. The next architecture checkpoint is the delivery/interop audit and the response-loss retry evidence.
