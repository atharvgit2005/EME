/**
 * EME Timeline Adapter & Display State Projection Engine (TL-01 / Phase 18)
 * Maps canonical EME project objects to timeline display models,
 * handles magnetic snapping, transient drag candidate states,
 * and deterministic CapCut draft microsecond interop.
 */

const { MediaTime, TICKS_PER_SECOND } = require('./time.js');

class TimelineAdapter {
  /**
   * Projects a canonical EME project model into a view-ready timeline model
   * @param {object} project Canonical EME project v1
   * @param {object} viewState Transient UI state (zoom, scroll, playhead, selection)
   */
  static projectToTimelineView(project, viewState = {}) {
    if (!project) return null;

    const zoom = viewState.zoom || 1.0; // scale factor (1.0 = 100 pixels per second)
    const basePps = 100.0;
    const pixelsPerSecond = basePps * zoom;
    const pixelsPerTick = pixelsPerSecond / TICKS_PER_SECOND;

    const fps = project.timebase?.fps || { numerator: 30, denominator: 1 };
    const durationTicks = project.timebase?.durationTicks || 0;
    const durationSec = MediaTime.ticksToSeconds(durationTicks);
    const totalTimelineWidthPx = Math.max(800, Math.round(durationTicks * pixelsPerTick));

    // Map tracks
    const tracks = (project.tracks || []).map((t, idx) => ({
      id: t.id,
      name: t.name || `Track ${idx + 1}`,
      kind: t.kind,
      zIndex: t.zIndex !== undefined ? t.zIndex : idx,
      muted: !!t.muted,
      locked: !!t.locked,
      visible: t.visible !== undefined ? t.visible : true
    })).sort((a, b) => a.zIndex - b.zIndex);

    // Map clips to display objects
    const clips = (project.clips || []).map(c => {
      const leftPx = Math.round(c.startTick * pixelsPerTick);
      const widthPx = Math.max(4, Math.round(c.durationTicks * pixelsPerTick));
      const startSec = MediaTime.ticksToSeconds(c.startTick);
      const durationSec = MediaTime.ticksToSeconds(c.durationTicks);

      return {
        id: c.id,
        trackId: c.trackId,
        type: c.type,
        startTick: c.startTick,
        durationTicks: c.durationTicks,
        endTick: c.startTick + c.durationTicks,
        startSec,
        durationSec,
        leftPx,
        widthPx,
        source: c.source ? { ...c.source } : null,
        transform: c.transform ? { ...c.transform } : null,
        audio: c.audio ? { ...c.audio } : null,
        effects: Array.isArray(c.effects) ? [...c.effects] : [],
        colorGrade: c.colorGrade || null,
        isSelected: viewState.selectedClipId === c.id
      };
    });

    const playheadTick = viewState.playheadTick || 0;
    const playheadSec = MediaTime.ticksToSeconds(playheadTick);
    const playheadPx = Math.round(playheadTick * pixelsPerTick);

    return {
      projectId: project.id,
      revision: project.revision,
      fps,
      durationTicks,
      durationSec,
      pixelsPerSecond,
      pixelsPerTick,
      totalTimelineWidthPx,
      playhead: {
        tick: playheadTick,
        seconds: playheadSec,
        pixelPosition: playheadPx,
        timecode: this.formatTimecode(playheadTick, fps)
      },
      tracks,
      clips
    };
  }

  /**
   * Formats ticks into standard SMPTE timecode (HH:MM:SS:FF)
   */
  static formatTimecode(ticks, fps = { numerator: 30, denominator: 1 }) {
    const totalFrames = MediaTime.ticksToFrame(ticks, fps);
    const numFps = Math.round(fps.numerator / fps.denominator);

    const ff = totalFrames % numFps;
    const totalSeconds = Math.floor(totalFrames / numFps);
    const ss = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const mm = totalMinutes % 60;
    const hh = Math.floor(totalMinutes / 60);

    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }

  /**
   * Computes magnetic snap target for a candidate tick position
   * Snaps against clip boundaries (in and out) and playhead
   * @param {number} candidateTick 
   * @param {object} project 
   * @param {number} thresholdTicks (e.g. 5 frames ~ 20000 ticks)
   * @param {number} playheadTick 
   * @returns {{ snappedTick: number, isSnapped: boolean, snapTarget: string|null }}
   */
  static computeMagneticSnap(candidateTick, project, thresholdTicks = 16000, playheadTick = null) {
    let closestDist = Infinity;
    let snappedTick = candidateTick;
    let snapTarget = null;

    // Check Timeline Start
    const dStart = Math.abs(candidateTick - 0);
    if (dStart <= thresholdTicks) {
      closestDist = dStart;
      snappedTick = 0;
      snapTarget = 'Timeline Start';
    }

    // Check Playhead
    if (playheadTick !== null && playheadTick !== undefined) {
      const dPlayhead = Math.abs(candidateTick - playheadTick);
      if (dPlayhead <= thresholdTicks && dPlayhead < closestDist) {
        closestDist = dPlayhead;
        snappedTick = playheadTick;
        snapTarget = 'Playhead';
      }
    }

    const clips = project?.clips || [];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const inDist = Math.abs(candidateTick - c.startTick);
      if (inDist <= thresholdTicks && inDist < closestDist) {
        closestDist = inDist;
        snappedTick = c.startTick;
        snapTarget = `Clip "${c.id}" In`;
      }
      const outTick = c.startTick + c.durationTicks;
      const outDist = Math.abs(candidateTick - outTick);
      if (outDist <= thresholdTicks && outDist < closestDist) {
        closestDist = outDist;
        snappedTick = outTick;
        snapTarget = `Clip "${c.id}" Out`;
      }
    }

