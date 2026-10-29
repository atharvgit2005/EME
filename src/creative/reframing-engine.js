/**
 * Editing Mechanics Engine (EME) - Subject-Aware Reframing Engine
 *
 * Implements Human Subject Centering & 9:16 Reframing:
 * - Upper-body composition analysis (face, head, torso, both shoulders).
 * - Balance both shoulders with natural margins; avoid one-sided shoulder clipping.
 * - Natural headroom allocation (12%-18% from top).
 * - No video rotation for natural posture tilt.
 * - Temporal smoothing across frame trajectories (EMA / box window).
 * - Fail-closed honesty: explicit validated fallback when tracking is missing or unreliable.
 */

class ReframingEngine {
  /**
   * Calculate 9:16 subject-aware crop for a single frame or static observation.
   *
   * @param {object} params
   * @param {{width: number, height: number}} params.sourceDimensions Source canvas dimensions (e.g. 1920x1080)
   * @param {{width: number, height: number}} [params.targetDimensions={width: 1080, height: 1920}] Target dimensions
   * @param {object} [params.observation] Subject observation (face, head, shoulders, torso)
   * @param {object} [options] Reframing configuration options
   * @param {number} [options.targetHeadroomRatio=0.15] Ideal headroom fraction
   * @param {number} [options.shoulderMarginPx=32] Minimum margin beyond shoulder endpoints
   * @returns {{
   *   status: 'OPTIMAL_SUBJECT_CENTERED' | 'FALLBACK_GEOMETRIC_CENTER' | 'CONSTRAINED_FIT',
   *   cropRect: {x: number, y: number, width: number, height: number},
   *   anchorComposition: object,
   *   diagnostics: object
   * }}
   */
  static calculateSubjectCrop({ sourceDimensions, targetDimensions = { width: 1080, height: 1920 }, observation = null, options = {} }) {
    if (!sourceDimensions || sourceDimensions.width <= 0 || sourceDimensions.height <= 0) {
      throw new Error('Valid sourceDimensions {width, height} required');
    }

    const srcW = sourceDimensions.width;
    const srcH = sourceDimensions.height;
    const targetAspect = targetDimensions.width / targetDimensions.height; // e.g. 9/16 = 0.5625

    // 1. Determine maximum available 9:16 crop window inside source canvas
    let cropH = srcH;
    let cropW = Math.round(cropH * targetAspect);

    if (cropW > srcW) {
      cropW = srcW;
      cropH = Math.round(cropW / targetAspect);
    }

    // Ensure integer dimensions
    cropW = Math.floor(cropW);
    cropH = Math.floor(cropH);

    const maxX = srcW - cropW;
    const maxY = srcH - cropH;

    // 2. Handle missing or invalid observations honestly
    if (!observation || typeof observation !== 'object' || (!observation.face && !observation.shoulders && !observation.upperBody)) {
      const defaultX = Math.round(maxX / 2);
      const defaultY = Math.round(maxY / 2);
      return {
        status: 'FALLBACK_GEOMETRIC_CENTER',
        fallbackUsed: true,
        reason: 'Tracking data missing or contains no upper body/face observations',
        cropRect: { x: defaultX, y: defaultY, width: cropW, height: cropH },
        anchorComposition: {
          subject_x: 0.5,
          subject_y: 0.5,
          left_shoulder_visible: false,
          right_shoulder_visible: false
        },
        diagnostics: {
          confidence: 0.0,
          sourceDimensions,
          cropDimensions: { width: cropW, height: cropH }
        }
      };
    }

    const headroomRatio = options.targetHeadroomRatio ?? 0.15;
    const shoulderMargin = options.shoulderMarginPx ?? 32;

    const face = observation.face; // { x, y, width, height, confidence }
    const shoulders = observation.shoulders; // { left: {x, y, confidence}, right: {x, y, confidence} }
    const torso = observation.torso || observation.upperBody; // { x, y, width, height, confidence }

    let anchorX = srcW / 2;
    let anchorY = srcH / 2;
    let leftShoulderVis = false;
    let rightShoulderVis = false;
    let shoulderBalance = null;
    let shoulderSpan = 0;
    let isConstrained = false;
    let landmarkResolved = false;

    // 3. Composition Priority: Both Shoulders + Head/Torso Posture Balance
    if (shoulders && shoulders.left && shoulders.right) {
      const leftS = shoulders.left;
      const rightS = shoulders.right;
      leftShoulderVis = (leftS.confidence ?? 1.0) >= 0.4;
      rightShoulderVis = (rightS.confidence ?? 1.0) >= 0.4;

      if (leftShoulderVis && rightShoulderVis) {
        landmarkResolved = true;
        // Natural center between left and right shoulders
        const minShoulderX = Math.min(leftS.x, rightS.x);
        const maxShoulderX = Math.max(leftS.x, rightS.x);
        shoulderSpan = maxShoulderX - minShoulderX;
        const shoulderMidX = (leftS.x + rightS.x) / 2;

        // Check head tilt / posture offset
        let headCenterX = shoulderMidX;
        if (face && (face.confidence ?? 1.0) >= 0.4) {
          headCenterX = face.x + (face.width / 2);
        }

        // Anchor is weighted between shoulder span midpoint (65%) and head center (35%)
        // This ensures both shoulders remain preserved without cutting off one side when head tilts
        anchorX = (shoulderMidX * 0.65) + (headCenterX * 0.35);

        // Verify shoulder preservation within crop width
        const requiredSpan = shoulderSpan + (shoulderMargin * 2);
        if (requiredSpan > cropW) {
          isConstrained = true;
        }

        // Evaluate vertical anchor based on face top and headroom
        if (face && (face.confidence ?? 1.0) >= 0.4) {
          const desiredFaceTopY = cropH * headroomRatio;
          anchorY = face.y - desiredFaceTopY + (cropH / 2);
        } else {
          const shoulderAvgY = (leftS.y + rightS.y) / 2;
          anchorY = shoulderAvgY - (cropH * 0.25) + (cropH / 2);
        }

        // Shoulder balance ratio
        shoulderBalance = (anchorX - minShoulderX) / (shoulderSpan || 1);
      } else if (leftShoulderVis || rightShoulderVis) {
        landmarkResolved = true;
        // One shoulder visible, use face and visible shoulder to balance
        const visibleS = leftShoulderVis ? leftS : rightS;
        if (face && (face.confidence ?? 1.0) >= 0.4) {
          const faceCenterX = face.x + (face.width / 2);
          const dir = leftShoulderVis ? 1 : -1;
          const estimatedOtherShoulderX = faceCenterX + (dir * Math.abs(faceCenterX - visibleS.x));
          anchorX = (visibleS.x + estimatedOtherShoulderX) / 2;
          const desiredFaceTopY = cropH * headroomRatio;
          anchorY = face.y - desiredFaceTopY + (cropH / 2);
        } else {
          anchorX = visibleS.x;
          anchorY = visibleS.y;
        }
      }
    }

    if (!landmarkResolved && face && (face.confidence ?? 1.0) >= 0.4) {
      landmarkResolved = true;
      // Face only fallback: center on face with safe upper-body bias
      anchorX = face.x + (face.width / 2);
      const desiredFaceTopY = cropH * headroomRatio;
      anchorY = face.y - desiredFaceTopY + (cropH / 2);
    } else if (!landmarkResolved && torso && (torso.confidence ?? 1.0) >= 0.4) {
      landmarkResolved = true;
      anchorX = torso.x + (torso.width / 2);
      anchorY = torso.y + (cropH * 0.2);
    }

    // If all observation landmarks were below confidence threshold, fail-closed to geometric center
    if (!landmarkResolved) {
      const defaultX = Math.round(maxX / 2);
      const defaultY = Math.round(maxY / 2);
      return {
        status: 'FALLBACK_GEOMETRIC_CENTER',
        fallbackUsed: true,
        reason: 'Observation landmarks below confidence threshold (0.4); geometric center fallback used; subject centering NOT guaranteed',
        cropRect: { x: defaultX, y: defaultY, width: cropW, height: cropH },
        anchorComposition: {
          subject_x: 0.5,
          subject_y: 0.5,
          left_shoulder_visible: false,
          right_shoulder_visible: false
        },
        diagnostics: {
          confidence: 0.0,
          sourceDimensions,
          cropDimensions: { width: cropW, height: cropH }
        }
      };
    }

    // 4. Calculate final crop rect clamped strictly to source canvas boundaries
    let cropX = Math.round(anchorX - (cropW / 2));
    let cropY = Math.round(anchorY - (cropH / 2));

    // Clamp horizontally
    if (cropX < 0) cropX = 0;
    if (cropX > maxX) cropX = maxX;

    // Clamp vertically
    if (cropY < 0) cropY = 0;
    if (cropY > maxY) cropY = maxY;

    // Check if shoulders are clipped when both visible
    if (shoulders && shoulders.left && shoulders.right && leftShoulderVis && rightShoulderVis) {
      const minS = Math.min(shoulders.left.x, shoulders.right.x);
      const maxS = Math.max(shoulders.left.x, shoulders.right.x);

      // If crop cuts left shoulder and there is room to slide left, slide left
      if (cropX > minS - shoulderMargin && cropX > 0) {
        const adjustLeft = Math.min(cropX, (cropX - (minS - shoulderMargin)));
        cropX = Math.max(0, Math.round(cropX - adjustLeft));
      }
      // If crop cuts right shoulder and there is room to slide right, slide right
      if (cropX + cropW < maxS + shoulderMargin && cropX < maxX) {
        const adjustRight = Math.min(maxX - cropX, ((maxS + shoulderMargin) - (cropX + cropW)));
        cropX = Math.min(maxX, Math.round(cropX + adjustRight));
      }
    }

    const anchorComp = {
      subject_x: Number((anchorX / srcW).toFixed(4)),
      subject_y: Number((anchorY / srcH).toFixed(4)),
      headroom_ratio: Number((face ? (face.y - cropY) / cropH : headroomRatio).toFixed(4)),
      left_shoulder_visible: leftShoulderVis,
      right_shoulder_visible: rightShoulderVis,
      upper_body_anchor: {
        x: Number((anchorX / srcW).toFixed(4)),
        y: Number((anchorY / srcH).toFixed(4))
      }
    };
    if (shoulderBalance !== null) {
      anchorComp.shoulder_balance_ratio = Number(shoulderBalance.toFixed(4));
    }

    return {
      status: isConstrained ? 'CONSTRAINED_FIT' : 'OPTIMAL_SUBJECT_CENTERED',
      fallbackUsed: false,
      cropRect: {
        x: cropX,
        y: cropY,
        width: cropW,
        height: cropH
      },
      anchorComposition: anchorComp,
      diagnostics: {
        shoulderSpan,
        isConstrained,
        clampedX: cropX === 0 || cropX === maxX,
        clampedY: cropY === 0 || cropY === maxY
      }
    };
  }

