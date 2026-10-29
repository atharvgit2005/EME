/**
 * Phase 3 - Smoke Test Project Generator, Compiler, Renderer, and Inspector
 */

const fs = require('fs');
const path = require('path');
const { OperationExecutor } = require('../src/engine/operations.js');
const { ProjectManager } = require('../src/engine/project.js');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

function buildSmokeTest() {
  console.log('====================================================');
  console.log('  Phase 3: EME Smoke Test End-to-End Pipeline');
  console.log('====================================================\n');

  const outDir = path.resolve('artifacts/phase-3');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Execute Atomic Operations to generate the Smoke Test project
  console.log('Step 1: Constructing project via validated operations...');
  let project = {};

  // Op 1: create_project
  let res = OperationExecutor.execute(project, {
    type: 'create_project',
    params: {
      id: 'proj-phase3-smoke-test',
      title: 'Phase 3 Vertical Slice Smoke Test',
      width: 1080,
      height: 1920,
      fps: { numerator: 60, denominator: 1 },
      durationTicks: 360000, // 3.0s @ 120,000 ticks/sec
      backgroundColor: '#0a0a0d'
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 2: add font asset
  res = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: {
      id: 'font-instrument-serif',
      type: 'font',
      src: 'assets/fonts/InstrumentSerif-Regular.ttf',
      metadata: {
        fontFamily: 'Instrument Serif',
        format: 'truetype'
      }
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 3: add background/secondary visual track (zIndex 0)
  res = OperationExecutor.execute(project, {
    type: 'add_track',
    params: {
      id: 'track-bg-text',
      name: 'Background Subtitle Track',
      kind: 'visual',
      zIndex: 0
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 4: add primary hero visual track (zIndex 1)
  res = OperationExecutor.execute(project, {
    type: 'add_track',
    params: {
      id: 'track-hero-title',
      name: 'Hero Title Track',
      kind: 'visual',
      zIndex: 1
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 5: insert primary hero title clip on track-hero-title [0, 360000)
  res = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip-hero-title',
      trackId: 'track-hero-title',
      type: 'text',
      startTick: 0,
      durationTicks: 360000,
      transform: {
        x: 0,
        y: 800,
        scaleX: 1.0,
        scaleY: 1.0,
        opacity: 0.0,
        rotation: 0
      },
      typography: {
        text: 'EDITING MECHANICS',
        fontAssetId: 'font-instrument-serif',
        fontSize: 108,
        color: '#f5f5f7',
        textAlign: 'center',
        letterSpacing: 2
      }
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 6: insert secondary subtitle clip on track-bg-text [0, 360000)
  res = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip-subtitle',
      trackId: 'track-bg-text',
      type: 'text',
      startTick: 0,
      durationTicks: 360000,
      transform: {
        x: 0,
        y: 960,
        scaleX: 1.0,
        scaleY: 1.0,
        opacity: 0.0,
        rotation: 0
      },
      typography: {
        text: 'PHASE 3 VERTICAL SLICE',
        fontAssetId: 'font-instrument-serif',
        fontSize: 52,
        color: '#7c6cff',
        textAlign: 'center',
        letterSpacing: 6
      }
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 7: animate hero title opacity and scale (entrance from 0 to 1.5s = 180,000 ticks)
  res = OperationExecutor.execute(project, {
    type: 'animate_property',
    params: {
      clipId: 'clip-hero-title',
      property: 'transform.opacity',
      keyframes: [
        { offsetTick: 0, value: 0.0, easing: 'linear' },
        { offsetTick: 180000, value: 1.0, easing: 'power2.out' },
        { offsetTick: 360000, value: 1.0, easing: 'linear' }
      ]
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 8: animate hero title scale (scale from 0.85 to 1.05 over 3s)
  res = OperationExecutor.execute(project, {
    type: 'animate_property',
    params: {
      clipId: 'clip-hero-title',
      property: 'transform.scale',
      keyframes: [
        { offsetTick: 0, value: 0.85, easing: 'linear' },
        { offsetTick: 180000, value: 1.0, easing: 'power2.out' },
        { offsetTick: 360000, value: 1.05, easing: 'linear' }
      ]
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Op 9: animate subtitle opacity (delay entrance from 0.5s = 60,000 ticks to 1.5s)
  res = OperationExecutor.execute(project, {
    type: 'animate_property',
    params: {
      clipId: 'clip-subtitle',
      property: 'transform.opacity',
      keyframes: [
        { offsetTick: 0, value: 0.0, easing: 'linear' },
        { offsetTick: 60000, value: 0.0, easing: 'linear' },
        { offsetTick: 180000, value: 0.85, easing: 'power2.out' },
        { offsetTick: 360000, value: 0.85, easing: 'linear' }
      ]
    }
  });
  if (!res.success) throw new Error(res.error);
  project = res.project;

  // Save the canonical project
  const projectJsonPath = path.join(outDir, 'smoke-test-project.json');
  ProjectManager.saveProject(projectJsonPath, project);
  console.log(`✅ Saved canonical smoke test project: ${projectJsonPath}`);
  console.log(`   Final Project Revision: ${project.revision}`);

  // Step 2: Compile to HyperFrames composition
  console.log('\nStep 2: Compiling to HyperFrames composition...');
  const compDir = path.join(outDir, 'composition');
  const compiled = HyperFramesCompiler.compile(project, compDir);
  console.log(`✅ Compiled HyperFrames composition to: ${compiled.outputDir}`);
  console.log(`   Duration: ${compiled.durationSeconds}s | Canvas: 1080x1920 @ ${compiled.fps}fps`);

  // Step 3: Render MP4 via HyperFrames
  console.log('\nStep 3: Rendering MP4 via HyperFrames...');
  const mp4Path = path.join(outDir, 'smoke-test.mp4');
  const renderRes = HyperFramesRenderer.render(compDir, mp4Path);
  console.log(`✅ Render completed in ${renderRes.elapsedMs}ms! Output: ${renderRes.outputPath}`);
  console.log(`   Probed Metadata:`, renderRes.metadata);

  // Step 4: Deterministic Frame Inspection at 0.0s, 1.5s, and 3.0s
  console.log('\nStep 4: Inspecting deterministic frames...');
  const f0 = FrameInspector.inspectFromVideo(mp4Path, path.join(outDir, 'frame-0s.png'), { time: 0.0 });
  const f1 = FrameInspector.inspectFromVideo(mp4Path, path.join(outDir, 'frame-1.5s.png'), { time: 1.5 });
  const f3 = FrameInspector.inspectFromVideo(mp4Path, path.join(outDir, 'frame-3s.png'), { time: 2.95 });

  console.log(`✅ Extracted Frame at 0.0s: ${f0.framePath} (${f0.sizeBytes} bytes)`);
  console.log(`✅ Extracted Frame at 1.5s: ${f1.framePath} (${f1.sizeBytes} bytes)`);
  console.log(`✅ Extracted Frame at 3.0s: ${f3.framePath} (${f3.sizeBytes} bytes)`);

  console.log('\n🎉 Phase 3 Smoke Test Pipeline Completed Successfully!');
}

if (require.main === module) {
  buildSmokeTest();
}

module.exports = { buildSmokeTest };
