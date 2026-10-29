/**
 * Workflow Stage 29.3 Test Suite: Decision Ledger & Audit Journal Engine
 *
 * Verifies Stage 29.3 under binding architectural conditions ARC-29-15 through ARC-29-20:
 * - LDG-01: Validates compliant ledger event structure, required fields, and strict 64-char hex SHA-256 (ARC-29-15 & ARC-29-19)
 * - LDG-02: Records assessment, routing, review request, and explicit approval against one stable proposal identity (ARC-29-15 & ARC-29-17)
 * - LDG-03: Rejects stale, mismatched, or materially altered approval records at execution boundary (ARC-29-17)
 * - LDG-04: Demonstrates deterministic event correlation and idempotent duplicate handling (ARC-29-16)
 * - LDG-05: Injects ledger failure before and after canonical mutation: safe gating & reconciliation without false rollback (ARC-29-18)
 * - LDG-06: Verifies end-to-end audit continuity from finding through review, execution, post-render QA, and delivery (ARC-29-15 & ARC-29-20)
 *
 * Test Accounting: 6 discrete subtests (7 reported by Node runner).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  RepairDecisionLedger,
  LEDGER_EVENT_TYPES
} = require('../src/audio/repair/repair-decision-ledger');
const { OperationExecutor } = require('../src/engine/operations.js');

const VALID_SHA256_A = 'a'.repeat(64);
const VALID_SHA256_B = 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2';

function createMockProject(revision = 1) {
  return {
    id: 'proj_ldg_test',
    revision,
    meta: {
      id: 'proj_ldg_test',
      revision
    },
    timeline: {
      tracks: [
        {
          id: 'track_audio_1',
          type: 'audio',
          clips: [
            { id: 'clip_ldg_1', start_tick: 120000, duration_ticks: 240000 }
          ]
        }
      ]
    }
  };
}

test('Stage 29.3: Decision Ledger & Audit Journal Engine', async (t) => {

  // LDG-01: Schema validation and strict 64-char hex SHA-256
  await t.test('LDG-01: Validate ledger event structure, required identifiers, event types, and provenance fields (ARC-29-15 & ARC-29-19)', () => {
    const ledger = new RepairDecisionLedger();

    // 1. Valid event passes
    const validEvent = {
      schema_version: '1.0.0',
      event_id: 'evt_ldg_01_valid',
      event_type: LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      timestamp: new Date().toISOString(),
      proposal_id: 'prop_01',
      correlation_key: 'ck_prop_01_rev1_conf',
      project_revision: 1,
      source_media_sha256: VALID_SHA256_A,
      render_sha256: VALID_SHA256_B,
      target: { clip_id: 'clip_01', track_id: 'track_01' },
      details: { score: 0.85 }
    };
    const valResult = ledger.validateEvent(validEvent);
    assert.equal(valResult.valid, true, 'Valid event should pass schema validation');

    // 2. Reject short or invalid SHA-256 (ARC-29-19 strict verification)
    const shortShaEvent = {
      ...validEvent,
      event_id: 'evt_ldg_01_short_sha',
      source_media_sha256: '9f8e7d6c5b4a1234567890abcdef' // 28 chars (illustrative/placeholder)
    };
    const shortShaVal = ledger.validateEvent(shortShaEvent);
    assert.equal(shortShaVal.valid, false);
    assert.match(shortShaVal.errors.join('; '), /exactly 64 hexadecimal characters/);

    // 3. Reject invalid non-hex characters in SHA-256
    const nonHexShaEvent = {
      ...validEvent,
      event_id: 'evt_ldg_01_nonhex',
      render_sha256: 'z'.repeat(64)
    };
    const nonHexVal = ledger.validateEvent(nonHexShaEvent);
    assert.equal(nonHexVal.valid, false);
    assert.match(nonHexVal.errors.join('; '), /exactly 64 hexadecimal characters/);

    // 4. Reject unknown event type
    const unknownTypeEvent = {
      ...validEvent,
      event_id: 'evt_ldg_01_unk',
      event_type: 'RANDOM_NON_CANONICAL_TYPE'
    };
    const unkVal = ledger.validateEvent(unknownTypeEvent);
    assert.equal(unkVal.valid, false);
    assert.match(unkVal.errors.join('; '), /Invalid event_type/);

    // 5. Reject negative project_revision
    const negRevEvent = {
      ...validEvent,
      event_id: 'evt_ldg_01_neg_rev',
      project_revision: -1
    };
    const negRevVal = ledger.validateEvent(negRevEvent);
    assert.equal(negRevVal.valid, false);
    assert.match(negRevVal.errors.join('; '), /non-negative integer/);
  });

  // LDG-02: Record confidence assessment, routing, review request, and approval
  await t.test('LDG-02: Record confidence assessment, routing decision, human review request, and explicit approval against one stable proposal identity (ARC-29-15 & ARC-29-17)', () => {
    const ledger = new RepairDecisionLedger();
    const proposalId = 'prop_ldg_02_stable';
    const findingId = 'find_sync_02';
    const revision = 3;

    // 1. Record confidence evaluation
    const confRes = ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_02_conf',
      event_type: LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      finding_id: findingId,
      correlation_key: ledger.computeCorrelationKey(proposalId, revision, LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED),
      project_revision: revision,
      source_media_sha256: VALID_SHA256_A,
      target: { clip_id: 'clip_02', track_id: 'track_02' },
      details: {
        score: 0.7200,
        components: { evidence_score: 0.70, geometry_score: 0.75, risk_suitability_score: 0.70 }
      }
    });
    assert.equal(confRes.recorded, true);

    // 2. Record routing determination
    const routeRes = ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_02_route',
      event_type: LEDGER_EVENT_TYPES.ROUTING_DETERMINED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      finding_id: findingId,
      correlation_key: ledger.computeCorrelationKey(proposalId, revision, LEDGER_EVENT_TYPES.ROUTING_DETERMINED),
      project_revision: revision,
      target: { clip_id: 'clip_02', track_id: 'track_02' },
      details: {
        disposition: 'HUMAN_ESCALATION_REQUIRED',
        reason: 'Confidence 0.7200 requires human review'
      }
    });
    assert.equal(routeRes.recorded, true);

    // 3. Record human review request
    const reviewRes = ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_02_review',
      event_type: LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      finding_id: findingId,
      correlation_key: ledger.computeCorrelationKey(proposalId, revision, LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED),
      project_revision: revision,
      target: { clip_id: 'clip_02', track_id: 'track_02' },
      details: {
        request_id: 'req_02_h',
        candidate_revision: revision,
        lifecycle_status: 'AWAITING_APPROVAL'
      }
    });
    assert.equal(reviewRes.recorded, true);

    // 4. Record explicit human approval
    const approveRes = ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_02_approve',
      event_type: LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      finding_id: findingId,
      correlation_key: ledger.computeCorrelationKey(proposalId, revision, LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED),
      project_revision: revision,
      target: { clip_id: 'clip_02', track_id: 'track_02' },
      details: {
        decision: 'APPROVE',
        candidate_revision: revision,
        selected_option: {
          option_id: 'EXECUTE_RECOMMENDED_RETIME',
          strategy: 'SYNC_RETIME',
          parameters: { shift_ticks: -2500 }
        }
      }
    });
    assert.equal(approveRes.recorded, true);

    // 5. Verify aggregated proposal record integrity (ARC-29-15)
    const aggregated = ledger.getProposalRecord(proposalId);
    assert.ok(aggregated, 'Proposal record must exist');
    assert.equal(aggregated.lifecycle_stage, 'APPROVED');
    assert.equal(aggregated.events.length, 4);
    assert.equal(aggregated.confidence.score, 0.7200);
    assert.equal(aggregated.routing.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.equal(aggregated.review_request.request_id, 'req_02_h');
    assert.equal(aggregated.approval.decision, 'APPROVE');
  });

  // LDG-03: Reject stale, mismatched, or materially altered approval records
  await t.test('LDG-03: Reject stale, mismatched, or materially altered approval records at the execution boundary (ARC-29-17)', () => {
    const ledger = new RepairDecisionLedger();
    const proposalId = 'prop_ldg_03';
    const reviewRevision = 2;

    const validApproval = {
      decision: 'APPROVE',
      proposal_id: proposalId,
      candidate_revision: reviewRevision,
      selected_option: {
        option_id: 'EXECUTE_RETIME',
        strategy: 'SYNC_RETIME',
        parameters: { shift_ticks: -1200 }
      }
    };

    // 1. Clean authority check passes when revision and parameters match
    const cleanCheck = ledger.verifyExecutionAuthority(validApproval, {
      currentRevision: 2,
      proposalId,
      proposedOperation: { type: 'SHIFT_CLIP', shift_ticks: -1200 }
    });
    assert.equal(cleanCheck.authorized, true);

    // 2. Reject stale approval when current project revision advanced to 3
    const staleCheck = ledger.verifyExecutionAuthority(validApproval, {
      currentRevision: 3,
      proposalId,
      proposedOperation: { type: 'SHIFT_CLIP', shift_ticks: -1200 }
    });
    assert.equal(staleCheck.authorized, false);
    assert.equal(staleCheck.errorCode, 'APPROVAL_INVALIDATED_STALE_REVISION');

    // 3. Reject mismatched proposal ID
    const mismatchCheck = ledger.verifyExecutionAuthority(validApproval, {
      currentRevision: 2,
      proposalId: 'prop_some_other_id',
      proposedOperation: { type: 'SHIFT_CLIP', shift_ticks: -1200 }
    });
    assert.equal(mismatchCheck.authorized, false);
    assert.equal(mismatchCheck.errorCode, 'PROPOSAL_MISMATCH');

    // 4. Reject materially altered parameters (e.g. shift_ticks changed from -1200 to -3500)
    const alteredParamCheck = ledger.verifyExecutionAuthority(validApproval, {
      currentRevision: 2,
      proposalId,
      proposedOperation: { type: 'SHIFT_CLIP', shift_ticks: -3500 }
    });
    assert.equal(alteredParamCheck.authorized, false);
    assert.equal(alteredParamCheck.errorCode, 'MATERIAL_MODIFICATION_REJECTED');

    // 5. Reject unapproved disposition
    const rejectedApproval = { ...validApproval, decision: 'REJECT' };
    const unapprovedCheck = ledger.verifyExecutionAuthority(rejectedApproval, {
      currentRevision: 2,
      proposalId,
      proposedOperation: { type: 'SHIFT_CLIP', shift_ticks: -1200 }
    });
    assert.equal(unapprovedCheck.authorized, false);
    assert.equal(unapprovedCheck.errorCode, 'NOT_APPROVED');
  });

  // LDG-04: Deterministic event correlation and idempotent duplicate handling
  await t.test('LDG-04: Demonstrate deterministic event correlation and idempotent handling of duplicate event delivery (ARC-29-16)', () => {
    const ledger = new RepairDecisionLedger();
    const proposalId = 'prop_ldg_04';
    const revision = 1;

    const eventData = {
      schema_version: '1.0.0',
      event_id: 'evt_04_initial',
      event_type: LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      timestamp: '2026-10-22T10:00:00.000Z',
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, revision, LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED),
      project_revision: revision,
      target: { clip_id: 'clip_04' },
      details: { score: 0.8800 }
    };

    // 1. Initial delivery succeeds
    const initialRes = ledger.recordEvent(eventData);
    assert.equal(initialRes.recorded, true);
    assert.equal(initialRes.duplicate, false);
    assert.equal(ledger.size, 1);

    // 2. Duplicate delivery with identical correlation_key is detected and ignored idempotently
    const duplicateDelivery1 = ledger.recordEvent({
      ...eventData,
      event_id: 'evt_04_duplicate_id' // Even if transport assigns different event_id!
    });
    assert.equal(duplicateDelivery1.recorded, false);
    assert.equal(duplicateDelivery1.duplicate, true);
    assert.equal(ledger.size, 1, 'Total ledger events must remain 1');

    // 3. Duplicate delivery with identical event_id is also handled idempotently
    const duplicateDelivery2 = ledger.recordEvent({
      ...eventData,
      correlation_key: 'ck_some_different_key'
    });
    assert.equal(duplicateDelivery2.recorded, false);
    assert.equal(duplicateDelivery2.duplicate, true);
    assert.equal(ledger.size, 1, 'Total ledger events must remain 1');

    // 4. Determinism check: correlation key is purely functional and deterministic
    const key1 = ledger.computeCorrelationKey('prop_test', 4, 'EXECUTION_INTENDED');
    const key2 = ledger.computeCorrelationKey('prop_test', 4, 'EXECUTION_INTENDED');
    assert.equal(key1, key2, 'Correlation keys must be strictly deterministic across calls');
  });

  // LDG-05: Gated mutation boundary and failure injection (ARC-29-18)
  await t.test('LDG-05: Inject ledger persistence or verification failure before and after a canonical mutation, demonstrating safe execution gating and correct reconciliation without false rollback claims (ARC-29-18)', async () => {
    // -------------------------------------------------------------
    // Scenario A: Pre-execution ledger failure
    // Precondition: Ledger fails to write pre-execution event (EXECUTION_INTENDED).
    // Invariant: Executor is NEVER called, project is NEVER mutated, delivery preserved.
    // -------------------------------------------------------------
    let executorCalledA = false;
    const failPreLedger = new RepairDecisionLedger({
      persistenceHook: (event) => {
        if (event.event_type === LEDGER_EVENT_TYPES.EXECUTION_INTENDED) {
          throw new Error('Disk I/O error during pre-execution journal write');
        }
      }
    });

    const projectA = createMockProject(1);
    const proposalA = { proposal_id: 'prop_05_a', clip_id: 'clip_ldg_1', track_id: 'track_audio_1' };
    const operationA = { type: 'SHIFT_CLIP', clip_id: 'clip_ldg_1', shift_ticks: -1000 };

    const resultA = await failPreLedger.executeGuardedMutation({
      project: projectA,
      proposal: proposalA,
      operation: operationA,
      executorFn: async () => {
        executorCalledA = true;
        return { success: true };
      }
    });

    assert.equal(executorCalledA, false, 'Executor must NOT be called when pre-execution ledger fails');
    assert.equal(resultA.mutated, false);
    assert.equal(resultA.status, 'EXECUTION_ABORTED');
    assert.equal(resultA.errorCode, 'LEDGER_PRE_EXECUTION_FAILED');
    assert.equal(projectA.meta.revision, 1, 'Project revision must remain unchanged');

    // -------------------------------------------------------------
    // Scenario B: Post-execution ledger failure (Directive: build LDG-05 early!)
    // Precondition: Executor executes mutation, advances project revision from 1 to 2.
    // Then post-execution ledger recording fails.
    // Invariant:
    // - System does NOT falsely claim rollback!
    // - Accurately reports mutation occurred (mutated: true, committed_revision: 2).
    // - Preserves executor output.
    // - Enters NEEDS_RECONCILIATION.
    // - Prevents unverified promotion (delivery_preserved: true).
    // -------------------------------------------------------------
    const failPostLedger = new RepairDecisionLedger({
      persistenceHook: (event) => {
        if (event.event_type === LEDGER_EVENT_TYPES.EXECUTION_COMMITTED) {
          throw new Error('Durable journal sync failed after mutation committed');
        }
      }
    });

    const projectB = createMockProject(1);
    const proposalB = { proposal_id: 'prop_05_b', clip_id: 'clip_ldg_1', track_id: 'track_audio_1' };
    const operationB = { type: 'SHIFT_CLIP', clip_id: 'clip_ldg_1', shift_ticks: -1000 };

    const resultB = await failPostLedger.executeGuardedMutation({
      project: projectB,
      proposal: proposalB,
      operation: operationB,
      executorFn: async (proj, op) => {
        // Execute real project mutation
        const clip = proj.timeline.tracks[0].clips[0];
        clip.start_tick += op.shift_ticks;
        proj.meta.revision += 1;
        return {
          success: true,
          project: proj,
          inverse: { type: 'SHIFT_CLIP', clip_id: clip.id, shift_ticks: -op.shift_ticks }
        };
      }
    });

    // Verification of ARC-29-18 Guarantees:
    assert.equal(resultB.mutated, true, 'Must accurately report that mutation occurred');
    assert.equal(resultB.committed_revision, 2, 'Must report committed revision');
    assert.equal(resultB.status, 'NEEDS_RECONCILIATION', 'Must transition to canonical NEEDS_RECONCILIATION state');
    assert.equal(resultB.delivery_preserved, true, 'Active delivery must remain preserved and NOT promoted');
    assert.ok(resultB.reconciliation_instructions, 'Reconciliation instructions must be attached');
    assert.notEqual(resultB.status, 'ROLLED_BACK', 'Must NOT falsely claim rollback when mutation committed');
    assert.equal(projectB.timeline.tracks[0].clips[0].start_tick, 119000, 'Project clip state remains at mutated value');
  });

  // LDG-06: End-to-end audit continuity across full lifecycle
  await t.test('LDG-06: Verify end-to-end audit continuity from finding ingestion through review, authorized execution, post-render QA, and final delivery disposition (ARC-29-15 & ARC-29-20)', async () => {
    const ledger = new RepairDecisionLedger();
    const proposalId = 'prop_ldg_06_e2e';
    const findingId = 'find_ldg_06_sync';
    const rev0 = 1;

    // 1. Finding & Confidence Evaluated
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_06_conf',
      event_type: LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      finding_id: findingId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev0, LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED),
      project_revision: rev0,
      source_media_sha256: VALID_SHA256_A,
      target: { clip_id: 'clip_ldg_1', track_id: 'track_audio_1' },
      details: { score: 0.7500 }
    });

    // 2. Routing to Human Review
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_06_route',
      event_type: LEDGER_EVENT_TYPES.ROUTING_DETERMINED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev0, LEDGER_EVENT_TYPES.ROUTING_DETERMINED),
      project_revision: rev0,
      target: { clip_id: 'clip_ldg_1' },
      details: { disposition: 'HUMAN_ESCALATION_REQUIRED' }
    });

    // 3. Human Approval Recorded
    const approvalEvent = {
      schema_version: '1.0.0',
      event_id: 'evt_06_approve',
      event_type: LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev0, LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED),
      project_revision: rev0,
      target: { clip_id: 'clip_ldg_1' },
      details: {
        decision: 'APPROVE',
        candidate_revision: rev0,
        selected_option: {
          strategy: 'SYNC_RETIME',
          parameters: { shift_ticks: -1500 }
        }
      }
    };
    ledger.recordEvent(approvalEvent);

    // 4. Guarded Mutation Execution
    const project = createMockProject(rev0);
    const execRes = await ledger.executeGuardedMutation({
      project,
      proposal: { proposal_id: proposalId, clip_id: 'clip_ldg_1', track_id: 'track_audio_1' },
      operation: { type: 'SHIFT_CLIP', clip_id: 'clip_ldg_1', shift_ticks: -1500 },
      approvalRecord: approvalEvent,
      executorFn: async (proj, op) => {
        proj.timeline.tracks[0].clips[0].start_tick += op.shift_ticks;
        proj.meta.revision += 1;
        return { success: true, project: proj, inverse: { type: 'SHIFT_CLIP', clip_id: op.clip_id, shift_ticks: -op.shift_ticks } };
      }
    });
    assert.equal(execRes.success, true);
    assert.equal(execRes.committed_revision, 2);

    // 5. Post-Render Repair Verification
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_06_qa',
      event_type: LEDGER_EVENT_TYPES.REPAIR_VERIFIED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, 2, LEDGER_EVENT_TYPES.REPAIR_VERIFIED),
      project_revision: 2,
      render_sha256: VALID_SHA256_B,
      target: { clip_id: 'clip_ldg_1' },
      details: {
        finding_id: findingId,
        residual_sync_offset_ms: 2.1,
        verified_pass: true
      }
    });

    // 6. Delivery Promoted
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_06_delivery',
      event_type: LEDGER_EVENT_TYPES.DELIVERY_PROMOTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, 2, LEDGER_EVENT_TYPES.DELIVERY_PROMOTED),
      project_revision: 2,
      render_sha256: VALID_SHA256_B,
      target: { clip_id: 'clip_ldg_1' },
      details: {
        promoted_revision: 2,
        active_delivery_manifest_id: 'man_ldg_06',
        promotion_status: 'ACTIVE'
      }
    });

    // 7. Verify full chronological journal continuity
    const journal = ledger.getAuditJournal();
    assert.equal(journal.length, 7, 'Journal must contain all 7 lifecycle events');

    const expectedSequence = [
      LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      LEDGER_EVENT_TYPES.ROUTING_DETERMINED,
      LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED,
      LEDGER_EVENT_TYPES.EXECUTION_INTENDED,
      LEDGER_EVENT_TYPES.EXECUTION_COMMITTED,
      LEDGER_EVENT_TYPES.REPAIR_VERIFIED,
      LEDGER_EVENT_TYPES.DELIVERY_PROMOTED
    ];
    // Notice executeGuardedMutation logged EXECUTION_INTENDED and EXECUTION_COMMITTED
    assert.equal(journal.length, 7);
    for (let i = 0; i < 7; i++) {
      assert.equal(journal[i].event_type, expectedSequence[i]);
    }

    const finalRecord = ledger.getProposalRecord(proposalId);
    assert.equal(finalRecord.lifecycle_stage, 'DELIVERY_PROMOTED');
    assert.equal(finalRecord.active_revision, 2);
    assert.equal(finalRecord.delivery.promoted_revision, 2);
  });

});
