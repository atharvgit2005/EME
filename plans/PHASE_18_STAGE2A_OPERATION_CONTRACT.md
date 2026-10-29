# EME Phase 18: Stage 18.2A Operation Contract Audit & Atomic Edit Specification

**Milestone**: TL-01 / Phase 18  
**Document**: `plans/PHASE_18_STAGE2A_OPERATION_CONTRACT.md`  
**Date**: October 20, 2026  
**Status**: APPROVED DESIGN CONTRACT FOR STAGE 18.2 IMPLEMENTATION  
**Architecture Owner**: ChatGPT Architecture Lead  
**Engine Reference**: `src/engine/operations.js`, `src/ui/server.js`, `src/ui/public/app.js`  

---

## 1. Executive Summary & Design Scope

In compliance with the **ChatGPT Architecture Lead Stage 18.2 Directive** (`plans/CHATGPT_STAGE18_1_COMPLETION_REVIEW.md`), this document establishes the formal operation contract for connecting the Stage 18.1 transient Visual Control Surface to the deterministic `OperationExecutor` engine.

### Core Architectural Invariants:
1. **Single-Transaction Commitment**: Every completed user gesture (drag release, cut click, handle trim, tool action) must dispatch exactly **one** canonical engine operation in **one** transaction envelope.
2. **Authoritative Concurrency Locking**: Every mutating request carries `expectedBaseRevision: state.project.revision`. Stale revisions fail closed with HTTP 409 (`STALE_REVISION`).
3. **Engine-Owned Monotonic History**: Undo and Redo are owned authoritatively by the engine session. Every successful edit increments revision monotonically ($N \to N+1$).
4. **Zero Client-Side Simulation**: UI state never mutates `state.project` directly. All DOM projections reconcile exclusively from validated engine responses.
5. **No Schema Alterations**: `schema/eme-project.v1.schema.json` remains pristine and unmodified.

---

## 2. Operation Contract Audit Matrix

