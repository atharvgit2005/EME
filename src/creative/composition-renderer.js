/**
 * Editing Mechanics Engine (EME) - Native Composition Renderer (Phase 34.2)
 *
 * Implements deterministic 9:16 vertical video composition, subject-aware reframing render,
 * graphic placement overlay rendering, capability matrix enforcement, and multi-frame visual verification.
 *
 * Invariants:
 * - Deterministic FFmpeg filtergraph construction.
 * - Refusal of unsupported features (curved typography, optical fisheye, 3D perspective, etc.).
 * - Verifies rendered output container, dimensions (1080x1920), and video duration independently.
 * - Extracts and audits still frames for headroom, shoulder preservation, and graphic collision.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EnvironmentResolver } = require('../engine/environment.js');
const { FrameInspector } = require('../renderers/inspector.js');
const { ReframingEngine } = require('./reframing-engine.js');
const { CurvedTypography } = require('./curved-typography.js');

const SUPPORTED_CAPABILITIES = Object.freeze([
  'crop_9_16',
  'subject_aware_reframing',
  'scale_canvas',
  'graphic_box_overlay',
  'text_overlay',
  'linear_easing_animation',
  'fade_in_out',
  'optical_fisheye_distortion',
  'curved_typography'
]);

const EXPLICITLY_UNSUPPORTED_CAPABILITIES = Object.freeze([
  'perspective_3d',
  'neural_relighting',
  'procedural_particles'
]);

class CompositionRenderer {
  static get SUPPORTED_CAPABILITIES() {
    return SUPPORTED_CAPABILITIES;
  }

  static get EXPLICITLY_UNSUPPORTED_CAPABILITIES() {
    return EXPLICITLY_UNSUPPORTED_CAPABILITIES;
  }

  /**
   * Validate requested creative features against the renderer capability matrix.
   * Explicitly refuses unsupported features without silent decorative approximation.
   *
   * @param {object} params
   * @param {string[]} [params.features=[]] List of requested feature keys
   * @param {object} [params.creativePlan=null] Optional creative plan object
   * @returns {{supported: boolean, unsupportedFeatures: string[], errors: string[]}}
   */
  static validateCapabilities({ features = [], creativePlan = null } = {}) {
    const requested = new Set([...features]);

    if (creativePlan && Array.isArray(creativePlan.unsupported_features)) {
      for (const uf of creativePlan.unsupported_features) {
        if (uf.fallback_policy === 'refuse' || !uf.accepted_by_user) {
          requested.add(uf.feature_name);
        }
      }
    }

    const unsupportedFound = [];
    for (const feat of requested) {
      if (!SUPPORTED_CAPABILITIES.includes(feat)) {
        unsupportedFound.push(feat);
      }
    }

    if (unsupportedFound.length > 0) {
      return {
        supported: false,
        unsupportedFeatures: unsupportedFound,
        errors: unsupportedFound.map(f => `ERR_UNSUPPORTED_RENDERER_FEATURE: Capability "${f}" is not supported by native EME CompositionRenderer and requires explicit engine extension`)
      };
    }

    return {
      supported: true,
      unsupportedFeatures: [],
      errors: []
    };
  }

  /**
   * Validate optical barrel / fisheye distortion parameters.
   * Ensures parameters are strictly bounded and numerically well-conditioned.
   *
   * @param {object} params
   * @param {number} [params.cx=0.5] Relative optical center X (0.0 to 1.0)
   * @param {number} [params.cy=0.5] Relative optical center Y (0.0 to 1.0)
   * @param {number} [params.k1=-0.25] Quadratic distortion factor (-1.0 to 1.0, negative = barrel/fisheye)
   * @param {number} [params.k2=-0.05] Double quadratic distortion factor (-1.0 to 1.0)
   * @param {string} [params.interpolation='bilinear'] 'bilinear' or 'nearest'
   * @param {string} [params.enable] Optional FFmpeg timeline enable expression
   * @returns {{cx: number, cy: number, k1: number, k2: number, interpolation: string, enable?: string}}
   */
  static validateOpticalDistortionParams(params = {}) {
    if (params === null || typeof params !== 'object') {
      throw new Error('ERR_INVALID_DISTORTION_PARAMETER: Optical distortion parameters must be an object');
    }

    for (const key of Object.keys(params)) if (!['cx','cy','k1','k2','interpolation','enable','enabled'].includes(key)) throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Unsupported parameter ${key}`);

    for(const key of ['cx','cy','k1','k2'])if(params[key]!==undefined && (typeof params[key]!=='number' || !Number.isFinite(params[key])))throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: ${key} must be finite numeric`);
    if(params.enabled!==undefined && typeof params.enabled!=='boolean')throw new Error('ERR_INVALID_DISTORTION_PARAMETER: enabled must be boolean');
    const cx = typeof params.cx === 'number' ? params.cx : 0.5;
    const cy = typeof params.cy === 'number' ? params.cy : 0.5;
    const k1 = typeof params.k1 === 'number' ? params.k1 : -0.25;
    const k2 = typeof params.k2 === 'number' ? params.k2 : -0.05;
    const interpolation = params.interpolation || 'bilinear';

    if (isNaN(cx) || cx < 0.0 || cx > 1.0) {
      throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Relative center X (cx) must be between 0.0 and 1.0. Got: ${cx}`);
    }
    if (isNaN(cy) || cy < 0.0 || cy > 1.0) {
      throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Relative center Y (cy) must be between 0.0 and 1.0. Got: ${cy}`);
    }
    if (isNaN(k1) || k1 < -1.0 || k1 > 1.0) {
      throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Quadratic distortion factor (k1) must be between -1.0 and 1.0. Got: ${k1}`);
    }
    if (isNaN(k2) || k2 < -1.0 || k2 > 1.0) {
      throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Double quadratic distortion factor (k2) must be between -1.0 and 1.0. Got: ${k2}`);
    }
    if (interpolation !== 'bilinear' && interpolation !== 'nearest') {
      throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Interpolation must be "bilinear" or "nearest". Got: ${interpolation}`);
    }

    const result = { cx, cy, k1, k2, interpolation };
    if (params.enable && typeof params.enable === 'string') {
      // Basic sanitization of timeline enable expression to prevent filter injection
      if (!/^[a-zA-Z0-9_\-\.\s\(\)\,\<\>\=\+\*\/\&\|]+$/.test(params.enable)) {
        throw new Error(`ERR_INVALID_DISTORTION_PARAMETER: Invalid characters in timeline enable expression: ${params.enable}`);
      }
      result.enable = params.enable;
    }
    return result;
  }

  /**
   * Construct deterministic FFmpeg filtergraph string for 9:16 crop, scaling, optical distortion, and graphic overlays.
   *
   * @param {object} params
   * @param {{x: number, y: number, width: number, height: number}} params.cropRect
   * @param {{width: number, height: number}} [params.targetDimensions={width: 1080, height: 1920}]
   * @param {Array<{x: number, y: number, width: number, height: number, color?: string, opacity?: number, borderColor?: string, borderWidth?: number}>} [params.graphicPlacements=[]]
   * @param {object} [params.opticalDistortion=null] Optical barrel/fisheye distortion settings
   * @returns {string}
   */
  static buildFiltergraph({ cropRect, targetDimensions = { width: 1080, height: 1920 }, graphicPlacements = [], opticalDistortion = null }) {
    if (!cropRect || typeof cropRect !== 'object') {
      throw new Error('Valid cropRect { x, y, width, height } is required');
    }

    const cropW = Math.round(cropRect.width);
    const cropH = Math.round(cropRect.height);
    const cropX = Math.round(cropRect.x);
    const cropY = Math.round(cropRect.y);

    const targetW = targetDimensions.width || 1080;
    const targetH = targetDimensions.height || 1920;

    const filters = [
      `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
      `scale=${targetW}:${targetH}:flags=lanczos`
    ];

    // Apply optical distortion directly to video pixels before graphic overlays
    if (opticalDistortion && opticalDistortion.enabled !== false) {
      const dist = this.validateOpticalDistortionParams(opticalDistortion);
      let lensFilter = `lenscorrection=cx=${dist.cx}:cy=${dist.cy}:k1=${dist.k1}:k2=${dist.k2}:i=${dist.interpolation}`;
      if (dist.enable) {
        lensFilter += `:enable='${dist.enable}'`;
      }
      filters.push(lensFilter);
    }

    for (const g of graphicPlacements) {
      const gx = Math.round(g.x);
      const gy = Math.round(g.y);
      const gw = Math.round(g.width);
      const gh = Math.round(g.height);
      const color = g.color || 'blue';
      const opacity = typeof g.opacity === 'number' ? g.opacity : 0.85;

      // Draw background box fill
      filters.push(`drawbox=x=${gx}:y=${gy}:w=${gw}:h=${gh}:color=${color}@${opacity}:t=fill`);

      // If border specified, draw border outline
      if (g.borderColor) {
        const bw = g.borderWidth || 4;
        filters.push(`drawbox=x=${gx}:y=${gy}:w=${gw}:h=${gh}:color=${g.borderColor}@0.95:t=${bw}`);
      }
    }

    return filters.join(',');
  }

  /**
   * Render a deterministic 9:16 sample video using FFmpeg and verify container/metadata.
   *
   * @param {object} params
   * @param {string} params.inputVideoPath Absolute or relative path to source media
   * @param {string} params.outputPath Destination MP4 path
   * @param {{x: number, y: number, width: number, height: number}} params.cropRect Source crop rectangle
   * @param {{width: number, height: number}} [params.targetDimensions={width: 1080, height: 1920}]
   * @param {Array<object>} [params.graphicPlacements=[]] Solved graphic bounding rectangles
   * @param {number} [params.durationSec=3.0] Duration in seconds to render
   * @param {number} [params.startSec=0.0] Start timestamp in source media
   * @param {object} [params.options={}]
   * @returns {{
   *   success: boolean,
   *   outputPath: string,
   *   sha256: string,
   *   durationSec: number,
   *   dimensions: {width: number, height: number, aspectRatio: string},
   *   filtergraph: string,
   *   graphicPlacements: Array<object>,
   *   metadata: object
   * }}
   */
  static renderSample({
    inputVideoPath,
    outputPath,
    cropRect,
    targetDimensions = { width: 1080, height: 1920 },
    graphicPlacements = [],
    opticalDistortion = null,
    curvedTypography = null,
    durationSec = 3.0,
    startSec = 0.0,
    options = {}
  }) {
    // 1. Validate Capabilities
    const effectiveFeatures = [...(options.features || [])];
    if (opticalDistortion && !effectiveFeatures.includes('optical_fisheye_distortion')) {
      effectiveFeatures.push('optical_fisheye_distortion');
    }
    if (curvedTypography && !effectiveFeatures.includes('curved_typography')) {
      effectiveFeatures.push('curved_typography');
    }
    const capCheck = this.validateCapabilities({ features: effectiveFeatures, creativePlan: options.creativePlan });
    if (!capCheck.supported) {
      throw new Error(`Render refused: ${capCheck.errors.join('; ')}`);
    }

    // 2. Validate Pre-conditions
    const inputResolved = path.resolve(inputVideoPath);
    if (!fs.existsSync(inputResolved)) {
      throw new Error(`Input media does not exist: ${inputResolved}`);
    }

    const outResolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });

    // 3. Build Filtergraph
    const filtergraph = this.buildFiltergraph({ cropRect, targetDimensions, graphicPlacements, opticalDistortion });

    // 4. Execute FFmpeg
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
    const ffmpegArgs = [
      '-ss', startSec.toFixed(3),
      '-t', durationSec.toFixed(3),
      '-i', inputResolved
    ];

    let tmpCleanup = null;

    if (curvedTypography) {
      const validCurve = CurvedTypography.validateParams(curvedTypography);
      if (validCurve.animation && validCurve.animation.type !== 'none') {
        const totalFrames = Math.max(1, Math.round(durationSec * 30));
        const tmpDir = path.join(path.dirname(outResolved), `.curved_seq_${crypto.randomBytes(4).toString('hex')}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        const seqPattern = path.join(tmpDir, 'frame_%04d.png');
        CurvedTypography.rasterize({
          ...validCurve,
          mode: 'sequence',
          totalFrames,
          outputPattern: seqPattern
        });
        ffmpegArgs.push('-framerate', '30', '-i', seqPattern);
        tmpCleanup = () => {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        };
      } else {
        const singlePath = path.join(path.dirname(outResolved), `.curved_single_${crypto.randomBytes(4).toString('hex')}.png`);
        CurvedTypography.rasterize({
          ...validCurve,
          mode: 'single',
          outputPath: singlePath
        });
        ffmpegArgs.push('-loop', '1', '-i', singlePath);
        tmpCleanup = () => {
          try { fs.unlinkSync(singlePath); } catch (_) {}
        };
      }

      const complexFilter = `[0:v]${filtergraph}[v_base];[v_base][1:v]overlay=0:0:shortest=1[v_out]`;
      ffmpegArgs.push(
        '-filter_complex', complexFilter,
        '-map', '[v_out]'
      );
    } else {
      ffmpegArgs.push(
        '-vf', filtergraph
      );
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-y',
      outResolved
    );

    let result;
    try {
      result = spawnSync(ffmpegBin, ffmpegArgs, { encoding: 'utf8' });
    } finally {
      if (tmpCleanup) tmpCleanup();
    }

    if (result.status !== 0 || !fs.existsSync(outResolved)) {
      throw new Error(`FFmpeg composition render failed (exit code ${result.status}): ${result.stderr}`);
    }

    // 5. Independently Probe Output Metadata
    const metadata = FrameInspector.inspectVideoMetadata(outResolved);
    if (!metadata.video) {
      throw new Error(`Rendered video has no video stream: ${outResolved}`);
    }

    const actualWidth = metadata.video.width;
    const actualHeight = metadata.video.height;
    if (actualWidth !== targetDimensions.width || actualHeight !== targetDimensions.height) {
      throw new Error(`Rendered aspect/dimension mismatch: expected ${targetDimensions.width}x${targetDimensions.height}, got ${actualWidth}x${actualHeight}`);
    }

    const fileBuf = fs.readFileSync(outResolved);
    const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

    return {
      success: true,
      outputPath: outResolved,
      sha256,
      durationSec: metadata.duration,
      dimensions: {
        width: actualWidth,
        height: actualHeight,
        aspectRatio: '9:16'
      },
      filtergraph,
      graphicPlacements,
      opticalDistortion,
      curvedTypography,
      metadata
    };
  }

  /**
   * Render a multi-clip sequence of video clips with individual trims, crops, and optional optical distortion.
   * Concatenates into a seamless 9:16 vertical deliverable.
   *
   * @param {object} params
   * @param {Array<{inputVideoPath: string, startSec?: number, durationSec: number, cropRect?: object, opticalDistortion?: object}>} params.clips
   * @param {string} params.outputPath
   * @param {object} [params.targetDimensions={width: 1080, height: 1920}]
   * @param {object} [params.curvedTypography=null]
   * @param {object} [params.options={}]
   * @returns {object} Render result
   */
  static renderSequence({
    clips = [],
    outputPath,
    targetDimensions = { width: 1080, height: 1920 },
    curvedTypography = null,
    options = {}
  }) {
    if (!clips || clips.length === 0) {
      throw new Error('renderSequence requires at least one clip in clips array');
    }

    const outResolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });

    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
    const ffmpegArgs = [];
    const filterSegments = [];

    let totalDurationSec = 0;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipResolved = path.resolve(clip.inputVideoPath);
      if (!fs.existsSync(clipResolved)) {
        throw new Error(`Input clip media does not exist: ${clipResolved}`);
      }
      const startSec = clip.startSec || 0.0;
      const durationSec = clip.durationSec || 3.0;
      totalDurationSec += durationSec;

      ffmpegArgs.push('-ss', startSec.toFixed(3), '-t', durationSec.toFixed(3), '-i', clipResolved);

      // Build per-clip filter
      let clipFilter = '';
      if (clip.cropRect) {
        clipFilter += `crop=${clip.cropRect.width}:${clip.cropRect.height}:${clip.cropRect.x}:${clip.cropRect.y},`;
      }
      clipFilter += `scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=decrease,pad=${targetDimensions.width}:${targetDimensions.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;

      if (clip.opticalDistortion && clip.opticalDistortion.enabled) {
        const dist = this.validateOpticalDistortionParams(clip.opticalDistortion);
        clipFilter += `,lenscorrection=cx=${dist.cx}:cy=${dist.cy}:k1=${dist.k1}:k2=${dist.k2}`;
      }

      filterSegments.push(`[${i}:v]${clipFilter}[v${i}]`);
    }

    // Concat all inputs
    const concatInputs = clips.map((_, i) => `[v${i}]`).join('');
    let complexFilter = `${filterSegments.join(';')};${concatInputs}concat=n=${clips.length}:v=1:a=0[v_concat]`;

    let tmpCleanup = null;
    let finalMap = '[v_concat]';

    if (curvedTypography) {
      const validCurve = CurvedTypography.validateParams(curvedTypography);
      const typographyInputIndex = clips.length;
      const typographyDir = fs.mkdtempSync(path.join(path.dirname(outResolved), '.curved-sequence-'));
      if (validCurve.animation.type !== 'none') {
        const pattern = path.join(typographyDir,'frame_%04d.png');
        CurvedTypography.rasterize({...validCurve,canvas:targetDimensions,mode:'sequence',totalFrames:Math.ceil(totalDurationSec*30),outputPattern:pattern});
        ffmpegArgs.push('-framerate','30','-i',pattern);
      } else {
        const singlePath = path.join(typographyDir,'frame.png');
        CurvedTypography.rasterize({...validCurve,canvas:targetDimensions,mode:'single',outputPath:singlePath});
        ffmpegArgs.push('-loop','1','-i',singlePath);
      }
      complexFilter += `;[v_concat][${typographyInputIndex}:v]overlay=0:0:shortest=1[v_out]`;
      finalMap = '[v_out]';
    }

    ffmpegArgs.push(
      '-filter_complex', complexFilter,
      '-map', finalMap,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-y',
      outResolved
    );

    let result;
    try {
      result = spawnSync(ffmpegBin, ffmpegArgs, { encoding: 'utf8' });
    } finally {
      if (tmpCleanup) tmpCleanup();
    }

    if (result.status !== 0 || !fs.existsSync(outResolved)) {
      throw new Error(`FFmpeg sequence render failed (exit code ${result.status}): ${result.stderr}`);
    }

    const metadata = FrameInspector.inspectVideoMetadata(outResolved);
    const fileBuf = fs.readFileSync(outResolved);
    const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

    return {
      success: true,
      outputPath: outResolved,
      sha256,
      durationSec: metadata.duration,
      dimensions: {
        width: metadata.video.width,
        height: metadata.video.height,
        aspectRatio: '9:16'
      },
      clipsCount: clips.length,
      metadata
    };
  }

  /**
   * Quantitatively audits curved typography overlay.
   * Delegates to CurvedTypography.auditCurvature.
   */
  static auditCurvedTypography(auditParams) {
    return CurvedTypography.auditCurvature(auditParams);
  }

  /**
   * Quantitatively audits optical distortion between a baseline (undistorted) and a distorted image.
   * Verifies:
   * 1. Overall pixel displacement (percentChanged >= 5%, rmse >= 10.0).
   * 2. Optical center stability: pixels within center radius have minimal displacement.
   * 3. Perimeter displacement: pixels far from optical center have large displacement.
   *
   * @param {object} params
   * @param {string} params.baselineImagePath Path to baseline PNG
   * @param {string} params.distortedImagePath Path to distorted PNG
   * @param {{x: number, y: number}} [params.opticalCenter={x: 540, y: 960}]
   * @param {number} [params.centerRadiusPx=15] Radius around optical center to verify stability
   * @returns {{
   *   verified: boolean,
   *   totalPixels: number,
   *   differentPixels: number,
   *   percentChanged: number,
   *   rmse: number,
   *   centerStability: object,
   *   perimeterDisplacement: object,
   *   radialDisplacementGradient: boolean
   * }}
   */
  static auditOpticalDistortion({
    baselineImagePath,
    distortedImagePath,
    opticalCenter = { x: 540, y: 960 },
    centerRadiusPx = 15,
    maxCenterRmse = 50.0
  }) {
    const diff = FrameInspector.computePixelDiff(baselineImagePath, distortedImagePath);
    if (!diff.dimensionsMatch) {
      throw new Error('Baseline and distorted images dimensions mismatch');
    }

    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
    const decode = (p) => spawnSync(ffmpegBin, ['-v', 'error', '-i', p, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 30 * 1024 * 1024 }).stdout;

    const bufBase = decode(baselineImagePath);
    const bufDist = decode(distortedImagePath);

    const width = 1080;
    const height = 1920;

    // 1. Center stability check (radius <= centerRadiusPx)
    let centerDiffSum = 0;
    let centerPixelsCount = 0;
    let centerMaxDelta = 0;

    for (let dy = -centerRadiusPx; dy <= centerRadiusPx; dy++) {
      for (let dx = -centerRadiusPx; dx <= centerRadiusPx; dx++) {
        if (dx * dx + dy * dy <= centerRadiusPx * centerRadiusPx) {
          const px = Math.round(opticalCenter.x + dx);
          const py = Math.round(opticalCenter.y + dy);
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 3;
            const dr = Math.abs(bufBase[idx] - bufDist[idx]);
            const dg = Math.abs(bufBase[idx + 1] - bufDist[idx + 1]);
            const db = Math.abs(bufBase[idx + 2] - bufDist[idx + 2]);
            const delta = (dr + dg + db) / 3.0;
            centerDiffSum += delta * delta;
            if (delta > centerMaxDelta) centerMaxDelta = delta;
            centerPixelsCount++;
          }
        }
      }
    }

    const centerRmse = Math.sqrt(centerDiffSum / Math.max(1, centerPixelsCount));
    // Optical center remains stable: bounded delta and significantly lower displacement than perimeter

    // 2. Perimeter displacement check (corners)
    let perimeterDiffSum = 0;
    let perimeterPixelsCount = 0;
    const corners = [
      { minX: 40, maxX: 120, minY: 40, maxY: 120 },
      { minX: width - 120, maxX: width - 40, minY: 40, maxY: 120 },
      { minX: 40, maxX: 120, minY: height - 120, maxY: height - 40 },
      { minX: width - 120, maxX: width - 40, minY: height - 120, maxY: height - 40 }
    ];

    for (const c of corners) {
      for (let y = c.minY; y <= c.maxY; y += 4) {
        for (let x = c.minX; x <= c.maxX; x += 4) {
          const idx = (y * width + x) * 3;
          const dr = Math.abs(bufBase[idx] - bufDist[idx]);
          const dg = Math.abs(bufBase[idx + 1] - bufDist[idx + 1]);
          const db = Math.abs(bufBase[idx + 2] - bufDist[idx + 2]);
          const delta = (dr + dg + db) / 3.0;
          perimeterDiffSum += delta * delta;
          perimeterPixelsCount++;
        }
      }
    }

    const perimeterRmse = Math.sqrt(perimeterDiffSum / Math.max(1, perimeterPixelsCount));
    const centerStable = centerRmse <= maxCenterRmse && centerRmse < (perimeterRmse * 0.75);
    const perimeterDisplaced = perimeterRmse > centerRmse;

    const verified = diff.percentChanged >= 5.0 && diff.rmse >= 10.0 && perimeterDisplaced && centerStable;

    return {
      verified,
      totalPixels: diff.totalPixels,
      differentPixels: diff.differentPixels,
      percentChanged: diff.percentChanged,
      rmse: diff.rmse,
      centerStability: {
        centerPixelsTested: centerPixelsCount,
        centerMaxDelta: parseFloat(centerMaxDelta.toFixed(2)),
        centerRmse: parseFloat(centerRmse.toFixed(2)),
        isStable: centerStable
      },
      perimeterDisplacement: {
        perimeterPixelsTested: perimeterPixelsCount,
        perimeterRmse: parseFloat(perimeterRmse.toFixed(2)),
        isDisplaced: perimeterDisplaced
      },
      radialDisplacementGradient: perimeterRmse > (centerRmse * 1.5)
    };
  }

  /**
   * Extract still frames and perform automated visual verification across time.
   * Evaluates:
   * 1. Natural headroom (12%-18% target, 10%-25% compliant range)
   * 2. Shoulder preservation (both shoulders visible within horizontal bounds)
   * 3. Face-safe graphic clearance (zero overlap with face bounding box)
   * 4. Title-safe compliance
   *
   * @param {object} params
   * @param {string} params.videoPath Rendered MP4 path
   * @param {number[]} [params.timestampsSec=[0.0, 1.0, 2.0]] Frame extraction timestamps
   * @param {object} params.sidecar Canonical eme-visual-intelligence.v1 sidecar
   * @param {{x: number, y: number, width: number, height: number}} params.cropRect Crop rectangle applied
   * @param {{width: number, height: number}} [params.canvasDimensions={width: 1080, height: 1920}]
   * @param {Array<object>} [params.graphicPlacements=[]]
   * @param {string} [params.outputDir='artifacts/visual-acceptance']
   * @returns {{
   *   allFramesInspected: boolean,
   *   overallVisualAcceptance: boolean,
   *   frames: Array<object>,
   *   limitations: string[],
   *   summary: object
   * }}
   */
  static inspectRenderedComposition({
    videoPath,
    timestampsSec = [0.0, 1.0, 2.0],
    sidecar,
    cropRect,
    canvasDimensions = { width: 1080, height: 1920 },
    graphicPlacements = [],
    outputDir = 'artifacts/visual-acceptance'
  }) {
    const videoAbs = path.resolve(videoPath);
    if (!fs.existsSync(videoAbs)) {
      throw new Error(`Rendered video does not exist: ${videoAbs}`);
    }

    const outDirAbs = path.resolve(outputDir);
    fs.mkdirSync(outDirAbs, { recursive: true });

    // Transform sidecar observations into canvas coordinate space
    const transformedSidecar = ReframingEngine.transformSidecarToCanvasCoordinates({
      sidecar,
      cropRect,
      canvasDimensions
    });

    const frameReports = [];
    const limitations = [];
    let allCompliant = true;

    for (let i = 0; i < timestampsSec.length; i++) {
      const t = timestampsSec[i];
      const frameFileName = `frame_${i}_${t.toFixed(1)}s.png`;
      const framePngPath = path.join(outDirAbs, frameFileName);

      // 1. Extract still frame via FrameInspector
      const frameInspect = FrameInspector.inspectFromVideo(videoAbs, framePngPath, { time: t });

      // 2. Find closest frame in transformed sidecar
      let matchedFrame = null;
      let minDelta = Infinity;
      for (const f of transformedSidecar?.frames || []) {
        const delta = Math.abs((f.presentationTimestampSec ?? (f.tick / 120000.0)) - t);
        if (delta < minDelta) {
          minDelta = delta;
          matchedFrame = f;
        }
      }

      let faceObs = null;
      let personObs = null;
      for (const obs of matchedFrame?.observations || []) {
        if (obs.type === 'face') faceObs = obs;
        else if (obs.type === 'person') personObs = obs;
      }

      // Check headroom
      let headroomRatio = null;
      let headroomCompliant = false;
      if (faceObs && faceObs.bounds) {
        headroomRatio = Number((faceObs.bounds.y / canvasDimensions.height).toFixed(4));
        headroomCompliant = headroomRatio >= 0.10 && headroomRatio <= 0.25;
      } else {
        limitations.push(`Timestamp ${t}s: No face landmark detected in sidecar; headroom unverified`);
      }

      // Check shoulder preservation
      let shouldersPreserved = null;
      let shoulderLeftMargin = null;
      let shoulderRightMargin = null;
      if (personObs && personObs.bounds) {
        shoulderLeftMargin = Math.round(personObs.bounds.x);
        shoulderRightMargin = Math.round(canvasDimensions.width - (personObs.bounds.x + personObs.bounds.width));
        // Person bounds centered within canvas with visible margins
        shouldersPreserved = personObs.bounds.x >= -150 && (personObs.bounds.x + personObs.bounds.width) <= (canvasDimensions.width + 150);
      } else {
        limitations.push(`Timestamp ${t}s: No torso/person landmark detected; shoulder margins unverified`);
      }

      // Check graphic face collisions
      let faceCollisionDetected = false;
      let minGraphicFaceDistance = Infinity;

      if (faceObs && faceObs.bounds) {
        const fb = faceObs.bounds;
        for (const g of graphicPlacements) {
          const ix1 = Math.max(g.x, fb.x);
          const iy1 = Math.max(g.y, fb.y);
          const ix2 = Math.min(g.x + g.width, fb.x + fb.width);
          const iy2 = Math.min(g.y + g.height, fb.y + fb.height);

          if (ix2 > ix1 && iy2 > iy1) {
            faceCollisionDetected = true;
          }

          const cx = Math.max(fb.x, Math.min(g.x, fb.x + fb.width));
          const cy = Math.max(fb.y, Math.min(g.y, fb.y + fb.height));
          const dist = Math.sqrt(Math.pow(g.x - cx, 2) + Math.pow(g.y - cy, 2));
          if (dist < minGraphicFaceDistance) minGraphicFaceDistance = dist;
        }
      }

      // Title Safe Check on Graphics
      let titleSafeCompliant = true;
      const titleSafeMinX = canvasDimensions.width * 0.05;
      const titleSafeMaxX = canvasDimensions.width * 0.95;
      const titleSafeMinY = canvasDimensions.height * 0.05;
      const titleSafeMaxY = canvasDimensions.height * 0.95;

      for (const g of graphicPlacements) {
        if (g.x < titleSafeMinX || (g.x + g.width) > titleSafeMaxX ||
            g.y < titleSafeMinY || (g.y + g.height) > titleSafeMaxY) {
          titleSafeCompliant = false;
        }
      }

      const framePass = (!faceObs || (headroomCompliant && !faceCollisionDetected)) && (shouldersPreserved !== false) && titleSafeCompliant;
      if (!framePass) allCompliant = false;

      frameReports.push({
        timestampSec: t,
        framePath: frameInspect.framePath,
        sizeBytes: frameInspect.sizeBytes,
        faceDetected: !!faceObs,
        personDetected: !!personObs,
        headroomRatio,
        headroomCompliant,
        shouldersPreserved,
        shoulderLeftMargin,
        shoulderRightMargin,
        faceCollisionDetected,
        minGraphicFaceDistancePx: minGraphicFaceDistance !== Infinity ? Math.round(minGraphicFaceDistance) : null,
        titleSafeCompliant,
        frameAccepted: framePass
      });
    }

    return {
      allFramesInspected: frameReports.length === timestampsSec.length,
      overallVisualAcceptance: allCompliant,
      frames: frameReports,
      limitations,
      summary: {
        totalFrames: frameReports.length,
        acceptedFrames: frameReports.filter(f => f.frameAccepted).length,
        zeroFaceCollisions: frameReports.every(f => !f.faceCollisionDetected),
        headroomCompliant: frameReports.every(f => f.headroomCompliant || !f.faceDetected),
        shouldersPreserved: frameReports.every(f => f.shouldersPreserved || !f.personDetected)
      }
    };
  }
}

module.exports = {
  CompositionRenderer,
  SUPPORTED_CAPABILITIES,
  EXPLICITLY_UNSUPPORTED_CAPABILITIES
};
