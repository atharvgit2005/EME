/**
 * Editing Mechanics Engine (EME) - Visual Quality Assurance (VQA) Gates
 * Stage 32.3: Deterministic Constraint Solver & VQA Gates
 *
 * Provides non-mutating VQA evaluation gates for:
 * 1. GATE-01: Zero Face Collision Gate (positive-area overlap == 0.0)
 * 2. GATE-03: Text Relative Contrast Gate (WCAG 2.1 relative luminance >= 4.5:1)
 * 3. GATE-04: Primary Intended-Trajectory Placement Deviation Gate (max e_t < 2.0 px at 1080p reference)
 *    and Secondary Smoothness Diagnostic (DIAG-04)
 * 4. GATE-TITLESAFE: Title Safe Containment (default 10% SMPTE margins)
 * 5. Comprehensive Visual Plan Auditing with fail-closed boundary enforcement
 */

const { VisualBenchmarkEvaluator } = require('../benchmarks/visual-benchmark-evaluator');
const { VisualContractValidator } = require('../renderers/visual-contract-validator');

class VisualQAGates {
  /**
   * Audits a spatial placement rectangle across a sequence of observed frames in a visual sidecar.
   *
   * @param {{x: number, y: number, width: number, height: number}} placementRect
   * @param {object} sidecar Visual sidecar conforming to eme-visual-intelligence.v1
   * @param {object} [timeRange]
   * @param {number} [timeRange.startTick=0]
   * @param {number} [timeRange.endTick=Infinity]
   * @param {object} [options]
   * @param {number} [options.titleSafeRatio=0.10] SMPTE title safe margin ratio
   * @param {boolean} [options.enforceTitleSafe=true]
   * @returns {{
   *   passed: boolean,
   *   faceCollisionPassed: boolean,
   *   titleSafePassed: boolean,
   *   totalFramesAudited: number,
   *   collidedFramesCount: number,
   *   maxOverlapArea: number,
   *   titleSafeViolations: Array<string>,
   *   collidedFrames: Array<{tick: number, frameIndex: number, overlapArea: number}>
   * }}
   */
  static auditSpatialPlacement(placementRect, sidecar, timeRange = {}, options = {}) {
    if (!placementRect || typeof placementRect !== 'object') {
      throw new Error('Invalid placementRect: must be an object with { x, y, width, height }');
    }
    if (!sidecar || !Array.isArray(sidecar.frames)) {
      throw new Error('Invalid sidecar: must be an object with frames array');
    }

    const startTick = Number.isInteger(timeRange.startTick) ? timeRange.startTick : 0;
    const endTick = Number.isInteger(timeRange.endTick) ? timeRange.endTick : Infinity;
    const titleSafeRatio = typeof options.titleSafeRatio === 'number' ? options.titleSafeRatio : 0.10;
    const enforceTitleSafe = options.enforceTitleSafe !== false;

    const sourceW = (sidecar.source && sidecar.source.width) ? sidecar.source.width : 1920;
    const sourceH = (sidecar.source && sidecar.source.height) ? sidecar.source.height : 1080;

    // 1. Title safe audit
    const titleSafeViolations = [];
    let titleSafePassed = true;

    if (enforceTitleSafe) {
      const minX = sourceW * titleSafeRatio;
      const maxX = sourceW * (1.0 - titleSafeRatio);
      const minY = sourceH * titleSafeRatio;
      const maxY = sourceH * (1.0 - titleSafeRatio);

      if (placementRect.x < minX) {
        titleSafeViolations.push(`Left edge ${placementRect.x}px violates title-safe minX ${minX}px`);
      }
      if (placementRect.x + placementRect.width > maxX) {
        titleSafeViolations.push(`Right edge ${placementRect.x + placementRect.width}px violates title-safe maxX ${maxX}px`);
      }
      if (placementRect.y < minY) {
        titleSafeViolations.push(`Top edge ${placementRect.y}px violates title-safe minY ${minY}px`);
      }
      if (placementRect.y + placementRect.height > maxY) {
        titleSafeViolations.push(`Bottom edge ${placementRect.y + placementRect.height}px violates title-safe maxY ${maxY}px`);
      }

      titleSafePassed = titleSafeViolations.length === 0;
    }

    // 2. Face collision audit across frames in time range
    let totalFramesAudited = 0;
    let collidedFramesCount = 0;
    let maxOverlapArea = 0.0;
    const collidedFrames = [];

    for (const frame of sidecar.frames) {
      if (frame.tick < startTick || frame.tick >= endTick) continue;
      totalFramesAudited++;

      // Extract all face observations
      const faceRects = [];
      for (const obs of frame.observations || []) {
        if (obs.type === 'face' && obs.bounds) {
          faceRects.push(obs.bounds);
        }
      }

      if (faceRects.length > 0) {
        const collisionRes = VisualBenchmarkEvaluator.calculateFaceCollision(placementRect, faceRects);
        if (collisionRes.hasCollision) {
          collidedFramesCount++;
          if (collisionRes.overlapArea > maxOverlapArea) {
            maxOverlapArea = collisionRes.overlapArea;
          }
          collidedFrames.push({
            tick: frame.tick,
            frameIndex: frame.frameIndex,
            overlapArea: collisionRes.overlapArea
          });
        }
      }
    }

    const faceCollisionPassed = collidedFramesCount === 0;
    const passed = faceCollisionPassed && titleSafePassed;

    return {
      passed,
      faceCollisionPassed,
      titleSafePassed,
      totalFramesAudited,
      collidedFramesCount,
      maxOverlapArea: VisualContractValidator.roundHalfToEven(maxOverlapArea, 3),
      titleSafeViolations,
      collidedFrames
    };
  }

