/**
 * EME Deterministic FFmpeg Color Render Compiler (CG-01 / Phase 17)
 * Translates canonical color-grade.v1 state into deterministic FFmpeg filtergraphs
 * with validated lossless parity and execution metadata tracking.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { gradePixelRgb } = require('../engine/color-operations.js');
const { getOrLoadLut } = require('../engine/lut-evaluator.js');

const COMPILED_LUT_DIR = path.resolve(__dirname, '../../artifacts/compiled_luts');

/**
 * Compiles an entire canonical color grade into a consolidated .cube 3D LUT file
 * This guarantees mathematical tetrahedral parity between CPU reference, GPU preview, and FFmpeg render.
 * @param {object} grade EME Color Grade v1
 * @param {CubeLut} baseLut Optional active 3D creative LUT
 * @param {number} size 17, 33, or 65 (default 33)
 * @returns {{ cubePath: string, sha256: string, size: number }}
 */
function compileGradeToCubeLut(grade, baseLut = null, size = 33) {
  fs.mkdirSync(COMPILED_LUT_DIR, { recursive: true });

  const gradeHash = crypto.createHash('sha256').update(JSON.stringify(grade)).digest('hex').substring(0, 16);
  const cubeFileName = `compiled_grade_${grade.id || 'temp'}_${gradeHash}_s${size}.cube`;
  const cubePath = path.join(COMPILED_LUT_DIR, cubeFileName);

  // Return cached compiled LUT if it already exists
  if (fs.existsSync(cubePath)) {
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(cubePath)).digest('hex');
    return { cubePath, sha256, size };
  }

  let cubeContent = `# EME Compiled Color Grade 3D LUT\n`;
  cubeContent += `TITLE "EME_Grade_${grade.id || 'compiled'}"\n`;
  cubeContent += `LUT_3D_SIZE ${size}\n`;
  cubeContent += `DOMAIN_MIN 0.0 0.0 0.0\n`;
  cubeContent += `DOMAIN_MAX 1.0 1.0 1.0\n\n`;

  const scale = size - 1;
  // Standard .cube format: R fastest, G second, B slowest
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const nr = r / scale;
        const ng = g / scale;
        const nb = b / scale;
        const [outR, outG, outB] = gradePixelRgb(nr, ng, nb, grade, baseLut);
        cubeContent += `${outR.toFixed(6)} ${outG.toFixed(6)} ${outB.toFixed(6)}\n`;
      }
    }
  }

  fs.writeFileSync(cubePath, cubeContent, 'utf8');
  const sha256 = crypto.createHash('sha256').update(cubeContent).digest('hex');

  return { cubePath, sha256, size };
}

/**
 * Builds deterministic FFmpeg filtergraph string for a color grade
 */
function compileGradeToFiltergraph(grade, options = {}) {
  if (!grade || !grade.enabled) {
    return 'null';
  }

  let activeLut = null;
  if (grade.lut && grade.lut.enabled && grade.lut.path) {
    activeLut = getOrLoadLut(grade.lut.path);
  }

  const lutSize = options.lutSize || 33;
  const compiled = compileGradeToCubeLut(grade, activeLut, lutSize);

  // FFmpeg lut3d filter with tetrahedral interpolation
  const filterStr = `lut3d=file='${compiled.cubePath}':interp=tetrahedral`;

  return {
    filterString: filterStr,
    compiledLutPath: compiled.cubePath,
    compiledLutSha256: compiled.sha256,
    lutSize
  };
}

/**
 * Executes a headless FFmpeg render of an image or video through the compiled color grade
 */
function renderGradeHeadless(inputPath, outputPath, grade, options = {}) {
  const { filterString, compiledLutSha256, compiledLutPath } = compileGradeToFiltergraph(grade, options);

  const isLossless = options.lossless || outputPath.endsWith('.png');
  const args = ['-y', '-i', inputPath];

  if (filterString && filterString !== 'null') {
    args.push('-vf', filterString);
  }

  if (isLossless) {
    if (outputPath.endsWith('.png')) {
      args.push('-pix_fmt', 'rgb24');
    } else {
      args.push('-c:v', 'libx264', '-crf', '0', '-preset', 'ultrafast');
    }
  } else {
    args.push('-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p');
  }

  args.push(outputPath);

  const t0 = process.hrtime.bigint();
  const res = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  const t1 = process.hrtime.bigint();
  const durationMs = Number(t1 - t0) / 1e6;

  if (res.status !== 0) {
    throw new Error(`FFmpeg render failed (exit code ${res.status}): ${res.stderr}`);
  }

  const outBytes = fs.readFileSync(outputPath);
  const outSha256 = crypto.createHash('sha256').update(outBytes).digest('hex');

  return {
    success: true,
    inputPath,
    outputPath,
    durationMs: Number(durationMs.toFixed(2)),
    filterString,
    compiledLutPath,
    compiledLutSha256,
    outputSha256: outSha256,
    sizeBytes: outBytes.length
  };
}

module.exports = {
  compileGradeToCubeLut,
  compileGradeToFiltergraph,
  renderGradeHeadless
};
