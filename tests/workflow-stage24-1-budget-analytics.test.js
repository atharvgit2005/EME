/**
 * Phase 24 Stage 24.1 Test Suite: Long-Horizon Error Budget Analytics & Burn-Rate Trend Forecasting
 *
 * Verifies:
 * 1. BGT-01: Multi-window burn rate calculation across 1h, 6h, and 24h sliding horizons.
 * 2. BGT-02: Trend velocity classification (ACCELERATING, STEADY, DECELERATING, STABLE).
 * 3. BGT-03: Deterministic Time-to-Exhaustion (TTE) mathematical prediction.
 * 4. BGT-04: Operational urgency state transitions (NOMINAL -> WARNING -> CRITICAL -> EMERGENCY).
 * 5. BGT-05: Non-negotiable invariant: Resilience under zero traffic / empty history.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BudgetAnalytics,
  TREND_VELOCITY,
  BUDGET_URGENCY
} = require('../src/prompt-core/budget-analytics.js');

test('Stage 24.1: Long-Horizon Error Budget Analytics & Burn-Rate Forecasting', async (t) => {
  await t.test('BGT-01: Multi-Window Burn Rate Calculation', async () => {
    const analytics = new BudgetAnalytics({ targetAvailabilityPercent: 99.5 });
    const now = Date.now();

    // Ingest 24 hourly snapshots
    // Hours 0-18: 1000 jobs, 2 failures (0.2% error rate -> burn rate = 0.002 / 0.005 = 0.4x)
    for (let i = 23; i >= 6; i--) {
      analytics.recordSnapshot({
        timestamp: now - (i * 3600 * 1000),
        totalJobs: 1000,
        failedJobs: 2
      });
    }

    // Hours 1-5: 1000 jobs, 10 failures (1.0% error rate -> burn rate = 0.010 / 0.005 = 2.0x)
    for (let i = 5; i >= 1; i--) {
      analytics.recordSnapshot({
        timestamp: now - (i * 3600 * 1000),
        totalJobs: 1000,
        failedJobs: 10
      });
    }

    // Latest 1h: 1000 jobs, 50 failures (5.0% error rate -> burn rate = 0.050 / 0.005 = 10.0x)
    analytics.recordSnapshot({
      timestamp: now,
      totalJobs: 1000,
      failedJobs: 50
    });

    const trend = analytics.analyzeTrend(now);
    assert.equal(trend.burnRate1h, 10.0);
    // In 6h: 5 * 10 + 50 = 100 failed over 6000 total = 1.667% error rate -> burn rate ~ 3.333x
    assert.ok(trend.burnRate6h > 3.0 && trend.burnRate6h < 3.5);
    // In 24h: 18 * 2 + 5 * 10 + 50 = 136 failed over 24000 total = 0.567% error rate -> burn rate ~ 1.13x
    assert.ok(trend.burnRate24h > 1.0 && trend.burnRate24h < 1.2);
  });

  await t.test('BGT-02: Trend Velocity Classification', async () => {
    const analytics = new BudgetAnalytics();
    const now = Date.now();

    // Fast accelerating spike
    analytics.recordSnapshot({ timestamp: now - 3600000 * 3, totalJobs: 1000, failedJobs: 5 });
    analytics.recordSnapshot({ timestamp: now - 3600000 * 2, totalJobs: 1000, failedJobs: 5 });
    analytics.recordSnapshot({ timestamp: now - 3600000 * 1, totalJobs: 1000, failedJobs: 5 });
    analytics.recordSnapshot({ timestamp: now, totalJobs: 1000, failedJobs: 50 }); // Spike in latest 1h

    const acceleratingTrend = analytics.analyzeTrend(now);
    assert.equal(acceleratingTrend.velocity, TREND_VELOCITY.ACCELERATING);

    // Decelerating recovery
    const analytics2 = new BudgetAnalytics();
    analytics2.recordSnapshot({ timestamp: now - 3600000 * 4, totalJobs: 1000, failedJobs: 40 });
    analytics2.recordSnapshot({ timestamp: now - 3600000 * 3, totalJobs: 1000, failedJobs: 40 });
    analytics2.recordSnapshot({ timestamp: now - 3600000 * 2, totalJobs: 1000, failedJobs: 40 });
    analytics2.recordSnapshot({ timestamp: now, totalJobs: 1000, failedJobs: 2 }); // Recovered in latest 1h

    const deceleratingTrend = analytics2.analyzeTrend(now);
    assert.equal(deceleratingTrend.velocity, TREND_VELOCITY.DECELERATING);
  });

  await t.test('BGT-03: Deterministic Time-to-Exhaustion (TTE) Prediction', async () => {
    const analytics = new BudgetAnalytics({ windowHours: 720 }); // 30-day window

    // 100% budget remaining, 1.0x burn rate -> exactly 720 hours to exhaustion
    const tte1 = analytics.predictTimeToExhaustion(100, 1.0);
    assert.equal(tte1, 720);

    // 50% budget remaining, 2.0x burn rate -> 50 / (2/720 * 100) = 50 / 0.2777 = 180 hours
    const tte2 = analytics.predictTimeToExhaustion(50, 2.0);
    assert.equal(tte2, 180);

    // 10% budget remaining, 14.4x critical fast-burn -> 10 / (14.4/720 * 100) = 10 / 2.0 = 5.0 hours
    const tte3 = analytics.predictTimeToExhaustion(10, 14.4);
    assert.equal(tte3, 5.0);

    // Zero burn rate -> null (no active exhaustion)
    assert.equal(analytics.predictTimeToExhaustion(100, 0), null);
    assert.equal(analytics.predictTimeToExhaustion(0, 5.0), 0);
  });

  await t.test('BGT-04: Operational Urgency Escalation', async () => {
    const analytics = new BudgetAnalytics();
    const now = Date.now();

    // Nominal conditions
    analytics.recordSnapshot({ timestamp: now, totalJobs: 1000, failedJobs: 1 });
    const nominalReport = analytics.generateForecastReport(99.9);
    assert.equal(nominalReport.urgency, BUDGET_URGENCY.NOMINAL);

    // Warning conditions: moderate burn rate and positive remaining budget
    const analyticsWarn = new BudgetAnalytics();
    analyticsWarn.recordSnapshot({ timestamp: now - 3600000, totalJobs: 1000, failedJobs: 35 });
    analyticsWarn.recordSnapshot({ timestamp: now, totalJobs: 1000, failedJobs: 35 }); // burn ~ 7.0x (> 6.0x)
    const warnReport = analyticsWarn.generateForecastReport(99.7);
    assert.equal(warnReport.urgency, BUDGET_URGENCY.WARNING);

    // Critical conditions: fast burn rate > 14.4x and budget still has buffer
    const analyticsCrit = new BudgetAnalytics();
    analyticsCrit.recordSnapshot({ timestamp: now, totalJobs: 1000, failedJobs: 80 }); // burn = 16.0x
    const critReport = analyticsCrit.generateForecastReport(99.6);
    assert.equal(critReport.urgency, BUDGET_URGENCY.CRITICAL);

    // Emergency conditions: budget exhausted (current error > allowed 0.5%)
    const emergReport = analyticsCrit.generateForecastReport(99.4);
    assert.equal(emergReport.remainingBudgetPercent, 0);
    assert.equal(emergReport.urgency, BUDGET_URGENCY.EMERGENCY);
  });

  await t.test('BGT-05: Resilience Under Zero Traffic / Empty History', async () => {
    const emptyAnalytics = new BudgetAnalytics();
    const trend = emptyAnalytics.analyzeTrend();
    assert.equal(trend.burnRate1h, 0);
    assert.equal(trend.burnRate6h, 0);
    assert.equal(trend.velocity, TREND_VELOCITY.STABLE);

    const report = emptyAnalytics.generateForecastReport(100.0);
    assert.equal(report.currentAvailability, 100.0);
    assert.equal(report.remainingBudgetPercent, 100.0);
    assert.equal(report.timeToExhaustionHours, null);
    assert.equal(report.urgency, BUDGET_URGENCY.NOMINAL);
  });
});
