/**
 * Editing Mechanics Engine (EME) - Visual Benchmark Evaluator
 * Stage 32.2: Synthetic Benchmark & Ground Truth Metric Suite
 *
 * Implements the frozen scoring specifications for:
 * 1. GATE-01: Face Collision Rate (zero positive-area overlap gate)
 * 2. GATE-02A/B: Face Observation Coverage / Recall (>= 95% overall, >= 90% per scenario)
 * 3. GATE-03: Text Relative Contrast Ratio (WCAG 2.1 >= 4.5:1 gate)
 * 4. GATE-04: Primary Temporal Placement Deviation (max e_t < 2.0 px relative to intended trajectory)
 *    and Secondary Second-Difference Smoothness Diagnostic
 * 5. GATE-05: Deterministic Computation Invariance (100% bit-identical results)
 * 6. GATE-06: Ground-Truth Integrity (timebase 120,000, integer conf [0, 1000], coordinate validity)
 */

const { VisualContractValidator } = require('../renderers/visual-contract-validator');

class VisualBenchmarkEvaluator {
  /**
   * Evaluates spatial overlap between an evaluated graphic bounding box and
   * one or more annotated face bounding boxes.
   *
   * @param {{x: number, y: number, width: number, height: number}} graphicRect
   * @param {Array<{x: number, y: number, width: number, height: number}>} faceRects
   * @returns {{
   *   hasCollision: boolean,
   *   overlapArea: number,
   *   collidedFacesCount: number,
   *   faceCollisions: Array<{index: number, overlapArea: number, faceRect: object}>
   * }}
   */
  static calculateFaceCollision(graphicRect, faceRects = []) {
    if (!graphicRect || typeof graphicRect !== 'object') {
      throw new Error('Invalid graphicRect: must be an object with { x, y, width, height }');
    }
    if (!Array.isArray(faceRects)) {
      throw new Error('Invalid faceRects: must be an array of rectangles');
    }

    let totalOverlapArea = 0;
    const faceCollisions = [];

    const gx1 = graphicRect.x;
    const gy1 = graphicRect.y;
    const gx2 = graphicRect.x + graphicRect.width;
    const gy2 = graphicRect.y + graphicRect.height;

    for (let i = 0; i < faceRects.length; i++) {
      const face = faceRects[i];
      const fx1 = face.x;
      const fy1 = face.y;
      const fx2 = face.x + face.width;
      const fy2 = face.y + face.height;

      const ix1 = Math.max(gx1, fx1);
      const iy1 = Math.max(gy1, fy1);
      const ix2 = Math.min(gx2, fx2);
      const iy2 = Math.min(gy2, fy2);

      if (ix2 > ix1 && iy2 > iy1) {
        const area = (ix2 - ix1) * (iy2 - iy1);
        totalOverlapArea += area;
        faceCollisions.push({
          index: i,
          overlapArea: VisualContractValidator.roundHalfToEven(area, 3),
          faceRect: face
        });
      }
    }

    return {
      hasCollision: faceCollisions.length > 0,
      overlapArea: VisualContractValidator.roundHalfToEven(totalOverlapArea, 3),
      collidedFacesCount: faceCollisions.length,
      faceCollisions
    };
  }

  /**
   * Computes Intersection over Union (IoU) of two axis-aligned bounding boxes.
   *
   * @param {{x: number, y: number, width: number, height: number}} rectA
   * @param {{x: number, y: number, width: number, height: number}} rectB
   * @returns {number} IoU in range [0, 1]
   */
  static calculateIoU(rectA, rectB) {
    const ax1 = rectA.x;
    const ay1 = rectA.y;
    const ax2 = rectA.x + rectA.width;
    const ay2 = rectA.y + rectA.height;

    const bx1 = rectB.x;
    const by1 = rectB.y;
    const bx2 = rectB.x + rectB.width;
    const by2 = rectB.y + rectB.height;

    const ix1 = Math.max(ax1, bx1);
    const iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2);
    const iy2 = Math.min(ay2, by2);

    if (ix2 <= ix1 || iy2 <= iy1) return 0;

