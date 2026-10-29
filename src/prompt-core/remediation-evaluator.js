/**
 * Editing Mechanics Engine (EME) - Incident MTTR & Remediation Effectiveness Engine
 * Conforms to Phase 24 (Stage 24.2): Production Incident Evaluation & MTTR Tracking
 *
 * Implements:
 * 1. MTTD (Mean Time to Detect) & MTTR (Mean Time to Remediate) calculation.
 * 2. Per-runbook success rate tracking and failure categorization.
 * 3. Flapping incident detection (frequency velocity / repeat faults).
 * 4. Actionable remediation effectiveness scoring.
 * 5. Zero external runtime npm dependencies.
 */

const { defaultLogger } = require('./logger.js');

class RemediationEvaluator {
  /**
   * @param {object} [options={}]
   * @param {number} [options.flappingThresholdCount=3] Number of repeat incidents to trigger FLAPPING
   * @param {number} [options.flappingWindowMs=600000] Window to detect flapping (default 10 mins)
   * @param {number} [options.targetMttrMs=5000] Target MTTR in ms (default 5 seconds)
   */
  constructor(options = {}) {
    this.flappingThresholdCount = options.flappingThresholdCount || 3;
    this.flappingWindowMs = options.flappingWindowMs || 600000;
    this.targetMttrMs = options.targetMttrMs || 5000;

    this.incidents = []; // Array of recorded incident lifecycle records
  }

  /**
   * Records an incident detection event.
   *
   * @param {object} event
   * @param {string} event.incidentId Unique ID
   * @param {string} event.incidentType Type of incident
   * @param {string} [event.targetResource] Affected resource or path
   * @param {number} [event.detectedAt] Detection timestamp ms (default Date.now())
   * @param {number} [event.occurredAt] Estimated occurrence timestamp ms
   * @returns {object} Incident record
   */
  recordDetection(event) {
    const record = {
      incidentId: event.incidentId || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      incidentType: event.incidentType,
      targetResource: event.targetResource || 'global',
      occurredAt: event.occurredAt || event.detectedAt || Date.now(),
      detectedAt: event.detectedAt || Date.now(),
      remediationStartedAt: null,
      resolvedAt: null,
      runbookAction: null,
      success: null,
      error: null,
      metrics: {}
    };
    this.incidents.push(record);
    return record;
  }

  /**
   * Records a remediation execution and its outcome.
   *
   * @param {string} incidentId
   * @param {object} outcome
   * @param {string} outcome.runbookAction Action executed
   * @param {boolean} outcome.success Whether remediation resolved the fault
   * @param {number} [outcome.resolvedAt] Resolution timestamp ms (default Date.now())
   * @param {string} [outcome.error] Error if failed
   * @param {object} [outcome.metrics] Additional metadata (e.g. bytesReclaimed)
   * @returns {object|null} Updated record
   */
  recordRemediation(incidentId, outcome) {
    const record = this.incidents.find(i => i.incidentId === incidentId);
    if (!record) return null;

    record.runbookAction = outcome.runbookAction;
    record.success = Boolean(outcome.success);
    record.resolvedAt = outcome.resolvedAt || Date.now();
    record.error = outcome.error || null;
    record.metrics = outcome.metrics || {};

    defaultLogger.info('Recorded remediation outcome', {
      incidentId,
      action: outcome.runbookAction,
      success: record.success,
      durationMs: record.resolvedAt - record.detectedAt
    });

    return record;
  }

  /**
   * Computes MTTD (Mean Time to Detect) across all resolved/recorded incidents.
   *
   * @returns {number} MTTD in ms (0 if no sample)
   */
  calculateMttd() {
    const valid = this.incidents.filter(i => i.occurredAt && i.detectedAt && i.detectedAt >= i.occurredAt);
    if (valid.length === 0) return 0;

    const totalMs = valid.reduce((acc, curr) => acc + (curr.detectedAt - curr.occurredAt), 0);
    return Math.round(totalMs / valid.length);
  }

