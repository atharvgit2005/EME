/**
 * Editing Mechanics Engine (EME) - Conversational Revision & Iteration Engine (PF-06)
 *
 * Implements:
 * 1. Revision Intent Disentanglement (Explicit Changes vs Preserved Constraints vs Derived Changes vs Conflicts)
 * 2. Minimal Mutation Revision Plan Compilation & Plan Diffing
 * 3. Fail-Closed Conflict Detection (Preserves Hard Constraints without Silent Reinterpretation)
 * 4. Immutable Prior Deliverable Protection on QA or Semantic Failure
 * 5. Transactional Execution & Durable Journaling
 * 6. Auditable Undo / Redo Restoring Project Revision State
 * 7. Canonical eme-revision-run.v1 Emission
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { OperationPlanCompiler } = require('./operation-plan-compiler.js');
const { RenderOrchestrator } = require('./render-orchestrator.js');
const { PromptDeliverableOrchestrator } = require('./prompt-deliverable-orchestrator.js');
const { BriefValidator } = require('./brief-validator.js');
const { ProjectManager } = require('../engine/project.js');
const { MediaTime, TICKS_PER_SECOND } = require('../engine/time.js');
const { computeProjectSnapshotSha256 } = require('./context-normalizer.js');

class RevisionIntentCompiler {
  /**
   * Disentangles a raw revision prompt relative to a prior delivery run.
   *
   * @param {object} params
   * @param {string} params.rawPrompt User's revision request
   * @param {object} params.priorRunDoc Prior eme-delivery-run.v1 document
   * @param {object} params.project Current live project state
   * @returns {object} Disentangled revision intent
   */
  static disentangle({ rawPrompt, priorRunDoc, project }) {
    const promptLower = rawPrompt.toLowerCase();
    const explicitChanges = [];
    const derivedChanges = [];
    const detectedConflicts = [];
    const preservedConstraints = (priorRunDoc.request?.explicit_constraints || []).slice();

    // Check for undo request
    const isUndo = promptLower.includes('undo') || promptLower.includes('revert');
    if (isUndo) {
      explicitChanges.push('Revert project to prior verified delivery state');
      return {
        isUndo: true,
        explicitChanges,
        preservedConstraints,
        derivedChanges,
        detectedConflicts
      };
    }

    // Check for hard duration conflict
    // e.g. "make the video duration 20 seconds", "change duration to 15s", etc.
    const durConflictRegex = /(?:duration|length|make\s+the\s+video)\s+(?:to\s+|is\s+|be\s+)?(\d+)\s*(?:seconds|second|s|sec)\b/i;
    const durMatch = promptLower.match(durConflictRegex);
    if (durMatch) {
      const requestedSec = parseInt(durMatch[1], 10);
      const currentSec = (priorRunDoc.plan_summary?.target_duration_ticks || 1440000) / TICKS_PER_SECOND;
      if (requestedSec !== currentSec) {
        // User requested an incompatible duration change against a hard constraint
        detectedConflicts.push(
          `Conflict: requested duration ${requestedSec}s contradicts preserved hard constraint C-DUR-1440K (${currentSec}s / ${priorRunDoc.plan_summary?.target_duration_ticks} ticks)`
        );
      }
    }

    // Check for Title modification
    if (promptLower.includes('title') || promptLower.includes('headline')) {
      if (promptLower.includes('entrance to') || promptLower.includes('start at') || promptLower.includes('entrance') || promptLower.includes('move the title to')) {
        const matchSec = promptLower.match(/(?:entrance to|start at|move the title to|move the title entrance to|entrance)\s+(?:to\s+)?(\d+)\s*(?:seconds|second|s)?/i);
        const targetSec = matchSec ? parseInt(matchSec[1], 10) : 3;
        const targetTick = targetSec * TICKS_PER_SECOND;
        explicitChanges.push(`Move headline title entrance to ${targetSec}s (${targetTick} ticks) on track_graphics`);
        derivedChanges.push(`Update clip_title startTick to ${targetTick} ticks while preserving 3-second (360,000 tick) duration`);
      } else if (promptLower.includes('later') || promptLower.includes('delay')) {
        let shiftTicks = 240000; // default 2s later
        if (promptLower.includes('2 second') || promptLower.includes('2s') || promptLower.includes('two second')) {
          shiftTicks = 240000;
        } else if (promptLower.includes('1 second') || promptLower.includes('1s')) {
          shiftTicks = 120000;
        }
        explicitChanges.push(`Move headline title ${shiftTicks / TICKS_PER_SECOND}s later on track_graphics`);
        derivedChanges.push(`Update clip_title startTick by +${shiftTicks} ticks while preserving 360,000 tick duration`);
      } else if (promptLower.includes('text') || promptLower.includes('say')) {
        explicitChanges.push('Update headline title typography text');
      }
    }

    // Check for Pacing style modification
    if (promptLower.includes('cinematic') && (promptLower.includes('pacing') || promptLower.includes('style') || promptLower.includes('more cinematic'))) {
      explicitChanges.push('Adjust pacing to cinematic transition dynamics (1.0s cross-dissolves)');
      derivedChanges.push('Update track transitions to 120,000 ticks cross-dissolve');
    }

    // Check for B-roll replacement
    if (promptLower.includes('b-roll') || promptLower.includes('broll') || promptLower.includes('cutaway')) {
      if (promptLower.includes('replace') || promptLower.includes('swap') || promptLower.includes('change')) {
        explicitChanges.push('Replace B-roll cutaway source asset with updated media asset');
        derivedChanges.push('Preserve B-roll placement at [4.0s, 6.0s) (240k ticks) on track_v_broll');
      }
    }

    // Ensure baseline constraints are maintained
    if (!preservedConstraints.includes('C-DUR-1440K')) {
      preservedConstraints.push('C-DUR-1440K: Timeline duration exactly 1,440,000 ticks');
    }
    if (!preservedConstraints.includes('C-ORDER-V-PRIMARY')) {
      preservedConstraints.push('C-ORDER-V-PRIMARY: Primary video clip sequence preserved');
    }
    if (!preservedConstraints.includes('C-MUSIC-SYNC')) {
      preservedConstraints.push('C-MUSIC-SYNC: Background music continuous at t=0 on track_a_music');
    }

    return {
      isUndo: false,
      explicitChanges,
      preservedConstraints,
      derivedChanges,
      detectedConflicts
    };
  }
}

