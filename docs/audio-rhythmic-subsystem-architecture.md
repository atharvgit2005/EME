# EME Audio & Rhythmic Intelligence — Architecture Specification & Phase A0 Audit

**Document Version:** 1.0.0  
**Status:** Certified Architecture Baseline (Phase A0)  
**Author:** Antigravity Engineering Team (in consultation with ChatGPT Architecture Lead)  
**Target Milestone:** Audio & Rhythmic Intelligence Expansion (Phases A0 – A6)  
**Subsystems:** Beat Understander, Beat Actor, SFX Engine  

---

## 1. Executive Summary & Workstream Boundaries

The Editing Mechanics Engine (EME) is expanding to include full **Audio & Rhythmic Intelligence**. This specification defines the architecture, data contracts, mathematical models, and operational pipelines for three cooperating subsystems:

1. **The Beat Understander**: High-precision deterministic signal processing (STFT, spectral flux, onset detection, multi-hypothesis tempo estimation, beat grids, downbeat detection, and multi-band energy curves).
2. **The Beat Actor**: A deterministic, policy-driven editorial actor that translates rhythmic cues into non-destructive EME timeline operations (cuts, punches, flashes, kinetic typography entrance timing, speed ramps, and SFX alignments).
3. **The SFX Engine**: A professional parametric procedural synthesizer and indexed sound pack catalog with sample-accurate cue placement, layer compositing, dialogue-aware sidechain ducking, and loudness QA.

### Non-Negotiable Boundaries & Workstream Isolation
- **Workstream Independence**: The Prompt-to-Deliverable engine (`PF-01` through `PF-05`) is running concurrently in a separate session. This Audio & Rhythmic subsystem introduces zero conflicting changes to prompt contracts.
- **Core Schema Immutability**: `schema/eme-project.v1.schema.json` remains 100% frozen and unmodified. All audio analysis data, cue graphs, and sound synthesis definitions reside in versioned sidecar artifacts (`eme-beat-analysis.v1`, `eme-beat-actor-plan.v1`, `eme-sfx-cue.v1`).
- **Transactional Authority**: The Beat Actor and SFX Engine **never** directly mutate timeline state or bypass transaction guards. All timeline modifications compile strictly into existing atomic EME operations executed through `OperationExecutor.execute()` with concurrency check `expectedBaseRevision`.
- **Zero AI in Numerical DSP**: The critical numerical audio path (FFT, onsets, tempo autocorrelation, peak picking, tick alignment) is 100% deterministic, testable, and CPU-executable with zero non-deterministic LLM hallucinations.

---

## 2. Verified Repository Facts & Baseline Audit

An empirical audit of the current `editing-mechanics-engine` codebase was conducted before drafting implementation components:

| Subsystem / Contract | Repository Location | Verified Invariants & Architecture |
| :--- | :--- | :--- |
| **Canonical Timebase** | `src/engine/time.js` | Strict integer-tick timebase with `TICKS_PER_SECOND = 120,000`. Frame rates represented as rational `{ numerator, denominator }`. Intervals are half-open `[startTicks, startTicks + durationTicks)`. Zero cumulative float drift. |
| **Atomic Operation Catalog** | `src/engine/operations.js` | 16 discrete atomic operations supported: `create_project`, `add_asset`, `add_track`, `insert_clip`, `trim_clip`, `move_clip`, `split_clip`, `animate_property`, `apply_effect`, `set_audio_envelope`, `delete_clip`, `ripple_delete`, `reorder_tracks`, `ripple_trim`, `slip_clip`, `slide_clip`. |
| **Concurrency & Integrity** | `src/engine/operations.js` | Every operation enforces atomic deep-cloning, validates `expectedBaseRevision` against `project.revision`, honors track locking (`track.locked`), and fails closed with zero side effects on error. |
| **Core Project Model** | `schema/eme-project.v1.schema.json` | Project schema version 1.0.0. Tracks divided into `video`, `audio`, `subtitle`. Clips reference asset IDs with `sourceStartTicks` and `sourceDurationTicks`. |
| **Audio Precedents** | `experiments/tracking-camera/sfx-synth.js` | Procedural 48 kHz 16-bit WAV audio synthesis (screen hum, glitch cuts, keystroke clicks, pentatonic lock-on beeps) with zero external dependencies. |
| **Soundtrack & SFX Tools** | `tools/build-creator-reel-soundtrack.js` | Multi-track audio mixing combining voiceover cues, 19 indexed SFX cues from `assets/sjc_sfx_pack/`, gain envelopes, and FFmpeg concatenation. |
| **Master Test Baseline** | `tests/` | **132 / 132 tests passing (100% green)** in 17.97 seconds across all editorial, color grading, recovery, and timeline suites. |

