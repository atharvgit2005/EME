# Milestone Phase 26 Implementation Plan: Declarative Sound Kit & Role Placement Engine

**Milestone**: Phase 26 — Declarative Sound Kit & Role Placement Engine
**Branch**: `feature/phase-26-sound-kit-engine` (branched from `main` at certified release `phase-25-certified`, commit `10a046614db0a70707981c360556c454b194c75a`)
**Architecture Lead Authority**: ChatGPT Architecture Lead
**Authorization Directives**: `plans/CHATGPT_PHASE25_RELEASE_AUTHORIZED.md`
**Date**: October 22, 2026
**Status**: Proposal & Implementation Plan for Architecture Lead Review

---

## 1. Executive Summary & Architectural Motivation

In Phase 25, we established **Earshot** as a certified, read-only perception and objective QA service (`EarshotAdapter`), providing model-free DSP verification, delivery profile compliance, and audio-to-picture sync analysis.

In accordance with the Architecture Lead's release directives in `plans/CHATGPT_PHASE25_RELEASE_AUTHORIZED.md`, **Phase 26** introduces the **Declarative Sound Kit & Role Placement Engine**:
- Evaluates Earshot's deterministic sound synthesis/bank and `kit.lock.json` workflow as an asset-generation bridge.
- Strictly decouples sound synthesis/asset generation from timeline mutation and perception inspection.
- Leverages Earshot's measured transient metadata (`onset_s`, `peak_s`, `end_s`, `dur_s`, `peak_db`) to achieve mathematically exact, frame-accurate sound alignment on visual cuts and editorial cues ($t_{\text{start}} = t_{\text{cut}} - t_{\text{align}}$).
- Routes all timeline modifications strictly through EME's existing operation planning and canonical `OperationExecutor` (`add_clip`, `move_clip`).
- Closes the loop by running Phase 25's certified `EarshotAdapter` to verify that placed sounds achieve $\le 1\text{ frame}$ sync alignment and compliant true-peak ceilings.

---

## 2. Non-Negotiable Architectural Invariants

1. **Zero Runtime NPM Dependencies**: Core EME `package.json` preserves `dependencies: {}`. All Earshot Python modules execute out-of-process in `/tmp/earshot/.venv`.
2. **Strict Generation / Execution Separation**:
   - Earshot synthesizes sound assets (`.wav`) and emits metadata (`kit.lock.json`).
   - Earshot has **zero authority** to modify EME project files, timeline state, or render jobs.
   - All timeline updates are expressed as canonical EME operations executed solely by `OperationExecutor`.
3. **Physical Alignment Math**:
   - For `align: "peak"` (e.g. `whoosh.short`, `whoosh.long`): $t_{\text{start\_ticks}} = t_{\text{cut\_ticks}} - \text{round}(t_{\text{peak}} \times 120,000)$.
   - For `align: "onset"` (e.g. `pop`, `tick`, `hit`, `land`, `click`, `bell`): $t_{\text{start\_ticks}} = t_{\text{cut\_ticks}} - \text{round}(t_{\text{onset}} \times 120,000)$.
   - All timestamps and durations remain strict integer ticks at $120,000\text{ ticks/second}$ ($1\text{ms} = 120\text{ ticks}$).
4. **Frozen Canonical Schemas**: All 18 canonical schemas in `schema/*.v1.schema.json` remain 100% frozen. Internal contracts reside in `src/audio/schemas/`.
5. **Fail-Safe Native Fallback**: If Python or Earshot is missing, EME's native SFX engine (`src/audio/sfx/index.js`, SJC pack catalog, and procedural synths) continues operating seamlessly.

---

## 3. Stage-by-Stage Implementation Breakdown

### Stage 26.1: Sound Kit Contract & `kit.lock.json` Validator
- **File**: `src/audio/schemas/earshot-sound-kit.v1.json`
- **File**: `src/audio/sfx/earshot-kit-validator.js`
- **Scope**:
  - Validates declarative sound kit definitions (`name`, `preset`, `sr`, `roles`) and lockfiles (`kit.lock.json`).
  - Strict Draft 2020-12 schema validation (`additionalProperties: false`, valid URI `$id`).
  - Validates measured properties for each take: `onset_s`, `peak_s`, `end_s`, `dur_s`, `peak_db`, `sha1`.
- **Tests**: `tests/workflow-stage26-1-kit-contract.test.js` (Schema conformance, rejection of malformed lockfiles, float validation).