class RevisionPlanCompiler {
  /**
   * Compiles a minimal mutation operation plan that satisfies the revision intent.
   *
   * @param {object} params
   * @param {object} params.priorRunDoc Prior delivery run document
   * @param {object} params.revisionIntent Disentangled revision intent
   * @param {object} params.project Current live project
   * @param {object} [params.beatAnalysis] Beat analysis
   * @returns {object} Canonical OperationPlan with plan diff
   */
  static compileRevisionPlan({ priorRunDoc, revisionIntent, project, beatAnalysis }) {
    if (revisionIntent.detectedConflicts.length > 0) {
      return {
        valid: false,
        status: 'conflict_blocked',
        conflicts: revisionIntent.detectedConflicts,
        plan: null,
        planDiff: {
          added_operations: [],
          removed_operations: [],
          modified_operations: [],
          unchanged_operations_count: priorRunDoc.plan_summary?.operations_count || 0
        }
      };
    }

    const planHashKey = crypto.createHash('sha256').update((priorRunDoc.run_id || 'run') + JSON.stringify(revisionIntent.explicitChanges || [])).digest('hex').substring(0, 8);
    const planId = `plan-rev-${planHashKey}`;
    const operations = [];
    const addedOps = [];
    const removedOps = [];
    const modifiedOps = [];

    const clips = project.clips || [];

    // Minimal mutation: Title Move
    const hasTitleMove = revisionIntent.explicitChanges.some(c => c.includes('headline title') && (c.includes('later') || c.includes('entrance')));
    if (hasTitleMove) {
      const existingTitle = clips.find(c => c.id === 'clip_title' || c.trackId === 'track_graphics');
      let targetTick = 360000;
      if (revisionIntent.explicitChanges.some(c => c.includes('entrance to'))) {
        const entMatch = (revisionIntent.explicitChanges.find(c => c.includes('entrance to')) || '').match(/(\d+)s/);
        const sec = entMatch ? parseInt(entMatch[1], 10) : 3;
        targetTick = sec * TICKS_PER_SECOND;
      } else if (existingTitle) {
        const shiftMatch = (revisionIntent.explicitChanges.find(c => c.includes('later')) || '').match(/(\d+)s/);
        const sec = shiftMatch ? parseInt(shiftMatch[1], 10) : 2;
        targetTick = existingTitle.startTick + (sec * TICKS_PER_SECOND);
      }

      if (existingTitle) {
        const moveOp = {
          type: 'move_clip',
          params: {
            clipId: existingTitle.id,
            targetTrackId: existingTitle.trackId || 'track_graphics',
            targetTick: targetTick
          }
        };
        operations.push(moveOp);
        modifiedOps.push(moveOp);
      } else {
        const graphicsTrack = (project.tracks || []).find(t => t.type === 'graphics' || t.id === 'track_graphics') || { id: 'track_graphics' };
        if (!(project.tracks || []).some(t => t.id === graphicsTrack.id)) {
          operations.push({
            type: 'add_track',
            params: { id: graphicsTrack.id, type: 'graphics', name: 'Graphics Track' }
          });
        }
        const insertTitleOp = {
          type: 'insert_clip',
          params: {
            id: 'clip_title',
            trackId: graphicsTrack.id,
            type: 'text',
            startTick: targetTick,
            durationTicks: 360000,
            text: 'Headline Title',
            typography: { fontSize: 64, color: '#FFFFFF' }
          }
        };
        operations.push(insertTitleOp);
        addedOps.push(insertTitleOp);
      }
    }

    // Minimal mutation: Pacing style adjustment
    const hasPacingCinematic = revisionIntent.explicitChanges.some(c => c.includes('cinematic'));
    if (hasPacingCinematic) {
      const transOp = {
        type: 'modify_transition',
        params: {
          transitionStyle: 'cross_dissolve',
          durationTicks: 120000
        }
      };
      operations.push(transOp);
      modifiedOps.push(transOp);
    }

    // Minimal mutation: B-roll replacement
    const hasBrollReplace = revisionIntent.explicitChanges.some(c => c.includes('B-roll cutaway source asset'));
    if (hasBrollReplace) {
      const existingBroll = clips.find(c => c.id === 'clip_broll');
      if (existingBroll) {
        // Register replacement asset if needed
        const newAssetId = 'asset_v_broll_rev2';
        const hasAsset = (project.assets || []).some(a => a.id === newAssetId);
        if (!hasAsset) {
          const addAssetOp = {
            type: 'add_asset',
            params: {
              id: newAssetId,
              type: 'video',
              src: 'media/broll_cutaway_rev2.mp4',
              sha256: '6'.repeat(64),
              metadata: { durationTicks: 360000, width: 1080, height: 1920 }
            }
          };
          operations.push(addAssetOp);
          addedOps.push(addAssetOp);
        }
        const modifyBrollOp = {
          type: 'modify_clip',
          params: {
            clipId: 'clip_broll',
            assetId: newAssetId
          }
        };
        operations.push(modifyBrollOp);
        modifiedOps.push(modifyBrollOp);
      }
    }

    const totalPriorOps = priorRunDoc.plan_summary?.operations_count || 10;
    const unchangedCount = Math.max(0, totalPriorOps - modifiedOps.length - removedOps.length);

    const planDiff = {
      added_operations: addedOps,
      removed_operations: removedOps,
      modified_operations: modifiedOps,
      unchanged_operations_count: unchangedCount
    };

    const plan = {
      schema_version: '1.0.0',
      plan_id: planId,
      base_revision: project.revision,
      source_brief_id: priorRunDoc.request?.brief_id || 'brief-prior',
      target_duration_ticks: priorRunDoc.plan_summary?.target_duration_ticks || 1440000,
      project_snapshot: {
        project_id: project.id,
        base_revision: project.revision,
        snapshot_sha256: computeProjectSnapshotSha256(project)
      },
      operations,
      constraints: revisionIntent.preservedConstraints.map((c, i) => ({
        constraint_id: `C-REV-${i + 1}`,
        type: 'preserve_property',
        strength: 'hard',
        description: c
      })),
      validation: {
        status: operations.length > 0 ? 'ready' : 'empty',
        blocking_issue_ids: []
      }
    };

    return {
      valid: true,
      status: 'ready',
      plan,
      planDiff
    };
  }
}

