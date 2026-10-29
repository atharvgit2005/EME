/**
 * Test Suite: Stage 28.1 — Repair Conflict Detector & Dependency Graph
 *
 * Verifies the 7 discrete subtests mandated by Architecture Lead in Phase 28 Kickoff:
 * 1. CFT-01: Validates compliant repair policy schema (Draft 2020-12) & rejects invalid policies.
 * 2. CFT-02: Same-track interval collision detection with half-open intervals [start, end).
 * 3. CFT-03: Same-clip property interference detection (competing gains/keyframes).
 * 4. CFT-04: Independent safe proposal partitioning across disjoint tracks and intervals.
 * 5. CFT-05: Deterministic total ordering & DAG (SYNC_RETIME < PEAK_ATTENUATION, start tick, tie-breakers).
 * 6. CFT-06: Cyclic dependency and mutual exclusion rejection (NEEDS_RECONCILIATION).
 * 7. CFT-07: Stale revision and locked-track rejection.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RepairConflictDetector } = require('../src/audio/repair/repair-conflict-detector.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

function createBaseProject(revision = 1) {
  return {
    schema_version: '1.0.0',
    id: 'test-project-phase28',
    revision: revision,
    fps: 30,
    tracks: [
      { id: 'v1', type: 'video', locked: false },
      { id: 'a1_dialogue', type: 'audio', locked: false },
      { id: 'a2_sfx', type: 'audio', locked: false },
      { id: 'a3_locked', type: 'audio', locked: true }
    ],
    clips: [
      {
        id: 'clip_a1_dial',
        trackId: 'a1_dialogue',
        type: 'audio',
        assetId: 'asset_dial_1',
        startTick: 120000, // 1.0s
        durationTicks: 120000, // 1.0s [120000, 240000)
        audio: { volume: 1.0 }
      },
      {
        id: 'clip_a2_sfx1',
        trackId: 'a2_sfx',
        type: 'audio',
        assetId: 'asset_whoosh',
        startTick: 240000, // 2.0s
        durationTicks: 60000, // 0.5s [240000, 300000)
        audio: { volume: 1.0 }
      },
      {
        id: 'clip_a2_sfx2',
        trackId: 'a2_sfx',
        type: 'audio',
        assetId: 'asset_hit',
        startTick: 360000, // 3.0s
        durationTicks: 60000, // 0.5s [360000, 420000)
        audio: { volume: 1.0 }
      },
      {
        id: 'clip_locked',
        trackId: 'a3_locked',
        type: 'audio',
        assetId: 'asset_locked_ambient',
        startTick: 0,
        durationTicks: 240000,
        audio: { volume: 1.0 }
      }
    ]
  };
}

test('Stage 28.1: Proposal Conflict Detector & Dependency Graph', async (t) => {
  // CFT-01
  await t.test('CFT-01: Validates compliant repair policy schema & rejects invalid policies (ARC-28-07)', () => {
    // 1. Valid default policy
    const defaultPolicy = RepairConflictDetector.getDefaultPolicy();
    const valDefault = RepairConflictDetector.validatePolicy(defaultPolicy);
    assert.strictEqual(valDefault.valid, true, 'Default policy must be valid');
    assert.strictEqual(valDefault.errors.length, 0);

    // 2. Reject policy with unsupported interval semantics
    const invalidPolicySemantics = {
      ...defaultPolicy,
      conflict_rules: {
        ...defaultPolicy.conflict_rules,
        interval_semantics: 'CLOSED_INTERVAL'
      }
    };
    const valSemantics = RepairConflictDetector.validatePolicy(invalidPolicySemantics);
    assert.strictEqual(valSemantics.valid, false);
    assert.ok(valSemantics.errors.some(e => e.includes('interval_semantics')));

    // 3. Reject policy missing convergence bounds
    const invalidMissingBounds = {
      policy_version: '1.0.0',
      conflict_rules: defaultPolicy.conflict_rules,
      priority_rules: defaultPolicy.priority_rules
    };
    const valMissing = RepairConflictDetector.validatePolicy(invalidMissingBounds);
    assert.strictEqual(valMissing.valid, false);
    assert.ok(valMissing.errors.some(e => e.includes('convergence_bounds')));

    // 4. Reject policy with max_passes out of range
    const invalidMaxPasses = {
      ...defaultPolicy,
      convergence_bounds: {
        ...defaultPolicy.convergence_bounds,
        max_passes: 0
      }
    };
    const valPasses = RepairConflictDetector.validatePolicy(invalidMaxPasses);
    assert.strictEqual(valPasses.valid, false);
    assert.ok(valPasses.errors.some(e => e.includes('max_passes')));
  });

  // CFT-02
  await t.test('CFT-02: Same-track interval collision detection with half-open intervals [start, end) (ARC-28-01)', () => {
    // 1. Math verification: Overlap vs Abutment
    // [100, 200) and [150, 250) overlap
    assert.strictEqual(RepairConflictDetector.intervalsOverlap(100, 100, 150, 100), true);
    // [100, 200) and [200, 300) abut (endA === startB) -> NO OVERLAP
    assert.strictEqual(RepairConflictDetector.intervalsOverlap(100, 100, 200, 100), false);
    assert.strictEqual(RepairConflictDetector.intervalsAdjacent(100, 100, 200, 100), true);

    // 2. Project timeline collision scenario:
    // a2_sfx has clip_a2_sfx1 at [240000, 300000) and clip_a2_sfx2 at [360000, 420000)
    // Proposal shifts clip_a2_sfx2 earlier by -90,000 ticks:
    // target start = 360000 - 90000 = 270000 ticks -> interval [270000, 330000)
    // Overlaps with clip_a2_sfx1 [240000, 300000) on [270000, 300000)!
    const project = createBaseProject(1);
    const collidingProposal = {
      proposal_id: 'prop-repair-shift-collide',
      finding_id: 'chk-repair-sync-1',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a2_sfx2',
      target_track_id: 'a2_sfx',
      parameters: {
        shift_ticks: -90000,
        target_start_tick: 270000
      },
      preconditions: {
        expected_base_revision: 1,
        current_start_tick: 360000,
        bounds_valid: true
      },
      status: 'PROPOSED'
    };

    const conflicts = RepairConflictDetector.detectTimelineAndRevisionConflicts(project, [collidingProposal]);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].conflict_type, 'CLIP_OVERLAP');
    assert.deepStrictEqual(conflicts[0].clip_ids, ['clip_a2_sfx1', 'clip_a2_sfx2']);
    assert.strictEqual(conflicts[0].track_id, 'a2_sfx');
    assert.strictEqual(conflicts[0].overlap_interval.start_tick, 270000);
    assert.strictEqual(conflicts[0].overlap_interval.end_tick, 300000);

    // 3. Abutting shift scenario:
    // Shift clip_a2_sfx2 to exactly 300000 ticks -> interval [300000, 360000)
    // Abuts clip_a2_sfx1 [240000, 300000) -> NO conflict!
    const abuttingProposal = {
      proposal_id: 'prop-repair-shift-abut',
      finding_id: 'chk-repair-sync-2',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a2_sfx2',
      target_track_id: 'a2_sfx',
      parameters: {
        shift_ticks: -60000,
        target_start_tick: 300000
      },
      preconditions: {
        expected_base_revision: 1,
        current_start_tick: 360000,
        bounds_valid: true
      },
      status: 'PROPOSED'
    };

    const abuttingConflicts = RepairConflictDetector.detectTimelineAndRevisionConflicts(project, [abuttingProposal]);
    assert.strictEqual(abuttingConflicts.length, 0, 'Abutting intervals must not produce collision conflicts');
  });

  // CFT-03
  await t.test('CFT-03: Same-clip property interference detection (ARC-28-01)', () => {
    // Two competing peak attenuation proposals targeting clip_a1_dial
    const prop1 = {
      proposal_id: 'prop-repair-peak-1',
      finding_id: 'chk-repair-peak-1',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a1_dial',
      target_track_id: 'a1_dialogue',
      parameters: { gain_reduction_db: 3.5, target_linear_volume: 0.668 },
      preconditions: { expected_base_revision: 1, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };
    const prop2 = {
      proposal_id: 'prop-repair-peak-2',
      finding_id: 'chk-repair-peak-2',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a1_dial',
      target_track_id: 'a1_dialogue',
      parameters: { gain_reduction_db: 6.0, target_linear_volume: 0.501 },
      preconditions: { expected_base_revision: 1, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const conflicts = RepairConflictDetector.detectPropertyInterference([prop1, prop2]);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].conflict_type, 'SAME_CLIP_PROPERTY_CONFLICT');
    assert.strictEqual(conflicts[0].property, 'audio_volume');
    assert.deepStrictEqual(conflicts[0].proposal_ids, ['prop-repair-peak-1', 'prop-repair-peak-2']);
  });

  // CFT-04
  await t.test('CFT-04: Independent safe proposal partitioning across disjoint tracks and intervals (ARC-28-01)', () => {
    const project = createBaseProject(1);

    // Proposal 1 on a1_dialogue
    const propDial = {
      proposal_id: 'prop-repair-dial-gain',
      finding_id: 'chk-repair-dial-peak',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a1_dial',
      target_track_id: 'a1_dialogue',
      parameters: { gain_reduction_db: 2.0 },
      preconditions: { expected_base_revision: 1, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };

    // Proposal 2 on a2_sfx: Retime sfx2 to 380,000 ticks (well clear of sfx1 at 240,000-300,000)
    const propSfx = {
      proposal_id: 'prop-repair-sfx-retime',
      finding_id: 'chk-repair-sfx-sync',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a2_sfx2',
      target_track_id: 'a2_sfx',
      parameters: { shift_ticks: 20000, target_start_tick: 380000 },
      preconditions: { expected_base_revision: 1, current_start_tick: 360000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const partition = RepairConflictDetector.partitionProposals(project, [propDial, propSfx]);
    assert.strictEqual(partition.status, 'CLEAN');
    assert.strictEqual(partition.reconciliation_required, false);
    assert.strictEqual(partition.independent_safe.length, 2);
    assert.strictEqual(partition.resolvable_sequential.length, 0);
    assert.strictEqual(partition.unresolvable_conflicts.length, 0);
    assert.strictEqual(partition.conflicts.length, 0);
  });

  // CFT-05
  await t.test('CFT-05: Deterministic total ordering & DAG (SYNC_RETIME < PEAK_ATTENUATION, start tick, tie-breakers) (ARC-28-02)', () => {
    const project = createBaseProject(1);

    const pPeakLate = {
      proposal_id: 'prop-c-peak-late',
      finding_id: 'f1',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a2_sfx2', // startTick 360000
      target_track_id: 'a2_sfx',
      parameters: { gain_reduction_db: 1.0 },
      preconditions: { expected_base_revision: 1, current_start_tick: 360000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const pPeakEarly = {
      proposal_id: 'prop-b-peak-early',
      finding_id: 'f2',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a1_dial', // startTick 120000
      target_track_id: 'a1_dialogue',
      parameters: { gain_reduction_db: 1.5 },
      preconditions: { expected_base_revision: 1, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const pRetimeLate = {
      proposal_id: 'prop-d-retime-late',
      finding_id: 'f3',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a2_sfx2', // target start 360000
      target_track_id: 'a2_sfx',
      parameters: { shift_ticks: 0, target_start_tick: 360000 },
      preconditions: { expected_base_revision: 1, current_start_tick: 360000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const pRetimeEarly = {
      proposal_id: 'prop-a-retime-early',
      finding_id: 'f4',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_a1_dial', // target start 120000
      target_track_id: 'a1_dialogue',
      parameters: { shift_ticks: 0, target_start_tick: 120000 },
      preconditions: { expected_base_revision: 1, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const inputProposals = [pPeakLate, pPeakEarly, pRetimeLate, pRetimeEarly];

    // Build DAG and ordering
    const result1 = RepairConflictDetector.buildDependencyDAG(inputProposals, project);
    const orderedIds = result1.ordered_proposals.map(p => p.proposal_id);

    // Expected order:
    // 1. SYNC_RETIME early (prop-a-retime-early, 120000 ticks)
    // 2. SYNC_RETIME late (prop-d-retime-late, 360000 ticks)
    // 3. PEAK_ATTENUATION early (prop-b-peak-early, 120000 ticks)
    // 4. PEAK_ATTENUATION late (prop-c-peak-late, 360000 ticks)
    assert.deepStrictEqual(orderedIds, [
      'prop-a-retime-early',
      'prop-d-retime-late',
      'prop-b-peak-early',
      'prop-c-peak-late'
    ]);

    // Test repeatability and stability under permutations: run 50 random shuffles
    for (let i = 0; i < 50; i++) {
      const shuffled = [...inputProposals].sort(() => Math.random() - 0.5);
      const res = RepairConflictDetector.buildDependencyDAG(shuffled, project);
      const resIds = res.ordered_proposals.map(p => p.proposal_id);
      assert.deepStrictEqual(resIds, orderedIds, `Ordering must be 100% deterministic on shuffle #${i}`);
    }
  });

  // CFT-06
  await t.test('CFT-06: Cyclic dependency and mutual exclusion rejection (NEEDS_RECONCILIATION) (ARC-28-02)', () => {
    // Simulate a cyclic dependency on the same track:
    // Clip A is at [120000, 180000). Clip B is at [180000, 240000).
    // Proposal A attempts to move Clip A to [180000, 240000) (into Clip B's spot).
    // Proposal B attempts to move Clip B to [120000, 180000) (into Clip A's spot).
    // Without intermediate parking, A requires B to move, and B requires A to move -> CYCLE!
    const cyclicProject = {
      schema_version: '1.0.0',
      id: 'test-project-cyclic',
      revision: 1,
      fps: 30,
      tracks: [{ id: 'a1', type: 'audio', locked: false }],
      clips: [
        { id: 'clip_swap_a', trackId: 'a1', type: 'audio', startTick: 120000, durationTicks: 60000 },
        { id: 'clip_swap_b', trackId: 'a1', type: 'audio', startTick: 180000, durationTicks: 60000 }
      ]
    };

    const propA = {
      proposal_id: 'prop-swap-a-into-b',
      finding_id: 'f_swap_a',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_swap_a',
      target_track_id: 'a1',
      parameters: { shift_ticks: 60000, target_start_tick: 180000 },
      preconditions: { expected_base_revision: 1, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const propB = {
      proposal_id: 'prop-swap-b-into-a',
      finding_id: 'f_swap_b',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_swap_b',
      target_track_id: 'a1',
      parameters: { shift_ticks: -60000, target_start_tick: 120000 },
      preconditions: { expected_base_revision: 1, current_start_tick: 180000, bounds_valid: true },
      status: 'PROPOSED'
    };

    const partition = RepairConflictDetector.partitionProposals(cyclicProject, [propA, propB]);
    assert.strictEqual(partition.status, 'CONFLICT_DETECTED');
    assert.strictEqual(partition.reconciliation_required, true);
    assert.ok(partition.unresolvable_conflicts.length > 0);
    assert.ok(partition.conflicts.some(c => c.conflict_type === 'CYCLIC_DEPENDENCY' || c.conflict_type === 'CLIP_OVERLAP'));
  });

  // CFT-07
  await t.test('CFT-07: Stale revision and locked-track rejection (ARC-28-01 / ARC-28-07)', () => {
    const project = createBaseProject(5); // project is at revision 5

    // Proposal 1 has expected_base_revision 4 (stale)
    const staleProposal = {
      proposal_id: 'prop-stale-rev',
      finding_id: 'chk-stale',
      strategy: 'PEAK_ATTENUATION',
      target_clip_id: 'clip_a1_dial',
      target_track_id: 'a1_dialogue',
      parameters: { gain_reduction_db: 1.0 },
      preconditions: { expected_base_revision: 4, current_start_tick: 120000, bounds_valid: true },
      status: 'PROPOSED'
    };

    // Proposal 2 targets clip on locked track a3_locked
    const lockedTrackProposal = {
      proposal_id: 'prop-locked-track',
      finding_id: 'chk-locked',
      strategy: 'SYNC_RETIME',
      target_clip_id: 'clip_locked',
      target_track_id: 'a3_locked',
      parameters: { shift_ticks: 1000, target_start_tick: 1000 },
      preconditions: { expected_base_revision: 5, current_start_tick: 0, bounds_valid: true },
      status: 'PROPOSED'
    };

    const partition = RepairConflictDetector.partitionProposals(project, [staleProposal, lockedTrackProposal]);
    assert.strictEqual(partition.status, 'CONFLICT_DETECTED');
    assert.strictEqual(partition.reconciliation_required, true);
    assert.strictEqual(partition.unresolvable_conflicts.length, 2);

    const staleConflict = partition.conflicts.find(c => c.conflict_type === 'STALE_REVISION');
    assert.ok(staleConflict, 'Must detect STALE_REVISION');
    assert.strictEqual(staleConflict.proposal_ids[0], 'prop-stale-rev');

    const lockedConflict = partition.conflicts.find(c => c.conflict_type === 'TRACK_LOCKED');
    assert.ok(lockedConflict, 'Must detect TRACK_LOCKED');
    assert.strictEqual(lockedConflict.proposal_ids[0], 'prop-locked-track');
  });
});