  /**
   * Computes MTTR (Mean Time to Remediate) across successfully resolved incidents.
   *
   * @param {string} [filterRunbook] Optional runbook action to filter
   * @returns {number} MTTR in ms (0 if no sample)
   */
  calculateMttr(filterRunbook) {
    const valid = this.incidents.filter(i => {
      const matchRunbook = !filterRunbook || i.runbookAction === filterRunbook;
      return matchRunbook && i.success === true && i.resolvedAt && i.detectedAt && i.resolvedAt >= i.detectedAt;
    });

    if (valid.length === 0) return 0;

    const totalMs = valid.reduce((acc, curr) => acc + (curr.resolvedAt - curr.detectedAt), 0);
    return Math.round(totalMs / valid.length);
  }

  /**
   * Computes runbook success rate (0 to 100%).
   *
   * @param {string} [filterRunbook]
   * @returns {object} Success rate stats
   */
  calculateSuccessRate(filterRunbook) {
    const evaluated = this.incidents.filter(i => {
      const matchRunbook = !filterRunbook || i.runbookAction === filterRunbook;
      return matchRunbook && i.success !== null;
    });

    if (evaluated.length === 0) {
      return { total: 0, successful: 0, failed: 0, successRatePercent: 100.0 };
    }

    const successful = evaluated.filter(i => i.success === true).length;
    const failed = evaluated.length - successful;
    const rate = Math.round((successful / evaluated.length) * 1000) / 10;

    return {
      total: evaluated.length,
      successful,
      failed,
      successRatePercent: rate
    };
  }

  /**
   * Detects flapping incidents (repeat faults of same type or resource in window).
   *
   * @param {number} [referenceTime] Reference timestamp ms
   * @returns {object[]} Flapping incident alerts
   */
  detectFlapping(referenceTime) {
    const now = referenceTime || (this.incidents.length > 0 ? this.incidents[this.incidents.length - 1].detectedAt : Date.now());
    const cutoff = now - this.flappingWindowMs;

    const recent = this.incidents.filter(i => i.detectedAt > cutoff && i.detectedAt <= now);
    const groups = new Map();

    for (const inc of recent) {
      const key = `${inc.incidentType}:${inc.targetResource}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(inc);
    }

    const flapping = [];
    for (const [key, items] of groups.entries()) {
      if (items.length >= this.flappingThresholdCount) {
        const [incidentType, targetResource] = key.split(':');
        flapping.push({
          incidentType,
          targetResource,
          count: items.length,
          firstDetectedAt: items[0].detectedAt,
          lastDetectedAt: items[items.length - 1].detectedAt,
          severity: items.length >= this.flappingThresholdCount * 2 ? 'CRITICAL' : 'WARNING'
        });
      }
    }

    return flapping;
  }

  /**
   * Generates a comprehensive effectiveness report.
   *
   * @returns {object} Effectiveness assessment
   */
  generateEvaluationReport() {
    const overallMttr = this.calculateMttr();
    const overallMttd = this.calculateMttd();
    const successRate = this.calculateSuccessRate();
    const flapping = this.detectFlapping();

    const mttrTargetMet = overallMttr <= this.targetMttrMs;
    const status = (successRate.successRatePercent >= 95.0 && mttrTargetMet && flapping.length === 0)
      ? 'EFFECTIVE'
      : (successRate.successRatePercent < 80.0 || flapping.some(f => f.severity === 'CRITICAL') ? 'INEFFECTIVE' : 'DEGRADED');

    return {
      status,
      overallMttrMs: overallMttr,
      overallMttdMs: overallMttd,
      targetMttrMs: this.targetMttrMs,
      mttrTargetMet,
      successRate,
      flappingIncidents: flapping,
      totalIncidentsRecorded: this.incidents.length,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  RemediationEvaluator
};
