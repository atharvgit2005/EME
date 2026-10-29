# Phase 25 Implementation Plan: Read-Only Audio QA & Perception Adapter

**Milestone**: Phase 25 — Read-Only Audio QA & Perception Adapter  
**Predecessor Milestone**: Phase 23 (`phase-23-certified`, commit `f607bb93d809219a220f0eb405e805e016ce9d58`)  
**Architecture Lead Authority**: ChatGPT Architecture Lead  
**Authorization Directives**: `plans/CHATGPT_EARSHOT_RECON_DECISION.md` (October 21, 2026)  
**Status**: Concrete Implementation Plan for Formal Architecture Review  

---

## 1. Executive Summary & Architectural Invariants

Phase 25 integrates Earshot (`v0.3.0`) into EME strictly as an out-of-process, advisory Read-Only Audio QA & Perception Service (`EarshotQaAdapter`).

### Non-Negotiable Invariants:
1. **Zero Runtime NPM Dependencies**: Core EME `package.json` preserves `dependencies: {}`. All Earshot Python dependencies (`numpy`, `scipy`, `soundfile`, `pyloudnorm`, `librosa`, `torch`, `transformers`) reside strictly inside an isolated Python virtual environment (`.venv`).
2. **Zero Execution Authority**: Earshot has zero timeline mutation, state transition, or delivery promotion authority. `OperationExecutor` remains the sole canonical project mutation authority.
3. **Fail-Safe Native Fallback**: If Python, PyTorch, or Earshot is missing, unconfigured, or hung, EME's native FFmpeg QA pipeline (`src/renderers/qa-engine.js`) continues operating with zero interruption.
4. **Canonical Schemas Frozen**: `schema/*.v1.schema.json` remain untouched. Communication uses internal versioned adapter contracts (`src/renderers/schemas/`).
5. **Integer Microsecond Timebase**: All timestamps and offsets translate into integer ticks at $120,000\text{ ticks/second}$ and half-open intervals $[t_{\text{start}}, t_{\text{end}})$.

---

## 2. Deliverable 1: Versioned Request and Response Contracts

The integration uses internal versioned contracts residing in `src/renderers/schemas/`:

### 2.1 Request Contract (`src/renderers/schemas/earshot-qa-request.v1.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://eme.local/schemas/earshot-qa-request.v1.json",
  "title": "EarshotQaRequest",
  "type": "object",
  "additionalProperties": false,
  "required": ["request_id", "media_path", "timebase", "options"],
  "properties": {
    "request_id": {
      "type": "string",
      "pattern": "^req-earshot-[a-zA-Z0-9_-]+$"
    },
    "media_path": {
      "type": "string",
      "description": "Absolute path to rendered MP4 video or WAV audio file"
    },
    "timebase": {
      "type": "object",
      "required": ["duration_ticks", "ticks_per_second", "fps_numerator", "fps_denominator"],
      "properties": {
        "duration_ticks": { "type": "integer", "minimum": 1 },
        "ticks_per_second": { "type": "integer", "const": 120000 },
        "fps_numerator": { "type": "integer", "minimum": 1 },
        "fps_denominator": { "type": "integer", "minimum": 1 }
      }
    },
    "cues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["time_seconds", "kind"],
        "properties": {
          "frame": { "type": "integer", "minimum": 0 },
          "time_seconds": { "type": "number", "minimum": 0 },
          "kind": { "type": "string" },
          "weight": { "type": "number", "minimum": 0, "maximum": 1.0 }
        }
      }
    },
    "options": {
      "type": "object",
      "required": ["mode"],
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["fast_dsp", "full_perception"],
          "description": "fast_dsp runs model-free measure (<50ms); full_perception runs timeline & critique"
        },
        "generate_sheet": { "type": "boolean", "default": false },
        "sheet_output_path": { "type": "string" },
        "profile": {
          "type": "object",
          "properties": {
            "target_lufs": { "type": "number", "default": -14.0 },
            "lufs_tolerance": { "type": "number", "default": 2.0 },
            "true_peak_ceiling_dbtp": { "type": "number", "default": -1.0 },
            "sync_tolerance_ms": { "type": "number", "default": 40.0 }
          }
        }
      }
    }
  }
}
```

### 2.2 Response Contract (`src/renderers/schemas/earshot-qa-response.v1.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://eme.local/schemas/earshot-qa-response.v1.json",
  "title": "EarshotQaResponse",
  "type": "object",
  "additionalProperties": false,
  "required": ["request_id", "status", "duration_ms", "measurements"],
  "properties": {
    "request_id": { "type": "string" },
    "status": {
      "type": "string",
      "enum": ["SUCCESS", "NOT_MEASURED", "NOT_APPLICABLE", "TIMEOUT", "WORKER_ERROR"]
    },
    "duration_ms": { "type": "number", "minimum": 0 },
    "error": { "type": "string" },
    "measurements": {
      "type": "object",
      "properties": {
        "integrated_lufs": { "type": ["number", "null"] },
        "true_peak_dbtp": { "type": ["number", "null"] },
        "lra_lu": { "type": ["number", "null"] },
        "noise_floor_dbfs": { "type": ["number", "null"] },
        "clipped_samples": { "type": "integer", "minimum": 0 },
        "attack_ms": { "type": ["number", "null"] },
        "decay_ms": { "type": ["number", "null"] },
        "brightness_hz": { "type": ["number", "null"] },
        "spectral_flatness": { "type": ["number", "null"] }
      }
    },
    "synchronization": {
      "type": "object",
      "properties": {
        "total_cues_evaluated": { "type": "integer" },
        "synced_cues_count": { "type": "integer" },
        "max_offset_ms": { "type": "number" },
        "chance_baseline": { "type": "number" },
        "cues": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["picture_time_s", "sound_time_s", "offset_ms", "offset_ticks", "verdict"],
            "properties": {
              "picture_time_s": { "type": "number" },
              "sound_time_s": { "type": "number" },
              "offset_ms": { "type": "number" },
              "offset_ticks": { "type": "integer" },
              "verdict": { "type": "string", "enum": ["OK", "near", "swell", "peak", "off", "no sound"] },
              "tag": { "type": "string" }
            }
          }
        }
      }
    },
    "scorecard": {
      "type": "object",
      "properties": {
        "verdict": { "type": "string" },
        "score_percent": { "type": "number" },
        "actions": { "type": "array", "items": { "type": "string" } }
      }
    },
    "sheet_path": { "type": "string" }
  }
}
```

### 2.3 Status Taxonomy Semantics
- `SUCCESS`: Earshot daemon executed and returned valid measurements.
- `NOT_MEASURED`: Python environment or Earshot package is not installed/configured; native FFmpeg QA carries the decision with zero failure.
- `NOT_APPLICABLE`: Audio file is silent or shorter than 0.4s (skips LUFS/LRA gracefully).
- `TIMEOUT`: Execution exceeded the watchdog budget; worker slot is reclaimed; native FFmpeg QA continues.
- `WORKER_ERROR`: Subprocess crashed or emitted non-JSON output; cleanly caught and logged without crashing EME.

---

## 3. Deliverable 2: Worker Process Lifecycle & Safety Architecture

The subprocess worker client (`EarshotWorkerClient`) is implemented in `src/renderers/earshot-worker-client.js`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ EARSHOT WORKER CLIENT LIFECYCLE & THREAT BOUNDARY                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Python Discovery     │ EARSHOT_PYTHON env -> .venv-earshot -> system python3        │
│ 2. Sanitized Child Env  │ Whitelist: PATH, HOME, TMPDIR. Purges all credentials.       │
│ 3. Media Path Sandbox   │ Assert path inside repoRoot or /tmp/ scratch dir.            │
│ 4. Two-Tier Timeouts    │ fast_dsp: 2,000ms watchdog; full_perception: 15,000ms.       │
│ 5. Stdio Protocol       │ JSON-RPC lines over stdin/stdout, max 10MB line buffer.      │
│ 6. Process Termination  │ SIGTERM with 1,000ms grace period -> SIGKILL tree cleanup.   │
│ 7. Concurrency Bound    │ maxQueueDepth = 8; sheds LOW priority requests when full.    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Python Virtual Environment Discovery**:
   - Checks `process.env.EARSHOT_PYTHON`.
   - Checks local `.venv-earshot/bin/python` or `/tmp/earshot/.venv/bin/python`.
   - Checks system `which earshot` / `python3 -m earshot.api`.
   - If missing, `checkPrerequisites()` immediately returns `{ ok: false, reason: 'EARSHOT_UNAVAILABLE' }`.
2. **Sanitized Child Environment**:
   - Uses EME's `sanitizeChildEnv()` (`src/prompt-core/resource-guard.js`) to purge all sensitive tokens (`AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, `DATABASE_PASSWORD`, `AUTH_BEARER_TOKEN`).
