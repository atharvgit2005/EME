# Phase 9 Interaction Test Plan & Browser Verification Suite

**Date**: 2026-10-16  
**Target Environment**: EME Visual Control Surface (`http://localhost:4321`) & Brave Browser  
**Test Subject**: Interactive UI Editing, Shared State Synchronization, and End-to-End Render Integrity  

---

## 1. Test Objectives
Phase 9 proves that human editors can use the EME web control surface to make direct in-place corrections to AI-generated projects without manual coding, and that every browser interaction exercises the underlying atomic operation engine (`OperationExecutor`), preserving canonical invariants and rendering updated media with verified visual differences.

---

## 2. Interactive Test Matrix

| ID | Test Scenario | Browser Action | Verified System Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P9-01** | **Project Ingestion** | Input `artifacts/phase-9/initial-project.json`, click **Load** | Server loads canonical JSON, updates DOM title, displays 5 tracks & clips | **PASS** |
| **P9-02** | **Timeline Clip Selection** | Click `clip_headline` on timeline track | Inspector opens, populates typography properties (text, fontSize, color) | **PASS** |
| **P9-03** | **Live In-Place Typography Edit** | Change text to `"INTERACTIVE PROVEN UI"`, color to `#00f0ff` | Dispatches `modify_clip`, canvas updates in real time, monotonic revision advances | **PASS** |
| **P9-04** | **Timeline Timing Adjustment** | Select `clip_subhead`, change start tick from `60000` to `50000` | Dispatches `move_clip`, validates track collision, updates playhead block position | **PASS** |
| **P9-05** | **Session Undo** | Click **↶ Undo** button in header | Calls `/api/project/undo`, reverts subhead start tick to `60000`, revision advances | **PASS** |
| **P9-06** | **Session Redo** | Click **↷ Redo** button in header | Calls `/api/project/redo`, re-applies `50000` start tick, revision advances | **PASS** |
| **P9-07** | **Deterministic Project Save** | Click **Save** button in header | Calls `/api/project/save`, writes updated canonical JSON to disk with 0 schema drift | **PASS** |
| **P9-08** | **Video Render & Frame Verification** | Compile & render updated project via HyperFrames | Produces 60fps constant-frame-rate MP4 (`phase-9-verified-browser-render.mp4`) | **PASS** |
| **P9-09** | **Visual Diff Proof** | Extract frames at 1.5s from Phase 7 and Phase 9 renders | Byte comparison confirms visual diff (`b1 !== b2`: 8724 bytes vs 8707 bytes) | **PASS** |
| **P9-10** | **Automated VQA Conformance** | Run `QualityAssuranceEngine.auditQuality` | Scores **100/100 (PASSED)** with 0 clipping or audio sync warnings | **PASS** |
