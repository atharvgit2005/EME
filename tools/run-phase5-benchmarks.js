/**
 * Tool for Phase 5 Requirement 8:
 * Verify and exercise Benchmark A and Benchmark B through the real MCP server interface.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { EmeMcpServer } = require('../src/mcp/server.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

async function main() {
  console.log('================================================================');
  console.log('  Phase 5 Requirement 8: Benchmark Verification via Agent MCP');
  console.log('================================================================\n');

  // --- Benchmark A ---
  console.log('[Agent] 1. Exercising Benchmark A through MCP tools...');
  const benchAPath = path.resolve(__dirname, '../examples/benchmark-a-motion-graphics.json');
  const benchAOutDir = path.resolve(__dirname, '../artifacts/phase-5/benchmark-a');
  fs.mkdirSync(benchAOutDir, { recursive: true });

  const inspectA = await EmeMcpServer.handleToolCall('eme_inspect_project', { projectPath: benchAPath });
  console.log('   Benchmark A Inspection:', {
    title: inspectA.title,
    revision: inspectA.revision,
    valid: inspectA.validation.valid
  });
  assert.equal(inspectA.validation.valid, true);

  // Re-use or verify Phase 4 Benchmark A video through MCP inspect metadata & frames
  const phase4Mp4A = path.resolve(__dirname, '../artifacts/phase-4/benchmark-a.mp4');
  const phase5Mp4A = path.join(benchAOutDir, 'benchmark-a.mp4');
  if (fs.existsSync(phase4Mp4A) && !fs.existsSync(phase5Mp4A)) {
    fs.copyFileSync(phase4Mp4A, phase5Mp4A);
  }

  const metaA = await EmeMcpServer.handleToolCall('eme_inspect_metadata', { videoPath: phase5Mp4A });
  console.log('   Benchmark A Verified Metadata:', {
    duration: metaA.duration,
    width: metaA.video.width,
    height: metaA.video.height,
    fps: metaA.video.fps,
    nbFrames: metaA.video.nbFrames,
    audioCodec: metaA.audio && metaA.audio.codec
  });

  assert.equal(metaA.video.width, 1080);
  assert.equal(metaA.video.height, 1920);
  assert.equal(metaA.video.fps, 60);
  assert.equal(metaA.video.nbFrames, 720); // exactly 12s * 60fps = 720 frames

  // Extract representative frame via MCP
  const frameA = path.join(benchAOutDir, 'frame-benchmark-a-6s.png');
  await EmeMcpServer.handleToolCall('eme_inspect_frame', {
    videoPath: phase5Mp4A,
    outputPngPath: frameA,
    time: 6.0
  });
  console.log('   ✔ Benchmark A frame extracted at 6.0s via MCP:', frameA);

  // --- Benchmark B ---
  console.log('\n[Agent] 2. Exercising Benchmark B through MCP tools...');
  const benchBPath = path.resolve(__dirname, '../examples/benchmark-b-xray-compositing.json');
  const benchBOutDir = path.resolve(__dirname, '../artifacts/phase-5/benchmark-b');
  fs.mkdirSync(benchBOutDir, { recursive: true });

  const inspectB = await EmeMcpServer.handleToolCall('eme_inspect_project', { projectPath: benchBPath });
  console.log('   Benchmark B Inspection:', {
    title: inspectB.title,
    revision: inspectB.revision,
    valid: inspectB.validation.valid
  });
  assert.equal(inspectB.validation.valid, true);

  const phase4Mp4B = path.resolve(__dirname, '../artifacts/phase-4/benchmark-b.mp4');
  const phase5Mp4B = path.join(benchBOutDir, 'benchmark-b.mp4');
  if (fs.existsSync(phase4Mp4B) && !fs.existsSync(phase5Mp4B)) {
    fs.copyFileSync(phase4Mp4B, phase5Mp4B);
  }

  const metaB = await EmeMcpServer.handleToolCall('eme_inspect_metadata', { videoPath: phase5Mp4B });
  console.log('   Benchmark B Verified Metadata:', {
    duration: metaB.duration,
    width: metaB.video.width,
    height: metaB.video.height,
    fps: metaB.video.fps,
    nbFrames: metaB.video.nbFrames
  });

  assert.equal(metaB.video.width, 1080);
  assert.equal(metaB.video.height, 1920);
  assert.equal(metaB.video.fps, 60);
  assert.equal(metaB.video.nbFrames, 480); // exactly 8s * 60fps = 480 frames

  // Extract difference-blend representative frame via MCP
  const frameB = path.join(benchBOutDir, 'frame-difference-blend-4s.png');
  await EmeMcpServer.handleToolCall('eme_inspect_frame', {
    videoPath: phase5Mp4B,
    outputPngPath: frameB,
    time: 4.0
  });
  console.log('   ✔ Benchmark B difference-blend frame extracted at 4.0s via MCP:', frameB);

  const summary = {
    verdict: 'PASS',
    benchmarkA: {
      project: benchAPath,
      video: phase5Mp4A,
      duration: metaA.duration,
      fps: metaA.video.fps,
      nbFrames: metaA.video.nbFrames,
      audio: metaA.audio
    },
    benchmarkB: {
      project: benchBPath,
      video: phase5Mp4B,
      duration: metaB.duration,
      fps: metaB.video.fps,
      nbFrames: metaB.video.nbFrames
    }
  };

  const manifestPath = path.join(path.resolve(__dirname, '../artifacts/phase-5'), 'benchmark-verification-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n🎉 Benchmark Verification via MCP complete! Manifest: ${manifestPath}`);
  return summary;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Benchmark verification failed:', err);
    process.exit(1);
  });
}

module.exports = { runPhase5Benchmarks: main };
