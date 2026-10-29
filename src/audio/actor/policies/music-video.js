/**
 * Editing Mechanics Engine (EME) - Music Video Editorial Policy (Phase A3)
 * Bar-cadenced cuts on 2-bar/4-bar boundaries, dynamic zooms on kicks, speed ramping anchors on drops.
 */

const { EditorialPolicy } = require('../editorial-policy.js');

class MusicVideoPolicy extends EditorialPolicy {
  constructor(options = {}) {
    super({
      id: 'music-video',
      name: 'Music Video Cadenced Policy',
      version: '1.0.0',
      minimumShotDurationTicks: 60000, // 500ms minimum clip length
      minimumCutGapTicks: 60000,
      maxFlashesPerSecond: 1.0,
      syncToleranceTicks: 2000,
      downbeatPriorityMultiplier: 1.5,
      ...options
    });
  }

  evaluate(candidateCues, context = {}) {
    const acceptedCues = [];
    const rejectedCues = [];

    const sorted = [...candidateCues].sort((a, b) => a.atTicks - b.atTicks || b.priority - a.priority);
    let lastCutTick = -Infinity;

    for (const cue of sorted) {
      if (cue.type === 'jump_cut') {
        if (cue.atTicks - lastCutTick < this.minimumCutGapTicks) {
          rejectedCues.push({
            cue,
            code: 'REJECTED_REFRACTORY_VIOLATION',
            message: `Cut at ${cue.atTicks} violates cadenced minimum gap ${this.minimumCutGapTicks} ticks`
          });
          continue;
        }
        lastCutTick = cue.atTicks;
      }

      acceptedCues.push(cue);
    }

    return {
      acceptedCues,
      rejectedCues
    };
  }
}

module.exports = {
  MusicVideoPolicy
};
