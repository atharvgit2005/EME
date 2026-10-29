/**
 * Environment & Tool Resolution Helper for EME
 *
 * Provides cross-platform, configurable resolution for:
 * - Node runtime (preferring >= 22.0.0 for HyperFrames)
 * - HyperFrames CLI (via local node_modules, global, or npx)
 * - FFmpeg and ffprobe (via PATH or environment overrides)
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class EnvironmentResolver {
  /**
   * Find available Node.js binary. If current node < 22, check for local NVM Node 22+.
   */
  static resolveNode() {
    if (process.env.EME_NODE_PATH && fs.existsSync(process.env.EME_NODE_PATH)) {
      return process.env.EME_NODE_PATH;
    }

    const currentVersion = process.version;
    const major = parseInt(currentVersion.replace(/^v/, '').split('.')[0], 10);
    if (major >= 22) {
      return process.execPath;
    }

    // Check standard nvm or common paths for Node 22+
    const candidates = [
      path.join(process.env.HOME || '', '.nvm/versions/node/v22.21.1/bin/node'),
      path.join(process.env.HOME || '', '.nvm/versions/node/v22.12.0/bin/node'),
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node'
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          const res = spawnSync(cand, ['-v'], { encoding: 'utf8' });
          if (res.status === 0) {
            const v = parseInt(res.stdout.trim().replace(/^v/, '').split('.')[0], 10);
            if (v >= 22) return cand;
          }
        } catch (_) {}
      }
    }

    return process.execPath;
  }

  /**
   * Resolve FFmpeg binary path.
   */
  static resolveFfmpeg() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }

    const candidates = [
      'ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg'
    ];

    for (const cand of candidates) {
      try {
        const res = spawnSync(cand, ['-version'], { encoding: 'utf8' });
        if (res.status === 0) return cand;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Resolve ffprobe binary path.
   */
  static resolveFfprobe() {
    if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
      return process.env.FFPROBE_PATH;
    }

    const candidates = [
      'ffprobe',
      '/opt/homebrew/bin/ffprobe',
      '/usr/local/bin/ffprobe',
      '/usr/bin/ffprobe'
    ];

    for (const cand of candidates) {
      try {
        const res = spawnSync(cand, ['-version'], { encoding: 'utf8' });
        if (res.status === 0) return cand;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Resolve HyperFrames execution strategy.
   * Returns { command: string, args: string[], env: object }
   */
  static resolveHyperFrames(subcommand, extraArgs = []) {
    const nodeBin = this.resolveNode();
    const nodeDir = path.dirname(nodeBin);

    const env = {
      ...process.env,
      PATH: `${nodeDir}:${process.env.PATH || ''}`
    };

    // Check if hyperframes binary is in PATH or node directory
    const localHf = path.join(nodeDir, 'hyperframes');
    if (fs.existsSync(localHf)) {
      return {
        cmd: localHf,
        args: [subcommand, ...extraArgs],
        env
      };
    }

    // Default to npx with pinned version
    const npxBin = path.join(nodeDir, 'npx');
    const cmd = fs.existsSync(npxBin) ? npxBin : 'npx';
    return {
      cmd,
      args: ['-y', 'hyperframes@0.8.162', subcommand, ...extraArgs],
      env
    };
  }

  /**
   * Run full environment diagnostic.
   */
  static runDoctor() {
    const report = {
      node: {
        version: process.version,
        path: process.execPath,
        resolvedNode22Path: this.resolveNode(),
        ok: true
      },
      ffmpeg: {
        path: this.resolveFfmpeg(),
        ok: false,
        version: null
      },
      ffprobe: {
        path: this.resolveFfprobe(),
        ok: false,
        version: null
      },
      hyperframes: {
        version: '0.8.162',
        resolvedCmd: null,
        ok: false
      }
    };

    // Probe FFmpeg
    if (report.ffmpeg.path) {
      try {
        const fRes = spawnSync(report.ffmpeg.path, ['-version'], { encoding: 'utf8' });
        if (fRes.status === 0) {
          report.ffmpeg.ok = true;
          report.ffmpeg.version = fRes.stdout.split('\n')[0];
        }
      } catch (e) {
        report.ffmpeg.error = e.message;
      }
    }

    // Probe ffprobe
    if (report.ffprobe.path) {
      try {
        const fpRes = spawnSync(report.ffprobe.path, ['-version'], { encoding: 'utf8' });
        if (fpRes.status === 0) {
          report.ffprobe.ok = true;
          report.ffprobe.version = fpRes.stdout.split('\n')[0];
        }
      } catch (e) {
        report.ffprobe.error = e.message;
      }
    }

    // Probe HyperFrames
    const hf = this.resolveHyperFrames('--version');
    report.hyperframes.resolvedCmd = hf.cmd;
    try {
      const hfRes = spawnSync(hf.cmd, hf.args, { env: hf.env, encoding: 'utf8', timeout: 15000 });
      if (hfRes.status === 0 && hfRes.stdout.includes('0.8.162')) {
        report.hyperframes.ok = true;
        report.hyperframes.detectedVersion = hfRes.stdout.trim();
      }
    } catch (e) {
      report.hyperframes.error = e.message;
    }

    return report;
  }
}

module.exports = { EnvironmentResolver };
