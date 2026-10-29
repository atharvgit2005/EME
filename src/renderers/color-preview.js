/**
 * EME GPU & Real-Time Color Preview Engine (CG-01 / Phase 17)
 * Implements GPU-compatible GLSL fragment shader generator,
 * optimized fast preview evaluation, and 4-up Multi-LUT comparison matrix.
 */

const { gradeImageBuffer } = require('../engine/color-operations.js');
const { getOrLoadLut } = require('../engine/lut-evaluator.js');

/**
 * Generates GLSL ES 3.0 Fragment Shader code implementing the EME Color Grade Graph
 */
function generateGlslColorGradeShader() {
  return `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler3D u_lut3d;

// Grading uniforms
uniform bool u_enabled;
uniform float u_exposure;        // in EV
uniform vec2 u_whiteBalance;     // x: temp (-1..1), y: tint (-1..1)
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_offset;

// 3D LUT uniforms
uniform bool u_lutEnabled;
uniform float u_lutIntensity;    // 0..1

// Skin protection
uniform bool u_skinEnabled;
uniform float u_skinWeight;

// Rec.709 OETF / EOTF
float rec709ToLinear(float v) {
  return v < 0.081 ? v / 4.5 : pow((v + 0.099) / 1.099, 1.0 / 0.45);
}
vec3 rec709ToLinear(vec3 c) {
  return vec3(rec709ToLinear(c.r), rec709ToLinear(c.g), rec709ToLinear(c.b));
}

float linearToRec709(float v) {
  return v < 0.018 ? 4.5 * v : 1.099 * pow(max(0.0, v), 0.45) - 0.099;
}
vec3 linearToRec709(vec3 c) {
  return vec3(linearToRec709(c.r), linearToRec709(c.g), linearToRec709(c.b));
}

void main() {
  vec4 orig = texture(u_image, v_texCoord);
  if (!u_enabled) {
    fragColor = orig;
    return;
  }

  vec3 rgb = clamp(orig.rgb, 0.0, 1.0);

  // 1. Exposure and White Balance in Linear-Light Space
  if (u_exposure != 0.0 || u_whiteBalance.x != 0.0 || u_whiteBalance.y != 0.0) {
    vec3 lin = rec709ToLinear(rgb);
    lin *= pow(2.0, u_exposure);
    lin.r *= (1.0 + 0.4 * u_whiteBalance.x);
    lin.b *= (1.0 - 0.4 * u_whiteBalance.x);
    lin.g *= (1.0 - 0.4 * u_whiteBalance.y);
    rgb = linearToRec709(lin);
  }

  // 2. Lift / Gamma / Gain / Offset (LGGO)
  vec3 lifted = u_lift * (1.0 - rgb) + rgb;
  vec3 gammaCorr = pow(max(vec3(0.0), lifted), 1.0 / max(vec3(0.05), u_gamma));
  rgb = clamp(u_gain * gammaCorr + u_offset, 0.0, 1.0);

  // 3. Skin Tone Protection
  if (u_skinEnabled) {
    float y = 0.2126 * orig.r + 0.7152 * orig.g + 0.0722 * orig.b;
    float cb = (orig.b - y) / 1.8556;
    float cr = (orig.r - y) / 1.5748;
    if (cb >= -0.22 && cb <= -0.04 && cr >= 0.06 && cr <= 0.24) {
      rgb = mix(rgb, orig.rgb, u_skinWeight);
    }
  }

  // 4. 3D LUT Evaluation (Hardware Tetrahedral/Trilinear texture sampling)
  if (u_lutEnabled) {
    vec3 lutOut = texture(u_lut3d, rgb).rgb;
    rgb = mix(rgb, lutOut, u_lutIntensity);
  }

  fragColor = vec4(clamp(rgb, 0.0, 1.0), orig.a);
}
`;
}

/**
 * Evaluates real-time color grading on a 1080p frame buffer and measures execution latency
 */
