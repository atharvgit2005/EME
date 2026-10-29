/**
 * Editing Mechanics Engine (EME) - Representative Workload Engine & SLO Stress Validator
 * Conforms to Phase 22 (Stage 22.1): Representative Workload Engine & SLO Stress Validation
 *
 * Implements:
 * 1. Multi-distribution workload synthesis:
 *    - LOW_VOLUME: sparse traffic, cold starts, tests sample sufficiency guards
 *    - BURST: abrupt concurrent traffic spikes testing lock contention & latency tail percentiles
 *    - SUSTAINED_PEAK: steady high-throughput load verifying sliding window maintenance & percentile stability
 *    - CHAOS_DEGRADED: fault injection to verify alert state machine transitions (HEALTHY -> WARNING -> CRITICAL -> RECOVERY)
 * 2. Guard evaluation:
 *    - Cold-start & zero-traffic guard: prevents premature high-confidence SLA certification under low sample counts
 *    - Telemetry drop & failure guard: isolates telemetry collector failures from core workflow availability
 * 3. Latency & contention stress testing:
 *    - Validates mathematical correctness of p50, p95, p99 nearest-rank percentiles under high volume
 * 4. Zero external runtime npm dependencies.
 */

const { SloMonitor, DEFAULT_SLO_TARGETS } = require('./slo-monitor.js');

const WORKLOAD_PROFILES = {
  LOW_VOLUME: 'LOW_VOLUME',
  BURST: 'BURST',
  SUSTAINED_PEAK: 'SUSTAINED_PEAK',
  CHAOS_DEGRADED: 'CHAOS_DEGRADED'
};

const SAMPLE_SUFFICIENCY_THRESHOLDS = {
  minAvailabilitySamples: 5,
  minLatencySamples: 3,
  minContentionSamples: 5,
  minQaSamples: 5,
  minRecoverySamples: 1
};

class WorkloadValidator {
  /**
   * @param {SloMonitor} [sloMonitor]
   * @param {object} [options={}]
   */
  constructor(sloMonitor = null, options = {}) {
    this.monitor = sloMonitor || new SloMonitor({ autoSubscribe: false });
    this.thresholds = { ...SAMPLE_SUFFICIENCY_THRESHOLDS, ...(options.thresholds || {}) };
    this.executionHistory = [];
  }