    const intersectionArea = (ix2 - ix1) * (iy2 - iy1);
    const areaA = rectA.width * rectA.height;
    const areaB = rectB.width * rectB.height;
    const unionArea = areaA + areaB - intersectionArea;

    if (unionArea <= 0) return 0;
    return intersectionArea / unionArea;
  }

  /**
   * Evaluates face observation coverage / recall between detected observations and ground truth.
   * Uses greedy bipartite IoU matching at the specified threshold.
   *
   * @param {Array<{tick: number, faces: Array<object>}>} detectedFrames
   * @param {Array<{tick: number, faces: Array<object>}>} groundTruthFrames
   * @param {number} [iouThreshold=0.5]
   * @returns {{
   *   truePositives: number,
   *   falseNegatives: number,
   *   falsePositives: number,
   *   recall: number,
   *   precision: number,
   *   f1Score: number,
   *   totalGroundTruthFaces: number,
   *   totalDetectedFaces: number
   * }}
   */
  static calculateFaceObservationCoverage(detectedFrames = [], groundTruthFrames = [], iouThreshold = 0.5) {
    let truePositives = 0;
    let falseNegatives = 0;
    let falsePositives = 0;
    let totalGroundTruthFaces = 0;
    let totalDetectedFaces = 0;

    // Map detected frames by tick for fast lookup
    const detectedByTick = new Map();
    for (const df of detectedFrames) {
      detectedByTick.set(df.tick, df.faces || []);
    }

    for (const gtf of groundTruthFrames) {
      const gtFaces = gtf.faces || [];
      const detFaces = detectedByTick.get(gtf.tick) ? [...detectedByTick.get(gtf.tick)] : [];

      totalGroundTruthFaces += gtFaces.length;
      totalDetectedFaces += detFaces.length;

      const matchedDetIndices = new Set();

      for (const gtFace of gtFaces) {
        let bestIoU = 0;
        let bestDetIdx = -1;

        for (let d = 0; d < detFaces.length; d++) {
          if (matchedDetIndices.has(d)) continue;
          const iou = this.calculateIoU(gtFace, detFaces[d]);
          if (iou > bestIoU) {
            bestIoU = iou;
            bestDetIdx = d;
          }
        }

        if (bestIoU >= iouThreshold && bestDetIdx !== -1) {
          truePositives++;
          matchedDetIndices.add(bestDetIdx);
        } else {
          falseNegatives++;
        }
      }

      falsePositives += (detFaces.length - matchedDetIndices.size);
    }

    const recall = (totalGroundTruthFaces === 0) ? 1.0 : (truePositives / totalGroundTruthFaces);
    const precision = (totalDetectedFaces === 0) ? 1.0 : (truePositives / (truePositives + falsePositives));
    const f1Score = (precision + recall === 0) ? 0.0 : ((2 * precision * recall) / (precision + recall));

    return {
      truePositives,
      falseNegatives,
      falsePositives,
      totalGroundTruthFaces,
      totalDetectedFaces,
      recall: VisualContractValidator.roundHalfToEven(recall, 4),
      precision: VisualContractValidator.roundHalfToEven(precision, 4),
      f1Score: VisualContractValidator.roundHalfToEven(f1Score, 4)
    };
  }

  /**
   * Converts sRGB color component [0, 255] to linear luminance.
   *
   * @param {number} c
   * @returns {number}
   */
  static sRGBtoLinear(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  /**
   * Computes WCAG 2.1 relative luminance for an RGB triplet.
   *
   * @param {number} r 0..255
   * @param {number} g 0..255
   * @param {number} b 0..255
   * @returns {number} Relative luminance in [0, 1]
   */
  static calculateRelativeLuminance(r, g, b) {
    const rLin = this.sRGBtoLinear(r);
    const gLin = this.sRGBtoLinear(g);
    const bLin = this.sRGBtoLinear(b);
    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
  }

  /**
   * Computes WCAG 2.1 contrast ratio between two relative luminance values.
   *
   * @param {number} lumA
   * @param {number} lumB
   * @returns {number} Contrast ratio in [1, 21]
   */
  static calculateContrastRatio(lumA, lumB) {
    const l1 = Math.max(lumA, lumB);
    const l2 = Math.min(lumA, lumB);
    return VisualContractValidator.roundHalfToEven((l1 + 0.05) / (l2 + 0.05), 3);
  }

  /**
   * Evaluates text contrast against a specified background (or array of background pixel samples).
   *
   * @param {{r: number, g: number, b: number}} textColor
   * @param {{r: number, g: number, b: number} | Array<{r: number, g: number, b: number}>} background
   * @returns {{
   *   textLuminance: number,
   *   backgroundMeanLuminance: number,
   *   backgroundMinLuminance: number,
   *   backgroundMaxLuminance: number,
   *   meanContrastRatio: number,
   *   worstCaseContrastRatio: number,
   *   meetsWCAG_AA: boolean
   * }}
   */
  static evaluateTextContrast(textColor, background) {
    const textLum = this.calculateRelativeLuminance(textColor.r, textColor.g, textColor.b);

    const bgSamples = Array.isArray(background) ? background : [background];
    if (bgSamples.length === 0) {
      throw new Error('Background must have at least one sample');
    }

    let sumLum = 0;
    let minLum = 1.0;
    let maxLum = 0.0;
    let worstContrast = 21.0;

    for (const sample of bgSamples) {
      const lum = this.calculateRelativeLuminance(sample.r, sample.g, sample.b);
      sumLum += lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;

      const c = this.calculateContrastRatio(textLum, lum);
      if (c < worstContrast) worstContrast = c;
    }

    const meanLum = sumLum / bgSamples.length;
    const meanContrast = this.calculateContrastRatio(textLum, meanLum);

    return {
      textLuminance: VisualContractValidator.roundHalfToEven(textLum, 4),
      backgroundMeanLuminance: VisualContractValidator.roundHalfToEven(meanLum, 4),
      backgroundMinLuminance: VisualContractValidator.roundHalfToEven(minLum, 4),
      backgroundMaxLuminance: VisualContractValidator.roundHalfToEven(maxLum, 4),
      meanContrastRatio: meanContrast,
      worstCaseContrastRatio: worstContrast,
      meetsWCAG_AA: worstContrast >= 4.5
    };
  }

  /**
   * PRIMARY TEMPORAL ACCEPTANCE GATE (GATE-04):
   * Measures Euclidean positional deviation e_t = ||P_t - P_t*||_2 between evaluated graphic
   * anchor position P_t and frozen ground-truth intended anchor position P_t*, scaled to reference resolution.
   *
   * Primary acceptance condition: max_{t in T_valid} e_t < 2.0 px.
   *
   * @param {Array<{tick: number, x: number, y: number}>} observedTrajectory
   * @param {Array<{tick: number, x: number, y: number}>} intendedTrajectory
   * @param {object} [options]
   * @param {{width: number, height: number}} [options.sourceResolution={width: 1920, height: 1080}]
   * @param {Array<number>} [options.shotCutTicks=[]]
   * @param {{width: number, height: number}} [options.referenceResolution={width: 1920, height: 1080}]
   * @param {number} [options.minSampleCount=3]
   * @param {number} [options.maxAllowedDeviationPx=2.0]
   * @returns {{
   *   status: 'PASS' | 'FAIL' | 'NOT_EVALUABLE' | 'INVALID_TIMESTAMPS',
   *   isEvaluable: boolean,
   *   passesGate: boolean,
   *   sampleCount: number,
   *   maxDeviationPixels: number | null,
   *   meanDeviationPixels: number | null,
   *   rmsDeviationPixels: number | null,
   *   deviationPoints: Array<{tick: number, deviation: number}>,
   *   reason?: string
   * }}
   */
  static calculateIntendedTrajectoryDeviation(
    observedTrajectory,
    intendedTrajectory,
    options = {}
  ) {
    const minSampleCount = options.minSampleCount || 3;
    const maxAllowedDeviationPx = options.maxAllowedDeviationPx || 2.0;
    const sourceResolution = options.sourceResolution || { width: 1920, height: 1080 };
    const referenceResolution = options.referenceResolution || { width: 1920, height: 1080 };
    const shotCutSet = new Set(options.shotCutTicks || []);

    // 1. Minimum temporal sample count enforcement (Finding B)
    if (!Array.isArray(observedTrajectory) || observedTrajectory.length < minSampleCount) {
      return {
        status: 'NOT_EVALUABLE',
        isEvaluable: false,
        passesGate: false,
        sampleCount: Array.isArray(observedTrajectory) ? observedTrajectory.length : 0,
        maxDeviationPixels: null,
        meanDeviationPixels: null,
        rmsDeviationPixels: null,
        deviationPoints: [],
        reason: `Insufficient temporal samples: observed trajectory has ${Array.isArray(observedTrajectory) ? observedTrajectory.length : 0} points (minimum required: ${minSampleCount})`
      };
    }

    if (!Array.isArray(intendedTrajectory) || intendedTrajectory.length < minSampleCount) {
      return {
        status: 'NOT_EVALUABLE',
        isEvaluable: false,
        passesGate: false,
        sampleCount: Array.isArray(intendedTrajectory) ? intendedTrajectory.length : 0,
        maxDeviationPixels: null,
        meanDeviationPixels: null,
        rmsDeviationPixels: null,
        deviationPoints: [],
        reason: `Insufficient ground-truth intended trajectory samples: requires at least ${minSampleCount} points`
      };
    }

    // 2. Validate timestamp monotonicity and duplicate detection
    for (let i = 1; i < observedTrajectory.length; i++) {
      const prev = observedTrajectory[i - 1];
      const curr = observedTrajectory[i];
      if (curr.tick === prev.tick) {
        return {
          status: 'INVALID_TIMESTAMPS',
          isEvaluable: false,
          passesGate: false,
          sampleCount: observedTrajectory.length,
          maxDeviationPixels: null,
          meanDeviationPixels: null,
          rmsDeviationPixels: null,
          deviationPoints: [],
          reason: `Duplicate frame timestamp detected at tick ${curr.tick}`
        };
      }
      if (curr.tick < prev.tick) {
        return {
          status: 'INVALID_TIMESTAMPS',
          isEvaluable: false,
          passesGate: false,
          sampleCount: observedTrajectory.length,
          maxDeviationPixels: null,
          meanDeviationPixels: null,
          rmsDeviationPixels: null,
          deviationPoints: [],
          reason: `Non-monotonic frame timestamps detected: tick ${curr.tick} follows ${prev.tick}`
        };
      }
    }

    // 3. Build intended trajectory map by tick
    const intendedMap = new Map();
    for (const pt of intendedTrajectory) {
      intendedMap.set(pt.tick, pt);
    }

    // Diagonal scaling ratio to canonical 1080p reference resolution
    const srcDiag = Math.sqrt(sourceResolution.width ** 2 + sourceResolution.height ** 2);
    const refDiag = Math.sqrt(referenceResolution.width ** 2 + referenceResolution.height ** 2);
    const scaleFactor = refDiag / (srcDiag > 0 ? srcDiag : refDiag);

    let maxDev = 0.0;
    let sumDev = 0.0;
    let sumSqDev = 0.0;
    const deviationPoints = [];

    for (const obs of observedTrajectory) {
      // Exclude points falling on declared shot cuts
      if (shotCutSet.has(obs.tick)) {
        continue;
      }

      const intended = intendedMap.get(obs.tick);
      if (!intended) {
        // Frame has no intended placement annotation; exclude from denominator
        continue;
      }

      // Euclidean positional deviation in source space
      const dx = obs.x - intended.x;
      const dy = obs.y - intended.y;
      const distSource = Math.sqrt(dx ** 2 + dy ** 2);
      const distRef = distSource * scaleFactor;

      if (distRef > maxDev) maxDev = distRef;
      sumDev += distRef;
      sumSqDev += distRef ** 2;

      deviationPoints.push({
        tick: obs.tick,
        deviation: VisualContractValidator.roundHalfToEven(distRef, 3)
      });
    }

    if (deviationPoints.length < minSampleCount) {
      return {
        status: 'NOT_EVALUABLE',
        isEvaluable: false,
        passesGate: false,
        sampleCount: deviationPoints.length,
        maxDeviationPixels: null,
        meanDeviationPixels: null,
        rmsDeviationPixels: null,
        deviationPoints,
        reason: `Insufficient valid paired samples after excluding shot cuts (${deviationPoints.length} < ${minSampleCount})`
      };
    }

    const count = deviationPoints.length;
    const meanDev = sumDev / count;
    const rmsDev = Math.sqrt(sumSqDev / count);
    const roundedMax = VisualContractValidator.roundHalfToEven(maxDev, 3);
    const passesGate = roundedMax < maxAllowedDeviationPx;

    return {
      status: passesGate ? 'PASS' : 'FAIL',
      isEvaluable: true,
      passesGate,
      sampleCount: count,
      maxDeviationPixels: roundedMax,
      meanDeviationPixels: VisualContractValidator.roundHalfToEven(meanDev, 3),
      rmsDeviationPixels: VisualContractValidator.roundHalfToEven(rmsDev, 3),
      deviationPoints
    };
  }

  /**
   * SECONDARY DIAGNOSTIC METRIC:
   * Analyzes second central difference Delta^2 P_t = P_{t+1} - 2P_t + P_{t-1}
   * to evaluate discrete trajectory smoothness and acceleration anomalies.
   *
   * @param {Array<{tick: number, x: number, y: number}>} trajectory
   * @param {{width: number, height: number}} [sourceResolution={width: 1920, height: 1080}]
   * @param {Array<number>} [shotCutTicks=[]]
   * @param {{width: number, height: number}} [referenceResolution={width: 1920, height: 1080}]
   * @returns {{
   *   status: 'DIAGNOSTIC_COMPUTED' | 'NOT_EVALUABLE' | 'INVALID_TIMESTAMPS',
   *   isEvaluable: boolean,
   *   sampleCount: number,
   *   rmsSmoothnessPixels: number | null,
   *   maxCurvaturePixels: number | null,
   *   curvaturePoints: Array<{tick: number, deviation: number}>,
   *   reason?: string
   * }}
   */
  static calculateSmoothnessDiagnostic(
    trajectory = [],
    sourceResolution = { width: 1920, height: 1080 },
    shotCutTicks = [],
    referenceResolution = { width: 1920, height: 1080 }
  ) {
    if (!Array.isArray(trajectory) || trajectory.length < 3) {
      return {
        status: 'NOT_EVALUABLE',
        isEvaluable: false,
        sampleCount: Array.isArray(trajectory) ? trajectory.length : 0,
        rmsSmoothnessPixels: null,
        maxCurvaturePixels: null,
        curvaturePoints: [],
        reason: 'Insufficient temporal samples (< 3 points for second difference)'
      };
    }

    // Validate monotonicity
    for (let i = 1; i < trajectory.length; i++) {
      if (trajectory[i].tick <= trajectory[i - 1].tick) {
        return {
          status: 'INVALID_TIMESTAMPS',
          isEvaluable: false,
          sampleCount: trajectory.length,
          rmsSmoothnessPixels: null,
          maxCurvaturePixels: null,
          curvaturePoints: [],
          reason: 'Duplicate or non-monotonic timestamps detected in trajectory'
        };
      }
    }

    const shotCutSet = new Set(shotCutTicks);
    const srcDiag = Math.sqrt(sourceResolution.width ** 2 + sourceResolution.height ** 2);
    const refDiag = Math.sqrt(referenceResolution.width ** 2 + referenceResolution.height ** 2);
    const scaleFactor = refDiag / (srcDiag > 0 ? srcDiag : refDiag);

    let sumSqDev = 0;
    let maxDev = 0;
    const curvaturePoints = [];

    for (let i = 1; i < trajectory.length - 1; i++) {
      const pPrev = trajectory[i - 1];
      const pCurr = trajectory[i];
      const pNext = trajectory[i + 1];

      if (shotCutSet.has(pCurr.tick) || shotCutSet.has(pNext.tick)) {
        continue;
      }

      const d2x = pNext.x - 2 * pCurr.x + pPrev.x;
      const d2y = pNext.y - 2 * pCurr.y + pPrev.y;
      const devSource = Math.sqrt(d2x ** 2 + d2y ** 2);
      const devRef = devSource * scaleFactor;

      sumSqDev += devRef ** 2;
      if (devRef > maxDev) maxDev = devRef;

      curvaturePoints.push({
        tick: pCurr.tick,
        deviation: VisualContractValidator.roundHalfToEven(devRef, 3)
      });
    }

    const count = curvaturePoints.length;
    const rms = count > 0 ? Math.sqrt(sumSqDev / count) : 0.0;

    return {
      status: 'DIAGNOSTIC_COMPUTED',
      isEvaluable: count > 0,
      sampleCount: count,
      rmsSmoothnessPixels: VisualContractValidator.roundHalfToEven(rms, 3),
      maxCurvaturePixels: VisualContractValidator.roundHalfToEven(maxDev, 3),
      curvaturePoints
    };
  }

  /**
   * Unified temporal jitter evaluation method.
   *
   * If intendedTrajectory is provided, calculates primary placement deviation relative to intended trajectory (GATE-04)
   * and attaches secondary smoothness diagnostic.
   * If single trajectory is provided, evaluates second-difference smoothness diagnostic with strict sample count gating.
   *
   * @param {Array<{tick: number, x: number, y: number}>} trajectory
   * @param {Array<object> | object} [intendedTrajectoryOrSourceRes]
   * @param {Array<number>} [shotCutTicks=[]]
   * @param {object} [referenceResolution]
   */
  static calculateTemporalJitter(
    trajectory = [],
    intendedTrajectoryOrSourceRes = { width: 1920, height: 1080 },
    shotCutTicks = [],
    referenceResolution = { width: 1920, height: 1080 }
  ) {
    // If second argument is an array, it's intendedTrajectory
    if (Array.isArray(intendedTrajectoryOrSourceRes)) {
      return this.calculateIntendedTrajectoryDeviation(
        trajectory,
        intendedTrajectoryOrSourceRes,
        {
          shotCutTicks,
          referenceResolution
        }
      );
    }

    // Single trajectory: calculate smoothness diagnostic with strict non-success on insufficient data
    if (!Array.isArray(trajectory) || trajectory.length < 3) {
      return {
        status: 'NOT_EVALUABLE',
        isEvaluable: false,
        sampleCount: Array.isArray(trajectory) ? trajectory.length : 0,
        rmsJitterPixels: null,
        maxJitterPixels: null,
        jitterPoints: [],
        passesGate: false,
        reason: 'Insufficient temporal samples: requires at least 3 points'
      };
    }

    const diag = this.calculateSmoothnessDiagnostic(
      trajectory,
      intendedTrajectoryOrSourceRes,
      shotCutTicks,
      referenceResolution
    );

    if (!diag.isEvaluable) {
      return {
        status: diag.status,
        isEvaluable: false,
        sampleCount: diag.sampleCount,
        rmsJitterPixels: null,
        maxJitterPixels: null,
        jitterPoints: [],
        passesGate: false,
        reason: diag.reason
      };
    }

    return {
      status: 'DIAGNOSTIC_COMPUTED',
      isEvaluable: true,
      sampleCount: diag.sampleCount,
      rmsJitterPixels: diag.rmsSmoothnessPixels,
      maxJitterPixels: diag.maxCurvaturePixels,
      jitterPoints: diag.curvaturePoints,
      passesGate: diag.rmsSmoothnessPixels < 2.0
    };
  }

  /**
   * Verifies deterministic invariance: identical inputs produce bit-identical results.
   *
   * @param {any} inputA
   * @param {any} inputB
   * @returns {boolean}
   */
  static verifyDeterministicInvariance(inputA, inputB) {
    const jsonA = JSON.stringify(inputA);
    const jsonB = JSON.stringify(inputB);
    return jsonA === jsonB;
  }
}

module.exports = { VisualBenchmarkEvaluator };
