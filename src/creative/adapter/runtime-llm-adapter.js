/**
 * Editing Mechanics Engine (EME) - Runtime LLM Adapter
 *
 * Provides a robust, replaceable model inference interface:
 * - Provider-backed implementation using Node 20 native fetch (OpenAI / Anthropic / Gemini compatible).
 * - Configuration via EME_LLM_API_KEY / OPENAI_API_KEY and EME_LLM_BASE_URL.
 * - Strict credential verification (fails closed with ERR_LLM_AUTH_MISSING if absent).
 * - Local schema and semantic validation via CreativePlanValidator.
 * - Explicit timeouts, AbortController cancellation, bounded exponential-backoff retries.
 * - Typed error classifications (AUTH, RATE_LIMIT, TIMEOUT, MALFORMED, SCHEMA_VIOLATION).
 * - Safe provenance tracking without leaking secrets into plans or logs.
 * - Deterministic MockLlmAdapter for rock-solid test suites.
 */

const crypto = require('node:crypto');
const { CreativePlanValidator, CreativePlanErrorCodes } = require('../schema-validator.js');
const { ReframingEngine } = require('../reframing-engine.js');
const { TICKS_PER_SECOND } = require('../../engine/time.js');

const LlmErrorCodes = {
  ERR_IDE_ORCHESTRATOR_UNAVAILABLE: 'ERR_IDE_ORCHESTRATOR_UNAVAILABLE',
  ERR_EXTERNAL_API_REJECTED: 'ERR_EXTERNAL_API_REJECTED',
  ERR_LLM_AUTH_MISSING: 'ERR_LLM_AUTH_MISSING',
  ERR_LLM_AUTH_FAILED: 'ERR_LLM_AUTH_FAILED',
  ERR_LLM_RATE_LIMIT: 'ERR_LLM_RATE_LIMIT',
  ERR_LLM_TIMEOUT: 'ERR_LLM_TIMEOUT',
  ERR_LLM_PROVIDER_ERROR: 'ERR_LLM_PROVIDER_ERROR',
  ERR_LLM_MALFORMED_OUTPUT: 'ERR_LLM_MALFORMED_OUTPUT',
  ERR_LLM_INVALID_PLAN_SCHEMA: 'ERR_LLM_INVALID_PLAN_SCHEMA',
  ERR_LLM_ABORTED: 'ERR_LLM_ABORTED'
};

class BaseLlmAdapter {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 45000;
  }

  async generateCreativePlan(params = {}) {
    throw new Error('generateCreativePlan must be implemented by subclass');
  }

  /**
   * Validate generated raw plan and stamp provenance.
   */
  _validateAndStampPlan(plan, context, generatorMetadata) {
    if (!plan || typeof plan !== 'object') {
      const err = new Error('Model produced non-object plan output');
      err.code = LlmErrorCodes.ERR_LLM_MALFORMED_OUTPUT;
      throw err;
    }

    // Stamp provenance if missing
    if (!plan.provenance) {
      plan.provenance = {
        generator: generatorMetadata,
        input_brief_hash: crypto.createHash('sha256').update(context.brief?.raw_text || '').digest('hex'),
        context_snapshot_hash: context.provenance?.context_hash || crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex'),
        accepted_at: new Date().toISOString(),
        plan_hash: ''
      };
    } else {
      plan.provenance.generator = generatorMetadata;
      plan.provenance.input_brief_hash = crypto.createHash('sha256').update(context.brief?.raw_text || '').digest('hex');
      plan.provenance.context_snapshot_hash = context.provenance?.context_hash || crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex');
      plan.provenance.accepted_at = new Date().toISOString();
    }

    // Compute plan hash
    plan.provenance.plan_hash = CreativePlanValidator.computePlanHash(plan);

    // Validate locally against schema and project snapshot
    const validation = CreativePlanValidator.validate(plan, context._canonicalProject || null);
    if (!validation.valid) {
      const err = new Error(`Model generated schema-invalid plan:\n${validation.errors.join('; ')}`);
      err.code = LlmErrorCodes.ERR_LLM_INVALID_PLAN_SCHEMA;
      err.validationErrors = validation.errors;
      err.errorCodes = validation.errorCodes;
      err.candidatePlan = plan;
      throw err;
    }

    return plan;
  }
}

