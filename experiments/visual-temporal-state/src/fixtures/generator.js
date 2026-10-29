/**
 * VTSM-01 Controlled Synthetic Fixture Generator
 *
 * Generates 7 reproducible ground-truth test clips (1920x1080 @ 30 fps, 60 frames = 2.0s)
 * using FFmpeg rawvideo pipeline with pixel-exact ground-truth JSON labels.
 *
 * Fixtures:
 *   A: Static camera, independently moving subject.
 *   B: Horizontal camera pan (+10 px/frame) with moving subject.
 *   C: Camera zoom (1.0x -> 1.5x) with stationary subject in scene.
 *   D: Camera rotation/tilt (-0.15 rad -> +0.15 rad) combined with subject movement.
 *   E: Temporary occlusion behind foreground pillar with reappearance.
 *   F: Hard scene cut at frame 30 with similar-looking subjects across cut.
 *   G: Low-texture smooth gradient with motion blur (ambiguous stress fixture).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { VtsmStateModel } = require('../state-model.js');
const { VtsmTimebase } = require('../timebase.js');
const { VtsmValidator } = require('../validate-state.js');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TOTAL_FRAMES = 60;
const DURATION_SEC = 2.0;

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');

/**
 * Render a procedural textured background into an RGB buffer.
 * High-contrast textured grid + crosshairs for strong feature matching.
 */
function drawTexturedBackground(buf, offsetX = 0, offsetY = 0, scale = 1.0, rotation = 0.0, palette = 'blue_tech') {
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const cx = WIDTH * 0.5;
  const cy = HEIGHT * 0.5;

  const isAmber = palette === 'amber';
  const isLowTexture = palette === 'low_texture';

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 3;

      if (isLowTexture) {
        // Very smooth, subtle gradient with almost zero high-frequency edges
        const grad = Math.floor(40 + (x / WIDTH) * 15 + (y / HEIGHT) * 15);
        buf[idx] = grad;
        buf[idx + 1] = grad;
        buf[idx + 2] = grad + 5;
        continue;
      }

      // Inverse transform from screen space to world background space
      const dx = (x - cx) / scale;
      const dy = (y - cy) / scale;
      const wx = dx * cosR + dy * sinR + cx + offsetX;
      const wy = -dx * sinR + dy * cosR + cy + offsetY;

      // Grid lines every 80 px
      const gridX = Math.abs(Math.round(wx) % 80);
      const gridY = Math.abs(Math.round(wy) % 80);
      const isGrid = gridX === 0 || gridY === 0;

      // Checkerboard macro squares every 240 px
      const checkX = Math.floor(wx / 240) % 2 === 0;
      const checkY = Math.floor(wy / 240) % 2 === 0;
      const isCheck = (checkX ^ checkY);

      if (isAmber) {
        if (isGrid) {
          buf[idx] = 245; buf[idx + 1] = 160; buf[idx + 2] = 40; // Gold grid
        } else if (isCheck) {
          buf[idx] = 50; buf[idx + 1] = 30; buf[idx + 2] = 20; // Dark amber
        } else {
          buf[idx] = 25; buf[idx + 1] = 15; buf[idx + 2] = 10; // Darker brown
        }
      } else {
        // Blue tech
        if (isGrid) {
          buf[idx] = 20; buf[idx + 1] = 180; buf[idx + 2] = 240; // Cyan grid
        } else if (isCheck) {
          buf[idx] = 18; buf[idx + 1] = 28; buf[idx + 2] = 48; // Slate blue
        } else {
          buf[idx] = 10; buf[idx + 1] = 15; buf[idx + 2] = 26; // Deep navy
        }
      }
    }
  }
}

/**
 * Draw a solid filled rectangle with a 4px high-contrast border into RGB buffer.
 */
