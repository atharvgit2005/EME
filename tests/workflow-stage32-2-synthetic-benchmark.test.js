/**
 * Editing Mechanics Engine (EME) - Stage 32.2 Metric Validation Suite
 * Milestone: Phase 32 — Visual Intelligence & Frame-Aware Composition
 * Stage: Stage 32.2 — Synthetic Benchmark and Ground Truth
 *
 * Automated verification of:
 * 1. Benchmark corpus inventory and held-out partition split (12 clips: 8 dev / 4 held-out)
 * 2. Ground-truth integrity and Draft 2020-12 auxiliary sidecar schema compliance
 * 3. GATE-01: Face Collision Rate metric (zero positive-area overlap enforcement)
 * 4. GATE-02A/B: Face Observation Coverage / Recall (overall >= 95%, per-scenario >= 90%)
 * 5. GATE-03: Text Relative Contrast Ratio metric (WCAG 2.1 >= 4.5:1 ratio enforcement)
 * 6. GATE-04: Temporal Placement Jitter metric (< 2.0 px RMS deviation at 1080p, shot-cut exclusion)
 * 7. GATE-05: Deterministic Computation & Invariance (100% bit-identical results)
 * 8. Invalid Input Handling & Fail-Closed Edge Enforcement
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { VisualContractValidator } = require('../src/renderers/visual-contract-validator');
const { VisualBenchmarkEvaluator } = require('../src/benchmarks/visual-benchmark-evaluator');
const { SyntheticVisualGenerator } = require('../src/benchmarks/synthetic-visual-generator');

const STAGE_DIR = path.resolve(__dirname, '../artifacts/phase-32/stage-32.2');
const INVENTORY_PATH = path.join(STAGE_DIR, 'fixture-inventory.json');
const HELD_OUT_PATH = path.join(STAGE_DIR, 'eval-split/held-out-inventory.json');
const SCORING_SPEC_PATH = path.join(STAGE_DIR, 'scoring-specification.json');
const ANNOTATION_PROTOCOL_PATH = path.join(STAGE_DIR, 'annotation-protocol.json');

test('Stage 32.2: Synthetic Benchmark & Ground Truth Metric Suite', async (t) => {
  let inventoryData;
  let heldOutData;
  let scoringSpec;
  let annotationProtocol;

  // =========================================================================
  // Section 1: Corpus Manifest, Inventory & Split Verification
  // =========================================================================
  await t.test('Section 1: Corpus Manifest, Inventory & Split Verification', async (s1) => {
    await s1.test('BM-01: Fixture inventory manifest exists and parses with 12 clips', () => {
      assert.ok(fs.existsSync(INVENTORY_PATH), 'fixture-inventory.json must exist');
      inventoryData = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));

      assert.equal(inventoryData.totalClips, 12, 'Must contain exactly 12 benchmark clips');
      assert.equal(inventoryData.developmentClipsCount, 8, 'Must have 8 development clips');
      assert.equal(inventoryData.heldOutClipsCount, 4, 'Must have 4 held-out clips');
      assert.equal(inventoryData.clips.length, 12, 'Clips array length must be 12');
    });

    await s1.test('BM-02: Held-out inventory strictly reflects 4 withheld evaluation clips', () => {
      assert.ok(fs.existsSync(HELD_OUT_PATH), 'held-out-inventory.json must exist');
      heldOutData = JSON.parse(fs.readFileSync(HELD_OUT_PATH, 'utf8'));

      assert.equal(heldOutData.heldOutClipsCount, 4);
      assert.equal(heldOutData.clips.length, 4);

      const heldOutIds = new Set(heldOutData.clips.map(c => c.clipId));
      assert.ok(heldOutIds.has('SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL'), 'Held-out must include Scenario A edge clip');
      assert.ok(heldOutIds.has('SCEN-A04-TALKING-HEAD-9-16-VERTICAL'), 'Held-out must include Scenario A vertical clip');
      assert.ok(heldOutIds.has('SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY'), 'Held-out must include Scenario B 4K clip');
      assert.ok(heldOutIds.has('SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS'), 'Held-out must include Scenario C 60fps subpixel clip');
    });

    await s1.test('BM-03: All 12 MP4 fixture files exist and match registered SHA-256 fingerprints', () => {
      for (const clip of inventoryData.clips) {
        const fullMp4Path = path.resolve(__dirname, '..', clip.mp4Path);
        assert.ok(fs.existsSync(fullMp4Path), `MP4 file must exist: ${clip.mp4Path}`);

        const fileBytes = fs.readFileSync(fullMp4Path);
        const actualSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
        assert.equal(actualSha, clip.sha256, `SHA-256 fingerprint mismatch for ${clip.clipId}`);
        assert.ok(fileBytes.length > 5000, `Video file must be non-trivial size: ${clip.clipId}`);
      }
    });

    await s1.test('BM-04: Ground-truth annotation files and sidecar files exist for all 12 clips', () => {
      for (const clip of inventoryData.clips) {
        const gtPath = path.resolve(__dirname, '..', clip.groundTruthPath);
        const sidecarPath = path.resolve(__dirname, '..', clip.sidecarPath);

        assert.ok(fs.existsSync(gtPath), `Ground truth file must exist: ${clip.groundTruthPath}`);
        assert.ok(fs.existsSync(sidecarPath), `Sidecar file must exist: ${clip.sidecarPath}`);
      }
    });
  });

  // =========================================================================
  // Section 2: Ground-Truth Integrity & Contract Validation (GATE-06)
  // =========================================================================
  await t.test('Section 2: Ground-Truth Integrity & Contract Validation (GATE-06)', async (s2) => {
    await s2.test('BM-05: All 12 sidecar files strictly validate against eme-visual-intelligence.v1 schema', () => {
      for (const clip of inventoryData.clips) {
        const sidecarPath = path.resolve(__dirname, '..', clip.sidecarPath);
        const sidecarJson = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));

        const valResult = VisualContractValidator.validateVisualSidecar(sidecarJson, {
          expectedAssetSha256: clip.sha256
        });

        assert.ok(valResult.valid, `Sidecar for ${clip.clipId} must pass validation: ${JSON.stringify(valResult.errors)}`);
        assert.equal(valResult.errors.length, 0);
      }
    });

    await s2.test('BM-06: Timebase and integer confidence rules strictly verified across all sidecars', () => {
      for (const clip of inventoryData.clips) {
        const sidecarPath = path.resolve(__dirname, '..', clip.sidecarPath);
        const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));

        assert.equal(sidecar.source.timebase, 120000, `Timebase must be 120,000 for ${clip.clipId}`);

        let prevTick = -1;
        for (const frame of sidecar.frames) {
          assert.ok(frame.tick > prevTick, `Frame ticks must be strictly monotonic in ${clip.clipId}`);
          prevTick = frame.tick;

          for (const obs of frame.observations) {
            assert.ok(Number.isInteger(obs.confidence), `Confidence must be integer in ${clip.clipId}`);
            assert.ok(obs.confidence >= 0 && obs.confidence <= 1000, `Confidence out of [0, 1000] in ${clip.clipId}`);
            assert.ok(obs.bounds.width > 0, `Width must be > 0 in ${clip.clipId}`);
            assert.ok(obs.bounds.height > 0, `Height must be > 0 in ${clip.clipId}`);
            assert.ok(obs.bounds.x >= 0, `x must be >= 0 in ${clip.clipId}`);
            assert.ok(obs.bounds.y >= 0, `y must be >= 0 in ${clip.clipId}`);
            assert.ok(obs.bounds.x + obs.bounds.width <= clip.dimensions.width, `x + width must be <= canvas width in ${clip.clipId}`);
            assert.ok(obs.bounds.y + obs.bounds.height <= clip.dimensions.height, `y + height must be <= canvas height in ${clip.clipId}`);
          }
        }
      }
    });
  });

  // =========================================================================
  // Section 3: Face Collision Rate Calculation (GATE-01)
  // =========================================================================
  await t.test('Section 3: Face Collision Rate Calculation (GATE-01)', async (s3) => {
    await s3.test('BM-07: Detects collision when graphic overlaps face rectangle', () => {
      const graphic = { x: 700, y: 250, width: 300, height: 100 };
      const faces = [{ x: 780, y: 200, width: 200, height: 200 }]; // overlaps x: 780..980 (w=200), y: 250..350 (h=100)

      const result = VisualBenchmarkEvaluator.calculateFaceCollision(graphic, faces);
      assert.equal(result.hasCollision, true);
      assert.ok(result.overlapArea > 0);
      assert.equal(result.collidedFacesCount, 1);
      assert.equal(result.faceCollisions[0].overlapArea, 20000); // 200 * 100 = 20000
    });

    await s3.test('BM-08: Confirms zero collision when graphic is in negative space', () => {
      const graphic = { x: 50, y: 800, width: 400, height: 120 };
      const faces = [{ x: 780, y: 200, width: 200, height: 200 }]; // non-overlapping

      const result = VisualBenchmarkEvaluator.calculateFaceCollision(graphic, faces);
      assert.equal(result.hasCollision, false);
      assert.equal(result.overlapArea, 0);
      assert.equal(result.collidedFacesCount, 0);
    });

    await s3.test('BM-09: Pixel-edge touching boundary has zero positive overlap area', () => {
      // Touching edges: graphic right edge = 780, face left edge = 780
      const graphic = { x: 580, y: 200, width: 200, height: 200 };
      const faces = [{ x: 780, y: 200, width: 200, height: 200 }];

      const result = VisualBenchmarkEvaluator.calculateFaceCollision(graphic, faces);
      assert.equal(result.hasCollision, false);
      assert.equal(result.overlapArea, 0);
    });

    await s3.test('BM-10: Multi-subject collision handles multiple overlapping faces correctly', () => {
      const graphic = { x: 300, y: 300, width: 1200, height: 200 };
      const faces = [
        { x: 380, y: 320, width: 100, height: 100 },
        { x: 1300, y: 330, width: 100, height: 100 }
      ];

      const result = VisualBenchmarkEvaluator.calculateFaceCollision(graphic, faces);
      assert.equal(result.hasCollision, true);
      assert.equal(result.collidedFacesCount, 2);
      assert.ok(result.overlapArea > 0);
    });
  });

  // =========================================================================
  // Section 4: Observation Coverage & Recall (GATE-02A & GATE-02B)
  // =========================================================================
  await t.test('Section 4: Observation Coverage & Recall (GATE-02A & GATE-02B)', async (s4) => {
    await s4.test('BM-11: IoU calculation strictly computes bounding box intersection over union', () => {
      const boxA = { x: 100, y: 100, width: 100, height: 100 }; // area = 10000
      const boxB = { x: 150, y: 100, width: 100, height: 100 }; // area = 10000, overlap = 50x100 = 5000

      const iou = VisualBenchmarkEvaluator.calculateIoU(boxA, boxB);
      // Union = 10000 + 10000 - 5000 = 15000 => IoU = 5000 / 15000 = 0.3333333333333333
      assert.ok(Math.abs(iou - 1 / 3) < 1e-6);
    });

    await s4.test('BM-12: Complete 100% face recall when all ground-truth faces matched', () => {
      const clip = inventoryData.clips[0]; // SCEN-A01
      const sidecar = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', clip.sidecarPath), 'utf8'));
      const gt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', clip.groundTruthPath), 'utf8'));

      // Extract detected faces from sidecar
      const detectedFrames = sidecar.frames.map(f => ({
        tick: f.tick,
        faces: f.observations.filter(o => o.type === 'face').map(o => o.bounds)
      }));

      // Extract ground-truth faces
      const gtFrames = gt.frames.map(f => ({
        tick: f.tick,
        faces: f.faces
      }));

      const coverage = VisualBenchmarkEvaluator.calculateFaceObservationCoverage(detectedFrames, gtFrames, 0.5);
      assert.equal(coverage.recall, 1.0, 'Synthetic ground-truth sidecar must achieve 1.0 recall against self');
      assert.equal(coverage.falseNegatives, 0);
      assert.ok(coverage.recall >= 0.95, 'Meets GATE-02A overall threshold');
      assert.ok(coverage.recall >= 0.90, 'Meets GATE-02B per-scenario threshold');
    });

    await s4.test('BM-13: Accurately counts False Negatives when face detection is omitted', () => {
      const gtFrames = [
        { tick: 0, faces: [{ x: 100, y: 100, width: 100, height: 100 }, { x: 500, y: 100, width: 100, height: 100 }] },
        { tick: 5000, faces: [{ x: 100, y: 100, width: 100, height: 100 }] }
      ];
      // Detected only has 1 face at tick 0 and 1 at tick 5000 (1 missed at tick 0)
      const detectedFrames = [
        { tick: 0, faces: [{ x: 100, y: 100, width: 100, height: 100 }] },
        { tick: 5000, faces: [{ x: 100, y: 100, width: 100, height: 100 }] }
      ];

      const cov = VisualBenchmarkEvaluator.calculateFaceObservationCoverage(detectedFrames, gtFrames, 0.5);
      assert.equal(cov.totalGroundTruthFaces, 3);
      assert.equal(cov.truePositives, 2);
      assert.equal(cov.falseNegatives, 1);
      assert.equal(cov.falsePositives, 0);
      assert.equal(cov.recall, VisualContractValidator.roundHalfToEven(2 / 3, 4));
    });
  });

  // =========================================================================
  // Section 5: Text Relative Contrast Ratio (GATE-03)
  // =========================================================================
  await t.test('Section 5: Text Relative Contrast Ratio (GATE-03)', async (s5) => {
    await s5.test('BM-14: Pure white text on pure black background yields maximum 21.0 contrast', () => {
      const white = { r: 255, g: 255, b: 255 };
      const black = { r: 0, g: 0, b: 0 };

      const res = VisualBenchmarkEvaluator.evaluateTextContrast(white, black);
      assert.equal(res.textLuminance, 1.0);
      assert.equal(res.backgroundMeanLuminance, 0.0);
      assert.equal(res.worstCaseContrastRatio, 21.0);
      assert.equal(res.meetsWCAG_AA, true);
    });

    await s5.test('BM-15: White text on light grey background (<4.5:1) fails WCAG AA threshold', () => {
      const white = { r: 255, g: 255, b: 255 };
      const lightGrey = { r: 200, g: 200, b: 200 }; // Lum approx 0.578 => Contrast approx 1.67:1

      const res = VisualBenchmarkEvaluator.evaluateTextContrast(white, lightGrey);
      assert.ok(res.worstCaseContrastRatio < 4.5, `Contrast ${res.worstCaseContrastRatio} must be < 4.5`);
      assert.equal(res.meetsWCAG_AA, false);
    });

    await s5.test('BM-16: Evaluates multi-sample regional background taking worst-case local contrast', () => {
      const white = { r: 255, g: 255, b: 255 };
      // Background has 4 dark patches and 1 bright hotspot patch
      const bgSamples = [
        { r: 20, g: 20, b: 20 },
        { r: 20, g: 20, b: 20 },
        { r: 25, g: 25, b: 25 },
        { r: 25, g: 25, b: 25 },
        { r: 240, g: 240, b: 240 } // bright hotspot (contrast ~1.15:1)
      ];

      const res = VisualBenchmarkEvaluator.evaluateTextContrast(white, bgSamples);
      assert.ok(res.meanContrastRatio >= 4.5, `Mean contrast ${res.meanContrastRatio} should pass >= 4.5`);
      assert.ok(res.worstCaseContrastRatio < 4.5, `Worst case local hotspot ${res.worstCaseContrastRatio} must fail < 4.5`);
      assert.equal(res.meetsWCAG_AA, false, 'Overall regional check must fail on worst-case hotspot');
    });

    await s5.test('BM-17: Black text on bright yellow/white background satisfies >= 4.5:1', () => {
      const black = { r: 0, g: 0, b: 0 };
      const yellow = { r: 255, g: 220, b: 0 };

      const res = VisualBenchmarkEvaluator.evaluateTextContrast(black, yellow);
      assert.ok(res.worstCaseContrastRatio >= 4.5);
      assert.equal(res.meetsWCAG_AA, true);
    });
  });

  // =========================================================================
  // Section 6: Temporal Placement Jitter (GATE-04)
  // =========================================================================
  await t.test('Section 6: Temporal Placement Jitter (GATE-04)', async (s6) => {
    await s6.test('BM-18: Constant-velocity linear trajectory yields exactly 0.000 px jitter', () => {
      // 10 frames moving rightward by exactly 4 px per frame
      const traj = [];
      for (let f = 0; f < 10; f++) {
        traj.push({ tick: f * 5000, x: 200 + f * 4.0, y: 500.0 });
      }

      const res = VisualBenchmarkEvaluator.calculateTemporalJitter(traj);
      assert.equal(res.status, 'DIAGNOSTIC_COMPUTED');
      assert.equal(res.rmsJitterPixels, 0.0);
      assert.equal(res.maxJitterPixels, 0.0);
      assert.equal(res.passesGate, true);
    });

    await s6.test('BM-19: Unintended high-frequency oscillation triggers jitter gate violation (> 2.0 px)', () => {
      // Linear trajectory with high-frequency +/- 3px alternating noise
      const noisyTraj = [];
      for (let f = 0; f < 15; f++) {
        const noise = (f % 2 === 0) ? 3.0 : -3.0;
        noisyTraj.push({ tick: f * 5000, x: 200 + f * 4.0 + noise, y: 500.0 + noise });
      }

      const res = VisualBenchmarkEvaluator.calculateTemporalJitter(noisyTraj);
      assert.ok(res.rmsJitterPixels > 2.0, `RMS jitter ${res.rmsJitterPixels} should exceed 2.0 px`);
      assert.equal(res.passesGate, false, 'Must fail GATE-04 jitter gate');
    });

    await s6.test('BM-20: Shot cut boundary correctly excluded from second-difference calculation', () => {
      // Trajectory jumps by 800px at tick 300,000 (frame 6) due to an intentional camera cut
      const cutTraj = [];
      for (let f = 0; f < 12; f++) {
        const offset = f >= 6 ? 800 : 0;
        cutTraj.push({ tick: f * 50000, x: 100 + offset + f * 2.0, y: 400.0 });
      }

      // Without declaring shotCut, the jump causes enormous false jitter
      const withoutCut = VisualBenchmarkEvaluator.calculateTemporalJitter(cutTraj, { width: 1920, height: 1080 }, []);
      assert.ok(withoutCut.rmsJitterPixels > 50.0, 'Undeclared shot cut causes huge false jitter');

      // With shotCut declared at tick 300,000, transition boundary is excluded
      const withCut = VisualBenchmarkEvaluator.calculateTemporalJitter(cutTraj, { width: 1920, height: 1080 }, [300000]);
      assert.equal(withCut.rmsJitterPixels, 0.0, 'Shot cut exclusion must yield 0.0 jitter for linear segments');
      assert.equal(withCut.passesGate, true);
    });

    await s6.test('BM-21: Resolution normalization scales 4K jitter to canonical 1080p reference', () => {
      // 4K trajectory (3840x2160) with 1px deviation at center point (1010 + 1 = 1011)
      // d2x = 1020 - 2(1011) + 1000 = -2.0 px in 4K => scaled by 0.5 = 1.0 px in 1080p
      const traj4k = [
        { tick: 0, x: 1000, y: 1000 },
        { tick: 5000, x: 1010 + 1.0, y: 1000 },
        { tick: 10000, x: 1020, y: 1000 }
      ];

      const res = VisualBenchmarkEvaluator.calculateTemporalJitter(
        traj4k,
        { width: 3840, height: 2160 },
        [],
        { width: 1920, height: 1080 }
      );

      assert.ok(Math.abs(res.rmsJitterPixels - 1.0) < 0.01, `Expected 1.0 px RMS jitter, got ${res.rmsJitterPixels}`);
      assert.equal(res.passesGate, true);
    });

    await s6.test('BM-21b: Primary GATE-04 intended-trajectory deviation correctly evaluates max e_t < 2.0 px', () => {
      const intended = [
        { tick: 0, x: 200, y: 500 },
        { tick: 5000, x: 220, y: 500 },
        { tick: 10000, x: 240, y: 500 },
        { tick: 15000, x: 260, y: 500 }
      ];
      // Observed follows intended with tiny sub-pixel deviation (0.5 px)
      const observed = [
        { tick: 0, x: 200.5, y: 500 },
        { tick: 5000, x: 220.0, y: 500.5 },
        { tick: 10000, x: 239.5, y: 500 },
        { tick: 15000, x: 260.0, y: 499.5 }
      ];

      const res = VisualBenchmarkEvaluator.calculateIntendedTrajectoryDeviation(observed, intended);
      assert.equal(res.status, 'PASS');
      assert.equal(res.isEvaluable, true);
      assert.equal(res.passesGate, true);
      assert.equal(res.maxDeviationPixels, 0.5);
    });

    await s6.test('BM-21c: Negative test: wrong-but-smooth trajectory passes smoothness diagnostic but FAILS intended-trajectory deviation gate', () => {
      // Intended trajectory
      const intended = [
        { tick: 0, x: 200, y: 500 },
        { tick: 5000, x: 220, y: 500 },
        { tick: 10000, x: 240, y: 500 },
        { tick: 15000, x: 260, y: 500 }
      ];
      // Observed is perfectly straight/smooth, but shifted by 15.0 px on Y axis (wrong placement!)
      const wrongSmooth = [
        { tick: 0, x: 200, y: 515 },
        { tick: 5000, x: 220, y: 515 },
        { tick: 10000, x: 240, y: 515 },
        { tick: 15000, x: 260, y: 515 }
      ];

      // 1. Second-difference smoothness returns 0.000 px (would erroneously pass a smoothness-only check)
      const smoothness = VisualBenchmarkEvaluator.calculateSmoothnessDiagnostic(wrongSmooth);
      assert.equal(smoothness.rmsSmoothnessPixels, 0.0, 'Second-difference is perfectly smooth (0.000 px)');

      // 2. Primary GATE-04 intended-trajectory deviation correctly catches the 15.0 px displacement and FAILS!
      const deviation = VisualBenchmarkEvaluator.calculateIntendedTrajectoryDeviation(wrongSmooth, intended);
      assert.equal(deviation.status, 'FAIL');
      assert.equal(deviation.passesGate, false, 'Must fail GATE-04 because max deviation (15.0 px) >= 2.0 px');
      assert.equal(deviation.maxDeviationPixels, 15.0);
    });
  });

  // =========================================================================
  // Section 7: Deterministic Computation & Invariance (GATE-05)
  // =========================================================================
  await t.test('Section 7: Deterministic Computation & Invariance (GATE-05)', async (s7) => {
    await s7.test('BM-22: VisualBenchmarkEvaluator outputs are 100% bit-identical across runs', () => {
      const sampleGraphic = { x: 400, y: 600, width: 300, height: 100 };
      const sampleFaces = [{ x: 450, y: 550, width: 150, height: 150 }];

      const run1 = VisualBenchmarkEvaluator.calculateFaceCollision(sampleGraphic, sampleFaces);
      const run2 = VisualBenchmarkEvaluator.calculateFaceCollision(sampleGraphic, sampleFaces);

      assert.equal(VisualBenchmarkEvaluator.verifyDeterministicInvariance(run1, run2), true);
      assert.equal(JSON.stringify(run1), JSON.stringify(run2));
    });

    await s7.test('BM-23: Contrast evaluation produces bitwise-identical results across runs', () => {
      const textColor = { r: 255, g: 255, b: 255 };
      const bg = [{ r: 40, g: 50, b: 60 }, { r: 100, g: 120, b: 140 }];

      const c1 = VisualBenchmarkEvaluator.evaluateTextContrast(textColor, bg);
      const c2 = VisualBenchmarkEvaluator.evaluateTextContrast(textColor, bg);

      assert.equal(VisualBenchmarkEvaluator.verifyDeterministicInvariance(c1, c2), true);
    });
  });

  // =========================================================================
  // Section 8: Invalid Inputs & Boundary Enforcement (Finding B Closures)
  // =========================================================================
  await t.test('Section 8: Invalid Inputs & Boundary Enforcement', async (s8) => {
    await s8.test('BM-24: Rejects null/malformed graphic rectangle in collision calculation', () => {
      assert.throws(() => {
        VisualBenchmarkEvaluator.calculateFaceCollision(null, []);
      }, /Invalid graphicRect/);
    });

    await s8.test('BM-25: Rejects non-array faceRects in collision calculation', () => {
      assert.throws(() => {
        VisualBenchmarkEvaluator.calculateFaceCollision({ x: 0, y: 0, width: 100, height: 100 }, 'not-an-array');
      }, /Invalid faceRects/);
    });

    await s8.test('BM-26: Rejects empty background samples in contrast evaluation', () => {
      assert.throws(() => {
        VisualBenchmarkEvaluator.evaluateTextContrast({ r: 255, g: 255, b: 255 }, []);
      }, /at least one sample/);
    });

    await s8.test('BM-27a: Insufficient temporal samples (< 3 points) returns NOT_EVALUABLE and FAILS gate', () => {
      // Empty trajectory
      const res0 = VisualBenchmarkEvaluator.calculateTemporalJitter([]);
      assert.equal(res0.status, 'NOT_EVALUABLE');
      assert.equal(res0.isEvaluable, false);
      assert.equal(res0.passesGate, false, 'Empty trajectory must NOT pass gate');

      // 1-point trajectory
      const res1 = VisualBenchmarkEvaluator.calculateTemporalJitter([{ tick: 0, x: 100, y: 100 }]);
      assert.equal(res1.status, 'NOT_EVALUABLE');
      assert.equal(res1.isEvaluable, false);
      assert.equal(res1.passesGate, false, '1-point trajectory must NOT pass gate');

      // 2-point trajectory
      const res2 = VisualBenchmarkEvaluator.calculateTemporalJitter([
        { tick: 0, x: 100, y: 100 },
        { tick: 5000, x: 110, y: 100 }
      ]);
      assert.equal(res2.status, 'NOT_EVALUABLE');
      assert.equal(res2.isEvaluable, false);
      assert.equal(res2.passesGate, false, '2-point trajectory must NOT pass gate');
      assert.equal(res2.rmsJitterPixels, null);
    });

    await s8.test('BM-27b: Insufficient intended trajectory comparison returns NOT_EVALUABLE and FAILS gate', () => {
      const obs = [{ tick: 0, x: 100, y: 100 }, { tick: 5000, x: 110, y: 100 }, { tick: 10000, x: 120, y: 100 }];
      const intendedShort = [{ tick: 0, x: 100, y: 100 }]; // only 1 point

      const res = VisualBenchmarkEvaluator.calculateIntendedTrajectoryDeviation(obs, intendedShort);
      assert.equal(res.status, 'NOT_EVALUABLE');
      assert.equal(res.isEvaluable, false);
      assert.equal(res.passesGate, false);
    });

    await s8.test('BM-28: Duplicate timestamps trigger INVALID_TIMESTAMPS and fail evaluation', () => {
      const dupTraj = [
        { tick: 0, x: 100, y: 100 },
        { tick: 5000, x: 110, y: 100 },
        { tick: 5000, x: 120, y: 100 } // duplicate tick 5000!
      ];
      const intended = [
        { tick: 0, x: 100, y: 100 },
        { tick: 5000, x: 110, y: 100 },
        { tick: 10000, x: 120, y: 100 }
      ];

      const res = VisualBenchmarkEvaluator.calculateIntendedTrajectoryDeviation(dupTraj, intended);
      assert.equal(res.status, 'INVALID_TIMESTAMPS');
      assert.equal(res.isEvaluable, false);
      assert.equal(res.passesGate, false);
      assert.ok(res.reason.includes('Duplicate'));
    });

    await s8.test('BM-29: Non-monotonic frame timestamps trigger INVALID_TIMESTAMPS and fail evaluation', () => {
      const nonMonoTraj = [
        { tick: 0, x: 100, y: 100 },
        { tick: 10000, x: 120, y: 100 },
        { tick: 5000, x: 110, y: 100 } // tick inverted: 5000 after 10000!
      ];
      const intended = [
        { tick: 0, x: 100, y: 100 },
        { tick: 5000, x: 110, y: 100 },
        { tick: 10000, x: 120, y: 100 }
      ];

      const res = VisualBenchmarkEvaluator.calculateIntendedTrajectoryDeviation(nonMonoTraj, intended);
      assert.equal(res.status, 'INVALID_TIMESTAMPS');
      assert.equal(res.isEvaluable, false);
      assert.equal(res.passesGate, false);
      assert.ok(res.reason.includes('Non-monotonic'));
    });
  });
});