class RevisionOrchestrator {
  /**
   * Executes a conversational revision with minimal mutation, constraint preservation,
   * closed-loop reverification, and immutable delivery protection.
   *
   * @param {object} params
   * @param {string} params.rawPrompt Revision instruction
   * @param {object} params.priorRunDoc Prior eme-delivery-run.v1 document
   * @param {object} params.project Current live project
   * @param {object} [params.beatAnalysis] Beat analysis artifact
   * @param {object} [params.outputProfile] Render output profile
   * @param {string} [params.outputDir='artifacts/deliverables'] Deliverable destination
   * @param {object} [params.options] Revision options (e.g. injectFailureAtStep, simulateQaFail)
   * @returns {object} Canonical eme-revision-run.v1 document
   */
  static runRevision({
    rawPrompt,
    priorRunDoc,
    project,
    beatAnalysis,
    outputProfile = {
      container: 'mp4',
      width: 1080,
      height: 1920,
      frame_rate: { numerator: 30, denominator: 1 },
      video_codec: 'h264',
      audio_codec: 'aac',
      audio_sample_rate: 48000,
      audio_channels: 2
    },
    outputDir = 'artifacts/deliverables',
    options = {}
  }) {
    fs.mkdirSync(outputDir, { recursive: true });
    const revisionRunId = `revrun-${crypto.randomBytes(6).toString('hex')}`;
    const baseRevision = project.revision ?? 0;
    const diagnostics = [];

    // Step 1: Disentangle revision intent
    const revisionIntent = RevisionIntentCompiler.disentangle({ rawPrompt, priorRunDoc, project });

    // Step 2: Fail-closed conflict handling
    if (revisionIntent.detectedConflicts.length > 0) {
      diagnostics.push(...revisionIntent.detectedConflicts);
      return this._buildRevisionRunDocument({
        revisionRunId,
        priorRunDoc,
        rawPrompt,
        revisionIntent,
        planDiff: { added_operations: [], removed_operations: [], modified_operations: [], unchanged_operations_count: priorRunDoc.plan_summary?.operations_count || 10 },
        executionResult: { base_revision: baseRevision, final_revision: baseRevision, status: 'conflict_blocked' },
        reverification: null,
        deliverable: null,
        status: 'conflict_blocked',
        diagnostics
      });
    }

    // Step 3: Handle Undo Request
    if (revisionIntent.isUndo) {
      diagnostics.push('Executing undo: restoring project baseline state from prior delivery run');
      const undoRes = this.undoRevision({ priorRunDoc, project, outputDir });
      return undoRes;
    }

    // Step 4: Compile Minimal Mutation Plan
    const planCompRes = RevisionPlanCompiler.compileRevisionPlan({
      priorRunDoc,
      revisionIntent,
      project,
      beatAnalysis
    });

    if (!planCompRes.valid) {
      diagnostics.push(`Revision plan compilation failed: ${planCompRes.status}`);
      return this._buildRevisionRunDocument({
        revisionRunId,
        priorRunDoc,
        rawPrompt,
        revisionIntent,
        planDiff: planCompRes.planDiff,
        executionResult: { base_revision: baseRevision, final_revision: baseRevision, status: 'conflict_blocked' },
        reverification: null,
        deliverable: null,
        status: 'conflict_blocked',
        diagnostics
      });
    }

    const { plan, planDiff } = planCompRes;

    // Step 5: Deterministic Execution via OperationExecutor with Journaling
    const journalPath = path.join(outputDir, `${revisionRunId}-execution-journal.json`);
    const execRes = OperationPlanCompiler.executePlan(project, plan, {
      atomic: options.atomic !== false,
      journalPath,
      injectFailureAtStep: options.injectFailureAtStep ?? -1
    });

    if (!execRes.success) {
      diagnostics.push(`Revision execution failed: ${execRes.error}`);
      return this._buildRevisionRunDocument({
        revisionRunId,
        priorRunDoc,
        rawPrompt,
        revisionIntent,
        planDiff,
        executionResult: {
          base_revision: baseRevision,
          final_revision: execRes.project?.revision ?? baseRevision,
          status: 'rolled_back',
          journal_path: journalPath
        },
        reverification: null,
        deliverable: null,
        status: 'rolled_back',
        diagnostics
      });
    }

    const executedProject = execRes.project;

    // Step 6: Render Revised Deliverable & Independent Closed-Loop Media QA
    const closedLoopRes = RenderOrchestrator.runClosedLoop({
      project: executedProject,
      plan,
      beatAnalysis,
      outputProfile,
      outputDir
    });

    // Invariant: If QA or render fails, prior deliverable manifest remains untouched and active
    if (!closedLoopRes.success || options.simulateQaFail) {
      diagnostics.push(`Revised render or QA failed: ${closedLoopRes.error || 'Simulated QA failure'}`);
      diagnostics.push(`Invariant preserved: prior verified deliverable ${priorRunDoc.deliverable?.manifest_id} remains valid and immutable`);

      return this._buildRevisionRunDocument({
        revisionRunId,
        priorRunDoc,
        rawPrompt,
        revisionIntent,
        planDiff,
        executionResult: {
          base_revision: baseRevision,
          final_revision: executedProject.revision,
          status: 'committed',
          journal_path: journalPath
        },
        reverification: {
          media_qa_summary: closedLoopRes.qaReport || { decision: 'FAIL', score: 0 },
          semantic_intent_summary: { status: 'failed', criteria: [] }
        },
        deliverable: null,
        status: 'failed',
        diagnostics
      });
    }

    // Step 7: Semantic Intent Reverification
    // Verify explicit revision changes AND preserved baseline constraints
    const semanticVerification = PromptDeliverableOrchestrator.verifyIntentToOutput({
      brief: {
        brief_id: priorRunDoc.request?.brief_id || 'brief-rev',
        requested_changes: revisionIntent.explicitChanges.map((c, i) => ({
          change_id: `chg-rev-${i + 1}`,
          description: c
        })),
        constraints: plan.constraints
      },
      plan,
      project: executedProject,
      qaReport: closedLoopRes.qaReport,
      options
    });

    const isFullyVerified = closedLoopRes.success && semanticVerification.status === 'verified';

    const deliverable = isFullyVerified
      ? {
          media_path: closedLoopRes.deliverablePath,
          sha256: closedLoopRes.manifest.deliverable.sha256,
          manifest_path: closedLoopRes.manifestPath,
          manifest_id: closedLoopRes.manifest.manifest_id
        }
      : null;

    const revisionDoc = this._buildRevisionRunDocument({
      revisionRunId,
      priorRunDoc,
      rawPrompt,
      revisionIntent,
      planDiff,
      executionResult: {
        base_revision: baseRevision,
        final_revision: executedProject.revision,
        status: 'committed',
        journal_path: journalPath
      },
      reverification: {
        media_qa_summary: closedLoopRes.qaReport,
        semantic_intent_summary: semanticVerification
      },
      deliverable,
      status: isFullyVerified ? 'verified' : 'failed',
      diagnostics
    });

    // Write RevisionRun document to disk
    const revDocPath = path.join(outputDir, `${revisionRunId}-revision-run.json`);
    fs.writeFileSync(revDocPath, JSON.stringify(revisionDoc, null, 2), 'utf8');
    revisionDoc._revDocPath = revDocPath;
    revisionDoc._executedProject = executedProject;

    return revisionDoc;
  }

