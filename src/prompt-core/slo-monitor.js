/**
 * Editing Mechanics Engine (EME) - Production SLO Monitor & Alerting Engine
 * Conforms to Phase 21 (Stage 21.1): Production SLOs, Telemetry Health & Alerting Engine
 *
 * Implements:
 * 1. Strict Service-Level Indicators (SLIs) and Service-Level Objectives (SLOs):
 *    - Workflow Availability SLO: >= 99.5% of terminal jobs succeed
 *    - Job Execution Latency SLO: p50 <= 5.0s, p95 <= 15.0s, p99 <= 30.0s
 *    - Lock Contention SLO: p99 <= 50ms wait duration
 *    - Media QA Quality SLO: Rejection rate <= 5.0%
 *    - Operational Recovery SLO: RTO <= 2.0s, RPO = 0 data loss
 * 2. Threshold-based alerting engine with severity classification:
 *    - WORKFLOW_SLO_BREACH, LATENCY_SLO_BREACH, CONTENTION_SLO_BREACH,
 *      QA_REJECTION_SLO_BREACH, RECOVERY_SLO_BREACH, TELEMETRY_FAILURE
 * 3. Strict separation of concerns:
 *    - Telemetry/diagnostics failures are tracked in TELEMETRY_FAILURE
 *    - Telemetry failures NEVER contaminate user-facing workflow availability SLI
 * 4. Prometheus v0.0.4 text exposition integration.
 * 5. Zero external runtime npm dependencies (pure Node.js core modules).
 */

const diagnosticsChannel = require('node:diagnostics_channel');
const { channels } = require('./logger.js');

const DEFAULT_SLO_TARGETS = {
  workflowAvailability: 99.5, // >= 99.5%
  latencyP50Ms: 5000,         // <= 5.0s
  latencyP95Ms: 15000,        // <= 15.0s
  latencyP99Ms: 30000,        // <= 30.0s
  contentionP99Ms: 50,        // <= 50ms
  qaRejectionRate: 5.0,       // <= 5.0%
  rtoMs: 2000,                // <= 2.0s
  rpoDataLoss: 0,             // 0 items lost
  windowSizeMs: 3600000       // 1 hour rolling window
};

const alertChannel = diagnosticsChannel.channel('eme:alert:event');

class SloMonitor {
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    this.targets = { ...DEFAULT_SLO_TARGETS, ...(options.targets || {}) };
    this.windowSizeMs = options.windowSizeMs || this.targets.windowSizeMs;

    this.jobStarts = new Map(); // jobId -> timestamp
    this.jobRecords = [];       // { timestamp, jobId, status, durationMs }
    this.lockWaits = [];        // { timestamp, durationMs }
    this.qaEvaluations = [];    // { timestamp, score, passed }
    this.recoveries = [];       // { timestamp, durationMs, dataLoss }
    this.telemetryAlerts = [];  // { timestamp, source, error }

    this.activeAlerts = new Map(); // alertKey -> alertObj
    this.alertListeners = new Set();
    this.subscribed = false;
    this._subscribers = [];

