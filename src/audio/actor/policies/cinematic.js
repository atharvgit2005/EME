/**
 * Editing Mechanics Engine (EME) - Cinematic Editorial Policy (Phase A3)
 * Restrained pacing, cuts on phrase/section boundaries, subtle punch zooms, zero strobe flashes.
 */

const { EditorialPolicy } = require('../editorial-policy.js');

class CinematicPolicy extends EditorialPolicy {
  constructor(options = {}) {
    super({
      id: 'cinematic',
      name: 'Cinematic Narrative Restrained Policy',
      version: '1.0.0',
      minimumShotDurationTicks: 120000, // 1.0s minimum clip length
      minimumCutGapTicks: 120000,
      maxFlashesPerSecond: 0.5,
      syncToleranceTicks: 4000,
      downbeatPriorityMultiplier: 2.0,
      ...options
    });
  }

  evaluate(candidateCues, context = {}) {
    const acceptedCues = [];
    const rejectedCues = [];

    const sorted = [...candidateCues].sort((a, b) => a.atTicks - b.atTicks || b.priority - a.priority);
    let lastCutTick = -Infinity;

    for (const cue of sorted) {
      if (cue.type === 'accent_flash') {
        rejectedCues.push({
          cue,
          code: 'REJECTED_POLICY_RESTRICTION',
          message: 'Cinematic policy strictly forbids strobe/flash accents'
        });
        continue;
      }

      if (cue.type === 'jump_cut') {
        if (cue.atTicks - lastCutTick < this.minimumCutGapTicks) {
          rejectedCues.push({
            cue,
            code: 'REJECTED_REFRACTORY_VIOLATION',
            message: `Cut at ${cue.atTicks} violates cinematic minimum shot duration ${this.minimumCutGapTicks} ticks`
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
  CinematicPolicy
};
