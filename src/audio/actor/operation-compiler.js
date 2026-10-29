/**
 * Editing Mechanics Engine (EME) - Beat Actor Operation Compiler (Phase A3)
 * Compiles accepted editorial cues into legal, atomic EME operations for OperationExecutor.
 */

/**
 * Compiles validated editorial cues into EME operations against the project snapshot.
 * @param {Array<object>} acceptedCues
 * @param {object} project EME project snapshot (read-only)
 * @returns {Array<object>} Concrete EME operations
 */
function compileCuesToOperations(acceptedCues, project) {
  const operations = [];
  if (!acceptedCues || acceptedCues.length === 0 || !project) {
    return operations;
  }

  const clips = (project.timeline && project.timeline.clips) || project.clips || [];
  const clipMap = new Map(clips.map(c => [c.id, c]));

  // Track simulated splits so subsequent cues on the same timeline span resolve correctly
  const activeClipSpans = clips.map(c => ({
    id: c.id,
    startTick: c.timelineStartTicks !== undefined ? c.timelineStartTicks : (c.startTick || 0),
    durationTicks: c.durationTicks
  }));

  // Sort cues: jump_cut operations compile FIRST (chronologically) so that clip spans
  // are split before property animations and effects are bound to clip IDs and offsets
  const sortedCues = [...acceptedCues].sort((a, b) => {
    const isCutA = a.type === 'jump_cut' ? 0 : 1;
    const isCutB = b.type === 'jump_cut' ? 0 : 1;
    if (isCutA !== isCutB) return isCutA - isCutB;
    return a.atTicks - b.atTicks;
  });

  for (const cue of sortedCues) {
    const originalClip = clipMap.get(cue.targetClipId);

    // Locate the current active clip span covering cue.atTicks
    let activeSpan = activeClipSpans.find(
      s => cue.atTicks >= s.startTick && cue.atTicks < s.startTick + s.durationTicks
    );
    const targetClipId = activeSpan ? activeSpan.id : cue.targetClipId;
    const clipStartTick = activeSpan ? activeSpan.startTick : (originalClip ? originalClip.timelineStartTicks || originalClip.startTick || 0 : 0);
    const clipDurationTicks = activeSpan ? activeSpan.durationTicks : (originalClip ? originalClip.durationTicks : 360000);

    switch (cue.type) {
      case 'jump_cut': {
        const splitTick = cue.atTicks;
        // Verify splitTick is strictly inside activeSpan bounds
        if (activeSpan && splitTick > activeSpan.startTick && splitTick < activeSpan.startTick + activeSpan.durationTicks) {
          const newClipId = `${targetClipId}_cut_${splitTick}`;
          operations.push({
            type: 'split_clip',
            params: {
              clipId: targetClipId,
              splitTick,
              newClipId
            }
          });

          // Update simulated spans: split activeSpan into two
          const firstDuration = splitTick - activeSpan.startTick;
          const secondDuration = activeSpan.durationTicks - firstDuration;
          activeSpan.durationTicks = firstDuration;
          activeClipSpans.push({
            id: newClipId,
            startTick: splitTick,
            durationTicks: secondDuration
          });
        }
        break;
      }

      case 'punch_zoom': {
        const offsetTick = Math.max(0, cue.atTicks - clipStartTick);
        const peakOffset = Math.min(clipDurationTicks, offsetTick + 6000);
        const endOffset = Math.min(clipDurationTicks, offsetTick + (cue.params?.durationTicks || 18000));

        operations.push({
          type: 'animate_property',
          params: {
            clipId: targetClipId,
            property: 'scale',
            keyframes: [
              { offsetTick, value: 1.0, easing: 'easeIn' },
              { offsetTick: peakOffset, value: cue.params?.scale || 1.15, easing: 'easeOut' },
              { offsetTick: endOffset, value: 1.0, easing: 'easeOut' }
            ]
          }
        });
        break;
      }

      case 'accent_flash': {
        operations.push({
          type: 'apply_effect',
          params: {
            clipId: targetClipId,
            effect: {
              type: 'brightness',
              parameters: {
                value: cue.params?.intensity ? 1.0 + cue.params.intensity * 0.5 : 1.5,
                durationTicks: cue.params?.durationTicks || 12000
              }
            }
          }
        });
        break;
      }

      case 'sfx_cue': {
        if (cue.params && cue.params.assetId) {
          operations.push({
            type: 'insert_clip',
            params: {
              trackId: cue.targetTrackId || 'audio-sfx',
              clip: {
                id: `sfx_clip_${cue.atTicks}`,
                assetId: cue.params.assetId,
                startTick: cue.atTicks,
                durationTicks: cue.params.durationTicks || 24000
              }
            }
          });
        }
        break;
      }

      default:
        // Ignore unhandled cue types
        break;
    }
  }

  return operations;
}

module.exports = {
  compileCuesToOperations
};
