/**
 * Editing Plan Compiler & Deterministic Safety Engine (Phase 13)
 *
 * Compiles a structured editing plan into a sequence of atomic EME operations,
 * validates preconditions, enforces stable error codes, and performs dry-run
 * simulation with zero side-effects.
 */

const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../engine/project.js');
const { OperationExecutor } = require('../engine/operations.js');

const PlanErrorCodes = {
  ERR_PLAN_INVALID: 'ERR_PLAN_INVALID',
  ERR_ASSET_MISSING: 'ERR_ASSET_MISSING',
  ERR_UNSUPPORTED_EFFECT: 'ERR_UNSUPPORTED_EFFECT',
  ERR_TIMING_COLLISION: 'ERR_TIMING_COLLISION',
  ERR_PRECONDITION_FAILED: 'ERR_PRECONDITION_FAILED',
  ERR_DRY_RUN_FAILED: 'ERR_DRY_RUN_FAILED'
};

class PlanCompiler {
  /**
   * Validate plan structure and asset preconditions.
   */
  static validatePlan(plan) {
    const errors = [];
    const errorDetails = [];

    if (!plan || typeof plan !== 'object') {
      return {
        valid: false,
        errorCode: PlanErrorCodes.ERR_PLAN_INVALID,
        errors: ['Plan must be a valid JSON object']
      };
    }

    if (!plan.id) errors.push('Missing plan ID');
    if (!plan.brief) errors.push('Missing brief object');
    if (!plan.outputProfile) errors.push('Missing outputProfile');
    if (!Array.isArray(plan.operations) || plan.operations.length === 0) {
      errors.push('Plan must define at least one operation in operations array');
    }

    // Check source asset references existence if specified
    if (Array.isArray(plan.sourceReferences)) {
      for (const ref of plan.sourceReferences) {
        const absPath = path.resolve(ref.path);
        if (!fs.existsSync(absPath)) {
          const msg = `Referenced asset path not found: ${ref.path} (id: ${ref.assetId})`;
          errors.push(msg);
          errorDetails.push({ code: PlanErrorCodes.ERR_ASSET_MISSING, assetId: ref.assetId, path: ref.path });
        }
      }
    }

    // Check operations for unsupported visual effects
    if (Array.isArray(plan.operations)) {
      const allowedEffects = ['blur', 'brightness', 'contrast', 'opacity', 'blendMode'];
      for (let i = 0; i < plan.operations.length; i++) {
        const op = plan.operations[i];
        if (op.type === 'apply_effect') {
          const effectType = op.params && op.params.effect && op.params.effect.type;
          if (effectType && !allowedEffects.includes(effectType)) {
            const msg = `Operation step ${i} specifies unsupported effect: ${effectType}`;
            errors.push(msg);
            errorDetails.push({ code: PlanErrorCodes.ERR_UNSUPPORTED_EFFECT, stepIndex: i, effectType });
          }
        }
      }
    }

    const primaryCode = errorDetails.length > 0 ? errorDetails[0].code : (errors.length > 0 ? PlanErrorCodes.ERR_PLAN_INVALID : null);

    return {
      valid: errors.length === 0,
      errorCode: primaryCode,
      errors,
      errorDetails
    };
  }

  /**
   * Dry-run compile a plan against an initial project without modifying original state.
   * Guarantees 0 side effects on disk and 0 mutation to initialProject.
   */
  static dryRun(initialProject, plan) {
    const val = this.validatePlan(plan);
    if (!val.valid) {
      return {
        success: false,
        phase: 'plan_validation',
        errorCode: val.errorCode || PlanErrorCodes.ERR_PLAN_INVALID,
        errors: val.errors,
        errorDetails: val.errorDetails
      };
    }

    let candidate = structuredClone(initialProject || {});
    const executionTrace = [];

    for (let i = 0; i < plan.operations.length; i++) {
      const op = plan.operations[i];
      const res = OperationExecutor.execute(candidate, op);

      if (!res.success) {
        return {
          success: false,
          phase: 'dry_run_execution',
          errorCode: res.errorCode || PlanErrorCodes.ERR_DRY_RUN_FAILED,
          failedStepIndex: i,
          operation: op,
          error: res.error,
          trace: executionTrace
        };
      }

      candidate = res.project;
      executionTrace.push({
        stepIndex: i,
        type: op.type,
        resultingRevision: candidate.revision,
        intent: op.intent || '',
        evidenceRef: op.evidenceRef || null
      });
    }

    // Validate final candidate project invariants
    const projVal = ProjectManager.validateProject(candidate);
    return {
      success: projVal.valid,
      errors: projVal.errors,
      planId: plan.id,
      sourceAnalysisId: plan.sourceAnalysisId || null,
      stepsCount: plan.operations.length,
      finalRevision: candidate.revision,
      trace: executionTrace,
      previewProject: candidate
    };
  }

  /**
   * Compile and execute plan sequentially, returning traceable revision history.
   */
  static compileAndExecute(initialProject, plan) {
    return this.dryRun(initialProject, plan);
  }
}

module.exports = {
  PlanCompiler,
  PlanErrorCodes
};
