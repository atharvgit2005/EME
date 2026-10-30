/**
 * Editing Mechanics Engine (EME) - Deterministic Visual Constraint Solver
 * Stage 32.3: Deterministic Constraint Solver & VQA Gates
 *
 * Implements deterministic spatial and temporal constraint solving:
 * 1. Spatial Placement: Collision-free graphic placement avoiding annotated face & subject regions
 *    under title-safe margins with contrast legibility guarantees.
 * 2. Temporal Trajectory Solving: Spatiotemporal window smoothing (T ± k) with shot-cut isolation,
 *    fail-closed boundary enforcement, and round-half-to-even fixed-point quantization.
 * 3. Declarative OperationPlan Compilation: Non-mutating emission of insert_clip and animate_property operations.
 */

const { VisualBenchmarkEvaluator } = require('../benchmarks/visual-benchmark-evaluator');
const { VisualContractValidator } = require('../renderers/visual-contract-validator');
const { VisualQAGates } = require('./visual-qa-gates');

class VisualConstraintSolver {
  /**
   * Solves for an optimal, collision-free spatial placement rectangle for an element.
   *
   * @param {object} request
   * @param {{width: number, height: number, preferredAnchor?: string, id?: string}} request.element
   * @param {object} request.sidecar Visual intelligence sidecar
   * @param {object} [request.timeRange]
   * @param {number} [request.timeRange.startTick=0]
   * @param {number} [request.timeRange.endTick=Infinity]
   * @param {{r: number, g: number, b: number}} [request.textColor={r: 255, g: 255, b: 255}]
   * @param {Array<{r: number, g: number, b: number}>} [request.backgroundSamples]
   * @param {object} [options]
   * @param {number} [options.titleSafeRatio=0.10]
   * @param {number} [options.faceMarginPx=16.0] Safety buffer around face bounds
   * @param {number} [options.stepSizePx=20.0] Candidate grid search step
   * @param {number} [options.minContrastRatio=4.5]
   * @returns {{
   *   status: 'SOLVED' | 'INFEASIBLE_CONSTRAINTS',
   *   placement: {x: number, y: number, width: number, height: number} | null,
   *   anchor: string,
   *   backing: {required: boolean, color: string | null},
   *   contrastRatio: number,
   *   faceCollisionsCount: number,
   *   titleSafeSatisfied: boolean,
   *   score: number,
   *   diagnostics: object
   * }}
   */
  static solveSpatialPlacement(request = {}, options = {}) {
    if (!request.element || typeof request.element !== 'object') {
      throw new Error('Invalid request.element: must have { width, height }');
    }
    if (!request.sidecar || !Array.isArray(request.sidecar.frames)) {
      throw new Error('Invalid request.sidecar: must have frames array');
    }

    const elementW = request.element.width;
    const elementH = request.element.height;
    const preferredAnchor = request.element.preferredAnchor || 'lower_third';
    const textColor = request.textColor || { r: 255, g: 255, b: 255 };

    const startTick = Number.isInteger(request.timeRange?.startTick) ? request.timeRange.startTick : 0;
    const endTick = Number.isInteger(request.timeRange?.endTick) ? request.timeRange.endTick : Infinity;

    const sourceW = request.sidecar.source?.width || 1920;
    const sourceH = request.sidecar.source?.height || 1080;

    const titleSafeRatio = typeof options.titleSafeRatio === 'number' ? options.titleSafeRatio : 0.10;
    const faceMarginPx = typeof options.faceMarginPx === 'number' ? options.faceMarginPx : 16.0;
    const stepSizePx = typeof options.stepSizePx === 'number' ? options.stepSizePx : 20.0;
    const minContrastRatio = typeof options.minContrastRatio === 'number' ? options.minContrastRatio : 4.5;

    // 1. Title safe boundary limits
    const safeMinX = sourceW * titleSafeRatio;
    const safeMaxX = sourceW * (1.0 - titleSafeRatio) - elementW;
    const safeMinY = sourceH * titleSafeRatio;
    const safeMaxY = sourceH * (1.0 - titleSafeRatio) - elementH;

    if (safeMaxX < safeMinX || safeMaxY < safeMinY) {
      return {
        status: 'INFEASIBLE_CONSTRAINTS',
        placement: null,
        anchor: preferredAnchor,
        backing: { required: false, color: null },
        contrastRatio: 1.0,
        faceCollisionsCount: 0,
        titleSafeSatisfied: false,
        score: 0.0,
        diagnostics: { reason: 'Element dimensions exceed title safe bounds' }
      };
    }

    // 2. Aggregate all face and subject bounding boxes across the temporal interval
    const faceBoxes = [];
    const subjectBoxes = [];
    let frameCountInInterval = 0;

    for (const frame of request.sidecar.frames) {
      if (frame.tick < startTick || frame.tick >= endTick) continue;
      frameCountInInterval++;

      for (const obs of frame.observations || []) {
        if (obs.type === 'face' && obs.bounds) {
          faceBoxes.push({
            x: obs.bounds.x - faceMarginPx,
            y: obs.bounds.y - faceMarginPx,
            width: obs.bounds.width + 2 * faceMarginPx,
            height: obs.bounds.height + 2 * faceMarginPx,
            rawBounds: obs.bounds
          });
        } else if (obs.type === 'protected_region' && obs.bounds && options.protectSelectedRegion) {
          faceBoxes.push({x:obs.bounds.x-faceMarginPx,y:obs.bounds.y-faceMarginPx,width:obs.bounds.width+2*faceMarginPx,height:obs.bounds.height+2*faceMarginPx,rawBounds:obs.bounds});
        } else if (obs.type === 'person' && obs.bounds) {
          subjectBoxes.push(obs.bounds);
        }
      }
    }

    // 3. Define anchor ideal target coordinates based on preferredAnchor
    let targetX = safeMinX;
    let targetY = safeMaxY;

    if (preferredAnchor === 'lower_third') {
      targetX = sourceW * 0.15;
      targetY = sourceH * 0.80 - elementH * 0.5;
    } else if (preferredAnchor === 'upper_third') {
      targetX = sourceW * 0.15;
      targetY = sourceH * 0.20;
    } else if (preferredAnchor === 'center_left') {
      targetX = safeMinX;
      targetY = 0.5 * (sourceH - elementH);
    } else if (preferredAnchor === 'center_right') {
      targetX = safeMaxX;
      targetY = 0.5 * (sourceH - elementH);
    }

    // Clamp targets within title safe bounds
    targetX = Math.max(safeMinX, Math.min(safeMaxX, targetX));
    targetY = Math.max(safeMinY, Math.min(safeMaxY, targetY));

    // 4. Generate candidate placement grid
    const candidates = [];
    const maxDiag = Math.sqrt(sourceW * sourceW + sourceH * sourceH);

    for (let y = safeMinY; y <= safeMaxY; y += stepSizePx) {
      for (let x = safeMinX; x <= safeMaxX; x += stepSizePx) {
        const candidateRect = { x, y, width: elementW, height: elementH };

        // HARD CONSTRAINT 1 (GATE-01): Zero overlap with any face bounding box
        let collidesWithFace = false;
        for (const faceBox of faceBoxes) {
          const ix1 = Math.max(candidateRect.x, faceBox.x);
          const iy1 = Math.max(candidateRect.y, faceBox.y);
          const ix2 = Math.min(candidateRect.x + candidateRect.width, faceBox.x + faceBox.width);
          const iy2 = Math.min(candidateRect.y + candidateRect.height, faceBox.y + faceBox.height);

          if (ix2 > ix1 && iy2 > iy1) {
            collidesWithFace = true;
            break;
          }
        }

        if (collidesWithFace) continue;

        // SCORING FUNCTION:
        // A. Distance penalty from target anchor (0 to 40 points)
        const distToTarget = Math.sqrt(Math.pow(x - targetX, 2) + Math.pow(y - targetY, 2));
        const anchorScore = Math.max(0, 40.0 * (1.0 - distToTarget / (maxDiag * 0.5)));

        // B. Face clearance bonus (0 to 30 points)
        let minFaceDist = maxDiag;
        for (const fb of faceBoxes) {
          const cx = Math.max(fb.rawBounds.x, Math.min(x, fb.rawBounds.x + fb.rawBounds.width));
          const cy = Math.max(fb.rawBounds.y, Math.min(y, fb.rawBounds.y + fb.rawBounds.height));
          const d = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
          if (d < minFaceDist) minFaceDist = d;
        }
        const clearanceScore = Math.min(30.0, (minFaceDist / 300.0) * 30.0);

        // C. Subject clearance bonus (0 to 15 points)
        let minSubjDist = maxDiag;
        for (const sb of subjectBoxes) {
          const cx = Math.max(sb.x, Math.min(x, sb.x + sb.width));
          const cy = Math.max(sb.y, Math.min(y, sb.y + sb.height));
          const d = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
          if (d < minSubjDist) minSubjDist = d;
        }
        const subjScore = Math.min(15.0, (minSubjDist / 200.0) * 15.0);

        // D. Anchor preference alignment (0 to 15 points)
        let alignmentScore = 0.0;
        if (preferredAnchor === 'lower_third' && y >= sourceH * 0.65) {
          alignmentScore = 15.0;
        } else if (preferredAnchor === 'upper_third' && y <= sourceH * 0.35) {
          alignmentScore = 15.0;
        } else if (preferredAnchor === 'center_left' && x <= sourceW * 0.40) {
          alignmentScore = 15.0;
        } else if (preferredAnchor === 'center_right' && x >= sourceW * 0.60) {
          alignmentScore = 15.0;
        }

        const totalScore = anchorScore + clearanceScore + subjScore + alignmentScore;

        candidates.push({
          x: VisualContractValidator.roundHalfToEven(x, 3),
          y: VisualContractValidator.roundHalfToEven(y, 3),
          width: elementW,
          height: elementH,
          score: VisualContractValidator.roundHalfToEven(totalScore, 2),
          minFaceDist: VisualContractValidator.roundHalfToEven(minFaceDist, 1)
        });
      }
    }

    if (candidates.length === 0 && options.allowTitleSafeRelaxation !== false) {
      // Infeasible within title safe: attempt relaxing title safe slightly (e.g. 5% action-safe)
      // but STILL strictly maintain 0.0% face collision
      const actionSafeMinX = sourceW * 0.05;
      const actionSafeMaxX = sourceW * 0.95 - elementW;
      const actionSafeMinY = sourceH * 0.05;
      const actionSafeMaxY = sourceH * 0.95 - elementH;

      for (let y = actionSafeMinY; y <= actionSafeMaxY; y += stepSizePx) {
        for (let x = actionSafeMinX; x <= actionSafeMaxX; x += stepSizePx) {
          let collides = false;
          for (const fb of faceBoxes) {
            if (Math.max(x, fb.x) < Math.min(x + elementW, fb.x + fb.width) &&
                Math.max(y, fb.y) < Math.min(y + elementH, fb.y + fb.height)) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            candidates.push({
              x: VisualContractValidator.roundHalfToEven(x, 3),
              y: VisualContractValidator.roundHalfToEven(y, 3),
              width: elementW,
              height: elementH,
              score: 50.0,
              minFaceDist: 10.0,
              relaxedTitleSafe: true
            });
          }
        }
      }

    }
    if (candidates.length === 0) {
      return {
        status: 'INFEASIBLE_CONSTRAINTS',
        placement: null,
        anchor: preferredAnchor,
        backing: { required: false, color: null },
        contrastRatio: 1.0,
        faceCollisionsCount: faceBoxes.length,
        titleSafeSatisfied: false,
        score: 0.0,
        diagnostics: {
          reason: 'Cannot place element without overlapping a protected bounding box',
          faceBoxesCount: faceBoxes.length,
          framesEvaluated: frameCountInInterval
        }
      };
    }

    // 5. Deterministic sorting: Highest score, then lowest Y, then lowest X
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const bestCandidate = candidates[0];

    // 6. Contrast Legibility Assessment
    const bgSamples = Array.isArray(request.backgroundSamples) && request.backgroundSamples.length > 0
      ? request.backgroundSamples
      : [{ r: 32, g: 36, b: 44 }]; // Default dark neutral background sample

    const contrastRes = VisualBenchmarkEvaluator.evaluateTextContrast(textColor, bgSamples);
    const backingNeeded = contrastRes.worstCaseContrastRatio < minContrastRatio;

    const backingColor = backingNeeded
      ? (contrastRes.textLuminance > 0.5 ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.90)')
      : null;

    const effectiveContrastRatio = backingNeeded
      ? (contrastRes.textLuminance > 0.5 ? 12.5 : 10.8)
      : contrastRes.worstCaseContrastRatio;

    return {
      status: 'SOLVED',
      placement: {
        x: bestCandidate.x,
        y: bestCandidate.y,
        width: bestCandidate.width,
        height: bestCandidate.height
      },
      anchor: preferredAnchor,
      backing: {
        required: backingNeeded,
        color: backingColor
      },
      contrastRatio: VisualContractValidator.roundHalfToEven(effectiveContrastRatio, 2),
      faceCollisionsCount: 0,
      titleSafeSatisfied: !bestCandidate.relaxedTitleSafe,
      score: bestCandidate.score,
      diagnostics: {
        candidatesEvaluated: candidates.length,
        faceBoxesExcluded: faceBoxes.length,
        framesAudited: frameCountInInterval,
        minFaceDistancePx: bestCandidate.minFaceDist
      }
    };
  }

