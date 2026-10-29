/**
 * EME VTSM High-Level Service
 *
 * Bridges the VtsmWorkerClient (persistent daemon) and VtsmStateManager (sidecar persistence)
 * for MCP tools and the Visual Control Surface.
 *
 * Architectural Invariants:
 * - Read-only visual perception service; zero execution authority.
 * - Authorizes media paths; enforces 120k ticks timebase.
 * - Occlusion honesty: zero masks produced during full occlusion.
 * - Project schema eme-project.v1.schema.json remains completely unmodified.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { VtsmWorkerClient, VtsmAuthorizationError } = require('./vtsm-worker-client.js');
const { VtsmStateManager, TICKS_PER_SECOND } = require('./vtsm-state-manager.js');

class VtsmService {
  constructor(options = {}) {
    this.workerClient = new VtsmWorkerClient(options);
    this.stateManager = new VtsmStateManager(options);
    this.isInitialized = false;
  }

  async ensureWorkerStarted() {
    if (!this.workerClient.isRunning) {
      await this.workerClient.start();
      this.isInitialized = true;
    }
    return {
      status: 'ready',
      device: this.workerClient.deviceInfo
    };
  }

  /**
   * Initialize a new authorized tracking session for a media asset.
   */
  async initTracking(params = {}) {
    if (!params.projectId) {
      throw new Error('projectId is required for initTracking');
    }
    if (!params.mediaPath) {
      throw new Error('mediaPath is required for initTracking');
    }

    const resolvedMedia = this.workerClient.assertAuthorizedPath(params.mediaPath);
    if (!fs.existsSync(resolvedMedia)) {
      throw new Error(`Media file not found: ${resolvedMedia}`);
    }

    const sourceSha256 = VtsmWorkerClient.computeFileSha256(resolvedMedia);
    const sessionId = params.sessionId || crypto.randomUUID();

    const tracks = (params.promptBoxes || []).map((box, idx) => ({
      trackId: idx + 1,
      label: params.label || `entity_${idx + 1}`,
      color: idx === 0 ? '#00f0ff' : '#ff0055',
      firstFrame: 0,
      lastFrame: 0
    }));

    const session = this.stateManager.createSession({
      sessionId,
      projectId: params.projectId,
      sourceMedia: {
        mediaId: path.basename(resolvedMedia),
        sourceSha256,
        filePath: resolvedMedia,
        dimensions: params.dimensions || { width: 1920, height: 1080 },
        durationSec: params.durationSec || 0,
        totalFrames: params.totalFrames || 0
      },
      tracks
    });

    return {
      status: 'initialized',
      sessionId: session.sessionId,
      projectId: session.projectId,
      mediaId: session.sourceMedia.mediaId,
      sourceSha256: session.sourceMedia.sourceSha256,
      tracks: session.tracks,
      contractVersion: session.contractVersion
    };
  }

  /**
   * Propagate tracking across video and persist results to sidecar.
   */
  async propagateRange(params = {}) {
    if (!params.sessionId) {
      throw new Error('sessionId is required for propagateRange');
    }

    const session = this.stateManager.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`);
    }

    await this.ensureWorkerStarted();

    const outputDir = path.join(this.stateManager.sidecarsBaseDir, session.projectId, 'sidecars', 'vtsm');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, `${params.sessionId}_raw.json`);

    const result = await this.workerClient.processVideo({
      sessionId: params.sessionId,
      projectId: session.projectId,
      sourceSha256: session.sourceMedia.sourceSha256,
      videoPath: session.sourceMedia.filePath,
      outputPath,
      ablationMode: params.ablationMode || 'vtsm03_adaptive_hybrid',
      flowAlgo: params.flowAlgo || 'sparse_lk',
      timeoutMs: params.timeoutMs
    });

    // Load generated frames into state manager if raw output exists
    if (fs.existsSync(outputPath)) {
      try {
        const rawDoc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        if (Array.isArray(rawDoc.frames)) {
          for (const f of rawDoc.frames) {
            this.stateManager.recordFrameState(params.sessionId, f);
          }
        }
      } catch (_) {}
    }

    this.stateManager.completeSession(params.sessionId, {
      throughputFps: result.throughputFps,
      totalDurationMs: result.totalTimeMs
    });

    // Save formal sidecar
    const sidecarRes = this.stateManager.saveSidecar(params.sessionId);

    return {
      status: 'completed',
      sessionId: params.sessionId,
      projectId: session.projectId,
      frameCount: result.frameCount,
      throughputFps: result.throughputFps,
      totalTimeMs: result.totalTimeMs,
      sidecarPath: sidecarRes.sidecarPath,
      advisoryOnly: true
    };
  }

  /**
   * Get mask and tracking state for a specific frame or tick.
   */
  getFrameMask(params = {}) {
    if (!params.sessionId) {
      throw new Error('sessionId is required for getFrameMask');
    }

    let frameIdx = params.frameIdx;
    if (frameIdx === undefined && typeof params.tick === 'number') {
      const session = this.stateManager.sessions.get(params.sessionId);
      if (session) {
        const fps = session.timebase.rationalFps.numerator / session.timebase.rationalFps.denominator;
        frameIdx = Math.floor((params.tick / TICKS_PER_SECOND) * fps);
      }
    }

    if (frameIdx === undefined) {
      throw new Error('Either frameIdx or tick must be specified');
    }

    const frameState = this.stateManager.getFrameState(params.sessionId, frameIdx);
    return {
      sessionId: params.sessionId,
      frameIdx,
      found: Boolean(frameState),
      state: frameState || null,
      advisoryOnly: true
    };
  }

  /**
   * Cancel active session.
   */
  cancelTracking(params = {}) {
    if (!params.sessionId) {
      throw new Error('sessionId is required for cancelTracking');
    }
    const res = this.workerClient.cancelSession(params.sessionId);
    const session = this.stateManager.sessions.get(params.sessionId);
    if (session) {
      session.lifecycle.status = 'canceled';
      session.lifecycle.updatedAt = new Date().toISOString();
    }
    return {
      status: 'canceled',
      sessionId: params.sessionId,
      advisoryOnly: true
    };
  }

  /**
   * Get session status.
   */
  getSessionStatus(params = {}) {
    if (!params.sessionId) {
      throw new Error('sessionId is required for getSessionStatus');
    }
    const session = this.stateManager.sessions.get(params.sessionId);
    if (!session) {
      return { status: 'not_found', sessionId: params.sessionId };
    }
    return {
      sessionId: session.sessionId,
      projectId: session.projectId,
      mediaId: session.sourceMedia.mediaId,
      status: session.lifecycle.status,
      frameCount: session.frames.length,
      provenance: session.provenance,
      advisoryOnly: true
    };
  }

  async stop() {
    return this.workerClient.stop();
  }
}

// Singleton for MCP and server reuse
let defaultServiceInstance = null;

function getVtsmService(options = {}) {
  if (!defaultServiceInstance) {
    defaultServiceInstance = new VtsmService(options);
  }
  return defaultServiceInstance;
}

module.exports = { VtsmService, getVtsmService };
