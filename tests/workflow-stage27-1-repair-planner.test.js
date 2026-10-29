/**
 * Test Suite: Stage 27.1 — Repair Finding Ingestion & Candidate Proposal Engine
 *
 * Verifies:
 * 1. PLN-01: Ingests CHK_EARSHOT_SYNC findings with verifiable source evidence (ARC-27-03).
 * 2. PLN-02: Synchronous retiming math: delta_ticks = -round(delta_t * 120,000) with 0 error (ARC-27-04).
 * 3. PLN-03: Safe bounds rejection on negative start (t_start < 0) without silent clamping (ARC-27-04).
 * 4. PLN-04: Max retiming limit guard (|shift| > 120,000 ticks) rejection (ARC-27-04).
 * 5. PLN-05: Collision detection and track-lock protection (ARC-27-04).
 * 6. PLN-06: Deterministic true-peak attenuation calculation with headroom margin (ARC-27-05).
 * 7. PLN-07: Stale revision guard (rejects findings derived from outdated project revisions) (ARC-27-03).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { AudioRepairPlanner } = require('../src/audio/repair/audio-repair-planner.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

function createMockProject(revision = 1) {
  return {
    schema_version: '1.0.0',
    id: 'test-project-p27',
    revision: revision,
    fps: 30,
    tracks: [
      { id: 'v1', type: 'video', locked: false },
      { id: 'a1', type: 'audio', locked: false },
      { id: 'a2_locked', type: 'audio', locked: true }
    ],
    clips: [
      {
        id: 'clip_sfx_1',
        trackId: 'a1',
        type: 'audio',
        assetId: 'asset_whoosh',
        startTick: 120000, // 1.0s
        durationTicks: 60000, // 0.5s
        audio: { volume: 1.0 }
      },
      {
        id: 'clip_sfx_adjacent',
        trackId: 'a1',
        type: 'audio',
        assetId: 'asset_hit',
        startTick: 200000, // 1.667s
        durationTicks: 40000,
        audio: { volume: 1.0 }
      },
      {
        id: 'clip_locked_track',
        trackId: 'a2_locked',
        type: 'audio',
        assetId: 'asset_locked',
        startTick: 120000,
        durationTicks: 60000,
        audio: { volume: 1.0 }
      }
    ]
  };
}

test('Stage 27.1: Repair Finding Ingestion & Candidate Proposal Engine', async (t) => {
  await t.test('PLN-01: Ingests CHK_EARSHOT_SYNC findings with verifiable source evidence (ARC-27-03)', () => {
    const project = createMockProject(2);
    const checks = [
      {
        id: 'CHK_EARSHOT_SYNC',
        category: 'synchronization',
        status: 'failed',
        severity: 'HIGH',
        measured_value: { max_offset_ms: 150.0, max_offset_ticks: 18000 }
      }
    ];
    const rawResponse = {
      status: 'SUCCESS',
      sync: {
        items: [
          {
            cut_seconds: 1.0,
            sound_onset_seconds: 1.15,
            offset_ms: 150.0,
            offset_ticks: 18000,
            confidence: 0.998
          }
        ]
      }
    };
    const context = {
      project,
      mediaPath: '/tmp/test_master.wav',
      mediaSha256: 'a'.repeat(64),
      targetClipId: 'clip_sfx_1'
    };

    const findings = AudioRepairPlanner.ingestQAChecks(checks, rawResponse, context);
    assert.strictEqual(findings.length, 1);

    const f = findings[0];
    assert.strictEqual(f.type, 'sync_offset');
    assert.strictEqual(f.category, 'synchronization');
    assert.strictEqual(f.source_evidence.project_revision, 2);
    assert.strictEqual(f.source_evidence.media_path, '/tmp/test_master.wav');
    assert.strictEqual(f.source_evidence.clip_id, 'clip_sfx_1');
    assert.strictEqual(f.source_evidence.track_id, 'a1');
    assert.strictEqual(f.measured.offset_ms, 150.0);
    assert.strictEqual(f.measured.offset_ticks, 18000);
    assert.strictEqual(f.measured.confidence, 0.998);
  });

  await t.test('PLN-02: Synchronous retiming math: delta_ticks = -round(delta_t * 120,000) with 0 error (ARC-27-04)', () => {
    const project = createMockProject(1);

    // Case A: Late audio (+150ms / +18,000 ticks) -> requires shift = -18,000 ticks
    const lateFinding = {
      id: 'chk-repair-late',
      type: 'sync_offset',
      source_evidence: { project_revision: 1, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { offset_ms: 150.0, offset_ticks: 18000, confidence: 0.995 }
    };
    const lateProposal = AudioRepairPlanner.planRepair(lateFinding, project);
    assert.strictEqual(lateProposal.status, 'PLANNED');
    assert.strictEqual(lateProposal.strategy, 'SYNC_RETIME');
    assert.strictEqual(lateProposal.parameters.shift_ticks, -18000);
    assert.strictEqual(lateProposal.parameters.target_start_tick, 102000); // 120,000 - 18,000 = 102,000
    assert.strictEqual(lateProposal.preconditions.expected_base_revision, 1);
    assert.strictEqual(lateProposal.preconditions.bounds_valid, true);
    assert.strictEqual(lateProposal.preconditions.collision_free, true);

    // Case B: Early audio (-60ms / -7,200 ticks) -> requires shift = +7,200 ticks
    const earlyFinding = {
      id: 'chk-repair-early',
      type: 'sync_offset',
      source_evidence: { project_revision: 1, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { offset_ms: -60.0, offset_ticks: -7200, confidence: 0.991 }
    };
    const earlyProposal = AudioRepairPlanner.planRepair(earlyFinding, project);
    assert.strictEqual(earlyProposal.status, 'PLANNED');
    assert.strictEqual(earlyProposal.parameters.shift_ticks, 7200);
    assert.strictEqual(earlyProposal.parameters.target_start_tick, 127200); // 120,000 + 7,200 = 127,200
  });

  await t.test('PLN-03: Safe bounds rejection on negative start (t_start < 0) without silent clamping (ARC-27-04)', () => {
    const project = createMockProject(1);
    // Clip starts at 12,000 ticks (0.1s). Desync is +150ms (+18,000 ticks).
    // Required shift: -18,000 ticks -> 12,000 - 18,000 = -6,000 ticks (< 0)
    project.clips[0].startTick = 12000;

    const finding = {
      id: 'chk-repair-negative-start',
      type: 'sync_offset',
      source_evidence: { project_revision: 1, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { offset_ms: 150.0, offset_ticks: 18000 }
    };

    const proposal = AudioRepairPlanner.planRepair(finding, project);
    assert.strictEqual(proposal.status, 'REJECTED');
    assert.ok(proposal.rejection_reason.includes('REJECTION_NEGATIVE_START_BOUNDS'));
    assert.strictEqual(proposal.preconditions.bounds_valid, false);
    assert.strictEqual(proposal.parameters.target_start_tick, -6000);
  });

  await t.test('PLN-04: Max retiming limit guard (|shift| > 120,000 ticks) rejection (ARC-27-04)', () => {
    const project = createMockProject(1);
    project.clips[0].startTick = 300000; // 2.5s

    // Desync is +1.5 seconds (+180,000 ticks) -> exceeds 120,000 tick limit
    const finding = {
      id: 'chk-repair-excessive-shift',
      type: 'sync_offset',
      source_evidence: { project_revision: 1, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { offset_ms: 1500.0, offset_ticks: 180000 }
    };

    const proposal = AudioRepairPlanner.planRepair(finding, project);
    assert.strictEqual(proposal.status, 'REJECTED');
    assert.ok(proposal.rejection_reason.includes('REJECTION_EXCEEDS_MAX_RETIMING_LIMIT'));
  });

  await t.test('PLN-05: Collision detection and track-lock protection (ARC-27-04)', () => {
    const project = createMockProject(1);

    // 1. Collision on adjacent clip
    // clip_sfx_1 is [120,000, 180,000). clip_sfx_adjacent is [200,000, 240,000).
    // Shifting clip_sfx_1 by +30,000 ticks puts it at [150,000, 210,000), colliding with [200,000, 240,000).
    const collideFinding = {
      id: 'chk-repair-collision',
      type: 'sync_offset',
      source_evidence: { project_revision: 1, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { offset_ms: -250.0, offset_ticks: -30000 } // early audio requires +30,000 ticks
    };
    const colProposal = AudioRepairPlanner.planRepair(collideFinding, project);
    assert.strictEqual(colProposal.status, 'REJECTED');
    assert.ok(colProposal.rejection_reason.includes('REJECTION_TRACK_COLLISION'));

    // 2. Locked track rejection
    const lockedFinding = {
      id: 'chk-repair-locked',
      type: 'sync_offset',
      source_evidence: { project_revision: 1, clip_id: 'clip_locked_track', track_id: 'a2_locked' },
      measured: { offset_ms: 50.0, offset_ticks: 6000 }
    };
    const lockedProposal = AudioRepairPlanner.planRepair(lockedFinding, project);
    assert.strictEqual(lockedProposal.status, 'REJECTED');
    assert.ok(lockedProposal.rejection_reason.includes('REJECTION_TRACK_LOCKED'));
  });

  await t.test('PLN-06: Deterministic true-peak attenuation calculation with headroom margin (ARC-27-05)', () => {
    const project = createMockProject(1);
    project.clips[0].audio = { volume: 1.0 };

    // Measured: +1.2 dBTP, Ceiling: -1.0 dBTP -> Excess: 2.2 dB. Margin: 0.5 dB -> Total attenuation: 2.7 dB
    const peakFinding = {
      id: 'chk-repair-peak',
      type: 'true_peak_overflow',
      source_evidence: { project_revision: 1, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { true_peak_dbtp: 1.2, ceiling_dbtp: -1.0 }
    };

    const proposal = AudioRepairPlanner.planRepair(peakFinding, project, { headroomMarginDb: 0.5 });
    assert.strictEqual(proposal.status, 'PLANNED');
    assert.strictEqual(proposal.strategy, 'PEAK_ATTENUATION');
    assert.strictEqual(proposal.parameters.gain_reduction_db, 2.7);

    // 10^(-2.7 / 20) ~= 0.7328
    assert.ok(Math.abs(proposal.parameters.target_linear_volume - 0.733) <= 0.01);
    assert.strictEqual(proposal.parameters.volume_keyframes.length, 2);
  });

  await t.test('PLN-07: Stale revision guard (rejects findings derived from outdated project revisions) (ARC-27-03)', () => {
    const project = createMockProject(5); // current revision is 5

    // Stale finding from revision 4
    const staleFinding = {
      id: 'chk-repair-stale',
      type: 'sync_offset',
      source_evidence: { project_revision: 4, clip_id: 'clip_sfx_1', track_id: 'a1' },
      measured: { offset_ms: 100.0, offset_ticks: 12000 }
    };

    const proposal = AudioRepairPlanner.planRepair(staleFinding, project);
    assert.strictEqual(proposal.status, 'REJECTED');
    assert.ok(proposal.rejection_reason.includes('REJECTION_STALE_REVISION'));
  });
});
