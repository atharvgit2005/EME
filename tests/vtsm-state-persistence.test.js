import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { VtsmStateManager, TICKS_PER_SECOND } = require('../src/engine/vtsm-state-manager.js');

test('VTSM-04 Stage 2: Spatial-State Persistence & Temporal Consistency', async (t) => {
  const tmpDir = path.join('/tmp', `vtsm_stage2_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  await t.test('1. Timebase invariant: preserves 120,000 ticks/sec and rational FPS', () => {
    const manager = new VtsmStateManager({ sidecarsBaseDir: tmpDir });
    const session = manager.createSession({
      projectId: 'proj_timebase_test',
      sourceMedia: {
        mediaId: 'clip_01.mp4',
        filePath: '/tmp/clip_01.mp4',
        durationSec: 10.0,
        totalFrames: 300
      },
      rationalFps: { numerator: 30, denominator: 1 }
    });

    assert.equal(session.timebase.ticksPerSecond, 120000);
    assert.equal(session.timebase.durationTicks, 1200000); // 10s * 120,000
    assert.equal(session.contractVersion, '1.0.0');
  });

  await t.test('2. Occlusion honesty: visibility=occluded strips mask and avoids fabricated masks', () => {
    const manager = new VtsmStateManager({ sidecarsBaseDir: tmpDir });
    const session = manager.createSession({
      projectId: 'proj_occlusion_test',
      sourceMedia: {
        mediaId: 'held_out_b.mp4',
        filePath: '/tmp/held_out_b.mp4',
        durationSec: 3.0,
        totalFrames: 90
      }
    });

    // Frame 10: visible target with mask
    manager.recordFrameState(session.sessionId, {
      frameIdx: 10,
      states: [{
        trackId: 1,
        visibility: 'visible',
        bbox: [100, 100, 50, 50],
        mask: { format: 'rle', counts: 'dummy_counts' },
        confidence: 0.95
      }]
    });

    // Frame 35: full occlusion (tree trunk)
    manager.recordFrameState(session.sessionId, {
      frameIdx: 35,
      states: [{
        trackId: 1,
        visibility: 'occluded',
        bbox: [120, 100, 0, 0],
        mask: { format: 'rle', counts: 'should_be_stripped' },
        confidence: 0.1
      }]
    });

    const f10 = manager.getFrameState(session.sessionId, 10);
    assert.equal(f10.states[0].visibility, 'visible');
    assert.ok(f10.states[0].mask, 'Visible target must retain mask');

    const f35 = manager.getFrameState(session.sessionId, 35);
    assert.equal(f35.states[0].visibility, 'occluded');
    assert.equal(f35.states[0].mask, undefined, 'Occluded target must have ZERO fabricated mask');
  });

  await t.test('3. Sidecar artifact persistence and schema roundtrip', () => {
    const manager = new VtsmStateManager({ sidecarsBaseDir: tmpDir });
    const session = manager.createSession({
      projectId: 'proj_roundtrip',
      sourceMedia: {
        mediaId: 'shot_1.mp4',
        sourceSha256: 'a'.repeat(64),
        filePath: '/tmp/shot_1.mp4',
        dimensions: { width: 1920, height: 1080 },
        durationSec: 5.0,
        totalFrames: 150
      }
    });

    manager.recordFrameState(session.sessionId, {
      frameIdx: 0,
      ptsTicks: 0,
      ptsSec: 0.0,
      states: [{
        trackId: 1,
        visibility: 'visible',
        bbox: [0.1, 0.1, 0.2, 0.2],
        confidence: 0.99,
        isKeyframe: true
      }]
    });

    manager.completeSession(session.sessionId, {
      throughputFps: 52.9,
      totalDurationMs: 2835.5
    });

    const saveRes = manager.saveSidecar(session.sessionId);
    assert.ok(fs.existsSync(saveRes.sidecarPath));
    assert.ok(saveRes.sidecarPath.includes('sidecars/vtsm'));

    // Load back and verify integrity
    const loaded = VtsmStateManager.loadSidecar(saveRes.sidecarPath);
    assert.equal(loaded.sessionId, session.sessionId);
    assert.equal(loaded.projectId, 'proj_roundtrip');
    assert.equal(loaded.lifecycle.status, 'completed');
    assert.equal(loaded.provenance.throughputFps, 52.9);
    assert.equal(loaded.frames.length, 1);
    assert.equal(loaded.frames[0].ptsTicks, 0);
  });

  await t.test('4. Monotonic timestamp and frame ordering guaranteed', () => {
    const manager = new VtsmStateManager({ sidecarsBaseDir: tmpDir });
    const session = manager.createSession({
      projectId: 'proj_sort',
      sourceMedia: { filePath: '/tmp/test.mp4' }
    });

    // Insert out of order
    manager.recordFrameState(session.sessionId, { frameIdx: 50 });
    manager.recordFrameState(session.sessionId, { frameIdx: 10 });
    manager.recordFrameState(session.sessionId, { frameIdx: 30 });

    const s = manager.sessions.get(session.sessionId);
    assert.deepEqual(s.frames.map(f => f.frameIdx), [10, 30, 50], 'Frames must be sorted monotonically');
  });

  // Cleanup
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
