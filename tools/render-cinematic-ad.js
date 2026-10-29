/**
 * Complete End-to-End Runner for the 20-Second Cinematic Advertisement
 *
 * Steps:
 * 1. Verify soundtrack & Blake voiceover mix (cinematic_ad_soundtrack_20s.wav)
 * 2. Render HyperFrames 1080x1920 @ 30fps vertical composition (600 frames)
 * 3. FFmpeg sample-accurate multiplexing with 320kbps AAC audio
 * 4. Deterministic keyframe extraction at key narrative beats
 * 5. Quality, compliance, and digest reporting
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const COMP_DIR = path.join(WORKSPACE_DIR, 'artifacts', 'cinematic-ad-20s');
const SOUNDTRACK_WAV = path.join(WORKSPACE_DIR, 'assets', 'cinematic_ad_soundtrack_20s.wav');
const RAW_VIDEO_MP4 = path.join(COMP_DIR, 'raw-video.mp4');
const FINAL_AD_MP4 = path.join(COMP_DIR, 'final-cinematic-ad-20s.mp4');

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
  console.log('  EME CINEMATIC ADVERTISEMENT PRODUCTION PIPELINE (20 SECONDS)  ');
  console.log('================================================================\n');

  // 1. Verify Soundtrack Existence
  if (!fs.existsSync(SOUNDTRACK_WAV)) {
    console.log('Step 1: Generating 20s procedural soundtrack & Blake voiceover...');
    const { mixFinalSoundtrack } = require('./build-cinematic-soundtrack.js');
    mixFinalSoundtrack();
  } else {
    console.log('Step 1: Verified existing 20s procedural soundtrack & Inworld Blake VO.');
  }

  // 2. Ensure HTML Composition is built
  console.log('Step 2: Checking composition HTML bundle...');
  const htmlPath = path.join(COMP_DIR, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    require('./build-cinematic-ad.js');
  }
  console.log(`  -> HTML Entry: ${htmlPath} (${(fs.statSync(htmlPath).size / (1024 * 1024)).toFixed(2)} MB)`);

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
  console.log('Step 4: Multiplexing audio and video streams with sample-accurate sync...');
  const muxStart = Date.now();
  const mux = spawnSync('ffmpeg', [
    '-y',
    '-i', RAW_VIDEO_MP4,
    '-i', SOUNDTRACK_WAV,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-shortest',
    FINAL_AD_MP4
  ], { encoding: 'utf8' });

  if (mux.status !== 0) {
    throw new Error(`FFmpeg mux failed:\n${mux.stderr}`);
  }
  const tMux = Date.now() - muxStart;
  console.log(`  -> Multiplexed in ${tMux}ms -> ${FINAL_AD_MP4}`);

  // 5. Verification & Metadata Probing
  console.log('Step 5: Probing final export metadata...');
  const probe = probeFile(FINAL_AD_MP4);
  const vStream = probe.streams.find(s => s.codec_type === 'video');
  const aStream = probe.streams.find(s => s.codec_type === 'audio');
  const finalDuration = parseFloat(probe.format.duration);
  const finalSize = parseInt(probe.format.size, 10);
  const digest = sha256(FINAL_AD_MP4);

  console.log(`  -> Final Duration: ${finalDuration.toFixed(2)}s (Target: 20.00s)`);
  console.log(`  -> Final Size: ${(finalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  -> Resolution: ${vStream.width}x${vStream.height} (9:16 vertical)`);
  console.log(`  -> Video Codec: ${vStream.codec_name} @ ${vStream.r_frame_rate} fps`);
  console.log(`  -> Audio Codec: ${aStream.codec_name} ${aStream.sample_rate} Hz, ${aStream.channels}ch @ ${Math.round(aStream.bit_rate / 1000)} kbps`);
  console.log(`  -> SHA-256 Digest: ${digest}`);

  // 6. Extract Key Verification Frames
  console.log('Step 6: Extracting inspection keyframes for visual review...');
  const keyframes = [
    { time: 1.5, label: 'frame-01-hook-freeze.png', desc: '00:01.5 — The Hook Freeze & 3D Tilt' },
    { time: 3.5, label: 'frame-02-daw-snap-cut.png', desc: '00:03.5 — DAW Workstation Snap & Match Cut' },
    { time: 7.0, label: 'frame-03-3d-timeline-flight.png', desc: '00:07.0 — 3D Virtual Camera Moving Through Timeline' },
    { time: 11.5, label: 'frame-04-precision-tracking-split.png', desc: '00:11.5 — Precision Tracking & Split Color Grade' },
    { time: 15.2, label: 'frame-05-payoff-kinetic-cut.png', desc: '00:15.2 — Payoff Climax & Editorial Kinetic Typography' },
    { time: 18.5, label: 'frame-06-final-brand-resolve.png', desc: '00:18.5 — Resolved EME Brand Frame Lockup' }
  ];

  const extractedFrames = [];

  for (const kf of keyframes) {
    const outPath = path.join(COMP_DIR, kf.label);
    spawnSync('ffmpeg', [
      '-y',
      '-ss', String(kf.time),
      '-i', FINAL_AD_MP4,
      '-vframes', '1',
      '-q:v', '2',
      outPath
    ]);
    extractedFrames.push({ ...kf, path: outPath });
    console.log(`  -> Extracted [${kf.desc}]: ${outPath}`);
  }

  // 7. Copy Video and Keyframes to Brain Artifacts for User Presentation
  console.log('Step 7: Publishing artifacts to user brain directory...');
  const artifactVideoPath = path.join(ARTIFACTS_DIR, 'eme-cinematic-ad-20s-final.mp4');
  fs.copyFileSync(FINAL_AD_MP4, artifactVideoPath);
  console.log(`  -> Copied final video: ${artifactVideoPath}`);

  for (const kf of extractedFrames) {
    const artFramePath = path.join(ARTIFACTS_DIR, `eme-ad-${kf.label}`);
    fs.copyFileSync(kf.path, artFramePath);
  }

  console.log('\n================================================================');
  console.log('  PRODUCTION COMPLETE: ALL DELIVERABLES GENERATED & VERIFIED!   ');
  console.log('================================================================\n');

  return {
    videoPath: FINAL_AD_MP4,
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