  /**
   * Synthesizes and applies a workload distribution to the SLO monitor.
   *
   * @param {string} profile - One of WORKLOAD_PROFILES
   * @param {object} [config={}]
   * @returns {object} Execution summary
   */
  synthesizeWorkload(profile, config = {}) {
    const summary = {
      profile,
      timestamp: Date.now(),
      jobsGenerated: 0,
      succeeded: 0,
      failed: 0,
      needsReconciliation: 0,
      cancelled: 0,
      lockWaitsGenerated: 0,
      qaEvaluated: 0,
      recoveriesGenerated: 0,
      telemetryErrorsGenerated: 0
    };

    switch (profile) {
      case WORKLOAD_PROFILES.LOW_VOLUME: {
        const count = config.count || 2;
        for (let i = 1; i <= count; i++) {
          const dur = config.durationMs || (1200 + i * 100);
          this.monitor.recordJobCompletion(`low-vol-${i}`, 'SUCCEEDED', dur);
          summary.jobsGenerated++;
          summary.succeeded++;
          this.monitor.recordLockWait(2);
          summary.lockWaitsGenerated++;
        }
        break;
      }

      case WORKLOAD_PROFILES.BURST: {
        // High concurrency burst: e.g. 50 jobs arriving in a narrow window
        const burstSize = config.burstSize || 50;
        const baseLatency = config.baseLatencyMs || 1500;
        const spikeMultiplier = config.spikeMultiplier || 4;

        for (let i = 1; i <= burstSize; i++) {
          // 90% normal, 10% tail latency spike
          const isSpike = (i % 10 === 0);
          const duration = isSpike ? (baseLatency * spikeMultiplier) : (baseLatency + (i * 20));
          this.monitor.recordJobCompletion(`burst-job-${i}`, 'SUCCEEDED', duration);
          summary.jobsGenerated++;
          summary.succeeded++;

          // Higher lock wait under burst contention
          const lockWait = isSpike ? 65 : (5 + (i % 15));
          this.monitor.recordLockWait(lockWait);
          summary.lockWaitsGenerated++;

          if (i % 5 === 0) {
            this.monitor.recordQaEvaluation(94.0, true);
            summary.qaEvaluated++;
          }
        }
        break;
      }

      case WORKLOAD_PROFILES.SUSTAINED_PEAK: {
        // Sustained high throughput over multiple windows
        const totalJobs = config.totalJobs || 200;
        const failureRate = config.failureRate || 0.002; // 99.8% success nominal

        for (let i = 1; i <= totalJobs; i++) {
          const isFailure = Math.random() < failureRate;
          const status = isFailure ? 'FAILED' : 'SUCCEEDED';
          const duration = 1000 + (i % 2000);

          this.monitor.recordJobCompletion(`sustained-job-${i}`, status, duration);
          summary.jobsGenerated++;
          if (status === 'SUCCEEDED') summary.succeeded++;
          else summary.failed++;

          this.monitor.recordLockWait(3 + (i % 20));
          summary.lockWaitsGenerated++;

          if (i % 4 === 0) {
            this.monitor.recordQaEvaluation(92.0 + (i % 6), true);
            summary.qaEvaluated++;
          }
        }
        break;
      }

      case WORKLOAD_PROFILES.CHAOS_DEGRADED: {
        // Degraded conditions triggering warnings, critical alerts, and recovery
        const total = config.totalJobs || 30;
        for (let i = 1; i <= total; i++) {
          let status = 'SUCCEEDED';
          let duration = 2000;

          if (i <= 18) {
            status = 'SUCCEEDED';
          } else if (i <= 26) {
            // Induce availability drop
            status = 'FAILED';
            duration = 35000; // Latency spike
          } else {
            status = 'NEEDS_RECONCILIATION';
          }

          this.monitor.recordJobCompletion(`chaos-job-${i}`, status, duration);
          summary.jobsGenerated++;
          if (status === 'SUCCEEDED') summary.succeeded++;
          else if (status === 'FAILED') summary.failed++;
          else summary.needsReconciliation++;

          // High lock contention
          this.monitor.recordLockWait(i > 15 ? 120 : 15);
          summary.lockWaitsGenerated++;

          // QA rejections
          if (i % 3 === 0) {
            const passed = i < 15;
            this.monitor.recordQaEvaluation(passed ? 90.0 : 60.0, passed);
            summary.qaEvaluated++;
          }
        }

        if (config.injectTelemetryError) {
          this.monitor.recordTelemetryError('chaos-telemetry', new Error('Simulated socket hangup in diagnostics'));
          summary.telemetryErrorsGenerated++;
        }

        if (config.injectRecovery) {
          this.monitor.recordRecovery(config.recoveryDurationMs || 850, config.dataLoss || 0);
          summary.recoveriesGenerated++;
        }
        break;
      }

      default:
        throw new Error(`Unknown workload profile: ${profile}`);
    }

    this.executionHistory.push(summary);
    return summary;
  }

