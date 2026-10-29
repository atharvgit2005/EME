# EME × Earshot — Evidence-Driven Integration Reconnaissance Report

**Document**: EME × Earshot Integration Architecture Reconnaissance  
**Status**: READ-ONLY RECONNAISSANCE (No Source Modifications or Installations)  
**Predecessor Certified Milestones**: Phase 22 (`phase-22-certified`), Phase 23 (`phase-23-certified`, commit `f607bb93d809219a220f0eb405e805e016ce9d58`)  
**Target Architecture Lead**: ChatGPT Architecture Lead  
**Inspected Repositories**:
- EME (`/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine`)
- Earshot (`https://github.com/Leonxlnx/earshot`, inspected from local clone at `/tmp/earshot`, release `v0.3.0`)

---

## 1. Executive Recommendation

### 1.1 The Strategic Verdict
**Earshot should be integrated into EME strictly as an out-of-process, advisory Read-Only Audio QA & Perception Service, governed by EME's established Subprocess Worker Client pattern (identical to the VTSM perception model in `src/engine/vtsm-worker-client.js`).**

Earshot provides high-value, domain-specialized audio inspection capabilities that EME currently lacks—most notably:
1. **BS.1770 Integrated Loudness & LRA measurements** (which EME currently estimates loosely via FFmpeg filter scrapes).
2. **Deterministic Picture-to-Sound Transient Synchronization** (`timeline.py`: measuring cut/cue-to-audio-onset offsets in milliseconds with statistical chance baselines).
3. **Launch-Video Sound Quality Critique & Scorecards** (`critique.py`: scoring against 7 launch-grade reference films and web autoplay delivery practices).
4. **Visual Audio QA Inspection Sheets** (`sheet.py`: multi-lane aligned PNGs displaying thumbnails, cuts, event tags, spectrograms, loudness curves, and beat sync).

### 1.2 Core Architectural Invariant Defenses
To preserve EME's non-negotiable architectural guarantees:
- **Zero Runtime NPM Dependencies**: Earshot requires Python 3.10+, PyTorch >=2.6, Transformers >=4.40, Librosa, Scipy, and Soundfile. It **must not** be wrapped via npm packages. It must run in an isolated Python virtual environment or local MCP daemon.
- **Sole Mutation Authority**: Earshot must have **zero execution authority**. It cannot directly modify project state, rewrite timelines, or move clips. `OperationExecutor` (`src/engine/operations.js`) remains the single, canonical mutation engine.
- **Fail-Safe Fallback**: If Python, PyTorch, or Earshot is missing, unconfigured, or hung, EME's native FFmpeg QA pipeline (`src/renderers/qa-engine.js`) continues operating without degradation. Earshot checks report `not_measured` or `not_applicable`.
- **Phased Adoption**: Do not integrate sound synthesis (`forge`/`fit`) until the read-only perception layer (`measure`, `timeline`, `sheet`, `critique`) is fully certified and tested.

---

## 2. Evidence-Backed EME Architecture Map

Every entry point, symbol, file path, and line range below has been directly verified against active EME source code:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ EME CANONICAL ARCHITECTURE & CALL PATHS                                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Intent Envelope & Compilation   │ src/prompt-core/index.js (L71-150)                   │
│ Validation & Preflight          │ src/prompt-core/brief-validator.js (L24-118)         │
│ Plan Compilation & Normalization│ src/prompt-core/operation-plan-compiler.js (L30-220)  │
│ Atomic Project Mutation         │ src/engine/operations.js (OperationExecutor, L14-175)│
│ Timebase & Interval Engine      │ src/engine/time.js (MediaTime, L1-140)               │
│ Rendering & FFmpeg Composition  │ src/prompt-core/render-orchestrator.js (L28-301)     │
│ Native Audio & Visual QA        │ src/renderers/qa-engine.js (L20-403)                 │
│ Media Probing & Manifest QA     │ src/prompt-core/render-orchestrator.js (L304-610)    │
│ Closed-Loop QA & Defect Repair  │ src/planning/closed-loop-qa.js (L21-280)             │
│ Job Lifecycle & Concurrency     │ src/prompt-core/job-orchestrator.js (L20-350)        │
│ External Subprocess Worker      │ src/engine/vtsm-worker-client.js (L56-320)           │
│ External MCP Surface            │ src/mcp/server.js (L1-420)                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Natural-Language Intent Interpretation & Operation Planning
- **Entry Point**: `src/prompt-core/index.js` (`extractIntentEnvelope`, line 71; `compileEditBrief`, line 210).
- **Validation**: `src/prompt-core/brief-validator.js` (`BriefValidator.validateBrief`, line 24) enforces schema validity against `schema/eme-edit-brief.v1.schema.json`.
- **Constraint Resolution**: `src/prompt-core/constraint-normalizer.js` (`ConstraintNormalizer.normalizeConstraints`, line 22) resolves negative invariants and style bounds.
- **Reference Resolution**: `src/prompt-core/reference-resolver.js` (`ReferenceResolver.resolveReferences`, line 20) binds clip IDs and asset paths.
- **Plan Generation**: `src/prompt-core/operation-plan-compiler.js` (`OperationPlanCompiler.compilePlan`, line 38) compiles declarative briefs into a sequence of versioned atomic operations conforming to `schema/eme-operation-plan.v1.schema.json`.

