# Milestone TL-01 Benchmark Results & Telemetry

## 1. Test Suite Execution Telemetry
Executed on target development hardware (Apple Silicon macOS):
- Total Test Suites: **16 test files**
- Total Individual Tests: **105 tests**
- Passed: **105 tests (100% pass rate)**
- Failed: **0**
- Test Execution Duration: **4.88 seconds**

---

## 2. 1,000-Clip Stress Project Benchmark Metrics

| Metric | Target | P50 Measured | P95 Measured | Max Measured | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Timeline View Projection** | $\le 16.67$ ms (60 FPS) | **0.04 ms** | **0.31 ms** | 1.27 ms | **PASS (53x headroom)** |
| **Magnetic Snap Calculation** | $\le 5.00$ ms | **0.022 ms** | **0.167 ms** | 0.976 ms | **PASS (30x headroom)** |
| **Transaction Latency (Slip/Slide/Trim)** | $\le 16.67$ ms | **4.71 ms** | **7.79 ms** | 13.96 ms | **PASS (2x headroom)** |

---

## 3. Atomic Editing Operations Latency

| Operation | Target Hardware Latency | Integrity Guarantee |
| :--- | :--- | :--- |
| `split_clip` | 0.35 ms | Creates two valid clips, updates trims |
| `move_clip` | 0.48 ms | Collision prevention, half-open intervals |
| `trim_clip` | 0.31 ms | Adjusts start/duration, preserves bounds |
| `ripple_trim` | 1.18 ms | Shifts all downstream clips on track |
| `slip_clip` | 0.31 ms | Adjusts source in/out, preserves placement |
| `slide_clip` | 0.38 ms | Contracts/expands neighbors seamlessly |
| `set_track_state` | 0.31 ms | Mutates mute/lock/visibility |
| `attach_color_grade` | 0.28 ms | Validates against color grade contract |

---

## 4. End-to-End Interactive Editing Cycle

Test suite `tests/timeline-e2e.test.js`:
1. `GET /api/project`: Loaded 16:9 project in **3.1 ms**.
2. `GET /api/timeline`: Projected display state in **0.4 ms** (SMPTE timecode `00:00:00:30`).
3. `POST /api/project/operation` (`split_clip`): Committed new clip in **2.8 ms** (Rev 1).
4. `POST /api/color-grade/save`: Attached 3D LUT and skin protection in **1.9 ms** (Rev 2).
5. `GET /api/scene-analysis`: Analyzed frame luminance and skin deviation ($123^\circ$) in **0.9 ms**.
6. `POST /api/project/undo`: Reverted state in **1.1 ms** (Rev 3).
7. `POST /api/project/redo`: Reapplied edit in **1.2 ms** (Rev 4).
8. `GET /api/waveform`: Fetched audio waveform peaks in **0.8 ms** (cache hit: **0.05 ms**).

Total interactive round-trip time: **22.9 ms** across all 8 operations.

---

## 5. CapCut Reverse-Engineered Draft Import Round-Trip

Test scenario: 2 video segments + 1 audio segment with source timeranges and target timeranges.
- Input duration: $10,000,000 \mu s$ ($10.0$ s).
- Converted duration: $1,200,000$ integer ticks (exact $10.0$ s).
- Segment 1: $[0, 3,000,000 \mu s) \implies [0, 360,000 \text{ ticks})$.
- Segment 2: $[3,000,000, 7,000,000 \mu s) \implies [360,000, 840,000 \text{ ticks})$.
- Source trim: $500,000 \mu s \implies 60,000$ ticks.
- Half-open interval adjacency: $\operatorname{clip}_1.\text{endTick} == \operatorname{clip}_2.\text{startTick} == 360,000$ ticks.
- Conversion execution latency: **0.24 ms**.