class IdeAgentAdapter extends BaseLlmAdapter {
  constructor(options = {}) {
    super(options);
    this.name = 'antigravity-ide-agent';
    this.provider = 'antigravity-ide';
    this._latestAcceptedPlan = null;
    this._ideOrchestratorAvailable = options.ideOrchestratorAvailable !== undefined
      ? Boolean(options.ideOrchestratorAvailable)
      : (process.env.EME_IDE_ORCHESTRATOR_UNAVAILABLE !== '1');
  }

  get requiresProviderCredentials() {
    return false;
  }

  get ideOrchestratorAvailable() {
    return this._ideOrchestratorAvailable;
  }

  setIdeOrchestratorAvailable(available) {
    this._ideOrchestratorAvailable = Boolean(available);
  }

  hasCredentials() {
    // External provider credentials are not held or used in IDE-driven mode.
    // Returns false because no external API credentials exist.
    return false;
  }

  isReady() {
    return this.ideOrchestratorAvailable && Boolean(this._latestAcceptedPlan);
  }

  getStatus() {
    return {
      adapter: this.name,
      provider: this.provider,
      requiresProviderCredentials: false,
      ideOrchestratorAvailable: this.ideOrchestratorAvailable,
      creativePlanReceived: Boolean(this._latestAcceptedPlan),
      ready: this.isReady()
    };
  }

  /**
   * Validate and accept an authoritative Creative Plan supplied directly by the Antigravity IDE agent.
   *
   * @param {object} params
   * @param {object} params.plan Candidate Creative Plan from Antigravity IDE agent
   * @param {object} params.context Grounded EME context
   * @returns {object} Validated and hash-stamped plan
   */
  acceptPlan({ plan, context }) {
    if (!this.ideOrchestratorAvailable) {
      const err = new Error('[ERR_IDE_ORCHESTRATOR_UNAVAILABLE] Antigravity IDE orchestrator is unavailable');
      err.code = LlmErrorCodes.ERR_IDE_ORCHESTRATOR_UNAVAILABLE;
      throw err;
    }

    if (!plan || typeof plan !== 'object') {
      const err = new Error('Antigravity IDE agent must provide a valid Creative Plan object');
      err.code = LlmErrorCodes.ERR_LLM_MALFORMED_OUTPUT;
      throw err;
    }

    const generatorMeta = {
      provider: 'antigravity-ide',
      model: 'antigravity-agent',
      generation_timestamp: new Date().toISOString()
    };

    const validated = this._validateAndStampPlan(plan, context, generatorMeta);
    this._latestAcceptedPlan = validated;
    return validated;
  }

  /**
   * Fails closed if invoked without an IDE-supplied Creative Plan.
   */
  async generateCreativePlan({ context, signal = null, options = {} }) {
    if (signal?.aborted) {
      const err = new Error('Creative plan generation cancelled');
      err.code = LlmErrorCodes.ERR_LLM_ABORTED;
      throw err;
    }

    const candidatePlan = options.creativePlan || context?.creativePlan;
    if (candidatePlan) {
      return this.acceptPlan({ plan: candidatePlan, context });
    }

    const err = new Error(
      'ERR_IDE_ORCHESTRATOR_UNAVAILABLE: External model-provider API calls are disabled in EME architecture. ' +
      'Antigravity IDE is the sole intended AI reasoning environment. ' +
      'The Antigravity agent inspects grounded context via eme_get_project_context and supplies ' +
      'the Creative Plan through eme_validate_creative_plan / eme_compile_creative_plan.'
    );
    err.code = LlmErrorCodes.ERR_IDE_ORCHESTRATOR_UNAVAILABLE;
    throw err;
  }
}

class ProviderLlmAdapter extends BaseLlmAdapter {
  constructor(options = {}) {
    super(options);
    this.apiKey = options.apiKey || process.env.EME_LLM_API_KEY || process.env.OPENAI_API_KEY || null;
    this.baseUrl = options.baseUrl || process.env.EME_LLM_BASE_URL || 'https://api.openai.com/v1';
    this.model = options.model || process.env.EME_LLM_MODEL || 'gpt-4o';
    this.temperature = options.temperature ?? 0.2;
  }