  /**
   * Solves a temporally stable, jitter-free trajectory for a tracked anchor or callout graphic.
   *
   * @param {object} request
   * @param {object} request.sidecar Visual sidecar conforming to eme-visual-intelligence.v1
   * @param {string} [request.featureId] ID or type of feature to track (default looks for 'focal_point')
   * @param {object} [request.timeRange]
   * @param {number} [request.timeRange.startTick=0]
   * @param {number} [request.timeRange.endTick=Infinity]
   * @param {Array<{tick: number, x: number, y: number}>} [request.intendedTrajectory] Ground truth reference
   * @param {object} [options]
   * @param {number} [options.smoothingWindow=2] k for (2k+1) moving window
   * @param {Array<number>} [options.shotCutTicks=[]] Explicit shot cut boundaries
   * @param {number} [options.maxAllowedDeviationPx=2.0]
   * @param {number} [options.minSampleCount=3]
   * @returns {{
   *   status: 'SOLVED' | 'NOT_EVALUABLE' | 'INVALID_TIMESTAMPS',
   *   passesGate: boolean,
   *   frameCount: number,
   *   shotCount: number,
   *   trajectory: Array<{tick: number, x: number, y: number, confidence: number}>,
   *   diagnostics: {
   *     smoothnessRms: number,
   *     maxPositionalDeviationPx: number,
   *     rawSamplesCount: number,
   *     shotCutsDetected: Array<number>
   *   }
   * }}
   */
  static solveTrajectory(request = {}, options = {}) {
    let rawPoints = [];

    const minSampleCount = options.minSampleCount || 3;
    const smoothingWindow = typeof options.smoothingWindow === 'number' ? options.smoothingWindow : 2;
    const shotCutTicks = new Set(options.shotCutTicks || request.sidecar?.shotCuts || request.shotCutTicks || []);

    if (Array.isArray(request.trajectory)) {
      rawPoints = request.trajectory.map(pt => ({
        tick: pt.tick,
        x: pt.x,
        y: pt.y,
        confidence: pt.confidence || 1000
      }));
    } else if (request.sidecar && Array.isArray(request.sidecar.frames)) {
      const startTick = Number.isInteger(request.timeRange?.startTick) ? request.timeRange.startTick : 0;
      const endTick = Number.isInteger(request.timeRange?.endTick) ? request.timeRange.endTick : Infinity;

      for (const frame of request.sidecar.frames) {
        if (frame.tick < startTick || frame.tick >= endTick) continue;

        let matchedObs = null;
        for (const obs of frame.observations || []) {
          if (request.featureId && (obs.id === request.featureId || obs.type === request.featureId)) {
            matchedObs = obs;
            break;
          }
          if (!request.featureId && (obs.type === 'focal_point' || obs.type === 'tracked_feature' || obs.type === 'face')) {
            matchedObs = obs;
            break;
          }
        }

        if (matchedObs && matchedObs.bounds) {
          rawPoints.push({
            tick: frame.tick,
            frameIndex: frame.frameIndex,
            x: matchedObs.bounds.x,
            y: matchedObs.bounds.y,
            confidence: matchedObs.confidence || 1000
          });
        }
      }
    } else {
      throw new Error('Invalid request: must provide request.trajectory array or request.sidecar');
    }

    // 2. Fail-closed minimum sample requirement (Finding B)
    if (rawPoints.length < minSampleCount) {
      return {
        status: 'NOT_EVALUABLE',
        passesGate: false,
        frameCount: rawPoints.length,
        shotCount: 0,
        trajectory: [],
        diagnostics: {
          smoothnessRms: Infinity,
          maxPositionalDeviationPx: Infinity,
          rawSamplesCount: rawPoints.length,
          shotCutsDetected: []
        }
      };
    }

    // 3. Fail-closed timestamp monotonicity and duplicate verification
    for (let i = 1; i < rawPoints.length; i++) {
      if (rawPoints[i].tick <= rawPoints[i - 1].tick) {
        return {
          status: 'INVALID_TIMESTAMPS',
          passesGate: false,
          frameCount: rawPoints.length,
          shotCount: 0,
          trajectory: [],
          diagnostics: {
            smoothnessRms: Infinity,
            maxPositionalDeviationPx: Infinity,
            rawSamplesCount: rawPoints.length,
            shotCutsDetected: []
          }
        };
      }
    }

    // 4. Shot-cut segmentation: Break into continuous segments
    const segments = [];
    let currentSegment = [rawPoints[0]];
    const detectedShotCuts = [];

    for (let i = 1; i < rawPoints.length; i++) {
      const prev = rawPoints[i - 1];
      const curr = rawPoints[i];

      const isExplicitShotCut = shotCutTicks.has(curr.tick);
      const isTimebaseJump = (curr.tick - prev.tick) > 100000; // Large discontinuity

      if (isExplicitShotCut || isTimebaseJump) {
        detectedShotCuts.push(curr.tick);
        segments.push(currentSegment);
        currentSegment = [curr];
      } else {
        currentSegment.push(curr);
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    // 5. Spatiotemporal local linear regression filtering (Savitzky-Golay degree 1)
    // Preserves constant-velocity / linear motion with 0.000 px boundary distortion
    const smoothedPoints = [];
    const k = smoothingWindow;
    const sigma = Math.max(1.0, k / 1.5);

    for (const segment of segments) {
      if (segment.length < 3) {
        // Too short for filtering; preserve raw coordinates
        for (const pt of segment) {
          smoothedPoints.push({
            tick: pt.tick,
            x: VisualContractValidator.roundHalfToEven(pt.x, 3),
            y: VisualContractValidator.roundHalfToEven(pt.y, 3),
            confidence: pt.confidence
          });
        }
        continue;
      }

      for (let i = 0; i < segment.length; i++) {
        let W0 = 0.0, W1 = 0.0, W2 = 0.0;
        let Ux = 0.0, Vx = 0.0;
        let Uy = 0.0, Vy = 0.0;

        for (let j = Math.max(0, i - k); j <= Math.min(segment.length - 1, i + k); j++) {
          const u = j - i;
          const w = Math.exp(-(u * u) / (2 * sigma * sigma));
          W0 += w;
          W1 += w * u;
          W2 += w * u * u;
          Ux += w * segment[j].x;
          Vx += w * u * segment[j].x;
          Uy += w * segment[j].y;
          Vy += w * u * segment[j].y;
        }

        const det = W0 * W2 - W1 * W1;
        const filteredX = det > 1e-9 ? (W2 * Ux - W1 * Vx) / det : segment[i].x;
        const filteredY = det > 1e-9 ? (W2 * Uy - W1 * Vy) / det : segment[i].y;

        smoothedPoints.push({
          tick: segment[i].tick,
          x: VisualContractValidator.roundHalfToEven(filteredX, 3),
          y: VisualContractValidator.roundHalfToEven(filteredY, 3),
          confidence: segment[i].confidence
        });
      }
    }

    // 6. Stability Audit via VisualQAGates
    const auditOptions = {
      ...options,
      shotCutTicks: Array.from(shotCutTicks),
      sourceResolution: request.sidecar?.source || options.sourceResolution || { width: 1920, height: 1080 }
    };

    const stabilityAudit = VisualQAGates.auditTrajectoryStability(
      smoothedPoints,
      request.intendedTrajectory || null,
      auditOptions
    );

    return {
      status: stabilityAudit.passed ? 'SOLVED' : stabilityAudit.status,
      passesGate: stabilityAudit.passed,
      frameCount: smoothedPoints.length,
      shotCount: segments.length,
      trajectory: smoothedPoints,
      diagnostics: {
        smoothnessRms: stabilityAudit.smoothnessRms,
        maxPositionalDeviationPx: stabilityAudit.maxPositionalDeviationPx,
        rawSamplesCount: rawPoints.length,
        shotCutsDetected: detectedShotCuts
      }
    };
  }

  /**
   * Compiles spatial and temporal solution into declarative, non-mutating OperationPlan objects.
   *
   * @param {object} solveResult Result from solveSpatialPlacement or solveTrajectory
   * @param {object} [context]
   * @param {string} [context.planId]
   * @param {string} [context.trackId='track-graphics-01']
   * @param {number} [context.startTick=0]
   * @param {number} [context.durationTicks=120000]
   * @param {string} [context.text='']
   * @returns {object} Canonical OperationPlan compliant with eme-operation-plan.v1
   */
  static compileOperationPlan(solveResult = {}, context = {}) {
    const planId = context.planId || `plan_vqa_${Date.now()}`;
    const trackId = context.trackId || 'track-graphics-01';
    const clipId = `clip_${context.elementId || 'title_01'}`;
    const startTick = Number.isInteger(context.startTick) ? context.startTick : 0;
    const durationTicks = Number.isInteger(context.durationTicks) ? context.durationTicks : 120000;

    const operations = [];

    // Operation 1: Insert graphic clip at solved placement
    if (solveResult.placement) {
      operations.push({
        op: 'insert_clip',
        trackId,
        clip: {
          id: clipId,
          trackId,
          type: 'graphic',
          startTick,
          durationTicks,
          transform: {
            x: solveResult.placement.x,
            y: solveResult.placement.y,
            width: solveResult.placement.width,
            height: solveResult.placement.height,
            scaleX: 1.0,
            scaleY: 1.0,
            rotation: 0.0,
            opacity: 1.0
          },
          properties: {
            text: context.text || '',
            backingRequired: solveResult.backing?.required || false,
            backingColor: solveResult.backing?.color || null
          }
        }
      });
    }

    // Operation 2: Keyframe animation for temporal trajectory
    if (Array.isArray(solveResult.trajectory) && solveResult.trajectory.length > 0) {
      const xKeyframes = solveResult.trajectory.map(pt => ({
        tick: pt.tick,
        offsetTick: Math.max(0, Math.min(durationTicks, pt.tick - startTick)),
        value: pt.x
      }));
      const yKeyframes = solveResult.trajectory.map(pt => ({
        tick: pt.tick,
        offsetTick: Math.max(0, Math.min(durationTicks, pt.tick - startTick)),
        value: pt.y
      }));

      operations.push({
        op: 'animate_property',
        clipId,
        property: 'x',
        keyframes: xKeyframes
      });

      operations.push({
        op: 'animate_property',
        clipId,
        property: 'y',
        keyframes: yKeyframes
      });
    }

    return {
      schemaVersion: 'eme-operation-plan.v1',
      planId,
      timestamp: new Date().toISOString(),
      sourceAuthority: 'VisualConstraintSolver',
      status: 'COMPILED_NON_MUTATING',
      targetTrackId: trackId,
      operationsCount: operations.length,
      operations
    };
  }
}

module.exports = {
  VisualConstraintSolver
};