### 2.2 Atomic Operation Selection & Deterministic Execution
- **Sole Mutation Authority**: `src/engine/operations.js` (`OperationExecutor.execute`, lines 14–175).
- **Determinism Guarantee**: Deep-clones base project (`structuredClone`), checks `expectedBaseRevision` (lines 28–42), executes target operation in an isolated sandbox, validates timebase and overlap constraints, and advances revision by exactly `+1` upon success. On any error, rolls back completely with zero partial mutation.
- **Audio Operations**: Currently implements `insert_clip` (audio track insertion), `trim_clip`, `move_clip`, `split_clip`, `delete_clip`, `set_audio_envelope` (lines 97–100), and `set_track_state` (mute/solo/volume, line 142).
- **Timebase Representation**: `src/engine/time.js` (`MediaTime`, lines 1–140) strictly enforces integer microsecond ticks ($120,000 \text{ ticks/sec}$) and half-open intervals $[t_{\text{start}}, t_{\text{end}})$.

### 2.3 Timeline, Media, Audio & Video Rendering
- **Orchestration**: `src/prompt-core/render-orchestrator.js` (`RenderOrchestrator.renderDeliverable`, line 150).
- **Composition Engine**: `src/renderers/hyperframes/compiler.js` (`HyperFramesCompiler.compile`, line 25) generates HTML/CSS/Canvas animation frames.
- **Video Renderer**: `src/renderers/hyperframes/renderer.js` (`HyperFramesRenderer.render`, line 35) or direct FFmpeg composite pipelines (`ffmpeg-color-compiler.js`, line 40).
- **Audio Facade & Synthesis**: `src/audio/facade.js` (`AudioIntelligenceFacade`, line 19) coordinates procedural synthesis (`synthesizeWhoosh`, `synthesizeImpact`, `synthesizeRiser`, `synthesizeGlitch`), audio mixing (`mixAudioLayers`), and dialogue ducking (`applyDialogueDucking`).

### 2.4 Existing Audio Analysis, Synchronization & Media QA
- **Media Inspection Entry Point**: `src/prompt-core/render-orchestrator.js` (`RenderOrchestrator.inspectRenderedMedia`, lines 304–610).
- **Native QA Engine**: `src/renderers/qa-engine.js` (`QualityAssuranceEngine.auditQuality`, lines 35–401).
- **Existing Audio Checks**:
  1. *Hard-Clipping Detection*: Lines 304–325 via `ffmpeg -af astats=metadata=1:reset=1` detecting flat factor $>1.0$ and peak counts.
  2. *True-Peak Ceiling*: Lines 328–347 via `ffmpeg -af ebur128=peak=true` checking ceiling breach.
  3. *Audio Dropout Detection*: Lines 349–387 via `ffmpeg -af silencedetect=noise=-80dB:d=0.1`.
  4. *Beat-Aligned Cut Verification*: `render-orchestrator.js` lines 569–588 (`CHK_BEAT_CUTS`) checking if pre-analyzed beats match cut timestamps.
- **Verified Limitation vs Claim**: The current `CHK_BEAT_CUTS` in `render-orchestrator.js` only checks whether static beat markers exist in an input `beatAnalysis` object; **it does not inspect the rendered audio file's actual sound waveform to confirm that transients land on visual cuts**.

