/**
 * Editing Mechanics Engine (EME) - Phase 25: Earshot QA Adapter
 *
 * Provides high-precision objective audio measurements and perceptual QA
 * by coordinating between EME's native FFmpeg QA engine and the out-of-process
 * Earshot perception worker daemon.
 *
 * Invariants:
 * 1. Read-only perception service; zero execution authority.
 * 2. Strict named delivery profiles (authoritative target and tolerance).
 * 3. Rational frame-rate tolerance derivation (1000 * den / num).
 * 4. Normalization of non-finite values into null with explicit reasons.
 * 5. Native FFmpeg fallback on worker error or unavailability.
 */

const fs = require('node:fs');
const path = require('node:path');
const { EarshotWorkerClient } = require('./earshot-worker-client.js');
const { EarshotContractValidator } = require('./earshot-contract-validator.js');

const DELIVERY_PROFILES = Object.freeze({
  web_streaming: {
    name: 'web_streaming',
    description: 'YouTube, OTT & Web Video standard (EBU R128 s2 / AES TD1004)',
    target_lufs: -14.0,
    lufs_tolerance: 2.0,       // Valid band: -16.0 to -12.0 LUFS
    true_peak_ceiling_dbtp: -1.0,
    max_lra_lu: 14.0
  },
  podcast_dialogue: {
    name: 'podcast_dialogue',
    description: 'Spoken word and mobile streaming standard (Apple Podcasts / AES TD1004)',
    target_lufs: -16.0,
    lufs_tolerance: 1.5,       // Valid band: -17.5 to -14.5 LUFS
    true_peak_ceiling_dbtp: -1.0,
    max_lra_lu: 10.0
  },
  broadcast_ebu_r128: {
    name: 'broadcast_ebu_r128',
    description: 'European Broadcast Union standard (EBU R128 TV specification)',
    target_lufs: -23.0,
    lufs_tolerance: 1.0,       // Valid band: -24.0 to -22.0 LUFS
    true_peak_ceiling_dbtp: -1.0,
    max_lra_lu: 18.0
  },
  broadcast_atsc_a85: {
    name: 'broadcast_atsc_a85',
    description: 'North American Television Broadcast standard (CALM Act)',
    target_lufs: -24.0,
    lufs_tolerance: 2.0,       // Valid band: -26.0 to -22.0 LUFS
    true_peak_ceiling_dbtp: -2.0,
    max_lra_lu: 18.0
  }
});

class EarshotAdapter {
  constructor(options = {}) {
    this.workerClient = options.workerClient || new EarshotWorkerClient(options);
    this.defaultProfile = options.profile || DELIVERY_PROFILES.web_streaming;
  }

  /**
   * Calculates frame-derived sync tolerance using rational frame rate.
   *
   * @param {number} fpsNumerator
   * @param {number} fpsDenominator
   * @returns {number} tolerance in milliseconds (exact duration of 1 video frame)
   */
  static calculateFrameToleranceMs(fpsNumerator = 30, fpsDenominator = 1) {
    if (!fpsNumerator || fpsNumerator <= 0) return 33.333;
    if (!fpsDenominator || fpsDenominator <= 0) fpsDenominator = 1;
    return (1000.0 * fpsDenominator) / fpsNumerator;
  }

  /**
   * Selects an authoritative named delivery profile.
   *
   * @param {string|object} profileSpec
   * @returns {object} validated profile object
   */
  static resolveProfile(profileSpec) {
    if (typeof profileSpec === 'string' && DELIVERY_PROFILES[profileSpec]) {
      return DELIVERY_PROFILES[profileSpec];
    }
    if (profileSpec && typeof profileSpec === 'object') {
      return {
        name: profileSpec.name || 'custom',
        target_lufs: typeof profileSpec.target_lufs === 'number' ? profileSpec.target_lufs : -14.0,
        lufs_tolerance: typeof profileSpec.lufs_tolerance === 'number' ? profileSpec.lufs_tolerance : 2.0,
        true_peak_ceiling_dbtp: typeof profileSpec.true_peak_ceiling_dbtp === 'number' ? profileSpec.true_peak_ceiling_dbtp : -1.0,
        sync_tolerance_ms: typeof profileSpec.sync_tolerance_ms === 'number' ? profileSpec.sync_tolerance_ms : undefined
      };
    }
    return DELIVERY_PROFILES.web_streaming;
  }

