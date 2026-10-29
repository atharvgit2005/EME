Formal Architecture Decision: CG-01 and TL-01
CG-01: Implementation Accepted

Intelligent Color Grading Engine

The reported 55/55 passing tests, versioned grading contract, LUT infrastructure, GPU preview, and FFmpeg compiler establish a promising grading subsystem.

CG-01 final exit gate: Pending evidence

The report provides two CPU-reference-to-FFmpeg parity scenarios, but does not establish numerical parity for the complete GPU preview graph or independently validate every required grading operation.

TL-01 / Phase 18: Authorized

Interactive Manual Timeline

Antigravity may begin the timeline implementation now. Use the existing canonical project model and established transaction engine. Resolve the remaining CG-01 parity evidence before Phase 19 integrates the timeline, grading, and final renderer end to end.

My assessment is based on the engineering report provided here, rather than independent execution of the repository.

1. CG-01: Final technical assessment

There is no reason to discard or rebuild the grading engine. Its architecture is appropriate, and the reported results are encouraging:

Area

	

Reported evidence

	

Assessment




Grading-state validation

	

Invalid curves, non-finite values, and out-of-range parameters rejected

	

Accepted




3D LUT engine

	

17³, 33³, and 65³ grids; tetrahedral interpolation

	

Implementation accepted; full conformance evidence to retain




Professional controls

	

Exposure, white balance, LGGO, curves, and eight-channel HSL

	

Implementation accepted




WebGL preview

	

Reported under 2.5 ms for 1080p grading execution

	

Promising; complete-path P50/P95 evidence required




FFmpeg render parity

	

MAE 0.648 and 0.458 in two reported scenarios

	

Those scenarios pass the specified limits




Scene intelligence

	

Exposure, white balance, and skin-tone analysis implemented

	

Independent accuracy validation still required




Regression tests

	

55/55 passing

	

Reported PASS

The remaining sign-off work is narrow and evidence-focused.

Required CG-01 closeout: ensure docs/CG_01_RESULTS.md or its companion report contains actual numerical results for CPU-reference-versus-WebGL preview parity and CPU-reference-versus-FFmpeg parity over the grading operations in the approved fixture suite.

Include the eight-channel HSL boundaries, white-balance and exposure transforms, LUT domains and interpolation, blend intensities, composed grading graphs, and skin-protection behavior. The scene-intelligence section should also report error against known neutral-reference fixtures, rather than relying on one skin-tone angle measurement.

One implementation detail deserves particular attention: a consolidated RGB-to-RGB 3D LUT can approximate color-dependent transforms, but it cannot by itself encode arbitrary spatial skin masks or other image-context-dependent operations. If skin protection depends on a spatial matte, preserve that operation as a separate mask/blend stage or document a deliberate approximation and test its error.

This is a verification task, not a request to rewrite CG-01.

2. Phase 18: TL-01 — Interactive Manual Timeline

The architectural objective is to let a user take EME's generated edit and refine it directly, without leaving the canonical project model or introducing a second, inconsistent representation of the edit.

The timeline must become a first-class editing workspace with real operations, not a visual layer that merely displays clips.

A. Architecture

Interactive Timeline UI

Tracks, clips, playhead, selection, drag, trim, snap

Timeline Interaction Controller

Pointer and keyboard input; uncommitted edit previews

Validated Edit Transactions

Trim, split, ripple, slip, slide, move, reorder, undo/redo

Canonical EME Project State

Versioned revisions · integer ticks · atomic commits

Preview Engine

Seeking, composition, grading, audio playback

Render Jobs

Immutable project snapshot, deterministic export

The controller should never mutate the project directly during a drag. It creates a temporary candidate state, displays the candidate interaction, validates it on commit, and then submits one transaction to the canonical engine.

The UI's zoom, scroll position, playhead display, selected clips, active tool, and pending drag are transient view state. They must not be confused with committed edit state.

B. Timeline contract and timing invariants

EME's canonical project remains the source of truth.