3. **Media Path Containment & Authorization**:
   - `assertAuthorizedPath(mediaPath)` verifies that the target file is strictly inside `repoRoot` or `/tmp/` and does not contain `..` path traversal segments.
4. **Two-Tier Timeout Watchdogs**:
   - `fast_dsp` (model-free `measure`): **2,000ms** watchdog budget.
   - `full_perception` (`timeline` & `critique`): **15,000ms** watchdog budget.
   - On watchdog expiry: sends `SIGTERM`, unblocks caller with `status: "TIMEOUT"`, and sends `SIGKILL` after 1,000ms if process has not exited.

---

## 4. Deliverable 3: Exact Integration Points & Change Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ EME CORE REPO FILE CHANGES                                                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ NEW: src/renderers/earshot-worker-client.js           │ Python subprocess client       │
│ NEW: src/renderers/earshot-adapter.js                 │ High-level JavaScript facade   │
│ NEW: src/renderers/schemas/earshot-qa-request.v1.json │ Adapter request contract       │
│ NEW: src/renderers/schemas/earshot-qa-response.v1.json│ Adapter response contract      │
│ MOD: src/renderers/qa-engine.js                       │ Adds optional Earshot hooks    │
│ MOD: src/prompt-core/render-orchestrator.js           │ Enriches inspectRenderedMedia  │
│ MOD: src/prompt-core/index.js                         │ Exports EarshotQaAdapter       │
│ FROZEN: schema/*.v1.schema.json                       │ Zero canonical schema changes  │
│ FROZEN: package.json                                  │ Zero npm dependencies added    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Integration Flow:
1. In `src/renderers/qa-engine.js` (`QualityAssuranceEngine.auditQuality`):
   - Executes native FFmpeg checks as usual (`astats`, `ebur128`, `blackdetect`).
   - If options enable Earshot (`options.enableEarshot !== false`), calls `EarshotQaAdapter.inspectMedia(renderedMp4Path, { project, cues })`.
   - If Earshot succeeds:
     - Appends `CHK_EARSHOT_LOUDNESS` to `report.checks`.
     - Appends `CHK_EARSHOT_SYNC` to `report.checks`.
     - If advisory scorecard is available, appends `CHK_EARSHOT_SCORECARD`.
   - If Earshot is absent or fails:
     - Appends `CHK_EARSHOT_LOUDNESS` with `status: "not_measured"` and details explaining fallback to native FFmpeg.
     - Never causes QA report to fail due to absent external tool.
2. In `src/prompt-core/render-orchestrator.js` (`RenderOrchestrator.inspectRenderedMedia`):
   - Passes project cues and frame rate to `QualityAssuranceEngine.auditQuality`.
   - Attaches generated `artifacts/qa/sheet.png` to the deliverable artifacts bundle if generated.

---

## 5. Deliverable 4: Ground-Truth Fixture Generation Procedure

To certify the integration objectively, generate synthetic test fixture `fixtures/qa-audio-defects.mp4`:

### Fixture Specifications:
- **Duration**: Exactly $5.000\text{ seconds}$ ($600,000\text{ ticks}$).
- **Video Stream**: 1080p ($1920 \times 1080$) at 30.0 fps (H.264, 150 frames).
- **Audio Stream**: Stereo 48.0 kHz 16-bit PCM (AAC, 192 kbps).

### Three Injected Defect Ground Truths:
1. **Defect 1: Temporal Audio Desync (Late Impact)**:
   - Visual cut from Card A to Card B occurs at $t = 2.000\text{s}$ (frame 60).
   - Corresponding sound impact is placed at $t = 2.150\text{s}$ ($+150\text{ms}$ delay).
   - Expected `offset_ms`: $+150.0\text{ ms} \pm 2\text{ms}$.
   - Expected `offset_ticks`: $+18,000\text{ ticks}$.
   - Expected verdict: `"off"` (exceeds $40\text{ms}$ 1-frame tolerance).
2. **Defect 2: True-Peak Ceiling Overflow (Over-Peak Signal)**:
   - Audio transient at $t = 3.500\text{s}$ synthesized with $+2.2\text{ dBTP}$ unclipped peak, then passed through hard limiter generating 120 clipped samples and measured $+1.8\text{ dBTP}$ true peak.
   - Target ceiling: $\le -1.0\text{ dBTP}$.
   - Expected verdict: `"failed"`, measured true peak $> -1.0\text{ dBTP}$.
3. **Defect 3: Severe Attenuation / Unsounded Cut (Dropout)**:
   - Visual cut from Card B to Card C occurs at $t = 4.000\text{s}$ (frame 120).
   - Audio is zeroed (digital silence $<-85\text{ dBFS}$) over $[3.900\text{s}, 4.200\text{s}]$.
   - Expected verdict: `"no sound"` / `"failed"`.

---

## 6. Deliverable 5: Comprehensive Test Matrix

Test battery implemented in `tests/workflow-stage25-earshot-qa.test.js`:

| Test ID | Test Scenario | Input / Precondition | Expected Assertion / Behavior |
|---|---|---|---|
| **E25-01** | `Normal Operation (DSP Fast Path)` | Clean rendered MP4 media | Returns `status: "SUCCESS"`, `duration_ms < 500`, valid `integrated_lufs`, `true_peak_dbtp`. |
| **E25-02** | `Absent Python / Earshot Fallback` | Non-existent python path (`/bad/path`) | Returns `status: "NOT_MEASURED"`. Native FFmpeg QA passes cleanly with zero throw. |
| **E25-03** | `Watchdog Timeout Enforcement` | Mock worker script with infinite loop | Watchdog fires at 2,000ms. Process killed via SIGKILL. Returns `status: "TIMEOUT"`. |
| **E25-04** | `Malformed Output & Error Resilience` | Mock worker emitting garbage non-JSON stdout | Returns `status: "WORKER_ERROR"`. EME logs error and continues native QA. |
| **E25-05** | `Security Path Traversal Defense` | Target path `../../etc/passwd` | Adapter throws `ERR_UNAUTHORIZED_PATH` before invoking subprocess. |
| **E25-06** | `Synthetic Defect Detection` | `fixtures/qa-audio-defects.mp4` | Detects $+150\text{ms}$ desync (`CHK_EARSHOT_SYNC` fails), detects true peak breach (`CHK_EARSHOT_LOUDNESS` fails). |
| **E25-07** | `Zero Project Mutation Verification` | Ingest project, run full Earshot QA | Deep equality check confirms project revision, clips, tracks, and duration are 100% identical before and after. |

---

## 7. Deliverable 6: Dependency & Installation Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DEPENDENCY ISOLATION ARCHITECTURE                                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ EME Node.js Project Root (/editing-mechanics-engine)                                  │
│   ├── package.json -> dependencies: {} (STRICTLY PRESERVED)                           │
│   └── node_modules -> 0 external runtime dependencies                                 │
│                                                                                        │
│ Earshot Python Environment (/tmp/earshot/.venv or .venv-earshot)                       │
│   ├── python >= 3.10                                                                   │
│   └── pip install numpy scipy soundfile soxr pyloudnorm librosa torch transformers     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Runtime Packaging Guarantee**: When `npm run package` runs to produce `dist/editing-mechanics-engine-0.1.0-rc1.tgz`, Earshot is **not** packaged into the tarball.
- The release manifest continues to report `"runtime_npm_packages": 0`.
- Earshot is discovered at runtime via environment variable or sibling `.venv`.

---

## 8. Deliverable 7: Acceptance Criteria & Rollback Plan

### Acceptance Criteria:
1. `tests/workflow-stage25-earshot-qa.test.js`: All 7 tests pass (100% PASS).
2. Existing regression suite: Cumulative Phase 21–23 battery (74 / 74 PASS).
3. Zero npm runtime dependencies maintained (`dependencies: {}`).
4. Canonical schemas untouched.
5. Invariant check: Project state after QA inspection is byte-for-byte identical to pre-inspection state.

### Integration Rollback Procedure:
If any regression, test failure, or architectural inconsistency occurs during Phase 25 implementation:
```bash
# Emergency Rollback to Certified Phase 23 Baseline:
git reset --hard phase-23-certified
git clean -fd
npm test # Verifies 74/74 regression pass on certified Phase 23 baseline
```
The approved rollback baseline remains the Phase 20 Path B certified tarball (`96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282`).

---

## 9. Next Steps

With the Phase 25 Implementation Plan completed, we will submit this plan to the ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser to request formal authorization to begin coding Stage 25.1.
