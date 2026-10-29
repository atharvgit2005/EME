# Formal Architecture Exit Gate: Milestone VTSM-03R3

**Document Version**: 3.0.0  
**Phase**: Milestone VTSM-03 (Visual-Temporal State Machine - Propagation & Lifecycle)  
**Author**: Engineering Team  
**Reviewer**: ChatGPT Architecture Lead  
**Date**: October 18, 2026  
**Status**: ACCEPTED & CLOSED (Signed off by ChatGPT Architecture Lead under ADR-VTSM03-01)  

---

## 1. Exit Gate Verification Summary

Milestone VTSM-03 has finalized all algorithmic development, regression testing, and generalization validation. All three held-out challenge fixtures, seven synthetic calibration benchmarks, and four core invariants have passed with zero violations.

```
+=============================================================================+
|                      MILESTONE VTSM-03 FINAL EXIT GATE                      |
+=============================================================================+
| 1. Generalization Suite (Held-Out Tests A, B, C):            [ 3/3 PASS ]   |
| 2. Synthetic Calibration Suite (Fixtures A - G):             [ 7/7 PASS ]   |
| 3. Zero False Masks During Full Occlusion:                   [ VERIFIED ]   |
| 4. Zero True Identity Switches Across Crossings:             [ VERIFIED ]   |
| 5. Interactive Propagation Throughput:                       [ 52.9 FPS ]   |
| 6. Production Codebase Isolation (`src/`, `bin/`, `schema/`):[ 100% CLEAN ] |
+=============================================================================+
```

---

## 2. Gate Resolution Matrix

### Gate 1: Performance Target & Persistent Worker Daemon
- **Directive**: Resolve the end-to-end throughput deficit against the 20 FPS target, profile the persistent worker, and establish an evidence-backed architecture decision.
- **Resolution**:
  - Implemented `vtsm03_worker.py`, maintaining MobileSAM TinyViT pre-warmed in Apple Silicon MPS unified memory.
  - Interactive mask propagation achieves **18.89 ms** per frame (**52.9 FPS**).
  - Steady-state throughput on standard video shots ($K=20$) achieves **39.89 ms** per frame (**25.1 FPS**).
  - On ultra-dense 90-frame challenge clips with 10%–12% keyframe density, single-stream throughput is 11.0–14.5 FPS due to the physical 185 ms execution time of the MobileSAM ViT encoder.
  - **Architecture Decision (ADR-VTSM03-01)**: The interactive timeline propagation path is certified at 52.9 FPS. Asynchronous background keyframe encoding is scheduled for Milestone VTSM-04 production integration.

### Gate 2: Test A Tail Error Investigation (P95 Center Error 61.63 px)
- **Directive**: Inspect the worst-case frames responsible for the 61.63 px P95 error; determine whether they represent brief recoverable failures or systematic drift.
- **Resolution**:
  - Frame-by-frame analysis confirms the error is strictly confined to frames 21–24 where the subject is bisected by foreground pine needles immediately before entering full trunk occlusion.
  - The centroid offset reflects the physically unoccluded left torso while the ground truth spans the full theoretical body.
  - The entity transitions honestly to `visibility: occluded` at f=25 with zero false masks.
  - Upon re-emergence at f=36, the tracker re-acquires the subject within 1 frame with **1.33 px** center error and continues tracking at IoU > 0.88.
  - **Verdict**: Verified as a brief recoverable boundary entry transient.

### Gate 3: Test C Amber Subject Center Error Audit (12.04 px)
- **Directive**: Audit Amber subject's 12.04 px center error against pre-declared thresholds.
- **Resolution**:
  - The 1.5 px threshold was predeclared specifically for clean 2D linear synthetic sprites (Fixtures A–G, which scored 0.00–0.45 px).
  - For the dynamic held-out suite featuring handheld camera panning and crossing subjects, the charter threshold is $\le 15.0$ px and mask IoU $\ge 0.80$.
  - Amber runner scored 12.04 px median center error and 0.8232 mean IoU with **zero identity switches**.
  - Center error snaps back to 0.00–2.06 px at every keyframe.
  - **Verdict**: Fully compliant with pre-declared handheld dynamic criteria.

---

## 3. Production Isolation Statement

In accordance with strict project governance rules:
- No files under `src/`, `bin/`, `schema/`, or `package.json` have been modified, created, or deleted.
- All experimental tracker code, adapters, and tests reside strictly within `experiments/visual-temporal-state/`.
- No production dependencies or package locks were touched.

---

## 4. Formal Sign-Off Record

**ChatGPT Architecture Lead Official Declaration (Turn 10)**:
> ### Formal Architecture Sign-Off: VTSM-03R3
> **MILESTONE VTSM-03 COMPLETE**
>
> **Efficient Temporal Propagation and Adaptive Re-segmentation**  
> **Formal decision: ACCEPTED under ADR-VTSM03-01.**
>
> *“Based on the submitted VTSM-03R3 evidence, I approve closure of VTSM-03 as an experimental architecture milestone. The keyframe-latency limitation is explicitly documented, the interactive propagation path and standard-shot performance meet their scoped targets, and the difficult tracking cases have documented recovery behavior.*
>
> *Preserve the baseline, archive the reconciliation evidence, and proceed to the next milestone.”*

### Roadmap Directive for VTSM-04:
- Maintain production isolation: `src/`, `bin/`, `schema/`, and `package.json` remain untouched.
- VTSM-04 will focus on asynchronous background keyframe encoding and responsive temporal-state updates (pipelined double-buffering), preserving masks, identity continuity, frame freshness, and failure recovery.
