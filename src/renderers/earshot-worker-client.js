/**
 * Editing Mechanics Engine (EME) - Phase 25: Earshot Worker Client
 *
 * Manages the persistent Python Earshot worker daemon subprocess
 * over standard line-delimited JSON over stdin/stdout.
 *
 * Hard Architectural Constraints:
 * 1. Read-only perception service; zero execution or mutation authority.
 * 2. Separate timeout budgets: startup (5,000ms), command fast_dsp (2,000ms), shutdown grace (500ms).
 * 3. Strict path containment using realpathSync (rejecting symlink traversal).
 * 4. Sanitized child environment (stripping API keys and sensitive tokens).
 * 5. Fail-safe fallback: returns NOT_MEASURED on missing Python or timeouts, never throwing or crashing parent.
 */

const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const {
  EarshotContractValidator,
  STATUS_TAXONOMY
} = require('./earshot-contract-validator.js');

class EarshotWorkerClient {
  constructor(options = {}) {
    this.repoRoot = path.resolve(__dirname, '../../');
    this.pythonPath = options.pythonPath ||
      process.env.EME_EARSHOT_PYTHON_PATH ||
      '/tmp/earshot/.venv/bin/python3';
    this.bridgeScript = options.bridgeScript ||
      path.join(__dirname, 'earshot-worker-bridge.py');

    this.startupTimeoutMs = options.startupTimeoutMs || 5000;
    this.commandTimeoutMs = options.commandTimeoutMs || 2000;
    this.perceptionTimeoutMs = options.perceptionTimeoutMs || 15000;
    this.shutdownGraceMs = options.shutdownGraceMs || 500;
    this.maxMessageSizeBytes = options.maxMessageSizeBytes || 5 * 1024 * 1024; // 5MB limit
    this.maxQueueDepth = options.maxQueueDepth || 16;

    this.process = null;
    this.readline = null;
    this.pendingCommands = [];
    this.currentCommand = null;
    this.isRunning = false;
    this.earshotAvailable = false;
    this.workerPid = null;
  }

  /**
   * Verify that required python binary and bridge script exist.
   *
   * @returns {{ ok: boolean, reason?: string }}
   */
  checkPrerequisites() {
    if (!fs.existsSync(this.pythonPath)) {
      return {
        ok: false,
        reason: `Python virtualenv binary not found at ${this.pythonPath}`
      };
    }
    if (!fs.existsSync(this.bridgeScript)) {
      return {
        ok: false,
        reason: `Earshot worker bridge script not found at ${this.bridgeScript}`
      };
    }
    return { ok: true };
  }

