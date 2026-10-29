/**
 * Editing Mechanics Engine (EME) - Prompt Core Reference Resolver
 * Resolves semantic selectors into concrete, immutable entity IDs from project state.
 */

class ReferenceResolver {
  /**
   * Resolve target entities from project state given semantic hints or explicit names.
   * @param {object} project Canonical EME project
   * @param {object} targetDescriptor Target definition { kind, entity_type, hint, role, ids }
   * @returns {{ resolvedIds: string[], unresolved: boolean, reason?: string }}
   */
  static resolveTargets(project, targetDescriptor = {}) {
    if (!project || typeof project !== 'object') {
      return { resolvedIds: [], unresolved: true, reason: 'Missing project' };
    }

    const { kind, entity_type = 'any', ids = [], role = 'any', hint } = targetDescriptor;

    // 1. Explicit IDs already provided
    if (ids && ids.length > 0) {
      const allKnownIds = new Set([
        ...(project.clips || []).map(c => c.id),
        ...(project.tracks || []).map(t => t.id),
        ...(project.assets || []).map(a => a.id),
        'project'
      ]);

      const missing = ids.filter(id => !allKnownIds.has(id));
      if (missing.length > 0) {
        return {
          resolvedIds: [],
          unresolved: true,
          reason: `Target IDs not found in project snapshot: ${missing.join(', ')}`
        };
      }
      return { resolvedIds: ids, unresolved: false };
    }

    // 2. Whole project target
    if (kind === 'project' || kind === 'project_snapshot') {
      return { resolvedIds: ['project'], unresolved: false };
    }

    // 3. Resolve by role (e.g. dialogue, music)
    if (kind === 'role' || role !== 'any') {
      if (role === 'dialogue') {
        // Find audio tracks / clips matching dialogue
        const dialogueTrackIds = new Set(
          (project.tracks || [])
            .filter(t => t.kind === 'audio' && (t.name || '').toLowerCase().includes('dialogue'))
            .map(t => t.id)
        );
        const dialogueClips = (project.clips || []).filter(c => {
          if (c.type !== 'audio') return false;
          if (dialogueTrackIds.has(c.trackId)) return true;
          if ((c.name || '').toLowerCase().includes('dialogue')) return true;
          return false;
        });
        const clipIds = dialogueClips.map(c => c.id);
        return { resolvedIds: clipIds, unresolved: false };
      }

      if (role === 'music') {
        const musicTrackIds = new Set(
          (project.tracks || [])
            .filter(t => t.kind === 'audio' && (t.name || '').toLowerCase().includes('music'))
            .map(t => t.id)
        );
        const musicClips = (project.clips || []).filter(c => {
          if (c.type !== 'audio') return false;
          if (musicTrackIds.has(c.trackId)) return true;
          return false;
        });
        return { resolvedIds: musicClips.map(c => c.id), unresolved: false };
      }
    }

    // 4. Resolve by name/hint (e.g. 'interview_01')
    if (hint) {
      const lowerHint = hint.toLowerCase();
      // Check assets
      const matchedAssets = (project.assets || []).filter(a => 
        a.id.toLowerCase().includes(lowerHint) || (a.src || '').toLowerCase().includes(lowerHint)
      );
      if (matchedAssets.length > 0) {
        return { resolvedIds: matchedAssets.map(a => a.id), unresolved: false };
      }

      // Check clips
      const matchedClips = (project.clips || []).filter(c => 
        c.id.toLowerCase().includes(lowerHint) || (c.name || '').toLowerCase().includes(lowerHint)
      );
      if (matchedClips.length > 0) {
        return { resolvedIds: matchedClips.map(c => c.id), unresolved: false };
      }

      return {
        resolvedIds: [],
        unresolved: true,
        reason: `Could not resolve target reference matching hint: "${hint}"`
      };
    }

    // 5. Default entity type 'all'
    if (entity_type === 'clip') {
      return { resolvedIds: (project.clips || []).map(c => c.id), unresolved: false };
    }

    return { resolvedIds: [], unresolved: true, reason: 'Ambiguous target selector' };
  }
}

module.exports = {
  ReferenceResolver
};
