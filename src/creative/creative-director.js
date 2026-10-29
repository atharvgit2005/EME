/**
 * Editing Mechanics Engine (EME) - Native Creative Director
 *
 * Coordinates the full native Creative Director lifecycle:
 * 1. Grounded creative context construction from project and media.
 * 2. Creative reasoning via authorized runtime LLM adapter.
 * 3. Validation and durable persistence of accepted Creative Plans.
 * 4. Compilation into canonical OperationPlan using verified EME operations.
 * 5. Execution strictly through OperationExecutor with zero side-channel mutations.
 * 6. Durable replay without re-calling the LLM.
 */

const { CreativeContextBuilder } = require('./creative-context-builder.js');
const { CreativePlanValidator } = require('./schema-validator.js');
const { CreativePlanCompiler } = require('./creative-plan-compiler.js');
const { PlanStore } = require('./plan-store.js');
const { IdeAgentAdapter, MockLlmAdapter } = require('./adapter/runtime-llm-adapter.js');

class CreativeDirector {
  constructor(options = {}) {
    this.planStore = options.planStore || new PlanStore(options);
    if (options.llmAdapter) {
      this.llmAdapter = options.llmAdapter;
    } else if (options.useMock === true || options.mock === true || (process.env.EME_TEST_MOCK_LLM === '1' && !options.ideAgent)) {
      this.llmAdapter = new MockLlmAdapter(options);
    } else {
      this.llmAdapter = new IdeAgentAdapter(options);
    }
  }

  /**
   * Directly accept and persist an authoritative Creative Plan supplied by the Antigravity IDE agent.
   *
   * @param {object} params
   * @param {object} params.creativePlan IDE-generated plan
   * @param {object} params.project Project snapshot
   * @param {string} [params.brief] Optional brief text
   * @param {object} [options]
   * @returns {{ success: boolean, creativePlan: object, persistedPath: string, context: object }}
   */
  acceptPlan({
    creativePlan,
    project,
    brief = null,
    vtsmSidecar = null,
    transcript = null,
    beatAnalysis = null,
    availableAssets = [],
    options = {}
  }) {
    if (!creativePlan || typeof creativePlan !== 'object') {
      throw new Error('Valid creativePlan object is required');
    }
    if (!project) throw new Error('Project snapshot is required');

    const context = CreativeContextBuilder.buildContext({
      brief: brief || creativePlan.creative_intent?.goal || 'Antigravity IDE Creative Plan',
      project,
      vtsmSidecar,
      transcript,
      beatAnalysis,
      availableAssets
    });

    let validatedPlan;
    if (this.llmAdapter && typeof this.llmAdapter.acceptPlan === 'function') {
      validatedPlan = this.llmAdapter.acceptPlan({ plan: creativePlan, context });
    } else {
      const validation = CreativePlanValidator.validate(creativePlan, project);
      if (!validation.valid) {
        const err = new Error(`Creative Plan failed validation:\n${validation.errors.join('; ')}`);
        err.validationErrors = validation.errors;
        throw err;
      }
      validatedPlan = creativePlan;
    }

    const acceptedValidation = CreativePlanValidator.validate(validatedPlan, project);
    if (!acceptedValidation.valid) throw new Error(acceptedValidation.errors.join('; '));
    const persistedPath = this.planStore.savePlan(validatedPlan);

    return {
      success: true,
      creativePlan: validatedPlan,
      persistedPath,
      context
    };
  }

  /**
   * Produce and persist a validated Creative Plan from brief and project data.
   * In IDE mode, if creativePlan is provided, it validates and accepts it directly.
   * If invoked without a plan when using IdeAgentAdapter, fails closed with ERR_IDE_ORCHESTRATOR_UNAVAILABLE.
   */
  async producePlan({
    brief,
    project,
    creativePlan = null,
    vtsmSidecar = null,
    transcript = null,
    beatAnalysis = null,
    availableAssets = [],
    options = {}
  }) {
    if (!project) throw new Error('Project snapshot is required');

    if (creativePlan) {
      return this.acceptPlan({
        creativePlan,
        project,
        brief,
        vtsmSidecar,
        transcript,
        beatAnalysis,
        availableAssets,
        options
      });
    }

    // 1. Build Grounded Context
    const context = CreativeContextBuilder.buildContext({
      brief,
      project,
      vtsmSidecar,
      transcript,
      beatAnalysis,
      availableAssets
    });

    // 2. Generate Plan via Runtime LLM (or IdeAgentAdapter fail-closed)
    const generatedPlan = await this.llmAdapter.generateCreativePlan({
      context,
      signal: options.signal,
      options
    });

    // 3. Persist Accepted Plan
    const generatedValidation = CreativePlanValidator.validate(generatedPlan, project);
    if (!generatedValidation.valid) throw new Error(generatedValidation.errors.join('; '));
    const persistedPath = this.planStore.savePlan(generatedPlan);

    return {
      success: true,
      creativePlan: generatedPlan,
      persistedPath,
      context
    };
  }

  /**
   * Replay an existing, previously accepted plan by ID without invoking the LLM.
   *
   * @param {string} planId
   * @returns {object} The previously accepted Creative Plan
   */
  loadPersistedPlan(planId) {
    return this.planStore.getPlan(planId);
  }

  /**
   * Compile a creative plan into a canonical declarative OperationPlan.
   *
   * @param {object} params
   * @param {object|string} params.creativePlan Plan object or planId string
   * @param {object} params.project Canonical EME project snapshot
   * @returns {{ success: boolean, operationPlan: object | null, dryRunResult: object | null, errors: string[] }}
   */
  compile({ creativePlan, project, options = {} }) {
    let resolvedPlan = creativePlan;
    if (typeof creativePlan === 'string') {
      resolvedPlan = this.planStore.getPlan(creativePlan);
    }
    return CreativePlanCompiler.compile({ creativePlan: resolvedPlan, project, options });
  }

  /**
   * Execute the sealed operations reviewed through ApprovalAuthority against a project.
   * Atomic commit: all mutations flow strictly through OperationExecutor.
   *
   * @param {object} params
   * @param {object|string} params.creativePlan Plan object or planId
   * @param {object} params.project Project to mutate
   * @param {object} [options]
   * @returns {{
   *   success: boolean,
   *   project: object,
   *   operationPlan: object,
   *   executedSteps: number,
   *   error?: string
   * }}
   */
  execute({ creativePlan, project, options, approvalToken, projectPath, storageDir }) {
    let resolvedPlan = creativePlan;
    if (typeof creativePlan === 'string') resolvedPlan = this.planStore.getPlan(creativePlan);
    return require('./execution-authority.js').ExecutionAuthority.execute({
      creativePlan: resolvedPlan, project, options, approvalToken, projectPath, storageDir
    });
  }

}

module.exports = {
  CreativeDirector
};
