/**
 * EME Reference Color Operations Engine (CG-01 / Phase 17)
 * Implements the canonical pixel-level grading graph:
 * Input -> Exposure/WB (linear) -> LGGO (working) -> Curves -> HSL -> Skin Protection -> 3D LUT -> Output
 */

const {
  rec709ToLinear,
  linearToRec709,
  rgbToHsl,
  hslToRgb,
  circularHueDistance,
  rgbToYcbcr709
} = require('./color-space.js');
const { applyLutToRgb } = require('./lut-evaluator.js');

// 8 HSL Channel Center Angles (in degrees)
const HSL_CHANNEL_CENTERS = {
  red: 0.0,
  orange: 30.0,
  yellow: 60.0,
  green: 120.0,
  cyan: 180.0,
  blue: 240.0,
  purple: 280.0,
  magenta: 320.0
};

// Evaluate a single cubic Bézier segment for t in [0, 1]
function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1.0 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
  const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
  return { x, y };
}

// Solve cubic Bézier curve for y given x in [0, 1]
function evaluateCurve(points, targetX) {
  if (!points || points.length === 0) return targetX;
  if (points.length === 1) return points[0].y;

  const clX = Math.max(0.0, Math.min(1.0, targetX));

  // Find surrounding control point segment
  let segIdx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (clX >= points[i].x && clX <= points[i + 1].x) {
      segIdx = i;
      break;
    }
  }

  const p0 = { x: points[segIdx].x, y: points[segIdx].y };
  const p3 = { x: points[segIdx + 1].x, y: points[segIdx + 1].y };

  // Control handles (default to 1/3 and 2/3 along chord if not specified)
  const p1 = points[segIdx].rightControl || {
    x: p0.x + (p3.x - p0.x) / 3.0,
    y: p0.y + (p3.y - p0.y) / 3.0
  };
  const p2 = points[segIdx + 1].leftControl || {
    x: p0.x + 2.0 * (p3.x - p0.x) / 3.0,
    y: p0.y + 2.0 * (p3.y - p0.y) / 3.0
  };

  // Binary search for t parameter matching targetX
  let low = 0.0;
  let high = 1.0;
  let t = 0.5;

  for (let iter = 0; iter < 16; iter++) {
    t = (low + high) / 2.0;
    const pt = bezierPoint(p0, p1, p2, p3, t);
    if (Math.abs(pt.x - clX) < 1e-5) {
      return Math.max(0.0, Math.min(1.0, pt.y));
    }
    if (pt.x < clX) {
      low = t;
    } else {
      high = t;
    }
  }

  const finalPt = bezierPoint(p0, p1, p2, p3, t);
  return Math.max(0.0, Math.min(1.0, finalPt.y));
}

/**
 * Applies full canonical color grade graph to a single RGB pixel [0, 1]
 */
