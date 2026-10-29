/**
 * Editing Mechanics Engine (EME) - Phase 28: Repair Conflict Detector & Dependency Graph
 *
 * Implements Stage 28.1:
 * - Deterministic, non-mutating planning component (ARC-28-01).
 * - Half-open interval semantics [startTick, startTick + durationTicks) (ARC-28-01).
 * - Identifies timeline interval collisions (CLIP_OVERLAP), same-clip property interference,
 *   cyclic dependencies, mutually exclusive proposals, stale revisions, and locked tracks.
 * - Enforces deterministic total ordering and dependency DAG (ARC-28-02):
 *     1. SYNC_RETIME precedes PEAK_ATTENUATION
 *     2. Earliest start tick first
 *     3. Lexicographic clip ID as tie-breaker
 *     4. Lexicographic proposal ID as final tie-breaker
 * - Partitions proposals into INDEPENDENT_SAFE, RESOLVABLE_SEQUENTIAL, and UNRESOLVABLE_CONFLICT.
 * - Validates against internal Draft 2020-12 policy schema (ARC-28-07).
 * - Zero external dependencies ("dependencies": {}).
 */

const fs = require('node:fs');
const path = require('node:path');
const { MediaTime, TICKS_PER_SECOND } = require('../../engine/time.js');
const { validateObject } = require('../../engine/validator.js');

const POLICY_SCHEMA_PATH = path.resolve(__dirname, '../schemas/audio-repair-policy.v1.json');

class RepairConflictDetector {
  /**
   * Cached schema object
   */
  static _cachedSchema = null;

  /**
   * Loads the internal Draft 2020-12 policy schema.
   */
  static getSchema() {
    if (!this._cachedSchema) {
      const raw = fs.readFileSync(POLICY_SCHEMA_PATH, 'utf8');
      this._cachedSchema = JSON.parse(raw);
    }
    return this._cachedSchema;
  }

  /**
   * Returns a standard compliant default policy object.
   */
  static getDefaultPolicy() {
    return {
      policy_version: '1.0.0',
      conflict_rules: {
        interval_semantics: 'HALF_OPEN_TICKS',
        conflict_types: [
          'TIMELINE_INTERVAL_OVERLAP',
          'CLIP_OVERLAP',
          'SAME_CLIP_PROPERTY_CONFLICT',
          'MUTUALLY_EXCLUSIVE',
          'CYCLIC_DEPENDENCY',
          'STALE_REVISION',
          'TRACK_LOCKED'
        ]
      },
      priority_rules: {
        operation_type_precedence: ['SYNC_RETIME', 'PEAK_ATTENUATION'],
        timeline_sort_order: 'EARLIEST_START_TICK_FIRST',
        tie_breaker: 'LEXICOGRAPHIC_CLIP_ID',
        proposal_tie_breaker: 'LEXICOGRAPHIC_PROPOSAL_ID'
      },
      convergence_bounds: {
        max_passes: 3,
        max_cumulative_shift_ticks: 240000,
        max_cumulative_attenuation_db: 12.0
      }
    };
  }

  /**
   * Validates a policy object against the Draft 2020-12 policy schema.
   *
   * @param {object} policy Policy configuration to validate
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validatePolicy(policy) {
    if (!policy || typeof policy !== 'object') {
      return { valid: false, errors: ['Policy must be an object'] };
    }
    const schema = this.getSchema();
    const errors = validateObject(policy, schema, schema);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Tests whether two half-open intervals [startA, startA + durA) and [startB, startB + durB) overlap.
   * Half-open interval math: overlap iff max(startA, startB) < min(startA + durA, startB + durB).
   * Abutting intervals (startA + durA === startB or vice versa) do NOT overlap.
   *
   * @param {number} startA Start tick of interval A
   * @param {number} durA Duration ticks of interval A
   * @param {number} startB Start tick of interval B
   * @param {number} durB Duration ticks of interval B
   * @returns {boolean} True if intervals overlap
   */
  static intervalsOverlap(startA, durA, startB, durB) {
    return MediaTime.intervalsOverlap(startA, durA, startB, durB);
  }

