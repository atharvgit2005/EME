/**
 * EME × Earshot Integration — Audio Repair Decision Ledger & Audit Journal Engine
 *
 * Implements Stage 29.3 Decision Ledger under binding architectural conditions
 * ARC-29-15 through ARC-29-20 (plans/CHATGPT_STAGE29_2_APPROVAL.md).
 *
 * Core Responsibilities:
 * 1. Single authoritative decision ledger correlating assessment, routing, review,
 *    approval, execution, post-render QA verification, and delivery disposition (ARC-29-15).
 * 2. Immutable, ordered lifecycle event integrity with idempotent duplicate handling (ARC-29-16).
 * 3. Exact proposal-approval binding preventing stale or altered approval reuse (ARC-29-17).
 * 4. Pre-execution gating & post-execution failure reconciliation without false rollback (ARC-29-18).
 * 5. Strict schema validation and 64-char hexadecimal SHA-256 verification (ARC-29-19).
 * 6. Canonical state invariance (AWAITING_APPROVAL, NEEDS_RECONCILIATION) and delivery preservation (ARC-29-20).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../schemas/audio-repair-ledger.v1.json'), 'utf8')
);

const SHA256_HEX_REGEX = /^[a-fA-F0-9]{64}$/;

const LEDGER_EVENT_TYPES = Object.freeze({
  CONFIDENCE_EVALUATED: 'CONFIDENCE_EVALUATED',
  CONFIDENCE_CALIBRATED: 'CONFIDENCE_CALIBRATED',
  ROUTING_DETERMINED: 'ROUTING_DETERMINED',
  HUMAN_REVIEW_REQUESTED: 'HUMAN_REVIEW_REQUESTED',
  HUMAN_APPROVAL_RECORDED: 'HUMAN_APPROVAL_RECORDED',
  HUMAN_REJECTION_RECORDED: 'HUMAN_REJECTION_RECORDED',
  APPROVAL_INVALIDATED: 'APPROVAL_INVALIDATED',
  EXECUTION_INTENDED: 'EXECUTION_INTENDED',
  EXECUTION_COMMITTED: 'EXECUTION_COMMITTED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  OUTCOME_EVALUATED: 'OUTCOME_EVALUATED',
  REPAIR_VERIFIED: 'REPAIR_VERIFIED',
  DELIVERY_PROMOTED: 'DELIVERY_PROMOTED',
  DELIVERY_WITHHELD: 'DELIVERY_WITHHELD',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED'
});

class RepairDecisionLedger {
  /**
   * @param {Object} [options]
   * @param {Function} [options.persistenceHook] - Optional custom persistence hook (for durability or failure injection)
   * @param {string} [options.policyVersion] - Ledger policy schema version (default: '1.0.0')
   */
  constructor(options = {}) {
    this.policyVersion = options.policyVersion || '1.0.0';
    this.persistenceHook = typeof options.persistenceHook === 'function' ? options.persistenceHook : null;

    // In-memory append-only log of verified events
    this.events = [];

    // Indices for O(1) correlation and idempotent deduplication
    this.eventsById = new Map();
    this.eventsByCorrelationKey = new Map();
    this.proposalRecords = new Map(); // proposal_id -> comprehensive aggregated decision record
  }

  /**
   * Validates an event against the ledger schema and strict provenance constraints (ARC-29-19).
   * @param {Object} event
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateEvent(event) {
    const errors = [];

    if (!event || typeof event !== 'object') {
      return { valid: false, errors: ['Event must be a non-null object'] };
    }

    if (event.schema_version !== '1.0.0') {
      errors.push(`schema_version must be "1.0.0", got "${event.schema_version}"`);
    }

    if (typeof event.event_id !== 'string' || event.event_id.length < 4 || event.event_id.length > 128) {
      errors.push(`event_id must be a string between 4 and 128 chars, got: ${event.event_id}`);
    }

    if (!Object.values(LEDGER_EVENT_TYPES).includes(event.event_type)) {
      errors.push(`Invalid event_type: "${event.event_type}". Must be one of: ${Object.values(LEDGER_EVENT_TYPES).join(', ')}`);
    }

    if (typeof event.timestamp !== 'string' || Number.isNaN(Date.parse(event.timestamp))) {
      errors.push(`timestamp must be a valid ISO-8601 date string, got: ${event.timestamp}`);
    }

    if (typeof event.proposal_id !== 'string' || event.proposal_id.trim().length === 0) {
      errors.push(`proposal_id is required and must be non-empty`);
    }

    if (typeof event.correlation_key !== 'string' || event.correlation_key.length < 4) {
      errors.push(`correlation_key is required and must be at least 4 chars`);
    }

    if (typeof event.project_revision !== 'number' || !Number.isInteger(event.project_revision) || event.project_revision < 0) {
      errors.push(`project_revision must be a non-negative integer, got: ${event.project_revision}`);
    }

    // Strict 64-char hexadecimal SHA-256 verification (ARC-29-19)
    if (event.source_media_sha256 !== undefined) {
      if (typeof event.source_media_sha256 !== 'string' || !SHA256_HEX_REGEX.test(event.source_media_sha256)) {
        errors.push(`source_media_sha256 must be exactly 64 hexadecimal characters, got: "${event.source_media_sha256}"`);
      }
    }

    if (event.render_sha256 !== undefined) {
      if (typeof event.render_sha256 !== 'string' || !SHA256_HEX_REGEX.test(event.render_sha256)) {
        errors.push(`render_sha256 must be exactly 64 hexadecimal characters, got: "${event.render_sha256}"`);
      }
    }

    if (event.target !== undefined) {
      if (!event.target || typeof event.target !== 'object' || typeof event.target.clip_id !== 'string') {
        errors.push(`target must be an object with clip_id`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Computes a deterministic correlation key for an event.
   * @param {string} proposalId
   * @param {number} revision
   * @param {string} eventType
   * @param {string} [qualifier]
   * @returns {string}
   */
  computeCorrelationKey(proposalId, revision, eventType, qualifier = '') {
    const raw = `${proposalId}:rev${revision}:${eventType}:${qualifier}`;
    return `ck_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
  }

  /**
   * Appends an event to the ledger with validation, idempotent duplicate handling,
   * and state aggregation (ARC-29-15 & ARC-29-16).
   *
   * @param {Object} eventData
   * @returns {{ recorded: boolean, duplicate: boolean, event: Object, error?: string }}
   */
  recordEvent(eventData) {
    const validation = this.validateEvent(eventData);
    if (!validation.valid) {
      const err = new Error(`Ledger event validation failed: ${validation.errors.join('; ')}`);
      err.code = 'INVALID_LEDGER_EVENT';
      err.details = validation.errors;
      throw err;
    }

    // 1. Idempotency Check: check correlation_key or event_id
    if (this.eventsByCorrelationKey.has(eventData.correlation_key)) {
      const existing = this.eventsByCorrelationKey.get(eventData.correlation_key);
      return {
        recorded: false,
        duplicate: true,
        event: existing,
        message: 'Duplicate event ignored idempotently'
      };
    }

    if (this.eventsById.has(eventData.event_id)) {
      const existing = this.eventsById.get(eventData.event_id);
      return {
        recorded: false,
        duplicate: true,
        event: existing,
        message: 'Duplicate event_id ignored idempotently'
      };
    }

    // 2. Persistence Hook (for durable stores or failure injection in tests)
    if (this.persistenceHook) {
      try {
        this.persistenceHook(eventData);
      } catch (persistErr) {
        const err = new Error(`Ledger persistence failure: ${persistErr.message}`);
        err.code = 'LEDGER_PERSISTENCE_FAILED';
        err.cause = persistErr;
        throw err;
      }
    }

    // 3. Freeze event clone to guarantee immutability
    const frozenEvent = Object.freeze(JSON.parse(JSON.stringify(eventData)));

    this.events.push(frozenEvent);
    this.eventsById.set(frozenEvent.event_id, frozenEvent);
    this.eventsByCorrelationKey.set(frozenEvent.correlation_key, frozenEvent);

    // 4. Update aggregated proposal lifecycle record (ARC-29-15)
    this._updateProposalRecord(frozenEvent);

    return {
      recorded: true,
      duplicate: false,
      event: frozenEvent
    };
  }

  /**
   * Aggregates lifecycle events into a unified proposal record.
   * @private
   */
  _updateProposalRecord(event) {
    const pId = event.proposal_id;
    if (!this.proposalRecords.has(pId)) {
      this.proposalRecords.set(pId, {
        proposal_id: pId,
        finding_id: event.finding_id || null,
        target: event.target || null,
        lifecycle_stage: 'CREATED',
        events: [],
        confidence: null,
        routing: null,
        review_request: null,
        approval: null,
        execution_intent: null,
        execution_result: null,
        verification: null,
        delivery: null,
        active_revision: event.project_revision
      });
    }

    const record = this.proposalRecords.get(pId);
    record.events.push(event.event_id);
    record.active_revision = event.project_revision;

    switch (event.event_type) {
      case LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED:
        record.confidence = event.details;
        record.lifecycle_stage = 'CONFIDENCE_EVALUATED';
        break;
      case LEDGER_EVENT_TYPES.ROUTING_DETERMINED:
        record.routing = event.details;
        record.lifecycle_stage = 'ROUTING_DETERMINED';
        break;
      case LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED:
        record.review_request = event.details;
        record.lifecycle_stage = 'AWAITING_APPROVAL';
        break;
      case LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED:
        record.approval = event.details;
        record.lifecycle_stage = 'APPROVED';
        break;
      case LEDGER_EVENT_TYPES.HUMAN_REJECTION_RECORDED:
        record.approval = event.details;
        record.lifecycle_stage = 'REJECTED';
        break;
      case LEDGER_EVENT_TYPES.APPROVAL_INVALIDATED:
        if (record.approval) {
          record.approval.invalidated = true;
          record.approval.invalidation_reason = event.details?.reason || 'STALE_REVISION';
        }
        record.lifecycle_stage = 'APPROVAL_INVALIDATED';
        break;
      case LEDGER_EVENT_TYPES.EXECUTION_INTENDED:
        record.execution_intent = event.details;
        record.lifecycle_stage = 'EXECUTION_INTENDED';
        break;
      case LEDGER_EVENT_TYPES.EXECUTION_COMMITTED:
        record.execution_result = event.details;
        record.lifecycle_stage = 'EXECUTION_COMMITTED';
        break;
      case LEDGER_EVENT_TYPES.EXECUTION_FAILED:
        record.execution_result = event.details;
        record.lifecycle_stage = 'EXECUTION_FAILED';
        break;
      case LEDGER_EVENT_TYPES.REPAIR_VERIFIED:
        record.verification = event.details;
        record.lifecycle_stage = 'REPAIR_VERIFIED';
        break;
      case LEDGER_EVENT_TYPES.DELIVERY_PROMOTED:
        record.delivery = event.details;
        record.lifecycle_stage = 'DELIVERY_PROMOTED';
        break;
      case LEDGER_EVENT_TYPES.DELIVERY_WITHHELD:
        record.delivery = event.details;
        record.lifecycle_stage = 'DELIVERY_WITHHELD';
        break;
      case LEDGER_EVENT_TYPES.RECONCILIATION_REQUIRED:
        record.lifecycle_stage = 'NEEDS_RECONCILIATION';
        break;
      default:
        break;
    }
  }

  /**
   * Retrieves aggregated decision record for a proposal (ARC-29-15).
   * @param {string} proposalId
   * @returns {Object|null}
   */
  getProposalRecord(proposalId) {
    if (!this.proposalRecords.has(proposalId)) {
      return null;
    }
    return JSON.parse(JSON.stringify(this.proposalRecords.get(proposalId)));
  }

  /**
   * Verifies whether an approval record is valid for execution against the current candidate revision (ARC-29-17).
   * Rejects stale, mismatched, or materially altered approval records.
   *
   * @param {Object} approvalEvent - The recorded approval event or details
   * @param {Object} currentContext - Current execution context
   * @param {number} currentContext.currentRevision - Current canonical project revision
   * @param {Object} currentContext.proposedOperation - The operation about to be executed
   * @returns {{ authorized: boolean, reason?: string, errorCode?: string }}
   */
  verifyExecutionAuthority(approvalEvent, currentContext) {
    if (!approvalEvent || typeof approvalEvent !== 'object') {
      return {
        authorized: false,
        errorCode: 'MISSING_APPROVAL',
        reason: 'Execution authority requires a valid approval record'
      };
    }

    const details = approvalEvent.details || approvalEvent;

    // 1. Check approval decision
    if (details.decision !== 'APPROVE') {
      return {
        authorized: false,
        errorCode: 'NOT_APPROVED',
        reason: `Cannot execute unapproved proposal (decision is ${details.decision || 'NONE'})`
      };
    }

    // 2. Revision Fencing: candidate revision at review time MUST match current revision
    const reviewRevision = details.candidate_revision ?? approvalEvent.project_revision;
    if (reviewRevision !== currentContext.currentRevision) {
      return {
        authorized: false,
        errorCode: 'APPROVAL_INVALIDATED_STALE_REVISION',
        reason: `Approval bound to revision ${reviewRevision} cannot be applied to revision ${currentContext.currentRevision}`
      };
    }

    // 3. Proposal and Target Identity Match
    if (details.proposal_id && currentContext.proposalId && details.proposal_id !== currentContext.proposalId) {
      return {
        authorized: false,
        errorCode: 'PROPOSAL_MISMATCH',
        reason: `Approval for proposal ${details.proposal_id} cannot authorize execution for ${currentContext.proposalId}`
      };
    }

    // 4. Material Alteration Check (ARC-29-17): proposed operation parameters must match selected option
    if (details.selected_option && currentContext.proposedOperation) {
      const selectedOption = details.selected_option;
      const op = currentContext.proposedOperation;

      // Verify strategy
      if (selectedOption.strategy && op.type) {
        if (selectedOption.strategy === 'SYNC_RETIME' && op.type !== 'SET_CLIP_START' && op.type !== 'SHIFT_CLIP' && op.type !== 'move_clip') {
          return {
            authorized: false,
            errorCode: 'MATERIAL_MODIFICATION_REJECTED',
            reason: `Operation type "${op.type}" does not match approved strategy "${selectedOption.strategy}"`
          };
        }
      }

      // Verify shift_ticks or gain_db if specified
      if (selectedOption.parameters) {
        if (selectedOption.parameters.shift_ticks !== undefined && op.shift_ticks !== undefined) {
          if (selectedOption.parameters.shift_ticks !== op.shift_ticks) {
            return {
              authorized: false,
              errorCode: 'MATERIAL_MODIFICATION_REJECTED',
              reason: `Proposed shift ${op.shift_ticks} ticks materially differs from approved ${selectedOption.parameters.shift_ticks} ticks`
            };
          }
        }
        if (selectedOption.parameters.gain_db !== undefined && op.gain_db !== undefined) {
          if (selectedOption.parameters.gain_db !== op.gain_db) {
            return {
              authorized: false,
              errorCode: 'MATERIAL_MODIFICATION_REJECTED',
              reason: `Proposed gain ${op.gain_db} dB materially differs from approved ${selectedOption.parameters.gain_db} dB`
            };
          }
        }
      }
    }

    return {
      authorized: true
    };
  }

  /**
   * Executes a guarded mutation with pre-execution ledger recording and post-execution
   * outcome verification (ARC-29-18 & LDG-05).
   *
   * Protection Boundary Guarantees:
   * 1. If pre-execution ledger recording fails -> abort execution, zero mutation performed.
   * 2. If executor executes mutation, but post-execution ledger recording fails:
   *    - DOES NOT claim false rollback.
   *    - Preserves executor output.
   *    - Returns status 'NEEDS_RECONCILIATION' with intact evidence.
   *
   * @param {Object} params
   * @param {Object} params.project - Canonical timeline project
   * @param {Object} params.proposal - The repair proposal
   * @param {Object} params.operation - The compiled atomic operation
   * @param {Object} [params.approvalRecord] - Approval event if human-reviewed
   * @param {Function} params.executorFn - The canonical executor function (e.g. OperationExecutor.executeOperation)
   * @returns {Promise<Object>} Execution result with authoritative ledger correlation
   */
  async executeGuardedMutation(params) {
    const { project, proposal, operation, approvalRecord, executorFn } = params;

    if (!project || !proposal || !operation || typeof executorFn !== 'function') {
      throw new Error('executeGuardedMutation requires project, proposal, operation, and executorFn');
    }

    const currentRevision = project.revision ?? project.meta?.revision ?? 0;
    const proposalId = proposal.proposal_id || proposal.id;

    // 1. Verify approval authority if human-in-the-loop review was conducted
    if (approvalRecord) {
      const authCheck = this.verifyExecutionAuthority(approvalRecord, {
        currentRevision,
        proposalId,
        proposedOperation: operation
      });
      if (!authCheck.authorized) {
        // Record invalidation or rejection event
        this.recordEvent({
          schema_version: '1.0.0',
          event_id: `evt_inval_${crypto.randomBytes(6).toString('hex')}`,
          event_type: LEDGER_EVENT_TYPES.APPROVAL_INVALIDATED,
          timestamp: new Date().toISOString(),
          proposal_id: proposalId,
          correlation_key: this.computeCorrelationKey(proposalId, currentRevision, LEDGER_EVENT_TYPES.APPROVAL_INVALIDATED),
          project_revision: currentRevision,
          target: { clip_id: proposal.clip_id },
          details: {
            reason: authCheck.errorCode,
            message: authCheck.reason
          }
        });

        return {
          success: false,
          errorCode: authCheck.errorCode,
          error: authCheck.reason,
          mutated: false,
          delivery_preserved: true,
          status: 'REJECTED'
        };
      }
    }

    // 2. Pre-Execution Ledger Gating (ARC-29-18)
    // Must record EXECUTION_INTENDED before executor runs.
    const preExecutionEventId = `evt_intent_${crypto.randomBytes(6).toString('hex')}`;
    const preExecutionKey = this.computeCorrelationKey(proposalId, currentRevision, LEDGER_EVENT_TYPES.EXECUTION_INTENDED);

    try {
      this.recordEvent({
        schema_version: '1.0.0',
        event_id: preExecutionEventId,
        event_type: LEDGER_EVENT_TYPES.EXECUTION_INTENDED,
        timestamp: new Date().toISOString(),
        proposal_id: proposalId,
        correlation_key: preExecutionKey,
        project_revision: currentRevision,
        target: { clip_id: proposal.clip_id, track_id: proposal.track_id },
        details: {
          operation_type: operation.type,
          params: operation
        }
      });
    } catch (preLedgerErr) {
      // PRE-EXECUTION FAILURE: Abort immediately! Zero mutation authorized.
      return {
        success: false,
        errorCode: 'LEDGER_PRE_EXECUTION_FAILED',
        error: `Pre-execution ledger gating failed: ${preLedgerErr.message}`,
        mutated: false,
        delivery_preserved: true,
        status: 'EXECUTION_ABORTED'
      };
    }

    // 3. Canonical Operation Execution
    let execResult;
    try {
      execResult = await executorFn(project, operation);
    } catch (execErr) {
      // Execution threw error
      try {
        this.recordEvent({
          schema_version: '1.0.0',
          event_id: `evt_fail_${crypto.randomBytes(6).toString('hex')}`,
          event_type: LEDGER_EVENT_TYPES.EXECUTION_FAILED,
          timestamp: new Date().toISOString(),
          proposal_id: proposalId,
          correlation_key: this.computeCorrelationKey(proposalId, currentRevision, LEDGER_EVENT_TYPES.EXECUTION_FAILED),
          project_revision: currentRevision,
          target: { clip_id: proposal.clip_id },
          details: { error: execErr.message }
        });
      } catch (_) {}

      return {
        success: false,
        errorCode: 'OPERATION_EXECUTION_THREW',
        error: execErr.message,
        mutated: false,
        delivery_preserved: true,
        status: 'EXECUTION_FAILED'
      };
    }

    if (!execResult || !execResult.success) {
      // Executor reported failure
      try {
        this.recordEvent({
          schema_version: '1.0.0',
          event_id: `evt_fail_${crypto.randomBytes(6).toString('hex')}`,
          event_type: LEDGER_EVENT_TYPES.EXECUTION_FAILED,
          timestamp: new Date().toISOString(),
          proposal_id: proposalId,
          correlation_key: this.computeCorrelationKey(proposalId, currentRevision, LEDGER_EVENT_TYPES.EXECUTION_FAILED),
          project_revision: currentRevision,
          target: { clip_id: proposal.clip_id },
          details: { error: execResult?.error || 'Execution returned non-success' }
        });
      } catch (_) {}

      return {
        success: false,
        errorCode: execResult?.errorCode || 'EXECUTION_FAILED',
        error: execResult?.error || 'Operation execution failed',
        mutated: false,
        delivery_preserved: true,
        status: 'EXECUTION_FAILED'
      };
    }

    // 4. Post-Execution Ledger Gating (ARC-29-18 & LDG-05)
    // Mutation has committed in project! Now record EXECUTION_COMMITTED.
    const committedRevision = execResult.project?.meta?.revision ?? (currentRevision + 1);
    const postExecutionEventId = `evt_commit_${crypto.randomBytes(6).toString('hex')}`;
    const postExecutionKey = this.computeCorrelationKey(proposalId, committedRevision, LEDGER_EVENT_TYPES.EXECUTION_COMMITTED);

    try {
      this.recordEvent({
        schema_version: '1.0.0',
        event_id: postExecutionEventId,
        event_type: LEDGER_EVENT_TYPES.EXECUTION_COMMITTED,
        timestamp: new Date().toISOString(),
        proposal_id: proposalId,
        correlation_key: postExecutionKey,
        project_revision: committedRevision,
        target: { clip_id: proposal.clip_id, track_id: proposal.track_id },
        details: {
          committed_revision: committedRevision,
          inverse_operation: execResult.inverse,
          execution_result: execResult
        }
      });
    } catch (postLedgerErr) {
      // CRITICAL FAILURE (LDG-05):
      // Mutation HAS committed, but post-execution ledger failed.
      // In accordance with ARC-29-18:
      // "Do not falsely claim rollback or successful audit completion.
      // Preserve the known operation result, retain available evidence,
      // and use the existing reconciliation mechanism when authoritative state cannot be established."
      return {
        success: false,
        errorCode: 'LEDGER_POST_EXECUTION_FAILED',
        error: `Mutation committed at revision ${committedRevision}, but post-execution ledger recording failed: ${postLedgerErr.message}`,
        mutated: true, // Accurately reports mutation occurred!
        committed_revision: committedRevision,
        execution_result: execResult,
        status: 'NEEDS_RECONCILIATION', // Canonical reconciliation state
        delivery_preserved: true, // Candidate must NOT be promoted to active delivery!
        reconciliation_instructions: 'Project revision advanced to candidate without authoritative audit log. Candidate quarantined pending manual ledger reconciliation.'
      };
    }

    return {
      success: true,
      mutated: true,
      committed_revision: committedRevision,
      execution_result: execResult,
      ledger_event_id: postExecutionEventId,
      status: 'COMMITTED'
    };
  }

  /**
   * Dumps full verifiable chronological audit ledger.
   * @returns {Object[]}
   */
  getAuditJournal() {
    return this.events.map(e => ({ ...e }));
  }

  /**
   * Returns complete event count.
   * @returns {number}
   */
  get size() {
    return this.events.length;
  }
}

module.exports = {
  RepairDecisionLedger,
  LEDGER_EVENT_TYPES,
  LEDGER_SCHEMA
};