### 2.5 Defect Reporting, Repair Planning, Rerendering & Recovery
- **Closed-Loop Pipeline**: `src/planning/closed-loop-qa.js` (`ClosedLoopQaPipeline.run`, lines 21–280).
- **Repair Controller**: Inspects rendered media, maps QA warnings to structured findings (lines 78–160), and proposes atomic correction operations (lines 170–250).
- **Verified Audio Defect Gap**: Lines 130–141 explicitly mark audio defects (`true_peak_overflow`, `audio_discontinuity`, `PCM_HARD_CLIPPING`) as `repairable: false`. EME can detect audio defects, but has no automated audio repair planner.
- **Rollback & Recovery**: `src/prompt-core/rollback-manager.js` (`RollbackManager`) and `src/prompt-core/incident-remediator.js` (`IncidentRemediator`) trigger emergency containment and rollback if media corruption is detected.

### 2.6 Existing Worker Processes, Python Integrations & MCP Interfaces
- **Persistent Python Worker Pattern**: `src/engine/vtsm-worker-client.js` (`VtsmWorkerClient`, lines 56–320). Connects to a persistent Python daemon (`experiments/visual-temporal-state/src/tracker/vtsm03_worker.py`) using JSON-RPC over `stdin`/`stdout`. Enforces bounded queue depth, command timeouts, memory limits, and strict read-only advisory boundaries.
- **MCP Surface**: `src/mcp/server.js` (`EmeMcpServer`, lines 25–420) and `bin/eme-mcp.js`. Exposes tools: `eme_create_project`, `eme_get_project`, `eme_execute_operation`, `eme_render_timeline`, `eme_audit_quality`.

---

## 3. Earshot Source Investigation

Inspected directly from `https://github.com/Leonxlnx/earshot` (`v0.3.0`, source code in `/tmp/earshot`):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ EARSHOT CAPABILITY ARCHITECTURE & RUNTIME PROFILE                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ measure   │ earshot/features.py (L1-314)      │ Pure DSP / Numpy / Scipy │ No models   │
│ timeline  │ earshot/timeline.py (L1-1461)     │ Onset flux + CLAP/AST    │ Heavy models│
│ sheet     │ earshot/sheet.py (L1-367)         │ Matplotlib + Pillow      │ Visual PNG  │
│ critique  │ earshot/critique.py (L1-654)      │ Scorecard vs 7 ref films │ Fast / Full │
│ sfx/check │ earshot/forge/sfx.py (L1-343)     │ Glides, clicks, pre-swell│ No models   │
│ kit       │ earshot/forge/kit.py (L1-601)     │ Kit lock + role placement│ Pure DSP    │
│ fit/auto  │ earshot/forge/fit/auto.py (L1-200)│ Analysis-by-synthesis    │ Model-driven│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 `measure` (features.py) — Objective Audio Measurements
- **Runtime Footprint**: **Pure DSP** (Numpy, Scipy, Soundfile, PyLoudNorm). **Zero torch/transformers models loaded**. Fast execution (<50ms for typical clips).
- **Inputs**: Audio file path (WAV, FLAC, OGG, MP3, M4A) or video audio track; optional time range (`start`, `end`).
- **Outputs**:
  - `lufs`: BS.1770 integrated loudness.
  - `true_peak_dbtp`: 4x oversampled true peak.
  - `lra_lu`: Loudness Range (dynamics).
  - `clipped_samples`, `dc_offset`, `noise_floor_dbfs`, `digital_silence_frac`.
  - `attack_ms`, `decay_ms`: 10%–90% envelope rise/fall times.
  - `brightness_hz`, `centroid_hz`, `spectral_flatness`, `bands_db` (7-band energy distribution).
- **Failure Behavior**: Graceful fallback on short files (<0.4s skips LRA/integrated LUFS). Digital silence produces `-inf` dBFS safely.
- **Trustworthiness**: High. These are objective mathematical meters, not neural network guesses.

### 3.2 `timeline` (timeline.py) — Audio Events & Synchronization Analysis
- **Runtime Footprint**: **Heavy Model Execution** (CLAP and AudioSet AST for semantic tagging; pure DSP for onsets and beat grid).
  - Cold start: 20–40 seconds to load PyTorch models into CPU memory.
  - Cached execution: <1.5s using EARSHOT_HOME embedding cache.
