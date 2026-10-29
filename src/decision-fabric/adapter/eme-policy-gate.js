import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

export class EMEPolicyGate {
  constructor(customPolicy) {
    if (customPolicy) {
      this.policy = customPolicy;
    } else {
      const policyPath = path.join(ROOT, 'src', 'decision-fabric', 'policy', 'routing-policy.json');
      this.policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    }
  }

  /**
   * Evaluates a raw route prediction from Laya against deterministic safety invariants.
   * @param {object} prediction Raw answer from Laya
   * @param {object} state Normalized request state and project context
   * @returns {object} Policy decision with route, action, and full audit trace
   */
  evaluateRoute(prediction, state = {}) {
    const traceId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Invariant 4: Deterministic facts and prerequisites remain deterministic
    if (state.project_context?.missing_assets === true) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'reject',
        route: 'needs_planning',
        reason: 'Deterministic project invariant failure: missing source assets'
      });
    }

    const forbiddenActions = prediction?.routing?.forbidden_actions || state.forbidden_actions || [];
    const constraints = prediction?.routing?.constraints || state.constraints || [];

    if (!prediction || !prediction.answers || typeof prediction.answers !== 'object') {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'escalate_to_system_2',
        route: this.policy.invariants.fallback_route,
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: 'Malformed or missing prediction payload'
      });
    }

    const { intent, requires_multistep_plan } = prediction.answers;
    const proposedRoute = intent?.choice;
    const confidence = typeof intent?.confidence === 'number' ? intent.confidence : 0;
    const pMultistep = typeof requires_multistep_plan?.noul === 'number' ? requires_multistep_plan.noul : 0;

    // Prerequisite Gate 1: Operations requiring source media
    const routesRequiringMedia = [
      'color_grading',
      'timeline_manipulation',
      'clip_selection',
      'render_export',
      'subtitle_generation',
      'transcription',
      'audio_cleanup'
    ];
    if (routesRequiringMedia.includes(proposedRoute) && state.project_context?.source_media_available === false) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'reject',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: 'Deterministic project invariant failure: source media unavailable'
      });
    }

    // Prerequisite Gate 2: Media delivery requires verified media integrity
    if (proposedRoute === 'render_export' && state.project_context?.media_integrity_passed === false) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'reject',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: 'Deterministic project invariant failure: media integrity verification failed'
      });
    }

    // Prerequisite Gate 3: Timeline mutation requires editable timeline
    if (proposedRoute === 'timeline_manipulation' && state.project_context?.timeline_editable === false) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'reject',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: 'Deterministic project invariant failure: timeline is locked or not editable'
      });
    }

    // Prerequisite Gate 4: Final export requires verified audio sync
    if (proposedRoute === 'render_export' && state.project_context?.audio_sync_passed === false) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'reject',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: 'Deterministic project invariant failure: audio sync QC prerequisite not met'
      });
    }

    // Forbidden Action Invariant: Route must never execute a forbidden action
    if (forbiddenActions.includes(proposedRoute)) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'reject',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: `Proposed route '${proposedRoute}' is explicitly forbidden by user constraint`
      });
    }

    // Invariant 2: Closed decision vocabulary
    if (!proposedRoute || !this.policy.allowed_routes.includes(proposedRoute)) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'escalate_to_system_2',
        route: this.policy.invariants.fallback_route,
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: `Proposed route '${proposedRoute}' is outside allowlisted vocabulary`
      });
    }

    // Invariant 3: Ambiguous or multi-step work goes to System 2 planning
    if (proposedRoute === 'needs_planning') {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: true,
        action: 'escalate_to_system_2',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: prediction?.routing?.escalation_reason || 'Explicit needs_planning intent requested'
      });
    }

    if (pMultistep >= this.policy.thresholds.multistep_escalation_p_true) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: true,
        action: 'escalate_to_system_2',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: `High multistep probability (${pMultistep.toFixed(3)} >= ${this.policy.thresholds.multistep_escalation_p_true})`
      });
    }

    // Invariant 5: Confidence gates must be earned
    if (confidence < this.policy.thresholds.min_confidence_route) {
      return this._buildTrace(traceId, timestamp, prediction, state, {
        approved: false,
        action: 'escalate_to_system_2',
        route: 'needs_planning',
        forbidden_actions: forbiddenActions,
        constraints: constraints,
        reason: `Confidence below threshold (${confidence.toFixed(3)} < ${this.policy.thresholds.min_confidence_route})`
      });
    }

    // Approved single-step canonical route
    return this._buildTrace(traceId, timestamp, prediction, state, {
      approved: true,
      action: 'route_to_subsystem',
      route: proposedRoute,
      confidence: confidence,
      forbidden_actions: forbiddenActions,
      constraints: constraints,
      reason: 'Prediction satisfies all policy invariants and confidence gates'
    });
  }

  /**
   * Evaluates a color mood triage decision.
   * Strict invariant: 'needs_review' must NEVER be passed to LUT engine as a LUT ID.
   */
  evaluateColorMood(prediction, creativeBrief = '') {
    const traceId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const rawChoice = prediction?.answers?.color_mood?.choice;

    if (!rawChoice) {
      return {
        traceId,
        timestamp,
        approved: false,
        action: 'escalate_to_creative_review',
        candidateLutId: null,
        candidateLook: null,
        escalateToReview: true,
        reason: 'Missing color_mood choice in prediction'
      };
    }

    // Check sentinel
    if (rawChoice === 'needs_review') {
      return {
        traceId,
        timestamp,
        approved: true,
        action: 'escalate_to_creative_review',
        candidateLutId: null,
        candidateLook: null,
        escalateToReview: true,
        reason: 'Creative intent requires review or clarification'
      };
    }

    // Verify certified LUT
    if (!this.policy.certified_lut_ids.includes(rawChoice)) {
      return {
        traceId,
        timestamp,
        approved: false,
        action: 'escalate_to_creative_review',
        candidateLutId: null,
        candidateLook: null,
        escalateToReview: true,
        reason: `Color mood choice '${rawChoice}' is not a certified LUT ID`
      };
    }

    return {
      traceId,
      timestamp,
      approved: true,
      action: 'apply_lut_candidate',
      candidateLutId: rawChoice,
      candidateLook: rawChoice,
      escalateToReview: false,
      confidence: prediction?.answers?.color_mood?.confidence || 0.90,
      reason: 'Valid certified LUT selected'
    };
  }

  /**
   * Evaluates timeline arbiter findings.
   * Invariant 6: No mutation from a score alone.
   */
  evaluateTimelineArbitration(prediction, projectState) {
    const traceId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const pGapRisk = prediction?.answers?.gap_review_risk?.noul || 0;
    const pacingScore = prediction?.answers?.pacing_energy?.score || 3;
    const rawSnapping = prediction?.answers?.snapping_mode?.choice || 'keep_current';

    const gapReviewRequired = pGapRisk >= this.policy.thresholds.gap_risk_review_p_true;
    const snappingApproved = this.policy.allowed_snapping_modes.includes(rawSnapping);

    return {
      traceId,
      timestamp,
      advisoryOnly: true,
      gapReviewRequired,
      gapRiskProbability: pGapRisk,
      pacingEnergyScore: pacingScore,
      proposedSnappingMode: snappingApproved ? rawSnapping : 'keep_current',
      requiresCreativeIntervention: rawSnapping === 'needs_review' || gapReviewRequired
    };
  }

  _buildTrace(traceId, timestamp, prediction, state, decision) {
    return {
      traceId,
      timestamp,
      policyVersion: this.policy.version,
      inputState: {
        requestTextSnippet: (state.request_text || state.body || '').substring(0, 120),
        hasContext: Boolean(state.project_context)
      },
      rawPrediction: prediction?.answers || null,
      decision
    };
  }
}
