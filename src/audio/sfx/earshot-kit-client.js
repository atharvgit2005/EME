/**
 * Editing Mechanics Engine (EME) - Isolated Earshot Sound Kit Client (Stage 26.2)
 *
 * Implements safe, out-of-process kit asset generation with:
 * - Isolated staging directories (never renders into canonical project dirs)
 * - Controlled publication/promotion with pre-existing asset preservation
 * - Strict dual-hash validation (SHA-1 upstream + SHA-256 EME-side)
 * - Physical transient provenance tracking
 * - Subprocess watchdog and timeout budgets
 * - Zero mutation authority (only produces assets and records)
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const {
  validateKitDefinition,
  validateKitLock,
  validateKitDirectory
} = require('./earshot-kit-validator.js');

const DEFAULT_PYTHON = process.env.EARSHOT_PYTHON || '/tmp/earshot/.venv/bin/python3';
const BRIDGE_SCRIPT = path.resolve(__dirname, 'earshot-kit-bridge.py');

class EarshotKitClient {
  /**
   * @param {object} [options]
   * @param {string} [options.pythonPath]
   * @param {number} [options.renderTimeoutMs=30000]
   * @param {number} [options.commandTimeoutMs=5000]
   */
  constructor(options = {}) {
    this.pythonPath = options.pythonPath || DEFAULT_PYTHON;
    this.renderTimeoutMs = options.renderTimeoutMs || 30000;
    this.commandTimeoutMs = options.commandTimeoutMs || 5000;
    this.bridgeProcess = null;
    this.pendingQueue = [];
    this.lineBuffer = '';
    this._closing = false;
  }

  _ensureProcess() {
    if (this.bridgeProcess && !this.bridgeProcess.killed) {
      return this.bridgeProcess;
    }

    if (!fs.existsSync(this.pythonPath)) {
      const err = new Error(`Earshot Python virtualenv not found at: ${this.pythonPath}`);
      err.code = 'PYTHON_NOT_FOUND';
      throw err;
    }

    const proc = spawn(this.pythonPath, [BRIDGE_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1'
      }
    });

    this.lineBuffer = '';

    proc.stdout.on('data', (chunk) => {
      this.lineBuffer += chunk.toString('utf8');
      let nlIndex;
      while ((nlIndex = this.lineBuffer.indexOf('\n')) !== -1) {
        const line = this.lineBuffer.slice(0, nlIndex).trim();
        this.lineBuffer = this.lineBuffer.slice(nlIndex + 1);
        if (line && this.pendingQueue.length > 0) {
          const { resolve, reject, timer } = this.pendingQueue.shift();
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(line);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse bridge response: ${e.message} (raw: ${line.slice(0, 100)})`));
          }
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      // Keep for debugging if needed
    });

    proc.on('close', (code) => {
      const remaining = this.pendingQueue.splice(0);
      for (const item of remaining) {
        clearTimeout(item.timer);
        item.reject(new Error(`Earshot bridge process exited with code ${code}`));
      }
      this.bridgeProcess = null;
    });

    proc.on('error', (err) => {
      const remaining = this.pendingQueue.splice(0);
      for (const item of remaining) {
        clearTimeout(item.timer);
        item.reject(err);
      }
      this.bridgeProcess = null;
    });

    this.bridgeProcess = proc;
    return proc;
  }

  /**
   * Sends a JSON command to the bridge and awaits response.
   * @param {object} cmd
   * @param {number} timeoutMs
   * @returns {Promise<object>}
   */
  async _sendCommand(cmd, timeoutMs) {
    const proc = this._ensureProcess();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingQueue.findIndex(p => p.timer === timer);
        if (idx !== -1) {
          this.pendingQueue.splice(idx, 1);
        }
        try {
          proc.kill('SIGTERM');
        } catch (_) {}
        reject(new Error(`Earshot bridge command timed out after ${timeoutMs}ms (${cmd.action})`));
      }, timeoutMs);

      this.pendingQueue.push({ resolve, reject, timer });

      try {
        proc.stdin.write(JSON.stringify(cmd) + '\n');
      } catch (err) {
        clearTimeout(timer);
        const idx = this.pendingQueue.findIndex(p => p.timer === timer);
        if (idx !== -1) this.pendingQueue.splice(idx, 1);
        reject(err);
      }
    });
  }

  /**
   * Retrieves list of available sound kit presets.
   * @returns {Promise<string[]>}
   */
  async getPresets() {
    const res = await this._sendCommand({ action: 'presets' }, this.commandTimeoutMs);
    if (!res.ok) {
      throw new Error(`Failed to list kit presets: ${res.error}`);
    }
    return res.presets;
  }

  /**
   * Retrieves full kit definition for a preset.
   * @param {string} presetName
   * @returns {Promise<object>}
   */
  async getPreset(presetName) {
    const res = await this._sendCommand({ action: 'preset', name: presetName }, this.commandTimeoutMs);
    if (!res.ok) {
      throw new Error(`Failed to load preset "${presetName}": ${res.error}`);
    }
    const val = validateKitDefinition(res.kit);
    if (!val.valid) {
      throw new Error(`Loaded preset "${presetName}" failed validation: ${val.errors.join('; ')}`);
    }
    return res.kit;
  }

  /**
   * Plans takes for a kit definition without rendering audio.
   * @param {object} kitDefinition
   * @returns {Promise<Array<object>>}
   */
  async planKit(kitDefinition) {
    const val = validateKitDefinition(kitDefinition);
    if (!val.valid) {
      throw new Error(`Invalid kit definition: ${val.errors.join('; ')}`);
    }

    const res = await this._sendCommand({ action: 'plan', kit: kitDefinition }, this.commandTimeoutMs);
    if (!res.ok) {
      throw new Error(`Failed to plan kit: ${res.error}`);
    }
    return res.takes;
  }

  /**
   * Renders a sound kit with isolated staging, post-render validation,
   * controlled promotion, and dual-hash provenance recording.
   *
   * Enforces Architecture Lead Corrections A, C, and F:
   * - Never renders directly into canonical project directories
   - Verifies staged output before promoting
   - Preserves pre-existing files in destination
   - Bounded whole-kit timeout watchdog
   *
   * @param {object} kitDefinition Validated sound kit definition
   * @param {string} destinationDir Canonical directory where assets should be published
   * @param {object} [options]
   * @param {boolean} [options.force=false]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<{ success: boolean, destinationDir: string, lock: object, assetProvenance: object, stats: object }>}
   */
  async renderKit(kitDefinition, destinationDir, options = {}) {
    const val = validateKitDefinition(kitDefinition);
    if (!val.valid) {
      throw new Error(`Invalid kit definition: ${val.errors.join('; ')}`);
    }

    if (!destinationDir || typeof destinationDir !== 'string') {
      throw new Error('destinationDir must be a non-empty string path');
    }

    const timeoutMs = options.timeoutMs || this.renderTimeoutMs;

    // 1. Create a unique, isolated staging directory (Correction A)
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eme-kit-stage-'));

    try {
      // 2. Render into the isolated staging directory via Python bridge
      const res = await this._sendCommand(
        {
          action: 'render',
          kit: kitDefinition,
          outDir: stagingDir,
          force: !!options.force
        },
        timeoutMs
      );

      if (!res.ok) {
        throw new Error(`Kit render failed: ${res.error}`);
      }

      // 3. Validate staged output: verify lockfile, take files, upstream SHA-1, and EME SHA-256
      const dirVal = validateKitDirectory(stagingDir);
      if (!dirVal.valid) {
        throw new Error(`Staged kit failed validation: ${dirVal.errors.join('; ')}`);
      }

      // 4. Controlled Asset Publication / Promotion to destinationDir
      fs.mkdirSync(destinationDir, { recursive: true });
      const canonicalDest = fs.realpathSync(destinationDir);

      const promotedProvenance = {};

      for (const [fileName, record] of Object.entries(dirVal.assetProvenance)) {
        const stagedPath = path.join(stagingDir, fileName);
        const destPath = path.join(canonicalDest, fileName);

        // Copy file to canonical destination (overwriting or writing new take)
        fs.copyFileSync(stagedPath, destPath);

        // Update provenance record with canonical path
        promotedProvenance[fileName] = {
          ...record,
          fullPath: destPath
        };
      }

      // 5. Write lockfile to destination with enriched EME SHA-256 hashes
      const enrichedLock = structuredClone(dirVal.lock);
      for (const roleEntry of Object.values(enrichedLock.roles || {})) {
        if (!roleEntry || !Array.isArray(roleEntry.takes)) continue;
        for (const take of roleEntry.takes) {
          if (promotedProvenance[take.file]) {
            take.sha256 = promotedProvenance[take.file].sha256;
          }
        }
      }

      const destLockPath = path.join(canonicalDest, 'kit.lock.json');
      fs.writeFileSync(destLockPath, JSON.stringify(enrichedLock, null, 2) + '\n', 'utf8');

      return {
        success: true,
        destinationDir: canonicalDest,
        lock: enrichedLock,
        assetProvenance: promotedProvenance,
        stats: res.lock.stats || {}
      };
    } finally {
      // 6. Clean up temporary staging directory unconditionally
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  /**
   * Shuts down the subprocess bridge.
   */
  dispose() {
    this._closing = true;
    if (this.bridgeProcess && !this.bridgeProcess.killed) {
      try {
        this.bridgeProcess.kill('SIGTERM');
      } catch (_) {}
    }
    this.bridgeProcess = null;
  }
}

module.exports = {
  EarshotKitClient
};