  /**
   * Tests whether two intervals are perfectly adjacent (abutting without overlap or gap).
   */
  static intervalsAdjacent(startA, durA, startB, durB) {
    return MediaTime.intervalsAdjacent(startA, durA, startB, durB);
  }

  /**
   * Detects property interference among proposals targeting the same clip.
   * Competing parameter mutations (e.g. multiple gain adjustments, contradictory keyframes)
   * are flagged as SAME_CLIP_PROPERTY_CONFLICT.
   *
   * @param {object[]} proposals Array of repair proposals
   * @returns {object[]} Array of conflict records
   */
  static detectPropertyInterference(proposals = []) {
    const conflicts = [];
    const clipProposalMap = new Map();

    for (const proposal of proposals) {
      const clipId = proposal.target_clip_id;
      if (!clipId) continue;
      if (!clipProposalMap.has(clipId)) {
        clipProposalMap.set(clipId, []);
      }
      clipProposalMap.get(clipId).push(proposal);
    }

    for (const [clipId, clipProposals] of clipProposalMap.entries()) {
      if (clipProposals.length <= 1) continue;

      // Check for multiple proposals targeting the SAME strategy / property
      const retimeProposals = clipProposals.filter(p => p.strategy === 'SYNC_RETIME');
      if (retimeProposals.length > 1) {
        conflicts.push({
          conflict_type: 'SAME_CLIP_PROPERTY_CONFLICT',
          proposal_ids: retimeProposals.map(p => p.proposal_id),
          clip_ids: [clipId],
          property: 'timeline_start_tick',
          reason: `Multiple competing SYNC_RETIME proposals detected for clip "${clipId}" (${retimeProposals.map(p => p.proposal_id).join(', ')})`
        });
      }

      const peakProposals = clipProposals.filter(p => p.strategy === 'PEAK_ATTENUATION');
      if (peakProposals.length > 1) {
        // If they specify different gain reductions or both attempt to set volume
        conflicts.push({
          conflict_type: 'SAME_CLIP_PROPERTY_CONFLICT',
          proposal_ids: peakProposals.map(p => p.proposal_id),
          clip_ids: [clipId],
          property: 'audio_volume',
          reason: `Multiple competing PEAK_ATTENUATION proposals detected for clip "${clipId}" (${peakProposals.map(p => p.proposal_id).join(', ')})`
        });
      }

      // Check for mutual exclusion: e.g. conflicting directional shifts or incompatible strategies
      for (let i = 0; i < clipProposals.length; i++) {
        for (let j = i + 1; j < clipProposals.length; j++) {
          const p1 = clipProposals[i];
          const p2 = clipProposals[j];
          if (p1.strategy === 'ADVISORY_NOOP' && p2.strategy !== 'ADVISORY_NOOP') {
            conflicts.push({
              conflict_type: 'MUTUALLY_EXCLUSIVE',
              proposal_ids: [p1.proposal_id, p2.proposal_id],
              clip_ids: [clipId],
              reason: `Contradictory strategies ADVISORY_NOOP and ${p2.strategy} proposed on same clip "${clipId}"`
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Computes the prospective timeline interval for a clip given a proposal.
   *
   * @param {object} clip Canonical clip from project
   * @param {object|null} proposal Proposal targeting this clip, if any
   * @returns {{ startTick: number, durationTicks: number, endTick: number, trackId: string }}
   */
  static getProspectiveInterval(clip, proposal = null) {
    let startTick = clip.startTick;
    let trackId = clip.trackId;

    if (proposal && proposal.strategy === 'SYNC_RETIME') {
      const params = proposal.parameters || {};
      if (params.target_start_tick !== undefined) {
        startTick = params.target_start_tick;
      } else if (params.shift_ticks !== undefined) {
        startTick = clip.startTick + params.shift_ticks;
      }
    }

    return {
      startTick,
      durationTicks: clip.durationTicks,
      endTick: startTick + clip.durationTicks,
      trackId
    };
  }

  /**
   * Detects spatial interval collisions, track lock violations, and stale revisions.
   *
   * @param {object} project Canonical project snapshot
   * @param {object[]} proposals Array of repair proposals
   * @returns {object[]} Array of conflict records
   */
  static detectTimelineAndRevisionConflicts(project, proposals = []) {
    const conflicts = [];
    const currentRevision = typeof project.revision === 'number' ? project.revision : 0;
    const projectTracks = project.tracks || [];
    const projectClips = project.clips || [];

    // Map clips by ID for quick lookup
    const clipMap = new Map();
    for (const c of projectClips) {
      clipMap.set(c.id, c);
    }

    // Map tracks by ID
    const trackMap = new Map();
    for (const t of projectTracks) {
      trackMap.set(t.id, t);
    }

    // Map proposals by target clip ID
    const clipToProposals = new Map();
    for (const p of proposals) {
      if (!clipToProposals.has(p.target_clip_id)) {
        clipToProposals.set(p.target_clip_id, []);
      }
      clipToProposals.get(p.target_clip_id).push(p);

      // 1. Stale Revision Guard (ARC-28-01 / ARC-28-07)
      const expectedRev = p.preconditions ? p.preconditions.expected_base_revision : undefined;
      if (expectedRev !== undefined && expectedRev !== currentRevision) {
        conflicts.push({
          conflict_type: 'STALE_REVISION',
          proposal_ids: [p.proposal_id],
          clip_ids: [p.target_clip_id],
          reason: `REJECTION_STALE_REVISION: proposal "${p.proposal_id}" expected base revision ${expectedRev}, but project is at revision ${currentRevision}`,
          details: { expected_revision: expectedRev, project_revision: currentRevision }
        });
      }

      // 2. Track Lock Guard
      const clip = clipMap.get(p.target_clip_id);
      const targetTrackId = p.target_track_id || (clip ? clip.trackId : null);
      const track = targetTrackId ? trackMap.get(targetTrackId) : null;
      if (track && track.locked) {
        conflicts.push({
          conflict_type: 'TRACK_LOCKED',
          proposal_ids: [p.proposal_id],
          clip_ids: [p.target_clip_id],
          track_id: targetTrackId,
          reason: `REJECTION_TRACK_LOCKED: target track "${targetTrackId}" is locked for proposal "${p.proposal_id}"`,
          details: { track_id: targetTrackId }
        });
      }
    }

    // 3. Same-Track Interval Overlap (CLIP_OVERLAP)
    // Compute prospective positions of all clips on the project timeline
    const prospectiveClipsByTrack = new Map();

    for (const clip of projectClips) {
      const trackId = clip.trackId;
      if (!prospectiveClipsByTrack.has(trackId)) {
        prospectiveClipsByTrack.set(trackId, []);
      }

      const activeProposals = clipToProposals.get(clip.id) || [];
      const retimeProposal = activeProposals.find(p => p.strategy === 'SYNC_RETIME');
      const prospective = this.getProspectiveInterval(clip, retimeProposal);

      prospectiveClipsByTrack.get(trackId).push({
        clip,
        prospective,
        retimeProposal
      });
    }

    // Check overlaps within each track
    for (const [trackId, clipEntries] of prospectiveClipsByTrack.entries()) {
      for (let i = 0; i < clipEntries.length; i++) {
        for (let j = i + 1; j < clipEntries.length; j++) {
          const entryA = clipEntries[i];
          const entryB = clipEntries[j];

          // If neither clip moved, existing timeline layout is assumed already valid or non-proposal issue
          if (!entryA.retimeProposal && !entryB.retimeProposal) {
            continue;
          }

          const intA = entryA.prospective;
          const intB = entryB.prospective;

          if (this.intervalsOverlap(intA.startTick, intA.durationTicks, intB.startTick, intB.durationTicks)) {
            const implicatedProposalIds = [];
            if (entryA.retimeProposal) implicatedProposalIds.push(entryA.retimeProposal.proposal_id);
            if (entryB.retimeProposal) implicatedProposalIds.push(entryB.retimeProposal.proposal_id);

            conflicts.push({
              conflict_type: 'CLIP_OVERLAP',
              proposal_ids: implicatedProposalIds,
              clip_ids: [entryA.clip.id, entryB.clip.id],
              track_id: trackId,
              overlap_interval: {
                start_tick: Math.max(intA.startTick, intB.startTick),
                end_tick: Math.min(intA.endTick, intB.endTick)
              },
              reason: `Timeline interval collision on track "${trackId}" between "${entryA.clip.id}" [${intA.startTick}, ${intA.endTick}) and "${entryB.clip.id}" [${intB.startTick}, ${intB.endTick})`
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Builds the dependency directed acyclic graph (DAG) and total deterministic ordering.
   *
   * Ordering Precedence (ARC-28-02):
   * 1. Operation Type Precedence: SYNC_RETIME < PEAK_ATTENUATION
   * 2. Timeline Sort Order: Earlier prospective startTick first
   * 3. Tie Breaker: Lexicographic target_clip_id ASC
   * 4. Proposal Tie Breaker: Lexicographic proposal_id ASC
   *
   * @param {object[]} proposals Array of repair proposals
   * @param {object} project Canonical project snapshot
   * @param {object} policy Repair policy configuration
   * @returns {{
   *   ordered_proposals: object[],
   *   dag: { nodes: string[], edges: Array<{ from: string, to: string, reason: string }> },
   *   has_cycle: boolean,
   *   cycles: Array<string[]>
   * }}
   */
  static buildDependencyDAG(proposals = [], project = {}, policy = null) {
    const activePolicy = policy || this.getDefaultPolicy();
    const clonedProposals = JSON.parse(JSON.stringify(proposals));
    const projectClips = project.clips || [];
    const clipMap = new Map();
    for (const c of projectClips) {
      clipMap.set(c.id, c);
    }

    const nodes = clonedProposals.map(p => p.proposal_id);
    const edges = [];
    const outgoing = new Map();
    const incoming = new Map();

    for (const id of nodes) {
      outgoing.set(id, new Set());
      incoming.set(id, new Set());
    }

    // Helper to add directed dependency: A -> B (A must happen before B)
    const addEdge = (fromId, toId, reason) => {
      if (fromId === toId) return;
      if (!outgoing.get(fromId).has(toId)) {
        outgoing.get(fromId).add(toId);
        incoming.get(toId).add(fromId);
        edges.push({ from: fromId, to: toId, reason });
      }
    };

    // 1. Dependency on same clip: SYNC_RETIME must execute before PEAK_ATTENUATION
    const proposalsByClip = new Map();
    for (const p of clonedProposals) {
      const cid = p.target_clip_id;
      if (!proposalsByClip.has(cid)) proposalsByClip.set(cid, []);
      proposalsByClip.get(cid).push(p);
    }

    for (const [cid, cProps] of proposalsByClip.entries()) {
      const retimes = cProps.filter(p => p.strategy === 'SYNC_RETIME');
      const peaks = cProps.filter(p => p.strategy === 'PEAK_ATTENUATION');
      for (const r of retimes) {
        for (const pk of peaks) {
          addEdge(r.proposal_id, pk.proposal_id, `Same clip "${cid}": SYNC_RETIME must precede PEAK_ATTENUATION`);
        }
      }
    }

    // 2. Spatial slot dependency & interval vacating on same track
    // If Proposal A moves clip 1 away from interval [S1, E1) and Proposal B moves clip 2 into an overlapping interval,
    // Proposal A must execute before Proposal B.
    // Conversely, if Clip 2 moves into Clip 1's starting interval AND Clip 1 moves into Clip 2's starting interval,
    // they form a mutual cyclic dependency!
    const retimeProposals = clonedProposals.filter(p => p.strategy === 'SYNC_RETIME');
    for (let i = 0; i < retimeProposals.length; i++) {
      for (let j = 0; j < retimeProposals.length; j++) {
        if (i === j) continue;
        const pA = retimeProposals[i];
        const pB = retimeProposals[j];

        const clipA = clipMap.get(pA.target_clip_id);
        const clipB = clipMap.get(pB.target_clip_id);
        if (!clipA || !clipB || clipA.trackId !== clipB.trackId) continue;

        const currentA = { startTick: clipA.startTick, dur: clipA.durationTicks };
        const currentB = { startTick: clipB.startTick, dur: clipB.durationTicks };
        const targetA = this.getProspectiveInterval(clipA, pA);
        const targetB = this.getProspectiveInterval(clipB, pB);

        // If B moves into where A currently is, A must move first
        if (this.intervalsOverlap(targetB.startTick, targetB.durationTicks, currentA.startTick, currentA.dur)) {
          // But only if A is actually moving out of that interval!
          if (!this.intervalsOverlap(targetA.startTick, targetA.durationTicks, targetB.startTick, targetB.durationTicks)) {
            addEdge(pA.proposal_id, pB.proposal_id, `Clip "${clipA.id}" must vacate space before "${clipB.id}" can enter`);
          }
        }
      }
    }

    // 3. Cycle Detection using DFS (White/Gray/Black graph coloring)
    const cycles = [];
    const color = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
    const parent = new Map();

    for (const id of nodes) color.set(id, 0);

    const dfs = (u, stack) => {
      color.set(u, 1);
      stack.push(u);

      for (const v of outgoing.get(u) || []) {
        if (color.get(v) === 1) {
          // Cycle found!
          const cyclePath = stack.slice(stack.indexOf(v));
          cyclePath.push(v);
          cycles.push(cyclePath);
        } else if (color.get(v) === 0) {
          dfs(v, stack);
        }
      }

      stack.pop();
      color.set(u, 2);
    };

    for (const id of nodes) {
      if (color.get(id) === 0) {
        dfs(id, []);
      }
    }

    const has_cycle = cycles.length > 0;

    // 4. Deterministic Comparator based on approved Priority Rules (ARC-28-02)
    const precedence = activePolicy.priority_rules?.operation_type_precedence || ['SYNC_RETIME', 'PEAK_ATTENUATION'];

    const getStrategyPriority = (strategy) => {
      const idx = precedence.indexOf(strategy);
      return idx >= 0 ? idx : 999;
    };

    const getProposalStartTick = (p) => {
      const clip = clipMap.get(p.target_clip_id);
      if (!clip) return 0;
      if (p.strategy === 'SYNC_RETIME') {
        const target = this.getProspectiveInterval(clip, p);
        return target.startTick;
      }
      return clip.startTick;
    };

    const deterministicComparator = (a, b) => {
      // 1. Operation type precedence (SYNC_RETIME < PEAK_ATTENUATION)
      const stratA = getStrategyPriority(a.strategy);
      const stratB = getStrategyPriority(b.strategy);
      if (stratA !== stratB) {
        return stratA - stratB;
      }

      // 2. Timeline start tick (earlier first)
      const tickA = getProposalStartTick(a);
      const tickB = getProposalStartTick(b);
      if (tickA !== tickB) {
        return tickA - tickB;
      }

      // 3. Lexicographic clip ID ASC
      const clipComp = String(a.target_clip_id || '').localeCompare(String(b.target_clip_id || ''));
      if (clipComp !== 0) {
        return clipComp;
      }

      // 4. Lexicographic proposal ID ASC
      return String(a.proposal_id || '').localeCompare(String(b.proposal_id || ''));
    };

    let ordered_proposals = [];

    if (!has_cycle) {
      // Kahn's algorithm with deterministic priority queue
      const inDegree = new Map();
      for (const id of nodes) inDegree.set(id, incoming.get(id).size);

      const ready = clonedProposals.filter(p => inDegree.get(p.proposal_id) === 0);
      ready.sort(deterministicComparator);

      const result = [];
      const proposalLookup = new Map(clonedProposals.map(p => [p.proposal_id, p]));

      while (ready.length > 0) {
        const curr = ready.shift();
        result.push(curr);

        for (const nextId of outgoing.get(curr.proposal_id) || []) {
          const deg = inDegree.get(nextId) - 1;
          inDegree.set(nextId, deg);
          if (deg === 0) {
            ready.push(proposalLookup.get(nextId));
            ready.sort(deterministicComparator);
          }
        }
      }

      ordered_proposals = result;
    } else {
      // If cycle exists, keep sorted order for diagnostics but note cycle
      ordered_proposals = [...clonedProposals].sort(deterministicComparator);
    }

    return {
      ordered_proposals,
      dag: { nodes, edges },
      has_cycle,
      cycles
    };
  }

  /**
   * Partitions candidate proposals into:
   * - independent_safe: Proposals that do not share tracks, clips, or intervals and can be executed safely
   * - resolvable_sequential: Proposals that can be ordered into sequential passes without conflict
   * - unresolvable_conflicts: Proposals that violate timeline, property, cyclic, or lock constraints
   *
   * Pure non-mutating method returning structured diagnostics.
   *
   * @param {object} project Canonical project snapshot
   * @param {object[]} proposals Array of repair proposals
   * @param {object} [policy] Optional repair policy override
   * @returns {{
   *   status: 'CLEAN' | 'RESOLVABLE' | 'CONFLICT_DETECTED',
   *   reconciliation_required: boolean,
   *   independent_safe: object[],
   *   resolvable_sequential: object[],
   *   unresolvable_conflicts: object[],
   *   conflicts: object[],
   *   ordered_proposals: object[],
   *   dag: object
   * }}
   */
  static partitionProposals(project, proposals = [], policy = null) {
    if (!project || typeof project !== 'object') {
      throw new TypeError('Invalid project snapshot: must be an object');
    }

    const activePolicy = policy || this.getDefaultPolicy();
    const policyVal = this.validatePolicy(activePolicy);
    if (!policyVal.valid) {
      throw new Error(`Invalid repair policy: ${policyVal.errors.join('; ')}`);
    }

    const allConflicts = [];

    // 1. Detect Property Interference
    const propertyConflicts = this.detectPropertyInterference(proposals);
    allConflicts.push(...propertyConflicts);

    // 2. Detect Timeline and Revision Conflicts
    const timelineConflicts = this.detectTimelineAndRevisionConflicts(project, proposals);
    allConflicts.push(...timelineConflicts);

    // 3. Build DAG & Detect Cycles
    const dagResult = this.buildDependencyDAG(proposals, project, activePolicy);
    if (dagResult.has_cycle) {
      for (const cyc of dagResult.cycles) {
        allConflicts.push({
          conflict_type: 'CYCLIC_DEPENDENCY',
          proposal_ids: cyc,
          clip_ids: [],
          reason: `Cyclic dependency detected in repair proposals: ${cyc.join(' -> ')}`
        });
      }
    }

    // Identify proposal IDs directly involved in any unresolvable conflict
    const conflictedProposalIds = new Set();
    for (const c of allConflicts) {
      for (const pid of c.proposal_ids || []) {
        conflictedProposalIds.add(pid);
      }
    }

    const unresolvable_conflicts = [];
    const validProposals = [];

    for (const p of dagResult.ordered_proposals) {
      if (conflictedProposalIds.has(p.proposal_id)) {
        unresolvable_conflicts.push(p);
      } else {
        validProposals.push(p);
      }
    }

    // Partition remaining valid proposals into independent_safe vs resolvable_sequential
    const independent_safe = [];
    const resolvable_sequential = [];

    // Check if valid proposals have sequential dependencies between them
    const validEdges = dagResult.dag.edges.filter(
      e => !conflictedProposalIds.has(e.from) && !conflictedProposalIds.has(e.to)
    );

    if (validEdges.length > 0) {
      // Valid proposals require ordered sequencing
      resolvable_sequential.push(...validProposals);
    } else {
      // No dependencies: check if all target disjoint clips and tracks
      const seenClips = new Set();
      const seenTracks = new Set();
      let hasSharedResource = false;

      for (const p of validProposals) {
        if (seenClips.has(p.target_clip_id) || seenTracks.has(p.target_track_id)) {
          hasSharedResource = true;
          break;
        }
        seenClips.add(p.target_clip_id);
        seenTracks.add(p.target_track_id);
      }

      if (hasSharedResource) {
        resolvable_sequential.push(...validProposals);
      } else {
        independent_safe.push(...validProposals);
      }
    }

    let status = 'CLEAN';
    let reconciliation_required = false;

    if (allConflicts.length > 0) {
      status = 'CONFLICT_DETECTED';
      reconciliation_required = true;
    } else if (resolvable_sequential.length > 0) {
      status = 'RESOLVABLE';
      reconciliation_required = false;
    }

    return {
      status,
      reconciliation_required,
      independent_safe,
      resolvable_sequential,
      unresolvable_conflicts,
      conflicts: allConflicts,
      ordered_proposals: dagResult.ordered_proposals,
      dag: dagResult.dag
    };
  }
}

module.exports = {
  RepairConflictDetector,
  POLICY_SCHEMA_PATH
};
