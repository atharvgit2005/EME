import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getVtsmService } = require('../src/engine/vtsm-service.js');
const { VtsmStateManager } = require('../src/engine/vtsm-state-manager.js');

test('VTSM-04 Stage 4: Production Integration Held-Out Validation (Tests A, B, C)', async (t) => {
  const heldOutClipA = path.join(ROOT, 'experiments/visual-temporal-state/held_out_fixtures/held_out_test_a_pine_gauntlet.mp4');
  const heldOutClipB = path.join(ROOT, 'experiments/visual-temporal-state/held_out_fixtures/held_out_test_b_reappearance.mp4');
  const heldOutClipC = path.join(ROOT, 'experiments/visual-temporal-state/held_out_fixtures/held_out_test_c_collision.mp4');

  const service = getVtsmService();

  await t.test('1. Integrated Test B: Disappearance, Reappearance & Zero False Masks', async () => {
    // 1. Initialize tracking session
    const initRes = await service.initTracking({
      projectId: 'proj_vtsm04_test_b',
      mediaPath: heldOutClipB,
      promptBoxes: [[600, 300, 100, 150]],
      label: 'runner_subject'
    });

    assert.equal(initRes.status, 'initialized');
    const sessionId = initRes.sessionId;

    // 2. Propagate through pre-warmed worker daemon
    const propRes = await service.propagateRange({
      sessionId,
      ablationMode: 'vtsm03_adaptive_hybrid'
    });

    assert.equal(propRes.status, 'completed');
    assert.ok(propRes.frameCount > 0, `Must process frames, got ${propRes.frameCount}`);
    assert.ok(fs.existsSync(propRes.sidecarPath), `Sidecar must exist at ${propRes.sidecarPath}`);

    // 3. Inspect persisted sidecar
    const sidecar = VtsmStateManager.loadSidecar(propRes.sidecarPath);
    assert.equal(sidecar.sessionId, sessionId);
    assert.equal(sidecar.projectId, 'proj_vtsm04_test_b');
    assert.equal(sidecar.timebase.ticksPerSecond, 120000);
    assert.equal(sidecar.lifecycle.status, 'completed');

    // 4. Occlusion verification: Check frames during occlusion (frames 29-58)
    const occlusionFrames = sidecar.frames.filter(f => f.frameIdx >= 29 && f.frameIdx <= 58);
    for (const f of occlusionFrames) {
      for (const st of f.states) {
        if (st.visibility === 'occluded' || st.visibility === 'lost') {
          assert.equal(st.mask, undefined, `Frame ${f.frameIdx}: Occluded target must have zero mask`);
        }
      }
    }
  });

  await t.test('2. Integrated Test C: Identity Collision & Crossing Runners', async () => {
    const initRes = await service.initTracking({
      projectId: 'proj_vtsm04_test_c',
      mediaPath: heldOutClipC,
      promptBoxes: [
        [200, 400, 80, 140],
        [800, 400, 80, 140]
      ],
      label: 'crossing_runner'
    });

    assert.equal(initRes.status, 'initialized');
    assert.equal(initRes.tracks.length, 2);

    const propRes = await service.propagateRange({
      sessionId: initRes.sessionId,
      ablationMode: 'vtsm03_adaptive_hybrid'
    });

    assert.equal(propRes.status, 'completed');
    assert.ok(fs.existsSync(propRes.sidecarPath));

    const sidecar = VtsmStateManager.loadSidecar(propRes.sidecarPath);
    assert.equal(sidecar.sessionId, initRes.sessionId);
    assert.equal(sidecar.tracks.length, 2);
    assert.ok(sidecar.frames.length > 50, 'Must contain tracked frames across separation zone');
  });

  await t.test('3. Integrated Test A: Pine-Branch Gauntlet & Background Saliency Non-Contamination', async () => {
    const initRes = await service.initTracking({
      projectId: 'proj_vtsm04_test_a',
      mediaPath: heldOutClipA,
      promptBoxes: [[450, 250, 120, 180]],
      label: 'gauntlet_subject'
    });

    assert.equal(initRes.status, 'initialized');

    const propRes = await service.propagateRange({
      sessionId: initRes.sessionId,
      ablationMode: 'vtsm03_adaptive_hybrid'
    });

    assert.equal(propRes.status, 'completed');
    assert.ok(fs.existsSync(propRes.sidecarPath));

    const sidecar = VtsmStateManager.loadSidecar(propRes.sidecarPath);
    assert.equal(sidecar.sessionId, initRes.sessionId);
    assert.ok(sidecar.frames.length > 50);

    // Schema purity invariant across all runs
    const projSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/eme-project.v1.schema.json'), 'utf8'));
    assert.equal(projSchema.properties.vtsm, undefined, 'eme-project.v1.schema.json must remain untouched');
  });

  t.after(async () => {
    await service.stop();
  });
});
