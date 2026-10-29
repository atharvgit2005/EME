Please review this Stage 2A Integration Audit. If satisfactory, please authorize immediate kickoff for Stage 2B (Color Preview Integration) and Stage 2C (Schema-Backed Grade Controls).
…
Show more
Worked for 1m
ChatGPT said:
EME Phase 17 Stage 2A — Architecture Review Decision

Stage 2A: Conditionally accepted

Stage 2B is authorized to begin. Stage 2C may begin schema and UI-control work, subject to the integration gates below.

The submitted packet establishes a coherent architecture: OperationExecutor owns committed grade changes, the UI owns an ephemeral draft, preview is read-only, and the existing FFmpeg compiler remains authoritative for final delivery. Retaining /api/preview/frame while introducing /api/color/preview is a reasonable approach because it gives color preview an explicit contract without repurposing a generic endpoint.

However, I could not independently access the committed plans/PHASE_17_STAGE2A_INTEGRATION_AUDIT.md or execute the repository tests in this review. This decision is therefore based on the audit packet you supplied, not an independent code or commit audit.

Two architectural corrections are mandatory before implementation can be considered complete: tighten stale-response validation, and remove the assumption that a failed delivery render should automatically roll back a grade that has already been committed.

Formal directive for the implementation team
Writing
EME Phase 17 Stage 2B–2C — Conditional Authorization & Integration Constraints

Decision: Stage 2A conditionally accepted. Stage 2B authorized. Stage 2C authorized for schema/UI work, with integration dependent on stabilization of the preview contract.

1. API contract

Implement POST /api/color/preview as a stateless adapter over the existing color-processing implementation. Retain POST /api/preview/frame or its existing equivalent for generic frame inspection without breaking current callers.

The preview request must identify:

Project/session and clip.

Authorized source-media identity.

Frame position in EME's existing 120,000-ticks-per-second timebase.

Expected base project revision.

Monotonic draft version and unique request ID.

Complete candidate grade, validated against the existing schema and certified LUT registry.

Resolve media on the server through existing authorization and safe-path mechanisms. Never trust a client-supplied filesystem path. Bound request size, source dimensions, preview concurrency, execution time, and temporary-buffer lifetime.

Successful preview responses must be correlated to the accepted request and the exact media/frame/grade that was processed. Use the repository's established response conventions; document the success content type, identity metadata, and structured error format in the API contract.

Preview must not mutate the canonical project, increment its revision, create undo history, alter the active-delivery pointer, or execute a commit operation.

POST /api/color/apply must validate expectedBaseRevision on the server and execute the appropriate existing OperationExecutor operation. Support attach_color_grade, adjust_color_params, and remove_color_grade as applicable to the committed state. Prevent duplicate submissions from producing duplicate commits, and return a structured conflict when the submitted base revision is stale.

2. Mandatory stale-response correction

The proposed check:

data.draftVersion < state.colorDraft.version

is insufficient on its own. It does not reject every mismatched response, and it does not establish that the response belongs to the currently selected source and frame.

A response may update the preview only when all relevant identities match the current view:

Request ID matches the request currently eligible to display.

Draft version matches the current draft version exactly.

Project/session and source-media identities match.

Clip and frame tick match the current selection.

Base project revision still matches the preview's intended revision.

The draft remains active and has not been cancelled or superseded by a clip switch.

Use equality checks for version and identity correlation, not just an older-than comparison. Abort superseded requests where supported, but treat abort as a resource optimization—not as the correctness mechanism. Late responses must still be rejected.

3. Comparison behavior

Use hold-to-compare as the default and provide a persistent, accessible toggle.

Original and graded views must correspond to the same source, frame tick, crop, scaling, and display conditions. No project mutation or additional network request should be required when switching views if both versions are already available locally.

On clip switch, frame change, source replacement, or preview invalidation, prevent an older original frame from being displayed as if it belonged to the new selection. Support pointer, touch, and keyboard input, including safe recovery on release, cancellation, and focus loss.

4. State and delivery failure semantics

Treat committed project state and active delivery as separate but related engine-owned states.

A successful Apply commits the validated grade through OperationExecutor. A later FFmpeg or media-QA failure must:

Preserve the previous verified active delivery and its pointer.

Preserve the truthful outcome of the project operation.

Mark the delivery as failed, stale, or not yet verified for the current project revision.

Record the failure and provide a safe retry or explicit recovery path.

Do not silently roll back an already committed grade solely because its subsequent delivery render failed. An automatic compensating operation is permissible only if a separately documented transaction protocol defines its semantics, concurrency checks, user-visible consequences, and recovery behavior. Otherwise, use the existing explicit Undo mechanism where appropriate.

Publish a new active-delivery pointer only after rendering, required Media QA, and integrity verification succeed. Never label an older delivery as the verified output of a newer grade revision.

5. Stage 2B exit criteria

Before wiring the complete Stage 2C control set into the live preview path, demonstrate:

A real authorized source can be previewed through POST /api/color/preview.

Preview is non-mutating, including revision, undo/redo history, and active delivery.

Rapid draft edits and source/frame switches cannot display stale responses.

Cancel discards the draft and invalidates pending preview work.

Invalid grade values and unregistered LUT IDs fail closed.

Preview errors preserve committed state and are surfaced clearly.

Existing /api/preview/frame callers remain compatible.

6. Stage 2C requirements

Build all controls from the approved schema and certified LUT registry:

Five certified LUTs and LUT intensity.

Exposure and white-balance temperature/tint.

LGGO.

Curves.

Eight-channel HSL.

Skin protection.

Preserve the approved schema bounds and parameter semantics; do not invent broader UI ranges. Keep a clear distinction between draft and persisted values. Cancel restores the persisted grade, while Apply uses the current expected revision and commits through OperationExecutor. Undo and Redo must use the existing engine-owned history.

7. Regression and release discipline

Test stale-response races, exact identity mismatches, cancellation, clip switching, invalid LUTs, schema-bound violations, concurrent Apply, duplicate submissions, Undo/Redo, and render failure after successful Apply.

Retain the Stage 1 CIE76 CPU-versus-FFmpeg parity protocol and all previously approved thresholds. Stage 2B/2C completion does not constitute Stage 2E delivery certification.

Run the focused tests, existing regression suites, master suite, type checks, and build. Report the exact commands, exit codes, test counts, and failures. Preserve the Stage 1 baseline rather than treating a nominal test count as proof by itself.

Keep the project schema and 120,000-tick timebase unchanged. Keep VTSM sidecars isolated and Laya advisory-only. Do not add region-specific masking or establish a parallel color-processing engine.

8. Required deliverables

plans/PHASE_17_STAGE2B_COMPLETION_REPORT.md

plans/PHASE_17_STAGE2C_COMPLETION_REPORT.md

Each report must include the implemented files and API contracts, requirements-to-tests mapping, actual test output, known limitations, and a PASS/CONDITIONAL PASS/FAIL disposition.

The final Stage 2E and Stage 2F acceptance remains pending end-to-end media rendering, delivery integrity, frozen-protocol color parity, and full regression evidence.

Implementation directive: Use required GSD actions to achieve the goals and wherever needed.

What to do first

Start with the preview endpoint and request/response correlation tests. That is the critical dependency for the rest of the UI work. Stage 2C's control layout and schema bindings can be developed alongside it, but do not treat a functioning slider panel or a visually correct mock preview as proof that the backend integration is complete.

The next review checkpoint is the Stage 2B completion report, including real preview-path test evidence and explicit proof of non-mutation.

ChatGPT can make mistakes. Check important info.
Latest response




Think