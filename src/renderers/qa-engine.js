/**
 * Automated Visual & Audio Quality Assurance (VQA) Engine
 *
 * Implements Comprehensive QA Inspection:
 * - Algorithmic layout / canvas boundary clipping detection (static & animated keyframes)
 * - Inter-clip cut continuity & single-frame blank flash detection
 * - Asset presence & integrity verification
 * - Stacking order (zIndex) and collision verification
 * - Video container dimensions & stream conformance
 * - Audio signal integrity: PCM hard-clipping, true-peak ceiling, and dropout detection
 * - Aggregate QualityScore (0-100)
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MediaTime } = require('../engine/time.js');
const { EnvironmentResolver } = require('../engine/environment.js');

class QualityAssuranceEngine {
  static auditFinalMedia(project, file) { return require('./final-media-qa.js').auditFinalMedia(project, file); }

  static inspectProject(project, renderedMp4Path = null, options = {}) {
    return this.auditQuality(project, renderedMp4Path, options);
  }

  /**
   * Run full Quality Assurance audit on project and rendered media.
   *
   * @param {Object} project Canonical EME project
   * @param {string|null} renderedMp4Path Path to rendered MP4 video
   * @param {Object} options Configuration options
   * @param {number} options.truePeakCeiling Target ceiling in dBTP (default: -1.0)
   * @param {number} options.clippingThreshold Maximum permitted clipped sample count (default: 50)
   * @returns {Object} QA report { score, checks, warnings, passed }
   */
  static auditQuality(project, renderedMp4Path = null, options = {}) {
    const report = {
      score: 100,
      checks: [],
      warnings: [],
      passed: true
    };

    const truePeakCeiling = options.truePeakCeiling !== undefined
      ? options.truePeakCeiling
      : (project.deliveryProfile && project.deliveryProfile.truePeakCeiling !== undefined
          ? project.deliveryProfile.truePeakCeiling
          : null);
    const clippingThreshold = options.clippingThreshold !== undefined ? options.clippingThreshold : 50;

    // 1. Check canvas and timebase determinism
    const durationSec = MediaTime.ticksToSeconds(project.timebase.durationTicks);
    report.checks.push({
      name: 'Deterministic Timebase Check',
      passed: project.timebase.ticksPerSecond === 120000 && project.timebase.durationTicks > 0,
      detail: `Duration: ${durationSec}s (${project.timebase.durationTicks} ticks)`
    });

    // 2. Asset Integrity Check
    let assetsOk = true;
    for (const asset of project.assets || []) {
      const assetPath = path.resolve(asset.src);
      const exists = fs.existsSync(assetPath);
      if (!exists) {
        assetsOk = false;
        report.score -= 20;
        report.warnings.push(`Missing asset file: ${asset.src} (id: ${asset.id})`);
      }
    }
    report.checks.push({
      name: 'Asset Existence & Provenance',
      passed: assetsOk,
      detail: `${(project.assets || []).length} assets checked`
    });

    // 3. Static Typography & Bounding Box Clipping Check
    let staticTypographyOk = true;
    for (const clip of project.clips || []) {
      if (clip.type === 'text') {
        const text = (clip.typography && clip.typography.text) || '';
        // Verify fontAssetId references a declared asset
        if (clip.typography && clip.typography.fontAssetId) {
          const fontDeclared = (project.assets || []).some(a => a.id === clip.typography.fontAssetId);
          if (!fontDeclared) {
            staticTypographyOk = false;
            report.score -= 15;
            report.warnings.push(`Text clip "${clip.id}" references undeclared fontAssetId "${clip.typography.fontAssetId}"`);
          }
        }

        const fontSize = (clip.typography && clip.typography.fontSize) || 32;
        const transform = clip.transform || {};
        const x = transform.x || 0;
        const y = transform.y || 0;

        // Approximate text bounds considering anchor alignment (anchorX = 0.5 centers text at x)
        const approxCharWidth = fontSize * 0.44;
        const approxTextWidth = text.length * approxCharWidth;
        const anchorX = transform.anchorX !== undefined ? transform.anchorX : (clip.typography && clip.typography.textAlign === 'center' ? 0.5 : 0.0);
        const anchorY = transform.anchorY !== undefined ? transform.anchorY : 0.5;
        const leftEdge = x - (approxTextWidth * anchorX);
        const rightEdge = leftEdge + approxTextWidth;
        const topEdge = y - (fontSize * anchorY);
        const bottomEdge = topEdge + fontSize;

        const isOutsideCanvasX = (rightEdge > project.canvas.width + 10) || (leftEdge < -10);
        const isOutsideCanvasY = (bottomEdge > project.canvas.height + 10) || (topEdge < -10);

        if (isOutsideCanvasX || isOutsideCanvasY) {
          staticTypographyOk = false;
          report.score -= 10;
          report.warnings.push(`Possible text clipping on clip "${clip.id}": "${text}" placed at (${x}, ${y}) on canvas ${project.canvas.width}x${project.canvas.height}`);
        }
      }
    }
    report.checks.push({
      name: 'Layout & Safe Margins Inspection',
      passed: staticTypographyOk,
      detail: staticTypographyOk ? 'All text clips within safe canvas boundaries' : 'Clipping or undeclared font detected'
    });

    // 4. Animated Typography & Keyframe Bounds Inspection (D4)
    let animatedBoundsOk = true;
    const animations = project.animations || [];
    for (const clip of project.clips || []) {
      if (clip.type === 'text') {
        const text = (clip.typography && clip.typography.text) || '';
        const fontSize = (clip.typography && clip.typography.fontSize) || 32;
        const transform = clip.transform || {};
        const baseX = transform.x || 0;
        const baseY = transform.y || 0;
        const approxCharWidth = fontSize * 0.44;
        const approxTextWidth = text.length * approxCharWidth;
        const anchorX = transform.anchorX !== undefined ? transform.anchorX : (clip.typography && clip.typography.textAlign === 'center' ? 0.5 : 0.0);

        const clipAnims = animations.filter(a => a.clipId === clip.id);
        for (const anim of clipAnims) {
          const isX = anim.property === 'transform.x' || anim.property === 'x';
          const isY = anim.property === 'transform.y' || anim.property === 'y';
          if (isX || isY) {
            for (const kf of anim.keyframes || []) {
              const val = typeof kf.value === 'number' ? kf.value : parseFloat(kf.value);
              if (isNaN(val)) continue;

              if (isX) {
                const kfX = val;
                const leftEdge = kfX - (approxTextWidth * anchorX);
                const rightEdge = leftEdge + approxTextWidth;
                if (rightEdge > project.canvas.width + 50 || leftEdge < -50) {
                  animatedBoundsOk = false;
                  report.score -= 15;
                  report.warnings.push(`Animated text clipping on clip "${clip.id}": keyframe at tick ${kf.offsetTick} positions text to x=${kfX} (canvas: 0-${project.canvas.width})`);
                }
              }
              if (isY) {
                const kfY = val;
                if (kfY > project.canvas.height + 50 || kfY < -50) {
                  animatedBoundsOk = false;
                  report.score -= 15;
                  report.warnings.push(`Animated text clipping on clip "${clip.id}": keyframe at tick ${kf.offsetTick} positions text to y=${kfY} (canvas: 0-${project.canvas.height})`);
                }
              }
            }
          }
        }
      }
    }
    report.checks.push({
      name: 'Animated Keyframe Bounds Inspection',
      passed: animatedBoundsOk,
      detail: animatedBoundsOk ? 'All animated text keyframes remain within safe canvas boundaries' : 'Animated text boundary overflow detected'
    });

    // 5. Stacking Order & Track Integrity
    const trackMap = new Map((project.tracks || []).map(t => [t.id, t]));
    let zIndexOk = true;
    for (const clip of project.clips || []) {
      if (!trackMap.has(clip.trackId)) {
        zIndexOk = false;
        report.score -= 15;
        report.warnings.push(`Orphan clip "${clip.id}" references non-existent track "${clip.trackId}"`);
      }
    }
    report.checks.push({
      name: 'Track Integrity & Stacking Hierarchy',
      passed: zIndexOk,
      detail: `${(project.tracks || []).length} tracks inspected`
    });

    // 6. Inter-Clip Cut Continuity & Blank-Frame Flash Inspection (D8)
    let gapFlashOk = true;
    const visualTracks = (project.tracks || []).filter(t => t.type !== 'audio');
    for (const track of visualTracks) {
      const trackClips = (project.clips || [])
        .filter(c => c.trackId === track.id && c.type !== 'audio')
        .sort((a, b) => a.startTick - b.startTick);

      for (let i = 0; i < trackClips.length - 1; i++) {
        const c1 = trackClips[i];
        const c2 = trackClips[i + 1];
        const c1End = c1.startTick + c1.durationTicks;
        const gap = c2.startTick - c1End;
        // An unintended gap of 1 or 2 frames (<= 4000 ticks at 120,000 tps, 60fps frame is 2000 ticks)
        if (gap > 0 && gap <= 4000) {
          gapFlashOk = false;
          report.score -= 10;
          report.warnings.push(`Blank-frame flash detected on track "${track.id}": ${gap}-tick (${(gap / 2000).toFixed(1)} frame) gap between adjacent clips "${c1.id}" and "${c2.id}" at tick ${c1End}`);
        }
      }
    }
    report.checks.push({
      name: 'Inter-Clip Cut Continuity & Blank-Frame Flash',
      passed: gapFlashOk,
      detail: gapFlashOk ? 'No unintended 1-2 frame cut gaps detected' : 'Unintended blank-frame cut gap detected'
    });

    // 7. Rendered Media Container & Audio Stream Audit
    if (renderedMp4Path && fs.existsSync(renderedMp4Path)) {
      const ffprobeBin = EnvironmentResolver.resolveFfprobe() || 'ffprobe';
      const probeRes = spawnSync(ffprobeBin, [
        '-v', 'error',
        '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,channels',
        '-of', 'json',
        path.resolve(renderedMp4Path)
      ], { encoding: 'utf8' });

      if (probeRes.status === 0) {
        const parsed = JSON.parse(probeRes.stdout);
        const vStream = (parsed.streams || []).find(s => s.codec_type === 'video');
        const aStream = (parsed.streams || []).find(s => s.codec_type === 'audio');

        const dimMatch = vStream && vStream.width === project.canvas.width && vStream.height === project.canvas.height;
        report.checks.push({
          name: 'Video Stream Dimension Conformance',
          passed: Boolean(dimMatch),
          detail: `Expected ${project.canvas.width}x${project.canvas.height}, probed ${vStream ? `${vStream.width}x${vStream.height}` : 'none'}`
        });
        if (!dimMatch) report.score -= 25;

        const hasAudioClips = (project.clips || []).some(c => c.type === 'audio');
        if (hasAudioClips) {
          const audioValid = Boolean(aStream && aStream.channels >= 1);
          report.checks.push({
            name: 'Audio Track Stream Conformance',
            passed: audioValid,
            detail: `Audio codec: ${aStream ? aStream.codec_name : 'none'}, channels: ${aStream ? aStream.channels : 0}`
          });
          if (!audioValid) {
            report.score -= 20;
            report.warnings.push('Project contains audio clips but rendered output has no audio stream');
          }
        }

        // 7b. Rendered Blank-Frame Flash Inspection (D8b) via blackdetect
        const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
        const blackRes = spawnSync(ffmpegBin, [
          '-i', path.resolve(renderedMp4Path),
          '-vf', 'blackdetect=d=0.016:pic_th=0.98:pix_th=0.10',
          '-f', 'null', '-'
        ], { encoding: 'utf8' });

        let renderedFlashOk = true;
        if (blackRes.status === 0) {
          const bStderr = blackRes.stderr || '';
          const bMatches = Array.from(bStderr.matchAll(/black_start:\s*([\d.]+)\s*black_end:\s*([\d.]+)\s*black_duration:\s*([\d.]+)/g));
          const hasIntentionalBlack = (project.clips || []).some(c => c.metadata && c.metadata.intentionalBlack === true);
          if (!hasIntentionalBlack) {
            for (const bm of bMatches) {
              const bStart = parseFloat(bm[1]);
              const bEnd = parseFloat(bm[2]);
              const bDur = parseFloat(bm[3]);
              if (bDur >= 0.016 && bDur <= 0.15) {
                renderedFlashOk = false;
                report.score -= 10;
                report.warnings.push(`Rendered blank-frame flash detected: ${Math.round(bDur * 1000)}ms black flash at ${bStart.toFixed(2)}s–${bEnd.toFixed(2)}s`);
              }
            }
          }
        }
        report.checks.push({
          name: 'Rendered Blank-Frame Flash Inspection',
          passed: renderedFlashOk,
          detail: renderedFlashOk ? 'No unintended blank-frame flashes detected in rendered video' : 'Unintended blank-frame flash detected in rendered video'
        });
      }
    }

    // 8. Deep Audio Signal Integrity Inspection (D5, D6, D7)
    let audioSignalOk = true;
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

    const audioTargetsToInspect = [];
    for (const asset of project.assets || []) {
      if (asset.type === 'audio' && asset.src) {
        const p = path.resolve(asset.src);
        if (fs.existsSync(p)) audioTargetsToInspect.push({ id: asset.id, path: p, isAsset: true });
      }
    }
    if (renderedMp4Path && fs.existsSync(renderedMp4Path)) {
      audioTargetsToInspect.push({ id: 'rendered_output', path: path.resolve(renderedMp4Path), isAsset: false });
    }

    for (const aTarget of audioTargetsToInspect) {
      // 8a. Hard-Clipping Detection (D5)
      const statsRes = spawnSync(ffmpegBin, [
        '-i', aTarget.path,
        '-af', 'astats=metadata=1:reset=1',
        '-f', 'null', '-'
      ], { encoding: 'utf8' });

      if (statsRes.status === 0) {
        const stderr = statsRes.stderr || '';
        const flatFactorM = stderr.match(/Flat factor:\s*([\d.]+)/);
        const peakLevelM = stderr.match(/Peak level dB:\s*(-?[\d.]+)/);
        const peakCountM = stderr.match(/Peak count:\s*([\d.]+)/);

        const flatFactor = flatFactorM ? parseFloat(flatFactorM[1]) : 0;
        const peakLevel = peakLevelM ? parseFloat(peakLevelM[1]) : -Infinity;
        const peakCount = peakCountM ? parseFloat(peakCountM[1]) : 0;

        if ((flatFactor > 1.0 || peakCount > clippingThreshold) && peakLevel >= -0.05) {
          audioSignalOk = false;
          report.score -= 20;
          report.warnings.push(`PCM hard-clipping detected in ${aTarget.isAsset ? `audio asset "${aTarget.id}"` : 'rendered media'}: measured ${Math.round(peakCount)} clipped peak samples (flat factor ${flatFactor.toFixed(2)}, threshold: ${clippingThreshold})`);
        }
      }

      // 8b. True-Peak Ceiling Violation (D6) if ceiling is configured
      if (truePeakCeiling !== null) {
        const ebuRes = spawnSync(ffmpegBin, [
          '-i', aTarget.path,
          '-af', 'ebur128=peak=true',
          '-f', 'null', '-'
        ], { encoding: 'utf8' });

        if (ebuRes.status === 0) {
          const ebuStderr = ebuRes.stderr || '';
          const tpMatch = ebuStderr.match(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/i);
          if (tpMatch) {
            const measuredTruePeak = parseFloat(tpMatch[1]);
            if (measuredTruePeak > truePeakCeiling) {
              audioSignalOk = false;
              report.score -= 15;
              report.warnings.push(`True peak ceiling violation in ${aTarget.isAsset ? `audio asset "${aTarget.id}"` : 'rendered media'}: measured ${measuredTruePeak.toFixed(2)} dBTP exceeds delivery ceiling of ${truePeakCeiling.toFixed(2)} dBTP`);
            }
          }
        }
      }

      // 8c. Audio Dropout Detection (D7) via silencedetect at -80dB digital silence
      const silenceRes = spawnSync(ffmpegBin, [
        '-i', aTarget.path,
        '-af', 'silencedetect=noise=-80dB:d=0.1',
        '-f', 'null', '-'
      ], { encoding: 'utf8' });

      if (silenceRes.status === 0) {
        const silStderr = silenceRes.stderr || '';
        const silMatches = Array.from(silStderr.matchAll(/silence_start:\s*([\d.]+)\s*[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g));

        const probeRes = spawnSync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'json',
          aTarget.path
        ], { encoding: 'utf8' });
        let totalDur = 2.0;
        try {
          totalDur = parseFloat(JSON.parse(probeRes.stdout).format.duration) || 2.0;
        } catch (_) {}

        for (const m of silMatches) {
          const sStart = parseFloat(m[1]);
          const sEnd = parseFloat(m[2]);
          const sDur = parseFloat(m[3]);

          const isWholeFileSilence = sDur >= (totalDur - 0.2);
          const isLeadIn = sStart <= 0.25;
          const isLeadOut = sEnd >= (totalDur - 0.25);

          if (!isWholeFileSilence && !isLeadIn && !isLeadOut && sDur >= 0.08 && sDur <= 0.6) {
            audioSignalOk = false;
            report.score -= 15;
            report.warnings.push(`Audio dropout detected in ${aTarget.isAsset ? `audio asset "${aTarget.id}"` : 'rendered media'}: ${Math.round(sDur * 1000)}ms silence interval at ${sStart.toFixed(2)}s–${sEnd.toFixed(2)}s during active playback`);
          }
        }
      }
    }

    if (audioTargetsToInspect.length > 0) {
      report.checks.push({
        name: 'Audio Signal Integrity & Ceiling Compliance',
        passed: audioSignalOk,
        detail: audioSignalOk ? 'All audio streams conform to true-peak ceiling, unclipped PCM, and continuous envelope' : 'Audio signal defect detected'
      });
    }

    // 8d. Earshot Objective DSP & Sync Verification (Phase 25)
    if (renderedMp4Path && fs.existsSync(renderedMp4Path) && options.enableEarshot !== false) {
      try {
        const { EarshotAdapter } = require('./earshot-adapter.js');
        const earshotAdapter = new EarshotAdapter(options.earshotOptions || {});
        const earshotResult = earshotAdapter.auditAudioQualitySync(renderedMp4Path, {
          timebase: {
            duration_ticks: project.timebase?.durationTicks,
            fps_numerator: project.timebase?.fpsNumerator || 30,
            fps_denominator: project.timebase?.fpsDenominator || 1
          },
          profile: options.deliveryProfile || project.deliveryProfile
        });

        if (earshotResult && Array.isArray(earshotResult.checks)) {
          report.earshot_telemetry = {
            execution_mode: earshotResult.execution_mode || 'sync_blocking',
            blocking_duration_ms: earshotResult.blocking_duration_ms || 0
          };
          for (const c of earshotResult.checks) {
            report.checks.push({
              name: c.name,
              passed: c.status === 'passed',
              detail: c.detail,
              category: c.category,
              severity: c.severity,
              measured_value: c.measured_value,
              threshold: c.threshold,
              id: c.id
            });
            if (c.status === 'failed') {
              report.score -= (c.severity === 'CRITICAL' ? 25 : (c.severity === 'HIGH' ? 15 : 5));
              report.warnings.push(`${c.name} failure: ${c.detail}`);
            } else if (c.status === 'not_measured' && (c.severity === 'HIGH' || c.severity === 'CRITICAL')) {
              report.score -= 10;
              report.warnings.push(`${c.name} unmeasured: ${c.detail}`);
            }
          }
        }
      } catch (error) { report.warnings.push(`Earshot measurement unavailable: ${error.message}`); }
    }

    if (renderedMp4Path) {
      try {
        report.final_media = this.auditFinalMedia(project, renderedMp4Path);
        if (!report.final_media.passed) report.warnings.push('Mandatory final media QA failed');
      } catch (error) { report.warnings.push(`Mandatory final media QA unavailable: ${error.message}`); }
    }
    report.score = Math.max(0, report.score);
    report.passed = report.score >= 80 && report.warnings.length === 0 && report.checks.every(c => c.passed === true);
    return report;
  }

  /**
   * Asynchronous Quality Assurance audit.
   * Runs Earshot audio checks out-of-process via persistent worker stream
   * without blocking the Node.js event loop.
   *
   * @param {object} project
   * @param {string|null} renderedMp4Path
   * @param {object} options
   * @returns {Promise<object>} QA report object
   */
  static async auditQualityAsync(project, renderedMp4Path = null, options = {}) {
    // Run synchronous native checks first
    const report = QualityAssuranceEngine.auditQuality(project, renderedMp4Path, { ...options, enableEarshot: false });

    if (renderedMp4Path && fs.existsSync(renderedMp4Path) && options.enableEarshot !== false) {
      let earshotAdapter = null;
      try {
        const { EarshotAdapter } = require('./earshot-adapter.js');
        earshotAdapter = new EarshotAdapter(options.earshotOptions || {});
        const earshotResult = await earshotAdapter.auditAudioQuality(renderedMp4Path, {
          timebase: {
            duration_ticks: project.timebase?.durationTicks,
            fps_numerator: project.timebase?.fpsNumerator || 30,
            fps_denominator: project.timebase?.fpsDenominator || 1
          },
          profile: options.deliveryProfile || project.deliveryProfile
        });

        if (earshotResult && Array.isArray(earshotResult.checks)) {
          report.earshot_telemetry = {
            execution_mode: earshotResult.execution_mode || 'async_worker',
            execution_duration_ms: earshotResult.execution_duration_ms || 0
          };
          for (const c of earshotResult.checks) {
            report.checks.push({
              name: c.name,
              passed: c.status === 'passed',
              detail: c.detail,
              category: c.category,
              severity: c.severity,
              measured_value: c.measured_value,
              threshold: c.threshold,
              id: c.id
            });
            if (c.status === 'failed') {
              report.score -= (c.severity === 'CRITICAL' ? 25 : (c.severity === 'HIGH' ? 15 : 5));
              report.warnings.push(`${c.name} failure: ${c.detail}`);
            } else if (c.status === 'not_measured' && (c.severity === 'HIGH' || c.severity === 'CRITICAL')) {
              report.score -= 10;
              report.warnings.push(`${c.name} unmeasured: ${c.detail}`);
            }
          }
        }
      } catch (error) { report.warnings.push(`Earshot measurement unavailable: ${error.message}`);
      } finally {
        if (earshotAdapter && (!options.earshotOptions || !options.earshotOptions.workerClient)) {
          try { earshotAdapter.workerClient.stop(); } catch (_) {}
        }
      }
    }

    report.score = Math.max(0, report.score);
    report.passed = report.score >= 80 && report.warnings.length === 0 && report.checks.every(c => c.passed === true);
    return report;
  }
}

module.exports = { QualityAssuranceEngine };
