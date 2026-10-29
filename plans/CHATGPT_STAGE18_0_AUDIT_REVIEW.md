# ChatGPT Architecture Lead: Stage 18.0 Audit Review & Stage 18.1 Authorization

**Date**: 2026-10-20T16:03:31.600Z  
**Conversation**: `https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a`  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.0 Review & Stage 18.1 Authorization  

---

The audit provides a coherent account of the source-to-display path, canonical operation contracts, transient state ownership, and the six implementation gaps identified during reconnaissance. The proposed staged remediation is appropriate: fix the visual surface first, then integrate editing operations, then harden concurrency and recovery.

There is, however, one discrepancy that prevents unconditional acceptance of the baseline evidence: the reported magnetic-snapping P95 is 0.80 ms, while the Phase 18 directive required preserving the established benchmark target of below 0.30 ms. The audit substitutes a 1.50 ms target for the 2,001-snap-point test without reconciling it with the original target.

That does not automatically mean the implementation regressed—the benchmark conditions may differ—but the target must not be silently changed. Reconcile the measurements during Stage 18.1 and record the result. This is an open verification item, not a reason to halt visual-surface implementation.

This review is based on the report you supplied. I have not independently inspected the committed repository or rerun the test suite.

Writing
EME Phase 18 — Stage 18.1 Implementation Authorization

Milestone: TL-01 — Non-Destructive Interactive Timeline Engine
Stage: 18.1 — Timeline Visual Surface, Scrubbing & Transient Interaction State
Authorization: GO
Prerequisite disposition: Stage 18.0 conditionally accepted; benchmark reconciliation remains open
Required implementation instruction: Use required GSD actions to achieve the goals and wherever needed.

1. Scope authorization

Proceed with Stage 18.1 in the existing Visual Control Surface. Reuse TimelineAdapter, the read-only /api/timeline projection, existing canvas/DOM structures, and the established transient UI state where practical.

Do not create a second timeline engine or rewrite OperationExecutor.

Stage 18.1 covers the interactive viewing and proposal layer:

Timeline clip and track rendering from canonical project state.

Consistent horizontal scale and coordinate conversion.

Clip selection and deselection.

Playhead scrubbing and timecode display.

Zoom, horizontal scroll, and viewport behavior.

Snap indicators and transient drag proposals.

Safe keyboard shortcuts and gesture cancellation.

Reconciliation when updated authoritative timeline projections arrive.

Stage 18.1 does not certify the commit path for clip-editing gestures. Full editing-operation integration remains Stage 18.2, followed by concurrency and recovery hardening in Stage 18.3.

Until those gates are met, disable or safely gate any existing mutating UI controls that cannot guarantee valid revision checks and transactional behavior. In particular, no drag, blade, trim, slip, slide, ripple, or visibility action may bypass the engine to produce an apparent local edit.

2. Mandatory implementation decisions
A. Establish one timeline coordinate contract

Resolve the mismatch between the UI's duration-dependent pixel scaling and the adapter's constant pixels-per-second model.

Use one authoritative scale definition derived from the adapter's documented contract. Where the established contract applies, the intended mapping is:

pixelsPerTick = (100.0 * zoom) / 120000

Do not independently calculate incompatible scale factors in different rendering, scrubbing, snapping, and drag-preview handlers.

Test that the same tick maps consistently to the same temporal coordinate across the UI and adapter. Separate content coordinates from viewport coordinates: horizontal scroll changes what is visible, not the underlying timeline position.

Zoom should preserve the time position under the zoom anchor, subject to the documented pixel/tick rounding policy. Repeated zooming and scrolling must not accumulate timeline-time drift.

B. Keep transient interactions non-mutating

Maintain clear separation between:

Canonical project state.

Selection and hover state.

Playhead position.

Zoom and scroll state.

Drag proposal, ghost rectangle, and snapping guides.

Pending or cancelled gesture state.

During pointer movement, update only the transient proposal and visual projection. Do not submit operations or modify state.project.

On pointer release, Stage 18.1 may finalize or clear the transient interaction. It must not commit a clip edit unless the relevant operation and concurrency gates have separately been completed and approved.

Provide safe cancellation through Escape, pointer cancellation, and loss of pointer capture. Cancellation must clear the proposal and snap guide without issuing an engine mutation.

C. Preserve interaction and keyboard safety

Resolve the current keyboard shortcut collision:

Scope the C hold-to-compare shortcut to the appropriate color-comparison context.

Assign Crop to Shift+C as proposed, ensuring it does not conflict with an established shortcut.

