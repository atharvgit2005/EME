/**
 * Editing Mechanics Engine (EME) - Editorial Policy Base (Phase A3)
 * Defines pacing rules, safety thresholds, and candidate cue filters.
 */

class EditorialPolicy {
  constructor(options = {}) {
    this.id = options.id || 'default-policy';
    this.name = options.name || 'Default Policy';
    this.version = options.version || '1.0.0';
    // Minimum shot duration in EME ticks (120,000 ticks/sec). 48,000 ticks = 400ms
    this.minimumShotDurationTicks = options.minimumShotDurationTicks || 48000;
    // Maximum flash rate per second (to avoid visual strobe fatigue)
    this.maxFlashesPerSecond = options.maxFlashesPerSecond || 2.0;
    // Minimum gap between cuts in ticks
    this.minimumCutGapTicks = options.minimumCutGapTicks || 48000;
    // Sync tolerance in ticks (1 video frame at 60fps = 2,000 ticks)
    this.syncToleranceTicks = options.syncToleranceTicks || 2000;
    // Downbeat priority weight multiplier
    this.downbeatPriorityMultiplier = options.downbeatPriorityMultiplier || 1.5;
  }

  /**
   * Filter and prioritize candidate cues based on policy rules.
   * @param {Array<object>} candidateCues
   * @param {object} context { projectSnapshot, beatAnalysis }
   * @returns {{ acceptedCues: Array<object>, rejectedCues: Array<{ cue: object, code: string, message: string }> }}
   */
  evaluate(candidateCues, context = {}) {
    throw new Error('evaluate() must be implemented by subclass policy');
  }
}

module.exports = {
  EditorialPolicy
};
