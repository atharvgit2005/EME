# ADR-001: Time Representation via Rational Frame Rates and 120,000 Integer Ticks

**Status**: Accepted  
**Date**: 2026-10-15  
**Deciders**: Antigravity, ChatGPT Planning Session  

---

## Context
Video editing systems face floating-point rounding errors when representing clip boundaries, cuts, and keyframe times using plain JavaScript floating-point seconds. After dozens of edits, ripple trims, or frame scrubbing operations, accumulating float inaccuracies cause audio de-sync, dropped frames, and visual glitches.

In Phase 1 research:
- OpenCut uses an integer-based `MediaTime` tick system.
- Standard broadcast video operates at fractional frame rates (e.g. 29.97fps is 30,000/1001; 23.976fps is 24,000/1001).
- 120,000 integer ticks per second cleanly divides common integer frame rates:
  - 24 fps &rarr; 5,000 ticks/frame
  - 25 fps &rarr; 4,800 ticks/frame
  - 30 fps &rarr; 4,000 ticks/frame
  - 50 fps &rarr; 2,400 ticks/frame
  - 60 fps &rarr; 2,000 ticks/frame
  - 120 fps &rarr; 1,000 ticks/frame

## Decision
1. **Rational Frame Rate**: Frame rates are represented as `{ numerator: integer, denominator: integer }` (e.g. `{ numerator: 60, denominator: 1 }` or `{ numerator: 30000, denominator: 1001 }`).
2. **Integer Ticks**: All timeline positions (`startTick`, `durationTicks`, `trimInTick`) use integer ticks with `ticksPerSecond: 120000`.
3. **Half-Open Intervals**: All clip durations are modeled as $[start, start + duration)$ half-open intervals. The start tick is inclusive; the end tick is non-inclusive. Two contiguous clips share the exact same boundary tick without overlap or gap.
4. **Renderer Conversion**: Renderers convert ticks to seconds only at the boundary when invoking external engines ($seconds = ticks / ticksPerSecond$).

## Consequences
- Zero floating-point time drift across infinite sequential edits.
- Integer arithmetic is fast and natively supported across all languages (JavaScript, Rust, Python).
- Exact frame numbers are computed deterministically via $frame = \lfloor (tick \times fps.numerator) / (ticksPerSecond \times fps.denominator) \rfloor$.