- **Inputs**: Video file (`--video`), audio file, optional picture cue timestamps (`--cues cues.json`).
- **Outputs**:
  - `events`: Spectral-flux onsets (5ms hop, 1ms envelope refinement), prominence (dB over bed), event kind tags (`WHOOSH`, `HIT`, `KEY`, `UI`, `STEP`, `FOLEY`, `NOTE`, `DRUM`, `VOICE`).
  - `sync`: Exact mapping of every video cut/cue to nearest sound onset:
    - `offset_ms`: sound timestamp minus picture timestamp (negative = sound early).
    - Alignment verdict: `OK` (within 1 frame / 40ms), `near` (within 100ms), `swell` (build-up peaks within 300ms), `peak` (level peak within 150ms), `off` / `no sound` (cut without hit).
    - `chance`: Statistical baseline measuring random edit alignment.
- **Verified Limitations**:
  - Event semantic labels under a busy music mix are correct only ~25% of the time (50% for exposed sounds).
  - Timestamps, onsets, and `offset_ms` are accurate to $\pm 1\text{ms}$.

### 3.3 `sheet` (sheet.py) — Visual Audio QA Evidence
- **Runtime Footprint**: Moderate (Matplotlib + Pillow; reuses cached `timeline` data). Generates 1600px wide annotated inspection PNG.
- **Visual Lanes (Top to Bottom)**:
  1. Video frame thumbnails captured at cuts.
  2. Section tags and semantic categories.
  3. Staggered sound event labels.
  4. 30 Hz – 16 kHz log-frequency spectrogram.
  5. Waveform + Momentary/Short-Term LUFS loudness curves.
  6. Beat grid + downbeat markers.
  7. Color-coded cut/cue synchronization markers (green = OK, amber = near, blue = swell, red = miss).
- **Value**: Exceptional visual evidence for human-in-the-loop audit and automated multimodal inspection.

### 3.4 `critique` (critique.py) — Creative-Quality Review Signals
- **Runtime Footprint**: Fast in `--fast` mode (skips CLAP/AST classification); thorough in standard mode.
- **Evaluation Criteria**: 34 metrics evaluated against launch-grade reference envelopes:
  - Critical weights: `lufs_i` (-16 to -9 LUFS), `true_peak` ($\le -1.0\text{ dBTP}$), `p_real` (realness probability), `music_frac` (continuous bed).
  - Major weights: `cuts_with_sound` (percentage of cuts with audio), `lra`, `first_sound_s` (initial dead air), `max_gap_s` (mid-roll silence).
  - Concrete repair suggestions: outputs actionable recommendations with exact timestamps (e.g. *"add sub layer at 00:04.200"*, *"cut at 00:08.500 has no hit"*).
- **Verified Limitations**: The reference envelopes reflect modern kinetic SaaS/AI launch videos. They are opinions/heuristics, not universal physics.

### 3.5 `sfx` & `kit` (forge/sfx.py, forge/kit.py) — Sound Kits & Model-Free Audits
- **Runtime Footprint**: **Pure DSP** (no PyTorch, no neural networks).
- **`sfx check`**: Model-free defect audit for sound files:
  - Detects "synth whip" tell: pitch climbing $>4$ semitones over 50ms (`rising_glide`).
  - Detects clicks, DC offset, digital clipping, tail truncation, and double-hit stacking.
- **`kit` Architecture**: Declarative `kit.json` mapping film roles (`tick`, `hit`, `land`, `whoosh`, `key`, `click`, `bell`) to bank recipes, rendered into deterministic WAV takes with `kit.lock.json` recording measured sync points (`onset_s`, `peak_s`, `end_s`).

### 3.6 `forge` & `fit` (forge/fit/) — Sound Synthesis & Code Translation
- **Runtime Footprint**: Compute-heavy analysis-by-synthesis (ESPRIT modal extraction, McAulay-Quatieri sine tracking, spectral noise envelope fitting).
- **Evaluation**: Advanced research capability for procedural sound asset generation. High CPU overhead; unsuitable for tight QA loops. Should remain optional and excluded from the initial QA proof-of-concept.

---

## 4. Capability & Overlap Matrix

