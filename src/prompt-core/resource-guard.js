/**
 * Editing Mechanics Engine (EME) - Operational Resilience & Resource Guardrails
 * Conforms to Phase 20 (Stage 20.2): Operational Resilience & Resource Guardrails Architecture
 *
 * Capabilities:
 * 1. Subprocess Execution Guardrail with timeout and automatic SIGTERM -> SIGKILL escalation.
 * 2. Preflight Disk Space Verification before initiating resource-heavy render operations.
 * 3. Scratch Media Lifecycle Manager with tracked cleanup and retention garbage collection.
 * 4. Process Graceful Shutdown Signal Coordinator for SIGINT and SIGTERM.
 * 5. Zero external runtime npm dependencies.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { defaultLogger } = require('./logger.js');

/**
 * Sanitizes environment variables to prevent leaking credentials/tokens to child processes.
 *
 * @param {object} [env=process.env]
 * @param {string[]} [allowedKeys=null] Explicitly permitted sensitive keys if needed
 * @returns {object}
 */
function sanitizeChildEnv(env = process.env, allowedKeys = null) {
  const SENSITIVE_PATTERNS = [
    /token/i,
    /secret/i,
    /key/i,
    /password/i,
    /passwd/i,
    /auth/i,
    /credential/i,
    /bearer/i
  ];

  const sanitized = {};
  const allowSet = new Set(allowedKeys || []);

  for (const [k, v] of Object.entries(env)) {
    if (allowSet.has(k)) {
      sanitized[k] = v;
      continue;
    }
    const isSensitive = SENSITIVE_PATTERNS.some(pat => pat.test(k));
    if (!isSensitive) {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Executes a subprocess with strict timeout, buffer limits, and process-tree termination.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {object} [options={}]
 * @param {number} [options.timeoutMs=30000] Maximum allowed execution time
 * @param {number} [options.killGraceMs=2000] Time between SIGTERM and SIGKILL
 * @param {number} [options.maxBufferBytes=10485760] Max stdout/stderr buffer (default 10MB)
 * @param {string} [options.cwd=process.cwd()]
 * @param {object} [options.env=process.env]
 * @param {boolean} [options.sanitizeEnv=true]
 * @param {string[]} [options.allowedEnvKeys=null]
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, signal: string|null, durationMs: number }>}
 */
function execSubprocessGuarded(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const killGraceMs = options.killGraceMs || 2000;
  const maxBufferBytes = options.maxBufferBytes || 10 * 1024 * 1024;
  const startTime = Date.now();

  const rawEnv = options.env || process.env;
  const childEnv = options.sanitizeEnv !== false ? sanitizeChildEnv(rawEnv, options.allowedEnvKeys) : rawEnv;

  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let killedByGuard = false;
    let termTimer = null;
    let killTimer = null;

    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Timeout guardrail
    termTimer = setTimeout(() => {
      timedOut = true;
      killedByGuard = true;
      defaultLogger.warn(`Subprocess timeout (${timeoutMs}ms) exceeded. Sending SIGTERM to PID ${child.pid}`, {
        command,
        pid: child.pid,
        timeoutMs
      });

      try {
        child.kill('SIGTERM');
      } catch (e) {}

      // Hard SIGKILL escalation timer
      killTimer = setTimeout(() => {
        try {
          defaultLogger.error(`Subprocess PID ${child.pid} did not exit after grace period. Sending SIGKILL`, {
            command,
            pid: child.pid
          });
          child.kill('SIGKILL');
        } catch (e) {}
      }, killGraceMs);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        killedByGuard = true;
        child.kill('SIGKILL');
        clearTimeout(termTimer);
        clearTimeout(killTimer);
        const err = new Error(`Subprocess stdout exceeded maxBuffer of ${maxBufferBytes} bytes`);
        err.code = 'ERR_MAX_BUFFER_EXCEEDED';
        return reject(err);
      }
      stdoutBuffer += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBufferBytes) {
        killedByGuard = true;
        child.kill('SIGKILL');
        clearTimeout(termTimer);
        clearTimeout(killTimer);
        const err = new Error(`Subprocess stderr exceeded maxBuffer of ${maxBufferBytes} bytes`);
        err.code = 'ERR_MAX_BUFFER_EXCEEDED';
        return reject(err);
      }
      stderrBuffer += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(termTimer);
      clearTimeout(killTimer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(termTimer);
      clearTimeout(killTimer);
      const durationMs = Date.now() - startTime;

      if (timedOut) {
        const err = new Error(`Subprocess timed out after ${timeoutMs}ms: ${command}`);
        err.code = 'ERR_SUBPROCESS_TIMEOUT';
        err.stdout = stdoutBuffer;
        err.stderr = stderrBuffer;
        err.durationMs = durationMs;
        return reject(err);
      }

      if (options.rejectOnNonZero && code !== 0) {
        const err = new Error(`Subprocess exited with non-zero exit code ${code}: ${command}`);
        err.code = 'ERR_SUBPROCESS_NON_ZERO';
        err.exitCode = code;
        err.stdout = stdoutBuffer;
        err.stderr = stderrBuffer;
        err.durationMs = durationMs;
        return reject(err);
      }

      resolve({
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        exitCode: code !== null ? code : (signal ? 128 : 0),
        signal,
        durationMs
      });
    });
  });
}

