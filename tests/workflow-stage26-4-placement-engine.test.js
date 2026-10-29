/**
 * Test Suite: Workflow Stage 26.4 - Deterministic Role Placement Engine
 *
 * Verifies:
 * - Exact physical transient placement math: t_start = t_cut - round(t_align * 120,000)
 * - Correction B: All operations strictly adhere to canonical EME vocabulary (add_asset, insert_clip)
 * - Correction D: Safe bounds failure on negative start (no silent clamping)
 * - Collision resolution & multi-track auto-allocation
 * - Correction E: Conservative dialogue ducking envelopes
 * - Zero Project Mutation Invariant & sequential Execution via OperationExecutor
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { RolePlacementEngine } = require('../src/audio/sfx/role-placement-engine.js');
const { SoundKitCatalog } = require('../src/audio/sfx/sound-kit-catalog.js');
const { OperationExecutor } = require('../src/engine/operations.js');

function createDummyWav(durationSeconds = 0.5) {
  const sampleRate = 48000;
  const numSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = numSamples * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

function createMockKitDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-placement-test-'));
  const wavPop = createDummyWav(0.28);
  const wavWhoosh = createDummyWav(0.5);

  const sha1Pop = crypto.createHash('sha1').update(wavPop).digest('hex');
  const sha1Whoosh = crypto.createHash('sha1').update(wavWhoosh).digest('hex');

  fs.writeFileSync(path.join(tmpDir, 'pop_1.wav'), wavPop);
  fs.writeFileSync(path.join(tmpDir, 'whoosh-short_1.wav'), wavWhoosh);

  const lock = {
    kit: 1,
    earshot: '0.3.0',
    bank: 'bank-2026.1',
    sr: 48000,
    name: 'placement_mock_kit',
    roles: {
      pop: {
        sound: 'fit/pop/mouth_plop',
        align: 'onset',
        level_db: -3.0,
        takes: [
          {
            file: 'pop_1.wav',
            seed: 1,
            onset_s: 0.01, // 1,200 ticks
            peak_s: 0.02,
            end_s: 0.20,
            dur_s: 0.28, // 33,600 ticks
            peak_db: -1.0,
            lufs_m_max: -21.0,
            sha1: sha1Pop,
            key: 'k-pop',
            checks: []
          }
        ]
      },
      'whoosh.short': {
        sound: 'fit/whoosh.short/bamboo_swish',
        align: 'peak',
        level_db: -8.0,
        takes: [
          {
            file: 'whoosh-short_1.wav',
            seed: 1,
            onset_s: 0.05,
            peak_s: 0.20, // 24,000 ticks
            end_s: 0.45,
            dur_s: 0.50, // 60,000 ticks
            peak_db: -1.0,
            lufs_m_max: -18.0,
            sha1: sha1Whoosh,
            key: 'k-whoosh',
            checks: []
          }
        ]
      }
    }
  };

  fs.writeFileSync(path.join(tmpDir, 'kit.lock.json'), JSON.stringify(lock, null, 2));
  return tmpDir;
}

function createBaseProject() {
  const initRes = OperationExecutor.execute(null, {
    type: 'create_project',
    params: {
      id: 'proj-placement-test',
      fps: 30,
      width: 1920,
      height: 1080,
      durationTicks: 600000 // 5 seconds
    }
  });

  const vTrackRes = OperationExecutor.execute(initRes.project, {
    type: 'add_track',
    params: { id: 'v1', kind: 'visual', zIndex: 0 }
  });

  const clip1Res = OperationExecutor.execute(vTrackRes.project, {
    type: 'insert_clip',
    params: { id: 'clip-v1', trackId: 'v1', type: 'video', startTick: 0, durationTicks: 120000 }
  });

  const clip2Res = OperationExecutor.execute(clip1Res.project, {
    type: 'insert_clip',
    params: { id: 'clip-v2', trackId: 'v1', type: 'video', startTick: 120000, durationTicks: 120000 }
  });

  return clip2Res.project;
}

describe('Stage 26.4: Deterministic Role Placement Engine', () => {
  let kitDir;
  let catalog;
  let engine;

  it('Setup: Initialize catalog and placement engine', () => {
    kitDir = createMockKitDir();
    catalog = new SoundKitCatalog({ kitDir }).load();
    engine = new RolePlacementEngine({ catalog });
    assert.ok(catalog.isLoaded);
  });

  it('PLC-01: Frame-accurate transient alignment math for cuts and reveals', () => {
    const project = createBaseProject();

    // Cue 1: whoosh.short on cut at t = 120,000 ticks (1.0s)
    // Whoosh peak_s = 0.20s -> 24,000 ticks.
    // Expected startTick = 120,000 - 24,000 = 96,000 ticks.
    //
    // Cue 2: pop on reveal at t = 240,000 ticks (2.0s)
    // Pop onset_s = 0.01s -> 1,200 ticks.
    // Expected startTick = 240,000 - 1,200 = 238,800 ticks.
    const cues = [
      { role: 'whoosh.short', eventTick: 120000 },
      { role: 'pop', eventTick: 240000 }
    ];

    const proposal = engine.planPlacements(project, cues);
    assert.equal(proposal.success, true);
    assert.equal(proposal.placedCues.length, 2);

    const whooshPlacement = proposal.placedCues.find(p => p.role === 'whoosh.short');
    assert.equal(whooshPlacement.startTick, 96000);
    assert.equal(whooshPlacement.durationTicks, 60000);
    assert.equal(whooshPlacement.eventTick, 120000);

    const popPlacement = proposal.placedCues.find(p => p.role === 'pop');
    assert.equal(popPlacement.startTick, 238800);
    assert.equal(popPlacement.durationTicks, 33600);
    const whooshTake = catalog.selectTake('whoosh.short', { takeIndex: 0 });
    const theoreticalWhoosh = 120000 - Math.round(whooshTake.peak_s * 120000);
    const whooshErrorTicks = Math.abs(whooshPlacement.startTick - theoreticalWhoosh);
    assert.ok(whooshErrorTicks <= 10, `Whoosh placement calculation error ${whooshErrorTicks} ticks exceeds ±10 ticks tolerance`);
    assert.equal(whooshErrorTicks, 0, `Exact integer tick placement math achieves 0-tick error`);

    const popTake = catalog.selectTake('pop', { takeIndex: 0 });
    const theoreticalPop = 240000 - Math.round(popTake.onset_s * 120000);
    const popErrorTicks = Math.abs(popPlacement.startTick - theoreticalPop);
    assert.ok(popErrorTicks <= 10, `Pop placement calculation error ${popErrorTicks} ticks exceeds ±10 ticks tolerance`);
    assert.equal(popErrorTicks, 0, `Exact integer tick placement math achieves 0-tick error`);

    // Verify operations vocabulary (Correction B): only add_track, add_asset, insert_clip
    const opTypes = proposal.operations.map(o => o.type);
    for (const t of opTypes) {
      assert.ok(['add_track', 'add_asset', 'insert_clip'].includes(t), `Unsupported op type: ${t}`);
    }
  });

  it('PLC-02: Safe bounds failure on negative start (Correction D - no silent clamping)', () => {
    const project = createBaseProject();

    // Event at t = 5,000 ticks (< whoosh peak 24,000 ticks) -> startTick = -19,000 ticks < 0
    const earlyCue = [{ role: 'whoosh.short', eventTick: 5000 }];

    // Strict mode: must reject
    const proposalStrict = engine.planPlacements(project, earlyCue, { strictBounds: true });
    assert.equal(proposalStrict.success, false);
    assert.ok(proposalStrict.error.includes('Placement bounds error'));
    assert.ok(proposalStrict.diagnostics.some(d => d.code === 'PLACEMENT_BOUNDS_ERROR'));

    // Non-strict skip mode: must skip without clamping
    const proposalSkip = engine.planPlacements(project, earlyCue, { onNegativeStart: 'skip' });
    assert.equal(proposalSkip.success, true);
    assert.equal(proposalSkip.placedCues.length, 0); // Safely skipped
  });

  it('PLC-03: Collision resolution with multi-track auto-allocation', () => {
    const project = createBaseProject();

    // Two whooshes on overlapping intervals: cut at 120,000 and cut at 140,000
    // Whoosh 1: [96,000, 156,000]
    // Whoosh 2: [116,000, 176,000] -> Collision!
    const overlappingCues = [
      { id: 'w1', role: 'whoosh.short', eventTick: 120000 },
      { id: 'w2', role: 'whoosh.short', eventTick: 140000 }
    ];

    const proposal = engine.planPlacements(project, overlappingCues, { autoTrackAllocation: true });
    assert.equal(proposal.success, true);
    assert.equal(proposal.placedCues.length, 2);

    // One whoosh placed on primary track, second placed on allocated secondary track
    const tracks = proposal.placedCues.map(c => c.trackId);
    assert.notEqual(tracks[0], tracks[1], 'Overlapping cues must be allocated to separate tracks');

    // Without auto-allocation, should fail with collision error
    const proposalNoAuto = engine.planPlacements(project, overlappingCues, { autoTrackAllocation: false });
    assert.equal(proposalNoAuto.success, false);
    assert.ok(proposalNoAuto.error.includes('Track collision'));
  });

  it('PLC-04: Conservative dialogue ducking envelopes (Correction E)', () => {
    const project = createBaseProject();

    // Whoosh at [96,000, 156,000]
    const cues = [{ role: 'whoosh.short', eventTick: 120000 }];

    // Dialogue speech occurs from [100,000, 150,000]
    const dialogueIntervals = [{ startTick: 100000, endTick: 150000 }];

    const proposal = engine.planPlacements(project, cues, { dialogueIntervals, duckingGainDb: -6.0 });
    assert.equal(proposal.success, true);

    const envOp = proposal.operations.find(o => o.type === 'set_audio_envelope');
    assert.ok(envOp, 'Expected set_audio_envelope operation for ducked SFX clip');
    assert.ok(proposal.diagnostics.some(d => d.code === 'DIALOGUE_DUCKED'));
  });

  it('PLC-05: Sequential atomic execution through canonical OperationExecutor', () => {
    const project = createBaseProject();
    const initialRev = project.revision;

    const cues = [
      { role: 'whoosh.short', eventTick: 120000 },
      { role: 'pop', eventTick: 240000 }
    ];

    const proposal = engine.planPlacements(project, cues);
    assert.equal(proposal.success, true);

    const execResult = engine.executeProposal(project, proposal);
    assert.equal(execResult.success, true, `Execution failed: ${execResult.error}`);

    const finalProject = execResult.project;
    assert.ok(finalProject.revision > initialRev);

    // Verify clips placed in project
    const audioClips = finalProject.clips.filter(c => c.type === 'audio');
    assert.equal(audioClips.length, 2);

    // Verify assets registered in project
    const audioAssets = finalProject.assets.filter(a => a.type === 'audio');
    assert.equal(audioAssets.length, 2);

    // Verify original project state was untouched (immutability)
    assert.equal(project.clips.filter(c => c.type === 'audio').length, 0);
  });

  it('PLC-06: Editorial cut auto-discovery from visual track', () => {
    const project = createBaseProject();
    // Visual clips: clip-v1 [0, 120000], clip-v2 [120000, 240000]
    // Cut point between them is at 120,000
    const discovered = engine.discoverEditorialCues(project);
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].eventTick, 120000);
    assert.equal(discovered[0].role, 'whoosh.short');
  });

  it('Teardown: Clean up mock kit directory', () => {
    if (kitDir && fs.existsSync(kitDir)) {
      fs.rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