function benchmarkPreviewPerformance(width = 1920, height = 1080, iterations = 10, grade = null, lut = null) {
  const numBytes = width * height * 4;
  const inBuf = new Uint8ClampedArray(numBytes);
  // Fill with synthetic test frame
  for (let i = 0; i < numBytes; i += 4) {
    inBuf[i] = (i / 4) % 256;
    inBuf[i + 1] = ((i / 4) * 3) % 256;
    inBuf[i + 2] = ((i / 4) * 7) % 256;
    inBuf[i + 3] = 255;
  }

  const times = [];
  for (let iter = 0; iter < iterations; iter++) {
    const t0 = process.hrtime.bigint();
    gradeImageBuffer(inBuf, width, height, grade, lut, 4);
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;
    times.push(ms);
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const fps = 1000.0 / p50;

  return {
    width,
    height,
    iterations,
    medianMs: Number(p50.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    approxFps: Number(fps.toFixed(1))
  };
}

/**
 * Generates a 4-Up (2x2) Multi-LUT comparison image
 * Each candidate LUT is independently applied to the same base frame.
 * @param {Uint8ClampedArray} inBuf RGBA
 * @param {number} width 
 * @param {number} height 
 * @param {Array<{ title: string, lut: CubeLut }>} candidates 4 items
 * @param {object} baseGrade 
 * @returns {Uint8ClampedArray} 2x2 composite of size (width) x (height)
 */
function generateMultiLutMatrix(inBuf, width, height, candidates, baseGrade) {
  if (!candidates || candidates.length < 4) {
    throw new Error('generateMultiLutMatrix requires at least 4 candidate LUTs');
  }

  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  // Subsample base frame to half dimensions
  const subBase = new Uint8ClampedArray(halfW * halfH * 4);
  for (let y = 0; y < halfH; y++) {
    for (let x = 0; x < halfW; x++) {
      const srcIdx = ((y * 2) * width + (x * 2)) * 4;
      const dstIdx = (y * halfW + x) * 4;
      subBase[dstIdx] = inBuf[srcIdx];
      subBase[dstIdx + 1] = inBuf[srcIdx + 1];
      subBase[dstIdx + 2] = inBuf[srcIdx + 2];
      subBase[dstIdx + 3] = inBuf[srcIdx + 3];
    }
  }

  // Render each candidate independently
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const tileGrade = JSON.parse(JSON.stringify(baseGrade));
    tileGrade.lut = {
      enabled: !!candidates[i].lut,
      intensity: 1.0,
      interpolation: 'tetrahedral'
    };
    const renderedTile = gradeImageBuffer(subBase, halfW, halfH, tileGrade, candidates[i].lut, 4);
    tiles.push(renderedTile);
  }

  // Assemble into 2x2 full composite:
  // Tile 0: Top-Left  | Tile 1: Top-Right
  // Tile 2: Bottom-Left | Tile 3: Bottom-Right
  const composite = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const isBottom = y >= halfH;
    const tileY = isBottom ? y - halfH : y;

    for (let x = 0; x < width; x++) {
      const isRight = x >= halfW;
      const tileX = isRight ? x - halfW : x;

      const tileIdx = (isBottom ? 2 : 0) + (isRight ? 1 : 0);
      const srcPixIdx = (tileY * halfW + tileX) * 4;
      const dstPixIdx = (y * width + x) * 4;

      // Add a thin 2px white dividing grid between tiles
      const isGrid = (x === halfW - 1 || x === halfW || y === halfH - 1 || y === halfH);
      if (isGrid) {
        composite[dstPixIdx] = 220;
        composite[dstPixIdx + 1] = 220;
        composite[dstPixIdx + 2] = 220;
        composite[dstPixIdx + 3] = 255;
      } else {
        composite[dstPixIdx] = tiles[tileIdx][srcPixIdx];
        composite[dstPixIdx + 1] = tiles[tileIdx][srcPixIdx + 1];
        composite[dstPixIdx + 2] = tiles[tileIdx][srcPixIdx + 2];
        composite[dstPixIdx + 3] = tiles[tileIdx][srcPixIdx + 3];
      }
    }
  }

  return composite;
}

module.exports = {
  generateGlslColorGradeShader,
  benchmarkPreviewPerformance,
  generateMultiLutMatrix
};