function gradePixelRgb(r, g, b, grade, loadedLut = null) {
  if (!grade || !grade.enabled) {
    return [r, g, b];
  }

  let curR = Math.max(0.0, Math.min(1.0, r));
  let curG = Math.max(0.0, Math.min(1.0, g));
  let curB = Math.max(0.0, Math.min(1.0, b));

  // 1. Exposure and White Balance in Linear-Light Space
  const hasExposure = grade.exposure !== 0.0;
  const hasWb = grade.whiteBalance && (grade.whiteBalance.temperature !== 0.0 || grade.whiteBalance.tint !== 0.0);

  if (hasExposure || hasWb) {
    let linR = rec709ToLinear(curR);
    let linG = rec709ToLinear(curG);
    let linB = rec709ToLinear(curB);

    // Exposure: linear gain 2^EV
    if (hasExposure) {
      const expGain = Math.pow(2.0, grade.exposure);
      linR *= expGain;
      linG *= expGain;
      linB *= expGain;
    }

    // White Balance
    if (hasWb) {
      const temp = Math.max(-1.0, Math.min(1.0, grade.whiteBalance.temperature));
      const tint = Math.max(-1.0, Math.min(1.0, grade.whiteBalance.tint));

      // Temperature: amber/warm (boost R, cut B) or cool (cut R, boost B)
      linR *= (1.0 + 0.4 * temp);
      linB *= (1.0 - 0.4 * temp);

      // Tint: magenta (cut G) or green (boost G)
      linG *= (1.0 - 0.4 * tint);
    }

    // Convert back to Rec.709 working domain
    curR = linearToRec709(linR);
    curG = linearToRec709(linG);
    curB = linearToRec709(linB);
  }

  // 2. Primary Correction (Lift / Gamma / Gain / Offset)
  if (grade.primary) {
    const { lift, gamma, gain, offset } = grade.primary;
    const channels = [curR, curG, curB];

    for (let c = 0; c < 3; c++) {
      const L = lift[c] || 0.0;
      const G = Math.max(0.05, gamma[c] || 1.0);
      const Gain = Math.max(0.0, gain[c] !== undefined ? gain[c] : 1.0);
      const Off = offset[c] || 0.0;

      // Lift: lifts the shadows while leaving highlights (1.0) intact
      const lifted = L * (1.0 - channels[c]) + channels[c];
      // Gamma: power curve
      const gammaCorr = lifted > 0.0 ? Math.pow(lifted, 1.0 / G) : 0.0;
      // Gain & Offset
      channels[c] = Math.max(0.0, Math.min(1.0, Gain * gammaCorr + Off));
    }

    curR = channels[0];
    curG = channels[1];
    curB = channels[2];
  }

  // 3. Cubic Curves (RGB, Master, Luma)
  if (grade.curves) {
    // Per-channel RGB curves
    if (grade.curves.red && grade.curves.red.length >= 2) curR = evaluateCurve(grade.curves.red, curR);
    if (grade.curves.green && grade.curves.green.length >= 2) curG = evaluateCurve(grade.curves.green, curG);
    if (grade.curves.blue && grade.curves.blue.length >= 2) curB = evaluateCurve(grade.curves.blue, curB);

    // Master curve
    if (grade.curves.master && grade.curves.master.length >= 2) {
      curR = evaluateCurve(grade.curves.master, curR);
      curG = evaluateCurve(grade.curves.master, curG);
      curB = evaluateCurve(grade.curves.master, curB);
    }

    // Luma curve (modulates overall luminance without shifting saturation hue)
    if (grade.curves.luma && grade.curves.luma.length >= 2) {
      const origLuma = 0.2126 * curR + 0.7152 * curG + 0.0722 * curB;
      const newLuma = evaluateCurve(grade.curves.luma, origLuma);
      if (origLuma > 1e-4) {
        const ratio = newLuma / origLuma;
        curR = Math.max(0.0, Math.min(1.0, curR * ratio));
        curG = Math.max(0.0, Math.min(1.0, curG * ratio));
        curB = Math.max(0.0, Math.min(1.0, curB * ratio));
      }
    }
  }

  // 4. 8-Channel Selective HSL Adjustments
  if (grade.hsl) {
    const { h, s, l } = rgbToHsl(curR, curG, curB);

    let deltaH = 0.0;
    let deltaS = 0.0;
    let deltaL = 0.0;
    let totalWeight = 0.0;

    for (const [chanName, centerH] of Object.entries(HSL_CHANNEL_CENTERS)) {
      const adj = grade.hsl[chanName];
      if (!adj || (adj.hue === 0 && adj.saturation === 0 && adj.lightness === 0)) continue;

      const dist = circularHueDistance(h, centerH);
      // Smooth bell curve with ~30 degree half-width
      if (dist < 45.0) {
        const weight = Math.cos((dist / 45.0) * (Math.PI / 2.0));
        deltaH += weight * adj.hue;
        deltaS += weight * adj.saturation;
        deltaL += weight * adj.lightness;
        totalWeight += weight;
      }
    }

    if (totalWeight > 0.0) {
      const newH = ((h + deltaH) % 360.0 + 360.0) % 360.0;
      const newS = Math.max(0.0, Math.min(1.0, s * (1.0 + deltaS)));
      const newL = Math.max(0.0, Math.min(1.0, l * (1.0 + deltaL)));

      const rgbFromHsl = hslToRgb(newH, newS, newL);
      curR = rgbFromHsl.r;
      curG = rgbFromHsl.g;
      curB = rgbFromHsl.b;
    }
  }

  // 5. Skin-Tone Protection (Optional)
  if (grade.skinProtection && grade.skinProtection.enabled) {
    const weight = grade.skinProtection.weight !== undefined ? grade.skinProtection.weight : 0.8;
    const { cb, cr } = rgbToYcbcr709(r, g, b); // based on original color
    // Skin locus in Rec.709 YCbCr: Cb in [-0.22, -0.04], Cr in [0.06, 0.24]
    const inSkinBox = (cb >= -0.22 && cb <= -0.04 && cr >= 0.06 && cr <= 0.24);
    if (inSkinBox) {
      // Blend back toward original un-degraded skin tones
      curR = curR * (1.0 - weight) + r * weight;
      curG = curG * (1.0 - weight) + g * weight;
      curB = curB * (1.0 - weight) + b * weight;
    }
  }

  // 6. 3D Creative LUT & Intensity Blend
  if (grade.lut && grade.lut.enabled && loadedLut) {
    const intensity = grade.lut.intensity !== undefined ? grade.lut.intensity : 1.0;
    const interp = grade.lut.interpolation || 'tetrahedral';
    const lutOut = applyLutToRgb(loadedLut, curR, curG, curB, intensity, interp);
    curR = lutOut[0];
    curG = lutOut[1];
    curB = lutOut[2];
  }

  return [
    Math.max(0.0, Math.min(1.0, curR)),
    Math.max(0.0, Math.min(1.0, curG)),
    Math.max(0.0, Math.min(1.0, curB))
  ];
}

/**
 * Grades an entire buffer of pixels in-place or into a new buffer
 * @param {Uint8ClampedArray|Buffer} inPixels RGBA or RGB
 * @param {number} width 
 * @param {number} height 
 * @param {object} grade 
 * @param {CubeLut} loadedLut 
 * @param {number} channels 3 or 4
 */
function gradeImageBuffer(inPixels, width, height, grade, loadedLut = null, channels = 4) {
  const numPixels = width * height;
  const outPixels = new Uint8ClampedArray(inPixels.length);

  for (let i = 0; i < numPixels; i++) {
    const offset = i * channels;
    const r = inPixels[offset] / 255.0;
    const g = inPixels[offset + 1] / 255.0;
    const b = inPixels[offset + 2] / 255.0;

    const [gr, gg, gb] = gradePixelRgb(r, g, b, grade, loadedLut);

    outPixels[offset] = Math.round(gr * 255.0);
    outPixels[offset + 1] = Math.round(gg * 255.0);
    outPixels[offset + 2] = Math.round(gb * 255.0);

    if (channels === 4) {
      outPixels[offset + 3] = inPixels[offset + 3]; // Preserve alpha
    }
  }

  return outPixels;
}

module.exports = {
  evaluateCurve,
  gradePixelRgb,
  gradeImageBuffer,
  HSL_CHANNEL_CENTERS
};
