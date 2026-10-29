/**
 * VTSM-01 Timebase Bridge & Arithmetic
 * 
 * Maps presentation timestamps (PTS) to deterministic integer ticks (120,000 ticks/sec).
 * Enforces strictly monotonic sample ordering and rational frame-rate conversions.
 */

const TICKS_PER_SECOND = 120000;

class VtsmTimebase {
  static TICKS_PER_SECOND = TICKS_PER_SECOND;

  /**
   * Convert seconds (float) to integer ticks.
   * Throws on non-finite, NaN, or negative values.
   */
  static secondsToTicks(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      throw new TypeError(`Invalid seconds value: ${seconds}. Must be a finite, non-negative number.`);
    }
    return Math.round(seconds * TICKS_PER_SECOND);
  }

  /**
   * Convert integer ticks to fractional seconds.
   */
  static ticksToSeconds(ticks) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new TypeError(`Invalid ticks value: ${ticks}. Must be a non-negative integer.`);
    }
    return ticks / TICKS_PER_SECOND;
  }

  /**
   * Normalize an FPS value or object into rational { numerator, denominator }.
   */
  static normalizeFps(fps) {
    if (typeof fps === 'number') {
      if (!Number.isFinite(fps) || fps <= 0) {
        throw new TypeError(`Invalid numeric FPS: ${fps}`);
      }
      if (Math.abs(fps - 23.976) < 0.005 || Math.abs(fps - 23.98) < 0.005) {
        return { numerator: 24000, denominator: 1001 };
      }
      if (Math.abs(fps - 29.97) < 0.005) {
        return { numerator: 30000, denominator: 1001 };
      }
      if (Math.abs(fps - 59.94) < 0.005) {
        return { numerator: 60000, denominator: 1001 };
      }
      return { numerator: Math.round(fps), denominator: 1 };
    }

    if (fps && typeof fps === 'object') {
      const num = parseInt(fps.numerator, 10);
      const den = parseInt(fps.denominator, 10);
      if (Number.isInteger(num) && num > 0 && Number.isInteger(den) && den > 0) {
        return { numerator: num, denominator: den };
      }
    }

    throw new TypeError(`Invalid FPS specification: ${JSON.stringify(fps)}`);
  }

  /**
   * Compute exact ticks per frame for rational FPS.
   */
  static ticksPerFrame(rationalFps) {
    const { numerator, denominator } = this.normalizeFps(rationalFps);
    return Math.round((TICKS_PER_SECOND * denominator) / numerator);
  }

  /**
   * Compute frame PTS from frame index and rational FPS.
   */
  static frameIndexToPts(frameIndex, rationalFps) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      throw new TypeError(`Invalid frame index: ${frameIndex}`);
    }
    const { numerator, denominator } = this.normalizeFps(rationalFps);
    return (frameIndex * denominator) / numerator;
  }

  /**
   * Validate strictly monotonic timestamp progression.
   */
  static validateMonotonicity(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new Error('Frames array must be a non-empty array');
    }

    let prevPts = -Infinity;
    let prevTick = -1;
    let prevIndex = -1;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (f.frameIndex !== prevIndex + 1) {
        throw new Error(`Frame index discontinuity at position ${i}: expected ${prevIndex + 1}, got ${f.frameIndex}`);
      }
      if (f.pts <= prevPts) {
        throw new Error(`Non-monotonic PTS at frame ${f.frameIndex}: ${f.pts} <= previous ${prevPts}`);
      }
      if (f.tick <= prevTick) {
        throw new Error(`Non-monotonic tick at frame ${f.frameIndex}: ${f.tick} <= previous ${prevTick}`);
      }
      prevIndex = f.frameIndex;
      prevPts = f.pts;
      prevTick = f.tick;
    }

    return true;
  }
}

module.exports = { VtsmTimebase, TICKS_PER_SECOND };