  /**
   * Audits text relative contrast ratio against local background samples.
   *
   * @param {{r: number, g: number, b: number}} textColor
   * @param {Array<{r: number, g: number, b: number}> | {r: number, g: number, b: number}} backgroundSamples
   * @param {object} [options]
   * @param {number} [options.minContrastRatio=4.5]
   * @param {boolean} [options.hasBacking=false] If graphic includes an opaque/semi-opaque backing pill
   * @param {{r: number, g: number, b: number, a?: number}} [options.backingColor]
   * @returns {{
   *   passed: boolean,
   *   worstCaseContrastRatio: number,
   *   meanContrastRatio: number,
   *   backingActive: boolean,
   *   meetsWCAG_AA: boolean,
   *   details: string
   * }}
   */
  static auditContrastLegibility(textColor, backgroundSamples, options = {}) {
    const minContrastRatio = typeof options.minContrastRatio === 'number' ? options.minContrastRatio : 4.5;
    const hasBacking = options.hasBacking === true;

    // If explicit backing is present with sufficient opacity (e.g. >= 0.70), contrast is guaranteed
    if (hasBacking && options.backingColor) {
      const backingAlpha = options.backingColor.a !== undefined ? options.backingColor.a : 1.0;
      if (backingAlpha >= 0.70) {
        const contrastVsBacking = VisualBenchmarkEvaluator.evaluateTextContrast(textColor, [options.backingColor]);
        if (contrastVsBacking.worstCaseContrastRatio >= minContrastRatio) {
          return {
            passed: true,
            worstCaseContrastRatio: contrastVsBacking.worstCaseContrastRatio,
            meanContrastRatio: contrastVsBacking.meanContrastRatio,
            backingActive: true,
            meetsWCAG_AA: true,
            details: `Contrast guaranteed by protective backing (${contrastVsBacking.worstCaseContrastRatio}:1 vs backing)`
          };
        }
      }
    }

    const evalResult = VisualBenchmarkEvaluator.evaluateTextContrast(textColor, backgroundSamples);
    const passed = evalResult.worstCaseContrastRatio >= minContrastRatio;

    return {
      passed,
      worstCaseContrastRatio: evalResult.worstCaseContrastRatio,
      meanContrastRatio: evalResult.meanContrastRatio,
      backingActive: false,
      meetsWCAG_AA: evalResult.meetsWCAG_AA,
      details: passed
        ? `Worst-case local contrast ${evalResult.worstCaseContrastRatio}:1 satisfies threshold ${minContrastRatio}:1`
        : `Worst-case local contrast ${evalResult.worstCaseContrastRatio}:1 fails threshold ${minContrastRatio}:1`
    };
  }

