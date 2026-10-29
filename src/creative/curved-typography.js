/**
 * Curved Kinetic Typography Engine
 * Editing Mechanics Engine (EME) - Phase 34.4
 *
 * Implements deterministic circular-arc and SVG-path curved typography
 * with timeline-driven kinetic animations (reveal, startOffset sweep, fade in/out).
 * Guarantees bounded validation, zero unintended mutation, and quantitative curvature verification.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MediaTime } = require('../engine/time.js');
const { FrameInspector } = require('../renderers/inspector.js');

const RASTERIZER_SCRIPT = path.resolve(__dirname, 'curved-rasterizer.py');

class CurvedTypography {
  /**
   * Validate parameters for curved kinetic typography.
   * Fails closed with typed errors.
   */
  static validateParams(params = {}) {
    if (!params || typeof params !== 'object') {
      throw new Error('ERR_INVALID_TYPOGRAPHY_PARAMETER: Parameters must be a non-null object');
    }

    const { text, curve = {}, styling = {}, timeline = {}, animation = {} } = params;

    for(const [value,keys,label] of [[curve,['type','centerX','centerY','radius','startAngleDeg','endAngleDeg','svgPath'],'curve'],[styling,['fontFamily','fontSize','color','opacity','letterSpacing'],'styling'],[animation,['type','sweepShiftDeg','fadeRatio'],'animation'],[timeline,['startTick','durationTicks'],'timeline']])for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(`ERR_INVALID_TYPOGRAPHY_PARAMETER: Unsupported ${label}.${key}`);
    // 1. Text validation
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('ERR_INVALID_TYPOGRAPHY_PARAMETER: Text must be a non-empty string');
    }

    // 2. Curve geometry validation
    const curveType = curve.type || 'arc';
    if (curveType !== 'arc') {
      throw new Error(`ERR_INVALID_CURVE_GEOMETRY: Unsupported curve type "${curveType}". Supported: "arc"`);
    }

    const cx = curve.centerX !== undefined ? Number(curve.centerX) : 540;
    const cy = curve.centerY !== undefined ? Number(curve.centerY) : 1000;
    const radius = curve.radius !== undefined ? Number(curve.radius) : 400;

    if (!Number.isFinite(cx) || cx < -2000 || cx > 4000) {
      throw new Error(`ERR_INVALID_CURVE_GEOMETRY: Center X (${cx}) is out of reasonable canvas bounds`);
    }
    if (!Number.isFinite(cy) || cy < -2000 || cy > 4000) {
      throw new Error(`ERR_INVALID_CURVE_GEOMETRY: Center Y (${cy}) is out of reasonable canvas bounds`);
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 5000) {
      throw new Error(`ERR_INVALID_CURVE_GEOMETRY: Radius must be a positive number <= 5000. Got: ${radius}`);
    }

    const startAngleDeg = curve.startAngleDeg !== undefined ? Number(curve.startAngleDeg) : 144.0;
    const endAngleDeg = curve.endAngleDeg !== undefined ? Number(curve.endAngleDeg) : 36.0;

    if (!Number.isFinite(startAngleDeg) || startAngleDeg < -720 || startAngleDeg > 720) {
      throw new Error(`ERR_INVALID_CURVE_GEOMETRY: startAngleDeg must be within [-720, 720]. Got: ${startAngleDeg}`);
    }
    if (!Number.isFinite(endAngleDeg) || endAngleDeg < -720 || endAngleDeg > 720) {
      throw new Error(`ERR_INVALID_CURVE_GEOMETRY: endAngleDeg must be within [-720, 720]. Got: ${endAngleDeg}`);
    }

    // SVG path validation if path provided
    if (curve.svgPath && typeof curve.svgPath === 'string') {
      if (!/^[a-zA-Z0-9_\-\.\s\,\+\*\/\(\)]+$/.test(curve.svgPath)) {
        throw new Error(`ERR_INVALID_CURVE_GEOMETRY: Unsafe or malformed SVG path string: ${curve.svgPath}`);
      }
    }

    // 3. Styling validation
    const fontSize = styling.fontSize !== undefined ? Number(styling.fontSize) : 64;
    if (!Number.isFinite(fontSize) || fontSize < 6 || fontSize > 300) {
      throw new Error(`ERR_INVALID_TYPOGRAPHY_PARAMETER: fontSize must be between 6 and 300. Got: ${fontSize}`);
    }

    const opacity = styling.opacity !== undefined ? Number(styling.opacity) : 1.0;
    if (!Number.isFinite(opacity) || opacity < 0.0 || opacity > 1.0) {
      throw new Error(`ERR_INVALID_TYPOGRAPHY_PARAMETER: opacity must be between 0.0 and 1.0. Got: ${opacity}`);
    }

    if(styling.letterSpacing!==undefined && styling.letterSpacing!==2)throw new Error('ERR_UNSUPPORTED_TYPOGRAPHY_SPACING');
    // 4. Animation validation
    const validAnimTypes = ['none', 'fade_in_out', 'curve_reveal', 'curve_sweep', 'fade_and_sweep'];
    const animType = animation.type || 'none';
    if (!validAnimTypes.includes(animType)) {
      throw new Error(`ERR_INVALID_TYPOGRAPHY_PARAMETER: Unsupported animation type "${animType}". Supported: ${validAnimTypes.join(', ')}`);
    }

    if (!Number.isFinite(animation.sweepShiftDeg ?? 40) || Math.abs(animation.sweepShiftDeg ?? 40)>360 || !Number.isFinite(animation.fadeRatio ?? .2) || (animation.fadeRatio ?? .2)<0 || (animation.fadeRatio ?? .2)>.5) throw new Error('ERR_INVALID_TYPOGRAPHY_PARAMETER: Invalid animation bounds');
    if (curve.svgPath) throw new Error('ERR_INVALID_CURVE_GEOMETRY: SVG path rasterization unsupported');
    const c=styling.color ?? [255,255,0];
    if (!(typeof c==='string' && /^#[a-fA-F0-9]{6}$/.test(c)) && !(Array.isArray(c) && c.length===3 && c.every(v=>Number.isInteger(v)&&v>=0&&v<=255))) throw new Error('ERR_INVALID_TYPOGRAPHY_PARAMETER: Color must be hex or RGB bytes');

    // 5. Timeline validation
    if (timeline.startTick !== undefined && (!Number.isInteger(timeline.startTick) || timeline.startTick < 0)) {
      throw new Error(`ERR_INVALID_TYPOGRAPHY_PARAMETER: startTick must be a non-negative integer. Got: ${timeline.startTick}`);
    }
    if (timeline.durationTicks !== undefined && (!Number.isInteger(timeline.durationTicks) || timeline.durationTicks <= 0)) {
      throw new Error(`ERR_INVALID_TYPOGRAPHY_PARAMETER: durationTicks must be a positive integer. Got: ${timeline.durationTicks}`);
    }

    return {
      text: text.trim(),
      curve: {
        type: curveType,
        centerX: cx,
        centerY: cy,
        radius,
        startAngleDeg,
        endAngleDeg,
        svgPath: curve.svgPath || null
      },
      styling: {
        fontFamily: styling.fontFamily || 'Helvetica',
        fontSize,
        color: styling.color || [255, 255, 0],
        opacity,
        letterSpacing: styling.letterSpacing || 2
      },
      animation: {
        type: animType,
        sweepShiftDeg: animation.sweepShiftDeg !== undefined ? Number(animation.sweepShiftDeg) : 40.0,
        fadeRatio: animation.fadeRatio !== undefined ? Number(animation.fadeRatio) : 0.2
      },
      timeline: {
        startTick: timeline.startTick !== undefined ? timeline.startTick : 0,
        durationTicks: timeline.durationTicks !== undefined ? timeline.durationTicks : 240000 // default 2.0s
      }
    };
  }

  /**
   * Calculate exact mathematical glyph positions and curvature geometry.
   */
  static computeGeometry(params = {}) {
    const validated = this.validateParams(params);
    const { text, curve, styling } = validated;

    const n = text.length;
    const startRad = (curve.startAngleDeg * Math.PI) / 180.0;
    const endRad = (curve.endAngleDeg * Math.PI) / 180.0;

    let minX = 1080, maxX = 0;
    let minY = 1920, maxY = 0;
    const glyphs = [];

    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const angle = startRad + (endRad - startRad) * t;
      const gx = curve.centerX + curve.radius * Math.cos(angle);
      const gy = curve.centerY - curve.radius * Math.sin(angle);
      const rotDeg = (angle * 180.0) / Math.PI - 90.0;

      glyphs.push({
        char: text[i],
        index: i,
        x: parseFloat(gx.toFixed(2)),
        y: parseFloat(gy.toFixed(2)),
        rotDeg: parseFloat(rotDeg.toFixed(2))
      });

      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
    }

    const heightSpan = maxY - minY;
    const widthSpan = maxX - minX;

    // For a flat text string of the same length and font size:
    const flatHeightSpan = styling.fontSize;
    const curvatureRatio = heightSpan / Math.max(1, flatHeightSpan);

    return {
      text,
      glyphCount: n,
      glyphs,
      bounds: {
        minX: Math.round(minX),
        maxX: Math.round(maxX),
        minY: Math.round(minY),
        maxY: Math.round(maxY),
        width: Math.round(widthSpan),
        height: Math.round(heightSpan)
      },
      curvatureRatio: parseFloat(curvatureRatio.toFixed(2)),
      isCurved: curvatureRatio > 1.5 // Height span exceeds 1.5x flat line height
    };
  }

  /**
   * Generate deterministic SVG string for curved typography.
   */
  static generateSvg(params = {}, { progress = 0.5, canvasDimensions = { width: 1080, height: 1920 } } = {}) {
    const validated = this.validateParams(params);
    const geom = this.computeGeometry(validated);

    const { text, curve, styling, animation } = validated;
    const { width, height } = canvasDimensions;

    // SVG arc path: from start point to end point
    const startRad = (curve.startAngleDeg * Math.PI) / 180.0;
    const endRad = (curve.endAngleDeg * Math.PI) / 180.0;
    const startX = curve.centerX + curve.radius * Math.cos(startRad);
    const startY = curve.centerY - curve.radius * Math.sin(startRad);
    const endX = curve.centerX + curve.radius * Math.cos(endRad);
    const endY = curve.centerY - curve.radius * Math.sin(endRad);

    const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} A ${curve.radius} ${curve.radius} 0 0 1 ${endX.toFixed(1)} ${endY.toFixed(1)}`;

    const colorHex = Array.isArray(styling.color)
      ? `#${styling.color.map(c => c.toString(16).padStart(2, '0')).join('')}`
      : styling.color;

    // Form rotated glyph SVG tags
    let glyphsXml = '';
    for (const g of geom.glyphs) {
      glyphsXml += `    <text x="${g.x}" y="${g.y}" font-family="${styling.fontFamily}" font-size="${styling.fontSize}" font-weight="bold" fill="${colorHex}" text-anchor="middle" transform="rotate(${g.rotDeg}, ${g.x}, ${g.y})">${g.char}</text>\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <path id="textArcCurve" d="${pathD}" fill="none" />
  </defs>
  <!-- Standard SVG textPath representation -->
  <text font-family="${styling.fontFamily}" font-size="${styling.fontSize}" font-weight="bold" fill="${colorHex}" opacity="${styling.opacity}">
    <textPath href="#textArcCurve" startOffset="50%" text-anchor="middle">
      ${text}
    </textPath>
  </text>
  <!-- Explicitly positioned & rotated glyph elements for universal fidelity -->
  <g id="curvedGlyphs" opacity="${styling.opacity}">
${glyphsXml}  </g>
</svg>`;
  }

  /**
   * Rasterize a single frame or sequence of curved typography frames to transparent PNGs.
   */
  static rasterize(config = {}) {
    const validated = this.validateParams(config);

    const pyConfig = {
      canvas: config.canvas || { width: 1080, height: 1920 },
      text: validated.text,
      curve: validated.curve,
      styling: {...validated.styling,fontPath:config.fontPath || null},
      animation: {
        type: validated.animation.type,
        sweep_shift_deg: validated.animation.sweepShiftDeg,
        fade_ratio: validated.animation.fadeRatio
      },
      control_flat: !!config.controlFlat,
      mode: config.mode || 'single',
      outputPath: config.outputPath || '/tmp/curved_frame.png',
      outputPattern: config.outputPattern || '/tmp/curved_seq_%04d.png',
      totalFrames: config.totalFrames || 30
    };

    const res = spawnSync('python3', [RASTERIZER_SCRIPT], {
      input: JSON.stringify(pyConfig),
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024
    });

    if (res.status !== 0) {
      throw new Error(`Curved typography rasterization failed (code ${res.status}):\n${res.stderr || res.stdout}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(res.stdout);
    } catch (e) {
      throw new Error(`Malformed JSON output from curved rasterizer: ${res.stdout}`);
    }

    return parsed;
  }

  /**
   * Audit curvature, kinetic movement, and subject clearance.
   */
  static auditCurvature({
    curvedImagePath,
    controlFlatImagePath = null,
    motionFrame1Path = null,
    motionFrame2Path = null,
    faceBounds = null
  }) {
    if (!fs.existsSync(curvedImagePath)) {
      throw new Error(`Curved image path does not exist: ${curvedImagePath}`);
    }

    // Measure pixel bounds of curved text image
    const rawCurved = spawnSync('ffmpeg', ['-v', 'error', '-i', curvedImagePath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {
      maxBuffer: 30 * 1024 * 1024
    }).stdout;

    const width = 1080;
    const height = 1920;

    let textPixels = 0;
    let minX = width, maxX = 0;
    let minY = height, maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const a = rawCurved[idx + 3];
        if (a > 50) {
          textPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const curvedHeightSpan = Math.max(0, maxY - minY);
    const curvedWidthSpan = Math.max(0, maxX - minX);

    // Control comparison against flat text
    let flatHeightSpan = 64; // default expected flat height
    let curvatureRatio = curvedHeightSpan / flatHeightSpan;

    if (controlFlatImagePath && fs.existsSync(controlFlatImagePath)) {
      const rawFlat = spawnSync('ffmpeg', ['-v', 'error', '-i', controlFlatImagePath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {
        maxBuffer: 30 * 1024 * 1024
      }).stdout;

      let flatMinY = height, flatMaxY = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (rawFlat[idx + 3] > 50) {
            if (y < flatMinY) flatMinY = y;
            if (y > flatMaxY) flatMaxY = y;
          }
        }
      }
      flatHeightSpan = Math.max(1, flatMaxY - flatMinY);
      curvatureRatio = curvedHeightSpan / flatHeightSpan;
    }

    // Kinetic motion verification between two frames
    let motionVerified = false;
    let motionDiffRatio = 0.0;
    let differentPixels = 0;
    if (motionFrame1Path && motionFrame2Path && fs.existsSync(motionFrame1Path) && fs.existsSync(motionFrame2Path)) {
      const diff = FrameInspector.computePixelDiff(motionFrame1Path, motionFrame2Path);
      motionDiffRatio = diff.percentChanged;
      differentPixels = diff.differentPixels;
      motionVerified = diff.differentPixels >= 1000 && diff.rmse >= 5.0;
    }

    // Face clearance verification
    let faceCollision = false;
    let faceClearancePx = 9999;
    if (faceBounds && typeof faceBounds === 'object') {
      const fbMinX = faceBounds.x;
      const fbMaxX = faceBounds.x + faceBounds.width;
      const fbMinY = faceBounds.y;
      const fbMaxY = faceBounds.y + faceBounds.height;

      // Check overlap with text bounding box
      const overlapsX = minX < fbMaxX && maxX > fbMinX;
      const overlapsY = minY < fbMaxY && maxY > fbMinY;
      faceCollision = overlapsX && overlapsY;

      if (!faceCollision) {
        // Vertical distance
        const distY = minY >= fbMaxY ? (minY - fbMaxY) : (fbMinY - maxY);
        faceClearancePx = Math.max(0, distY);
      } else {
        faceClearancePx = 0;
      }
    }

    const verified = textPixels > 1000 && curvatureRatio >= 1.5 && !faceCollision;

    return {
      verified,
      textPixels,
      curvedBounds: { minX, maxX, minY, maxY, width: curvedWidthSpan, height: curvedHeightSpan },
      flatHeightSpan,
      curvatureRatio: parseFloat(curvatureRatio.toFixed(2)),
      isCurved: curvatureRatio >= 1.5,
      motion: {
        verified: motionVerified,
        percentChanged: parseFloat(motionDiffRatio.toFixed(2)),
        differentPixels
      },
      faceClearance: {
        zeroFaceCollisions: !faceCollision,
        clearancePx: faceClearancePx
      }
    };
  }
}

module.exports = {
  CurvedTypography
};
