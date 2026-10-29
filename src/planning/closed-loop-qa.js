/**
 * Closed-Loop Creative Quality Assurance Pipeline (Phase 13E)
 *
 * Implements a bounded loop (max 3 automated correction attempts):
 * 1. Preflight dry-run of candidate plan
 * 2. Render project via HyperFramesCompiler
 * 3. Inspect rendered media (FrameInspector, QualityAssuranceEngine, Audio Metrics)
 * 4. Generate structured findings (severity, metric, timestamp, affected clip/operation)
 * 5. Propose targeted atomic correction operations tied to findings
 * 6. Revalidate, rerender, and verify resolution
 */

const fs = require('fs');
const path = require('path');
const { QualityAssuranceEngine } = require('../renderers/qa-engine.js');
const { HyperFramesCompiler } = require('../renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../renderers/hyperframes/renderer.js');
const { OperationExecutor } = require('../engine/operations.js');
const { FrameInspector } = require('../renderers/inspector.js');

class ClosedLoopQaPipeline {
  /**
   * Run the bounded QA correction loop.
   *
   * @param {Object} initialProject Initial canonical project
   * @param {Object} options Configuration options
   * @param {number} options.maxAttempts Maximum correction attempts (default 3)
   * @param {string} options.renderOutputDir Directory to output rendered MP4s
   * @returns {Object} Full execution history, attempts, resolved/unresolved findings, final project
   */
  static run({ project, renderOutputDir, maxAttempts = 3, autoRender = true }) {
    const history = [];
    let currentProject = structuredClone(project);
    let attempt = 0;
    let resolved = false;

    fs.mkdirSync(path.resolve(renderOutputDir), { recursive: true });

    while (attempt < maxAttempts && !resolved) {
      attempt++;
      const attemptRecord = {
        attempt,
        startedAt: new Date().toISOString(),
        initialRevision: currentProject.revision,
        findings: [],
        proposedCorrections: [],
        appliedCorrections: [],
        renderedMp4: null,
        qaScore: 0,
        status: 'in_progress'
      };

      const mp4Path = path.join(renderOutputDir, `attempt-${attempt}.mp4`);

      // 1. Render if requested
      if (autoRender) {
        try {
          const compDir = path.join(renderOutputDir, `comp-attempt-${attempt}`);
          HyperFramesCompiler.compile(currentProject, compDir);
          let renderFps = 60;
          if (typeof currentProject.timebase.fps === 'number') renderFps = currentProject.timebase.fps;
          else if (currentProject.timebase.fps && currentProject.timebase.fps.numerator) {
            renderFps = Math.round(currentProject.timebase.fps.numerator / (currentProject.timebase.fps.denominator || 1));
          }
          const renderRes = HyperFramesRenderer.render(compDir, mp4Path, { fps: renderFps });
          attemptRecord.renderedMp4 = mp4Path;
          attemptRecord.renderDurationSec = renderRes.durationSec;
        } catch (e) {
          attemptRecord.renderError = e.message;
        }
      }

      // 2. Audit quality
      const qaReport = QualityAssuranceEngine.auditQuality(currentProject, attemptRecord.renderedMp4);
      attemptRecord.qaScore = qaReport.score;
      attemptRecord.rawQaReport = qaReport;

      // 3. Map warnings and issues to structured findings
      for (const warning of qaReport.warnings) {
        if (warning.includes('Possible text clipping')) {
          // Extract clip ID from warning message: Possible text clipping on clip "title_clip":
          const m = warning.match(/clip\s+"([^"]+)"/);
          const clipId = m ? m[1] : null;
          attemptRecord.findings.push({
            id: `finding_${attempt}_text_clipping`,
            type: 'LAYOUT_CLIPPING',
            severity: 'HIGH',
            detail: warning,
            targetClipId: clipId,
            metric: 'text_boundary_overflow'
          });
        } else if (warning.includes('Animated text clipping')) {
          const m = warning.match(/clip\s+"([^"]+)"/);
          attemptRecord.findings.push({
            id: `finding_${attempt}_animated_clipping`,
            type: 'ANIMATED_CLIPPING',
            severity: 'HIGH',
            detail: warning,
            targetClipId: m ? m[1] : null,
            metric: 'keyframe_boundary_overflow'
          });
        } else if (warning.includes('Blank-frame flash detected')) {
          const m = warning.match(/gap between adjacent clips "([^"]+)" and "([^"]+)"/);
          const gapM = warning.match(/(\d+)-tick/);
          attemptRecord.findings.push({
            id: `finding_${attempt}_cut_gap`,
            type: 'CUT_GAP_FLASH',
            severity: 'MEDIUM',
            detail: warning,
            firstClipId: m ? m[1] : null,
            secondClipId: m ? m[2] : null,
            gapTicks: gapM ? parseInt(gapM[1], 10) : 2000,
            metric: 'unintended_timeline_gap'
          });
        } else if (warning.includes('PCM hard-clipping')) {
          attemptRecord.findings.push({
            id: `finding_${attempt}_pcm_clipping`,
            type: 'PCM_CLIPPING',
            severity: 'HIGH',
            detail: warning,
            repairable: false,
            metric: 'audio_clipping'
          });
        } else if (warning.includes('True peak ceiling violation')) {
          attemptRecord.findings.push({
            id: `finding_${attempt}_true_peak`,
            type: 'TRUE_PEAK_VIOLATION',
            severity: 'HIGH',
            detail: warning,
            repairable: false,
            metric: 'true_peak_overflow'
          });
        } else if (warning.includes('Audio dropout detected')) {
          attemptRecord.findings.push({
            id: `finding_${attempt}_audio_dropout`,
            type: 'AUDIO_DROPOUT',
            severity: 'HIGH',
            detail: warning,
            repairable: false,
            metric: 'audio_discontinuity'
          });
        } else if (warning.includes('references undeclared fontAssetId')) {
          const m = warning.match(/clip\s+"([^"]+)"/);
          attemptRecord.findings.push({
            id: `finding_${attempt}_missing_font`,
            type: 'MISSING_FONT_ASSET',
            severity: 'CRITICAL',
            detail: warning,
            targetClipId: m ? m[1] : null,
            metric: 'asset_missing'
          });
        } else {
          attemptRecord.findings.push({
            id: `finding_${attempt}_generic`,
            type: 'GENERIC_WARNING',
            severity: 'MEDIUM',
            detail: warning
          });
        }
      }

      // 4. If clean or score >= 90 with no critical findings, resolve
      if (attemptRecord.findings.length === 0 && qaReport.score >= 90) {
        attemptRecord.status = 'ACCEPTED';
        history.push(attemptRecord);
        resolved = true;
        break;
      }

      // 5. Propose targeted atomic corrections
      const corrections = [];
      for (const f of attemptRecord.findings) {
        if (f.type === 'LAYOUT_CLIPPING' && f.targetClipId) {
          // Generate targeted operation: adjust fontSize and reposition
          const targetClip = (currentProject.clips || []).find(c => c.id === f.targetClipId);
          if (targetClip) {
            corrections.push({
              findingId: f.id,
              operation: {
                type: 'modify_clip',
                params: {
                  clipId: f.targetClipId,
                  transform: {
                    x: Math.floor(currentProject.canvas.width / 2),
                    y: Math.floor(currentProject.canvas.height / 2),
                    anchorX: 0.5,
                    anchorY: 0.5
                  },
                  typography: {
                    ...targetClip.typography,
                    fontSize: Math.max(24, Math.floor(((targetClip.typography && targetClip.typography.fontSize) || 48) * 0.7)),
                    textAlign: 'center'
                  }
                },
                intent: `Automatically correct text clipping on clip ${f.targetClipId}`
              }
            });
          }
        } else if (f.type === 'ANIMATED_CLIPPING' && f.targetClipId) {
          const anim = (currentProject.animations || []).find(a => a.clipId === f.targetClipId);
          if (anim) {
            const clampedKfs = anim.keyframes.map(kf => ({
              ...kf,
              value: Math.min(Math.max(kf.value, 100), currentProject.canvas.width - 100)
            }));
            corrections.push({
              findingId: f.id,
              operation: {
                type: 'animate_property',
                params: {
                  clipId: f.targetClipId,
                  property: anim.property,
                  keyframes: clampedKfs
                },
                intent: `Correct animated keyframe bounds for clip ${f.targetClipId}`
              }
            });
          }
        } else if (f.type === 'CUT_GAP_FLASH' && f.firstClipId && f.gapTicks) {
          const targetClip = (currentProject.clips || []).find(c => c.id === f.firstClipId);
          if (targetClip) {
            corrections.push({
              findingId: f.id,
              operation: {
                type: 'trim_clip',
                params: {
                  clipId: f.firstClipId,
                  durationTicks: targetClip.durationTicks + f.gapTicks
                },
                intent: `Close 1-frame cut gap between ${f.firstClipId} and ${f.secondClipId}`
              }
            });
          }
        }
      }

      attemptRecord.proposedCorrections = corrections;

      // If no automated corrections could be formed, abort
      if (corrections.length === 0) {
        attemptRecord.status = 'EXHAUSTED_NO_CORRECTIONS';
        history.push(attemptRecord);
        break;
      }

      // Apply corrections atomically
      for (const c of corrections) {
        const opRes = OperationExecutor.execute(currentProject, c.operation);
        if (opRes.success) {
          currentProject = opRes.project;
          attemptRecord.appliedCorrections.push({
            findingId: c.findingId,
            operation: c.operation,
            success: true,
            resultingRevision: currentProject.revision
          });
        } else {
          attemptRecord.appliedCorrections.push({
            findingId: c.findingId,
            operation: c.operation,
            success: false,
            error: opRes.error
          });
        }
      }

      attemptRecord.status = 'CORRECTIONS_APPLIED';
      history.push(attemptRecord);
    }

    return {
      success: resolved,
      attemptsTotal: attempt,
      maxAttempts,
      resolved,
      history,
      finalProject: currentProject,
      finalScore: history[history.length - 1] ? history[history.length - 1].qaScore : 0
    };
  }
}

module.exports = { ClosedLoopQaPipeline };
