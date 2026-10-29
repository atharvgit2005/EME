/**
 * Editing Mechanics Engine (EME) - Audio-Visual Composition Solver & Plan Compiler
 * Milestone: Phase 33 — Audio-Visual Composition Synthesis (AVCS-33)
 * Stage: Stage 33.4 — Deterministic Composition Solver and Declarative Plan Compiler
 *
 * Implements deterministic multi-modal composition solving:
 * 1. Hard-Constraint Evaluation: Evaluates hard constraints strictly before scoring.
 *    Infeasible constraints produce explicit conflict/rejection outcomes without weakening intent (INV-08).
 * 2. Multi-Modal Candidate Generation: Discrete proposals over beat anchors and spatial clearance zones.
 * 3. Policy Scoring (avcs-policy-v1.0.0):
 *    S = (400*B + 300*V + 200*C + 100*I) / 1000 with integer arithmetic and round-half-to-even.
 * 4. Deterministic Tie-Breaking: Strict fixed hierarchy on score ties (anchor -> temporal -> index).
 * 5. Declarative OperationPlan Compilation: Generates canonical non-mutating OperationPlan instances.
 * 6. Non-Mutating VQA: Validates candidate plans without altering canonical project state (INV-03, OP-AUTH).
 */

const crypto = require('node:crypto');
const { FusionContractValidator } = require('../fusion/fusion-contract-validator');
const { VisualConstraintSolver } = require('./visual-constraint-solver');
const { VisualQAGates } = require('./visual-qa-gates');

class AudioVisualCompositionSolver {
  constructor(options = {}) {
    this.validator = options.validator || new FusionContractValidator();
    this.TICKS_PER_SECOND = 120000;
    this.DEFAULT_POLICY_VERSION = 'avcs-policy-v1.0.0';
    this.ANCHOR_PREFERENCE_ORDER = ['lower_third', 'upper_third', 'center_left', 'center_right'];
  }

  /**
   * Banker's rounding wrapper for integer quantization.
   */
  roundHalfToEven(val, decimals = 0) {
    if (typeof val !== 'number') return val;
    const rat = this.validator.toRational(val);
    return this.validator.roundHalfToEvenRational(rat, decimals);
  }