Canonical timebase: 120,000 integer ticks per second.

For the CapCut microsecond adapter, use deterministic rational conversion:

𝑡
𝜇
𝑠
=
round
⁡
(
25
𝑡
ticks
3
)
t
μs
	​

=round(
3
25t
ticks
	​

	​

)
𝑡
ticks
=
round
⁡
(
3
𝑡
𝜇
𝑠
25
)
t
ticks
	​

=round(
25
3t
μs
	​

	​

)

Use integer arithmetic and one documented rounding rule. EME ticks remain canonical; externally imported microsecond timestamps are mapped to the nearest representable tick, with the quantization explicitly recorded. Preserve original external timestamps in adapter-owned metadata when faithful source reconstruction is required.

Every clip has distinct source and timeline ranges:

Source range: which portion of the original media is used.

Timeline range: where that portion appears in the edit.

Speed/time mapping: how timeline time maps to source time, where retiming is supported.

Use half-open intervals, [start, end). Durations are always positive, and overlapping clips are permitted only where track/compositing semantics allow them.

Do not change schema/eme-project.v1.schema.json to accommodate the timeline. Use existing project and transaction APIs where possible. If a required feature is not representable in v1, document the missing contract and propose a versioned extension or migration for review.

C. Editing operations and exact semantics

Operation

	

Required semantics




Trim in/out

	

Change the clip's visible range; never modify source media




Split at playhead

	

Create two adjacent segments with correct source/timeline mappings




Ripple trim

	

Apply the trim and required downstream shifts as one atomic transaction




Slip

	

Change the source range while preserving the clip's timeline placement and duration




Slide

	

Move the selected edit while preserving the intended relationship to neighboring edits




Move clip

	

Change placement or track through one validated transaction




Reorder tracks

	

Change track ordering without losing clip identity or compositing semantics




Magnetic snapping

	

Preview alignment against defined targets; persist only the committed edit position




Undo/redo

	

Restore the exact prior logical project state with a new monotonic revision




Audio scrubbing

	

Seek and preview audio at the requested timeline position without blocking the UI

Implement slip and slide only after trim and split have reliable source/time mapping. For variable-speed clips, the split point must be calculated through the actual time map—not by assuming source time advances linearly with timeline time.

D. Transaction and concurrency rules

Every committed operation must:

Include its expected project revision.

Validate preconditions, track constraints, source ranges, and resulting intervals.

Construct and validate a candidate state before committing.

Commit atomically, incrementing the revision.

Leave the previous state untouched if validation fails.

Provide a reversible history representation for undo/redo.

Use the existing engine's conflict handling for stale UI, CLI, and MCP operations. A stale operation must fail visibly rather than overwrite a newer project revision.

Undo and redo should restore the exact prior logical state even though the revision counter advances. Test the content independently of revision metadata.

3. TL-01 implementation sequence
18.0

Reconnaissance and state mapping

Inspect the existing project schema, editing operations, renderer, preview UI, media handling, and revision/undo implementation. Produce a field map from canonical project objects to timeline display objects. No new project schema fields until the current capabilities are documented.

18.1

Timeline foundation

Implement track rows, clip blocks, labels/thumbnails, time ruler, playhead, zoom, scrolling, selection, and snapping guides. The timeline must render from canonical project state while editing view preferences remain transient.

18.2

Atomic editing operations

Implement trim, split, move, track reorder, ripple trim, slip, and slide, in that dependency order. Add undo/redo, locked-track protections, invalid-range checks, and stale-revision tests.

18.3

Playback and precise scrubbing

Connect the playhead to the preview scheduler. Resolve timeline position to the correct source PTS for each clip. Add cached-frame seeking, decode prioritization, frame-step controls, and a visible distinction between a pending preview frame and a fresh one.

18.4

Audio and element-level control

Add waveform visualization, track mute/solo/lock, audio clip trim and move, fades where supported, synchronized preview, and element/property inspection. Keyframe and speed-curve editing should follow the capabilities actually supported by the canonical model.

18.5

