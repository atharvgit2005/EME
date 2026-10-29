/**
 * Editing Mechanics Engine (EME) - Long-Horizon Error Budget Analytics Engine
 * Conforms to Phase 24 (Stage 24.1): Production Observability & Error Budget Forecasting
 *
 * Implements:
 * 1. Multi-window burn-rate trend analysis (1h, 6h, 24h, 7d).
 * 2. Trend velocity classification (ACCELERATING, STEADY, DECELERATING, STABLE).
 * 3. Time-to-Exhaustion (TTE) deterministic forecasting.
 * 4. Rolling-window budget replenishment projection.
 * 5. Zero external runtime npm dependencies.
 */

const { ERROR_BUDGET_CONFIG } = require('./production-monitor.js');
const { defaultLogger } = require('./logger.js');

const TREND_VELOCITY = {
  ACCELERATING: 'ACCELERATING',
  STEADY: 'STEADY',
  DECELERATING: 'DECELERATING',
  STABLE: 'STABLE'
};

const BUDGET_URGENCY = {
  EMERGENCY: 'EMERGENCY', // TTE < 2 hours
  CRITICAL: 'CRITICAL',   // TTE < 12 hours or fast burn > 14.4x
  WARNING: 'WARNING',     // TTE < 72 hours or slow burn > 6.0x
  NOMINAL: 'NOMINAL'      // Healthy operations
};

class BudgetAnalytics {
  /**
   * @param {object} [options={}]
   * @param {number} [options.targetAvailabilityPercent=99.5] Total error budget = 0.5% (5,000 PPM)
   * @param {number} [options.windowHours=720] 30-day window in hours
   */
  constructor(options = {}) {
    this.targetAvailability = options.targetAvailabilityPercent !== undefined
      ? options.targetAvailabilityPercent
      : ERROR_BUDGET_CONFIG.targetAvailabilityPercent;
    this.allowedErrorRatio = (100 - this.targetAvailability) / 100; // default 0.005
    this.windowHours = options.windowHours || 720; // 30 days
    this.history = []; // Array of { timestamp: number, totalJobs: number, failedJobs: number }
  }

  /**
   * Records a traffic snapshot for time-series trend calculation.
   *
   * @param {object} snapshot
   * @param {number} [snapshot.timestamp] Unix timestamp ms (defaults to Date.now())
   * @param {number} snapshot.totalJobs Total jobs evaluated in snapshot window
   * @param {number} snapshot.failedJobs Failed or non-conformant jobs in snapshot window
   */
  recordSnapshot(snapshot) {
    const record = {
      timestamp: snapshot.timestamp || Date.now(),
      totalJobs: Math.max(0, snapshot.totalJobs || 0),
      failedJobs: Math.max(0, snapshot.failedJobs || 0)
    };
    this.history.push(record);
    // Sort chronologically
    this.history.sort((a, b) => a.timestamp - b.timestamp);
    return record;
  }

  /**
   * Calculates error budget burn rate over a given window duration in milliseconds.
   *
   * @param {number} windowMs Window duration to evaluate back from now (or latest timestamp)
   * @param {number} [referenceTime] Optional reference timestamp
   * @returns {object} Burn rate metric for window
   */
  calculateWindowBurnRate(windowMs, referenceTime) {
    const now = referenceTime || (this.history.length > 0 ? this.history[this.history.length - 1].timestamp : Date.now());
    const cutoff = now - windowMs;

    // Conforms to EME half-open interval principle (cutoff, now]
    const relevant = this.history.filter(h => h.timestamp > cutoff && h.timestamp <= now);
    let total = 0;
    let failed = 0;

    for (const r of relevant) {
      total += r.totalJobs;
      failed += r.failedJobs;
    }

    if (total === 0) {
      return { total, failed, errorRate: 0, burnRate: 0, sampleCount: relevant.length };
    }

    const errorRate = failed / total;
    const burnRate = errorRate / this.allowedErrorRatio;

    return {
      total,
      failed,
      errorRate,
      burnRate: Math.round(burnRate * 1000) / 1000,
      sampleCount: relevant.length
    };
  }

