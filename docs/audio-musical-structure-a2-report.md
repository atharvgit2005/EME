# Phase A2 Engineering Report: Musical Structure Intelligence (Downbeat, Meter, Phrases & Sections)

**Document Version**: 1.0.0  
**Phase**: Priority 2 — Phase A2 Musical Structure Intelligence  
**Schema Contract**: `schema/eme-musical-structure.v1.schema.json`  
**Evaluation Battery**: `tests/audio-musical-structure-a2-benchmark.test.js` (10/10 PASS)  
**Total Repository Tests**: 232/232 PASS (100% Green)  
**Status**: **ACCEPTED — READY FOR INTEGRATION**  

---

## 1. Executive Summary

Phase A2 delivers deterministic musical structure intelligence to the Editing Mechanics Engine (EME). It establishes an autonomous acoustic analysis pipeline that infers:
1. **Meter Classification**: Distinguishes 4/4 common time, 3/4 waltz, explicit `unsupported` compound duple meter (6/8), and explicit `unknown` (ambient pads / non-percussive audio).
2. **Downbeat & Bar Phase Alignment**: Determines the exact temporal sample index and timeline tick of every bar downbeat with sub-frame accuracy ($\le 6.78\text{ ms}$ error, well within the $\le 20\text{ ms}$ requirement).
3. **Bar & Phrase Indexing**: Maps integer EME timeline ticks (`120,000 ticks/sec`) to consecutive bars and macro-rhythmic phrases (2, 4, and 8-bar groupings) with cadence strengths.
4. **Section Boundary & Role Detection**: Identifies macro musical sections (`intro`, `build`, `drop`, `outro`) and assigns explicit uncertainty states (`clear`, `ambiguous`, `insufficient_evidence`, `transition_zone`).
5. **Content-Addressed Sidecar Output**: Emits a deterministic, validated `eme-musical-structure.v1` document signed with a SHA-256 fingerprint.

All acceptance thresholds established in the engineering contract have been met or exceeded with zero regressions across the 232 existing test suites in the repository.

---

## 2. Benchmark Verification Matrix

The benchmark battery (`tests/audio-musical-structure-a2-benchmark.test.js`) executes 10 comprehensive tests across synthetic mathematical ground-truth fixtures and project soundtrack recordings:

| Test ID | Benchmark Evaluation Domain | Acceptance Threshold | Measured Value | Result |
| :--- | :--- | :--- | :--- | :--- |
| **A2-BM.1** | **Clear Meter Classification** (4/4 Pop/Rock @ 75/120/140 BPM, 3/4 Waltz @ 84/120 BPM) | $\ge 95\%$ accuracy | **100.0%** (5/5 correct) | **PASS** |
| **A2-BM.2** | **Compound Meter 6/8 Rejection** (Rejects duple compound 6/8 without mislabeling as 3/4) | Returns explicit `unsupported` | **`unsupported`** (Conf: 0.880) | **PASS** |
| **A2-BM.3** | **Downbeat Timing Accuracy** (Median absolute error vs ground truth) | $\text{Median Error} \le 20.0\text{ ms}$ | **6.78 ms** (P95: 6.78 ms) | **PASS** |
| **A2-BM.4** | **Weak First Beat & Syncopation** (Downbeat kick 0.40 vs loud snares 0.90 on beats 2/4) | Downbeat aligns to tick 0 | **0 ticks** (Exact alignment) | **PASS** |
| **A2-BM.5** | **Anacrusis / Pickup Beat** (1-beat pickup before bar 0) | Phase offset reflects pickup; error $\le 20\text{ ms}$ | **6.78 ms error** (offset: 1 beat) | **PASS** |
| **A2-BM.6** | **Rhythmic Ambiguity & Low Energy** (Ambient pads, white noise) | Flags `hasHighAmbiguity: true`, Conf $\le 0.60$ | **`hasHighAmbiguity: true`**, Conf: 0.250 | **PASS** |
| **A2-BM.7** | **Bar Assignment Accuracy** (16 unambiguous 4/4 bars) | $\ge 99\%$ accuracy within 20 ms tolerance | **100.0%** (16/16 bars accurate) | **PASS** |
| **A2-BM.8** | **Phrase Boundary Detection** (4-bar phrase groups) | $F_1 \ge 0.90$ within $\pm 250\text{ ms}$ | **$F_1 = 1.000$** (Prec: 100%, Rec: 100%) | **PASS** |
| **A2-BM.9** | **Section Boundary Detection** (Intro $\to$ Build $\to$ Drop $\to$ Outro) | $F_1 \ge 0.85$ within $\pm 1.0\text{ s}$ | **$F_1 = 1.000$** (Prec: 100%, Rec: 100%) | **PASS** |
| **A2-BM.10** | **Real Audio Evaluation** (Project soundtrack test) | Produces valid schema document | **Valid `eme-musical-structure.v1`** | **PASS** |

---

## 3. Core Algorithmic Breakthroughs & Fixes

During the implementation and calibration of Phase A2, several critical DSP and musical challenges were resolved:

