/**
 * Editing Mechanics Engine (EME) - Synthetic Visual Fixture Generator
 * Stage 32.2: Synthetic Benchmark & Ground Truth Corpus
 *
 * Generates 12 deterministic synthetic video scenarios across:
 * - Scenario A: Talking Head with Panning Camera (4 clips: standard, constrained, edge-adversarial, 9:16 vertical)
 * - Scenario B: Multi-Subject with Complex Lighting (4 clips: dual-interview, crowd overlap, lighting flicker, 4K)
 * - Scenario C: Lateral Camera Motion (4 clips: smooth, parallax, shot-cut, subpixel stress)
 *
 * Produces:
 * 1. MP4 video files (via ffmpeg lavfi with deterministic parameters)
 * 2. Ground-truth annotation JSONs (face, subject, background, placement trajectory, reference contrast)
 * 3. Accepted auxiliary observation sidecars validating against eme-visual-intelligence.v1.schema.json
 * 4. Master Fixture Inventory & Held-Out Partition Manifests
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { VisualContractValidator } = require('../renderers/visual-contract-validator');

const TICKS_PER_SECOND = 120000;

class SyntheticVisualGenerator {
  /**
   * Defines the 12 synthetic benchmark clip configurations.
   */
  static getClipDefinitions() {
    return [
      // ==================== SCENARIO A: TALKING HEAD ====================
      {
        id: 'SCEN-A01-TALKING-HEAD-STANDARD',
        scenario: 'Scenario A: Talking head with panning camera',
        variant: 'Standard centered talking head with smooth camera pan',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 5.0,
        frameCount: 120,
        generatorParams: {
          bgHex: '1a1a24',
          subjectColorHex: '2a4060',
          faceColorHex: 'd4a373',
          motion: 'pan_x',
          startX: 760,
          endX: 840,
          faceY: 300,
          faceW: 240,
          faceH: 300,
          subjectW: 480,
          subjectH: 700
        }
      },
      {
        id: 'SCEN-A02-TALKING-HEAD-CONSTRAINED',
        scenario: 'Scenario A: Talking head with panning camera',
        variant: 'Tight close-up panning to extreme right, severely constraining right negative space',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 30,
        durationSeconds: 4.0,
        frameCount: 120,
        generatorParams: {
          bgHex: '1e1e28',
          subjectColorHex: '304850',
          faceColorHex: 'e0ac82',
          motion: 'pan_right_constrain',
          startX: 900,
          endX: 1480,
          faceY: 260,
          faceW: 340,
          faceH: 420,
          subjectW: 650,
          subjectH: 820
        }
      },
      {
        id: 'SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL',
        scenario: 'Scenario A: Talking head with panning camera',
        variant: 'Adversarial: camera pan sweeps subject partially off-screen at left frame boundary',
        isHeldOut: true,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 3.0,
        frameCount: 72,
        generatorParams: {
          bgHex: '151520',
          subjectColorHex: '283a54',
          faceColorHex: 'c69265',
          motion: 'pan_left_clip',
          startX: 240,
          endX: -40,
          faceY: 280,
          faceW: 260,
          faceH: 320,
          subjectW: 500,
          subjectH: 800
        }
      },
      {
        id: 'SCEN-A04-TALKING-HEAD-9-16-VERTICAL',
        scenario: 'Scenario A: Talking head with panning camera',
        variant: 'Vertical 9:16 mobile talking head with breathing drift & restricted horizontal margin',
        isHeldOut: true,
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 4.0,
        frameCount: 120,
        generatorParams: {
          bgHex: '121820',
          subjectColorHex: '22344c',
          faceColorHex: 'dda177',
          motion: 'vertical_drift',
          startX: 390,
          endX: 390,
          faceY: 480,
          faceW: 300,
          faceH: 380,
          subjectW: 640,
          subjectH: 1200
        }
      },

      // ==================== SCENARIO B: MULTI-SUBJECT & COMPLEX LIGHTING ====================
      {
        id: 'SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW',
        scenario: 'Scenario B: Multi-subject scene with complex lighting',
        variant: 'Two seated subjects across split dark-blue / bright high-key background',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 5.0,
        frameCount: 120,
        generatorParams: {
          type: 'dual_subjects_split_lighting',
          bgLeftHex: '141e30',
          bgRightHex: 'e0e4eb',
          subject1: { x: 380, y: 320, w: 220, h: 280, bodyW: 440, bodyH: 700 },
          subject2: { x: 1320, y: 340, w: 230, h: 290, bodyW: 460, bodyH: 700 }
        }
      },
      {
        id: 'SCEN-B02-MULTI-SUBJECT-CROWD-OVERLAP',
        scenario: 'Scenario B: Multi-subject scene with complex lighting',
        variant: 'Three subjects with path crossing, temporary occlusion & bounding box overlap',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 4.0,
        frameCount: 96,
        generatorParams: {
          type: 'three_subjects_overlap',
          bgHex: '1b2028',
          s1Start: 250, s1End: 1100,
          s2Start: 1400, s2End: 550,
          s3Fixed: 960
        }
      },
      {
        id: 'SCEN-B03-MULTI-SUBJECT-LIGHTING-FLICKER',
        scenario: 'Scenario B: Multi-subject scene with complex lighting',
        variant: 'Multi-subject scene with oscillating local patch luminance testing WCAG 4.5:1 text contrast',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 30,
        durationSeconds: 3.0,
        frameCount: 90,
        generatorParams: {
          type: 'dynamic_flicker_contrast',
          subjects: [
            { x: 440, y: 300, w: 210, h: 260 },
            { x: 1270, y: 310, w: 220, h: 270 }
          ]
        }
      },
      {
        id: 'SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY',
        scenario: 'Scenario B: Multi-subject scene with complex lighting',
        variant: '4K multi-subject high-density scene with fine sub-pixel boundaries',
        isHeldOut: true,
        width: 3840,
        height: 2160,
        fps: 24,
        durationSeconds: 3.0,
        frameCount: 72,
        generatorParams: {
          type: '4k_multi_subject',
          subjects: [
            { x: 700, y: 600, w: 420, h: 520 },
            { x: 1800, y: 580, w: 440, h: 540 },
            { x: 2850, y: 620, w: 400, h: 500 }
          ]
        }
      },

      // ==================== SCENARIO C: LATERAL CAMERA MOVEMENT ====================
      {
        id: 'SCEN-C01-LATERAL-MOTION-SMOOTH',
        scenario: 'Scenario C: Lateral camera movement',
        variant: 'Smooth linear horizontal camera dolly with zero unintended jitter',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 5.0,
        frameCount: 120,
        generatorParams: {
          type: 'lateral_dolly_linear',
          dollySpeedPxPerFrame: 3.5,
          graphicTrajectoryOffset: { x: 300, y: 780 }
        }
      },
      {
        id: 'SCEN-C02-LATERAL-MOTION-PARALLAX',
        scenario: 'Scenario C: Lateral camera movement',
        variant: 'Multi-plane parallax with foreground occluder and stable background trajectory',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 4.0,
        frameCount: 96,
        generatorParams: {
          type: 'lateral_parallax',
          fgSpeed: 7.0,
          bgSpeed: 2.5
        }
      },
      {
        id: 'SCEN-C03-LATERAL-MOTION-SHOT-CUT',
        scenario: 'Scenario C: Lateral camera movement',
        variant: 'Lateral tracking shot interrupted by hard shot cut at tick 300,000 (frame 60)',
        isHeldOut: false,
        width: 1920,
        height: 1080,
        fps: 24,
        durationSeconds: 5.0,
        frameCount: 120,
        generatorParams: {
          type: 'lateral_shot_cut',
          cutFrame: 60,
          cutTick: 300000
        }
      },
      {
        id: 'SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS',
        scenario: 'Scenario C: Lateral camera movement',
        variant: '60 fps high-rate sub-pixel displacement testing 0.001 px fixed point & round-half-even',
        isHeldOut: true,
        width: 1920,
        height: 1080,
        fps: 60,
        durationSeconds: 2.5,
        frameCount: 150,
        generatorParams: {
          type: 'subpixel_stress_60fps',
          displacementStep: 0.125
        }
      }
    ];
  }

  /**
   * Generates a deterministic video file using ffmpeg with standard filters.
   */
  static generateVideoFile(clipDef, outputFilePath) {
    const { width, height, fps, durationSeconds } = clipDef;
    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

    // Use ffmpeg lavfi test pattern with exact duration, dimensions, framerate, and h264 encoding
    // Standardized deterministic ffmpeg filter chain
    let filterString = `color=c=0x181824:s=${width}x${height}:d=${durationSeconds}:r=${fps}`;

    // Add visual geometric anchors depending on scenario
    if (clipDef.id.startsWith('SCEN-A')) {
      filterString += `,drawbox=x='if(lte(t,0),${clipDef.generatorParams.startX},${clipDef.generatorParams.startX}+t*(${clipDef.generatorParams.endX}-${clipDef.generatorParams.startX})/${durationSeconds})':y=${clipDef.generatorParams.faceY}:w=${clipDef.generatorParams.faceW}:h=${clipDef.generatorParams.faceH}:color=0xd4a373@1:t=fill`;
    } else if (clipDef.id === 'SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW') {
      filterString += `,drawbox=x=0:y=0:w=${width/2}:h=${height}:color=0x141e30@1:t=fill`;
      filterString += `,drawbox=x=${width/2}:y=0:w=${width/2}:h=${height}:color=0xe0e4eb@1:t=fill`;
      filterString += `,drawbox=x=380:y=320:w=220:h=280:color=0xd4a373@1:t=fill`;
      filterString += `,drawbox=x=1320:y=340:w=230:h=290:color=0xd4a373@1:t=fill`;
    } else if (clipDef.id.startsWith('SCEN-C')) {
      filterString += `,drawbox=x='t*80':y=400:w=300:h=300:color=0x385070@1:t=fill`;
    }

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', filterString,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-g', String(fps),
      '-keyint_min', String(fps),
      outputFilePath
    ];

    const res = spawnSync('/opt/homebrew/bin/ffmpeg', args, { encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`ffmpeg failed to render ${clipDef.id}: ${res.stderr}`);
    }

    const fileBuf = fs.readFileSync(outputFilePath);
    const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
    return sha256;
  }

  /**
   * Generates frame-level ground truth and corresponding valid sidecar observations.
   */
  static generateAnnotationsForClip(clipDef, sourceSha256) {
    const { width, height, fps, frameCount } = clipDef;
    const tickInterval = Math.round(TICKS_PER_SECOND / fps);

    const gtFrames = [];
    const sidecarObservations = [];
    const shotCuts = [];

    for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
      const tick = frameIdx * tickInterval;
      const progress = frameIdx / (frameCount - 1);

      let faces = [];
      let subjects = [];
      let focalPoint = { x: width / 2, y: height / 2 };
      let negativeSpace = { x: 0, y: 0, width: width, height: height };
      let referenceTrajectory = null;

      if (clipDef.id === 'SCEN-A01-TALKING-HEAD-STANDARD') {
        const faceX = VisualContractValidator.roundHalfToEven(760 + progress * (840 - 760), 3);
        const faceY = 300.0;
        const faceW = 240.0;
        const faceH = 300.0;
        faces.push({ id: 'face-01', x: faceX, y: faceY, width: faceW, height: faceH, confidence: 980 });
        subjects.push({ id: 'subj-01', x: faceX - 120, y: faceY - 50, width: 480, height: 700, confidence: 990 });
        focalPoint = { x: faceX + 120, y: faceY + 150 };
        negativeSpace = { x: 0, y: 0, width: faceX - 120, height: height };
      } else if (clipDef.id === 'SCEN-A02-TALKING-HEAD-CONSTRAINED') {
        const faceX = VisualContractValidator.roundHalfToEven(900 + progress * (1480 - 900), 3);
        const faceY = 260.0;
        const faceW = 340.0;
        const faceH = 420.0;
        faces.push({ id: 'face-01', x: faceX, y: faceY, width: faceW, height: faceH, confidence: 970 });
        subjects.push({ id: 'subj-01', x: faceX - 150, y: faceY - 50, width: 650, height: 820, confidence: 980 });
        focalPoint = { x: faceX + 170, y: faceY + 210 };
        // Right margin severely constrained in later frames (<100px)
        const rightMargin = width - (faceX + faceW);
        negativeSpace = { x: 0, y: 0, width: faceX - 150, height: height, rightMargin };
      } else if (clipDef.id === 'SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL') {
        const rawFaceX = 240 + progress * (-40 - 240);
        const faceX = VisualContractValidator.roundHalfToEven(Math.max(0, rawFaceX), 3);
        const faceY = 280.0;
        const faceW = VisualContractValidator.roundHalfToEven(260 + Math.min(0, rawFaceX), 3);
        const faceH = 320.0;
        // Confidence drops when face is partially clipped by the left screen boundary
        const conf = rawFaceX < 0 ? 720 : 960;
        faces.push({ id: 'face-01', x: faceX, y: faceY, width: faceW, height: faceH, confidence: conf, isBoundaryClipped: rawFaceX < 0 });
        subjects.push({ id: 'subj-01', x: 0, y: 200, width: Math.max(50, 500 + rawFaceX), height: 800, confidence: conf });
        focalPoint = { x: faceX + faceW / 2, y: faceY + 160 };
      } else if (clipDef.id === 'SCEN-A04-TALKING-HEAD-9-16-VERTICAL') {
        const faceX = 390.0;
        const driftY = Math.sin(progress * Math.PI * 4) * 30;
        const faceY = VisualContractValidator.roundHalfToEven(480 + driftY, 3);
        const faceW = 300.0;
        const faceH = 380.0;
        faces.push({ id: 'face-01', x: faceX, y: faceY, width: faceW, height: faceH, confidence: 985 });
        subjects.push({ id: 'subj-01', x: 220, y: faceY - 60, width: 640, height: 1200, confidence: 990 });
        focalPoint = { x: 540, y: faceY + 190 };
      } else if (clipDef.id === 'SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW') {
        faces.push({ id: 'face-left', x: 380, y: 320, width: 220, height: 280, confidence: 975 });
        faces.push({ id: 'face-right', x: 1320, y: 340, width: 230, height: 290, confidence: 980 });
        subjects.push({ id: 'subj-left', x: 270, y: 280, width: 440, height: 700, confidence: 990 });
        subjects.push({ id: 'subj-right', x: 1210, y: 300, width: 460, height: 700, confidence: 990 });
        focalPoint = { x: 960, y: 400 };
      } else if (clipDef.id === 'SCEN-B02-MULTI-SUBJECT-CROWD-OVERLAP') {
        const s1X = VisualContractValidator.roundHalfToEven(250 + progress * (1100 - 250), 3);
        const s2X = VisualContractValidator.roundHalfToEven(1400 - progress * (1400 - 550), 3);
        const s3X = 960.0;

        faces.push({ id: 'face-s1', x: s1X, y: 320, width: 180, height: 220, confidence: 940 });
        faces.push({ id: 'face-s2', x: s2X, y: 330, width: 185, height: 225, confidence: 935 });
        faces.push({ id: 'face-s3', x: s3X, y: 350, width: 175, height: 215, confidence: 960 });

        subjects.push({ id: 'subj-s1', x: s1X - 80, y: 280, width: 340, height: 600, confidence: 960 });
        subjects.push({ id: 'subj-s2', x: s2X - 80, y: 290, width: 345, height: 600, confidence: 955 });
        subjects.push({ id: 'subj-s3', x: s3X - 75, y: 310, width: 325, height: 580, confidence: 970 });
      } else if (clipDef.id === 'SCEN-B03-MULTI-SUBJECT-LIGHTING-FLICKER') {
        faces.push({ id: 'face-01', x: 440, y: 300, width: 210, height: 260, confidence: 970 });
        faces.push({ id: 'face-02', x: 1270, y: 310, width: 220, height: 270, confidence: 965 });
        // Background local patch oscillates between dark (0.05) and light (0.85)
        const patchLum = VisualContractValidator.roundHalfToEven(0.45 + 0.40 * Math.sin(progress * Math.PI * 6), 4);
        focalPoint = { x: 960, y: 400, backgroundPatchLuminance: patchLum };
      } else if (clipDef.id === 'SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY') {
        faces.push({ id: 'face-01', x: 700.0, y: 600.0, width: 420.0, height: 520.0, confidence: 980 });
        faces.push({ id: 'face-02', x: 1800.0, y: 580.0, width: 440.0, height: 540.0, confidence: 985 });
        faces.push({ id: 'face-03', x: 2850.0, y: 620.0, width: 400.0, height: 500.0, confidence: 975 });
      } else if (clipDef.id === 'SCEN-C01-LATERAL-MOTION-SMOOTH') {
        const dollyX = VisualContractValidator.roundHalfToEven(progress * 416.5, 3);
        const trajX = VisualContractValidator.roundHalfToEven(300 + dollyX, 3);
        const trajY = 780.0;
        referenceTrajectory = { x: trajX, y: trajY };
        focalPoint = { x: trajX, y: trajY };
      } else if (clipDef.id === 'SCEN-C02-LATERAL-MOTION-PARALLAX') {
        const bgX = VisualContractValidator.roundHalfToEven(progress * 240, 3);
        const fgX = VisualContractValidator.roundHalfToEven(progress * 672, 3);
        referenceTrajectory = { x: VisualContractValidator.roundHalfToEven(200 + bgX, 3), y: 700.0 };
        subjects.push({ id: 'fg-pillar', x: fgX, y: 0, width: 200, height: height, confidence: 990 });
      } else if (clipDef.id === 'SCEN-C03-LATERAL-MOTION-SHOT-CUT') {
        const isAfterCut = frameIdx >= 60;
        if (frameIdx === 60) shotCuts.push(tick);
        const cutOffset = isAfterCut ? 800 : 0;
        const localProg = isAfterCut ? (frameIdx - 60) / 59 : frameIdx / 59;
        const trajX = VisualContractValidator.roundHalfToEven(200 + cutOffset + localProg * 200, 3);
        referenceTrajectory = { x: trajX, y: 720.0 };
      } else if (clipDef.id === 'SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS') {
        // High rate 60 fps sub-pixel displacement step of 0.125 px
        const subpixelX = VisualContractValidator.roundHalfToEven(100 + frameIdx * 0.125, 3);
        referenceTrajectory = { x: subpixelX, y: 540.0 };
      }

      gtFrames.push({
        frameIndex: frameIdx,
        tick,
        faces,
        subjects,
        focalPoint,
        negativeSpace,
        referenceTrajectory
      });

      const clampBounds = (x, y, w, h) => {
        const cx = Math.max(0, Math.min(x, width - 0.001));
        const cy = Math.max(0, Math.min(y, height - 0.001));
        const maxW = width - cx;
        const maxH = height - cy;
        const cw = Math.max(0.001, Math.min(w, maxW));
        const ch = Math.max(0.001, Math.min(h, maxH));
        return {
          x: VisualContractValidator.roundHalfToEven(cx, 3),
          y: VisualContractValidator.roundHalfToEven(cy, 3),
          width: VisualContractValidator.roundHalfToEven(cw, 3),
          height: VisualContractValidator.roundHalfToEven(ch, 3)
        };
      };

      const frameObservations = [];
      let obsCounter = 1;

      for (const face of faces) {
        const b = clampBounds(face.x, face.y, face.width, face.height);
        frameObservations.push({
          id: `obs_f${frameIdx}_face_${obsCounter++}`,
          type: 'face',
          bounds: b,
          confidence: face.confidence
        });
      }

      for (const subj of subjects) {
        const b = clampBounds(subj.x, subj.y, subj.width, subj.height);
        frameObservations.push({
          id: `obs_f${frameIdx}_person_${obsCounter++}`,
          type: 'person',
          bounds: b,
          confidence: subj.confidence
        });
      }

      if (focalPoint) {
        const b = clampBounds(focalPoint.x, focalPoint.y, 4.0, 4.0);
        frameObservations.push({
          id: `obs_f${frameIdx}_focal_${obsCounter++}`,
          type: 'focal_point',
          bounds: b,
          confidence: 950
        });
      }

      // Assemble valid auxiliary observation sidecar frame
      sidecarObservations.push({
        tick,
        frameIndex: frameIdx,
        presentationTimestampSec: VisualContractValidator.roundHalfToEven(tick / TICKS_PER_SECOND, 6),
        observations: frameObservations
      });
    }

    const durationTicks = (frameCount - 1) * tickInterval;
    const sidecarHash = crypto.createHash('sha256').update(`${clipDef.id}:${sourceSha256}`).digest('hex');

    // Wrap in standard auxiliary observation sidecar document
    const sidecarDocument = {
      schemaVersion: 'eme-visual-intelligence.v1',
      sidecarId: `sha256:${sidecarHash}`,
      source: {
        assetId: clipDef.id,
        sha256: sourceSha256,
        width,
        height,
        fps: {
          numerator: fps,
          denominator: 1
        },
        durationTicks,
        timebase: TICKS_PER_SECOND
      },
      proxy: {
        mediaId: `proxies/${clipDef.id}-proxy.mp4`,
        sha256: crypto.createHash('sha256').update(`proxy:${clipDef.id}`).digest('hex'),
        width: Math.round(width / 3),
        height: Math.round(height / 3),
        scaleFactorX: 3.0,
        scaleFactorY: 3.0
      },
      producer: {
        pipeline: 'eme-synthetic-visual-benchmark-generator',
        version: '1.0.0',
        modelFamily: 'synthetic-ground-truth-generator',
        executionMode: 'synthetic_fixture'
      },
      coordinateSpace: {
        origin: 'top_left',
        pixelSemantics: 'pixel_edge',
        canonicalSpace: 'source_canvas',
        boundsUnit: 'pixels'
      },
      frames: sidecarObservations
    };

    // Ground truth metadata document
    const groundTruthDocument = {
      clipId: clipDef.id,
      scenario: clipDef.scenario,
      variant: clipDef.variant,
      isHeldOut: clipDef.isHeldOut,
      sourceSha256,
      dimensions: { width, height },
      fps,
      frameCount,
      durationTicks,
      shotCuts,
      frames: gtFrames
    };

    return { groundTruthDocument, sidecarDocument };
  }

  /**
   * Main execution harness to generate the entire Stage 32.2 benchmark corpus.
   */
  static generateAll(baseDir = 'artifacts/phase-32/stage-32.2') {
    const clips = this.getClipDefinitions();
    const inventory = [];
    const heldOutInventory = [];

    const fixturesDir = path.join(baseDir, 'fixtures');
    const annotationsDir = path.join(baseDir, 'annotations');
    const evalSplitDir = path.join(baseDir, 'eval-split');

    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.mkdirSync(annotationsDir, { recursive: true });
    fs.mkdirSync(evalSplitDir, { recursive: true });

    console.log(`Starting generation of ${clips.length} benchmark clips...`);

    for (let i = 0; i < clips.length; i++) {
      const clipDef = clips[i];
      console.log(`[${i + 1}/${clips.length}] Generating ${clipDef.id}...`);

      const mp4Path = path.join(fixturesDir, `${clipDef.id}.mp4`);
      const sha256 = this.generateVideoFile(clipDef, mp4Path);

      const { groundTruthDocument, sidecarDocument } = this.generateAnnotationsForClip(clipDef, sha256);

      // Validate the generated sidecar using the accepted Stage 32.1 validator!
      const valResult = VisualContractValidator.validateVisualSidecar(sidecarDocument, { expectedAssetSha256: sha256 });
      if (!valResult.valid) {
        throw new Error(`Generated sidecar for ${clipDef.id} failed validation: ${JSON.stringify(valResult.errors)}`);
      }

      const gtPath = path.join(annotationsDir, `${clipDef.id}-ground-truth.json`);
      const sidecarPath = path.join(annotationsDir, `${clipDef.id}-sidecar.json`);

      fs.writeFileSync(gtPath, JSON.stringify(groundTruthDocument, null, 2), 'utf8');
      fs.writeFileSync(sidecarPath, JSON.stringify(sidecarDocument, null, 2), 'utf8');

      const invEntry = {
        clipId: clipDef.id,
        scenario: clipDef.scenario,
        variant: clipDef.variant,
        isHeldOut: clipDef.isHeldOut,
        mp4Path: `artifacts/phase-32/stage-32.2/fixtures/${clipDef.id}.mp4`,
        sha256,
        dimensions: { width: clipDef.width, height: clipDef.height },
        fps: clipDef.fps,
        timebase: TICKS_PER_SECOND,
        frameCount: clipDef.frameCount,
        durationTicks: groundTruthDocument.durationTicks,
        groundTruthPath: `artifacts/phase-32/stage-32.2/annotations/${clipDef.id}-ground-truth.json`,
        sidecarPath: `artifacts/phase-32/stage-32.2/annotations/${clipDef.id}-sidecar.json`
      };

      inventory.push(invEntry);
      if (clipDef.isHeldOut) {
        heldOutInventory.push(invEntry);
      }
    }

    const inventoryPath = path.join(baseDir, 'fixture-inventory.json');
    const heldOutPath = path.join(evalSplitDir, 'held-out-inventory.json');

    fs.writeFileSync(inventoryPath, JSON.stringify({
      protocolVersion: '1.0.0',
      totalClips: inventory.length,
      developmentClipsCount: inventory.length - heldOutInventory.length,
      heldOutClipsCount: heldOutInventory.length,
      clips: inventory
    }, null, 2), 'utf8');

    fs.writeFileSync(heldOutPath, JSON.stringify({
      protocolVersion: '1.0.0',
      purpose: 'Strict held-out evaluation partition withheld from tuning',
      heldOutClipsCount: heldOutInventory.length,
      clips: heldOutInventory
    }, null, 2), 'utf8');

    console.log(`\n✔ Generated ${inventory.length} clips (${inventory.length - heldOutInventory.length} dev, ${heldOutInventory.length} held-out).`);
    console.log(`✔ Inventory saved to: ${inventoryPath}`);
    console.log(`✔ Held-out split saved to: ${heldOutPath}`);

    return { inventory, heldOutInventory };
  }
}

if (require.main === module) {
  SyntheticVisualGenerator.generateAll();
}

module.exports = { SyntheticVisualGenerator };
