/**
 * Deterministic Frame Inspector
 *
 * Extracts and inspects still frames at exact timestamps or integer ticks.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MediaTime } = require('../engine/time.js');

class FrameInspector {
  /**
   * Extract a still frame from a rendered MP4 at exact time/tick.
   */
  static inspectFromVideo(videoPath, outputPngPath, options = {}) {
    const videoAbs = path.resolve(videoPath);
    const outPngAbs = path.resolve(outputPngPath);

    if (!fs.existsSync(videoAbs)) {
      throw new Error(`Video file does not exist: ${videoAbs}`);
    }

    fs.mkdirSync(path.dirname(outPngAbs), { recursive: true });

    let timestampSec = 0.0;
    if (options.tick !== undefined) {
      timestampSec = MediaTime.ticksToSeconds(options.tick);
    } else if (options.time !== undefined) {
      timestampSec = Number(options.time);
    }

    const { EnvironmentResolver } = require('../engine/environment.js');
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

    const ffmpeg = spawnSync(ffmpegBin, [
      '-ss', timestampSec.toFixed(3),
      '-i', videoAbs,
      '-vframes', '1',
      '-y',
      outPngAbs
    ], { encoding: 'utf8' });

    if (ffmpeg.status !== 0 || !fs.existsSync(outPngAbs)) {
      throw new Error(`Frame extraction failed at ${timestampSec}s: ${ffmpeg.stderr}`);
    }

    const stats = fs.statSync(outPngAbs);
    if (stats.size === 0) {
      throw new Error(`Extracted frame is 0 bytes`);
    }

    return {
      success: true,
      framePath: outPngAbs,
      timestampSec,
      sizeBytes: stats.size
    };
  }

  /**
   * Snapshot directly from HyperFrames composition at exact second timestamps.
   */
  static snapshotComposition(compositionDir, outputDir, timestampsSec = [0.0, 1.5, 3.0]) {
    const compAbs = path.resolve(compositionDir);
    const outAbs = path.resolve(outputDir);
    fs.mkdirSync(outAbs, { recursive: true });

    const { EnvironmentResolver } = require('../engine/environment.js');
    const atStr = timestampsSec.map(t => t.toString()).join(',');
    const extraArgs = [compAbs, '-o', outAbs, `--at=${atStr}`, '--no-end', '--keep'];
    const hf = EnvironmentResolver.resolveHyperFrames('snapshot', extraArgs);

    const res = spawnSync(hf.cmd, hf.args, { env: hf.env, encoding: 'utf8' });
    if (res.status !== 0) {
      const err = new Error(`HyperFrames snapshot failed:\n${res.stderr || res.stdout}`);
      throw err;
    }

    const pngs = fs.readdirSync(outAbs).filter(f => f.endsWith('.png')).map(f => path.join(outAbs, f));
    return {
      success: true,
      snapshots: pngs,
      snapshotCount: pngs.length
    };
  }

  /**
   * Inspect video container and stream metadata via ffprobe.
   */
  static inspectVideoMetadata(videoPath) {
    const videoAbs = path.resolve(videoPath);
    if (!fs.existsSync(videoAbs)) {
      throw new Error(`Video file does not exist: ${videoAbs}`);
    }

    const { EnvironmentResolver } = require('../engine/environment.js');
    const ffprobeBin = EnvironmentResolver.resolveFfprobe() || 'ffprobe';

    const ffprobe = spawnSync(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,channels,sample_rate',
      '-of', 'json',
      videoAbs
    ], { encoding: 'utf8' });

    if (ffprobe.status !== 0) {
      throw new Error(`ffprobe metadata probe failed: ${ffprobe.stderr}`);
    }

    const parsed = JSON.parse(ffprobe.stdout);
    const videoStream = (parsed.streams || []).find(s => s.codec_type === 'video');
    const audioStream = (parsed.streams || []).find(s => s.codec_type === 'audio');

    const duration = Number(parsed.format?.duration), size = Number(parsed.format?.size);
    if (!videoStream || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(size) || size <= 0) throw new Error('ERR_INVALID_MEDIA_METADATA: Missing video or invalid duration/size');
    let fps = 0;
    if (videoStream && videoStream.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      fps = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]);
    }

    if (!Number.isFinite(fps) || fps <= 0 || !Number.isSafeInteger(videoStream.width) || !Number.isSafeInteger(videoStream.height)) throw new Error('ERR_INVALID_MEDIA_METADATA: Invalid video profile');
    return {
      success: true,
      path: videoAbs,
      duration: parsed.format && parsed.format.duration ? parseFloat(parsed.format.duration) : 0,
      sizeBytes: parsed.format && parsed.format.size ? parseInt(parsed.format.size, 10) : 0,
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps,
        nbFrames: videoStream.nb_frames ? parseInt(videoStream.nb_frames, 10) : undefined
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        channels: audioStream.channels,
        sampleRate: Number(audioStream.sample_rate)
      } : null
    };
  }

  /**
   * Decode two image files and compute quantitative pixel difference metrics (RMSE & changed pixel count).
   */
  static computePixelDiff(imagePathA, imagePathB) {
    const { EnvironmentResolver } = require('../engine/environment.js');
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

    const pathA = path.resolve(imagePathA);
    const pathB = path.resolve(imagePathB);

    if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
      throw new Error(`One or both image paths do not exist: ${pathA}, ${pathB}`);
    }

    const decodeA = spawnSync(ffmpegBin, ['-i', pathA, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 30 * 1024 * 1024 });
    const decodeB = spawnSync(ffmpegBin, ['-i', pathB, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 30 * 1024 * 1024 });

    if (decodeA.status !== 0 || decodeB.status !== 0) {
      throw new Error('Failed to decode image buffers to raw RGB24');
    }

    const bufA = decodeA.stdout;
    const bufB = decodeB.stdout;

    if (bufA.length !== bufB.length) {
      return {
        dimensionsMatch: false,
        different: true,
        sizeA: bufA.length,
        sizeB: bufB.length,
        reason: 'Dimensions mismatch'
      };
    }

    let diffPixels = 0;
    let sumSquaredError = 0;
    const totalPixels = bufA.length / 3;

    for (let i = 0; i < bufA.length; i += 3) {
      const dr = bufA[i] - bufB[i];
      const dg = bufA[i + 1] - bufB[i + 1];
      const db = bufA[i + 2] - bufB[i + 2];
      const err = (dr * dr + dg * dg + db * db) / 3;
      sumSquaredError += err;
      if (Math.abs(dr) > 5 || Math.abs(dg) > 5 || Math.abs(db) > 5) {
        diffPixels++;
      }
    }

    const mse = sumSquaredError / totalPixels;
    const rmse = Math.sqrt(mse);
    const percentChanged = (diffPixels / totalPixels) * 100;

    return {
      dimensionsMatch: true,
      totalPixels,
      differentPixels: diffPixels,
      percentChanged: parseFloat(percentChanged.toFixed(2)),
      rmse: parseFloat(rmse.toFixed(3)),
      different: diffPixels > 0
    };
  }
}

module.exports = {
  FrameInspector
};