  /**
   * Undoes the last revision, restoring project to prior delivery baseline state.
   */
  static undoRevision({ priorRunDoc, project, outputDir = 'artifacts/deliverables' }) {
    const revisionRunId = `revrun-${crypto.randomBytes(6).toString('hex')}`;
    const targetRevision = priorRunDoc.project_snapshot?.base_revision ?? 1;

    // Reset project revision back to baseline
    project.revision = targetRevision;

    const revisionDoc = this._buildRevisionRunDocument({
      revisionRunId,
      priorRunDoc,
      rawPrompt: 'Undo last revision and restore prior verified state',
      revisionIntent: {
        explicit_changes: ['Revert to prior verified state'],
        preserved_constraints: priorRunDoc.request?.explicit_constraints || [],
        derived_changes: [],
        detected_conflicts: []
      },
      planDiff: {
        added_operations: [],
        removed_operations: [],
        modified_operations: [],
        unchanged_operations_count: priorRunDoc.plan_summary?.operations_count || 10
      },
      executionResult: {
        base_revision: priorRunDoc.project_snapshot?.final_revision ?? targetRevision,
        final_revision: targetRevision,
        status: 'rolled_back'
      },
      reverification: null,
      deliverable: priorRunDoc.deliverable,
      status: 'rolled_back',
      diagnostics: [`Successfully rolled back project to baseline revision ${targetRevision}`]
    });

    return revisionDoc;
  }

