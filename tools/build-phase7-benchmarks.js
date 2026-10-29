/**
 * Phase 7 - Multi-Format Real-World Editing Benchmark Suite
 *
 * Implements Phase 7A:
 * 1. Scenario 1: YouTube Tech Explainer (16:9 Landscape - 1920x1080 @ 60fps)
 * 2. Scenario 2: Social Media Reel (9:16 Vertical - 1080x1920 @ 60fps)
 * 3. Scenario 3: E-Commerce Product Spotlight (1:1 Square - 1080x1080 @ 60fps)
 */

const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/engine/project.js');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../src/renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

function createScenario1_YouTube16x9() {
  return {
    id: "proj_scenario_1_youtube_16x9",
    schemaVersion: "1.0.0",
    revision: 1,
    title: "Scenario 1: YouTube Tech Explainer (16:9)",
    canvas: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      backgroundColor: "#0d1117"
    },
    timebase: {
      fps: { numerator: 60, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 360000, // 3.0s @ 60fps = 180 frames
      endpointConvention: "half-open"
    },
    assets: [
      { id: "font_inter", type: "font", src: "assets/fonts/files/Inter-Variable.ttf" },
      { id: "font_syne", type: "font", src: "assets/fonts/files/Syne-Variable.ttf" },
      { id: "bgm_snowfall", type: "audio", src: "assets/bgm/snowfall.mp3" },
      { id: "sfx_woosh", type: "audio", src: "assets/sfx/archive_replaced/12_woosh_original.wav" }
    ],
    tracks: [
      {
        id: "track_pip",
        name: "Picture in Picture Window",
        kind: "visual",
        zIndex: 5,
        muted: false,
        locked: false
      },
      {
        id: "track_headline",
        name: "Lower Third Headline",
        kind: "visual",
        zIndex: 15,
        muted: false,
        locked: false
      },
      {
        id: "track_subhead",
        name: "Lower Third Subheading",
        kind: "visual",
        zIndex: 20,
        muted: false,
        locked: false
      },
      {
        id: "track_bgm",
        name: "Background Music Bed",
        kind: "audio",
        zIndex: 0,
        muted: false,
        locked: false
      },
      {
        id: "track_sfx",
        name: "Transition SFX",
        kind: "audio",
        zIndex: 0,
        muted: false,
        locked: false
      }
    ],
    clips: [
      {
        id: "clip_pip_window",
        trackId: "track_pip",
        type: "graphic",
        startTick: 30000,
        durationTicks: 300000,
        transform: {
          x: 1380,
          y: 400,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 0.9,
          anchorX: 0.5,
          anchorY: 0.5
        }
      },
      {
        id: "clip_headline",
        trackId: "track_headline",
        type: "text",
        startTick: 30000,
        durationTicks: 300000,
        transform: {
          x: 180,
          y: 780,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.0,
          anchorY: 0.5
        },
        typography: {
          text: "ENGINEERING INTELLIGENCE // EME",
          fontAssetId: "font_syne",
          fontSize: 52,
          color: "#58a6ff",
          textAlign: "left",
          letterSpacing: 1
        }
      },
      {
        id: "clip_subhead",
        trackId: "track_subhead",
        type: "text",
        startTick: 60000,
        durationTicks: 270000,
        transform: {
          x: 180,
          y: 860,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.0,
          anchorY: 0.5
        },
        typography: {
          text: "Widescreen 1920x1080 • PIP Layout • Deterministic Engine",
          fontAssetId: "font_inter",
          fontSize: 24,
          color: "#8b949e",
          textAlign: "left",
          letterSpacing: 0.5
        }
      },
      {
        id: "clip_bgm",
        trackId: "track_bgm",
        type: "audio",
        startTick: 0,
        durationTicks: 360000,
        source: {
          assetId: "bgm_snowfall",
          trimInTick: 0,
          trimOutTick: 360000
        },
        audio: {
          volume: 0.35,
          volumeEnvelope: [
            { offsetTick: 0, volume: 0.0 },
            { offsetTick: 30000, volume: 0.35 },
            { offsetTick: 300000, volume: 0.35 },
            { offsetTick: 360000, volume: 0.0 }
          ]
        }
      },
      {
        id: "clip_sfx_woosh",
        trackId: "track_sfx",
        type: "audio",
        startTick: 30000,
        durationTicks: 60000,
        source: {
          assetId: "sfx_woosh",
          trimInTick: 0,
          trimOutTick: 60000
        },
        audio: {
          volume: 0.75
        }
      }
    ]
  };
}

