/**
 * EME Scene Intelligence & True Tone Recommendation Engine (CG-01 / Phase 17)
 * Implements non-mutating scene diagnostics:
 * - Exposure & clipping risk (highlights/shadows)
 * - Auto white balance (Grey World & White Patch) with CCT and tint estimation
 * - Skin-tone detection & vectorscope I-line alignment
 */

const { rgbToYcbcr709 } = require('./color-space.js');

/**
 * Analyzes an image buffer to generate non-mutating color grading recommendations
 * @param {Uint8ClampedArray|Buffer} pixels RGBA or RGB
 * @param {number} width 
 * @param {number} height 
 * @param {number} channels 3 or 4
 * @returns {object} SceneAnalysis recommendation object
 */
function analyzeScene(pixels, width, height, channels = 4) {
  const numPixels = width * height;
  if (numPixels === 0) {
    throw new Error('Cannot analyze empty image buffer');
  }

  let sumR = 0, sumG = 0, sumB = 0;
  let shadowClips = 0, highlightClips = 0;
  let skinPixelCount = 0;
  let sumSkinCb = 0, sumSkinCr = 0;

  for (let i = 0; i < numPixels; i++) {
    const offset = i * channels;
    const r = pixels[offset] / 255.0;
    const g = pixels[offset + 1] / 255.0;
    const b = pixels[offset + 2] / 255.0;

    sumR += r;
    sumG += g;
    sumB += b;

    // Luminance Rec.709
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (y < 0.02) shadowClips++;
    if (y > 0.98) highlightClips++;

    // Skin detection in Rec.709 YCbCr
    const { cb, cr } = rgbToYcbcr709(r, g, b);
    // Skin locus: Cb in [-0.22, -0.04], Cr in [0.06, 0.24], Y in [0.15, 0.90]
    if (cb >= -0.22 && cb <= -0.04 && cr >= 0.06 && cr <= 0.24 && y >= 0.15 && y <= 0.90) {
      skinPixelCount++;
      sumSkinCb += cb;
      sumSkinCr += cr;
    }
  }

  const meanR = sumR / numPixels;
  const meanG = sumG / numPixels;
  const meanB = sumB / numPixels;
  const meanLuma = 0.2126 * meanR + 0.7152 * meanG + 0.0722 * meanB;

  const shadowClipRatio = shadowClips / numPixels;
  const highlightClipRatio = highlightClips / numPixels;

  // Exposure recommendation (target standard middle gray ~0.18 linear / ~0.45 Rec.709)
  let recommendedEv = 0.0;
  if (meanLuma > 0.05 && meanLuma < 0.95) {
    const targetLuma = 0.45;
    recommendedEv = Math.log2(targetLuma / meanLuma);
    recommendedEv = Math.max(-2.5, Math.min(2.5, Number(recommendedEv.toFixed(2))));
  }

  // White Balance Estimation (Grey World hypothesis)
  // Standard neutral: meanR ≈ meanG ≈ meanB
  const sumChannels = meanR + meanG + meanB;
  let recTemp = 0.0;
  let recTint = 0.0;
  let estimatedCCT = 6500;

  if (sumChannels > 1e-4) {
    // If meanR > meanB, scene is warm (low CCT), recommend negative temp (cooling)
    // If meanB > meanR, scene is cool (high CCT), recommend positive temp (warming)
    recTemp = (meanB - meanR) / sumChannels * 2.5;
    recTemp = Math.max(-1.0, Math.min(1.0, Number(recTemp.toFixed(3))));

    // If meanG > average(R, B), green cast, recommend positive tint (magenta)
    const expectedG = 0.5 * (meanR + meanB);
    recTint = (expectedG - meanG) / sumChannels * 2.5;
    recTint = Math.max(-1.0, Math.min(1.0, Number(recTint.toFixed(3))));

    // Approximate CCT from Red/Blue ratio
    const rbRatio = Math.max(0.1, meanR / Math.max(0.01, meanB));
    estimatedCCT = Math.round(6500 / Math.pow(rbRatio, 0.75));
    estimatedCCT = Math.max(2500, Math.min(12000, estimatedCCT));
  }

  // Confidence estimation: reduced if high clipping or extreme ratios
  let confidence = 0.95;
  if (shadowClipRatio > 0.1 || highlightClipRatio > 0.1) confidence -= 0.25;
  if (Math.abs(meanR - meanB) > 0.4) confidence -= 0.2;
  confidence = Math.max(0.2, Math.min(1.0, Number(confidence.toFixed(2))));

  // Skin Detection metrics
  const skinCoverage = Number((skinPixelCount / numPixels).toFixed(4));
  const skinDetected = skinCoverage >= 0.005; // at least 0.5% of pixels

  let meanSkinAngleDeg = 123.0;
  let iLineDeviationDeg = 0.0;

  if (skinDetected && skinPixelCount > 0) {
    const meanCb = sumSkinCb / skinPixelCount;
    const meanCr = sumSkinCr / skinPixelCount;
    // Standard vectorscope angle in Cb-Cr plane (0 deg = +Cb, 90 deg = +Cr, 180 deg = -Cb)
    // Skin tones lie along the I-line at approximately 123 degrees
    let angle = Math.atan2(meanCr, meanCb) * (180.0 / Math.PI);
    if (angle < 0) angle += 360.0;
    meanSkinAngleDeg = Number(angle.toFixed(1));
    iLineDeviationDeg = Number(Math.abs(meanSkinAngleDeg - 123.0).toFixed(1));
  }

  return {
    provenance: "EME Scene Intelligence Engine v1.0",
    timestamp: new Date().toISOString(),
    exposure: {
      meanLuminance: Number(meanLuma.toFixed(3)),
      clippingRisk: {
        shadows: Number(shadowClipRatio.toFixed(4)),
        highlights: Number(highlightClipRatio.toFixed(4))
      },
      recommendedEvOffset: recommendedEv
    },
    whiteBalance: {
      estimatedCCT,
      confidence,
      recommendedTemperatureOffset: recTemp,
      recommendedTintOffset: recTint
    },
    skin: {
      skinDetected,
      skinCoverage,
      meanSkinAngleDeg,
      iLineDeviationDeg,
      recommendedProtectionWeight: skinDetected ? 0.85 : 0.0
    }
  };
}

module.exports = {
  analyzeScene
};
