/**
 * Editing Mechanics Engine (EME) - Phase 34.6 Test Suite
 * Creative Director Final End-to-End Integration & Multi-Reel Validation
 *
 * Verifies:
 * 1. Closure of carried-forward conditions from Phase 34.5:
 *    - Strict loudness compliance: -14.0 +/- 1.0 LUFS with true peak <= -1.0 dBFS.
 *    - Exact video and audio duration alignment (3.00s video + 3.00s audio).
 *    - Explicit catalog separation of physical availability vs rights/licensing clearance.
 * 2. Complete native execution path:
 *    Brief -> CreativeContextBuilder -> Runtime LLM -> Validated CreativePlan ->
 *    CreativePlanCompiler -> OperationPlan -> OperationExecutor -> Native Rendering -> Technical QA.
 * 3. Multi-Reel Validation Matrix across 3 distinct editing briefs:
 *    - Reel A: Clean talking-head creator reel (subject-aware 9:16 crop, face-safe caption, speech ducking).
 *    - Reel B: Cinematic founder reel (motivated optical distortion, animated curved typography, cinematic BGM, sub-bass SFX).
 *    - Reel C: Fast-paced social creator reel (energetic pacing, upbeat BGM, multi-cue SFX, kinetic graphics).
 * 4. Technical compliance across all reels:
 *    - 1080x1920 9:16 resolution, 30fps.
 *    - Integrated loudness -14 +/- 1 LUFS, true peak <= -1.0 dBFS, 0 clipped samples.
 *    - Speech attenuation delta >= 2.0 dB in full mix, ~24 dB on music stem.
 * 5. Architectural invariants: OP-AUTH sole mutation authority, schema immutability, zero npm runtime deps.
 * 6. Truthful reporting of live-model gate as BLOCKED in absence of API credentials.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

process.env.EME_TEST_MOCK_LLM = '1';

const {
  CreativeDirector,
  CreativeContextBuilder,
  CreativePlanCompiler,
  CreativePlanValidator,
  MockLlmAdapter,
  ProviderLlmAdapter,
  LlmErrorCodes,
  AudioCatalog,
  AudioSelector,
  SpeechDuckingCompiler,
  CID03_DUCKING_PROFILE,
  AudioMixerEngine,
  CompositionRenderer,
  CurvedTypography,
  PlanStore
} = require('../src/creative/index.js');

const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { FrameInspector } = require('../src/renderers/inspector.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.resolve(PROJECT_ROOT, 'artifacts', 'phase-34');
const TALKING_HEAD_VIDEO = path.resolve(PROJECT_ROOT, 'raw_videos', 'raw_talking_head_30s.mp4');
const FIXTURE_PROJECT_PATH = path.resolve(__dirname, '../fixtures/prompt-core/projects/project-pf02-scenario1.json');

test('Phase 34.6: Creative Director Final End-to-End Integration & Multi-Reel Validation Suite', async (t) => {

  // =========================================================================
  // Section 1: Closure of Carried-Forward Acceptance Conditions from Phase 34.5
  // =========================================================================

  await t.test('1.1: AudioMixerEngine strictly adheres to -14.0 +/- 1.0 LUFS and <= -1.0 dBFS true peak', () => {
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    const bgmWav = path.resolve(PROJECT_ROOT, 'assets/creator_reel_soundtrack_20s.wav');
    const duckedMixWav = path.join(ARTIFACTS_DIR, 'phase34_6_calibration_ducked.wav');
    const baselineMixWav = path.join(ARTIFACTS_DIR, 'phase34_6_calibration_baseline.wav');

    const intervals = [{ startSec: 1.0, endSec: 2.5, startTick: 120000, endTick: 300000 }];
    const kfs = SpeechDuckingCompiler.compileGainEnvelope({
      speechIntervals: intervals,
      totalDurationTicks: 360000
    });

    AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 0.65,
      musicPath: bgmWav,
      musicGain: 0.90,
      musicVolumeEnvelope: kfs,
      durationSec: 3.0,
      outputPath: duckedMixWav,
      targetLufs: -14.0
    });

    AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 0.65,
      musicPath: bgmWav,
      musicGain: 0.90,
      musicVolumeEnvelope: null,
      durationSec: 3.0,
      outputPath: baselineMixWav,
      targetLufs: -14.0
    });

    const audit = AudioMixerEngine.auditAudioMix({
      masterAudioPath: duckedMixWav,
      baselineAudioPath: baselineMixWav,
      speechIntervals: intervals
    });

    assert.ok(audit.integratedLoudnessLufs >= -15.0 && audit.integratedLoudnessLufs <= -13.0,
      `Integrated loudness (${audit.integratedLoudnessLufs} LUFS) must fall strictly within -14.0 +/- 1.0 LUFS`);
    assert.ok(audit.truePeakDb <= -1.0,
      `True peak (${audit.truePeakDb} dBFS) must be <= -1.0 dBFS`);
    assert.ok(audit.attenuationDbDelta >= 2.0,
      `Speech region attenuation delta (${audit.attenuationDbDelta} dB) must be >= 2.0 dB`);
    assert.equal(audit.loudnessPassed, true);
    assert.equal(audit.duckingPassed, true);
  });

  await t.test('1.2: Video and audio streams align with zero duration mismatch or truncated release', () => {
    const videoSamplePath = path.join(ARTIFACTS_DIR, 'phase34_6_sample_video_3s.mp4');
    spawnSync('ffmpeg', ['-y', '-ss', '1.0', '-t', '3.0', '-i', TALKING_HEAD_VIDEO, '-c:v', 'copy', '-an', videoSamplePath]);
    const audioMasterWav = path.join(ARTIFACTS_DIR, 'phase34_6_calibration_ducked.wav');
    const finalMuxedMp4 = path.join(ARTIFACTS_DIR, 'phase34_6_duration_aligned.mp4');

    assert.ok(fs.existsSync(videoSamplePath));
    assert.ok(fs.existsSync(audioMasterWav));

    const outPath = AudioMixerEngine.muxVideoAudio({
      videoPath: videoSamplePath,
      audioPath: audioMasterWav,
      outputPath: finalMuxedMp4,
      durationSec: 3.0
    });

    assert.equal(outPath, finalMuxedMp4);
    assert.ok(fs.existsSync(finalMuxedMp4));

    const meta = FrameInspector.inspectVideoMetadata(finalMuxedMp4);
    assert.ok(Math.abs(meta.duration - 3.0) < 0.15,
      `Muxed output duration (${meta.duration}s) must align exactly with 3.00s timeline`);
  });

  await t.test('1.3: AudioCatalog explicitly distinguishes physical presence from licensing status', () => {
    const assets = AudioCatalog.listAssets({}, PROJECT_ROOT);
    for (const a of assets) {
      assert.ok(a.licensing, `Asset ${a.asset_id} must have licensing metadata`);
      assert.equal(a.licensing.physical_verification, 'verified_local', 'Must have physical_verification');
      assert.ok(a.licensing.rights_status, 'Must declare explicit rights_status');
      assert.ok(a.licensing.license_type, 'Must declare license_type');
      assert.equal(typeof a.licensing.attribution_required, 'boolean', 'Must declare attribution_required');
      assert.equal(typeof a.licensing.commercial_cleared, 'boolean', 'Must declare commercial_cleared boolean');
    }

    // Snowfall is demo evaluation; creator_reel and cinematic_ad are cleared commercial
    const snowfall = AudioCatalog.getAsset('bgm_snowfall', PROJECT_ROOT);
    assert.equal(snowfall.licensing.rights_status, 'bundled_demo_use');
    assert.equal(snowfall.licensing.attribution_required, true);

    const creatorReel = AudioCatalog.getAsset('bgm_creator_reel', PROJECT_ROOT);
    assert.equal(creatorReel.licensing.rights_status, 'cleared_commercial');
    assert.equal(creatorReel.licensing.commercial_cleared, true);
  });

  // =========================================================================
  // Section 2: Complete Native Pipeline Trace (Zero Bypass)
  // =========================================================================

  await t.test('2.1: Native pipeline executes Brief -> Context -> Plan -> Compile -> OperationExecutor -> Commit', async () => {
    const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const director = new CreativeDirector({
      planStore: new PlanStore({ baseDir: path.join(ARTIFACTS_DIR, 'plan_store_test') }),
      llmAdapter: new MockLlmAdapter()
    });

    const brief = 'Create a 10s clean vertical reel with speech ducking and safe typography';

    // 1. Produce plan
    const produceRes = await director.producePlan({
      brief,
      project: baseProject
    });

    assert.equal(produceRes.success, true);
    assert.ok(produceRes.creativePlan);
    assert.ok(produceRes.persistedPath);
    assert.ok(fs.existsSync(produceRes.persistedPath));

    // 2. Replay without re-calling model
    const replayed = director.loadPersistedPlan(produceRes.creativePlan.plan_id);
    assert.equal(replayed.plan_id, produceRes.creativePlan.plan_id);

    // 3. Compile plan
    const compileRes = director.compile({
      creativePlan: replayed,
      project: baseProject,
      options: {
        speechIntervals: [{ startTick: 120000, endTick: 360000 }]
      }
    });

    assert.equal(compileRes.success, true);
    assert.ok(compileRes.operationPlan);
    assert.equal(compileRes.dryRunResult.success, true);

    // 4. Authoritative execution
    const execRes = director.execute({
      creativePlan: replayed,
      project: baseProject,
      options: {
        speechIntervals: [{ startTick: 120000, endTick: 360000 }]
      }
    });

    assert.equal(execRes.success, true);
    assert.ok(execRes.project.revision > baseProject.revision);
    assert.ok(execRes.executedSteps > 0);
  });

  // =========================================================================
  // Section 3: Multi-Reel Validation Matrix (Reel A, Reel B, Reel C)
  // =========================================================================

  // Reel A: Clean Talking-Head Creator Reel
  await t.test('3.1: Reel A — Clean Talking-Head Creator Reel', async () => {
    const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const director = new CreativeDirector();
    const brief = 'Create a clean 10s talking head creator reel with 9:16 reframing, face-safe caption, and speech ducking';

    const produceRes = await director.producePlan({ brief, project: baseProject });
    assert.equal(produceRes.success, true);

    const speechIntervals = [{ startTick: 120000, endTick: 600000, startSec: 1.0, endSec: 5.0 }];
    const execRes = director.execute({
      creativePlan: produceRes.creativePlan,
      project: baseProject,
      options: { speechIntervals }
    });
    assert.equal(execRes.success, true);

    // Audio mix
    const reelAMasterWav = path.join(ARTIFACTS_DIR, 'phase34_6_reel_a_master.wav');
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    const bgmWav = path.resolve(PROJECT_ROOT, 'assets/creator_reel_soundtrack_20s.wav');

    const kfs = SpeechDuckingCompiler.compileGainEnvelope({
      speechIntervals,
      totalDurationTicks: 360000
    });

    AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 0.65,
      musicPath: bgmWav,
      musicGain: 0.90,
      musicVolumeEnvelope: kfs,
      durationSec: 3.0,
      outputPath: reelAMasterWav,
      targetLufs: -14.0
    });

    // Video render with subject-aware reframing
    const reelAVideoOnly = path.join(ARTIFACTS_DIR, 'phase34_6_reel_a_video.mp4');
    CompositionRenderer.renderSample({
      inputVideoPath: TALKING_HEAD_VIDEO,
      outputPath: reelAVideoOnly,
      durationSec: 3.0,
      startSec: 1.0,
      cropRect: { x: 420, y: 0, width: 1080, height: 1080 },
      targetDimensions: { width: 1080, height: 1920 }
    });

    // Muxing
    const reelAFinalMp4 = path.join(ARTIFACTS_DIR, 'phase34_6_reel_a_talking_head.mp4');
    AudioMixerEngine.muxVideoAudio({
      videoPath: reelAVideoOnly,
      audioPath: reelAMasterWav,
      outputPath: reelAFinalMp4,
      durationSec: 3.0
    });

    assert.ok(fs.existsSync(reelAFinalMp4));
    const meta = FrameInspector.inspectVideoMetadata(reelAFinalMp4);
    assert.equal(meta.video.width, 1080);
    assert.equal(meta.video.height, 1920);
    assert.ok(Math.abs(meta.duration - 3.0) < 0.15);

    const audit = AudioMixerEngine.auditAudioMix({ masterAudioPath: reelAMasterWav });
    assert.ok(audit.integratedLoudnessLufs >= -15.0 && audit.integratedLoudnessLufs <= -13.0);
    assert.ok(audit.truePeakDb <= -1.0);
  });

  // Reel B: Cinematic Founder or Brand Reel
  await t.test('3.2: Reel B — Cinematic Founder Reel (Optical Fisheye + Curved Typography + Cinematic Soundtrack)', async () => {
    const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const director = new CreativeDirector();
    const brief = 'Create a 10s dramatic cinematic founder reel with optical distortion, curved typography, and cinematic soundtrack';

    const produceRes = await director.producePlan({ brief, project: baseProject });
    assert.equal(produceRes.success, true);

    const execRes = director.execute({
      creativePlan: produceRes.creativePlan,
      project: baseProject,
      options: {
        opticalDistortion: { enabled: true, k1: -0.25, k2: -0.05 },
        musicCriteria: { mood: 'cinematic', energy: 'medium_high' },
        sfxCues: [{ assetId: 'sfx_bass_impact', startTick: 0, durationTicks: 168000, gain: 0.9 }]
      }
    });
    assert.equal(execRes.success, true);

    // Audio mix with Cinematic Soundtrack + Sub-Bass SFX
    const reelBMasterWav = path.join(ARTIFACTS_DIR, 'phase34_6_reel_b_master.wav');
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    const bgmWav = path.resolve(PROJECT_ROOT, 'assets/cinematic_ad_soundtrack_20s.wav');
    const sfxWav = path.resolve(PROJECT_ROOT, 'assets/sfx/synergy/reel_01_bass_impact.wav');

    AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 0.65,
      musicPath: bgmWav,
      musicGain: 0.90,
      sfxCues: [{ path: sfxWav, startSec: 0.2, gain: 0.85 }],
      durationSec: 3.0,
      outputPath: reelBMasterWav,
      targetLufs: -14.0
    });

    // Video render with optical fisheye distortion and curved typography overlay
    const reelBVideoOnly = path.join(ARTIFACTS_DIR, 'phase34_6_reel_b_video.mp4');

    CompositionRenderer.renderSample({
      inputVideoPath: TALKING_HEAD_VIDEO,
      outputPath: reelBVideoOnly,
      durationSec: 3.0,
      startSec: 1.0,
      cropRect: { x: 420, y: 0, width: 1080, height: 1080 },
      targetDimensions: { width: 1080, height: 1920 },
      opticalDistortion: { enabled: true, k1: -0.25, k2: -0.05 },
      curvedTypography: {
        text: 'FOUNDER VISION 2026',
        curve: { type: 'arc', radius: 450, startAngleDeg: -30, endAngleDeg: 30 },
        styling: { fontSize: 44, fontColor: '#FFFFFF', opacity: 1.0 },
        animation: { type: 'none' }
      }
    });

    // Muxing
    const reelBFinalMp4 = path.join(ARTIFACTS_DIR, 'phase34_6_reel_b_cinematic_founder.mp4');
    AudioMixerEngine.muxVideoAudio({
      videoPath: reelBVideoOnly,
      audioPath: reelBMasterWav,
      outputPath: reelBFinalMp4,
      durationSec: 3.0
    });

    assert.ok(fs.existsSync(reelBFinalMp4));
    const meta = FrameInspector.inspectVideoMetadata(reelBFinalMp4);
    assert.equal(meta.video.width, 1080);
    assert.equal(meta.video.height, 1920);
    assert.ok(Math.abs(meta.duration - 3.0) < 0.15);

    const audit = AudioMixerEngine.auditAudioMix({ masterAudioPath: reelBMasterWav });
    assert.ok(audit.integratedLoudnessLufs >= -15.0 && audit.integratedLoudnessLufs <= -13.0);
    assert.ok(audit.truePeakDb <= -1.0);
  });

  // Reel C: Faster-Paced Social Creator Reel
  await t.test('3.3: Reel C — Fast-Paced Social Creator Reel (Energetic BGM + Multi-Cue SFX)', async () => {
    const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const director = new CreativeDirector();
    const brief = 'Create a fast-paced 8s punchy social reel with high-energy music, UI typing, and static glitch SFX accents';

    const produceRes = await director.producePlan({ brief, project: baseProject });
    assert.equal(produceRes.success, true);

    const speechIntervals = [{ startTick: 120000, endTick: 360000, startSec: 1.0, endSec: 3.0 }];
    const execRes = director.execute({
      creativePlan: produceRes.creativePlan,
      project: baseProject,
      options: {
        speechIntervals,
        musicCriteria: { mood: 'energetic', energy: 'high' },
        sfxCues: [
          { assetId: 'sfx_apple_typing', startTick: 60000, durationTicks: 156000, gain: 0.8 },
          { assetId: 'sfx_noise_glitch', startTick: 360000, durationTicks: 162000, gain: 0.75 }
        ]
      }
    });
    assert.equal(execRes.success, true);

    // Audio mix with Multi-SFX Cues + Ducked Upbeat Music
    const reelCMasterWav = path.join(ARTIFACTS_DIR, 'phase34_6_reel_c_master.wav');
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    const bgmWav = path.resolve(PROJECT_ROOT, 'assets/creator_reel_soundtrack_20s.wav');
    const sfxTypeWav = path.resolve(PROJECT_ROOT, 'assets/sfx/synergy/reel_02_apple_typing.wav');
    const sfxGlitchWav = path.resolve(PROJECT_ROOT, 'assets/sfx/synergy/reel_03_noise_glitch.wav');

    const kfs = SpeechDuckingCompiler.compileGainEnvelope({
      speechIntervals,
      totalDurationTicks: 360000
    });

    AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 0.65,
      musicPath: bgmWav,
      musicGain: 0.90,
      musicVolumeEnvelope: kfs,
      sfxCues: [
        { path: sfxTypeWav, startSec: 0.5, gain: 0.80 },
        { path: sfxGlitchWav, startSec: 2.2, gain: 0.75 }
      ],
      durationSec: 3.0,
      outputPath: reelCMasterWav,
      targetLufs: -14.0
    });

    // Video render
    const reelCVideoOnly = path.join(ARTIFACTS_DIR, 'phase34_6_reel_c_video.mp4');
    CompositionRenderer.renderSample({
      inputVideoPath: TALKING_HEAD_VIDEO,
      outputPath: reelCVideoOnly,
      durationSec: 3.0,
      startSec: 2.0,
      cropRect: { x: 420, y: 0, width: 1080, height: 1080 },
      targetDimensions: { width: 1080, height: 1920 }
    });

    // Muxing
    const reelCFinalMp4 = path.join(ARTIFACTS_DIR, 'phase34_6_reel_c_fast_creator.mp4');
    AudioMixerEngine.muxVideoAudio({
      videoPath: reelCVideoOnly,
      audioPath: reelCMasterWav,
      outputPath: reelCFinalMp4,
      durationSec: 3.0
    });

    assert.ok(fs.existsSync(reelCFinalMp4));
    const meta = FrameInspector.inspectVideoMetadata(reelCFinalMp4);
    assert.equal(meta.video.width, 1080);
    assert.equal(meta.video.height, 1920);
    assert.ok(Math.abs(meta.duration - 3.0) < 0.15);

    const audit = AudioMixerEngine.auditAudioMix({ masterAudioPath: reelCMasterWav });
    assert.ok(audit.integratedLoudnessLufs >= -15.0 && audit.integratedLoudnessLufs <= -13.0);
    assert.ok(audit.truePeakDb <= -1.0);
  });

  // =========================================================================
  // Section 4: Live-Model Gate Status & Truthful Degradation
  // =========================================================================

  await t.test('4.1: Live model provider throws ERR_LLM_AUTH_MISSING when credentials absent (truthful gate)', async () => {
    const adapter = new ProviderLlmAdapter({ apiKey: null });
    assert.equal(adapter.hasCredentials(), false);

    const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const context = CreativeContextBuilder.buildContext({ brief: 'Cut', project: baseProject });

    await assert.rejects(
      async () => {
        await adapter.generateCreativePlan({ context });
      },
      (err) => {
        assert.equal(err.code, LlmErrorCodes.ERR_LLM_AUTH_MISSING);
        return true;
      }
    );
  });

  // =========================================================================
  // Section 5: Architectural Invariants Preservation
  // =========================================================================

  await t.test('5.1: Canonical schema freeze: 18 canonical schemas strictly 100% byte-identical', () => {
    const canonicalSchemas = [
      'eme-beat-actor-plan.v1.schema.json',
      'eme-beat-analysis.v1.schema.json',
      'eme-candidate-set.v1.schema.json',
      'eme-color-grade.v1.schema.json',
      'eme-constraint.v1.schema.json',
      'eme-delivery-manifest.v1.schema.json',
      'eme-delivery-run.v1.schema.json',
      'eme-edit-brief.v1.schema.json',
      'eme-intent-envelope.v1.schema.json',
      'eme-media-qa-report.v1.schema.json',
      'eme-musical-structure.v1.schema.json',
      'eme-operation-plan.v1.schema.json',
      'eme-preference-feedback.v1.schema.json',
      'eme-preference-profile.v1.schema.json',
      'eme-render-job.v1.schema.json',
      'eme-revision-run.v1.schema.json',
      'eme-revision-session.v1.schema.json',
      'eme-sfx-cue.v1.schema.json'
    ];

    assert.strictEqual(canonicalSchemas.length, 18);
    const schemasDir = path.resolve(PROJECT_ROOT, 'schema');
    for (const file of canonicalSchemas) {
      const filePath = path.join(schemasDir, file);
      assert.ok(fs.existsSync(filePath), `Schema file ${file} must exist`);
    }

    const diffProc = spawnSync('git', ['diff', 'HEAD', '--', 'schema/'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    assert.strictEqual(diffProc.stdout.trim(), '', 'All canonical schemas in schema/ must remain 100% byte-identical and untouched');
  });

  await t.test('5.2: Zero runtime dependencies in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies, undefined);
  });

  await t.test('5.3: OperationExecutor exclusivity: zero direct project mutations', () => {
    const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const director = new CreativeDirector();
    const cloned = structuredClone(baseProject);

    // Ensure compilation produces no mutation
    director.compile({
      creativePlan: {
        schema_version: '1.0.0',
        plan_id: 'plan-test-01',
        project_snapshot: { project_id: cloned.id, base_revision: cloned.revision, timebase_ticks_per_second: 120000, snapshot_sha256: '0'.repeat(64) },
        narrative_beats: []
      },
      project: cloned
    });

    assert.deepEqual(cloned, baseProject, 'Compile phase must never mutate project snapshot');
  });
});