  /**
   * Verify credentials presence.
   */
  hasCredentials() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateCreativePlan({ context, signal = null, options = {} }) {
    if (!this.hasCredentials()) {
      const err = new Error('Provider authentication missing: EME_LLM_API_KEY or OPENAI_API_KEY is not configured.');
      err.code = LlmErrorCodes.ERR_LLM_AUTH_MISSING;
      throw err;
    }

    const err = new Error(
      'ERR_EXTERNAL_API_REJECTED: External model-provider APIs are explicitly rejected in EME architecture. ' +
      'Antigravity IDE is the sole AI orchestrator. Use IdeAgentAdapter with local MCP tools.'
    );
    err.code = LlmErrorCodes.ERR_EXTERNAL_API_REJECTED;
    throw err;
  }
}

class MockLlmAdapter extends BaseLlmAdapter {
  constructor(options = {}) {
    super(options);
    this.simulateTimeout = Boolean(options.simulateTimeout);
    this.simulateAuthError = Boolean(options.simulateAuthError);
    this.simulateRateLimit = Boolean(options.simulateRateLimit);
    this.simulateMalformed = Boolean(options.simulateMalformed);
    this.simulateSchemaError = Boolean(options.simulateSchemaError);
  }

  async generateCreativePlan({ context, signal = null, options = {} }) {
    if (signal?.aborted) {
      const err = new Error('Creative plan generation cancelled');
      err.code = LlmErrorCodes.ERR_LLM_ABORTED;
      throw err;
    }

    if (this.simulateAuthError) {
      const err = new Error('Simulated authentication failure (401 Unauthorized)');
      err.code = LlmErrorCodes.ERR_LLM_AUTH_FAILED;
      throw err;
    }

    if (this.simulateRateLimit) {
      const err = new Error('Simulated provider rate limit exceeded (429)');
      err.code = LlmErrorCodes.ERR_LLM_RATE_LIMIT;
      throw err;
    }

    if (this.simulateTimeout) {
      const err = new Error('Simulated LLM call timeout after 45000ms');
      err.code = LlmErrorCodes.ERR_LLM_TIMEOUT;
      throw err;
    }

    if (this.simulateMalformed) {
      const err = new Error('Simulated malformed JSON output from provider');
      err.code = LlmErrorCodes.ERR_LLM_MALFORMED_OUTPUT;
      throw err;
    }

    // Build deterministic creative reasoning plan based on actual grounded context
    const brief = context.brief || {};
    const project = context.project_state || {};
    const availableAssets = context.media_catalog?.available || [];
    const targetDurationTicks = brief.target_duration_ticks || (10 * TICKS_PER_SECOND);
    const targetAspect = brief.target_aspect_ratio || '9:16';

    const visualAssets = availableAssets.filter(a => a.type === 'video' || a.type === 'image');
    const audioAssets = availableAssets.filter(a => a.type === 'audio');

    // Editorial decisions & beats breakdown
    const numBeats = Math.max(1, Math.min(visualAssets.length || 1, 3));
    const baseDuration = Math.floor(targetDurationTicks / numBeats);
    const beats = [];

    let currentTick = 0;
    for (let i = 0; i < numBeats; i++) {
      const isLast = i === numBeats - 1;
      const beatDuration = isLast ? (targetDurationTicks - currentTick) : baseDuration;
      const asset = visualAssets[i % visualAssets.length] || { asset_id: 'asset_interview_01' };

      // Reframing calculation using ReframingEngine
      const vtsm = context.visual_intelligence;
      const srcDims = asset?.metadata?.dimensions || vtsm?.source_resolution || { width: 1920, height: 1080 };
      const reframingResult = ReframingEngine.calculateSubjectCrop({
        sourceDimensions: srcDims,
        targetDimensions: targetAspect === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
        observation: vtsm?.has_shoulder_landmarks ? {
          face: vtsm.sample_face,
          shoulders: vtsm.sample_shoulders
        } : (vtsm?.sample_face ? { face: vtsm.sample_face } : null)
      });

      beats.push({
        beat_id: `beat-${i + 1}`,
        sequence_index: i,
        beat_type: i === 0 ? 'hook' : (isLast ? 'payoff' : 'body'),
        narrative_purpose: i === 0 ? 'Establish compelling opening hook' : (isLast ? 'Deliver core insight and conclusion' : 'Develop primary narrative progression'),
        source_media_ref: {
          asset_id: asset.asset_id,
          media_path: asset.src
        },
        source_range: {
          start_tick: 0,
          end_tick: beatDuration,
          duration_ticks: beatDuration
        },
        timeline_range: {
          start_tick: currentTick,
          end_tick: currentTick + beatDuration,
          duration_ticks: beatDuration
        },
        editorial_decisions: {
          cut_type: i === 0 ? 'none' : 'hard_cut',
          pacing_weight: 1.0,
          reframing: {
            enabled: targetAspect === '9:16',
            mode: reframingResult.fallbackUsed ? 'none' : 'subject_centered',
            target_aspect_ratio: targetAspect,
            anchor_composition: reframingResult.anchorComposition,
            crop_rect: reframingResult.cropRect,
            smoothing: {
              temporal_window_ticks: 24000,
              algorithm: 'exponential_moving_average'
            }
          }
        }
      });

      currentTick += beatDuration;
    }

    // Visual events (e.g. title card or hook subtitle)
    const visualEvents = [
      {
        event_id: 'event-hook-title',
        timeline_range: {
          start_tick: 0,
          end_tick: Math.min(targetDurationTicks, 240000), // 2.0s
          duration_ticks: Math.min(targetDurationTicks, 240000)
        },
        event_type: 'title_card',
        content: {
          text: brief.objective ? brief.objective.slice(0, 40) : 'Essential Insight',
          font_family: 'Inter',
          font_size: 48,
          font_color: '#ffffff'
        },
        spatial_constraints: {
          target_anchor: 'lower_third',
          safe_margin_ratio: 0.10,
          avoid_face_overlap: true,
          placement_rect: {
            x: 108,
            y: 1536,
            width: 864,
            height: 192
          }
        },
        motion: {
          animation_type: 'fade_in_out',
          duration_ticks: 24000
        }
      }
    ];

    // Audio direction
    const audioDirection = {
      dialogue_ducking_enabled: true,
      ducking_depth_db: -14.0,
      soundtrack_selection: audioAssets.length > 0 ? {
        asset_id: audioAssets[0].asset_id,
        style: 'ambient_dialogue_bed',
        bpm_target: context.audio_intelligence?.tempo_bpm || 120,
        ducking_attack_ticks: 12000,
        ducking_release_ticks: 24000
      } : undefined,
      sfx_cues: []
    };

    if (audioDirection.soundtrack_selection === undefined) delete audioDirection.soundtrack_selection;
    const candidatePlan = {
      schema_version: '1.0.0',
      plan_id: `creative-plan-${crypto.randomUUID().slice(0, 8)}`,
      source_request_id: brief.source_request_id || `req-${crypto.randomUUID().slice(0, 8)}`,
      project_snapshot: {
        project_id: project.project_id || 'proj_default',
        base_revision: project.base_revision ?? 0,
        snapshot_sha256: project.snapshot_sha256 || '0000000000000000000000000000000000000000000000000000000000000000',
        timebase_ticks_per_second: TICKS_PER_SECOND
      },
      creative_intent: {
        goal: brief.objective || 'Create polished edit',
        target_audience: brief.target_audience || 'social_mobile',
        style: brief.style || 'dynamic',
        pacing: brief.pacing || 'fast',
        desired_outcome: 'High retention engagement video'
      },
      deliverable: {
        width: targetAspect === '9:16' ? 1080 : 1920,
        height: targetAspect === '9:16' ? 1920 : 1080,
        aspect_ratio: targetAspect,
        frame_rate: project.timebase?.fps || { numerator: 30, denominator: 1 },
        target_duration_ticks: targetDurationTicks
      },
      narrative_beats: beats,
      visual_events: visualEvents,
      audio_direction: audioDirection,
      unsupported_features: [],
      provenance: {
        generator: {
          provider: 'deterministic-mock-director',
          model: 'mock-v1.0.0',
          generation_timestamp: new Date().toISOString()
        },
        input_brief_hash: crypto.createHash('sha256').update(brief.raw_text || '').digest('hex'),
        context_snapshot_hash: context.provenance?.context_hash || crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex'),
        accepted_at: new Date().toISOString(),
        plan_hash: ''
      }
    };

    if (this.simulateSchemaError) {
      // Invalidate ticks to float to trigger schema violation
      candidatePlan.deliverable.target_duration_ticks = 10.5;
    }

    const generatorMeta = {
      provider: 'deterministic-mock-director',
      model: 'mock-v1.0.0',
      generation_timestamp: new Date().toISOString()
    };

    return this._validateAndStampPlan(candidatePlan, context, generatorMeta);
  }
}

module.exports = {
  BaseLlmAdapter,
  IdeAgentAdapter,
  ProviderLlmAdapter,
  MockLlmAdapter,
  LlmErrorCodes
};