function createScenario2_SocialReel9x16() {
  return {
    id: "proj_scenario_2_social_reel_9x16",
    schemaVersion: "1.0.0",
    revision: 1,
    title: "Scenario 2: Social Media Reel (9:16 Vertical)",
    canvas: {
      width: 1080,
      height: 1920,
      aspectRatio: "9:16",
      backgroundColor: "#050505"
    },
    timebase: {
      fps: { numerator: 60, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 360000, // 3.0s @ 60fps
      endpointConvention: "half-open"
    },
    assets: [
      { id: "font_archivo", type: "font", src: "assets/fonts/files/ArchivoBlack-Regular.ttf" },
      { id: "font_syne", type: "font", src: "assets/fonts/files/Syne-Variable.ttf" },
      { id: "sfx_camera_click", type: "audio", src: "assets/sfx/archive_replaced/10_camera_click_original.wav" }
    ],
    tracks: [
      {
        id: "track_center_accent",
        name: "Center Glow Accent",
        kind: "visual",
        zIndex: 5,
        muted: false,
        locked: false
      },
      {
        id: "track_kinetic_text",
        name: "Kinetic Captions",
        kind: "visual",
        zIndex: 15,
        muted: false,
        locked: false
      },
      {
        id: "track_sfx",
        name: "Impact Audio SFX",
        kind: "audio",
        zIndex: 0,
        muted: false,
        locked: false
      }
    ],
    clips: [
      {
        id: "clip_accent_badge",
        trackId: "track_center_accent",
        type: "graphic",
        startTick: 20000,
        durationTicks: 320000,
        transform: {
          x: 540,
          y: 960,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 0.95,
          anchorX: 0.5,
          anchorY: 0.5
        }
      },
      {
        id: "clip_hook_caption",
        trackId: "track_kinetic_text",
        type: "text",
        startTick: 20000,
        durationTicks: 150000, // [20000, 170000)
        transform: {
          x: 540,
          y: 920,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.5,
          anchorY: 0.5
        },
        typography: {
          text: "CAN YOU CODE THIS?",
          fontAssetId: "font_archivo",
          fontSize: 68,
          color: "#ffffff",
          textAlign: "center"
        }
      },
      {
        id: "clip_sub_caption",
        trackId: "track_kinetic_text",
        type: "text",
        startTick: 180000, // Non-overlapping [180000, 340000)
        durationTicks: 160000,
        transform: {
          x: 540,
          y: 940,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.5,
          anchorY: 0.5
        },
        typography: {
          text: "AUTOMATED VIA EME",
          fontAssetId: "font_syne",
          fontSize: 62,
          color: "#00ffcc",
          textAlign: "center"
        }
      },
      {
        id: "clip_click_1",
        trackId: "track_sfx",
        type: "audio",
        startTick: 20000,
        durationTicks: 40000,
        source: {
          assetId: "sfx_camera_click",
          trimInTick: 0,
          trimOutTick: 40000
        },
        audio: {
          volume: 0.9
        }
      },
      {
        id: "clip_click_2",
        trackId: "track_sfx",
        type: "audio",
        startTick: 180000, // Non-overlapping on track_sfx
        durationTicks: 40000,
        source: {
          assetId: "sfx_camera_click",
          trimInTick: 0,
          trimOutTick: 40000
        },
        audio: {
          volume: 0.9
        }
      }
    ]
  };
}

function createScenario3_Ecommerce1x1() {
  return {
    id: "proj_scenario_3_ecommerce_1x1",
    schemaVersion: "1.0.0",
    revision: 1,
    title: "Scenario 3: E-Commerce Product Card (1:1 Square)",
    canvas: {
      width: 1080,
      height: 1080,
      aspectRatio: "1:1",
      backgroundColor: "#f5f5f7"
    },
    timebase: {
      fps: { numerator: 60, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 360000, // 3.0s @ 60fps
      endpointConvention: "half-open"
    },
    assets: [
      { id: "font_inter", type: "font", src: "assets/fonts/files/Inter-Variable.ttf" },
      { id: "font_syne", type: "font", src: "assets/fonts/files/Syne-Variable.ttf" },
      { id: "sfx_woosh", type: "audio", src: "assets/sfx/archive_replaced/12_woosh_original.wav" }
    ],
    tracks: [
      {
        id: "track_card",
        name: "Product Spotlight Card",
        kind: "visual",
        zIndex: 5,
        muted: false,
        locked: false
      },
      {
        id: "track_title",
        name: "Product Headline",
        kind: "visual",
        zIndex: 10,
        muted: false,
        locked: false
      },
      {
        id: "track_subtitle",
        name: "Product Badge",
        kind: "visual",
        zIndex: 15,
        muted: false,
        locked: false
      },
      {
        id: "track_audio",
        name: "Audio Stems",
        kind: "audio",
        zIndex: 0,
        muted: false,
        locked: false
      }
    ],
    clips: [
      {
        id: "clip_product_card",
        trackId: "track_card",
        type: "graphic",
        startTick: 20000,
        durationTicks: 320000,
        transform: {
          x: 540,
          y: 540,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.5,
          anchorY: 0.5
        }
      },
      {
        id: "clip_product_title",
        trackId: "track_title",
        type: "text",
        startTick: 40000,
        durationTicks: 300000,
        transform: {
          x: 540,
          y: 440,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.5,
          anchorY: 0.5
        },
        typography: {
          text: "EME PRO SUITE",
          fontAssetId: "font_syne",
          fontSize: 64,
          color: "#000000",
          textAlign: "center"
        }
      },
      {
        id: "clip_product_price",
        trackId: "track_subtitle",
        type: "text",
        startTick: 60000,
        durationTicks: 280000,
        transform: {
          x: 540,
          y: 560,
          scaleX: 1.0,
          scaleY: 1.0,
          opacity: 1.0,
          anchorX: 0.5,
          anchorY: 0.5
        },
        typography: {
          text: "1:1 SQUARE COMPOSITE • ZERO LOSS",
          fontAssetId: "font_inter",
          fontSize: 26,
          color: "#0066cc",
          textAlign: "center"
        }
      },
      {
        id: "clip_sfx",
        trackId: "track_audio",
        type: "audio",
        startTick: 20000,
        durationTicks: 60000,
        source: {
          assetId: "sfx_woosh",
          trimInTick: 0,
          trimOutTick: 60000
        },
        audio: {
          volume: 0.6
        }
      }
    ]
  };
}

function runPhase7Benchmarks() {
  console.log('================================================================');
  console.log('  Phase 7A: EME Multi-Scenario Benchmark Suite (16:9, 9:16, 1:1)');
  console.log('================================================================\n');

  const baseOut = path.resolve('artifacts/phase-7');
  fs.mkdirSync(baseOut, { recursive: true });

  const scenarios = [
    { name: "Scenario 1 (16:9 YouTube)", fn: createScenario1_YouTube16x9, filePrefix: "scenario-1-16x9" },
    { name: "Scenario 2 (9:16 Social Reel)", fn: createScenario2_SocialReel9x16, filePrefix: "scenario-2-9x16" },
    { name: "Scenario 3 (1:1 Ecommerce)", fn: createScenario3_Ecommerce1x1, filePrefix: "scenario-3-1x1" }
  ];

  const results = [];

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    console.log(`\n>>> [${i + 1}/3] Executing ${sc.name}...`);
    const project = sc.fn();
    const jsonPath = path.join(baseOut, `${sc.filePrefix}.json`);
    ProjectManager.saveProject(jsonPath, project);
    console.log(`  ✅ Project validated & saved: ${jsonPath}`);

    const compDir = path.join(baseOut, `${sc.filePrefix}-comp`);
    const compiled = HyperFramesCompiler.compile(project, compDir);
    console.log(`  ✅ Compiled to composition: ${compiled.entryHtmlPath}`);

    const mp4Path = path.join(baseOut, `${sc.filePrefix}.mp4`);
    console.log(`  Rendering MP4 via HyperFrames @ 60fps...`);
    const renderRes = HyperFramesRenderer.render(compDir, mp4Path, { fps: 60 });
    console.log(`  ✅ Rendered in ${renderRes.elapsedMs}ms: ${mp4Path}`);
    console.log(`     Canvas: ${project.canvas.width}x${project.canvas.height} (${project.canvas.aspectRatio}) | Duration: ${renderRes.metadata.duration}s`);

    const framePath = path.join(baseOut, `${sc.filePrefix}-frame-1s.png`);
    const fInspect = FrameInspector.inspectFromVideo(mp4Path, framePath, { time: 1.5 });
    console.log(`  ✅ Frame extracted at 1.5s: ${fInspect.outputPath} (${fInspect.sizeBytes} bytes)`);

    results.push({
      scenario: sc.name,
      aspectRatio: project.canvas.aspectRatio,
      dimensions: `${project.canvas.width}x${project.canvas.height}`,
      mp4Path,
      framePath,
      elapsedMs: renderRes.elapsedMs,
      metadata: renderRes.metadata
    });
  }

  console.log('\n================================================================');
  console.log('  🎉 Phase 7A Multi-Scenario Benchmarks Completed Successfully!');
  console.log('================================================================\n');
  return results;
}

if (require.main === module) {
  runPhase7Benchmarks();
}

module.exports = {
  createScenario1_YouTube16x9,
  createScenario2_SocialReel9x16,
  createScenario3_Ecommerce1x1,
  runPhase7Benchmarks
};