  /**
   * Evaluates sample sufficiency to protect against misleading health claims during cold start or low traffic.
   *
   * @returns {object} Sample sufficiency analysis
   */
  evaluateSampleSufficiency() {
    const status = this.monitor.getSloStatus();
    const m = status.metrics;

    const availCount = m.workflow_availability.total;
    const latCount = m.job_latency.sampleCount;
    const contCount = m.lock_contention.sampleCount;
    const qaCount = m.qa_rejection.total;
    const recCount = m.operational_recovery.sampleCount;

    const availSufficient = availCount >= this.thresholds.minAvailabilitySamples;
    const latSufficient = latCount >= this.thresholds.minLatencySamples;
    const contSufficient = contCount >= this.thresholds.minContentionSamples;
    const qaSufficient = qaCount >= this.thresholds.minQaSamples;

    // Overall confidence scoring
    let confidence = 'HIGH';
    let assessment = status.status; // HEALTHY or DEGRADED

    if (availCount === 0 && latCount === 0) {
      confidence = 'NO_DATA';
      assessment = 'INSUFFICIENT_DATA';
    } else if (!availSufficient || !latSufficient) {
      confidence = 'LOW';
      assessment = status.status === 'DEGRADED' ? 'DEGRADED' : 'INSUFFICIENT_DATA';
    } else if (!contSufficient || !qaSufficient) {
      confidence = 'MODERATE';
    }

    return {
      assessment,
      confidence,
      allSamplesSufficient: availSufficient && latSufficient && contSufficient && qaSufficient,
      counts: {
        workflow_availability: { count: availCount, required: this.thresholds.minAvailabilitySamples, sufficient: availSufficient },
        job_latency: { count: latCount, required: this.thresholds.minLatencySamples, sufficient: latSufficient },
        lock_contention: { count: contCount, required: this.thresholds.minContentionSamples, sufficient: contSufficient },
        qa_rejection: { count: qaCount, required: this.thresholds.minQaSamples, sufficient: qaSufficient },
        operational_recovery: { count: recCount, required: this.thresholds.minRecoverySamples }
      },
      telemetry_health: {
        telemetry_errors_count: status.telemetry_alerts_count,
        healthy: status.telemetry_alerts_count === 0,
        isolated_from_workflow_slo: true
      }
    };
  }

