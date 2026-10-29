/**
 * Editing Mechanics Engine (EME) - Cue Collision & Conflict Resolver (Phase A3)
 * Resolves cue conflicts, enforces track lock checks, and delegates to editorial policy.
 */

/**
 * Resolves collisions and evaluates policy rules against candidate cues.
 * @param {Array<object>} candidateCues
 * @param {object} policy Instance of EditorialPolicy
 * @param {object} project EME project snapshot (read-only)
 * @returns {{ acceptedCues: Array<object>, diagnostics: Array<object> }}
 */
function resolveCollisions(candidateCues, policy, project) {
  const diagnostics = [];
  const tracks = (project && project.timeline && project.timeline.tracks) || [];
  const trackMap = new Map(tracks.map(t => [t.id, t]));

  // 1. Pre-filter track locks
  const validCandidates = [];
  for (const cue of candidateCues) {
    const track = trackMap.get(cue.targetTrackId);
    if (track && track.locked) {
      diagnostics.push({
        code: 'REJECTED_TRACK_LOCKED',
        message: `Track '${cue.targetTrackId}' is locked; modifying operations are forbidden`,
        rejectedCueId: cue.id,
        atTicks: cue.atTicks
      });
      continue;
    }
    validCandidates.push(cue);
  }

  // 2. Delegate to policy for spacing and pacing constraints
  const policyResult = policy.evaluate(validCandidates, { projectSnapshot: project });

  for (const rej of policyResult.rejectedCues) {
    diagnostics.push({
      code: rej.code,
      message: rej.message,
      rejectedCueId: rej.cue.id,
      atTicks: rej.cue.atTicks
    });
  }

  // 3. Deduplication of identical cue types at identical timestamps
  const acceptedCues = [];
  const typeBuckets = new Map();

  for (const cue of policyResult.acceptedCues) {
    const key = `${cue.atTicks}_${cue.type}`;
    if (!typeBuckets.has(key)) {
      typeBuckets.set(key, []);
    }
    typeBuckets.get(key).push(cue);
  }

  for (const [key, cuesOfType] of typeBuckets.entries()) {
    if (cuesOfType.length === 1) {
      acceptedCues.push(cuesOfType[0]);
    } else {
      // Multiple cues of same type at identical tick: select highest priority
      cuesOfType.sort((a, b) => b.priority - a.priority);
      acceptedCues.push(cuesOfType[0]);
      for (let i = 1; i < cuesOfType.length; i++) {
        diagnostics.push({
          code: 'REJECTED_COLLISION_SUPPRESSED',
          message: `Suppressed duplicate cue of type '${cuesOfType[i].type}' in favor of higher-priority instance at tick ${cuesOfType[i].atTicks}`,
          rejectedCueId: cuesOfType[i].id,
          atTicks: cuesOfType[i].atTicks
        });
      }
    }
  }

  // Re-sort chronologically
  acceptedCues.sort((a, b) => a.atTicks - b.atTicks);

  return {
    acceptedCues,
    diagnostics
  };
}

module.exports = {
  resolveCollisions
};
