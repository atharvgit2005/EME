import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMEPolicyGate } from './eme-policy-gate.js';
import { DeterministicRouter } from '../baseline/deterministic-router.js';
import { canaryLogger, CANDIDATE_COMPONENT_HASHES } from './canary-telemetry-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

export class LayaDecisionAdapter {
  constructor(options = {}) {
    this.schemasDir = options.schemasDir || path.join(ROOT, 'src', 'decision-fabric', 'schemas');
    this.policyGate = options.policyGate || new EMEPolicyGate();
    this.baselineRouter = new DeterministicRouter(this.policyGate.policy);

    // Load schemas
    this.routerSchema = this._loadSchema('eme-router');
    this.colorSchema = this._loadSchema('eme-color-mood');
    this.timelineSchema = this._loadSchema('eme-timeline-arbiter');

    // External model client or sidecar if configured
    this.externalClient = options.externalClient || null;
  }

  _loadSchema(name) {
    const p = path.join(this.schemasDir, name, 'questions.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return {};
  }

  /**
   * Route user request through System 1 Decision Fabric with policy gating.
   * @param {object|string} state User request text or state envelope
   * @returns {object} Final policy-verified decision
   */
  async routeRequest(state) {
    const normalizedState = typeof state === 'string' ? { request_text: state } : (state || {});
    const text = normalizedState.request_text || normalizedState.body || '';

    let rawPrediction;

    if (this.externalClient && typeof this.externalClient.predict === 'function') {
      try {
        rawPrediction = await this.externalClient.predict(normalizedState, this.routerSchema);
      } catch (err) {
        // Safe fallback on external client failure
        rawPrediction = this.baselineRouter.predict(normalizedState);
        rawPrediction.routing.model_error = err.message;
      }
    } else {
      // Use baseline router as verified internal engine
      rawPrediction = this.baselineRouter.predict(normalizedState);
    }

    // Pass prediction through policy gate
    const policyResult = this.policyGate.evaluateRoute(rawPrediction, normalizedState);

    const isCanary = canaryLogger.isCanaryActive();
    const response = {
      success: true,
      decision: policyResult.decision,
      forbiddenActions: policyResult.decision?.forbidden_actions || [],
      constraints: policyResult.decision?.constraints || [],
      traceId: policyResult.traceId,
      timestamp: policyResult.timestamp,
      modelUsed: rawPrediction.routing?.model || 'deterministic_baseline_v1',
      latencyMs: rawPrediction.routing?.latency_ms || 0.1
    };

    if (isCanary) {
      canaryLogger.logEvaluation({
        type: 'route',
        traceId: policyResult.traceId,
        baselineDecision: rawPrediction.answers?.intent?.choice,
        layaRecommendation: policyResult.decision?.route,
        policyResult: policyResult.decision,
        fallbackInvoked: Boolean(rawPrediction.routing?.fallback_invoked || rawPrediction.routing?.model_error),
        errors: rawPrediction.routing?.model_error || null,
        latencyMs: rawPrediction.routing?.latency_ms || 0.1
      });

      response.canaryAdvisory = {
        enabled: true,
        advisoryOnly: true,
        candidateId: 'candidate2',
        buildIdentifier: 'eme-v0.1.0-rc1-candidate2',
        manifestFile: 'src/decision-fabric/artifacts/m6-candidate2-manifest.json',
        componentHashes: CANDIDATE_COMPONENT_HASHES,
        authoritativeEngine: 'deterministic_router',
        layaRecommendation: policyResult.decision?.route,
        baselineRoute: rawPrediction.answers?.intent?.choice,
        policyEnforced: true,
        executionPrivilege: 'none'
      };
    }

    return response;
  }

  /**
   * Color Mood Triage: Map creative brief text to a candidate LUT.
   * Enforces that 'needs_review' sentinel is NEVER passed as a LUT identifier.
   */
  async triageColorMood(creativeBrief, projectContext = {}) {
    const text = (creativeBrief || '').toLowerCase();
    let choice = 'needs_review';
    let confidence = 0.50;

    // 1. Guard against unsupported physical film effects (grain, halation, gate weave)
    const hasFilmArtifacts = /\b(grain|halation|gate weave|film stock|kodak)\b/i.test(text);

    // 2. Guard against unsupported VFX / lighting effects (neon, RGB split, bloom, flicker)
    const hasUnsupportedVfx = /\b(magenta neon|rgb split|bloom|animated flicker|flicker|glitch)\b/i.test(text);

    // 3. Guard against underspecified aesthetic jargon without color anchors
    const isUnderspecified = /^(make it )?more cinematic\.?$/i.test(text.trim()) ||
                             text.trim() === 'make it cinematic' ||
                             text.trim() === 'make it pop' ||
                             text.length < 5;

    // 4. Guard against contradictory instructions
    const isContradictory = /\bdesaturat(ed)?\b/i.test(text) && /\b(vivid|saturated)\b/i.test(text);

    if (hasFilmArtifacts || hasUnsupportedVfx || isUnderspecified || isContradictory) {
      choice = 'needs_review';
      confidence = 0.95;
    } else if (
      (text.includes('cyan') && text.includes('orange')) ||
      text.includes('teal and orange') ||
      text.includes('teal-orange') ||
      text.includes('blockbuster look') ||
      (text.includes('cyberpunk') && text.includes('teal'))
    ) {
      choice = 'teal_orange';
      confidence = 0.95;
    } else if (
      text.includes('bleach bypass') ||
      text.includes('bleachy') ||
      (text.includes('desaturated') && (text.includes('gritty') || text.includes('contrast')))
    ) {
      choice = 'bleach_bypass';
      confidence = 0.95;
    } else if (
      text.includes('warm golden') ||
      text.includes('golden-hour') ||
      text.includes('amber') ||
      text.includes('sunlit') ||
      (text.includes('warm') && text.includes('highlights'))
    ) {
      choice = 'warm_golden';
      confidence = 0.95;
    } else if (
      text.includes('true tone') ||
      text.includes('neutral commercial') ||
      text.includes('skin tones accurate') ||
      text.includes('neutral') ||
      text.includes('faithful')
    ) {
      choice = 'true_tone';
      confidence = 0.94;
    } else if (
      text.includes('cinematic contrast') ||
      (text.includes('deep blacks') && text.includes('contrast')) ||
      (text.includes('cinematic') && text.includes('contrast'))
    ) {
      choice = 'cinematic_contrast';
      confidence = 0.92;
    } else {
      choice = 'needs_review';
      confidence = 0.70;
    }

    const rawPrediction = {
      answers: {
        color_mood: {
          choice,
          confidence
        }
      }
    };

    const result = this.policyGate.evaluateColorMood(rawPrediction, creativeBrief);
    if (canaryLogger.isCanaryActive()) {
      canaryLogger.logEvaluation({
        type: 'color',
        baselineDecision: 'needs_review',
        layaRecommendation: result.decision?.candidateLutId,
        policyResult: result.decision,
        latencyMs: 0.1
      });
      result.canaryAdvisory = {
        enabled: true,
        advisoryOnly: true,
        candidateId: 'candidate2',
        buildIdentifier: 'eme-v0.1.0-rc1-candidate2',
        manifestFile: 'src/decision-fabric/artifacts/m6-candidate2-manifest.json',
        componentHashes: CANDIDATE_COMPONENT_HASHES,
        applied: false,
        executionPrivilege: 'none'
      };
    }
    return result;
  }

  /**
   * Timeline Risk & Pacing Arbitration.
   * Advisory only: evaluates gap risk, pacing energy, and snapping mode.
   */
  async arbitrateTimeline(auditFindings = {}, editIntent = '') {
    const text = (editIntent || '').toLowerCase();

    // 1. Gap risk evaluation from deterministic audit findings
    const cutGapsDetected = auditFindings.cut_gaps_count || 0;
    const userPermittedGaps = auditFindings.user_permitted_gaps || false;

    let pGapRisk = 0.05;
    if (cutGapsDetected > 0) {
      pGapRisk = userPermittedGaps ? 0.20 : 0.88;
    }

    // 2. Pacing energy
    let pacingEnergy = 3; // default balanced
    if (text.includes('very rapid') || text.includes('frenetic') || text.includes('intense')) {
      pacingEnergy = 5;
    } else if (text.includes('fast') || text.includes('energetic') || text.includes('punchy')) {
      pacingEnergy = 4;
    } else if (text.includes('calm') || text.includes('slow') || text.includes('deliberate')) {
      pacingEnergy = 1;
    }

    // 3. Snapping mode
    let snappingMode = 'keep_current';
    if (text.includes('snap to beat') || text.includes('music marker')) {
      snappingMode = 'beat';
    } else if (text.includes('snap to frame') || text.includes('frame boundary')) {
      snappingMode = 'frame';
    } else if (text.includes('snap to clip') || text.includes('clip edge') || text.includes('cut edge')) {
      snappingMode = 'clip_edge';
    } else if (text.includes('disable snap') || text.includes('no snapping')) {
      snappingMode = 'none';
    } else if (text.includes('snap randomly') || text.includes('weird snap')) {
      snappingMode = 'needs_review';
    }

    const rawPrediction = {
      answers: {
        gap_review_risk: {
          noul: pGapRisk
        },
        pacing_energy: {
          score: pacingEnergy
        },
        snapping_mode: {
          choice: snappingMode
        }
      }
    };

    const result = this.policyGate.evaluateTimelineArbitration(rawPrediction, auditFindings);
    if (canaryLogger.isCanaryActive()) {
      canaryLogger.logEvaluation({
        type: 'timeline',
        baselineDecision: 'keep_current',
        layaRecommendation: result.decision?.snappingMode,
        policyResult: result.decision,
        latencyMs: 0.1
      });
      result.canaryAdvisory = {
        enabled: true,
        advisoryOnly: true,
        candidateId: 'candidate2',
        buildIdentifier: 'eme-v0.1.0-rc1-candidate2',
        manifestFile: 'src/decision-fabric/artifacts/m6-candidate2-manifest.json',
        componentHashes: CANDIDATE_COMPONENT_HASHES,
        mutated: false,
        executionPrivilege: 'none'
      };
    }
    return result;
  }
}
