/**
 * Unified Workflow Service Boundary (Phase 14C)
 *
 * Routes CLI, MCP, and UI requests through a single orchestration boundary.
 * Enforces approval policies, execution idempotency, and final artifact generation.
 */

const fs = require('fs');
const path = require('path');
const { JobManager, JobStatus } = require('./job-manager.js');
const { SourceAnalyzer } = require('../planning/source-analyzer.js');
const { PlanCompiler } = require('../planning/plan-compiler.js');
const { HyperFramesCompiler } = require('../renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../renderers/hyperframes/renderer.js');
const { QualityAssuranceEngine } = require('../renderers/qa-engine.js');
const { ClosedLoopQaPipeline } = require('../planning/closed-loop-qa.js');

class WorkflowService {
  constructor(options = {}) {
    this.jobManager = new JobManager(options.storageDir || 'artifacts/jobs');
  }

  /**
   * Submit and run a complete editing workflow.
   */
  async executeJob({
    jobId,
    brief,
    sourceAssets = [],
    editingPlan,
    requireApproval = false,
    outputMp4Path,
    autoRender = true
  }) {
    // 1. Creation & Ingest
    const manifest = sourceAssets.map(a => ({
      assetId: a.id || a.assetId,
      path: a.path || a.src,
      sha256: SourceAnalyzer.computeSha256(path.resolve(a.path || a.src))
    }));

    let job = this.jobManager.createJob(jobId, {
      brief,
      assetManifest: manifest,
      planId: editingPlan ? editingPlan.id : null,
      approvalState: { required: requireApproval, approved: !requireApproval }
    });

    this.jobManager.transition(job.jobId, JobStatus.INGESTING, 'Ingesting assets');

    // 2. Analysis
    this.jobManager.transition(job.jobId, JobStatus.ANALYZING, 'Performing source analysis');
    const sourceAnalysis = SourceAnalyzer.analyzeAssets(sourceAssets, { analysisId: `sa_${job.jobId}` });
    job = this.jobManager.loadJob(job.jobId);
    job.sourceAnalysisId = sourceAnalysis.analysisId;
    this.jobManager.saveJob(job);

    // 3. Planning & Preflight
    this.jobManager.transition(job.jobId, JobStatus.PLANNING, 'Validating plan');
    const dryRun = PlanCompiler.dryRun({}, editingPlan);
    if (!dryRun.success) {
      this.jobManager.fail(job.jobId, { code: dryRun.errorCode, message: dryRun.errors.join('; ') }, 'VALIDATING');
      return { success: false, job: this.jobManager.loadJob(job.jobId), error: dryRun.errors };
    }

    // 4. Approval Gate Check
    if (requireApproval && !job.approvalState.approved) {
      this.jobManager.transition(job.jobId, JobStatus.AWAITING_APPROVAL, 'Approval required before execution');
      return { success: false, awaitingApproval: true, job: this.jobManager.loadJob(job.jobId) };
    }

    // 5. Validation & Execution
    this.jobManager.transition(job.jobId, JobStatus.VALIDATING, 'Pre-flight verified');
    this.jobManager.transition(job.jobId, JobStatus.EXECUTING, 'Executing plan operations');

    job = this.jobManager.loadJob(job.jobId);
    job.projectId = dryRun.previewProject.id;
    job.projectRevision = dryRun.finalRevision;
    job.executedOperations = dryRun.trace;
    this.jobManager.saveJob(job);

    // 6. Rendering
    const finalMp4 = path.resolve(outputMp4Path || `artifacts/jobs/${job.jobId}/output.mp4`);
    fs.mkdirSync(path.dirname(finalMp4), { recursive: true });

    let renderTimeSec = 0;
    if (autoRender) {
      this.jobManager.transition(job.jobId, JobStatus.RENDERING, 'Rendering final MP4 composition');
      const compDir = path.resolve(path.dirname(finalMp4), 'comp');
      HyperFramesCompiler.compile(dryRun.previewProject, compDir);

      let renderFps = 60;
      if (typeof dryRun.previewProject.timebase.fps === 'number') renderFps = dryRun.previewProject.timebase.fps;
      else if (dryRun.previewProject.timebase.fps?.numerator) {
        renderFps = Math.round(dryRun.previewProject.timebase.fps.numerator / (dryRun.previewProject.timebase.fps.denominator || 1));
      }

      const t0 = Date.now();
      HyperFramesRenderer.render(compDir, finalMp4, { fps: renderFps });
      renderTimeSec = (Date.now() - t0) / 1000;
    }

    // 7. QA Evaluation
    this.jobManager.transition(job.jobId, JobStatus.QA_EVALUATING, 'Auditing quality');
    const qaReport = QualityAssuranceEngine.auditQuality(dryRun.previewProject, autoRender ? finalMp4 : null);

    const outDurationSec = dryRun.previewProject.timebase.durationTicks / (dryRun.previewProject.timebase.ticksPerSecond || 120000);
    const renderDurationRatio = outDurationSec > 0 ? parseFloat((renderTimeSec / outDurationSec).toFixed(3)) : 0;
    const playbackSpeedFactor = renderTimeSec > 0 ? parseFloat((outDurationSec / renderTimeSec).toFixed(3)) : 0;

    // 8. Completion Manifest
    const finalManifest = {
      jobId: job.jobId,
      projectId: dryRun.previewProject.id,
      finalRevision: dryRun.finalRevision,
      outputMp4Path: finalMp4,
      outputSha256: autoRender && fs.existsSync(finalMp4) ? SourceAnalyzer.computeSha256(finalMp4) : null,
      qaScore: qaReport.score,
      qaWarnings: qaReport.warnings,
      metrics: {
        renderTimeSec: parseFloat(renderTimeSec.toFixed(2)),
        outputDurationSec: outDurationSec,
        renderDurationRatio,
        playbackSpeedFactor
      }
    };

    job = this.jobManager.loadJob(job.jobId);
    job.renderOutputs = {
      mp4Path: finalMp4,
      renderDurationSec: parseFloat(renderTimeSec.toFixed(2)),
      renderDurationRatio,
      playbackSpeedFactor
    };
    job.finalManifest = finalManifest;
    this.jobManager.saveJob(job);

    this.jobManager.transition(job.jobId, JobStatus.COMPLETED, 'Workflow successfully completed and verified');
    return {
      success: true,
      job: this.jobManager.loadJob(job.jobId),
      manifest: finalManifest
    };
  }
}

module.exports = { WorkflowService };