  /**
   * Validate that target path is within authorized repository / tmp roots.
   * Resolves symlinks using realpathSync to prevent traversal escapes.
   *
   * @param {string} targetPath
   * @returns {string} resolved safe canonical path
   */
  assertAuthorizedPath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Invalid or empty path specified');
    }

    const resolved = path.resolve(targetPath);
    const allowedRoots = [
      this.repoRoot,
      '/tmp',
      '/private/tmp'
    ];

    let current = resolved;
    while (!fs.existsSync(current) && path.dirname(current) !== current) {
      current = path.dirname(current);
    }

    let real = resolved;
    if (fs.existsSync(current)) {
      try {
        const realParent = fs.realpathSync(current);
        const remainder = path.relative(current, resolved);
        real = remainder ? path.join(realParent, remainder) : realParent;
      } catch (_) {}
    }

    const isSafe = allowedRoots.some(allowed => real.startsWith(allowed));
    if (!isSafe) {
      throw new Error(`Security violation: Path "${targetPath}" is outside authorized media/project roots.`);
    }
    return resolved;
  }

  /**
   * Builds sanitized environment stripping sensitive tokens.
   */
  getSanitizedEnv() {
    const safeEnv = { ...process.env };
    const sensitiveKeys = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'AWS_SECRET_ACCESS_KEY',
      'GITHUB_TOKEN',
      'NPM_TOKEN'
    ];
    for (const key of sensitiveKeys) {
      delete safeEnv[key];
    }
    return safeEnv;
  }

  /**
   * Start the persistent worker subprocess and verify connectivity via ping handshake.
   *
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async start() {
    if (this.isRunning && this.process) {
      return { ok: true };
    }

    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      return prereq;
    }

    return new Promise((resolve) => {
      let startupTimer = null;

      try {
        this.process = spawn(this.pythonPath, [this.bridgeScript], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.getSanitizedEnv()
        });
      } catch (err) {
        return resolve({ ok: false, reason: `Failed to spawn worker process: ${err.message}` });
      }

      this.currentCommand = null;
      this.pendingCommands = [];
      const procInstance = this.process;
      this.workerPid = this.process.pid;

      this.readline = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
        terminal: false
      });

      this.readline.on('line', (line) => {
        this.handleWorkerOutput(line);
      });

      this.process.stderr.on('data', () => {
        // Suppress or log worker stderr if needed
      });

      this.process.on('error', (err) => {
        if (this.process === procInstance) {
          this.handleProcessCrash(err);
        }
      });

      this.process.on('exit', (code, signal) => {
        if (this.process === procInstance) {
          this.handleProcessExit(code, signal);
        }
      });

      startupTimer = setTimeout(() => {
        this.stop();
        resolve({ ok: false, reason: `Worker startup handshake timed out after ${this.startupTimeoutMs}ms` });
      }, this.startupTimeoutMs);

      // Perform handshake ping
      this.sendRawCommand({ action: 'ping' }, this.startupTimeoutMs)
        .then((resp) => {
          clearTimeout(startupTimer);
          if (resp && resp.status === 'pong') {
            this.isRunning = true;
            this.earshotAvailable = !!resp.earshot_available;
            resolve({ ok: true });
          } else {
            this.stop();
            resolve({ ok: false, reason: `Handshake failed: unexpected response ${JSON.stringify(resp)}` });
          }
        })
        .catch((err) => {
          clearTimeout(startupTimer);
          this.stop();
          resolve({ ok: false, reason: `Handshake command failed: ${err.message}` });
        });
    });
  }

  /**
   * Execute an Earshot QA request through the worker daemon.
   *
   * @param {object} request validated EarshotQaRequest
   * @returns {Promise<object>} EarshotQaResponse
   */
  async executeQa(request) {
    const startTime = Date.now();
    const reqId = request?.request_id || `req-earshot-${Date.now()}`;
    const mode = request?.options?.mode || 'fast_dsp';

    // 1. Check prerequisites & path authorization
    try {
      this.assertAuthorizedPath(request.media_path);
      if (request.options?.sheet_output_path) {
        this.assertAuthorizedPath(request.options.sheet_output_path);
      }
    } catch (authErr) {
      return {
        request_id: reqId,
        status: 'WORKER_ERROR',
        mode: mode,
        execution_time_ms: Date.now() - startTime,
        loudness: null,
        sfx_integrity: null,
        sync: null,
        critique: null,
        sheet_path: null,
        error: {
          code: 'SECURITY_AUTHORIZATION_FAILED',
          message: authErr.message,
          details: null
        }
      };
    }

    // 2. Validate request contract
    const reqVal = EarshotContractValidator.validateRequest(request);
    if (!reqVal.valid) {
      return {
        request_id: reqId,
        status: 'WORKER_ERROR',
        mode: mode,
        execution_time_ms: Date.now() - startTime,
        loudness: null,
        sfx_integrity: null,
        sync: null,
        critique: null,
        sheet_path: null,
        error: {
          code: 'INVALID_REQUEST_CONTRACT',
          message: `Request failed schema validation: ${reqVal.errors.join('; ')}`,
          details: null
        }
      };
    }

    // 3. Ensure worker is running
    if (!this.isRunning) {
      const startRes = await this.start();
      if (!startRes.ok) {
        return {
          request_id: reqId,
          status: 'NOT_MEASURED',
          mode: mode,
          execution_time_ms: Date.now() - startTime,
          loudness: null,
          sfx_integrity: null,
          sync: null,
          critique: null,
          sheet_path: null,
          error: {
            code: 'WORKER_UNAVAILABLE',
            message: `Earshot worker unavailable: ${startRes.reason}`,
            details: null
          }
        };
      }
    }

    // 4. Select appropriate timeout budget
    const timeoutMs = mode === 'full_perception' ? this.perceptionTimeoutMs : this.commandTimeoutMs;

    // 5. Send command to worker
    try {
      const rawResp = await this.sendRawCommand(request, timeoutMs);
      rawResp.execution_time_ms = Date.now() - startTime;
      return rawResp;
    } catch (err) {
      const isTimeout = err.message.includes('timed out');
      return {
        request_id: reqId,
        status: isTimeout ? 'TIMEOUT' : 'WORKER_ERROR',
        mode: mode,
        execution_time_ms: Date.now() - startTime,
        loudness: null,
        sfx_integrity: null,
        sync: null,
        critique: null,
        sheet_path: null,
        error: {
          code: isTimeout ? 'WATCHDOG_TIMEOUT' : 'COMMAND_EXECUTION_ERROR',
          message: err.message,
          details: null
        }
      };
    }
  }

  /**
   * Send single command over stdin and await matching response.
   */
  async sendRawCommand(cmdObj, timeoutMs) {
    if (this.pendingCommands.length >= this.maxQueueDepth) {
      throw new Error(`Worker queue saturation: depth exceeded limit (${this.maxQueueDepth})`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Watchdog timeout expired
        if (this.currentCommand && this.currentCommand.resolve === resolve) {
          this.currentCommand = null;
        }
        this.stop(); // Force terminate hung worker
        reject(new Error(`Earshot command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const cmdItem = {
        cmdObj,
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      };

      this.pendingCommands.push(cmdItem);
      this.pumpQueue();
    });
  }

  pumpQueue() {
    if (this.currentCommand || this.pendingCommands.length === 0) {
      return;
    }

    if (!this.process || !this.process.stdin.writable) {
      const item = this.pendingCommands.shift();
      item.reject(new Error('Cannot send command: worker stdin is not writable'));
      return;
    }

    this.currentCommand = this.pendingCommands.shift();
    const payload = JSON.stringify(this.currentCommand.cmdObj) + '\n';
    this.process.stdin.write(payload, 'utf8');
  }

  handleWorkerOutput(line) {
    if (!this.currentCommand) return;

    if (line.length > this.maxMessageSizeBytes) {
      const cmd = this.currentCommand;
      this.currentCommand = null;
      cmd.reject(new Error(`Worker response exceeded maximum size limit (${this.maxMessageSizeBytes} bytes)`));
      this.pumpQueue();
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (parseErr) {
      const cmd = this.currentCommand;
      this.currentCommand = null;
      cmd.reject(new Error(`Failed to parse worker JSON output: ${parseErr.message}`));
      this.pumpQueue();
      return;
    }

    const cmd = this.currentCommand;
    this.currentCommand = null;
    cmd.resolve(parsed);
    this.pumpQueue();
  }

  handleProcessCrash(err) {
    this.isRunning = false;
    if (this.currentCommand) {
      this.currentCommand.reject(new Error(`Worker process error: ${err.message}`));
      this.currentCommand = null;
    }
    while (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift();
      cmd.reject(new Error(`Worker process crashed: ${err.message}`));
    }
  }

  handleProcessExit(code, signal) {
    this.isRunning = false;
    this.process = null;
    this.readline = null;
    if (this.currentCommand) {
      this.currentCommand.reject(new Error(`Worker exited with code ${code} (signal: ${signal})`));
      this.currentCommand = null;
    }
    while (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift();
      cmd.reject(new Error(`Worker exited prematurely (code: ${code})`));
    }
  }

  /**
   * Graceful shutdown of worker process (SIGTERM -> grace period -> SIGKILL).
   */
  stop() {
    this.isRunning = false;
    if (this.currentCommand) {
      try { this.currentCommand.reject(new Error('Worker stopped')); } catch (_) {}
      this.currentCommand = null;
    }
    while (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift();
      try { cmd.reject(new Error('Worker stopped')); } catch (_) {}
    }

    if (this.readline) {
      try { this.readline.close(); } catch (_) {}
      this.readline = null;
    }

    if (!this.process) {
      return;
    }

    const proc = this.process;
    this.process = null;

    try {
      proc.removeAllListeners('exit');
      proc.removeAllListeners('error');
      proc.removeAllListeners('close');
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL');
        } catch (_) {}
      }, this.shutdownGraceMs);
    } catch (_) {}
  }
}

module.exports = {
  EarshotWorkerClient
};
