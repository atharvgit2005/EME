# Live Pilot LP-04 — Errata & Clarifications

**Document:** `docs/live-pilot-lp-04-errata.md`  
**Date:** 2026-10-16  
**Status:** **ACTIVE RECORD**  
**Context:** Formal Review Feedback from ChatGPT for Live Pilot LP-04 (`v0.1.0-rc1`)

---

## 1. D3 Fixture Timing Clarification (1 Tick vs. 1 Full Video Frame)

In the initial LP-04 runner implementation, Fixture $D_3$ was described as a *"One-frame overlap on same track"*.
- **Reported Interval:** `clip_title` $[0, 720000)$ and `clip_subtitle` $[719999, 1439999)$.
- **Observed Overlap Duration:** 1 tick ($720000 - 719999 = 1\text{ tick}$).
- **Timebase Relationship:** At $60.0\text{ fps}$ on a $120,000\text{ ticks/second}$ timebase, 1 video frame equals exactly $2,000\text{ ticks}$ ($120000 / 60 = 2000$).
- **Clarification:** While the 1-tick overlap successfully proved the engine's sub-frame collision detection and half-open boundary enforcement ($[start, end)$) during preflight validation with zero partial mutation, a genuine 1-video-frame overlap corresponds to an interval of $2,000\text{ ticks}$ (e.g., `clip_subtitle` starting at tick $718,000$ while `clip_title` ends at $720,000$).
- **Verification:** Both 1-tick and 2,000-tick overlaps trigger identical preflight collision rejections in `ProjectManager.validateProject` via `MediaTime.intervalsOverlap`.

---

## 2. Metric Labeling Inversion (Render Duration Ratio vs. Playback Speed Factor)

In Section 8 of `docs/live-pilot-lp-04-report.md`, the performance ratios were verbally inverted:
- **Render Elapsed Time:** 8.23 seconds
- **Output Video Duration:** 12.00 seconds
- **Corrected Formulations:**
  - **Render Duration Ratio** ($\text{RenderTime} / \text{OutputDuration}$):
    $$\frac{8.23\text{ s}}{12.00\text{ s}} \approx \mathbf{0.686}$$
    *(Values $< 1.0$ indicate rendering faster than real-time playback).*
  - **Playback Speed Factor** ($\text{OutputDuration} / \text{RenderTime}$):
    $$\frac{12.00\text{ s}}{8.23\text{ s}} \approx \mathbf{1.458\times}$$
    *(The engine rendered 12 seconds of 60fps video at approximately $1.46\times$ real-time).*

---

## 3. Retained Open Records Carried Forward to LP-05

1. **LP-02 Audio Attenuation Observation:** Requested 50% linear gain ducking vs. observed -9.1 dB RMS attenuation remains an open calibration tracking item.
2. **LP-04 Five QA Capability Gaps:**
   - $D_4$: Animated keyframe spatial bounds check during playback.
   - $D_5$: Source audio PCM full-scale hard-clipping detection.
   - $D_6$: Delivery true-peak ceiling check ($-1.0\text{ dBTP}$).
   - $D_7$: 150ms audio dropout / silence interval detection.
   - $D_8$: Inter-clip blank frame / 1-frame cut gap detection.