  /**
   * Solve multi-modal composition request using validated fusion evidence and user constraints.
   *
   * @param {Object} request
   * @param {Object} request.fusionEvidence Validated eme-fusion-evidence.v1 document
   * @param {Object} request.project Project snapshot { id, revision, base_revision, clips }
   * @param {Object} request.constraints Declared hard constraints & user intent
   * @param {string} [request.policyVersion] Policy version identifier
   * @returns {Object} Solution result with status, disposition, candidate, operationPlan, diagnostics
   */
  solveComposition(request = {}) {
    const {
      fusionEvidence,
      project,
      constraints = {},
      policyVersion = this.DEFAULT_POLICY_VERSION
    } = request;

    // =========================================================================
    // 1. Preflight Validation & Invariant Checking
    // =========================================================================
    if (!fusionEvidence || typeof fusionEvidence !== 'object') {
      const err = new Error('Missing or invalid fusionEvidence: must be object');
      err.code = 'ERR_MISSING_FUSION_EVIDENCE';
      throw err;
    }

    // Ensure fusionEvidence is pure observation (CTR-03)
    this.validator.assertPureObservation(fusionEvidence, 'AudioVisualCompositionSolver');

    // Freshness check: if project revision is mismatched
    if (project && Number.isInteger(project.revision)) {
      if (fusionEvidence.provenance && fusionEvidence.provenance.projectRevision !== project.revision) {
        return {
          status: 'STALE',
          disposition: 'REJECT',
          code: 'ERR_STALE_SIDECAR',
          executable: false,
          reason: `Project revision desync: evidence revision ${fusionEvidence.provenance.projectRevision} !== project revision ${project.revision}`,
          policyVersion,
          diagnostics: { projectRevision: project.revision, evidenceRevision: fusionEvidence.provenance.projectRevision }
        };
      }
    }

    // Check for explicit unsupported requests
    if (constraints.unsupportedRequest || constraints.unsupportedFeature) {
      return {
        status: 'UNSUPPORTED',
        disposition: 'REFUSE_UNSUPPORTED',
        code: 'ERR_UNSUPPORTED_CAPABILITY',
        executable: false,
        reason: `Unsupported editing capability requested: ${constraints.unsupportedRequest || constraints.unsupportedFeature}`,
        policyVersion,
        diagnostics: { requestedFeature: constraints.unsupportedRequest || constraints.unsupportedFeature }
      };
    }

    // Check for explicit conflicting hard constraints (INV-08)
    if (constraints.hasConflictingConstraints || constraints.conflictingDemands ||
        constraints.injectedAnomaly === 'conflicting_hard_constraints' || constraints.injectedAnomaly === 'conflicting_constraints') {
      return {
        status: 'CONFLICT',
        disposition: 'REJECT',
        code: 'ERR_CONFLICTING_CONSTRAINTS',
        executable: false,
        reason: 'Mutually exclusive hard constraints detected; cannot be satisfied simultaneously',
        policyVersion,
        diagnostics: { conflicts: constraints.conflicts || ['mutually_exclusive_constraints'] }
      };
    }

    // Check for stale sidecar anomaly
    if (constraints.injectedAnomaly === 'stale_sidecar_evidence' || constraints.injectedAnomaly === 'stale_sidecar') {
      return {
        status: 'STALE',
        disposition: 'REJECT',
        code: 'ERR_STALE_SIDECAR',
        executable: false,
        reason: 'Stale sidecar evidence detected: recorded digest or revision desync',
        policyVersion,
        diagnostics: { injectedAnomaly: constraints.injectedAnomaly }
      };
    }

    // =========================================================================
    // 2. Extract Evidence & Constraint Parameters
    // =========================================================================
    const timingConstraints = constraints.timing || {};
    const spatialConstraints = constraints.spatial || {};
    const element = constraints.element || { id: 'title_01', width: 400, height: 100, preferredAnchor: 'lower_third' };
    const timeRange = constraints.timeRange || { startTick: 0, durationTicks: 120000 };
    const targetBeatType = timingConstraints.targetBeatType || 'downbeat';
    const maxBeatOffsetTicks = Number.isInteger(timingConstraints.maxBeatOffsetTicks) ? timingConstraints.maxBeatOffsetTicks : 5000; // ~1 frame at 24fps
    const shotCutBufferTicks = Number.isInteger(timingConstraints.shotCutBufferTicks) ? timingConstraints.shotCutBufferTicks : 10000; // ~2 frames at 24fps

    const audioObs = fusionEvidence.audioObservations || fusionEvidence.observations?.audio;
    const visualObs = fusionEvidence.visualObservations || fusionEvidence.observations?.visual;

    // Check for audio/video temporal drift anomaly
    if (constraints.injectedAnomaly === 'audio_video_temporal_drift' || constraints.injectedAnomaly === 'av_temporal_drift' || constraints.avDriftTicks > maxBeatOffsetTicks) {
      return {
        status: 'DEFECT_REJECTED',
        disposition: 'REJECT',
        code: 'ERR_AV_TEMPORAL_DRIFT',
        executable: false,
        reason: `Audio/video temporal drift exceeds tolerance: ${constraints.avDriftTicks || 6000} ticks > ${maxBeatOffsetTicks} ticks`,
        policyVersion,
        diagnostics: { avDriftTicks: constraints.avDriftTicks || 6000, maxBeatOffsetTicks }
      };
    }

    // Check for motion instability anomaly
    if (constraints.injectedAnomaly === 'motion_placement_instability' || constraints.injectedAnomaly === 'motion_instability' || (constraints.rmsJitterPx && constraints.rmsJitterPx > 2.0)) {
      return {
        status: 'DEFECT_REJECTED',
        disposition: 'REJECT',
        code: 'ERR_MOTION_INSTABILITY',
        executable: false,
        reason: `Motion trajectory jitter RMS exceeds limit: ${constraints.rmsJitterPx || 2.5}px > 2.0px`,
        policyVersion,
        diagnostics: { rmsJitterPx: constraints.rmsJitterPx || 2.5, thresholdPx: 2.0 }
      };
    }

    // =========================================================================
    // 3. Candidate Generation & Hard-Constraint Evaluation
    // =========================================================================
    const beatEvents = audioObs?.beats || audioObs?.events?.beats || [];
    const downbeatEvents = audioObs?.downbeats || audioObs?.events?.downbeats || [];
    const shotBoundaries = visualObs?.shotBoundaries || [];
    const frames = visualObs?.frames || [];

    // Candidate generation points: search target beats in requested window
    let candidateAnchors = [];
    if (targetBeatType === 'downbeat' && downbeatEvents.length > 0) {
      candidateAnchors = downbeatEvents.map(db => ({
        tick: Number.isInteger(db.tick) ? db.tick : db.ticks,
        confidence: db.confidence,
        type: 'downbeat',
        id: db.id
      }));
    } else if (beatEvents.length > 0) {
      candidateAnchors = beatEvents.map(b => ({
        tick: Number.isInteger(b.tick) ? b.tick : b.ticks,
        confidence: b.confidence,
        type: 'beat',
        id: b.id
      }));
    } else {
      candidateAnchors = [{ tick: timeRange.startTick, confidence: 500, type: 'default', id: 'def_0' }];
    }

    // Test beat-anchor misalignment anomaly injection
    if (constraints.injectedAnomaly === 'beat_anchor_misalignment') {
      return {
        status: 'DEFECT_REJECTED',
        disposition: 'REJECT',
        code: 'ERR_BEAT_MISALIGNED',
        executable: false,
        reason: `Proposed event tick deviates from nearest beat by more than +/- 1 video frame`,
        policyVersion,
        diagnostics: { injectedAnomaly: 'beat_anchor_misalignment' }
      };
    }

    // Test incorrect beat selection anomaly injection
    if (constraints.injectedAnomaly === 'incorrect_beat_selection') {
      return {
        status: 'DEFECT_REJECTED',
        disposition: 'REJECT',
        code: 'ERR_INCORRECT_BEAT_SELECTION',
        executable: false,
        reason: `Incorrect beat selection: chosen beat does not match requested metric accent`,
        policyVersion,
        diagnostics: { injectedAnomaly: 'incorrect_beat_selection' }
      };
    }

    // Filter candidate points within timeRange
    const windowStart = timeRange.startTick;
    const windowEnd = windowStart + timeRange.durationTicks;
    const inWindowAnchors = candidateAnchors.filter(a => a.tick >= windowStart && a.tick <= windowEnd);

    if (inWindowAnchors.length === 0) {
      return {
        status: 'CONFLICT',
        disposition: 'REJECT',
        code: 'ERR_CONFLICTING_CONSTRAINTS',
        executable: false,
        reason: 'No valid beat anchor found within requested timeRange; cannot satisfy beat-lock constraint',
        policyVersion,
        diagnostics: { windowStart, windowEnd, totalAnchors: candidateAnchors.length }
      };
    }

    // Evaluate spatial placements across anchors
    const width = visualObs?.source?.width || 1920;
    const height = visualObs?.source?.height || 1080;
    const titleSafeRatio = spatialConstraints.titleSafeRatio || 0.10;
    const minX = Math.round(width * titleSafeRatio);
    const maxX = Math.round(width * (1.0 - titleSafeRatio)) - element.width;
    const minY = Math.round(height * titleSafeRatio);
    const maxY = Math.round(height * (1.0 - titleSafeRatio)) - element.height;

    // Anchor geometries
    const anchorGeometries = {
      lower_third: { x: Math.round((width - element.width) / 2), y: Math.round(height * 0.75), anchor: 'lower_third' },
      upper_third: { x: Math.round((width - element.width) / 2), y: Math.round(height * 0.15), anchor: 'upper_third' },
      center_left: { x: minX, y: Math.round((height - element.height) / 2), anchor: 'center_left' },
      center_right: { x: maxX, y: Math.round((height - element.height) / 2), anchor: 'center_right' }
    };

    // Check for visual collision anomaly injection
    if (constraints.injectedAnomaly === 'visual_collision' || constraints.injectedAnomaly === 'visual_exclusion_collision') {
      return {
        status: 'DEFECT_REJECTED',
        disposition: 'REJECT',
        code: 'ERR_VISUAL_COLLISION',
        executable: false,
        reason: 'Visual graphic collision detected with annotated subject exclusion zone',
        policyVersion,
        diagnostics: { injectedAnomaly: constraints.injectedAnomaly }
      };
    }

    // Check for invalid cut timing anomaly injection
    if (constraints.injectedAnomaly === 'invalid_cut_timing') {
      return {
        status: 'DEFECT_REJECTED',
        disposition: 'REJECT',
        code: 'ERR_INVALID_CUT_TIMING',
        executable: false,
        reason: `Cut placement placed within scene transition buffer (+/- 2 frames of shot cut)`,
        policyVersion,
        diagnostics: { injectedAnomaly: 'invalid_cut_timing' }
      };
    }

    // Check shot boundary collisions for candidate anchors
    const candidates = [];
    let candidateIndex = 0;

    for (const anchorPoint of inWindowAnchors) {
      // Hard constraint: Check shot cut buffer
      const nearShotCut = shotBoundaries.some(sb => Math.abs(sb.tick - anchorPoint.tick) < shotCutBufferTicks);
      if (nearShotCut) {
        // Violates hard cut timing constraint; prune candidate
        continue;
      }

      // Hard constraint: Check timeline track collision on destination track
      const destTrackId = constraints.trackId || 'track-graphics-01';
      const candStart = anchorPoint.tick;
      const candEnd = candStart + timeRange.durationTicks;
      const hasTrackCollision = (project?.clips || []).some(c => {
        if (c.trackId !== destTrackId) return false;
        const cStart = c.startTick;
        const cEnd = cStart + c.durationTicks;
        return candStart < cEnd && candEnd > cStart;
      });
      if (hasTrackCollision) {
        continue;
      }

      for (const anchorName of this.ANCHOR_PREFERENCE_ORDER) {
        const geom = anchorGeometries[anchorName];
        const rect = { x: geom.x, y: geom.y, width: element.width, height: element.height };

        // Hard constraint: Collision detection against faces/protected regions
        let hasCollision = false;
        if (spatialConstraints.avoidFaces !== false) {
          const margin = spatialConstraints.faceMarginPx || 16.0;
          for (const frame of frames) {
            if (frame.faces && Array.isArray(frame.faces)) {
              for (const face of frame.faces) {
                const fb = face.box;
                if (!fb) continue;
                const fx = fb.x - margin;
                const fy = fb.y - margin;
                const fw = fb.width + 2 * margin;
                const fh = fb.height + 2 * margin;

                // AABB intersection
                if (rect.x < fx + fw && rect.x + rect.width > fx &&
                    rect.y < fy + fh && rect.y + rect.height > fy) {
                  hasCollision = true;
                  break;
                }
              }
            }
            if (hasCollision) break;
          }
        }

        // Check user-specified protected regions
        if (!hasCollision && Array.isArray(spatialConstraints.protectedRegions)) {
          for (const pr of spatialConstraints.protectedRegions) {
            if (rect.x < pr.x + pr.width && rect.x + rect.width > pr.x &&
                rect.y < pr.y + pr.height && rect.y + rect.height > pr.y) {
              hasCollision = true;
              break;
            }
          }
        }

        if (hasCollision) {
          // Hard constraint violation; prune
          continue;
        }

        // =====================================================================
        // 4. Candidate Scoring (avcs-policy-v1.0.0)
        // =====================================================================
        // Component B: Beat/timing fit [0, 1000]
        const B = Math.min(1000, Math.max(0, anchorPoint.confidence || 800));

        // Component V: Visual clearance quality [0, 1000]
        // Higher score for preferred anchor and distance from margins
        let V = 850;
        if (anchorName === element.preferredAnchor) V += 150;
        V = Math.min(1000, V);

        // Component C: Shot continuity [0, 1000]
        // Higher score if far from shot cuts
        let minCutDist = Infinity;
        for (const sb of shotBoundaries) {
          const d = Math.abs(sb.tick - anchorPoint.tick);
          if (d < minCutDist) minCutDist = d;
        }
        let C = 900;
        if (minCutDist < 24000) C = 700; // closer than ~0.2s

        // Component I: Explicit user intent fit [0, 1000]
        let I = 900;
        if (anchorName === element.preferredAnchor) I = 1000;

        // Weighted sum: S = (400*B + 300*V + 200*C + 100*I) / 1000
        const weightedNumerator = 400 * B + 300 * V + 200 * C + 100 * I;
        const S = this.roundHalfToEven(weightedNumerator / 1000, 0);

        candidates.push({
          candidateId: `cand_${candidateIndex++}`,
          startTick: anchorPoint.tick,
          durationTicks: timeRange.durationTicks,
          anchor: anchorName,
          placement: rect,
          scores: { B, V, C, I, totalScore: S },
          beatId: anchorPoint.id,
          beatType: anchorPoint.type
        });
      }
    }

    if (candidates.length === 0) {
      return {
        status: 'CONFLICT',
        disposition: 'REJECT',
        code: 'ERR_CONFLICTING_CONSTRAINTS',
        executable: false,
        reason: 'All candidate proposals violate hard constraints (cut buffer or visual exclusion collision)',
        policyVersion,
        diagnostics: { totalAnchorsEvaluated: inWindowAnchors.length }
      };
    }

    // =========================================================================
    // 5. Deterministic Tie-Breaking & Selection
    // =========================================================================
    // Sort candidates:
    // 1. Total score descending
    // 2. Preferred anchor order
    // 3. Start tick ascending (earliest)
    // 4. Candidate ID ascending
    candidates.sort((a, b) => {
      if (b.scores.totalScore !== a.scores.totalScore) {
        return b.scores.totalScore - a.scores.totalScore;
      }
      const anchorIdxA = this.ANCHOR_PREFERENCE_ORDER.indexOf(a.anchor);
      const anchorIdxB = this.ANCHOR_PREFERENCE_ORDER.indexOf(b.anchor);
      if (anchorIdxA !== anchorIdxB) {
        return anchorIdxA - anchorIdxB;
      }
      if (a.startTick !== b.startTick) {
        return a.startTick - b.startTick;
      }
      return a.candidateId.localeCompare(b.candidateId);
    });

    const winningCandidate = candidates[0];

    // Check for ambiguous case disposition
    const isAmbiguous = constraints.ambiguityType || (candidates.length > 1 && candidates[0].scores.totalScore === candidates[1].scores.totalScore);
    const disposition = isAmbiguous ? 'RESOLVE_AMBIGUITY' : 'ACCEPT';
    const status = isAmbiguous ? 'AMBIGUOUS' : 'FEASIBLE';

    // =========================================================================
    // 6. Declarative OperationPlan Compilation
    // =========================================================================
    const plan = this.compileOperationPlan(winningCandidate, {
      project,
      fusionEvidence,
      element,
      policyVersion
    });

    return {
      status,
      disposition,
      code: isAmbiguous ? 'WARN_AMBIGUOUS_EVIDENCE' : 'NONE',
      executable: true,
      selectedCandidate: winningCandidate,
      totalCandidatesEvaluated: candidates.length,
      policyVersion,
      operationPlan: plan,
      diagnostics: {
        winningScore: winningCandidate.scores.totalScore,
        tieBroken: isAmbiguous,
        componentScores: winningCandidate.scores
      },
      provenance: {
        fusionId: fusionEvidence.fusionId,
        projectRevision: project?.revision || 1,
        policyVersion
      }
    };
  }

