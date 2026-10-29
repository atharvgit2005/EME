/**
 * EME Color Space & Mathematical Conversions (CG-01 / Phase 17)
 * Implements Rec.709, sRGB, linear conversions, HSL circular color space, and YCbCr.
 */

// Rec.709 Transfer Function (OETF and EOTF)
function rec709ToLinear(val) {
  const v = Math.max(0.0, Math.min(1.0, val));
  if (v < 0.081) {
    return v / 4.5;
  }
  return Math.pow((v + 0.099) / 1.099, 1.0 / 0.45);
}

function linearToRec709(val) {
  const v = Math.max(0.0, val);
  if (v < 0.018) {
    return Math.min(1.0, 4.5 * v);
  }
  return Math.min(1.0, 1.099 * Math.pow(v, 0.45) - 0.099);
}

// sRGB Transfer Function
function srgbToLinear(val) {
  const v = Math.max(0.0, Math.min(1.0, val));
  if (v <= 0.04045) {
    return v / 12.92;
  }
  return Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(val) {
  const v = Math.max(0.0, val);
  if (v <= 0.0031308) {
    return Math.min(1.0, 12.92 * v);
  }
  return Math.min(1.0, 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055);
}

// RGB [0,1] <-> HSL [H in 0..360, S in 0..1, L in 0..1]
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2.0;

  if (max === min) {
    return { h: 0.0, s: 0.0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2.0 - max - min) : d / (max + min);

  let h = 0.0;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6.0 : 0.0);
  } else if (max === g) {
    h = (b - r) / d + 2.0;
  } else {
    h = (r - g) / d + 4.0;
  }
  h = (h * 60.0) % 360.0;
  if (h < 0.0) h += 360.0;

  return { h, s, l };
}

function hueToRgb(p, q, t) {
  let val = t;
  if (val < 0) val += 1;
  if (val > 1) val -= 1;
  if (val < 1 / 6) return p + (q - p) * 6 * val;
  if (val < 1 / 2) return q;
  if (val < 2 / 3) return p + (q - p) * (2 / 3 - val) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const normH = ((h % 360) + 360) % 360 / 360.0;
  const normS = Math.max(0.0, Math.min(1.0, s));
  const normL = Math.max(0.0, Math.min(1.0, l));

  if (normS === 0) {
    return { r: normL, g: normL, b: normL };
  }

  const q = normL < 0.5 ? normL * (1 + normS) : normL + normS - normL * normS;
  const p = 2 * normL - q;

  const r = hueToRgb(p, q, normH + 1 / 3);
  const g = hueToRgb(p, q, normH);
  const b = hueToRgb(p, q, normH - 1 / 3);

  return {
    r: Math.max(0.0, Math.min(1.0, r)),
    g: Math.max(0.0, Math.min(1.0, g)),
    b: Math.max(0.0, Math.min(1.0, b))
  };
}

// Rec.709 RGB to YCbCr (ITU-R BT.709 standard)
// Kr = 0.2126, Kg = 0.7152, Kb = 0.0722
function rgbToYcbcr709(r, g, b) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const cb = (b - y) / 1.8556; // range approx [-0.5, 0.5]
  const cr = (r - y) / 1.5748; // range approx [-0.5, 0.5]
  return { y, cb, cr };
}

function ycbcr709ToRgb(y, cb, cr) {
  const r = y + 1.5748 * cr;
  const b = y + 1.8556 * cb;
  const g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return {
    r: Math.max(0.0, Math.min(1.0, r)),
    g: Math.max(0.0, Math.min(1.0, g)),
    b: Math.max(0.0, Math.min(1.0, b))
  };
}

// Circular hue distance in degrees: min(|h1 - h2|, 360 - |h1 - h2|)
function circularHueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360.0;
  return diff > 180.0 ? 360.0 - diff : diff;
}

module.exports = {
  rec709ToLinear,
  linearToRec709,
  srgbToLinear,
  linearToSrgb,
  rgbToHsl,
  hslToRgb,
  rgbToYcbcr709,
  ycbcr709ToRgb,
  circularHueDistance
};
