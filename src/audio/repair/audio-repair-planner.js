/**
 * Editing Mechanics Engine (EME) - Phase 27: Audio Repair Finding Ingestion & Planner
 *
 * Implements Stage 27.1:
 * - Consumes structured Earshot QA findings from rendered media.
 * - Binds source evidence (project revision, media checksum, clip/track IDs).
 * - Enforces single unambiguous synchronization convention (ARC-27-04):
 *     delta_t = t_sound - t_cut
 *     delta_ticks = -round(delta_t * 120,000)
 * - Safe bounds checking: fails on negative start (t_start < 0) without silent clamping.
 * - Bounded retiming limit (default max +/- 120,000 ticks = 1000ms).
 * - Collision and track-lock detection.
 * - True-peak attenuation calculation with safety headroom.
 * - Rejection of stale revisions, malformed evidence, and non-deterministic findings (ARC-27-05).
 */

const fs = require('node:fs');
const path = require('node:path');
const { MediaTime, TICKS_PER_SECOND } = require('../../engine/time.js');

const DEFAULT_MAX_SHIFT_TICKS = 120000; // 1.0 second max shift (120,000 ticks)
const DEFAULT_HEADROOM_MARGIN_DB = 0.5; // 0.5 dB safety margin for peak attenuation

class AudioRepairPlanner {
  /**
   * Ingests canonical EME QA check objects and raw worker responses into structured findings.
   *
   * @param {object[]} checks Array of checks from EarshotAdapter
   * @param {object} rawResponse Raw worker JSON response
   * @param {object} context Execution context { project, mediaPath, mediaSha256, targetClipId, targetTrackId }
   * @returns {object[]} Array of structured AudioRepairFinding objects
   */
  static ingestQAChecks(checks = [], rawResponse = {}, context = {}) {
    const findings = [];
    const project = context.project || {};
    const projectRevision = typeof project.revision === 'number' ? project.revision : 0;
    const mediaPath = context.mediaPath || rawResponse.media_path || '';
    const mediaSha256 = context.mediaSha256 || null;

    if (!Array.isArray(checks)) return findings;

    // 1. Ingest Desync Findings (CHK_EARSHOT_SYNC)
    const syncCheck = checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
    if (syncCheck && syncCheck.status === 'failed') {
      const syncData = rawResponse.sync || {};
      const items = Array.isArray(syncData.details)
        ? syncData.details
        : (Array.isArray(syncData.items) ? syncData.items : []);

      // If per-item cuts exist, extract each failed cut
      if (items.length > 0) {
        items.forEach((item, idx) => {
          if (item && Math.abs(item.offset_ms) > 0) {
            const cutSec = item.cut_seconds;
            const soundOnsetSec = item.sound_onset_seconds;
            const offsetMs = item.offset_ms;
            const offsetTicks = item.offset_ticks !== undefined
              ? item.offset_ticks
              : Math.round((offsetMs / 1000) * TICKS_PER_SECOND);

            // Match clip in project if not explicitly supplied
            const matchedClip = this._findTargetClip(project, cutSec, context.targetClipId);
            const clipId = matchedClip ? matchedClip.id : (context.targetClipId || 'unknown-clip');
            const trackId = matchedClip ? matchedClip.trackId : (context.targetTrackId || 'unknown-track');

            findings.push({
              id: `chk-repair-sync-${Date.now()}-${idx}`,
              category: 'synchronization',
              type: 'sync_offset',
              source_evidence: {
                project_revision: projectRevision,
                media_path: mediaPath,
                media_sha256: mediaSha256,
                clip_id: clipId,
                track_id: trackId,
                cut_time_seconds: cutSec,
                sound_onset_seconds: soundOnsetSec
              },
              measured: {
                offset_ms: offsetMs,
                offset_ticks: offsetTicks,
                confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
                true_peak_dbtp: null,
                ceiling_dbtp: null,
                integrated_lufs: null
              },
              status: 'ACTIVE'
            });
          }
        });
      } else if (syncCheck.measured_value && syncCheck.measured_value.max_offset_ms !== undefined) {
        // Fallback to top-level aggregate measurement
        const maxOffsetMs = syncCheck.measured_value.max_offset_ms;
        const maxOffsetTicks = syncCheck.measured_value.max_offset_ticks !== undefined
          ? syncCheck.measured_value.max_offset_ticks
          : Math.round((maxOffsetMs / 1000) * TICKS_PER_SECOND);

        const matchedClip = this._findTargetClip(project, null, context.targetClipId);
        const clipId = matchedClip ? matchedClip.id : (context.targetClipId || 'unknown-clip');
        const trackId = matchedClip ? matchedClip.trackId : (context.targetTrackId || 'unknown-track');

        findings.push({
          id: `chk-repair-sync-${Date.now()}-0`,
          category: 'synchronization',
          type: 'sync_offset',
          source_evidence: {
            project_revision: projectRevision,
            media_path: mediaPath,
            media_sha256: mediaSha256,
            clip_id: clipId,
            track_id: trackId,
            cut_time_seconds: null,
            sound_onset_seconds: null
          },
          measured: {
            offset_ms: maxOffsetMs,
            offset_ticks: maxOffsetTicks,
            confidence: 1.0,
            true_peak_dbtp: null,
            ceiling_dbtp: null,
            integrated_lufs: null
          },
          status: 'ACTIVE'
        });
      }
    }

    // 2. Ingest True-Peak Overflow Findings (CHK_EARSHOT_TRUE_PEAK)
    const peakCheck = checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
    if (peakCheck && peakCheck.status === 'failed') {
      const measuredPeak = peakCheck.measured_value?.true_peak_dbtp ?? rawResponse.loudness?.true_peak_dbtp;
      const ceiling = peakCheck.threshold?.ceiling_dbtp ?? -1.0;

      const matchedClip = this._findTargetClip(project, null, context.targetClipId);
      const clipId = matchedClip ? matchedClip.id : (context.targetClipId || 'master-audio');
      const trackId = matchedClip ? matchedClip.trackId : (context.targetTrackId || 'master-track');

      findings.push({
        id: `chk-repair-peak-${Date.now()}-0`,
        category: 'audio_integrity',
        type: 'true_peak_overflow',
        source_evidence: {
          project_revision: projectRevision,
          media_path: mediaPath,
          media_sha256: mediaSha256,
          clip_id: clipId,
          track_id: trackId,
          cut_time_seconds: null,
          sound_onset_seconds: null
        },
        measured: {
          offset_ms: null,
          offset_ticks: null,
          confidence: 1.0,
          true_peak_dbtp: measuredPeak,
          ceiling_dbtp: ceiling,
          integrated_lufs: rawResponse.loudness?.integrated_lufs ?? null
        },
        status: 'ACTIVE'
      });
    }

    // 3. Ingest SFX Defect Integrity Findings (CHK_EARSHOT_SFX_INTEGRITY)
    const sfxCheck = checks.find(c => c.id === 'CHK_EARSHOT_SFX_INTEGRITY');
    if (sfxCheck && sfxCheck.status === 'failed') {
      findings.push({
        id: `chk-repair-sfx-${Date.now()}-0`,
        category: 'audio_integrity',
        type: 'sfx_defect',
        source_evidence: {
          project_revision: projectRevision,
          media_path: mediaPath,
          media_sha256: mediaSha256,
          clip_id: context.targetClipId || 'unknown-clip',
          track_id: context.targetTrackId || 'unknown-track',
          cut_time_seconds: null,
          sound_onset_seconds: null
        },
        measured: {
          offset_ms: null,
          offset_ticks: null,
          confidence: 1.0,
          true_peak_dbtp: null,
          ceiling_dbtp: null,
          integrated_lufs: null
        },
        status: 'ACTIVE'
      });
    }

    return findings;
  }

