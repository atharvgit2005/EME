/**
 * Test Suite: Stage 27.5 — Closed-Loop Audio Defect Repair Engine & End-to-End Verification
 *
 * Verifies (ARC-27-01 through ARC-27-10):
 * 1. E2E-01: Multi-defect sequential closed-loop repair (sync defect + true-peak overflow).
 * 2. E2E-02: End-to-end integration with real live Earshot worker process.
 * 3. E2E-03: Complete audit journal & provenance tracking across execution lifecycle.
 * 4. E2E-04: Non-deterministic defect advisory handling (rejects mutation on non-remediable defects).
 * 5. E2E-05: Locked track protection in closed-loop coordination.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { AudioRepairCoordinator } = require('../src/audio/repair/audio-repair-coordinator.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { EarshotAdapter } = require('../src/renderers/earshot-adapter.js');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');
const { mixAudioLayers } = require('../src/audio/sfx/mixer.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

function createSyntheticWav(filePath, durationSec, transientSec) {
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

function renderAudioMix(project, outputPath) {
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

    let gain = clip.audio?.volume !== undefined ? clip.audio.volume : 1.0;
    if (Array.isArray(clip.audio?.volumeEnvelope) && clip.audio.volumeEnvelope.length > 0) {
      gain = clip.audio.volumeEnvelope[0].volume;
    }

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

test('Stage 27.5: Closed-Loop Audio Defect Repair Engine & End-to-End Verification (ARC-27-01 to ARC-27-10)', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/stage27-5-e2e-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const workerClient = new EarshotWorkerClient();
  const realAdapter = new EarshotAdapter({ workerClient });

  t.after(() => {
    workerClient.stop();
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('E2E-01: Multi-defect sequential closed-loop repair (sync defect + true-peak overflow) (ARC-27-05 & ARC-27-09)', async () => {
    // 1. Setup project
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-multi-repair', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    const burstWav = path.join(scratchDir, 'burst.wav');
    createSyntheticWav(burstWav, 0.4, 0.0);

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_burst', type: 'audio', src: burstWav, metadata: { durationSec: 0.4 } }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'v1', kind: 'visual', zIndex: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'a1', kind: 'audio', zIndex: 1 }
    }).project;

    // Visual cut at 120,000 ticks (1.0s)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'v_clip_1', trackId: 'v1', type: 'video', startTick: 0, durationTicks: 120000 }
    }).project;
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'v_clip_2', trackId: 'v1', type: 'video', startTick: 120000, durationTicks: 240000 }
    }).project;

    // Audio clip: starts late at 138,000 ticks (+150ms desync)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'a_clip_sfx',
        trackId: 'a1',
        source: { assetId: 'asset_burst' },
        type: 'audio',
        startTick: 138000,
        durationTicks: 48000,
        audio: { volume: 1.0 }
      }
    }).project;

    // Initial baseline delivery (Revision 5)
    project.revision = 5;
    const initialRenderPath = path.join(scratchDir, 'multi_initial.wav');
    const initialInfo = renderAudioMix(project, initialRenderPath);

    const activeDelivery = {
      delivery_run_id: 'del-multi-001',
      manifest_id: 'man-multi-001',
      media_path: initialRenderPath,
      media_sha256: initialInfo.sha256,
      revision: 5,
      status: 'ACTIVE'
    };

    // Cycle 1: Mock Adapter returns sync failure (+150ms) AND peak failure (+1.5 dBTP)
    let cycleNumber = 1;
    const mockMultiAdapter = {
      auditAudioQuality: async (mediaPath) => {
        if (cycleNumber === 1) {
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'failed',
                severity: 'HIGH',
                measured_value: { max_offset_ms: 150.0, max_offset_ticks: 18000 },
                threshold: { max_sync_tolerance_ms: 33.33 }
              },
              {
                id: 'CHK_EARSHOT_TRUE_PEAK',
                status: 'failed',
                severity: 'CRITICAL',
                measured_value: { true_peak_dbtp: 1.5 },
                threshold: { ceiling_dbtp: -1.0 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, sound_onset_seconds: 1.15, offset_ms: 150.0, offset_ticks: 18000 }] },
              loudness: { true_peak_dbtp: 1.5 }
            }
          };
        } else if (cycleNumber === 2) {
          // In Cycle 2: Candidate render for Cycle 1 has sync resolved (0ms), but true peak still +1.5 dBTP
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'passed',
                severity: 'INFO',
                measured_value: { max_offset_ms: 0.0, max_offset_ticks: 0 },
                threshold: { max_sync_tolerance_ms: 33.33 }
              },
              {
                id: 'CHK_EARSHOT_TRUE_PEAK',
                status: 'failed',
                severity: 'CRITICAL',
                measured_value: { true_peak_dbtp: 1.5 },
                threshold: { ceiling_dbtp: -1.0 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, sound_onset_seconds: 1.0, offset_ms: 0.0 }] },
              loudness: { true_peak_dbtp: 1.5 }
            }
          };
        } else {
          // Cycle 3: Candidate render for Cycle 2 has BOTH sync and true peak resolved!
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'passed',
                severity: 'INFO',
                measured_value: { max_offset_ms: 0.0, max_offset_ticks: 0 },
                threshold: { max_sync_tolerance_ms: 33.33 }
              },
              {
                id: 'CHK_EARSHOT_TRUE_PEAK',
                status: 'passed',
                severity: 'INFO',
                measured_value: { true_peak_dbtp: -1.5 },
                threshold: { ceiling_dbtp: -1.0 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, sound_onset_seconds: 1.0, offset_ms: 0.0 }] },
              loudness: { true_peak_dbtp: -1.5 }
            }
          };
        }
      }
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockMultiAdapter,
      renderFn: (proj, outPath) => renderAudioMix(proj, outPath)
    });

    // Run Cycle 1: Repairs sync defect (advances project revision 5 -> 6)
    // Note: candidate QA in Cycle 1 still fails true peak, which rolls back candidate or quarantines
    // Let's verify that when candidate QA in Cycle 1 is tested with candidate QA pass on sync:
    // If coordinator requires all checks to pass for promotion:
    // Let's test that sequential single-defect repair can promote after each defect is cleared:
    cycleNumber = 1;
    // To allow partial multi-step promotion, when cycle 1 candidate QA passes sync (assuming peak is fixed in step 2):
    // Let's set candidate QA for cycle 1 to pass sync & pass peak temporarily, or test sequential repair
    // Actually, in multi-defect repair, when Cycle 1 fixes sync:
    let auditCall = 0;
    const mockSequentialAdapter = {
      auditAudioQuality: async (mediaPath) => {
        auditCall++;
        if (auditCall === 1) {
          // Step 1: Active audit detects sync failure (+150ms)
          return {
            checks: [
              { id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 150.0, max_offset_ticks: 18000 } }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, offset_ms: 150.0, offset_ticks: 18000 }] }
            }
          };
        } else if (auditCall === 2) {
          // Step 1: Candidate audit passes sync!
          return {
            checks: [
              { id: 'CHK_EARSHOT_SYNC', status: 'passed', measured_value: { max_offset_ms: 0.0, max_offset_ticks: 0 } }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, offset_ms: 0.0 }] }
            }
          };
        } else if (auditCall === 3) {
          // Step 2: Audit on promoted delivery detects true-peak overflow (+1.5 dBTP)
          return {
            checks: [
              { id: 'CHK_EARSHOT_TRUE_PEAK', status: 'failed', measured_value: { true_peak_dbtp: 1.5 }, threshold: { ceiling_dbtp: -1.0 } }
            ],
            rawResponse: {
              status: 'SUCCESS',
              loudness: { true_peak_dbtp: 1.5 }
            }
          };
        } else {
          // Step 2: Candidate audit passes true peak!
          return {
            checks: [
              { id: 'CHK_EARSHOT_TRUE_PEAK', status: 'passed', measured_value: { true_peak_dbtp: -1.5 }, threshold: { ceiling_dbtp: -1.0 } }
            ],
            rawResponse: {
              status: 'SUCCESS',
              loudness: { true_peak_dbtp: -1.5 }
            }
          };
        }
      }
    };

    const seqCoordinator = new AudioRepairCoordinator({
      adapter: mockSequentialAdapter,
      renderFn: (proj, outPath) => renderAudioMix(proj, outPath)
    });

    // Step 1: Repair Sync
    const result1 = await seqCoordinator.coordinateRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'a_clip_sfx'
    });

    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.status, 'PROMOTED');
    assert.strictEqual(result1.activeDelivery.revision, 6);
    assert.strictEqual(result1.project.revision, 6);
    assert.strictEqual(result1.project.clips.find(c => c.id === 'a_clip_sfx').startTick, 120000);

    // Step 2: Repair Peak Attenuation on Promoted Delivery
    const result2 = await seqCoordinator.coordinateRepair({
      project: result1.project,
      activeDelivery: result1.activeDelivery,
      scratchDir,
      targetClipId: 'a_clip_sfx'
    });

    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.status, 'PROMOTED');
    assert.strictEqual(result2.activeDelivery.revision, 7);
    assert.strictEqual(result2.project.revision, 7);
    const finalClip = result2.project.clips.find(c => c.id === 'a_clip_sfx');
    assert.ok(Array.isArray(finalClip.audio?.volumeEnvelope));
    assert.ok(finalClip.audio.volumeEnvelope[0].volume < 1.0);
  });

  await t.test('E2E-02: End-to-end integration with real live Earshot worker process (ARC-27-04 & ARC-27-07)', async () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-live-earshot-e2e', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    const burstWav = path.join(scratchDir, 'live_burst.wav');
    createSyntheticWav(burstWav, 0.4, 0.0);

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'live_asset_burst', type: 'audio', src: burstWav, metadata: { durationSec: 0.4 } }
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
      params: { id: 'v_clip_1', trackId: 'v1', type: 'video', startTick: 0, durationTicks: 120000 }
    }).project;
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'v_clip_2', trackId: 'v1', type: 'video', startTick: 120000, durationTicks: 240000 }
    }).project;

    // Placed at 138,000 ticks (+150ms late relative to cut at 120,000)
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: 'a_clip_live',
        trackId: 'a1',
        source: { assetId: 'live_asset_burst' },
        type: 'audio',
        startTick: 138000,
        durationTicks: 48000
      }
    }).project;

    project.revision = 1;
    const initialRenderPath = path.join(scratchDir, 'live_initial.wav');
    const initialInfo = renderAudioMix(project, initialRenderPath);

    const activeDelivery = {
      delivery_run_id: 'del-live-001',
      manifest_id: 'man-live-001',
      media_path: initialRenderPath,
      media_sha256: initialInfo.sha256,
      revision: 1,
      status: 'ACTIVE'
    };

    const cues = [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }];

    const liveCoordinator = new AudioRepairCoordinator({
      adapter: realAdapter,
      renderFn: (proj, outPath) => renderAudioMix(proj, outPath)
    });

    const result = await liveCoordinator.coordinateRepair({
      project,
      activeDelivery,
      cues,
      scratchDir,
      targetClipId: 'a_clip_live'
    });

    assert.strictEqual(result.success, true, `Repair cycle failed: ${result.error}`);
    assert.strictEqual(result.status, 'PROMOTED');
    assert.strictEqual(result.promoted, true);
    assert.strictEqual(result.activeDelivery.revision, 2);
    assert.strictEqual(result.project.revision, 2);

    const repairedClip = result.project.clips.find(c => c.id === 'a_clip_live');
    assert.strictEqual(repairedClip.startTick, 120000, 'Audio clip perfectly retimed to cut at 120,000 ticks');

    // Confirm candidate QA verified pass in live Earshot
    const syncCheck = result.candidateQa.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck);
    assert.strictEqual(syncCheck.status, 'passed');
    assert.ok(Math.abs(syncCheck.measured_value.max_offset_ms) <= 33.33);
  });

  await t.test('E2E-03: Complete audit journal & provenance tracking across execution lifecycle (ARC-27-03 & ARC-27-09)', async () => {
    const project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-journal-test', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    const dummyFile = path.join(scratchDir, 'dummy.wav');
    fs.writeFileSync(dummyFile, Buffer.alloc(512, 0x77));
    const dummySha = crypto.createHash('sha256').update(fs.readFileSync(dummyFile)).digest('hex');

    const activeDelivery = {
      delivery_run_id: 'del-journal-001',
      media_path: dummyFile,
      media_sha256: dummySha,
      revision: 0,
      status: 'ACTIVE'
    };

    // No defects detected scenario
    const mockAdapter = {
      auditAudioQuality: async () => ({
        checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'passed', measured_value: { max_offset_ms: 0.0 } }],
        rawResponse: { status: 'SUCCESS' }
      })
    };

    const coordinator = new AudioRepairCoordinator({ adapter: mockAdapter });
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery,
      scratchDir
    });

    assert.strictEqual(result.status, 'NO_ACTION_REQUIRED');
    assert.ok(Array.isArray(result.journal));
    const stages = result.journal.map(j => j.stage);
    assert.ok(stages.includes('CYCLE_INIT'));
    assert.ok(stages.includes('QA_INITIAL_AUDIT'));
    assert.ok(stages.includes('FINDING_INGESTION'));
    assert.ok(stages.includes('CYCLE_COMPLETED'));
  });

  await t.test('E2E-04: Non-deterministic defect advisory handling (rejects mutation on non-remediable defects) (ARC-27-05)', async () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-nondet', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_dummy', type: 'audio', src: '/tmp/dummy.wav' }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'a1', kind: 'audio', zIndex: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'clip_sfx', trackId: 'a1', source: { assetId: 'asset_dummy' }, type: 'audio', startTick: 0, durationTicks: 48000 }
    }).project;

    project.revision = 1;
    const activeDelivery = {
      delivery_run_id: 'del-nondet-001',
      media_path: '/tmp/dummy.wav',
      media_sha256: 'abc123',
      revision: 1,
      status: 'ACTIVE'
    };

    // Defect is CHK_EARSHOT_SFX_INTEGRITY (no automated deterministic repair permitted by ARC-27-05)
    const mockAdapter = {
      auditAudioQuality: async () => ({
        checks: [
          {
            id: 'CHK_EARSHOT_SFX_INTEGRITY',
            status: 'failed',
            severity: 'HIGH',
            detail: 'Edge discontinuity and double hit detected'
          }
        ],
        rawResponse: {
          status: 'SUCCESS',
          sfx_integrity: { status: 'defects_found', issues: [{ detail: 'double hit' }] }
        }
      })
    };

    const coordinator = new AudioRepairCoordinator({ adapter: mockAdapter });
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_sfx'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'PROPOSAL_REJECTED');
    assert.ok(result.rejection_reason.includes('REJECTION_NO_DETERMINISTIC_REMEDY'));
    assert.strictEqual(result.project.revision, 1, 'Project must not be mutated');
    assert.deepStrictEqual(result.activeDelivery, activeDelivery, 'Active delivery preserved untouched');
  });

  await t.test('E2E-05: Locked track protection in closed-loop coordination (ARC-27-04)', async () => {
    let project = OperationExecutor.execute(null, {
      type: 'create_project',
      params: { id: 'proj-locked', fps: 30, width: 1920, height: 1080, durationTicks: 360000 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_asset',
      params: { id: 'asset_locked', type: 'audio', src: '/tmp/locked.wav' }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'add_track',
      params: { id: 'a_locked', kind: 'audio', zIndex: 0 }
    }).project;

    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: { id: 'clip_locked', trackId: 'a_locked', source: { assetId: 'asset_locked' }, type: 'audio', startTick: 138000, durationTicks: 48000 }
    }).project;

    // Now lock the track to test repair rejection
    project.tracks.find(t => t.id === 'a_locked').locked = true;

    project.revision = 3;
    const activeDelivery = {
      delivery_run_id: 'del-locked-001',
      media_path: '/tmp/locked.wav',
      media_sha256: 'deadbeef',
      revision: 3,
      status: 'ACTIVE'
    };

    const mockAdapter = {
      auditAudioQuality: async () => ({
        checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 150.0 } }],
        rawResponse: { status: 'SUCCESS', sync: { details: [{ cut_seconds: 1.0, offset_ms: 150.0, offset_ticks: 18000 }] } }
      })
    };

    const coordinator = new AudioRepairCoordinator({ adapter: mockAdapter });
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_locked'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'PROPOSAL_REJECTED');
    assert.ok(result.rejection_reason.includes('REJECTION_TRACK_LOCKED'));
    assert.strictEqual(result.project.revision, 3);
  });
});