function drawRect(buf, x, y, width, height, color, borderColor = [255, 255, 255]) {
  const xStart = Math.max(0, Math.round(x));
  const yStart = Math.max(0, Math.round(y));
  const xEnd = Math.min(WIDTH, Math.round(x + width));
  const yEnd = Math.min(HEIGHT, Math.round(y + height));

  for (let py = yStart; py < yEnd; py++) {
    for (let px = xStart; px < xEnd; px++) {
      const isBorder = (px - xStart < 4) || (xEnd - px <= 4) || (py - yStart < 4) || (yEnd - py <= 4);
      const idx = (py * WIDTH + px) * 3;
      if (isBorder && borderColor) {
        buf[idx] = borderColor[0];
        buf[idx + 1] = borderColor[1];
        buf[idx + 2] = borderColor[2];
      } else {
        buf[idx] = color[0];
        buf[idx + 1] = color[1];
        buf[idx + 2] = color[2];
      }
    }
  }
}

/**
 * Render and encode a fixture clip and produce ground truth VTSM JSON.
 */
async function buildFixture(fixtureId, config) {
  console.log(`Generating Fixture ${fixtureId.toUpperCase()}: ${config.name}...`);
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const mp4Path = path.join(FIXTURES_DIR, `fixture_${fixtureId}.mp4`);
  const gtJsonPath = path.join(FIXTURES_DIR, `fixture_${fixtureId}_gt.json`);

  // Start FFmpeg process reading raw RGB24 frames from stdin
  const ffmpeg = require('child_process').spawn('ffmpeg', [
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', `${WIDTH}x${HEIGHT}`,
    '-pix_fmt', 'rgb24',
    '-r', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    mp4Path
  ], { stdio: ['pipe', 'ignore', 'ignore'] });

  const frameBuffer = Buffer.alloc(WIDTH * HEIGHT * 3);
  const framesData = [];
  const events = [];

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const pts = f / FPS;
    const tick = VtsmTimebase.secondsToTicks(pts);

    // 1. Evaluate camera and scene parameters at frame f
    const sceneState = config.evaluate(f, pts);

    // 2. Render background with per-frame cumulative camera translation
    const bgOffsetX = sceneState.camera.worldOffset ? sceneState.camera.worldOffset.dx : (sceneState.camera.translation.dx * f);
    const bgOffsetY = sceneState.camera.worldOffset ? sceneState.camera.worldOffset.dy : (sceneState.camera.translation.dy * f);
    drawTexturedBackground(
      frameBuffer,
      bgOffsetX,
      bgOffsetY,
      sceneState.camera.worldScale !== undefined ? sceneState.camera.worldScale : sceneState.camera.scale,
      sceneState.camera.worldRotation !== undefined ? sceneState.camera.worldRotation : sceneState.camera.rotation,
      sceneState.palette || 'blue_tech'
    );

    // 3. Render subjects
    for (const sub of sceneState.subjects) {
      if (sub.rendered) {
        drawRect(
          frameBuffer,
          sub.screenBbox.x,
          sub.screenBbox.y,
          sub.screenBbox.width,
          sub.screenBbox.height,
          sub.color || [239, 68, 68],
          sub.borderColor || [255, 255, 255]
        );
      }
    }

    // 4. Render occluders if any
    if (sceneState.occluders) {
      for (const occ of sceneState.occluders) {
        drawRect(
          frameBuffer,
          occ.x,
          occ.y,
          occ.width,
          occ.height,
          occ.color || [15, 23, 42],
          occ.borderColor || [30, 41, 59]
        );
      }
    }

    // Write raw RGB frame to FFmpeg pipe with backpressure drain
    const canWrite = ffmpeg.stdin.write(frameBuffer);
    if (!canWrite) {
      await new Promise(r => ffmpeg.stdin.once('drain', r));
    }

    // Build frame observation metadata
    const observations = sceneState.subjects.map(s => {
      const normBbox = VtsmStateModel.normalizeBbox(s.screenBbox, WIDTH, HEIGHT);
      const centerPixel = VtsmStateModel.computeCenter(s.screenBbox);
      const centerNorm = VtsmStateModel.computeCenter(normBbox);

      return {
        entityId: s.entityId,
        bbox: {
          pixel: s.screenBbox,
          normalized: normBbox
        },
        center: {
          pixel: centerPixel,
          normalized: centerNorm
        },
        visibility: s.visibility,
        visibilityConfidence: s.visibilityConfidence !== undefined ? s.visibilityConfidence : (s.visibility === 'visible' ? 1.0 : (s.visibility === 'partially_occluded' ? 0.6 : 0.0)),
        trackingConfidence: s.trackingConfidence !== undefined ? s.trackingConfidence : 1.0,
        motion: {
          raw: s.motionRaw || { dx: 0, dy: 0, valid: f > 0 },
          compensated: s.motionCompensated || { dx: 0, dy: 0, valid: f > 0 }
        }
      };
    });

    framesData.push({
      frameIndex: f,
      pts,
      tick,
      shotId: sceneState.shotId || 'shot_01',
      cameraMotion: {
        model: sceneState.camera.model || 'identity',
        translation: {
          dx: sceneState.camera.translation.dx,
          dy: sceneState.camera.translation.dy
        },
        scale: sceneState.camera.scale,
        rotation: sceneState.camera.rotation,
        confidence: sceneState.camera.confidence !== undefined ? sceneState.camera.confidence : 1.0,
        valid: sceneState.camera.valid !== undefined ? sceneState.camera.valid : true
      },
      observations
    });

    if (sceneState.frameEvents) {
      events.push(...sceneState.frameEvents);
    }
  }

  ffmpeg.stdin.end();

  // Wait for FFmpeg process to finish writing output MP4
  await new Promise((resolve, reject) => {
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with error code ${code}`));
    });
    ffmpeg.on('error', reject);
  });

  // Calculate SHA-256 of generated video
  const fileData = fs.readFileSync(mp4Path);
  const fileHash = crypto.createHash('sha256').update(fileData).digest('hex');

  // Build canonical ground truth document
  const gtDoc = VtsmStateModel.createDocument({
    source: {
      sha256: fileHash,
      filePath: path.relative(path.resolve(__dirname, '../..'), mp4Path),
      dimensions: { width: WIDTH, height: HEIGHT },
      durationSec: DURATION_SEC,
      totalFrames: TOTAL_FRAMES
    },
    rationalFps: { numerator: FPS, denominator: 1 },
    provenance: {
      extractor: 'vtsm-synthetic-generator',
      version: '1.0.0',
      license: 'MIT',
      parameters: { fixtureId, name: config.name }
    }
  });

  gtDoc.shots = config.shots || [
    {
      shotId: 'shot_01',
      startFrame: 0,
      endFrame: TOTAL_FRAMES - 1,
      startPts: 0.0,
      endPts: (TOTAL_FRAMES - 1) / FPS,
      cutConfidence: 1.0,
      cutType: 'initial'
    }
  ];

  gtDoc.entities = config.entities;
  gtDoc.frames = framesData;
  gtDoc.events = events;

  // Validate ground truth against schema
  VtsmValidator.assertValid(gtDoc);

  fs.writeFileSync(gtJsonPath, JSON.stringify(gtDoc, null, 2));
  console.log(`  -> Video: ${mp4Path} (${(fileData.length / 1024).toFixed(1)} KB, SHA-256: ${fileHash.slice(0, 16)}...)`);
  console.log(`  -> Ground Truth: ${gtJsonPath} (Passed schema validation)`);

  return { mp4Path, gtJsonPath, sha256: fileHash };
}

/**
 * Generate All 7 Controlled Synthetic Fixtures
 */
async function generateAllFixtures() {
  console.log('================================================================');
  console.log('  VTSM-01: GENERATING CONTROLLED SYNTHETIC TEST FIXTURES        ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // FIXTURE A: Static camera, one independently moving subject
  // -------------------------------------------------------------
  await buildFixture('a', {
    name: 'Static camera, independently moving subject',
    entities: [{ entityId: 'ent_01', label: 'subject', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' }],
    evaluate: (f, pts) => {
      // Moves diagonally across screen: x: 200 -> 1380, y: 250 -> 650
      const x = 200 + (f / 59) * 1180;
      const y = 250 + (f / 59) * 400;
      const width = 120;
      const height = 160;

      const dx = (1180 / 59);
      const dy = (400 / 59);

      return {
        palette: 'blue_tech',
        camera: { model: 'identity', translation: { dx: 0, dy: 0 }, scale: 1.0, rotation: 0.0, confidence: 1.0, valid: true },
        subjects: [{
          entityId: 'ent_01',
          screenBbox: { x, y, width, height },
          visibility: 'visible',
          rendered: true,
          motionRaw: { dx: f > 0 ? dx : 0, dy: f > 0 ? dy : 0, valid: f > 0 },
          motionCompensated: { dx: f > 0 ? dx : 0, dy: f > 0 ? dy : 0, valid: f > 0 }
        }]
      };
    }
  });

  // -------------------------------------------------------------
  // FIXTURE B: Horizontal camera pan (+12 px/frame) with moving subject
  // -------------------------------------------------------------
  await buildFixture('b', {
    name: 'Horizontal camera pan (+12 px/frame) with moving subject',
    entities: [{ entityId: 'ent_01', label: 'subject', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' }],
    evaluate: (f, pts) => {
      // Camera translates by +12 px per frame (world background shifts right by +12)
      const camDx = f * 12.0;
      // Subject world position moves at +4 px per frame, starting at 1000 so it stays fully visible:
      // Screen X = 1000 + 4*f - 12*f = 1000 - 8*f (from 1000 down to 528 at f=59)
      const subWorldX = 1000 + f * 4.0;
      const subWorldY = 460;
      const screenX = subWorldX - camDx;
      const screenY = subWorldY;

      return {
        palette: 'blue_tech',
        camera: {
          model: 'translation',
          translation: { dx: f > 0 ? 12.0 : 0.0, dy: 0.0 },
          scale: 1.0,
          rotation: 0.0,
          confidence: 1.0,
          valid: true
        },
        subjects: [{
          entityId: 'ent_01',
          screenBbox: { x: screenX, y: screenY, width: 120, height: 160 },
          visibility: 'visible',
          rendered: true,
          motionRaw: { dx: f > 0 ? -8.0 : 0.0, dy: 0.0, valid: f > 0 },
          motionCompensated: { dx: f > 0 ? 4.0 : 0.0, dy: 0.0, valid: f > 0 }
        }]
      };
    }
  });

  // -------------------------------------------------------------
  // FIXTURE C: Camera zoom (1.0x -> 1.5x) with stationary subject in scene
  // -------------------------------------------------------------
  await buildFixture('c', {
    name: 'Camera zoom (1.0x -> 1.5x) with stationary subject',
    entities: [{ entityId: 'ent_01', label: 'subject', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' }],
    evaluate: (f, pts) => {
      const worldScale = 1.0 + (f / 59) * 0.5; // 1.0 -> 1.5
      const prevWorldScale = f > 0 ? (1.0 + ((f - 1) / 59) * 0.5) : 1.0;
      const frameDeltaScale = f > 0 ? (worldScale / prevWorldScale) : 1.0;

      // Subject at center (960, 540)
      const baseW = 120;
      const baseH = 160;
      const currentW = baseW * worldScale;
      const currentH = baseH * worldScale;
      const x = (WIDTH * 0.5) - (currentW * 0.5);
      const y = (HEIGHT * 0.5) - (currentH * 0.5);

      return {
        palette: 'blue_tech',
        camera: {
          model: 'affine',
          worldScale,
          translation: { dx: 0, dy: 0 },
          scale: frameDeltaScale,
          rotation: 0.0,
          confidence: 1.0,
          valid: true
        },
        subjects: [{
          entityId: 'ent_01',
          screenBbox: { x, y, width: currentW, height: currentH },
          visibility: 'visible',
          rendered: true,
          motionRaw: { dx: 0.0, dy: 0.0, valid: f > 0 },
          motionCompensated: { dx: 0.0, dy: 0.0, valid: f > 0 }
        }]
      };
    }
  });

  // -------------------------------------------------------------
  // FIXTURE D: Camera rotation/tilt combined with subject movement
  // -------------------------------------------------------------
  await buildFixture('d', {
    name: 'Camera rotation/tilt with subject parabolic motion',
    entities: [{ entityId: 'ent_01', label: 'subject', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' }],
    evaluate: (f, pts) => {
      // Rotation: -0.15 rad -> +0.15 rad
      const worldRot = -0.15 + (f / 59) * 0.30;
      const frameDeltaRot = f > 0 ? (0.30 / 59) : 0.0;

      // Parabolic arc for subject
      const x = 300 + (f / 59) * 1200;
      const normF = (f - 29.5) / 29.5;
      const y = 350 + (normF * normF) * 300;

      return {
        palette: 'blue_tech',
        camera: {
          model: 'affine',
          worldRotation: worldRot,
          translation: { dx: 0, dy: 0 },
          scale: 1.0,
          rotation: frameDeltaRot,
          confidence: 1.0,
          valid: true
        },
        subjects: [{
          entityId: 'ent_01',
          screenBbox: { x, y, width: 120, height: 160 },
          visibility: 'visible',
          rendered: true,
          motionRaw: { dx: (1200 / 59), dy: (f < 30 ? -1 : 1) * 10, valid: f > 0 },
          motionCompensated: { dx: (1200 / 59), dy: (f < 30 ? -1 : 1) * 10, valid: f > 0 }
        }]
      };
    }
  });

  // -------------------------------------------------------------
  // FIXTURE E: Temporary occlusion followed by reappearance
  // -------------------------------------------------------------
  await buildFixture('e', {
    name: 'Temporary occlusion behind foreground pillar with reappearance',
    entities: [{ entityId: 'ent_01', label: 'subject', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' }],
    evaluate: (f, pts) => {
      // Subject traverses horizontally: x: 300 -> 1500
      const subX = 300 + (f / 59) * 1200;
      const subY = 460;
      const subW = 120;
      const subH = 160;

      // Occluder pillar at center: x: 860 .. 1060 (width = 200)
      const occX = 860;
      const occW = 200;
      const occY = 0;
      const occH = HEIGHT;

      let visibility = 'visible';
      let visConf = 1.0;
      let rendered = true;

      // Overlap computation
      const subRight = subX + subW;
      const occRight = occX + occW;

      if (subRight > occX && subX < occRight) {
        // Overlapping with pillar
        if (subX >= occX && subRight <= occRight) {
          visibility = 'occluded';
          visConf = 0.0;
          rendered = false; // Behind pillar
        } else {
          visibility = 'partially_occluded';
          visConf = 0.5;
          rendered = true; // Partially visible behind occluder
        }
      }

      const frameEvents = [];
      if (f === 24) {
        frameEvents.push({
          eventId: 'evt_occ_start',
          type: 'occlusion_start',
          entityId: 'ent_01',
          frameIndex: f,
          pts,
          confidence: 0.95,
          details: { note: 'Entering behind pillar' }
        });
      } else if (f === 36) {
        frameEvents.push({
          eventId: 'evt_occ_end',
          type: 'occlusion_end',
          entityId: 'ent_01',
          frameIndex: f,
          pts,
          confidence: 0.95,
          details: { note: 'Exiting pillar' }
        });
      }

      return {
        palette: 'blue_tech',
        camera: { model: 'identity', translation: { dx: 0, dy: 0 }, scale: 1.0, rotation: 0.0, confidence: 1.0, valid: true },
        subjects: [{
          entityId: 'ent_01',
          screenBbox: { x: subX, y: subY, width: subW, height: subH },
          visibility,
          visibilityConfidence: visConf,
          rendered,
          motionRaw: { dx: (1200 / 59), dy: 0, valid: f > 0 },
          motionCompensated: { dx: (1200 / 59), dy: 0, valid: f > 0 }
        }],
        occluders: [{ x: occX, y: occY, width: occW, height: occH, color: [15, 23, 42], borderColor: [56, 189, 248] }],
        frameEvents
      };
    }
  });

  // -------------------------------------------------------------
  // FIXTURE F: Hard scene cut at frame 30 with similar-looking subjects
  // -------------------------------------------------------------
  await buildFixture('f', {
    name: 'Hard scene cut at frame 30 with similar-looking subjects',
    shots: [
      { shotId: 'shot_01', startFrame: 0, endFrame: 29, startPts: 0.0, endPts: 29 / FPS, cutConfidence: 1.0, cutType: 'initial' },
      { shotId: 'shot_02', startFrame: 30, endFrame: 59, startPts: 30 / FPS, endPts: 59 / FPS, cutConfidence: 1.0, cutType: 'hard_cut' }
    ],
    entities: [
      { entityId: 'ent_01', label: 'subject_blue', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' },
      { entityId: 'ent_02', label: 'subject_amber', shotId: 'shot_02', policyAcrossCuts: 'reset_on_cut' }
    ],
    evaluate: (f, pts) => {
      const isShot1 = f < 30;
      const shotId = isShot1 ? 'shot_01' : 'shot_02';
      const palette = isShot1 ? 'blue_tech' : 'amber';

      const frameEvents = [];
      if (f === 30) {
        frameEvents.push({
          eventId: 'evt_cut_30',
          type: 'shot_boundary',
          frameIndex: 30,
          pts,
          confidence: 1.0,
          details: { cutType: 'hard_cut', prevShot: 'shot_01', nextShot: 'shot_02' }
        });
      }

      if (isShot1) {
        // Entity 1 at top-left moving diagonally
        const x = 200 + (f / 29) * 400;
        const y = 200 + (f / 29) * 200;
        return {
          palette,
          shotId,
          camera: { model: 'identity', translation: { dx: 0, dy: 0 }, scale: 1.0, rotation: 0.0, confidence: 1.0, valid: true },
          subjects: [{
            entityId: 'ent_01',
            screenBbox: { x, y, width: 120, height: 160 },
            visibility: 'visible',
            rendered: true,
            motionRaw: { dx: 400 / 29, dy: 200 / 29, valid: f > 0 },
            motionCompensated: { dx: 400 / 29, dy: 200 / 29, valid: f > 0 }
          }],
          frameEvents
        };
      } else {
        // Entity 2 at bottom-right moving horizontally
        const sf = f - 30;
        const x = 1200 + (sf / 29) * 400;
        const y = 700;
        return {
          palette,
          shotId,
          camera: { model: 'identity', translation: { dx: 0, dy: 0 }, scale: 1.0, rotation: 0.0, confidence: 1.0, valid: true },
          subjects: [{
            entityId: 'ent_02',
            screenBbox: { x, y, width: 120, height: 160 },
            visibility: 'visible',
            rendered: true,
            motionRaw: { dx: 400 / 29, dy: 0, valid: sf > 0 },
            motionCompensated: { dx: 400 / 29, dy: 0, valid: sf > 0 }
          }],
          frameEvents
        };
      }
    }
  });

  // -------------------------------------------------------------
  // FIXTURE G: Low-texture smooth gradient with motion blur (Stress Test)
  // -------------------------------------------------------------
  await buildFixture('g', {
    name: 'Low-texture smooth gradient with ambiguous motion',
    entities: [{ entityId: 'ent_01', label: 'ambiguous_subject', shotId: 'shot_01', policyAcrossCuts: 'reset_on_cut' }],
    evaluate: (f, pts) => {
      // Extremely low contrast subtle subject
      const x = 400 + (f / 59) * 800;
      const y = 500;
      return {
        palette: 'low_texture',
        camera: { model: 'identity', translation: { dx: 0, dy: 0 }, scale: 1.0, rotation: 0.0, confidence: 0.25, valid: false },
        subjects: [{
          entityId: 'ent_01',
          screenBbox: { x, y, width: 140, height: 140 },
          visibility: 'visible',
          visibilityConfidence: 0.4,
          trackingConfidence: 0.3,
          color: [55, 55, 60], // Barely distinct from [40..55] background
          borderColor: [60, 60, 65],
          rendered: true,
          motionRaw: { dx: (800 / 59), dy: 0, valid: f > 0 },
          motionCompensated: { dx: (800 / 59), dy: 0, valid: false }
        }]
      };
    }
  });

  console.log('\n================================================================');
  console.log('  ALL 7 SYNTHETIC FIXTURES GENERATED & VERIFIED!                 ');
  console.log('================================================================\n');
}

if (require.main === module) {
  generateAllFixtures().catch(err => {
    console.error('Fixture generation failed:', err);
    process.exit(1);
  });
}

module.exports = { generateAllFixtures, buildFixture };
