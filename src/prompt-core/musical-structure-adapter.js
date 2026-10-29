/**
 * Editing Mechanics Engine (EME) - Musical Structure Adapter (PF-07 Integration)
 *
 * Implements a pure, deterministic adapter between Phase A2 musical structure
 * sidecars (eme-musical-structure.v1) and PF-07 candidate generation.
 *
 * Enforces:
 * - Deterministic validation of sidecar schema, source audio hash, timebase, and timeline bounds.
 * - Explicit partition of accepted vs. rejected musical events with audit reasons.
 * - Fail-safe deterministic fallback activation for missing, malformed, stale, or ambiguous evidence.
 * - Strict non-negotiable contract: inferred musical structure never overrides explicit user constraints.
 */

const { BriefValidator } = require('./brief-validator.js');

class MusicalStructureAdapter {
  /**
   * Adapts and validates an eme-musical-structure.v1 artifact for candidate generation.
   *
   * @param {object} params
   * @param {object} [params.musicalStructure] Raw musical structure sidecar
   * @param {object} [params.project] Target EME project snapshot
   * @param {object} [params.options] Optional adapter parameters
   * @param {string} [params.options.expectedAudioHash] Explicitly expected audio SHA-256
   * @param {number} [params.options.minMeterConfidence=0.50] Minimum meter confidence
   * @param {number} [params.options.minBarConfidence=0.50] Minimum bar confidence
   * @param {number} [params.options.minPhraseConfidence=0.50] Minimum phrase confidence
   * @param {number} [params.options.minSectionConfidence=0.50] Minimum section confidence
   * @returns {object} Validated adapter outcome with accepted/rejected events
   */
  static adapt({ musicalStructure, project, options = {} }) {
    const minMeterConfidence = options.minMeterConfidence ?? 0.50;
    const minBarConfidence = options.minBarConfidence ?? 0.50;
    const minPhraseConfidence = options.minPhraseConfidence ?? 0.50;
    const minSectionConfidence = options.minSectionConfidence ?? 0.50;

    const result = {
      isValid: false,
      fallbackActive: true,
      structureId: null,
      sourceAudioHash: null,
      algorithmVersion: null,
      adapterVersion: '1.0.0',
      meter: 'unknown',
      acceptedEvents: {
        downbeats: [],
        phrases: [],
        sections: []
      },
      rejectedEvents: [],
      diagnostics: [],
      reasons: []
    };

    // 1. Missing sidecar check
    if (!musicalStructure || typeof musicalStructure !== 'object') {
      result.diagnostics.push('No musical structure sidecar provided; falling back to deterministic defaults.');
      result.reasons.push('missing_sidecar');
      return result;
    }

    // 2. Schema validation
    const schemaVal = BriefValidator.validateMusicalStructure(musicalStructure);
    if (!schemaVal.valid) {
      result.diagnostics.push(`Musical structure sidecar failed schema validation: ${schemaVal.errors.join(', ')}`);
      result.reasons.push('invalid_schema');
      return result;
    }

    result.structureId = musicalStructure.structureId;
    result.algorithmVersion = musicalStructure.config?.algorithmVersion || '1.0.0';
    result.sourceAudioHash = musicalStructure.source?.sha256 || null;
    result.meter = musicalStructure.meter?.classification || 'unknown';

    // 3. Timebase verification (must strictly match EME 120,000 ticks/sec)
    if (musicalStructure.config?.ticksPerSecond !== 120000) {
      result.diagnostics.push(
        `Timebase mismatch: sidecar ticksPerSecond is ${musicalStructure.config?.ticksPerSecond}, expected 120000.`
      );
      result.reasons.push('timebase_mismatch');
      return result;
    }

    // 4. Source Audio Hash Verification
    let projectAudioHash = options.expectedAudioHash || null;
    if (!projectAudioHash && project && Array.isArray(project.assets)) {
      // Find audio asset referenced by music track or first audio asset
      const musicClip = (project.clips || []).find(c => c.trackId === 'track_a_music' || c.type === 'audio');
      if (musicClip?.assetId) {
        const asset = project.assets.find(a => a.id === musicClip.assetId);
        if (asset?.sha256 || asset?.source_hash) {
          projectAudioHash = asset.sha256 || asset.source_hash;
        }
      }
      if (!projectAudioHash) {
        const audioAsset = project.assets.find(a => a.type === 'audio');
        if (audioAsset?.sha256 || audioAsset?.source_hash) {
          projectAudioHash = audioAsset.sha256 || audioAsset.source_hash;
        }
      }
    }

    if (projectAudioHash && result.sourceAudioHash && projectAudioHash !== result.sourceAudioHash) {
      result.diagnostics.push(
        `Source audio SHA-256 mismatch: project expects "${projectAudioHash}", sidecar contains "${result.sourceAudioHash}".`
      );
      result.rejectedEvents.push({
        type: 'sidecar',
        id: result.structureId,
        reason: 'ERR_SOURCE_HASH_MISMATCH'
      });
      result.reasons.push('ERR_SOURCE_HASH_MISMATCH');
      return result;
    }

    // 5. Ambiguity & Meter Classification Evaluation
    let fallbackTriggered = false;

    if (musicalStructure.ambiguity?.hasHighAmbiguity === true) {
      result.diagnostics.push('High musical ambiguity flagged in sidecar; activating deterministic fallback.');
      result.reasons.push('high_ambiguity');
      fallbackTriggered = true;
    }

    if (musicalStructure.meter?.classification === 'unsupported' || musicalStructure.meter?.classification === 'unknown') {
      result.diagnostics.push(
        `Meter classification "${musicalStructure.meter?.classification}" is unsupported or unknown; activating deterministic fallback.`
      );
      result.reasons.push('unsupported_meter');
      fallbackTriggered = true;
    }

    const meterConfidence = musicalStructure.meter?.confidence ?? 0;
    if (meterConfidence < minMeterConfidence) {
      result.diagnostics.push(
        `Meter confidence ${meterConfidence.toFixed(2)} is below threshold ${minMeterConfidence}; activating deterministic fallback.`
      );
      result.reasons.push('low_meter_confidence');
      fallbackTriggered = true;
    }

    // 6. Partition Events: Accepted vs. Rejected
    const timelineDuration = project?.timebase?.durationTicks || musicalStructure.source?.durationTicks || 1440000;
    const boundTolerance = 4000; // 1 frame at 30fps

    // 6.1 Downbeats / Bars
    for (const bar of musicalStructure.bars || []) {
      if (bar.confidence < minBarConfidence) {
        result.rejectedEvents.push({
          type: 'downbeat',
          barIndex: bar.barIndex,
          ticks: bar.downbeatTicks,
          confidence: bar.confidence,
          reason: 'confidence_below_threshold'
        });
      } else if (bar.downbeatTicks > timelineDuration + boundTolerance) {
        result.rejectedEvents.push({
          type: 'downbeat',
          barIndex: bar.barIndex,
          ticks: bar.downbeatTicks,
          confidence: bar.confidence,
          reason: 'out_of_timeline_bounds'
        });
      } else {
        result.acceptedEvents.downbeats.push({
          barIndex: bar.barIndex,
          startTicks: bar.startTicks,
          downbeatTicks: bar.downbeatTicks,
          endTicks: bar.endTicks,
          confidence: bar.confidence
        });
      }
    }

    // 6.2 Phrases
    for (const phrase of musicalStructure.phrases || []) {
      if (phrase.confidence < minPhraseConfidence) {
        result.rejectedEvents.push({
          type: 'phrase',
          phraseIndex: phrase.phraseIndex,
          ticks: phrase.startTicks,
          confidence: phrase.confidence,
          reason: 'confidence_below_threshold'
        });
      } else if (phrase.startTicks > timelineDuration + boundTolerance) {
        result.rejectedEvents.push({
          type: 'phrase',
          phraseIndex: phrase.phraseIndex,
          ticks: phrase.startTicks,
          confidence: phrase.confidence,
          reason: 'out_of_timeline_bounds'
        });
      } else {
        result.acceptedEvents.phrases.push({
          phraseIndex: phrase.phraseIndex,
          startTicks: phrase.startTicks,
          endTicks: phrase.endTicks,
          barsCount: phrase.barsCount,
          confidence: phrase.confidence,
          cadenceStrength: phrase.cadenceStrength
        });
      }
    }

    // 6.3 Sections
    for (const section of musicalStructure.sections || []) {
      if (section.uncertaintyState === 'ambiguous' || section.uncertaintyState === 'insufficient_evidence') {
        result.rejectedEvents.push({
          type: 'section',
          sectionIndex: section.sectionIndex,
          id: section.id,
          ticks: section.startTicks,
          confidence: section.confidence,
          reason: `uncertainty_state_${section.uncertaintyState}`
        });
      } else if (section.confidence < minSectionConfidence) {
        result.rejectedEvents.push({
          type: 'section',
          sectionIndex: section.sectionIndex,
          id: section.id,
          ticks: section.startTicks,
          confidence: section.confidence,
          reason: 'confidence_below_threshold'
        });
      } else if (section.startTicks > timelineDuration + boundTolerance) {
        result.rejectedEvents.push({
          type: 'section',
          sectionIndex: section.sectionIndex,
          id: section.id,
          ticks: section.startTicks,
          confidence: section.confidence,
          reason: 'out_of_timeline_bounds'
        });
      } else {
        result.acceptedEvents.sections.push({
          sectionIndex: section.sectionIndex,
          id: section.id,
          startTicks: section.startTicks,
          endTicks: section.endTicks,
          type: section.type,
          confidence: section.confidence,
          uncertaintyState: section.uncertaintyState
        });
      }
    }

    // Final outcome status
    result.isValid = true;
    if (result.acceptedEvents.downbeats.length === 0 && !fallbackTriggered) {
      result.diagnostics.push('Zero eligible downbeats passed confidence threshold; activating deterministic fallback.');
      result.reasons.push('no_accepted_downbeats');
      fallbackTriggered = true;
    }

    result.fallbackActive = fallbackTriggered;
    return result;
  }
}

module.exports = {
  MusicalStructureAdapter
};
