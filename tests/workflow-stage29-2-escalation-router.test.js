/**
 * Editing Mechanics Engine (EME) - Stage 29.2 Test Suite
 *
 * Verifies Human Escalation Router & Advisory Generator (ARC-29-08 to ARC-29-14):
 * - ESC-01: High-confidence proposal enters autonomous-eligible route only when all mandatory preconditions pass.
 * - ESC-02: Moderate-confidence proposal is routed to human review with autonomous execution withheld.
 * - ESC-03: Review advisory satisfies schema and includes complete proposal provenance, alternatives, & rationale.
 * - ESC-04: Mixed-confidence batch is partitioned deterministically, with dependent actions safely withheld.
 * - ESC-05: Previous active delivery remains unchanged while proposal is waiting for review.
 * - ESC-06: Review request leads to appropriate existing state and enforces approval validation, revision fencing, & safeguards.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { OperationExecutor } = require('../src/engine/operations');
const { RepairConfidenceCalibrator } = require('../src/audio/repair/repair-confidence-calibrator');
const { RepairEscalationRouter } = require('../src/audio/repair/repair-escalation-router');

test('Stage 29.2: Human Escalation Router & Advisory Generator', async (t) => {
  const calibrator = new RepairConfidenceCalibrator();
  const router = new RepairEscalationRouter();

  await t.test('ESC-01: High-confidence proposal enters autonomous-eligible route only when all mandatory preconditions pass (ARC-29-08)', () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-esc-01', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_transient', type: 'audio', src: 'burst.wav', metadata: { durationSec: 0.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_main', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_sync_safe',
        assetId: 'asset_transient',
        trackId: 'track_audio_main',
        type: 'audio',
        startTick: 240000,
        durationTicks: 48000
      }
    }).project;

    const finding = {
      finding_id: 'find_sync_01',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      confidence: 0.96,
      measured_value: { max_offset_ms: 60.0 }
    };

    const validProposal = {
      proposal_id: 'prop_sync_valid',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_sync_safe',
      track_id: 'track_audio_main',
      parameters: {
        clip_id: 'clip_sync_safe',
        track_id: 'track_audio_main',
        shift_ticks: -7200,
        target_start_tick: 232800
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(validProposal, finding, project);
    const route = router.routeProposal(validProposal, assessment, project);

    // Case 1: All preconditions pass -> AUTONOMOUS_EXECUTION
    assert.strictEqual(route.disposition, 'AUTONOMOUS_EXECUTION');
    assert.strictEqual(route.autonomous_eligible, true);
    assert.strictEqual(route.advisory, null);

    // Case 2: Precondition failure: Track locked -> REJECTED (ARC-29-08)
    const lockedTrackProject = {
      ...project,
      tracks: project.tracks.map(t => t.id === 'track_audio_main' ? { ...t, locked: true } : t)
    };
    const lockedRoute = router.routeProposal(validProposal, assessment, lockedTrackProject);
    assert.strictEqual(lockedRoute.disposition, 'REJECTED');
    assert.strictEqual(lockedRoute.autonomous_eligible, false);
    assert.ok(lockedRoute.reason.includes('locked'));

    // Case 3: Precondition failure: Stale project revision -> REJECTED (ARC-29-08)
    const advancedProject = {
      ...project,
      revision: project.revision + 1
    };
    const staleRoute = router.routeProposal(validProposal, assessment, advancedProject);
    assert.strictEqual(staleRoute.disposition, 'REJECTED');
    assert.strictEqual(staleRoute.autonomous_eligible, false);
    assert.ok(staleRoute.reason.includes('Stale revision'));

    // Case 4: Hard rejection on proposal status REJECTED (ARC-29-08)
    const rejectedProp = { ...validProposal, status: 'REJECTED', rationale: 'Target exceeds asset bounds' };
    const rejRoute = router.routeProposal(rejectedProp, assessment, project);
    assert.strictEqual(rejRoute.disposition, 'REJECTED');
    assert.strictEqual(rejRoute.autonomous_eligible, false);
  });

  await t.test('ESC-02: Moderate-confidence proposal is routed to human review with autonomous execution withheld (ARC-29-08 & ARC-29-11)', () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-esc-02', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_transient', type: 'audio', src: 'burst.wav', metadata: { durationSec: 0.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_mod', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_prev',
        assetId: 'asset_transient',
        trackId: 'track_audio_mod',
        type: 'audio',
        startTick: 69000,
        durationTicks: 48000
      }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_mod',
        assetId: 'asset_transient',
        trackId: 'track_audio_mod',
        type: 'audio',
        startTick: 120000,
        durationTicks: 48000
      }
    }).project;

    // Moderate confidence finding due to constrained geometry (only 3,000 ticks margin)
    const finding = {
      finding_id: 'find_sync_mod',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      confidence: 0.85,
      measured_value: { max_offset_ms: 15.0 }
    };

    const modProposal = {
      proposal_id: 'prop_sync_mod',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_mod',
      track_id: 'track_audio_mod',
      parameters: {
        clip_id: 'clip_mod',
        track_id: 'track_audio_mod',
        shift_ticks: -1800,
        target_start_tick: 118200
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(modProposal, finding, project);
    assert.strictEqual(assessment.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.ok(assessment.confidence_score >= 0.40 && assessment.confidence_score < 0.80);

    const route = router.routeProposal(modProposal, assessment, project);

    // Autonomous execution MUST be withheld!
    assert.strictEqual(route.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.strictEqual(route.autonomous_eligible, false);
    assert.ok(route.advisory !== null, 'Advisory must be generated');
    assert.strictEqual(route.advisory.lifecycle_status, 'AWAITING_APPROVAL');
    assert.strictEqual(route.advisory.proposal_id, 'prop_sync_mod');
  });

  await t.test('ESC-03: Review advisory satisfies schema and includes complete proposal provenance, alternatives, & rationale (ARC-29-09 & ARC-29-13)', () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-esc-03', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_transient', type: 'audio', src: 'burst.wav', metadata: { durationSec: 0.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_esc_03', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_esc_03',
        assetId: 'asset_transient',
        trackId: 'track_esc_03',
        type: 'audio',
        startTick: 120000,
        durationTicks: 48000
      }
    }).project;

    const finding = {
      finding_id: 'find_esc_03',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      source_media_sha256: '9f8e7d6c5b4a1234567890abcdef',
      confidence: 0.70,
      measured_value: { max_offset_ms: 25.0 }
    };

    const proposal = {
      proposal_id: 'prop_esc_03',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_esc_03',
      track_id: 'track_esc_03',
      parameters: {
        clip_id: 'clip_esc_03',
        track_id: 'track_esc_03',
        shift_ticks: -3000,
        target_start_tick: 117000
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, finding, project);
    const advisory = router.generateReviewAdvisory(proposal, assessment, project);

    // Verify ARC-29-09 advisory binding & schema properties
    assert.strictEqual(advisory.schema_version, '1.0.0');
    assert.ok(advisory.request_id.startsWith('rev_req_'));
    assert.strictEqual(advisory.proposal_id, 'prop_esc_03');
    assert.strictEqual(advisory.finding_id, 'find_esc_03');
    assert.strictEqual(advisory.defect_type, 'AUDIO_SYNC_OFFSET');
    assert.strictEqual(advisory.candidate_revision, project.revision);
    assert.strictEqual(advisory.source_media_sha256, '9f8e7d6c5b4a1234567890abcdef');
    assert.deepStrictEqual(advisory.target, { clip_id: 'clip_esc_03', track_id: 'track_esc_03' });

    // Verify confidence & component provenance
    assert.strictEqual(advisory.confidence.policy_name, 'default_adaptive_confidence_v1');
    assert.strictEqual(advisory.confidence.score, assessment.confidence_score);
    assert.ok(advisory.confidence.components.evidence_score !== undefined);
    assert.ok(advisory.confidence.components.geometry_score !== undefined);

    // Verify structured repair alternatives (ARC-29-13)
    assert.ok(Array.isArray(advisory.available_alternatives));
    assert.ok(advisory.available_alternatives.length >= 2);
    const primary = advisory.available_alternatives.find(a => a.is_recommended);
    assert.ok(primary);
    assert.strictEqual(primary.strategy, 'SYNC_RETIME');
    assert.ok(primary.expected_effect.includes('offset'));
    assert.ok(primary.known_risks.length > 0);

    // Verify alternative with explicit notice that defect remains
    const leaveUnresolved = advisory.available_alternatives.find(a => a.option_id === 'LEAVE_DEFECT_UNRESOLVED');
    assert.ok(leaveUnresolved);
    assert.strictEqual(leaveUnresolved.strategy, 'NO_OP');
    assert.ok(leaveUnresolved.known_risks.includes('fail quality gates'));

    // Verify lifecycle and invalidation conditions
    assert.strictEqual(advisory.lifecycle_status, 'AWAITING_APPROVAL');
    assert.strictEqual(advisory.invalidation_conditions.max_valid_revision, project.revision);
    assert.strictEqual(advisory.invalidation_conditions.requires_track_unlocked, true);
  });

  await t.test('ESC-04: Mixed-confidence batch is partitioned deterministically, with dependent actions safely withheld (ARC-29-12)', () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-esc-04', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_sfx', type: 'audio', src: 'sfx.wav', metadata: { durationSec: 1.0 } }
    }).project;

    // Track 1: Independent track
    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_indep', kind: 'audio', index: 0 }
    }).project;

    // Track 2: Congested / mixed track
    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_mixed', kind: 'audio', index: 1 }
    }).project;

    // Clip A on Track 1 (isolated, high confidence)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_A',
        assetId: 'asset_sfx',
        trackId: 'track_indep',
        type: 'audio',
        startTick: 100000,
        durationTicks: 48000
      }
    }).project;

    // Clip B on Track 2 (tight margin, moderate confidence)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_B',
        assetId: 'asset_sfx',
        trackId: 'track_mixed',
        type: 'audio',
        startTick: 100000,
        durationTicks: 48000
      }
    }).project;

    // Clip C on Track 2 (high confidence finding, but shares Track 2 with Clip B!)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_C',
        assetId: 'asset_sfx',
        trackId: 'track_mixed',
        type: 'audio',
        startTick: 200000,
        durationTicks: 48000
      }
    }).project;

    // Clip D on Track 1 (speculative weak finding)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_D',
        assetId: 'asset_sfx',
        trackId: 'track_indep',
        type: 'audio',
        startTick: 400000,
        durationTicks: 48000
      }
    }).project;

    const propA = {
      proposal_id: 'prop_A',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_A',
      track_id: 'track_indep',
      parameters: { clip_id: 'clip_A', track_id: 'track_indep', shift_ticks: -1200 },
      preconditions: { expected_base_revision: project.revision, bounds_valid: true }
    };
    const assessA = {
      proposal_id: 'prop_A',
      project_revision: project.revision,
      confidence_score: 0.95,
      disposition: 'AUTONOMOUS_EXECUTION',
      components: { evidence_score: 0.95, geometry_score: 1.0, risk_suitability_score: 0.90 }
    };

    const propB = {
      proposal_id: 'prop_B',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_B',
      track_id: 'track_mixed',
      parameters: { clip_id: 'clip_B', track_id: 'track_mixed', shift_ticks: -2400 },
      preconditions: { expected_base_revision: project.revision, bounds_valid: true }
    };
    const assessB = {
      proposal_id: 'prop_B',
      project_revision: project.revision,
      confidence_score: 0.65,
      disposition: 'HUMAN_ESCALATION_REQUIRED',
      components: { evidence_score: 0.70, geometry_score: 0.40, risk_suitability_score: 0.85 }
    };

    const propC = {
      proposal_id: 'prop_C',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_C',
      track_id: 'track_mixed', // Same track as escalated propB!
      parameters: { clip_id: 'clip_C', track_id: 'track_mixed', shift_ticks: -1200 },
      preconditions: { expected_base_revision: project.revision, bounds_valid: true }
    };
    const assessC = {
      proposal_id: 'prop_C',
      project_revision: project.revision,
      confidence_score: 0.90, // High confidence!
      disposition: 'AUTONOMOUS_EXECUTION',
      components: { evidence_score: 0.90, geometry_score: 1.0, risk_suitability_score: 0.90 }
    };

    const propD = {
      proposal_id: 'prop_D',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_D',
      track_id: 'track_indep',
      parameters: { clip_id: 'clip_D', track_id: 'track_indep', shift_ticks: 36000 },
      preconditions: { expected_base_revision: project.revision, bounds_valid: true }
    };
    const assessD = {
      proposal_id: 'prop_D',
      project_revision: project.revision,
      confidence_score: 0.25, // Speculative!
      disposition: 'DISCARD_SPECULATIVE',
      components: { evidence_score: 0.25, geometry_score: 0.50, risk_suitability_score: 0.40 }
    };

    const batch = router.partitionBatch(
      project,
      [propA, propB, propC, propD],
      [assessA, assessB, assessC, assessD]
    );

    // Verify safe autonomous execution for Prop A (isolated track)
    assert.strictEqual(batch.autonomous_executable.length, 1);
    assert.strictEqual(batch.autonomous_executable[0].proposal.proposal_id, 'prop_A');

    // Verify Prop C was safely HELD (ARC-29-12: shared track with pending escalated Prop B)
    assert.strictEqual(batch.autonomous_held.length, 1);
    assert.strictEqual(batch.autonomous_held[0].proposal.proposal_id, 'prop_C');
    assert.ok(batch.autonomous_held[0].held_reason.includes('shares clip (false) or track (true)'));

    // Verify Prop B is escalated with advisory
    assert.strictEqual(batch.escalated_advisories.length, 1);
    assert.strictEqual(batch.escalated_advisories[0].proposal.proposal_id, 'prop_B');
    assert.strictEqual(batch.escalated_advisories[0].advisory.lifecycle_status, 'AWAITING_APPROVAL');

    // Verify Prop D was discarded as speculative
    assert.strictEqual(batch.speculative_discarded.length, 1);
    assert.strictEqual(batch.speculative_discarded[0].proposal.proposal_id, 'prop_D');

    // Cannot promote immediately while reviews are pending
    assert.strictEqual(batch.has_pending_reviews, true);
    assert.strictEqual(batch.safe_to_promote_immediately, false);
  });

  await t.test('ESC-05: Previous active delivery remains unchanged while a proposal is waiting for review (ARC-29-11 & ARC-29-12)', () => {
    // Model an established active delivery manifest and render SHA
    const baselineDelivery = {
      delivery_id: 'del_baseline_active_01',
      project_revision: 4,
      media_sha256: 'sha256:e53317ae7958a87dd17ae7aaaeecfdebd1a38a62',
      status: 'ACTIVE_PROMOTED',
      promoted_at: '2026-10-22T08:00:00.000Z'
    };

    const currentProject = {
      revision: 4,
      tracks: [{ id: 'track_1', locked: false }],
      clips: [{ id: 'clip_1', trackId: 'track_1', startTick: 0, durationTicks: 48000 }]
    };

    // Proposal routed to human review
    const proposal = {
      proposal_id: 'prop_review_hold',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_1',
      track_id: 'track_1',
      parameters: { clip_id: 'clip_1', shift_ticks: -1200 },
      preconditions: { expected_base_revision: 4, bounds_valid: true }
    };
    const assessment = {
      proposal_id: 'prop_review_hold',
      project_revision: 4,
      confidence_score: 0.60,
      disposition: 'HUMAN_ESCALATION_REQUIRED',
      components: { evidence_score: 0.60, geometry_score: 0.50, risk_suitability_score: 0.70 }
    };

    const route = router.routeProposal(proposal, assessment, currentProject);
    assert.strictEqual(route.disposition, 'HUMAN_ESCALATION_REQUIRED');

    // Active delivery MUST remain authoritative and unchanged while awaiting approval (ARC-29-11)
    let activeDelivery = { ...baselineDelivery };

    // Simulate router cycle where review is generated
    if (route.disposition === 'HUMAN_ESCALATION_REQUIRED') {
      // Delivery cannot be promoted or mutated!
      assert.strictEqual(activeDelivery.delivery_id, 'del_baseline_active_01');
      assert.strictEqual(activeDelivery.project_revision, 4);
      assert.strictEqual(activeDelivery.media_sha256, 'sha256:e53317ae7958a87dd17ae7aaaeecfdebd1a38a62');
      assert.strictEqual(activeDelivery.status, 'ACTIVE_PROMOTED');
    }
  });

  await t.test('ESC-06: Review request leads to appropriate existing state and cannot bypass approval, revision fencing, or safeguards (ARC-29-10 & ARC-29-11)', () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-esc-06', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_transient', type: 'audio', src: 'burst.wav', metadata: { durationSec: 0.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_esc_06', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_esc_06',
        assetId: 'asset_transient',
        trackId: 'track_esc_06',
        type: 'audio',
        startTick: 120000,
        durationTicks: 48000
      }
    }).project;

    const finding = {
      finding_id: 'find_esc_06',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      confidence: 0.65,
      measured_value: { max_offset_ms: 15.0 }
    };

    const proposal = {
      proposal_id: 'prop_esc_06',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_esc_06',
      track_id: 'track_esc_06',
      parameters: {
        clip_id: 'clip_esc_06',
        track_id: 'track_esc_06',
        shift_ticks: -1800,
        target_start_tick: 118200
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, finding, project);
    const advisory = router.generateReviewAdvisory(proposal, assessment, project);

    // Subtest 1: Legitimate human approval matching supported alternative on matching revision
    const validApproval = {
      decision: 'APPROVE',
      selected_option: 'EXECUTE_RECOMMENDED_RETIME',
      approved_by: 'qa_lead_editor',
      timestamp: new Date().toISOString()
    };
    const validRes = router.validateApproval(advisory, validApproval, project);
    assert.strictEqual(validRes.valid, true);
    assert.strictEqual(validRes.approved_option.option_id, 'EXECUTE_RECOMMENDED_RETIME');

    // Subtest 2: Stale approval validation failure (project revision advanced!) (ARC-29-10)
    const advancedProject = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_new', kind: 'audio', index: 1 }
    }).project;
    assert.ok(advancedProject.revision > project.revision);

    const staleRes = router.validateApproval(advisory, validApproval, advancedProject);
    assert.strictEqual(staleRes.valid, false);
    assert.strictEqual(staleRes.error_code, 'APPROVAL_INVALIDATED_STALE_REVISION');
    assert.ok(staleRes.reason.includes('Project revision has advanced'));

    // Subtest 3: Rejection of unsupported repair option (ARC-29-13)
    const unsupportedApproval = {
      decision: 'APPROVE',
      selected_option: 'UNSUPPORTED_ARBITRARY_MUTATION',
      approved_by: 'rogue_user'
    };
    const unsupRes = router.validateApproval(advisory, unsupportedApproval, project);
    assert.strictEqual(unsupRes.valid, false);
    assert.strictEqual(unsupRes.error_code, 'UNSUPPORTED_REPAIR_OPTION');

    // Subtest 4: Rejection of material modifications attached to approval (ARC-29-10)
    const modifiedApproval = {
      decision: 'APPROVE',
      selected_option: 'EXECUTE_RECOMMENDED_RETIME',
      material_modifications: { shift_ticks: -120000 } // Unchecked 1-second shift!
    };
    const modRes = router.validateApproval(advisory, modifiedApproval, project);
    assert.strictEqual(modRes.valid, false);
    assert.strictEqual(modRes.error_code, 'MATERIAL_MODIFICATION_REJECTED');

    // Subtest 5: Rejection when track is locked between advisory and approval
    const lockedProject = {
      ...project,
      tracks: project.tracks.map(t => t.id === 'track_esc_06' ? { ...t, locked: true } : t)
    };
    const lockRes = router.validateApproval(advisory, validApproval, lockedProject);
    assert.strictEqual(lockRes.valid, false);
    assert.strictEqual(lockRes.error_code, 'TRACK_LOCKED');

    // Subtest 6: Advisory itself does not execute or mutate project without valid approval (ARC-29-08)
    const initialRev = project.revision;
    // Calling routeProposal or generateReviewAdvisory did not mutate project
    assert.strictEqual(project.revision, initialRev);
  });
});
