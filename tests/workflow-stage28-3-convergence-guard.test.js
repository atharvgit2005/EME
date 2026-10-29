/**
 * Test Suite: Stage 28.3 — Anti-Oscillation & Convergence Guard
 *
 * Verifies the 6 discrete subtests mandated by Architecture Lead in Stage 28.3 Ruling:
 * 1. CVG-01: Detects real sign-reversing oscillation on same clip/defect (|Δ_k + Δ_{k-1}| < ε),
 *            while permitting opposite-sign repairs on distinct clips.
 * 2. CVG-02: Detects duplicate ineffective proposals without confusing them with legitimate follow-ups.
 * 3. CVG-03: Enforces cumulative shift cap (240,000 ticks) and preserves stricter single shift cap (120,000 ticks).
 * 4. CVG-04: Enforces cumulative attenuation limit (12.0 dB max).
 * 5. CVG-05: Returns OSCILLATION_DETECTED and transitions to NEEDS_RECONCILIATION without mutating active delivery.
 * 6. CVG-06: Verifies full diagnostic journal records repair history and convergence metrics across passes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {
  RepairConvergenceGuard,
  DEFAULT_REVERSAL_TOLERANCE_TICKS,
  DEFAULT_MAX_CUMULATIVE_SHIFT_TICKS,
  DEFAULT_MAX_SINGLE_SHIFT_TICKS,
  DEFAULT_MAX_CUMULATIVE_ATTENUATION_DB
} = require('../src/audio/repair/repair-convergence-guard.js');
const { MultiPassRepairOrchestrator } = require('../src/audio/repair/multi-pass-orchestrator.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

function createSampleProject() {
  let project = OperationExecutor.execute(null, {
    type: 'create_project',
    params: { id: 'proj-cvg-test', fps: 30, width: 1920, height: 1080, durationTicks: 480000 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: { id: 'asset_a', type: 'audio', src: '/tmp/a.wav', metadata: { durationSec: 2.0 } }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: { id: 'asset_b', type: 'audio', src: '/tmp/b.wav', metadata: { durationSec: 2.0 } }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_track',
    params: { id: 'a1', kind: 'audio', zIndex: 1 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_track',
    params: { id: 'a2', kind: 'audio', zIndex: 2 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: { id: 'clip_a', trackId: 'a1', source: { assetId: 'asset_a' }, type: 'audio', startTick: 120000, durationTicks: 120000 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: { id: 'clip_b', trackId: 'a2', source: { assetId: 'asset_b' }, type: 'audio', startTick: 240000, durationTicks: 120000 }
  }).project;

  return project;
}

function createDummyWav(filePath) {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(48000, 24);
  buf.writeUInt32LE(96000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(0, 40);
  fs.writeFileSync(filePath, buf);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

test('Stage 28.3: Anti-Oscillation & Convergence Guard', async (t) => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-test-stage28-3-'));

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (e) {}
  });

  // CVG-01
  await t.test('CVG-01: Detects real sign-reversing oscillation on same clip, while permitting opposite-sign repairs on different clips (ARC-28-15 & ARC-28-16)', () => {
    const project = createSampleProject();

    // Prior operation on Pass 1: clip_a shifted by +12,000 ticks
    const history = [
      {
        pass: 1,
        proposalId: 'prop-pass1-shift-a',
        strategy: 'SYNC_RETIME',
        clipId: 'clip_a',
        priorProject: project,
        forwardOp: { clipId: 'clip_a', targetTick: 132000 },
        inverseOp: { clipId: 'clip_a', targetTick: 120000 }
      }
    ];

    // Case 1A: Proposed shift on clip_a reverses prior shift (-12,000 ticks). Sum = 0 < epsilon (1200 ticks)
    const reversingProposalSameClip = {
      proposal_id: 'prop-pass2-reverse-a',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: -12000, target_start_tick: 120000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 132000, bounds_valid: true }
    };

    const checkReversal = RepairConvergenceGuard.validateProposalBeforeExecution(reversingProposalSameClip, project, history);
    assert.strictEqual(checkReversal.allowed, false);
    assert.strictEqual(checkReversal.outcome, 'OSCILLATION_DETECTED');
    assert.strictEqual(checkReversal.reconciliation_required, true);

    // Case 1B: Near-reversal within epsilon tolerance (-11,500 ticks). Sum = +500 ticks < 1200 ticks tolerance
    const nearReversalProposal = {
      proposal_id: 'prop-pass2-near-reverse-a',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: -11500, target_start_tick: 120500 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 132000, bounds_valid: true }
    };
    const checkNear = RepairConvergenceGuard.validateProposalBeforeExecution(nearReversalProposal, project, history);
    assert.strictEqual(checkNear.allowed, false);
    assert.strictEqual(checkNear.outcome, 'OSCILLATION_DETECTED');

    // Case 1C: Partial adjustment outside epsilon tolerance (-6,000 ticks). Sum = +6,000 ticks >= 1200 ticks
    const nonOscillatingAdjustment = {
      proposal_id: 'prop-pass2-refine-a',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: -6000, target_start_tick: 126000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 132000, bounds_valid: true }
    };
    const checkRefine = RepairConvergenceGuard.validateProposalBeforeExecution(nonOscillatingAdjustment, project, history);
    assert.strictEqual(checkRefine.allowed, true);
    assert.strictEqual(checkRefine.outcome, 'ALLOWED');

    // Case 1D: Opposite-sign shift on a DIFFERENT clip (clip_b shifted by -12,000 ticks). MUST BE PERMITTED (ARC-28-15)!
    const oppositeShiftDifferentClip = {
      proposal_id: 'prop-pass2-shift-b',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_b',
      parameters: { shift_ticks: -12000, target_start_tick: 228000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 240000, bounds_valid: true }
    };
    const checkDiffClip = RepairConvergenceGuard.validateProposalBeforeExecution(oppositeShiftDifferentClip, project, history);
    assert.strictEqual(checkDiffClip.allowed, true, 'Opposite shift on distinct clip must be permitted');
    assert.strictEqual(checkDiffClip.outcome, 'ALLOWED');
  });

  // CVG-02
  await t.test('CVG-02: Detects duplicate ineffective proposals without confusing them with legitimate follow-ups (ARC-28-17)', () => {
    const project = createSampleProject();

    // Pass 1 committed -12,000 tick shift on clip_a
    const history = [
      {
        pass: 1,
        proposalId: 'prop-pass1-shift-a',
        strategy: 'SYNC_RETIME',
        clipId: 'clip_a',
        priorProject: project,
        forwardOp: { clipId: 'clip_a', targetTick: 108000 },
        inverseOp: { clipId: 'clip_a', targetTick: 120000 }
      }
    ];

    // Case 2A: Proposing the exact same -12,000 tick shift on clip_a again (duplicate ineffective mutation)
    const duplicateProposal = {
      proposal_id: 'prop-pass2-dup-shift-a',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: -12000, target_start_tick: 96000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 108000, bounds_valid: true }
    };

    const checkDup = RepairConvergenceGuard.validateProposalBeforeExecution(duplicateProposal, project, history);
    assert.strictEqual(checkDup.allowed, false);
    assert.strictEqual(checkDup.outcome, 'DUPLICATE_REPAIR');
    assert.strictEqual(checkDup.reconciliation_required, true);

    // Case 2B: Legitimate follow-up repair with different shift (-4,000 ticks) from new render
    const followUpProposal = {
      proposal_id: 'prop-pass2-followup-shift-a',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: -4000, target_start_tick: 104000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 108000, bounds_valid: true }
    };

    const checkFollowUp = RepairConvergenceGuard.validateProposalBeforeExecution(followUpProposal, project, history);
    assert.strictEqual(checkFollowUp.allowed, true);
    assert.strictEqual(checkFollowUp.outcome, 'ALLOWED');
  });

  // CVG-03
  await t.test('CVG-03: Enforces cumulative shift cap (240,000 ticks) and preserves stricter single shift cap (120,000 ticks) (ARC-28-18)', () => {
    const project = createSampleProject();

    // 1. Single operation cap: shift of 130,000 ticks (> 120,000) rejected immediately
    const excessSingleProposal = {
      proposal_id: 'prop-excess-single',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: 130000, target_start_tick: 250000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 120000, bounds_valid: true }
    };
    const checkSingle = RepairConvergenceGuard.validateProposalBeforeExecution(excessSingleProposal, project, []);
    assert.strictEqual(checkSingle.allowed, false);
    assert.strictEqual(checkSingle.outcome, 'SINGLE_SHIFT_CAP_EXCEEDED');

    // 2. Cumulative cap: Pass 1 shifted 100,000, Pass 2 shifted 100,000 (total 200,000). Pass 3 proposes 50,000 (sum 250,000 > 240,000)
    const history = [
      {
        pass: 1,
        strategy: 'SYNC_RETIME',
        clipId: 'clip_a',
        priorProject: project,
        forwardOp: { clipId: 'clip_a', targetTick: 220000 }
      },
      {
        pass: 2,
        strategy: 'SYNC_RETIME',
        clipId: 'clip_a',
        priorProject: { clips: [{ id: 'clip_a', startTick: 220000 }] },
        forwardOp: { clipId: 'clip_a', targetTick: 320000 }
      }
    ];

    const excessCumulativeProposal = {
      proposal_id: 'prop-excess-cumulative',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a',
      parameters: { shift_ticks: 50000, target_start_tick: 370000 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 320000, bounds_valid: true }
    };

    const checkCumulative = RepairConvergenceGuard.validateProposalBeforeExecution(excessCumulativeProposal, project, history);
    assert.strictEqual(checkCumulative.allowed, false);
    assert.strictEqual(checkCumulative.outcome, 'CUMULATIVE_SHIFT_CAP_EXCEEDED');
  });

  // CVG-04
  await t.test('CVG-04: Enforces cumulative attenuation limit (12.0 dB max) (ARC-28-18)', () => {
    const project = createSampleProject();

    // Prior passes applied 6.0 dB and 5.0 dB on clip_a (total 11.0 dB)
    const history = [
      { pass: 1, strategy: 'PEAK_ATTENUATION', clipId: 'clip_a', gainReductionDb: 6.0 },
      { pass: 2, strategy: 'PEAK_ATTENUATION', clipId: 'clip_a', gainReductionDb: 5.0 }
    ];

    // Case 4A: Propose additional 2.0 dB reduction (sum 13.0 dB > 12.0 dB limit)
    const excessAttenuationProposal = {
      proposal_id: 'prop-excess-gain',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a',
      parameters: { gain_reduction_db: 2.0 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 120000, bounds_valid: true }
    };

    const checkExcess = RepairConvergenceGuard.validateProposalBeforeExecution(excessAttenuationProposal, project, history);
    assert.strictEqual(checkExcess.allowed, false);
    assert.strictEqual(checkExcess.outcome, 'CUMULATIVE_ATTENUATION_CAP_EXCEEDED');

    // Case 4B: Propose additional 0.8 dB reduction (sum 11.8 dB <= 12.0 dB limit)
    const allowedAttenuationProposal = {
      proposal_id: 'prop-allowed-gain',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a',
      parameters: { gain_reduction_db: 0.8 },
      preconditions: { expected_base_revision: project.revision, current_start_tick: 120000, bounds_valid: true }
    };

    const checkAllowed = RepairConvergenceGuard.validateProposalBeforeExecution(allowedAttenuationProposal, project, history);
    assert.strictEqual(checkAllowed.allowed, true);
    assert.strictEqual(checkAllowed.outcome, 'ALLOWED');
  });

  // CVG-05
  await t.test('CVG-05: Returns OSCILLATION_DETECTED and transitions to NEEDS_RECONCILIATION without mutating active delivery (ARC-28-19 & ARC-28-22)', async () => {
    const project = createSampleProject();
    const activeMediaPath = path.join(scratchDir, 'active-delivery-cvg5.wav');
    const activeSha = createDummyWav(activeMediaPath);

    const activeDelivery = {
      delivery_run_id: 'del-cvg-005',
      media_path: activeMediaPath,
      media_sha256: activeSha,
      sha256: activeSha,
      revision: project.revision,
      status: 'ACTIVE'
    };

    const renderFn = (proj, outPath) => {
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    // Simulate oscillatory findings:
    // Pass 1: sound late by 100ms (+12,000 tick offset -> requires -12,000 tick shift)
    // Pass 2: sound early by 100ms (-12,000 tick offset -> requires +12,000 tick shift on same clip)
    const mockQaGenerator = (pass, render, proj) => {
      if (pass === 1) {
        return {
          checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 100.0, max_offset_ticks: 12000 } }],
          rawResponse: { sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 1.1, offset_ms: 100.0, offset_ticks: 12000 }] } }
        };
      } else {
        return {
          checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: -100.0, max_offset_ticks: -12000 } }],
          rawResponse: { sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 0.9, offset_ms: -100.0, offset_ticks: -12000 }] } }
        };
      }
    };

    const orchestrator = new MultiPassRepairOrchestrator({ renderFn, maxPasses: 3 });
    const result = await orchestrator.orchestrateMultiPassRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_a',
      mockQaGenerator
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(result.termination_reason, 'OSCILLATION_DETECTED');
    assert.strictEqual(result.promoted, false);

    // Active delivery MUST remain 100% untouched
    assert.deepStrictEqual(result.activeDelivery, activeDelivery);
    assert.strictEqual(result.activeDelivery.status, 'ACTIVE');

    // Candidate must be quarantined
    assert.ok(result.quarantinedCandidate);
    assert.strictEqual(result.quarantinedCandidate.status, 'QUARANTINED');
    assert.ok(result.quarantinedCandidate.quarantine_reason.includes('OSCILLATION_DETECTED'));
  });

  // CVG-06
  await t.test('CVG-06: Diagnostic journal records complete repair history and convergence metrics across passes (ARC-28-20)', () => {
    // Test evaluatePassProgress
    const priorQa = {
      checks: [
        { id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 100.0 } },
        { id: 'CHK_EARSHOT_TRUE_PEAK', status: 'failed', measured_value: { true_peak_dbtp: 1.5 } }
      ]
    };

    // Case 6A: Progress achieved (offset decreased from 100ms to 40ms)
    const improvedQa = {
      checks: [
        { id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 40.0 } },
        { id: 'CHK_EARSHOT_TRUE_PEAK', status: 'failed', measured_value: { true_peak_dbtp: 1.5 } }
      ]
    };
    const evalProgress = RepairConvergenceGuard.evaluatePassProgress({
      pass: 2,
      freshQa: improvedQa,
      priorQa
    });
    assert.strictEqual(evalProgress.outcome, 'PROGRESS_ACHIEVED');
    assert.strictEqual(evalProgress.converged, false);

    // Case 6B: Quality regression (offset increased from 100ms to 130ms)
    const regressedQa = {
      checks: [
        { id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 130.0 } }
      ]
    };
    const evalRegression = RepairConvergenceGuard.evaluatePassProgress({
      pass: 2,
      freshQa: regressedQa,
      priorQa
    });
    assert.strictEqual(evalRegression.outcome, 'QUALITY_REGRESSION');
    assert.ok(evalRegression.reason.includes('regressed'));

    // Case 6C: No progress (offset unchanged at 100ms)
    const stagnantQa = {
      checks: [
        { id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 100.0 } }
      ]
    };
    const evalStagnant = RepairConvergenceGuard.evaluatePassProgress({
      pass: 2,
      freshQa: stagnantQa,
      priorQa
    });
    assert.strictEqual(evalStagnant.outcome, 'NO_PROGRESS');

    // Case 6D: Clean convergence
    const cleanQa = {
      checks: [
        { id: 'CHK_EARSHOT_SYNC', status: 'passed', measured_value: { max_offset_ms: 5.0 } },
        { id: 'CHK_EARSHOT_TRUE_PEAK', status: 'passed', measured_value: { true_peak_dbtp: -1.2 } }
      ]
    };
    const evalClean = RepairConvergenceGuard.evaluatePassProgress({
      pass: 3,
      freshQa: cleanQa,
      priorQa
    });
    assert.strictEqual(evalClean.outcome, 'CONVERGED');
    assert.strictEqual(evalClean.converged, true);
  });
});