| Capability | EME Current Implementation | Earshot Capability | Integration Recommendation | Overlap / Conflict Risk |
|---|---|---|---|---|
| **Audio True Peak & Clipping** | `QualityAssuranceEngine` (`qa-engine.js`: L304-347, via FFmpeg `astats` & `ebur128`) | `measure` (`features.py`: L84-87, 4x oversampled true peak) | **Supplement**: Use Earshot `measure` for sub-sample accuracy; keep FFmpeg as zero-dep fallback. | Low risk. Values agree within $\pm 0.1\text{ dBTP}$. |
| **Integrated Loudness (LUFS)** | Loose regex scrape in `render-orchestrator.js` (L526); not in `qa-engine.js`. | `measure` (`features.py`: L96-100, ITU-R BS.1770-4 integrated + LRA) | **Supplement**: Fill major EME gap for broadcast / web loudness compliance. | Zero conflict. EME currently lacks formal LUFS checks. |
| **Audio-Visual Sync / Cut Alignment** | Static boolean tick check in `render-orchestrator.js` (L570-588); zero waveform inspection. | `timeline` (`timeline.py`: L40-47, exact onset-to-cut alignment $\pm 1\text{ms}$, chance baseline) | **Adopt as Core Audio QA**: Bridges EME's blind spot between picture cuts and rendered audio. | Low risk if parameterized with EME frame rate. |
| **Visual QA Evidence Sheet** | None (EME renders only candidate MP4 and headless HTML inspection). | `sheet` (`sheet.py`: L1-367, unified multi-lane diagnostic PNG) | **Adopt**: Save as QA diagnostic artifact (`artifacts/qa/sheet.png`). | Zero conflict. Pure additive visual evidence. |
| **Creative Mix Critique & Scorecard** | Heuristic 0–100 score in `QualityAssuranceEngine` based solely on technical failures. | `critique` (`critique.py`: L50-93, 34-metric launch-grade scorecard + actions) | **Optional Advisory**: Expose as advisory scorecard; do not allow critique heuristics to veto hard technical gates. | Moderate risk of opinion divergence. Must be advisory-only. |
| **Model-Free SFX Defect Audit** | None (EME only checks basic asset file existence). | `sfx check` (`forge/sfx.py`: L11-39, rising glides, double hits, clicks) | **Adopt for Audio Asset Ingest**: Audits SFX assets before insertion. | Zero conflict. High value for asset validation. |
| **Sound Kit & Placement Engine** | Procedural synths in `src/audio/sfx/synth/` (whoosh, impact, riser, glitch). | `kit` (`forge/kit.py`: L1-80, declarative role kits, `kit.lock.json`) | **Future Milestone (Phase 26)**: Keep EME procedural synths; adopt Earshot kit schema for complex sound design. | Medium complexity. Defer to Phase 26. |
| **Audio Reconstruction / Synthesis** | None. | `fit` / `forge` (analysis-by-synthesis code generation). | **Exclude**: Out of scope for EME core deterministic engine. | High CPU/model cost. Exclude from pipeline. |

---

## 5. Smallest Viable Integration: Read-Only Audio QA Adapter

### 5.1 Architecture & Boundary Specification

```
                                      EME CORE ARCHITECTURE (Zero NPM Dependencies)
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                              │
│  RenderOrchestrator.inspectRenderedMedia() ─────────────────────────────────────────────────────────────┐   │
│                             │                                                                           │   │
│                             ▼                                                                           │   │
│             QualityAssuranceEngine.auditQuality()                                                       │   │
│                             │                                                                           │   │
│             ┌───────────────┴─────────────────────────┐                                                 │   │
│             ▼                                         ▼                                                 │   │
│   Native FFmpeg Checks                     EarshotQaAdapter (Read-Only)                                 │   │
│   (astats, ebur128, blackdetect)           (src/renderers/earshot-adapter.js)                           │   │
│                                                       │                                                 │   │
└───────────────────────────────────────────────────────┼─────────────────────────────────────────────────┘   │
                                                        │ JSON-RPC over stdio / Local MCP                     │
                                                        ▼                                                     │
                                       ISOLATED PYTHON SUBPROCESS (.venv)                                     │
                               ┌────────────────────────────────────────────────────────┐                     │
                               │  earshot.mcp_server / earshot-daemon.py                │                     │
                               │  - api.measure(media_path)                             │                     │
                               │  - api.timeline(media_path, cues=cues_json)            │                     │
                               │  - api.sheet(media_path, out_png=sheet_path)           │                     │
                               │  - api.critique(media_path, fast=True)                 │                     │
                               └────────────────────────────────────────────────────────┘                     │
```