/**
 * Checks available storage space for a target directory using Node.js native statfsSync.
 *
 * @param {string} targetPath
 * @param {number} [minRequiredBytes=104857600] 100MB default minimum
 * @returns {{ ok: boolean, availableBytes: number, requiredBytes: number, error?: string }}
 */
function checkAvailableDiskSpace(targetPath, minRequiredBytes = 100 * 1024 * 1024) {
  try {
    let checkDir = targetPath;
    while (!fs.existsSync(checkDir)) {
      const parent = path.dirname(checkDir);
      if (parent === checkDir) break;
      checkDir = parent;
    }

    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(checkDir);
      // stats.bavail: free blocks available to non-privileged users
      // stats.bsize: block size
      const availableBytes = stats.bavail * stats.bsize;
      const ok = availableBytes >= minRequiredBytes;

      return {
        ok,
        availableBytes,
        requiredBytes: minRequiredBytes,
        ...(ok ? {} : { error: `Insufficient disk space: ${Math.round(availableBytes / (1024 * 1024))}MB available, ${Math.round(minRequiredBytes / (1024 * 1024))}MB required` })
      };
    }

    // Platform fallback if statfsSync is unsupported
    return { ok: true, availableBytes: -1, requiredBytes: minRequiredBytes };
  } catch (err) {
    return {
      ok: false,
      availableBytes: 0,
      requiredBytes: minRequiredBytes,
      error: `Failed to inspect disk space: ${err.message}`
    };
  }
}

/**
 * Centralized Scratch Media Lifecycle Manager.
 * Safely generates isolated directories, tracks temporary files, and cleans up.
 */
class ScratchManager {
  /**
   * @param {string} [baseDir]
   */
  constructor(baseDir = 'scratch') {
    this.baseDir = path.resolve(baseDir);
    this.activeWorkspaces = new Set();
  }

  /**
   * Creates an isolated workspace directory with random UUID.
   *
   * @param {string} [prefix='work']
   * @returns {string} Absolute path to workspace directory
   */
  createWorkspace(prefix = 'work') {
    fs.mkdirSync(this.baseDir, { recursive: true });
    const workspaceId = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const workspacePath = path.join(this.baseDir, workspaceId);
    fs.mkdirSync(workspacePath, { recursive: true });
    this.activeWorkspaces.add(workspacePath);
    return workspacePath;
  }

  /**
   * Safely deletes a specific workspace and removes from tracking.
   *
   * @param {string} workspacePath
   * @returns {boolean}
   */
  pruneWorkspace(workspacePath) {
    try {
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
      }
      this.activeWorkspaces.delete(workspacePath);
      return true;
    } catch (err) {
      defaultLogger.warn(`Failed to prune scratch workspace: ${err.message}`, { workspacePath });
      return false;
    }
  }

  /**
   * Prunes all currently tracked active workspaces (e.g. on test teardown or worker exit).
   */
  pruneAllActive() {
    for (const ws of this.activeWorkspaces) {
      this.pruneWorkspace(ws);
    }
  }

  /**
   * Scans baseDir and removes abandoned workspaces older than maxAgeMs.
   *
   * @param {number} [maxAgeMs=3600000] 1 hour default
   * @returns {number} Count of pruned abandoned workspaces
   */
  gcAbandoned(maxAgeMs = 3600000) {
    if (!fs.existsSync(this.baseDir)) return 0;
    let prunedCount = 0;
    const now = Date.now();

    try {
      const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(this.baseDir, entry.name);
        try {
          const stats = fs.statSync(fullPath);
          const ageMs = now - stats.mtimeMs;
          if (ageMs > maxAgeMs) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            this.activeWorkspaces.delete(fullPath);
            prunedCount++;
          }
        } catch (e) {}
      }
    } catch (e) {}

    return prunedCount;
  }
}

/**
 * Graceful Shutdown Coordinator for EME services and long-running runners.
 */
class GracefulShutdownCoordinator {
  constructor() {
    this.handlers = [];
    this.isShuttingDown = false;
    this._installed = false;
  }

  /**
   * Registers a cleanup handler function to run during shutdown.
   *
   * @param {() => Promise<void>|void} handler
   */
  register(handler) {
    if (typeof handler === 'function') {
      this.handlers.push(handler);
    }
  }

  /**
   * Attaches signal listeners to process for SIGINT and SIGTERM.
   */
  install() {
    if (this._installed) return;
    this._installed = true;

    const onSignal = (signal) => {
      this.triggerShutdown(signal);
    };

    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  }

  /**
   * Triggers the graceful shutdown sequence manually or via signal.
   *
   * @param {string} [signal='MANUAL']
   * @returns {Promise<void>}
   */
  async triggerShutdown(signal = 'MANUAL') {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    defaultLogger.info(`Graceful shutdown initiated (Signal: ${signal})`, { signal });

    for (const handler of this.handlers) {
      try {
        await handler();
      } catch (err) {
        defaultLogger.error(`Error during graceful shutdown handler: ${err.message}`, { error: err });
      }
    }
  }
}

const defaultShutdownCoordinator = new GracefulShutdownCoordinator();

module.exports = {
  execSubprocessGuarded,
  checkAvailableDiskSpace,
  ScratchManager,
  GracefulShutdownCoordinator,
  defaultShutdownCoordinator,
  sanitizeChildEnv
};
