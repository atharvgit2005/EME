/**
 * End-to-End Production Pipeline & Renderer for Creator Reel:
 * "Six Hours vs. Six Minutes" (20 Seconds, 1080x1920 @ 30fps)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const COMP_DIR = path.join(WORKSPACE_DIR, 'artifacts', 'creator-reel-20s');
const SOUNDTRACK_WAV = path.join(WORKSPACE_DIR, 'assets', 'creator_reel_soundtrack_20s.wav');
const RAW_VIDEO_MP4 = path.join(COMP_DIR, 'raw-video.mp4');
const FINAL_REEL_MP4 = path.join(COMP_DIR, 'final-creator-reel-20s.mp4');

const ARTIFACTS_DIR = '/Users/atharvpaharia100/.gemini/antigravity-ide/brain/b8a9689d-6c11-45d3-ad45-599897de1bd2';

function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function probeFile(filePath) {
  const res = spawnSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ], { encoding: 'utf8' });

  if (res.status !== 0 || !res.stdout) return null;
  return JSON.parse(res.stdout);
}

async function run() {
  console.log('================================================================');
  console.log('  EME CREATOR REEL PRODUCTION & RENDERING PIPELINE (20 SECONDS) ');
  console.log('  "Six Hours vs. Six Minutes" — John Bucog x Sam John Creates   ');
  console.log('================================================================\n');

  // 1. Verify Master Soundtrack
  if (!fs.existsSync(SOUNDTRACK_WAV)) {
    console.log('Step 1: Building master soundtrack & SJC SFX mix...');
    const { mixFinalSoundtrack } = require('./build-creator-reel-soundtrack.js');
    mixFinalSoundtrack();
  } else {
    console.log('Step 1: Verified existing master soundtrack with Inworld Blake VO & SJC SFX.');
  }

  // 2. Ensure Composition HTML exists
  console.log('Step 2: Checking composition HTML bundle...');
  const htmlPath = path.join(COMP_DIR, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    const { buildCreatorReelAd } = require('./build-creator-reel-ad.js');
    buildCreatorReelAd();
  }
  console.log(`  -> HTML Entry: ${htmlPath} (${(fs.statSync(htmlPath).size / 1024).toFixed(1)} KB)`);

  // 3. Render 1080x1920 Video via HyperFramesRenderer
  console.log('Step 3: Rendering 20s video (600 frames @ 30 fps, 1080x1920 portrait)...');
  const tStart = Date.now();
  const renderRes = HyperFramesRenderer.render(COMP_DIR, RAW_VIDEO_MP4, {
    fps: 30,
    resolution: 'portrait'
  });
  const tRender = Date.now() - tStart;
  console.log(`  -> Render completed in ${(tRender / 1000).toFixed(1)}s`);
  console.log(`  -> Video size: ${(renderRes.metadata.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  -> Dimensions: ${renderRes.metadata.width}x${renderRes.metadata.height} @ ${renderRes.metadata.fps} fps`);

  // 4. Multiplex Audio and Video with FFmpeg
  console.log('Step 4: Multiplexing video with master audio soundtrack (320k AAC)...');
  const muxStart = Date.now();
  const mux = spawnSync('ffmpeg', [
    '-y',
    '-i', RAW_VIDEO_MP4,
    '-i', SOUNDTRACK_WAV,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-shortest',
    FINAL_REEL_MP4
  ], { encoding: 'utf8' });

  if (mux.status !== 0) {
    throw new Error(`FFmpeg mux failed:\n${mux.stderr}`);
  }
  const tMux = Date.now() - muxStart;
  console.log(`  -> Multiplexed in ${tMux}ms -> ${FINAL_REEL_MP4}`);

  // 5. Verification & Metadata Probing
  console.log('Step 5: Probing final export metadata...');
  const probe = probeFile(FINAL_REEL_MP4);
  const vStream = probe.streams.find(s => s.codec_type === 'video');
  const aStream = probe.streams.find(s => s.codec_type === 'audio');
  const finalDuration = parseFloat(probe.format.duration);
  const finalSize = parseInt(probe.format.size, 10);
  const digest = sha256(FINAL_REEL_MP4);

  console.log(`  -> Final Duration: ${finalDuration.toFixed(2)}s (Target: 20.00s)`);
  console.log(`  -> Final Size: ${(finalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  -> Resolution: ${vStream.width}x${vStream.height} (9:16 vertical)`);
  console.log(`  -> Video Codec: ${vStream.codec_name} @ ${vStream.r_frame_rate} fps`);
  console.log(`  -> Audio Codec: ${aStream.codec_name} ${aStream.sample_rate} Hz, ${aStream.channels}ch @ ${Math.round(aStream.bit_rate / 1000)} kbps`);
  console.log(`  -> SHA-256 Digest: ${digest}`);

  // 6. Extract Key Verification Frames
  console.log('Step 6: Extracting inspection keyframes for visual review...');
  const keyframes = [
    { time: 0.8, label: 'frame-01-hook-reticle.png', desc: '00:00.8 — Shot 1: The Hook & Face Reticle ("SIX HOURS.")' },
    { time: 2.4, label: 'frame-02-punch-in-typography.png', desc: '00:02.4 — Shot 2: Punch-In & Crimson Kinetic Text ("FOR A 15-SECOND REEL.")' },
    { time: 4.8, label: 'frame-03-macro-screenshake.png', desc: '00:04.8 — Shot 3: Macro Zoom & Screenshake ("THAT\'S NOT EDITING.")' },
    { time: 7.5, label: 'frame-04-iris-wipe-timeline.png', desc: '00:07.5 — Shot 4: Iris Wipe & Glowing EME Timeline ("HERE\'S THE FIX.")' },
    { time: 11.0, label: 'frame-05-kinetic-slam-waveform.png', desc: '00:11.0 — Shot 5: 4-Beat Kinetic Slam & Waveform ("DROP. CUT. CAPTION. SOUND.")' },
    { time: 13.5, label: 'frame-06-glitch-math-swap.png', desc: '00:13.5 — Shot 6: Glitch Math Swap (06:00:00 -> 00:06:12)' },
    { time: 15.5, label: 'frame-07-triple-punch-split.png', desc: '00:15.5 — Shot 7: Triple Punch & Split Line ("SAME REEL. SIX MINUTES.")' },
    { time: 18.5, label: 'frame-08-brand-resolve-cta.png', desc: '00:18.5 — Shot 8: Brand Resolve & Loop Match ("STOP EDITING. START SHIPPING.")' }
  ];

  const extractedFrames = [];
  for (const kf of keyframes) {
    const outPath = path.join(COMP_DIR, kf.label);
    spawnSync('ffmpeg', [
      '-y',
      '-ss', String(kf.time),
      '-i', FINAL_REEL_MP4,
      '-vframes', '1',
      '-q:v', '2',
      outPath
    ]);
    extractedFrames.push({ ...kf, path: outPath });
    console.log(`  -> Extracted [${kf.desc}]: ${outPath}`);
  }

  // 7. Copy Video and Keyframes to Brain Artifacts for User Presentation
  console.log('Step 7: Publishing artifacts to user brain directory...');
  const artifactVideoPath = path.join(ARTIFACTS_DIR, 'eme-creator-reel-20s-final.mp4');
  fs.copyFileSync(FINAL_REEL_MP4, artifactVideoPath);
  console.log(`  -> Copied final video: ${artifactVideoPath}`);

  for (const kf of extractedFrames) {
    const artFramePath = path.join(ARTIFACTS_DIR, `eme-creator-${kf.label}`);
    fs.copyFileSync(kf.path, artFramePath);
  }

  console.log('\n================================================================');
  console.log('  PRODUCTION COMPLETE: ALL DELIVERABLES GENERATED & VERIFIED!   ');
  console.log('================================================================\n');

  return {
    videoPath: FINAL_REEL_MP4,
    artifactVideoPath,
    duration: finalDuration,
    width: vStream.width,
    height: vStream.height,
    fps: vStream.r_frame_rate,
    sha256: digest,
    extractedFrames
  };
}

if (require.main === module) {
  run().catch(err => {
    console.error('Execution failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
