/**
 * Editing Mechanics Engine (EME) - Controlled Production Pilot & Canary Controller
 * Conforms to Phase 22 (Stage 22.3): Controlled Production Pilot & Progressive Canary Execution
 *
 * Capabilities:
 * 1. Codified Pilot Cohort Definition with eligibility filtering & observation windows.
 * 2. Progressive Canary State Machine: Gate 0% -> Gate 10% -> Gate 50% -> Gate 100%.
 * 3. Real-Time SLI Evidence Sampling with strict abort thresholds.
 * 4. Immediate Automated Containment on Active Delivery Integrity Breach.
 * 5. Append-only Pilot Health Ledger recording all transitions and gate decisions.
 *
 * Zero external runtime npm dependencies.
 */

const { RollbackManager } = require('./rollback-manager.js');
const { SloMonitor } = require('./slo-monitor.js');
const { defaultLogger } = require('./logger.js');

const PILOT_GATES = [0, 10, 50, 100];

const DEFAULT_PILOT_CONFIG = {
  cohortId: 'cohort-eme-prod-pilot',
  minObservationDurationMs: 1000, // Configurable per deployment/drill
  minJobCountPerGate: 10,
  maxErrorRatePercent: 0.5,
  maxLatencyP95Ms: 15000,
  maxContentionP99Ms: 50,
  maxQaRejectionPercent: 5.0,
  requireActiveDeliveryIntact: true
};

class PilotController {
  /**
   * @param {object} [options={}]
   * @param {RollbackManager} [options.rollbackManager]
   * @param {SloMonitor} [options.sloMonitor]
   * @param {object} [options.config]
   */
  constructor(options = {}) {
    this.rollbackManager = options.rollbackManager || new RollbackManager();
    this.sloMonitor = options.sloMonitor || new SloMonitor({ autoSubscribe: false });
    this.config = { ...DEFAULT_PILOT_CONFIG, ...(options.config || {}) };

    this.currentGate = 0; // 0, 10, 50, 100, or -1 (CONTAINED)
    this.stageStartTime = Date.now();
    this.stageJobCounts = { succeeded: 0, failed: 0, needsReconciliation: 0 };
    this.stageLockWaits = [];
    this.stageQaEvaluations = [];
    this.activeDeliveryCompromised = false;
    this.isContained = false;

    // Append-only audit ledger
    this.healthLedger = [];
    this._recordLedgerEntry('PILOT_INITIALIZED', {
      initialGate: 0,
      config: this.config
    });
  }

