/**
 * Editing Mechanics Engine (EME) - Phase 28: Anti-Oscillation & Convergence Guard
 *
 * Implements Stage 28.3:
 * - Detects semantic oscillation on the same clip and defect lineage (ARC-28-15).
 * - Implements validated integer-tick reversal tolerance epsilon (ARC-28-16):
 *     |\Delta_k + \Delta_{k-1}| < \epsilon (default \epsilon = 1200 ticks = 10ms).
 * - Distinguishes duplicate proposals from legitimate persistent findings (ARC-28-17).
 * - Enforces cumulative safety bounds across passes (ARC-28-18):
 *     * Cumulative timeline shift cap: 240,000 ticks (2.0s) per clip.
 *     * Cumulative true-peak attenuation cap: 12.0 dB per clip.
 *     * Preserves stricter Phase 27 per-operation limit (max 120,000 ticks).
 * - Distinguishes separate convergence outcomes (ARC-28-19):
 *     CONVERGED, NO_PROGRESS, QUALITY_REGRESSION, OSCILLATION_DETECTED,
 *     DUPLICATE_REPAIR, MAX_PASSES_EXCEEDED, NEEDS_RECONCILIATION.
 * - Finding-specific quality thresholds for sync vs true-peak (ARC-28-20).
 * - Evaluates before execution and after fresh render QA verification (ARC-28-21).
 * - Strictly non-mutating planning and diagnostic component (ARC-28-21).
 */

const { TICKS_PER_SECOND } = require('../../engine/time.js');

// Default reversal tolerance: 1200 integer ticks = 10ms (at 120,000 ticks/sec)
const DEFAULT_REVERSAL_TOLERANCE_TICKS = 1200;
// Cumulative cycle shift limit: 240,000 ticks = 2.0s
const DEFAULT_MAX_CUMULATIVE_SHIFT_TICKS = 240000;
// Per-operation shift limit inherited from Phase 27: 120,000 ticks = 1.0s
const DEFAULT_MAX_SINGLE_SHIFT_TICKS = 120000;
// Cumulative cycle attenuation limit: 12.0 dB
const DEFAULT_MAX_CUMULATIVE_ATTENUATION_DB = 12.0;