Prevent timeline and global editing shortcuts from firing while the user is typing in an input, textarea, or contenteditable element.

Ensure key release, blur, pointer cancellation, and mode changes cannot leave a hold interaction latched unintentionally.

Audit every touched event handler for accidental operation dispatches and stale state closures.

D. Eliminate local-only project mutations

The existing toggleTrackVisibility behavior must not directly mutate track.hidden in the frontend.

Either route visibility changes through the canonical set_track_state operation with the applicable concurrency guard, or disable the control until Stage 18.2 integrates it correctly. Do not display locally modified visibility as if the engine had committed it.

E. Preserve authoritative reconciliation

Use /api/timeline as a read-only projection path. Do not repeatedly invoke project-loading routes simply to refresh the timeline, especially where project loading clears undo/redo history.

Reject stale asynchronous projection responses when a newer response or revision has already been accepted. After reconciliation, preserve selection, zoom, and scroll only when their referenced objects and context remain valid.

Keep the 120,000-ticks-per-second timebase and half-open interval semantics unchanged.

3. Stage 18.1 test requirements

Implement or extend focused tests for the following cases:

Coordinate parity: Adapter/UI tick-to-pixel mapping agrees at multiple zoom levels and project durations.

Round-trip mapping: Pixel-to-tick conversion and reverse mapping remain within the documented tick-rounding tolerance.

Viewport behavior: Horizontal scrolling does not change canonical clip positions; zoom anchoring does not introduce time drift.

Non-mutating scrubbing: Repeated playhead updates create zero project revisions and zero undo entries.

Selection behavior: Select, deselect, and selection changes do not mutate project state.

Proposal behavior: Drag ghosts and snap guides update without API mutation calls.

Cancellation: Escape, pointer cancellation, and focus loss clear transient state without a commit.

Keyboard isolation: Color comparison, Crop, and timeline shortcuts cannot trigger unintended actions in other modes or while editing text.

Stale responses: An older timeline projection cannot replace a newer accepted revision.

Visibility safety: The UI cannot change visibility only in a local project copy and present it as committed state.

Regression: Existing timeline operation and project tests remain green.

Performance-baseline reconciliation

The Stage 18.0 report gives a magnetic-snap P95 of 0.80 ms for 2,001 snap points, while the Phase 18 directive carried forward a below-0.30 ms target from the established baseline.

Run both the established benchmark and the newly reported 2,001-point benchmark under documented conditions. Record sample counts, fixture characteristics, runtime environment, and percentile calculation.

Do not silently replace the original target with 1.50 ms. If the original fixture remains below 0.30 ms while the larger fixture measures 0.80 ms, report the results separately and explain the workload difference. If the original benchmark now fails its target, investigate the discrepancy and submit evidence before claiming the baseline gate is satisfied.

The 1,000-clip projection target remains P95 at or below 16.67 ms on the established benchmark fixture.

4. Stage 18.1 completion report

Submit:

plans/PHASE_18_STAGE1_COMPLETION_REPORT.md

The report must contain:

Exact files and symbols modified.

Final coordinate and zoom contract.

A concise description of transient interaction-state ownership.

Test names and actual outcomes.

Test commands and exit codes.

Before/after performance numbers, including the snapping-baseline reconciliation.

Confirmation that view-only actions produce no canonical project mutation or undo entry.

Any controls intentionally gated pending Stages 18.2 and 18.3.

Known limitations and unresolved issues.

Do not mark the snapping-performance gate as PASS until the comparison is explained and the original target is either satisfied or explicitly escalated for architecture review.

5. Stage 18.1 acceptance gate

Stage 18.1 may be submitted for acceptance when:

The UI and adapter share one time-coordinate contract.

Scrubbing, selection, zooming, scrolling, and proposals remain non-mutating.

Cancellation and keyboard isolation are safe.

Stale projections cannot overwrite newer state.

No touched control can silently mutate only the frontend project.

Required tests and existing regressions pass.

The performance discrepancy has a documented, evidence-based disposition.

Completion of Stage 18.1 authorizes a separate review for Stage 18.2. It does not constitute permission to bypass operation, revision, lock, or transaction controls.

End of directive.

Immediate instruction to the implementation team

Proceed with Stage 18.1, beginning with the shared coordinate contract and transient gesture lifecycle. Keep the snapping benchmark discrepancy visible in the audit trail rather than redefining the acceptance target. Once the implementation and tests are ready, submit plans/PHASE_18_STAGE1_COMPLETION_REPORT.md for review before promoting the next stage.
