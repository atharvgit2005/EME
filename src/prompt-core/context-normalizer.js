/**
 * Editing Mechanics Engine (EME) - Prompt Core Context Normalizer
 * Computes deterministic snapshot hashes and extracts project context.
 */

const crypto = require('node:crypto');

function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

function computeProjectSnapshotSha256(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('Project must be a non-null object to compute snapshot hash');
  }
  const canonical = canonicalStringify(project);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

class ContextNormalizer {
  static normalizeProjectContext(project, options = {}) {
    if (!project || typeof project !== 'object') {
      throw new Error('Valid EME project object is required');
    }

    const projectId = project.id || 'unnamed-project';
    const baseRevision = typeof project.revision === 'number' ? project.revision : 0;
    const timebaseTicks = project.timebase?.ticksPerSecond || 120000;
    const snapshotSha256 = options.snapshotSha256 || computeProjectSnapshotSha256(project);

    const availableAssetIds = Array.isArray(project.assets) 
      ? project.assets.map(a => a.id).filter(Boolean)
      : [];

    const selectedEntityIds = Array.isArray(options.selectedEntityIds)
      ? options.selectedEntityIds
      : [];

    return {
      project_id: projectId,
      base_revision: baseRevision,
      snapshot_sha256: snapshotSha256,
      timebase_ticks_per_second: timebaseTicks,
      selected_entity_ids: selectedEntityIds,
      available_asset_ids: availableAssetIds
    };
  }
}

module.exports = {
  ContextNormalizer,
  computeProjectSnapshotSha256,
  canonicalStringify
};
