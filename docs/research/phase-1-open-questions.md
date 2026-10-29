# Phase 1 — Open Questions and Postponed Decisions

**Project**: Editing Mechanics Engine  
**Date**: 2026-10-15  
**Review Status**: Open

---

## 1. Unresolved Implementation Questions

1. **Rendering Performance Comparison (HyperFrames vs Direct FFmpeg)**:
   - *Question*: How fast does HyperFrames render a 15-second multi-track 60fps composition on this Apple Silicon machine versus a pure FFmpeg filtergraph?
   - *Plan*: In Phase 3 & 4 benchmarks, run side-by-side timing tests comparing wall-clock rendering time and frame throughput.

2. **Complex Shader / Blend Mode Compositing (Benchmark B - X-Ray Effect)**:
   - *Question*: Can CSS `mix-blend-mode: difference` inside a headless browser tab match the visual fidelity and performance of an FFmpeg `blend=all_mode=difference` or GLSL shader filter?
   - *Plan*: Prototype a single-frame blend test comparing CSS difference blending against FFmpeg difference blending in Phase 3.

3. **Audio Ducking and Waveform Analysis**:
   - *Question*: Does HyperFrames provide automatic sidechain compression / audio ducking between speech and BGM, or must our Mechanics Engine precalculate audio volume envelopes?
   - *Evidence*: Local HyperFrames skills show volume keyframing, but automatic sidechain compression is not native.
   - *Decision*: The Editing Mechanics Engine must calculate volume curve keyframes explicitly during the timeline compilation step.

---

## 2. Explicit Decisions to Postpone

1. **GUI Timeline Interface**: Postpone all frontend React/Canvas/GPUI timeline canvas code until after the headless CLI engine, schema, and reference benchmark pass.
2. **Specialized ML Editing Models**: Confirmed postponed per ChatGPT alignment; prioritize rule-based deterministic editing mechanics first.
3. **Rust Core Migration**: Postpone any native Rust rewrite; build Phase 2 & 3 in TypeScript/Node.js to maximize iteration speed and Antigravity agent tool ergonomics.
