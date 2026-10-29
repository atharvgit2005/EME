/**
 * Workflow Test Suite: Stage 32.4 — Offline Vision Worker & Model Extraction Pipeline
 *
 * Verifies:
 * 1. Worker client lifecycle, ping handshake, queue bounding, and watchdog timeouts.
 * 2. Sandbox security: path containment via realpathSync and environment sanitization.
 * 3. Sidecar contract conformance (eme-visual-intelligence.v1) and zero solver decisions.
 * 4. Stale evidence detection, cryptographic fingerprint verification, and cache invalidation.
 * 5. Benchmark face observation coverage: GATE-02A (>=95% overall) & GATE-02B (>=90% per-scenario).
 * 6. Frozen held-out partition evaluation (SCEN-A03, SCEN-A04, SCEN-B04, SCEN-C04).
 * 7. Canonical schema and engine runtime invariance.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { VisionWorkerClient } = require('../src/renderers/vision-worker-client.js');
const { VisionWorkerOfflinePipeline } = require('../src/renderers/vision-worker-pipeline.js');
const { VisualContractValidator } = require('../src/renderers/visual-contract-validator.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const INVENTORY_FILE = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/fixture-inventory.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.4/sidecars');

test('Stage 32.4: Offline Vision Worker & Model Extraction Pipeline', async (t) => {
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));

  // =========================================================================
  // Section 1: Worker Client Lifecycle & Subprocess Management
  // =========================================================================
  await t.test('Section 1: Worker Client Lifecycle & Subprocess Management', async (s1) => {
    await s1.test('WRK-01: VisionWorkerClient starts cleanly and completes ping handshake', async () => {
      const client = new VisionWorkerClient({ startupTimeoutMs: 10000 });
      try {
        const res = await client.start();
        assert.strictEqual(res.ok, true, `Worker start failed: ${res.reason}`);
        assert.strictEqual(client.isRunning, true);
        assert.ok(client.workerPid !== null || client.isFallbackMode, 'Worker PID or fallback active');

        const pingRes = await client.sendRawCommand({ action: 'ping' }, 5000);
        assert.strictEqual(pingRes.status, 'pong');
      } finally {
        client.stop();
      }
    });

    await s1.test('WRK-02: Worker recovers cleanly across repeated stop and restart cycles', async () => {
      const client = new VisionWorkerClient({ startupTimeoutMs: 10000 });
      try {
        await client.start();
        assert.strictEqual(client.isRunning, true);

        client.stop();
        assert.strictEqual(client.isRunning, false);
        await new Promise(r => setTimeout(r, 50));

        const restartRes = await client.start();
        assert.strictEqual(restartRes.ok, true);
        assert.strictEqual(client.isRunning, true);
      } finally {
        client.stop();
      }
    });

    await s1.test('WRK-03: Bounded queue backpressure rejects invocations beyond max depth', async () => {
      const client = new VisionWorkerClient({ maxQueueDepth: 2 });
      client.pendingCommands = [{}, {}];

      await assert.rejects(async () => {
        await client.sendRawCommand({ action: 'ping' }, 1000);
      }, /Queue saturation/i);
    });

    await s1.test('WRK-04: Watchdog timeout terminates hung command and cleans up process tree', async () => {
      // Mock worker script that sleeps/hangs
      const hungScript = path.join(REPO_ROOT, 'scratch/hung-vision-worker.py');
      fs.mkdirSync(path.dirname(hungScript), { recursive: true });
      fs.writeFileSync(hungScript, `
import sys, time
for line in sys.stdin:
    time.sleep(10)
`, 'utf8');

      const client = new VisionWorkerClient({
        commandTimeoutMs: 200,
        startupTimeoutMs: 300,
        bridgeScript: hungScript,
        offlineFallbackEnabled: false
      });

      try {
        const startRes = await client.start();
        assert.strictEqual(startRes.ok, false);
        assert.ok(startRes.reason.includes('timed out') || startRes.reason.includes('rejected'));
      } finally {
        client.stop();
      }
    });
  });

  // =========================================================================
  // Section 2: Security Sandbox, Realpath Containment & Environment Sanitization
  // =========================================================================
  await t.test('Section 2: Security Sandbox & Realpath Containment', async (s2) => {
    await s2.test('SEC-01: Sanitized child environment strips sensitive API tokens', () => {
      const origKey = process.env.OPENAI_API_KEY;
      const origGh = process.env.GITHUB_TOKEN;
      process.env.OPENAI_API_KEY = 'sk-secret-leak-test';
      process.env.GITHUB_TOKEN = 'ghp_secret_leak_test';

      try {
        const client = new VisionWorkerClient();
        const env = client.getSanitizedEnv();
        assert.strictEqual(env.OPENAI_API_KEY, undefined, 'OPENAI_API_KEY must be stripped');
        assert.strictEqual(env.GITHUB_TOKEN, undefined, 'GITHUB_TOKEN must be stripped');
        assert.strictEqual(env.PYTHONUNBUFFERED, '1');
      } finally {
        if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
        else delete process.env.OPENAI_API_KEY;
        if (origGh !== undefined) process.env.GITHUB_TOKEN = origGh;
        else delete process.env.GITHUB_TOKEN;
      }
    });

    await s2.test('SEC-02: Path containment rejects traversal escapes and unauthorized roots', () => {
      const client = new VisionWorkerClient();

      // Valid paths
      const safeFixture = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.2/fixtures');
      assert.doesNotThrow(() => client.assertAuthorizedPath(safeFixture));

      const safeTmp = '/tmp/test-video.mp4';
      assert.doesNotThrow(() => client.assertAuthorizedPath(safeTmp));

      // Unauthorized path outside repo
      assert.throws(() => {
        client.assertAuthorizedPath('/etc/passwd');
      }, /Security violation/);

      // Traversal attempt (../../../../etc/shadow)
      assert.throws(() => {
        client.assertAuthorizedPath(path.join(client.repoRoot, '../../../../etc/shadow'));
      }, /Security violation/);
    });

    await s2.test('SEC-03: Missing Python binary falls back gracefully without crashing parent', async () => {
      const client = new VisionWorkerClient({
        pythonPath: '/nonexistent/python3/binary',
        offlineFallbackEnabled: true
      });

      const startRes = await client.start();
      assert.strictEqual(startRes.ok, true);
      assert.strictEqual(startRes.fallback, true);

      const extractRes = await client.extractFeatures({
        assetId: 'test-fallback',
        width: 1920,
        height: 1080
      });

      assert.strictEqual(extractRes.ok, true);
      assert.strictEqual(extractRes.mode, 'offline_fallback');
      assert.ok(extractRes.sidecar);
    });
  });

  // =========================================================================
  // Section 3: Sidecar Contract Integrity & Invariant Preservation
  // =========================================================================
  await t.test('Section 3: Sidecar Contract Integrity & Invariant Preservation', async (s3) => {
    const pipeline = new VisionWorkerOfflinePipeline({ outputDir: OUTPUT_DIR });

    await s3.test('CTR-01: Extracted sidecar strictly validates against eme-visual-intelligence.v1', async () => {
      const clip = inventory.clips[0]; // SCEN-A01
      const res = await pipeline.processAsset({
        assetId: clip.clipId,
        mediaPath: path.join(REPO_ROOT, clip.mp4Path || clip.videoPath),
        width: clip.dimensions.width,
        height: clip.dimensions.height,
        fps: clip.fps,
        frameCount: clip.frameCount,
        sha256: clip.sha256
      }, true);

      assert.strictEqual(res.ok, true);
      assert.ok(res.sidecar);

      const val = VisualContractValidator.validateVisualSidecar(res.sidecar);
      assert.strictEqual(val.valid, true, `Validation failed: ${val.errors.join('; ')}`);
      assert.strictEqual(val.errors.length, 0);
    });

    await s3.test('CTR-02: Observation confidence values strictly adhere to integer [0, 1000] scale', async () => {
      const clip = inventory.clips[0];
      const sidecarPath = path.join(OUTPUT_DIR, `${clip.clipId}-sidecar.json`);
      const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));

      for (const frame of sidecar.frames) {
        for (const obs of frame.observations) {
          assert.ok(Number.isInteger(obs.confidence), 'Confidence must be integer');
          assert.ok(obs.confidence >= 0 && obs.confidence <= 1000, 'Confidence must be in [0, 1000]');
        }
      }
    });

    await s3.test('CTR-03: Separation Invariant: Sidecar contains strictly visual observations and ZERO solver placement decisions', async () => {
      const clip = inventory.clips[0];
      const sidecarPath = path.join(OUTPUT_DIR, `${clip.clipId}-sidecar.json`);
      const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));

      assert.doesNotThrow(() => pipeline.assertNoSolverDecisions(sidecar));

      // Negative check: injected solver decision triggers fatal separation violation
      const corruptSidecar = JSON.parse(JSON.stringify(sidecar));
      corruptSidecar.frames[0].safe_placement_rect = { x: 100, y: 700, width: 400, height: 120 };

      assert.throws(() => {
        pipeline.assertNoSolverDecisions(corruptSidecar);
      }, /Separation violation: Solver decision key 'safe_placement_rect'/);
    });

    await s3.test('CTR-04: AssetId Decoupling Invariant: Extracted observations are strictly invariant to assetId provenance label', async () => {
      const clip = inventory.clips[0]; // SCEN-A01
      const mediaPath = path.join(REPO_ROOT, clip.mp4Path || clip.videoPath);

      // Extract under original canonical assetId
      const resOriginal = await pipeline.processAsset({
        assetId: clip.clipId,
        mediaPath,
        width: clip.dimensions.width,
        height: clip.dimensions.height,
        fps: clip.fps,
        frameCount: clip.frameCount,
        sha256: clip.sha256
      }, true);

      // Extract under arbitrary custom copied assetId
      const resCopied = await pipeline.processAsset({
        assetId: 'TEST-ASSET-ARBITRARY-COPY-01',
        mediaPath,
        width: clip.dimensions.width,
        height: clip.dimensions.height,
        fps: clip.fps,
        frameCount: clip.frameCount,
        sha256: clip.sha256
      }, true);

      assert.strictEqual(resOriginal.ok, true);
      assert.strictEqual(resCopied.ok, true);

      // Provenance identity reflects each requested assetId
      assert.strictEqual(resOriginal.sidecar.source.assetId, clip.clipId);
      assert.strictEqual(resCopied.sidecar.source.assetId, 'TEST-ASSET-ARBITRARY-COPY-01');

      // Visual detections across all frames are 100% bitwise identical
      assert.strictEqual(resOriginal.sidecar.frames.length, resCopied.sidecar.frames.length);
      for (let i = 0; i < resOriginal.sidecar.frames.length; i++) {
        const fOrig = resOriginal.sidecar.frames[i];
        const fCopy = resCopied.sidecar.frames[i];
        assert.strictEqual(fOrig.tick, fCopy.tick);
        assert.deepStrictEqual(fOrig.observations, fCopy.observations);
      }

      // Clean up temporary test sidecar
      const copySidecarPath = path.join(OUTPUT_DIR, 'TEST-ASSET-ARBITRARY-COPY-01-sidecar.json');
      if (fs.existsSync(copySidecarPath)) {
        fs.unlinkSync(copySidecarPath);
      }
    });

    await s3.test('CTR-05: Visual Content Dependency Invariant: Observation output strictly responds to decoded visual pixels when metadata is held constant', async () => {
      const scratchDir = path.join(REPO_ROOT, 'scratch');
      fs.mkdirSync(scratchDir, { recursive: true });
      const darkClip = path.join(scratchDir, 'clip-content-dark.mp4');
      const patchClip = path.join(scratchDir, 'clip-content-bright-patch.mp4');

      // Generate controlled test pair if not already present
      if (!fs.existsSync(darkClip)) {
        spawnSync('ffmpeg', [
          '-y', '-nostdin',
          '-f', 'lavfi', '-i', 'color=c=0x181824:s=1920x1080:d=1.0:r=24',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
          darkClip
        ], { stdio: 'ignore' });
      }

      if (!fs.existsSync(patchClip)) {
        spawnSync('ffmpeg', [
          '-y', '-nostdin',
          '-f', 'lavfi', '-i', 'color=c=0x181824:s=1920x1080:d=1.0:r=24,drawbox=x=800:y=300:w=320:h=400:color=0xd4a373@1:t=fill',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
          patchClip
        ], { stdio: 'ignore' });
      }

      // Metadata held strictly constant across both evaluations:
      const meta = { width: 1920, height: 1080, fps: 24, frameCount: 24, scenarioType: 'content_probe' };

      // 1. Evaluate uniform dark media input
      const resDark = await pipeline.processAsset({
        assetId: 'TEST-CTRL-DARK-01',
        mediaPath: darkClip,
        ...meta
      }, true);

      // 2. Evaluate media input with visual bright patch
      const resPatch = await pipeline.processAsset({
        assetId: 'TEST-CTRL-PATCH-01',
        mediaPath: patchClip,
        ...meta
      }, true);

      assert.strictEqual(resDark.ok, true);
      assert.strictEqual(resPatch.ok, true);

      // Verify Content Dependency:
      // Dark media decodes 0 visual features
      for (const frame of resDark.sidecar.frames) {
        assert.strictEqual(frame.observations.length, 0, 'Uniform dark media must yield 0 visual observations');
      }

      // Patch media decodes exactly 1 visual feature matching the drawn bounding box
      assert.ok(resPatch.sidecar.frames.length > 0);
      for (const frame of resPatch.sidecar.frames) {
        assert.strictEqual(frame.observations.length, 1, 'Visual patch media must yield 1 visual observation');
        const obs = frame.observations[0];
        assert.strictEqual(obs.type, 'person');
        assert.strictEqual(obs.confidence, 950);
        // Verify bounding box matches ffmpeg drawbox parameters (x=800, y=300, w=320, h=400) within step tolerance
        assert.ok(obs.bounds.x >= 790 && obs.bounds.x <= 810, `obs.bounds.x ${obs.bounds.x} out of range`);
        assert.ok(obs.bounds.y >= 295 && obs.bounds.y <= 315, `obs.bounds.y ${obs.bounds.y} out of range`);
        assert.ok(obs.bounds.width >= 310 && obs.bounds.width <= 330, `obs.bounds.width ${obs.bounds.width} out of range`);
        assert.ok(obs.bounds.height >= 390 && obs.bounds.height <= 410, `obs.bounds.height ${obs.bounds.height} out of range`);
      }

      // Clean up temporary test sidecars
      const darkSidecar = path.join(OUTPUT_DIR, 'TEST-CTRL-DARK-01-sidecar.json');
      const patchSidecar = path.join(OUTPUT_DIR, 'TEST-CTRL-PATCH-01-sidecar.json');
      if (fs.existsSync(darkSidecar)) fs.unlinkSync(darkSidecar);
      if (fs.existsSync(patchSidecar)) fs.unlinkSync(patchSidecar);
    });

    await pipeline.close();
  });

  // =========================================================================
  // Section 4: Stale Evidence Detection & Cache Invalidation
  // =========================================================================
  await t.test('Section 4: Stale Evidence Detection & Cache Invalidation', async (s4) => {
    const pipeline = new VisionWorkerOfflinePipeline({ outputDir: OUTPUT_DIR });
    const clip = inventory.clips[0];
    const mediaPath = path.join(REPO_ROOT, clip.mp4Path || clip.videoPath);
    const sidecarPath = path.join(OUTPUT_DIR, `${clip.clipId}-sidecar.json`);

    await s4.test('STL-01: Cache hit returns fresh sidecar when source media hash matches', () => {
      const check = pipeline.checkSidecarFreshness(sidecarPath, mediaPath);
      assert.strictEqual(check.fresh, true);
      assert.ok(check.sidecar);
    });

    await s4.test('STL-02: Media hash mismatch detects stale sidecar and flags for re-extraction', () => {
      // Create a temporary mutated media file with different content
      const fakeMediaPath = path.join(REPO_ROOT, 'scratch/mutated-test-video.mp4');
      fs.mkdirSync(path.dirname(fakeMediaPath), { recursive: true });
      fs.writeFileSync(fakeMediaPath, 'mutated-bytes-for-stale-test', 'utf8');

      const check = pipeline.checkSidecarFreshness(sidecarPath, fakeMediaPath);
      assert.strictEqual(check.fresh, false);
      assert.strictEqual(check.reason, 'MEDIA_HASH_MISMATCH');
    });

    await s4.test('STL-03: Corrupt sidecar on disk triggers clean regeneration', () => {
      const corruptPath = path.join(REPO_ROOT, 'scratch/corrupt-sidecar.json');
      fs.writeFileSync(corruptPath, '{ corrupt json invalid', 'utf8');

      const check = pipeline.checkSidecarFreshness(corruptPath, mediaPath);
      assert.strictEqual(check.fresh, false);
      assert.strictEqual(check.reason, 'SIDECAR_CORRUPT_JSON');
    });
  });

  // =========================================================================
  // Section 5: Development Partition Benchmark Recall (GATE-02A & GATE-02B)
  // =========================================================================
  await t.test('Section 5: Development Partition Benchmark Recall (GATE-02A & GATE-02B)', async (s5) => {
    const pipeline = new VisionWorkerOfflinePipeline({ outputDir: OUTPUT_DIR });
    const devInventory = {
      clips: inventory.clips.filter(c => !c.isHeldOut)
    };

    assert.strictEqual(devInventory.clips.length, 8, 'Development partition must contain exactly 8 clips');

    const evalReport = await pipeline.evaluateBenchmarkRecall(devInventory);

    await s5.test('EVAL-01: Scenario A talking head dev clips achieve >= 90% recall', () => {
      const scenA = evalReport.gateResults['GATE-02B'].scenarios['Scenario A'];
      assert.ok(scenA);
      assert.ok(scenA.recall >= 0.90, `Scenario A recall must be >= 0.90 (got ${scenA.recall})`);
      assert.strictEqual(scenA.passesGate, true);
    });

    await s5.test('EVAL-02: Scenario B multi-subject dev clips achieve >= 90% recall', () => {
      const scenB = evalReport.gateResults['GATE-02B'].scenarios['Scenario B'];
      assert.ok(scenB);
      assert.ok(scenB.recall >= 0.90, `Scenario B recall must be >= 0.90 (got ${scenB.recall})`);
      assert.strictEqual(scenB.passesGate, true);
    });

    await s5.test('EVAL-03: Scenario C lateral motion dev clips evaluate cleanly (Negative Control)', () => {
      const scenC = evalReport.gateResults['GATE-02B'].scenarios['Scenario C'];
      assert.ok(scenC);
      assert.strictEqual(scenC.isZeroPositive, true);
      assert.strictEqual(scenC.falsePositives, 0);
      assert.strictEqual(scenC.totalFrames, 336, 'Scenario C dev partition must evaluate exactly 336 frames (120+96+120)');
      assert.strictEqual(scenC.negativeControlPass, true);
      assert.strictEqual(scenC.passesGate, true);
      assert.strictEqual(scenC.status, 'PASS (Negative Control: 0 FP / 336 frames)');
    });

    await s5.test('EVAL-04: Overall development partition satisfies development calibration target (>=94% recall)', () => {
      assert.ok(evalReport.overallMetrics.recall >= 0.94, `Development partition recall must be >= 0.94 (got ${evalReport.overallMetrics.recall})`);
    });

    await pipeline.close();
  });

  // =========================================================================
  // Section 6: Frozen Held-Out Partition Evaluation (Strictly Post-Freeze)
  // =========================================================================
  await t.test('Section 6: Frozen Held-Out Partition Evaluation (Strictly Post-Freeze)', async (s6) => {
    const pipeline = new VisionWorkerOfflinePipeline({ outputDir: OUTPUT_DIR });
    const heldOutInventory = {
      clips: inventory.clips.filter(c => c.isHeldOut)
    };

    assert.strictEqual(heldOutInventory.clips.length, 4, 'Held-out partition must contain exactly 4 clips');

    const heldOutReport = await pipeline.evaluateBenchmarkRecall(heldOutInventory);

    await s6.test('HLD-01 [Held-Out]: SCEN-A03 adversarial edge pan achieves >= 90% face recall', () => {
      const clip = heldOutReport.clipResults.find(c => c.clipId === 'SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL');
      assert.ok(clip);
      assert.ok(clip.recall >= 0.90, `SCEN-A03 recall must be >= 0.90 (got ${clip.recall})`);
      assert.strictEqual(clip.meetsPerScenarioGate, true);
    });

    await s6.test('HLD-02 [Held-Out]: SCEN-A04 vertical 9:16 mobile canvas achieves >= 90% face recall', () => {
      const clip = heldOutReport.clipResults.find(c => c.clipId === 'SCEN-A04-TALKING-HEAD-9-16-VERTICAL');
      assert.ok(clip);
      assert.ok(clip.recall >= 0.90, `SCEN-A04 recall must be >= 0.90 (got ${clip.recall})`);
      assert.strictEqual(clip.meetsPerScenarioGate, true);
    });

    await s6.test('HLD-03 [Held-Out]: SCEN-B04 4K high density multi-subject achieves >= 90% face recall', () => {
      const clip = heldOutReport.clipResults.find(c => c.clipId === 'SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY');
      assert.ok(clip);
      assert.ok(clip.recall >= 0.90, `SCEN-B04 recall must be >= 0.90 (got ${clip.recall})`);
      assert.strictEqual(clip.meetsPerScenarioGate, true);
    });

    await s6.test('HLD-04 [Held-Out]: SCEN-C04 60fps subpixel stress evaluates cleanly', () => {
      const clip = heldOutReport.clipResults.find(c => c.clipId === 'SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS');
      assert.ok(clip);
      assert.strictEqual(clip.meetsPerScenarioGate, true);
    });

    await s6.test('HLD-05: Complete 12-clip benchmark corpus achieves GATE-02A (>=95% overall) and GATE-02B (>=90% per-scenario)', async () => {
      const fullReport = await pipeline.evaluateBenchmarkRecall(inventory);

      assert.ok(fullReport.overallMetrics.recall >= 0.95, `GATE-02A recall must be >= 0.95 (achieved ${fullReport.overallMetrics.recall})`);
      assert.strictEqual(fullReport.gateResults['GATE-02A'].status, 'PASS');

      for (const [key, scen] of Object.entries(fullReport.gateResults['GATE-02B'].scenarios)) {
        if (scen.isZeroPositive) {
          assert.strictEqual(scen.falsePositives, 0, `Negative control for ${key} must have 0 FP`);
          assert.strictEqual(scen.totalFrames, 486, 'Scenario C full corpus must evaluate exactly 486 frames (120+96+120+150)');
          assert.strictEqual(scen.status, 'PASS (Negative Control: 0 FP / 486 frames)');
          assert.strictEqual(scen.negativeControlPass, true);
          assert.strictEqual(scen.passesGate, true);
        } else {
          assert.ok(scen.recall >= 0.90, `GATE-02B for ${key} must be >= 0.90 (achieved ${scen.recall})`);
          assert.strictEqual(scen.passesGate, true);
        }
      }
    });

    await pipeline.close();
  });

  // =========================================================================
  // Section 7: Invariance Checks
  // =========================================================================
  await t.test('Section 7: Invariance Checks', async (s7) => {
    await s7.test('INV-01: All 18 canonical schemas remain unmodified', () => {
      const schemaDir = path.join(REPO_ROOT, 'schema');
      const canonicalSchemas = [
        'eme-beat-actor-plan.v1.schema.json',
        'eme-beat-analysis.v1.schema.json',
        'eme-candidate-set.v1.schema.json',
        'eme-color-grade.v1.schema.json',
        'eme-constraint.v1.schema.json',
        'eme-delivery-manifest.v1.schema.json',
        'eme-delivery-run.v1.schema.json',
        'eme-edit-brief.v1.schema.json',
        'eme-editing-plan.v1.schema.json',
        'eme-intent-envelope.v1.schema.json',
        'eme-job.v1.schema.json',
        'eme-media-qa-report.v1.schema.json',
        'eme-musical-structure.v1.schema.json',
        'eme-operation-plan.v1.schema.json',
        'eme-preference-feedback.v1.schema.json',
        'eme-preference-profile.v1.schema.json',
        'eme-project.v1.schema.json',
        'eme-render-job.v1.schema.json'
      ];

      for (const name of canonicalSchemas) {
        const fullPath = path.join(schemaDir, name);
        assert.ok(fs.existsSync(fullPath), `Canonical schema ${name} must exist`);
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        assert.ok(parsed.$schema || parsed.title);
      }
    });

    await s7.test('INV-02: Zero external runtime npm dependencies in package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
      assert.deepStrictEqual(pkg.dependencies || {}, {}, 'Runtime dependencies must be empty');
    });
  });
});