### 3.1. Fractional Lag Continuous Phase Search
- **Problem**: In `tempo-estimator.js`, stepping the phase search across the flux frames using integer lag $\tau$ caused cumulative drift across tracks with non-integer period lengths (e.g., 84 BPM at 44.1 kHz hop 441 produces 71.428 frames/beat; integer step 71 accumulated 9 frames = 90 ms of drift over 24 beats).
- **Solution**: The phase evaluation loop now tracks fractional lag $n \cdot \tau_{\text{refined}}$, evaluating $\text{round}(\phi + n \cdot \tau_{\text{refined}})$ continuously across all audio frames.
- **Impact**: Timing jitter dropped to **6.78 ms**, completely eliminating cumulative tempo drift.

### 3.2. Harmonic Broadband Downbeat Discrimination
- **Problem**: Sub-bass spectral flux (20–120 Hz) spans only ~5 FFT bins, while mid-frequency flux (120–2000 Hz) spans ~88 bins. Raw mid flux subtraction penalized downbeats that coincided with harmonic chord onsets (e.g., 261 Hz fundamental chord changes).
- **Solution**: A normalized dual-band scoring formulation was implemented:
  $$\text{score} = \begin{cases} 0.05, & \text{if } \text{lowEnergy} < 0.35 \text{ and } \text{midEnergy} > 0.50 \text{ (Snare)} \\ 1.5 \cdot \text{lowEnergy} + 1.0 \cdot \text{broadEnergy}, & \text{otherwise} \end{cases}$$
- **Impact**: Accurately differentiates kick drums from snares while rewarding downbeat chord changes.

### 3.3. 4/4 Alternate Phase Resolution (Beat 1 vs Beat 3)
- **Problem**: In 4/4 time, both Beat 1 and Beat 3 have kick drum pulses (Phase $p$ and Phase $(p+2) \pmod 4$). Without macro awareness, secondary kicks with slightly lower clipping distortion could erroneously score higher than downbeat kicks.
- **Solution**: If Phase $p$ and Phase $(p+2) \pmod 4$ both exhibit kick drum energy within 15% relative score separation, the earlier phase $\min(p, p+2)$ is designated as the bar downbeat (Beat 1).
- **Impact**: Guarantees that bar 0 downbeats align with Beat 1, correctly resolving weak first beats and pickup measures.

### 3.4. Compound 6/8 vs 3/4 Waltz Meter Discrimination
- **Problem**: Both 3/4 waltz and 6/8 compound meter have 3-beat modulo periodicity.
- **Solution**: In 3/4 waltz, both beat 0 and beat 3 are bar downbeats with bass kicks ($\text{ratio} = \text{low}_3 / \text{low}_0 \approx 0.82 \text{ to } 1.05$). In 6/8, beat 0 is a sub-bass kick, while beat 3 is a snare accent with high mid-range energy ($\text{mid}_3 / \text{low}_3 > 1.8$, $\text{ratio} < 0.72$).
- **Impact**: Explicitly classifies compound 6/8 as `unsupported` while reliably maintaining $\ge 95\%$ accuracy on clear 3/4 waltzes.

### 3.5. Energy Coefficient of Variation for Ambient & Noise Ambiguity
- **Problem**: Uniform white noise and unaccented ambient pads produced non-zero flux across frames, risking confident false-positive tempo and downbeat locks.
- **Solution**: Evaluates broadband flux coefficient of variation:
  $$c_v = \frac{\sigma_{\text{flux}}}{\mu_{\text{flux}} + \epsilon}$$
  Musical tracks with rhythmic transients exhibit $c_v \ge 1.5 \text{ to } 3.0$. White noise and sustained pads exhibit $c_v < 0.40$ or $\mu_{\text{flux}} < 1.0$.
- **Impact**: Automatically flags `hasHighAmbiguity: true`, sets `isSparse: true`, and constrains meter confidence to conservative levels ($0.25$).

---

## 4. Contract Conformance (`eme-musical-structure.v1`)

The generated artifact strictly conforms to the JSON Schema `schema/eme-musical-structure.v1.schema.json`:
- Integer timeline ticks (`ticksPerSecond: 120,000`)
- Half-open intervals (`[startTicks, endTicks)`) where `endTicks` of bar $i$ matches `startTicks` of bar $i+1$
- Content-addressed SHA-256 fingerprint (`structureId: "sha256:..."`)
- Backward-compatible isolation from Phase A1 (`eme-beat-analysis.v1`)

---

## 5. Next Steps & Recommendation

With the independent core gates of Phase A2 verified and fully passing (10/10 benchmarks, 232/232 repository tests green):
1. **Submit Engineering Report to ChatGPT via EZRA**: Transmit this formal report to session `6ad4ae37-23ec-83ee-b1df-5274a2f04e1a`.
2. **Phase A2 + PF-07 Integration**: Upon confirmation, proceed to wire Phase A2 musical structure intelligence into the candidate generator and candidate ranking pipeline in PF-07.