| Operation Type | Exact Function Symbol | Parameters & Schema | Preconditions & Validation | Postconditions & State Mutation | Affected IDs | Reversibility & Undo Semantics |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`insert_clip`** | `_opInsertClip` | `id: string`<br>`trackId: string`<br>`type: string`<br>`startTick?: int`<br>`durationTicks?: int`<br>`source?: object`<br>`transform?: object` | • Track exists & unlocked<br>• No ID collision<br>• Track kind matches clip type (`visual` vs `audio`)<br>• `durationTicks > 0`<br>• No interval collision on track | Clip appended to `project.clips`<br>`_updateProjectDuration` recalculated | `[id]` | Undo: `delete_clip { clipId: id }` (or snapshot rollback) |
| **`move_clip`** | `_opMoveClip` | `clipId: string`<br>`targetTick: int`<br>`targetTrackId?: string` | • Source & target tracks exist & unlocked<br>• Clip exists<br>• Target track kind matches clip type<br>• `targetTick >= 0`<br>• No collision on destination track | `clip.startTick = targetTick`<br>`clip.trackId = targetTrackId`<br>`_updateProjectDuration` recalculated | `[clipId]` | Undo: `move_clip` back to `origStartTick`, `origTrackId` |
| **`trim_clip`**<br>*(Unified Atomic)* | `_opTrimClip` | `clipId: string`<br>`newStartTick?: int`<br>`newDurationTicks?: int`<br>`trimInTick?: int`<br>`trimOutTick?: int` | • Track exists & unlocked<br>• Clip exists<br>• `newDurationTicks > 0`<br>• `newStartTick >= 0`<br>• If trim range: `trimInTick >= 0`, `trimOutTick > trimInTick`<br>• No track collision on modified interval | `clip.startTick = newStartTick` (if provided)<br>`clip.durationTicks = newDurationTicks`<br>`clip.source` trim boundaries updated<br>`_updateProjectDuration` recalculated | `[clipId]` | Undo: Revert `startTick`, `durationTicks`, `source.trimInTick`, `source.trimOutTick` |
| **`split_clip`** | `_opSplitClip` | `clipId: string`<br>`splitTick: int`<br>`newClipId?: string` | • Track exists & unlocked<br>• Clip exists<br>• `splitTick` strictly interior: `startTick < splitTick < startTick + durationTicks`<br>• `newClipId` unique | First clip truncated at `splitTick`<br>Second clip inserted at `splitTick` with duration `end - splitTick`<br>Source trims partitioned proportionally | `[clipId, newClipId]` | Undo: Delete `newClipId`, restore first clip duration and source trim |
| **`delete_clip`** | `_opDeleteClip` | `clipId: string` | • Track exists & unlocked<br>• Clip exists | Clip spliced from `project.clips`<br>Matching animations removed | `[clipId]` | Undo: Re-insert clip and animations at prior index |
| **`reorder_tracks`**| `_opReorderTracks`| `trackOrders: Array<{ trackId, zIndex }>` | • `trackOrders` non-empty<br>• All tracks exist<br>• `zIndex` integers | All specified tracks updated with new `zIndex` | `[...trackIds]` | Undo: Restore previous `zIndex` mapping |
| **`ripple_delete`** | `_opRippleDelete` | `clipId: string` | • Track exists & unlocked<br>• Clip exists | Clip removed<br>All subsequent clips on track (`startTick >= clipEnd`) shifted left by `durationTicks`<br>Project duration updated | `[clipId, ...shiftedIds]` | Undo: Re-insert clip, shift subsequent clips right by `durationTicks` |
| **`ripple_trim`** | `_opRippleTrim` | `clipId: string`<br>`edge: 'in'\|'out'\|'start'\|'end'`<br>`deltaTicks: int`<br>`rippleShiftDownstream?: bool` | • Track exists & unlocked<br>• Clip exists<br>• Resulting `durationTicks > 0` | If `edge === 'end'`: clip duration += delta; subsequent clips shifted by delta<br>If `edge === 'start'`: clip start += delta; duration -= delta; source in += delta; optional ripple shift | `[clipId, ...shiftedIds]` | Undo: Inverted delta or engine snapshot rollback |
| **`slip_clip`** | `_opSlipClip` | `clipId: string`<br>`deltaTicks: int` | • Track exists & unlocked<br>• Clip exists<br>• `newIn = curIn + deltaTicks >= 0`<br>• If asset duration defined: `newOut <= asset.durationTicks` | `clip.source.trimInTick = newIn`<br>`clip.source.trimOutTick = newOut`<br>Timeline position and duration **100% preserved** | `[clipId]` | Undo: `slip_clip { deltaTicks: -deltaTicks }` |
| **`slide_clip`** | `_opSlideClip` | `clipId: string`<br>`deltaTicks: int` | • Track exists & unlocked<br>• Clip exists<br>• Preceding clip must exist if sliding left (`deltaTicks < 0`)<br>• Succeeding clip must exist if sliding right (`deltaTicks > 0`)<br>• Adjacent clip durations remain > 0 | Clip moves by `deltaTicks`<br>Preceding clip duration adjusts by `deltaTicks`<br>Succeeding clip start and duration adjust symmetrically | `[clipId, prevId, nextId]` | Undo: Symmetrical slide or engine snapshot rollback |
| **`set_track_state`**| `_opSetTrackState`| `trackId: string`<br>`muted?: bool`<br>`locked?: bool`<br>`visible?: bool` | • Track exists | Sets track flags `muted`, `locked`, `visible` | `[trackId]` | Undo: Revert track flags |

---

## 3. The Unified Atomic Trim-In Solution

### 3.1 Problem Diagnosis
In the existing codebase, non-ripple trimming of the Left / In-handle required two separate concepts:
- Advancing the timeline start position of the clip (`startTick' = startTick + deltaTicks`).
- Shortening the duration (`durationTicks' = durationTicks - deltaTicks`).
- Advancing the source media offset (`source.trimInTick' = source.trimInTick + deltaTicks`).

Because `_opTrimClip` previously only accepted `newDurationTicks` and `trimInTick`, advancing `startTick` was missing from `trim_clip`. Attempting to execute `move_clip` followed by `trim_clip` in the frontend introduced two separate HTTP requests, two project revisions ($N \to N+1 \to N+2$), race conditions, intermediate collision errors, and broke single-step Undo.