  /**
   * Audits temporal placement stability (GATE-04 primary intended trajectory deviation
   * and DIAG-04 secondary smoothness diagnostic).
   *
   * @param {Array<{tick: number, x: number, y: number}>} observedTrajectory
   * @param {Array<{tick: number, x: number, y: number}>} [intendedTrajectory]
   * @param {object} [options]
   * @returns {{
   *   passed: boolean,
   *   status: 'PASS' | 'FAIL' | 'NOT_EVALUABLE' | 'INVALID_TIMESTAMPS',
   *   isEvaluable: boolean,
   *   maxPositionalDeviationPx: number,
   *   smoothnessRms: number,
   *   evaluatedFramesCount: number,
   *   details: string
   * }}
   */
  static auditTrajectoryStability(observedTrajectory, intendedTrajectory = null, options = {}) {
    const minSampleCount = options.minSampleCount || 3;

    // Boundary check: Trajectory must have at least 3 samples
    if (!Array.isArray(observedTrajectory) || observedTrajectory.length < minSampleCount) {
      return {
        passed: false,
        status: 'NOT_EVALUABLE',
        isEvaluable: false,
        maxPositionalDeviationPx: Infinity,
        smoothnessRms: Infinity,
        evaluatedFramesCount: Array.isArray(observedTrajectory) ? observedTrajectory.length : 0,
        details: `Insufficient samples (${Array.isArray(observedTrajectory) ? observedTrajectory.length : 0} < ${minSampleCount}): cannot establish temporal stability`
      };
    }

    // Check timestamp monotonicity and duplicates
    for (let i = 1; i < observedTrajectory.length; i++) {
      if (observedTrajectory[i].tick <= observedTrajectory[i - 1].tick) {
        return {
          passed: false,
          status: 'INVALID_TIMESTAMPS',
          isEvaluable: false,
          maxPositionalDeviationPx: Infinity,
          smoothnessRms: Infinity,
          evaluatedFramesCount: 0,
          details: `Non-monotonic or duplicate timestamp detected at index ${i} (tick ${observedTrajectory[i].tick} <= ${observedTrajectory[i - 1].tick})`
        };
      }
    }

    const sourceResolution = options.sourceResolution || { width: 1920, height: 1080 };
    const shotCutTicks = options.shotCutTicks || [];
    const referenceResolution = options.referenceResolution || { width: 1920, height: 1080 };

    // Evaluate secondary smoothness diagnostic
    const smoothnessRes = VisualBenchmarkEvaluator.calculateSmoothnessDiagnostic(
      observedTrajectory,
      sourceResolution,
      shotCutTicks,
      referenceResolution
    );

    // If intended trajectory is provided, evaluate primary GATE-04
    if (Array.isArray(intendedTrajectory) && intendedTrajectory.length > 0) {
      const devRes = VisualBenchmarkEvaluator.calculateIntendedTrajectoryDeviation(
        observedTrajectory,
        intendedTrajectory,
        options
      );

      const maxDev = devRes.maxDeviationPixels !== null ? devRes.maxDeviationPixels : Infinity;
      const smoothRms = smoothnessRes.rmsSmoothnessPixels !== null ? smoothnessRes.rmsSmoothnessPixels : Infinity;

      return {
        passed: devRes.passesGate,
        status: devRes.status,
        isEvaluable: devRes.isEvaluable,
        maxPositionalDeviationPx: maxDev,
        smoothnessRms: smoothRms,
        evaluatedFramesCount: devRes.sampleCount || 0,
        details: devRes.passesGate
          ? `Peak deviation ${maxDev}px < ${options.maxAllowedDeviationPx || 2.0}px threshold (smoothness: ${smoothRms}px)`
          : `Peak deviation ${maxDev}px >= ${options.maxAllowedDeviationPx || 2.0}px threshold (smoothness: ${smoothRms}px)`
      };
    }

    // If only observed trajectory is provided (no ground truth intended reference),
    // evaluate temporal continuity via smoothness diagnostic
    const maxThreshold = options.maxAllowedDeviationPx || 2.0;
    const passed = smoothnessRes.rmsSmoothnessPixels !== null && smoothnessRes.rmsSmoothnessPixels < maxThreshold;

    return {
      passed,
      status: passed ? 'PASS' : 'FAIL',
      isEvaluable: true,
      maxPositionalDeviationPx: 0.0,
      smoothnessRms: smoothnessRes.rmsSmoothnessPixels,
      evaluatedFramesCount: smoothnessRes.sampleCount || 0,
      details: passed
        ? `Trajectory smoothness RMS ${smoothnessRes.rmsSmoothnessPixels}px satisfies threshold ${maxThreshold}px`
        : `Trajectory smoothness RMS ${smoothnessRes.rmsSmoothnessPixels}px exceeds threshold ${maxThreshold}px`
    };
  }

