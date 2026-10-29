# Third-Party Software Notices and Asset Licensing Ledger

This document details the licensing, attribution, and redistribution considerations for external software, libraries, and assets utilized or integrated with the **Editing Mechanics Engine (EME)**.

---

## 1. Core Runtime Dependencies & Libraries

### 1.1 HyperFrames
- **Project**: HyperFrames Rendering CLI & Web-based Motion Framework
- **Repository**: `https://github.com/hyperframes/hyperframes` (npm: `hyperframes@0.8.162`)
- **License**: **Apache License 2.0**
- **Relationship**: External rendering dependency. Not bundled in the core EME npm package. Resolved dynamically or via local installation.
- **Redistribution**: Permitted under Apache-2.0 terms.

### 1.2 GSAP (GreenSock Animation Platform)
- **Project**: GSAP Core
- **Repository**: `https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js`
- **License**: **Standard GreenSock License** (free for non-commercial and standard public web use; Business Green required for commercial redistributions).
- **Relationship**: Dynamically referenced via CDN in compiled HyperFrames HTML compositions. Not bundled in the EME tarball.

### 1.3 Ajv (Another JSON Schema Validator)
- **Project**: Ajv JSON Schema Validator
- **License**: **MIT License**
- **Copyright**: (c) 2015-2021 Evgeny Poberezkin
- **Relationship**: Bundled dependency for canonical project schema and semantic validation.

---

## 2. External Media & System Binaries

### 2.1 FFmpeg and ffprobe
- **Project**: FFmpeg Multimedia Framework
- **License**: **LGPL v2.1+ / GPL v2+** (depending on compiled external libraries: x264, etc.)
- **Relationship**: External system binary. EME communicates with FFmpeg and ffprobe exclusively via subprocess interfaces with structured arguments (`spawnSync`). FFmpeg binaries are **never bundled or redistributed** within EME npm packages.

### 2.2 Bundled / Test Assets Exclusion Policy
The following local test assets residing in `assets/` and `artifacts/` are strictly **EXCLUDED** from the published npm package:
1. **Instrument Serif Font**: SIL Open Font License 1.1 (used locally for benchmark typography).
2. **Syne & Archivo Fonts**: SIL Open Font License 1.1 (used locally for benchmark typography).
3. **Inter Font (`Inter-Variable.ttf`)**: SIL Open Font License 1.1 (used for default typography and QA test rendering).
4. **Snowfall BGM (`snowfall.mp3`)**: Private/creative commons demo music stem.
5. **Transition Alpha WebM Videos**: Private test animations.
6. **Full Reference MP4s**: Large binary test artifacts.

All npm packages produced via `npm pack` enforce the `files` allowlist:
- `bin/` (CLI & MCP server binaries)
- `src/` (Core engine, validator, compiler, renderer adapter, MCP server)
- `schema/` (Canonical JSON schemas)
- `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`

No proprietary or unverified audio/video/font assets are packaged into the release candidate.
