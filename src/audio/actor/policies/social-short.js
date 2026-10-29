/**
 * Editing Mechanics Engine (EME) - Social Short Editorial Policy (Phase A3)
 * High-energy, punchy edits, fast cuts on downbeats, dynamic zoom accents on drops.
 */

const { EditorialPolicy } = require('../editorial-policy.js');

class SocialShortPolicy extends EditorialPolicy {
  constructor(options = {}) {
    super({
      id: 'social-short',
      name: 'Social Short / Reel High-Energy Policy',
      version: '1.0.0',
      minimumShotDurationTicks: 36000, // 300ms minimum clip length
      minimumCutGapTicks: 36000,
      maxFlashesPerSecond: 2.0,
      syncToleranceTicks: 2000,
      downbeatPriorityMultiplier: 1.8,
      ...options
    });
  }

  evaluate(candidateCues, context = {}) {
    const acceptedCues = [];
    const rejectedCues = [];

    // Sort candidate cues chronologically, then by priority descending
    const sorted = [...candidateCues].sort((a, b) => a.atTicks - b.atTicks || b.priority - a.priority);

    let lastCutTick = -Infinity;
    let flashCountInLastSecond = 0;
    let lastFlashTick = -Infinity;

    for (const cue of sorted) {
      // 1. Minimum cut spacing check
      if (cue.type === 'jump_cut') {
        if (cue.atTicks - lastCutTick < this.minimumCutGapTicks) {
          rejectedCues.push({
            cue,
            code: 'REJECTED_REFRACTORY_VIOLATION',
            message: `Cut at ${cue.atTicks} violates minimum gap ${this.minimumCutGapTicks} ticks from last cut at ${lastCutTick}`
          });
          continue;
        }
        lastCutTick = cue.atTicks;
      }

      // 2. Flash rate check
      if (cue.type === 'accent_flash') {
        if (cue.atTicks - lastFlashTick < 120000 / this.maxFlashesPerSecond) {
          rejectedCues.push({
            cue,
            code: 'REJECTED_FLASH_RATE_EXCEEDED',
            message: `Flash at ${cue.atTicks} exceeds maximum flash rate limit of ${this.maxFlashesPerSecond}/sec`
          });
          continue;
        }
        lastFlashTick = cue.atTicks;
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
  SocialShortPolicy
};
