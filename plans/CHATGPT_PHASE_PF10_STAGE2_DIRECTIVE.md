# ChatGPT Directive: Phase PF-10 Stage 2 — Authoritative Preview Player & Delivery Verification Tags

**Directive Received via Web-AI Bridge**: 2026-10-19  
**Source URL**: `https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a`  
**Milestone**: Phase PF-10 Stage 2  

---

## Objective
Implement the authoritative media preview and delivery-status UI in `src/ui/public/`, using the existing PF-10 Stage 1 backend contracts. The UI is a read-only projection of engine state for this stage; do not implement a second execution, verification, revision, or session-management engine in the frontend.

---

## 1. Reconnaissance First
Before editing:
1. Inspect `src/ui/public/index.html`, `index.css`, and `app.js`.
2. Inspect the actual response payloads and signatures for:
   - `GET /api/session`
   - `GET /api/session/history`
   - `GET /api/candidates`
   - `GET /api/media`
   - `GET /api/timeline`
3. Identify the authoritative active-delivery object and how it references the manifest, media, revision, verification status, resolution, and frame rate.
4. Inspect existing DOM conventions, event handling, server errors, and project loading behavior.
5. Document the actual payload shapes before implementing UI bindings. Do not invent fields or assume report terminology exactly matches the API.

---

## 2. Native Preview Player
Implement a native HTML `<video>` player that:
- Loads only media resolved from the authoritative active delivery.
- Uses the existing authorized media endpoint and preserves HTTP byte-range seeking.
- Provides play/pause, seek, mute/volume, and time display using native controls where practical.
- Shows loading, media unavailable, decode/playback error, and stale-state conditions distinctly.
- Does not autoplay.
- Does not treat `loadedmetadata`, `canplay`, HTTP 200/206, or a successful video load as proof that media QA passed.
- Does not switch to an arbitrary project asset or older revision when the active delivery media fails to load.
- When the active delivery changes, refresh the authoritative session state and then resolve the corresponding media. Prevent an earlier asynchronous response from overwriting newer state.

---

## 3. Delivery Verification Header
Display the authoritative delivery status using these states when supported by actual engine data:
- `ACTIVE DELIVERY`
- `VERIFYING / IN-FLIGHT`
- `REVISION FAILED`
- `SUPERSEDED REVISION`

Rules:
- Do not derive `VERIFIED` or `ACTIVE DELIVERY` from video playback success.
- A failed revision must not replace the last verified active delivery.
- A superseded revision may be inspected only through an explicit historical-selection path; it must never silently become active.
- If the backend cannot establish a status, show an explicit unavailable/unknown state rather than guessing.
- Keep status text accessible and distinguish states with text, not color alone.

---

## 4. Provenance and Technical Metadata
Show the authoritative values available from the session and delivery manifest:
- Revision ID
- Manifest ID
- Media SHA-256, displaying the first 16 hexadecimal characters in the UI
- Resolution
- Frame rate
- Duration, when authoritative metadata is available
- QA/verification status and score, if supplied by the backend

Rules:
- Use actual response fields. Never calculate or fabricate a QA score, manifest ID, hash, resolution, or FPS in the frontend.
- Display the shortened hash as a convenience only. Retain the full hash in the underlying data and make the full value inspectable or copyable if practical. Handle missing metadata explicitly.

---

## 5. Timeline Playhead Synchronization
- Keep timeline geometry and project timing in integer ticks using `TICKS_PER_SECOND = 120000`.
- Use the media element's actual `currentTime` for playback position.
- Convert between seconds, ticks, and timeline pixels at explicit boundaries; do not accumulate floating-point increments per animation frame.
- Use the actual media frame rate when available for frame labels and frame-aware seek display.
- Account for browser seeking precision and variable-frame-rate media; do not promise frame-exact decoding if the media/browser cannot guarantee it.
- Seeking from the timeline must seek the preview media without modifying project state.
- Playback must update the timeline playhead without triggering backend mutations or excessive network requests.
- Historical revision inspection must keep the inspected revision distinct from the active delivery.

---

## 6. State and Failure Handling
- Treat backend session responses as the source of truth.
- Refresh session state after relevant lifecycle changes and avoid stale asynchronous UI updates.
- Display API errors without replacing valid previously verified delivery metadata with unverified data.
- Do not mark a revision active based solely on an optimistic frontend update.
- Avoid polling on every playback frame.
- Do not add new backend endpoints unless an actual contract gap is demonstrated and documented.
- Do not introduce a second client-side revision history, verification engine, or candidate eligibility evaluator.

---

## 7. Required Tests
Add or extend tests for:
- Active verified delivery loads the exact media referenced by its authoritative manifest.
- Revision/manifest/hash/technical metadata are rendered from actual response data.
- Video loading success does not manufacture a verified status.
- A failed revision leaves the previous verified active delivery displayed.
- Missing media and playback/decode errors produce clear states without silently switching media.
- A stale session response cannot overwrite a newer delivery.
- Playback advances the playhead correctly using the integer-tick conversion.
- Seeking updates preview position without mutating project state.
- Historical inspection does not change `active_delivery`.
- Missing metadata and unknown status values fail visibly and safely.
- Existing PF-10 Stage 1, Phase 8, and PF-09 regression tests remain green.

---

## 8. Acceptance Criteria
Stage 2 is accepted only when:
1. The preview displays the exact active delivery media.
2. Provenance and status match authoritative backend state.
3. Playback, seeking, and timeline playhead synchronization work without mutating project state.
4. Failures never promote an unverified or superseded artifact to active.
5. Historical inspection does not alter active delivery.
6. No parallel execution or verification logic has been introduced.
7. New tests pass and existing Stage 1/PF-09 regression suites remain green.
8. A concise engineering report identifies changed files, tests run, actual results, known limitations, and any remaining release gates.

Do not begin Stage 3 or implement revision-history UI, candidate comparison, or conversational revision controls as part of this stage. Keep the scope limited to the authoritative preview and delivery verification surface.