---

## 3. System Architecture & Module Boundaries

### Module Directory Structure
```
src/audio/
├── facade.js                     # Unified Audio Intelligence Facade & job coordinator
├── beat/                         # Subsystem 1: Beat Understander
│   ├── audio-ingest.js           # Audio decoding, metadata extraction, checksums
│   ├── stft.js                   # Pure JS Hann window Short-Time Fourier Transform
│   ├── spectral-features.js      # Positive spectral flux & multi-band filtering
│   ├── onset-detector.js         # Adaptive threshold peak picking & transient detection
│   ├── tempo-estimator.js        # Autocorrelation & multi-hypothesis tempo scoring
│   ├── beat-grid.js              # Deterministic beat sequence optimization & ticks binding
│   ├── downbeat-estimator.js     # Bar phase, meter (4/4, 3/4) & section boundaries
│   ├── band-analysis.js          # Sub-bass, kick, snare, percussion band decomposition
│   └── cache.js                  # Content-addressed deterministic artifact cache
├── actor/                        # Subsystem 2: Beat Actor
│   ├── event-normalizer.js       # Binds analysis events to timeline track/clip intervals
│   ├── editorial-policy.js       # Policy engine base class
│   ├── policies/
│   │   ├── social-short.js       # Fast-paced, punch cuts, accent flashes on downbeats
│   │   ├── music-video.js        # Cadenced cuts, speed ramps, kinetic typography sync
│   │   └── cinematic.js          # Restrained phrase-level cuts, subtle ambient risers
│   ├── cue-generator.js          # Generates candidate jump cuts, zooms, flashes, SFX cues
│   ├── collision-resolver.js     # Enforces refractory windows, minimum clip durations, priority
│   └── operation-compiler.js     # Compiles validated cue graph to EME atomic operations
└── sfx/                          # Subsystem 3: SFX Engine
    ├── synth/                    # Seeded procedural audio synthesizer
    │   ├── primitives.js         # Band-limited noise, sine chirps, resonant filters, envelopes
    │   ├── whoosh.js             # Directional whooshes & swishes with spatial panning
    │   ├── impact.js             # Sub-bass drops, cinematic slams, transient kicks
    │   ├── riser.js              # Exponential pitch/cutoff risers and tension builders
    │   └── glitch.js             # Band-passed bitcrush clicks and UI mechanical taps
    ├── catalog.js                # Indexed asset catalog (SJC SFX Pack) with search tags
    ├── ducking.js                # Dialogue-aware lookahead sidechain compression
    └── mixer.js                  # Multi-layer audio compositor, true-peak & loudness QA
```

---

## 4. Subsystem 1: Beat Understander Specification

### 4.1 Mathematical Formulation
1. **Timebase Conversion**:
   Given sample index $n$, analysis sample rate $f_s$ (e.g. 44,100 Hz), and canonical timebase $T = 120,000$ ticks/second:
   $$\text{ticks} = \text{round}\left( \frac{n \cdot T}{f_s} \right)$$
   DSP operations compute strictly on integer sample indices; ticks are derived at the contract boundary.

2. **Short-Time Fourier Transform (STFT)**:
   For window size $N = 2048$, hop length $H = 441$ ($10\text{ ms}$ feature resolution at $44.1\text{ kHz}$), and Hann window $w[n]$:
   $$X[k, m] = \sum_{n=0}^{N-1} x[n + mH] \cdot w[n] \cdot e^{-j 2\pi k n / N}$$

3. **Multi-Band Positive Spectral Flux**:
   For log-magnitude spectrum $S[k, m] = \log(1 + \gamma |X[k, m]|)$:
   $$F_b[m] = \sum_{k \in \text{Band}_b} w_k \cdot \max(0, S[k, m] - S[k, m-1])$$
   Bands evaluated:
   - **Sub/Bass**: $20 - 120\text{ Hz}$ (808s, bass drops, low-end pulses)
   - **Low-Mid**: $120 - 500\text{ Hz}$ (Kick body, low musical weight)
   - **Mid**: $500 - 2,000\text{ Hz}$ (Snare body, vocal onsets, melodic attacks)
   - **High-Mid**: $2,000 - 8,000\text{ Hz}$ (Snare snap, claps, percussive transients)
   - **High**: $8,000 - 16,000\text{ Hz}$ (Hi-hats, cymbals, air texture)

4. **Adaptive Threshold Peak Picking**:
   A transient onset is detected at frame $m$ when:
   $$F[m] > \text{median}(F[m-W \dots m+W]) + \delta \cdot \text{std}(F[m-W \dots m+W])$$
   subject to a refractory period of $\ge 50\text{ ms}$ (no duplicate onsets within 5 frames).