Grading controls in context

Display and edit the established CG-01 grading state through the shared grading engine. Keep grade controls synchronized with canonical state; do not add a parallel slider-only state system.

18.6

Performance and correctness gate

Run randomized editing sequences, timebase tests, save/load tests, undo/redo tests, scrubbing benchmarks, multi-track stress fixtures, and regression tests. Publish a gate-by-gate report before declaring TL-01 complete.

4. TL-01 acceptance criteria

The performance target is not simply “the timeline looks smooth.” It must remain smooth while performing real edits.

Requirement

	

Initial acceptance target




Timeline interaction rendering

	

P95 at or below 16.67 ms per update with a 1,000-clip stress project on the documented target hardware




Selection, snapping, drag preview

	

No committed project mutation until a valid edit is released/committed




Transaction correctness

	

Zero partial commits across invalid edits and injected failures




Undo/redo

	

Logical project content restored exactly after arbitrary valid edit sequences




Timing conversion

	

Deterministic tick/microsecond round-trips and correct half-open intervals




Split/trim correctness

	

Source and timeline ranges remain valid with no accidental gap/overlap




Playback synchronization

	

Requested playhead frame resolves to the appropriate source PTS for each clip




Audio sync

	

Measured A/V offset reported; target no more than one output frame for supported test configurations




Concurrency

	

Stale writes are rejected; no lost updates across UI/CLI/MCP




Persistence

	

Load-save-load preserves canonical logical state




Regression

	

All existing certified tests and pilot artifacts remain intact

Measure scrubbing latency separately for cached and uncached frames. The timeline UI can hit 60 updates per second while an uncached video frame is still decoding; do not report one as proof of the other.

Likewise, test the UI with dense tracks and large projects. Virtualize off-screen clip rendering and thumbnail/waveform work where needed rather than recomputing the entire timeline on every pointer movement.

5. Copyable implementation authorization for Antigravity
Writing
TL-01 / Phase 18 — Interactive Manual Timeline

Architecture decision: AUTHORIZED TO BEGIN

Dependency: Existing EME canonical project model and transaction engine; CG-01 grading contract.

Use the required GSD actions to achieve the goals and wherever needed.

Mission

Build EME's interactive manual non-linear editing timeline for refining AI-generated edits. It must provide multitrack clip visibility, frame-accurate scrubbing, real editing operations, responsive preview, audio waveform display, and deterministic project-state mutation.

Step 1 — Preserve the baseline and inspect actual APIs

Record the Git revision, complete working-tree status, pre-existing staged and unstaged changes, and untracked paths.

Inspect the existing project schema, editing operation contracts, render engine, preview surface, media asset handling, job manager, revision/conflict handling, and undo/redo behavior.

Do not assume files or operations exist without inspecting them. Reuse existing contracts wherever possible.

Preserve the certified release and historical Live Pilot artifacts. Do not overwrite user changes or use destructive cleanup commands.

Step 2 — Establish timeline and timebase contracts

Implement a mapping from canonical project objects to timeline display objects. The display layer must not become a second source of truth.

Keep EME at 120,000 ticks per second. Convert imported CapCut-style microsecond values through deterministic rational arithmetic and a documented rounding policy.

Represent all clip timeline intervals as half-open [start, end) ranges with strictly positive durations. Distinguish source in/out from target timeline placement, and apply the actual source-time mapping for supported retiming.

Keep transient UI state—selection, playhead, scroll, zoom, pending drags and snap previews—separate from committed project state.

Do not modify eme-project.v1 schema semantics. If a required operation or effect is not represented by the current contract, document the gap and propose a versioned extension or migration rather than silently changing v1.

Step 3 — Implement the timeline interaction layer

Create a responsive multitrack timeline with:

Video, audio, text/overlay, and supported effect/grade tracks.

Track headers, clip blocks, thumbnails, waveform display, and time ruler.

Playhead, zoom, horizontal scroll, selection, and keyboard navigation.

Magnetic snapping to clip boundaries, the playhead, and supported markers.