  /**
   * Appends an entry to the pilot health ledger.
   */
  _recordLedgerEntry(action, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      action,
      currentGate: this.currentGate,
      isContained: this.isContained,
      ...details
    };
    this.healthLedger.push(entry);
    defaultLogger.info(`Pilot Health Ledger: ${action} (Gate: ${this.currentGate}%)`, details);
    return entry;
  }

  /**
   * Checks whether an incoming job/request is eligible for the pilot cohort.
   *
   * @param {object} request
   * @returns {boolean}
   */
  isRequestEligible(request = {}) {
    if (this.isContained) return false;
    if (this.currentGate === 0) return false;
    if (this.currentGate === 100) return true;

    // Deterministic cohort sampling based on correlation ID or tenant ID hash
    const seed = request.correlationId || request.jobId || request.tenantId || String(Math.random());
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const bucket = Math.abs(hash) % 100;
    return bucket < this.currentGate;
  }

  /**
   * Records a pilot job execution outcome.
   *
   * @param {object} result
   */
  recordJobExecution(result) {
    const { jobId, status, durationMs = 0, lockWaitMs = 0, qaScore = null, activeDeliveryVerified = true } = result;

    if (!activeDeliveryVerified) {
      this.activeDeliveryCompromised = true;
      this.triggerImmediateContainment('Active delivery integrity verification failure');
      return;
    }

    if (status === 'SUCCEEDED') {
      this.stageJobCounts.succeeded++;
    } else if (status === 'FAILED') {
      this.stageJobCounts.failed++;
    } else if (status === 'NEEDS_RECONCILIATION') {
      this.stageJobCounts.needsReconciliation++;
    }

    if (lockWaitMs > 0) {
      this.stageLockWaits.push(lockWaitMs);
    }
    if (qaScore !== null) {
      this.stageQaEvaluations.push({ score: qaScore, passed: qaScore >= 85.0 });
    }

    this.sloMonitor.recordJobCompletion(jobId, status, durationMs);
    if (lockWaitMs > 0) this.sloMonitor.recordLockWait(lockWaitMs);
    if (qaScore !== null) this.sloMonitor.recordQaEvaluation(qaScore, qaScore >= 85.0);
  }

  /**
   * Evaluates readiness to advance to the next canary gate against measured evidence.
   *
   * @returns {object} Evaluation outcome
   */
  evaluateGateAdvancement() {
    if (this.isContained) {
      return {
        canAdvance: false,
        shouldContain: true,
        currentGate: this.currentGate,
        nextGate: this.currentGate,
        reason: 'Pilot is in CONTAINED state due to earlier breach'
      };
    }

    if (this.activeDeliveryCompromised) {
      return this.triggerImmediateContainment('Active delivery integrity compromised');
    }

    const now = Date.now();
    const elapsedMs = now - this.stageStartTime;
    const totalJobs = this.stageJobCounts.succeeded + this.stageJobCounts.failed + this.stageJobCounts.needsReconciliation;
    const errorJobs = this.stageJobCounts.failed + this.stageJobCounts.needsReconciliation;
    const errorRatePercent = totalJobs > 0 ? (errorJobs / totalJobs) * 100 : 0;

    const sloStatus = this.sloMonitor.getSloStatus();
    const latencyP95 = sloStatus.metrics.job_latency.p95;
    const contentionP99 = sloStatus.metrics.lock_contention.p99;
    const qaRejectionRate = sloStatus.metrics.qa_rejection.rejectionPercentage;

    // Check Abort Thresholds
    if (totalJobs >= this.config.minJobCountPerGate && errorRatePercent > this.config.maxErrorRatePercent) {
      return this.triggerImmediateContainment(`Error rate (${errorRatePercent.toFixed(2)}%) exceeded threshold (${this.config.maxErrorRatePercent}%)`);
    }

    if (totalJobs >= this.config.minJobCountPerGate && latencyP95 > this.config.maxLatencyP95Ms) {
      return this.triggerImmediateContainment(`p95 Latency (${latencyP95}ms) exceeded threshold (${this.config.maxLatencyP95Ms}ms)`);
    }

    if (this.stageLockWaits.length >= 5 && contentionP99 > this.config.maxContentionP99Ms) {
      return this.triggerImmediateContainment(`p99 Lock Contention (${contentionP99}ms) exceeded threshold (${this.config.maxContentionP99Ms}ms)`);
    }

    if (this.stageQaEvaluations.length >= 5 && qaRejectionRate > this.config.maxQaRejectionPercent) {
      return this.triggerImmediateContainment(`QA Rejection rate (${qaRejectionRate.toFixed(2)}%) exceeded threshold (${this.config.maxQaRejectionPercent}%)`);
    }

    // Check Gate Advancement Criteria
    const durationSatisfied = elapsedMs >= this.config.minObservationDurationMs;
    const jobsSatisfied = totalJobs >= this.config.minJobCountPerGate;

    const currentGateIdx = PILOT_GATES.indexOf(this.currentGate);
    if (currentGateIdx === -1 || currentGateIdx >= PILOT_GATES.length - 1) {
      if (this.currentGate === 100) {
        return {
          canAdvance: false,
          isComplete: true,
          currentGate: 100,
          nextGate: 100,
          reason: 'Pilot successfully achieved 100% production rollout with clean SLO compliance',
          evidence: { totalJobs, errorRatePercent, latencyP95, contentionP99, elapsedMs }
        };
      }
      return { canAdvance: false, reason: 'Invalid gate state' };
    }

    const nextGate = PILOT_GATES[currentGateIdx + 1];

    if (!durationSatisfied) {
      return {
        canAdvance: false,
        currentGate: this.currentGate,
        nextGate: this.currentGate,
        reason: `Observation duration (${elapsedMs}ms) has not met minimum requirement (${this.config.minObservationDurationMs}ms)`,
        evidence: { elapsedMs, requiredMs: this.config.minObservationDurationMs, totalJobs }
      };
    }

    if (!jobsSatisfied) {
      return {
        canAdvance: false,
        currentGate: this.currentGate,
        nextGate: this.currentGate,
        reason: `Sample job count (${totalJobs}) has not met minimum requirement (${this.config.minJobCountPerGate})`,
        evidence: { totalJobs, requiredJobs: this.config.minJobCountPerGate, elapsedMs }
      };
    }

    // All criteria satisfied -> Can advance
    return {
      canAdvance: true,
      currentGate: this.currentGate,
      nextGate,
      reason: `Gate criteria satisfied for Gate ${this.currentGate}%. Ready to advance to Gate ${nextGate}%`,
      evidence: { totalJobs, errorRatePercent, latencyP95, contentionP99, elapsedMs }
    };
  }

  /**
   * Promotes the pilot to the next canary gate.
   *
   * @returns {object} Promotion result
   */
  advanceToNextGate() {
    const evaluation = this.evaluateGateAdvancement();
    if (!evaluation.canAdvance) {
      throw new Error(`Cannot advance canary gate: ${evaluation.reason}`);
    }

    const previousGate = this.currentGate;
    this.currentGate = evaluation.nextGate;
    this.stageStartTime = Date.now();
    this.stageJobCounts = { succeeded: 0, failed: 0, needsReconciliation: 0 };
    this.stageLockWaits = [];
    this.stageQaEvaluations = [];

    this._recordLedgerEntry('GATE_ADVANCED', {
      fromGate: previousGate,
      toGate: this.currentGate,
      evidence: evaluation.evidence
    });

    return {
      success: true,
      fromGate: previousGate,
      toGate: this.currentGate,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Immediately contains the pilot, halts rollout, and reverts traffic.
   *
   * @param {string} reason
   * @param {string} [rollbackDestDir]
   * @returns {object} Containment result
   */
  triggerImmediateContainment(reason, rollbackDestDir = null) {
    this.isContained = true;
    const priorGate = this.currentGate;
    this.currentGate = -1; // CONTAINED

    let rollbackResult = null;
    if (rollbackDestDir) {
      rollbackResult = this.rollbackManager.executeRollback(rollbackDestDir);
    }

    const entry = this._recordLedgerEntry('CONTAINMENT_TRIGGERED', {
      priorGate,
      reason,
      activeDeliveryCompromised: this.activeDeliveryCompromised,
      rollbackResult
    });

    return {
      canAdvance: false,
      contained: true,
      priorGate,
      currentGate: -1,
      reason,
      activeDeliveryCompromised: this.activeDeliveryCompromised,
      rollbackResult,
      ledgerEntry: entry
    };
  }

  /**
   * Returns complete pilot status and health ledger.
   *
   * @returns {object}
   */
  getPilotStatus() {
    return {
      cohortId: this.config.cohortId,
      currentGate: this.currentGate,
      isContained: this.isContained,
      activeDeliveryCompromised: this.activeDeliveryCompromised,
      stageElapsedMs: Date.now() - this.stageStartTime,
      stageJobCounts: { ...this.stageJobCounts },
      sloStatus: this.sloMonitor.getSloStatus(),
      ledgerLength: this.healthLedger.length,
      healthLedger: [...this.healthLedger]
    };
  }
}

module.exports = {
  PilotController,
  PILOT_GATES,
  DEFAULT_PILOT_CONFIG
};