class RepairConvergenceGuard {
  /**
   * Evaluates a proposed repair before execution to prevent oscillation, duplicate repairs,
   * or cumulative safety cap breaches (ARC-28-21).
   *
   * @param {object} proposal Proposed AudioRepairProposal
   * @param {object} candidateProject Current candidate project state
   * @param {object[]} historyJournal Array of committed operation records from previous passes
   * @param {object} [policy] Audio repair policy override
   * @returns {{
   *   allowed: boolean,
   *   outcome: 'ALLOWED' | 'OSCILLATION_DETECTED' | 'DUPLICATE_REPAIR' | 'CUMULATIVE_SHIFT_CAP_EXCEEDED' | 'SINGLE_SHIFT_CAP_EXCEEDED' | 'CUMULATIVE_ATTENUATION_CAP_EXCEEDED',
   *   reconciliation_required: boolean,
   *   reason?: string,
   *   details?: object
   * }}
   */
  static validateProposalBeforeExecution(proposal, candidateProject, historyJournal = [], policy = null) {
    if (!proposal || typeof proposal !== 'object') {
      return { allowed: false, outcome: 'INVALID_PROPOSAL', reconciliation_required: true, reason: 'Proposal is missing or invalid' };
    }

    const clipId = proposal.target_clip_id;
    const strategy = proposal.strategy;
    const reversalTolerance = policy?.convergence_bounds?.reversal_tolerance_ticks || DEFAULT_REVERSAL_TOLERANCE_TICKS;
    const maxCumulativeShift = policy?.convergence_bounds?.max_cumulative_shift_ticks || DEFAULT_MAX_CUMULATIVE_SHIFT_TICKS;
    const maxCumulativeAttenuation = policy?.convergence_bounds?.max_cumulative_attenuation_db || DEFAULT_MAX_CUMULATIVE_ATTENUATION_DB;

    // Filter history for operations committed on the SAME clip and strategy (semantic lineage ARC-28-15)
    const clipHistory = historyJournal.filter(entry => entry.clipId === clipId && entry.strategy === strategy);

    // -------------------------------------------------------------
    // 1. Synchronization Retiming Safeguards (SYNC_RETIME)
    // -------------------------------------------------------------
    if (strategy === 'SYNC_RETIME') {
      const shiftTicks = proposal.parameters?.shift_ticks || 0;

      // 1a. Stricter single-operation cap inherited from Phase 27 (ARC-28-18)
      if (Math.abs(shiftTicks) > DEFAULT_MAX_SINGLE_SHIFT_TICKS) {
        return {
          allowed: false,
          outcome: 'SINGLE_SHIFT_CAP_EXCEEDED',
          reconciliation_required: true,
          reason: `Single shift of ${Math.abs(shiftTicks)} ticks exceeds per-operation limit of ${DEFAULT_MAX_SINGLE_SHIFT_TICKS} ticks`,
          details: { shiftTicks, limit: DEFAULT_MAX_SINGLE_SHIFT_TICKS }
        };
      }

      // 1b. Duplicate repair check (ARC-28-17):
      // Check if previous pass already executed the exact same shift on this clip
      if (clipHistory.length > 0) {
        const lastOp = clipHistory[clipHistory.length - 1];
        const lastShift = lastOp.forwardOp?.targetTick !== undefined && lastOp.priorProject
          ? (lastOp.forwardOp.targetTick - (lastOp.priorProject.clips?.find(c => c.id === clipId)?.startTick || 0))
          : 0;

        if (lastShift === shiftTicks && Math.abs(shiftTicks) > 0) {
          return {
            allowed: false,
            outcome: 'DUPLICATE_REPAIR',
            reconciliation_required: true,
            reason: `Duplicate repair proposal: exact same shift of ${shiftTicks} ticks was already executed on clip "${clipId}" in pass ${lastOp.pass}`,
            details: { clipId, shiftTicks, previousPass: lastOp.pass }
          };
        }

        // 1c. Semantic sign-reversal oscillation check (ARC-28-15 & ARC-28-16):
        // Formula: |\Delta_k + \Delta_{k-1}| < \epsilon
        const sumShifts = shiftTicks + lastShift;
        if (Math.abs(sumShifts) < reversalTolerance && (shiftTicks * lastShift < 0)) {
          return {
            allowed: false,
            outcome: 'OSCILLATION_DETECTED',
            reconciliation_required: true,
            reason: `Sign-reversing oscillation detected on clip "${clipId}": proposed shift (${shiftTicks} ticks) reverses prior shift (${lastShift} ticks) with sum |${sumShifts}| < tolerance (${reversalTolerance} ticks)`,
            details: {
              clipId,
              currentShift: shiftTicks,
              priorShift: lastShift,
              sumShifts,
              reversalTolerance
            }
          };
        }
      }

      // 1d. Cumulative shift cap check (ARC-28-18):
      let cumulativeAbsoluteShift = Math.abs(shiftTicks);
      for (const entry of clipHistory) {
        const priorShift = entry.forwardOp?.targetTick !== undefined && entry.priorProject
          ? Math.abs(entry.forwardOp.targetTick - (entry.priorProject.clips?.find(c => c.id === clipId)?.startTick || 0))
          : 0;
        cumulativeAbsoluteShift += priorShift;
      }

      if (cumulativeAbsoluteShift > maxCumulativeShift) {
        return {
          allowed: false,
          outcome: 'CUMULATIVE_SHIFT_CAP_EXCEEDED',
          reconciliation_required: true,
          reason: `Cumulative shift of ${cumulativeAbsoluteShift} ticks on clip "${clipId}" exceeds cycle limit of ${maxCumulativeShift} ticks`,
          details: { cumulativeAbsoluteShift, maxCumulativeShift }
        };
      }
    }

    // -------------------------------------------------------------
    // 2. True-Peak Attenuation Safeguards (PEAK_ATTENUATION)
    // -------------------------------------------------------------
    if (strategy === 'PEAK_ATTENUATION') {
      const gainReductionDb = proposal.parameters?.gain_reduction_db || 0;

      // Duplicate attenuation check
      if (clipHistory.length > 0) {
        const lastOp = clipHistory[clipHistory.length - 1];
        if (lastOp.gainReductionDb === gainReductionDb && gainReductionDb > 0) {
          return {
            allowed: false,
            outcome: 'DUPLICATE_REPAIR',
            reconciliation_required: true,
            reason: `Duplicate attenuation proposal: gain reduction of ${gainReductionDb} dB already applied to clip "${clipId}" in pass ${lastOp.pass}`,
            details: { clipId, gainReductionDb, previousPass: lastOp.pass }
          };
        }
      }

      // Cumulative attenuation cap check (ARC-28-18)
      let cumulativeAttenuationDb = gainReductionDb;
      for (const entry of clipHistory) {
        cumulativeAttenuationDb += (entry.gainReductionDb || 0);
      }

      if (cumulativeAttenuationDb > maxCumulativeAttenuation) {
        return {
          allowed: false,
          outcome: 'CUMULATIVE_ATTENUATION_CAP_EXCEEDED',
          reconciliation_required: true,
          reason: `Cumulative attenuation of ${cumulativeAttenuationDb.toFixed(2)} dB on clip "${clipId}" exceeds limit of ${maxCumulativeAttenuation} dB`,
          details: { cumulativeAttenuationDb, maxCumulativeAttenuation }
        };
      }
    }

    return {
      allowed: true,
      outcome: 'ALLOWED',
      reconciliation_required: false
    };
  }

