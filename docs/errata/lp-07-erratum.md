# Erratum: Live Pilot LP-07 Technical Findings & Scope Reconciliations

**Erratum ID:** `ERR-LP07-001`  
**Date:** 2026-10-16  
**Target Document:** `docs/live-pilot-lp-07-report.md` / `artifacts/live-pilot/LP-07/`  
**Status:** **RESOLVED & RATIFIED**

---

### 1. D3 Fixture Labeling Reconciliation (G0-1)
* **Discrepancy:** The LP-07 report labeled fixture D3 as *"Unintended 1-frame clip overlap on same track"*. However, in `tools/run-live-pilot-lp07.js`, the preceding clip ended at tick 720,000, and the colliding clip started at tick 719,999. Given the project timebase of 120,000 ticks/sec at 60 fps (2,000 ticks per frame), an overlap of 1 tick represents $1/2000$ of a frame, rather than one full frame.
* **Resolution for LP-08:** In Gate 2 of LP-08, this is explicitly decoupled into two distinct defect variants and one clean control:
  1. **D3a (1-Tick Sub-Frame Overlap):** `startTick: 719999` (1-tick overlap) — verified detected.
  2. **D3b (1-Frame Full Overlap):** `startTick: 718000` (2,000-tick overlap) — verified detected.
  3. **C3 (Exact Half-Open Adjacency):** `startTick: 720000` (0 overlap under $[t_1, t_2)$ half-open convention) — verified clean pass.

---

### 2. Audio Calibration Sample-Peak Attenuation Inconsistency (G0-2)
* **Discrepancy:** In `docs/live-pilot-lp-07-report.md`, Section 1 cited a sample-peak attenuation of **-6.0240 dB**, whereas Section 4's measurement table and `artifacts/live-pilot/LP-07/audio-calibration-report.json` reported **-5.9954 dB**.
* **Resolution:** The raw measured sample peaks were `-30.026727 dBFS` (baseline) and `-36.022138 dBFS` (0.5x gain). The exact mathematical delta is:
  $$-36.022138 - (-30.026727) = -5.995411\text{ dB}$$
  The value `-5.9954 dB` is the authoritative measurement. The summary citation `-6.0240 dB` arose from an unrounded preliminary draft. All LP-08 tables, reports, and machine-readable JSON artifacts now derive directly from unified raw measurement structures.

---

### 3. Absolute Audio Level & Gain Stage Accounting (G0-3)
* **Discrepancy:** In LP-07, the calibration source was described as a nominal -12 dBFS sine wave, but the rendered baseline output measured approximately -30.03 dBFS peak, representing an unexplained ~18 dB offset between nominal source level and rendered baseline.
* **Root Cause Analysis:** Investigation of the source generation command in `tools/run-live-pilot-lp07.js` revealed:
  `ffmpeg -f lavfi -i sine=frequency=1000:duration=4:sample_rate=48000 -af volume=-12dB ...`
  By design, FFmpeg's `lavfi` `sine` filter generates audio at a default amplitude of $0.125$ ($1/8$ full-scale), which equals:
  $$20 \log_{10}(0.125) = -18.0618\text{ dBFS}$$
  The filter `-af volume=-12dB` then applied an additional -12.0 dB attenuation to this -18.0618 dBFS signal, resulting in a source WAV file with:
  $$-18.0618\text{ dBFS} - 12.0000\text{ dB} = -30.0618\text{ dBFS (Peak)}$$
  HyperFrames rendered this WAV file through Web Audio at 1.0x gain, measuring -30.0267 dBFS peak in the output MP4 container. The entire ~18 dB difference was thus isolated to FFmpeg's default `sine` generator amplitude convention, with 0 dB loss in the HyperFrames render engine.
* **Resolution for LP-08:** LP-08 generates a true -12.000 dBFS peak reference sine wave using:
  `ffmpeg -f lavfi -i "aevalsrc=0.251188643*sin(2*PI*1000*t):s=48000:d=4" ...`
  where $10^{-12/20} = 0.251188643$. The source WAV and rendered outputs are measured and verified at exactly -12.000 dBFS peak.

---

### 4. D8 Timeline Gap vs. Rendered Blank-Frame Scope (G0-4)
* **Discrepancy:** LP-07 fixture D8 detected a 2,000-tick timeline gap at a cut boundary, while the report described the capability as "Blank-Frame Flash Cut Gap". Timeline gap detection inspects project metadata, but does not inspect rendered video frames for mid-clip black flashes or visual discontinuities.
* **Resolution for LP-08:** The capability is explicitly bifurcated into:
  1. **D8a (Inter-Clip Timeline Cut Gap):** Project-level metadata audit detecting unintended 1–2 frame cut gaps between adjacent visual clips.
  2. **D8b (Rendered Blank-Frame Flash Inspection):** Media-level video stream audit utilizing FFmpeg's `blackdetect` filter ($d \ge 0.016\text{s}$, $th \ge 0.98$) on decoded video frames to detect unintended encoded black flashes.
  Negative controls include intentional artistic black scenes (C14) and valid dissolve transitions (C13).