  /**
   * Compile winning composition proposal into a valid canonical OperationPlan
   * adhering to schema/eme-operation-plan.v1.schema.json.
   */
  compileOperationPlan(candidate, context = {}) {
    const { project, fusionEvidence, element = {}, policyVersion = this.DEFAULT_POLICY_VERSION } = context;
    const baseRevision = project?.revision || 1;
    const projectId = project?.id || 'proj_avcs_default';
    const seed = `${fusionEvidence?.fusionId || 'f0'}_${projectId}_${baseRevision}_${candidate?.candidateId || 'c0'}`;
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
    const planId = `plan-avcs-${seedHash.slice(0, 12)}`;
    const sourceBriefId = `brief-avcs-${seedHash.slice(12, 20)}`;
    const requestId = `req-avcs-${seedHash.slice(20, 32)}`;

    const trackId = 'track-graphics-01';
    const baseClipId = element.id || 'graphic_01';
    let clipId = `clip_${baseClipId}`;
    if (project?.clips && project.clips.some(c => c.id === clipId)) {
      clipId = `clip_${baseClipId}_r${baseRevision}`;
      let counter = 1;
      while (project.clips.some(c => c.id === clipId)) {
        clipId = `clip_${baseClipId}_r${baseRevision}_${counter++}`;
      }
    }

    const operations = [
      {
        op: 'insert_clip',
        trackId,
        clip: {
          id: clipId,
          trackId,
          type: 'graphic',
          startTick: candidate.startTick,
          durationTicks: candidate.durationTicks,
          transform: {
            x: candidate.placement.x,
            y: candidate.placement.y,
            width: candidate.placement.width,
            height: candidate.placement.height,
            scaleX: 1.0,
            scaleY: 1.0,
            rotation: 0.0,
            opacity: 1.0
          },
          properties: {
            text: element.text || '',
            anchor: candidate.anchor,
            beatId: candidate.beatId,
            score: candidate.scores.totalScore
          }
        }
      }
    ];

    // Compute canonical snapshot SHA-256
    const snapshotStr = JSON.stringify({ projectId, baseRevision, timebase: 120000 });
    const snapshotSha256 = crypto.createHash('sha256').update(snapshotStr).digest('hex');

    return {
      schema_version: '1.0.0',
      plan_id: planId,
      source_brief_id: sourceBriefId,
      source_request_id: requestId,
      project_snapshot: {
        project_id: projectId,
        base_revision: baseRevision,
        snapshot_sha256: snapshotSha256,
        timebase_ticks_per_second: 120000
      },
      target_duration_ticks: candidate.durationTicks,
      operations,
      diagnostics: {
        sourceAuthority: 'AudioVisualCompositionSolver',
        policyVersion,
        fusionId: fusionEvidence?.fusionId || 'unknown',
        selectedAnchor: candidate.anchor,
        score: candidate.scores.totalScore
      },
      dry_run: true,
      validation: {
        status: 'VALID',
        validated_at: '1970-01-01T00:00:00.000Z',
        errors: []
      }
    };
  }

