# EME Phase 18: Stage 18.2 Acceptance Addendum

**Milestone**: TL-01 / Phase 18  
**Document**: `plans/PHASE_18_STAGE2_ACCEPTANCE_ADDENDUM.md`  
**Date**: October 20, 2026  
**Status**: SUBMITTED FOR ARCHITECTURAL RECORD  
**Architecture Owner**: ChatGPT Architecture Lead  
**References**: `plans/CHATGPT_STAGE18_2_COMPLETION_REVIEW.md`, `plans/PHASE_18_STAGE2_COMPLETION_REPORT.md`  

---

## 1. Executive Summary

This addendum resolves the two clarification items stipulated in the **ChatGPT Stage 18.2 Decision** (`plans/CHATGPT_STAGE18_2_COMPLETION_REVIEW.md`), ensuring that Stage 18.2 is unconditionally satisfied and recorded in the architectural history.

Specifically, this document:
1. Confirms the explicit user-facing controls and authoritative engine dispatch for `insert_clip` and `reorder_tracks`.
2. Qualifies the Undo/Redo state restoration guarantee, explicitly distinguishing canonical content equality from monotonic revision and history progression.

---

## 2. Item 1: UI Control Integration for `insert_clip` and `reorder_tracks`

### 2.1 Clip Insertion (`insert_clip`)
- **User-Facing Surface**: Media Assets Panel (`#tab-assets` / `#assets-list` in `src/ui/public/index.html`).
- **Interactive Control**: Each asset in the project library renders an explicit **`+ Add`** action button (`insertAssetToTimeline(assetId)`).
- **Control Behavior**:
  1. Identifies the active asset from `state.project.assets`.
  2. Resolves an unlocked, compatible destination track (mapping visual assets to visual tracks and audio assets to audio tracks). If no compatible unlocked track exists, surfaces an explicit warning toast (`No unlocked compatible track available for this asset`).
  3. Computes a collision-free insertion interval: defaults to the current playhead tick (`state.currentTick`), or seamlessly appends after the track's latest clip if an overlap exists.
  4. Dispatches the canonical `insert_clip` operation envelope:
     ```javascript
     await dispatchOperation({
       type: 'insert_clip',
       params: {
         id: `clip_${Date.now()}`,
         trackId: targetTrack.id,
         type: asset.type === 'audio' ? 'audio' : 'video',
         startTick,
         durationTicks,
         source: { assetId: asset.id, trimInTick: 0, trimOutTick: durationTicks }
       }
     });
     ```
- **Verification**: Verified in `tests/timeline-stage18-2-operations.test.js` (Test: `insert_clip: successfully inserts clip and rejects collision, duplicate ID, and locked track`).

### 2.2 Track Reordering (`reorder_tracks`)
- **User-Facing Surface**: Tracks Stack Panel (`#tab-tracks` / `#tracks-list` in `src/ui/public/index.html`).
- **Interactive Control**: Each track renders bidirectional **`▲` (Move Up / Increase zIndex)** and **`▼` (Move Down / Decrease zIndex)** buttons.
- **Control Behavior**:
  1. Gathers active tracks and determines adjacent target `zIndex` based on current visual stacking order.
  2. Dispatches the canonical `reorder_tracks` operation envelope:
     ```javascript
     await dispatchOperation({
       type: 'reorder_tracks',
       params: {
         trackOrders: [
           { trackId: curr.id, zIndex: newCurrentZ },
           { trackId: neighbor.id, zIndex: newNeighborZ }
         ]
       }
     });
     ```
  3. Reconciles visual order authoritatively from the engine response.
- **Verification**: Verified in `tests/timeline-stage18-2-operations.test.js` (Test: `reorder_tracks and set_track_state: updates zIndex and flags`).

---

## 3. Item 2: Precise Undo / Redo Equality Specification

The Stage 18.2 Completion Report previously used the phrase "bit-exact" restoration. Per the ChatGPT Architecture Lead's directive, we state the precise architectural contract for Undo and Redo:

### 3.1 Canonical Content Equality
When an operation is undone via `POST /api/project/undo` or reapplied via `POST /api/project/redo`:
- **Clips**: Every clip definition (`id`, `trackId`, `type`, `startTick`, `durationTicks`, `source.assetId`, `source.trimInTick`, `source.trimOutTick`, `transform`, `typography`, `effects`, `audio`) is restored to the exact state matching the prior snapshot.
- **Tracks**: Every track definition (`id`, `name`, `kind`, `zIndex`, `muted`, `locked`, `visible`) is restored exactly.
- **Assets**: Assets, canvas configurations, and timebase intervals are restored identically.
- **Animations**: Keyframe tracks and animation curves are restored identically.

### 3.2 Monotonic Metadata Progression
Unlike a simple memory rewind, the engine enforces **monotonic revision progression** and **history branch isolation**:
- The project `revision` field is **not** reset to its prior integer value. Instead, applying an Undo increments the monotonic revision ($N \to N+1$), and Redo increments it again ($N+1 \to N+2$).
- This prevents distributed clients or background pollers from mistakenly treating an undone project as stale or ignoring updates due to caching.
- Undo/Redo stack lengths and capabilities (`canUndo`, `canRedo`) update authoritatively:
  - Performing an Undo pushes the undone state onto `redoStack` and pops `undoStack`.
  - Performing a new mutation while `redoStack.length > 0` truncates the redo history branch (`this.redoStack = []`).

### 3.3 Test Assertion Proof
In `tests/timeline-stage18-2-operations.test.js`:
```javascript
// Canonical content restored exactly
assert.strictEqual(restoredClip.startTick, preEditSnapshot.clips[0].startTick);
assert.strictEqual(restoredClip.durationTicks, preEditSnapshot.clips[0].durationTicks);
assert.strictEqual(restoredClip.source.trimInTick, preEditSnapshot.clips[0].source.trimInTick);

// Revision advances monotonically
assert.ok(undoData.project.revision > postEditSnapshot.revision, 'Monotonic revision advanced on undo');
assert.ok(redoData.project.revision > undoData.project.revision, 'Monotonic revision advanced on redo');
```

---

## 4. Final Stage 18.2 Acceptance Status

With the explicit UI integration of `insert_clip` and `reorder_tracks` and the precise qualification of canonical content vs. revision progression documented and verified:

| Requirement Item | Acceptance Status |
| :--- | :---: |
| Basic editing operations (`insert_clip`, `move_clip`, `trim_clip`, `split_clip`, `delete_clip`) | **UNCONDITIONALLY ACCEPTED** |
| Compound editorial operations (`ripple_delete`, `ripple_trim`, `slip_clip`, `slide_clip`) | **UNCONDITIONALLY ACCEPTED** |
| Track state management (`set_track_state`, `reorder_tracks`) | **UNCONDITIONALLY ACCEPTED** |
| Unified Atomic Trim-In (single envelope, 1 revision) | **UNCONDITIONALLY ACCEPTED** |
| Engine boundary lock enforcement (`_assertTrackNotLocked`) | **UNCONDITIONALLY ACCEPTED** |
| Optimistic concurrency fail-closed 409 rejection | **UNCONDITIONALLY ACCEPTED** |
| Canonical content restoration & monotonic Undo/Redo | **UNCONDITIONALLY ACCEPTED** |
| Test suite (35/35 timeline, 425/425 master regression) | **UNCONDITIONALLY ACCEPTED** |
