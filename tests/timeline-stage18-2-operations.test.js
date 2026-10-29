/**
 * EME Phase 18: Stage 18.2 Test Suite
 * Atomic Editing & Compound Editorial Operations
 *
 * Verifies:
 * 1. Basic operations (insert_clip, move_clip, trim_clip, split_clip, delete_clip, reorder_tracks, set_track_state)
 * 2. Atomic Trim-In: single operation updating startTick, durationTicks, and source.trimInTick with zero intermediate revisions
 * 3. Compound operations (ripple_delete, ripple_trim, slip_clip, slide_clip) with exact neighbor and interval guarantees
 * 4. Engine boundary track-lock enforcement
 * 5. Optimistic concurrency with expectedBaseRevision (fail-closed 409 rejection)
 * 6. Authoritative monotonic Undo / Redo exact canonical state restoration
 * 7. Live HTTP Server (/api/project/operation, /api/project/undo, /api/project/redo, /api/timeline)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { OperationExecutor } = require('../src/engine/operations.js');
const { ProjectManager } = require('../src/engine/project.js');
const { EditorBackend } = require('../src/ui/server.js');

const { workspace } = require('./helpers/phase1-approval.cjs');
const { authorizedFetch } = require('./helpers/phase1-authorized-fetch.cjs');
const { ApprovalAuthority } = require('../src/creative/approval-authority.js');
const crypto = require('node:crypto');
const approvalArea = workspace();
ApprovalAuthority.DEFAULT_STORAGE_DIR = approvalArea.store;
const testMedia = path.join(approvalArea.root, 'media.bin');
require('node:fs').writeFileSync(testMedia, 'isolated timeline fixture');

const { TimelineAdapter } = require('../src/engine/timeline-adapter.js');

function createSampleProject() {
  return {
    id: `test_stage18_2_${crypto.randomUUID()}`,
    title: 'Stage 18.2 Test Project',
    schemaVersion: '1.0.0',
    revision: 1,
    canvas: { width: 1080, height: 1920, aspectRatio: '9:16', backgroundColor: '#000000' },
    timebase: {
      fps: { numerator: 30, denominator: 1 },
      durationTicks: 360000, // 3.0s
      ticksPerSecond: 120000,
      endpointConvention: 'half-open'
    },
    assets: [
      { id: 'asset_1', type: 'video', src: testMedia, uri: 'file:///media/video1.mp4', durationTicks: 600000 },
      { id: 'asset_2', type: 'video', src: testMedia, uri: 'file:///media/video2.mp4', durationTicks: 600000 }
    ],
    tracks: [
      { id: 'track_v1', name: 'Video 1', kind: 'visual', zIndex: 1, muted: false, locked: false, visible: true },
      { id: 'track_v2', name: 'Video 2', kind: 'visual', zIndex: 2, muted: false, locked: false, visible: true }
    ],
    clips: [
      {
        id: 'clip_1',
        trackId: 'track_v1',
        type: 'video',
        startTick: 0,
        durationTicks: 120000,
        source: { assetId: 'asset_1', trimInTick: 0, trimOutTick: 120000 }
      },
      {
        id: 'clip_2',
        trackId: 'track_v1',
        type: 'video',
        startTick: 120000,
        durationTicks: 120000,
        source: { assetId: 'asset_2', trimInTick: 0, trimOutTick: 120000 }
      }
    ],
    animations: []
  };
}

describe('Stage 18.2: Atomic Editing & Compound Editorial Operations', () => {

  // --- Stage 18.2.1: Basic Atomic Editing ---
  describe('Stage 18.2.1: Basic Operations & Validation Boundaries', () => {
    test('insert_clip: successfully inserts clip and rejects collision, duplicate ID, and locked track', () => {
      const proj = createSampleProject();
      const insertOp = {
        type: 'insert_clip',
        params: {
          id: 'clip_3',
          trackId: 'track_v1',
          type: 'video',
          startTick: 240000,
          durationTicks: 60000,
          source: { assetId: 'asset_1', trimInTick: 0 }
        }
      };

      const res = OperationExecutor.execute(proj, insertOp);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.project.clips.length, 3);
      assert.strictEqual(res.project.revision, 2);

      // Collision rejection
      const collideOp = {
        type: 'insert_clip',
        params: {
          id: 'clip_collide',
          trackId: 'track_v1',
          type: 'video',
          startTick: 60000,
          durationTicks: 60000
        }
      };
      const collideRes = OperationExecutor.execute(res.project, collideOp);
      assert.strictEqual(collideRes.success, false);
      assert.strictEqual(collideRes.errorCode, 'TRACK_COLLISION');

      // Duplicate ID rejection
      const dupOp = {
        type: 'insert_clip',
        params: {
          id: 'clip_1',
          trackId: 'track_v2',
          type: 'video',
          startTick: 0,
          durationTicks: 60000
        }
      };
      const dupRes = OperationExecutor.execute(res.project, dupOp);
      assert.strictEqual(dupRes.success, false);
      assert.strictEqual(dupRes.errorCode, 'DUPLICATE_ID');

      // Locked track rejection
      res.project.tracks.find(t => t.id === 'track_v2').locked = true;
      const lockedOp = {
        type: 'insert_clip',
        params: {
          id: 'clip_locked',
          trackId: 'track_v2',
          type: 'video',
          startTick: 0,
          durationTicks: 60000
        }
      };
      const lockRes = OperationExecutor.execute(res.project, lockedOp);
      assert.strictEqual(lockRes.success, false);
      assert.strictEqual(lockRes.errorCode, 'TRACK_LOCKED');
    });

    test('move_clip: moves clip across time and tracks with collision and lock checking', () => {
      const proj = createSampleProject();
      const moveOp = {
        type: 'move_clip',
        params: {
          clipId: 'clip_1',
          targetTrackId: 'track_v2',
          targetTick: 60000
        }
      };

      const res = OperationExecutor.execute(proj, moveOp);
      assert.strictEqual(res.success, true);
      const moved = res.project.clips.find(c => c.id === 'clip_1');
      assert.strictEqual(moved.trackId, 'track_v2');
      assert.strictEqual(moved.startTick, 60000);
      assert.strictEqual(moved.durationTicks, 120000);

      // Collision check on destination track
      const moveBackOp = {
        type: 'move_clip',
        params: {
          clipId: 'clip_1',
          targetTrackId: 'track_v1',
          targetTick: 180000 // overlaps with clip_2 [120000, 240000)
        }
      };
      const moveFail = OperationExecutor.execute(res.project, moveBackOp);
      assert.strictEqual(moveFail.success, false);
      assert.strictEqual(moveFail.errorCode, 'TRACK_COLLISION');
    });

    test('split_clip: splits clip at valid interior tick with source continuity', () => {
      const proj = createSampleProject();
      const splitTick = 60000; // Halfway through clip_1 [0, 120000)

      const splitOp = {
        type: 'split_clip',
        params: {
          clipId: 'clip_1',
          splitTick,
          newClipId: 'clip_1_part2'
        }
      };

      const res = OperationExecutor.execute(proj, splitOp);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.project.clips.length, 3);

      const part1 = res.project.clips.find(c => c.id === 'clip_1');
      const part2 = res.project.clips.find(c => c.id === 'clip_1_part2');

      assert.strictEqual(part1.startTick, 0);
      assert.strictEqual(part1.durationTicks, 60000);
      assert.strictEqual(part1.source.trimInTick, 0);
      assert.strictEqual(part1.source.trimOutTick, 60000);

      assert.strictEqual(part2.startTick, 60000);
      assert.strictEqual(part2.durationTicks, 60000);
      assert.strictEqual(part2.source.trimInTick, 60000);

      // Boundary rejection
      const badSplitOp = {
        type: 'split_clip',
        params: { clipId: 'clip_2', splitTick: 120000 } // exactly on boundary
      };
      const badSplitRes = OperationExecutor.execute(res.project, badSplitOp);
      assert.strictEqual(badSplitRes.success, false);
      assert.strictEqual(badSplitRes.errorCode, 'SPLIT_OUT_OF_BOUNDS');
    });

    test('delete_clip: removes clip and associated animations safely', () => {
      const proj = createSampleProject();
      proj.animations.push({ clipId: 'clip_1', property: 'opacity', keyframes: [] });

      const delOp = {
        type: 'delete_clip',
        params: { clipId: 'clip_1' }
      };

      const res = OperationExecutor.execute(proj, delOp);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.project.clips.length, 1);
      assert.strictEqual(res.project.animations.length, 0);
    });

    test('reorder_tracks and set_track_state: updates zIndex and flags', () => {
      const proj = createSampleProject();
      const reorderOp = {
        type: 'reorder_tracks',
        params: {
          trackOrders: [
            { trackId: 'track_v1', zIndex: 10 },
            { trackId: 'track_v2', zIndex: 20 }
          ]
        }
      };
      const reorderRes = OperationExecutor.execute(proj, reorderOp);
      assert.strictEqual(reorderRes.success, true);
      assert.strictEqual(reorderRes.project.tracks.find(t => t.id === 'track_v1').zIndex, 10);
      assert.strictEqual(reorderRes.project.tracks.find(t => t.id === 'track_v2').zIndex, 20);

      const stateOp = {
        type: 'set_track_state',
        params: { trackId: 'track_v1', muted: true, locked: true, visible: false }
      };
      const stateRes = OperationExecutor.execute(reorderRes.project, stateOp);
      assert.strictEqual(stateRes.success, true);
      const t1 = stateRes.project.tracks.find(t => t.id === 'track_v1');
      assert.strictEqual(t1.muted, true);
      assert.strictEqual(t1.locked, true);
      assert.strictEqual(t1.visible, false);
    });
  });

  // --- Stage 18.2.2: The Atomic Trim-In Contract ---
  describe('Stage 18.2.2: Unified Atomic Trim-In Contract', () => {
    test('trim_clip (in-handle): executes in a single transaction updating startTick, durationTicks, and source.trimInTick', () => {
      const proj = createSampleProject();
      const deltaTicks = 30000; // Trim in 0.25s
      const origClip = proj.clips.find(c => c.id === 'clip_1');

      const trimInOp = {
        type: 'trim_clip',
        params: {
          clipId: 'clip_1',
          newStartTick: origClip.startTick + deltaTicks,
          newDurationTicks: origClip.durationTicks - deltaTicks,
          trimInTick: (origClip.source?.trimInTick || 0) + deltaTicks
        }
      };

      const initialRev = proj.revision;
      const res = OperationExecutor.execute(proj, trimInOp);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.project.revision, initialRev + 1, 'Exactly one revision incremented');

      const trimmed = res.project.clips.find(c => c.id === 'clip_1');
      assert.strictEqual(trimmed.startTick, 30000);
      assert.strictEqual(trimmed.durationTicks, 90000);
      assert.strictEqual(trimmed.source.trimInTick, 30000);
      // Right edge remains fixed at 120,000
      assert.strictEqual(trimmed.startTick + trimmed.durationTicks, 120000);
    });

    test('trim_clip: enforces track collision check when expanding startTick left', () => {
      const proj = createSampleProject();
      // clip_1 is [0, 120000), clip_2 is [120000, 240000)
      // Attempt to expand clip_2 startTick left to 100000 (collides with clip_1)
      const badTrimOp = {
        type: 'trim_clip',
        params: {
          clipId: 'clip_2',
          newStartTick: 100000,
          newDurationTicks: 140000
        }
      };

      const res = OperationExecutor.execute(proj, badTrimOp);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'TRACK_COLLISION');
    });

    test('trim_clip (out-handle): updates durationTicks and source.trimOutTick preserving startTick', () => {
      const proj = createSampleProject();
      const trimOutOp = {
        type: 'trim_clip',
        params: {
          clipId: 'clip_2',
          newDurationTicks: 60000,
          trimOutTick: 60000
        }
      };

      const res = OperationExecutor.execute(proj, trimOutOp);
      assert.strictEqual(res.success, true);
      const trimmed = res.project.clips.find(c => c.id === 'clip_2');
      assert.strictEqual(trimmed.startTick, 120000);
      assert.strictEqual(trimmed.durationTicks, 60000);
      assert.strictEqual(trimmed.source.trimOutTick, 60000);
    });
  });

  // --- Stage 18.2.3: Compound Editorial Operations ---
  describe('Stage 18.2.3: Compound Editorial Operations', () => {
    test('ripple_delete: removes clip and shifts subsequent clips left by duration', () => {
      const proj = createSampleProject();
      // Add clip_3 at 240000 [240000, 360000)
      proj.clips.push({
        id: 'clip_3',
        trackId: 'track_v1',
        type: 'video',
        startTick: 240000,
        durationTicks: 120000,
        source: { assetId: 'asset_1', trimInTick: 0 }
      });

      const ripOp = {
        type: 'ripple_delete',
        params: { clipId: 'clip_1' } // duration is 120,000
      };

      const res = OperationExecutor.execute(proj, ripOp);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.project.clips.length, 2);

      const c2 = res.project.clips.find(c => c.id === 'clip_2');
      const c3 = res.project.clips.find(c => c.id === 'clip_3');

      // clip_2 was 120000 -> now 0
      assert.strictEqual(c2.startTick, 0);
      // clip_3 was 240000 -> now 120000
      assert.strictEqual(c3.startTick, 120000);
    });

    test('ripple_trim: end edge expansion and contraction shifts downstream clips', () => {
      const proj = createSampleProject();
      // clip_1 is [0, 120000), clip_2 is [120000, 240000)
      const deltaTicks = 30000;

      const ripTrimOp = {
        type: 'ripple_trim',
        params: {
          clipId: 'clip_1',
          edge: 'out',
          deltaTicks
        }
      };

      const res = OperationExecutor.execute(proj, ripTrimOp);
      assert.strictEqual(res.success, true);

      const c1 = res.project.clips.find(c => c.id === 'clip_1');
      const c2 = res.project.clips.find(c => c.id === 'clip_2');

      assert.strictEqual(c1.durationTicks, 150000);
      assert.strictEqual(c2.startTick, 150000, 'Downstream clip shifted right by deltaTicks');
    });

    test('slip_clip: adjusts source range while 100% preserving timeline start and duration', () => {
      const proj = createSampleProject();
      const deltaTicks = 20000;

      const slipOp = {
        type: 'slip_clip',
        params: {
          clipId: 'clip_1',
          deltaTicks
        }
      };

      const res = OperationExecutor.execute(proj, slipOp);
      assert.strictEqual(res.success, true);

      const slipped = res.project.clips.find(c => c.id === 'clip_1');
      assert.strictEqual(slipped.startTick, 0, 'Timeline start unchanged');
      assert.strictEqual(slipped.durationTicks, 120000, 'Timeline duration unchanged');
      assert.strictEqual(slipped.source.trimInTick, 20000);
      assert.strictEqual(slipped.source.trimOutTick, 140000);

      // Rejection of negative source in
      const badSlipOp = {
        type: 'slip_clip',
        params: { clipId: 'clip_1', deltaTicks: -50000 }
      };
      const badRes = OperationExecutor.execute(res.project, badSlipOp);
      assert.strictEqual(badRes.success, false);
      assert.strictEqual(badRes.errorCode, 'SLIP_OUT_OF_BOUNDS');
    });

    test('slide_clip: moves middle clip while adjusting adjacent neighbors seamlessly', () => {
      const proj = createSampleProject();
      // Add clip_3 at 240000 [240000, 360000)
      proj.clips.push({
        id: 'clip_3',
        trackId: 'track_v1',
        type: 'video',
        startTick: 240000,
        durationTicks: 120000,
        source: { assetId: 'asset_1', trimInTick: 0 }
      });

      // Slide clip_2 right by 20000 ticks
      const deltaTicks = 20000;
      const slideOp = {
        type: 'slide_clip',
        params: {
          clipId: 'clip_2',
          deltaTicks
        }
      };

      const res = OperationExecutor.execute(proj, slideOp);
      assert.strictEqual(res.success, true);

      const c1 = res.project.clips.find(c => c.id === 'clip_1');
      const c2 = res.project.clips.find(c => c.id === 'clip_2');
      const c3 = res.project.clips.find(c => c.id === 'clip_3');

      // clip_1 expanded to fill gap
      assert.strictEqual(c1.durationTicks, 140000);
      // clip_2 moved right
      assert.strictEqual(c2.startTick, 140000);
      assert.strictEqual(c2.durationTicks, 120000);
      // clip_3 shrunk and pushed
      assert.strictEqual(c3.startTick, 260000);
      assert.strictEqual(c3.durationTicks, 100000);
    });
  });

  // --- Stage 18.2.4: Concurrency Locking & Monotonic Undo/Redo over HTTP ---
  describe('Stage 18.2.4: Live HTTP Server, Concurrency & Monotonic History', () => {
    let backend;
    const fetch = authorizedFetch(() => backend, approvalArea.store);
    let server;
    let baseUrl;
    const testPort = 4435;

    before(async () => {
      backend = new EditorBackend({ outputDir: path.join(approvalArea.root, 'deliverables') });
      const proj = createSampleProject();
      backend.currentProject = proj;
      backend.activeProjectPath = path.join(__dirname, 'test-project.json');

      server = http.createServer((req, res) => backend.handleRequest(req, res));
      await new Promise(r => server.listen(testPort, r));
      baseUrl = `http://localhost:${testPort}`;
    });

    after(async () => {
      if (server) await new Promise(r => server.close(r));
    });

    test('Optimistic Concurrency: Stale expectedBaseRevision fails closed with 409', async () => {
      const staleOp = {
        type: 'move_clip',
        params: { clipId: 'clip_1', targetTick: 10000 },
        expectedBaseRevision: 999 // actual revision is 1
      };

      const res = await fetch(`${baseUrl}/api/project/operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: staleOp })
      });

      assert.strictEqual(res.status, 409, 'Must return 409 Conflict on stale revision');
      const data = await res.json();
      assert.strictEqual(data.errorCode, 'STALE_REVISION');
    });

    test('Authoritative Undo / Redo restores exact canonical pre-edit and post-edit states', async () => {
      // 1. Snapshot canonical pre-edit state
      const preEditSnapshot = structuredClone(backend.currentProject);

      // 2. Perform atomic Trim-In via POST /api/project/operation
      const trimInOp = {
        type: 'trim_clip',
        params: {
          clipId: 'clip_1',
          newStartTick: 20000,
          newDurationTicks: 100000,
          trimInTick: 20000
        },
        expectedBaseRevision: preEditSnapshot.revision
      };

      const opRes = await fetch(`${baseUrl}/api/project/operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: trimInOp })
      });

      assert.strictEqual(opRes.status, 200);
      const opData = await opRes.json();
      assert.strictEqual(opData.success, true);
      assert.strictEqual(opData.canUndo, true);
      assert.strictEqual(opData.canRedo, false);
      assert.strictEqual(opData.project.clips.find(c => c.id === 'clip_1').startTick, 20000);

      const postEditSnapshot = structuredClone(opData.project);

      // 3. Execute Undo via POST /api/project/undo
      const undoRes = await fetch(`${baseUrl}/api/project/undo`, { method: 'POST' });
      assert.strictEqual(undoRes.status, 200);
      const undoData = await undoRes.json();
      assert.strictEqual(undoData.canUndo, false);
      assert.strictEqual(undoData.canRedo, true);

      // Verify exact canonical restoration
      const restoredClip = undoData.project.clips.find(c => c.id === 'clip_1');
      assert.strictEqual(restoredClip.startTick, preEditSnapshot.clips.find(c => c.id === 'clip_1').startTick);
      assert.strictEqual(restoredClip.durationTicks, preEditSnapshot.clips.find(c => c.id === 'clip_1').durationTicks);
      assert.strictEqual(restoredClip.source.trimInTick, preEditSnapshot.clips.find(c => c.id === 'clip_1').source.trimInTick);
      // Monotonic revision advances
      assert.ok(undoData.project.revision > postEditSnapshot.revision, 'Monotonic revision advanced on undo');

      // 4. Execute Redo via POST /api/project/redo
      const redoRes = await fetch(`${baseUrl}/api/project/redo`, { method: 'POST' });
      assert.strictEqual(redoRes.status, 200);
      const redoData = await redoRes.json();
      assert.strictEqual(redoData.canUndo, true);
      assert.strictEqual(redoData.canRedo, false);

      const redoneClip = redoData.project.clips.find(c => c.id === 'clip_1');
      assert.strictEqual(redoneClip.startTick, postEditSnapshot.clips.find(c => c.id === 'clip_1').startTick);
      assert.strictEqual(redoneClip.durationTicks, postEditSnapshot.clips.find(c => c.id === 'clip_1').durationTicks);
      assert.strictEqual(redoneClip.source.trimInTick, postEditSnapshot.clips.find(c => c.id === 'clip_1').source.trimInTick);
      assert.ok(redoData.project.revision > undoData.project.revision, 'Monotonic revision advanced on redo');
    });

    test('Timeline Projection Reconciles Cleanly from Engine Result', async () => {
      const projRes = await fetch(`${baseUrl}/api/timeline`);
      assert.strictEqual(projRes.status, 200);
      const projData = await projRes.json();
      assert.strictEqual(projData.success, true);
      assert.ok(projData.timeline);
      assert.ok(Array.isArray(projData.timeline.tracks));
      assert.ok(Array.isArray(projData.timeline.clips));
      assert.strictEqual(projData.timeline.clips.length, backend.currentProject.clips.length);
    });
  });
});