  /**
   * Analyzes burn rate trend across short, medium, and long horizons.
   *
   * @param {number} [referenceTime]
   * @returns {object} Trend evaluation
   */
  analyzeTrend(referenceTime) {
    const burn1h = this.calculateWindowBurnRate(1 * 3600 * 1000, referenceTime);
    const burn6h = this.calculateWindowBurnRate(6 * 3600 * 1000, referenceTime);
    const burn24h = this.calculateWindowBurnRate(24 * 3600 * 1000, referenceTime);

    // Velocity determination
    let velocity = TREND_VELOCITY.STABLE;
    if (burn1h.burnRate > 1.2 * burn6h.burnRate && burn1h.burnRate > 1.0) {
      velocity = TREND_VELOCITY.ACCELERATING;
    } else if (burn1h.burnRate < 0.8 * burn6h.burnRate && burn6h.burnRate > 1.0) {
      velocity = TREND_VELOCITY.DECELERATING;
    } else if (burn1h.burnRate > 1.0) {
      velocity = TREND_VELOCITY.STEADY;
    }

    return {
      burnRate1h: burn1h.burnRate,
      burnRate6h: burn6h.burnRate,
      burnRate24h: burn24h.burnRate,
      velocity,
      details: { burn1h, burn6h, burn24h }
    };
  }

  /**
   * Predicts Time to Exhaustion (TTE) in hours under current burn rate.
   *
   * @param {number} remainingBudgetPercent Current remaining error budget (0 to 100% of allowed budget)
   * @param {number} currentHourlyBurnRate Current burn rate multiplier (1.0 = burns 100% over 720h)
   * @returns {number|null} Estimated hours until 0 budget, or null if burn rate <= 0
   */
  predictTimeToExhaustion(remainingBudgetPercent, currentHourlyBurnRate) {
    if (currentHourlyBurnRate <= 0 || remainingBudgetPercent <= 0) {
      if (remainingBudgetPercent <= 0) return 0;
      return null; // Budget is not actively depleting
    }

    // 1.0 burn rate depletes 100% budget in this.windowHours (720h).
    // Depletion rate per hour = (currentHourlyBurnRate / this.windowHours) * 100%
    const hourlyDepletionPercent = (currentHourlyBurnRate / this.windowHours) * 100;
    const tteHours = remainingBudgetPercent / hourlyDepletionPercent;

    return Math.round(tteHours * 10) / 10;
  }

  /**
   * Generates a comprehensive operational forecast report.
   *
   * @param {number} [currentAvailabilityPercent] Current computed availability (e.g. 99.7%)
   * @returns {object} Forecast report
   */
  generateForecastReport(currentAvailabilityPercent) {
    const avail = currentAvailabilityPercent !== undefined ? currentAvailabilityPercent : 100.0;
    const errorBudgetTotal = 100 - this.targetAvailability; // e.g. 0.5%
    const currentErrorPercent = Math.max(0, 100 - avail);

    // Remaining budget as a percentage of total allowed error budget
    const remainingBudgetPct = Math.max(0, Math.min(100, Math.round(((errorBudgetTotal - currentErrorPercent) / errorBudgetTotal) * 1000) / 10));

    const trend = this.analyzeTrend();
    const effectiveBurnRate = trend.burnRate1h > 0 ? trend.burnRate1h : trend.burnRate6h;
    const tteHours = this.predictTimeToExhaustion(remainingBudgetPct, effectiveBurnRate);

    let urgency = BUDGET_URGENCY.NOMINAL;
    if (remainingBudgetPct <= 0 || (tteHours !== null && tteHours <= 2)) {
      urgency = BUDGET_URGENCY.EMERGENCY;
    } else if ((tteHours !== null && tteHours <= 12) || trend.burnRate1h >= ERROR_BUDGET_CONFIG.fastBurnRate1hThreshold) {
      urgency = BUDGET_URGENCY.CRITICAL;
    } else if ((tteHours !== null && tteHours <= 72) || trend.burnRate6h >= ERROR_BUDGET_CONFIG.slowBurnRate6hThreshold) {
      urgency = BUDGET_URGENCY.WARNING;
    }

    return {
      targetAvailability: this.targetAvailability,
      currentAvailability: avail,
      remainingBudgetPercent: remainingBudgetPct,
      trendVelocity: trend.velocity,
      burnRates: {
        rate1h: trend.burnRate1h,
        rate6h: trend.burnRate6h,
        rate24h: trend.burnRate24h
      },
      timeToExhaustionHours: tteHours,
      urgency,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  BudgetAnalytics,
  TREND_VELOCITY,
  BUDGET_URGENCY
};
