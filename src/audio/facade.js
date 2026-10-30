/**
 * Editing Mechanics Engine (EME) - Audio Intelligence Facade (Phase A5)
 * Unified orchestration layer coordinating Beat Understander, Beat Actor, and SFX Engine.
 */

const { listSfxTemplates, renderSfxTemplate, planSfxTemplates } = require('./sfx/templates.js');

const { analyzeBeat } = require('./beat/index.js');
const { planBeatEdits, POLICY_REGISTRY } = require('./actor/index.js');
const {
  synthesizeWhoosh,
  synthesizeImpact,
  synthesizeRiser,
  synthesizeGlitch,
  defaultCatalog,
  applyDialogueDucking,
  mixAudioLayers,
  measureMetrics
} = require('./sfx/index.js');

class AudioIntelligenceFacade {
  static listSfxTemplates() { return listSfxTemplates(); }
  static renderSfxTemplate(id, options) { return renderSfxTemplate(id, options); }
  static planSfxTemplates(events, options) { return planSfxTemplates(events, options); }
  /**
   * Analyzes an audio track deterministically for tempo, beats, downbeats, onsets, and sections.
   * @param {Buffer|string|object} audioInput WAV buffer, file path, or Float32Array PCM object
   * @param {object} [userConfig] Analysis configuration
   * @param {object} [options] Execution options
   * @returns {{ analysis: object, valid: boolean, errors: string[], cacheHit: boolean }}
   */
  static analyze(audioInput, userConfig = {}, options = {}) {
    return analyzeBeat(audioInput, userConfig, options);
  }

  /**
   * Generates a declarative, policy-driven Beat Actor plan against an EME project snapshot.
   * @param {object} beatAnalysis Canonical eme-beat-analysis.v1 artifact
   * @param {object} project EME project snapshot
   * @param {object} [options] { policy: 'social-short'|'music-video'|'cinematic', dryRun: true }
   * @returns {{ plan: object, valid: boolean, errors: string[], executionResult?: object }}
   */
  static planEdits(beatAnalysis, project, options = {}) {
    return planBeatEdits(beatAnalysis, project, {
      ...options,
      dryRun: options.dryRun !== false
    });
  }

  /**
   * Executes beat-driven edits atomically through EME OperationExecutor.
   * @param {object} beatAnalysis
   * @param {object} project
   * @param {object} [options]
   * @returns {{ plan: object, valid: boolean, errors: string[], executionResult: object }}
   */
  static executeEdits(beatAnalysis, project, options = {}) {
    return planBeatEdits(beatAnalysis, project, {
      ...options,
      dryRun: false
    });
  }

  /**
   * Generates procedural or catalog sound effects for a given cue type.
   * @param {'whoosh'|'impact'|'riser'|'glitch'|'click'} type
   * @param {object} [params]
   * @returns {Buffer} 48 kHz 16-bit Stereo PCM WAV
   */
  static generateSfx(type, params = {}) {
    if (params.templateId) return renderSfxTemplate(params.templateId, params).wav;
    switch (type) {
      case 'whoosh':
        return synthesizeWhoosh(params);
      case 'impact':
        return synthesizeImpact(params);
      case 'riser':
        return synthesizeRiser(params);
      case 'glitch':
      case 'click':
        return synthesizeGlitch({ ...params, type: type === 'click' ? 'click' : 'glitch' });
      default:
        throw new Error(`Unsupported procedural SFX type: ${type}`);
    }
  }

  /**
   * Mixes audio layers with true-peak limiting and dialogue ducking.
   */
  static mix(layers, totalSamples, options = {}) {
    return mixAudioLayers(layers, totalSamples, options);
  }

  /**
   * Applies dialogue-aware ducking.
   */
  static duck(backgroundPcm, voicePcm, options = {}) {
    return applyDialogueDucking(backgroundPcm, voicePcm, options);
  }
}

module.exports = {
  AudioIntelligenceFacade,
  // Direct access
  analyzeBeat,
  planBeatEdits,
  synthesizeWhoosh,
  synthesizeImpact,
  synthesizeRiser,
  synthesizeGlitch,
  defaultCatalog,
  applyDialogueDucking,
  mixAudioLayers,
  measureMetrics
};