  /**
   * Executes a comprehensive VQA audit on a solved visual layout / plan against all gates.
   *
   * @param {object} params
   * @param {{x: number, y: number, width: number, height: number}} params.placement
   * @param {object} params.sidecar
   * @param {object} [params.timeRange]
   * @param {{r: number, g: number, b: number}} [params.textColor={r: 255, g: 255, b: 255}]
   * @param {Array<{r: number, g: number, b: number}>} [params.backgroundSamples]
   * @param {boolean} [params.hasBacking=false]
   * @param {object} [params.backingColor]
   * @param {Array<{tick: number, x: number, y: number}>} [params.observedTrajectory]
   * @param {Array<{tick: number, x: number, y: number}>} [params.intendedTrajectory]
   * @param {object} [options]
   * @returns {{
   *   passed: boolean,
   *   score: number,
   *   gates: {
   *     GATE_01_FACE_COLLISION: object,
   *     GATE_03_TEXT_CONTRAST: object,
   *     GATE_04_TEMPORAL_STABILITY: object,
   *     GATE_TITLE_SAFE: object
   *   },
   *   summary: string
   * }}
   */
  static auditComprehensive(params = {}, options = {}) {
    const {
      placement,
      sidecar,
      timeRange = {},
      textColor = { r: 255, g: 255, b: 255 },
      backgroundSamples = [{ r: 30, g: 30, b: 30 }],
      hasBacking = false,
      backingColor = null,
      observedTrajectory = null,
      intendedTrajectory = null
    } = params;

    // 1. Spatial & face collision audit
    const spatialAudit = this.auditSpatialPlacement(placement, sidecar, timeRange, options);

    // 2. Contrast legibility audit
    const contrastAudit = this.auditContrastLegibility(textColor, backgroundSamples, {
      hasBacking,
      backingColor,
      minContrastRatio: options.minContrastRatio || 4.5
    });

    // 3. Temporal stability audit (if trajectory provided)
    let temporalAudit = {
      passed: true,
      status: 'NOT_APPLICABLE',
      isEvaluable: true,
      maxPositionalDeviationPx: 0.0,
      smoothnessRms: 0.0,
      evaluatedFramesCount: 0,
      details: 'Static placement: temporal trajectory audit omitted'
    };

    if (Array.isArray(observedTrajectory) && observedTrajectory.length > 0) {
      temporalAudit = this.auditTrajectoryStability(observedTrajectory, intendedTrajectory, options);
    }

    const allPassed = spatialAudit.faceCollisionPassed &&
                      spatialAudit.titleSafePassed &&
                      contrastAudit.passed &&
                      temporalAudit.passed;

    let score = 100.0;
    if (!spatialAudit.faceCollisionPassed) score -= 40.0;
    if (!spatialAudit.titleSafePassed) score -= 20.0;
    if (!contrastAudit.passed) score -= 20.0;
    if (!temporalAudit.passed) score -= 20.0;
    score = Math.max(0.0, score);

    return {
      passed: allPassed,
      score: VisualContractValidator.roundHalfToEven(score, 1),
      gates: {
        GATE_01_FACE_COLLISION: {
          passed: spatialAudit.faceCollisionPassed,
          overlapArea: spatialAudit.maxOverlapArea,
          collidedFramesCount: spatialAudit.collidedFramesCount
        },
        GATE_03_TEXT_CONTRAST: {
          passed: contrastAudit.passed,
          worstCaseContrastRatio: contrastAudit.worstCaseContrastRatio,
          backingActive: contrastAudit.backingActive
        },
        GATE_04_TEMPORAL_STABILITY: {
          passed: temporalAudit.passed,
          status: temporalAudit.status,
          maxPositionalDeviationPx: temporalAudit.maxPositionalDeviationPx,
          smoothnessRms: temporalAudit.smoothnessRms
        },
        GATE_TITLE_SAFE: {
          passed: spatialAudit.titleSafePassed,
          violations: spatialAudit.titleSafeViolations
        }
      },
      summary: allPassed
        ? `All VQA gates PASSED with score ${score}/100`
        : `VQA gate failure(s) detected: score ${score}/100`
    };
  }
}

module.exports = {
  VisualQAGates
};
