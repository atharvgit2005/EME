# Milestone TL-01 State & Timebase Contract

## 1. Canonical Timebase & Representation Invariants

### 1.1 Fundamental Time Unit: Canonical Integer Ticks
- The single, immutable timebase of EME is integer ticks at **120,000 ticks per second** (`TICKS_PER_SECOND = 120000`).
- 120,000 divides evenly into standard video frame rates without floating-point error:
  - 24 FPS: 5,000 ticks / frame
  - 25 FPS: 4,800 ticks / frame
  - 30 FPS: 4,000 ticks / frame
  - 48 FPS: 2,500 ticks / frame
  - 50 FPS: 2,400 ticks / frame
  - 60 FPS: 2,000 ticks / frame
  - 120 FPS: 1,000 ticks / frame
- Fractional NTSC frame rates (e.g., 29.97 FPS, 59.94 FPS) are represented by exact integer ratios:
  - 29.97 FPS $\implies \frac{30000}{1001} \implies \operatorname{ticksPerFrame} = \frac{120000 \cdot 1001}{30000} = 4004$ ticks.
  - 59.94 FPS $\implies \frac{60000}{1001} \implies \operatorname{ticksPerFrame} = \frac{120000 \cdot 1001}{60000} = 2002$ ticks.

### 1.2 Half-Open Interval Representation
- All temporal extents are represented as half-open intervals:
  $$I = [t_{\text{start}}, t_{\text{start}} + \Delta t)$$
- Two intervals $A = [s_A, s_A + d_A)$ and $B = [s_B, s_B + d_B)$ overlap if and only if:
  $$\max(s_A, s_B) < \min(s_A + d_A, s_B + d_B)$$
- Two intervals are perfectly contiguous (abutting) without gap or collision when:
  $$s_B = s_A + d_A$$

---

## 2. Microsecond Rational Interoperability

CapCut and external timeline formats commonly express time in microseconds ($\mu s$). EME defines exact rational mappings:
$$\text{Ratio} = \frac{1,000,000 \mu s/\text{sec}}{120,000 \text{ ticks}/\text{sec}} = \frac{25}{3}$$

### 2.1 Microseconds to Ticks
$$t_{\text{ticks}} = \operatorname{round}\left( \frac{3 \cdot t_{\mu s}}{25} \right)$$
Examples:
- $1,000,000 \mu s \implies 120,000$ ticks ($1.000$ s)
- $2,500,000 \mu s \implies 300,000$ ticks ($2.500$ s)
- $3,000,000 \mu s \implies 360,000$ ticks ($3.000$ s)

### 2.2 Ticks to Microseconds
$$t_{\mu s} = \operatorname{round}\left( \frac{25 \cdot t_{\text{ticks}}}{3} \right)$$
Examples:
- $120,000 \text{ ticks} \implies 1,000,000 \mu s$
- $2,000 \text{ ticks} \implies 16,667 \mu s$ ($1$ frame @ 60 FPS)

---

## 3. Transaction Safety & Revision Semantics

1. **Monotonic Revisions**:
   Every committed mutation increments `project.revision` by strictly $+1$.
2. **Concurrency Guard (`expectedBaseRevision`)**:
   Operations can supply `expectedBaseRevision`. If `project.revision !== expectedBaseRevision`, the engine rejects the transaction with error code `STALE_REVISION` ($409$ Conflict) and performs zero mutation.
3. **Track Lock Mutation Guard**:
   Locked tracks (`track.locked === true`) reject all editing operations (`move_clip`, `trim_clip`, `ripple_trim`, `slip_clip`, `slide_clip`, `split_clip`, `delete_clip`, `ripple_delete`) with stable error code `TRACK_LOCKED`.
4. **Zero Side-Effects on Rejection**:
   Mutations are executed on a cloned candidate state and validated against JSON schema and semantic collision invariants before replacing active state.