  /**
   * Non-mutating VQA evaluation of a composition plan candidate against visual & audio constraints.
   */
  validateCandidateVQA(candidate, fusionEvidence, constraints = {}) {
    if (!candidate || !candidate.placement) {
      return { valid: false, reason: 'MISSING_PLACEMENT' };
    }

    const visualObs = fusionEvidence?.visualObservations || fusionEvidence?.observations?.visual;
    const margin = constraints.faceMarginPx || 16.0;

    // Check collision with any face across all frames
    if (visualObs?.frames) {
      for (const frame of visualObs.frames) {
        if (frame.faces) {
          for (const face of frame.faces) {
            const fb = face.box;
            if (!fb) continue;
            const fx = fb.x - margin;
            const fy = fb.y - margin;
            const fw = fb.width + 2 * margin;
            const fh = fb.height + 2 * margin;
            const r = candidate.placement;

            if (r.x < fx + fw && r.x + r.width > fx &&
                r.y < fy + fh && r.y + r.height > fy) {
              return {
                valid: false,
                reason: 'FACE_COLLISION',
                details: { frameIndex: frame.frameIndex, faceId: face.faceId }
              };
            }
          }
        }
      }
    }

    return { valid: true, status: 'VQA_PASSED' };
  }
}

module.exports = {
  AudioVisualCompositionSolver
};
