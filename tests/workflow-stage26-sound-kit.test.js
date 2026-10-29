/**
 * Test Suite: Workflow Stage 26.5 - Closed-Loop Verification & Cumulative Regression
 *
 * Verifies the complete end-to-end integration of Phase 26:
 * 1. Isolated Sound Kit asset generation via EarshotKitClient (Correction A, C, F)
 * 2. Ingestion into SoundKitCatalog with physical transient alignment indexing
 * 3. Frame-accurate role placement proposing canonical EME operations (Correction B, D)
 * 4. Atomic execution strictly through OperationExecutor
 * 5. Master audio mixing via mixAudioLayers
 * 6. Closed-loop perceptual QA and sync verification with Phase 25's certified EarshotAdapter
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { EarshotKitClient } = require('../src/audio/sfx/earshot-kit-client.js');
const { SoundKitCatalog } = require('../src/audio/sfx/sound-kit-catalog.js');
const { RolePlacementEngine } = require('../src/audio/sfx/role-placement-engine.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { decodeWav } = require('../src/audio/beat/audio-ingest.js');
const { mixAudioLayers } = require('../src/audio/sfx/mixer.js');
const { EarshotAdapter } = require('../src/renderers/earshot-adapter.js');
const { TICKS_PER_SECOND } = require('../src/engine/time.js');

describe('Stage 26.5: Closed-Loop Sound Kit Verification & Full Pipeline', () => {
  let tmpRoot;
  let kitAssetsDir;
  let renderedOutputDir;
  let client;
  let catalog;
  let engine;
  let earshotAdapter;

  before(async () => {
    tmpRoot = path.resolve(__dirname, `../scratch/test-stage26-e2e-${process.pid}`);
    kitAssetsDir = path.join(tmpRoot, 'sound_kits', 'calm_e2e');
    renderedOutputDir = path.join(tmpRoot, 'rendered');
    fs.mkdirSync(renderedOutputDir, { recursive: true });

    client = new EarshotKitClient({
      renderTimeoutMs: 30000,
      commandTimeoutMs: 5000
    });

    earshotAdapter = new EarshotAdapter({
      pythonPath: '/tmp/earshot/.venv/bin/python3',
      defaultProfile: 'web_streaming'
    });
  });

  after(() => {
    if (client) client.dispose();
    if (earshotAdapter && earshotAdapter.workerClient) earshotAdapter.workerClient.stop();
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  it('E2E-01: Generates sound kit with isolated staging and promotes to authorized directory', async () => {
    // Generate a targeted subset of calm preset for fast, deterministic e2e verification
    const kitDef = {
      kit: 1,
      name: 'calm_e2e',
      sr: 48000,
      roles: {
        'pop': {
          sound: 'fit/pop/mouth_plop',
          takes: 2,
          align: 'onset',
          level_db: -3.0
        },
        'whoosh.short': {
          sound: 'fit/whoosh.short/bamboo_swish',
          takes: 2,
          align: 'peak',
          level_db: -8.0
        },
        'tick': {
          sound: 'fit/tick/domino',
          takes: 2,
          align: 'onset',
          level_db: -6.0
        }
      }
    };

    const renderResult = await client.renderKit(kitDef, kitAssetsDir);
    assert.equal(renderResult.success, true);
    assert.ok(fs.existsSync(path.join(kitAssetsDir, 'kit.lock.json')));
    assert.ok(fs.existsSync(path.join(kitAssetsDir, 'pop_1.wav')));
    assert.ok(fs.existsSync(path.join(kitAssetsDir, 'whoosh-short_1.wav')));
    assert.ok(fs.existsSync(path.join(kitAssetsDir, 'tick_1.wav')));

    // Dual-hash provenance must be recorded for every file
    for (const [file, prov] of Object.entries(renderResult.assetProvenance)) {
      assert.ok(prov.sha1, `Missing sha1 for ${file}`);
      assert.ok(prov.sha256, `Missing sha256 for ${file}`);
      assert.ok(prov.onset_s >= 0);
      assert.ok(prov.dur_s > 0);
    }
  });

  it('E2E-02: Ingests sound kit into catalog and indexes physical transient timing', () => {
    catalog = new SoundKitCatalog({ kitDir: kitAssetsDir }).load();
    assert.equal(catalog.isLoaded, true);
    assert.ok(catalog.hasRole('pop'));
    assert.ok(catalog.hasRole('whoosh.short'));
    assert.ok(catalog.hasRole('tick'));

    engine = new RolePlacementEngine({ catalog });

    // Verify alignment ticks derivation:
    const whooshTake = catalog.selectTake('whoosh.short', { takeIndex: 0 });
    assert.equal(whooshTake.alignMode, 'peak');
    assert.equal(whooshTake.alignmentTicks, Math.round(whooshTake.peak_s * TICKS_PER_SECOND));

    const popTake = catalog.selectTake('pop', { takeIndex: 0 });
    assert.equal(popTake.alignMode, 'onset');
    assert.equal(popTake.alignmentTicks, Math.round(popTake.onset_s * TICKS_PER_SECOND));
  });

  it('E2E-03: Places SFX cues on project timeline with physical transient alignment', () => {
    // Construct base project with visual tracks and cuts
    const initRes = OperationExecutor.execute(null, {
      type: 'create_project',
      params: {
        id: 'proj-stage26-e2e',
        fps: 30,
        width: 1920,
        height: 1080,
        durationTicks: 600000 // 5 seconds = 600,000 ticks
      }
    });
    assert.equal(initRes.success, true);

    const vTrackRes = OperationExecutor.execute(initRes.project, {
      type: 'add_track',
      params: { id: 'v1', kind: 'visual', zIndex: 0 }
    });

    // Clip A: 0 to 120,000 ticks (0.0s to 1.0s)
    const clip1Res = OperationExecutor.execute(vTrackRes.project, {
      type: 'insert_clip',
      params: { id: 'clip-v1', trackId: 'v1', type: 'video', startTick: 0, durationTicks: 120000 }
    });

    // Clip B: 120,000 to 240,000 ticks (1.0s to 2.0s) - Visual Cut at t = 120,000
    const clip2Res = OperationExecutor.execute(clip1Res.project, {
      type: 'insert_clip',
      params: { id: 'clip-v2', trackId: 'v1', type: 'video', startTick: 120000, durationTicks: 120000 }
    });

    // Clip C (Title): 240,000 to 360,000 ticks - Text Reveal at t = 240,000
    const clip3Res = OperationExecutor.execute(clip2Res.project, {
      type: 'insert_clip',
      params: { id: 'clip-title', trackId: 'v1', type: 'text', startTick: 240000, durationTicks: 120000 }
    });

    const project = clip3Res.project;

    // Discover editorial cues automatically
    const discovered = engine.discoverEditorialCues(project);
    assert.equal(discovered.length, 3);

    // Plan placements
    const proposal = engine.planPlacements(project, discovered);
    assert.equal(proposal.success, true);
    assert.equal(proposal.placedCues.length, 3);

    // Verify operations vocabulary: canonical add_track, add_asset, insert_clip
    const opTypes = proposal.operations.map(o => o.type);
    for (const t of opTypes) {
      assert.ok(['add_track', 'add_asset', 'insert_clip', 'set_audio_envelope'].includes(t));
    }

    // Execute through canonical OperationExecutor
    const execResult = engine.executeProposal(project, proposal);
    assert.equal(execResult.success, true, `Execution failed: ${execResult.error}`);

    const finalProject = execResult.project;
    const audioClips = finalProject.clips.filter(c => c.type === 'audio');
    assert.equal(audioClips.length, 3);

    // Check transient offset math:
    // Whoosh apex must hit cut tick (120,000) exactly
    const whooshClip = audioClips.find(c => c.id.includes('cue-cut-clip-v2'));
    const whooshAsset = finalProject.assets.find(a => a.id === whooshClip.source.assetId);
    const expectedWhooshStart = 120000 - whooshAsset.metadata.alignmentTicks;
    assert.equal(whooshClip.startTick, expectedWhooshStart);

    // Pop attack must hit reveal tick (240,000) exactly
    const popClip = audioClips.find(c => c.id.includes('cue-text'));
    const popAsset = finalProject.assets.find(a => a.id === popClip.source.assetId);
    const expectedPopStart = 240000 - popAsset.metadata.alignmentTicks;
    assert.equal(popClip.startTick, expectedPopStart);
  });

  it('E2E-04: Closed-Loop Verification: mixes master audio and verifies with EarshotAdapter QA', async () => {
    // 1. Setup project with placed cues
    const initRes = OperationExecutor.execute(null, {
      type: 'create_project',
      params: {
        id: 'proj-mix-verify',
        fps: 30,
        width: 1920,
        height: 1080,
        durationTicks: 600000
      }
    });

    const vTrackRes = OperationExecutor.execute(initRes.project, {
      type: 'add_track',
      params: { id: 'v1', kind: 'visual', zIndex: 0 }
    });
    const c1 = OperationExecutor.execute(vTrackRes.project, {
      type: 'insert_clip',
      params: { id: 'v1', trackId: 'v1', type: 'video', startTick: 0, durationTicks: 120000 }
    });
    const c2 = OperationExecutor.execute(c1.project, {
      type: 'insert_clip',
      params: { id: 'v2', trackId: 'v1', type: 'video', startTick: 120000, durationTicks: 120000 }
    });

    const cues = [{ role: 'pop', eventTick: 120000 }];
    const proposal = engine.planPlacements(c2.project, cues);
    const execRes = engine.executeProposal(c2.project, proposal);
    assert.equal(execRes.success, true);
    const project = execRes.project;

    // 2. Mix audio layers from project clips
    const sampleRate = 48000;
    const totalSamples = Math.round((project.timebase.durationTicks * sampleRate) / TICKS_PER_SECOND);
    const layers = [];

    for (const clip of project.clips) {
      if (clip.type !== 'audio') continue;
      const asset = project.assets.find(a => a.id === clip.source.assetId);
      assert.ok(asset, `Asset not found for clip: ${clip.id}`);

      const wavBuffer = fs.readFileSync(asset.src);
      const decoded = decodeWav(wavBuffer);
      const startSample = Math.round((clip.startTick * sampleRate) / TICKS_PER_SECOND);
      const gain = clip.audio && typeof clip.audio.volumeDb === 'number'
        ? Math.pow(10, clip.audio.volumeDb / 20)
        : 1.0;

      layers.push({
        pcm: decoded.pcm,
        startSample,
        gain,
        pan: (clip.audio && clip.audio.pan) || 0.0
      });
    }

    assert.equal(layers.length, 1);
    const mix = mixAudioLayers(layers, totalSamples, { sampleRate });
    assert.ok(mix.masterWav);
    assert.ok(mix.masterWav.length > 44);

    const masterWavPath = path.join(renderedOutputDir, 'rendered_master_e2e.wav');
    fs.writeFileSync(masterWavPath, mix.masterWav);

    // 3. Closed-Loop Perception & QA Verification via Phase 25 certified EarshotAdapter
    const qaResult = await earshotAdapter.auditAudioQuality(masterWavPath, {
      profile: 'web_streaming',
      timebase: {
        duration_ticks: project.timebase.durationTicks,
        ticks_per_second: TICKS_PER_SECOND,
        fps_numerator: 30,
        fps_denominator: 1
      },
      cues: [
        {
          frame: 30,
          time_seconds: 1.0,
          kind: 'visual_cut',
          weight: 1.0
        }
      ]
    });
    assert.ok(qaResult);
    assert.ok(Array.isArray(qaResult.checks));

    // True peak compliance: must be compliant with true peak ceiling <= -1.0 dBTP
    const peakCheck = qaResult.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
    assert.ok(peakCheck, 'Expected CHK_EARSHOT_TRUE_PEAK check');
    assert.equal(peakCheck.status, 'passed', `True peak failed: status ${peakCheck.status}, detail: ${peakCheck.detail}`);

    // Sync check: must be verified by Earshot
    const syncCheck = qaResult.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    assert.ok(syncCheck, 'Expected CHK_EARSHOT_SYNC check');
    assert.equal(syncCheck.status, 'passed', `Sync check failed: status ${syncCheck.status}, detail: ${syncCheck.detail}`);
  });
});