### 3.2 Canonical Contract Extension for `_opTrimClip`
We extend `_opTrimClip` in `src/engine/operations.js` with zero breaking changes:
```javascript
static _opTrimClip(candidate, params = {}) {
  const { clipId, trimInTick, trimOutTick } = params;
  if (!clipId) {
    const err = new Error('trim_clip requires clipId');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  const clip = (candidate.clips || []).find(c => c.id === clipId);
  if (!clip) {
    const err = new Error(`Clip "${clipId}" not found`);
    err.code = 'CLIP_NOT_FOUND';
    throw err;
  }
  this._assertTrackNotLocked(candidate, clip.trackId);

  const newStartTick = params.newStartTick !== undefined ? params.newStartTick : params.startTick;
  const newDurationTicks = params.newDurationTicks !== undefined ? params.newDurationTicks : params.durationTicks;

  if (newDurationTicks !== undefined && newDurationTicks <= 0) {
    const err = new Error(`newDurationTicks must be > 0. Got: ${newDurationTicks}`);
    err.code = 'INVALID_DURATION';
    throw err;
  }
  if (newStartTick !== undefined && newStartTick < 0) {
    const err = new Error(`newStartTick must be >= 0. Got: ${newStartTick}`);
    err.code = 'INVALID_START_TICK';
    throw err;
  }

  const targetStart = newStartTick !== undefined ? newStartTick : clip.startTick;
  const targetDuration = newDurationTicks !== undefined ? newDurationTicks : clip.durationTicks;

  // Collision check against other clips on the same track
  if (newStartTick !== undefined || newDurationTicks !== undefined) {
    for (const c of candidate.clips || []) {
      if (c.id !== clipId && c.trackId === clip.trackId) {
        if (MediaTime.intervalsOverlap(targetStart, targetDuration, c.startTick, c.durationTicks)) {
          const err = new Error(`Track collision: clip "${clipId}" trimmed to [${targetStart}, ${targetStart + targetDuration}) overlaps with clip "${c.id}"`);
          err.code = 'TRACK_COLLISION';
          throw err;
        }
      }
    }
    clip.startTick = targetStart;
    clip.durationTicks = targetDuration;
  }

  if (trimInTick !== undefined || trimOutTick !== undefined) {
    clip.source = clip.source || {};
    const nextIn = trimInTick !== undefined ? trimInTick : (clip.source.trimInTick || 0);
    const nextOut = trimOutTick !== undefined ? trimOutTick : (clip.source.trimOutTick !== undefined ? clip.source.trimOutTick : clip.durationTicks);

    if (nextIn < 0 || (nextOut !== undefined && nextOut <= nextIn)) {
      const err = new Error(`Invalid trim range: [${nextIn}, ${nextOut}). trimOutTick must be > trimInTick and trimInTick >= 0.`);
      err.code = 'INVALID_TRIM_RANGE';
      throw err;
    }

    if (trimInTick !== undefined) clip.source.trimInTick = trimInTick;
    if (trimOutTick !== undefined) clip.source.trimOutTick = trimOutTick;
  }

  this._updateProjectDuration(candidate);
  return { affectedIds: [clipId] };
}
```

### 3.3 Atomic Non-Ripple Trim Execution
- **Trim In (Left Edge)**:
  $$\Delta = \text{dragDeltaTicks}$$
  $$\text{newStartTick} = \text{origStartTick} + \Delta$$
  $$\text{newDurationTicks} = \text{origDurationTicks} - \Delta$$
  $$\text{trimInTick} = (\text{origTrimIn} || 0) + \Delta$$
  Dispatched in **1** `trim_clip` operation envelope.
- **Trim Out (Right Edge)**:
  $$\Delta = \text{dragDeltaTicks}$$
  $$\text{newDurationTicks} = \text{origDurationTicks} + \Delta$$
  $$\text{trimOutTick} = (\text{origTrimOut} || \text{origDurationTicks}) + \Delta$$
  Dispatched in **1** `trim_clip` operation envelope.

---

## 4. UI Gesture-to-Operation Lifecycle Contract

### 4.1 Gesture Lifecycle States

```
[PointerDown on Handle / Block / Ruler]
               │
               ▼
[Transient Drag / Scrub / Preview State]
(CSS proposals, guides, SMPTE update, 0 revisions)
               │
   ┌───────────┴───────────┐
   ▼                       ▼
[Cancel Trigger]     [PointerUp Commit]
(Escape/blur/cancel)       │
   │                       ▼
[State Reset]       [Validate against Expected Revision]
(0 mutations)              │
               ┌───────────┴───────────┐
               ▼                       ▼
         [Rejection]             [Engine Commit]
     (400/409 notification,   (OperationExecutor commit,
      proposal cleared,        revision increment,
      state resynchronized)    undoStack push,
                               reconcile UI projection)
```

### 4.2 Detailed Gesture Mappings

