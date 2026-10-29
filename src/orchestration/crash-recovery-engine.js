/**
 * Crash Recovery & Durable State Engine (Phase 30 Stage 30.2)
 *
 * Implements deterministic crash recovery, restart reconstruction,
 * delivery protection, and terminal state immutability:
 * - ARC-30-01: Reconstructs authoritative outcome from durable evidence on disk.
 * - ARC-30-02: Never misrepresents a committed mutation as rolled back.
 * - ARC-30-03: Discards uncommitted atomic candidates; preserves committed non-atomic steps.
 * - ARC-30-04: Idempotent retry protection against lost acknowledgements.
 * - ARC-30-05: Strict withholding of unverified/incomplete delivery candidates.
 * - ARC-30-06: Absolute preservation of active delivery during candidate failure.
 * - ARC-30-07: Terminal state immutability against delayed asynchronous callbacks.
 * - ARC-30-08: Historical success preservation with INTEGRITY_DRIFT_ALERT on post-success drift.
 * - ARC-30-09: Fail-closed routing of unresolvable ambiguity to NEEDS_RECONCILIATION.
 *
 * Zero external runtime npm dependencies; uses native Node.js core modules.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CanonicalJobStatus } = require('../prompt-core/job-orchestrator.js');

class CrashRecoveryEngine {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.resolve('artifacts/jobs');
    this.ledgerDir = options.ledgerDir || path.resolve('artifacts/ledger');
    this.alerts = [];
  }

  /**
   * Compute SHA-256 digest of a file.
   */
  static computeFileSha256(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Reconstruct outcome after process crash or interruption.
   * Derives commit truth strictly from authoritative durable records on disk.
   */
  reconstructOutcome(params = {}) {
    const {
      projectStateBefore,
      projectStateAfter,
      isAtomic = true,
      committedSteps = [],
      totalSteps = 1,
      acknowledged = false,
      job = null
    } = params;

    const initialRev = projectStateBefore?.project?.project_revision ?? 0;
    const currentRev = projectStateAfter?.project?.project_revision ?? initialRev;

    // Check if authoritative mutation committed to durable storage
    const mutationCommitted = currentRev > initialRev;

    // Case 1: Interruption before atomic commit
    if (!mutationCommitted) {
      return {
        outcome: 'UNCOMMITTED_DISCARDED',
        committed: false,
        finalRevision: initialRev,
        reconstructedState: projectStateBefore,
        jobStatus: CanonicalJobStatus.FAILED,
        deliveryAction: 'WITHHELD',
        evidence: {
          initialRevision: initialRev,
          observedRevision: currentRev,
          rationale: 'No durable revision increment found on disk; uncommitted candidate state discarded.'
        }
      };
    }

    // Case 2: Interruption after durable mutation commit
    if (mutationCommitted) {
      if (isAtomic) {
        return {
          outcome: 'COMMITTED_RECOVERED',
          committed: true,
          finalRevision: currentRev,
          reconstructedState: projectStateAfter,
          jobStatus: acknowledged ? CanonicalJobStatus.SUCCEEDED : CanonicalJobStatus.READY_TO_EXECUTE,
          deliveryAction: 'CANDIDATE_COMMITTED_PENDING_QA',
          evidence: {
            initialRevision: initialRev,
            observedRevision: currentRev,
            rationale: 'Durable project revision advanced monotonically on disk. Truth confirmed committed; no false rollback.'
          }
        };
      } else {
        // Non-atomic: inspect committed step journal
        const allStepsCommitted = committedSteps.length >= totalSteps;
        if (allStepsCommitted) {
          return {
            outcome: 'NON_ATOMIC_ALL_COMMITTED',
            committed: true,
            finalRevision: currentRev,
            reconstructedState: projectStateAfter,
            jobStatus: CanonicalJobStatus.SUCCEEDED,
            evidence: {
              committedStepsCount: committedSteps.length,
              totalSteps,
              rationale: 'All non-atomic steps successfully committed and journaled.'
            }
          };
        } else {
          // Partial non-atomic execution: preserve committed steps, route to reconciliation
          return {
            outcome: 'NON_ATOMIC_PARTIALLY_COMMITTED',
            committed: true,
            partial: true,
            finalRevision: currentRev,
            committedSteps,
            unappliedStepsCount: totalSteps - committedSteps.length,
            jobStatus: CanonicalJobStatus.NEEDS_RECONCILIATION,
            deliveryAction: 'WITHHELD',
            evidence: {
              initialRevision: initialRev,
              observedRevision: currentRev,
              committedStepsCount: committedSteps.length,
              totalSteps,
              rationale: 'Partial non-atomic execution committed step(s) preserved. Unexecuted steps require reconciliation.'
            }
          };
        }
      }
    }
  }

  /**
   * Handle client retry following lost acknowledgement (Crash between commit and ack).
   * Enforces durable idempotency without duplicate mutation.
   */
  handleLostAckRetry(params = {}) {
    const {
      operationId,
      idempotencyKey,
      currentProjectState,
      targetRevision,
      committedOperations = []
    } = params;

    // Check if operation was already committed
    const existing = committedOperations.find(
      op => op.operationId === operationId || (idempotencyKey && op.idempotencyKey === idempotencyKey)
    );

    if (existing) {
      return {
        idempotent: true,
        alreadyCommitted: true,
        projectRevision: currentProjectState.project.project_revision,
        reusedResult: existing.result,
        duplicateMutationPrevented: true,
        status: CanonicalJobStatus.SUCCEEDED,
        message: 'Idempotent replay detected existing committed mutation. Returned cached outcome without revision bump.'
      };
    }

    return {
      idempotent: false,
      alreadyCommitted: false,
      requiresExecution: true,
      message: 'Operation not previously committed; authorized for fresh execution.'
    };
  }

  /**
   * Strict Delivery Promotion Evaluation.
   * Withholds promotion if candidate artifact, checksum, manifest, or QA fails.
   * Guarantees active delivery remains 100% untouched on any failure.
   */
  evaluateCandidateDeliveryPromotion(params = {}) {
    const {
      candidateArtifactPath,
      manifest,
      qaReport,
      existingActiveDelivery
    } = params;

    const errors = [];

    // 1. Check physical candidate artifact existence
    if (!candidateArtifactPath || !fs.existsSync(candidateArtifactPath)) {
      errors.push(`Candidate artifact missing from disk: ${candidateArtifactPath}`);
    } else {
      const stat = fs.statSync(candidateArtifactPath);
      if (stat.size === 0) {
        errors.push(`Candidate artifact has zero byte length: ${candidateArtifactPath}`);
      }
    }

    // 2. Check candidate checksum against manifest
    let computedSha = null;
    if (candidateArtifactPath && fs.existsSync(candidateArtifactPath)) {
      computedSha = CrashRecoveryEngine.computeFileSha256(candidateArtifactPath);
      if (manifest?.package_artifact?.sha256 && manifest.package_artifact.sha256 !== computedSha) {
        errors.push(`Candidate checksum mismatch: manifest declared ${manifest.package_artifact.sha256}, computed ${computedSha}`);
      }
    }

    // 3. Check fresh QA report
    if (!qaReport) {
      errors.push('Missing post-render QA report');
    } else {
      if (qaReport.status !== 'passed') {
        errors.push(`Post-render QA failed with status: ${qaReport.status}`);
      }
      if (qaReport.candidate_sha256 && computedSha && qaReport.candidate_sha256 !== computedSha) {
        errors.push(`QA report candidate SHA-256 (${qaReport.candidate_sha256}) does not match artifact SHA-256 (${computedSha})`);
      }
    }

    // 4. If any error, withhold delivery and preserve active delivery
    if (errors.length > 0) {
      return {
        promoted: false,
        decision: 'DELIVERY_WITHHELD',
        errors,
        activeDelivery: existingActiveDelivery,
        activeDeliveryPreserved: true,
        jobStatus: CanonicalJobStatus.FAILED
      };
    }

    // 5. All gates passed: promote candidate
    const promotedDelivery = {
      delivery_id: `del_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      artifact_path: candidateArtifactPath,
      sha256: computedSha,
      promoted_at: new Date().toISOString(),
      qa_status: 'passed'
    };

    return {
      promoted: true,
      decision: 'DELIVERY_PROMOTED',
      errors: [],
      activeDelivery: promotedDelivery,
      activeDeliveryPreserved: false,
      jobStatus: CanonicalJobStatus.SUCCEEDED
    };
  }

  /**
   * Handle late arriving callback after job has reached terminal state.
   * Terminal states (SUCCEEDED, FAILED, CANCELLED) are strictly immutable.
   */
  handleLateCallback(job, callbackData = {}) {
    if (!job) {
      throw new Error('Job object is required');
    }

    const terminalStates = [
      CanonicalJobStatus.SUCCEEDED,
      CanonicalJobStatus.FAILED,
      CanonicalJobStatus.CANCELLED
    ];

    if (terminalStates.includes(job.status)) {
      return {
        rejected: true,
        reason: 'TERMINAL_STATE_IMMUTABLE',
        currentStatus: job.status,
        callbackData,
        message: `Job ${job.job_id || job.id} is in terminal state ${job.status}; late callback rejected without mutation.`
      };
    }

    return {
      rejected: false,
      reason: 'NON_TERMINAL',
      currentStatus: job.status,
      message: 'Job is active; callback processed.'
    };
  }

  /**
   * Audit historical active delivery for post-success artifact drift/tampering.
   * Emits INTEGRITY_DRIFT_ALERT while strictly preserving historical SUCCEEDED record.
   */
  auditHistoricalDeliveryIntegrity(historicalJob, activeDelivery) {
    if (!historicalJob || historicalJob.status !== CanonicalJobStatus.SUCCEEDED) {
      return { status: 'NOT_APPLICABLE' };
    }

    const artifactPath = activeDelivery?.artifact_path;
    const expectedSha = activeDelivery?.sha256;

    if (!artifactPath || !fs.existsSync(artifactPath)) {
      const alert = {
        alert_type: 'INTEGRITY_DRIFT_ALERT',
        job_id: historicalJob.job_id || historicalJob.id,
        reason: 'HISTORICAL_ARTIFACT_MISSING',
        expected_path: artifactPath,
        timestamp: new Date().toISOString()
      };
      this.alerts.push(alert);
      return {
        driftDetected: true,
        alert,
        historicalStatusPreserved: CanonicalJobStatus.SUCCEEDED,
        historicalSuccessRetained: true
      };
    }

    const computedSha = CrashRecoveryEngine.computeFileSha256(artifactPath);
    if (expectedSha && computedSha !== expectedSha) {
      const alert = {
        alert_type: 'INTEGRITY_DRIFT_ALERT',
        job_id: historicalJob.job_id || historicalJob.id,
        reason: 'HISTORICAL_CHECKSUM_MISMATCH',
        expected_sha256: expectedSha,
        computed_sha256: computedSha,
        timestamp: new Date().toISOString()
      };
      this.alerts.push(alert);
      return {
        driftDetected: true,
        alert,
        historicalStatusPreserved: CanonicalJobStatus.SUCCEEDED,
        historicalSuccessRetained: true
      };
    }

    return {
      driftDetected: false,
      historicalStatusPreserved: CanonicalJobStatus.SUCCEEDED,
      historicalSuccessRetained: true
    };
  }

  /**
   * Handle compensation failure.
   * If compensation cannot complete cleanly, escalate to NEEDS_RECONCILIATION.
   */
  handleCompensationFailure(params = {}) {
    const {
      operationId,
      compensationError,
      partiallyCompensatedState
    } = params;

    return {
      outcome: 'COMPENSATION_FAILED_RECONCILIATION_REQUIRED',
      status: CanonicalJobStatus.NEEDS_RECONCILIATION,
      reconciliationRequired: true,
      operationId,
      error: compensationError?.message || String(compensationError),
      durableState: partiallyCompensatedState,
      message: 'Compensation could not complete cleanly. Failed closed to NEEDS_RECONCILIATION without false recovery claim.'
    };
  }
}

module.exports = { CrashRecoveryEngine };
