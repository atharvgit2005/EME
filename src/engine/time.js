/**
 * Editing Mechanics Engine (EME) - Time & Timeline Arithmetic
 * 
 * Strict integer-tick timebase (120,000 ticks/sec).
 * Rational frame rates { numerator, denominator }.
 * Half-open intervals [start, start + duration).
 */

const TICKS_PER_SECOND = 120000;

class MediaTime {
  static TICKS_PER_SECOND = TICKS_PER_SECOND;

  /**
   * Convert seconds (float or int) to integer ticks.
   */
  static secondsToTicks(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new TypeError(`Invalid seconds value: ${seconds}`);
    const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(String(seconds));
    const fraction = match[2] || '', exponent = Number(match[3] || 0) - fraction.length;
    let numerator = BigInt(match[1] + fraction) * BigInt(TICKS_PER_SECOND), denominator = 1n;
    if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
    else denominator = 10n ** BigInt(-exponent);
    const ticks = Number((numerator + denominator / 2n) / denominator);
    if (!Number.isSafeInteger(ticks)) throw new TypeError('Seconds exceed safe canonical tick range');
    return ticks;
  }

  /**
   * Convert integer ticks to fractional seconds.
   */
  static ticksToSeconds(ticks) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new TypeError(`Invalid ticks value: ${ticks}. Ticks must be a non-negative integer.`);
    }
    return ticks / TICKS_PER_SECOND;
  }

  /**
   * Calculate exact ticks per frame for a rational fps { numerator, denominator }.
   * Throws if not an exact integer when required.
   */
  static ticksPerFrame(fps) {
    const { numerator, denominator } = this.normalizeFps(fps);
    // ticksPerFrame = (TICKS_PER_SECOND * denominator) / numerator
    const numTicks = BigInt(TICKS_PER_SECOND) * BigInt(denominator);
    const num = BigInt(numerator);
    if (numTicks % num !== 0n) {
      // In case of non-exact integer, round or report exact fraction
      return Number(numTicks / num);
    }
    return Number(numTicks / num);
  }

  /**
   * Normalize fps parameter into { numerator, denominator }.
   */
  static normalizeFps(fps) {
    if (typeof fps === 'number') {
      if (fps === 23.976 || fps === 23.98) return { numerator: 24000, denominator: 1001 };
      if (fps === 29.97) return { numerator: 30000, denominator: 1001 };
      if (fps === 59.94) return { numerator: 60000, denominator: 1001 };
      return { numerator: Math.round(fps), denominator: 1 };
    }
    if (fps && typeof fps === 'object') {
      const num = Number(fps.numerator);
      const den = Number(fps.denominator || 1);
      if (Number.isInteger(num) && num > 0 && Number.isInteger(den) && den > 0) {
        return { numerator: num, denominator: den };
      }
    }
    throw new TypeError(`Invalid fps object: ${JSON.stringify(fps)}`);
  }

  /**
   * Convert frame index to start tick.
   */
  static frameToTicks(frameIndex, fps) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      throw new TypeError(`Invalid frameIndex: ${frameIndex}`);
    }
    const { numerator, denominator } = this.normalizeFps(fps);
    // tick = frameIndex * (TICKS_PER_SECOND * denominator) / numerator
    const ticks = (BigInt(frameIndex) * BigInt(TICKS_PER_SECOND) * BigInt(denominator)) / BigInt(numerator);
    return Number(ticks);
  }

  /**
   * Convert ticks to frame index.
   */
  static ticksToFrame(ticks, fps) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new TypeError(`Invalid ticks: ${ticks}`);
    }
    const { numerator, denominator } = this.normalizeFps(fps);
    // frame = ticks * numerator / (TICKS_PER_SECOND * denominator)
    const frame = (BigInt(ticks) * BigInt(numerator)) / (BigInt(TICKS_PER_SECOND) * BigInt(denominator));
    return Number(frame);
  }

  /**
   * Convert ticks to audio samples with deterministic rounding.
   */
  static ticksToAudioSamples(ticks, sampleRate = 48000, rounding = 'round') {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new TypeError(`Invalid ticks: ${ticks}`);
    }
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new TypeError(`Invalid sampleRate: ${sampleRate}`);
    }
    const rawSamples = (ticks * sampleRate) / TICKS_PER_SECOND;
    if (rounding === 'floor') return Math.floor(rawSamples);
    if (rounding === 'ceil') return Math.ceil(rawSamples);
    return Math.round(rawSamples);
  }

  /**
   * Convert audio samples to ticks with deterministic rounding.
   */
  static audioSamplesToTicks(samples, sampleRate = 48000) {
    if (!Number.isInteger(samples) || samples < 0) {
      throw new TypeError(`Invalid samples: ${samples}`);
    }
    return Math.round((samples * TICKS_PER_SECOND) / sampleRate);
  }

  /**
   * Check if two half-open intervals [startA, startA + durationA) and [startB, startB + durationB) overlap.
   * Adjacent intervals (startA + durationA === startB) do NOT overlap.
   */
  static intervalsOverlap(startA, durationA, startB, durationB) {
    if (durationA <= 0 || durationB <= 0) return false;
    const endA = startA + durationA;
    const endB = startB + durationB;
    return Math.max(startA, startB) < Math.min(endA, endB);
  }

  /**
   * Check if two intervals are perfectly adjacent: [startA, endA) and [endA, endB).
   */
  static intervalsAdjacent(startA, durationA, startB, durationB) {
    return (startA + durationA === startB) || (startB + durationB === startA);
  }

  /**
   * Convert canonical EME ticks (120,000 ticks/sec) to microseconds (1,000,000/sec)
   * Exact rational relationship: t_us = round((25 * t_ticks) / 3)
   */
  static ticksToMicroseconds(ticks) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new TypeError(`Invalid ticks value: ${ticks}. Ticks must be a non-negative integer.`);
    }
    return Math.round((25 * ticks) / 3);
  }

  /**
   * Convert microseconds (1,000,000/sec) to canonical EME ticks (120,000 ticks/sec)
   * Exact rational relationship: t_ticks = round((3 * t_us) / 25)
   */
  static microsecondsToTicks(microseconds) {
    if (!Number.isInteger(microseconds) || microseconds < 0) {
      throw new TypeError(`Invalid microseconds value: ${microseconds}. Microseconds must be a non-negative integer.`);
    }
    return Math.round((3 * microseconds) / 25);
  }
}

module.exports = {
  TICKS_PER_SECOND,
  MediaTime
};
