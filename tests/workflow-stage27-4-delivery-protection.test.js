/**
 * Test Suite: Stage 27.4 — Active Delivery Promotion & Failure Isolation
 *
 * Verifies (ARC-27-08 & ARC-27-09):
 * 1. PRM-01: Successful closed-loop repair promotes new active delivery and references predecessor.
 * 2. PRM-02: Active delivery preservation: existing active delivery remains 100% untouched when proposal is rejected.
 * 3. PRM-03: Rollback on candidate QA failure: rolls back canonical project mutation and quarantines candidate.
 * 4. PRM-04: Candidate isolation: failed candidate marked QUARANTINED without contaminating canonical job state.
 * 5. PRM-05: Ambiguous failure handling: worker crash / timeout sets status to NEEDS_RECONCILIATION with intact active delivery.
 * 6. PRM-06: Checksum & revision provenance fence: rejects promotion on checksum or revision mismatch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { AudioRepairCoordinator } = require('../src/audio/repair/audio-repair-coordinator.js');
const { OperationExecutor } = require('../src/engine/operations.js');

function createSampleProject() {
  let project = OperationExecutor.execute(null, {
    type: 'create_project',
    params: {
      id: 'proj-delivery-protection',
      fps: 30,
      width: 1920,
      height: 1080,
      durationTicks: 360000
    }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: {
      id: 'asset_sfx',
      type: 'audio',
      src: '/tmp/dummy_sfx.wav',
      metadata: { durationSec: 1.0 }
    }
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
    params: {
      id: 'clip_sfx',
      trackId: 'a1',
      source: { assetId: 'asset_sfx' },
      type: 'audio',
      startTick: 138000, // 150ms late relative to 120,000 tick cut
      durationTicks: 48000
    }
  }).project;

  return project;
}

test('Stage 27.4: Active Delivery Promotion & Failure Isolation (ARC-27-08 & ARC-27-09)', async (t) => {
  const scratchDir = path.resolve(__dirname, `../scratch/stage27-4-delivery-${process.pid}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const activeMediaFile = path.join(scratchDir, 'active_delivery_media.wav');
  fs.writeFileSync(activeMediaFile, Buffer.alloc(1024, 0x11));
  const activeMediaSha = crypto.createHash('sha256').update(fs.readFileSync(activeMediaFile)).digest('hex');

  const baselineDelivery = {
    delivery_run_id: 'del-active-baseline-001',
    manifest_id: 'man-active-baseline-001',
    media_path: activeMediaFile,
    media_sha256: activeMediaSha,
    revision: 5,
    status: 'ACTIVE'
  };

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  await t.test('PRM-01: Successful closed-loop repair cycle promotes new active delivery and archives predecessor (ARC-27-09)', async () => {
    const project = createSampleProject();
    project.revision = 5;

    // Mock adapter that reports initial sync defect (+150ms) and candidate pass (0ms)
    let callCount = 0;
    const mockAdapter = {
      auditAudioQuality: async (mediaPath, opts) => {
        callCount++;
        if (callCount === 1) {
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'failed',
                severity: 'HIGH',
                measured_value: { max_offset_ms: 150.0, max_offset_ticks: 18000 },
                threshold: { max_sync_tolerance_ms: 33.33 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: {
                details: [
                  { cut_seconds: 1.0, sound_onset_seconds: 1.15, offset_ms: 150.0, offset_ticks: 18000 }
                ]
              }
            }
          };
        } else {
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'passed',
                severity: 'INFO',
                measured_value: { max_offset_ms: 0.0, max_offset_ticks: 0 },
                threshold: { max_sync_tolerance_ms: 33.33 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, sound_onset_seconds: 1.0, offset_ms: 0.0 }] }
            }
          };
        }
      }
    };

    const mockRenderFn = (mutatedProj, outPath) => {
      fs.writeFileSync(outPath, Buffer.alloc(2048, 0x22));
      const sha = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
      return { outputPath: outPath, sha256: sha };
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockAdapter,
      renderFn: mockRenderFn
    });

    const activeDeliveryBefore = structuredClone(baselineDelivery);
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery: baselineDelivery,
      scratchDir,
      targetClipId: 'clip_sfx'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'PROMOTED');
    assert.strictEqual(result.promoted, true);
    assert.ok(result.activeDelivery, 'Must produce new active delivery');
    assert.strictEqual(result.activeDelivery.status, 'ACTIVE');
    assert.strictEqual(result.activeDelivery.revision, 6);
    assert.strictEqual(result.activeDelivery.previous_delivery_run_id, activeDeliveryBefore.delivery_run_id);
    assert.strictEqual(result.previousDelivery.delivery_run_id, activeDeliveryBefore.delivery_run_id);
    assert.strictEqual(result.project.revision, 6);
    assert.strictEqual(result.project.clips.find(c => c.id === 'clip_sfx').startTick, 120000);
  });

  await t.test('PRM-02: Active delivery preservation: existing active delivery remains completely unchanged when proposal is rejected (ARC-27-08)', async () => {
    const project = createSampleProject();
    project.revision = 5;

    // Proposal will be rejected due to negative start bounds (offset = -200,000 ticks)
    const mockAdapter = {
      auditAudioQuality: async () => ({
        checks: [
          {
            id: 'CHK_EARSHOT_SYNC',
            status: 'failed',
            severity: 'HIGH',
            measured_value: { max_offset_ms: 2000.0, max_offset_ticks: 240000 }
          }
        ],
        rawResponse: {
          status: 'SUCCESS',
          sync: {
            details: [
              { cut_seconds: 1.0, sound_onset_seconds: 3.0, offset_ms: 2000.0, offset_ticks: 240000 }
            ]
          }
        }
      })
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockAdapter,
      renderFn: () => assert.fail('renderFn must not be called when proposal is rejected')
    });

    const activeDeliveryBefore = structuredClone(baselineDelivery);
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery: baselineDelivery,
      scratchDir,
      targetClipId: 'clip_sfx'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'PROPOSAL_REJECTED');
    assert.strictEqual(result.promoted, false);
    assert.deepStrictEqual(result.activeDelivery, activeDeliveryBefore, 'Existing active delivery must remain 100% untouched');
    assert.strictEqual(result.project.revision, 5, 'Project revision must not be modified');
  });

  await t.test('PRM-03: Rollback on candidate QA failure: rolls back canonical mutation and quarantines candidate (ARC-27-08, ARC-27-09)', async () => {
    const project = createSampleProject();
    project.revision = 5;

    // Candidate QA fails!
    let callCount = 0;
    const mockAdapter = {
      auditAudioQuality: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'failed',
                measured_value: { max_offset_ms: 150.0, max_offset_ticks: 18000 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, offset_ms: 150.0, offset_ticks: 18000 }] }
            }
          };
        } else {
          // Candidate render failed QA again!
          return {
            checks: [
              {
                id: 'CHK_EARSHOT_SYNC',
                status: 'failed',
                measured_value: { max_offset_ms: 120.0, max_offset_ticks: 14400 }
              }
            ],
            rawResponse: {
              status: 'SUCCESS',
              sync: { details: [{ cut_seconds: 1.0, offset_ms: 120.0, offset_ticks: 14400 }] }
            }
          };
        }
      }
    };

    const mockRenderFn = (proj, outPath) => {
      fs.writeFileSync(outPath, Buffer.alloc(1024, 0x33));
      const sha = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
      return { outputPath: outPath, sha256: sha };
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockAdapter,
      renderFn: mockRenderFn
    });

    const activeDeliveryBefore = structuredClone(baselineDelivery);
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery: baselineDelivery,
      scratchDir,
      targetClipId: 'clip_sfx'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'CANDIDATE_QA_FAILED');
    assert.strictEqual(result.promoted, false);
    assert.deepStrictEqual(result.activeDelivery, activeDeliveryBefore, 'Prior active delivery preserved untouched');
    assert.strictEqual(result.rollback.status, 'VERIFIED_ROLLED_BACK');
    assert.strictEqual(result.project.clips.find(c => c.id === 'clip_sfx').startTick, 138000, 'Clip startTick rolled back to original');
  });

  await t.test('PRM-04: Candidate isolation / quarantine: failed candidate marked QUARANTINED without contaminating canonical job state taxonomy (ARC-27-08)', async () => {
    const project = createSampleProject();
    project.revision = 5;

    let callCount = 0;
    const mockAdapter = {
      auditAudioQuality: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 150.0 } }],
            rawResponse: { status: 'SUCCESS', sync: { details: [{ cut_seconds: 1.0, offset_ms: 150.0, offset_ticks: 18000 }] } }
          };
        }
        return {
          checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 90.0 } }],
          rawResponse: { status: 'SUCCESS', sync: { details: [{ cut_seconds: 1.0, offset_ms: 90.0 }] } }
        };
      }
    };

    const mockRenderFn = (proj, outPath) => {
      fs.writeFileSync(outPath, Buffer.alloc(512, 0x44));
      const sha = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
      return { outputPath: outPath, sha256: sha };
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockAdapter,
      renderFn: mockRenderFn
    });

    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery: baselineDelivery,
      scratchDir,
      targetClipId: 'clip_sfx'
    });

    assert.ok(result.quarantinedCandidate, 'Must create quarantinedCandidate record');
    assert.strictEqual(result.quarantinedCandidate.status, 'QUARANTINED');
    assert.ok(result.quarantinedCandidate.quarantine_reason.includes('GATE_FAILED'));
  });

  await t.test('PRM-05: Ambiguous failure handling: worker crash / timeout during candidate audit sets status to NEEDS_RECONCILIATION with intact active delivery (ARC-27-08)', async () => {
    const project = createSampleProject();
    project.revision = 5;

    const mockAdapter = {
      auditAudioQuality: async () => ({
        checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 150.0 } }],
        rawResponse: { status: 'SUCCESS', sync: { details: [{ cut_seconds: 1.0, offset_ms: 150.0, offset_ticks: 18000 }] } }
      })
    };

    const mockRenderFn = (proj, outPath) => {
      fs.writeFileSync(outPath, Buffer.alloc(512, 0x55));
      const sha = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');
      return { outputPath: outPath, sha256: sha };
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockAdapter,
      renderFn: mockRenderFn
    });

    const activeDeliveryBefore = structuredClone(baselineDelivery);
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery: baselineDelivery,
      scratchDir,
      targetClipId: 'clip_sfx',
      simulateWorkerCrash: true // Worker terminates abnormally!
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(result.promoted, false);
    assert.deepStrictEqual(result.activeDelivery, activeDeliveryBefore, 'Prior active delivery preserved untouched');
    assert.ok(result.quarantinedCandidate);
    assert.strictEqual(result.quarantinedCandidate.status, 'QUARANTINED');
  });

  await t.test('PRM-06: Checksum & revision provenance fence: rejects promotion if candidate checksum or project revision does not match audit evidence (ARC-27-09)', async () => {
    const project = createSampleProject();
    project.revision = 5;

    let callCount = 0;
    const mockAdapter = {
      auditAudioQuality: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 150.0 } }],
            rawResponse: { status: 'SUCCESS', sync: { details: [{ cut_seconds: 1.0, offset_ms: 150.0, offset_ticks: 18000 }] } }
          };
        }
        return {
          checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'passed', measured_value: { max_offset_ms: 0.0 } }],
          rawResponse: { status: 'SUCCESS', sync: { details: [{ cut_seconds: 1.0, offset_ms: 0.0 }] } }
        };
      }
    };

    // Corrupt candidate checksum: renderFn reports sha but writes different content
    const mockCorruptRenderFn = (proj, outPath) => {
      fs.writeFileSync(outPath, Buffer.alloc(512, 0x66));
      return { outputPath: outPath, sha256: 'deadbeef_corrupt_sha256' };
    };

    const coordinator = new AudioRepairCoordinator({
      adapter: mockAdapter,
      renderFn: mockCorruptRenderFn
    });

    const activeDeliveryBefore = structuredClone(baselineDelivery);
    const result = await coordinator.coordinateRepair({
      project,
      activeDelivery: baselineDelivery,
      scratchDir,
      targetClipId: 'clip_sfx'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'NEEDS_RECONCILIATION');
    assert.ok(result.error.includes('Integrity breach'));
    assert.deepStrictEqual(result.activeDelivery, activeDeliveryBefore);
  });
});
