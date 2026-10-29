# ADR-002: Renderer Adapter Isolation via Intermediate Compilation

**Status**: Accepted  
**Date**: 2026-10-15  
**Deciders**: Antigravity, ChatGPT Planning Session  

---

## Context
Video rendering engines frequently evolve or become deprecated. For example, browser-based rendering (HyperFrames) offers unmatched CSS layout, typography, and SVG capabilities, but native FFmpeg filtergraphs are faster for raw video stream clipping and format transcoding. Furthermore, proprietary licensing or upstream shifts may necessitate swapping the underlying renderer.

If the core editing project schema or agent tools depend directly on HyperFrames HTML tags or FFmpeg filtergraph strings, any change in rendering backend requires a full system rewrite.

## Decision
1. **Canonical Schema Purity**: The EME project schema (`schema/eme-project.v1.schema.json`) must remain 100% agnostic of rendering technologies. It contains only declarative editing intent (tracks, clips, keyframes, typography, effects).
2. **Intermediate Compiler Pipeline**: Each rendering engine is encapsulated inside an isolated `RendererAdapter`.
   - `HyperFramesAdapter`: Compiles canonical JSON into HTML/DOM/GSAP files in a temporary compilation directory (`.eme/build/hyperframes/`).
   - `FFmpegAdapter`: Compiles canonical JSON into FFmpeg `-filter_complex` command lines.
3. **Explicit Capability Reporting**: Each adapter reports its supported effects and formats. If an adapter cannot execute an effect, compilation fails explicitly (`ERR_UNSUPPORTED_EFFECT`) rather than silently omitting it.

## Consequences
- HyperFrames can be upgraded, replaced, or run headlessly without touching the editing project format or Antigravity's agent tools.
- Multi-backend rendering is supported: an agent can generate a fast FFmpeg preview and a high-fidelity HyperFrames final render from the exact same project file.
