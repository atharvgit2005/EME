/**
 * Milestone Certification Test Suite: Stage 25 — Read-Only Audio QA & Perception Adapter
 *
 * Comprehensive 10-Test Acceptance Battery:
 * 1. CERT-01: Contract Conformance & Strict Schema Containment.
 * 2. CERT-02: Calibrated Ground-Truth Defect Detection on fixtures/qa-audio-defects.mp4.
 * 3. CERT-03: Perception / Repair Separation (Advisory offset, zero mutation authority).
 * 4. CERT-04: Missing Tool & Dependency Fallback (NOT_MEASURED, native QA operational).
 * 5. CERT-05: Watchdog Timeout & Process-Tree Termination (SIGTERM -> SIGKILL).
 * 6. CERT-06: Security Sandbox & Realpath Containment (traversal & symlink defense).
 * 7. CERT-07: Zero Project Mutation & Delivery Session Invariance.
 * 8. CERT-08: Malformed & Oversized Worker Output Protection.
 * 9. CERT-09: Worker Recovery & Lifecycle Stability Across Repeated Restarts.
 * 10. CERT-10: Frozen Canonical Schemas & Zero Runtime NPM Dependencies.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EarshotAdapter } = require('../src/renderers/earshot-adapter.js');
const { EarshotWorkerClient } = require('../src/renderers/earshot-worker-client.js');
const { EarshotContractValidator } = require('../src/renderers/earshot-contract-validator.js');
const { RenderOrchestrator } = require('../src/prompt-core/render-orchestrator.js');
const { QualityAssuranceEngine } = require('../src/renderers/qa-engine.js');
const { BriefValidator } = require('../src/prompt-core/brief-validator.js');

test('Milestone Phase 25: Earshot Read-Only Audio QA & Perception Adapter Certification', async (t) => {
  const fixturePath = path.resolve(__dirname, '../fixtures/qa-audio-defects.mp4');
  const manifestPath = path.resolve(__dirname, '../fixtures/qa-audio-defects-manifest.json');

  assert.ok(fs.existsSync(fixturePath), 'Synthetic defects fixture must exist');
  assert.ok(fs.existsSync(manifestPath), 'Synthetic defects manifest must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const client = new EarshotWorkerClient();
  const adapter = new EarshotAdapter({ workerClient: client });

  t.after(() => {
    client.stop();
  });

  await t.test('CERT-01: Contract Conformance & Strict Schema Containment', () => {
    const validReq = {
      request_id: 'req-earshot-cert-01',
      media_path: fixturePath,
      timebase: { duration_ticks: 600000, ticks_per_second: 120000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.0, kind: 'visual_cut', weight: 1.0 }],
      options: { mode: 'fast_dsp' }
    };
    const reqVal = EarshotContractValidator.validateRequest(validReq);
    assert.strictEqual(reqVal.valid, true);

    const badReq = { ...validReq, unauthorized_root_key: 123 };
    const badReqVal = EarshotContractValidator.validateRequest(badReq);
    assert.strictEqual(badReqVal.valid, false);
    assert.ok(badReqVal.errors.some(e => e.includes('unauthorized_root_key')));
  });

  await t.test('CERT-02: Calibrated Ground-Truth Defect Detection on qa-audio-defects.mp4', async () => {
    // Run QA on the calibrated fixture with visual cut at 1.0s
    const auditRes = await adapter.auditAudioQuality(fixturePath, {
      timebase: {
        duration_ticks: 600000,
        fps_numerator: 30,
        fps_denominator: 1
      },
      cues: [
        { frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }
      ],
      profile: {
        name: 'web_streaming',
        target_lufs: -14.0,
        lufs_tolerance: 2.0,
        true_peak_ceiling_dbtp: -1.0,
        sync_tolerance_ms: 33.33
      }
    });

    assert.ok(auditRes.checks.length >= 2);

    // Verify Defect 1: Audio Sync Desync (+150ms late)
    const syncCheck = auditRes.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck, 'CHK_EARSHOT_SYNC must be present');
    assert.strictEqual(syncCheck.status, 'failed', 'Desync must be flagged as failed');
    assert.ok(syncCheck.measured_value.max_offset_ms > 33.33, 'Offset exceeds frame tolerance');
    assert.ok(Math.abs(syncCheck.measured_value.max_offset_ms - 150) <= 25, 'Measured offset reflects ~150ms late sound');

    // Verify Defect 2: True Peak Overflow (> -1.0 dBTP ceiling)
    const tpCheck = auditRes.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
    assert.ok(tpCheck, 'CHK_EARSHOT_TRUE_PEAK must be present');
    assert.strictEqual(tpCheck.status, 'failed', 'True peak breach must fail');
    assert.ok(tpCheck.measured_value.true_peak_dbtp > -1.0, 'True peak exceeds -1.0 ceiling');
  });

  await t.test('CERT-03: Perception / Repair Separation (Advisory Finding, Zero Mutation Authority)', async () => {
    const auditRes = await adapter.auditAudioQuality(fixturePath, {
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut' }],
      timebase: { duration_ticks: 600000, fps_numerator: 30, fps_denominator: 1 }
    });

    const syncFinding = auditRes.rawResponse.sync?.details?.[0];
    assert.ok(syncFinding);
    assert.ok(syncFinding.offset_ticks > 0, 'Observed offset is positive (sound late)');

    // Proposed repair calculation by EME planner (never by Earshot directly):
    // Earshot offset = +18,000 ticks -> EME repair action: move_clip by -18,000 ticks
    const proposedShiftTicks = -syncFinding.offset_ticks;
    assert.ok(Math.abs(proposedShiftTicks - (-18000)) <= 3000, 'Repair proposal is -18000 ticks shift');

    // Confirm Earshot adapter exposes NO project modification methods
    assert.strictEqual(typeof adapter.applyRepair, 'undefined');
    assert.strictEqual(typeof adapter.mutateProject, 'undefined');
    assert.strictEqual(typeof client.mutateProject, 'undefined');
  });

  await t.test('CERT-04: Missing Tool & Dependency Fallback (NOT_MEASURED, Native QA Operational)', async () => {
    const unconfiguredClient = new EarshotWorkerClient({
      pythonPath: '/tmp/missing-python-3-path'
    });
    const fallbackAdapter = new EarshotAdapter({ workerClient: unconfiguredClient });

    const auditRes = await fallbackAdapter.auditAudioQuality(fixturePath);
    assert.ok(auditRes.checks.length >= 2);
    for (const c of auditRes.checks) {
      assert.strictEqual(c.status, 'not_measured', `Check ${c.id} must be not_measured when tool is missing`);
    }

    // Verify QualityAssuranceEngine native checks still pass/fail independently
    const mockProject = {
      canvas: { width: 1920, height: 1080 },
      timebase: { ticksPerSecond: 120000, durationTicks: 600000, fpsNumerator: 30, fpsDenominator: 1 },
      clips: [],
      assets: []
    };
    const qaReport = QualityAssuranceEngine.auditQuality(mockProject, fixturePath, {
      earshotOptions: { pythonPath: '/tmp/missing-python-3-path' }
    });
    assert.ok(qaReport);
    assert.ok(qaReport.checks.some(c => c.name === 'Deterministic Timebase Check'));
  });

  await t.test('CERT-05: Watchdog Timeout & Process Termination (SIGTERM -> SIGKILL)', async () => {
    const hungScript = path.join(__dirname, '../scratch/cert-hung-worker.py');
    fs.mkdirSync(path.dirname(hungScript), { recursive: true });
    fs.writeFileSync(hungScript, `import sys, time\nfor line in sys.stdin:\n    time.sleep(10)`, 'utf8');

    const timeoutClient = new EarshotWorkerClient({
      commandTimeoutMs: 250,
      bridgeScript: hungScript
    });

    const startRes = await timeoutClient.start();
    assert.strictEqual(startRes.ok, false);
    assert.ok(startRes.reason.includes('timed out'));
    assert.strictEqual(timeoutClient.isRunning, false);
  });

  await t.test('CERT-06: Security Sandbox & Realpath Containment', () => {
    // Path traversal attack rejection
    assert.throws(() => {
      client.assertAuthorizedPath(path.join(client.repoRoot, '../../../../etc/passwd'));
    }, /Security violation/);

    // Outside path rejection
    assert.throws(() => {
      client.assertAuthorizedPath('/var/log/system.log');
    }, /Security violation/);

    // Authorized repo root passes
    assert.doesNotThrow(() => {
      client.assertAuthorizedPath(fixturePath);
    });
  });

  await t.test('CERT-07: Zero Project Mutation & Delivery Session Invariance', async () => {
    const project = {
      project_id: 'proj-cert-invariance',
      revision: 42,
      canvas: { width: 1920, height: 1080 },
      timebase: { ticksPerSecond: 120000, durationTicks: 600000, fpsNumerator: 30, fpsDenominator: 1 },
      clips: [{ id: 'clip-v1', start: 0, duration: 600000 }]
    };

    const initialSha = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');

    const renderJob = {
      job_id: 'rjob-cert-01',
      output_profile: { width: 1920, height: 1080, frame_rate: { numerator: 30, denominator: 1 } }
    };

    const qaReport = RenderOrchestrator.inspectRenderedMedia({
      mediaPath: fixturePath,
      project,
      renderJob,
      options: { enableEarshot: true }
    });

    const finalSha = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');
    assert.strictEqual(initialSha, finalSha, 'Project must be bit-for-bit unchanged');
    assert.ok(qaReport);
  });

  await t.test('CERT-08: Malformed & Oversized Worker Output Protection', async () => {
    // Malformed JSON response test
    const dummyClient = new EarshotWorkerClient();
    dummyClient.currentCommand = {
      resolve: () => {},
      reject: (err) => {
        assert.ok(err.message.includes('parse worker JSON') || err.message.includes('exceeded'));
      }
    };
    dummyClient.handleWorkerOutput('MALFORMED_NON_JSON_DATA');

    // Oversized response test (>5MB)
    dummyClient.currentCommand = {
      resolve: () => {},
      reject: (err) => {
        assert.ok(err.message.includes('exceeded maximum size limit'));
      }
    };
    const hugeLine = '{"data":"' + 'X'.repeat(6 * 1024 * 1024) + '"}';
    dummyClient.handleWorkerOutput(hugeLine);
  });

  await t.test('CERT-09: Worker Recovery & Lifecycle Stability Across Repeated Restarts', async () => {
    const recoveryClient = new EarshotWorkerClient();
    for (let cycle = 0; cycle < 3; cycle++) {
      const s = await recoveryClient.start();
      assert.strictEqual(s.ok, true, `Cycle ${cycle + 1} start failed`);
      assert.strictEqual(recoveryClient.isRunning, true);
      recoveryClient.stop();
      assert.strictEqual(recoveryClient.isRunning, false);
    }
  });

  await t.test('CERT-10: Frozen Canonical Schemas & Zero Runtime NPM Dependencies', () => {
    // 1. Zero runtime npm dependencies
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    assert.deepStrictEqual(pkg.dependencies || {}, {}, 'Core EME package.json must have 0 runtime npm dependencies');

    // 2. Canonical schemas preserved
    const schemaDir = path.resolve(__dirname, '../schema');
    const schemas = fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json'));
    assert.ok(schemas.length >= 10, 'Canonical schemas must be present');
    for (const s of schemas) {
      assert.doesNotThrow(() => {
        JSON.parse(fs.readFileSync(path.join(schemaDir, s), 'utf8'));
      }, `Schema ${s} must be valid JSON`);
    }
  });

  await t.test('CERT-11: Subprocess Execution Behavior & Bounded Latency (CERT-25-A)', async () => {
    // 1. Measure synchronous blocking latency on test fixture
    const startNs = process.hrtime.bigint();
    const syncRes = adapter.auditAudioQualitySync(fixturePath, {
      timebase: { duration_ticks: 600000, fps_numerator: 30, fps_denominator: 1 }
    });
    const measuredBlockingMs = Number(process.hrtime.bigint() - startNs) / 1e6;

    assert.ok(syncRes);
    assert.strictEqual(syncRes.execution_mode, 'sync_blocking');
    assert.ok(typeof syncRes.blocking_duration_ms === 'number');
    // Ensure synchronous execution completes within reasonable bounded time (< 1500ms on real media)
    assert.ok(measuredBlockingMs < 2000, `Synchronous blocking duration (${measuredBlockingMs.toFixed(1)}ms) must be bounded < 2000ms`);

    // 2. Verify asynchronous execution via auditQualityAsync
    const mockProject = {
      canvas: { width: 1920, height: 1080 },
      timebase: { ticksPerSecond: 120000, durationTicks: 600000, fpsNumerator: 30, fpsDenominator: 1 },
      clips: [],
      assets: []
    };
    const asyncReport = await QualityAssuranceEngine.auditQualityAsync(mockProject, fixturePath);
    assert.ok(asyncReport);
    assert.strictEqual(asyncReport.earshot_telemetry?.execution_mode, 'async_worker');
    assert.ok(typeof asyncReport.earshot_telemetry?.execution_duration_ms === 'number');

    // 3. Verify native FFmpeg checks & failure continuity under simulated timeout
    const timeoutAdapter = new EarshotAdapter({
      workerClient: new EarshotWorkerClient({ commandTimeoutMs: 1 })
    });
    const timedOutRes = timeoutAdapter.auditAudioQualitySync(fixturePath);
    assert.ok(timedOutRes);
    assert.strictEqual(timedOutRes.rawResponse.status, 'TIMEOUT');
    assert.ok(timedOutRes.checks.every(c => c.status === 'not_measured'));
  });

  await t.test('CERT-12: Full Timeline Synchronization Path & Cold-Start Isolation (CERT-25-B)', async () => {
    // 1. Full timeline analysis dispatch via earshot.timeline.sync
    const auditRes = await adapter.auditAudioQuality(fixturePath, {
      timebase: { duration_ticks: 600000, fps_numerator: 30, fps_denominator: 1 },
      cues: [{ frame: 30, time_seconds: 1.000, kind: 'visual_cut', weight: 1.0 }]
    });

    assert.ok(auditRes.rawResponse.sync);
    const syncItem = auditRes.rawResponse.sync.details[0];
    assert.ok(syncItem);
    assert.strictEqual(syncItem.cut_seconds, 1.0);
    // Sound is late by +150ms (+18,000 ticks)
    assert.ok(Math.abs(syncItem.offset_ms - 150.0) <= 25, `Expected offset ~150ms, got ${syncItem.offset_ms}ms`);
    assert.ok(Math.abs(syncItem.offset_ticks - 18000) <= 3000, `Expected ticks ~18,000, got ${syncItem.offset_ticks}`);
    assert.ok(syncItem.sound_onset_seconds > 1.0, 'Sound onset occurs after visual cut');

    // 2. Cold-start readiness isolation: ping handshake completes in < 2000ms with zero neural model loading
    const coldClient = new EarshotWorkerClient();
    const coldStartNs = process.hrtime.bigint();
    const ready = await coldClient.start();
    const coldDurationMs = Number(process.hrtime.bigint() - coldStartNs) / 1e6;
    coldClient.stop();

    assert.strictEqual(ready.ok, true);
    assert.ok(coldDurationMs < 2500, `Cold start ping took ${coldDurationMs}ms (expected < 2500ms)`);

    // 3. Unmeasured / Timed-out sync check must never silently pass
    const brokenRes = {
      status: 'TIMEOUT',
      error: { message: 'Worker timed out' }
    };
    const brokenChecks = adapter.mapResponseToChecks(brokenRes, { target_lufs: -14, lufs_tolerance: 2, true_peak_ceiling_dbtp: -1 }, 33.33, [{ time_seconds: 1.0 }]);
    const brokenSyncCheck = brokenChecks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(brokenSyncCheck, 'CHK_EARSHOT_SYNC must be generated even on timeout');
    assert.strictEqual(brokenSyncCheck.status, 'not_measured');
    assert.strictEqual(brokenSyncCheck.severity, 'HIGH');
  });

  await t.test('CERT-13: Status Mapping & Silence Semantics Verification (CERT-25-C)', async () => {
    // 1. Digital silence mapping (status: not_measured, severity: HIGH, never accidental pass)
    const silenceResp = {
      status: 'SUCCESS',
      loudness: {
        integrated_lufs: null,
        lufs_reason: 'silence',
        true_peak_dbtp: null,
        true_peak_reason: 'silence',
        loudness_range_lu: null,
        clipping_samples: 0,
        compliant: null
      }
    };
    const silenceChecks = adapter.mapResponseToChecks(silenceResp, { target_lufs: -14, lufs_tolerance: 2, true_peak_ceiling_dbtp: -1 }, 33.33);
    const silenceLoudness = silenceChecks.find(c => c.id === 'CHK_EARSHOT_LOUDNESS');
    assert.strictEqual(silenceLoudness.status, 'not_measured');
    assert.strictEqual(silenceLoudness.severity, 'HIGH');
    assert.ok(silenceLoudness.detail.includes('silence'));

    // 2. Inapplicable request mapping (container without audio stream)
    const naResp = {
      status: 'NOT_APPLICABLE',
      error: { message: 'No audio track present in media' }
    };
    const naChecks = adapter.mapResponseToChecks(naResp, { target_lufs: -14, lufs_tolerance: 2, true_peak_ceiling_dbtp: -1 }, 33.33, [{ time_seconds: 1.0 }]);
    for (const c of naChecks) {
      assert.strictEqual(c.status, 'not_applicable');
      assert.strictEqual(c.severity, 'INFO');
    }
  });
});
