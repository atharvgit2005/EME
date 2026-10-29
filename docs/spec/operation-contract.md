# Editing Mechanics Engine — Operation Contract Specification

**Version**: `1.0.0`  
**Phase**: Phase 2 Deliverable  
**Audience**: Antigravity Agents, CLI Tools, Engine Runtime

---

## 1. Overview & Lifecycle

All modifications to an EME project are executed via **explicit, atomic, validated operations**. Edits are never performed through arbitrary in-place JSON mutations.

```
[Agent Intent] ──► [Typed Operation Request] ──► [Precondition Validation] 
                                                         │
                                             ┌───────────┴───────────┐
                                             ▼                       ▼
                                       [PASS: Mutate]          [FAIL: Reject]
                                             │                       │
                                    [Append to OpLog]        [Return Error Code]
                                    [Bump Revision]          [Zero Partial State]
```

---

## 2. Operation Catalog & MVP Status

| Operation | Description | Target Scope |
| :--- | :--- | :--- |
| `create_project` | Initialize canvas, frame rate, and tick timebase | **MVP (Phase 3)** |
| `add_asset` | Register media file (font, video, audio, overlay) | **MVP (Phase 3)** |
| `add_track` | Add a visual or audio track with explicit `zIndex` | **MVP (Phase 3)** |
| `insert_clip` | Place clip at `startTick` for `durationTicks` | **MVP (Phase 3)** |
| `trim_clip` | Adjust source trim in/out bounds | **MVP (Phase 3)** |
| `move_clip` | Reposition clip on timeline or move to another track | **MVP (Phase 3)** |
| `split_clip` | Slice a clip at exact tick into two contiguous clips | **MVP (Phase 3)** |
| `animate_property` | Attach keyframe interpolation track to a property | **MVP (Phase 3)** |
| `apply_effect` | Attach typed effect (blend mode, invert, contrast) | **MVP (Phase 3)** |
| `set_audio_envelope` | Define audio volume keyframes / ducking curves | **MVP (Phase 3)** |
| `delete_clip` | Remove clip by ID | **Phase 4** |
| `ripple_delete` | Remove clip and shift downstream clips left | **Phase 4** |
| `reorder_tracks` | Change track z-indices | **Phase 4** |
| `time_remap` | Non-linear speed curves | **Deferred (Phase 5+)** |

---

## 3. Detailed Operation Specifications

### 3.1 `create_project`
- **Parameters**:
  - `title`: string
  - `width`: integer (e.g. 1080)
  - `height`: integer (e.g. 1920)
  - `fps`: `{ numerator: integer, denominator: integer }`
  - `durationTicks`: integer
- **Preconditions**: `width > 0`, `height > 0`, `numerator > 0`, `durationTicks >= 0`.
- **Postconditions**: Project initialized with `revision: 0`, empty tracks, empty clips.

### 3.2 `insert_clip`
- **Parameters**:
  - `trackId`: string
  - `type`: `"video" | "text" | "graphic" | "audio"`
  - `startTick`: integer
  - `durationTicks`: integer
  - `source`: optional `{ assetId, trimInTick, trimOutTick }`
  - `typography`: optional typography object
  - `transform`: optional transform overrides
- **Preconditions**:
  - `trackId` must exist in `project.tracks`.
  - Track kind must match clip type (visual tracks accept `video`, `text`, `graphic`; audio tracks accept `audio`).
  - No collision: The half-open interval `[startTick, startTick + durationTicks)` must not overlap any existing clip on the same track.
  - If `source.assetId` is specified, asset must exist in `project.assets`.
- **Postconditions**: Clip inserted, `revision` incremented by 1.

### 3.3 `animate_property`
- **Parameters**:
  - `clipId`: string
  - `property`: string (e.g. `transform.y`, `transform.opacity`, `typography.fontSize`)
  - `keyframes`: array of `{ offsetTick: integer, value: any, easing: string }`
- **Preconditions**:
  - `clipId` must exist in `project.clips`.
  - All `offsetTick` values must be within `[0, clip.durationTicks]`.
  - Keyframes must be ordered monotonically by `offsetTick`.
- **Postconditions**: Animation track registered or updated for `clipId`.

### 3.4 `apply_effect`
- **Parameters**:
  - `clipId`: string
  - `effect`: `{ type: "blendMode" | "invert" | "contrast" | "blur" | "transition", parameters: object }`
- **Preconditions**:
  - `clipId` must exist.
  - `effect.type` must be an approved EME typed effect.
- **Postconditions**: Effect pushed to `clip.effects`.

---

## 4. Standard Error Codes

| Error Code | Meaning | Recovery / Agent Action |
| :--- | :--- | :--- |
| `ERR_CLIP_OVERLAP` | Target interval overlaps another clip on same track | Choose an empty track or adjust start/duration |
| `ERR_TRACK_NOT_FOUND` | Specified `trackId` does not exist | Add track first via `add_track` |
| `ERR_ASSET_NOT_FOUND` | Specified `assetId` not in project assets | Register asset first via `add_asset` |
| `ERR_INVALID_TICK` | Negative tick, or end tick exceeds composition bounds | Verify duration calculations |
| `ERR_UNSUPPORTED_EFFECT`| Effect not supported by current renderer | Inspect renderer capabilities before applying |
| `ERR_SCHEMA_VIOLATION` | Operation arguments violate type constraints | Re-validate payload against JSON Schema |