  /**
   * Calculate precise source-to-canvas transform for a crop rectangle.
   * Maps source pixels within cropRect to fill canvasDimensions without camera tilt.
   *
   * @param {object} params
   * @param {{x: number, y: number, width: number, height: number}} params.cropRect
   * @param {{width: number, height: number}} params.sourceDimensions
   * @param {{width: number, height: number}} params.canvasDimensions
   * @returns {{x: number, y: number, scaleX: number, scaleY: number, rotation: number, opacity: number}}
   */
  static calculateCanvasTransform({ cropRect, sourceDimensions, canvasDimensions }) {
    if (!cropRect || !sourceDimensions || !canvasDimensions) {
      return { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0, opacity: 1.0 };
    }
    const scale = Math.max(
      canvasDimensions.width / cropRect.width,
      canvasDimensions.height / cropRect.height
    );
    return {
      x: Math.round(-cropRect.x * scale) || 0,
      y: Math.round(-cropRect.y * scale) || 0,
      scaleX: Number(scale.toFixed(4)),
      scaleY: Number(scale.toFixed(4)),
      rotation: 0,
      opacity: 1.0
    };
  }

  /**
   * Apply temporal smoothing across a trajectory of frame reframing results.
   * Uses Exponential Moving Average (EMA) to prevent jitter from small head movements.
   *
   * @param {Array<{tick: number, cropRect: {x: number, y: number, width: number, height: number}}>} trajectory
   * @param {object} [options]
   * @param {number} [options.alpha=0.35] Smoothing factor (0 < alpha <= 1). Lower = smoother.
   * @returns {Array<{tick: number, cropRect: {x: number, y: number, width: number, height: number}}>}
   */
  static smoothTrajectory(trajectory, options = {}) {
    if (!Array.isArray(trajectory) || trajectory.length <= 1) {
      return trajectory || [];
    }

    const alpha = typeof options.alpha === 'number' ? Math.max(0.05, Math.min(1.0, options.alpha)) : 0.35;
    const smoothed = [];

    let currentX = trajectory[0].cropRect.x;
    let currentY = trajectory[0].cropRect.y;

    for (let i = 0; i < trajectory.length; i++) {
      const item = trajectory[i];
      const targetX = item.cropRect.x;
      const targetY = item.cropRect.y;

      if (i === 0) {
        currentX = targetX;
        currentY = targetY;
      } else {
        // If movement is very small (< 4px), damp it to avoid micro-jitter
        const deltaX = targetX - currentX;
        const deltaY = targetY - currentY;

        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
          currentX = Math.round((alpha * targetX) + ((1 - alpha) * currentX));
          currentY = Math.round((alpha * targetY) + ((1 - alpha) * currentY));
        }
      }

      smoothed.push({
        tick: item.tick,
        cropRect: {
          x: currentX,
          y: currentY,
          width: item.cropRect.width,
          height: item.cropRect.height
        }
      });
    }

