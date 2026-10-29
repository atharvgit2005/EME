/**
 * VTSM-03 Held-Out Unseen-Motion Challenge Generator
 * 
 * Generates the three mandatory held-out test clips specified by ChatGPT Lead:
 * 1. Test B: Disappearance & Reappearance (held_out_b_reappearance.mp4 + gt.json)
 *    - Full occlusion behind solid foreground obstacle (30 frames) with altered-scale/pose re-emergence.
 * 2. Test C: Identity Collision (held_out_c_collision.mp4 + gt.json)
 *    - Two similar-looking subjects crossing trajectories under active camera pan.
 * 3. Test A: Pine-Branch Gauntlet (held_out_a_pine_gauntlet.mp4 + gt.json)
 *    - Handheld camera shake, high-frequency foreground foliage, rapid subject weaving.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TOTAL_FRAMES = 90; // 3.0 seconds

const OUT_DIR = path.resolve(__dirname, '../../held_out_fixtures');

function secondsToTicks(seconds) {
  return Math.round(seconds * 120000);
}

function normalizeBbox(box) {
  return {
    x: box.x / WIDTH,
    y: box.y / HEIGHT,
    width: box.width / WIDTH,
    height: box.height / HEIGHT
  };
}

function computeCenter(box) {
  return {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5
  };
}

function drawBackground(buf, offsetX = 0, offsetY = 0, style = 'forest_tech') {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 3;
      const wx = x + offsetX;
      const wy = y + offsetY;

      if (style === 'forest_tech') {
        // Deep forest tones with subtle vertical bark-like striations and grid
        const striation = Math.sin(wx * 0.05) * 8 + Math.cos(wy * 0.02) * 5;
        const gridX = Math.abs(Math.round(wx) % 120) === 0;
        const gridY = Math.abs(Math.round(wy) % 120) === 0;
        const baseG = 35 + Math.floor((wy / HEIGHT) * 20 + striation);
        const baseR = 15 + Math.floor((wx / WIDTH) * 15);
        const baseB = 25;

        if (gridX || gridY) {
          buf[idx] = 40;
          buf[idx + 1] = 90;
          buf[idx + 2] = 60;
        } else {
          buf[idx] = Math.max(0, Math.min(255, baseR));
          buf[idx + 1] = Math.max(0, Math.min(255, baseG));
          buf[idx + 2] = Math.max(0, Math.min(255, baseB));
        }
      } else {
        // Urban contrast grid
        const gridX = Math.abs(Math.round(wx) % 80) === 0;
        const gridY = Math.abs(Math.round(wy) % 80) === 0;
        const check = (Math.floor(wx / 160) ^ Math.floor(wy / 160)) & 1;
        if (gridX || gridY) {
          buf[idx] = 200; buf[idx + 1] = 160; buf[idx + 2] = 50;
        } else if (check) {
          buf[idx] = 30; buf[idx + 1] = 35; buf[idx + 2] = 45;
        } else {
          buf[idx] = 18; buf[idx + 1] = 22; buf[idx + 2] = 30;
        }
      }
    }
  }
}

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
        // Add internal texture to prevent feature starvation
        const tex = ((px ^ py) & 8) ? 15 : -15;
        buf[idx] = Math.max(0, Math.min(255, color[0] + tex));
        buf[idx + 1] = Math.max(0, Math.min(255, color[1] + tex));
        buf[idx + 2] = Math.max(0, Math.min(255, color[2] + tex));
      }
    }
  }
}

function drawPineNeedles(buf, x, y, width, height) {
  // Renders a high-frequency foreground pine branch obstacle with needle spikes
  const xStart = Math.max(0, Math.round(x));
  const yStart = Math.max(0, Math.round(y));
  const xEnd = Math.min(WIDTH, Math.round(x + width));
  const yEnd = Math.min(HEIGHT, Math.round(y + height));

  for (let py = yStart; py < yEnd; py++) {
    for (let px = xStart; px < xEnd; px++) {
      const idx = (py * WIDTH + px) * 3;
      // High-frequency needle pattern
      const needle = Math.abs(Math.sin((px + py * 1.5) * 0.4));
      if (needle > 0.45) {
        buf[idx] = 12;
        buf[idx + 1] = 68;
        buf[idx + 2] = 24;
      } else if (needle > 0.35) {
        buf[idx] = 40;
        buf[idx + 1] = 100;
        buf[idx + 2] = 45;
      }
    }
  }
}

async function renderTestClip(testId, config) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mp4Path = path.join(OUT_DIR, `held_out_${testId}.mp4`);
  const gtPath = path.join(OUT_DIR, `held_out_${testId}_gt.json`);

  console.log(`\nRendering Held-Out Challenge [${testId.toUpperCase()}]: ${config.name}...`);

  const ffmpeg = spawn('ffmpeg', [
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

  const frameBuf = Buffer.alloc(WIDTH * HEIGHT * 3);
  const framesData = [];

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const pts = f / FPS;
    const tick = secondsToTicks(pts);

    const frameState = config.evaluate(f, pts);

    // 1. Render background
    drawBackground(frameBuf, frameState.camera.worldOffset.dx, frameState.camera.worldOffset.dy, frameState.bgStyle || 'forest_tech');

    // 2. Render subjects
    for (const sub of frameState.subjects) {
      if (sub.rendered) {
        drawRect(frameBuf, sub.screenBbox.x, sub.screenBbox.y, sub.screenBbox.width, sub.screenBbox.height, sub.color, sub.borderColor);
      }
    }

    // 3. Render obstacles / occluders (foreground)
    if (frameState.occluders) {
      for (const occ of frameState.occluders) {
        if (occ.type === 'pine_foliage') {
          drawPineNeedles(frameBuf, occ.x, occ.y, occ.width, occ.height);
        } else {
          drawRect(frameBuf, occ.x, occ.y, occ.width, occ.height, occ.color || [15, 23, 42], occ.borderColor || [30, 41, 59]);
        }
      }
    }

    // Drain buffer to FFmpeg
    const canWrite = ffmpeg.stdin.write(frameBuf);
    if (!canWrite) {
      await new Promise(r => ffmpeg.stdin.once('drain', r));
    }

    // Record ground-truth frame observations
    const observations = frameState.subjects.map(s => {
      const normBbox = normalizeBbox(s.screenBbox);
      const centerPixel = computeCenter(s.screenBbox);
      const centerNorm = computeCenter(normBbox);

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
        visibilityConfidence: s.visibility === 'visible' ? 1.0 : (s.visibility === 'partially_occluded' ? 0.5 : 0.0),
        trackingConfidence: s.visibility === 'visible' ? 1.0 : 0.0,
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
      shotId: 'shot_heldout',
      cameraMotion: {
        model: frameState.camera.model || 'translation',
        translation: frameState.camera.translation,
        scale: 1.0,
        rotation: 0.0,
        confidence: 1.0,
        valid: true
      },
      observations
    });
  }

  ffmpeg.stdin.end();
  await new Promise((resolve, reject) => {
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });

  const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(mp4Path)).digest('hex');

  const gtDoc = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    evaluationType: "held_out_unseen_motion",
    testId,
    name: config.name,
    description: config.description,
    source: {
      videoPath: mp4Path,
      sha256: sourceSha256,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      totalFrames: TOTAL_FRAMES,
      timebase: {
        ticksPerSecond: 120000,
        durationTicks: secondsToTicks(TOTAL_FRAMES / FPS)
      }
    },
    provenance: {
      generator: "generate_held_out.js",
      frozenThresholds: {
        forwardBackwardMaxError: 2.5,
        areaRatioMin: 0.5,
        areaRatioMax: 2.0,
        kalmanMaxDivergencePx: 30.0,
        appearanceMinScore: 0.65
      }
    },
    entities: config.entities,
    frames: framesData
  };

  fs.writeFileSync(gtPath, JSON.stringify(gtDoc, null, 2), 'utf8');
  console.log(`   Saved video: ${mp4Path} (${sourceSha256.slice(0, 12)}...)`);
  console.log(`   Saved ground truth: ${gtPath}`);
}

async function main() {
  console.log("================================================================");
  console.log("  GENERATING VTSM-03 HELD-OUT UNSEEN-MOTION CHALLENGE SUITE");
  console.log("================================================================");

  // -------------------------------------------------------------
  // TEST B: Disappearance & Reappearance
  // -------------------------------------------------------------
  await renderTestClip('test_b_reappearance', {
    name: 'Disappearance and Reappearance (Held-Out Test B)',
    description: 'Subject completely hidden behind a 400px wide pillar for 30 consecutive frames, then re-emerges with 20% scale change and altered trajectory.',
    entities: [
      { entityId: 'ent_heldout_b', label: 'runner', shotId: 'shot_heldout', policyAcrossCuts: 'reset_on_cut' }
    ],
    evaluate: (f, pts) => {
      // Camera panning gently: +4 px/frame
      const camDx = f * 4.0;

      // Subject world position
      let subWorldX;
      let subWorldY = 480;
      let subW = 140;
      let subH = 180;
      let visibility = 'visible';
      let rendered = true;

      // Pillar at world position 700..1100 (400px wide)
      const pillarWorldX = 700;
      const pillarW = 400;

      if (f <= 28) {
        // Approaching pillar
        subWorldX = 200 + f * 16.0; // reaches 648 at f=28
      } else if (f >= 29 && f <= 58) {
        // Inside/behind pillar: 100% full occlusion
        subWorldX = 200 + f * 16.0;
        visibility = 'occluded';
        rendered = false; // Behind solid obstacle
      } else {
        // Re-emerges on right at f=59: scale increased by +20%, altered vertical trajectory
        subW = 168; // +20%
        subH = 216; // +20%
        subWorldX = 1140 + (f - 59) * 18.0;
        subWorldY = 460 - (f - 59) * 2.0; // slight upward angle
        visibility = 'visible';
        rendered = true;
      }

      const screenX = subWorldX - camDx;
      const screenY = subWorldY;
      const pillarScreenX = pillarWorldX - camDx;

      return {
        bgStyle: 'urban_contrast',
        camera: {
          model: 'translation',
          translation: { dx: f > 0 ? 4.0 : 0.0, dy: 0.0 },
          worldOffset: { dx: camDx, dy: 0.0 }
        },
        subjects: [{
          entityId: 'ent_heldout_b',
          screenBbox: { x: screenX, y: screenY, width: subW, height: subH },
          visibility,
          rendered,
          color: [220, 38, 38], // Red jacket
          borderColor: [254, 240, 138],
          motionRaw: { dx: f > 0 ? 12.0 : 0.0, dy: (f >= 59 ? -2.0 : 0.0), valid: f > 0 },
          motionCompensated: { dx: f > 0 ? 16.0 : 0.0, dy: (f >= 59 ? -2.0 : 0.0), valid: f > 0 }
        }],
        occluders: [{
          x: pillarScreenX,
          y: 0,
          width: pillarW,
          height: HEIGHT,
          color: [20, 24, 33],
          borderColor: [51, 65, 85]
        }]
      };
    }
  });

  // -------------------------------------------------------------
  // TEST C: Identity Collision
  // -------------------------------------------------------------
  await renderTestClip('test_c_collision', {
    name: 'Identity Collision (Held-Out Test C)',
    description: 'Two similar human subjects cross paths under camera pan; evaluates Hungarian associator and identity preservation.',
    entities: [
      { entityId: 'ent_c1_blue', label: 'walker_left', shotId: 'shot_heldout', policyAcrossCuts: 'reset_on_cut' },
      { entityId: 'ent_c2_amber', label: 'walker_right', shotId: 'shot_heldout', policyAcrossCuts: 'reset_on_cut' }
    ],
    evaluate: (f, pts) => {
      // Camera panning right +5 px/frame
      const camDx = f * 5.0;

      // Subject 1: moves left to right
      const sub1WorldX = 250 + f * 14.0;
      const sub1WorldY = 480;

      // Subject 2: moves right to left
      const sub2WorldX = 1650 - f * 14.0;
      const sub2WorldY = 485;

      const sub1ScreenX = sub1WorldX - camDx;
      const sub2ScreenX = sub2WorldX - camDx;

      return {
        bgStyle: 'urban_contrast',
        camera: {
          model: 'translation',
          translation: { dx: f > 0 ? 5.0 : 0.0, dy: 0.0 },
          worldOffset: { dx: camDx, dy: 0.0 }
        },
        subjects: [
          {
            entityId: 'ent_c1_blue',
            screenBbox: { x: sub1ScreenX, y: sub1WorldY, width: 130, height: 180 },
            visibility: 'visible',
            rendered: true,
            color: [37, 99, 235], // Blue
            borderColor: [191, 219, 254],
            motionRaw: { dx: f > 0 ? 9.0 : 0.0, dy: 0.0, valid: f > 0 },
            motionCompensated: { dx: f > 0 ? 14.0 : 0.0, dy: 0.0, valid: f > 0 }
          },
          {
            entityId: 'ent_c2_amber',
            screenBbox: { x: sub2ScreenX, y: sub2WorldY, width: 130, height: 180 },
            visibility: 'visible',
            rendered: true,
            color: [217, 119, 6], // Amber
            borderColor: [254, 243, 199],
            motionRaw: { dx: f > 0 ? -19.0 : 0.0, dy: 0.0, valid: f > 0 },
            motionCompensated: { dx: f > 0 ? -14.0 : 0.0, dy: 0.0, valid: f > 0 }
          }
        ]
      };
    }
  });

  // -------------------------------------------------------------
  // TEST A: Pine-Branch Gauntlet
  // -------------------------------------------------------------
  await renderTestClip('test_a_pine_gauntlet', {
    name: 'Pine-Branch Gauntlet (Held-Out Test A)',
    description: 'Handheld camera shake, runner weaving through high-frequency foreground pine branches, dynamic motion blur.',
    entities: [
      { entityId: 'ent_runner', label: 'forest_runner', shotId: 'shot_heldout', policyAcrossCuts: 'reset_on_cut' }
    ],
    evaluate: (f, pts) => {
      // Handheld camera jitter (pseudo-random shake using sinusoidal harmonics)
      const jitterX = Math.sin(f * 1.7) * 7.0 + Math.cos(f * 3.1) * 4.0;
      const jitterY = Math.cos(f * 2.2) * 6.0 + Math.sin(f * 4.3) * 3.5;
      const camDx = f * 8.0 + jitterX;
      const camDy = jitterY;

      // Runner weaving between trees
      const runnerWorldX = 300 + f * 14.0;
      const runnerWeaveY = 460 + Math.sin(f * 0.2) * 50.0;
      const runnerScreenX = runnerWorldX - camDx;
      const runnerScreenY = runnerWeaveY - camDy;

      return {
        bgStyle: 'forest_tech',
        camera: {
          model: 'translation',
          translation: { dx: 8.0 + (f > 0 ? jitterX - Math.sin((f - 1) * 1.7) * 7.0 : 0), dy: jitterY },
          worldOffset: { dx: camDx, dy: camDy }
        },
        subjects: [{
          entityId: 'ent_runner',
          screenBbox: { x: runnerScreenX, y: runnerScreenY, width: 135, height: 185 },
          visibility: 'visible',
          rendered: true,
          color: [234, 88, 12], // Orange runner jacket
          borderColor: [254, 215, 170],
          motionRaw: { dx: 6.0, dy: Math.cos(f * 0.2) * 10.0, valid: f > 0 },
          motionCompensated: { dx: 14.0, dy: Math.cos(f * 0.2) * 10.0, valid: f > 0 }
        }],
        occluders: [
          // Pine branches hanging down from top
          { type: 'pine_foliage', x: 450, y: 0, width: 180, height: 600 },
          { type: 'pine_foliage', x: 950, y: 150, width: 220, height: 650 },
          { type: 'pine_foliage', x: 1400, y: 50, width: 200, height: 580 }
        ]
      };
    }
  });

  console.log("\n================================================================");
  console.log("  HELD-OUT UNSEEN-MOTION CHALLENGE SUITE GENERATION COMPLETE");
  console.log("================================================================\n");
}

main().catch(console.error);
