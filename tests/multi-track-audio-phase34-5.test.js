/**
 * Editing Mechanics Engine (EME) - Phase 34.5 Test Suite
 * Multi-Track Audio Ducking & Sonic Polish Slice
 *
 * Verifies:
 * 1. Audio asset catalog & metadata integrity (real assets, physical files, SHA-256, formats).
 * 2. Deterministic asset selection & tie-breaking (mood, energy, tempo, duration scoring).
 * 3. Exact rational conversion between 120,000 ticks/sec and 48,000 Hz audio samples.
 * 4. Speech interval detection and gap merging (preventing rapid pumping).
 * 5. CID-03 speech ducking gain envelope compilation (-24dB attenuation, 300ms attack, 450ms release).
 * 6. Canonical OperationPlan compilation & OperationExecutor authority (set_audio_envelope).
 * 7. Multi-track native mixing & true-peak limiter (-1.0 dBFS ceiling, zero clipping).
 * 8. EBUR128 loudness compliance (-14 +/- 1 LUFS) & quantitative ducking verification.
 * 9. Real rendered video & audio muxing slice from raw_talking_head_30s.mp4.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  AudioCatalog,
  AudioSelector,
  SpeechDuckingCompiler,
  CID03_DUCKING_PROFILE,
  AudioMixerEngine,
  CreativePlanCompiler,
  CreativeContextBuilder,
  MockLlmAdapter,
  CompositionRenderer
} = require('../src/creative/index.js');
const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { FrameInspector } = require('../src/renderers/inspector.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.resolve(PROJECT_ROOT, 'artifacts', 'phase-34');
const TALKING_HEAD_VIDEO = path.resolve(PROJECT_ROOT, 'raw_videos', 'raw_talking_head_30s.mp4');
const FIXTURE_PROJECT_PATH = path.resolve(__dirname, '../fixtures/prompt-core/projects/project-pf02-scenario1.json');

test('Phase 34.5: Multi-Track Audio Ducking & Sonic Polish Suite', async (t) => {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // =========================================================================
  // Section 1: Audio Asset Catalog & Metadata Integrity
  // =========================================================================
  await t.test('1.1: AudioCatalog lists only real verified local assets without hallucination', () => {
    const assets = AudioCatalog.listAvailableAssets(PROJECT_ROOT);
    assert.ok(assets.length >= 6, 'Must index all verified local BGM and SFX assets');

    const bgmTracks = assets.filter(a => a.sub_type === 'bgm');
    const sfxCues = assets.filter(a => a.sub_type === 'sfx');

    assert.ok(bgmTracks.length >= 3, 'Must index at least 3 verified BGM tracks');
    assert.ok(sfxCues.length >= 3, 'Must index at least 3 verified SFX cues');

    // All registered assets must physically exist on disk
    for (const a of assets) {
      assert.equal(a.available, true, `Asset ${a.asset_id} must physically exist on disk`);
      assert.ok(a.size_bytes > 0, `Asset ${a.asset_id} size must be non-zero`);
      assert.ok(a.sha256 && a.sha256.length === 64, `Asset ${a.asset_id} must have valid SHA-256`);
      assert.equal(typeof a.duration_sec, 'number');
      assert.ok(a.licensing && a.licensing.physical_verification === 'verified_local', `Asset ${a.asset_id} must have verified local physical presence`);
      assert.ok(a.licensing.rights_status, `Asset ${a.asset_id} must have explicit rights_status`);
    }
  });

  await t.test('1.2: AudioCatalog.getAsset returns valid asset or throws typed error', () => {
    const snowfall = AudioCatalog.getAsset('bgm_snowfall', PROJECT_ROOT);
    assert.equal(snowfall.asset_id, 'bgm_snowfall');
    assert.equal(snowfall.format, 'mp3');
    assert.equal(snowfall.sample_rate, 48000);

    // Non-existent asset ID throws
    assert.throws(() => {
      AudioCatalog.getAsset('non_existent_track_999', PROJECT_ROOT);
    }, /ERR_AUDIO_ASSET_NOT_FOUND/);
  });

  // =========================================================================
  // Section 2: Deterministic Asset Selection & Tie-Breaking
  // =========================================================================
  await t.test('2.1: AudioSelector deterministically ranks and selects BGM matching creative intent', () => {
    // Upbeat energetic request -> bgm_creator_reel
    const upbeat = AudioSelector.selectMusic({
      mood: 'upbeat_energetic',
      energy: 'high',
      tempo: 'medium_fast',
      baseDir: PROJECT_ROOT
    });
    assert.equal(upbeat.selectedAsset.asset_id, 'bgm_creator_reel');
    assert.ok(upbeat.score >= 70, `Score (${upbeat.score}) must reflect multi-criteria match`);

    // Ambient calm request -> bgm_snowfall
    const calm = AudioSelector.selectMusic({
      mood: 'ambient_calm',
      energy: 'low',
      tempo: 'slow',
      baseDir: PROJECT_ROOT
    });
    assert.equal(calm.selectedAsset.asset_id, 'bgm_snowfall');

    // Cinematic request -> bgm_cinematic_ad
    const cinematic = AudioSelector.selectMusic({
      mood: 'cinematic_dramatic',
      energy: 'medium_high',
      baseDir: PROJECT_ROOT
    });
    assert.equal(cinematic.selectedAsset.asset_id, 'bgm_cinematic_ad');
  });

  await t.test('2.2: Deterministic tie-breaking produces identical selection across runs', () => {
    // Neutral criteria yielding tie between tracks
    const run1 = AudioSelector.selectMusic({ minDurationSec: 10, baseDir: PROJECT_ROOT });
    const run2 = AudioSelector.selectMusic({ minDurationSec: 10, baseDir: PROJECT_ROOT });

    assert.equal(run1.selectedAsset.asset_id, run2.selectedAsset.asset_id);
    assert.equal(run1.score, run2.score);
  });

  await t.test('2.3: AudioSelector selects motivated SFX cues matching editorial roles', () => {
    const impact = AudioSelector.selectSfx({ role: 'transition_accent', baseDir: PROJECT_ROOT });
    assert.equal(impact.asset_id, 'sfx_bass_impact');
    assert.equal(impact.category, 'impact');

    const typing = AudioSelector.selectSfx({ role: 'text_reveal_accent', baseDir: PROJECT_ROOT });
    assert.equal(typing.asset_id, 'sfx_apple_typing');
    assert.equal(typing.category, 'ui_haptic');
  });

  // =========================================================================
  // Section 3: Timebase & Rational Sample Boundary Arithmetic
  // =========================================================================
  await t.test('3.1: Rational conversion between 120,000 ticks/sec and 48,000 Hz audio samples', () => {
    // Exact 1.0s = 120,000 ticks = 48,000 samples
    assert.equal(SpeechDuckingCompiler.ticksToSamples(120000, 48000), 48000);
    assert.equal(SpeechDuckingCompiler.samplesToTicks(48000, 48000), 120000);

    // 0.5s = 60,000 ticks = 24,000 samples
    assert.equal(SpeechDuckingCompiler.ticksToSamples(60000, 48000), 24000);
    assert.equal(SpeechDuckingCompiler.samplesToTicks(24000, 48000), 60000);

    // 1 frame at 30fps = 4,000 ticks = 1,600 samples
    assert.equal(SpeechDuckingCompiler.ticksToSamples(4000, 48000), 1600);
    assert.equal(SpeechDuckingCompiler.samplesToTicks(1600, 48000), 4000);

    // Float ticks violate integer timebase and fail closed
    assert.throws(() => {
      SpeechDuckingCompiler.ticksToSamples(1200.5, 48000);
    }, /ERR_INVALID_TICK/);
  });

  // =========================================================================
  // Section 4: Speech Interval Detection & Overlap Merging
  // =========================================================================
  await t.test('4.1: Merges overlapping or close speech intervals to eliminate rapid pumping', () => {
    // Two speech bursts separated by only 200ms (24,000 ticks < 48,000 tolerance)
    const raw = [
      { startTick: 120000, endTick: 240000 }, // 1.0s - 2.0s
      { startTick: 264000, endTick: 360000 }  // 2.2s - 3.0s (200ms gap)
    ];

    const merged = SpeechDuckingCompiler.mergeSpeechIntervals(raw, 48000); // 400ms tolerance
    assert.equal(merged.length, 1, 'Should merge closely spaced speech segments into single coherent region');
    assert.equal(merged[0].startTick, 120000);
    assert.equal(merged[0].endTick, 360000);
  });

  await t.test('4.2: Detects real speech intervals from extracted dialogue audio', () => {
    // Extract 3s dialogue from raw_talking_head_30s.mp4
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    spawnSync('ffmpeg', ['-y', '-ss', '1.0', '-t', '3.0', '-i', TALKING_HEAD_VIDEO, '-vn', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', diagWav]);
    assert.ok(fs.existsSync(diagWav));

    const intervals = SpeechDuckingCompiler.detectSpeechIntervalsFromWav(diagWav, {
      sampleRate: 48000,
      thresholdDb: -26.0
    });

    assert.ok(intervals.length >= 1, 'Must detect active speech intervals from real talking head');
    assert.ok(intervals[0].startTick >= 0);
    assert.ok(intervals[0].endTick > intervals[0].startTick);
  });

  // =========================================================================
  // Section 5: Gain Envelope Generation (CID-03 Profile)
  // =========================================================================
  await t.test('5.1: Compiles time-varying gain envelope keyframes conforming to CID-03 profile', () => {
    const intervals = [
      { startTick: 120000, endTick: 360000 } // speech active between 1.0s and 3.0s
    ];
    const totalTicks = 600000; // 5.0s

    const keyframes = SpeechDuckingCompiler.compileGainEnvelope({
      speechIntervals: intervals,
      totalDurationTicks: totalTicks,
      profile: CID03_DUCKING_PROFILE,
      baseVolume: 1.0
    });

    assert.ok(keyframes.length >= 5, 'Must generate attack ramp, ducked sustain, and release recovery keyframes');

    // Keyframe 1: Start at full volume
    assert.equal(keyframes[0].offsetTick, 0);
    assert.equal(keyframes[0].volume, 1.0);

    // Keyframe: Attack ramp start (120,000 - 36,000 = 84,000 ticks)
    const attackStart = keyframes.find(k => k.offsetTick === 84000);
    assert.ok(attackStart, 'Must begin attack ramp 300ms prior to speech');
    assert.equal(attackStart.volume, 1.0);

    // Keyframe: Full ducking at speech onset (120,000 ticks)
    const duckOnset = keyframes.find(k => k.offsetTick === 120000);
    assert.ok(duckOnset, 'Must achieve target ducking at speech onset');
    assert.equal(duckOnset.volume, 0.0631); // -24 dB linear

    // Keyframe: Sustained ducking at speech end (360,000 ticks)
    const duckEnd = keyframes.find(k => k.offsetTick === 360000);
    assert.ok(duckEnd);
    assert.equal(duckEnd.volume, 0.0631);

    // Keyframe: Release recovery ramp (360,000 + 54,000 = 414,000 ticks)
    const releaseEnd = keyframes.find(k => k.offsetTick === 414000);
    assert.ok(releaseEnd, 'Must complete release recovery 450ms after speech end');
    assert.equal(releaseEnd.volume, 1.0);

    // Keyframe: End of timeline
    assert.equal(keyframes[keyframes.length - 1].offsetTick, totalTicks);
    assert.equal(keyframes[keyframes.length - 1].volume, 1.0);
  });

  // =========================================================================
  // Section 6: Canonical Plan Compilation & OperationExecutor Authority
  // =========================================================================
  await t.test('6.1: CreativePlanCompiler compiles set_audio_envelope for music track', async () => {
    const project = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
    const context = CreativeContextBuilder.buildContext({
      brief: 'Create a 10s punchy 9:16 vertical reel with speech ducking',
      project
    });
    const creativePlan = await new MockLlmAdapter().generateCreativePlan({ context });

    const speechIntervals = [
      { startTick: 120000, endTick: 360000 }
    ];

    const compileRes = CreativePlanCompiler.compile({
      creativePlan,
      project,
      options: {
        speechIntervals,
        sfxCues: [
          { assetId: 'sfx_bass_impact', startTick: 60000, durationTicks: 168000, gain: 0.8 }
        ]
      }
    });

    assert.equal(compileRes.success, true);
    assert.equal(compileRes.errors.length, 0);

    // Find music insert_clip
    const musicClipOp = compileRes.operationPlan.operations.find(
      op => op.type === 'insert_clip' && op.params.id === 'clip_soundtrack_bed'
    );
    assert.ok(musicClipOp, 'Must emit insert_clip for soundtrack bed');
    assert.ok(musicClipOp.params.audio.volumeEnvelope, 'Must include volumeEnvelope on music clip');

    // Find set_audio_envelope operation
    const setEnvelopeOp = compileRes.operationPlan.operations.find(
      op => op.type === 'set_audio_envelope' && op.target_id === 'clip_soundtrack_bed'
    );
    assert.ok(setEnvelopeOp, 'Must emit canonical set_audio_envelope operation');
    assert.ok(setEnvelopeOp.params.volumeKeyframes.length >= 4);

    // Find SFX insert_clip
    const sfxClipOp = compileRes.operationPlan.operations.find(
      op => op.type === 'insert_clip' && op.params.id.startsWith('clip_sfx')
    );
    assert.ok(sfxClipOp, 'Must emit insert_clip for SFX cue');

    // Dry run simulation confirms zero mutation
    assert.ok(compileRes.dryRunResult);
    assert.equal(compileRes.dryRunResult.success, true);
  });

  // =========================================================================
  // Section 7: Multi-Track Native Audio Mixing & Limiting
  // =========================================================================
  await t.test('7.1: Mixes Dialogue, Ducked Music, and SFX layers with true-peak limiting', () => {
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    const bgmWav = path.resolve(PROJECT_ROOT, 'assets/bgm/snowfall.mp3');
    const sfxWav = path.resolve(PROJECT_ROOT, 'assets/sfx/synergy/reel_01_bass_impact.wav');
    const outMixWav = path.join(ARTIFACTS_DIR, 'phase34_5_test_mix.wav');

    const intervals = [{ startSec: 1.0, endSec: 2.5, startTick: 120000, endTick: 300000 }];
    const kfs = SpeechDuckingCompiler.compileGainEnvelope({
      speechIntervals: intervals,
      totalDurationTicks: 360000
    });

    const mixRes = AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 1.0,
      musicPath: bgmWav,
      musicGain: 0.6,
      musicVolumeEnvelope: kfs,
      sfxCues: [{ path: sfxWav, startSec: 0.5, gain: 0.8 }],
      durationSec: 3.0,
      outputPath: outMixWav
    });

    assert.equal(mixRes.metrics.passedQa, true, 'Mixer must pass QA');
    assert.ok(mixRes.metrics.finalPeakDb <= -0.9, 'Master peak must be <= -0.9 dBFS');
    assert.equal(mixRes.metrics.clippedSamples, 0, 'Must have 0 clipped samples');
    assert.ok(fs.existsSync(outMixWav));
  });

  // =========================================================================
  // Section 8: Loudness & True-Peak Compliance (EBUR128)
  // =========================================================================
  await t.test('8.1: Audits loudness and verifies speech-region ducking attenuation delta', () => {
    const diagWav = path.join(ARTIFACTS_DIR, 'test_dialogue_3s.wav');
    const bgmWav = path.resolve(PROJECT_ROOT, 'assets/creator_reel_soundtrack_20s.wav');
    const duckedMixWav = path.join(ARTIFACTS_DIR, 'phase34_5_ducked_master.wav');
    const baselineMixWav = path.join(ARTIFACTS_DIR, 'phase34_5_baseline_unducked.wav');

    const intervals = [{ startSec: 1.0, endSec: 2.5, startTick: 120000, endTick: 300000 }];

    // 1. Render Ducked Mix
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

    // 2. Render Baseline Mix WITHOUT Ducking
    AudioMixerEngine.renderMix({
      dialoguePath: diagWav,
      dialogueGain: 0.65,
      musicPath: bgmWav,
      musicGain: 0.90,
      musicVolumeEnvelope: null, // no ducking
      durationSec: 3.0,
      outputPath: baselineMixWav,
      targetLufs: -14.0
    });

    // 3. Quantitative Audit
    const audit = AudioMixerEngine.auditAudioMix({
      masterAudioPath: duckedMixWav,
      baselineAudioPath: baselineMixWav,
      speechIntervals: intervals
    });

    assert.ok(audit.truePeakDb <= -0.9, `True peak (${audit.truePeakDb} dBFS) must be <= -0.9 dBFS`);
    assert.ok(audit.integratedLoudnessLufs >= -15.0 && audit.integratedLoudnessLufs <= -13.0, `Integrated loudness (${audit.integratedLoudnessLufs} LUFS) must fall within -14 +/- 1 LUFS`);
    assert.ok(audit.attenuationDbDelta >= 2.0, `Speech region attenuation delta (${audit.attenuationDbDelta} dB) must be >= 2.0 dB`);
    assert.equal(audit.duckingPassed, true);
    assert.equal(audit.verified, true);
  });

  // =========================================================================
  // Section 9: Real Rendered Video & Audio Muxing Slice
  // =========================================================================
  await t.test('9.1: Renders final talking-head video with ducked soundtrack and SFX', () => {
    // 3.0s conformed video sample from raw talking head
    const videoSamplePath = path.join(ARTIFACTS_DIR, 'phase34_5_video_sample_3s.mp4');
    spawnSync('ffmpeg', ['-y', '-ss', '1.0', '-t', '3.0', '-i', TALKING_HEAD_VIDEO, '-c:v', 'copy', '-an', videoSamplePath]);
    const audioMasterWav = path.join(ARTIFACTS_DIR, 'phase34_5_ducked_master.wav');
    const finalMuxedMp4 = path.join(ARTIFACTS_DIR, 'phase34_5_final_ducked_reel.mp4');

    assert.ok(fs.existsSync(videoSamplePath), 'Conformed 3s video sample must exist');
    assert.ok(fs.existsSync(audioMasterWav), 'Master audio WAV must exist');

    const outPath = AudioMixerEngine.muxVideoAudio({
      videoPath: videoSamplePath,
      audioPath: audioMasterWav,
      outputPath: finalMuxedMp4,
      durationSec: 3.0
    });

    assert.equal(outPath, finalMuxedMp4);
    assert.ok(fs.existsSync(finalMuxedMp4));

    // Verify stream metadata & exact audio/video duration alignment
    const metadata = FrameInspector.inspectVideoMetadata(finalMuxedMp4);
    assert.equal(metadata.video.codec, 'h264');
    assert.ok(Math.abs(metadata.duration - 3.0) < 0.15, `Duration (${metadata.duration}s) must align with 3.0s timeline`);
  });
});
