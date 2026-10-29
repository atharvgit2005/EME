# Phase 13 Failure Taxonomy & Recovery Protocol

**Document:** `docs/phase-13-failure-taxonomy.md`  
**Date:** 2026-10-16  
**Status:** SPECIFICATION  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Plan Compilation Failure Taxonomy

| Error Code | Trigger Condition | Engine Behavior | Recovery Action |
|---|---|---|---|
| `ERR_PLAN_INVALID` | Malformed JSON, missing ID, empty operations | Rejection prior to mutation | Validate plan against `eme-editing-plan.v1.schema.json` |
| `ERR_ASSET_MISSING` | `sourceReferences` path does not exist on disk | Preflight rejection, revision unchanged | Download or re-link missing media file |
| `ERR_UNSUPPORTED_EFFECT` | Operation requests unverified visual effect | Strict fail-closed rejection | Replace with verified effect (`blur`, `brightness`, etc.) |
| `ERR_TIMING_COLLISION` | Overlapping clips on same track | Atomic operation rollback | Shift startTick or allocate distinct track |
| `ERR_PRECONDITION_FAILED` | Target clip or track ID does not exist | Zero mutation, returns error payload | Verify preceding steps created the track/clip |
| `ERR_DRY_RUN_FAILED` | Any operation in sequence returns success: false | Zero mutation to base project | Inspect step index and repair offending operation |

---

## 2. Closed-Loop QA Failure Classifications

| Defect Class | Detection Method | Severity | Automated Correction Strategy |
|---|---|---|---|
| `LAYOUT_CLIPPING` | Text bounding box extends beyond canvas margins (x < -50 or x > width+50) | HIGH | Center anchor (`anchorX: 0.5`, `x: width/2`), decrease `fontSize` by 30% |
| `MISSING_FONT_ASSET` | Text clip references undeclared fontAssetId | CRITICAL | Fallback to default sans-serif or declare system font |
| `AUDIO_STREAM_MISSING` | Audio clips present on timeline but output container lacks audio stream | HIGH | Verify audio codec compatibility and rerender with explicit stereo mix |
| `EXHAUSTED_NO_CORRECTIONS`| Unresolvable creative conflict or unknown defect | FATAL | Halt loop, preserve state, request human intervention |