    if (options.autoSubscribe !== false) {
      this.subscribeToDiagnostics();
    }
  }

  /**
   * Subscribes to diagnostic channels.
   */
  subscribeToDiagnostics() {
    if (this.subscribed) return;

    const onJobTransition = (event) => {
      try {
        if (!event || !event.toState) return;
        const now = Date.now();
        const jobId = event.job_id || event.jobId;

        if (event.toState === 'ACCEPTED' || event.toState === 'PLANNING') {
          if (jobId) this.jobStarts.set(jobId, now);
        } else if (['SUCCEEDED', 'FAILED', 'NEEDS_RECONCILIATION', 'CANCELLED'].includes(event.toState)) {
          const startTime = jobId ? this.jobStarts.get(jobId) : null;
          const durationMs = startTime ? (now - startTime) : (event.durationMs || 0);
          if (jobId) this.jobStarts.delete(jobId);
          this.recordJobCompletion(jobId, event.toState, durationMs);
        }
      } catch (err) {
        this.recordTelemetryError('onJobTransition', err);
      }
    };

    const onLockEvent = (event) => {
      try {
        if (event && event.waitMs !== undefined) {
          this.recordLockWait(event.waitMs);
        }
      } catch (err) {
        this.recordTelemetryError('onLockEvent', err);
      }
    };

    const onDeliveryEvent = (event) => {
      try {
        if (event && event.qa_score !== undefined) {
          const passed = event.qa_passed !== undefined ? event.qa_passed : event.qa_score >= 85.0;
          this.recordQaEvaluation(event.qa_score, passed);
        }
      } catch (err) {
        this.recordTelemetryError('onDeliveryEvent', err);
      }
    };

    const onErrorEvent = (event) => {
      try {
        if (event && event.domain === 'telemetry') {
          this.recordTelemetryError(event.source || 'diagnostics', event.error || event.reason);
        }
      } catch (err) {
        this.recordTelemetryError('onErrorEvent', err);
      }
    };

    channels.jobTransitionChannel.subscribe(onJobTransition);
    channels.lockEventChannel.subscribe(onLockEvent);
    channels.deliveryEventChannel.subscribe(onDeliveryEvent);
    channels.errorEventChannel.subscribe(onErrorEvent);

    this._subscribers = [
      { channel: channels.jobTransitionChannel, handler: onJobTransition },
      { channel: channels.lockEventChannel, handler: onLockEvent },
      { channel: channels.deliveryEventChannel, handler: onDeliveryEvent },
      { channel: channels.errorEventChannel, handler: onErrorEvent }
    ];

    this.subscribed = true;
  }

  /**
   * Unsubscribes from diagnostic channels.
   */
  unsubscribeFromDiagnostics() {
    if (!this.subscribed) return;
    for (const sub of this._subscribers) {
      try {
        sub.channel.unsubscribe(sub.handler);
      } catch (e) {}
    }
    this._subscribers = [];
    this.subscribed = false;
  }

  /**
   * Prunes sliding window data older than windowSizeMs.
   */
  prune(now = Date.now()) {
    const cutoff = now - this.windowSizeMs;
    this.jobRecords = this.jobRecords.filter(r => r.timestamp >= cutoff);
    this.lockWaits = this.lockWaits.filter(w => w.timestamp >= cutoff);
    this.qaEvaluations = this.qaEvaluations.filter(q => q.timestamp >= cutoff);
    this.recoveries = this.recoveries.filter(rec => rec.timestamp >= cutoff);
    this.telemetryAlerts = this.telemetryAlerts.filter(t => t.timestamp >= cutoff);
  }

  /**
   * Records terminal job completion.
   */
  recordJobCompletion(jobId, status, durationMs = 0) {
    const now = Date.now();
    this.jobRecords.push({
      timestamp: now,
      jobId: jobId || 'unknown',
      status: String(status).toUpperCase(),
      durationMs: Number(durationMs) || 0
    });
    this.prune(now);
    this.evaluateAlerts(now);
  }

  /**
   * Records lock acquisition wait duration.
   */
  recordLockWait(durationMs) {
    const now = Date.now();
    this.lockWaits.push({
      timestamp: now,
      durationMs: Math.max(0, Number(durationMs) || 0)
    });
    this.prune(now);
    this.evaluateAlerts(now);
  }

  /**
   * Records QA evaluation result.
   */
  recordQaEvaluation(score, passed) {
    const now = Date.now();
    const numScore = Number(score);
    this.qaEvaluations.push({
      timestamp: now,
      score: Number.isFinite(numScore) ? numScore : 0,
      passed: Boolean(passed)
    });
    this.prune(now);
    this.evaluateAlerts(now);
  }

  /**
   * Records operational recovery execution.
   */
  recordRecovery(durationMs, dataLoss = 0) {
    const now = Date.now();
    this.recoveries.push({
      timestamp: now,
      durationMs: Math.max(0, Number(durationMs) || 0),
      dataLoss: Math.max(0, Number(dataLoss) || 0)
    });
    this.prune(now);
    this.evaluateAlerts(now);
  }

  /**
   * Records telemetry or diagnostics exception (isolated from workflow SLIs).
   */
  recordTelemetryError(source, error) {
    const now = Date.now();
    const errObj = {
      timestamp: now,
      source: String(source || 'unknown'),
      message: error instanceof Error ? error.message : String(error)
    };
    this.telemetryAlerts.push(errObj);
    this.prune(now);

    this._emitAlert({
      id: `telemetry-err-${now}-${Math.random().toString(16).slice(2, 8)}`,
      category: 'TELEMETRY_FAILURE',
      severity: 'WARNING',
      message: `Telemetry observer exception in [${errObj.source}]: ${errObj.message}`,
      sliCurrent: 1,
      sloTarget: 0,
      remediation: 'Inspect diagnostic channel subscriber implementation and error boundary',
      timestamp: new Date(now).toISOString()
    });
  }

  /**
   * Calculates percentile from array of numbers.
   */
  _percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
  }

  /**
   * Calculates Workflow Availability SLI.
   */
  calculateAvailability() {
    // Non-cancelled terminal jobs
    const terminal = this.jobRecords.filter(r => ['SUCCEEDED', 'FAILED', 'NEEDS_RECONCILIATION'].includes(r.status));
    if (terminal.length === 0) {
      return {
        ratio: 1.0,
        percentage: 100.0,
        total: 0,
        succeeded: 0,
        failed: 0,
        needsReconciliation: 0,
        target: this.targets.workflowAvailability,
        targetMet: true
      };
    }

    const succeeded = terminal.filter(r => r.status === 'SUCCEEDED').length;
    const failed = terminal.filter(r => r.status === 'FAILED').length;
    const needsReconciliation = terminal.filter(r => r.status === 'NEEDS_RECONCILIATION').length;
    const ratio = succeeded / terminal.length;
    const percentage = ratio * 100;

    return {
      ratio,
      percentage: Number(percentage.toFixed(3)),
      total: terminal.length,
      succeeded,
      failed,
      needsReconciliation,
      target: this.targets.workflowAvailability,
      targetMet: percentage >= this.targets.workflowAvailability
    };
  }

  /**
   * Calculates Job Execution Latency SLI.
   */
  calculateLatency() {
    const succeeded = this.jobRecords.filter(r => r.status === 'SUCCEEDED').map(r => r.durationMs).sort((a, b) => a - b);
    if (succeeded.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        sampleCount: 0,
        targets: { p50: this.targets.latencyP50Ms, p95: this.targets.latencyP95Ms, p99: this.targets.latencyP99Ms },
        targetMet: true
      };
    }

    const p50 = this._percentile(succeeded, 50);
    const p95 = this._percentile(succeeded, 95);
    const p99 = this._percentile(succeeded, 99);

    const targetMet = p50 <= this.targets.latencyP50Ms &&
                      p95 <= this.targets.latencyP95Ms &&
                      p99 <= this.targets.latencyP99Ms;

    return {
      p50,
      p95,
      p99,
      sampleCount: succeeded.length,
      targets: { p50: this.targets.latencyP50Ms, p95: this.targets.latencyP95Ms, p99: this.targets.latencyP99Ms },
      targetMet
    };
  }

  /**
   * Calculates Lock Contention SLI.
   */
  calculateContention() {
    const waits = this.lockWaits.map(w => w.durationMs).sort((a, b) => a - b);
    if (waits.length === 0) {
      return { p99: 0, sampleCount: 0, target: this.targets.contentionP99Ms, targetMet: true };
    }
    const p99 = this._percentile(waits, 99);
    return {
      p99,
      sampleCount: waits.length,
      target: this.targets.contentionP99Ms,
      targetMet: p99 <= this.targets.contentionP99Ms
    };
  }

  /**
   * Calculates Media QA Quality SLI.
   */
  calculateQaRejection() {
    if (this.qaEvaluations.length === 0) {
      return { rejectionRatio: 0, rejectionPercentage: 0, total: 0, rejected: 0, target: this.targets.qaRejectionRate, targetMet: true };
    }
    const rejected = this.qaEvaluations.filter(q => !q.passed || q.score < 85.0).length;
    const ratio = rejected / this.qaEvaluations.length;
    const percentage = ratio * 100;
    return {
      rejectionRatio: ratio,
      rejectionPercentage: Number(percentage.toFixed(2)),
      total: this.qaEvaluations.length,
      rejected,
      target: this.targets.qaRejectionRate,
      targetMet: percentage <= this.targets.qaRejectionRate
    };
  }

  /**
   * Calculates Operational Recovery SLI.
   */
  calculateRecovery() {
    if (this.recoveries.length === 0) {
      return { rtoP95: 0, totalDataLoss: 0, sampleCount: 0, targets: { rtoMs: this.targets.rtoMs, rpo: this.targets.rpoDataLoss }, targetMet: true };
    }
    const durations = this.recoveries.map(r => r.durationMs).sort((a, b) => a - b);
    const rtoP95 = this._percentile(durations, 95);
    const totalDataLoss = this.recoveries.reduce((sum, r) => sum + r.dataLoss, 0);

    const targetMet = rtoP95 <= this.targets.rtoMs && totalDataLoss <= this.targets.rpoDataLoss;

    return {
      rtoP95,
      totalDataLoss,
      sampleCount: this.recoveries.length,
      targets: { rtoMs: this.targets.rtoMs, rpo: this.targets.rpoDataLoss },
      targetMet
    };
  }

  /**
   * Comprehensive evaluation of all SLIs against targets and emission of alerts.
   */
  evaluateAlerts(now = Date.now()) {
    // 1. Workflow Availability SLO
    const avail = this.calculateAvailability();
    if (!avail.targetMet && avail.total >= 5) {
      const severity = avail.percentage < 90.0 ? 'CRITICAL' : 'WARNING';
      this._emitAlert({
        id: 'slo-breach-availability',
        category: 'WORKFLOW_SLO_BREACH',
        severity,
        message: `Workflow Availability SLO breached: ${avail.percentage}% (Target >= ${avail.target}%)`,
        sliCurrent: avail.percentage,
        sloTarget: avail.target,
        remediation: 'Inspect terminal error logs and reconcile jobs in NEEDS_RECONCILIATION status',
        timestamp: new Date(now).toISOString()
      });
    } else {
      this.activeAlerts.delete('slo-breach-availability');
    }

    // 2. Latency SLO
    const lat = this.calculateLatency();
    if (!lat.targetMet && lat.sampleCount >= 3) {
      const severity = (lat.p99 > lat.targets.p99 * 2) ? 'CRITICAL' : 'WARNING';
      this._emitAlert({
        id: 'slo-breach-latency',
        category: 'LATENCY_SLO_BREACH',
        severity,
        message: `Job Latency SLO breached: p50=${lat.p50}ms (target ${lat.targets.p50}ms), p95=${lat.p95}ms (target ${lat.targets.p95}ms), p99=${lat.p99}ms (target ${lat.targets.p99}ms)`,
        sliCurrent: lat.p99,
        sloTarget: lat.targets.p99,
        remediation: 'Check render queue depth, subprocess CPU throttling, and scratch disk I/O performance',
        timestamp: new Date(now).toISOString()
      });
    } else {
      this.activeAlerts.delete('slo-breach-latency');
    }

    // 3. Contention SLO
    const cont = this.calculateContention();
    if (!cont.targetMet && cont.sampleCount >= 5) {
      this._emitAlert({
        id: 'slo-breach-contention',
        category: 'CONTENTION_SLO_BREACH',
        severity: 'WARNING',
        message: `Lock Contention SLO breached: p99 wait=${cont.p99}ms (Target <= ${cont.target}ms)`,
        sliCurrent: cont.p99,
        sloTarget: cont.target,
        remediation: 'Investigate concurrent job lease conflicts and multi-process lock hold durations',
        timestamp: new Date(now).toISOString()
      });
    } else {
      this.activeAlerts.delete('slo-breach-contention');
    }

    // 4. QA Rejection SLO
    const qa = this.calculateQaRejection();
    if (!qa.targetMet && qa.total >= 5) {
      this._emitAlert({
        id: 'slo-breach-qa-rejection',
        category: 'QA_REJECTION_SLO_BREACH',
        severity: 'WARNING',
        message: `QA Rejection SLO breached: ${qa.rejectionPercentage}% rejected (Target <= ${qa.target}%)`,
        sliCurrent: qa.rejectionPercentage,
        sloTarget: qa.target,
        remediation: 'Verify audio/video alignment, black-frame detections, and codec bitrates in render pipeline',
        timestamp: new Date(now).toISOString()
      });
    } else {
      this.activeAlerts.delete('slo-breach-qa-rejection');
    }

    // 5. Recovery SLO
    const rec = this.calculateRecovery();
    if (!rec.targetMet) {
      const severity = rec.totalDataLoss > 0 ? 'CRITICAL' : 'WARNING';
      this._emitAlert({
        id: 'slo-breach-recovery',
        category: 'RECOVERY_SLO_BREACH',
        severity,
        message: `Operational Recovery SLO breached: RTO p95=${rec.rtoP95}ms (target <= ${rec.targets.rtoMs}ms), RPO DataLoss=${rec.totalDataLoss}`,
        sliCurrent: rec.rtoP95,
        sloTarget: rec.targets.rtoMs,
        remediation: 'Audit crash-recovery procedure, verify atomic backup integrity, and investigate unhandled crashes',
        timestamp: new Date(now).toISOString()
      });
    } else {
      this.activeAlerts.delete('slo-breach-recovery');
    }
  }

  /**
   * Internal alert dispatcher.
   */
  _emitAlert(alertObj) {
    this.activeAlerts.set(alertObj.id, alertObj);
    for (const listener of this.alertListeners) {
      try {
        listener(alertObj);
      } catch (e) {}
    }
    try {
      if (alertChannel.hasSubscribers) {
        alertChannel.publish(alertObj);
      }
    } catch (e) {}
  }

  /**
   * Registers an alert event listener.
   */
  onAlert(callback) {
    if (typeof callback === 'function') {
      this.alertListeners.add(callback);
    }
  }

  /**
   * Unregisters an alert event listener.
   */
  offAlert(callback) {
    this.alertListeners.delete(callback);
  }

  /**
   * Returns complete SLO status and active alerts.
   */
  getSloStatus() {
    this.prune();
    const availability = this.calculateAvailability();
    const latency = this.calculateLatency();
    const contention = this.calculateContention();
    const qaRejection = this.calculateQaRejection();
    const recovery = this.calculateRecovery();
    const allMet = availability.targetMet && latency.targetMet && contention.targetMet && qaRejection.targetMet && recovery.targetMet;

    return {
      status: allMet ? 'HEALTHY' : 'DEGRADED',
      all_slos_met: allMet,
      window_size_seconds: Math.floor(this.windowSizeMs / 1000),
      metrics: {
        workflow_availability: availability,
        job_latency: latency,
        lock_contention: contention,
        qa_rejection: qaRejection,
        operational_recovery: recovery
      },
      active_alerts: Array.from(this.activeAlerts.values()),
      telemetry_alerts_count: this.telemetryAlerts.length
    };
  }

  /**
   * Formats SLO metrics as Prometheus exposition text.
   */
  toPrometheusText() {
    const status = this.getSloStatus();
    const m = status.metrics;
    const lines = [];

    lines.push('# HELP eme_slo_workflow_availability_ratio Current workflow availability ratio');
    lines.push('# TYPE eme_slo_workflow_availability_ratio gauge');
    lines.push(`eme_slo_workflow_availability_ratio ${m.workflow_availability.ratio}`);

    lines.push('# HELP eme_slo_workflow_availability_target Target workflow availability percentage');
    lines.push('# TYPE eme_slo_workflow_availability_target gauge');
    lines.push(`eme_slo_workflow_availability_target ${m.workflow_availability.target}`);

    lines.push('# HELP eme_slo_job_latency_ms Succeeded job duration percentiles in milliseconds');
    lines.push('# TYPE eme_slo_job_latency_ms gauge');
    lines.push(`eme_slo_job_latency_ms{quantile="0.5"} ${m.job_latency.p50}`);
    lines.push(`eme_slo_job_latency_ms{quantile="0.95"} ${m.job_latency.p95}`);
    lines.push(`eme_slo_job_latency_ms{quantile="0.99"} ${m.job_latency.p99}`);

    lines.push('# HELP eme_slo_lock_contention_p99_ms Lock wait duration 99th percentile in milliseconds');
    lines.push('# TYPE eme_slo_lock_contention_p99_ms gauge');
    lines.push(`eme_slo_lock_contention_p99_ms ${m.lock_contention.p99}`);

    lines.push('# HELP eme_slo_qa_rejection_ratio QA rejection ratio');
    lines.push('# TYPE eme_slo_qa_rejection_ratio gauge');
    lines.push(`eme_slo_qa_rejection_ratio ${m.qa_rejection.rejectionRatio}`);

    lines.push('# HELP eme_slo_recovery_rto_p95_ms Recovery time objective 95th percentile in milliseconds');
    lines.push('# TYPE eme_slo_recovery_rto_p95_ms gauge');
    lines.push(`eme_slo_recovery_rto_p95_ms ${m.operational_recovery.rtoP95}`);

    lines.push('# HELP eme_slo_alerts_active Active SLO breach alerts count');
    lines.push('# TYPE eme_slo_alerts_active gauge');
    for (const alert of status.active_alerts) {
      lines.push(`eme_slo_alerts_active{category="${alert.category}",severity="${alert.severity}"} 1`);
    }

    lines.push('# HELP eme_slo_telemetry_failures_total Telemetry and diagnostics errors count');
    lines.push('# TYPE eme_slo_telemetry_failures_total counter');
    lines.push(`eme_slo_telemetry_failures_total ${this.telemetryAlerts.length}`);

    return lines.join('\n') + '\n';
  }

  /**
   * Resets all internal stores and active alerts.
   */
  reset() {
    this.jobStarts.clear();
    this.jobRecords = [];
    this.lockWaits = [];
    this.qaEvaluations = [];
    this.recoveries = [];
    this.telemetryAlerts = [];
    this.activeAlerts.clear();
  }
}

const defaultSloMonitor = new SloMonitor({ autoSubscribe: true });

module.exports = {
  SloMonitor,
  defaultSloMonitor,
  DEFAULT_SLO_TARGETS
};
