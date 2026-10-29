/**
 * VTSM-01 State Model Factory and Builder
 * 
 * Provides object modeling, coordinate conversions, motion delta computation,
 * and structure assembly for the Visual Temporal State Model.
 */

const { VtsmTimebase } = require('./timebase.js');

class VtsmStateModel {
  /**
   * Create an initial blank canonical VTSM document structure.
   */
  static createDocument({ source, rationalFps = { numerator: 30, denominator: 1 }, provenance }) {
    if (!source || !source.sha256 || !source.filePath || !source.dimensions) {
      throw new Error('source must include sha256, filePath, and dimensions { width, height }');
    }

    const normFps = VtsmTimebase.normalizeFps(rationalFps);

    return {
      version: '1.0.0',
      source: {
        sha256: source.sha256,
        filePath: source.filePath,
        dimensions: {
          width: source.dimensions.width,
          height: source.dimensions.height
        },
        durationSec: source.durationSec || 0,
        totalFrames: source.totalFrames || 0
      },
      timebase: {
        ticksPerSecond: VtsmTimebase.TICKS_PER_SECOND,
        rationalFps: normFps,
        durationTicks: source.durationSec ? VtsmTimebase.secondsToTicks(source.durationSec) : 0
      },
      shots: [],
      entities: [],
      frames: [],
      events: [],
      provenance: {
        extractor: (provenance && provenance.extractor) || 'eme-vtsm-baseline',
        version: (provenance && provenance.version) || '0.1.0',
        model: (provenance && provenance.model) || undefined,
        weights: (provenance && provenance.weights) || undefined,
        weightsSha256: (provenance && provenance.weightsSha256) || undefined,
        license: (provenance && provenance.license) || 'MIT',
        parameters: (provenance && provenance.parameters) || {},
        timestamp: (provenance && provenance.timestamp) || new Date().toISOString()
      }
    };
  }

  /**
   * Convert pixel-space bbox { x, y, width, height } to normalized bbox [0..1].
   */
  static normalizeBbox(pixelBbox, canvasWidth, canvasHeight) {
    if (!pixelBbox || canvasWidth <= 0 || canvasHeight <= 0) {
      throw new TypeError('Invalid pixel bounding box or dimensions');
    }
    const { x, y, width, height } = pixelBbox;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new TypeError(`Bbox coordinates must be finite: ${JSON.stringify(pixelBbox)}`);
    }

    return {
      x: x / canvasWidth,
      y: y / canvasHeight,
      width: width / canvasWidth,
      height: height / canvasHeight
    };
  }

  /**
   * Convert normalized bbox { x, y, width, height } to pixel-space bbox.
   */
  static denormalizeBbox(normBbox, canvasWidth, canvasHeight) {
    if (!normBbox || canvasWidth <= 0 || canvasHeight <= 0) {
      throw new TypeError('Invalid normalized bounding box or dimensions');
    }
    const { x, y, width, height } = normBbox;
    return {
      x: x * canvasWidth,
      y: y * canvasHeight,
      width: width * canvasWidth,
      height: height * canvasHeight
    };
  }

  /**
   * Compute center point from bounding box.
   */
  static computeCenter(bbox) {
    return [
      bbox.x + bbox.width * 0.5,
      bbox.y + bbox.height * 0.5
    ];
  }

  /**
   * Compute IoU (Intersection over Union) between two bounding boxes.
   */
  static computeIoU(b1, b2) {
    const x1 = Math.max(b1.x, b2.x);
    const y1 = Math.max(b1.y, b2.y);
    const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
    const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

    const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = b1.width * b1.height;
    const area2 = b2.width * b2.height;
    const unionArea = area1 + area2 - intersectionArea;

    if (unionArea <= 0) return 0.0;
    return intersectionArea / unionArea;
  }

  /**
   * Compute raw and camera-compensated motion vectors.
   */
  static computeMotion(prevCenter, currCenter, cameraMotion = null) {
    if (!prevCenter || !currCenter) {
      return {
        raw: { dx: 0, dy: 0, valid: false },
        compensated: { dx: 0, dy: 0, valid: false }
      };
    }

    const rawDx = currCenter[0] - prevCenter[0];
    const rawDy = currCenter[1] - prevCenter[1];

    let compDx = rawDx;
    let compDy = rawDy;
    let compValid = false;

    if (cameraMotion && cameraMotion.valid && cameraMotion.translation) {
      // Camera translation moves the apparent scene in opposite direction
      // Residual foreground motion = observed displacement - camera background displacement
      compDx = rawDx - cameraMotion.translation.dx;
      compDy = rawDy - cameraMotion.translation.dy;
      compValid = true;
    }

    return {
      raw: { dx: rawDx, dy: rawDy, valid: true },
      compensated: { dx: compDx, dy: compDy, valid: compValid }
    };
  }
}

module.exports = { VtsmStateModel };
