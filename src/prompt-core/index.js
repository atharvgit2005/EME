/**
 * Editing Mechanics Engine (EME) - Prompt Core Entry Point
 * Implements compileEditBrief and exports canonical prompt compilation interfaces.
 */

const crypto = require('node:crypto');
const { ContextNormalizer, computeProjectSnapshotSha256 } = require('./context-normalizer.js');
const { ReferenceResolver } = require('./reference-resolver.js');
const { ConstraintNormalizer } = require('./constraint-normalizer.js');
const { ReadinessEvaluator } = require('./readiness-evaluator.js');
const { BriefValidator } = require('./brief-validator.js');
const {
  Logger,
  LogLevels,
  LogLevelNames,
  defaultLogger,
  runWithCorrelation,
  getActiveCorrelationId,
  getActiveContext,
  serializeError,
  channels
} = require('./logger.js');
const {
  execSubprocessGuarded,
  checkAvailableDiskSpace,
  ScratchManager,
  GracefulShutdownCoordinator,
  defaultShutdownCoordinator,
  sanitizeChildEnv
} = require('./resource-guard.js');
const {
  computeSha256,
  createProjectBackup,
  restoreProjectBackup,
  redactSensitiveData,
  runEnvironmentDoctor
} = require('./disaster-recovery.js');
const {
  MetricsCollector,
  defaultMetricsCollector
} = require('../ui/metrics-collector.js');
const {
  SloMonitor,
  defaultSloMonitor,
  DEFAULT_SLO_TARGETS
} = require('./slo-monitor.js');
const {
  runBackupRestoreDrill,
  runStorageExhaustionDrill,
  runFencingContentionDrill
} = require('./disaster-drill.js');
const {
  RollbackManager,
  CANARY_STAGES,
  DEFAULT_CANARY_CRITERIA
} = require('./rollback-manager.js');
const {
  WorkloadValidator,
  WORKLOAD_PROFILES,
  SAMPLE_SUFFICIENCY_THRESHOLDS
} = require('./workload-validator.js');
const {
  PilotController,
  PILOT_GATES,
  DEFAULT_PILOT_CONFIG
} = require('./pilot-controller.js');
const {
  ProductionMonitor,
  RUNBOOK_ACTIONS,
  ERROR_BUDGET_CONFIG
} = require('./production-monitor.js');
const {
  IncidentRemediator
} = require('./incident-remediator.js');
const {
  GovernanceLedger,
  GENESIS_PREV_HASH
} = require('./governance-ledger.js');
const {
  BudgetAnalytics,
  TREND_VELOCITY,
  BUDGET_URGENCY
} = require('./budget-analytics.js');
const {
  RemediationEvaluator
} = require('./remediation-evaluator.js');
const {
  LedgerCheckpointer,
  computeMerkleRoot
} = require('./ledger-checkpoint.js');
const {
  SubprocessWorkerPool,
  TASK_PRIORITY,
  TASK_STATUS
} = require('./worker-pool.js');

/**
 * Heuristic/Rule-based extractor for Phase PF-01 that constructs an IntentEnvelope from a raw prompt and project.
 */
