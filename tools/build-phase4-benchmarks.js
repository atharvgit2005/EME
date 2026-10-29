/**
 * Phase 4 - Benchmark A & Benchmark B End-to-End Pipeline
 */

const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/engine/project.js');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

function runBenchmarks() {
  console.log('====================================================');
  console.log('  Phase 4: EME Benchmark A & B End-to-End Execution');
  console.log('====================================================\n');

  const baseOut = path.resolve('artifacts/phase-4');
  fs.mkdirSync(baseOut, { recursive: true });

  // ----------------------------------------------------
  // Benchmark A: Reference-Driven Kinetic Typography (12s @ 60fps)
  // ----------------------------------------------------
  console.log('>>> [1/2] Processing Benchmark A: Kinetic Typography (12s @ 60fps)...');
  const benchAJson = path.resolve('examples/benchmark-a-motion-graphics.json');
  const projectA = ProjectManager.loadProject(benchAJson);
  console.log(`✅ Loaded Benchmark A project: ${projectA.id} (Revision ${projectA.revision})`);

  const compADir = path.join(baseOut, 'benchmark-a-comp');
  const compiledA = HyperFramesCompiler.compile(projectA, compADir);
  console.log(`✅ Compiled Benchmark A composition: ${compiledA.entryHtmlPath}`);

  const mp4A = path.join(baseOut, 'benchmark-a.mp4');
  console.log('Rendering Benchmark A MP4 via HyperFrames at 60 fps...');
  const renderResA = HyperFramesRenderer.render(compADir, mp4A, { fps: 60 });
  console.log(`✅ Benchmark A render finished in ${renderResA.elapsedMs}ms: ${renderResA.outputPath}`);
  console.log('   Probed Metadata:', renderResA.metadata);

  // Frame inspection for Benchmark A at 1.0s, 5.0s, 10.0s
  console.log('Extracting deterministic inspection frames for Benchmark A...');
  const fA1 = FrameInspector.inspectFromVideo(mp4A, path.join(baseOut, 'bench-a-frame-1s.png'), { time: 1.0 });
  const fA5 = FrameInspector.inspectFromVideo(mp4A, path.join(baseOut, 'bench-a-frame-5s.png'), { time: 5.0 });
  const fA10 = FrameInspector.inspectFromVideo(mp4A, path.join(baseOut, 'bench-a-frame-10s.png'), { time: 10.0 });
  console.log(`✅ Frames extracted: 1s (${fA1.sizeBytes}B), 5s (${fA5.sizeBytes}B), 10s (${fA10.sizeBytes}B)`);

  // ----------------------------------------------------
  // Benchmark B: Layered X-ray / Difference Compositing (8s @ 60fps)
  // ----------------------------------------------------
  console.log('\n>>> [2/2] Processing Benchmark B: X-Ray Difference Compositing (8s @ 60fps)...');
  const benchBJson = path.resolve('examples/benchmark-b-xray-compositing.json');
  const projectB = ProjectManager.loadProject(benchBJson);
  console.log(`✅ Loaded Benchmark B project: ${projectB.id} (Revision ${projectB.revision})`);

  const compBDir = path.join(baseOut, 'benchmark-b-comp');
  const compiledB = HyperFramesCompiler.compile(projectB, compBDir);
  console.log(`✅ Compiled Benchmark B composition: ${compiledB.entryHtmlPath}`);

  const mp4B = path.join(baseOut, 'benchmark-b.mp4');
  console.log('Rendering Benchmark B MP4 via HyperFrames at 60 fps...');
  const renderResB = HyperFramesRenderer.render(compBDir, mp4B, { fps: 60 });
  console.log(`✅ Benchmark B render finished in ${renderResB.elapsedMs}ms: ${renderResB.outputPath}`);
  console.log('   Probed Metadata:', renderResB.metadata);

  // Frame inspection for Benchmark B at 1.0s, 4.0s, 7.0s
  console.log('Extracting deterministic inspection frames for Benchmark B...');
  const fB1 = FrameInspector.inspectFromVideo(mp4B, path.join(baseOut, 'bench-b-frame-1s.png'), { time: 1.0 });
  const fB4 = FrameInspector.inspectFromVideo(mp4B, path.join(baseOut, 'bench-b-frame-4s.png'), { time: 4.0 });
  const fB7 = FrameInspector.inspectFromVideo(mp4B, path.join(baseOut, 'bench-b-frame-7s.png'), { time: 7.0 });
  console.log(`✅ Frames extracted: 1s (${fB1.sizeBytes}B), 4s (${fB4.sizeBytes}B), 7s (${fB7.sizeBytes}B)`);

  console.log('\n🎉 Phase 4 Benchmarks A & B Execution Completed Successfully!');
}

if (require.main === module) {
  runBenchmarks();
}

module.exports = { runBenchmarks };