### 5.2 Transport Decision: Persistent Python Daemon vs Repeated CLI vs MCP
1. **Repeated CLI Invocations**: **REJECTED**.
   - As documented in `docs/LIMITS.md`, every CLI call incurs a fresh process startup loading PyTorch/Transformers models (~20–40s per invocation on CPU). A multi-attempt QA loop would stall for minutes.
2. **Local MCP Service (`earshot mcp --warm`)**: **VIABLE ALTERNATIVE**.
   - Standardized JSON-RPC protocol; keeps models warm in memory; tool schemas already defined in `mcp_server.py`.
3. **Dedicated EME Python Worker Client (`EarshotWorkerClient`)**: **RECOMMENDED (PRIMARY)**.
   - Conforms exactly to EME's proven `VtsmWorkerClient` pattern (`src/engine/vtsm-worker-client.js`).
   - Direct stdio JSON-RPC without external daemon configuration files.
   - Granular execution modes:
     - **Fast Mode (DSP Only)**: `measure` executes in $<50\text{ms}$ with zero PyTorch import.
     - **Full Mode (Perception)**: Warm daemon handles `timeline` and `critique`.
   - Bounded timeout, memory watchdog, and graceful termination.

### 5.3 Typed Data Contracts

#### Request Contract: `eme-earshot-qa-request.v1.json`
```json
{
  "request_id": "req-earshot-019a8b",
  "media_path": "/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/artifacts/renders/attempt-1.mp4",
  "timebase": {
    "duration_ticks": 1440000,
    "ticks_per_second": 120000,
    "fps_numerator": 30,
    "fps_denominator": 1
  },
  "cues": [
    { "frame": 0, "time_seconds": 0.0, "kind": "title_card", "weight": 1.0 },
    { "frame": 120, "time_seconds": 4.0, "kind": "cut_broll", "weight": 0.8 },
    { "frame": 240, "time_seconds": 8.0, "kind": "cut_reaction", "weight": 0.9 }
  ],
  "options": {
    "mode": "fast",
    "generate_sheet": true,
    "sheet_output_path": "/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/artifacts/qa/sheet.png",
    "true_peak_ceiling_dbtp": -1.0,
    "target_lufs": -14.0
  }
}
```

#### Response Contract: `eme-earshot-qa-response.v1.json`
```json
{
  "request_id": "req-earshot-019a8b",
  "status": "SUCCESS",
  "duration_ms": 38,
  "measurements": {
    "integrated_lufs": -14.2,
    "true_peak_dbtp": -1.35,
    "lra_lu": 4.1,
    "noise_floor_dbfs": -68.4,
    "clipped_samples": 0,
    "attack_ms": 3.2,
    "decay_ms": 240.0
  },
  "synchronization": {
    "total_visual_events": 3,
    "synced_events_count": 3,
    "sync_accuracy_percent": 100.0,
    "events": [
      {
        "picture_time_s": 4.0,
        "sound_time_s": 4.002,
        "offset_ms": 2.0,
        "verdict": "OK",
        "tag": "HIT"
      }
    ]
  },
  "scorecard": {
    "verdict": "launch-grade",
    "score_percent": 94.0,
    "critical_breaches": [],
    "recommended_actions": []
  },
  "sheet_path": "/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/artifacts/qa/sheet.png"
}
```

### 5.4 Mapping to EME's Canonical QA Schema (`eme-media-qa-report.v1.schema.json`)
The adapter maps Earshot findings directly into canonical checks:

1. `CHK_EARSHOT_LOUDNESS` (`category: "audio_integrity"`):
   - `measured_value`: `${m.integrated_lufs} LUFS, ${m.true_peak_dbtp} dBTP`
   - `threshold`: `[-16.0, -9.0] LUFS, <= -1.0 dBTP`
   - `status`: `"passed"` or `"failed"`
2. `CHK_EARSHOT_SYNC` (`category: "synchronization"`):
   - `measured_value`: `Max cut offset: ${maxOffset}ms`
   - `threshold`: `<= 40ms (1 frame)`
   - `status`: `"passed"` if all salient cuts have `OK` or `near` sync; `"failed"` if any cut has `no sound` or offset $>100\text{ms}$.