5. **Multi-Hypothesis Tempo Estimation**:
   Autocorrelation of the onset envelope:
   $$R[\tau] = \sum_m F[m] \cdot F[m - \tau]$$
   Evaluates lags corresponding to $40 - 240\text{ BPM}$. Retains candidate hypotheses (including primary, half-time, and double-time) with confidence scores:
   $$C_{\text{tempo}} = \frac{R[\tau_1] - R[\tau_2]}{R[\tau_1]}$$

---

## 5. Subsystem 2: Beat Actor Specification

### 5.1 Editorial Policy Contract
The Beat Actor operates in two distinct phases: **Dry-Run Plan Generation** followed by **Transactional Compilation**.

1. **Dry-Run Planning**:
   - Consumes `eme-beat-analysis.v1` and the read-only project snapshot.
   - Generates an `eme-beat-actor-plan.v1` containing candidate cues.
   - Resolves cue conflicts (e.g., minimum shot duration: $\ge 48,000\text{ ticks} = 400\text{ ms}$; maximum flash frequency: $\le 2\text{ flashes/sec}$ to prevent strobe fatigue).
   - Produces diagnostic rejection logs for any discarded candidate cues.

2. **Operation Compilation Mapping**:
   | Editorial Cue | Required EME Operation | Parameters |
   | :--- | :--- | :--- |
   | **Jump Cut** | `split_clip` + optional `move_clip` | `clipId`, `splitTicks` (exact frame boundary), preserving half-open interval continuity. |
   | **Punch Zoom** | `animate_property` | `clipId`, property `scale` ($1.0 \to 1.15 \to 1.0$), cubic easing over $18,000\text{ ticks} = 150\text{ ms}$. |
   | **Accent Flash** | `apply_effect` or `animate_property` | Exposure pop ($+1.5\text{ EV} \to 0.0\text{ EV}$) or chromatic flash over $12,000\text{ ticks} = 100\text{ ms}$. |
   | **Kinetic Entrance** | `insert_clip` / `animate_property` | Text clip entrance locked to beat downbeat tick with cubic slide-up. |
   | **SFX Alignment** | `insert_clip` | Audio clip placed on dedicated SFX audio track at transient start tick. |

---

## 6. Subsystem 3: SFX Engine Specification

### 6.1 Procedural Synthesis Primitives
Building on `experiments/tracking-camera/sfx-synth.js`, the procedural engine generates bit-exact 48 kHz 16-bit stereo PCM WAV files with deterministic seeds:
- **Whooshes & Swishes**: Pink noise filtered by time-varying bandpass resonant filter sweeping $400\text{ Hz} \to 3200\text{ Hz} \to 200\text{ Hz}$ with cosine stereo panning.
- **Impacts & Slams**: Pitch-decay sine wave ($150\text{ Hz} \to 35\text{ Hz}$ in $80\text{ ms}$) layered with filtered transient noise burst and exponential amplitude release.
- **Risers**: Sawtooth/sine cluster with exponential frequency ramp ($100\text{ Hz} \to 2400\text{ Hz}$) over $1.0 - 4.0\text{ seconds}$, driving tension into musical drops.
- **Glitches & Clicks**: Micro-burst band-limited impulses ($5 - 20\text{ ms}$) with minor pentatonic harmonic chirps.

### 6.2 Asset Catalog & Dialogue Ducking
- **Catalog Management**: Ingests and tags all 19+ WAV assets from `assets/sjc_sfx_pack/` with duration, peak amplitude, frequency centroid, and recommended editorial category.
- **Dialogue-Aware Sidechain Ducking**: Computes speech envelope on voice tracks. When voice amplitude exceeds $-24\text{ dBFS}$, background music and sustained SFX are automatically ducked by $-6\text{ dB}$ to $-12\text{ dB}$ with $50\text{ ms}$ attack and $250\text{ ms}$ release, ensuring crystal-clear speech intelligibility.
- **Loudness & Clipping QA**: Renders conform to EBU R128 (integrated loudness $-14\text{ LUFS}$ for web video, true-peak $\le -1.0\text{ dBFS}$, zero digital clipping).

---

## 7. Sidecar Data Contracts