### Stage 26.2: Isolated Python Sound Kit Bridge & Generator Client
- **File**: `src/audio/sfx/earshot-kit-bridge.py`
- **File**: `src/audio/sfx/earshot-kit-client.js`
- **Scope**:
  - Out-of-process Python subprocess bridge running in `/tmp/earshot/.venv`.
  - Invokes `earshot.forge.kit.init`, `plan`, and `render` to generate sound takes deterministically into authorized project asset paths (`assets/sound_kits/<kit-name>/`).
  - Subprocess lifecycle watchdog: independent generation timeout budget (30s max for complete kit rendering, 5s for planning), environment token sanitization, and strict `fs.realpathSync` path containment.
- **Tests**: `tests/workflow-stage26-2-kit-bridge.test.js` (Bridge startup, deterministic take generation, path escape rejection, timeout watchdog).

### Stage 26.3: Sound Kit Ingestion & Role Catalog
- **File**: `src/audio/sfx/sound-kit-catalog.js`
- **Scope**:
  - Ingests generated `kit.lock.json` and assets into EME's audio catalog (`SfxCatalog` / `SoundKitCatalog`).
  - Indexes takes by role (`tick`, `hit`, `land`, `pop`, `whoosh.short`, `click`, `bell`, `text`).
  - Exposes transient alignment points (`getAlignmentOffsetTicks(role, takeIndex)`).
  - Implements round-robin or deterministic seeded take selection to avoid repetitive "machine gun" sound artifacts.
- **Tests**: `tests/workflow-stage26-3-kit-catalog.test.js` (Role lookup, take variation selection, alignment offset derivation).

### Stage 26.4: Deterministic Role Placement Engine
- **File**: `src/audio/sfx/role-placement-engine.js`
- **Scope**:
  - Analyzes timeline visual cuts, text reveals, and markers to propose semantic sound roles.
  - Computes exact placement intervals using physical transient offsets ($t_{\text{start}} = t_{\text{event}} - t_{\text{align}}$).
  - Emits canonical EME operation batches (`add_clip` with `type: "audio"`, track assignment, gain, pan).
  - Applies dialogue ducking envelopes around speech segments.
  - Zero project mutation in the engine itself; returns operation plan for `OperationExecutor`.
- **Tests**: `tests/workflow-stage26-4-placement-engine.test.js` (Cut-to-whoosh placement math, text-to-pop placement, dialogue collision avoidance).

### Stage 26.5: Closed-Loop Verification & Cumulative Regression
- **File**: `tests/workflow-stage26-sound-kit.test.js`
- **Scope**:
  - End-to-end integration test:
    1. Render sound kit `calm` via `EarshotKitClient`.
    2. Place SFX cues on an edit brief with visual cuts and text titles using `RolePlacementEngine`.
    3. Execute operations via `OperationExecutor`.
    4. Render media with audio layers mixed via `mixAudioLayers`.
    5. Run Phase 25's certified `EarshotAdapter.auditAudioQuality` on the rendered output.
    6. Verify that all placed cues pass the $\le 1\text{ frame}$ synchronization tolerance ($\le 33.3\text{ms}$) and true-peak compliance!
  - Cumulative regression battery across all phases (Phases 21–26).
- **Tests**: `tests/workflow-stage26-sound-kit.test.js` (10/10 acceptance scenarios PASS).

---

## 4. Acceptance Criteria & Certification Gates

1. **Deterministic Regeneration**: Calling kit render with the same seed produces identical SHA-1 audio files.
2. **Transient Math Precision**: Placed audio events align with target visual cues within $\pm 10\text{ ticks}$ of theoretical offset.
3. **Closed-Loop Audit**: Rendered timeline passes Phase 25's `EarshotAdapter` sync check (`aligned === true`, mean offset $\le 1\text{ frame}$).
4. **Zero Mutation Invariant**: `EarshotKitClient` and `RolePlacementEngine` expose zero project mutation authority; all project mutations execute via `OperationExecutor`.
5. **Zero Runtime NPM Dependencies**: Core EME preserves `dependencies: {}`.
6. **Cumulative Regression**: 100% PASS across Phases 21–26 (0 failures, 0 regressions).

---

## 5. Submission for Architecture Lead Review

We submit this implementation plan for the formal review and authorization of the ChatGPT Architecture Lead.