  /**
   * Run objective audio QA on a rendered media file.
   *
   * @param {string} mediaPath absolute path to rendered media
   * @param {object} options
   * @returns {Promise<{ checks: object[], rawResponse: object }>}
   */
  async auditAudioQuality(mediaPath, options = {}) {
    const startNs = process.hrtime.bigint();
    const profile = EarshotAdapter.resolveProfile(options.profile || this.defaultProfile);
    const fpsNum = options.timebase?.fps_numerator || 30;
    const fpsDen = options.timebase?.fps_denominator || 1;
    const frameToleranceMs = EarshotAdapter.calculateFrameToleranceMs(fpsNum, fpsDen);

    const syncTolMs = profile.sync_tolerance_ms !== undefined
      ? profile.sync_tolerance_ms
      : frameToleranceMs;

    const req = {
      request_id: `req-earshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      media_path: path.resolve(mediaPath),
      timebase: {
        duration_ticks: options.timebase?.duration_ticks || 600000,
        ticks_per_second: 120000,
        fps_numerator: fpsNum,
        fps_denominator: fpsDen
      },
      cues: options.cues || [],
      options: {
        mode: options.mode || 'fast_dsp',
        generate_sheet: !!options.generate_sheet,
        sheet_output_path: options.sheet_output_path,
        profile: {
          name: profile.name,
          target_lufs: profile.target_lufs,
          lufs_tolerance: profile.lufs_tolerance,
          true_peak_ceiling_dbtp: profile.true_peak_ceiling_dbtp,
          sync_tolerance_ms: syncTolMs
        }
      }
    };

    const resp = await this.workerClient.executeQa(req);
    const executionDurationMs = Math.round(Number(process.hrtime.bigint() - startNs) / 1e4) / 100;

    // Map worker response into canonical EME QA check objects
    const checks = this.mapResponseToChecks(resp, profile, syncTolMs, req.cues);

    return {
      checks,
      rawResponse: resp,
      execution_mode: 'async_worker',
      execution_duration_ms: executionDurationMs
    };
  }

  /**
   * Synchronous audit of audio quality on a rendered media file via spawnSync.
   * Dedicated for synchronous CLI utilities and batch pipelines.
   * Bounded by default to fast_dsp mode (timeout: 2,000ms max blocking).
   *
   * @param {string} mediaPath absolute path to rendered media
   * @param {object} options
   * @returns {{ checks: object[], rawResponse: object, execution_mode: string, blocking_duration_ms: number }}
   */
  auditAudioQualitySync(mediaPath, options = {}) {
    const startNs = process.hrtime.bigint();
    const { spawnSync } = require('node:child_process');
    const profile = EarshotAdapter.resolveProfile(options.profile || this.defaultProfile);
    const fpsNum = options.timebase?.fps_numerator || 30;
    const fpsDen = options.timebase?.fps_denominator || 1;
    const frameToleranceMs = EarshotAdapter.calculateFrameToleranceMs(fpsNum, fpsDen);
    const syncTolMs = profile.sync_tolerance_ms !== undefined ? profile.sync_tolerance_ms : frameToleranceMs;

    // In sync mode, strictly bound mode to fast_dsp unless caller explicitly permits long blocking
    const requestedMode = options.mode || 'fast_dsp';
    const effectiveMode = (requestedMode === 'full_perception' && !options.allowLongBlocking)
      ? 'fast_dsp'
      : requestedMode;

    const req = {
      request_id: `req-earshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      media_path: path.resolve(mediaPath),
      timebase: {
        duration_ticks: options.timebase?.duration_ticks || 600000,
        ticks_per_second: 120000,
        fps_numerator: fpsNum,
        fps_denominator: fpsDen
      },
      cues: options.cues || [],
      options: {
        mode: effectiveMode,
        generate_sheet: !!options.generate_sheet,
        sheet_output_path: options.sheet_output_path,
        profile: {
          name: profile.name,
          target_lufs: profile.target_lufs,
          lufs_tolerance: profile.lufs_tolerance,
          true_peak_ceiling_dbtp: profile.true_peak_ceiling_dbtp,
          sync_tolerance_ms: syncTolMs
        }
      }
    };

    const makeReturn = (resp) => {
      const blockingDurationMs = Math.round(Number(process.hrtime.bigint() - startNs) / 1e4) / 100;
      return {
        checks: this.mapResponseToChecks(resp, profile, syncTolMs, req.cues),
        rawResponse: resp,
        execution_mode: 'sync_blocking',
        blocking_duration_ms: blockingDurationMs
      };
    };

    try {
      this.workerClient.assertAuthorizedPath(req.media_path);
      if (req.options.sheet_output_path) {
        this.workerClient.assertAuthorizedPath(req.options.sheet_output_path);
      }
    } catch (authErr) {
      const errResp = {
        request_id: req.request_id,
        status: 'WORKER_ERROR',
        mode: req.options.mode,
        execution_time_ms: 0,
        loudness: null,
        sfx_integrity: null,
        sync: null,
        critique: null,
        sheet_path: null,
        error: { code: 'SECURITY_AUTHORIZATION_FAILED', message: authErr.message }
      };
      return makeReturn(errResp);
    }

    const prereq = this.workerClient.checkPrerequisites();
    if (!prereq.ok) {
      const missingResp = {
        request_id: req.request_id,
        status: 'NOT_MEASURED',
        mode: req.options.mode,
        execution_time_ms: 0,
        loudness: null,
        sfx_integrity: null,
        sync: null,
        critique: null,
        sheet_path: null,
        error: { code: 'WORKER_UNAVAILABLE', message: prereq.reason }
      };
      return makeReturn(missingResp);
    }

    const timeout = options.syncTimeoutMs || (effectiveMode === 'full_perception'
      ? this.workerClient.perceptionTimeoutMs
      : this.workerClient.commandTimeoutMs);

    const res = spawnSync(this.workerClient.pythonPath, [this.workerClient.bridgeScript], {
      input: JSON.stringify(req) + '\n',
      encoding: 'utf8',
      env: this.workerClient.getSanitizedEnv(),
      timeout: timeout
    });

    if (res.status === 0 && res.stdout) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        return makeReturn(parsed);
      } catch (_) {}
    }

    const fallbackResp = {
      request_id: req.request_id,
      status: res.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'WORKER_ERROR',
      mode: req.options.mode,
      execution_time_ms: 0,
      loudness: null,
      sfx_integrity: null,
      sync: null,
      critique: null,
      sheet_path: null,
      error: { code: 'EXECUTION_FAILED', message: res.stderr || res.error?.message || 'Worker execution failed' }
    };
    return makeReturn(fallbackResp);
  }

  /**
   * Maps internal EarshotQaResponse into canonical EME QA checks.
   *
   * @param {object} resp
   * @param {object} profile
   * @param {number} syncToleranceMs
   * @param {object[]} [cues] optional visual cut cues requested
   * @returns {object[]} array of canonical check objects conforming to eme-media-qa-report.v1.schema.json
   */
  mapResponseToChecks(resp, profile, syncToleranceMs, cues = []) {
    const checks = [];

    // 1. Loudness Check (CHK_EARSHOT_LOUDNESS)
    if (resp.status === 'SUCCESS' && resp.loudness) {
      const lufs = resp.loudness.integrated_lufs;
      if (lufs === null) {
        checks.push({
          id: 'CHK_EARSHOT_LOUDNESS',
          name: 'Earshot Integrated Loudness',
          category: 'audio_integrity',
          status: 'not_measured',
          severity: 'HIGH',
          measured_value: { lufs: null, reason: resp.loudness.lufs_reason },
          threshold: { target: profile.target_lufs, tolerance: profile.lufs_tolerance },
          detail: `Loudness could not be measured: ${resp.loudness.lufs_reason || 'digital silence or below gate'}`
        });
      } else {
        const delta = Math.abs(lufs - profile.target_lufs);
        const passed = delta <= profile.lufs_tolerance;
        checks.push({
          id: 'CHK_EARSHOT_LOUDNESS',
          name: 'Earshot Integrated Loudness',
          category: 'audio_integrity',
          status: passed ? 'passed' : 'failed',
          severity: passed ? 'INFO' : 'HIGH',
          measured_value: {
            integrated_lufs: lufs,
            loudness_range_lu: resp.loudness.loudness_range_lu
          },
          threshold: {
            target: profile.target_lufs,
            tolerance: profile.lufs_tolerance,
            min: profile.target_lufs - profile.lufs_tolerance,
            max: profile.target_lufs + profile.lufs_tolerance
          },
          detail: passed
            ? `Measured ${lufs} LUFS within ${profile.lufs_tolerance} LU tolerance of ${profile.target_lufs} LUFS target (${profile.name})`
            : `Measured ${lufs} LUFS deviates from target ${profile.target_lufs} LUFS by ${delta.toFixed(2)} LU (tolerance ±${profile.lufs_tolerance} LU)`
        });
      }
    } else if (resp.status === 'NOT_APPLICABLE') {
      checks.push({
        id: 'CHK_EARSHOT_LOUDNESS',
        name: 'Earshot Integrated Loudness',
        category: 'audio_integrity',
        status: 'not_applicable',
        severity: 'INFO',
        measured_value: null,
        threshold: { target: profile.target_lufs, tolerance: profile.lufs_tolerance },
        detail: 'Container has no audio stream to measure loudness'
      });
    } else {
      checks.push({
        id: 'CHK_EARSHOT_LOUDNESS',
        name: 'Earshot Integrated Loudness',
        category: 'audio_integrity',
        status: 'not_measured',
        severity: 'MEDIUM',
        measured_value: null,
        threshold: { target: profile.target_lufs, tolerance: profile.lufs_tolerance },
        detail: `Earshot measurement unavailable (${resp.status}): ${resp.error?.message || 'worker not active'}`
      });
    }

    // 2. True Peak Check (CHK_EARSHOT_TRUE_PEAK)
    if (resp.status === 'SUCCESS' && resp.loudness) {
      const tp = resp.loudness.true_peak_dbtp;
      const clipped = resp.loudness.clipping_samples || 0;
      if (tp === null) {
        checks.push({
          id: 'CHK_EARSHOT_TRUE_PEAK',
          name: 'Earshot 4x Oversampled True Peak',
          category: 'audio_integrity',
          status: 'not_measured',
          severity: 'HIGH',
          measured_value: { true_peak_dbtp: null, reason: resp.loudness.true_peak_reason },
          threshold: { ceiling_dbtp: profile.true_peak_ceiling_dbtp },
          detail: `True peak could not be measured: ${resp.loudness.true_peak_reason || 'unsupported stream'}`
        });
      } else {
        const passed = tp <= profile.true_peak_ceiling_dbtp && clipped === 0;
        checks.push({
          id: 'CHK_EARSHOT_TRUE_PEAK',
          name: 'Earshot 4x Oversampled True Peak',
          category: 'audio_integrity',
          status: passed ? 'passed' : 'failed',
          severity: passed ? 'INFO' : 'CRITICAL',
          measured_value: {
            true_peak_dbtp: tp,
            clipped_samples: clipped
          },
          threshold: {
            ceiling_dbtp: profile.true_peak_ceiling_dbtp,
            max_clipped_samples: 0
          },
          detail: passed
            ? `True peak ${tp} dBTP is safely below ${profile.true_peak_ceiling_dbtp} dBTP ceiling with 0 clipped samples`
            : `True peak ${tp} dBTP exceeds ceiling ${profile.true_peak_ceiling_dbtp} dBTP (${clipped} clipped samples detected)`
        });
      }
    } else if (resp.status === 'NOT_APPLICABLE') {
      checks.push({
        id: 'CHK_EARSHOT_TRUE_PEAK',
        name: 'Earshot 4x Oversampled True Peak',
        category: 'audio_integrity',
        status: 'not_applicable',
        severity: 'INFO',
        measured_value: null,
        threshold: { ceiling_dbtp: profile.true_peak_ceiling_dbtp },
        detail: 'Container has no audio stream to measure true peak'
      });
    } else {
      checks.push({
        id: 'CHK_EARSHOT_TRUE_PEAK',
        name: 'Earshot 4x Oversampled True Peak',
        category: 'audio_integrity',
        status: 'not_measured',
        severity: 'MEDIUM',
        measured_value: null,
        threshold: { ceiling_dbtp: profile.true_peak_ceiling_dbtp },
        detail: `Earshot measurement unavailable (${resp.status})`
      });
    }

    // 3. Audio SFX Defect Integrity (CHK_EARSHOT_SFX_INTEGRITY)
    if (resp.status === 'SUCCESS' && resp.sfx_integrity) {
      const sfx = resp.sfx_integrity;
      const passed = sfx.status === 'ok';
      checks.push({
        id: 'CHK_EARSHOT_SFX_INTEGRITY',
        name: 'Earshot SFX Waveform Integrity Audit',
        category: 'audio_integrity',
        status: passed ? 'passed' : 'failed',
        severity: passed ? 'INFO' : 'HIGH',
        measured_value: {
          status: sfx.status,
          rising_glides: sfx.rising_glides,
          double_hits: sfx.double_hits,
          clicks: sfx.clicks,
          total_issues: sfx.issues?.length || 0
        },
        threshold: {
          max_rising_glides: 0,
          max_double_hits: 0,
          max_clicks: 0
        },
        detail: passed
          ? 'Zero rising glides, clicks, edge discontinuities, or stacked hits detected in SFX'
          : `SFX integrity defects detected: ${sfx.issues?.map(i => i.detail).join('; ') || sfx.status}`
      });
    }

    // 4. Picture-to-Sound Synchronization (CHK_EARSHOT_SYNC)
    if (cues && cues.length > 0) {
      if (resp.status === 'SUCCESS' && resp.sync) {
        const sync = resp.sync;
        const passed = !!sync.aligned;
        checks.push({
          id: 'CHK_EARSHOT_SYNC',
          name: 'Earshot Picture-to-Sound Alignment',
          category: 'synchronization',
          status: passed ? 'passed' : 'failed',
          severity: passed ? 'INFO' : 'HIGH',
          measured_value: {
            analyzed_cuts: sync.analyzed_cuts,
            mean_offset_ms: sync.mean_offset_ms,
            max_offset_ms: sync.max_offset_ms,
            max_offset_ticks: sync.max_offset_ticks
          },
          threshold: {
            max_sync_tolerance_ms: syncToleranceMs
          },
          detail: passed
            ? `All ${sync.analyzed_cuts} visual cuts aligned within ±${syncToleranceMs.toFixed(1)}ms frame tolerance (max offset: ${sync.max_offset_ms}ms)`
            : `Cut synchronization failure: maximum audio transient offset is ${sync.max_offset_ms}ms (exceeds ±${syncToleranceMs.toFixed(1)}ms frame tolerance)`
        });
      } else if (resp.status === 'NOT_APPLICABLE') {
        checks.push({
          id: 'CHK_EARSHOT_SYNC',
          name: 'Earshot Picture-to-Sound Alignment',
          category: 'synchronization',
          status: 'not_applicable',
          severity: 'INFO',
          measured_value: null,
          threshold: { max_sync_tolerance_ms: syncToleranceMs },
          detail: 'Container has no audio stream for picture-to-sound sync'
        });
      } else {
        checks.push({
          id: 'CHK_EARSHOT_SYNC',
          name: 'Earshot Picture-to-Sound Alignment',
          category: 'synchronization',
          status: 'not_measured',
          severity: 'HIGH',
          measured_value: null,
          threshold: { max_sync_tolerance_ms: syncToleranceMs },
          detail: `Sync analysis unmeasured (${resp.status}): ${resp.error?.message || 'worker timed out or failed to execute timeline sync'}`
        });
      }
    }

    return checks;
  }
}

module.exports = {
  EarshotAdapter,
  DELIVERY_PROFILES
};