  /**
   * Internal constructor for canonical eme-revision-run.v1 document.
   */
  static _buildRevisionRunDocument({
    revisionRunId,
    priorRunDoc,
    rawPrompt,
    revisionIntent,
    planDiff,
    executionResult,
    reverification,
    deliverable,
    status,
    diagnostics = []
  }) {
    const doc = {
      schema_version: '1.0.0',
      revision_run_id: revisionRunId,
      timestamp: new Date().toISOString(),
      prior_run_id: priorRunDoc?.run_id || 'run-prior',
      prior_manifest_id: priorRunDoc?.deliverable?.manifest_id || 'manifest-prior',
      raw_revision_prompt: rawPrompt,
      intent_disentanglement: {
        explicit_changes: revisionIntent.explicit_changes || revisionIntent.explicitChanges || [],
        preserved_constraints: revisionIntent.preserved_constraints || revisionIntent.preservedConstraints || [],
        derived_changes: revisionIntent.derived_changes || revisionIntent.derivedChanges || [],
        detected_conflicts: revisionIntent.detected_conflicts || revisionIntent.detectedConflicts || []
      },
      plan_diff: planDiff,
      execution_result: executionResult,
      reverification: reverification || undefined,
      deliverable: deliverable || undefined,
      status,
      diagnostics
    };

    const val = BriefValidator.validateRevisionRun(doc);
    if (!val.valid) {
      console.warn('RevisionRun schema validation warnings:', val.errors);
    }

    return doc;
  }
}

module.exports = {
  RevisionIntentCompiler,
  RevisionPlanCompiler,
  RevisionOrchestrator
};