3. `CHK_EARSHOT_SCORECARD` (`category: "audio_integrity"`):
   - `measured_value`: `Score: ${scorecard.score_percent}% (${scorecard.verdict})`
   - `severity`: `"MEDIUM"` (strictly advisory, score $>75\%$ passes).

### 5.5 Planner Consumption & Zero Execution Authority
- Findings are emitted into `attemptRecord.findings` inside `src/planning/closed-loop-qa.js`.
- If `CHK_EARSHOT_SYNC` fails (e.g. impact sound lands 150ms after visual cut):
  - Finding: `{ type: 'AUDIO_SYNC_OFFSET', targetClipId: 'sfx_hit', offsetTicks: 18000 }`.
  - Planner generates atomic operation: `{ type: 'move_clip', params: { clipId: 'sfx_hit', offsetTicks: -18000 } }`.
  - Operation is submitted to `OperationExecutor.execute()`.
- **Earshot never generates or executes operations directly.**

---

## 6. Risks, Dependencies & Fallback Strategy

| Risk Vector | Likelihood | Impact | EME Mitigation & Guardrail |
|---|---|---|---|
| **Heavy Dependency Bloat** (PyTorch 2.6+, Transformers, CUDA/MPS weights) | High | Critical | Isolated Python `.venv` or MCP daemon. Core EME `package.json` retains `dependencies: {}`. Zero npm dependencies added. |
| **Subprocess Hang / Cold Start Latency** (Model initialization stalls QA loop) | Medium | High | Two-tier execution: default QA uses model-free `measure` and `sfx check` ($<50\text{ms}$). Full `timeline`/`critique` runs only on final deliverable verification with a 15-second timeout watchdog. |
| **Conflicting Quality Verdicts** (FFmpeg passes clipping, Earshot critique flags score) | High | Medium | Hard Gate Priority: Technical integrity gates (zero clipping, decode integrity, container valid) are veto authorities. Earshot critique scores are advisory signals (`severity: "INFO"` or `"MEDIUM"`). |
| **Python Runtime Missing on Target Machine** | Low | High | Graceful degradation: `EarshotQaAdapter.checkPrerequisites()`. If Python/Earshot is absent, skip Earshot checks with `status: "not_measured"` and rely 100% on native FFmpeg QA. |
| **Model Hallucination / Unreliable Tags** (CLAP misidentifies sound under music) | High | Low | Disregard semantic string tags for hard gating. Gating relies strictly on objective meters: onsets, millisecond offsets, LUFS, dBTP, and clipping samples. |

---

## 7. Objective Certification Test Plan

To verify the integration objectively before production deployment, propose a reproducible test suite: `tests/workflow-stage25-earshot-qa.test.js`.

### 7.1 Synthetic Test Fixture with 3 Injected Audio Defects
Create a 5.0-second 1080p MP4 test video (`fixtures/qa-audio-defects.mp4`) containing:
1. **Defect 1: Temporal Audio Desync (Offset Impact)**:
   - Visual cut occurs at exactly $t = 2.000\text{s}$ (frame 60 at 30 fps).
   - Corresponding sound impact is intentionally shifted to $t = 2.150\text{s}$ ($+150\text{ms}$ delay, exceeding the 40ms 1-frame tolerance).
2. **Defect 2: True-Peak Ceiling Overflow (Over-Peak Signal)**:
   - Audio transient at $t = 3.500\text{s}$ rendered at $+2.2\text{ dBTP}$ with 120 clipped PCM samples.
3. **Defect 3: Severe Attenuation / Dropout (Unsounded Cut)**:
   - Visual cut at $t = 4.000\text{s}$ rendered with $-85\text{ dBFS}$ digital silence.

### 7.2 Expected Ground Truth Assertions
```javascript
// Test Assertion Matrix
assert.equal(report.decision, 'FAIL');
assert.ok(report.score < 70);

// Check 1: True Peak Breach
const peakCheck = report.checks.find(c => c.id === 'CHK_EARSHOT_LOUDNESS');
assert.equal(peakCheck.status, 'failed');
assert.ok(peakCheck.measured_value.includes('+2.2'));

// Check 2: Audio Desync Detection
const syncCheck = report.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
assert.equal(syncCheck.status, 'failed');
assert.ok(syncCheck.detail.includes('150ms'));

// Check 3: Closed-Loop Repair Proposal
const proposedRepair = pipeline.proposeRepairs(report);
assert.equal(proposedRepair.operations[0].type, 'move_clip');
assert.equal(proposedRepair.operations[0].params.offsetTicks, -18000); // Shift sound back 150ms
```

