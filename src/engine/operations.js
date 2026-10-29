/**
 * Editing Mechanics Engine (EME) - Atomic Operation Executor
 *
 * Implements the atomic, versioned editing-operation catalog strictly conforming
 * to schema/eme-project.v1.schema.json.
 * Guarantees zero partial mutation on validation failure.
 */

const { ProjectManager } = require('./project.js');
const { MediaTime, TICKS_PER_SECOND } = require('./time.js');
const { validateColorGrade } = require('./color-grade.js');
const { resolveCertifiedLut, isCertifiedLutId, isSentinelId } = require('./lut-registry.js');

class OperationExecutor {
  /**
   * Execute an operation against a project state atomically.
   */
  static execute(project, operation) {
    if (!operation || typeof operation !== 'object' || !operation.type) {
      return {
        success: false,
        error: 'Operation must be an object with a "type" property',
        errorCode: 'INVALID_ENVELOPE',
        project
      };
    }

    // 1. Validate expected base revision if provided (concurrency & mutation safety)
    if (operation.expectedBaseRevision !== undefined && project && project.revision !== undefined) {
      if (project.revision !== operation.expectedBaseRevision) {
        return {
          success: false,
          error: `Stale project revision: expected base revision ${operation.expectedBaseRevision}, but project is currently at revision ${project.revision}`,
          errorCode: 'STALE_REVISION',
          details: {
            expected: operation.expectedBaseRevision,
            actual: project.revision
          },
          project
        };
      }
    }

    // 2. Deep clone state to ensure atomicity
    const candidate = structuredClone(project || {});

    let affectedIds = [];
    let inverseOp = null;
    const opParams = (operation.params !== undefined && operation.params !== null) ? operation.params : operation;
    try {
      switch (operation.type) {
        case 'restore_project_history': {
          const snapshot = opParams.snapshot;
          if (!snapshot || snapshot.id !== candidate.id) {
            const error = new Error('History restoration requires the same project identity');
            error.code = 'INVALID_HISTORY_SNAPSHOT';
            throw error;
          }
          const validation = ProjectManager.validateProject(snapshot);
          if (!validation.valid) throw new Error(validation.errors.join('; '));
          for (const key of Object.keys(candidate)) delete candidate[key];
          for (const [key, value] of Object.entries(structuredClone(snapshot))) {
            Object.defineProperty(candidate, key, { value, enumerable: true, writable: true, configurable: true });
          }
          affectedIds = (candidate.clips || []).map(clip => clip.id);
          break;
        }
        case 'set_project_duration': {
          const duration = opParams.durationTicks;
          if (!Number.isSafeInteger(duration) || duration <= 0) throw new Error('Project duration must be a positive integer number of ticks');
          if ((candidate.clips || []).some(clip => clip.startTick + clip.durationTicks > duration)) throw new Error('Trim clips before shortening the project duration');
          candidate.timebase.durationTicks = duration;
          affectedIds = [candidate.id];
          break;
        }
        case 'create_project': {
          const res = this._opCreateProject(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'add_asset': {
          const res = this._opAddAsset(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'add_track': {
          const res = this._opAddTrack(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'insert_clip': {
          const res = this._opInsertClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'trim_clip': {
          const res = this._opTrimClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'move_clip': {
          const res = this._opMoveClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'split_clip': {
          const res = this._opSplitClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'animate_property': {
          const res = this._opAnimateProperty(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'apply_effect': {
          const res = this._opApplyEffect(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'set_audio_envelope': {
          const res = this._opSetAudioEnvelope(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'delete_clip': {
          const res = this._opDeleteClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'ripple_delete': {
          const res = this._opRippleDelete(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'reorder_tracks': {
          const res = this._opReorderTracks(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'modify_clip': {
          const res = this._opModifyClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'update_keyframe': {
          const res = this._opUpdateKeyframe(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'ripple_trim': {
          const res = this._opRippleTrim(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'slip_clip': {
          const res = this._opSlipClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'slide_clip': {
          const res = this._opSlideClip(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'set_track_state': {
          const res = this._opSetTrackState(candidate, opParams);
          affectedIds = res.affectedIds;
          break;
        }
        case 'attach_color_grade': {
          const res = this._opAttachColorGrade(candidate, opParams, operation);
          affectedIds = res.affectedIds;
          inverseOp = res.inverse;
          break;
        }
        case 'adjust_color_params': {
          const res = this._opAdjustColorParams(candidate, opParams, operation);
          affectedIds = res.affectedIds;
          inverseOp = res.inverse;
          break;
        }
        case 'remove_color_grade': {
          const res = this._opRemoveColorGrade(candidate, opParams, operation);
          affectedIds = res.affectedIds;
          inverseOp = res.inverse;
          break;
        }
        case 'invalidate_and_regenerate_sidecar': {
          const res = this._opInvalidateAndRegenerateSidecar(candidate, opParams, operation);
          affectedIds = res.affectedIds;
          inverseOp = res.inverse;
          break;
        }
        default:
          return {
            success: false,
            error: `Unsupported or unknown operation type: "${operation.type}"`,
            errorCode: 'UNSUPPORTED_OPERATION',
            project
          };
      }
    } catch (err) {
      return {
        success: false,
        error: err.message,
        errorCode: err.code || 'OPERATION_FAILED',
        project
      };
    }

    // 2. Validate candidate state against schema & semantic invariants (for canonical projects)
    if (candidate && (candidate.schemaVersion || candidate.timebase)) {
      const validation = ProjectManager.validateProject(candidate);
      if (!validation.valid) {
        return {
          success: false,
          error: `Operation produced invalid project state:\n${validation.errors.join('; ')}`,
          errorCode: 'VALIDATION_FAILED',
          details: validation.errors,
          project
        };
      }
    }

    // 3. Atomically commit and increment revision
    const nextRevision = (project && Number.isInteger(project.revision)) ? project.revision + 1 : 0;
    if(!Number.isSafeInteger(nextRevision))return{success:false,error:'Project revision exceeds the exact integer range',errorCode:'REVISION_OVERFLOW',project};
    candidate.revision = nextRevision;

    const opId = operation.id || (operation.params && operation.params.id) || `OP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      success: true,
      revision: candidate.revision,
      affectedIds,
      inverse: inverseOp,
      operationId: opId,
      project: candidate
    };
  }

  // --- Internal operation handlers ---

  static _opCreateProject(candidate, params = {}) {
    const canvas = params.canvas || {};
    const timebase = params.timebase || {};

    const width = canvas.width || params.width || 1080;
    const height = canvas.height || params.height || 1920;
    const aspectRatio = canvas.aspectRatio || params.aspectRatio || `${width}:${height}`;
    const backgroundColor = canvas.backgroundColor || params.backgroundColor || '#0a0a0d';

    const fps = MediaTime.normalizeFps(timebase.fps || params.fps || { numerator: 60, denominator: 1 });
    const durationTicks = timebase.durationTicks !== undefined ? timebase.durationTicks : (params.durationTicks !== undefined ? params.durationTicks : 360000);
    const title = params.title || 'Untitled EME Project';
    const id = params.id || `proj-${Date.now()}`;

    Object.assign(candidate, {
      id,
      schemaVersion: '1.0.0',
      revision: 0,
      title,
      canvas: {
        width,
        height,
        aspectRatio,
        backgroundColor
      },
      timebase: {
        fps,
        ticksPerSecond: TICKS_PER_SECOND,
        durationTicks,
        endpointConvention: 'half-open'
      },
      assets: [],
      tracks: [],
      clips: [],
      animations: []
    });

    return { affectedIds: [id] };
  }

  static _opAddAsset(candidate, params = {}) {
    const src = params.src || params.uri;
    if (!params.id || !params.type || !src) {
      const err = new Error('add_asset requires id, type, and src/uri');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    candidate.assets = candidate.assets || [];
    if (candidate.assets.some(a => a.id === params.id)) {
      const err = new Error(`Asset ID already exists: "${params.id}"`);
      err.code = 'DUPLICATE_ID';
      throw err;
    }
    const asset = {
      id: params.id,
      type: params.type,
      src: src,
      metadata: params.metadata || {}
    };
    if (params.sha256) {
      asset.sha256 = params.sha256;
    }
    candidate.assets.push(asset);
    return { affectedIds: [params.id] };
  }

  static _opAddTrack(candidate, params = {}) {
    const kind = params.kind || params.type;
    if (!params.id || !kind) {
      const err = new Error('add_track requires id and kind (visual|audio)');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    candidate.tracks = candidate.tracks || [];
    if (candidate.tracks.some(t => t.id === params.id)) {
      const err = new Error(`Track ID already exists: "${params.id}"`);
      err.code = 'DUPLICATE_ID';
      throw err;
    }
    const track = {
      id: params.id,
      name: params.name || params.id,
      kind: kind,
      zIndex: params.zIndex !== undefined ? params.zIndex : candidate.tracks.length,
      muted: !!params.muted,
      locked: !!params.locked
    };
    candidate.tracks.push(track);
    return { affectedIds: [params.id] };
  }

  static _opInsertClip(candidate, params = {}) {
    const p = params.clip || params;
    if (!p.id || !p.trackId || !p.type) {
      const err = new Error('insert_clip requires id, trackId, and type');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    params = p;
    candidate.clips = candidate.clips || [];
    candidate.tracks = candidate.tracks || [];

    const track = candidate.tracks.find(t => t.id === params.trackId);
    if (!track) {
      const err = new Error(`Target track "${params.trackId}" does not exist`);
      err.code = 'TRACK_NOT_FOUND';
      throw err;
    }
    if (track.locked) {
      const err = new Error(`Cannot modify locked track "${track.id}"`);
      err.code = 'TRACK_LOCKED';
      throw err;
    }

    if (candidate.clips.some(c => c.id === params.id)) {
      const err = new Error(`Clip ID already exists: "${params.id}"`);
      err.code = 'DUPLICATE_ID';
      throw err;
    }

    // Track type validation
    if (track.kind === 'visual' && params.type === 'audio') {
      const err = new Error(`Cannot place audio clip "${params.id}" on visual track "${track.id}"`);
      err.code = 'TRACK_TYPE_MISMATCH';
      throw err;
    }
    if (track.kind === 'audio' && params.type !== 'audio') {
      const err = new Error(`Cannot place visual clip "${params.id}" on audio track "${track.id}"`);
      err.code = 'TRACK_TYPE_MISMATCH';
      throw err;
    }

    const startTick = params.startTick !== undefined ? params.startTick : 0;
    const durationTicks = params.durationTicks !== undefined ? params.durationTicks : 120000;

    if (durationTicks <= 0) {
      const err = new Error(`Clip durationTicks must be > 0. Got: ${durationTicks}`);
      err.code = 'INVALID_DURATION';
      throw err;
    }

    // Check collision on track
    for (const c of candidate.clips) {
      if (c.trackId === track.id) {
        if (MediaTime.intervalsOverlap(startTick, durationTicks, c.startTick, c.durationTicks)) {
          const err = new Error(`Track collision: clip "${params.id}" overlaps with existing clip "${c.id}" on track "${track.id}"`);
          err.code = 'TRACK_COLLISION';
          throw err;
        }
      }
    }

    const clip = {
      id: params.id,
      trackId: params.trackId,
      type: params.type,
      startTick,
      durationTicks
    };

    if (params.source) clip.source = params.source;
    if (params.transform) clip.transform = params.transform;
    if (params.typography) clip.typography = params.typography;
    if (params.effects) clip.effects = params.effects;
    if (params.audio) clip.audio = params.audio;
    if (params.properties) clip.properties = params.properties;
    if (params.metadata) clip.metadata = params.metadata;

    candidate.clips.push(clip);
    return { affectedIds: [params.id] };
  }

  static _opTrimClip(candidate, params = {}) {
    const { clipId, trimInTick, trimOutTick } = params;
    if (!clipId) {
      const err = new Error('trim_clip requires clipId');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, clip.trackId);

    const newStartTick = params.newStartTick !== undefined ? params.newStartTick : params.startTick;
    const newDurationTicks = params.newDurationTicks !== undefined ? params.newDurationTicks : params.durationTicks;

    if (newDurationTicks !== undefined && newDurationTicks <= 0) {
      const err = new Error(`newDurationTicks must be > 0. Got: ${newDurationTicks}`);
      err.code = 'INVALID_DURATION';
      throw err;
    }
    if (newStartTick !== undefined && newStartTick < 0) {
      const err = new Error(`newStartTick must be >= 0. Got: ${newStartTick}`);
      err.code = 'INVALID_START_TICK';
      throw err;
    }

    const targetStart = newStartTick !== undefined ? newStartTick : clip.startTick;
    const targetDuration = newDurationTicks !== undefined ? newDurationTicks : clip.durationTicks;

    // Collision check against other clips on the same track if position or duration changed
    if (newStartTick !== undefined || newDurationTicks !== undefined) {
      for (const c of candidate.clips || []) {
        if (c.id !== clipId && c.trackId === clip.trackId) {
          if (MediaTime.intervalsOverlap(targetStart, targetDuration, c.startTick, c.durationTicks)) {
            const err = new Error(`Track collision: clip "${clipId}" trimmed to [${targetStart}, ${targetStart + targetDuration}) overlaps with clip "${c.id}"`);
            err.code = 'TRACK_COLLISION';
            throw err;
          }
        }
      }
      clip.startTick = targetStart;
      clip.durationTicks = targetDuration;
    }

    if (trimInTick !== undefined || trimOutTick !== undefined) {
      clip.source = clip.source || {};
      const nextIn = trimInTick !== undefined ? trimInTick : (clip.source.trimInTick || 0);
      const nextOut = trimOutTick !== undefined ? trimOutTick : (clip.source.trimOutTick !== undefined ? clip.source.trimOutTick : clip.durationTicks);

      if (nextIn < 0 || (nextOut !== undefined && nextOut <= nextIn)) {
        const err = new Error(`Invalid trim range: [${nextIn}, ${nextOut}). trimOutTick must be > trimInTick and trimInTick >= 0.`);
        err.code = 'INVALID_TRIM_RANGE';
        throw err;
      }

      if (trimInTick !== undefined) clip.source.trimInTick = trimInTick;
      if (trimOutTick !== undefined) clip.source.trimOutTick = trimOutTick;
    }

    this._updateProjectDuration(candidate);
    return { affectedIds: [clipId] };
  }

  static _opMoveClip(candidate, params = {}) {
    const { clipId, targetTrackId } = params;
    const targetTick = params.targetTick !== undefined ? params.targetTick : params.newStartTick;
    if (!clipId || targetTick === undefined) {
      const err = new Error('move_clip requires clipId and targetTick');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, clip.trackId);

    const newTrackId = targetTrackId || clip.trackId;
    const newTrack = (candidate.tracks || []).find(t => t.id === newTrackId);
    if (!newTrack) {
      const err = new Error(`Target track "${newTrackId}" not found`);
      err.code = 'TRACK_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, newTrackId);

    // Check collision on destination track
    for (const c of candidate.clips) {
      if (c.id !== clipId && c.trackId === newTrackId) {
        if (MediaTime.intervalsOverlap(targetTick, clip.durationTicks, c.startTick, c.durationTicks)) {
          const err = new Error(`Collision at target position [${targetTick}, ${targetTick + clip.durationTicks}) with clip "${c.id}"`);
          err.code = 'TRACK_COLLISION';
          throw err;
        }
      }
    }

    clip.startTick = targetTick;
    clip.trackId = newTrackId;
    return { affectedIds: [clipId] };
  }

  static _opSplitClip(candidate, params = {}) {
    const { clipId, splitTick } = params;
    if (!clipId || splitTick === undefined) {
      const err = new Error('split_clip requires clipId and splitTick');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const newClipId = params.newClipId || `${clipId}_split_${Date.now()}`;
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, clip.trackId);

    if (splitTick <= clip.startTick || splitTick >= clip.startTick + clip.durationTicks) {
      const err = new Error(`splitTick ${splitTick} must be strictly within clip bounds (${clip.startTick}, ${clip.startTick + clip.durationTicks})`);
      err.code = 'SPLIT_OUT_OF_BOUNDS';
      throw err;
    }

    if (candidate.clips.some(c => c.id === newClipId)) {
      const err = new Error(`New clip ID already exists: "${newClipId}"`);
      err.code = 'DUPLICATE_ID';
      throw err;
    }

    const firstDuration = splitTick - clip.startTick;
    const secondDuration = clip.durationTicks - firstDuration;

    // Create second clip by cloning first
    const secondClip = structuredClone(clip);
    secondClip.id = newClipId;
    secondClip.startTick = splitTick;
    secondClip.durationTicks = secondDuration;

    // Adjust trims if source is attached
    if (clip.source && clip.source.trimInTick !== undefined) {
      secondClip.source = {
        ...clip.source,
        trimInTick: clip.source.trimInTick + firstDuration
      };
      clip.source.trimOutTick = clip.source.trimInTick + firstDuration;
    }

    // Shrink first clip
    clip.durationTicks = firstDuration;

    candidate.clips.push(secondClip);
    return { affectedIds: [clipId, newClipId] };
  }

  static _opAnimateProperty(candidate, params = {}) {
    const { clipId, property, keyframes } = params;
    if (!clipId || !property || !Array.isArray(keyframes)) {
      const err = new Error('animate_property requires clipId, property, and keyframes array');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }

    // Validate keyframes format and bounds
    const formattedKfs = keyframes.map(kf => {
      const offset = kf.offsetTick !== undefined ? kf.offsetTick : kf.tickOffset;
      if (offset < 0 || offset > clip.durationTicks) {
        const err = new Error(`Keyframe offset ${offset} outside clip bounds [0, ${clip.durationTicks}]`);
        err.code = 'KEYFRAME_OUT_OF_BOUNDS';
        throw err;
      }
      return {
        offsetTick: offset,
        value: kf.value,
        easing: kf.easing || 'linear'
      };
    });

    candidate.animations = candidate.animations || [];
    let track = candidate.animations.find(a => a.clipId === clipId && a.property === property);
    if (!track) {
      track = { clipId, property, keyframes: [] };
      candidate.animations.push(track);
    }
    track.keyframes = formattedKfs;

    return { affectedIds: [clipId] };
  }

  static _opApplyEffect(candidate, params = {}) {
    const { clipId, effect } = params;
    if (!clipId || !effect || !effect.type) {
      const err = new Error('apply_effect requires clipId and effect object with type');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }

    clip.effects = clip.effects || [];
    clip.effects.push({
      type: effect.type,
      parameters: effect.parameters || {}
    });
    return { affectedIds: [clipId] };
  }

  static _opSetAudioEnvelope(candidate, params = {}) {
    const { clipId, volumeKeyframes } = params;
    if (!clipId || !Array.isArray(volumeKeyframes)) {
      const err = new Error('set_audio_envelope requires clipId and volumeKeyframes array');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    if (clip.type !== 'audio') {
      const err = new Error(`Cannot set audio envelope on non-audio clip "${clipId}" of type "${clip.type}"`);
      err.code = 'CLIP_TYPE_MISMATCH';
      throw err;
    }

    const formattedEnvelope = volumeKeyframes.map(kf => {
      const offset = kf.offsetTick !== undefined ? kf.offsetTick : kf.tickOffset;
      const volume = kf.volume !== undefined ? kf.volume : kf.gain;
      if (offset < 0 || offset > clip.durationTicks) {
        const err = new Error(`Envelope offsetTick ${offset} outside clip bounds [0, ${clip.durationTicks}]`);
        err.code = 'KEYFRAME_OUT_OF_BOUNDS';
        throw err;
      }
      if (volume < 0 || volume > 2.0) {
        const err = new Error(`Volume ${volume} outside valid range [0, 2.0]`);
        err.code = 'INVALID_GAIN';
        throw err;
      }
      return {
        offsetTick: offset,
        volume: Number(volume)
      };
    });

    clip.audio = clip.audio || { volume: 1.0 };
    clip.audio.volumeEnvelope = formattedEnvelope;
    return { affectedIds: [clipId] };
  }

  static _opDeleteClip(candidate, params = {}) {
    const { clipId } = params;
    if (!clipId) {
      const err = new Error('delete_clip requires clipId');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clipIdx = (candidate.clips || []).findIndex(c => c.id === clipId);
    if (clipIdx === -1) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }

    const clip = candidate.clips[clipIdx];
    this._assertTrackNotLocked(candidate, clip.trackId);

    // Remove clip
    candidate.clips.splice(clipIdx, 1);

    // Remove associated animations
    if (Array.isArray(candidate.animations)) {
      candidate.animations = candidate.animations.filter(a => a.clipId !== clipId);
    }

    return { affectedIds: [clipId] };
  }

  static _opRippleDelete(candidate, params = {}) {
    const { clipId } = params;
    if (!clipId) {
      const err = new Error('ripple_delete requires clipId');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clipIdx = (candidate.clips || []).findIndex(c => c.id === clipId);
    if (clipIdx === -1) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }

    const targetClip = candidate.clips[clipIdx];
    this._assertTrackNotLocked(candidate, targetClip.trackId);
    const { trackId, startTick, durationTicks } = targetClip;
    const clipEndTick = startTick + durationTicks;

    // Remove the clip
    candidate.clips.splice(clipIdx, 1);

    // Remove associated animations
    if (Array.isArray(candidate.animations)) {
      candidate.animations = candidate.animations.filter(a => a.clipId !== clipId);
    }

    // Shift all subsequent clips on the same track left by durationTicks
    const affected = [clipId];
    for (const c of candidate.clips) {
      if (c.trackId === trackId && c.startTick >= clipEndTick) {
        c.startTick -= durationTicks;
        affected.push(c.id);
      }
    }

    return { affectedIds: affected };
  }

  static _opReorderTracks(candidate, params = {}) {
    const { trackOrders } = params;
    if (!Array.isArray(trackOrders) || trackOrders.length === 0) {
      const err = new Error('reorder_tracks requires trackOrders array of { trackId, zIndex }');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const affected = [];
    for (const order of trackOrders) {
      const track = (candidate.tracks || []).find(t => t.id === order.trackId);
      if (!track) {
        const err = new Error(`Track "${order.trackId}" not found`);
        err.code = 'TRACK_NOT_FOUND';
        throw err;
      }
      if (!Number.isInteger(order.zIndex)) {
        const err = new Error(`zIndex must be an integer. Got: ${order.zIndex}`);
        err.code = 'INVALID_ARGUMENT';
        throw err;
      }
      track.zIndex = order.zIndex;
      affected.push(track.id);
    }

    return { affectedIds: affected };
  }

  static _opModifyClip(candidate, params = {}) {
    const { clipId, typography, transform, effects, audio } = params;
    if (!clipId) {
      const err = new Error('modify_clip requires a clipId');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }

    if (params.assetId !== undefined) {
      clip.assetId = params.assetId;
    }

    if (typography && typeof typography === 'object') {
      clip.typography = { ...(clip.typography || {}), ...typography };
    }

    if (transform && typeof transform === 'object') {
      clip.transform = { ...(clip.transform || {}), ...transform };
    }

    if (Array.isArray(effects)) {
      clip.effects = effects;
    }

    if (audio && typeof audio === 'object') {
      clip.audio = { ...(clip.audio || {}), ...audio };
    }

    return { affectedIds: [clipId] };
  }

  static _opUpdateKeyframe(candidate, params = {}) {
    const { clipId, property, offsetTick, value, easing } = params;
    if (!clipId || !property || offsetTick === undefined) {
      const err = new Error('update_keyframe requires clipId, property, and offsetTick');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const anim = (candidate.animations || []).find(a => a.clipId === clipId && a.property === property);
    if (!anim) {
      const err = new Error(`No animation track found for clip "${clipId}" and property "${property}"`);
      err.code = 'ANIMATION_NOT_FOUND';
      throw err;
    }

    const kf = (anim.keyframes || []).find(k => k.offsetTick === offsetTick);
    if (!kf) {
      const err = new Error(`Keyframe at offsetTick ${offsetTick} not found for clip "${clipId}"`);
      err.code = 'KEYFRAME_NOT_FOUND';
      throw err;
    }

    if (value !== undefined) kf.value = value;
    if (easing !== undefined) kf.easing = easing;

    return { affectedIds: [clipId] };
  }

  static _assertTrackNotLocked(candidate, trackId) {
    const track = (candidate.tracks || []).find(t => t.id === trackId);
    if (track && track.locked) {
      const err = new Error(`Cannot modify locked track "${track.id}"`);
      err.code = 'TRACK_LOCKED';
      throw err;
    }
  }

  static _updateProjectDuration(candidate) {
    let maxEnd = 0;
    for (const c of candidate.clips || []) {
      const end = (c.startTick || 0) + (c.durationTicks || 0);
      if (end > maxEnd) maxEnd = end;
    }
    if (candidate.timebase) {
      candidate.timebase.durationTicks = Math.max(candidate.timebase.durationTicks || 0, maxEnd);
    }
  }

  static _opRippleTrim(candidate, params = {}) {
    const { clipId, edge, deltaTicks } = params;
    if (!clipId || !edge || deltaTicks === undefined) {
      const err = new Error('ripple_trim requires clipId, edge ("start"|"end"|"in"|"out"), and deltaTicks');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const normEdge = (edge === 'in' || edge === 'start') ? 'start' : (edge === 'out' || edge === 'end') ? 'end' : edge;
    if (normEdge !== 'start' && normEdge !== 'end') {
      const err = new Error(`Invalid edge: "${edge}". Must be "start", "end", "in", or "out".`);
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, clip.trackId);

    const oldStart = clip.startTick;
    const oldDuration = clip.durationTicks;
    const oldEnd = oldStart + oldDuration;

    if (normEdge === 'end') {
      const newDuration = oldDuration + deltaTicks;
      if (newDuration <= 0) {
        const err = new Error(`Ripple trim would result in non-positive duration: ${newDuration}`);
        err.code = 'INVALID_DURATION';
        throw err;
      }
      clip.durationTicks = newDuration;
      if (clip.source && clip.source.trimOutTick !== undefined) {
        clip.source.trimOutTick += deltaTicks;
      }
      // Shift downstream clips on same track
      const affected = [clipId];
      for (const other of candidate.clips || []) {
        if (other.trackId === clip.trackId && other.id !== clipId && other.startTick >= oldEnd) {
          other.startTick += deltaTicks;
          affected.push(other.id);
        }
      }
      this._updateProjectDuration(candidate);
      return { affectedIds: affected };
    } else { // edge === 'start'
      const newDuration = oldDuration - deltaTicks;
      if (newDuration <= 0) {
        const err = new Error(`Ripple trim would result in non-positive duration: ${newDuration}`);
        err.code = 'INVALID_DURATION';
        throw err;
      }
      clip.startTick += deltaTicks;
      clip.durationTicks = newDuration;
      if (clip.source) {
        clip.source.trimInTick = (clip.source.trimInTick || 0) + deltaTicks;
      }
      const affected = [clipId];
      if (params.rippleShiftDownstream) {
        for (const other of candidate.clips || []) {
          if (other.trackId === clip.trackId && other.id !== clipId && other.startTick >= oldEnd) {
            other.startTick -= deltaTicks;
            affected.push(other.id);
          }
        }
      }
      this._updateProjectDuration(candidate);
      return { affectedIds: affected };
    }
  }

  static _opSlipClip(candidate, params = {}) {
    const { clipId, deltaTicks } = params;
    if (!clipId || deltaTicks === undefined) {
      const err = new Error('slip_clip requires clipId and deltaTicks');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, clip.trackId);

    clip.source = clip.source || {};
    const curIn = clip.source.trimInTick || 0;
    const curOut = clip.source.trimOutTick !== undefined ? clip.source.trimOutTick : (curIn + clip.durationTicks);

    const newIn = curIn + deltaTicks;
    const newOut = curOut + deltaTicks;

    if (newIn < 0) {
      const err = new Error(`Slip out of bounds: new trimInTick would be ${newIn} < 0`);
      err.code = 'SLIP_OUT_OF_BOUNDS';
      throw err;
    }

    if (clip.source.assetId) {
      const asset = (candidate.assets || []).find(a => a.id === clip.source.assetId);
      if (asset && asset.durationTicks && newOut > asset.durationTicks) {
        const err = new Error(`Slip out of bounds: new trimOutTick ${newOut} exceeds asset duration ${asset.durationTicks}`);
        err.code = 'SLIP_OUT_OF_BOUNDS';
        throw err;
      }
    }

    clip.source.trimInTick = newIn;
    clip.source.trimOutTick = newOut;
    return { affectedIds: [clipId] };
  }

  static _opSlideClip(candidate, params = {}) {
    const { clipId, deltaTicks } = params;
    if (!clipId || deltaTicks === undefined) {
      const err = new Error('slide_clip requires clipId and deltaTicks');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const clip = (candidate.clips || []).find(c => c.id === clipId);
    if (!clip) {
      const err = new Error(`Clip "${clipId}" not found`);
      err.code = 'CLIP_NOT_FOUND';
      throw err;
    }
    this._assertTrackNotLocked(candidate, clip.trackId);

    const trackClips = (candidate.clips || [])
      .filter(c => c.trackId === clip.trackId)
      .sort((a, b) => a.startTick - b.startTick);

    const idx = trackClips.findIndex(c => c.id === clipId);
    const prevClip = idx > 0 ? trackClips[idx - 1] : null;
    const nextClip = idx < trackClips.length - 1 ? trackClips[idx + 1] : null;

    if (deltaTicks < 0) {
      if (!prevClip) {
        const err = new Error('Cannot slide left without preceding adjacent clip');
        err.code = 'SLIDE_BOUNDARY_ERROR';
        throw err;
      }
      if (prevClip.durationTicks + deltaTicks <= 0) {
        const err = new Error('Slide delta exceeds preceding clip duration');
        err.code = 'INVALID_DURATION';
        throw err;
      }
      prevClip.durationTicks += deltaTicks;
      clip.startTick += deltaTicks;
      if (nextClip) {
        nextClip.startTick += deltaTicks;
        nextClip.durationTicks -= deltaTicks;
      }
    } else if (deltaTicks > 0) {
      if (!nextClip) {
        const err = new Error('Cannot slide right without succeeding adjacent clip');
        err.code = 'SLIDE_BOUNDARY_ERROR';
        throw err;
      }
      if (nextClip.durationTicks - deltaTicks <= 0) {
        const err = new Error('Slide delta exceeds succeeding clip duration');
        err.code = 'INVALID_DURATION';
        throw err;
      }
      if (prevClip) {
        prevClip.durationTicks += deltaTicks;
      }
      clip.startTick += deltaTicks;
      nextClip.startTick += deltaTicks;
      nextClip.durationTicks -= deltaTicks;
    }

    const affected = [clipId];
    if (prevClip) affected.push(prevClip.id);
    if (nextClip) affected.push(nextClip.id);
    return { affectedIds: affected };
  }

  static _opSetTrackState(candidate, params = {}) {
    const { trackId, muted, locked, visible } = params;
    if (!trackId) {
      const err = new Error('set_track_state requires trackId');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }
    const track = (candidate.tracks || []).find(t => t.id === trackId);
    if (!track) {
      const err = new Error(`Track "${trackId}" not found`);
      err.code = 'TRACK_NOT_FOUND';
      throw err;
    }
    if (muted !== undefined) track.muted = !!muted;
    if (locked !== undefined) track.locked = !!locked;
    if (visible !== undefined) track.visible = !!visible;
    return { affectedIds: [trackId] };
  }

  static _opAttachColorGrade(candidate, params = {}) {
    const { clipId, gradeId, grade } = params;
    if (!clipId && !params.projectLevel) {
      const err = new Error('attach_color_grade requires clipId or projectLevel: true');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    if (!grade && !gradeId) {
      const err = new Error('attach_color_grade requires a "grade" object or "gradeId"');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    let targetContainer;
    let targetId;
    if (clipId) {
      const clip = (candidate.clips || []).find(c => c.id === clipId);
      if (!clip) {
        const err = new Error(`Clip "${clipId}" not found`);
        err.code = 'CLIP_NOT_FOUND';
        throw err;
      }
      this._assertTrackNotLocked(candidate, clip.trackId);
      targetContainer = clip;
      targetId = clipId;
    } else {
      targetContainer = candidate;
      targetId = candidate.id || 'project';
    }

    let gradePayload = grade !== undefined ? structuredClone(grade) : gradeId;
    if (typeof gradePayload === 'object' && gradePayload !== null) {
      // Validate LUT block if present and enabled
      if (gradePayload.lut && gradePayload.lut.enabled) {
        const lid = gradePayload.lut.lutId || gradePayload.lut.assetId;
        if (!lid && !gradePayload.lut.path) {
          const err = new Error('lut.enabled is true but no lutId or path was specified');
          err.code = 'ERR_UNREGISTERED_LUT_ID';
          throw err;
        }
        if (lid) {
          if (isSentinelId(lid)) {
            const err = new Error(`Cannot execute grade with policy sentinel "${lid}"`);
            err.code = 'ERR_SENTINEL_NOT_EXECUTABLE';
            throw err;
          }
          if (!isCertifiedLutId(lid)) {
            const err = new Error(`Unregistered LUT identifier "${lid}"`);
            err.code = 'ERR_UNREGISTERED_LUT_ID';
            throw err;
          }
          const resolved = resolveCertifiedLut(lid);
          gradePayload.lut.assetId = lid;
          gradePayload.lut.path = resolved.relativePath;
          gradePayload.lut.sha256 = resolved.sha256;
          gradePayload.lut.size = resolved.size;
        }
      }

      // Numeric finite & bounds checks
      if (gradePayload.exposure !== undefined) {
        if (typeof gradePayload.exposure !== 'number' || !Number.isFinite(gradePayload.exposure) || gradePayload.exposure < -6.0 || gradePayload.exposure > 6.0) {
          const err = new Error(`exposure must be finite number in [-6.0, 6.0], got ${gradePayload.exposure}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
      }

      if (gradePayload.whiteBalance) {
        const { temperature, tint } = gradePayload.whiteBalance;
        if (temperature !== undefined && (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < -1.0 || temperature > 1.0)) {
          const err = new Error(`whiteBalance.temperature must be in [-1.0, 1.0], got ${temperature}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        if (tint !== undefined && (typeof tint !== 'number' || !Number.isFinite(tint) || tint < -1.0 || tint > 1.0)) {
          const err = new Error(`whiteBalance.tint must be in [-1.0, 1.0], got ${tint}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
      }

      const val = validateColorGrade(gradePayload);
      if (!val.valid) {
        const err = new Error(`Color grade validation failed: ${val.errors.join('; ')}`);
        err.code = 'ERR_COLOR_GRADE_VALIDATION_FAILED';
        throw err;
      }
    }

    const previousGrade = targetContainer.colorGrade ? structuredClone(targetContainer.colorGrade) : null;
    targetContainer.colorGrade = gradePayload;

    const inverse = previousGrade ? {
      type: 'attach_color_grade',
      params: { clipId: params.clipId, projectLevel: params.projectLevel, grade: previousGrade }
    } : {
      type: 'remove_color_grade',
      params: { clipId: params.clipId, projectLevel: params.projectLevel }
    };

    return { affectedIds: [targetId], inverse };
  }

  static _opAdjustColorParams(candidate, params = {}) {
    const { clipId } = params;
    if (!clipId && !params.projectLevel) {
      const err = new Error('adjust_color_params requires clipId or projectLevel: true');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    let targetContainer;
    let targetId;
    if (clipId) {
      const clip = (candidate.clips || []).find(c => c.id === clipId);
      if (!clip) {
        const err = new Error(`Clip "${clipId}" not found`);
        err.code = 'CLIP_NOT_FOUND';
        throw err;
      }
      this._assertTrackNotLocked(candidate, clip.trackId);
      targetContainer = clip;
      targetId = clipId;
    } else {
      targetContainer = candidate;
      targetId = candidate.id || 'project';
    }

    if (!targetContainer.colorGrade || typeof targetContainer.colorGrade !== 'object') {
      const err = new Error('Cannot adjust color parameters: target has no attached color grade object');
      err.code = 'ERR_NO_ATTACHED_GRADE';
      throw err;
    }

    const adjustments = params.adjustments;
    if (!adjustments || typeof adjustments !== 'object' || Array.isArray(adjustments)) {
      const err = new Error('adjust_color_params requires an "adjustments" object');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const ALLOWED_KEYS = new Set([
      'enabled', 'name', 'exposure', 'whiteBalance', 'primary',
      'curves', 'hsl', 'lut', 'skinProtection', 'colorSpaces'
    ]);

    for (const key of Object.keys(adjustments)) {
      if (!ALLOWED_KEYS.has(key)) {
        const err = new Error(`Invalid parameter path "${key}" in adjust_color_params`);
        err.code = 'ERR_INVALID_PARAM_PATH';
        throw err;
      }
    }

    const currentGrade = structuredClone(targetContainer.colorGrade);
    const previousAdjustments = {};

    if (adjustments.enabled !== undefined) {
      previousAdjustments.enabled = currentGrade.enabled;
      currentGrade.enabled = Boolean(adjustments.enabled);
    }

    if (adjustments.name !== undefined) {
      previousAdjustments.name = currentGrade.name;
      currentGrade.name = String(adjustments.name);
    }

    if (adjustments.exposure !== undefined) {
      const exp = adjustments.exposure;
      if (typeof exp !== 'number' || !Number.isFinite(exp) || exp < -6.0 || exp > 6.0) {
        const err = new Error(`exposure adjustment must be finite number in [-6.0, 6.0], got ${exp}`);
        err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
        throw err;
      }
      previousAdjustments.exposure = currentGrade.exposure;
      currentGrade.exposure = exp;
    }

    if (adjustments.whiteBalance) {
      previousAdjustments.whiteBalance = structuredClone(currentGrade.whiteBalance || { temperature: 0, tint: 0 });
      if (!currentGrade.whiteBalance) currentGrade.whiteBalance = { temperature: 0, tint: 0 };
      if (adjustments.whiteBalance.temperature !== undefined) {
        const t = adjustments.whiteBalance.temperature;
        if (typeof t !== 'number' || !Number.isFinite(t) || t < -1.0 || t > 1.0) {
          const err = new Error(`whiteBalance.temperature must be finite in [-1.0, 1.0], got ${t}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        currentGrade.whiteBalance.temperature = t;
      }
      if (adjustments.whiteBalance.tint !== undefined) {
        const ti = adjustments.whiteBalance.tint;
        if (typeof ti !== 'number' || !Number.isFinite(ti) || ti < -1.0 || ti > 1.0) {
          const err = new Error(`whiteBalance.tint must be finite in [-1.0, 1.0], got ${ti}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        currentGrade.whiteBalance.tint = ti;
      }
    }

    if (adjustments.primary) {
      previousAdjustments.primary = structuredClone(currentGrade.primary || {});
      if (!currentGrade.primary) currentGrade.primary = { lift: [0,0,0], gamma: [1,1,1], gain: [1,1,1], offset: [0,0,0] };
      const boundsMap = {
        lift: [-1.0, 1.0],
        gamma: [0.1, 5.0],
        gain: [0.0, 5.0],
        offset: [-1.0, 1.0]
      };
      for (const [k, bounds] of Object.entries(boundsMap)) {
        if (adjustments.primary[k] !== undefined) {
          const arr = adjustments.primary[k];
          if (!Array.isArray(arr) || arr.length !== 3 || !arr.every(v => typeof v === 'number' && Number.isFinite(v) && v >= bounds[0] && v <= bounds[1])) {
            const err = new Error(`primary.${k} must be array of 3 finite numbers in [${bounds[0]}, ${bounds[1]}]`);
            err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
            throw err;
          }
          currentGrade.primary[k] = [...arr];
        }
      }
    }

    if (adjustments.curves) {
      previousAdjustments.curves = structuredClone(currentGrade.curves || {});
      if (!currentGrade.curves) currentGrade.curves = {};
      for (const [chan, pts] of Object.entries(adjustments.curves)) {
        if (!Array.isArray(pts) || pts.length < 2) {
          const err = new Error(`curves.${chan} must have at least 2 control points`);
          err.code = 'ERR_INVALID_CURVE';
          throw err;
        }
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].x === undefined || pts[i].y === undefined ||
              typeof pts[i].x !== 'number' || typeof pts[i].y !== 'number' ||
              !Number.isFinite(pts[i].x) || !Number.isFinite(pts[i].y) ||
              pts[i].x < 0 || pts[i].x > 1 || pts[i].y < 0 || pts[i].y > 1) {
            const err = new Error(`curves.${chan} point ${i} x and y must be finite numbers in [0.0, 1.0]`);
            err.code = 'ERR_INVALID_CURVE';
            throw err;
          }
          if (i > 0 && pts[i].x < pts[i - 1].x) {
            const err = new Error(`curves.${chan} points must be monotonically non-decreasing in x`);
            err.code = 'ERR_INVALID_CURVE';
            throw err;
          }
        }
        currentGrade.curves[chan] = structuredClone(pts);
      }
    }

    if (adjustments.hsl) {
      previousAdjustments.hsl = structuredClone(currentGrade.hsl || {});
      if (!currentGrade.hsl) currentGrade.hsl = {};
      for (const [chan, hVal] of Object.entries(adjustments.hsl)) {
        if (!currentGrade.hsl[chan]) currentGrade.hsl[chan] = { hue: 0, saturation: 0, lightness: 0 };
        if (hVal.hue !== undefined) {
          if (typeof hVal.hue !== 'number' || !Number.isFinite(hVal.hue) || hVal.hue < -180 || hVal.hue > 180) {
            const err = new Error(`hsl.${chan}.hue must be finite in [-180, 180]`);
            err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
            throw err;
          }
          currentGrade.hsl[chan].hue = hVal.hue;
        }
        if (hVal.saturation !== undefined) {
          if (typeof hVal.saturation !== 'number' || !Number.isFinite(hVal.saturation) || hVal.saturation < -1.0 || hVal.saturation > 1.0) {
            const err = new Error(`hsl.${chan}.saturation must be finite in [-1.0, 1.0]`);
            err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
            throw err;
          }
          currentGrade.hsl[chan].saturation = hVal.saturation;
        }
        if (hVal.lightness !== undefined) {
          if (typeof hVal.lightness !== 'number' || !Number.isFinite(hVal.lightness) || hVal.lightness < -1.0 || hVal.lightness > 1.0) {
            const err = new Error(`hsl.${chan}.lightness must be finite in [-1.0, 1.0]`);
            err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
            throw err;
          }
          currentGrade.hsl[chan].lightness = hVal.lightness;
        }
      }
    }

    if (adjustments.lut) {
      previousAdjustments.lut = structuredClone(currentGrade.lut || { enabled: false, intensity: 1.0, interpolation: 'tetrahedral' });
      if (!currentGrade.lut) currentGrade.lut = { enabled: false, intensity: 1.0, interpolation: 'tetrahedral' };
      if (adjustments.lut.enabled !== undefined) currentGrade.lut.enabled = Boolean(adjustments.lut.enabled);
      if (adjustments.lut.lutId !== undefined) {
        const lid = adjustments.lut.lutId;
        if (isSentinelId(lid)) {
          const err = new Error(`Policy sentinel "${lid}" cannot be applied as an executable LUT`);
          err.code = 'ERR_SENTINEL_NOT_EXECUTABLE';
          throw err;
        }
        if (!isCertifiedLutId(lid)) {
          const err = new Error(`Unknown LUT identifier "${lid}"`);
          err.code = 'ERR_UNREGISTERED_LUT_ID';
          throw err;
        }
        const resolved = resolveCertifiedLut(lid);
        currentGrade.lut.assetId = lid;
        currentGrade.lut.path = resolved.relativePath;
        currentGrade.lut.sha256 = resolved.sha256;
        currentGrade.lut.size = resolved.size;
      }
      if (adjustments.lut.intensity !== undefined) {
        const inte = adjustments.lut.intensity;
        if (typeof inte !== 'number' || !Number.isFinite(inte) || inte < 0.0 || inte > 1.0) {
          const err = new Error(`lut.intensity must be finite number in [0.0, 1.0], got ${inte}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        currentGrade.lut.intensity = inte;
      }
      if (adjustments.lut.interpolation !== undefined) {
        const validInterp = ['tetrahedral', 'trilinear', 'nearest'];
        if (!validInterp.includes(adjustments.lut.interpolation)) {
          const err = new Error(`lut.interpolation must be one of: ${validInterp.join(', ')}`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        currentGrade.lut.interpolation = adjustments.lut.interpolation;
      }
    }

    if (adjustments.skinProtection) {
      previousAdjustments.skinProtection = structuredClone(currentGrade.skinProtection || { enabled: false, weight: 0.8, tolerance: 0.3 });
      if (!currentGrade.skinProtection) currentGrade.skinProtection = { enabled: false, weight: 0.8, tolerance: 0.3 };
      if (adjustments.skinProtection.enabled !== undefined) currentGrade.skinProtection.enabled = Boolean(adjustments.skinProtection.enabled);
      if (adjustments.skinProtection.weight !== undefined) {
        const w = adjustments.skinProtection.weight;
        if (typeof w !== 'number' || !Number.isFinite(w) || w < 0.0 || w > 1.0) {
          const err = new Error(`skinProtection.weight must be in [0.0, 1.0]`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        currentGrade.skinProtection.weight = w;
      }
      if (adjustments.skinProtection.tolerance !== undefined) {
        const tol = adjustments.skinProtection.tolerance;
        if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0.0 || tol > 1.0) {
          const err = new Error(`skinProtection.tolerance must be in [0.0, 1.0]`);
          err.code = 'ERR_PARAM_OUT_OF_BOUNDS';
          throw err;
        }
        currentGrade.skinProtection.tolerance = tol;
      }
    }

    const val = validateColorGrade(currentGrade);
    if (!val.valid) {
      const err = new Error(`Adjusted color grade invalid: ${val.errors.join('; ')}`);
      err.code = 'ERR_COLOR_GRADE_VALIDATION_FAILED';
      throw err;
    }

    currentGrade.revision = (currentGrade.revision || 0) + 1;
    targetContainer.colorGrade = currentGrade;

    const inverse = {
      type: 'adjust_color_params',
      params: { clipId: params.clipId, projectLevel: params.projectLevel, adjustments: previousAdjustments }
    };

    return { affectedIds: [targetId], inverse };
  }

  static _opRemoveColorGrade(candidate, params = {}) {
    const { clipId } = params;
    if (!clipId && !params.projectLevel) {
      const err = new Error('remove_color_grade requires clipId or projectLevel: true');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    let targetContainer;
    let targetId;
    if (clipId) {
      const clip = (candidate.clips || []).find(c => c.id === clipId);
      if (!clip) {
        const err = new Error(`Clip "${clipId}" not found`);
        err.code = 'CLIP_NOT_FOUND';
        throw err;
      }
      this._assertTrackNotLocked(candidate, clip.trackId);
      targetContainer = clip;
      targetId = clipId;
    } else {
      targetContainer = candidate;
      targetId = candidate.id || 'project';
    }

    if (!targetContainer.colorGrade) {
      const err = new Error('Cannot remove color grade: target has no attached color grade');
      err.code = 'ERR_NO_GRADE_TO_REMOVE';
      throw err;
    }

    const removedGrade = structuredClone(targetContainer.colorGrade);
    delete targetContainer.colorGrade;

    const inverse = {
      type: 'attach_color_grade',
      params: { clipId: params.clipId, projectLevel: params.projectLevel, grade: removedGrade }
    };

    return { affectedIds: [targetId], inverse };
  }

  static _opInvalidateAndRegenerateSidecar(candidate, params = {}, operation = {}) {
    if (!candidate || typeof candidate !== 'object') {
      const err = new Error('invalidate_and_regenerate_sidecar requires a valid target object');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    }

    const affectedIds = [params.target_asset || params.sidecar_type || 'sidecar_metadata'];
    const inverse = {
      type: 'invalidate_and_regenerate_sidecar',
      params: {
        action: 'rollback_invalidation',
        previous_state: structuredClone(candidate)
      }
    };

    if (candidate.stale_cache_marker !== undefined) {
      candidate.stale_cache_marker = false;
      candidate.cached_project_revision = params.target_revision || 1;
      candidate.regenerated_at = params.regenerated_at || new Date().toISOString();
      candidate.status = 'VALID';
    }

    if (candidate.cached_asset_sha256 !== undefined) {
      candidate.invalidated_stale_sha256 = candidate.cached_asset_sha256;
      candidate.cached_asset_sha256 = params.reconciled_asset_sha256;
      candidate.reconciled_at = params.reconciled_at || new Date().toISOString();
      candidate.status = 'VALID';
    }

    return { affectedIds, inverse };
  }
}

module.exports = {
  OperationExecutor
};
