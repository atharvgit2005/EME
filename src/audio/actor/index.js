/**
 * Editing Mechanics Engine (EME) - Beat Actor Entry Point (Phase A3)
 * Implements end-to-end dry-run planning and transactional timeline execution.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateObject } = require('../../engine/validator.js');
const { OperationExecutor } = require('../../engine/operations.js');
const { generateCandidateCues } = require('./cue-generator.js');
const { resolveCollisions } = require('./collision-resolver.js');
const { compileCuesToOperations } = require('./operation-compiler.js');
const { SocialShortPolicy } = require('./policies/social-short.js');
const { MusicVideoPolicy } = require('./policies/music-video.js');
const { CinematicPolicy } = require('./policies/cinematic.js');

const ACTOR_PLAN_SCHEMA_PATH = path.resolve(__dirname, '../../../schema/eme-beat-actor-plan.v1.schema.json');
let cachedActorSchema = null;

function getActorPlanSchema() {
  if (!cachedActorSchema) {
    cachedActorSchema = JSON.parse(fs.readFileSync(ACTOR_PLAN_SCHEMA_PATH, 'utf8'));
  }
  return cachedActorSchema;
}

const POLICY_REGISTRY = {
  'social-short': SocialShortPolicy,
  'music-video': MusicVideoPolicy,
  'cinematic': CinematicPolicy
};

/**
 * Plans and optionally executes beat-driven timeline editing.
 * @param {object} beatAnalysis Canonical eme-beat-analysis.v1 artifact
 * @param {object} project EME project snapshot
 * @param {object} [options]
 * @param {string|object} [options.policy='social-short'] Policy ID or instance
 * @param {boolean} [options.dryRun=true] If true, generates plan without mutating project
 * @returns {{ plan: object, valid: boolean, errors: string[], executionResult?: object }}
 */
function planBeatEdits(beatAnalysis, project, options = {}) {
  const dryRun = options.dryRun !== false;

  // 1. Resolve Policy
  let policy;
  if (typeof options.policy === 'string') {
    const PolicyClass = POLICY_REGISTRY[options.policy] || SocialShortPolicy;
    policy = new PolicyClass();
  } else if (options.policy) {
    policy = options.policy;
  } else {
    policy = new SocialShortPolicy();
  }

  // 2. Generate Candidate Cues
  const candidateCues = generateCandidateCues(beatAnalysis, project, options);

  // 3. Resolve Collisions & Enforce Policy
  const { acceptedCues, diagnostics } = resolveCollisions(candidateCues, policy, project);

  // 4. Compile to EME Operations
  const compiledOperations = compileCuesToOperations(acceptedCues, project);

  // 5. Assemble Canonical eme-beat-actor-plan.v1 Artifact
  const planPayload = {
    schemaVersion: 'eme-beat-actor-plan.v1',
    planId: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    analysisRef: beatAnalysis.analysisId || 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    policy: {
      id: policy.id,
      name: policy.name,
      version: policy.version
    },
    cues: acceptedCues,
    diagnostics,
    compiledOperations,
    dryRun
  };

  const payloadJson = JSON.stringify(planPayload);
  const planHash = crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
  planPayload.planId = `sha256:${planHash}`;

  // 6. Schema Validation
  const schema = getActorPlanSchema();
  const errors = validateObject(planPayload, schema, schema);

  // 7. Optional Execution (Non-Dry-Run)
  let executionResult = null;
  if (!dryRun && errors.length === 0) {
    let currentProject = structuredClone(project);
    const executedOps = [];

    for (const op of compiledOperations) {
      const res = OperationExecutor.execute(currentProject, op);
      if (!res.success) {
        executionResult = {
          success: false,
          failedOp: op,
          error: res.error,
          project: currentProject,
          committedCount: executedOps.length
        };
        break;
      }
      currentProject = res.project;
      executedOps.push(op);
    }

    if (!executionResult) {
      executionResult = {
        success: true,
        project: currentProject,
        committedCount: executedOps.length
      };
    }
  }

  return {
    plan: planPayload,
    valid: errors.length === 0,
    errors,
    executionResult
  };
}

module.exports = {
  planBeatEdits,
  getActorPlanSchema,
  POLICY_REGISTRY,
  SocialShortPolicy,
  MusicVideoPolicy,
  CinematicPolicy
};
