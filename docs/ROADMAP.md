# Editing Mechanics Engine — Build Roadmap

This roadmap defines the iterative development cycle for the AI-Operated Video Editing Mechanics Engine, driven by **Antigravity** (IDE Agent / F1 Driver), **REA** (Technical Reconnaissance & Reverse Engineering), and the **ChatGPT Web-AI Bridge** (Ideation & Prompting).

---

## 🗺️ Build Phases

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
 Audit       REA Recon    Engine       Smallest     Benchmark    F1 Driver
 Ready      Candidates    Contract      Engine       Render      Connected
[PASS]     [UPCOMING]
```

---

### Phase 0: Environment & REA Readiness Audit
- **Goal**: Audit workspace, runtimes, REA CLI/MCP availability, ChatGPT Bridge connectivity, and media asset libraries.
- **Status**: **PASS (Verified)**
- **Deliverables**:
  - `tools/audit-phase0.js` runner
  - `docs/PHASE_0_AUDIT_REPORT.md`
  - Operational bridge tools (`tools/chatgpt-bridge.js`, `tools/rea-bridge.js`)

---

### Phase 1: Software Reconnaissance using REA
- **Goal**: Investigate 3 candidate software architectures to understand rendering pipelines, motion engines, and compositing mechanics:
  1. **Remotion** (React/Canvas/WebGL headless rendering pipeline)
  2. **GSAP & Three.js** (Keyframe interpolators, easing curves, coordinate systems)
  3. **FFmpeg / MLT / Shotcut core** (Filtergraphs, alpha compositing, audio mixing)
- **Tooling**: REA CLI commands (`rea search`, `rea inspect-with-objdump`, `rea trace`, `rea observe-javascript-runtime`) + direct source inspection.
- **Deliverable**: Capability matrix, reusable patterns, license boundaries, and engine recommendations.

---

### Phase 2: Define the Mechanics Engine Contract
- **Goal**: Specify the declarative project schema and frame-accurate execution contract.
- **Specifications**:
  - Timeline & frame-rate standard (e.g. 30/60fps, integer frame addressing)
  - Multi-track hierarchy: Video, Graphics/Typography, Alpha Overlays, Audio Stems
  - Keyframing & Easing math (cubic-bezier, spring, linear)
  - Transform matrices (anchor points, scaling, rotation, opacity)
  - Audio synchronization, volume curves, and sfx trigger points
- **Deliverable**: Versioned project JSON schema (`schema/project.schema.json`) & operation specification.

---

### Phase 3: Build the Smallest Working Engine
- **Goal**: Implement a working CLI engine capable of taking a declarative project JSON and rendering an executable video file.
- **Key Modules**:
  - Track compositing pipeline
  - Typography rasterizer / motion presenter
  - Audio mixer (BGM ducking, SFX alignment)
  - Pluggable rendering adapter (FFmpeg / headless browser / WebGL)
- **Deliverable**: Executable CLI (`npm run render`), automated unit and integration tests.

---

### Phase 4: Run the Reference-Driven Benchmark
- **Goal**: Produce a 10–15 second motion-graphics edit matching reference design standards.
- **Benchmark Components**:
  - Editorial typography with custom fonts (Instrument Serif / Syne / Archivo Black)
  - Tactile editorial background / non-neon palette
  - Alpha transition overlay (whip-pan / flare / scanline)
  - Synchronized beat-aligned SFX and music ducking
- **Deliverable**: Rendered MP4 benchmark artifact, test scorecard, and failure analysis.

---

### Phase 5: Connect the F1 Driver (Antigravity Agent Interface)
- **Goal**: Expose the engine through structured CLI commands and MCP tool definitions so Antigravity can operate as the creative director and editor.
- **Capabilities**:
  - Agent creates project, proposes cuts, adjusts keyframes, triggers renders, and inspects frames.
  - Closed-loop visual QA and iterative refinement.
- **Deliverable**: Antigravity skill / MCP tool definition for full autonomous and human-guided editing.