  /**
   * Executes a step-by-step alert transition lifecycle drill:
   * HEALTHY -> WARNING -> CRITICAL -> RECOVERY -> HEALTHY.
   *
   * @returns {object} Audit trace of alert transitions
   */
  verifyAlertTransitions() {
    const trace = [];
    const monitor = new SloMonitor({ autoSubscribe: false });
    const localValidator = new WorkloadValidator(monitor, { thresholds: this.thresholds });

    // Step 1: Initial Clean State
    trace.push({
      step: 'INITIAL_STATE',
      status: monitor.getSloStatus().status,
      activeAlerts: monitor.getSloStatus().active_alerts.length,
      expected: 'HEALTHY'
    });

    // Step 2: Nominal Workload -> HEALTHY with HIGH confidence
    for (let i = 1; i <= 10; i++) {
      monitor.recordJobCompletion(`init-${i}`, 'SUCCEEDED', 1200);
      monitor.recordLockWait(5);
      monitor.recordQaEvaluation(95.0, true);
    }
    const stateNominal = monitor.getSloStatus();
    trace.push({
      step: 'NOMINAL_WORKLOAD',
      status: stateNominal.status,
      availability: stateNominal.metrics.workflow_availability.percentage,
      activeAlerts: stateNominal.active_alerts.length,
      expected: 'HEALTHY'
    });

    // Step 3: Trigger WARNING (drop availability to 90.9% with 1 failure out of 11)
    monitor.recordJobCompletion('warn-fail-1', 'FAILED', 1200);
    const stateWarn = monitor.getSloStatus();
    const warnAlert = stateWarn.active_alerts.find(a => a.category === 'WORKFLOW_SLO_BREACH');
    trace.push({
      step: 'TRIGGER_WARNING',
      status: stateWarn.status,
      availability: stateWarn.metrics.workflow_availability.percentage,
      severity: warnAlert ? warnAlert.severity : null,
      expected: 'WARNING'
    });

    // Step 4: Trigger CRITICAL (drop availability below 90% by adding 3 failures -> 10/14 = 71.4%)
    monitor.recordJobCompletion('crit-fail-2', 'FAILED', 1200);
    monitor.recordJobCompletion('crit-fail-3', 'FAILED', 1200);
    monitor.recordJobCompletion('crit-fail-4', 'NEEDS_RECONCILIATION', 1200);
    const stateCrit = monitor.getSloStatus();
    const critAlert = stateCrit.active_alerts.find(a => a.category === 'WORKFLOW_SLO_BREACH');
    trace.push({
      step: 'TRIGGER_CRITICAL',
      status: stateCrit.status,
      availability: stateCrit.metrics.workflow_availability.percentage,
      severity: critAlert ? critAlert.severity : null,
      expected: 'CRITICAL'
    });

    // Step 5: Execute Recovery and add successful jobs to restore SLO >= 99.5%
    // To restore 10 / (14 + X) >= 0.995: (10 + X) / (14 + X) >= 0.995 => 0.005 X >= 3.93 => X >= 786 jobs
    // Or we reset sliding window / simulate window passing or log 800 successful jobs:
    for (let i = 1; i <= 800; i++) {
      monitor.recordJobCompletion(`recovery-job-${i}`, 'SUCCEEDED', 1100);
    }
    monitor.recordRecovery(350, 0); // 350ms RTO, 0 data loss

    const stateRecovered = monitor.getSloStatus();
    const remainingAlerts = stateRecovered.active_alerts.filter(a => a.category === 'WORKFLOW_SLO_BREACH');
    trace.push({
      step: 'RESTORE_HEALTHY',
      status: stateRecovered.status,
      availability: stateRecovered.metrics.workflow_availability.percentage,
      activeWorkflowAlerts: remainingAlerts.length,
      allSlosMet: stateRecovered.all_slos_met,
      expected: 'HEALTHY'
    });

    const success = trace[0].status === 'HEALTHY' &&
                    trace[1].status === 'HEALTHY' &&
                    trace[2].severity === 'WARNING' &&
                    trace[3].severity === 'CRITICAL' &&
                    trace[4].status === 'HEALTHY' &&
                    trace[4].activeWorkflowAlerts === 0;

    return { success, trace };
  }

  /**
   * Stress tests percentile calculations against known distributions.
   *
   * @param {number} sampleCount
   * @returns {object} Validation results
   */
  validatePercentileMethodology(sampleCount = 1000) {
    const latencies = [];
    for (let i = 1; i <= sampleCount; i++) {
      latencies.push(i); // 1 to sampleCount
    }

    const monitor = new SloMonitor({ autoSubscribe: false });
    for (const lat of latencies) {
      monitor.recordJobCompletion(`stress-${lat}`, 'SUCCEEDED', lat);
    }

    const calculated = monitor.calculateLatency();

    // With 1000 sorted items:
    // p50 index = ceil(0.50 * 1000) - 1 = 499 => value = 500
    // p95 index = ceil(0.95 * 1000) - 1 = 949 => value = 950
    // p99 index = ceil(0.99 * 1000) - 1 = 989 => value = 990
    const expectedP50 = Math.round(sampleCount * 0.50);
    const expectedP95 = Math.round(sampleCount * 0.95);
    const expectedP99 = Math.round(sampleCount * 0.99);

    const matchP50 = (calculated.p50 === expectedP50);
    const matchP95 = (calculated.p95 === expectedP95);
    const matchP99 = (calculated.p99 === expectedP99);

    return {
      sampleCount,
      calculated: { p50: calculated.p50, p95: calculated.p95, p99: calculated.p99 },
      expected: { p50: expectedP50, p95: expectedP95, p99: expectedP99 },
      exactMatch: matchP50 && matchP95 && matchP99
    };
  }
}

module.exports = {
  WorkloadValidator,
  WORKLOAD_PROFILES,
  SAMPLE_SUFFICIENCY_THRESHOLDS
};