Drag/drop with a visible candidate state and commit-time validation.

Clip detail and element/property inspection.

Use the existing UI technology and components where appropriate. Virtualize off-screen track/clip rendering and move expensive waveform, thumbnail, or decode work off the interactive event path.

Step 4 — Implement editing operations transactionally

Support trim, split at playhead, move, reorder, ripple trim, slip, and slide.

Each operation must use validated canonical project transactions and expected revisions.

Validate source ranges, timeline intervals, track constraints, speed/time mapping, and all resulting relationships before committing. A failed edit must leave the logical project unchanged.

Undo/redo must restore the exact prior logical project content and advance the revision in accordance with the existing revision policy.

Do not implement a visual drag that appears successful while the canonical project remains unchanged.

Step 5 — Connect playback and audio

Map the global timeline playhead to the correct source timestamp for all visible clips.

Use actual source PTS for variable-frame-rate content. Separate timeline display time from media decoding, and expose whether the displayed preview represents the current playhead request or a stale cached frame.

Implement audio clip placement, waveform caching, trim/move, mute/solo, supported fades, and synchronized audio preview. Key waveform caches by source asset identity/hash and the parameters affecting the cache.

Do not make the UI block on expensive audio analysis or frame decoding.

Step 6 — Integrate grading without duplicating state

Use the canonical CG-01 grading-state contract and existing preview/render transformations.

Editing a grading control must update the shared grade state and trigger the appropriate revision/preview update. Do not create independent slider state that can diverge from the saved grade.

Preserve the current project schema until an explicitly versioned integration migration is approved.

Step 7 — Automated verification

Add deterministic tests for:

Trim and split at beginning, middle, and end boundaries.

Ripple operations across multiple tracks.

Slip/slide semantics.

Locked tracks and invalid edit rejection.

Undo/redo sequences and injected commit failures.

Frame-rate and timebase conversion.

Variable-frame-rate source PTS.

Drag preview versus committed edit state.

Stale revision conflicts and concurrent edit attempts.

Audio waveform and source-timestamp alignment.

Project save/load logical equality.

Stress timelines containing at least 1,000 clips.

UI interaction timing, scrubbing response, and preview-frame freshness.

Test randomized valid operation sequences and compare the resulting state against invariants. Include failure paths, not only successful edits.

Step 8 — Deliverables and exit gate

Create:

docs/TL_01_BASELINE.md

docs/TL_01_STATE_AND_TIMEBASE_CONTRACT.md

docs/TL_01_RESULTS.md

docs/TL_01_EXIT_GATE.md

Use machine-readable test logs, timing measurements, operation traces, and reproducible artifacts.

Every gate must be PASS, FAIL, or BLOCKED, supported by actual execution evidence. Clearly report limits in the existing project schema and any required extension for Phase 19.

Do not mutate historical pilot evidence, publish a release, or claim complete CapCut compatibility. This milestone implements EME's own validated editing semantics.

Finish by recommending whether the canonical timeline operations, preview synchronization, persistence, and grading connection are ready for Phase 19 round-trip integration.

6. Phase 19 remains the integration gate

Phase 18 should establish stable editing semantics, but Phase 19 must prove the whole path is consistent:

Project state → timeline operation → saved state → preview → color grading → deterministic render → reload.

That includes atomic edits, correct clip timing, grade references, immutable render snapshots, and explicit import/export loss reporting. The CapCut adapter should remain isolated from EME's canonical model; reverse-engineered draft fields are observations, not an external contract we can assume will remain stable.

Final architecture decision

CG-01: The implementation is accepted. Complete the missing GPU-preview and full-operation parity evidence before closing its final exit gate.

TL-01 / Phase 18: Authorized to begin immediately, using the specifications above.

Build the timeline as a genuine editor backed by EME's canonical project state—not a replica of CapCut's undocumented internal format. The long-term success criterion is simple: the edit EME generates must remain fully editable, correctly timed, visually consistent in preview, and faithfully rendered when the user finishes.