    return {
      snappedTick,
      isSnapped: closestDist <= thresholdTicks,
      snapTarget,
      deltaTicks: snappedTick - candidateTick
    };
  }

  /**
   * Converts an external CapCut draft format object into canonical EME project state
   * Preserves microsecond to 120,000 tick rational conversions
   * @param {object} draftInfo CapCut draft_info.json
   */
  static importCapCutDraft(draftInfo) {
    if (!draftInfo || !Array.isArray(draftInfo.tracks)) {
      throw new Error('Invalid CapCut draft format: missing tracks array');
    }

    const durationUs = draftInfo.duration || 0;
    const durationTicks = MediaTime.microsecondsToTicks(durationUs);

    const fps = {
      numerator: Math.round(draftInfo.fps || 30),
      denominator: 1
    };

    const project = {
      id: `proj_capcut_${draftInfo.id || Date.now()}`,
      schemaVersion: '1.0.0',
      revision: 0,
      title: draftInfo.name || 'Imported CapCut Project',
      canvas: {
        width: draftInfo.canvas_config?.width || 1080,
        height: draftInfo.canvas_config?.height || 1920,
        aspectRatio: draftInfo.canvas_config?.ratio || '9:16'
      },
      timebase: {
        fps,
        ticksPerSecond: TICKS_PER_SECOND,
        durationTicks,
        endpointConvention: 'half-open'
      },
      assets: [],
      tracks: [],
      clips: []
    };

    // Extract materials as assets
    const materials = draftInfo.materials || {};
    const videoAssets = materials.videos || [];
    for (const v of videoAssets) {
      project.assets.push({
        id: v.id,
        type: 'video',
        src: v.path || `assets/${v.id}.mp4`,
        durationTicks: MediaTime.microsecondsToTicks(v.duration || 0)
      });
    }

    // Convert tracks and segments
    for (let tIdx = 0; tIdx < draftInfo.tracks.length; tIdx++) {
      const t = draftInfo.tracks[tIdx];
      const trackKind = t.type === 'audio' ? 'audio' : 'visual';
      const trackId = `track_${t.id || tIdx}`;

      project.tracks.push({
        id: trackId,
        name: `${t.type || 'track'}_${tIdx + 1}`,
        kind: trackKind,
        zIndex: tIdx,
        muted: !!t.mute,
        locked: false
      });

      for (const seg of t.segments || []) {
        const segStartUs = seg.target_timerange?.start || 0;
        const segDurationUs = seg.target_timerange?.duration || 0;
        const sourceStartUs = seg.source_timerange?.start || 0;
        const sourceDurationUs = seg.source_timerange?.duration || 0;

        const clip = {
          id: `clip_${seg.id || Date.now()}`,
          trackId: trackId,
          type: trackKind === 'audio' ? 'audio' : 'video',
          startTick: MediaTime.microsecondsToTicks(segStartUs),
          durationTicks: MediaTime.microsecondsToTicks(segDurationUs),
          source: {
            assetId: seg.material_id,
            trimInTick: MediaTime.microsecondsToTicks(sourceStartUs),
            trimOutTick: MediaTime.microsecondsToTicks(sourceStartUs + sourceDurationUs)
          }
        };

        if (seg.clip) {
          clip.transform = {
            position: { x: seg.clip.transform?.x || 0, y: seg.clip.transform?.y || 0 },
            scale: { x: seg.clip.scale?.x || 1.0, y: seg.clip.scale?.y || 1.0 },
            rotation: seg.clip.rotation || 0,
            opacity: seg.clip.alpha !== undefined ? seg.clip.alpha : 1.0
          };
        }

        project.clips.push(clip);
      }
    }

    return project;
  }

  /**
   * Converts a canonical EME project model into a CapCut draft format object
   * Preserves canonical 120,000 tick to microsecond rational conversions
   * @param {object} project Canonical EME project v1
   * @returns {object} CapCut draft_info.json format object
   */
  static exportCapCutDraft(project) {
    if (!project) {
      throw new Error('Valid canonical project required for CapCut draft export');
    }

    const durationTicks = project.timebase?.durationTicks || 0;
    const durationUs = MediaTime.ticksToMicroseconds(durationTicks);

    const fps = project.timebase?.fps || { numerator: 30, denominator: 1 };
    const numFps = Math.round(fps.numerator / fps.denominator);

    const draft = {
      id: project.id ? project.id.replace(/^proj_capcut_/, '') : `capcut_${Date.now()}`,
      name: project.title || 'Exported CapCut Draft',
      fps: numFps,
      duration: durationUs,
      canvas_config: {
        width: project.canvas?.width || 1080,
        height: project.canvas?.height || 1920,
        ratio: project.canvas?.aspectRatio || '9:16'
      },
      materials: {
        videos: (project.assets || []).map(a => ({
          id: a.id,
          path: a.src || a.uri || `assets/${a.id}.mp4`,
          duration: MediaTime.ticksToMicroseconds(a.durationTicks || 0)
        }))
      },
      tracks: []
    };

    // Sort tracks by zIndex
    const tracks = (project.tracks || []).slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (let tIdx = 0; tIdx < tracks.length; tIdx++) {
      const t = tracks[tIdx];
      const rawTrackId = t.id.replace(/^track_/, '');
      const trackObj = {
        id: rawTrackId,
        type: t.kind === 'audio' ? 'audio' : 'video',
        mute: !!t.muted,
        segments: []
      };

      const trackClips = (project.clips || []).filter(c => c.trackId === t.id).sort((a, b) => a.startTick - b.startTick);
      for (const c of trackClips) {
        const segStartUs = MediaTime.ticksToMicroseconds(c.startTick);
        const segDurationUs = MediaTime.ticksToMicroseconds(c.durationTicks);
        const sourceStartUs = c.source ? MediaTime.ticksToMicroseconds(c.source.trimInTick || 0) : 0;
        const sourceOutUs = c.source && c.source.trimOutTick !== undefined 
          ? MediaTime.ticksToMicroseconds(c.source.trimOutTick) 
          : (sourceStartUs + segDurationUs);
        const sourceDurationUs = sourceOutUs - sourceStartUs;

        const seg = {
          id: c.id.replace(/^clip_/, ''),
          material_id: c.source?.assetId || c.assetId || null,
          target_timerange: {
            start: segStartUs,
            duration: segDurationUs
          },
          source_timerange: {
            start: sourceStartUs,
            duration: sourceDurationUs
          }
        };

        if (c.transform) {
          seg.clip = {
            transform: {
              x: c.transform.position?.x ?? 0,
              y: c.transform.position?.y ?? 0
            },
            scale: {
              x: c.transform.scale?.x ?? 1.0,
              y: c.transform.scale?.y ?? 1.0
            },
            rotation: c.transform.rotation ?? 0,
            alpha: c.transform.opacity ?? 1.0
          };
        }

        trackObj.segments.push(seg);
      }
      draft.tracks.push(trackObj);
    }

    return draft;
  }
}

module.exports = {
  TimelineAdapter
};
