# VTSM-01: Visual Temporal State Model Foundation and Benchmark

## 1. Mission Overview
**VTSM-01** is an isolated experimental subsystem within the Editing Mechanics Engine (EME) that transforms video streams into timestamp-accurate, persistent visual temporal state:
- **Persistent Entity Identities & Trajectories**: Stable track IDs across frames, bounding boxes (pixel and normalized), centers, and camera-compensated motion vectors.
- **Global Camera Motion**: Frame-to-frame affine transform estimation ($dx, dy$, scale, rotation), model classification (`identity`, `translation`, `affine`), and inlier confidence.
- **Scene-Cut & Shot Detection**: Exact shot boundary frames, presentation timestamps (PTS), and cut confidence.
- **Temporal Event Stream**: Entrances, exits, occlusions, and reappearance tracking.
- **Explicit Uncertainty**: Calibrated confidence scores, validity flags, and rejection of ambiguous, blank, or heavily blurred footage.

---

## 2. Strict Architectural Boundaries
- **Isolated Workspace**: Located exclusively in `experiments/visual-temporal-state/`.
- **Zero Production Mutations**: Production files (`src/`, `bin/`, `schema/`, `package.json`, release artifacts) remain completely untouched and read-only.
- **Isolated Perception Runtime**: All computer vision and deep learning dependencies (`opencv-python-headless`, `torch`, `ultralytics`, `numpy`) live in an isolated virtual environment (`.venv`). Zero production package bloat.
- **Deterministic Timebase Integration**: Bridges EME's integer 120,000 tick/sec presentation clock with rational FPS video streams, guaranteeing zero non-monotonic timestamps and lossless rational conversion.

---

## 3. Directory Layout
```
experiments/visual-temporal-state/
├── README.md                           # System overview & reproduction guide
├── schema/
│   └── vtsm-state.v1.schema.json      # Versioned JSON Schema for temporal state
├── src/
│   ├── timebase.js                    # EME 120kHz tick <-> PTS rational timebase
│   ├── state-model.js                 # BBox normalization, IoU, center, motion delta
│   ├── validate-state.js              # Strict semantic validator & schema assertion
│   ├── baseline/
│   │   ├── pipeline.py                # Reference classical vision pipeline
│   │   ├── benchmark_all.js           # Multi-fixture test runner
│   │   ├── benchmark_learned.py       # Pretrained candidate comparison (YOLO11+ByteTrack)
│   │   └── visual_evidence.py         # Overlay video & contact sheet generator
│   ├── fixtures/
│   │   └── generator.js               # Procedural 7-fixture generator (1080p@30fps)
│   └── metrics/
│       └── evaluator.js               # Quantitative evaluation against ground truth
├── tests/
│   └── schema.test.js                 # Automated unit tests for schema & timebase
├── fixtures/                          # Generated MP4 clips & ground truth JSONs (A-G)
├── results/                           # Model inference outputs & benchmark-results.json
├── artifacts/                         # Annotated overlay videos & contact sheet PNG
└── docs/
    ├── VTSM_01_BASELINE.md            # Reconnaissance & gap analysis vs EME
    ├── VTSM_01_RESULTS.md             # Quantitative benchmark results & analysis
    └── LICENSING_INVENTORY.md         # Licenses, dependencies, model checkpoints
```

---

## 4. Controlled Synthetic Fixture Suite
Each fixture is generated procedurally at 1920×1080 @ 30 FPS (60 frames = 2.0s) with mathematically exact ground truth:

| ID | Name | Core Dynamics Tested |
| :--- | :--- | :--- |
| **A** | Static Camera, Moving Subject | Linear diagonal subject trajectory ($x: 200 \rightarrow 1380, y: 250 \rightarrow 650$) with zero camera motion. |
| **B** | Horizontal Pan + Moving Subject | Camera pan ($dx = +12$ px/fr) with moving subject ($+4$ px/fr world, $-8$ px/fr screen). |
| **C** | Camera Zoom + Stationary Subject | Pure camera optical zoom ($1.0\times \rightarrow 1.5\times$) with centered stationary subject. |
| **D** | Camera Rotation + Parabolic Motion | Continuous camera tilt ($-0.15 \rightarrow +0.15$ rad) with parabolic subject trajectory. |
| **E** | Occlusion & Reappearance | Foreground pillar ($x: 860..1060$) causing total occlusion and subsequent track re-acquisition. |
| **F** | Hard Scene Cut | Sudden cut at frame 30 ($t = 1.0$s) with similar red subject jumping across the cut. |
| **G** | Low-Texture Ambiguous (Stress) | Ultra-smooth low-contrast gradient designed to trigger explicit low confidence / failure. |

---

## 5. Quickstart & Verification

### Run Automated Unit Tests (Schema & Timebase)
```bash
node experiments/visual-temporal-state/tests/schema.test.js
```

### Re-generate Synthetic Fixtures
```bash
node experiments/visual-temporal-state/src/fixtures/generator.js
```

### Execute Comprehensive 7-Fixture Benchmark
```bash
node experiments/visual-temporal-state/src/baseline/benchmark_all.js
```

### Generate Visual Overlays & Contact Sheet
```bash
experiments/visual-temporal-state/.venv/bin/python3 experiments/visual-temporal-state/src/baseline/visual_evidence.py
```
Outputs:
- `artifacts/fixture_a_annotated.mp4`
- `artifacts/fixture_e_annotated.mp4`
- `artifacts/vtsm_contact_sheet.png`