  /**
   * Evaluates post-render and fresh QA audit evidence to measure defect improvement (ARC-28-20 & ARC-28-21).
   *
   * @param {object} params
   *   - pass: Current pass number
   *   - freshQa: Fresh QA report from current render
   *   - priorQa: QA report from previous pass (or initial render)
   *   - committedOperations: Array of operations executed in this pass
   * @returns {{
   *   converged: boolean,
   *   outcome: 'CONVERGED' | 'PROGRESS_ACHIEVED' | 'NO_PROGRESS' | 'QUALITY_REGRESSION',
   *   metrics: object,
   *   reason?: string
   * }}
   */
  static evaluatePassProgress(params = {}) {
    const freshQa = params.freshQa || {};
    const priorQa = params.priorQa || {};
    const freshChecks = freshQa.checks || [];
    const priorChecks = priorQa.checks || [];

    const activeDefects = freshChecks.filter(c => c.status === 'failed');

    // If zero failed checks, system has cleanly converged
    if (activeDefects.length === 0) {
      return {
        converged: true,
        outcome: 'CONVERGED',
        metrics: { activeDefectsCount: 0 }
      };
    }

    // Evaluate Synchronization Quality Metric (ARC-28-20)
    const freshSyncCheck = freshChecks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    const priorSyncCheck = priorChecks.find(c => c.id === 'CHK_EARSHOT_SYNC');

    if (freshSyncCheck && priorSyncCheck) {
      const freshOffsetMs = Math.abs(freshSyncCheck.measured_value?.max_offset_ms || 0);
      const priorOffsetMs = Math.abs(priorSyncCheck.measured_value?.max_offset_ms || 0);

      // Regression: offset worsened significantly
      if (freshOffsetMs > priorOffsetMs + 10.0) {
        return {
          converged: false,
          outcome: 'QUALITY_REGRESSION',
          metrics: { freshOffsetMs, priorOffsetMs },
          reason: `Synchronization offset regressed from ${priorOffsetMs.toFixed(1)}ms to ${freshOffsetMs.toFixed(1)}ms`
        };
      }

      // No progress: offset did not improve
      if (Math.abs(freshOffsetMs - priorOffsetMs) < 1.0 && freshOffsetMs > 25.0) {
        return {
          converged: false,
          outcome: 'NO_PROGRESS',
          metrics: { freshOffsetMs, priorOffsetMs },
          reason: `Synchronization offset failed to improve (${priorOffsetMs.toFixed(1)}ms -> ${freshOffsetMs.toFixed(1)}ms)`
        };
      }
    }

    // Evaluate True-Peak Quality Metric (ARC-28-20)
    const freshPeakCheck = freshChecks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
    const priorPeakCheck = priorChecks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');

    if (freshPeakCheck && priorPeakCheck) {
      const freshPeakDbtp = freshPeakCheck.measured_value?.true_peak_dbtp || 0;
      const priorPeakDbtp = priorPeakCheck.measured_value?.true_peak_dbtp || 0;

      if (freshPeakDbtp > priorPeakDbtp + 0.5) {
        return {
          converged: false,
          outcome: 'QUALITY_REGRESSION',
          metrics: { freshPeakDbtp, priorPeakDbtp },
          reason: `True-peak regressed from ${priorPeakDbtp.toFixed(2)} dBTP to ${freshPeakDbtp.toFixed(2)} dBTP`
        };
      }
    }

    return {
      converged: false,
      outcome: 'PROGRESS_ACHIEVED',
      metrics: { remainingDefectsCount: activeDefects.length }
    };
  }
}

module.exports = {
  RepairConvergenceGuard,
  DEFAULT_REVERSAL_TOLERANCE_TICKS,
  DEFAULT_MAX_CUMULATIVE_SHIFT_TICKS,
  DEFAULT_MAX_SINGLE_SHIFT_TICKS,
  DEFAULT_MAX_CUMULATIVE_ATTENUATION_DB
};