    return smoothed;
  }

  /**
   * Extract normalized human-subject observations from an eme-visual-intelligence.v1 sidecar.
   * Maps face and person observations into upper body landmarks (face, shoulders, torso).
   *
   * @param {object} sidecar Canonical eme-visual-intelligence.v1 sidecar document
   * @returns {Array<{tick: number, frameIndex: number, observation: object}>}
   */
  static extractObservationsFromSidecar(sidecar) {
    if (!sidecar || !Array.isArray(sidecar.frames)) return [];

    const extracted = [];
    for (const frame of sidecar.frames) {
      let faceObs = null;
      let personObs = null;

      for (const obs of frame.observations || []) {
        const conf = typeof obs.confidence === 'number'
          ? (obs.confidence > 1.0 ? obs.confidence / 1000.0 : obs.confidence)
          : 1.0;

        if (obs.type === 'face' && obs.bounds) {
          if (!faceObs || conf > faceObs.confidence) {
            faceObs = {
              x: obs.bounds.x,
              y: obs.bounds.y,
              width: obs.bounds.width,
              height: obs.bounds.height,
              confidence: conf
            };
          }
        } else if (obs.type === 'person' && obs.bounds) {
          if (!personObs || conf > personObs.confidence) {
            personObs = {
              x: obs.bounds.x,
              y: obs.bounds.y,
              width: obs.bounds.width,
              height: obs.bounds.height,
              confidence: conf
            };
          }
        }
      }

      let observation = null;
      if (faceObs || personObs) {
        observation = {};
        if (faceObs) observation.face = faceObs;
        if (personObs) {
          const pConf = personObs.confidence;
          const shoulderY = faceObs
            ? (faceObs.y + (faceObs.height * 0.95))
            : (personObs.y + (personObs.height * 0.25));

          observation.shoulders = {
            left: {
              x: Math.round(personObs.x + (personObs.width * 0.18)),
              y: Math.round(shoulderY),
              confidence: pConf
            },
            right: {
              x: Math.round(personObs.x + (personObs.width * 0.82)),
              y: Math.round(shoulderY),
              confidence: pConf
            }
          };

          observation.torso = {
            x: Math.round(personObs.x + (personObs.width * 0.15)),
            y: Math.round(faceObs ? faceObs.y + faceObs.height : personObs.y + (personObs.height * 0.25)),
            width: Math.round(personObs.width * 0.70),
            height: Math.round(personObs.height * 0.50),
            confidence: pConf
          };
        }
      }

      extracted.push({
        tick: frame.tick,
        frameIndex: frame.frameIndex,
        observation
      });
    }

    return extracted;
  }

  /**
   * Compute smoothed reframing crop trajectory across an entire tracking sidecar.
   *
   * @param {object} params
   * @param {object} params.sidecar Valid eme-visual-intelligence.v1 sidecar
   * @param {{width: number, height: number}} [params.targetDimensions={width: 1080, height: 1920}]
   * @param {object} [options]
   * @returns {{
   *   trajectory: Array<{tick: number, cropRect: object, anchorComposition: object, status: string}>,
   *   smoothedTrajectory: Array<{tick: number, cropRect: object}>,
   *   overallStatus: string,
   *   limitations: string[]
   * }}
   */
  static computeTrajectoryFromSidecar({ sidecar, targetDimensions = { width: 1080, height: 1920 }, options = {} }) {
    if (!sidecar || !Array.isArray(sidecar.frames) || sidecar.frames.length === 0) {
      const srcW = sidecar?.source?.width || 1920;
      const srcH = sidecar?.source?.height || 1080;
      const fallbackCrop = this.calculateSubjectCrop({
        sourceDimensions: { width: srcW, height: srcH },
        targetDimensions,
        observation: null
      });
      return {
        trajectory: [{ tick: 0, cropRect: fallbackCrop.cropRect, anchorComposition: fallbackCrop.anchorComposition, status: fallbackCrop.status }],
        smoothedTrajectory: [{ tick: 0, cropRect: fallbackCrop.cropRect }],
        overallStatus: 'FALLBACK_GEOMETRIC_CENTER',
        limitations: ['Tracking sidecar missing or contains no frames; geometric center used']
      };
    }

    const sourceDimensions = {
      width: sidecar.source?.width || 1920,
      height: sidecar.source?.height || 1080
    };

    const frameObservations = this.extractObservationsFromSidecar(sidecar);
    const rawTrajectory = [];
    const limitations = [];
    let fallbackCount = 0;

    for (const frame of frameObservations) {
      const result = this.calculateSubjectCrop({
        sourceDimensions,
        targetDimensions,
        observation: frame.observation,
        options
      });

      if (result.fallbackUsed) fallbackCount++;
      rawTrajectory.push({
        tick: frame.tick,
        cropRect: result.cropRect,
        anchorComposition: result.anchorComposition,
        status: result.status
      });
    }

    if (fallbackCount > 0) {
      limitations.push(`${fallbackCount}/${frameObservations.length} frames used geometric fallback due to missing/low-confidence landmarks`);
    }

    const smoothed = this.smoothTrajectory(
      rawTrajectory.map(r => ({ tick: r.tick, cropRect: r.cropRect })),
      options
    );

    return {
      trajectory: rawTrajectory,
      smoothedTrajectory: smoothed,
      overallStatus: fallbackCount === frameObservations.length
        ? 'FALLBACK_GEOMETRIC_CENTER'
        : (fallbackCount > 0 ? 'PARTIAL_SUBJECT_TRACKING' : 'OPTIMAL_SUBJECT_CENTERED'),
      limitations
    };
  }

  /**
   * Transform sidecar observation coordinates from source canvas (1920x1080)
   * into target reframed deliverable canvas space (1080x1920).
   * Used for face-safe graphic placement on the reframed canvas.
   *
   * @param {object} params
   * @param {object} params.sidecar Original eme-visual-intelligence.v1 sidecar
   * @param {{x: number, y: number, width: number, height: number}} params.cropRect
   * @param {{width: number, height: number}} [params.canvasDimensions={width: 1080, height: 1920}]
   * @returns {object} Transformed sidecar document in canvas coordinates
   */
  static transformSidecarToCanvasCoordinates({ sidecar, cropRect, canvasDimensions = { width: 1080, height: 1920 } }) {
    if (!sidecar) return null;
    if (!cropRect) return structuredClone(sidecar);

    const scaleX = canvasDimensions.width / cropRect.width;
    const scaleY = canvasDimensions.height / cropRect.height;

    const transformed = structuredClone(sidecar);
    transformed.source = {
      ...transformed.source,
      width: canvasDimensions.width,
      height: canvasDimensions.height
    };

    if (Array.isArray(transformed.frames)) {
      for (const frame of transformed.frames) {
        if (Array.isArray(frame.observations)) {
          for (const obs of frame.observations) {
            if (obs.bounds) {
              const canvasX = Math.round((obs.bounds.x - cropRect.x) * scaleX);
              const canvasY = Math.round((obs.bounds.y - cropRect.y) * scaleY);
              const canvasW = Math.round(obs.bounds.width * scaleX);
              const canvasH = Math.round(obs.bounds.height * scaleY);

              obs.bounds = {
                x: canvasX,
                y: canvasY,
                width: canvasW,
                height: canvasH
              };
            }
          }
        }
      }
    }

    return transformed;
  }
}

module.exports = {
  ReframingEngine
};
