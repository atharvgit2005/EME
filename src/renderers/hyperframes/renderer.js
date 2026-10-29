/**
 * HyperFrames Local Renderer Wrapper
 *
 * Executes `hyperframes render` via CLI and verifies output MP4 metadata with ffprobe.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class HyperFramesRenderer {
  /**
   * Render a compiled HyperFrames project directory to an MP4 video.
   */
  static render(compositionDir, outputVideoPath, options = {}) {
    const compDirResolved = path.resolve(compositionDir);
    const outResolved = path.resolve(outputVideoPath);

    if (!fs.existsSync(compDirResolved)) {
      throw new Error(`Composition directory does not exist: ${compDirResolved}`);
    }

    fs.mkdirSync(path.dirname(outResolved), { recursive: true });

    // Use EnvironmentResolver to locate HyperFrames and runtime
    const { EnvironmentResolver } = require('../../engine/environment.js');
    const extraArgs = [compDirResolved, '-o', outResolved];

    if (options.fps) {
      extraArgs.push(`--fps=${options.fps}`);
    } else {
      // Check if entry index.html specifies data-fps
      const entryHtmlPath = path.join(compDirResolved, 'index.html');
      if (fs.existsSync(entryHtmlPath)) {
        const html = fs.readFileSync(entryHtmlPath, 'utf8');
        const match = html.match(/data-fps="([^"]+)"/);
        if (match) {
          extraArgs.push(`--fps=${match[1]}`);
        }
      }
    }

    if (options.resolution) {
      extraArgs.push(`--resolution=${options.resolution}`);
    }

    const hf = EnvironmentResolver.resolveHyperFrames('render', extraArgs);

    const startTime = Date.now();
    const result = spawnSync(hf.cmd, hf.args, { env: hf.env, encoding: 'utf8' });
    const elapsedMs = Date.now() - startTime;

    if (result.status !== 0) {
      const err = new Error(`HyperFrames render failed with code ${result.status}:\n${result.stderr || result.stdout}`);
      err.stdout = result.stdout;
      err.stderr = result.stderr;
      throw err;
    }

    if (!fs.existsSync(outResolved)) {
      throw new Error(`Rendered video file not found at expected path: ${outResolved}`);
    }

    // Inspect metadata with ffprobe
    const metadata = this.probeVideo(outResolved);

    return {
      success: true,
      outputPath: outResolved,
      elapsedMs,
      metadata,
      stdout: (result.stdout || '').trim()
    };
  }

  /**
   * Probe video metadata using ffprobe.
   */
  static probeVideo(videoPath) {
    const ffprobe = spawnSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ], { encoding: 'utf8' });

    if (ffprobe.status !== 0 || !ffprobe.stdout) {
      return { verified: false, error: 'ffprobe execution failed' };
    }

    try {
      const parsed = JSON.parse(ffprobe.stdout);
      const videoStream = (parsed.streams || []).find(s => s.codec_type === 'video');
      return {
        verified: true,
        duration: Number(parsed.format && parsed.format.duration),
        sizeBytes: Number(parsed.format && parsed.format.size),
        width: videoStream ? videoStream.width : null,
        height: videoStream ? videoStream.height : null,
        codec: videoStream ? videoStream.codec_name : null,
        fps: videoStream ? eval(videoStream.r_frame_rate) : null
      };
    } catch (e) {
      return { verified: false, error: e.message };
    }
  }
}

module.exports = {
  HyperFramesRenderer
};
