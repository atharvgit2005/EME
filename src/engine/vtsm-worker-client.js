/**
 * EME VTSM Worker Subprocess Client & Lifecycle Manager
 *
 * Manages the persistent Python VTSM-03 worker daemon (MobileSAM + MPS)
 * over standard JSON-RPC over stdin/stdout.
 *
 * Hard Architectural Invariants:
 * - Read-only advisory perception service; zero execution authority.
 * - Subprocess lifecycle: health-checks, bounded memory, queue backpressure, graceful shutdown.
 * - Server-side path validation and media integrity verification.
 * - Strict session isolation; no cross-session or cross-clip state leakage.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class VtsmError extends Error {
  constructor(message, code = 'VTSM_ERROR') {
    super(message);
    this.name = 'VtsmError';
    this.code = code;
  }
}

class VtsmAuthorizationError extends VtsmError {
  constructor(message) {
    super(message, 'VTSM_AUTHORIZATION_ERROR');
    this.name = 'VtsmAuthorizationError';
  }
}

class VtsmTimeoutError extends VtsmError {
  constructor(message) {
    super(message, 'VTSM_TIMEOUT_ERROR');
    this.name = 'VtsmTimeoutError';
  }
}

class VtsmBackpressureError extends VtsmError {
  constructor(message) {
    super(message, 'VTSM_BACKPRESSURE_ERROR');
    this.name = 'VtsmBackpressureError';
  }
}

class VtsmProtocolError extends VtsmError {
  constructor(message) {
    super(message, 'VTSM_PROTOCOL_ERROR');
    this.name = 'VtsmProtocolError';
  }
}

class VtsmWorkerClient {
  constructor(options = {}) {
    this.repoRoot = path.resolve(__dirname, '../../');
    this.pythonPath = options.pythonPath ||
      process.env.EME_VTSM_PYTHON_PATH ||
      path.join(this.repoRoot, 'experiments/visual-temporal-state/.venv/bin/python3');
    this.workerScript = options.workerScript ||
      path.join(this.repoRoot, 'experiments/visual-temporal-state/src/tracker/vtsm03_worker.py');
    this.device = options.device || null;
    this.maxQueueDepth = options.maxQueueDepth || 16;
    this.commandTimeoutMs = options.commandTimeoutMs || 120000;
    this.maxMessageSizeBytes = options.maxMessageSizeBytes || 10 * 1024 * 1024; // 10MB limit

    this.process = null;
    this.readline = null;
    this.pendingCommands = [];
    this.currentCommand = null;
    this.deviceInfo = null;
    this.isRunning = false;
    this.activeSessions = new Map();
  }

  /**
   * Verify that required python binary and worker script exist.
   */
  checkPrerequisites() {
    if (!fs.existsSync(this.pythonPath)) {
      return {
        ok: false,
        reason: `Python virtualenv binary not found at ${this.pythonPath}`
      };
    }
    if (!fs.existsSync(this.workerScript)) {
      return {
        ok: false,
        reason: `VTSM worker daemon script not found at ${this.workerScript}`
      };
    }
    return { ok: true };
  }

  /**
   * Validate that target path is within authorized repository / tmp roots.
   */
  assertAuthorizedPath(targetPath, allowTmp = true) {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new VtsmAuthorizationError('Invalid or empty path specified');
    }

    const resolved = path.resolve(targetPath);
    const allowedRoots = [
      this.repoRoot,
      path.resolve(this.repoRoot, '..')
    ];
    if (allowTmp) {
      allowedRoots.push('/tmp');
      allowedRoots.push('/private/tmp');
    }

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
      throw new VtsmAuthorizationError(`Security violation: Path "${targetPath}" is outside authorized media/project roots.`);
    }
    return resolved;
  }

  /**
   * Calculate SHA-256 of media file.
   */
  static computeFileSha256(filePath) {
    const hash = crypto.createHash('sha256');
    const buffer = fs.readFileSync(filePath);
    hash.update(buffer);
    return hash.digest('hex');
  }

  /**
   * Start the persistent worker subprocess and verify connectivity via ping.
   */
  async start() {
    if (this.isRunning && this.process) {
      return { status: 'already_running', device: this.deviceInfo };
    }

    const prereq = this.checkPrerequisites();
    if (!prereq.ok) {
      throw new VtsmError(`Cannot start VtsmWorkerClient: ${prereq.reason}`);
    }

    const args = [this.workerScript, '--rpc'];
    if (this.device) {
      args.push('--device', this.device);
    }

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.pythonPath, args, {
          cwd: path.dirname(this.workerScript),
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
          }
        });
      } catch (err) {
        return reject(err);
      }

      this.isRunning = true;

      this.readline = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity
      });

      this.readline.on('line', (line) => {
        this._handleStdoutLine(line);
      });

      this.process.stderr.on('data', (chunk) => {
        if (process.env.DEBUG_VTSM) {
          process.stderr.write(`[VtsmSubprocessStderr] ${chunk}`);
        }
      });

      this.process.on('error', (err) => {
        this._handleProcessTermination(err);
      });

      this.process.on('exit', (code, signal) => {
        this._handleProcessTermination(new Error(`Worker exited with code ${code}, signal ${signal}`));
      });

      // Ping to confirm warm-up and get device info
      this.ping(45000)
        .then((pong) => {
          this.deviceInfo = pong.device || 'unknown';
          resolve({ status: 'ready', device: this.deviceInfo });
        })
        .catch((err) => {
          this.stop().catch(() => {});
          reject(new VtsmError(`Worker started but failed initial healthcheck: ${err.message}`));
        });
    });
  }

  /**
   * Check worker responsiveness with a ping RPC.
   */
  async ping(timeoutMs = 5000) {
    const envelope = {
      protocolVersion: '1.0.0',
      requestId: crypto.randomUUID(),
      command: 'ping'
    };
    const res = await this._sendCommand(envelope, timeoutMs);
    return res;
  }

  /**
   * Process a full video clip or range using the pre-warmed worker.
   */
  async processVideo(params = {}) {
    if (!params || !params.videoPath || !params.outputPath) {
      throw new VtsmError('processVideo requires videoPath and outputPath');
    }

    const resolvedVideo = this.assertAuthorizedPath(params.videoPath);
    const resolvedOutput = this.assertAuthorizedPath(params.outputPath);

    if (!fs.existsSync(resolvedVideo)) {
      throw new VtsmError(`Source video does not exist: ${resolvedVideo}`);
    }

    const outputDir = path.dirname(resolvedOutput);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const sessionId = params.sessionId || crypto.randomUUID();
    const projectId = params.projectId || 'unbound';
    const requestId = crypto.randomUUID();

    let sourceSha256 = params.sourceSha256;
    if (!sourceSha256) {
      sourceSha256 = VtsmWorkerClient.computeFileSha256(resolvedVideo);
    }

    this.activeSessions.set(sessionId, {
      sessionId,
      projectId,
      sourceSha256,
      videoPath: resolvedVideo,
      outputPath: resolvedOutput,
      startTime: Date.now(),
      status: 'processing'
    });

    try {
      const payload = {
        protocolVersion: '1.0.0',
        requestId,
        sessionId,
        command: 'process',
        video_path: resolvedVideo,
        output_path: resolvedOutput,
        ablation_mode: params.ablationMode || 'vtsm03_adaptive_hybrid',
        flow_algo: params.flowAlgo || 'sparse_lk'
      };

      const timeout = params.timeoutMs || this.commandTimeoutMs;
      const res = await this._sendCommand(payload, timeout);

      if (res.status !== 'success') {
        throw new VtsmError(res.message || 'Worker returned unsuccessful status');
      }

      const resultEnvelope = {
        protocolVersion: '1.0.0',
        requestId,
        sessionId,
        projectId,
        sourceSha256,
        status: 'success',
        ...res
      };

      this.activeSessions.set(sessionId, {
        ...this.activeSessions.get(sessionId),
        status: 'completed',
        completionResult: resultEnvelope
      });

      return resultEnvelope;
    } catch (err) {
      this.activeSessions.set(sessionId, {
        ...this.activeSessions.get(sessionId),
        status: 'failed',
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Cancel an active tracking session.
   */
  cancelSession(sessionId) {
    if (!this.activeSessions.has(sessionId)) {
      return { status: 'not_found' };
    }
    const session = this.activeSessions.get(sessionId);
    session.status = 'canceled';
    session.canceledAt = Date.now();
    return { status: 'canceled', sessionId };
  }

  /**
   * Get session status.
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Restart worker subprocess.
   */
  async restart() {
    await this.stop();
    return this.start();
  }

  /**
   * Internal queue & RPC dispatcher.
   */
  _sendCommand(cmdObj, timeoutMs) {
    if (!this.isRunning || !this.process) {
      return Promise.reject(new VtsmError('VtsmWorkerClient is not running'));
    }

    if (this.pendingCommands.length >= this.maxQueueDepth) {
      return Promise.reject(new VtsmBackpressureError(`Backpressure limit exceeded: pending queue at maximum capacity (${this.maxQueueDepth})`));
    }

    return new Promise((resolve, reject) => {
      const item = {
        cmd: cmdObj,
        resolve,
        reject,
        timeoutMs: timeoutMs || this.commandTimeoutMs,
        timer: null
      };

      this.pendingCommands.push(item);
      this._flushQueue();
    });
  }

  _flushQueue() {
    if (this.currentCommand || this.pendingCommands.length === 0) {
      return;
    }

    const next = this.pendingCommands.shift();
    this.currentCommand = next;

    const line = JSON.stringify(next.cmd) + '\n';

    next.timer = setTimeout(() => {
      if (this.currentCommand === next) {
        this.currentCommand = null;
        next.reject(new VtsmTimeoutError(`VTSM worker command timed out after ${next.timeoutMs}ms`));
        this._flushQueue();
      }
    }, next.timeoutMs);

    try {
      this.process.stdin.write(line, 'utf8', (err) => {
        if (err) {
          clearTimeout(next.timer);
          this.currentCommand = null;
          next.reject(new VtsmError(`Error writing to worker stdin: ${err.message}`));
          this._flushQueue();
        }
      });
    } catch (writeErr) {
      clearTimeout(next.timer);
      this.currentCommand = null;
      next.reject(new VtsmError(`Write error to worker process: ${writeErr.message}`));
      this._flushQueue();
    }
  }

  _handleStdoutLine(line) {
    line = line.trim();
    if (!line) return;

    if (line.length > this.maxMessageSizeBytes) {
      if (this.currentCommand) {
        const active = this.currentCommand;
        this.currentCommand = null;
        clearTimeout(active.timer);
        active.reject(new VtsmProtocolError(`Worker output exceeded maximum allowed size (${this.maxMessageSizeBytes} bytes)`));
        this._flushQueue();
      }
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      if (process.env.DEBUG_VTSM) {
        console.warn(`[VtsmWorkerClient] Non-JSON line from worker: ${line}`);
      }
      return;
    }

    if (this.currentCommand) {
      const active = this.currentCommand;
      this.currentCommand = null;
      clearTimeout(active.timer);

      // Correlation verification
      if (parsed.requestId && active.cmd.requestId && parsed.requestId !== active.cmd.requestId) {
        active.reject(new VtsmProtocolError(`Mismatched requestId: expected ${active.cmd.requestId}, got ${parsed.requestId}`));
      } else {
        // Echo requestId and sessionId if not present
        if (!parsed.requestId && active.cmd.requestId) {
          parsed.requestId = active.cmd.requestId;
        }
        if (!parsed.sessionId && active.cmd.sessionId) {
          parsed.sessionId = active.cmd.sessionId;
        }
        active.resolve(parsed);
      }
      this._flushQueue();
    }
  }

  _handleProcessTermination(err) {
    this.isRunning = false;
    this.deviceInfo = null;

    if (this.currentCommand) {
      clearTimeout(this.currentCommand.timer);
      this.currentCommand.reject(new VtsmError(`Worker process crashed during command: ${err.message}`));
      this.currentCommand = null;
    }

    while (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift();
      cmd.reject(new VtsmError(`Worker process terminated: ${err.message}`));
    }
  }

  /**
   * Graceful shutdown of subprocess.
   */
  async stop(timeoutMs = 5000) {
    if (!this.isRunning || !this.process) {
      return { status: 'stopped' };
    }

    return new Promise((resolve) => {
      const proc = this.process;
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          this.isRunning = false;
          this.process = null;
          this.readline = null;
          resolve({ status: 'stopped' });
        }
      };

      const forceKillTimer = setTimeout(() => {
        if (proc && !proc.killed) {
          try {
            proc.kill('SIGKILL');
          } catch (_) {}
        }
        finish();
      }, timeoutMs);

      try {
        proc.stdin.write(JSON.stringify({ command: 'exit' }) + '\n', 'utf8', () => {
          setTimeout(() => {
            if (proc && !proc.killed) {
              try {
                proc.kill('SIGTERM');
              } catch (_) {}
            }
          }, 500);
        });
      } catch (_) {
        try {
          proc.kill('SIGTERM');
        } catch (__) {}
      }

      proc.once('exit', () => {
        clearTimeout(forceKillTimer);
        finish();
      });
    });
  }
}

module.exports = {
  VtsmWorkerClient,
  VtsmError,
  VtsmAuthorizationError,
  VtsmTimeoutError,
  VtsmBackpressureError,
  VtsmProtocolError
};
