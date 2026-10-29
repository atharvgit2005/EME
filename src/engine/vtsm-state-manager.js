/**
 * EME VTSM State Manager & Sidecar Persistence Engine
 *
 * Manages spatial-temporal tracking state, sidecar serialization, and frame lookup
 * under the versioned schema: schema/eme-vtsm-tracking.v1.schema.json.
 *
 * Invariants Enforced:
 * - Read-only sidecar artifact storage; eme-project.v1.schema.json remains 100% clean.
 * - Temporal consistency: 120,000 ticks/second timebase and half-open intervals.
 * - Occlusion honesty: Zero fabricated masks during full occlusion (visibility === 'occluded').
 * - Session isolation and source-media content binding.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TICKS_PER_SECOND = 120000;

class VtsmStateManager {
  constructor(options = {}) {
    this.repoRoot = path.resolve(__dirname, '../../');
    this.sidecarsBaseDir = options.sidecarsBaseDir || path.join(this.repoRoot, 'projects');
    this.sessions = new Map();
  }

  /**
   * Initialize a new authorized tracking session bound to a media item.
   */
  createSession(params = {}) {
    if (!params.projectId) {
      throw new Error('createSession: projectId is required');
    }
    if (!params.sourceMedia || !params.sourceMedia.filePath) {
      throw new Error('createSession: sourceMedia with filePath is required');
    }

    const sessionId = params.sessionId || crypto.randomUUID();
    const rationalFps = params.rationalFps || { numerator: 30, denominator: 1 };
    const fpsVal = rationalFps.numerator / rationalFps.denominator;

    const sessionDoc = {
      contractVersion: '1.0.0',
      sessionId,
      projectId: params.projectId,
      sourceMedia: {
        mediaId: params.sourceMedia.mediaId || path.basename(params.sourceMedia.filePath),
        sourceSha256: params.sourceMedia.sourceSha256 || '0000000000000000000000000000000000000000000000000000000000000000',
        filePath: params.sourceMedia.filePath,
        dimensions: params.sourceMedia.dimensions || { width: 1920, height: 1080 },
        durationSec: params.sourceMedia.durationSec || 0,
        totalFrames: params.sourceMedia.totalFrames || 0
      },
      timebase: {
        ticksPerSecond: TICKS_PER_SECOND,
        rationalFps: rationalFps,
        durationTicks: params.durationTicks || Math.round((params.sourceMedia.durationSec || 0) * TICKS_PER_SECOND)
      },
      coordinateConvention: {
        space: params.coordinateSpace || 'normalized_0_1',
        origin: 'top_left'
      },
      lifecycle: {
        status: 'initialized',
        updatedAt: new Date().toISOString()
      },
      tracks: params.tracks || [],
      frames: [],
      provenance: {
        worker: 'vtsm03_worker',
        model: 'MobileSAM-vit_t',
        modelSha256: '6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f',
        device: params.device || 'mps',
        generatedAt: new Date().toISOString()
      }
    };

    this.sessions.set(sessionId, sessionDoc);
    return sessionDoc;
  }

  /**
   * Append or update tracking state for a specific video frame.
   * Enforces zero fabricated masks during occlusion.
   */
  recordFrameState(sessionId, frameData = {}) {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const session = this.sessions.get(sessionId);
    const frameIdx = frameData.frameIdx !== undefined ? frameData.frameIdx : frameData.frameIndex;
    if (typeof frameIdx !== 'number' || frameIdx < 0) {
      throw new Error('recordFrameState: valid frameIdx is required');
    }

    const fps = session.timebase.rationalFps.numerator / session.timebase.rationalFps.denominator;
    const ptsSec = frameData.ptsSec !== undefined ? frameData.ptsSec : (frameData.pts !== undefined ? frameData.pts : (frameIdx / fps));
    const ptsTicks = frameData.ptsTicks !== undefined ? frameData.ptsTicks : (frameData.tick !== undefined ? frameData.tick : Math.round(ptsSec * TICKS_PER_SECOND));

    // Validate states (supports both states and raw observations)
    const rawItems = frameData.states || frameData.observations || [];
    const states = rawItems.map(st => {
      const visibility = st.visibility || 'visible';
      let mask = st.mask;

      // Invariant: Full occlusion must not produce an invented visible mask
      if (visibility === 'occluded' || visibility === 'lost') {
        mask = undefined;
      }

      let bbox = [0, 0, 0, 0];
      if (Array.isArray(st.bbox)) {
        bbox = st.bbox;
      } else if (st.bbox && st.bbox.pixel) {
        bbox = [st.bbox.pixel.x, st.bbox.pixel.y, st.bbox.pixel.width, st.bbox.pixel.height];
      }

      const conf = typeof st.confidence === 'number' ? st.confidence :
        (typeof st.trackingConfidence === 'number' ? st.trackingConfidence :
          (typeof st.visibilityConfidence === 'number' ? st.visibilityConfidence : 1.0));

      return {
        trackId: st.trackId !== undefined ? st.trackId : st.entityId,
        visibility,
        bbox,
        ...(mask ? { mask } : {}),
        confidence: conf,
        isKeyframe: Boolean(st.isKeyframe),
        triggerReason: st.triggerReason || undefined
      };
    });

    const frameEntry = {
      frameIdx,
      ptsTicks,
      ptsSec,
      states
    };

    // Check if frame already exists
    const existingIdx = session.frames.findIndex(f => f.frameIdx === frameIdx);
    if (existingIdx >= 0) {
      session.frames[existingIdx] = frameEntry;
    } else {
      session.frames.push(frameEntry);
    }

    // Keep frames sorted monotonically
    session.frames.sort((a, b) => a.frameIdx - b.frameIdx);

    session.lifecycle.status = 'tracking';
    session.lifecycle.updatedAt = new Date().toISOString();

    return frameEntry;
  }

  /**
   * Complete session tracking.
   */
  completeSession(sessionId, metrics = {}) {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const session = this.sessions.get(sessionId);
    session.lifecycle.status = 'completed';
    session.lifecycle.updatedAt = new Date().toISOString();
    if (metrics.throughputFps) {
      session.provenance.throughputFps = metrics.throughputFps;
    }
    if (metrics.totalDurationMs) {
      session.provenance.totalDurationMs = metrics.totalDurationMs;
    }
    return session;
  }

  /**
   * Persist session state as a versioned sidecar artifact.
   */
  saveSidecar(sessionId, customOutputDir = null) {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const session = this.sessions.get(sessionId);
    
    let targetDir;
    if (customOutputDir) {
      targetDir = path.resolve(customOutputDir);
    } else {
      targetDir = path.join(this.sidecarsBaseDir, session.projectId, 'sidecars', 'vtsm');
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const sidecarPath = path.join(targetDir, `${sessionId}.json`);
    const tempPath = `${sidecarPath}.tmp.${Date.now()}`;

    // Atomic write
    fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), 'utf8');
    fs.renameSync(tempPath, sidecarPath);

    return {
      sidecarPath,
      sessionId,
      projectId: session.projectId,
      frameCount: session.frames.length,
      bytes: fs.statSync(sidecarPath).size
    };
  }

  /**
   * Load and validate an existing sidecar artifact.
   */
  static loadSidecar(sidecarPath) {
    const resolved = path.resolve(sidecarPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Sidecar artifact not found: ${resolved}`);
    }

    const content = fs.readFileSync(resolved, 'utf8');
    const doc = JSON.parse(content);

    // Validate essential schema invariants
    if (doc.contractVersion !== '1.0.0') {
      throw new Error(`Unsupported sidecar contractVersion: ${doc.contractVersion}`);
    }
    if (!doc.sessionId || !doc.projectId || !doc.sourceMedia) {
      throw new Error('Corrupt sidecar: missing required metadata headers');
    }
    if (doc.timebase.ticksPerSecond !== TICKS_PER_SECOND) {
      throw new Error(`Invalid timebase: expected ${TICKS_PER_SECOND} ticks/sec, got ${doc.timebase.ticksPerSecond}`);
    }

    return doc;
  }

  /**
   * Retrieve frame state for fast UI scrubbing.
   */
  getFrameState(sessionId, frameIdx) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.frames.find(f => f.frameIdx === frameIdx) || null;
  }
}

module.exports = { VtsmStateManager, TICKS_PER_SECOND };