### 7.1 `schema/eme-beat-analysis.v1.schema.json`
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EME Beat Analysis Schema",
  "type": "object",
  "required": ["schemaVersion", "analysisId", "source", "config", "tempo", "events"],
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["eme-beat-analysis.v1"] },
    "analysisId": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "source": {
      "type": "object",
      "required": ["sha256", "sampleRate", "channels", "durationSamples", "durationTicks"],
      "properties": {
        "sha256": { "type": "string" },
        "sampleRate": { "type": "integer" },
        "channels": { "type": "integer" },
        "durationSamples": { "type": "integer" },
        "durationTicks": { "type": "integer" }
      }
    },
    "config": {
      "type": "object",
      "required": ["algorithmVersion", "fftSize", "hopLength", "window"],
      "properties": {
        "algorithmVersion": { "type": "string" },
        "fftSize": { "type": "integer" },
        "hopLength": { "type": "integer" },
        "window": { "type": "string" }
      }
    },
    "tempo": {
      "type": "object",
      "required": ["bpm", "confidence", "alternativesBpm"],
      "properties": {
        "bpm": { "type": "number", "minimum": 30, "maximum": 300 },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "alternativesBpm": { "type": "array", "items": { "type": "number" } },
        "phaseOffsetSamples": { "type": "integer" },
        "phaseOffsetTicks": { "type": "integer" }
      }
    },
    "events": {
      "type": "object",
      "required": ["beats", "downbeats", "onsets"],
      "properties": {
        "beats": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "sampleIndex", "ticks", "confidence"],
            "properties": {
              "id": { "type": "string" },
              "sampleIndex": { "type": "integer" },
              "ticks": { "type": "integer" },
              "confidence": { "type": "number" },
              "strength": { "type": "number" }
            }
          }
        },
        "downbeats": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "barIndex", "ticks", "confidence"],
            "properties": {
              "id": { "type": "string" },
              "barIndex": { "type": "integer" },
              "ticks": { "type": "integer" },
              "confidence": { "type": "number" }
            }
          }
        },
        "onsets": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "ticks", "strength", "band"],
            "properties": {
              "id": { "type": "string" },
              "ticks": { "type": "integer" },
              "strength": { "type": "number" },
              "band": { "type": "string", "enum": ["sub", "low_mid", "mid", "high_mid", "high", "broadband"] }
            }
          }
        }
      }
    }
  }
}
```

---

## 8. Implementation Roadmap & Quality Gates

| Phase | Milestone Name | Scope & Deliverables | Acceptance Gate Criteria |
| :---: | :--- | :--- | :--- |
| **A0** | **Foundation & Audit** | Contract inspection, baseline verification, sidecar schemas. | Master test suite 100% green (132/132 tests); architecture document certified. |
| **A1** | **Beat Understander MVP** | `src/audio/beat/`: Ingest, STFT, spectral flux, onsets, tempo estimation, beat grid. | Synthetic metronome fixtures (60 BPM, 128 BPM) pass within $\pm 0.5\text{ BPM}$; zero fabricated beats on silence; 100% repeatable caching. |
| **A2** | **Musical Structure Intelligence** | Downbeat estimation, bar indexing, section classification (drop/build), multi-band decomposition. | Labeled musical fixtures correctly distinguish 4/4 meter; half-time/double-time ambiguities reported without guessing. |
| **A3** | **Beat Actor Dry-Run** | `src/audio/actor/`: Pacing policies (`social-short`, `cinematic`), cue graph generator, collision resolver. | Dry-run plans pass strict schema validation; zero executor calls in dry-run mode; all rejected cues carry explicit diagnostic codes. |
| **A4** | **SFX Engine MVP** | `src/audio/sfx/`: Seeded procedural synthesizer, SJC sound pack catalog, layer graph. | Generated WAVs bit-exact for fixed seeds; loudness and true-peak conform to EBU R128; zero clipping or discontinuities. |
| **A5** | **Timeline Execution & Mixing** | Connect Beat Actor plan to `OperationExecutor`; automated sidechain ducking and FFmpeg audio mixing. | Atomic transaction safety; zero duplicate edits on replay; audio-video sync within $\pm 10\text{ ms}$; full live-pilot regression green. |
| **A6** | **End-to-End Certification** | Corpus benchmark, adversarial matrix, performance profiling. | 100% of benchmark suite passes; end-to-end video with beat-synced visuals and sound design renders deterministically. |

---

## 9. Immediate Next Task: Phase A1 Implementation

With Phase A0 complete and certified:
- **Target**: Implement Phase A1 (Beat Understander DSP MVP).
- **Core Files to Implement**:
  - `src/audio/beat/stft.js` (Deterministic STFT and Hann windowing).
  - `src/audio/beat/spectral-features.js` (Multi-band positive spectral flux).
  - `src/audio/beat/onset-detector.js` (Adaptive peak picking with refractory suppression).
  - `src/audio/beat/tempo-estimator.js` (Autocorrelation and candidate tempo hypotheses).
  - `src/audio/beat/beat-grid.js` (Dynamic programming beat sequence alignment and integer ticks binding).
  - `tests/audio-beat-dsp.test.js` (Validation against synthetic 60 BPM and 128 BPM fixtures, silence invariance, and timing accuracy).
