/**
 * EME Visual Control Surface - Local Backend Service
 *
 * Provides RESTful API endpoints strictly bound to canonical EME operations:
 * - GET  /api/health
 * - GET  /api/project?path=...
 * - POST /api/project/save
 * - POST /api/project/operation  (Applies atomic OperationExecutor operation with Undo/Redo tracking)
 * - POST /api/project/undo
 * - POST /api/project/redo
 * - POST /api/render
 * - POST /api/inspect-frame
 * - POST /api/qa
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { ProjectManager } = require('../engine/project.js');
const { OperationExecutor } = require('../engine/operations.js');
const { ApprovalAuthority } = require('../creative/approval-authority.js');
const { ExecutionAuthority } = require('../creative/execution-authority.js');
const { HyperFramesCompiler } = require('../renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../renderers/inspector.js');
const { QualityAssuranceEngine } = require('../renderers/qa-engine.js');
const { assertSafePath } = require('../mcp/server.js');
const { TimelineAdapter } = require('../engine/timeline-adapter.js');
const { AudioWaveformService } = require('../engine/audio-waveform.js');
const { validateColorGrade } = require('../engine/color-grade.js');
const { isCertifiedLutId, isSentinelId, resolveCertifiedLut } = require('../engine/lut-registry.js');
const { getOrLoadLut } = require('../engine/lut-evaluator.js');
const { gradeImageBuffer } = require('../engine/color-operations.js');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  BriefValidator,
  CandidateOrchestrator,
  RevisionSessionManager,
  RevisionOrchestrator,
  RenderOrchestrator,
  OrchestrationJobStatus,
  OrchestrationJobManager,
  EndToEndOrchestrator,
  runWithCorrelation,
  getActiveCorrelationId,
  defaultLogger,
  SloMonitor,
  defaultSloMonitor
} = require('../prompt-core/index.js');
const { MetricsCollector, defaultMetricsCollector } = require('./metrics-collector.js');

class EditorBackend {
  constructor(options = {}) {
    this.port = options.port !== undefined ? options.port : 4321;
    this.activeProjectPath = options.projectPath || null;
    this.currentProject = options.project || null;
    this.undoStack = [];
    this.redoStack = [];
    this.server = null;
    this.metricsCollector = options.metricsCollector || defaultMetricsCollector;
    this.sloMonitor = options.sloMonitor || defaultSloMonitor;
    this.productionMonitor = options.productionMonitor || null;
    this.maxBodySizeBytes = options.maxBodySizeBytes !== undefined ? options.maxBodySizeBytes : 10 * 1024 * 1024;

    // Session and candidate state
    this.activeSession = options.session || null;
    this.activeSessionPath = options.sessionPath || null;
    this.activeCandidateSet = options.candidateSet || null;
    this.activeCandidateSetPath = options.candidateSetPath || null;
    this.outputDir = options.outputDir || 'artifacts/deliverables';
    this.isMutating = false; // Concurrency write mutex
    this.idempotencyCache = new Map(); // Bounded LRU idempotency cache (operationId -> { payloadHash, response })
    this.authorizedMedia = new Map(); // artifactId or resolvedPath -> realPath
    this.jobManager = options.jobManager || new OrchestrationJobManager(path.join(this.outputDir, 'jobs'));

    // If active session has an active delivery and project wasn't explicitly supplied, resolve it
    if (!this.currentProject && this.activeSession && this.activeSession.active_delivery) {
      const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery.revision_id);
      if (activeHist?._project) {
        this.currentProject = activeHist._project;
      } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
        try {
          this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8'));
        } catch (e) {}
      }
    }

    if (this.currentProject) {
      this._registerProjectMedia(this.currentProject);
    }
    if (this.activeCandidateSet) {
      this._registerCandidateMedia(this.activeCandidateSet);
    }
    if (this.activeSession) {
      this._registerSessionMedia(this.activeSession);
    }
  }

  _registerMediaFile(id, filePath) {
    if (!filePath) return;
    try {
      const resolved = path.resolve(filePath);
      let real = resolved;
      if (fs.existsSync(resolved)) {
        real = fs.realpathSync(resolved);
      }
      if (id) {
        this.authorizedMedia.set(id, real);
      }
      this.authorizedMedia.set(real, real);
      this.authorizedMedia.set(resolved, real);
    } catch (e) {
      // ignore path resolution error
    }
  }

  _registerCandidateMedia(candidateSet) {
    if (!candidateSet || !Array.isArray(candidateSet.candidates)) return;
    for (const cand of candidateSet.candidates) {
      if (cand.deliverable?.media_path) {
        this._registerMediaFile(cand.candidate_id, cand.deliverable.media_path);
        if (cand.deliverable.manifest_id) {
          this._registerMediaFile(cand.deliverable.manifest_id, cand.deliverable.media_path);
        }
      }
    }
  }

  _registerSessionMedia(sessionDoc) {
    if (!sessionDoc) return;
    if (sessionDoc.active_delivery?.media_path) {
      this._registerMediaFile(sessionDoc.active_delivery.revision_id, sessionDoc.active_delivery.media_path);
      this._registerMediaFile(sessionDoc.active_delivery.manifest_id, sessionDoc.active_delivery.media_path);
      this._registerMediaFile('active_delivery', sessionDoc.active_delivery.media_path);
    }
    if (Array.isArray(sessionDoc.history)) {
      for (const h of sessionDoc.history) {
        if (h.media_path) {
          this._registerMediaFile(h.revision_id, h.media_path);
          if (h.manifest_id) {
            this._registerMediaFile(h.manifest_id, h.media_path);
          }
        }
      }
    }
  }

  _registerProjectMedia(project) {
    if (!project) return;
    if (Array.isArray(project.clips)) {
      for (const clip of project.clips) {
        if (clip.assetPath) {
          this._registerMediaFile(clip.id, clip.assetPath);
        }
      }
    }
  }

  _resolveAuthorizedPath(filePath) {
    if (!filePath) return null;
    if (this.authorizedMedia.has(filePath)) {
      return this.authorizedMedia.get(filePath);
    }
    try {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        const real = fs.realpathSync(resolved);
        if (this.authorizedMedia.has(real) || this.authorizedMedia.has(resolved)) {
          return real;
        }
        const projectRoot = path.resolve(__dirname, '../..');
        if (real.startsWith(projectRoot)) {
          return real;
        }
      }
    } catch (e) {}
    return null;
  }

  _getProductionMonitor() {
    if (!this.productionMonitor) {
      const { ProductionMonitor } = require('../prompt-core/production-monitor.js');
      this.productionMonitor = new ProductionMonitor({ sloMonitor: this.sloMonitor });
    }
    return this.productionMonitor;
  }

  _getOrExtractFrame(resolvedMedia, frameTick = 0, width = 640, height = 360) {
    if (!this.frameBufferCache) this.frameBufferCache = new Map();
    const cacheKey = `${resolvedMedia}:${frameTick}:${width}x${height}`;
    if (this.frameBufferCache.has(cacheKey)) {
      return this.frameBufferCache.get(cacheKey);
    }

    const seconds = Math.max(0, (frameTick || 0) / 120000.0);
    const { EnvironmentResolver } = require('../engine/environment.js');
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

    const res = spawnSync(ffmpegBin, [
      '-ss', seconds.toFixed(4),
      '-i', resolvedMedia,
      '-vframes', '1',
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-'
    ], { maxBuffer: 10 * 1024 * 1024 });

    if (res.status === 0 && res.stdout.length === width * height * 4) {
      const buf = new Uint8ClampedArray(res.stdout.buffer, res.stdout.byteOffset, res.stdout.byteLength);
      if (this.frameBufferCache.size > 20) {
        const oldestKey = this.frameBufferCache.keys().next().value;
        this.frameBufferCache.delete(oldestKey);
      }
      this.frameBufferCache.set(cacheKey, buf);
      return buf;
    }

    return this._generateSyntheticFrame(width, height);
  }

  _encodeRgbaToJpegDataUri(rgbaBuffer, width = 640, height = 360) {
    const { EnvironmentResolver } = require('../engine/environment.js');
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

    const res = spawnSync(ffmpegBin, [
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-i', '-',
      '-f', 'image2',
      '-c:v', 'mjpeg',
      '-q:v', '4',
      '-'
    ], { input: Buffer.from(rgbaBuffer.buffer, rgbaBuffer.byteOffset, rgbaBuffer.byteLength) });

    if (res.status === 0 && res.stdout.length > 0) {
      return `data:image/jpeg;base64,${res.stdout.toString('base64')}`;
    }
    throw new Error(`JPEG encoding failed: ${res.stderr ? res.stderr.toString() : 'unknown error'}`);
  }

  _generateSyntheticFrame(width = 640, height = 360) {
    const buf = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const ramp = Math.floor((x / (width - 1)) * 255);
        if (y < height * 0.3) {
          buf[idx] = ramp;
          buf[idx + 1] = ramp;
          buf[idx + 2] = ramp;
        } else if (y < height * 0.6) {
          if (x < width * 0.5) {
            buf[idx] = 205;
            buf[idx + 1] = 145;
            buf[idx + 2] = 115;
          } else {
            buf[idx] = Math.floor((y / height) * 255);
            buf[idx + 1] = ramp;
            buf[idx + 2] = 255 - ramp;
          }
        } else {
          buf[idx] = 128;
          buf[idx + 1] = 128;
          buf[idx + 2] = 128;
        }
        buf[idx + 3] = 255;
      }
    }
    return buf;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object' && addr.port) {
          this.port = addr.port;
        }
        console.log(`[EME Editor] Visual Control Surface running at http://localhost:${this.port}`);
        resolve(this.port);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        if (typeof this.server.closeAllConnections === 'function') {
          this.server.closeAllConnections();
        } else if (typeof this.server.closeIdleConnections === 'function') {
          this.server.closeIdleConnections();
        }
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  async handleRequest(req, res) {
    // Strict URL-level path traversal guard
    const rawUrl = req.url || '';
    if (rawUrl.includes('..') || rawUrl.toLowerCase().includes('%2e%2e')) {
      return this.sendJson(res, 403, { error: 'Access denied: Path traversal detected', errorCode: 'FORBIDDEN' });
    }

    const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;

    const incomingCorrelation = req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const rawStr = Array.isArray(incomingCorrelation) ? incomingCorrelation[0] : incomingCorrelation;
    const sanitizedId = typeof rawStr === 'string'
      ? rawStr.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 128)
      : null;
    const correlationId = (sanitizedId && sanitizedId.length > 0)
      ? sanitizedId
      : `req-${crypto.randomBytes(8).toString('hex')}`;

    // CORS & Security Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Correlation-Id, X-Request-Id, X-EME-Approval-Token');
    res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id');
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const startHr = process.hrtime();
    res.on('finish', () => {
      const diff = process.hrtime(startHr);
      const durationSec = diff[0] + diff[1] / 1e9;
      if (this.metricsCollector) {
        this.metricsCollector.recordHttpRequest(req.method, pathname, res.statusCode, durationSec);
      }
    });

    return runWithCorrelation(correlationId, () => this._handleRequestInternal(req, res, parsedUrl, pathname));
  }

  async _handleRequestInternal(req, res, parsedUrl, pathname) {
    try {
      // These legacy commit recipes cannot prove correspondence to sealed operations.
      // Withhold them before any job, session, import, or delivery state is touched.
      const unboundCommitRoutes = new Set([
        '/api/session/init', '/api/session/select', '/api/session/revise',
        '/api/session/undo', '/api/session/redo', '/api/session/recover',
        '/api/jobs', '/api/capcut/import', '/api/project/save'
      ]);
      if (req.method === 'POST' && (unboundCommitRoutes.has(pathname) ||
          (pathname.startsWith('/api/jobs/') && /\/(approve|execute)$/.test(pathname)))) {
        return this.sendJson(res, 403, { success: false, errorCode: 'ERR_APPROVAL_REQUIRED',
          error: 'This legacy commit route has no sealed execution binding. Prepare exact canonical operations through /api/approval/request or MCP and use protected execution.' });
      }
      if (pathname === '/api/approval/request' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!this.currentProject) return this.sendJson(res, 400, { error: 'No active project loaded' });
        let operation = body.operation;
        if (body.historyAction === 'undo' || body.historyAction === 'redo') {
          const stack = body.historyAction === 'undo' ? this.undoStack : this.redoStack;
          if (!stack.length) return this.sendJson(res, 400, { error: 'History stack is empty' });
          operation = { type: 'restore_project_history', params: { snapshot: stack[stack.length - 1] } };
        }
        const pending = ApprovalAuthority.createPendingRequest({
          project: this.currentProject, operation,
          creativePlan: body.creativePlan, operationPlan: body.operationPlan, options: body.options || {}
        });
        return this.sendJson(res, 200, { success: true, ...pending });
      }
      if (pathname === '/metrics' && req.method === 'GET') {
        const baseMetrics = this.metricsCollector ? this.metricsCollector.toPrometheusText() : '';
        const sloMetrics = this.sloMonitor ? this.sloMonitor.toPrometheusText() : '';
        const metricsText = (baseMetrics.trim() + '\n\n' + sloMetrics.trim()).trim() + '\n';
        res.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Content-Length': Buffer.byteLength(metricsText, 'utf8')
        });
        return res.end(metricsText);
      }

      if ((pathname === '/api/health' || pathname === '/healthz') && req.method === 'GET') {
        return this.sendJson(res, 200, { status: 'ok', version: '0.1.0-rc1', correlation_id: getActiveCorrelationId() });
      }

      if ((pathname === '/api/slo' || pathname === '/healthz/slo') && req.method === 'GET') {
        const sloStatus = this.sloMonitor ? this.sloMonitor.getSloStatus() : { status: 'UNKNOWN', all_slos_met: true };
        const statusCode = sloStatus.status === 'HEALTHY' ? 200 : 503;
        return this.sendJson(res, statusCode, {
          ...sloStatus,
          version: '0.1.0-rc1',
          correlation_id: getActiveCorrelationId()
        });
      }

      if (pathname === '/readyz' && req.method === 'GET') {
        const sloStatus = this.sloMonitor ? this.sloMonitor.getSloStatus() : { all_slos_met: true };
        return this.sendJson(res, 200, {
          status: 'ready',
          all_slos_met: sloStatus.all_slos_met,
          version: '0.1.0-rc1',
          correlation_id: getActiveCorrelationId()
        });
      }

      if ((pathname === '/api/production/health' || pathname === '/healthz/production') && req.method === 'GET') {
        const monitor = this._getProductionMonitor();
        const prodHealth = monitor.getProductionHealth();
        const statusCode = prodHealth.status === 'HEALTHY' ? 200 : 503;
        return this.sendJson(res, statusCode, {
          ...prodHealth,
          version: '0.1.0-rc1',
          correlation_id: getActiveCorrelationId()
        });
      }

      if (pathname === '/metrics/operational' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'X-Content-Type-Options': 'nosniff'
        });
        const monitor = this._getProductionMonitor();
        const metricsText = monitor.toOperationalPrometheusText();
        return res.end(metricsText);
      }

      // --- PF-10 Authoritative Session & Candidate Endpoints ---

      if (pathname === '/api/session' && req.method === 'GET') {
        if (!this.activeSession) {
          return this.sendJson(res, 404, { error: 'No active revision session loaded', errorCode: 'NOT_FOUND' });
        }
        return this.sendJson(res, 200, {
          success: true,
          session: {
            session_id: this.activeSession.session_id,
            state: this.activeSession.state,
            concurrency: this.activeSession.concurrency,
            active_delivery: this.activeSession.active_delivery,
            selected_candidate_id: this.activeSession.selected_candidate_id,
            candidate_set_id: this.activeSession.candidate_set_id,
            recovery: this.activeSession.recovery,
            undo_redo: {
              current_revision_id: this.activeSession.undo_redo?.current_revision_id || null,
              canUndo: (this.activeSession.undo_redo?.undo_stack || []).length > 0,
              canRedo: (this.activeSession.undo_redo?.redo_stack || []).length > 0
            },
            history_count: (this.activeSession.history || []).length,
            hard_constraints: this.activeSession.hard_constraints || [],
            diagnostics: this.activeSession.diagnostics || []
          }
        });
      }

      if (pathname === '/api/session/init' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent session mutation in progress', errorCode: 'CONFLICT' });
        }
        const body = await this.readJsonBody(req);
        let candidateSetDoc = body.candidateSet || body.candidateSetDoc || null;
        if (!candidateSetDoc && body.candidateSetPath) {
          const safePath = assertSafePath(body.candidateSetPath);
          if (fs.existsSync(safePath)) {
            candidateSetDoc = JSON.parse(fs.readFileSync(safePath, 'utf8'));
          } else {
            return this.sendJson(res, 404, { error: `Candidate set file not found: ${body.candidateSetPath}`, errorCode: 'NOT_FOUND' });
          }
        }

        if (!body.prompt && !body.brief && !candidateSetDoc) {
          return this.sendJson(res, 400, { error: 'Initialization parameters required ("prompt", "brief", or "candidateSet")', errorCode: 'VALIDATION_ERROR' });
        }

        let brief = body.brief || null;
        if (brief) {
          const briefVal = BriefValidator.validateEditBrief(brief);
          if (!briefVal.valid) {
            return this.sendJson(res, 400, { error: 'Invalid brief document', errorCode: 'VALIDATION_ERROR', details: briefVal.errors });
          }
        }

        if (candidateSetDoc) {
          if (!Array.isArray(candidateSetDoc.candidates)) {
            return this.sendJson(res, 400, { error: 'CandidateSet document must contain a candidates array', errorCode: 'VALIDATION_ERROR' });
          }
          this._registerCandidateMedia(candidateSetDoc);
        }

        const outDir = body.outputDir || this.outputDir;
        this.activeSession = RevisionSessionManager.createSession({
          prompt: body.prompt || brief?.goal || 'Session Initialization',
          brief,
          project: body.project || this.currentProject,
          preferenceProfile: body.preferenceProfile || null,
          candidateSetDoc,
          outputDir: outDir
        });
        this.activeCandidateSet = candidateSetDoc;
        this._registerSessionMedia(this.activeSession);

        if (this.activeSession.active_delivery) {
          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
            try { this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8')); } catch (e) {}
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }
        }

        return this.sendJson(res, 201, {
          success: true,
          session: this.activeSession
        });
      }

      if (pathname === '/api/session/select' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent session mutation in progress', errorCode: 'CONFLICT' });
        }
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        if (!this.activeCandidateSet) {
          return this.sendJson(res, 400, { error: 'No active candidate set available for selection', errorCode: 'NO_CANDIDATE_SET' });
        }
        const body = await this.readJsonBody(req);
        const candidateId = body.candidateId;
        if (!candidateId) {
          return this.sendJson(res, 400, { error: 'Field "candidateId" is required', errorCode: 'VALIDATION_ERROR' });
        }

        if (body.expectedVersion !== undefined && body.expectedVersion !== this.activeSession.concurrency.version) {
          return this.sendJson(res, 409, {
            error: `Stale session version: expected ${body.expectedVersion}, current ${this.activeSession.concurrency.version}`,
            errorCode: 'STALE_VERSION'
          });
        }

        const cand = (this.activeCandidateSet.candidates || []).find(c => c.candidate_id === candidateId);
        if (!cand) {
          return this.sendJson(res, 404, { error: `Candidate "${candidateId}" not found in candidate set`, errorCode: 'NOT_FOUND' });
        }

        // Refinement 5: Candidate Eligibility Gate (Verified status and QA score >= 80)
        const isVerified = cand.status === 'verified';
        const qaScore = cand.qa_summary?.score ?? 0;
        if (!isVerified || qaScore < 80) {
          return this.sendJson(res, 422, {
            error: `Candidate "${candidateId}" is not eligible for activation (status: ${cand.status}, QA score: ${qaScore})`,
            errorCode: 'NOT_ELIGIBLE'
          });
        }

        // Candidate Artifact & Manifest Integrity Gate (PF-11 Stage 2)
        if (cand.deliverable) {
          if (!cand.deliverable.manifest_id) {
            return this.sendJson(res, 422, {
              error: `Candidate "${candidateId}" missing immutable delivery manifest ID`,
              errorCode: 'INVALID_MANIFEST'
            });
          }
          const mediaPath = cand.deliverable.media_path;
          if (mediaPath) {
            if (!fs.existsSync(mediaPath)) {
              return this.sendJson(res, 422, {
                error: `Candidate "${candidateId}" media artifact missing on disk: ${mediaPath}`,
                errorCode: 'ARTIFACT_MISSING'
              });
            }
            const declaredSha = cand.deliverable.sha256;
            if (declaredSha) {
              const actualSha = RenderOrchestrator.computeFileSha256(mediaPath);
              if (declaredSha !== actualSha) {
                return this.sendJson(res, 422, {
                  error: `Candidate "${candidateId}" artifact SHA-256 integrity mismatch: declared ${declaredSha}, actual ${actualSha}`,
                  errorCode: 'ARTIFACT_INTEGRITY_MISMATCH'
                });
              }
            }
          }
        }

        this.isMutating = true;
        try {
          const selectRes = RevisionSessionManager.bindSelectedCandidate({
            session: this.activeSession,
            candidateSetDoc: this.activeCandidateSet,
            candidateId,
            outputDir: this.outputDir,
            explicitlyRejectedCandidateIds: body.explicitlyRejectedCandidateIds || []
          });

          if (!selectRes.success) {
            return this.sendJson(res, 400, { error: selectRes.error || 'Failed to select candidate', errorCode: 'SELECTION_FAILED' });
          }

          this.activeSession = selectRes.session;
          this._registerSessionMedia(this.activeSession);

          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery?.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
            try { this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8')); } catch (e) {}
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }

          return this.sendJson(res, 200, {
            success: true,
            session: this.activeSession,
            active_delivery: this.activeSession.active_delivery
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname.startsWith('/api/jobs/') && pathname.endsWith('/approve') && req.method === 'POST') {
        const jobId = pathname.replace('/api/jobs/', '').replace('/approve', '');
        const body = await this.readJsonBody(req);
        try {
          const updatedJob = this.jobManager.submitApproval(jobId, body);
          return this.sendJson(res, 200, { success: true, job: updatedJob });
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message, errorCode: 'APPROVAL_ERROR' });
        }
      }

      if (pathname.startsWith('/api/jobs/') && pathname.endsWith('/execute') && req.method === 'POST') {
        const jobId = pathname.replace('/api/jobs/', '').replace('/execute', '');
        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent mutation in progress', errorCode: 'CONFLICT' });
        }
        this.isMutating = true;
        try {
          const body = await this.readJsonBody(req);
          const result = EndToEndOrchestrator.executeApprovedJob({
            jobId,
            session: this.activeSession,
            project: this.currentProject,
            outputDir: this.outputDir,
            options: body.options || {},
            jobManager: this.jobManager
          });
          if (result.success && result.project) {
            this.currentProject = result.project;
          }
          return this.sendJson(res, result.success ? 200 : 409, result);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message, errorCode: 'EXECUTION_ERROR' });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname.startsWith('/api/jobs/') && pathname.endsWith('/cancel') && req.method === 'POST') {
        const jobId = pathname.replace('/api/jobs/', '').replace('/cancel', '');
        const body = await this.readJsonBody(req);
        try {
          const updatedJob = this.jobManager.cancelJob(jobId, body.reason || 'User cancelled');
          return this.sendJson(res, 200, { success: true, job: updatedJob });
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message, errorCode: 'CANCEL_ERROR' });
        }
      }

      if (pathname.startsWith('/api/jobs/') && req.method === 'GET') {
        const jobId = pathname.replace('/api/jobs/', '');
        const job = this.jobManager.loadJob(jobId);
        if (!job) {
          return this.sendJson(res, 404, { error: `Job not found: ${jobId}`, errorCode: 'NOT_FOUND' });
        }
        return this.sendJson(res, 200, { success: true, job });
      }

      if (pathname === '/api/jobs' && req.method === 'POST') {
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        const body = await this.readJsonBody(req);
        const prompt = body.prompt;
        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
          return this.sendJson(res, 400, { error: 'Field "prompt" must be a non-empty string', errorCode: 'VALIDATION_ERROR' });
        }
        const idempotencyKey = body.idempotencyKey || null;
        const expectedVersion = body.expectedVersion;
        const expectedBaseRevision = body.expectedBaseRevision !== undefined ? body.expectedBaseRevision : body.expectedRevision;

        if (expectedBaseRevision !== undefined && this.currentProject && expectedBaseRevision !== this.currentProject.revision) {
          return this.sendJson(res, 409, {
            error: `Stale project revision: expected ${expectedBaseRevision}, current ${this.currentProject.revision}`,
            errorCode: 'STALE_REVISION'
          });
        }

        // Idempotency check before lock
        if (idempotencyKey) {
          const cachedJob = this.jobManager.findByIdempotencyKey(idempotencyKey);
          if (cachedJob) {
            if (cachedJob.request?.prompt && prompt && cachedJob.request.prompt.trim() !== prompt.trim()) {
              return this.sendJson(res, 409, {
                error: `Idempotency key "${idempotencyKey}" already bound to different prompt payload`,
                errorCode: 'IDEMPOTENCY_CONFLICT'
              });
            }
            if (cachedJob.status === OrchestrationJobStatus.COMMITTED || cachedJob.status === CanonicalJobStatus.SUCCEEDED) {
              return this.sendJson(res, 200, {
                success: true,
                fromCache: true,
                job: cachedJob,
                active_delivery: cachedJob.result?.active_delivery || this.activeSession.active_delivery,
                session: this.activeSession
              });
            }
            if (cachedJob.status === OrchestrationJobStatus.FAILED) {
              return this.sendJson(res, 422, {
                success: false,
                fromCache: true,
                job: cachedJob,
                error: cachedJob.result?.error || 'Prior job failed'
              });
            }
            return this.sendJson(res, 202, {
              success: true,
              inFlight: true,
              job: cachedJob
            });
          }
        }

        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent mutation in progress', errorCode: 'CONFLICT' });
        }

        const runOptions = { ...(body.options || {}), expectedBaseRevision };

        if (body.async === true) {
          const job = this.jobManager.createJob({
            idempotencyKey,
            request: {
              prompt: prompt.trim(),
              expected_version: expectedVersion ?? this.activeSession.concurrency.version,
              session_id: this.activeSession.session_id
            }
          });

          setImmediate(async () => {
            this.isMutating = true;
            try {
              EndToEndOrchestrator.runWorkflow({
                session: this.activeSession,
                prompt: prompt.trim(),
                project: this.currentProject,
                outputDir: this.outputDir,
                idempotencyKey,
                expectedVersion,
                options: runOptions,
                jobManager: this.jobManager
              });
              this._registerSessionMedia(this.activeSession);
            } finally {
              this.isMutating = false;
            }
          });

          return this.sendJson(res, 202, {
            success: true,
            jobId: job.job_id,
            status: job.status,
            progress: job.progress
          });
        }

        this.isMutating = true;
        try {
          const result = EndToEndOrchestrator.runWorkflow({
            session: this.activeSession,
            prompt: prompt.trim(),
            project: this.currentProject,
            outputDir: this.outputDir,
            idempotencyKey,
            expectedVersion,
            options: runOptions,
            jobManager: this.jobManager
          });

          this._registerSessionMedia(this.activeSession);

          if (!result.success && !result.held) {
            return this.sendJson(res, 422, {
              success: false,
              error: result.error,
              job: result.job,
              session: this.activeSession,
              active_delivery: this.activeSession.active_delivery
            });
          }

          if (result.held) {
            return this.sendJson(res, 200, {
              success: true,
              held: true,
              awaitingApproval: result.awaitingApproval,
              needsClarification: result.needsClarification,
              job: result.job,
              plan: result.plan,
              planHash: result.planHash,
              session: this.activeSession,
              active_delivery: this.activeSession.active_delivery
            });
          }

          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery?.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }

          return this.sendJson(res, 200, {
            success: true,
            job: result.job,
            session: this.activeSession,
            active_delivery: this.activeSession.active_delivery
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/session/revise' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const idempotencyKey = body.idempotencyKey || null;

        // Idempotency check before lock
        if (idempotencyKey) {
          const cachedJob = this.jobManager.findByIdempotencyKey(idempotencyKey);
          if (cachedJob) {
            if (cachedJob.status === OrchestrationJobStatus.COMMITTED) {
              return this.sendJson(res, 200, {
                success: true,
                fromCache: true,
                job: cachedJob,
                active_delivery: cachedJob.result?.active_delivery || this.activeSession.active_delivery,
                session: this.activeSession
              });
            }
            if (cachedJob.status === OrchestrationJobStatus.FAILED) {
              return this.sendJson(res, 422, {
                success: false,
                fromCache: true,
                job: cachedJob,
                error: cachedJob.result?.error || 'Prior job failed',
                active_delivery: this.activeSession?.active_delivery
              });
            }
            return this.sendJson(res, 202, {
              success: true,
              inFlight: true,
              job: cachedJob
            });
          }
        }

        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent revision mutation in progress', errorCode: 'CONFLICT' });
        }
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        if (body.expectedVersion === undefined) {
          return this.sendJson(res, 400, { error: 'Field "expectedVersion" is required for optimistic concurrency', errorCode: 'VALIDATION_ERROR' });
        }
        if (body.expectedVersion !== this.activeSession.concurrency.version) {
          return this.sendJson(res, 409, {
            error: `Stale session version: expected ${body.expectedVersion}, current ${this.activeSession.concurrency.version}`,
            errorCode: 'STALE_VERSION'
          });
        }
        const revisionPrompt = body.prompt || body.revisionPrompt;
        if (!revisionPrompt || typeof revisionPrompt !== 'string' || !revisionPrompt.trim()) {
          return this.sendJson(res, 400, { error: 'Field "prompt" must be a non-empty string', errorCode: 'VALIDATION_ERROR' });
        }

        this.isMutating = true;
        try {
          let revRes;
          if (idempotencyKey) {
            revRes = EndToEndOrchestrator.runWorkflow({
              session: this.activeSession,
              prompt: revisionPrompt.trim(),
              project: this.currentProject,
              outputDir: this.outputDir,
              idempotencyKey,
              expectedVersion: body.expectedVersion,
              options: body.options || {},
              jobManager: this.jobManager
            });
          } else {
            revRes = RevisionSessionManager.applyRevision({
              session: this.activeSession,
              revisionPrompt: revisionPrompt.trim(),
              project: this.currentProject,
              outputDir: this.outputDir,
              options: { expectedVersion: body.expectedVersion, ...(body.options || {}) }
            });
          }

          this._registerSessionMedia(this.activeSession);

          if (!revRes.success) {
            // Revision failed verification or invariants. Note: session.active_delivery remains safe!
            return this.sendJson(res, 422, {
              success: false,
              error: revRes.error || 'Revision failed verification gates',
              errorCode: 'VERIFICATION_FAILED',
              session: this.activeSession,
              active_delivery: this.activeSession.active_delivery,
              revisionRun: revRes.revisionRun,
              job: revRes.job
            });
          }

          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery?.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
            try { this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8')); } catch (e) {}
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }

          return this.sendJson(res, 200, {
            success: true,
            session: this.activeSession,
            active_delivery: this.activeSession.active_delivery,
            revisionRun: revRes.revisionRun,
            job: revRes.job
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/session/undo' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent session mutation in progress', errorCode: 'CONFLICT' });
        }
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        const body = await this.readJsonBody(req);
        if (body.expectedVersion !== undefined && body.expectedVersion !== this.activeSession.concurrency.version) {
          return this.sendJson(res, 409, {
            error: `Stale session version: expected ${body.expectedVersion}, current ${this.activeSession.concurrency.version}`,
            errorCode: 'STALE_VERSION'
          });
        }
        if (!this.activeSession.undo_redo || (this.activeSession.undo_redo.undo_stack || []).length === 0) {
          return this.sendJson(res, 400, { error: 'Undo stack is empty; already at baseline revision', errorCode: 'NOTHING_TO_UNDO' });
        }

        this.isMutating = true;
        try {
          const undoRes = RevisionSessionManager.undo({ session: this.activeSession, outputDir: this.outputDir });
          if (!undoRes.success) {
            return this.sendJson(res, 400, { error: undoRes.error, errorCode: 'UNDO_FAILED' });
          }

          this.activeSession = undoRes.session;
          this._registerSessionMedia(this.activeSession);

          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery?.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
            try { this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8')); } catch (e) {}
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }

          return this.sendJson(res, 200, {
            success: true,
            session: this.activeSession,
            restoredDelivery: this.activeSession.active_delivery
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/session/redo' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent session mutation in progress', errorCode: 'CONFLICT' });
        }
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        const body = await this.readJsonBody(req);
        if (body.expectedVersion !== undefined && body.expectedVersion !== this.activeSession.concurrency.version) {
          return this.sendJson(res, 409, {
            error: `Stale session version: expected ${body.expectedVersion}, current ${this.activeSession.concurrency.version}`,
            errorCode: 'STALE_VERSION'
          });
        }
        if (!this.activeSession.undo_redo || (this.activeSession.undo_redo.redo_stack || []).length === 0) {
          return this.sendJson(res, 400, { error: 'Redo stack is empty; already at newest revision', errorCode: 'NOTHING_TO_REDO' });
        }

        this.isMutating = true;
        try {
          const redoRes = RevisionSessionManager.redo({ session: this.activeSession, outputDir: this.outputDir });
          if (!redoRes.success) {
            return this.sendJson(res, 400, { error: redoRes.error, errorCode: 'REDO_FAILED' });
          }

          this.activeSession = redoRes.session;
          this._registerSessionMedia(this.activeSession);

          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery?.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
            try { this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8')); } catch (e) {}
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }

          return this.sendJson(res, 200, {
            success: true,
            session: this.activeSession,
            restoredDelivery: this.activeSession.active_delivery
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/session/recover' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, { error: 'Concurrent session mutation in progress', errorCode: 'CONFLICT' });
        }
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }

        this.isMutating = true;
        try {
          const recRes = RevisionSessionManager.recoverSession({ session: this.activeSession, outputDir: this.outputDir });
          this.activeSession = recRes.session;
          this._registerSessionMedia(this.activeSession);

          const activeHist = (this.activeSession.history || []).find(h => h.revision_id === this.activeSession.active_delivery?.revision_id);
          if (activeHist?._project) {
            this.currentProject = activeHist._project;
          } else if (activeHist?.project_path && fs.existsSync(activeHist.project_path)) {
            try { this.currentProject = JSON.parse(fs.readFileSync(activeHist.project_path, 'utf8')); } catch (e) {}
          }
          if (this.currentProject) {
            this._registerProjectMedia(this.currentProject);
          }

          return this.sendJson(res, 200, {
            success: true,
            session: this.activeSession,
            active_delivery: this.activeSession.active_delivery
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/session/history' && req.method === 'GET') {
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        return this.sendJson(res, 200, {
          success: true,
          session_id: this.activeSession.session_id,
          current_revision_id: this.activeSession.undo_redo?.current_revision_id || null,
          active_delivery: this.activeSession.active_delivery,
          history: (this.activeSession.history || []).map(h => ({
            revision_id: h.revision_id,
            predecessor_id: h.predecessor_id,
            prompt: h.prompt,
            status: h.status,
            plan_hash: h.plan_hash,
            manifest_id: h.manifest_id,
            delivery_run_id: h.delivery_run_id,
            media_sha256: h.media_sha256,
            media_path: h.media_path,
            project_path: h.project_path,
            operations_count: h.operations_count,
            qa_score: h.qa_score,
            timestamp: h.timestamp,
            error: h.error,
            isActive: h.revision_id === this.activeSession.active_delivery?.revision_id
          }))
        });
      }

      if (pathname === '/api/session/diff' && req.method === 'GET') {
        if (!this.activeSession) {
          return this.sendJson(res, 400, { error: 'No active session loaded', errorCode: 'NOT_FOUND' });
        }
        const fromRev = parsedUrl.searchParams.get('fromRev') || parsedUrl.searchParams.get('from') || parsedUrl.searchParams.get('baseRev');
        const toRev = parsedUrl.searchParams.get('toRev') || parsedUrl.searchParams.get('to') || parsedUrl.searchParams.get('targetRev');

        if (!fromRev || !toRev) {
          return this.sendJson(res, 400, { error: 'Query parameters "fromRev" and "toRev" are required', errorCode: 'VALIDATION_ERROR' });
        }

        const diffRes = RevisionSessionManager.computeRevisionDiff({
          session: this.activeSession,
          fromRevisionId: fromRev,
          toRevisionId: toRev
        });

        if (!diffRes.success) {
          const status = diffRes.errorCode === 'NOT_FOUND' ? 404 : 422;
          return this.sendJson(res, status, { error: diffRes.error, errorCode: diffRes.errorCode });
        }

        return this.sendJson(res, 200, {
          success: true,
          diff: diffRes.diff
        });
      }

      if (pathname === '/api/candidates' && req.method === 'GET') {
        if (!this.activeCandidateSet) {
          return this.sendJson(res, 404, { error: 'No candidate set loaded', errorCode: 'NOT_FOUND' });
        }
        return this.sendJson(res, 200, {
          success: true,
          candidate_set_id: this.activeCandidateSet.candidate_set_id,
          selected_candidate_id: this.activeCandidateSet.selection?.selected_candidate_id || this.activeSession?.selected_candidate_id || null,
          candidates: (this.activeCandidateSet.candidates || []).map(c => ({
            candidate_id: c.candidate_id,
            profile_id: c.profile_id,
            profile_name: c.variation_profile?.name || c.profile_id,
            status: c.status,
            qa_score: c.qa_summary?.score ?? 0,
            hard_gates_passed: c.musical_alignment?.hard_gates_passed ?? c.qa_summary?.hard_gates_passed ?? (c.status === 'verified'),
            isEligible: c.status === 'verified' && (c.qa_summary?.score ?? 0) >= 80,
            preference_score: c.preference_alignment?.preference_score ?? c.preference_score ?? null,
            musical_composite_score: c.musical_alignment?.composite_score ?? c.alignment_scores?.composite ?? null,
            musical_rank: c.musical_alignment?.rank ?? c.alignment_scores?.rank ?? null,
            musical_score: c.musical_alignment?.musical_score ?? null,
            manifest_id: c.deliverable?.manifest_id || null,
            media_path: c.deliverable?.media_path || null,
            media_sha256: c.deliverable?.sha256 || null,
            resolution: c.deliverable?.technical_metadata?.canvas ? `${c.deliverable.technical_metadata.canvas.width}x${c.deliverable.technical_metadata.canvas.height}` : (c.deliverable?.canvas ? `${c.deliverable.canvas.width}x${c.deliverable.canvas.height}` : null),
            fps: c.deliverable?.technical_metadata?.timebase?.fps ?? c.deliverable?.timebase?.fps ?? null,
            duration_seconds: c.deliverable?.technical_metadata?.duration_seconds ?? c.deliverable?.duration_seconds ?? null,
            plan_hash: c.canonical_plan_hash || null,
            operations_count: c.plan_summary?.operations_count || 0
          }))
        });
      }

      if (pathname === '/api/project' && req.method === 'GET') {
        const pPath = parsedUrl.searchParams.get('path');
        if (!pPath) {
          return this.sendJson(res, 400, { error: 'Query parameter "path" is required' });
        }
        const safePath = assertSafePath(pPath);
        this.activeProjectPath = safePath;
        this.currentProject = ProjectManager.loadProject(safePath);
        this.undoStack = [];
        this.redoStack = [];
        return this.sendJson(res, 200, {
          path: safePath,
          project: this.currentProject,
          canUndo: false,
          canRedo: false
        });
      }

      if (pathname === '/api/project/operation' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!this.currentProject) {
          return this.sendJson(res, 400, { error: 'No active project loaded' });
        }

        const op = body.operation || (body.type ? body : null);
        if (!op) {
          return this.sendJson(res, 400, { error: 'Missing operation in request body' });
        }

        const opId = op.operationId || body.operationId || body.idempotencyKey;
        if (opId) {
          if (this.idempotencyCache.has(opId)) {
            const cached = this.idempotencyCache.get(opId);
            const token = body.approval_token || req.headers['x-eme-approval-token'];
            if (!token || cached.approvalTokenHash !== require('../creative/execution-record.js').digest(token)) {
              return this.sendJson(res, 403, { errorCode: 'ERR_UNTRUSTED_APPROVAL', error: 'An idempotent response requires its original authorization' });
            }
            const currentHash = JSON.stringify({ type: op.type, params: op.params });
            if (cached.payloadHash === currentHash) {
              return this.sendJson(res, 200, {
                ...cached.response,
                idempotent: true
              });
            } else {
              return this.sendJson(res, 400, {
                error: `Idempotency conflict: operationId "${opId}" reused with different payload`,
                errorCode: 'IDEMPOTENCY_CONFLICT'
              });
            }
          }
        }

        if (this.isMutating) {
          return this.sendJson(res, 409, {
            error: 'A project mutation or history operation is currently in progress',
            errorCode: 'MUTATION_IN_PROGRESS'
          });
        }
        this.isMutating = true;

        try {
          if (body.expectedRevision !== undefined && op.expectedBaseRevision === undefined) {
            op.expectedBaseRevision = body.expectedRevision;
          }
          if (body.expectedBaseRevision !== undefined && op.expectedBaseRevision === undefined) {
            op.expectedBaseRevision = body.expectedBaseRevision;
          }

          const previousState = structuredClone(this.currentProject);
          // Invalid gestures remain non-mutating diagnostics; valid commits need approval.
          const preflight = OperationExecutor.execute(this.currentProject, op);
          const result = preflight.success ? ExecutionAuthority.execute({
            project: this.currentProject, operation: op,
            approvalToken: body.approval_token || req.headers['x-eme-approval-token']
          }) : preflight;
          if (!result.success) {
            const status = result.errorCode === 'STALE_REVISION' || result.errorCode === 'ERR_STALE_REVISION' ? 409 :
              (result.errorCode?.includes('APPROVAL') ? 403 : 400);
            return this.sendJson(res, status, {
              error: result.error,
              errorCode: result.errorCode,
              details: result.details
            });
          }

          this.undoStack.push(previousState);
          this.redoStack = []; // Clear redo on new edit
          this.currentProject = result.project;

          if (this.activeSession) {
            if (!this.activeSession.history) {
              this.activeSession.history = [];
            }
            const currentRev = this.currentProject.revision;
            const prevRevId = this.activeSession.active_delivery?.revision_id || 
                              (this.activeSession.history.length > 0 ? this.activeSession.history[this.activeSession.history.length - 1].revision_id : 'rev-0');
            const nextRevId = `rev-manual-${currentRev}`;

            this.activeSession.history.push({
              revision_id: nextRevId,
              predecessor_id: prevRevId,
              origin: 'manual_vcs',
              operation: {
                type: op.type,
                operationId: opId || `op-manual-${Date.now()}`
              },
              status: 'committed',
              timestamp: new Date().toISOString(),
              _project: structuredClone(this.currentProject)
            });

            if (this.activeSession.concurrency) {
              this.activeSession.concurrency.version = (this.activeSession.concurrency.version || 0) + 1;
              this.activeSession.concurrency.last_modified = new Date().toISOString();
            }
          }

          const responseData = {
            success: true,
            project: this.currentProject,
            affectedIds: result.affectedIds,
            revision: this.currentProject.revision,
            canUndo: this.undoStack.length > 0,
            canRedo: this.redoStack.length > 0
          };

          if (opId) {
            if (this.idempotencyCache.size >= 200) {
              const firstKey = this.idempotencyCache.keys().next().value;
              this.idempotencyCache.delete(firstKey);
            }
            this.idempotencyCache.set(opId, {
              payloadHash: JSON.stringify({ type: op.type, params: op.params }),
              approvalTokenHash: require('../creative/execution-record.js').digest(body.approval_token || req.headers['x-eme-approval-token']),
              response: structuredClone(responseData)
            });
          }

          return this.sendJson(res, 200, responseData);
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/project/undo' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, {
            error: 'A project mutation or history operation is currently in progress',
            errorCode: 'MUTATION_IN_PROGRESS'
          });
        }
        this.isMutating = true;
        try {
          if (this.undoStack.length === 0) {
            return this.sendJson(res, 400, { error: 'Nothing to undo' });
          }
          const body = await this.readJsonBody(req);
          const prev = this.undoStack[this.undoStack.length - 1];
          const execution = ExecutionAuthority.execute({ project: this.currentProject,
            operation: { type: 'restore_project_history', params: { snapshot: prev } },
            approvalToken: body.approval_token || req.headers['x-eme-approval-token'] });
          if (!execution.success) return this.sendJson(res, execution.errorCode === 'ERR_STALE_REVISION' ? 409 : 403, { error: execution.error, errorCode: execution.errorCode });
          this.undoStack.pop();
          this.redoStack.push(structuredClone(this.currentProject));
          // Monotonic revision: undo advances revision
          this.currentProject = execution.project;

          if (this.activeSession) {
            if (!this.activeSession.history) {
              this.activeSession.history = [];
            }
            const currentRev = this.currentProject.revision;
            const prevRevId = this.activeSession.active_delivery?.revision_id || 
                              (this.activeSession.history.length > 0 ? this.activeSession.history[this.activeSession.history.length - 1].revision_id : 'rev-0');
            const nextRevId = `rev-manual-${currentRev}`;

            this.activeSession.history.push({
              revision_id: nextRevId,
              predecessor_id: prevRevId,
              origin: 'manual_vcs',
              operation: {
                type: 'undo',
                operationId: `op-undo-${Date.now()}`
              },
              status: 'committed',
              timestamp: new Date().toISOString(),
              _project: structuredClone(this.currentProject)
            });

            if (this.activeSession.concurrency) {
              this.activeSession.concurrency.version = (this.activeSession.concurrency.version || 0) + 1;
              this.activeSession.concurrency.last_modified = new Date().toISOString();
            }
          }

          return this.sendJson(res, 200, {
            success: true,
            project: this.currentProject,
            canUndo: this.undoStack.length > 0,
            canRedo: this.redoStack.length > 0
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/project/redo' && req.method === 'POST') {
        if (this.isMutating) {
          return this.sendJson(res, 409, {
            error: 'A project mutation or history operation is currently in progress',
            errorCode: 'MUTATION_IN_PROGRESS'
          });
        }
        this.isMutating = true;
        try {
          if (this.redoStack.length === 0) {
            return this.sendJson(res, 400, { error: 'Nothing to redo' });
          }
          const body = await this.readJsonBody(req);
          const next = this.redoStack[this.redoStack.length - 1];
          const execution = ExecutionAuthority.execute({ project: this.currentProject,
            operation: { type: 'restore_project_history', params: { snapshot: next } },
            approvalToken: body.approval_token || req.headers['x-eme-approval-token'] });
          if (!execution.success) return this.sendJson(res, execution.errorCode === 'ERR_STALE_REVISION' ? 409 : 403, { error: execution.error, errorCode: execution.errorCode });
          this.redoStack.pop();
          this.undoStack.push(structuredClone(this.currentProject));
          this.currentProject = execution.project;

          if (this.activeSession) {
            if (!this.activeSession.history) {
              this.activeSession.history = [];
            }
            const currentRev = this.currentProject.revision;
            const prevRevId = this.activeSession.active_delivery?.revision_id || 
                              (this.activeSession.history.length > 0 ? this.activeSession.history[this.activeSession.history.length - 1].revision_id : 'rev-0');
            const nextRevId = `rev-manual-${currentRev}`;

            this.activeSession.history.push({
              revision_id: nextRevId,
              predecessor_id: prevRevId,
              origin: 'manual_vcs',
              operation: {
                type: 'redo',
                operationId: `op-redo-${Date.now()}`
              },
              status: 'committed',
              timestamp: new Date().toISOString(),
              _project: structuredClone(this.currentProject)
            });

            if (this.activeSession.concurrency) {
              this.activeSession.concurrency.version = (this.activeSession.concurrency.version || 0) + 1;
              this.activeSession.concurrency.last_modified = new Date().toISOString();
            }
          }

          return this.sendJson(res, 200, {
            success: true,
            project: this.currentProject,
            canUndo: this.undoStack.length > 0,
            canRedo: this.redoStack.length > 0
          });
        } finally {
          this.isMutating = false;
        }
      }

      if (pathname === '/api/project/save' && req.method === 'POST') {
        if (!this.currentProject || !this.activeProjectPath) {
          return this.sendJson(res, 400, { error: 'No active project or path to save' });
        }
        ProjectManager.saveProject(this.activeProjectPath, this.currentProject);
        return this.sendJson(res, 200, {
          success: true,
          path: this.activeProjectPath,
          revision: this.currentProject.revision
        });
      }

      if ((pathname === '/api/render' || pathname === '/api/deliver') && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const isDelivery = pathname === '/api/deliver' || body.mode === 'deliver' || body.delivery === true;
        if (isDelivery) {
          const allowed=['executionId','outputDir',...(pathname==='/api/render'?['mode','delivery']:[])];
          if(Object.keys(body).some(key=>!allowed.includes(key)))return this.sendJson(res,400,{success:false,errorCode:'ERR_RENDER_OVERRIDE_FORBIDDEN',error:'Delivery inputs must come from the committed execution snapshot'});
          if(!body.executionId)return this.sendJson(res,400,{success:false,errorCode:'ERR_COMMITTED_SNAPSHOT_REQUIRED'});
          const outputDir=assertSafePath(body.outputDir || this.outputDir);
          const service=this.nativeDelivery || new (require('../prompt-core/native-delivery.js').NativeDelivery)();
          const result=service.run({executionId:body.executionId,outputDir});
          return this.sendJson(res,result.success?200:422,result);
        }
        if (!this.currentProject) return this.sendJson(res,400,{error:'No active project to preview',errorCode:'NOT_FOUND'});

        // Preview Mode (Isolated Scratch Rendering)
        // Capture immutable snapshot at submission time so subsequent edits do not affect this preview
        const projectSnapshot = structuredClone(this.currentProject);
        const outDir = assertSafePath(body.outputDir || 'artifacts/ui-renders');
        fs.mkdirSync(outDir, { recursive: true });

        const previewDir=fs.mkdtempSync(path.join(outDir,'preview-'));
        const compDir = path.join(previewDir, 'composition');
        HyperFramesCompiler.compile(projectSnapshot, compDir);

        const mp4Path = path.join(previewDir, 'preview.mp4');
        const cleanFallback = body.options?.cleanMediaOverride || path.join(outDir, 'clean-12s.mp4');
        const useCleanFallback = body.options?.useCleanFallback !== false && body.options?.forceRealRender !== true;
        let renderRes;
        if (useCleanFallback && fs.existsSync(cleanFallback)) {
          fs.copyFileSync(cleanFallback, mp4Path);
          renderRes = { elapsedMs: 5, metadata: { engine: 'clean-fallback' } };
        } else {
          try {
            renderRes = HyperFramesRenderer.render(compDir, mp4Path, { fps: body.fps || 60 });
          } catch (renderErr) {
            if (fs.existsSync(cleanFallback)) {
              fs.copyFileSync(cleanFallback, mp4Path);
              renderRes = { elapsedMs: 5, metadata: { engine: 'clean-fallback' } };
            } else {
              throw renderErr;
            }
          }
        }
        this._registerMediaFile(null, mp4Path);

        return this.sendJson(res, 200, {
          success: true,
          preview: true,
          verification:'DEMO_UNVERIFIED',
          qaPassed:false,
          mp4Path,
          snapshotRevision: projectSnapshot.revision,
          elapsedMs: renderRes.elapsedMs,
          metadata: renderRes.metadata,
          active_delivery: null // Preview isolation guarantee: never updates active_delivery
        });
      }

      if(pathname==='/api/delivery/status' && req.method==='GET') {
        const service=this.nativeDelivery || new (require('../prompt-core/native-delivery.js').NativeDelivery)();
        return this.sendJson(res,200,service.getStatus(parsedUrl.searchParams.get('jobId')));
      }

      if (pathname === '/api/qa' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!this.currentProject) {
          return this.sendJson(res, 400, { error: 'No active project to QA' });
        }
        const mp4 = body.mp4Path ? assertSafePath(body.mp4Path) : null;
        const report = QualityAssuranceEngine.auditQuality(this.currentProject, mp4);
        return this.sendJson(res, 200, { success: report.passed === true, verification:'QA_ONLY_NO_PUBLICATION', report });
      }

      if (pathname === '/api/timeline' && req.method === 'GET') {
        let targetProject = this.currentProject;
        const revParam = parsedUrl.searchParams.get('revisionId');
        if (revParam && this.activeSession) {
          const targetHist = (this.activeSession.history || []).find(h => h.revision_id === revParam);
          if (targetHist) {
            if (targetHist._project) {
              targetProject = targetHist._project;
            } else if (targetHist.project_path && fs.existsSync(targetHist.project_path)) {
              try { targetProject = JSON.parse(fs.readFileSync(targetHist.project_path, 'utf8')); } catch (e) {}
            }
          }
        }

        if (!targetProject) {
          return this.sendJson(res, 400, { error: 'No active project or revision snapshot loaded' });
        }
        const zoom = parseFloat(parsedUrl.searchParams.get('zoom') || '1.0');
        const playhead = parseInt(parsedUrl.searchParams.get('playhead') || '0', 10);
        const selectedClipId = parsedUrl.searchParams.get('selectedClipId') || null;
        const view = TimelineAdapter.projectToTimelineView(targetProject, {
          zoom,
          playheadTick: playhead,
          selectedClipId
        });
        return this.sendJson(res, 200, { success: true, timeline: view, revisionId: revParam || null });
      }

      if (pathname === '/api/waveform' && req.method === 'GET') {
        const audioPath = parsedUrl.searchParams.get('path');
        const pps = parseInt(parsedUrl.searchParams.get('pps') || '50', 10);
        const peaks = AudioWaveformService.getWaveformData(audioPath || 'synthetic', pps);
        return this.sendJson(res, 200, { success: true, peaks: Array.from(peaks) });
      }

      if (pathname === '/api/color-grade' && req.method === 'GET') {
        const clipId = parsedUrl.searchParams.get('clipId');
        if (clipId && this.currentProject) {
          const clip = (this.currentProject.clips || []).find(c => c.id === clipId);
          return this.sendJson(res, 200, { success: true, grade: clip?.colorGrade || null });
        }
        return this.sendJson(res, 200, { success: true, grade: this.currentProject?.colorGrade || null });
      }

      // --- POST /api/color/preview (Non-Mutating Visual Control Surface Preview) ---
      if (pathname === '/api/color/preview' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const {
          projectId,
          sessionId,
          clipId,
          mediaPath: reqMediaPath,
          frameTick = 0,
          expectedBaseRevision,
          baseRevision,
          requestId,
          draftVersion = 1,
          grade
        } = body;

        const expectedRev = expectedBaseRevision !== undefined ? expectedBaseRevision : baseRevision;

        if (!grade || typeof grade !== 'object') {
          return this.sendJson(res, 400, {
            success: false,
            requestId,
            draftVersion,
            errorCode: 'ERR_INVALID_COLOR_GRADE',
            error: 'Missing or invalid candidate grade object'
          });
        }

        let loadedLut = null;
        if (grade.lut && grade.lut.enabled) {
          const lutId = grade.lut.lutId;
          if (isSentinelId(lutId)) {
            return this.sendJson(res, 400, {
              success: false,
              requestId,
              draftVersion,
              errorCode: 'ERR_SENTINEL_NOT_EXECUTABLE',
              error: `Policy sentinel "${lutId}" is non-executable`
            });
          }
          if (lutId && !isCertifiedLutId(lutId)) {
            return this.sendJson(res, 400, {
              success: false,
              requestId,
              draftVersion,
              errorCode: 'ERR_UNREGISTERED_LUT_ID',
              error: `Unregistered LUT identifier "${lutId}"`
            });
          }
          if (lutId) {
            try {
              const lutDesc = resolveCertifiedLut(lutId);
              loadedLut = getOrLoadLut(lutDesc.absolutePath);
            } catch (err) {
              return this.sendJson(res, 400, {
                success: false,
                requestId,
                draftVersion,
                errorCode: err.code || 'ERR_LUT_LOAD_FAILED',
                error: err.message
              });
            }
          }
        }

        const valRes = validateColorGrade(grade);
        if (!valRes.valid) {
          return this.sendJson(res, 400, {
            success: false,
            requestId,
            draftVersion,
            errorCode: 'ERR_INVALID_COLOR_GRADE',
            error: 'Candidate grade failed schema validation',
            details: valRes.errors
          });
        }

        let resolvedMedia = null;
        if (clipId && this.currentProject && Array.isArray(this.currentProject.clips)) {
          const clip = this.currentProject.clips.find(c => c.id === clipId);
          if (clip?.assetPath) {
            resolvedMedia = this._resolveAuthorizedPath(clip.assetPath);
          }
        }
        if (!resolvedMedia && reqMediaPath) {
          resolvedMedia = this._resolveAuthorizedPath(reqMediaPath);
        }
        if (!resolvedMedia && this.authorizedMedia.size > 0) {
          resolvedMedia = this.authorizedMedia.get('active_delivery') || Array.from(this.authorizedMedia.values())[0];
        }

        const targetW = 640;
        const targetH = 360;
        const t0 = process.hrtime.bigint();

        const baseRgba = (resolvedMedia && fs.existsSync(resolvedMedia))
          ? this._getOrExtractFrame(resolvedMedia, frameTick, targetW, targetH)
          : this._generateSyntheticFrame(targetW, targetH);

        const gradedRgba = gradeImageBuffer(baseRgba, targetW, targetH, grade, loadedLut, 4);
        const gradeHash = crypto.createHash('sha256').update(JSON.stringify(grade)).digest('hex');
        const jpegDataUri = this._encodeRgbaToJpegDataUri(gradedRgba, targetW, targetH);

        const t1 = process.hrtime.bigint();
        const executionMs = Number(t1 - t0) / 1e6;

        return this.sendJson(res, 200, {
          success: true,
          requestId,
          draftVersion,
          projectId: projectId || this.currentProject?.id || null,
          clipId: clipId || null,
          frameTick: Number(frameTick),
          baseRevision: expectedRev !== undefined ? expectedRev : (this.currentProject?.revision || 0),
          gradeHash,
          previewDataUri: jpegDataUri,
          width: targetW,
          height: targetH,
          executionMs: Number(executionMs.toFixed(2))
        });
      }

      // --- POST/GET /api/preview/frame (Generic Frame Inspection) ---
      if (pathname === '/api/preview/frame' && (req.method === 'POST' || req.method === 'GET')) {
        let mediaPath, frameTick = 0, clipId, width = 640, height = 360;
        if (req.method === 'POST') {
          const body = await this.readJsonBody(req);
          mediaPath = body.mediaPath;
          clipId = body.clipId;
          frameTick = body.frameTick || 0;
          if (body.width) width = body.width;
          if (body.height) height = body.height;
        } else {
          mediaPath = parsedUrl.searchParams.get('mediaPath');
          clipId = parsedUrl.searchParams.get('clipId');
          frameTick = parseInt(parsedUrl.searchParams.get('frameTick') || '0', 10);
        }

        let resolvedMedia = null;
        if (clipId && this.currentProject && Array.isArray(this.currentProject.clips)) {
          const clip = this.currentProject.clips.find(c => c.id === clipId);
          if (clip?.assetPath) resolvedMedia = this._resolveAuthorizedPath(clip.assetPath);
        }
        if (!resolvedMedia && mediaPath) {
          resolvedMedia = this._resolveAuthorizedPath(mediaPath);
        }
        if (!resolvedMedia && this.authorizedMedia.size > 0) {
          resolvedMedia = this.authorizedMedia.get('active_delivery') || Array.from(this.authorizedMedia.values())[0];
        }

        const baseRgba = (resolvedMedia && fs.existsSync(resolvedMedia))
          ? this._getOrExtractFrame(resolvedMedia, frameTick, width, height)
          : this._generateSyntheticFrame(width, height);

        const jpegDataUri = this._encodeRgbaToJpegDataUri(baseRgba, width, height);

        return this.sendJson(res, 200, {
          success: true,
          clipId: clipId || null,
          frameTick: Number(frameTick),
          previewDataUri: jpegDataUri,
          width,
          height
        });
      }

      // --- POST /api/color/apply (Transactional Apply with Base Revision Check) ---
      if ((pathname === '/api/color/apply' || pathname === '/api/color-grade/save') && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        if (!body.approval_token && !req.headers['x-eme-approval-token']) {
          return this.sendJson(res, 403, { errorCode: 'ERR_UNTRUSTED_APPROVAL', error: 'Trusted authorization is required' });
        }
        if (!this.currentProject) {
          return this.sendJson(res, 400, { success: false, error: 'No active project loaded' });
        }

        const grade = body.grade;
        const clipId = body.clipId;
        const expectedBaseRevision = body.expectedBaseRevision !== undefined ? body.expectedBaseRevision : body.expectedRevision;

        if (expectedBaseRevision !== undefined && this.currentProject.revision !== expectedBaseRevision) {
          return this.sendJson(res, 409, {
            success: false,
            errorCode: 'STALE_REVISION',
            error: `Expected revision ${expectedBaseRevision}, but project is at revision ${this.currentProject.revision}`
          });
        }

        if (grade && typeof grade === 'object' && grade.lut && grade.lut.enabled && grade.lut.lutId) {
          if (isSentinelId(grade.lut.lutId)) {
            return this.sendJson(res, 400, {
              success: false,
              errorCode: 'ERR_SENTINEL_NOT_EXECUTABLE',
              error: `Policy sentinel "${grade.lut.lutId}" is non-executable`
            });
          }
          if (!isCertifiedLutId(grade.lut.lutId)) {
            return this.sendJson(res, 400, {
              success: false,
              errorCode: 'ERR_UNREGISTERED_LUT_ID',
              error: `Unregistered LUT identifier "${grade.lut.lutId}"`
            });
          }
        }

        const valRes = validateColorGrade(grade);
        if (!valRes.valid) {
          return this.sendJson(res, 400, {
            success: false,
            errorCode: 'ERR_INVALID_COLOR_GRADE',
            error: 'Invalid color grade',
            details: valRes.errors
          });
        }

        const previousProject = structuredClone(this.currentProject);

        let op;
        if (body.adjustments && !body.grade) {
          op = {
            type: 'adjust_color_params',
            ...(expectedBaseRevision !== undefined ? { expectedBaseRevision } : {}),
            params: { ...(clipId ? { clipId } : {}), adjustments: body.adjustments, projectLevel: !clipId }
          };
        } else {
          op = {
            type: 'attach_color_grade',
            ...(expectedBaseRevision !== undefined ? { expectedBaseRevision } : {}),
            params: { ...(clipId ? { clipId } : {}), grade, projectLevel: !clipId }
          };
        }

        const result = ExecutionAuthority.execute({ project: this.currentProject, operation: op,
          approvalToken: body.approval_token || req.headers['x-eme-approval-token'] });
        if (!result.success) {
          const status = result.errorCode === 'STALE_REVISION' ? 409 : 400;
          return this.sendJson(res, status, {
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            details: result.details
          });
        }

        this.undoStack.push(previousProject);
        this.redoStack = [];
        this.currentProject = result.project;

        return this.sendJson(res, 200, {
          success: true,
          revision: this.currentProject.revision,
          project: this.currentProject,
          grade,
          canUndo: this.undoStack.length > 0,
          canRedo: this.redoStack.length > 0
        });
      }

      if (pathname === '/api/scene-analysis' && (req.method === 'GET' || req.method === 'POST')) {
        const width = 64, height = 64;
        const buf = Buffer.alloc(width * height * 4);
        // Create realistic test frame with middle gray, slight warm bias, and skin tones
        for (let i = 0; i < width * height; i++) {
          buf[i * 4 + 0] = 190;
          buf[i * 4 + 1] = 145;
          buf[i * 4 + 2] = 115;
          buf[i * 4 + 3] = 255;
        }
        const { analyzeScene } = require('../engine/scene-intelligence.js');
        const analysis = analyzeScene(buf, width, height, 4);
        return this.sendJson(res, 200, { success: true, analysis });
      }

      if (pathname === '/api/capcut/import' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const draftInfo = body.draftInfo;
        const project = TimelineAdapter.importCapCutDraft(draftInfo);
        this.undoStack.push(structuredClone(this.currentProject));
        this.currentProject = project;
        this.activeProjectPath = `artifacts/imported_capcut_${Date.now()}.json`;
        return this.sendJson(res, 200, { success: true, project: this.currentProject });
      }

      if (pathname === '/api/capcut/export' && req.method === 'POST') {
        if (!this.currentProject) {
          return this.sendJson(res, 400, { error: 'No active project to export', errorCode: 'VALIDATION_ERROR' });
        }
        const draft = TimelineAdapter.exportCapCutDraft(this.currentProject);
        return this.sendJson(res, 200, { success: true, draft });
      }

      if (pathname === '/api/media' && req.method === 'GET') {
        const mediaId = parsedUrl.searchParams.get('id');
        const mediaPath = parsedUrl.searchParams.get('path');
        if (!mediaId && !mediaPath) {
          return this.sendJson(res, 400, { error: 'Query parameter "id" or "path" is required', errorCode: 'VALIDATION_ERROR' });
        }

        let targetFile = null;
        if (mediaId) {
          targetFile = this.authorizedMedia.get(mediaId);
          if (!targetFile) {
            return this.sendJson(res, 404, { error: `Media identifier "${mediaId}" not authorized or found`, errorCode: 'NOT_FOUND' });
          }
        } else {
          // Reject encoded traversal, null bytes, and path traversal sequences
          let decoded;
          try {
            decoded = decodeURIComponent(mediaPath);
          } catch (e) {
            return this.sendJson(res, 400, { error: 'Malformed encoded path', errorCode: 'VALIDATION_ERROR' });
          }

          if (mediaPath.includes('\0') || decoded.includes('\0') || mediaPath.includes('%00')) {
            return this.sendJson(res, 400, { error: 'Null bytes forbidden in media path', errorCode: 'VALIDATION_ERROR' });
          }

          if (mediaPath.includes('..') || decoded.includes('..') || mediaPath.toLowerCase().includes('%2e%2e')) {
            return this.sendJson(res, 403, { error: 'Path traversal sequences forbidden', errorCode: 'FORBIDDEN' });
          }

          let safePath;
          try {
            safePath = assertSafePath(mediaPath);
          } catch (err) {
            return this.sendJson(res, 403, { error: err.message, errorCode: 'FORBIDDEN' });
          }

          const resolved = path.resolve(safePath);
          let real;
          try {
            real = fs.realpathSync(resolved);
          } catch (e) {
            return this.sendJson(res, 404, { error: `Media file not found: ${mediaPath}`, errorCode: 'NOT_FOUND' });
          }

          // Authorize against known session, candidate, and project media
          if (this.authorizedMedia.has(real) || this.authorizedMedia.has(resolved) || this.authorizedMedia.has(mediaPath)) {
            targetFile = real;
          } else {
            return this.sendJson(res, 403, { error: 'Media path is not authorized for current session or project', errorCode: 'FORBIDDEN' });
          }
        }

        // Symlink / TOCTOU verification
        try {
          const lstat = fs.lstatSync(targetFile);
          if (lstat.isSymbolicLink()) {
            const symlinkTarget = fs.realpathSync(targetFile);
            const isAuthorized = Array.from(this.authorizedMedia.values()).some(p => p === symlinkTarget || p === targetFile);
            if (!isAuthorized) {
              return this.sendJson(res, 403, { error: 'Symlink target is not an authorized media artifact', errorCode: 'FORBIDDEN' });
            }
          }
        } catch (e) {
          return this.sendJson(res, 404, { error: 'Media file not found', errorCode: 'NOT_FOUND' });
        }

        let fd;
        try {
          fd = fs.openSync(targetFile, 'r');
        } catch (e) {
          return this.sendJson(res, 404, { error: 'Media file could not be opened', errorCode: 'NOT_FOUND' });
        }

        let stat;
        try {
          stat = fs.fstatSync(fd);
        } catch (e) {
          fs.closeSync(fd);
          return this.sendJson(res, 404, { error: 'Media file status unavailable', errorCode: 'NOT_FOUND' });
        }

        if (!stat.isFile()) {
          fs.closeSync(fd);
          return this.sendJson(res, 403, { error: 'Target media is not a regular file', errorCode: 'FORBIDDEN' });
        }

        const fileSize = stat.size;
        const ext = path.extname(targetFile).toLowerCase();
        const mimeTypes = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.aac': 'audio/aac',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const range = req.headers.range;

        if (range) {
          // Reject multiple ranges
          if (range.includes(',')) {
            fs.closeSync(fd);
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            return res.end();
          }

          const match = range.match(/^bytes=(\d*)-(\d*)$/);
          if (!match || (match[1] === '' && match[2] === '')) {
            fs.closeSync(fd);
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            return res.end();
          }

          let start;
          let end;

          if (match[1] === '') {
            // Suffix byte range: bytes=-500 (last 500 bytes)
            const suffix = parseInt(match[2], 10);
            if (isNaN(suffix) || suffix <= 0) {
              fs.closeSync(fd);
              res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
              return res.end();
            }
            start = Math.max(0, fileSize - suffix);
            end = fileSize - 1;
          } else if (match[2] === '') {
            // Prefix byte range: bytes=500- (from 500 to end)
            start = parseInt(match[1], 10);
            end = fileSize - 1;
          } else {
            start = parseInt(match[1], 10);
            end = parseInt(match[2], 10);
          }

          if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= fileSize || end >= fileSize) {
            fs.closeSync(fd);
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            return res.end();
          }

          const chunkSize = (end - start) + 1;
          const stream = fs.createReadStream('', { fd, start, end, autoClose: true });
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType
          });
          return stream.pipe(res);
        } else {
          const stream = fs.createReadStream('', { fd, autoClose: true });
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType
          });
          return stream.pipe(res);
        }
      }

      // --- VTSM Visual-Temporal State Machine Advisory Tracking Endpoints ---

      if (pathname === '/api/vtsm/init' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        const initRes = await service.initTracking(body);
        return this.sendJson(res, 200, { success: true, ...initRes });
      }

      if (pathname === '/api/vtsm/propagate' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        const propRes = await service.propagateRange(body);
        return this.sendJson(res, 200, { success: true, ...propRes });
      }

      if (pathname === '/api/vtsm/mask' && req.method === 'GET') {
        const sessionId = parsedUrl.searchParams.get('sessionId');
        const frameStr = parsedUrl.searchParams.get('frame');
        const tickStr = parsedUrl.searchParams.get('tick');
        if (!sessionId) {
          return this.sendJson(res, 400, { error: 'Query parameter "sessionId" is required' });
        }
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        const maskRes = service.getFrameMask({
          sessionId,
          frameIdx: frameStr !== null ? parseInt(frameStr, 10) : undefined,
          tick: tickStr !== null ? parseInt(tickStr, 10) : undefined
        });
        return this.sendJson(res, 200, { success: true, ...maskRes });
      }

      if (pathname === '/api/vtsm/status' && req.method === 'GET') {
        const sessionId = parsedUrl.searchParams.get('sessionId');
        if (!sessionId) {
          return this.sendJson(res, 400, { error: 'Query parameter "sessionId" is required' });
        }
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        const statusRes = service.getSessionStatus({ sessionId });
        return this.sendJson(res, 200, { success: true, ...statusRes });
      }

      if (pathname === '/api/vtsm/cancel' && req.method === 'POST') {
        const body = await this.readJsonBody(req);
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        const cancelRes = service.cancelTracking(body);
        return this.sendJson(res, 200, { success: true, ...cancelRes });
      }

      // Serve static frontend files with strict path containment
      let filePath = pathname === '/' ? '/index.html' : pathname;
      let currentPath = filePath;
      for (let i = 0; i < 3; i++) {
        try {
          const decoded = decodeURIComponent(currentPath);
          if (decoded === currentPath) break;
          currentPath = decoded;
        } catch (err) {
          return this.sendJson(res, 400, { error: 'Malformed URI encoding', errorCode: 'BAD_REQUEST' });
        }
      }

      if (currentPath.includes('\0') || filePath.includes('%00')) {
        return this.sendJson(res, 403, { error: 'Access denied: Null byte injection detected', errorCode: 'FORBIDDEN' });
      }

      const normalizedPath = currentPath.replace(/\\/g, '/');
      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.includes('..') || segments.includes('...')) {
        return this.sendJson(res, 403, { error: 'Access denied: Path traversal detected', errorCode: 'FORBIDDEN' });
      }

      const publicDir = path.resolve(__dirname, 'public');
      const relativeSafe = segments.join(path.sep);
      const resolvedTarget = path.resolve(publicDir, relativeSafe);

      // Path containment check: ensure resolvedTarget is strictly within publicDir
      if (!resolvedTarget.startsWith(publicDir + path.sep) && resolvedTarget !== publicDir) {
        return this.sendJson(res, 403, { error: 'Access denied: Path traversal detected', errorCode: 'FORBIDDEN' });
      }

      if (fs.existsSync(resolvedTarget) && fs.statSync(resolvedTarget).isFile()) {
        const ext = path.extname(resolvedTarget).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.cube': 'text/plain'
        };
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        });
        return fs.createReadStream(resolvedTarget).pipe(res);
      }

      return this.sendJson(res, 404, { error: `Not found: ${pathname}`, errorCode: 'NOT_FOUND' });
    } catch (e) {
      const statusCode = e.statusCode || (e.code === 'ERR_PAYLOAD_TOO_LARGE' ? 413 : (e.code === 'ERR_INVALID_JSON' ? 400 : 500));
      defaultLogger.error(`HTTP request exception: ${e.message}`, {
        pathname,
        method: req.method,
        error: e.message,
        code: e.code || 'INTERNAL_ERROR'
      });
      this.sendJson(res, statusCode, {
        error: e.message,
        errorCode: e.code || (statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : (statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR')),
        correlation_id: getActiveCorrelationId()
      });
      if (e.code === 'ERR_PAYLOAD_TOO_LARGE') {
        try { req.destroy(); } catch (ign) {}
      }
      return;
    }
  }

  sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  readJsonBody(req, maxSizeBytes = null) {
    const limit = maxSizeBytes !== null ? maxSizeBytes : (this.maxBodySizeBytes || 10 * 1024 * 1024);
    return new Promise((resolve, reject) => {
      let data = '';
      let bytesRead = 0;
      let limitExceeded = false;

      req.on('data', chunk => {
        if (limitExceeded) return;
        bytesRead += chunk.length;
        if (bytesRead > limit) {
          limitExceeded = true;
          try { req.pause(); } catch (ign) {}
          const err = new Error(`Request payload exceeded maximum size limit of ${limit} bytes`);
          err.statusCode = 413;
          err.code = 'ERR_PAYLOAD_TOO_LARGE';
          return reject(err);
        }
        data += chunk;
      });

      req.on('end', () => {
        if (limitExceeded) return;
        if (!data.trim()) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          const err = new Error(`Invalid JSON body: ${e.message}`);
          err.statusCode = 400;
          err.code = 'ERR_INVALID_JSON';
          reject(err);
        }
      });

      req.on('error', (err) => {
        if (!limitExceeded) reject(err);
      });
    });
  }
}

if (require.main === module) {
  const backend = new EditorBackend({ port: process.env.PORT || 4321 });
  backend.start();
}

module.exports = {
  EditorBackend,
  MetricsCollector,
  defaultMetricsCollector
};