  /**
   * Plans a structured, bounded repair proposal for a given finding.
   *
   * @param {object} finding Structured AudioRepairFinding
   * @param {object} project Current canonical project state
   * @param {object} options Planning options { maxShiftTicks, headroomMarginDb, allowCrossTrack }
   * @returns {object} AudioRepairProposal conforming to schema
   */
  static planRepair(finding, project, options = {}) {
    if (!finding || typeof finding !== 'object') {
      throw new Error('planRepair requires a valid finding object');
    }
    if (!project || typeof project !== 'object') {
      throw new Error('planRepair requires a valid project object');
    }

    const proposalId = `prop-repair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const maxShiftTicks = options.maxShiftTicks || DEFAULT_MAX_SHIFT_TICKS;
    const currentRevision = project.revision !== undefined ? project.revision : 0;
    const evidence = finding.source_evidence || {};

    // 1. Revision Freshness Guard (ARC-27-03)
    if (evidence.project_revision !== undefined && evidence.project_revision !== currentRevision) {
      return {
        proposal_id: proposalId,
        finding_id: finding.id,
        strategy: 'ADVISORY_NOOP',
        target_clip_id: evidence.clip_id || 'none',
        target_track_id: evidence.track_id || 'none',
        parameters: {},
        preconditions: {
          expected_base_revision: currentRevision,
          current_start_tick: 0,
          bounds_valid: false,
          collision_free: false,
          track_unlocked: false
        },
        status: 'REJECTED',
        rejection_reason: `REJECTION_STALE_REVISION: finding derived from revision ${evidence.project_revision}, but current project revision is ${currentRevision}`
      };
    }

    // 2. Locate Target Clip
    const clipId = evidence.clip_id;
    const clip = (project.clips || []).find(c => c.id === clipId);
    if (!clip) {
      return {
        proposal_id: proposalId,
        finding_id: finding.id,
        strategy: 'ADVISORY_NOOP',
        target_clip_id: clipId || 'unknown',
        target_track_id: evidence.track_id || 'unknown',
        parameters: {},
        preconditions: {
          expected_base_revision: currentRevision,
          current_start_tick: 0,
          bounds_valid: false,
          collision_free: false,
          track_unlocked: false
        },
        status: 'REJECTED',
        rejection_reason: `REJECTION_CLIP_NOT_FOUND: target clip "${clipId}" does not exist in project`
      };
    }

    // 3. Track Lock Guard (ARC-27-04)
    const track = (project.tracks || []).find(t => t.id === clip.trackId);
    if (track && track.locked && !options.deferTrackLockCheck) {
      return {
        proposal_id: proposalId,
        finding_id: finding.id,
        strategy: 'ADVISORY_NOOP',
        target_clip_id: clip.id,
        target_track_id: clip.trackId,
        parameters: {},
        preconditions: {
          expected_base_revision: currentRevision,
          current_start_tick: clip.startTick,
          bounds_valid: false,
          collision_free: false,
          track_unlocked: false
        },
        status: 'REJECTED',
        rejection_reason: `REJECTION_TRACK_LOCKED: target track "${clip.trackId}" is locked`
      };
    }

    // 4. Handle Synchronization Retiming (SYNC_RETIME)
    if (finding.type === 'sync_offset') {
      const measured = finding.measured || {};
      const offsetMs = measured.offset_ms;
      const offsetTicks = measured.offset_ticks !== null && measured.offset_ticks !== undefined
        ? measured.offset_ticks
        : (offsetMs !== null && offsetMs !== undefined ? Math.round((offsetMs / 1000) * TICKS_PER_SECOND) : null);

      if (offsetTicks === null || isNaN(offsetTicks)) {
        return {
          proposal_id: proposalId,
          finding_id: finding.id,
          strategy: 'ADVISORY_NOOP',
          target_clip_id: clip.id,
          target_track_id: clip.trackId,
          parameters: {},
          preconditions: {
            expected_base_revision: currentRevision,
            current_start_tick: clip.startTick,
            bounds_valid: false
          },
          status: 'REJECTED',
          rejection_reason: 'REJECTION_MISSING_OFFSET: finding contains no valid offset measurement'
        };
      }

      // ARC-27-04 Sign Convention:
      // delta_t = t_sound - t_cut
      // delta_ticks = -round(delta_t * 120,000)
      // Positive offset (sound late) -> shift_ticks is negative
      const shiftTicks = -offsetTicks;
      const currentStartTick = clip.startTick;
      const targetStartTick = currentStartTick + shiftTicks;

      // Safe Bounds Failure on Negative Start (ARC-27-04 - No silent clamping)
      if (targetStartTick < 0) {
        return {
          proposal_id: proposalId,
          finding_id: finding.id,
          strategy: 'SYNC_RETIME',
          target_clip_id: clip.id,
          target_track_id: clip.trackId,
          parameters: {
            shift_ticks: shiftTicks,
            target_start_tick: targetStartTick
          },
          preconditions: {
            expected_base_revision: currentRevision,
            current_start_tick: currentStartTick,
            bounds_valid: false,
            collision_free: false,
            track_unlocked: true
          },
          status: 'REJECTED',
          rejection_reason: `REJECTION_NEGATIVE_START_BOUNDS: calculated start tick ${targetStartTick} is less than 0 (shift: ${shiftTicks} ticks)`
        };
      }

      // Max Adjustment Limit Guard (ARC-27-04)
      if (Math.abs(shiftTicks) > maxShiftTicks) {
        return {
          proposal_id: proposalId,
          finding_id: finding.id,
          strategy: 'SYNC_RETIME',
          target_clip_id: clip.id,
          target_track_id: clip.trackId,
          parameters: {
            shift_ticks: shiftTicks,
            target_start_tick: targetStartTick
          },
          preconditions: {
            expected_base_revision: currentRevision,
            current_start_tick: currentStartTick,
            bounds_valid: false,
            collision_free: false,
            track_unlocked: true
          },
          status: 'REJECTED',
          rejection_reason: `REJECTION_EXCEEDS_MAX_RETIMING_LIMIT: absolute shift ${Math.abs(shiftTicks)} ticks exceeds limit of ${maxShiftTicks} ticks`
        };
      }

      // Collision Detection on Destination Track
      const targetTrackId = clip.trackId;
      let hasCollision = false;
      let collidingClipId = null;
      for (const other of project.clips || []) {
        if (other.id !== clip.id && other.trackId === targetTrackId) {
          if (MediaTime.intervalsOverlap(targetStartTick, clip.durationTicks, other.startTick, other.durationTicks)) {
            hasCollision = true;
            collidingClipId = other.id;
            break;
          }
        }
      }

      if (hasCollision) {
        if (!options.deferCollisionCheck) {
          return {
            proposal_id: proposalId,
            finding_id: finding.id,
            strategy: 'SYNC_RETIME',
            target_clip_id: clip.id,
            target_track_id: targetTrackId,
            parameters: {
              shift_ticks: shiftTicks,
              target_start_tick: targetStartTick
            },
            preconditions: {
              expected_base_revision: currentRevision,
              current_start_tick: currentStartTick,
              bounds_valid: true,
              collision_free: false,
              track_unlocked: true
            },
            status: 'REJECTED',
            rejection_reason: `REJECTION_TRACK_COLLISION: shifted clip [${targetStartTick}, ${targetStartTick + clip.durationTicks}) collides with clip "${collidingClipId}" on track "${targetTrackId}"`
          };
        }
      }

      // All Preconditions Passed
      return {
        proposal_id: proposalId,
        finding_id: finding.id,
        strategy: 'SYNC_RETIME',
        target_clip_id: clip.id,
        target_track_id: targetTrackId,
        parameters: {
          shift_ticks: shiftTicks,
          target_start_tick: targetStartTick
        },
        preconditions: {
          expected_base_revision: currentRevision,
          current_start_tick: currentStartTick,
          bounds_valid: true,
          collision_free: true,
          track_unlocked: true
        },
        status: 'PLANNED',
        rejection_reason: null
      };
    }

    // 5. Handle True-Peak Attenuation (PEAK_ATTENUATION)
    if (finding.type === 'true_peak_overflow') {
      const measuredPeak = finding.measured?.true_peak_dbtp;
      const ceiling = finding.measured?.ceiling_dbtp !== undefined ? finding.measured.ceiling_dbtp : -1.0;

      if (measuredPeak === null || measuredPeak === undefined || measuredPeak <= ceiling) {
        return {
          proposal_id: proposalId,
          finding_id: finding.id,
          strategy: 'ADVISORY_NOOP',
          target_clip_id: clip.id,
          target_track_id: clip.trackId,
          parameters: {},
          preconditions: {
            expected_base_revision: currentRevision,
            current_start_tick: clip.startTick,
            bounds_valid: false
          },
          status: 'REJECTED',
          rejection_reason: `REJECTION_NO_OVERFLOW: measured true peak ${measuredPeak} dBTP is within ceiling ${ceiling} dBTP`
        };
      }

      const excessDb = measuredPeak - ceiling;
      const marginDb = options.headroomMarginDb !== undefined ? options.headroomMarginDb : DEFAULT_HEADROOM_MARGIN_DB;
      const totalReductionDb = Math.round((excessDb + marginDb) * 100) / 100;

      // Linear gain factor = 10^(-reduction / 20)
      const currentVolume = clip.audio?.volume !== undefined ? clip.audio.volume : 1.0;
      const attenuationFactor = Math.pow(10, -totalReductionDb / 20.0);
      const targetLinearVolume = Math.max(0.01, Math.min(2.0, Math.round(currentVolume * attenuationFactor * 1000) / 1000));

      return {
        proposal_id: proposalId,
        finding_id: finding.id,
        strategy: 'PEAK_ATTENUATION',
        target_clip_id: clip.id,
        target_track_id: clip.trackId,
        parameters: {
          gain_reduction_db: totalReductionDb,
          target_linear_volume: targetLinearVolume,
          volume_keyframes: [
            { offsetTick: 0, volume: targetLinearVolume },
            { offsetTick: clip.durationTicks, volume: targetLinearVolume }
          ]
        },
        preconditions: {
          expected_base_revision: currentRevision,
          current_start_tick: clip.startTick,
          bounds_valid: true,
          collision_free: true,
          track_unlocked: true
        },
        status: 'PLANNED',
        rejection_reason: null
      };
    }

    // 6. Handle Non-Deterministic / Indeterminate Findings (ARC-27-05)
    return {
      proposal_id: proposalId,
      finding_id: finding.id,
      strategy: 'ADVISORY_NOOP',
      target_clip_id: clip.id,
      target_track_id: clip.trackId,
      parameters: {},
      preconditions: {
        expected_base_revision: currentRevision,
        current_start_tick: clip.startTick,
        bounds_valid: false
      },
      status: 'REJECTED',
      rejection_reason: `REJECTION_NO_DETERMINISTIC_REMEDY: finding type "${finding.type}" has no automated deterministic repair strategy`
    };
  }

  /**
   * Helper to match an audio clip in the project associated with a visual cut time.
   *
   * @private
   */
  static _findTargetClip(project, cutSec, targetClipId) {
    const clips = project.clips || [];

    // If explicit ID requested and exists
    if (targetClipId) {
      const explicit = clips.find(c => c.id === targetClipId);
      if (explicit) return explicit;
    }

    // Audio clips sorted by startTick
    const audioClips = clips.filter(c => c.type === 'audio');
    if (audioClips.length === 0) return null;

    if (cutSec === null || cutSec === undefined) {
      return audioClips[0];
    }

    const cutTick = Math.round(cutSec * TICKS_PER_SECOND);
    // Find audio clip closest to or spanning the cut
    let bestClip = audioClips[0];
    let minDistance = Infinity;

    for (const c of audioClips) {
      // Distance from clip start to cut
      const dist = Math.abs(c.startTick - cutTick);
      if (dist < minDistance) {
        minDistance = dist;
        bestClip = c;
      }
    }

    return bestClip;
  }
}

module.exports = {
  AudioRepairPlanner,
  DEFAULT_MAX_SHIFT_TICKS,
  DEFAULT_HEADROOM_MARGIN_DB
};
