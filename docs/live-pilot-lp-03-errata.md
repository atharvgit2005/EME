# Live Pilot LP-03 — Specification Errata & Project Traceability

**Document:** `docs/live-pilot-lp-03-errata.md`  
**Date:** 2026-10-16  
**Context:** Live Pilot LP-03 Kinetic Typography & Keyframe Stress Test  
**Author:** AI-Operated Video Editing Mechanics Engine (EME) Core Engineering Team  

---

## 1. Background & Purpose

In accordance with ChatGPT's formal assessment of Live Pilot LP-03, this document records the exact track allocations, clip distributions, and animation keyframe parameter values used in the canonical project (`artifacts/live-pilot/LP-03/project.json`), noting all intentional adaptations made for vertical video (`1080x1920` portrait) and ensuring full historical traceability without silently rewriting historical reports.

---

## 2. Track Allocation & Clip Distribution Details

The initial specification outlined 16 typography clips across 3 visual text tracks. In the canonical execution, track distribution was structured as follows:

| Track ID | Track Name | zIndex | Clips Assigned | Count | Role & Visual Region |
|---|---|---|---|---|---|
| `track_t1` | Main Headlines | 1 | `clip_c01`, `c02`, `c03`, `c04`, `c05`, `c06` | 6 clips | Primary uppercase statements placed at $y = 800$ (fontSize: 72–80pt, color: `#f8fafc`, `#38bdf8`, `#818cf8`, `#34d399`) |
| `track_t2` | Accent Captions | 2 | `c07`, `c08`, `c09`, `c10`, `c11` | 5 clips | Secondary contextual sublines placed at $y = 1020$ (fontSize: 44pt, color: `#94a3b8`) |
| `track_t3` | Kinetic Callouts | 3 | `c12`, `c13`, `c14`, `c15`, `c16` | 5 clips | High-energy technical callouts placed at $y = 1240$ (fontSize: 36pt, colored accents) |
| `track_a1` | Audio Bed | 0 | `clip_a1_music` | 1 clip | 15.0s continuous stereo music track for full media muxing |

- **Total Clips on Timeline:** 17 clips (16 visual text clips + 1 audio clip).
- **All intervals on the same track:** Strictly non-overlapping, half-open integer-tick intervals.

---

## 3. Keyframe Animation Values & Control Points

ChatGPT specified $16 \times 3 \times 4 = 192$ canonical keyframe control points. The actual implementation conformed to exactly 192 property-keyframe points:

1. **`opacity` (4 control points per clip $\times$ 16 clips = 64 points):**
   - $t_0 = 0$: `value: 0`, easing: `easeOut`
   - $t_1 = 0.2 \times \text{duration}$: `value: 1`, easing: `linear`
   - $t_2 = 0.8 \times \text{duration}$: `value: 1`, easing: `easeIn`
   - $t_3 = 1.0 \times \text{duration}$: `value: 0`, easing: `linear`
2. **`transform.x` (4 control points per clip $\times$ 16 clips = 64 points):**
   - $t_0 = 0$: `value: -60`, easing: `easeOut` (entrance drift from left)
   - $t_1 = 0.2 \times \text{duration}$: `value: 0`, easing: `linear` (resting center)
   - $t_2 = 0.8 \times \text{duration}$: `value: 15`, easing: `easeIn` (subtle drift)
   - $t_3 = 1.0 \times \text{duration}$: `value: 70`, easing: `linear` (exit push to right)
3. **`transform.scale` (4 control points per clip $\times$ 16 clips = 64 points):**
   - $t_0 = 0$: `value: 0.85`, easing: `spring` (pop-in scale)
   - $t_1 = 0.2 \times \text{duration}$: `value: 1.0`, easing: `linear` (neutral scale)
   - $t_2 = 0.8 \times \text{duration}$: `value: 1.05`, easing: `easeIn` (tension expansion)
   - $t_3 = 1.0 \times \text{duration}$: `value: 1.15`, easing: `linear` (exit expansion)

**Total Canonical Control Points:** $64 + 64 + 64 = 192$ points.

---

## 4. Preservation of Baselines & Carried-Forward Observations

- **Baseline LP-01:** `artifacts/live-pilot/LP-01/project.json` (SHA-256: `71265d30791229e570133256894d02b0b6ddd1c8c43f75df179ed5f5b46a68d2`) — Unmutated.
- **Baseline LP-02:** `artifacts/live-pilot/LP-02/baseline-project.json` (SHA-256: `71265d30791229e570133256894d02b0b6ddd1c8c43f75df179ed5f5b46a68d2`) — Unmutated.
- **LP-02 Audio Gain Calibration:** Carried forward as an open tracking item for dedicated isolated-stem testing and not marked as prematurely closed.
