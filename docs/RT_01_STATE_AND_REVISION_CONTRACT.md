# Milestone RT-01 State, Revision & Persistence Contract

## 1. Canonical State & Monotonic Revision Model

1. **State Single Source of Truth**:
   - `schema/eme-project.v1.schema.json` is the sole canonical state representation.
   - Any manual edit (split, trim, ripple, slip, slide, reorder, mute/lock, color grade) produces a new canonical candidate project validated against the schema.
2. **Monotonic Revision Sequence**:
   - Given project state $P_k$ at revision $k \in \mathbb{N}_0$, any valid atomic operation $O$ transitions state to $P_{k+1}$ with revision strictly $k+1$.
   - Concurrency conflicts are prevented via `expectedBaseRevision`: if $O.\text{expectedBaseRevision} \ne k$, the operation fails with `STALE_REVISION` ($409$).
3. **Undo/Redo State Invariance**:
   - Undo/redo preserves complete logical project integrity including all attached color grades, clip trims, track assignments, and transforms.
   - When an undo is executed, the previous state is restored and assigned a new monotonic revision (or maintains state index) so clients observe a strictly advancing revision history.

---

## 2. Immutable Render Job Snapshotting

A fundamental invariant of RT-01 is that render jobs operate on **immutable snapshots**:
$$\text{Snapshot}(P_k) = \operatorname{structuredClone}(P_k)$$

- When a render is requested via `/api/render`, the backend immediately creates an isolated, frozen deep copy `projectSnapshot` of the project at that exact revision $k$.
- The HyperFrames compilation and FFmpeg rendering consume `projectSnapshot`.
- Subsequent user interactions in the UI (e.g. trimming a clip or muting a track, advancing the project to revision $k+1$, $k+2$) do not mutate or taint the running render job at revision $k$.

---

## 3. Persistence Equality Contract

A saved project must satisfy bit-for-bit logical equivalence upon reloading:
$$\operatorname{Load}(\operatorname{Save}(P)) \equiv P$$

Specifically:
- All clip `id`, `trackId`, `type`, `startTick`, `durationTicks` match.
- All `source` properties (`assetId`, `trimInTick`, `trimOutTick`) match.
- All track properties (`id`, `name`, `kind`, `zIndex`, `muted`, `locked`) match.
- Attached `colorGrade` (exposure, white-balance, primary LGGO, curves, HSL, 3D LUT path, skin-tone protection) matches identically.
