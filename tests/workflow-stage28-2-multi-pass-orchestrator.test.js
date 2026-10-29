/**
 * Test Suite: Stage 28.2 — Multi-Pass Repair Orchestrator & Bounded Pass Engine
 *
 * Verifies the 6 discrete subtests mandated by Architecture Lead in Stage 28.2 Ruling:
 * 1. MPS-01: Enforces the 3-cycle limit and terminates successfully when all required checks pass.
 * 2. MPS-02: Fresh findings ingestion: Pass (k+1) consumes fresh findings from Pass (k)'s render.
 * 3. MPS-03: Monotonic revision progression (R -> R+1 -> R+2) and strict revision fencing.
 * 4. MPS-04: Pass budget exhaustion (MAX_PASSES_EXCEEDED) halts safely without promotion when defects persist.
 * 5. MPS-05: Existing active delivery remains completely unchanged until final verified promotion.
 * 6. MPS-06: Reverse-order inverse execution on multi-pass failure, verified candidate-state recovery,
 *            monotonic revision progression, and correct handling of rollback failure (ARC-28-12).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { MultiPassRepairOrchestrator } = require('../src/audio/repair/multi-pass-orchestrator.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

const { OperationExecutor } = require('../src/engine/operations.js');

function createTestProject(baseRevision = null) {
  let project = OperationExecutor.execute(null, {
    type: 'create_project',
    params: {
      id: 'proj-multipass-test',
      fps: 30,
      width: 1920,
      height: 1080,
      durationTicks: 480000
    }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: {
      id: 'asset_vo',
      type: 'audio',
      src: '/tmp/dummy_vo.wav',
      metadata: { durationSec: 2.0 }
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
    params: { id: 'a1_dialogue', kind: 'audio', zIndex: 1 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'add_track',
    params: { id: 'a2_sfx', kind: 'audio', zIndex: 2 }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip_vo',
      trackId: 'a1_dialogue',
      source: { assetId: 'asset_vo' },
      type: 'audio',
      startTick: 120000,
      durationTicks: 120000
    }
  }).project;

  project = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip_sfx',
      trackId: 'a2_sfx',
      source: { assetId: 'asset_sfx' },
      type: 'audio',
      startTick: 240000,
      durationTicks: 60000
    }
  }).project;

  if (typeof baseRevision === 'number') {
    project.revision = baseRevision;
  }

  return project;
}

function createDummyWav(filePath) {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(48000, 24); // 48kHz
  buf.writeUInt32LE(96000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(0, 40);
  fs.writeFileSync(filePath, buf);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

test('Stage 28.2: Multi-Pass Repair Orchestrator & Bounded Pass Engine', async (t) => {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-test-stage28-2-'));

  t.after(() => {
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (e) {}
  });

  // MPS-01
  await t.test('MPS-01: Enforces 3-cycle limit and terminates successfully when all defects pass (ARC-28-09)', async () => {
    const project = createTestProject(1);
    const activeMediaPath = path.join(scratchDir, 'active-delivery-1.wav');
    const activeSha = createDummyWav(activeMediaPath);

    const activeDelivery = {
      delivery_run_id: 'del-initial-001',
      media_path: activeMediaPath,
      media_sha256: activeSha,
      sha256: activeSha,
      revision: 1,
      status: 'ACTIVE'
    };

    // Mock renderFn that writes a valid dummy wav
    const renderFn = (proj, outPath) => {
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    // Mock QA generator:
    // Pass 1: detects desync on clip_vo (offset 150ms -> -18000 ticks)
    // Pass 2: clean! 0 defects
    const mockQaGenerator = (pass, render, proj) => {
      if (pass === 1) {
        return {
          checks: [
            {
              id: 'CHK_EARSHOT_SYNC',
              category: 'synchronization',
              status: 'failed',
              severity: 'HIGH',
              measured_value: { max_offset_ms: 150.0, max_offset_ticks: 18000 }
            }
          ],
          rawResponse: {
            status: 'SUCCESS',
            sync: {
              items: [
                {
                  cut_seconds: 1.0,
                  sound_onset_seconds: 1.15,
                  offset_ms: 150.0,
                  offset_ticks: 18000,
                  confidence: 0.99
                }
              ]
            }
          }
        };
      }
      // Pass 2 is completely clean
      return {
        checks: [
          {
            id: 'CHK_EARSHOT_SYNC',
            category: 'synchronization',
            status: 'passed',
            severity: 'INFO',
            measured_value: { max_offset_ms: 5.0, max_offset_ticks: 600 }
          }
        ],
        rawResponse: { status: 'SUCCESS', sync: { items: [] } }
      };
    };

    const orchestrator = new MultiPassRepairOrchestrator({
      renderFn,
      maxPasses: 3
    });

    const result = await orchestrator.orchestrateMultiPassRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'PROMOTED');
    assert.strictEqual(result.promoted, true);
    assert.strictEqual(result.passes, 2, 'Must terminate on Pass 2 once defects are resolved');
    assert.strictEqual(result.project.revision, 2, 'Revision must advance to 2');

    // Verify retimed clip in promoted candidate
    const retimedClip = result.project.clips.find(c => c.id === 'clip_vo');
    assert.strictEqual(retimedClip.startTick, 102000, 'Clip startTick must shift by -18,000 ticks (120,000 -> 102,000)');

    // Verify promoted active delivery
    assert.strictEqual(result.activeDelivery.status, 'ACTIVE');
    assert.strictEqual(result.activeDelivery.revision, 2);
    assert.strictEqual(result.activeDelivery.previous_delivery_run_id, 'del-initial-001');
  });

  // MPS-02
  await t.test('MPS-02: Fresh findings ingestion: Pass (k+1) consumes fresh findings from Pass (k)\'s render (ARC-28-10)', async () => {
    const project = createTestProject(1);
    const activeMediaPath = path.join(scratchDir, 'active-delivery-2.wav');
    const activeSha = createDummyWav(activeMediaPath);

    const activeDelivery = {
      delivery_run_id: 'del-initial-002',
      media_path: activeMediaPath,
      media_sha256: activeSha,
      sha256: activeSha,
      revision: 1,
      status: 'ACTIVE'
    };

    const renderFn = (proj, outPath) => {
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    const ingestedRenders = [];

    // Pass 1: Desync defect on clip_vo
    // Pass 2: True peak defect on clip_sfx (revealed after Pass 1 render)
    // Pass 3: Clean!
    const mockQaGenerator = (pass, render, proj) => {
      ingestedRenders.push({ pass, outputPath: render.outputPath, revision: render.revision });

      if (pass === 1) {
        return {
          checks: [
            {
              id: 'CHK_EARSHOT_SYNC',
              category: 'synchronization',
              status: 'failed',
              measured_value: { max_offset_ms: 100.0, max_offset_ticks: 12000 }
            }
          ],
          rawResponse: {
            sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 1.1, offset_ms: 100.0, offset_ticks: 12000 }] }
          }
        };
      } else if (pass === 2) {
        return {
          checks: [
            {
              id: 'CHK_EARSHOT_TRUE_PEAK',
              category: 'audio_integrity',
              status: 'failed',
              measured_value: { true_peak_dbtp: 1.5, ceiling_dbtp: -1.0 }
            }
          ],
          rawResponse: { true_peak: { measured_dbtp: 1.5, ceiling_dbtp: -1.0, attenuation_needed_db: 3.0 } }
        };
      }

      // Pass 3 clean
      return {
        checks: [],
        rawResponse: {}
      };
    };

    const orchestrator = new MultiPassRepairOrchestrator({ renderFn, maxPasses: 3 });
    const result = await orchestrator.orchestrateMultiPassRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.passes, 3);
    assert.strictEqual(ingestedRenders.length, 3);

    // Verify distinct renders per pass
    assert.strictEqual(ingestedRenders[0].pass, 1);
    assert.strictEqual(ingestedRenders[1].pass, 2);
    assert.strictEqual(ingestedRenders[2].pass, 3);
    assert.notStrictEqual(ingestedRenders[0].outputPath, ingestedRenders[1].outputPath);
    assert.notStrictEqual(ingestedRenders[1].outputPath, ingestedRenders[2].outputPath);

    // Verify journal records fresh finding ingestion events bound to candidate revisions
    const findingEvents = result.journal.filter(e => e.stage === 'FINDINGS_INGESTED');
    assert.strictEqual(findingEvents.length, 3);
  });

  // MPS-03
  await t.test('MPS-03: Monotonic revision progression (R -> R+1 -> R+2) and strict revision fencing (ARC-28-10)', async () => {
    const project = createTestProject(5); // Start at rev 5
    const activeMediaPath = path.join(scratchDir, 'active-delivery-3.wav');
    const activeSha = createDummyWav(activeMediaPath);

    const activeDelivery = {
      delivery_run_id: 'del-initial-003',
      media_path: activeMediaPath,
      media_sha256: activeSha,
      sha256: activeSha,
      revision: 5,
      status: 'ACTIVE'
    };

    const renderFn = (proj, outPath) => {
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    const revisionsSeen = [];
    const mockQaGenerator = (pass, render, proj) => {
      revisionsSeen.push(proj.revision);
      if (pass === 1) {
        return {
          checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 50.0, max_offset_ticks: 6000 } }],
          rawResponse: { sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 1.05, offset_ms: 50.0, offset_ticks: 6000 }] } }
        };
      }
      return { checks: [], rawResponse: {} };
    };

    const orchestrator = new MultiPassRepairOrchestrator({ renderFn, maxPasses: 3 });
    const result = await orchestrator.orchestrateMultiPassRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(revisionsSeen[0], 5, 'Pass 1 evaluates rev 5');
    assert.strictEqual(revisionsSeen[1], 6, 'Pass 2 evaluates rev 6');
    assert.strictEqual(result.project.revision, 6, 'Monotonic progression: 5 -> 6');
  });

  // MPS-04
  await t.test('MPS-04: Pass budget exhaustion (MAX_PASSES_EXCEEDED) halts safely without promotion when defects persist (ARC-28-09)', async () => {
    const project = createTestProject(1);
    const activeMediaPath = path.join(scratchDir, 'active-delivery-4.wav');
    const activeSha = createDummyWav(activeMediaPath);

    const activeDelivery = {
      delivery_run_id: 'del-initial-004',
      media_path: activeMediaPath,
      media_sha256: activeSha,
      sha256: activeSha,
      revision: 1,
      status: 'ACTIVE'
    };

    const renderFn = (proj, outPath) => {
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    // Defect that persists across passes with diminishing follow-up offsets
    const mockQaGenerator = (pass, render, proj) => {
      const offsetMs = pass === 1 ? 100.0 : (pass === 2 ? 50.0 : 25.0);
      const offsetTicks = Math.round((offsetMs / 1000) * TICKS_PER_SECOND);
      return {
        checks: [
          {
            id: 'CHK_EARSHOT_SYNC',
            category: 'synchronization',
            status: 'failed',
            severity: 'HIGH',
            measured_value: { max_offset_ms: offsetMs, max_offset_ticks: offsetTicks }
          }
        ],
        rawResponse: {
          sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 1.0 + (offsetMs / 1000), offset_ms: offsetMs, offset_ticks: offsetTicks }] }
        }
      };
    };

    const orchestrator = new MultiPassRepairOrchestrator({ renderFn, maxPasses: 3 });
    const result = await orchestrator.orchestrateMultiPassRepair({
      project,
      activeDelivery,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(result.termination_reason, 'MAX_PASSES_EXCEEDED');
    assert.strictEqual(result.promoted, false);
    assert.strictEqual(result.passes_attempted, 3);
    assert.ok(result.quarantinedCandidate);
    assert.strictEqual(result.quarantinedCandidate.status, 'QUARANTINED');

    // Active delivery MUST remain 100% untouched
    assert.strictEqual(result.activeDelivery.delivery_run_id, 'del-initial-004');
    assert.strictEqual(result.activeDelivery.revision, 1);
  });

  // MPS-05
  await t.test('MPS-05: Existing active delivery remains completely unchanged until final verified promotion (ARC-28-08 & ARC-28-13)', async () => {
    const project = createTestProject(1);
    const activeMediaPath = path.join(scratchDir, 'active-delivery-5.wav');
    const activeSha = createDummyWav(activeMediaPath);

    const originalActiveDelivery = {
      delivery_run_id: 'del-preserved-005',
      media_path: activeMediaPath,
      media_sha256: activeSha,
      sha256: activeSha,
      revision: 1,
      status: 'ACTIVE'
    };

    const renderFn = (proj, outPath) => {
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    // Case 1: Unresolvable conflict in proposal
    const mockQaGeneratorConflict = () => ({
      checks: [
        {
          id: 'CHK_EARSHOT_SYNC',
          status: 'failed',
          measured_value: { max_offset_ms: 100.0, max_offset_ticks: 12000 }
        }
      ],
      rawResponse: {
        sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 1.1, offset_ms: 100.0, offset_ticks: 12000 }] }
      }
    });

    // Lock track to force conflict/rejection
    const lockedProject = structuredClone(project);
    lockedProject.tracks.find(t => t.id === 'a1_dialogue').locked = true;

    const orchestrator = new MultiPassRepairOrchestrator({ renderFn, maxPasses: 3 });
    const result = await orchestrator.orchestrateMultiPassRepair({
      project: lockedProject,
      activeDelivery: originalActiveDelivery,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator: mockQaGeneratorConflict
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.promoted, false);
    // Active delivery unchanged
    assert.deepStrictEqual(result.activeDelivery, originalActiveDelivery);
    assert.strictEqual(result.activeDelivery.status, 'ACTIVE');
  });

  // MPS-06
  await t.test('MPS-06: Reverse-order inverse execution on multi-pass failure, verified candidate recovery, monotonic revisions, and rollback failure handling (ARC-28-12)', async () => {
    // -------------------------------------------------------------
    // Scenario A: Successful Multi-Pass Compensation
    // -------------------------------------------------------------
    const projectA = createTestProject(1);
    const initialClipVoStart = projectA.clips.find(c => c.id === 'clip_vo').startTick; // 120,000
    const initialClipSfxStart = projectA.clips.find(c => c.id === 'clip_sfx').startTick; // 240,000

    const activeMediaPathA = path.join(scratchDir, 'active-delivery-6a.wav');
    const activeShaA = createDummyWav(activeMediaPathA);

    const activeDeliveryA = {
      delivery_run_id: 'del-initial-006a',
      media_path: activeMediaPathA,
      media_sha256: activeShaA,
      revision: 1,
      status: 'ACTIVE'
    };

    // Pass 1: Retimes clip_vo (shift -12,000 ticks -> start 108,000) -> commits rev 1 -> 2
    // Pass 2: Injects failure during render of Pass 2
    const renderFnA = (proj, outPath) => {
      // Throw on pass 2 render
      if (proj.revision === 2) {
        throw new Error('SIMULATED_RENDER_CRASH: disk full during Pass 2 bounce');
      }
      const sha = createDummyWav(outPath);
      return { outputPath: outPath, sha256: sha };
    };

    const mockQaGeneratorA = (pass, render, proj) => {
      if (pass === 1) {
        return {
          checks: [{ id: 'CHK_EARSHOT_SYNC', status: 'failed', measured_value: { max_offset_ms: 100.0, max_offset_ticks: 12000 } }],
          rawResponse: { sync: { items: [{ cut_seconds: 1.0, sound_onset_seconds: 1.1, offset_ms: 100.0, offset_ticks: 12000 }] } }
        };
      }
      return { checks: [], rawResponse: {} };
    };

    const orchestratorA = new MultiPassRepairOrchestrator({ renderFn: renderFnA, maxPasses: 3 });
    const resultA = await orchestratorA.orchestrateMultiPassRepair({
      project: projectA,
      activeDelivery: activeDeliveryA,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator: mockQaGeneratorA
    });

    assert.strictEqual(resultA.success, false);
    assert.strictEqual(resultA.promoted, false);
    assert.strictEqual(resultA.status, 'RENDER_FAILED');

    // 1. Verify verified rollback
    assert.strictEqual(resultA.rollback.status, 'VERIFIED_ROLLED_BACK');
    assert.strictEqual(resultA.rollback.verified, true);
    assert.strictEqual(resultA.rollback.operationsRolledBack, 1);

    // 2. Verify monotonic revision progression: Rev was 1, forward commit made it 2, inverse rollback made it 3!
    assert.strictEqual(resultA.project.revision, 3, 'Revision must advance monotonically to 3, NOT decrement to 1');

    // 3. Verify structural recovery of clip physical properties
    const restoredClipVo = resultA.project.clips.find(c => c.id === 'clip_vo');
    assert.strictEqual(restoredClipVo.startTick, initialClipVoStart, 'Clip startTick must be restored to original 120,000 ticks');

    // 4. Verify candidate quarantined and active delivery untouched
    assert.strictEqual(resultA.quarantinedCandidate.status, 'QUARANTINED');
    assert.deepStrictEqual(resultA.activeDelivery, activeDeliveryA);

    // -------------------------------------------------------------
    // Scenario B: Rollback Failure Handling (ARC-28-12)
    // -------------------------------------------------------------
    const projectB = createTestProject(1);
    const activeMediaPathB = path.join(scratchDir, 'active-delivery-6b.wav');
    const activeShaB = createDummyWav(activeMediaPathB);

    const activeDeliveryB = {
      delivery_run_id: 'del-initial-006b',
      media_path: activeMediaPathB,
      media_sha256: activeShaB,
      revision: 1,
      status: 'ACTIVE'
    };

    const orchestratorB = new MultiPassRepairOrchestrator({ renderFn: renderFnA, maxPasses: 3 });
    const resultB = await orchestratorB.orchestrateMultiPassRepair({
      project: projectB,
      activeDelivery: activeDeliveryB,
      scratchDir,
      targetClipId: 'clip_vo',
      mockQaGenerator: mockQaGeneratorA,
      simulateRollbackFailure: true // Injects rollback failure!
    });

    assert.strictEqual(resultB.success, false);
    assert.strictEqual(resultB.promoted, false);
    // When rollback fails, status MUST be NEEDS_RECONCILIATION
    assert.strictEqual(resultB.status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(resultB.rollback.status, 'UNVERIFIED_ROLLBACK');
    assert.strictEqual(resultB.rollback.verified, false);
    assert.strictEqual(resultB.quarantinedCandidate.status, 'QUARANTINED');
    assert.deepStrictEqual(resultB.activeDelivery, activeDeliveryB, 'Active delivery remains 100% untouched even on rollback failure');
  });
});
