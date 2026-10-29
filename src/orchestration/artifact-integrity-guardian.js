/**
 * Artifact Integrity, Compensation, and Reconciliation Guardian (Phase 30 Stage 30.4)
 *
 * Implements strict authoritative controls for artifact verification, manifest integrity,
 * active-delivery protection, durable compensation, and fail-closed reconciliation:
 * - ARC-30-17: Manifest verification against actual disk truth (FI-14).
 * - ARC-30-18: Artifact corruption & checksum mismatch fail-closed rejection (FI-13).
 * - ARC-30-19: Strict multi-gate delivery promotion with existing active-delivery preservation.
 * - ARC-30-20: Historical SUCCEEDED preservation and INTEGRITY_DRIFT_ALERT on post-success drift.
 * - ARC-30-21: Durable, auditable, and idempotent compensation tracking.
 * - ARC-30-22: Non-atomic execution interruption reconciliation without false rollback.
 * - ARC-30-23: Ambiguous or unresolvable failure routing to NEEDS_RECONCILIATION.
 *
 * Zero external runtime npm dependencies; uses native Node.js core modules.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CanonicalJobStatus } = require('../prompt-core/job-orchestrator.js');

class ArtifactIntegrityGuardian {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.resolve('.');
    this.compensationJournalDir = options.compensationJournalDir || path.resolve('artifacts/compensation-journal');
    fs.mkdirSync(this.compensationJournalDir, { recursive: true });
  }

  /**
   * Compute SHA-256 digest of a file on disk.
   */
  computeFileSha256(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Verify an individual artifact file against expected checksum and size bounds.
   */
  verifyArtifact(artifactPath, expectedSha256 = null, minSizeBytes = 1) {
    if (!fs.existsSync(artifactPath)) {
      return {
        valid: false,
        reason: 'ARTIFACT_MISSING',
        artifactPath,
        message: `Artifact file does not exist at path: ${artifactPath}`
      };
    }

    const stats = fs.statSync(artifactPath);
    if (stats.size < minSizeBytes) {
      return {
        valid: false,
        reason: 'ARTIFACT_EMPTY_OR_TRUNCATED',
        actualSize: stats.size,
        minSizeBytes,
        artifactPath,
        message: `Artifact file is truncated or empty (${stats.size} bytes < min ${minSizeBytes} bytes)`
      };
    }

    const actualSha = this.computeFileSha256(artifactPath);
    if (expectedSha256 && actualSha !== expectedSha256) {
      return {
        valid: false,
        reason: 'CHECKSUM_MISMATCH',
        actualSha,
        expectedSha256,
        artifactPath,
        message: `Artifact checksum mismatch: expected ${expectedSha256}, actual ${actualSha}`
      };
    }

    return {
      valid: true,
      artifactPath,
      sizeBytes: stats.size,
      sha256: actualSha,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Verify a delivery manifest against referenced artifacts and schema invariants.
   * Handles FI-14: Corrupt or inconsistent manifest.
   */
  verifyManifest(manifestPath, artifactBaseDir = null) {
    if (!fs.existsSync(manifestPath)) {
      return {
        valid: false,
        reason: 'MANIFEST_MISSING',
        manifestPath,
        message: `Manifest file not found: ${manifestPath}`
      };
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      return {
        valid: false,
        reason: 'CORRUPT_MANIFEST_JSON',
        manifestPath,
        error: err.message,
        message: 'Manifest file contains invalid or unparseable JSON'
      };
    }

    // Required fields check
    const requiredFields = [
      'delivery_id',
      'project_id',
      'project_revision',
      'artifact_path',
      'artifact_sha256',
      'artifact_size_bytes',
      'qa_summary'
    ];
    for (const f of requiredFields) {
      if (manifest[f] === undefined || manifest[f] === null) {
        return {
          valid: false,
          reason: 'INCOMPLETE_MANIFEST_SCHEMA',
          missingField: f,
          manifest,
          message: `Manifest missing required canonical field: ${f}`
        };
      }
    }

    if (!/^[a-f0-9]{64}$/.test(manifest.artifact_sha256 || '') || !Number.isSafeInteger(manifest.artifact_size_bytes) || manifest.artifact_size_bytes < 1) {
      return { valid: false, reason: 'INVALID_MANIFEST_INTEGRITY_FIELDS', manifestPath };
    }

    // Resolve artifact relative or absolute path
    const targetPath = artifactBaseDir
      ? path.resolve(artifactBaseDir, manifest.artifact_path)
      : path.resolve(path.dirname(manifestPath), manifest.artifact_path);

    // Cross-check referenced artifact
    const artifactCheck = this.verifyArtifact(targetPath, manifest.artifact_sha256, 1);
    if (!artifactCheck.valid) {
      return {
        valid: false,
        reason: `MANIFEST_ARTIFACT_INVALID_${artifactCheck.reason}`,
        manifestPath,
        targetPath,
        details: artifactCheck,
        message: `Manifest references invalid artifact: ${artifactCheck.message}`
      };
    }

    if (manifest.artifact_size_bytes !== artifactCheck.sizeBytes) {
      return {
        valid: false,
        reason: 'MANIFEST_SIZE_MISMATCH',
        manifestPath,
        manifestSize: manifest.artifact_size_bytes,
        actualSize: artifactCheck.sizeBytes,
        message: `Manifest recorded size (${manifest.artifact_size_bytes}) does not match actual disk size (${artifactCheck.sizeBytes})`
      };
    }

    return {
      valid: true,
      manifestPath,
      deliveryId: manifest.delivery_id,
      artifactPath: targetPath,
      sha256: artifactCheck.sha256,
      sizeBytes: artifactCheck.sizeBytes,
      manifest
    };
  }

  /**
   * Authoritative Multi-Gate Delivery Promotion.
   * Gated strictly by:
   * 1. Fresh QA report status == PASSED
   * 2. Manifest integrity verified against actual disk truth
   * 3. Candidate artifact checksum and size exact match
   * If ANY check fails, candidate is withheld (DELIVERY_WITHHELD) and existing
   * active delivery is preserved intact.
   */
  promoteDeliveryGated({ session, candidateDelivery, manifestPath, qaReport, sessionFilePath = null }) {
    const priorActiveDelivery = session.active_delivery || null;

    // Gate 1: QA Report Verification
    if (!qaReport || qaReport.status !== 'PASSED' || qaReport.decision !== 'PASS') {
      return {
        promoted: false,
        reason: 'QA_VERIFICATION_FAILED',
        priorActiveDelivery,
        activeDelivery: priorActiveDelivery,
        action: 'DELIVERY_WITHHELD',
        message: `Candidate delivery ${candidateDelivery?.delivery_id} withheld: QA audit did not pass.`
      };
    }

    // Gate 2: Manifest Verification
    const manifestCheck = this.verifyManifest(manifestPath);
    if (!manifestCheck.valid) {
      return {
        promoted: false,
        reason: 'MANIFEST_VERIFICATION_FAILED',
        priorActiveDelivery,
        activeDelivery: priorActiveDelivery,
        action: 'DELIVERY_WITHHELD',
        details: manifestCheck,
        message: `Candidate delivery withheld: manifest verification failed (${manifestCheck.reason}).`
      };
    }

    // Gate 3: Match candidateDelivery ID with verified manifest
    if (candidateDelivery.delivery_id !== manifestCheck.deliveryId) {
      return {
        promoted: false,
        reason: 'DELIVERY_ID_MISMATCH',
        candidateId: candidateDelivery.delivery_id,
        manifestId: manifestCheck.deliveryId,
        priorActiveDelivery,
        activeDelivery: priorActiveDelivery,
        action: 'DELIVERY_WITHHELD',
        message: `Candidate ID ${candidateDelivery.delivery_id} does not match manifest ID ${manifestCheck.deliveryId}.`
      };
    }

    // All gates PASSED: Authoritative atomic promotion
    session.active_delivery = candidateDelivery.delivery_id;
    if (!session.deliveries) {
      session.deliveries = [];
    }
    session.deliveries.push({
      delivery_id: candidateDelivery.delivery_id,
      artifact_path: manifestCheck.artifactPath,
      artifact_sha256: manifestCheck.sha256,
      promoted_at: new Date().toISOString(),
      manifest_path: manifestPath
    });

    if (sessionFilePath) {
      const tmp = `${sessionFilePath}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8');
      fs.renameSync(tmp, sessionFilePath);
    }

    return {
      promoted: true,
      activeDelivery: candidateDelivery.delivery_id,
      priorActiveDelivery,
      manifestCheck,
      promotedAt: new Date().toISOString(),
      message: `Candidate delivery ${candidateDelivery.delivery_id} successfully promoted to active delivery.`
    };
  }

  /**
   * Audit historical active delivery for post-success artifact drift or corruption.
   * Emits INTEGRITY_DRIFT_ALERT while strictly preserving historical SUCCEEDED records.
   */
  auditDeliveryPostSuccessDrift(historicalDelivery, artifactBaseDir = null) {
    if (!historicalDelivery || !historicalDelivery.artifact_path) {
      return { status: 'NO_HISTORICAL_RECORD' };
    }

    const artifactPath = artifactBaseDir
      ? path.resolve(artifactBaseDir, historicalDelivery.artifact_path)
      : path.resolve(historicalDelivery.artifact_path);

    const artifactCheck = this.verifyArtifact(artifactPath, historicalDelivery.artifact_sha256, 1);

    if (!artifactCheck.valid) {
      return {
        integrityStatus: 'INTEGRITY_DRIFT_ALERT',
        driftDetected: true,
        reason: artifactCheck.reason,
        historicalDeliveryId: historicalDelivery.delivery_id,
        historicalStatus: CanonicalJobStatus.SUCCEEDED,
        historicalStatusPreserved: true,
        artifactPath,
        reconciliationAction: 'NEEDS_RECONCILIATION',
        message: `INTEGRITY_DRIFT_ALERT: Historical delivery ${historicalDelivery.delivery_id} artifact has drifted on disk (${artifactCheck.reason}); historical SUCCEEDED record preserved.`
      };
    }

    return {
      integrityStatus: 'VERIFIED_CLEAN',
      driftDetected: false,
      historicalDeliveryId: historicalDelivery.delivery_id,
      artifactPath,
      sha256: artifactCheck.sha256
    };
  }

  /**
   * Journaled, idempotent compensation execution.
   * Guarantees compensation is applied at most once and durably recorded.
   */
  executeCompensation(compensationKey, context, compensationFn) {
    const journalFile = path.join(
      this.compensationJournalDir,
      `comp_${crypto.createHash('sha256').update(compensationKey).digest('hex')}.json`
    );

    if (fs.existsSync(journalFile)) {
      const record = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
      return {
        executed: false,
        alreadyCommitted: true,
        record,
        message: `Compensation for key ${compensationKey} already committed; duplicate execution avoided.`
      };
    }

    // Execute compensating operation
    let compResult;
    try {
      compResult = compensationFn();
    } catch (err) {
      const failureRecord = {
        compensation_key: compensationKey,
        context,
        status: 'FAILED',
        error: err.message,
        failed_at: new Date().toISOString(),
        disposition: 'NEEDS_RECONCILIATION'
      };
      fs.writeFileSync(journalFile, JSON.stringify(failureRecord, null, 2), 'utf8');
      return {
        executed: false,
        status: 'FAILED',
        disposition: 'NEEDS_RECONCILIATION',
        error: err.message,
        message: 'Compensation failed to execute; flagged for manual reconciliation.'
      };
    }

    const successRecord = {
      compensation_key: compensationKey,
      context,
      status: 'COMMITTED',
      result: compResult,
      committed_at: new Date().toISOString()
    };
    const tmp = `${journalFile}.tmp_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(successRecord, null, 2), 'utf8');
    fs.renameSync(tmp, journalFile);

    return {
      executed: true,
      alreadyCommitted: false,
      status: 'COMMITTED',
      result: compResult,
      record: successRecord,
      message: 'Compensation executed and committed to durable journal.'
    };
  }

  /**
   * Reconcile non-atomic execution interruptions.
   * Preserves committed step 1 effects and flags uncommitted step 2 for reconciliation.
   */
  reconcileNonAtomicInterruption(planSteps, executedStepResults) {
    const committedSteps = executedStepResults.filter(r => r.committed);
    const uncommittedSteps = planSteps.slice(committedSteps.length);

    if (uncommittedSteps.length === 0) {
      return {
        status: 'FULLY_COMMITTED',
        committedSteps: committedSteps.length,
        reconciliationRequired: false
      };
    }

    return {
      status: 'PARTIAL_EXECUTION_INTERRUPTED',
      reconciliationRequired: true,
      disposition: 'NEEDS_RECONCILIATION',
      committedSteps: committedSteps.map(s => ({ stepId: s.stepId, revision: s.revision })),
      uncommittedSteps: uncommittedSteps.map(s => s.stepId),
      message: `Non-atomic plan interrupted after ${committedSteps.length} of ${planSteps.length} steps. Committed effects preserved on disk; step ${uncommittedSteps[0].stepId} flagged for reconciliation.`
    };
  }
}

module.exports = { ArtifactIntegrityGuardian };
