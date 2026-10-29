/**
 * Editing Mechanics Engine (EME) - Stage 29.1 Test Suite
 *
 * Verifies RepairConfidenceCalibrator & Evidence Scorer (ARC-29-01 to ARC-29-07):
 * - CAL-01: Validate confidence schema & reject invalid policy configurations.
 * - CAL-02: Score clear, high-confidence sync finding with ample geometry margin.
 * - CAL-03: Apply deterministic penalty for constrained timeline geometry.
 * - CAL-04: Reduce confidence appropriately for ambiguous evidence / uncertain peaks.
 * - CAL-05: Reject proposals below minimum execution-confidence threshold.
 * - CAL-06: Verify valid weights, normalization, bounded scores, quantization, & threshold boundaries.
 * - CAL-07: Invalidate confidence on stale finding or project-revision evidence.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { OperationExecutor } = require('../src/engine/operations');
const {
  RepairConfidenceCalibrator,
  DEFAULT_CONFIDENCE_POLICY
} = require('../src/audio/repair/repair-confidence-calibrator');

test('Stage 29.1: Repair Confidence Calibrator & Evidence Scorer', async (t) => {
  const schemaPath = path.resolve(__dirname, '../src/audio/schemas/audio-repair-confidence.v1.json');

  await t.test('CAL-01: Validates compliant confidence policy schema & rejects invalid policies (ARC-29-02 & ARC-29-07)', () => {
    // 1. Validate schema file exists and is valid JSON
    assert.ok(fs.existsSync(schemaPath), 'Schema file must exist');
    const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.strictEqual(schemaContent.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(schemaContent.title, 'AudioRepairConfidencePolicy');

    // 2. Default policy must instantiate cleanly
    const calibrator = new RepairConfidenceCalibrator();
    assert.strictEqual(calibrator.policy.policy_name, 'default_adaptive_confidence_v1');

    // 3. Reject invalid weights (not summing to 1.0)
    assert.throws(() => {
      new RepairConfidenceCalibrator({
        policy: {
          ...DEFAULT_CONFIDENCE_POLICY,
          weights: { evidence: 0.60, geometry: 0.30, risk_suitability: 0.20 } // sum = 1.10
        }
      });
    }, /Scoring weights must sum to 1.0/);

    // 4. Reject negative weights
    assert.throws(() => {
      new RepairConfidenceCalibrator({
        policy: {
          ...DEFAULT_CONFIDENCE_POLICY,
          weights: { evidence: 1.20, geometry: -0.20, risk_suitability: 0.00 }
        }
      });
    }, /Scoring weights must be non-negative/);

    // 5. Reject invalid thresholds (autonomous < minimum)
    assert.throws(() => {
      new RepairConfidenceCalibrator({
        policy: {
          ...DEFAULT_CONFIDENCE_POLICY,
          thresholds: { autonomous_execution: 0.30, minimum_execution: 0.50 }
        }
      });
    }, /autonomous_execution threshold must be >= minimum_execution threshold/);

    // 6. Reject unsupported schema version
    assert.throws(() => {
      new RepairConfidenceCalibrator({
        policy: {
          ...DEFAULT_CONFIDENCE_POLICY,
          schema_version: '2.0.0'
        }
      });
    }, /Unsupported confidence policy schema version/);
  });

  await t.test('CAL-02: Scores clear, high-confidence synchronization finding with ample geometry margin (ARC-29-02)', () => {
    const calibrator = new RepairConfidenceCalibrator();

    // Construct baseline project
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-cal-02', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_transient', type: 'audio', src: 'burst.wav', metadata: { durationSec: 0.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_main', kind: 'audio', index: 0 }
    }).project;

    // Isolated clip with vast margin (> 2.0s on both sides)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_sync_transient',
        assetId: 'asset_transient',
        trackId: 'track_audio_main',
        type: 'audio',
        startTick: 240000, // 2.0s
        durationTicks: 48000, // 0.4s
        inPointTicks: 0,
        outPointTicks: 48000
      }
    }).project;

    const finding = {
      finding_id: 'find_sync_01',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      source_media_sha256: 'abc123sha',
      confidence: 0.96, // Clear, crisp acoustic transient
      measured_value: {
        max_offset_ms: 60.0,
        direction: 'late',
        confidence: 0.96
      }
    };

    const proposal = {
      proposal_id: 'prop_sync_01',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_sync_transient',
      track_id: 'track_audio_main',
      parameters: {
        clip_id: 'clip_sync_transient',
        track_id: 'track_audio_main',
        shift_ticks: -7200, // -60ms
        target_start_tick: 232800
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, finding, project);

    assert.strictEqual(assessment.proposal_id, 'prop_sync_01');
    assert.strictEqual(assessment.project_revision, project.revision);
    assert.strictEqual(assessment.source_revision, project.revision);
    assert.strictEqual(assessment.disposition, 'AUTONOMOUS_EXECUTION');
    assert.strictEqual(assessment.eligible_for_autonomous, true);
    assert.ok(assessment.confidence_score >= 0.80, `Confidence score ${assessment.confidence_score} must be >= 0.80`);
    assert.strictEqual(assessment.components.evidence_score, 0.96);
    assert.strictEqual(assessment.components.geometry_score, 1.0);
    assert.strictEqual(assessment.components.risk_suitability_score, 0.85); // shift <= 24,000 ticks
  });

  await t.test('CAL-03: Applies deterministic penalty for constrained timeline geometry (ARC-29-02)', () => {
    const calibrator = new RepairConfidenceCalibrator();

    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-cal-03', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_transient', type: 'audio', src: 'burst.wav', metadata: { durationSec: 0.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_crowded', kind: 'audio', index: 0 }
    }).project;

    // Place preceding clip ending at 117,000 ticks
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_prev',
        assetId: 'asset_transient',
        trackId: 'track_audio_crowded',
        type: 'audio',
        startTick: 69000,
        durationTicks: 48000, // ends at 117,000
        inPointTicks: 0,
        outPointTicks: 48000
      }
    }).project;

    // Target clip starts at 120,000 ticks (only 3,000 ticks margin to clip_prev!)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_tight',
        assetId: 'asset_transient',
        trackId: 'track_audio_crowded',
        type: 'audio',
        startTick: 120000,
        durationTicks: 48000,
        inPointTicks: 0,
        outPointTicks: 48000
      }
    }).project;

    const finding = {
      finding_id: 'find_sync_tight',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      confidence: 0.85,
      measured_value: { max_offset_ms: 15.0 }
    };

    const proposal = {
      proposal_id: 'prop_sync_tight',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_tight',
      track_id: 'track_audio_crowded',
      parameters: {
        clip_id: 'clip_tight',
        track_id: 'track_audio_crowded',
        shift_ticks: -1800, // -15ms
        target_start_tick: 118200 // Left margin is only 1,200 ticks!
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, finding, project);

    // Tight margin (< 6000 ticks) produces low geometry score and triggers tight_boundary_penalty (0.15)
    assert.strictEqual(assessment.components.geometry_score, 0.25);
    assert.strictEqual(assessment.components.penalty, 0.15);
    // Score calculation: 0.50*0.85 + 0.30*0.25 + 0.20*1.0 - 0.15 = 0.425 + 0.075 + 0.20 - 0.15 = 0.5500
    assert.ok(assessment.confidence_score < 0.80, 'Must drop below autonomous execution threshold');
    assert.strictEqual(assessment.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.strictEqual(assessment.eligible_for_autonomous, false);
    assert.ok(assessment.rationale.includes('human-in-the-loop escalation'));
  });

  await t.test('CAL-04: Reduces confidence appropriately for ambiguous evidence or uncertain peak measurements (ARC-29-02)', () => {
    const calibrator = new RepairConfidenceCalibrator();

    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-cal-04', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_dialogue', type: 'audio', src: 'dialogue.wav', metadata: { durationSec: 2.0 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_dialogue', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_dialogue',
        assetId: 'asset_dialogue',
        trackId: 'track_dialogue',
        type: 'audio',
        startTick: 0,
        durationTicks: 240000,
        inPointTicks: 0,
        outPointTicks: 240000
      }
    }).project;

    // Ambiguous peak defect: just barely exceeding ceiling (-0.95 dBTP vs -1.0 dBTP limit)
    // Finding evidence is near noise/uncertainty floor
    const ambiguousPeakFinding = {
      finding_id: 'find_peak_ambiguous',
      defect_type: 'TRUE_PEAK_EXCEEDED',
      source_revision: project.revision,
      confidence: 0.55, // Low confidence in peak measurement repeatability
      measured_value: {
        max_true_peak_dbtp: -0.95,
        threshold_dbtp: -1.00
      }
    };

    const proposal = {
      proposal_id: 'prop_peak_ambiguous',
      status: 'PLANNED',
      strategy: 'PEAK_ATTENUATION',
      clip_id: 'clip_dialogue',
      track_id: 'track_dialogue',
      parameters: {
        clip_id: 'clip_dialogue',
        attenuation_db: 0.5
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, ambiguousPeakFinding, project);

    // Geometry is 1.0 (envelope), risk suitability is 1.0 (0.5 dB attenuation)
    // Evidence is 0.55. Score: 0.50*0.55 + 0.30*1.0 + 0.20*1.0 = 0.275 + 0.30 + 0.20 = 0.7750
    assert.strictEqual(assessment.confidence_score, 0.7750);
    assert.ok(assessment.confidence_score < 0.80, 'Score must be below autonomous threshold (0.80)');
    assert.strictEqual(assessment.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.strictEqual(assessment.eligible_for_autonomous, false);
  });

  await t.test('CAL-05: Rejects proposals below minimum execution-confidence threshold (< 0.40) (ARC-29-04)', () => {
    const calibrator = new RepairConfidenceCalibrator();

    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-cal-05', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_noisy', type: 'audio', src: 'noise.wav', metadata: { durationSec: 1.0 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_noisy', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_noisy',
        assetId: 'asset_noisy',
        trackId: 'track_noisy',
        type: 'audio',
        startTick: 5000,
        durationTicks: 60000,
        inPointTicks: 0,
        outPointTicks: 60000
      }
    }).project;

    // Extremely weak / speculative finding evidence (e.g. noise floor transient false-positive)
    const speculativeFinding = {
      finding_id: 'find_speculative',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      confidence: 0.20, // Very low confidence
      measured_value: { max_offset_ms: 80.0, confidence: 0.20 }
    };

    // Large high-risk retime on tight track
    const speculativeProposal = {
      proposal_id: 'prop_speculative',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_noisy',
      track_id: 'track_noisy',
      parameters: {
        clip_id: 'clip_noisy',
        shift_ticks: 72000, // > 500ms -> risk suitability = 0.40
        target_start_tick: 77000
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    // Also pass context penalty for unstable history
    const assessment = calibrator.evaluateProposalConfidence(
      speculativeProposal,
      speculativeFinding,
      project,
      { unstableHistory: true }
    );

    // Score calculation:
    // Se = 0.20 -> 0.50 * 0.20 = 0.10
    // Sg = 0.80 (minMargin 77,000 >= 24,000) -> 0.30 * 0.80 = 0.24
    // Sr = 0.40 (shift > 500ms) -> 0.20 * 0.40 = 0.08
    // Penalty = 0.20 (unstable history)
    // Raw score = 0.10 + 0.24 + 0.08 - 0.20 = 0.2200
    assert.strictEqual(assessment.confidence_score, 0.2200);
    assert.strictEqual(assessment.disposition, 'DISCARD_SPECULATIVE');
    assert.strictEqual(assessment.eligible_for_autonomous, false);
    assert.ok(assessment.rationale.includes('speculative noise'));
  });

  await t.test('CAL-06: Verifies valid weights, normalization, bounded scores, quantization, & threshold boundaries (ARC-29-02)', () => {
    const calibrator = new RepairConfidenceCalibrator();

    // 1. Verify exact weight sum
    const { evidence: we, geometry: wg, risk_suitability: wr } = calibrator.policy.weights;
    assert.strictEqual(we + wg + wr, 1.0);

    // 2. Mock evaluate helper to test boundary behaviors
    const mockProj = { revision: 1, clips: [] };
    const mockFinding = { source_revision: 1, confidence: 1.0 };
    const mockProposal = {
      status: 'PLANNED',
      strategy: 'PEAK_ATTENUATION',
      preconditions: { expected_base_revision: 1, bounds_valid: true }
    };

    // Case A: Exact threshold boundary 0.8000
    // Set custom penalty to land exactly on 0.8000
    // Se=1.0 (0.50), Sg=1.0 (0.30), Sr=1.0 (0.20) -> sum=1.0000. Penalty 0.2000 -> 0.8000
    const res80 = calibrator.evaluateProposalConfidence(mockProposal, mockFinding, mockProj, { customPenalty: 0.2000 });
    assert.strictEqual(res80.confidence_score, 0.8000);
    assert.strictEqual(res80.disposition, 'AUTONOMOUS_EXECUTION', 'Exact 0.8000 must be AUTONOMOUS_EXECUTION');

    // Case B: Boundary 0.7999
    const res7999 = calibrator.evaluateProposalConfidence(mockProposal, mockFinding, mockProj, { customPenalty: 0.2001 });
    assert.strictEqual(res7999.confidence_score, 0.7999);
    assert.strictEqual(res7999.disposition, 'HUMAN_ESCALATION_REQUIRED', '0.7999 must be HUMAN_ESCALATION_REQUIRED');

    // Case C: Exact boundary 0.4000
    const res40 = calibrator.evaluateProposalConfidence(mockProposal, mockFinding, mockProj, { customPenalty: 0.6000 });
    // Note: max_penalty is 0.50 by default, so customPenalty 0.60 gets clamped to 0.50 -> score 0.50.
    // Let's use lower evidence:
    const lowFinding = { source_revision: 1, confidence: 0.30 }; // Se=0.30 -> 0.15 + 0.30 + 0.20 = 0.65. Penalty 0.25 -> 0.4000
    const resExact40 = calibrator.evaluateProposalConfidence(mockProposal, lowFinding, mockProj, { customPenalty: 0.2500 });
    assert.strictEqual(resExact40.confidence_score, 0.4000);
    assert.strictEqual(resExact40.disposition, 'HUMAN_ESCALATION_REQUIRED', 'Exact 0.4000 must be HUMAN_ESCALATION_REQUIRED');

    // Case D: Boundary 0.3999
    const res3999 = calibrator.evaluateProposalConfidence(mockProposal, lowFinding, mockProj, { customPenalty: 0.2501 });
    assert.strictEqual(res3999.confidence_score, 0.3999);
    assert.strictEqual(res3999.disposition, 'DISCARD_SPECULATIVE', '0.3999 must be DISCARD_SPECULATIVE');

    // Case E: Extreme clamping at 0.0 and 1.0
    // Overshoot penalty
    const resZero = calibrator.evaluateProposalConfidence(
      mockProposal,
      { source_revision: 1, confidence: 0.0 },
      mockProj,
      { customPenalty: 0.50 }
    );
    assert.strictEqual(resZero.confidence_score, 0.0000);
    assert.ok(resZero.confidence_score >= 0.0);

    // Overshoot raw score > 1.0 (if possible) -> stays <= 1.0
    const resOne = calibrator.evaluateProposalConfidence(mockProposal, mockFinding, mockProj);
    assert.strictEqual(resOne.confidence_score, 1.0000);
    assert.ok(resOne.confidence_score <= 1.0);
  });

  await t.test('CAL-07: Invalidates confidence on stale finding or project-revision evidence (ARC-29-01 & ARC-29-03)', () => {
    const calibrator = new RepairConfidenceCalibrator();

    const currentProject = { revision: 5, clips: [] };

    // Case 1: Stale finding revision (derived from revision 4)
    const staleFinding = {
      finding_id: 'find_stale_rev',
      source_revision: 4,
      confidence: 0.99
    };
    const validProposal = {
      proposal_id: 'prop_valid',
      status: 'PLANNED',
      strategy: 'PEAK_ATTENUATION',
      preconditions: { expected_base_revision: 5, bounds_valid: true }
    };

    const staleFindResult = calibrator.evaluateProposalConfidence(validProposal, staleFinding, currentProject);
    assert.strictEqual(staleFindResult.confidence_score, 0.0000);
    assert.strictEqual(staleFindResult.disposition, 'CONFIDENCE_ZEROED_STALE');
    assert.strictEqual(staleFindResult.eligible_for_autonomous, false);
    assert.ok(staleFindResult.rationale.includes('stale'));

    // Case 2: Stale proposal expected_base_revision (proposal planned against revision 4)
    const freshFinding = {
      finding_id: 'find_fresh',
      source_revision: 5,
      confidence: 0.99
    };
    const staleProposal = {
      proposal_id: 'prop_stale_rev',
      status: 'PLANNED',
      strategy: 'PEAK_ATTENUATION',
      preconditions: { expected_base_revision: 4, bounds_valid: true }
    };

    const stalePropResult = calibrator.evaluateProposalConfidence(staleProposal, freshFinding, currentProject);
    assert.strictEqual(stalePropResult.confidence_score, 0.0000);
    assert.strictEqual(stalePropResult.disposition, 'CONFIDENCE_ZEROED_STALE');
    assert.strictEqual(stalePropResult.eligible_for_autonomous, false);

    // Case 3: Hard safety violation (bounds_valid: false) takes absolute precedence (ARC-29-01)
    const invalidBoundsProposal = {
      proposal_id: 'prop_invalid_bounds',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      preconditions: { expected_base_revision: 5, bounds_valid: false }
    };
    const hardViolationResult = calibrator.evaluateProposalConfidence(invalidBoundsProposal, freshFinding, currentProject);
    assert.strictEqual(hardViolationResult.confidence_score, 0.0000);
    assert.strictEqual(hardViolationResult.disposition, 'REJECTED_PRECONDITION_FAILED');
    assert.strictEqual(hardViolationResult.eligible_for_autonomous, false);
    assert.ok(hardViolationResult.rationale.includes('bounds are invalid'));

    // Case 4: Missing mandatory evidence input
    const malformedResult = calibrator.evaluateProposalConfidence(null, freshFinding, currentProject);
    assert.strictEqual(malformedResult.confidence_score, 0.0000);
    assert.strictEqual(malformedResult.disposition, 'INELIGIBLE_MALFORMED_PROPOSAL');
    assert.strictEqual(malformedResult.eligible_for_autonomous, false);
  });
});
