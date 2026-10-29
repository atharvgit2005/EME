/**
 * Test Suite: Stage 27.2 — Canonical Operation Compilation & Precondition Validation
 *
 * Verifies:
 * 1. CMP-01: Compiles SYNC_RETIME proposal into canonical move_clip operation (ARC-27-02).
 * 2. CMP-02: Compiles PEAK_ATTENUATION proposal into canonical set_audio_envelope operation (ARC-27-02).
 * 3. CMP-03: Rejects non-PLANNED proposals from compilation.
 * 4. CMP-04: Atomic execution exclusively via OperationExecutor advances project revision (ARC-27-01).
 * 5. CMP-05: Concurrency protection: stale base revision rejects without partial mutation.
 * 6. CMP-06: Generates valid inverse operation for atomic rollback.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { RepairOperationCompiler } = require('../src/audio/repair/repair-operation-compiler.js');
const { OperationExecutor } = require('../src/engine/operations.js');

function createBaseProject() {
  const p0 = OperationExecutor.execute(null, {
    type: 'create_project',
    params: {
      id: 'proj-p27-stage2',
      fps: 30,
      width: 1920,
      height: 1080,
      durationTicks: 600000
    }
  }).project;

  const p1 = OperationExecutor.execute(p0, {
    type: 'add_asset',
    params: {
      id: 'asset_whoosh',
      type: 'audio',
      path: '/tmp/whoosh.wav',
      durationTicks: 60000,
      mediaInfo: { durationSec: 0.5, format: 'wav', audio: { sampleRate: 48000, channels: 2 } }
    }
  }).project;

  const p2 = OperationExecutor.execute(p1, {
    type: 'add_track',
    params: { id: 'a1', kind: 'audio', zIndex: 1 }
  }).project;

  const p3 = OperationExecutor.execute(p2, {
    type: 'insert_clip',
    params: {
      id: 'clip_sfx_whoosh',
      trackId: 'a1',
      assetId: 'asset_whoosh',
      type: 'audio',
      startTick: 120000,
      durationTicks: 60000
    }
  }).project;

  return p3;
}

test('Stage 27.2: Canonical Operation Compilation & Precondition Validation', async (t) => {
  await t.test('CMP-01: Compiles SYNC_RETIME proposal into canonical move_clip operation (ARC-27-02)', () => {
    const project = createBaseProject();
    const proposal = {
      proposal_id: 'prop-repair-sync-1',
      finding_id: 'chk-repair-sync-1',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_sfx_whoosh',
      target_track_id: 'a1',
      parameters: {
        shift_ticks: -18000,
        target_start_tick: 102000
      },
      preconditions: {
        expected_base_revision: project.revision,
        current_start_tick: 120000,
        bounds_valid: true
      },
      status: 'PLANNED'
    };

    const op = RepairOperationCompiler.compile(proposal, project);
    assert.strictEqual(op.type, 'move_clip');
    assert.strictEqual(op.clipId, 'clip_sfx_whoosh');
    assert.strictEqual(op.targetTick, 102000);
    assert.strictEqual(op.targetTrackId, 'a1');
    assert.strictEqual(op.expectedBaseRevision, project.revision);
  });

  await t.test('CMP-02: Compiles PEAK_ATTENUATION proposal into canonical set_audio_envelope operation (ARC-27-02)', () => {
    const project = createBaseProject();
    const proposal = {
      proposal_id: 'prop-repair-peak-1',
      finding_id: 'chk-repair-peak-1',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_sfx_whoosh',
      target_track_id: 'a1',
      parameters: {
        gain_reduction_db: 2.7,
        target_linear_volume: 0.733,
        volume_keyframes: [
          { offsetTick: 0, volume: 0.733 },
          { offsetTick: 60000, volume: 0.733 }
        ]
      },
      preconditions: {
        expected_base_revision: project.revision,
        current_start_tick: 120000,
        bounds_valid: true
      },
      status: 'PLANNED'
    };

    const op = RepairOperationCompiler.compile(proposal, project);
    assert.strictEqual(op.type, 'set_audio_envelope');
    assert.strictEqual(op.clipId, 'clip_sfx_whoosh');
    assert.strictEqual(op.volumeKeyframes.length, 2);
    assert.strictEqual(op.expectedBaseRevision, project.revision);
  });

  await t.test('CMP-03: Rejects non-PLANNED proposals from compilation', () => {
    const project = createBaseProject();
    const rejectedProposal = {
      proposal_id: 'prop-repair-bad',
      finding_id: 'chk-repair-bad',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_sfx_whoosh',
      target_track_id: 'a1',
      parameters: { target_start_tick: -5000 },
      preconditions: { expected_base_revision: project.revision, bounds_valid: false },
      status: 'REJECTED',
      rejection_reason: 'REJECTION_NEGATIVE_START_BOUNDS'
    };

    assert.throws(() => {
      RepairOperationCompiler.compile(rejectedProposal, project);
    }, /Cannot compile proposal with status "REJECTED"/);
  });

  await t.test('CMP-04: Atomic execution exclusively via OperationExecutor advances project revision (ARC-27-01)', () => {
    const project = createBaseProject();
    const startRevision = project.revision;
    const proposal = {
      proposal_id: 'prop-repair-sync-exec',
      finding_id: 'chk-repair-sync-exec',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_sfx_whoosh',
      target_track_id: 'a1',
      parameters: {
        shift_ticks: -18000,
        target_start_tick: 102000
      },
      preconditions: {
        expected_base_revision: startRevision,
        current_start_tick: 120000,
        bounds_valid: true
      },
      status: 'PLANNED'
    };

    const res = RepairOperationCompiler.executeRepair(project, proposal);
    assert.strictEqual(res.success, true, `Expected success but got: ${res.error}`);
    assert.strictEqual(res.project.revision, startRevision + 1); // advanced to R+1
    const clip = res.project.clips.find(c => c.id === 'clip_sfx_whoosh');
    assert.strictEqual(clip.startTick, 102000);
    assert.strictEqual(project.clips.find(c => c.id === 'clip_sfx_whoosh').startTick, 120000); // original unmodified (pure cloning)
  });

  await t.test('CMP-05: Concurrency protection: stale base revision rejects without partial mutation', () => {
    const project = createBaseProject();
    const actualRevision = project.revision;
    const proposal = {
      proposal_id: 'prop-repair-stale',
      finding_id: 'chk-repair-stale',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_sfx_whoosh',
      target_track_id: 'a1',
      parameters: { target_start_tick: 102000 },
      preconditions: {
        expected_base_revision: actualRevision - 1, // stale expectation!
        current_start_tick: 120000,
        bounds_valid: true
      },
      status: 'PLANNED'
    };

    const res = RepairOperationCompiler.executeRepair(project, proposal);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'STALE_REVISION');
    assert.strictEqual(res.project.revision, actualRevision);
    assert.strictEqual(res.project.clips.find(c => c.id === 'clip_sfx_whoosh').startTick, 120000); // zero mutation
  });

  await t.test('CMP-06: Generates valid inverse operation for atomic rollback', () => {
    const project = createBaseProject();
    const startRevision = project.revision;
    const proposal = {
      proposal_id: 'prop-repair-rollback-test',
      finding_id: 'chk-repair-rollback',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_sfx_whoosh',
      target_track_id: 'a1',
      parameters: { target_start_tick: 96000 },
      preconditions: { expected_base_revision: startRevision, current_start_tick: 120000, bounds_valid: true },
      status: 'PLANNED'
    };

    const res = RepairOperationCompiler.executeRepair(project, proposal);
    assert.strictEqual(res.success, true, `Execute failed: ${res.error}`);
    assert.ok(res.inverseOperation, 'Inverse operation generated');
    assert.strictEqual(res.inverseOperation.type, 'move_clip');
    assert.strictEqual(res.inverseOperation.targetTick, 120000);
    assert.strictEqual(res.inverseOperation.expectedBaseRevision, startRevision + 1);

    // Apply inverse operation to roll back
    const rollbackRes = OperationExecutor.execute(res.project, res.inverseOperation);
    assert.strictEqual(rollbackRes.success, true, `Rollback failed: ${rollbackRes.error}`);
    assert.strictEqual(rollbackRes.project.revision, startRevision + 2);
    const revertedClip = rollbackRes.project.clips.find(c => c.id === 'clip_sfx_whoosh');
    assert.strictEqual(revertedClip.startTick, 120000); // successfully reverted back to original position
  });
});
