/**
 * Durable Job Lifecycle Manager (Phase 14B)
 *
 * Implements a lightweight, local, persisted job state machine.
 * Supports:
 * - Deterministic, validated state transitions
 * - Atomic persistence to disk (schema/eme-job.v1.schema.json)
 * - Safe suspension, resumption, and cancellation
 * - Idempotency guarantees (no duplicate mutations on replay)
 * - Asset hash re-verification on resume
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JobStatus = {
  CREATED: 'CREATED',
  INGESTING: 'INGESTING',
  ANALYZING: 'ANALYZING',
  PLANNING: 'PLANNING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  VALIDATING: 'VALIDATING',
  EXECUTING: 'EXECUTING',
  RENDERING: 'RENDERING',
  QA_EVALUATING: 'QA_EVALUATING',
  CORRECTING: 'CORRECTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  SUSPENDED: 'SUSPENDED'
};

const ValidTransitions = {
  [JobStatus.CREATED]: [JobStatus.INGESTING, JobStatus.FAILED, JobStatus.CANCELLED],
  [JobStatus.INGESTING]: [JobStatus.ANALYZING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.ANALYZING]: [JobStatus.PLANNING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.PLANNING]: [JobStatus.AWAITING_APPROVAL, JobStatus.VALIDATING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.AWAITING_APPROVAL]: [JobStatus.VALIDATING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.VALIDATING]: [JobStatus.EXECUTING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.EXECUTING]: [JobStatus.RENDERING, JobStatus.QA_EVALUATING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.RENDERING]: [JobStatus.QA_EVALUATING, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.SUSPENDED],
  [JobStatus.QA_EVALUATING]: [JobStatus.CORRECTING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED],
  [JobStatus.CORRECTING]: [JobStatus.EXECUTING, JobStatus.RENDERING, JobStatus.FAILED, JobStatus.CANCELLED],
  [JobStatus.SUSPENDED]: [JobStatus.VALIDATING, JobStatus.EXECUTING, JobStatus.RENDERING, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.FAILED]: [JobStatus.VALIDATING, JobStatus.EXECUTING], // Allow retry from recovery
  [JobStatus.CANCELLED]: []
};

class JobManager {
  constructor(storageDir = 'artifacts/jobs') {
    this.storageDir = path.resolve(storageDir);
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  _getJobPath(jobId) {
    return path.join(this.storageDir, `${jobId}.json`);
  }

  /**
   * Create and persist a new job.
   */
  createJob(jobId, initialMeta = {}) {
    const id = jobId || `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const job = {
      jobId: id,
      schemaVersion: '1.0.0',
      status: JobStatus.CREATED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stateHistory: [],
      assetManifest: initialMeta.assetManifest || [],
      executedOperations: [],
      approvalState: { required: false, approved: false },
      ...initialMeta
    };

    this.saveJob(job);
    return job;
  }

  /**
   * Load a persisted job from disk.
   */
  loadJob(jobId) {
    const p = this._getJobPath(jobId);
    if (!fs.existsSync(p)) {
      throw new Error(`Job not found: ${jobId}`);
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  /**
   * Atomically save job to disk.
   */
  saveJob(job) {
    job.updatedAt = new Date().toISOString();
    const p = this._getJobPath(job.jobId);
    const tmp = `${p}.tmp_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2), 'utf8');
    fs.renameSync(tmp, p);
    return job;
  }

  /**
   * Transition job status with validation.
   */
  transition(jobId, toStatus, reason = '') {
    const job = this.loadJob(jobId);
    const fromStatus = job.status;

    const allowed = ValidTransitions[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      throw new Error(`Invalid state transition: cannot transition job ${jobId} from ${fromStatus} to ${toStatus}`);
    }

    job.status = toStatus;
    job.stateHistory.push({
      fromStatus,
      toStatus,
      timestamp: new Date().toISOString(),
      reason
    });

    return this.saveJob(job);
  }

  /**
   * Verify source asset hashes on resume.
   */
  verifyAssetIntegrity(jobId) {
    const job = this.loadJob(jobId);
    const { SourceAnalyzer } = require('../planning/source-analyzer.js');

    for (const asset of job.assetManifest || []) {
      const abs = path.resolve(asset.path);
      if (!fs.existsSync(abs)) {
        return { valid: false, error: `Asset missing on resume: ${asset.path}` };
      }
      const currentHash = SourceAnalyzer.computeSha256(abs);
      if (asset.sha256 && currentHash !== asset.sha256) {
        return {
          valid: false,
          error: `Asset hash mismatch on resume for ${asset.path}: expected ${asset.sha256}, got ${currentHash}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Suspend a running job safely.
   */
  suspend(jobId, reason = 'Process shutdown / pause') {
    return this.transition(jobId, JobStatus.SUSPENDED, reason);
  }

  /**
   * Cancel a job safely.
   */
  cancel(jobId, reason = 'User requested cancellation') {
    return this.transition(jobId, JobStatus.CANCELLED, reason);
  }

  /**
   * Mark job failed with error payload.
   */
  fail(jobId, err = {}, phase = '') {
    const job = this.loadJob(jobId);
    job.error = {
      code: err.code || 'ERR_JOB_FAILED',
      message: err.message || String(err),
      phase,
      timestamp: new Date().toISOString()
    };
    this.saveJob(job);
    return this.transition(jobId, JobStatus.FAILED, err.message);
  }
}

module.exports = {
  JobManager,
  JobStatus
};
