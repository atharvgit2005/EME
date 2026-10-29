/**
 * EME 3D LUT Reference Evaluator (CG-01 / Phase 17)
 * Implements Nearest, Trilinear, and Tetrahedral interpolation algorithms
 * with exact intensity blending and domain normalization.
 */

const { parseCubeLutFile, parseCubeLutContent } = require('./lut-parser.js');

const _lutCache = new Map();

function getOrLoadLut(pathOrContent, isFile = true) {
  if (isFile) {
    if (_lutCache.has(pathOrContent)) {
      return _lutCache.get(pathOrContent);
    }
    const lut = parseCubeLutFile(pathOrContent);
    _lutCache.set(pathOrContent, lut);
    return lut;
  } else {
    return parseCubeLutContent(pathOrContent);
  }
}

/**
 * Evaluates a 3D LUT at continuous coordinates (r, g, b)
 * @param {CubeLut} lut 
 * @param {number} r 0.0 to 1.0
 * @param {number} g 0.0 to 1.0
 * @param {number} b 0.0 to 1.0
 * @param {'tetrahedral'|'trilinear'|'nearest'} interpolation 
 * @returns {[number, number, number]} evaluated [R, G, B]
 */
function evaluateCubeLut(lut, r, g, b, interpolation = 'tetrahedral') {
  const dMin = lut.domainMin;
  const dMax = lut.domainMax;

  // Normalize into unit grid space [0, size - 1]
  const normR = (r - dMin[0]) / (dMax[0] - dMin[0]);
  const normG = (g - dMin[1]) / (dMax[1] - dMin[1]);
  const normB = (b - dMin[2]) / (dMax[2] - dMin[2]);

  // Clamp to domain bounds
  const clampedR = Math.max(0.0, Math.min(1.0, normR));
  const clampedG = Math.max(0.0, Math.min(1.0, normG));
  const clampedB = Math.max(0.0, Math.min(1.0, normB));

  const scale = lut.size - 1;
  const gridR = clampedR * scale;
  const gridG = clampedG * scale;
  const gridB = clampedB * scale;

  const iR0 = Math.floor(gridR);
  const iG0 = Math.floor(gridG);
  const iB0 = Math.floor(gridB);

  const iR1 = Math.min(scale, iR0 + 1);
  const iG1 = Math.min(scale, iG0 + 1);
  const iB1 = Math.min(scale, iB0 + 1);

  const dR = gridR - iR0;
  const dG = gridG - iG0;
  const dB = gridB - iB0;

  if (interpolation === 'nearest') {
    const nearR = dR < 0.5 ? iR0 : iR1;
    const nearG = dG < 0.5 ? iG0 : iG1;
    const nearB = dB < 0.5 ? iB0 : iB1;
    return lut.getEntry(nearR, nearG, nearB);
  }

  // 8 corner vertices of the local grid cube
  const v000 = lut.getEntry(iR0, iG0, iB0);
  const v100 = lut.getEntry(iR1, iG0, iB0);
  const v010 = lut.getEntry(iR0, iG1, iB0);
  const v110 = lut.getEntry(iR1, iG1, iB0);
  const v001 = lut.getEntry(iR0, iG0, iB1);
  const v101 = lut.getEntry(iR1, iG0, iB1);
  const v011 = lut.getEntry(iR0, iG1, iB1);
  const v111 = lut.getEntry(iR1, iG1, iB1);

  if (interpolation === 'trilinear') {
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const c00 = v000[c] * (1 - dR) + v100[c] * dR;
      const c01 = v001[c] * (1 - dR) + v101[c] * dR;
      const c10 = v010[c] * (1 - dR) + v110[c] * dR;
      const c11 = v011[c] * (1 - dR) + v111[c] * dR;

      const c0 = c00 * (1 - dG) + c10 * dG;
      const c1 = c01 * (1 - dG) + c11 * dG;

      out[c] = c0 * (1 - dB) + c1 * dB;
    }
    return out;
  }

  // Tetrahedral interpolation (Standard for professional color grading)
  // Subdivides unit cube into 6 tetrahedra based on ordering of dR, dG, dB
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    if (dR >= dG && dG >= dB) {
      out[c] = (1 - dR) * v000[c] + (dR - dG) * v100[c] + (dG - dB) * v110[c] + dB * v111[c];
    } else if (dR >= dB && dB > dG) {
      out[c] = (1 - dR) * v000[c] + (dR - dB) * v100[c] + (dB - dG) * v101[c] + dG * v111[c];
    } else if (dG > dR && dR >= dB) {
      out[c] = (1 - dG) * v000[c] + (dG - dR) * v010[c] + (dR - dB) * v110[c] + dB * v111[c];
    } else if (dG >= dB && dB > dR) {
      out[c] = (1 - dG) * v000[c] + (dG - dB) * v010[c] + (dB - dR) * v011[c] + dR * v111[c];
    } else if (dB > dR && dR >= dG) {
      out[c] = (1 - dB) * v000[c] + (dB - dR) * v001[c] + (dR - dG) * v101[c] + dG * v111[c];
    } else { // dB > dG > dR
      out[c] = (1 - dB) * v000[c] + (dB - dG) * v001[c] + (dG - dR) * v011[c] + dR * v111[c];
    }
  }

  return out;
}

/**
 * Evaluates LUT and blends with original color using intensity parameter
 * C_graded = (1 - w) * C_before + w * LUT(C_before)
 */
function applyLutToRgb(lut, r, g, b, intensity = 1.0, interpolation = 'tetrahedral') {
  if (!lut || intensity <= 0.0) {
    return [r, g, b];
  }

  const lutOut = evaluateCubeLut(lut, r, g, b, interpolation);

  if (intensity >= 1.0) {
    return lutOut;
  }

  const w = Math.max(0.0, Math.min(1.0, intensity));
  return [
    (1.0 - w) * r + w * lutOut[0],
    (1.0 - w) * g + w * lutOut[1],
    (1.0 - w) * b + w * lutOut[2]
  ];
}

module.exports = {
  getOrLoadLut,
  evaluateCubeLut,
  applyLutToRgb
};
