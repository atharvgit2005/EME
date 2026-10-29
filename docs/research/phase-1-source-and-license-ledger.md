# Phase 1 — Source and License Ledger

**Project**: Editing Mechanics Engine  
**Date**: 2026-10-15  
**Review Status**: Complete

---

## 1. Candidate Project Ledger

| Candidate | Inspected Version / Source | Primary License | Proposed Classification | Components Considered | Licensing Obligations & Risk Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HyperFrames** | `v0.8.82` ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) | Proprietary / Dual-license | **Reuse as Rendering Adapter** | CLI rendering runner, DOM `data-*` timing conventions, CDP screenshot stepping | Core engine runtime is pre-packaged. Can be driven as an external subprocess CLI (`npx hyperframes render`) without incorporating proprietary code into our codebase. |
| **MakeMyClip Editor** | `main` ([MakeMyClip/editor](https://github.com/MakeMyClip/editor)) | MIT License | **Adapt Patterns** | MCP Tool schemas, operation validation, snapshotting, execution logging | Permissive MIT license allows adapting tool schemas and architectural designs into our custom engine without viral licensing conditions. |
| **Motion Canvas** | `v3.16.x` ([motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas)) | MIT License | **Reference-Only** | Easing functions, spring physics math, reactive signal propagation | MIT license is fully permissive. We will reference the mathematical formulas for cubic-bezier interpolation and spring physics rather than bundling the generator runtime. |
| **OpenCut & OpenCut Classic** | `main` ([OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut)) | GPL-3.0 / MIT | **Reference-Only** | `MediaTime` high-precision integer tick system, multi-track ripple state representation | OpenCut's active rewrite is under GPL-3.0. To avoid copyleft contamination, we **must not copy** any OpenCut code. We reference only the conceptual design of integer ticks (120,000 ticks/sec) and track models. |

---

## 2. Shared Runtime & Foundation Dependencies

| Technology | License | Usage in EME | Obligations / Constraints |
| :--- | :--- | :--- | :--- |
| **FFmpeg** | LGPL 2.1+ / GPL 3.0 (with `--enable-gpl`) | Video/Audio compositing & muxing backend | Executed as an isolated CLI binary via `child_process`. No dynamic C/C++ linking, ensuring our codebase remains independently licensed under MIT. |
| **GSAP (GreenSock)** | Standard Web License | Animation tweening & timeline sequencing | Used in browser/HTML composition layer. Royalty-free for standard web and video rendering usage. |
| **REA Platform** | MIT License | Technical reconnaissance & capability auditing | Shipped under `/Users/atharvpaharia100/REA`. Operates as an external CLI/MCP process with no license conflicts. |

---

## 3. Items Requiring Ongoing Legal / Licensing Review

1. **HyperFrames Commercial Terms**: Since HyperFrames is developed by HeyGen, verify whether production rendering of client videos requires a commercial license key beyond local developer usage.
2. **GPL Isolation for OpenCut**: Strictly adhere to clean-room implementation for timeline data structures to guarantee zero code contamination from OpenCut.
