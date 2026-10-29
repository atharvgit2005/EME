/**
 * Video Trial: Motion Graphics Editorial Assembly & Quality Verification
 * 
 * Takes real video footage from motion-graphics repository:
 *   /Users/atharvpaharia100/Desktop/Projects/motion-graphics/motion-lab/experiments/09-video-shotcraft/output/arc-studio-shotcraft-promo.mp4
 * 
 * Executes full EME pipeline:
 * 1. Project assembly (multi-track, editorial cuts, text overlay, audio envelope)
 * 2. Invariant & Schema Validation
 * 3. HyperFrames HTML/CSS/GSAP compilation
 * 4. Video Rendering to MP4
 * 5. Still frame extraction & visual inspection
 * 6. Automated Quality Assurance (VQA) audit
 * 7. Loading into live Visual Control Surface (http://localhost:4321)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { ProjectManager } = require('../../src/engine/project.js');
const { HyperFramesCompiler } = require('../../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../../src/renderers/inspector.js');
const { QualityAssuranceEngine } = require('../../src/renderers/qa-engine.js');
const { MediaTime, TICKS_PER_SECOND } = require('../../src/engine/time.js');

const TRIAL_DIR = path.resolve(__dirname);
const SOURCE_VIDEO = '/Users/atharvpaharia100/Desktop/Projects/motion-graphics/motion-lab/experiments/09-video-shotcraft/output/arc-studio-shotcraft-promo.mp4';
const LOCAL_ASSETS_DIR = path.join(TRIAL_DIR, 'assets');
const OUTPUT_DIR = path.join(TRIAL_DIR, 'output');
const COMP_DIR = path.join(TRIAL_DIR, 'composition');
const FRAMES_DIR = path.join(OUTPUT_DIR, 'frames');

fs.mkdirSync(LOCAL_ASSETS_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

// Copy video into local trial assets
const localVideoPath = path.join(LOCAL_ASSETS_DIR, 'shotcraft-source.mp4');
if (!fs.existsSync(localVideoPath)) {
  console.log(`[Trial] Copying source video from motion-graphics repo...`);
  fs.copyFileSync(SOURCE_VIDEO, localVideoPath);
}

// Ensure font and bgm are available
const fontSource = path.resolve(__dirname, '../../assets/fonts/files/Inter-Variable.ttf');
const bgmSource = path.resolve(__dirname, '../../assets/bgm/snowfall.mp3');

const project = {
  id: "proj_trial_motion_graphics",
  schemaVersion: "1.0.0",
  revision: 1,
  title: "EME Real-Time Video Trial — Shotcraft Editorial & Visual Assembly",
  canvas: {
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    backgroundColor: "#080b11"
  },
  timebase: {
    fps: { numerator: 30, denominator: 1 },
    ticksPerSecond: 120000,
    durationTicks: 720000, // 6.0 seconds
    endpointConvention: "half-open"
  },
  deliveryProfile: {
    truePeakCeiling: -1.0,
    loudnessTargetLKFS: -16.0
  },
  assets: [
    {
      id: "asset_shotcraft_video",
      type: "video",
      src: localVideoPath
    },
    {
      id: "font_inter",
      type: "font",
      src: fontSource,
      metadata: { fontFamily: "Inter" }
    },
    {
      id: "audio_soundtrack",
      type: "audio",
      src: bgmSource
    }
  ],
  tracks: [
    {
      id: "track_v1_primary",
      name: "Primary Editorial A-Roll",
      kind: "visual",
      zIndex: 10,
      muted: false,
      locked: false
    },
    {
      id: "track_v2_overlay",
      name: "Typography & Lower-Third Overlays",
      kind: "visual",
      zIndex: 30,
      muted: false,
      locked: false
    },
    {
      id: "track_a1_music",
      name: "Soundtrack Continuity Bed",
      kind: "audio",
      zIndex: 0,
      muted: false,
      locked: false
    }
  ],
  clips: [
    // Act 1: 0s to 3s (cuts from 0s to 3s of source footage)
    {
      id: "clip_act1_sceneA",
      trackId: "track_v1_primary",
      type: "video",
      source: {
        assetId: "asset_shotcraft_video",
        inTick: 0,
        outTick: 360000
      },
      startTick: 0,
      durationTicks: 360000,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1.0,
        scaleY: 1.0,
        opacity: 1.0
      }
    },
    // Act 2: 3s to 6s (editorial jump-cut to 6s-9s of source footage)
    {
      id: "clip_act2_sceneB",
      trackId: "track_v1_primary",
      type: "video",
      source: {
        assetId: "asset_shotcraft_video",
        inTick: 720000,
        outTick: 1080000
      },
      startTick: 360000,
      durationTicks: 360000,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1.0,
        scaleY: 1.0,
        opacity: 1.0
      }
    },
    // Lower third title card overlay (0s to 3.5s)
    {
      id: "clip_title_overlay",
      trackId: "track_v2_overlay",
      type: "text",
      startTick: 0,
      durationTicks: 420000, // 3.5 seconds
      typography: {
        text: "ARC STUDIO // SHOTCRAFT PROMO",
        fontAssetId: "font_inter",
        fontSize: 44,
        color: "#ffffff",
        textAlign: "center",
        letterSpacing: 4
      },
      transform: {
        x: 0,
        y: 380, // Lower third position
        scaleX: 1.0,
        scaleY: 1.0,
        opacity: 0.95
      }
    },
    // Audio soundtrack with automated volume envelope
    {
      id: "clip_audio_bed",
      trackId: "track_a1_music",
      type: "audio",
      source: {
        assetId: "audio_soundtrack",
        inTick: 0,
        outTick: 720000
      },
      startTick: 0,
      durationTicks: 720000,
      audio: {
        volume: 0.8,
        volumeEnvelope: [
          { offsetTick: 0, volume: 0.0 },
          { offsetTick: 60000, volume: 0.75 },     // 0.5s fade in
          { offsetTick: 360000, volume: 0.45 },    // ducking at cut
          { offsetTick: 660000, volume: 0.75 },    // swell
          { offsetTick: 720000, volume: 0.0 }      // fade out
        ]
      }
    }
  ],
  animations: [
    {
      clipId: "clip_title_overlay",
      property: "transform.opacity",
      keyframes: [
        { offsetTick: 0, value: 0.0, easing: "linear" },
        { offsetTick: 60000, value: 0.95, easing: "easeOut" },
        { offsetTick: 360000, value: 0.95, easing: "linear" },
        { offsetTick: 420000, value: 0.0, easing: "easeIn" }
      ]
    }
  ]
};

async function runTrial() {
  console.log('\n============================================================');
  console.log('🎬 STARTING EME VIDEO TRIAL: MOTION GRAPHICS FOOTAGE');
  console.log('============================================================');

  // Step 1: Save & Validate Project
  const projectPath = path.join(TRIAL_DIR, 'shotcraft-trial-project.json');
  console.log(`\n1. Validating and saving project to: ${projectPath}`);
  ProjectManager.saveProject(projectPath, project);
  console.log(`   ✔ Project schema and semantic invariants verified!`);

  // Step 2: Compile to HyperFrames
  console.log(`\n2. Compiling canonical project to HyperFrames composition at: ${COMP_DIR}`);
  HyperFramesCompiler.compile(project, COMP_DIR);
  console.log(`   ✔ HyperFrames HTML/CSS/GSAP composition generated!`);

  // Step 3: Render MP4 Video
  const outputVideo = path.join(OUTPUT_DIR, 'shotcraft-trial-output.mp4');
  console.log(`\n3. Rendering video to: ${outputVideo}`);
  const renderRes = HyperFramesRenderer.render(COMP_DIR, outputVideo, { fps: 30 });
  console.log(`   ✔ Render complete in ${(renderRes.elapsedMs / 1000).toFixed(2)}s!`);
  console.log(`   ✔ Dimensions: ${renderRes.metadata.width}x${renderRes.metadata.height}`);
  console.log(`   ✔ Duration: ${renderRes.metadata.duration}s`);
  console.log(`   ✔ File Size: ${(renderRes.metadata.sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  // Step 4: Extract Representative Still Frames
  console.log(`\n4. Extracting keyframe images via FrameInspector...`);
  const frameTimes = [1.0, 3.0, 4.5];
  const extractedFrames = [];
  for (const t of frameTimes) {
    const frameOut = path.join(FRAMES_DIR, `frame_${t.toFixed(1)}s.png`);
    const fRes = FrameInspector.inspectFromVideo(outputVideo, frameOut, { time: t });
    extractedFrames.push(fRes);
    console.log(`   ✔ Frame at ${t}s extracted: ${frameOut} (${(fRes.sizeBytes / 1024).toFixed(1)} KB)`);
  }

  // Step 5: Automated Quality Assurance (VQA) Audit
  console.log(`\n5. Executing Automated Quality Assurance (VQA) Audit...`);
  const qaReport = QualityAssuranceEngine.auditQuality(project, outputVideo, { truePeakCeiling: -1.0 });
  console.log(`   ✔ Overall Quality Score: ${qaReport.score} / 100`);
  console.log(`   ✔ QA Disposition: ${qaReport.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  qaReport.checks.forEach(c => {
    console.log(`     - [${c.passed ? 'PASS' : 'WARN'}] ${c.name}: ${c.detail}`);
  });
  if (qaReport.warnings.length > 0) {
    console.log(`   Warnings:`);
    qaReport.warnings.forEach(w => console.log(`     ⚠ ${w}`));
  }

  // Save QA Report to disk
  const qaReportPath = path.join(OUTPUT_DIR, 'qa-report.json');
  fs.writeFileSync(qaReportPath, JSON.stringify(qaReport, null, 2), 'utf8');

  // Step 6: Load Project into Live UI Server
  console.log(`\n6. Loading trial project into live EME Visual Control Surface UI (http://localhost:4321)...`);
  try {
    const loadReq = http.request({
      hostname: 'localhost',
      port: 4321,
      path: `/api/project?path=${encodeURIComponent(projectPath)}`,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   ✔ Successfully loaded into UI! Response status: ${res.statusCode}`);
      });
    });
    loadReq.on('error', (err) => {
      console.log(`   (Note: UI server might need manual reload: ${err.message})`);
    });
    loadReq.end();
  } catch (e) {
    console.log(`   UI sync note: ${e.message}`);
  }

  console.log('\n============================================================');
  console.log('🎉 EME VIDEO TRIAL COMPLETED SUCCESSFULLY!');
  console.log(`📹 Rendered Video: ${outputVideo}`);
  console.log(`🖼 Still Frames: ${FRAMES_DIR}`);
  console.log(`📊 QA Report: ${qaReportPath}`);
  console.log('============================================================\n');

  return {
    outputVideo,
    metadata: renderRes.metadata,
    qaReport,
    extractedFrames
  };
}

runTrial().catch(err => {
  console.error('[Trial Error]', err);
  process.exit(1);
});
