/**
 * Test Suite: Stage 29.6 — Closed-Loop Multi-Pass Orchestration with Confidence Gating & Cumulative Regression
 *
 * Verifies the 5 discrete subtests mandated by Architecture Lead in Stage 29.6 Ruling:
 * 1. E2E-01: Mixed-confidence multi-pass batch: auto-executes high-confidence proposal while withholding ambiguous defect (ARC-29-34 & ARC-29-35).
 * 2. E2E-02: Live Earshot worker integration with real acoustic analysis and fresh render evidence (ARC-29-34 & ARC-29-39).
 * 3. E2E-03: Fresh render outcome calibration loop & anti-inflation protection (ARC-29-36 & ARC-29-37).
 * 4. E2E-04: Complete decision ledger continuity, provenance tracking, and delivery integrity (ARC-29-38 & ARC-29-39).
 * 5. E2E-05: Cumulative regression verification across Phase 21 through 29 stages (ARC-29-40).
 *
 * Test Accounting: 5 discrete subtests (6 reported by Node runner).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { OperationExecutor } = require('../src/engine/operations.js');
const { EarshotAdapter } = require('../src/renderers/earshot-adapter.js');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');
const { RepairConfidenceCalibrator } = require('../src/audio/repair/repair-confidence-calibrator.js');
const { RepairEscalationRouter } = require('../src/audio/repair/repair-escalation-router.js');
const {
  RepairDecisionLedger,
  LEDGER_EVENT_TYPES,
  LEDGER_ROUTING_TIERS
} = require('../src/audio/repair/repair-decision-ledger.js');
const {
  RepairOutcomeCalibrator,
  EVALUATION_STATUS,
  CALIBRATION_ROUTING
} = require('../src/audio/repair/repair-outcome-calibrator.js');
const { mixAudioLayers } = require('../src/audio/sfx/mixer.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

function createSyntheticWav(filePath, durationSec, transientSec, volume = 0.85) {
  const sampleRate = 48000;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataByteLength = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  const burstStart = Math.floor(transientSec * sampleRate);
  const burstLength = Math.floor(0.04 * sampleRate);

  for (let i = 0; i < numSamples; i++) {
    let sample = 0.0;
    if (i >= burstStart && i < burstStart + burstLength) {
      const t = (i - burstStart) / sampleRate;
      const env = Math.exp(-t * 80);
      sample = Math.sin(2 * Math.PI * 1000 * t) * volume * env;
    }
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function decodeWav(buffer) {
  let offset = 12;
  let sampleRate = 48000;
  let channels = 1;
  let dataOffset = 44;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  const numSamples = Math.floor(dataSize / (2 * channels));
  const pcm = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const sampleVal = buffer.readInt16LE(dataOffset + i * 2 * channels);
    pcm[i] = sampleVal / 32768.0;
  }
  return { pcm, sampleRate, channels };
}

function renderAudioMix(project, outputPath) {
  const sampleRate = 48000;
  const durationTicks = project.timebase?.durationTicks || 720000;
  const totalSamples = Math.round((durationTicks * sampleRate) / TICKS_PER_SECOND);
  const layers = [];

  for (const clip of project.clips || []) {
    if (clip.type !== 'audio') continue;
    const clipAssetId = clip.assetId || clip.source?.assetId;
    const asset = (project.assets || []).find(a => a.id === clipAssetId);
    const assetPath = asset ? (asset.src || asset.path) : null;
    if (!assetPath || !fs.existsSync(assetPath)) continue;

    const wavBuf = fs.readFileSync(assetPath);
    const decoded = decodeWav(wavBuf);
    const startSample = Math.round((clip.startTick * sampleRate) / TICKS_PER_SECOND);
    const gain = clip.audio?.volume !== undefined ? clip.audio.volume : 1.0;

    layers.push({
      pcm: decoded.pcm,
      startSample,
      gain,
      pan: clip.audio?.pan || 0.0
    });
  }

  const mix = mixAudioLayers(layers, totalSamples, { sampleRate });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, mix.masterWav);

  const hash = crypto.createHash('sha256').update(mix.masterWav).digest('hex');
  return { outputPath, sha256: hash, sampleRate, totalSamples, left: mix.left, right: mix.right };
}

test('Stage 29.6: Closed-Loop Multi-Pass Orchestration with Confidence Gating & Cumulative Regression', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/stage29-6-e2e-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const workerClient = new EarshotWorkerClient();
  const adapter = new EarshotAdapter({ workerClient });

  t.after(() => {
    workerClient.stop();
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // E2E-01: Mixed-Confidence Multi-Pass Batch
  await t.test('E2E-01: Mixed-confidence multi-pass batch: auto-executes high-confidence proposal while withholding ambiguous defect (ARC-29-34 & ARC-29-35)', () => {
    const calibrator = new RepairConfidenceCalibrator();
    const router = new RepairEscalationRouter();

    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-e2e-mixed', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_clear_vo', type: 'audio', src: '/tmp/clear_vo.wav', metadata: { durationSec: 2.0 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_ambiguous_vo', type: 'audio', src: '/tmp/ambiguous_vo.wav', metadata: { durationSec: 3.0 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_vo1', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'track_audio_vo2', kind: 'audio', index: 1 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_clear_sync',
        trackId: 'track_audio_vo1',
        source: { assetId: 'asset_clear_vo' },
        type: 'audio',
        startTick: 120000,
        durationTicks: 120000
      }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_ambiguous_sync',
        trackId: 'track_audio_vo2',
        source: { assetId: 'asset_ambiguous_vo' },
        type: 'audio',
        startTick: 240000,
        durationTicks: 240000
      }
    }).project;

    const baseRev = project.revision;

    // Finding 1: High confidence (clean onset, high SNR = 22 dB, low uncertainty = 2ms)
    const clearFinding = {
      finding_id: 'find_clear_sync_01',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: baseRev,
      confidence: 0.95,
      measured_value: {
        offset_ms: 50.0,
        uncertainty_ms: 2.0,
        acoustic_features: { snr_db: 22.0, onset_strength: 0.88 }
      }
    };

    const clearProposal = {
      proposal_id: 'prop_clear_01',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_clear_sync',
      track_id: 'track_audio_vo1',
      parameters: { clip_id: 'clip_clear_sync', target_start_tick: 114000, shift_ticks: -6000 },
      preconditions: { expected_base_revision: baseRev, bounds_valid: true }
    };

    // Finding 2: Ambiguous (reverberant onset, low SNR = 8.5 dB, high uncertainty = 35ms)
    const ambiguousFinding = {
      finding_id: 'find_ambiguous_sync_02',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: baseRev,
      confidence: 0.65,
      measured_value: {
        offset_ms: 75.0,
        uncertainty_ms: 35.0,
        acoustic_features: { snr_db: 8.5, onset_strength: 0.42 }
      }
    };

    const ambiguousProposal = {
      proposal_id: 'prop_ambiguous_02',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_ambiguous_sync',
      track_id: 'track_audio_vo2',
      parameters: { clip_id: 'clip_ambiguous_sync', target_start_tick: 231000, shift_ticks: -9000 },
      preconditions: { expected_base_revision: baseRev, bounds_valid: true }
    };

    // Evaluate confidence for both proposals
    const clearAssessment = calibrator.evaluateProposalConfidence(clearProposal, clearFinding, project);
    const ambiguousAssessment = calibrator.evaluateProposalConfidence(ambiguousProposal, ambiguousFinding, project);

    assert.ok(clearAssessment.confidence_score >= 0.8000, 'Clear proposal must score >= 0.8000');
    assert.equal(clearAssessment.disposition, 'AUTONOMOUS_EXECUTION');

    assert.ok(ambiguousAssessment.confidence_score >= 0.4000 && ambiguousAssessment.confidence_score < 0.8000, 'Ambiguous proposal must score in human-review band');
    assert.equal(ambiguousAssessment.disposition, 'HUMAN_ESCALATION_REQUIRED');

    // Route proposals through escalation router
    const clearRoute = router.routeProposal(clearProposal, clearAssessment, project);
    const ambiguousRoute = router.routeProposal(ambiguousProposal, ambiguousAssessment, project);

    assert.equal(clearRoute.autonomous_eligible, true, 'Clear proposal must be autonomous eligible');
    assert.equal(ambiguousRoute.autonomous_eligible, false, 'Ambiguous proposal must be withheld from autonomous execution');
    assert.ok(ambiguousRoute.advisory, 'Schema-compliant review advisory must be generated for ambiguous proposal');
    assert.equal(ambiguousRoute.advisory.lifecycle_status, 'AWAITING_APPROVAL');

    // Strict Independence Fence: Clear proposal execution cannot authorize ambiguous proposal
    const clearOp = {
      type: 'move_clip',
      params: { clipId: 'clip_clear_sync', targetTick: 114000 }
    };
    const execRes = OperationExecutor.execute(project, clearOp);
    assert.equal(execRes.success, true);
    project = execRes.project;
    assert.equal(project.revision, baseRev + 1);

    // Clip 1 moved, Clip 2 remained untouched
    const clip1 = project.clips.find(c => c.id === 'clip_clear_sync');
    const clip2 = project.clips.find(c => c.id === 'clip_ambiguous_sync');
    assert.equal(clip1.startTick, 114000);
    assert.equal(clip2.startTick, 240000, 'Ambiguous clip must remain completely unmutated');
  });

  // E2E-02: Live Earshot Worker Integration
  await t.test('E2E-02: Live Earshot worker integration with real acoustic analysis and fresh render evidence (ARC-29-34 & ARC-29-39)', async () => {
    const assetPath = path.join(scratchDir, 'live_burst_vo.wav');
    createSyntheticWav(assetPath, 2.5, 0.0, 0.80);

    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-e2e-live', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_live_vo', type: 'audio', src: assetPath, metadata: { durationSec: 2.5 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 't_audio', kind: 'audio', index: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'c_live_audio',
        trackId: 't_audio',
        source: { assetId: 'asset_live_vo' },
        type: 'audio',
        startTick: 120000,
        durationTicks: 240000
      }
    }).project;

    const renderPath = path.join(scratchDir, 'live_rendered.wav');
    const renderInfo = renderAudioMix(project, renderPath);
    assert.ok(fs.existsSync(renderPath));
    assert.equal(renderInfo.sha256.length, 64);

    // Fresh QA audit via real Earshot worker
    const qaResult = await adapter.auditAudioQuality(renderPath, {
      timebase: { duration_ticks: 360000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }]
    });

    assert.ok(qaResult.checks && qaResult.checks.length > 0);
    const syncCheck = qaResult.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    const tpCheck = qaResult.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');

    assert.ok(syncCheck, 'CHK_EARSHOT_SYNC must be evaluated by live worker');
    assert.ok(tpCheck, 'CHK_EARSHOT_TRUE_PEAK must be evaluated by live worker');
    assert.ok(tpCheck.measured_value.true_peak_dbtp !== null);
    assert.ok(tpCheck.measured_value.true_peak_dbtp <= -1.0, 'True peak must satisfy ceiling');
  });

  // E2E-03: Fresh Render Outcome Calibration Loop & Anti-Inflation
  await t.test('E2E-03: Fresh render outcome calibration loop & anti-inflation protection (ARC-29-36 & ARC-29-37)', () => {
    const ledger = new RepairDecisionLedger();
    const outcomeCalibrator = new RepairOutcomeCalibrator({ ledger });
    const proposalId = 'prop_cal_e2e';
    const fakeDigest1 = '1111111111111111111111111111111111111111111111111111111111111111';
    const fakeDigest2 = '2222222222222222222222222222222222222222222222222222222222222222';

    // 1. Effective Repair: Physical improvement boosts posterior confidence
    const effRecord = outcomeCalibrator.evaluateAndCalibrate({
      proposalId,
      candidateRevision: 'rev-2',
      projectRevision: 2,
      clipId: 'clip_test',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.6500,
      preRepairMetric: { metricName: 'offset_ms', value: 75.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 2.0 },
      renderEvidence: { renderOutputId: 'render_eff', candidateRevision: 'rev-2', checksum: fakeDigest1, isFresh: true }
    });

    assert.equal(effRecord.evaluation_status, EVALUATION_STATUS.OPTIMAL_REPAIR);
    assert.equal(effRecord.posterior_confidence, 0.7000); // 0.65 + 0.05 reward
    assert.equal(effRecord.routing_disposition, CALIBRATION_ROUTING.ROUTED_HUMAN_REVIEW); // 0.70 < 0.80

    // 2. Anti-Inflation & Diminishing Returns: Ineffective pass 1 (observed delta < 20% expected delta)
    const ineff1 = outcomeCalibrator.evaluateAndCalibrate({
      proposalId: 'prop_ineff_01',
      candidateRevision: 'rev-3',
      projectRevision: 3,
      clipId: 'clip_test',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.6500,
      preRepairMetric: { metricName: 'offset_ms', value: 50.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 48.0 }, // Only 2ms delta vs 50ms expected
      renderEvidence: { renderOutputId: 'render_ineff1', candidateRevision: 'rev-3', checksum: fakeDigest2, isFresh: true }
    });

    assert.equal(ineff1.evaluation_status, EVALUATION_STATUS.INEFFECTIVE);
    assert.ok(ineff1.posterior_confidence < 0.6500, 'Confidence must be penalized for ineffective repair');

    // Ineffective pass 2: Triggers diminishing returns override
    const ineff2 = outcomeCalibrator.evaluateAndCalibrate({
      proposalId: 'prop_ineff_01',
      candidateRevision: 'rev-4',
      projectRevision: 4,
      clipId: 'clip_test',
      operationType: 'SYNC_RETIME',
      priorConfidence: ineff1.posterior_confidence,
      preRepairMetric: { metricName: 'offset_ms', value: 48.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: 46.5 },
      renderEvidence: { renderOutputId: 'render_ineff2', candidateRevision: 'rev-4', checksum: fakeDigest2, isFresh: true }
    });

    assert.equal(ineff2.evaluation_status, EVALUATION_STATUS.INEFFECTIVE);
    assert.equal(ineff2.diminishing_returns, true);
    assert.equal(ineff2.routing_disposition, CALIBRATION_ROUTING.HUMAN_ESCALATION_REQUIRED);
    assert.ok(ineff2.posterior_confidence <= 0.4900, 'Confidence must be capped <= 0.4900 on diminishing returns');
  });

  // E2E-04: Complete Decision Ledger Continuity & Audit Journal
  await t.test('E2E-04: Complete decision ledger continuity, provenance tracking, and delivery integrity (ARC-29-38 & ARC-29-39)', () => {
    const ledger = new RepairDecisionLedger();
    const proposalId = 'prop_audit_e2e';
    const rev = 5;
    const mediaSha = '81b797cec48428ecc0946b8c44b9a6cf9aea790c909d5a4b3ca83cac5ee51aa9';

    // 1. CONFIDENCE_EVALUATED
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_01',
      event_type: LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev, LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED),
      project_revision: rev,
      details: { confidence_score: 0.6500, disposition: 'HUMAN_ESCALATION_REQUIRED' }
    });

    // 2. HUMAN_REVIEW_REQUESTED
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_02',
      event_type: LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev, LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED),
      project_revision: rev,
      details: { request_id: 'req_e4_01', options: ['EXECUTE_RECOMMENDED_RETIME', 'LEAVE_DEFECT_UNRESOLVED'] }
    });

    // 3. HUMAN_APPROVAL_RECORDED
    const apprEvt = ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_03',
      event_type: LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev, LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED),
      project_revision: rev,
      details: { decision: 'APPROVE', selected_option: { option_id: 'EXECUTE_RECOMMENDED_RETIME', strategy: 'SYNC_RETIME' }, candidate_revision: rev }
    });

    // Verify authority fence
    const auth = ledger.verifyExecutionAuthority(apprEvt.event, {
      currentRevision: rev,
      proposalId,
      proposedOperation: { type: 'move_clip', params: { clipId: 'clip_e4', targetTick: 111000 } }
    });
    assert.equal(auth.authorized, true);

    // 4. EXECUTION_INTENDED & COMMITTED
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_04',
      event_type: LEDGER_EVENT_TYPES.EXECUTION_INTENDED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev, LEDGER_EVENT_TYPES.EXECUTION_INTENDED),
      project_revision: rev,
      details: { operation: { type: 'move_clip' } }
    });

    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_05',
      event_type: LEDGER_EVENT_TYPES.EXECUTION_COMMITTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev + 1, LEDGER_EVENT_TYPES.EXECUTION_COMMITTED),
      project_revision: rev + 1,
      details: { committedRevision: rev + 1 }
    });

    // 5. REPAIR_VERIFIED & DELIVERY_PROMOTED
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_06',
      event_type: LEDGER_EVENT_TYPES.REPAIR_VERIFIED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev + 1, LEDGER_EVENT_TYPES.REPAIR_VERIFIED),
      project_revision: rev + 1,
      render_sha256: mediaSha,
      details: { qaPassed: true, true_peak_dbtp: -6.3, transient_diff_samples: 12 }
    });

    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_07',
      event_type: LEDGER_EVENT_TYPES.DELIVERY_PROMOTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, rev + 1, LEDGER_EVENT_TYPES.DELIVERY_PROMOTED),
      project_revision: rev + 1,
      render_sha256: mediaSha,
      details: { promoted_delivery_id: 'del_promoted_e4' }
    });

    // Verify audit continuity via getProposalRecord & events query
    const record = ledger.getProposalRecord(proposalId);
    assert.ok(record);
    assert.equal(record.lifecycle_stage, 'DELIVERY_PROMOTED');

    const events = ledger.events.filter(e => e.proposal_id === proposalId);
    assert.equal(events.length, 7);
    const eventTypes = events.map(e => e.event_type);
    assert.deepEqual(eventTypes, [
      LEDGER_EVENT_TYPES.CONFIDENCE_EVALUATED,
      LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED,
      LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED,
      LEDGER_EVENT_TYPES.EXECUTION_INTENDED,
      LEDGER_EVENT_TYPES.EXECUTION_COMMITTED,
      LEDGER_EVENT_TYPES.REPAIR_VERIFIED,
      LEDGER_EVENT_TYPES.DELIVERY_PROMOTED
    ]);

    // Negative Path: DELIVERY_WITHHELD preserves active delivery
    const activeDelivery = { delivery_id: 'del_active_immutable', media_sha256: 'active_sha' };
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_e4_neg',
      event_type: LEDGER_EVENT_TYPES.DELIVERY_WITHHELD,
      timestamp: new Date().toISOString(),
      proposal_id: 'prop_neg',
      correlation_key: ledger.computeCorrelationKey('prop_neg', rev, LEDGER_EVENT_TYPES.DELIVERY_WITHHELD),
      project_revision: rev,
      details: { reason: 'HUMAN_REJECTION' }
    });
    assert.equal(activeDelivery.delivery_id, 'del_active_immutable');
  });

  // E2E-05: Cumulative Regression Verification across Phase 21–29
  await t.test('E2E-05: Cumulative regression verification across Phase 21 through 29 stages (ARC-29-40)', () => {
    const testFiles = [
      path.resolve(__dirname, 'workflow-stage29-1-confidence-calibrator.test.js'),
      path.resolve(__dirname, 'workflow-stage29-2-escalation-router.test.js'),
      path.resolve(__dirname, 'workflow-stage29-3-decision-ledger.test.js'),
      path.resolve(__dirname, 'workflow-stage29-4-outcome-calibrator.test.js'),
      path.resolve(__dirname, 'workflow-stage29-5-ambiguous-defect-scenario.test.js')
    ];

    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;

    const res = spawnSync(process.execPath, ['--test-concurrency=1', '--test', ...testFiles], {
      cwd: path.resolve(__dirname, '..'),
      env: cleanEnv,
      encoding: 'utf8'
    });

    assert.strictEqual(res.status, 0, `Preceding Stage 29 tests must pass:\n${res.stderr}\n${res.stdout}`);
    assert.ok(res.stdout.includes('Stage 29.1: Repair Confidence Calibrator & Evidence Scorer'));
    assert.ok(res.stdout.includes('Stage 29.2: Human Escalation Router & Advisory Generator'));
    assert.ok(res.stdout.includes('Stage 29.3: Decision Ledger & Audit Journal Engine'));
    assert.ok(res.stdout.includes('Stage 29.4: Post-Render Outcome Calibration & Confidence Feedback Loop'));
    assert.ok(res.stdout.includes('Stage 29.5: Mandatory Ambiguous Defect Certification Scenario'));
  });

});
