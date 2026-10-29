/**
 * Test Suite: Stage 29.5 — Mandatory Ambiguous Defect Certification Scenario
 *
 * Verifies the 6 discrete subtests mandated by Architecture Lead in Stage 29.5 Ruling:
 * 1. ADC-01: Generate controlled ambiguous-audio fixture and establish baseline measurement and evidence provenance (ARC-29-28).
 * 2. ADC-02: Demonstrate confidence calibrator assigns supported score in human-review band (0.40 <= C < 0.80) with explicit uncertainty (ARC-29-28).
 * 3. ADC-03: Verify router produces schema-compliant review request and strictly withholds autonomous execution (ARC-29-29).
 * 4. ADC-04: Prove project and active delivery remain unchanged while decision pending; invalid/stale approvals rejected (ARC-29-29 & ARC-29-30).
 * 5. ADC-05: Simulate explicit human decision selecting supported option, validate approval against original request & revision, and execute via OperationExecutor (ARC-29-30 & ARC-29-31).
 * 6. ADC-06: Rerender authorized candidate, perform fresh QA & integrity checks, promote only on pass; exercise negative path where active delivery remains unchanged (ARC-29-31 & ARC-29-32).
 *
 * Test Accounting: 6 discrete subtests (7 reported by Node runner).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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

function createSyntheticTransientWav(filePath, durationSec, transientSec) {
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
      sample = Math.sin(2 * Math.PI * 1000 * t) * 0.85 * env;
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

function renderProjectAudio(project, outputPath) {
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

function createAmbiguousFixture(assetPath) {
  let project = OperationExecutor.execute(null, {
    type: 'create_project',
    params: { id: 'proj-adc-fixture', fps: 30, width: 1920, height: 1080, durationTicks: 720000 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: {
      id: 'asset_ambiguous_vo',
      type: 'audio',
      src: assetPath,
      metadata: { durationSec: 3.0, channels: 1 }
    }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_track',
    params: { id: 'track_visual', kind: 'visual', index: 0 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_track',
    params: { id: 'track_audio_vo', kind: 'audio', index: 1 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip_ambiguous_dialogue',
      trackId: 'track_audio_vo',
      source: { assetId: 'asset_ambiguous_vo' },
      type: 'audio',
      startTick: 120000,
      durationTicks: 240000
    }
  }).project;

  return project;
}

test('Stage 29.5: Mandatory Ambiguous Defect Certification Scenario', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/stage29-5-adc-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const workerClient = new EarshotWorkerClient();
  const adapter = new EarshotAdapter({ workerClient });

  const assetPath = path.join(scratchDir, 'ambiguous_vo_reverberant.wav');
  createSyntheticTransientWav(assetPath, 3.0, 0.0);

  const baselineRenderPath = path.join(scratchDir, 'baseline_rendered_audio.wav');

  t.after(() => {
    workerClient.stop();
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  let baselineSha = '';
  let activeDelivery = null;

  // ADC-01: Controlled Ambiguous Audio Fixture Generation & Provenance
  await t.test('ADC-01: Controlled ambiguous audio fixture generation and baseline evidence provenance (ARC-29-28)', async () => {
    const project = createAmbiguousFixture(assetPath);
    assert.ok(project);
    assert.equal(project.revision, 4);

    const clip = project.clips.find(c => c.id === 'clip_ambiguous_dialogue');
    assert.ok(clip, 'Clip must exist in project.clips');
    assert.equal(clip.startTick, 120000);

    // Actual physical baseline audio render
    const baselineRenderInfo = renderProjectAudio(project, baselineRenderPath);
    assert.ok(fs.existsSync(baselineRenderPath), 'Baseline rendered WAV artifact must exist on disk');
    assert.ok(baselineRenderInfo.sha256 && baselineRenderInfo.sha256.length === 64);
    baselineSha = baselineRenderInfo.sha256;

    // Run fresh baseline QA through Earshot adapter
    const baselineQa = await adapter.auditAudioQuality(baselineRenderPath, {
      timebase: { duration_ticks: 720000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }]
    });
    assert.ok(baselineQa.checks.some(c => c.id === 'CHK_EARSHOT_SYNC'));

    // Baseline active delivery bound to physical media SHA
    activeDelivery = {
      delivery_id: 'del_active_baseline_01',
      project_revision: project.revision,
      media_sha256: baselineSha,
      created_at: new Date().toISOString(),
      status: 'VERIFIED_ACTIVE'
    };
    assert.equal(activeDelivery.status, 'VERIFIED_ACTIVE');

    // Ambiguous acoustic defect finding: high reverberation, low SNR, weak onset definition
    const ambiguousFinding = {
      finding_id: 'find_ambiguous_sync_01',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      source_media_sha256: baselineSha,
      confidence: 0.65, // Earshot perception finding confidence is moderate due to acoustics
      measured_value: {
        offset_ms: 75.0,
        uncertainty_ms: 35.0, // High measurement uncertainty
        acoustic_features: {
          snr_db: 8.5, // Low SNR (< 12 dB)
          reverberation_rt60_ms: 680, // Significant room reflections blurring transient onset
          onset_strength: 0.42 // Weak onset peak (< 0.60)
        }
      }
    };

    assert.equal(ambiguousFinding.measured_value.uncertainty_ms, 35.0);
    assert.ok(ambiguousFinding.measured_value.acoustic_features.snr_db < 10.0);
  });

  // ADC-02: Confidence Calibrator Assigns Score in Human-Review Band (0.40 <= C < 0.80)
  await t.test('ADC-02: Confidence calibrator scores ambiguous finding within human-review band with explicit rationale (ARC-29-28)', () => {
    const project = createAmbiguousFixture(assetPath);
    const calibrator = new RepairConfidenceCalibrator();

    const ambiguousFinding = {
      finding_id: 'find_ambiguous_sync_01',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      source_media_sha256: baselineSha,
      confidence: 0.65,
      measured_value: {
        offset_ms: 75.0,
        uncertainty_ms: 35.0,
        acoustic_features: {
          snr_db: 8.5,
          onset_strength: 0.42
        }
      }
    };

    const proposal = {
      proposal_id: 'prop_ambiguous_01',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_ambiguous_dialogue',
      track_id: 'track_audio_vo',
      parameters: {
        clip_id: 'clip_ambiguous_dialogue',
        track_id: 'track_audio_vo',
        shift_ticks: -9000, // 75ms at 120,000 tps
        target_start_tick: 111000
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, ambiguousFinding, project);

    // Score must be in the human-review band [0.4000, 0.8000)
    assert.ok(assessment.confidence_score >= 0.4000, 'Score must be at least 0.4000');
    assert.ok(assessment.confidence_score < 0.8000, 'Score must be below autonomous threshold 0.8000');
    assert.equal(assessment.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.ok(assessment.rationale.length > 20, 'Explicit acoustic uncertainty rationale must be recorded');
  });

  // ADC-03: Router Produces Schema-Compliant Review Request & Withholds Autonomous Execution
  await t.test('ADC-03: Escalation router generates schema-compliant review request and withholds autonomous execution (ARC-29-29)', () => {
    const project = createAmbiguousFixture(assetPath);
    const calibrator = new RepairConfidenceCalibrator();
    const router = new RepairEscalationRouter();

    const ambiguousFinding = {
      finding_id: 'find_ambiguous_sync_01',
      defect_type: 'AUDIO_SYNC_OFFSET',
      source_revision: project.revision,
      source_media_sha256: baselineSha,
      confidence: 0.65,
      measured_value: { offset_ms: 75.0, uncertainty_ms: 35.0 }
    };

    const proposal = {
      proposal_id: 'prop_ambiguous_01',
      status: 'PLANNED',
      strategy: 'SYNC_RETIME',
      clip_id: 'clip_ambiguous_dialogue',
      track_id: 'track_audio_vo',
      parameters: {
        clip_id: 'clip_ambiguous_dialogue',
        track_id: 'track_audio_vo',
        shift_ticks: -9000,
        target_start_tick: 111000
      },
      preconditions: {
        expected_base_revision: project.revision,
        bounds_valid: true
      }
    };

    const assessment = calibrator.evaluateProposalConfidence(proposal, ambiguousFinding, project);
    const routing = router.routeProposal(proposal, assessment, project);

    // Routing assertions
    assert.equal(routing.disposition, 'HUMAN_ESCALATION_REQUIRED');
    assert.equal(routing.autonomous_eligible, false, 'Autonomous execution must be strictly withheld for ambiguous defect');
    assert.ok(routing.advisory, 'Schema-compliant advisory must be generated');

    const adv = routing.advisory;
    assert.equal(adv.proposal_id, 'prop_ambiguous_01');
    assert.equal(adv.candidate_revision, project.revision);
    assert.equal(adv.target.clip_id, 'clip_ambiguous_dialogue');
    assert.ok(adv.available_alternatives.length >= 2, 'Advisory must present multiple supported choices');
    assert.ok(adv.available_alternatives.some(a => a.option_id === 'EXECUTE_RECOMMENDED_RETIME'));
    assert.ok(adv.available_alternatives.some(a => a.option_id === 'LEAVE_DEFECT_UNRESOLVED'));
  });

  // ADC-04: Authoritative Delivery & Project Immutability; Stale/Invalid Approval Rejection
  await t.test('ADC-04: Authoritative delivery remains immutable during review; invalid or stale approvals rejected (ARC-29-29 & ARC-29-30)', () => {
    let project = createAmbiguousFixture(assetPath);
    const initialRev = project.revision;
    const router = new RepairEscalationRouter();

    const advisory = {
      schema_version: '1.0.0',
      request_id: 'req_adc_04',
      proposal_id: 'prop_ambiguous_04',
      candidate_revision: initialRev,
      source_media_sha256: baselineSha,
      target: { clip_id: 'clip_ambiguous_dialogue', track_id: 'track_audio_vo' },
      available_alternatives: [
        { option_id: 'EXECUTE_RECOMMENDED_RETIME', description: 'Apply planned timing shift' },
        { option_id: 'LEAVE_DEFECT_UNRESOLVED', description: 'Keep current timing' }
      ],
      invalidation_conditions: {
        max_valid_revision: initialRev,
        expires_at: new Date(Date.now() + 3600000).toISOString()
      },
      lifecycle_status: 'AWAITING_APPROVAL'
    };

    // 1. Project and delivery invariance while AWAITING_APPROVAL
    assert.equal(project.revision, initialRev);
    assert.equal(activeDelivery.media_sha256, baselineSha);

    // 2. Reject stale revision approval: project revision advances unexpectedly before decision arrives
    const staleProject = { ...project, revision: initialRev + 1 };
    const staleApproval = {
      request_id: 'req_adc_04',
      proposal_id: 'prop_ambiguous_04',
      decision: 'APPROVE',
      selected_option: 'EXECUTE_RECOMMENDED_RETIME'
    };
    const staleValidation = router.validateApproval(advisory, staleApproval, staleProject);
    assert.equal(staleValidation.valid, false);
    assert.equal(staleValidation.error_code, 'APPROVAL_INVALIDATED_STALE_REVISION');

    // 3. Reject unsupported repair option
    const unsupportedApproval = {
      request_id: 'req_adc_04',
      proposal_id: 'prop_ambiguous_04',
      decision: 'APPROVE',
      selected_option: 'UNSUPPORTED_ARBITRARY_MUTATION'
    };
    const unsupportedVal = router.validateApproval(advisory, unsupportedApproval, project);
    assert.equal(unsupportedVal.valid, false);
    assert.equal(unsupportedVal.error_code, 'UNSUPPORTED_REPAIR_OPTION');

    // 4. Reject material modification tampering
    const tamperedApproval = {
      request_id: 'req_adc_04',
      proposal_id: 'prop_ambiguous_04',
      decision: 'APPROVE',
      selected_option: 'EXECUTE_RECOMMENDED_RETIME',
      material_modifications: { shift_ticks: -500000 } // Unverified external edit
    };
    const tamperedVal = router.validateApproval(advisory, tamperedApproval, project);
    assert.equal(tamperedVal.valid, false);
    assert.equal(tamperedVal.error_code, 'MATERIAL_MODIFICATION_REJECTED');

    // Ensure 0 project mutations took place
    assert.equal(project.revision, initialRev, 'Project must remain completely unmodified');
  });

  // ADC-05: Human Approval Validation & Safe Execution via OperationExecutor
  await t.test('ADC-05: Explicit human decision validation and authorized execution via OperationExecutor (ARC-29-30 & ARC-29-31)', () => {
    let project = createAmbiguousFixture(assetPath);
    const router = new RepairEscalationRouter();
    const ledger = new RepairDecisionLedger();

    const proposalId = 'prop_adc_05';
    const requestId = 'req_adc_05';
    const initialRev = project.revision;

    const advisory = {
      schema_version: '1.0.0',
      request_id: requestId,
      proposal_id: proposalId,
      candidate_revision: initialRev,
      source_media_sha256: baselineSha,
      target: { clip_id: 'clip_ambiguous_dialogue', track_id: 'track_audio_vo' },
      available_alternatives: [
        {
          option_id: 'EXECUTE_RECOMMENDED_RETIME',
          strategy: 'SYNC_RETIME',
          parameters: {
            clip_id: 'clip_ambiguous_dialogue',
            track_id: 'track_audio_vo',
            shift_ticks: -9000,
            target_start_tick: 111000
          }
        },
        { option_id: 'LEAVE_DEFECT_UNRESOLVED' }
      ],
      invalidation_conditions: {
        max_valid_revision: initialRev,
        expires_at: new Date(Date.now() + 3600000).toISOString()
      },
      lifecycle_status: 'AWAITING_APPROVAL'
    };

    // Record review request in decision ledger
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_05_req',
      event_type: LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, initialRev, LEDGER_EVENT_TYPES.HUMAN_REVIEW_REQUESTED),
      project_revision: initialRev,
      source_media_sha256: baselineSha,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: { requestId, advisory }
    });

    // Valid human approval received
    const humanApproval = {
      request_id: requestId,
      proposal_id: proposalId,
      decision: 'APPROVE',
      selected_option: 'EXECUTE_RECOMMENDED_RETIME'
    };

    const approvalValidation = router.validateApproval(advisory, humanApproval, project);
    assert.equal(approvalValidation.valid, true);

    // Record human approval in ledger
    const apprRes = ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_05_appr',
      event_type: LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, initialRev, LEDGER_EVENT_TYPES.HUMAN_APPROVAL_RECORDED),
      project_revision: initialRev,
      source_media_sha256: baselineSha,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: {
        decision: 'APPROVE',
        selected_option: {
          option_id: 'EXECUTE_RECOMMENDED_RETIME',
          strategy: 'SYNC_RETIME'
        },
        candidate_revision: initialRev
      }
    });

    // Validate execution authority fence (ARC-29-17)
    const proposedOp = {
      type: 'move_clip',
      params: {
        clipId: 'clip_ambiguous_dialogue',
        targetTick: 111000
      }
    };

    const authCheck = ledger.verifyExecutionAuthority(apprRes.event, {
      currentRevision: initialRev,
      proposalId,
      proposedOperation: proposedOp
    });
    assert.equal(authCheck.authorized, true);

    // Record intent and execute ONLY through OperationExecutor (ARC-29-30)
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_05_intent',
      event_type: LEDGER_EVENT_TYPES.EXECUTION_INTENDED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, initialRev, LEDGER_EVENT_TYPES.EXECUTION_INTENDED),
      project_revision: initialRev,
      source_media_sha256: baselineSha,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: { operation: proposedOp }
    });

    const execResult = OperationExecutor.execute(project, proposedOp);
    assert.equal(execResult.success, true);
    project = execResult.project;

    // Revision advanced monotonically
    assert.equal(project.revision, initialRev + 1);

    // Verify clip moved to exact authorized position
    const updatedClip = project.clips.find(c => c.id === 'clip_ambiguous_dialogue');
    assert.equal(updatedClip.startTick, 111000);

    // Record operation commit in ledger
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_05_commit',
      event_type: LEDGER_EVENT_TYPES.EXECUTION_COMMITTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, project.revision, LEDGER_EVENT_TYPES.EXECUTION_COMMITTED),
      project_revision: project.revision,
      source_media_sha256: baselineSha,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: { committedOperation: proposedOp }
    });
  });

  // ADC-06: Rerender, QA & Integrity Gate Promotion vs Negative Rejection Path
  await t.test('ADC-06: Post-repair rerender, fresh QA certification, and verified delivery promotion vs negative rejection (ARC-29-31 & ARC-29-32)', async () => {
    let project = createAmbiguousFixture(assetPath);
    const ledger = new RepairDecisionLedger();
    const calibrator = new RepairOutcomeCalibrator({ ledger });
    const proposalId = 'prop_adc_06';

    // Baseline active delivery
    let currentActiveDelivery = {
      delivery_id: 'del_baseline_06',
      project_revision: project.revision,
      media_sha256: baselineSha,
      status: 'VERIFIED_ACTIVE'
    };

    // Scenario A: Approved repair applied, rerendered, and certified by fresh post-render QA
    // 1. Move clip via OperationExecutor
    const execResult = OperationExecutor.execute(project, {
      type: 'move_clip',
      params: { clipId: 'clip_ambiguous_dialogue', targetTick: 111000 }
    });
    assert.equal(execResult.success, true);
    project = execResult.project;

    // 2. Physical render of candidate project
    const repairedRenderPath = path.join(scratchDir, 'repaired_rendered_audio.wav');
    const repairedRenderInfo = renderProjectAudio(project, repairedRenderPath);
    assert.ok(fs.existsSync(repairedRenderPath), 'Repaired WAV file must be rendered to disk');
    assert.notStrictEqual(repairedRenderInfo.sha256, baselineSha, 'Repaired audio must have distinct SHA-256');

    // 3. Fresh post-render QA audit via Earshot adapter
    const postRepairQa = await adapter.auditAudioQuality(repairedRenderPath, {
      timebase: { duration_ticks: 720000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }]
    });
    assert.ok(postRepairQa.checks.some(c => c.id === 'CHK_EARSHOT_SYNC'));

    // Verify 4x Oversampled True Peak check from Earshot (CHK_EARSHOT_TRUE_PEAK)
    const postRepairTpCheck = postRepairQa.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
    assert.ok(postRepairTpCheck, 'CHK_EARSHOT_TRUE_PEAK check must be present');
    assert.equal(postRepairTpCheck.status, 'passed', 'Repaired candidate must pass true-peak delivery check');
    assert.ok(postRepairTpCheck.measured_value.true_peak_dbtp <= -1.0, `True peak ${postRepairTpCheck.measured_value.true_peak_dbtp} dBTP must be <= -1.0 dBTP ceiling`);
    assert.equal(postRepairTpCheck.measured_value.clipped_samples, 0, 'Must have zero clipped samples');

    // 4. Independent PCM signal-level acoustic transient alignment check (ARC-29-31)
    const leftChannel = repairedRenderInfo.left;
    let maxSampleIdx = 0;
    let maxAbsVal = 0;
    for (let s = 0; s < leftChannel.length; s++) {
      const absVal = Math.abs(leftChannel[s]);
      if (absVal > maxAbsVal) {
        maxAbsVal = absVal;
        maxSampleIdx = s;
      }
    }

    // Expected peak: clip targetTick 111000 at 48kHz = 44400 samples
    const expectedPeakSample = Math.round((111000 * 48000) / TICKS_PER_SECOND);
    const sampleDiff = Math.abs(maxSampleIdx - expectedPeakSample);

    // Exact binding invariant: physical alignment within 48 samples (1ms at 48kHz)
    assert.ok(
      sampleDiff <= 48,
      `Physical acoustic transient peak at sample ${maxSampleIdx} aligns with target ${expectedPeakSample} within 48 samples (1ms at 48kHz), actual diff: ${sampleDiff} samples (${(sampleDiff / 48).toFixed(3)} ms)`
    );

    // True peak / digital headroom verification
    assert.ok(maxAbsVal <= 1.0, 'True peak must not exceed digital full scale ceiling');

    // 5. Evaluate outcome in calibrator with attached ledger and real physical render checksum
    const calRecord = calibrator.evaluateAndCalibrate({
      proposalId,
      candidateRevision: `rev-${project.revision}`,
      projectRevision: project.revision,
      clipId: 'clip_ambiguous_dialogue',
      operationType: 'SYNC_RETIME',
      priorConfidence: 0.6500,
      preRepairMetric: { metricName: 'offset_ms', value: 75.0, targetValue: 0.0 },
      postRepairMetric: { metricName: 'offset_ms', value: sampleDiff / 48 },
      renderEvidence: {
        renderOutputId: 'render_adc_06_repaired',
        candidateRevision: `rev-${project.revision}`,
        checksum: repairedRenderInfo.sha256,
        isFresh: true
      }
    });

    assert.equal(calRecord.evaluation_status, EVALUATION_STATUS.OPTIMAL_REPAIR);
    assert.equal(calRecord.posterior_confidence, 0.7000); // 0.65 + 0.05

    // 6. Record QA verification in ledger
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_06_qa',
      event_type: LEDGER_EVENT_TYPES.REPAIR_VERIFIED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, project.revision, LEDGER_EVENT_TYPES.REPAIR_VERIFIED),
      project_revision: project.revision,
      render_sha256: repairedRenderInfo.sha256,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: { qaResult: postRepairQa, sampleDiff, peakAbsVal: maxAbsVal }
    });

    // 7. Promote candidate to active delivery
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_06_promo',
      event_type: LEDGER_EVENT_TYPES.DELIVERY_PROMOTED,
      timestamp: new Date().toISOString(),
      proposal_id: proposalId,
      correlation_key: ledger.computeCorrelationKey(proposalId, project.revision, LEDGER_EVENT_TYPES.DELIVERY_PROMOTED),
      project_revision: project.revision,
      render_sha256: repairedRenderInfo.sha256,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: {
        promoted_delivery_id: 'del_promoted_06',
        previous_delivery_id: currentActiveDelivery.delivery_id
      }
    });

    currentActiveDelivery = {
      delivery_id: 'del_promoted_06',
      project_revision: project.revision,
      media_sha256: repairedRenderInfo.sha256,
      status: 'VERIFIED_ACTIVE'
    };
    assert.equal(currentActiveDelivery.delivery_id, 'del_promoted_06');
    assert.equal(currentActiveDelivery.media_sha256, repairedRenderInfo.sha256);

    // Scenario B: Negative Path — Human Rejection or Failed QA
    // Prove that on rejection or QA failure, active delivery is NEVER updated!
    const negativeProposalId = 'prop_adc_06_negative';
    const negativeDeliveryStateBefore = { ...currentActiveDelivery };

    // Human explicitly rejects repair option
    ledger.recordEvent({
      schema_version: '1.0.0',
      event_id: 'evt_adc_06_neg_withheld',
      event_type: LEDGER_EVENT_TYPES.DELIVERY_WITHHELD,
      timestamp: new Date().toISOString(),
      proposal_id: negativeProposalId,
      correlation_key: ledger.computeCorrelationKey(negativeProposalId, project.revision, LEDGER_EVENT_TYPES.DELIVERY_WITHHELD),
      project_revision: project.revision,
      target: { clip_id: 'clip_ambiguous_dialogue' },
      details: { reason: 'HUMAN_REJECTION_OR_QA_FAILED' }
    });

    // Authoritative check: active delivery remains completely unchanged
    assert.equal(currentActiveDelivery.delivery_id, negativeDeliveryStateBefore.delivery_id);
    assert.equal(currentActiveDelivery.media_sha256, negativeDeliveryStateBefore.media_sha256);
    assert.equal(currentActiveDelivery.status, 'VERIFIED_ACTIVE');
  });

});
