# Licensing & Asset Redistribution Audit

**Release Candidate**: `v0.1.0-rc1`  

---

## 1. Engine Core Licensing
The Editing Mechanics Engine (EME) source code is licensed under the **MIT License** (see [LICENSE](file:///Users/atharvpaharia100/editing-mechanics-engine/LICENSE)).

---

## 2. Third-Party Component Licensing

| Component | License | Role | Redistribution Strategy |
| :--- | :--- | :--- | :--- |
| **HyperFrames** | Apache-2.0 | Rendering engine | External dependency via `npx` or global package. Not vendored into npm tarball. |
| **GSAP** | GreenSock License | Browser animation engine | Dynamically linked from CDN in intermediate HTML. Not bundled. |
| **FFmpeg / ffprobe** | LGPL 2.1+ / GPL 2+ | Video encoding & frame extraction | System binary invoked via subprocess. Not distributed. |
| **Ajv** | MIT | JSON Schema validation | Direct npm dependency. |

---

## 3. Asset Redistribution Policy

The local media assets located in `assets/` (Instrument Serif font, Syne font, Archivo font, Snowfall BGM, and transition WebMs) are for **internal integration benchmarking and testing only**.

They are **explicitly excluded** from the npm package via the `files` directive in `package.json`:
- Included: `bin/`, `src/`, `schema/`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`.
- Excluded: `assets/`, `artifacts/`, `examples/`, `tests/`, `tools/`.
- Unpacked npm tarball size: **114.7 kB** (zero binary media or unverified assets).