| UI Interaction | Gesture Event | Proposed Operation Envelope | Concurrency Locking | Rejection Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Move Clip** | Drag body of clip block & release | `{ type: 'move_clip', params: { clipId, targetTick } }` | `expectedBaseRevision` matching drag start | Reset CSS transform ghost, notify error, re-render timeline |
| **Trim In Handle** | Drag left handle & release | `{ type: 'trim_clip', params: { clipId, newStartTick, newDurationTicks, trimInTick } }` | `expectedBaseRevision` matching drag start | Reset handle width, notify collision/bounds error |
| **Trim Out Handle** | Drag right handle & release | `{ type: 'trim_clip', params: { clipId, newDurationTicks, trimOutTick } }` | `expectedBaseRevision` matching drag start | Reset handle width, notify collision/bounds error |
| **Ripple Trim** | Drag handle with Ripple Tool active & release | `{ type: 'ripple_trim', params: { clipId, edge, deltaTicks } }` | `expectedBaseRevision` matching drag start | Reset ghost, notify bounds error |
| **Razor Blade Cut**| Click clip with Blade Tool active | `{ type: 'split_clip', params: { clipId, splitTick: playheadTick } }` | `expectedBaseRevision` matching click | Notify bounds error if cut on boundary |
| **Slip Tool** | Drag clip body with Slip Tool active & release | `{ type: 'slip_clip', params: { clipId, deltaTicks } }` | `expectedBaseRevision` matching drag start | Reset ghost, notify source limit error |
| **Slide Tool** | Drag clip body with Slide Tool active & release | `{ type: 'slide_clip', params: { clipId, deltaTicks } }` | `expectedBaseRevision` matching drag start | Reset ghost, notify neighbor boundary error |
| **Delete / Backspace**| Press Delete / Backspace or click Delete button | `{ type: 'delete_clip', params: { clipId: selectedClipId } }` (or `ripple_delete` if ripple active) | `expectedBaseRevision` matching keydown | Notify if locked track |
| **Track Lock / Mute / Hide** | Click Lock / Mute / Eye icon in track header | `{ type: 'set_track_state', params: { trackId, locked, muted, visible } }` | `expectedBaseRevision` matching click | Revert icon state on conflict |

---

## 5. Track Lock Enforcement & Failure Isolation

1. **Pre-Gesture Prevention in UI**:
   - If `track.locked === true`, UI ignores drag initialization, pointer styling changes to `not-allowed`, and blade clicks are rejected immediately with warning toast: `Cannot edit clip on locked track "${track.id}"`.
2. **Authoritative Engine Boundary Enforcement**:
   - `_assertTrackNotLocked` runs inside every mutating operation handler (`insert_clip`, `move_clip`, `trim_clip`, `split_clip`, `delete_clip`, `ripple_delete`, `ripple_trim`, `slip_clip`, `slide_clip`).
   - If an operation targets a locked track (even through bypass of client UI), engine throws `TRACK_LOCKED` and aborts transaction prior to mutation.
3. **Optimistic Concurrency & Monotonic Revision**:
   - If project revision changed concurrently ($R_{\text{actual}} \neq R_{\text{expected}}$), engine returns HTTP 409 (`STALE_REVISION`).
   - UI catches 409, resets drag ghosts, notifications surfaces: `Project has been modified concurrently. Reloading latest timeline.`, and fetches authoritative `/api/timeline`.

---

## 6. History Architecture (Undo / Redo Verification)

1. **Monotonic Revision Guarantee**:
   - In `src/ui/server.js`, `POST /api/project/operation` pushes pre-edit state to `this.undoStack`, clears `this.redoStack`, and increments `project.revision`.
   - `POST /api/project/undo` pops previous state, pushes current state to `this.redoStack`, and assigns monotonic increment:
     `prev.revision = this.currentProject.revision + 1`.
   - `POST /api/project/redo` pops next state, pushes current state to `this.undoStack`, and assigns monotonic increment:
     `next.revision = this.currentProject.revision + 1`.
2. **Compound Operation Exact Reversibility**:
   - Because engine undo/redo operates on canonical deep-cloned state snapshots, every compound operation (`ripple_delete`, `ripple_trim`, `slide_clip`, `slip_clip`) restores the exact microsecond intervals, track order, and metadata of all affected clips without algebraic inverse approximation errors.
3. **CanUndo / CanRedo Signaling**:
   - Responses from operations, undo, and redo return `{ canUndo: boolean, canRedo: boolean }`, automatically enabling/disabling toolbar buttons.

---

## 7. Stage 18.2A Exit Gate Verification Checklist

- [x] All 11 operations audited with parameter schemas, preconditions, postconditions, and affected IDs.
- [x] Trim-in architectural defect resolved with atomic `newStartTick` extension to `_opTrimClip`.
- [x] Interaction-to-operation gesture mappings defined with 1:1 transaction ratio.
- [x] Rejection and cancellation guarantees specified (zero partial mutation, UI ghost clearance).
- [x] Monotonic revision and snapshot-backed Undo/Redo verified.
- [x] Unmodified project schema invariant maintained.

This specification is ready for immediate implementation in **Stage 18.2B, 18.2C, 18.2D, and 18.2E**.