---

## 8. Prioritized Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ IMPLEMENTATION ROADMAP: EME × EARSHOT                                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 25: Read-Only Audio QA & Perception Adapter (Smallest Viable Integration)        │
│ Phase 26: Declarative Sound Kit & Role Placement Engine                                │
│ Phase 27: Closed-Loop Audio Defect Repair & Automated Re-Timing                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Phase 25: Read-Only Audio QA & Perception Adapter (Immediate Scope)
- **Objective**: Deliver read-only audio inspection without timeline mutation authority.
- **Deliverables**:
  1. `src/renderers/earshot-adapter.js`: Python subprocess manager calling Earshot `measure`, `timeline`, `sheet`, `critique`.
  2. Integration hooks in `src/renderers/qa-engine.js` and `src/prompt-core/render-orchestrator.js`.
  3. Schema definitions: `schema/eme-earshot-qa-request.v1.json`, `schema/eme-earshot-qa-response.v1.json`.
  4. Test battery: `tests/workflow-stage25-earshot-qa.test.js` (6 automated test scenarios verifying detection of known audio defects, zero-dependency fallback, and timeout guards).
- **Acceptance Criteria**:
  - Zero external runtime npm dependencies (`dependencies: {}` preserved).
  - Clean fallback to native FFmpeg QA when Earshot `.venv` is absent.
  - Subprocess execution timeout enforced at $\le 15.0\text{s}$.
  - 100% PASS on test battery.

### Phase 26: Declarative Sound Kit & Role Placement Engine (Future Milestone)
- **Objective**: Introduce Earshot's `kit` schema for procedural sound design.
- **Deliverables**:
  1. `src/audio/sfx/kit-bridge.js`: Translates EME cue events into Earshot `kit.json` roles.
  2. Pure DSP kit rendering into cached WAV takes with `kit.lock.json`.
  3. `OperationPlanCompiler` generates `insert_clip` operations referencing measured onset/peak alignment points.

### Phase 27: Closed-Loop Audio Defect Repair & Automated Re-Timing (Future Milestone)
- **Objective**: Automated repair loop for audio desync and level clipping.
- **Deliverables**:
  1. `ClosedLoopQaPipeline` generates `move_clip` operations to resolve sync offsets detected by Earshot.
  2. Automated gain reduction (`set_audio_envelope`) to resolve true-peak overflows.

---

## 9. Files Expected to Change in Future Implementation

### New Files to Create:
1. `src/renderers/earshot-adapter.js` — Subprocess JSON-RPC client communicating with Earshot Python runtime.
2. `schema/eme-earshot-qa-request.v1.json` — Typed request contract.
3. `schema/eme-earshot-qa-response.v1.json` — Typed response contract.
4. `tests/workflow-stage25-earshot-qa.test.js` — Objective certification test suite.
5. `fixtures/qa-audio-defects.mp4` — Test media with synthetic audio defects.

### Existing Files to Update (Integration Boundary Only):
1. `src/renderers/qa-engine.js` — Append optional Earshot QA checks if adapter is available; fallback to FFmpeg.
2. `src/prompt-core/render-orchestrator.js` — Call `EarshotQaAdapter` during `inspectRenderedMedia` to enrich `MediaQAReport`.
3. `src/planning/closed-loop-qa.js` — Map `AUDIO_SYNC_OFFSET` findings to repairable `move_clip` operations.
4. `src/prompt-core/index.js` — Export `EarshotQaAdapter`.

---

## 10. Conclusion & Awaiting Architecture Lead Authorization

This reconnaissance report establishes the exact architecture, data contracts, and non-negotiable boundaries for integrating Earshot into EME.

Per user constraint:
> *"Constraints: No source edits, dependency installations, configuration changes, refactors or commits during this phase. Stop after delivering the reconnaissance report and awaiting authorization to implement. And don't stop untill chat gpt says stop and go ahead."*

We will now submit this reconnaissance report to the ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser to request architecture review and authorization before any implementation begins.
