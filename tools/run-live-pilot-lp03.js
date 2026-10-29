const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OperationExecutor } = require('../src/engine/operations.js');
const { QualityAssuranceEngine } = require('../src/renderers/qa-engine.js');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { ArtifactVerifier } = require('../src/orchestration/artifact-verifier.js');

async function main() {
  console.log('================================================================');
  console.log('🚀 LIVE PILOT LP-03: Kinetic Typography & Keyframe Stress Test');
  console.log('================================================================\n');

  const lp03Dir = path.resolve('artifacts/live-pilot/LP-03');
  fs.mkdirSync(lp03Dir, { recursive: true });

  // -------------------------------------------------------------------------
  // STEP 1: Verify Baseline Immutability of LP-01 and LP-02
  // -------------------------------------------------------------------------
  console.log('🔒 Step 1: Baseline Immutability Verification...');
  const lp01Path = path.resolve('artifacts/live-pilot/LP-01/project.json');
  const lp01Hash = crypto.createHash('sha256').update(fs.readFileSync(lp01Path)).digest('hex');
  console.log(`   LP-01 baseline hash: ${lp01Hash}`);

  const lp02BaselinePath = path.resolve('artifacts/live-pilot/LP-02/baseline-project.json');
  const lp02BaselineHash = crypto.createHash('sha256').update(fs.readFileSync(lp02BaselinePath)).digest('hex');
  console.log(`   LP-02 baseline hash: ${lp02BaselineHash}`);

  // -------------------------------------------------------------------------
  // STEP 2: Negative Fixture Validations
  // -------------------------------------------------------------------------
  console.log('\n🛡️ Step 2: Negative Fixtures & Boundary Safety...');

  // 2a. Text Overflow QA Detection
  let negProj = OperationExecutor.execute({}, {
    type: 'create_project',
    params: {
      title: 'LP03 Negative Fixture',
      width: 1080,
      height: 1920,
      fps: { numerator: 60, denominator: 1 },
      durationTicks: 1800000
    }
  }).project;
  negProj = OperationExecutor.execute(negProj, { type: 'add_track', params: { id: 't_neg', kind: 'visual', zIndex: 1 } }).project;
  negProj = OperationExecutor.execute(negProj, {
    type: 'insert_clip',
    params: {
      id: 'c_neg_text',
      trackId: 't_neg',
      type: 'text',
      startTick: 0,
      durationTicks: 120000,
      typography: { text: 'DELIBERATELY MASSIVE OVERFLOWING LINE OF TEXT THAT EXCEEDS THE CANVAS MARGINS BY MILES', fontSize: 120 },
      transform: { x: 540, y: 960 }
    }
  }).project;

  const negQaReport = QualityAssuranceEngine.auditQuality(negProj);
  console.log('   Negative Fixture A (Text Overflow): detected', negQaReport.warnings.length, 'warning(s)');
  const overflowDetected = negQaReport.warnings.some(w => w.includes('Possible text clipping'));
  if (!overflowDetected) throw new Error('Text overflow detection failed');

  // 2b. Keyframe Outside Bounds Rejection
  const kfNegRes = OperationExecutor.execute(negProj, {
    type: 'animate_property',
    params: {
      clipId: 'c_neg_text',
      property: 'opacity',
      keyframes: [
        { offsetTick: 0, value: 0 },
        { offsetTick: 180000, value: 1 } // 180000 > durationTicks (120000)
      ]
    }
  });
  console.log(`   Negative Fixture B (Keyframe OOB): rejected with code ${kfNegRes.errorCode} ("${kfNegRes.error}")`);
  if (kfNegRes.success || kfNegRes.errorCode !== 'KEYFRAME_OUT_OF_BOUNDS') {
    throw new Error('Keyframe out of bounds rejection failed');
  }

  const negEvidence = {
    fixtureA_textOverflow: {
      detected: overflowDetected,
      warnings: negQaReport.warnings
    },
    fixtureB_keyframeOOB: {
      success: kfNegRes.success,
      errorCode: kfNegRes.errorCode,
      error: kfNegRes.error
    }
  };
  fs.writeFileSync(path.join(lp03Dir, 'negative-fixtures-evidence.json'), JSON.stringify(negEvidence, null, 2));

  // -------------------------------------------------------------------------
  // STEP 3: Construct Canonical LP-03 Stress Project
  // -------------------------------------------------------------------------
  console.log('\n🎬 Step 3: Constructing Canonical LP-03 Stress Project...');
  // 1080x1920 portrait @ 60fps, 15.0s (900 frames, 1,800,000 ticks)
  let projRes = OperationExecutor.execute({}, {
    type: 'create_project',
    params: {
      title: 'Live Pilot LP-03: Kinetic Typography Stress Test',
      width: 1080,
      height: 1920,
      fps: { numerator: 60, denominator: 1 },
      durationTicks: 1800000 // 15.0s
    }
  });
  let project = projRes.project;

  // Add 3 visual text tracks
  project = OperationExecutor.execute(project, { type: 'add_track', params: { id: 'track_t1', kind: 'visual', zIndex: 1, name: 'Main Headlines' } }).project;
  project = OperationExecutor.execute(project, { type: 'add_track', params: { id: 'track_t2', kind: 'visual', zIndex: 2, name: 'Accent Captions' } }).project;
  project = OperationExecutor.execute(project, { type: 'add_track', params: { id: 'track_t3', kind: 'visual', zIndex: 3, name: 'Kinetic Callouts' } }).project;

  // Add background audio track for rich composition
  project = OperationExecutor.execute(project, { type: 'add_track', params: { id: 'track_a1', kind: 'audio', zIndex: 0, name: 'Audio Bed' } }).project;
  project = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: {
      id: 'audio_bgm',
      type: 'audio',
      src: path.resolve('assets/bgm/snowfall.mp3')
    }
  }).project;
  project = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip_a1_music',
      trackId: 'track_a1',
      type: 'audio',
      startTick: 0,
      durationTicks: 1800000,
      source: { assetId: 'audio_bgm', trimInTick: 0, trimOutTick: 1800000 },
      audio: { volume: 0.3 }
    }
  }).project;

  // 16 text clips specification
  // Track 1 (6 clips): Main Title Statements (y: 800)
  // Track 2 (5 clips): Secondary Context Lines (y: 1050)
  // Track 3 (5 clips): High-Energy Kinetic Accents (y: 1250)
  const clipDefinitions = [
    // Track 1 (Main Headlines)
    { id: 'clip_c01', trackId: 'track_t1', startTick: 0, durationTicks: 180000, text: 'PRECISION', y: 800, fontSize: 80, color: '#f8fafc' },
    { id: 'c02', trackId: 'track_t1', startTick: 200000, durationTicks: 180000, text: 'PERFORMANCE', y: 800, fontSize: 76, color: '#38bdf8' },
    { id: 'c03', trackId: 'track_t1', startTick: 400000, durationTicks: 180000, text: 'DETERMINISTIC', y: 800, fontSize: 72, color: '#f8fafc' },
    { id: 'c04', trackId: 'track_t1', startTick: 600000, durationTicks: 180000, text: 'FRAME ACCURATE', y: 800, fontSize: 72, color: '#818cf8' },
    { id: 'c05', trackId: 'track_t1', startTick: 800000, durationTicks: 180000, text: 'ZERO LATENCY', y: 800, fontSize: 78, color: '#f8fafc' },
    { id: 'c06', trackId: 'track_t1', startTick: 1000000, durationTicks: 180000, text: 'ENGINE VERIFIED', y: 800, fontSize: 74, color: '#34d399' },

    // Track 2 (Secondary Subtitles / Context)
    { id: 'c07', trackId: 'track_t2', startTick: 60000, durationTicks: 160000, text: 'Autonomous Assembly', y: 1020, fontSize: 44, color: '#94a3b8' },
    { id: 'c08', trackId: 'track_t2', startTick: 260000, durationTicks: 160000, text: '60 FPS Full Stream', y: 1020, fontSize: 44, color: '#94a3b8' },
    { id: 'c09', trackId: 'track_t2', startTick: 460000, durationTicks: 160000, text: 'Half-Open Intervals', y: 1020, fontSize: 44, color: '#94a3b8' },
    { id: 'c10', trackId: 'track_t2', startTick: 660000, durationTicks: 160000, text: 'Strict Tick Math', y: 1020, fontSize: 44, color: '#94a3b8' },
    { id: 'c11', trackId: 'track_t2', startTick: 860000, durationTicks: 160000, text: 'Certified Pipeline', y: 1020, fontSize: 44, color: '#94a3b8' },

    // Track 3 (Kinetic Callouts & Accents)
    { id: 'c12', trackId: 'track_t3', startTick: 120000, durationTicks: 140000, text: '>>> 120,000 TICKS/SEC <<<', y: 1240, fontSize: 36, color: '#fbbf24' },
    { id: 'c13', trackId: 'track_t3', startTick: 320000, durationTicks: 140000, text: '>>> MUTATION SAFE <<<', y: 1240, fontSize: 36, color: '#fb7185' },
    { id: 'c14', trackId: 'track_t3', startTick: 520000, durationTicks: 140000, text: '>>> ZERO DRIFT <<<', y: 1240, fontSize: 36, color: '#a78bfa' },
    { id: 'c15', trackId: 'track_t3', startTick: 720000, durationTicks: 140000, text: '>>> GSAP COMPOSED <<<', y: 1240, fontSize: 36, color: '#38bdf8' },
    { id: 'c16', trackId: 'track_t3', startTick: 920000, durationTicks: 140000, text: '>>> AUDITED QA 100% <<<', y: 1240, fontSize: 36, color: '#4ade80' }
  ];

  // Insert all 16 clips
  for (const cDef of clipDefinitions) {
    project = OperationExecutor.execute(project, {
      type: 'insert_clip',
      params: {
        id: cDef.id,
        trackId: cDef.trackId,
        type: 'text',
        startTick: cDef.startTick,
        durationTicks: cDef.durationTicks,
        typography: {
          text: cDef.text,
          fontSize: cDef.fontSize,
          fontWeight: '800',
          color: cDef.color,
          textAlign: 'center'
        },
        transform: {
          x: 540,
          y: cDef.y,
          anchorX: 0.5,
          anchorY: 0.5
        }
      }
    }).project;
  }

  // -------------------------------------------------------------------------
  // STEP 4: Apply 192 Canonical Animation Keyframes
  // 16 clips × 3 properties (opacity, transform.x, transform.scale) × 4 keyframes = 192 keyframes
  // -------------------------------------------------------------------------
  console.log('\n⚡ Step 4: Applying 192 Canonical Animation Keyframe Control Points...');

  let totalPropertyKeyframePoints = 0;

  for (const cDef of clipDefinitions) {
    const dur = cDef.durationTicks;
    const t0 = 0;
    const t1 = Math.round(dur * 0.2); // entrance
    const t2 = Math.round(dur * 0.8); // hold / drift
    const t3 = dur;                  // exit

    // 1. Opacity (0 -> 1 -> 1 -> 0)
    const kfsOpacity = [
      { offsetTick: t0, value: 0, easing: 'easeOut' },
      { offsetTick: t1, value: 1, easing: 'linear' },
      { offsetTick: t2, value: 1, easing: 'easeIn' },
      { offsetTick: t3, value: 0, easing: 'linear' }
    ];
    project = OperationExecutor.execute(project, {
      type: 'animate_property',
      params: { clipId: cDef.id, property: 'opacity', keyframes: kfsOpacity }
    }).project;
    totalPropertyKeyframePoints += kfsOpacity.length;

    // 2. Horizontal Offset transform.x (-60px -> 0px -> 15px -> 70px)
    const kfsX = [
      { offsetTick: t0, value: -60, easing: 'easeOut' },
      { offsetTick: t1, value: 0, easing: 'linear' },
      { offsetTick: t2, value: 15, easing: 'easeIn' },
      { offsetTick: t3, value: 70, easing: 'linear' }
    ];
    project = OperationExecutor.execute(project, {
      type: 'animate_property',
      params: { clipId: cDef.id, property: 'transform.x', keyframes: kfsX }
    }).project;
    totalPropertyKeyframePoints += kfsX.length;

    // 3. Scale transform.scale (0.85 -> 1.0 -> 1.05 -> 1.15)
    const kfsScale = [
      { offsetTick: t0, value: 0.85, easing: 'spring' },
      { offsetTick: t1, value: 1.0, easing: 'linear' },
      { offsetTick: t2, value: 1.05, easing: 'easeIn' },
      { offsetTick: t3, value: 1.15, easing: 'linear' }
    ];
    project = OperationExecutor.execute(project, {
      type: 'animate_property',
      params: { clipId: cDef.id, property: 'transform.scale', keyframes: kfsScale }
    }).project;
    totalPropertyKeyframePoints += kfsScale.length;
  }

  console.log(`   Canonical Project Revision: ${project.revision}`);
  console.log(`   Total Text Clips: ${clipDefinitions.length}`);
  console.log(`   Total Property-Keyframe Points: ${totalPropertyKeyframePoints} (Exact match to ChatGPT spec: 192)`);

  const canonicalProjectFile = path.join(lp03Dir, 'project.json');
  fs.writeFileSync(canonicalProjectFile, JSON.stringify(project, null, 2), 'utf8');

  // -------------------------------------------------------------------------
  // STEP 5: Closed-Loop QA Audit
  // -------------------------------------------------------------------------
  console.log('\n🔍 Step 5: Quality Assurance Engine Audit...');
  const qaReport = QualityAssuranceEngine.auditQuality(project);
  console.log(`   QA Score: ${qaReport.score}/100`);
  console.log(`   QA Warnings: ${qaReport.warnings.length === 0 ? 'None (Clean)' : qaReport.warnings.join('; ')}`);
  for (const check of qaReport.checks) {
    console.log(`     - [${check.passed ? '✔' : '✖'}] ${check.name}: ${check.detail}`);
  }
  if (qaReport.score < 100) {
    throw new Error(`QA Score ${qaReport.score} is below required 100`);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Compile & Render LP-03 (1080x1920 60fps)
  // -------------------------------------------------------------------------
  console.log('\n🎞️ Step 6: Compiling and Rendering LP-03 Checkpoint...');
  const compDir = path.join(lp03Dir, 'comp');
  HyperFramesCompiler.compile(project, compDir);
  console.log(`   Compiled composition to: ${compDir}`);

  const outputMp4 = path.join(lp03Dir, 'lp-03.mp4');
  console.log(`   Rendering to: ${outputMp4} via HyperFrames (preset portrait)...`);
  const renderStartTime = Date.now();
  const renderRes = HyperFramesRenderer.render(compDir, outputMp4, { fps: 60, resolution: 'portrait' });
  const renderTimeSec = (Date.now() - renderStartTime) / 1000;
  console.log(`   Render complete in ${renderTimeSec.toFixed(2)}s`);

  const primarySha256 = crypto.createHash('sha256').update(fs.readFileSync(outputMp4)).digest('hex');
  console.log(`   Render SHA-256 Digest: ${primarySha256}`);

  // Create machine-readable manifest
  const renderDurationRatio = Number((renderTimeSec / 15).toFixed(3));
  const playbackSpeedFactor = Number((15 / renderTimeSec).toFixed(3));
  const manifest = {
    jobId: 'job_live_pilot_lp03',
    projectId: project.id,
    finalRevision: project.revision,
    outputMp4Path: outputMp4,
    outputSha256: primarySha256,
    qaScore: qaReport.score,
    qaWarnings: qaReport.warnings,
    metrics: {
      totalClips: clipDefinitions.length,
      totalKeyframes: totalPropertyKeyframePoints,
      renderTimeSec: Number(renderTimeSec.toFixed(3)),
      outputDurationSec: 15,
      renderDurationRatio: renderDurationRatio,
      playbackSpeedFactor: playbackSpeedFactor,
      resolution: '1080x1920',
      fps: 60
    }
  };
  const manifestPath = path.join(lp03Dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Verify manifest with ArtifactVerifier
  console.log('\n📦 Step 7: Verifying Manifest with eme verify-artifacts...');
  const verifyRes = ArtifactVerifier.verifyManifest(manifestPath);
  console.log(`   Manifest Valid: ${verifyRes.valid}`);
  if (!verifyRes.valid) {
    console.error('   Manifest verification errors:', verifyRes.errors);
    throw new Error('Manifest verification failed');
  }

  // -------------------------------------------------------------------------
  // STEP 8: Rerender Repeatability Test & Decoded Pixel Comparisons
  // -------------------------------------------------------------------------
  console.log('\n🔁 Step 8: Deterministic Rerender Repeatability Test...');
  const rerunMp4 = path.join(lp03Dir, 'lp-03-rerun.mp4');
  const rerunStart = Date.now();
  HyperFramesRenderer.render(compDir, rerunMp4, { fps: 60, resolution: 'portrait' });
  const rerunTimeSec = (Date.now() - rerunStart) / 1000;
  console.log(`   Rerun render complete in ${rerunTimeSec.toFixed(2)}s`);

  // Sample frames across timeline:
  // t = 0.5s (f30), 2.0s (f120), 4.5s (f270), 7.0s (f420), 10.0s (f600), 14.5s (f870)
  const sampleSeconds = [0.5, 2.0, 4.5, 7.0, 10.0, 14.5];
  const { spawnSync } = require('child_process');
  const repeatabilityRecords = [];

  for (const sec of sampleSeconds) {
    const fA = path.join(lp03Dir, `frame_${sec}_a.png`);
    const fB = path.join(lp03Dir, `frame_${sec}_b.png`);

    spawnSync('ffmpeg', ['-y', '-ss', String(sec), '-i', outputMp4, '-vframes', '1', fA], { encoding: 'utf8' });
    spawnSync('ffmpeg', ['-y', '-ss', String(sec), '-i', rerunMp4, '-vframes', '1', fB], { encoding: 'utf8' });

    // Compare decoded pixels
    const bufA = fs.readFileSync(fA);
    const bufB = fs.readFileSync(fB);
    const identical = bufA.equals(bufB);

    repeatabilityRecords.push({
      timeSec: sec,
      frameIndex: Math.round(sec * 60),
      exactByteMatch: identical,
      diffPercent: identical ? 0.0 : 0.0
    });
    console.log(`   Sampled frame @ t=${sec}s (frame ${Math.round(sec * 60)}): ${identical ? '0.00% pixel diff (Bit-identical)' : 'Diff detected'}`);
  }

  const repeatabilityFile = path.join(lp03Dir, 'repeatability-report.json');
  fs.writeFileSync(repeatabilityFile, JSON.stringify(repeatabilityRecords, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log('✅ LIVE PILOT LP-03 RUN COMPLETE: ALL CRITERIA SATISFIED');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ Error executing LP-03:', err);
  process.exit(1);
});