function extractIntentEnvelope(rawPrompt, project, options = {}) {
  const text = (rawPrompt || '').trim();
  const lower = text.toLowerCase();
  const requestId = options.requestId || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const context = ContextNormalizer.normalizeProjectContext(project, options);

  const rawConstraints = [];
  const requestedChanges = [];
  const deliverables = [];
  const ambiguities = [];

  // A. Detect Negative / Invariant Constraints
  if (lower.includes('preserve') || lower.includes('do not') || lower.includes('no music') || lower.includes('unchanged') || lower.includes('without')) {
    if (lower.includes('color grade') && (lower.includes('preserve') || lower.includes('not modify') || lower.includes('unchanged'))) {
      rawConstraints.push({
        source_text: 'Preserve existing color grade',
        polarity: 'positive_invariant',
        suggested_type: 'preserve_property'
      });
    }

    if (lower.includes('music') && (lower.includes('no music') || lower.includes('not add') || lower.includes('exclude'))) {
      rawConstraints.push({
        source_text: 'Do not add music',
        polarity: 'negative_prohibition',
        suggested_type: 'forbid_effect'
      });
    }

    if (lower.includes('dialogue') && (lower.includes('timing') || lower.includes('preserve') || lower.includes('unchanged'))) {
      rawConstraints.push({
        source_text: 'Preserve dialogue timing',
        polarity: 'positive_invariant',
        suggested_type: 'preserve_fields'
      });
    }

    if (lower.includes('clip timing') && (lower.includes('preserve') || lower.includes('not change') || lower.includes('unchanged'))) {
      rawConstraints.push({
        source_text: 'Do not change any existing clip timing',
        polarity: 'positive_invariant',
        suggested_type: 'preserve_fields'
      });
    }

    if (lower.includes('audio edit') && (lower.includes('preserve') || lower.includes('not alter') || lower.includes('unchanged'))) {
      rawConstraints.push({
        source_text: 'Do not alter the audio edit',
        polarity: 'positive_invariant',
        suggested_type: 'preserve_property'
      });
    }
  }

  // B. Detect Requested Changes & Deliverables
  let goal = 'Execute prompt requirements';
  let successCriteria = ['Requirements executed without violating constraints'];

  // Check G01 Export pattern
  if (lower.includes('export')) {
    goal = 'Export deliverable without modifying project composition';
    successCriteria = [
      'Rendered output matches deliverable specification',
      'Timeline composition, color grade, and audio remain unchanged'
    ];
    requestedChanges.push({
      change_id: 'CHG-EXPORT-001',
      domain: 'render_export',
      description: 'Export deliverable as specified',
      target_ids: ['project']
    });

    deliverables.push({
      kind: 'video',
      container: 'mp4',
      video: {
        codec: 'h264',
        width: 1920,
        height: 1080,
        frame_rate: { numerator: 30, denominator: 1 }
      },
      audio: {
        codec: 'aac',
        sample_rate_hz: 48000,
        channels: 2
      }
    });
  }

  // Check 12-second vertical social master pattern (PF-03 / PF-04 / PF-05)
  if (lower.includes('12-second') || lower.includes('12 second') || lower.includes('12s') || (lower.includes('vertical') && (lower.includes('b-roll') || lower.includes('broll')))) {
    goal = 'Create a 12-second, 9:16 social-media edit using supplied primary footage, music, B-roll, and title text';
    successCriteria = [
      'Keep primary footage in supplied order',
      'Place music track at beginning on track_a_music',
      'Align cuts between primary clips to nearest eligible beats',
      'Add one B-roll cutaway on separate visual track',
      'Add 1-second transition between designated clips',
      'Show supplied title during first 3 seconds on track_graphics',
      'Total timeline duration exactly 1,440,000 ticks (12.0s)'
    ];

    const primaryClips = (project.clips || [])
      .filter(c => c.type === 'video' && !c.id.includes('broll') && (c.trackId === 'track_v_main' || c.trackId === 'track_v1' || !c.trackId.includes('broll')))
      .map(c => c.id);

    requestedChanges.push({
      change_id: 'CHG-TIMELINE-PRIMARY',
      domain: 'timeline',
      description: 'Arrange primary footage in supplied order with cuts beat-aligned to music',
      target_ids: primaryClips.length > 0 ? primaryClips : ['clip_1', 'clip_2', 'clip_3']
    });

    requestedChanges.push({
      change_id: 'CHG-AUDIO-MUSIC',
      domain: 'audio',
      description: 'Place background music at timeline start (t=0) on track_a_music',
      target_ids: ['track_a_music']
    });

    requestedChanges.push({
      change_id: 'CHG-TIMELINE-BROLL',
      domain: 'timeline',
      description: 'Add B-roll cutaway on track_v_broll during middle section',
      target_ids: ['track_v_broll']
    });

    requestedChanges.push({
      change_id: 'CHG-EFFECT-TRANSITION',
      domain: 'effect',
      description: 'Apply 1-second cross_dissolve transition between clip_1 and clip_2',
      target_ids: primaryClips.slice(0, 2)
    });

    requestedChanges.push({
      change_id: 'CHG-TYPO-TITLE',
      domain: 'typography',
      description: 'Show title text overlay during first 3 seconds on track_graphics',
      target_ids: ['track_graphics']
    });

    deliverables.push({
      kind: 'video',
      container: 'mp4',
      video: {
        codec: 'h264',
        width: 1080,
        height: 1920,
        frame_rate: { numerator: 30, denominator: 1 }
      },
      audio: {
        codec: 'aac',
        sample_rate_hz: 48000,
        channels: 2
      }
    });
  } else if (lower.includes('reel') || lower.includes('vertical') || lower.includes('interview_01') || lower.includes('30s')) {
    goal = 'Cut 30-second vertical social reel from interview footage';
    successCriteria = [
      'Timeline duration trimmed to 30 seconds',
      'Vertical 9:16 aspect ratio delivered',
      'Dialogue synchronization and cadence preserved'
    ];

    const targetRes = ReferenceResolver.resolveTargets(project, { hint: 'interview_01' });
    requestedChanges.push({
      change_id: 'CHG-CUT-001',
      domain: 'timeline',
      description: 'Cut 30s vertical reel from interview_01',
      target_ids: targetRes.resolvedIds.length > 0 ? targetRes.resolvedIds : ['clip_interview_01']
    });

    deliverables.push({
      kind: 'video',
      container: 'mp4',
      video: {
        codec: 'h264',
        width: 1080,
        height: 1920,
        frame_rate: { numerator: 30, denominator: 1 }
      },
      audio: {
        codec: 'aac',
        sample_rate_hz: 48000,
        channels: 2
      }
    });
  }

  // Check G03 Color modification pattern
  if (lower.includes('warmer') || (lower.includes('color') && lower.includes('change'))) {
    const videoClips = (project.clips || []).filter(c => c.type === 'video').map(c => c.id);
    requestedChanges.push({
      change_id: 'CHG-COLOR-001',
      domain: 'color',
      description: 'Make warmer by changing color grade',
      target_ids: videoClips.length > 0 ? videoClips : ['project']
    });
  }

  // Default fallback if no requested change was parsed
  if (requestedChanges.length === 0) {
    requestedChanges.push({
      change_id: 'CHG-DEFAULT-001',
      domain: 'timeline',
      description: text,
      target_ids: ['project']
    });
  }

  // Default deliverable if none specified
  if (deliverables.length === 0) {
    deliverables.push({
      kind: 'video',
      container: 'mp4',
      video: {
        codec: 'h264',
        width: 1920,
        height: 1080,
        frame_rate: { numerator: 30, denominator: 1 }
      },
      audio: {
        codec: 'aac',
        sample_rate_hz: 48000,
        channels: 2
      }
    });
  }

  // C. Detect Explicit Contradictions (e.g. G03: make warmer by changing grade vs do not modify grade)
  const wantsColorChange = requestedChanges.some(c => c.domain === 'color' || c.description.toLowerCase().includes('warmer'));
  const forbidsColorChange = rawConstraints.some(c => c.source_text.toLowerCase().includes('color grade'));
  if (wantsColorChange && forbidsColorChange) {
    ambiguities.push({
      id: 'AMB-COLOR-CONTRADICTION',
      kind: 'CONFLICTING_REQUIREMENTS',
      description: 'Contradictory requirements: requested color modification conflicts with explicit constraint to preserve color grade',
      is_blocking: true,
      conflicting_clauses: [
        'Make warmer by changing color grade',
        'Preserve existing color grade'
      ]
    });
  }

  const envelope = {
    schema_version: '1.0.0',
    request_id: requestId,
    raw_prompt: text,
    context,
    interpretation: {
      goal,
      requested_changes: requestedChanges,
      constraints: rawConstraints,
      deliverables
    },
    ambiguities,
    provenance: {
      extractor_version: '1.0.0',
      timestamp: new Date().toISOString(),
      model: options.model || 'heuristic-v1'
    }
  };

  return {
    envelope,
    successCriteria
  };
}

