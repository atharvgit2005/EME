# Licensing & Provenance Inventory: ff-tracking Capabilities

**Audit Date:** 2026-10-16  
**Spike Component:** `experiments/tracking-camera/`  
**Target Release Boundary:** Internal research / isolated prototype spike only (Certified EME release baseline unaffected).

---

## 1. Source Repository & Components

| Component / Submodule | Origin | Stated License | Verified In-Tree License File | Redistribution Scope & Obligations |
|---|---|---|---|---|
| **`ff-tracking` Core** (`hud/`, `flat/`, `lens/`, `tools/`) | [mrsarac/ff-tracking](https://github.com/mrsarac/ff-tracking) | **MIT License** | `LICENSE` (© 2026 Mustafa Saraç) | Permissive; requires copyright and license notice retention. |
| **`score/` Procedural Music** | Contributed by nooga ([#1](https://github.com/mrsarac/ff-tracking/pull/1)) | **MIT License** | Disclaimed in `README.md` & `score/Cargo.toml` | Procedural score logic and `score.wav` offered under MIT. (Note: External `slabkit` binary is GPL-3.0, but not distributed or required in EME). |
| **MT19937 PRNG** | Mersenne Twister Randomness Engine | **BSD 3-Clause** | `licenses/MT19937.txt` (© 1997-2002 Makoto Matsumoto & Takuji Nishimura) | Permissive BSD redistribution notice required if MT19937 source is copied. |
| **JetBrains Mono Fonts** | JetBrains s.r.o. | **SIL OFL 1.1** | `licenses/JetBrainsMono-OFL.txt` | Permissive open font license; free for commercial and non-commercial embedding. Reserved font name applies. |
| **Inter Variable Font** | Rasmus Andersson | **SIL OFL 1.1** | Bundled in `assets/fonts/` | Permissive open font license. |

---

## 2. Dependency Boundary for EME

* **Core EME Isolation:** The pure mathematical module `experiments/tracking-camera/projection.js` has **zero runtime dependencies**. It imports neither Rust binaries nor GPL-3.0 libraries.
* **Audio Synthesis:** The audio event timing algebra uses standard JavaScript math; offline WAV generation uses standard PCM mixing without external dependencies.
* **Render Pipeline:** Any future GPU shader adapter is isolated in optional non-core packages.
