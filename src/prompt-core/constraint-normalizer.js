/**
 * Editing Mechanics Engine (EME) - Prompt Core Constraint Normalizer
 * Compiles user negative constraints and invariants into typed zero-tolerance contracts.
 */

const { ReferenceResolver } = require('./reference-resolver.js');

const CLOSED_EFFECT_REGISTRY = new Set([
  'music_content_added',
  'music_asset_attached',
  'music_generated',
  'color_grade_modified',
  'audio_timing_shifted',
  'clip_order_changed',
  'video_track_removed',
  'source_overwritten',
  'master_overwritten'
]);

class ConstraintNormalizer {
  /**
   * Compiles and normalizes an array of raw or extracted constraints against project state.
   */
  static normalizeConstraints(rawConstraints = [], project, baselineRevision = 0) {
    const compiled = [];
    const errors = [];

    let counter = 1;

    for (const raw of rawConstraints) {
      try {
        const norm = this.normalizeSingleConstraint(raw, project, baselineRevision, counter);
        if (norm) {
          compiled.push(norm);
          counter++;
        }
      } catch (err) {
        errors.push({
          raw,
          error: err.message
        });
      }
    }

    return {
      constraints: compiled,
      errors
    };
  }

  /**
   * Normalize an individual constraint into canonical EME schema format.
   */
  static normalizeSingleConstraint(raw, project, baselineRevision = 0, index = 1) {
    if (!raw) return null;

    // If already normalized and valid
    if (raw.constraint_id && raw.type && raw.strength && raw.target && raw.on_violation) {
      return raw;
    }

    const text = (raw.source_text || raw.description || typeof raw === 'string' ? (raw.source_text || raw.description || raw) : '').toLowerCase();
    const originalText = raw.source_text || raw.description || (typeof raw === 'string' ? raw : JSON.stringify(raw));

    // A. "Do not modify existing color grade" / "Preserve existing color grade"
    if (text.includes('color grade') && (text.includes('not modify') || text.includes('not change') || text.includes('preserve') || text.includes('unchanged'))) {
      const targetClips = (project?.clips || []).filter(c => c.type === 'video').map(c => c.id);
      return {
        constraint_id: `C-GRADE-${String(index).padStart(3, '0')}`,
        type: 'preserve_property',
        strength: 'hard',
        target: {
          kind: targetClips.length > 0 ? 'entity_ids' : 'project',
          entity_type: 'clip',
          ids: targetClips
        },
        property_key: 'color_grade',
        baseline_revision: baselineRevision,
        comparison: 'canonical_equal',
        on_violation: 'block',
        on_unknown: 'block',
        verify_at: ['plan_preflight', 'post_execution', 'pre_render'],
        origin: {
          kind: 'explicit_user',
          source_text: originalText
        }
      };
    }

    // B. "Do not add music" / "No music"
    if (text.includes('music') && (text.includes('not add') || text.includes('no music') || text.includes('exclude music') || text.includes('without music'))) {
      return {
        constraint_id: `C-MUSIC-${String(index).padStart(3, '0')}`,
        type: 'forbid_effect',
        strength: 'hard',
        target: {
          kind: 'project',
          entity_type: 'any',
          ids: []
        },
        forbidden_effects: [
          'music_content_added',
          'music_asset_attached',
          'music_generated'
        ],
        baseline_revision: baselineRevision,
        comparison: 'exact',
        on_violation: 'block',
        on_unknown: 'block',
        verify_at: ['plan_preflight', 'post_execution', 'pre_render'],
        origin: {
          kind: 'explicit_user',
          source_text: originalText
        }
      };
    }

    // C. "Preserve dialogue timing" / "Keep original dialogue timing unchanged"
    if (text.includes('dialogue') && (text.includes('timing') || text.includes('preserve') || text.includes('unchanged'))) {
      const dialogueRes = ReferenceResolver.resolveTargets(project, { kind: 'role', role: 'dialogue' });
      return {
        constraint_id: `C-DIALOGUE-TIME-${String(index).padStart(3, '0')}`,
        type: 'preserve_fields',
        strength: 'hard',
        target: {
          kind: 'role',
          entity_type: 'clip',
          role: 'dialogue',
          ids: dialogueRes.resolvedIds
        },
        fields: [
          'timeline_interval',
          'source_interval',
          'time_remap',
          'sync_offset'
        ],
        baseline_revision: baselineRevision,
        comparison: 'exact',
        on_violation: 'block',
        on_unknown: 'block',
        verify_at: ['plan_preflight', 'post_execution', 'pre_render'],
        origin: {
          kind: 'explicit_user',
          source_text: originalText
        }
      };
    }

    // D. "Do not change any existing clip timing"
    if (text.includes('clip timing') && (text.includes('not change') || text.includes('preserve') || text.includes('unchanged'))) {
      return {
        constraint_id: `C-TIMING-${String(index).padStart(3, '0')}`,
        type: 'preserve_fields',
        strength: 'hard',
        target: {
          kind: 'project',
          entity_type: 'clip',
          ids: (project?.clips || []).map(c => c.id)
        },
        fields: ['startTick', 'durationTicks'],
        baseline_revision: baselineRevision,
        comparison: 'exact',
        on_violation: 'block',
        on_unknown: 'block',
        verify_at: ['plan_preflight', 'post_execution', 'pre_render'],
        origin: {
          kind: 'explicit_user',
          source_text: originalText
        }
      };
    }

    // E. "Do not alter the audio edit"
    if (text.includes('audio edit') && (text.includes('not alter') || text.includes('not change') || text.includes('preserve'))) {
      const audioClips = (project?.clips || []).filter(c => c.type === 'audio').map(c => c.id);
      return {
        constraint_id: `C-AUDIO-EDIT-${String(index).padStart(3, '0')}`,
        type: 'preserve_property',
        strength: 'hard',
        target: {
          kind: 'entity_ids',
          entity_type: 'clip',
          ids: audioClips
        },
        property_key: 'audio',
        baseline_revision: baselineRevision,
        comparison: 'canonical_equal',
        on_violation: 'block',
        on_unknown: 'block',
        verify_at: ['plan_preflight', 'post_execution', 'pre_render'],
        origin: {
          kind: 'explicit_user',
          source_text: originalText
        }
      };
    }

    // Generic fallback if explicitly typed
    if (raw.type && ['preserve_property', 'forbid_effect', 'preserve_fields', 'scope_limit'].includes(raw.type)) {
      return {
        constraint_id: raw.constraint_id || `C-CUSTOM-${String(index).padStart(3, '0')}`,
        type: raw.type,
        strength: raw.strength || 'hard',
        target: raw.target || { kind: 'project', entity_type: 'any', ids: [] },
        property_key: raw.property_key,
        fields: raw.fields,
        forbidden_effects: raw.forbidden_effects,
        baseline_revision: baselineRevision,
        comparison: raw.comparison || 'exact',
        on_violation: raw.on_violation || 'block',
        on_unknown: raw.on_unknown || 'block',
        verify_at: raw.verify_at || ['plan_preflight', 'post_execution', 'pre_render'],
        origin: raw.origin || { kind: 'explicit_user', source_text: originalText }
      };
    }

    throw new Error(`Unknown or unverifiable constraint: "${originalText}". Unknown constraints must fail closed.`);
  }

  static isEffectAllowlisted(effectName) {
    return CLOSED_EFFECT_REGISTRY.has(effectName);
  }
}

module.exports = {
  ConstraintNormalizer,
  CLOSED_EFFECT_REGISTRY
};
