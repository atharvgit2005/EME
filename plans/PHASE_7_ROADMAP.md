# Phase 7 Engineering Roadmap: Real-World Editing Reliability & Workflow Generalization

**Governing Directive**: ChatGPT Assessment & Specification (approved Phase 6 RC1, signed off on Phase 7 roadmap).  
**Execution Objective**: Prove EME can reliably interpret and execute varied creative briefs, multiple aspect ratios (16:9 widescreen, 9:16 vertical short-form, 1:1 square), layered compositing, audio ducking/envelopes, and iterative revisions without human intervention, maintaining state integrity, zero schema drift, and deterministic atomic execution.

---

## Architecture Sub-Phases

### Phase 7A: Multi-Scenario Benchmark Suite
Create and render three distinct real-world editing scenarios:
1. **Scenario 1 — YouTube Tech Explainer (16:9 Landscape - 1920x1080 @ 60fps)**:
   - Dynamic lower thirds, split-screen PIP (picture-in-picture), animated accent bars, subtle difference blending, audio background bed + ducked voiceover track.
2. **Scenario 2 — Social Media Reel / TikTok Ad (9:16 Vertical - 1080x1920 @ 60fps)**:
   - High-energy kinetic text captions, staggered entrance keyframes, chromatic accent pulses, fast cuts, beat-synced audio transitions.
3. **Scenario 3 — E-Commerce Product Spotlight (1:1 Square - 1080x1080 @ 60fps)**:
   - Centered product card with dynamic drop shadows, price tag callout, subtle zoom/pan transforms, smooth cross-dissolve fade out.

### Phase 7B: Agent Reliability & Metrics Suite
Measure autonomous editing reliability:
- First-pass success rate (synthesizing valid EME operations directly from unstructured brief).
- Invariant preservation: Verifying existing tracks, clips, and markers outside the edit scope remain 100% byte/field-identical.
- Error recovery: Deliberate injection of invalid operations (e.g. invalid time range, missing asset ID, collision) and testing agent auto-correction via structured error responses.

### Phase 7C: Automated Visual & Audio Quality Assurance (VQA)
Enhance frame inspection engine:
- Visual QA checks: Bounding box clipping detection, asset presence verification, layer stacking order assertion.
- Audio QA checks: RMS audio level verification, silence detection, duration sync check between audio and video tracks.
- Deterministic score generation (`QualityScore` 0-100) returned inline to agent.

### Phase 7D: Iterative Multi-Turn Revision Workflow
Simulate real client feedback rounds:
- Round 1: "Make the headline subtitle larger and change color to fluorescent cyan."
- Round 2: "Trim the middle segment by 1.5 seconds and ripple-delete downstream clips."
- Round 3: "Add a 0.5s audio fade-out and motion blur zoom on the end card."
- Verify that every turn retains stable entity IDs, increments revision sequentially, and produces compliant renders.
