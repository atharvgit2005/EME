/**
 * Test Suite: Stage 27.3 — Deterministic Controlled Audio-Sync Defect Scenario
 *
 * Verifies (ARC-27-04 & ARC-27-07):
 * 1. SYN-01: Calibrated synthetic audio fixture generation and initial render.
 * 2. SYN-02: Initial Earshot QA audit measures +150ms desync defect.
 * 3. SYN-03: Finding ingestion binds source project revision and media evidence.
 * 4. SYN-04: AudioRepairPlanner formulates exact -18,000 tick SYNC_RETIME proposal.
 * 5. SYN-05: Canonical move_clip execution via OperationExecutor advances revision.
 * 6. SYN-06: Rerender, closed-loop Earshot QA certification, and acoustic transient alignment.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { OperationExecutor } = require('../src/engine/operations.js');
const { EarshotAdapter } = require('../src/renderers/earshot-adapter.js');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');
const { AudioRepairPlanner } = require('../src/audio/repair/audio-repair-planner.js');
const { RepairOperationCompiler } = require('../src/audio/repair/repair-operation-compiler.js');
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
  const durationTicks = project.timebase?.durationTicks || 360000;
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

test('Stage 27.3: Deterministic Controlled Audio-Sync Defect Scenario (ARC-27-04 & ARC-27-07)', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/stage27-3-sync-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const workerClient = new EarshotWorkerClient();
  const adapter = new EarshotAdapter({ workerClient });

  t.after(() => {
    workerClient.stop();
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // Shared state across sequential step assertions
  let project;
  let initialRenderPath;
  let initialRenderInfo;
  let initialQa;
  let syncFinding;
  let proposal;
  let execResult;
  let repairedRenderPath;
  let repairedRenderInfo;

  await t.test('SYN-01: Calibrated synthetic audio fixture generation and initial render', async () => {
    const transientAssetPath = path.join(scratchDir, 'burst_sound.wav');
    createSyntheticTransientWav(transientAssetPath, 0.4, 0.0);

    project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-sync-repair-e2e', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_burst', type: 'audio', src: transientAssetPath, metadata: { durationSec: 0.4 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'v1', kind: 'visual', zIndex: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'a1', kind: 'audio', zIndex: 1 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'clip_visual_1', trackId: 'v1', type: 'video', startTick: 0, durationTicks: 120000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'clip_visual_2', trackId: 'v1', type: 'video', startTick: 120000, durationTicks: 240000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'clip_sfx_transient',
        trackId: 'a1',
        source: { assetId: 'asset_burst' },
        type: 'audio',
        startTick: 138000,
        durationTicks: 48000
      }
    }).project;

    assert.strictEqual(project.clips.find(c => c.id === 'clip_sfx_transient').startTick, 138000);

    initialRenderPath = path.join(scratchDir, 'initial_rendered_audio.wav');
    initialRenderInfo = renderProjectAudio(project, initialRenderPath);
    assert.ok(fs.existsSync(initialRenderPath));
    assert.ok(initialRenderInfo.sha256.length === 64);
  });

  await t.test('SYN-02: Initial Earshot QA audit measures +150ms desync defect', async () => {
    initialQa = await adapter.auditAudioQuality(initialRenderPath, {
      timebase: { duration_ticks: 360000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }]
    });

    const initialSyncCheck = initialQa.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(initialSyncCheck, 'CHK_EARSHOT_SYNC must be present');
    assert.strictEqual(initialSyncCheck.status, 'failed', 'Initial render must fail sync check');
    assert.strictEqual(initialSyncCheck.severity, 'HIGH');

    const measuredOffsetMs = initialSyncCheck.measured_value.max_offset_ms;
    const measuredOffsetTicks = initialSyncCheck.measured_value.max_offset_ticks;
    assert.ok(Math.abs(measuredOffsetMs - 150.0) <= 25.0, `Expected ~+150ms offset, got ${measuredOffsetMs}ms`);
    assert.ok(Math.abs(measuredOffsetTicks - 18000) <= 3000, `Expected ~+18,000 ticks, got ${measuredOffsetTicks}`);
  });

  await t.test('SYN-03: Finding ingestion binds source project revision and media evidence', async () => {
    const context = {
      project,
      mediaPath: initialRenderPath,
      mediaSha256: initialRenderInfo.sha256,
      targetClipId: 'clip_sfx_transient'
    };
    const findings = AudioRepairPlanner.ingestQAChecks(initialQa.checks, initialQa.rawResponse, context);
    assert.strictEqual(findings.length, 1);
    syncFinding = findings[0];
    assert.strictEqual(syncFinding.type, 'sync_offset');
    assert.strictEqual(syncFinding.source_evidence.project_revision, project.revision);
    assert.strictEqual(syncFinding.source_evidence.clip_id, 'clip_sfx_transient');
  });

  await t.test('SYN-04: AudioRepairPlanner formulates exact -18,000 tick SYNC_RETIME proposal', async () => {
    proposal = AudioRepairPlanner.planRepair(syncFinding, project);
    assert.strictEqual(proposal.status, 'PLANNED');
    assert.strictEqual(proposal.strategy, 'SYNC_RETIME');
    assert.ok(Math.abs(proposal.parameters.shift_ticks - (-18000)) <= 3000);
    assert.ok(Math.abs(proposal.parameters.target_start_tick - 120000) <= 3000);
    assert.strictEqual(proposal.preconditions.expected_base_revision, project.revision);
    assert.strictEqual(proposal.preconditions.bounds_valid, true);
  });

  await t.test('SYN-05: Canonical move_clip execution via OperationExecutor advances revision', async () => {
    const initialRevision = project.revision;
    execResult = RepairOperationCompiler.executeRepair(project, proposal);
    assert.strictEqual(execResult.success, true, `OperationExecutor failed: ${execResult.error}`);
    assert.strictEqual(execResult.project.revision, initialRevision + 1);

    const repairedClip = execResult.project.clips.find(c => c.id === 'clip_sfx_transient');
    assert.strictEqual(repairedClip.startTick, proposal.parameters.target_start_tick);
    assert.ok(Math.abs(repairedClip.startTick - 120000) <= 3000);
  });

  await t.test('SYN-06: Rerender, closed-loop Earshot QA certification, and acoustic transient alignment', async () => {
    repairedRenderPath = path.join(scratchDir, 'repaired_rendered_audio.wav');
    repairedRenderInfo = renderProjectAudio(execResult.project, repairedRenderPath);
    assert.notStrictEqual(repairedRenderInfo.sha256, initialRenderInfo.sha256, 'Rendered audio must be distinct');

    const repairedQa = await adapter.auditAudioQuality(repairedRenderPath, {
      timebase: { duration_ticks: 360000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }]
    });

    const repairedSyncCheck = repairedQa.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(repairedSyncCheck, 'CHK_EARSHOT_SYNC present on repaired render');
    assert.strictEqual(repairedSyncCheck.status, 'passed', `Repaired render must pass sync check, got: ${repairedSyncCheck.detail}`);
    assert.strictEqual(repairedSyncCheck.severity, 'INFO');

    const repairedOffsetMs = repairedSyncCheck.measured_value.max_offset_ms;
    assert.ok(Math.abs(repairedOffsetMs) <= 33.33, `Repaired offset ${repairedOffsetMs}ms must be <= 33.33ms`);

    // Signal-level PCM transient peak verification
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

    const expectedPeakSample = Math.round(proposal.parameters.target_start_tick * 48000 / TICKS_PER_SECOND);
    const sampleDiff = Math.abs(maxSampleIdx - expectedPeakSample);
    assert.ok(sampleDiff <= 48, `Acoustic transient peak at sample ${maxSampleIdx} aligns with target sample ${expectedPeakSample} within 1ms`);
  });
});