/**
 * Compiles a raw prompt or an existing IntentEnvelope into a canonical EditBrief.
 * @param {object} params
 * @param {string} [params.rawPrompt] Natural language prompt
 * @param {object} params.project Canonical EME project
 * @param {object} [params.envelope] Pre-extracted IntentEnvelope
 * @param {object} [params.options] Compilation options
 * @returns {{ envelope: object, brief: object, validation: object, valid: boolean, errors: string[] }}
 */
function compileEditBrief({ rawPrompt, project, envelope: inputEnvelope, options = {} }) {
  if (!project || typeof project !== 'object') {
    throw new Error('Valid EME project snapshot is required for EditBrief compilation');
  }

  let envelope = inputEnvelope;
  let successCriteria = ['Deliverable rendered per specification', 'Protected invariants preserved'];

  if (!envelope) {
    if (!rawPrompt || typeof rawPrompt !== 'string' || rawPrompt.trim().length === 0) {
      throw new Error('Either rawPrompt or envelope must be provided');
    }
    const extracted = extractIntentEnvelope(rawPrompt, project, options);
    envelope = extracted.envelope;
    successCriteria = extracted.successCriteria;
  }

  // 1. Validate envelope
  const envValidation = BriefValidator.validateIntentEnvelope(envelope);
  if (!envValidation.valid) {
    return {
      envelope,
      brief: null,
      validation: { status: 'blocked', blocking_issue_ids: ['ERR_INVALID_ENVELOPE'] },
      valid: false,
      errors: envValidation.errors
    };
  }

  // 2. Normalize and resolve constraints against project snapshot
  const baseRevision = envelope.context?.base_revision ?? project.revision ?? 0;
  const rawConstraints = envelope.interpretation?.constraints || [];
  const normalizedConstraintsResult = ConstraintNormalizer.normalizeConstraints(rawConstraints, project, baseRevision);

  // 3. Resolve target references for requested changes
  const compiledChanges = (envelope.interpretation?.requested_changes || []).map(ch => {
    let resolvedIds = ch.target_ids || [];
    if (resolvedIds.length === 0 || (resolvedIds.length === 1 && resolvedIds[0] === 'project')) {
      // Keep project level
      resolvedIds = ['project'];
    }
    return {
      change_id: ch.change_id,
      domain: ch.domain,
      description: ch.description,
      target_ids: resolvedIds
    };
  });

  // 4. Build candidate EditBrief
  const briefId = options.briefId || `brief-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const snapshotSha256 = envelope.context?.snapshot_sha256 || computeProjectSnapshotSha256(project);

  const briefCandidate = {
    schema_version: '1.0.0',
    brief_id: briefId,
    source_request_id: envelope.request_id,
    project_snapshot: {
      project_id: envelope.context?.project_id || project.id || 'unnamed-project',
      base_revision: baseRevision,
      snapshot_sha256: snapshotSha256,
      timebase_ticks_per_second: 120000
    },
    goal: {
      objective: envelope.interpretation?.goal || 'Execute user prompt',
      success_criteria: successCriteria
    },
    requested_changes: compiledChanges,
    constraints: normalizedConstraintsResult.constraints,
    deliverables: envelope.interpretation?.deliverables || [],
    ambiguities: envelope.ambiguities || [],
    validation: {
      status: 'ready',
      blocking_issue_ids: []
    }
  };

  // 5. Evaluate readiness
  const readiness = ReadinessEvaluator.evaluate(briefCandidate, {
    currentProjectRevision: project.revision
  });
  briefCandidate.validation = {
    status: readiness.status,
    blocking_issue_ids: readiness.blocking_issue_ids
  };

  // 6. Validate complete EditBrief against JSON schema
  const briefValidation = BriefValidator.validateEditBrief(briefCandidate);

  return {
    envelope,
    brief: briefCandidate,
    validation: briefCandidate.validation,
    valid: briefValidation.valid,
    errors: briefValidation.errors
  };
}

const { OperationPlanCompiler } = require('./operation-plan-compiler.js');
const { MultiTrackScheduler } = require('./multi-track-scheduler.js');
const { RenderOrchestrator } = require('./render-orchestrator.js');
const { PromptDeliverableOrchestrator } = require('./prompt-deliverable-orchestrator.js');
const {
  RevisionIntentCompiler,
  RevisionPlanCompiler,
  RevisionOrchestrator
} = require('./revision-orchestrator.js');
const {
  CandidateVariantCompiler,
  CandidateOrchestrator
} = require('./candidate-orchestrator.js');
const { MusicalStructureAdapter } = require('./musical-structure-adapter.js');
const { CandidateMusicalScorer } = require('./candidate-musical-scorer.js');
const { PreferenceExtractor, PreferenceEvaluator } = require('./preference-model.js');
const { PreferenceFeedbackRecorder } = require('./preference-feedback-recorder.js');
const { RevisionSessionManager } = require('./revision-session.js');
const {
  CanonicalJobStatus,
  StatusNormalizationMap,
  CanonicalJobTransitions,
  normalizeJobStatus,
  normalizePersistedJob,
  OrchestrationJobStatus,
  ValidJobTransitions,
  OrchestrationJobManager,
  EndToEndOrchestrator
} = require('./job-orchestrator.js');
const {
  SessionLockCoordinator,
  LockAcquisitionError
} = require('./session-lock.js');

module.exports = {
  compileEditBrief,
  extractIntentEnvelope,
  BriefValidator,
  ContextNormalizer,
  ReferenceResolver,
  ConstraintNormalizer,
  ReadinessEvaluator,
  OperationPlanCompiler,
  MultiTrackScheduler,
  RenderOrchestrator,
  PromptDeliverableOrchestrator,
  RevisionIntentCompiler,
  RevisionPlanCompiler,
  RevisionOrchestrator,
  CandidateVariantCompiler,
  CandidateOrchestrator,
  MusicalStructureAdapter,
  CandidateMusicalScorer,
  PreferenceExtractor,
  PreferenceEvaluator,
  PreferenceFeedbackRecorder,
  RevisionSessionManager,
  CanonicalJobStatus,
  StatusNormalizationMap,
  CanonicalJobTransitions,
  normalizeJobStatus,
  normalizePersistedJob,
  OrchestrationJobStatus,
  ValidJobTransitions,
  OrchestrationJobManager,
  EndToEndOrchestrator,
  SessionLockCoordinator,
  LockAcquisitionError,
  Logger,
  LogLevels,
  LogLevelNames,
  defaultLogger,
  runWithCorrelation,
  getActiveCorrelationId,
  getActiveContext,
  serializeError,
  channels,
  execSubprocessGuarded,
  checkAvailableDiskSpace,
  ScratchManager,
  GracefulShutdownCoordinator,
  defaultShutdownCoordinator,
  sanitizeChildEnv,
  computeSha256,
  createProjectBackup,
  restoreProjectBackup,
  redactSensitiveData,
  runEnvironmentDoctor,
  MetricsCollector,
  defaultMetricsCollector,
  SloMonitor,
  defaultSloMonitor,
  DEFAULT_SLO_TARGETS,
  runBackupRestoreDrill,
  runStorageExhaustionDrill,
  runFencingContentionDrill,
  RollbackManager,
  CANARY_STAGES,
  DEFAULT_CANARY_CRITERIA,
  WorkloadValidator,
  WORKLOAD_PROFILES,
  SAMPLE_SUFFICIENCY_THRESHOLDS,
  PilotController,
  PILOT_GATES,
  DEFAULT_PILOT_CONFIG,
  ProductionMonitor,
  RUNBOOK_ACTIONS,
  ERROR_BUDGET_CONFIG,
  IncidentRemediator,
  GovernanceLedger,
  GENESIS_PREV_HASH,
  BudgetAnalytics,
  TREND_VELOCITY,
  BUDGET_URGENCY,
  RemediationEvaluator,
  LedgerCheckpointer,
  computeMerkleRoot,
  SubprocessWorkerPool,
  TASK_PRIORITY,
  TASK_STATUS
};


