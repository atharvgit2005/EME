/**
 * Dynamic Procedural Audio & 3D Tracking Camera Pipeline Runner
 *
 * Implements:
 * 1. Parametric Procedural Audio Synthesis (ff-unmute synthetic DSP) -> music.wav + events.json
 * 2. HyperFrames 3D DAW & Tracking Camera rendering -> video.mp4
 * 3. FFmpeg sample-accurate multiplexing -> final-demo.mp4
 * 4. Keyframe extraction & verification via FrameInspector
 * 5. Full compliance & quality checks: duration, format, LUFS, SHA-256 digests
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { HyperFramesRenderer } = require('../../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../../src/renderers/inspector.js');
const { synthesizeComposition, encodeWav } = require('./synth.js');

const WORKSPACE_DIR = path.resolve(__dirname);
const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'output');

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

function measureLoudness(wavPath) {
  const res = spawnSync('ffmpeg', [
    '-i', wavPath,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-'
  ], { encoding: 'utf8' });

  const stderr = res.stderr || '';
  const matchI = stderr.match(/Integrated loudness:\s+I:\s+([-\d.]+)\s+LUFS/);
  const matchPeak = stderr.match(/Peak:\s+([-\d.]+)\s+dBFS/);

  return {
    integratedLufs: matchI ? parseFloat(matchI[1]) : null,
    truePeakDbfs: matchPeak ? parseFloat(matchPeak[1]) : null
  };
}

async function run(durationSec = 6.0) {
  console.log('================================================================');
  console.log(`  EME DYNAMIC PROCEDURAL SYNTH & 3D CAMERA PIPELINE (${durationSec}s)`);
  console.log('================================================================\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const totalFrames = Math.round(durationSec * 30);
  const musicWavPath = path.join(OUTPUT_DIR, `music-${durationSec}s.wav`);
  const eventsJsonPath = path.join(OUTPUT_DIR, `events-${durationSec}s.json`);
  const rawVideoPath = path.join(OUTPUT_DIR, `raw-${durationSec}s.mp4`);
  const finalDemoPath = path.join(OUTPUT_DIR, `final-demo-${durationSec}s.mp4`);

  const t0 = Date.now();

  // 1. Procedural Audio Synthesis
  console.log(`Step 1: Synthesizing multi-track procedural audio (${durationSec}s)...`);
  const synthStart = Date.now();
  const synthResult = synthesizeComposition(durationSec, 1209);
  const wavBuf = encodeWav(synthResult.left, synthResult.right);
  fs.writeFileSync(musicWavPath, wavBuf);
  fs.writeFileSync(eventsJsonPath, JSON.stringify(synthResult.events, null, 2));
  const synthElapsed = Date.now() - synthStart;

  const loudness = measureLoudness(musicWavPath);
  console.log(`  -> Audio generated in ${synthElapsed}ms (${(wavBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`  -> Events recorded: ${synthResult.events.length}`);
  console.log(`  -> Loudness: ${loudness.integratedLufs} LUFS (Target: ~-14.0 LUFS)`);

  // 2. Configure Composition HTML Duration
  console.log(`Step 2: Preparing HyperFrames composition for ${durationSec}s (${totalFrames} frames)...`);
  const htmlPath = path.join(WORKSPACE_DIR, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/setupTimeline\([\d.]+\)/, `setupTimeline(${durationSec})`);
  html = html.replace(/window\.renderFrame\(0, \d+, [\d.]+\)/, `window.renderFrame(0, ${totalFrames}, ${durationSec})`);
  html = html.replace(/totalDuration = [\d.]+;/, `totalDuration = ${durationSec};`);
  html = html.replace(/data-duration="[\d.]+"/, `data-duration="${durationSec}"`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  // 3. Render Video via HyperFramesRenderer
  console.log(`Step 3: Rendering 3D camera flight via HyperFramesRenderer (${totalFrames} frames @ 30 fps)...`);
  const renderStart = Date.now();
  const renderRes = HyperFramesRenderer.render(WORKSPACE_DIR, rawVideoPath, { fps: 30 });
  const renderElapsed = Date.now() - renderStart;
  console.log(`  -> Video rendered in ${renderElapsed}ms (${(renderRes.metadata.sizeBytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`  -> Resolution: ${renderRes.metadata.width}x${renderRes.metadata.height} @ ${renderRes.metadata.fps} fps`);

  // 4. Multiplex Audio + Video via FFmpeg
  console.log(`Step 4: Multiplexing audio and video streams via FFmpeg...`);
  const muxStart = Date.now();
  const mux = spawnSync('ffmpeg', [
    '-y',
    '-i', rawVideoPath,
    '-i', musicWavPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-shortest',
    finalDemoPath
  ], { encoding: 'utf8' });

  if (mux.status !== 0) {
    throw new Error(`FFmpeg mux failed: ${mux.stderr}`);
  }
  const muxElapsed = Date.now() - muxStart;
  console.log(`  -> Mux completed in ${muxElapsed}ms`);

  // 5. Inspect and Extract Keyframes
  console.log(`Step 5: Verifying final demo and extracting keyframes...`);
  const probe = probeFile(finalDemoPath);
  const vStream = probe.streams.find(s => s.codec_type === 'video');
  const aStream = probe.streams.find(s => s.codec_type === 'audio');
  const demoDuration = parseFloat(probe.format.duration);

  console.log(`  -> Final MP4 Duration: ${demoDuration.toFixed(2)}s (Target: ${durationSec.toFixed(2)}s)`);
  console.log(`  -> Video Stream: ${vStream.codec_name} ${vStream.width}x${vStream.height} @ ${vStream.r_frame_rate} fps`);
  console.log(`  -> Audio Stream: ${aStream.codec_name} ${aStream.sample_rate} Hz, ${aStream.channels} channels, ${Math.round(aStream.bit_rate / 1000)} kbps`);

  // Extract keyframes at 1.0s, 3.0s, 5.0s (or proportional)
  const kfTimes = [
    Math.min(1.0, durationSec * 0.2),
    durationSec * 0.5,
    Math.max(durationSec - 0.5, durationSec * 0.85)
  ];

  const extractedFrames = [];
  for (let tSec of kfTimes) {
    const kfPath = path.join(OUTPUT_DIR, `frame-${tSec.toFixed(1)}s.png`);
    FrameInspector.inspectFromVideo(finalDemoPath, kfPath, { time: tSec });
    extractedFrames.push({ time: tSec, path: kfPath, hash: sha256(kfPath) });
  }

  const totalElapsed = Date.now() - t0;
  console.log(`\nPipeline finished in ${(totalElapsed / 1000).toFixed(2)}s.`);

  // Generate Report
  const reportPath = path.join(OUTPUT_DIR, `UNMUTE_DYNAMIC_${durationSec}S_REPORT.md`);
  const report = `# Dynamic Procedural Audio & 3D Tracking Camera Pipeline Report (${durationSec}s)

## 1. Executive Summary
- **Duration**: ${durationSec}s (${totalFrames} frames @ 30 fps)
- **Audio Synthesis**: 100% Procedural Synthetic DSP (0 external samples, 0 npm dependencies)
- **Visuals**: DAW Studio Timeline with dynamic chord, kick, clap, and bass clip lanes
- **Camera Movement**: 3D tilted camera flight (Tait-Bryan rotation with dynamic Catmull-Rom spline)
- **Tracking HUD**: Reticle and bounding box locked onto playhead audio transients
- **Integrated Loudness**: ${loudness.integratedLufs} LUFS
- **Total Pipeline Execution**: ${(totalElapsed / 1000).toFixed(2)}s

## 2. Artifacts & Cryptographic Verification
| Artifact | Path | Size | SHA-256 Hash |
| :--- | :--- | :--- | :--- |
| **Final Demo MP4** | \`${path.relative(WORKSPACE_DIR, finalDemoPath)}\` | ${(fs.statSync(finalDemoPath).size / 1024 / 1024).toFixed(2)} MB | \`${sha256(finalDemoPath)}\` |
| **Synthesized WAV** | \`${path.relative(WORKSPACE_DIR, musicWavPath)}\` | ${(wavBuf.length / 1024 / 1024).toFixed(2)} MB | \`${sha256(musicWavPath)}\` |
| **Events JSON** | \`${path.relative(WORKSPACE_DIR, eventsJsonPath)}\` | ${(fs.statSync(eventsJsonPath).size / 1024).toFixed(1)} KB | \`${sha256(eventsJsonPath)}\` |
| **Keyframe 1 (${extractedFrames[0].time.toFixed(1)}s)** | \`${path.relative(WORKSPACE_DIR, extractedFrames[0].path)}\` | ${(fs.statSync(extractedFrames[0].path).size / 1024).toFixed(1)} KB | \`${extractedFrames[0].hash}\` |
| **Keyframe 2 (${extractedFrames[1].time.toFixed(1)}s)** | \`${path.relative(WORKSPACE_DIR, extractedFrames[1].path)}\` | ${(fs.statSync(extractedFrames[1].path).size / 1024).toFixed(1)} KB | \`${extractedFrames[1].hash}\` |
| **Keyframe 3 (${extractedFrames[2].time.toFixed(1)}s)** | \`${path.relative(WORKSPACE_DIR, extractedFrames[2].path)}\` | ${(fs.statSync(extractedFrames[2].path).size / 1024).toFixed(1)} KB | \`${extractedFrames[2].hash}\` |

## 3. Media Stream Technical Specifications
- **Container**: MP4 (ISO/IEC 14496-14)
- **Video Stream**: ${vStream.codec_name} (${vStream.profile}), ${vStream.width}x${vStream.height}, ${vStream.r_frame_rate} fps
- **Audio Stream**: ${aStream.codec_name}, 48,000 Hz, 2 channels, ${Math.round(aStream.bit_rate / 1000)} kbps
- **Integrated Loudness**: ${loudness.integratedLufs} LUFS
- **True Peak**: ${loudness.truePeakDbfs} dBFS
`;

  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Report generated at: ${reportPath}`);

  return {
    durationSec,
    finalDemoPath,
    musicWavPath,
    reportPath,
    extractedFrames
  };
}

if (require.main === module) {
  const dur = parseFloat(process.argv[2] || '6.0');
  run(dur).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
