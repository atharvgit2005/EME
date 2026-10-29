/**
 * Editing Mechanics Engine (EME) - Human Escalation Router & Advisory Generator
 *
 * Implements Stage 29.2 in accordance with binding conditions ARC-29-08 through ARC-29-14:
 * - ARC-29-08: Routing does not confer mutation authority; high confidence is necessary but insufficient.
 * - ARC-29-09: Binds review request to exact proposal, candidate revision, finding evidence, and SHA-256.
 * - ARC-29-10: Human approval must be explicit, scoped, validated, and revocable upon revision change.
 * - ARC-29-11: Canonical state AWAITING_APPROVAL when awaiting human decision; prior active delivery preserved.
 * - ARC-29-12: Deterministic mixed-confidence batch partitioning; dependent autonomous repairs safely held.
 * - ARC-29-13: Advisory choices treated as proposals; unsupported options safely rejected without expanding engine vocabulary.
 * - ARC-29-14: Full audit journal provenance for assessments, advisories, approvals, and outcomes.
 */

const crypto = require('crypto');

class RepairEscalationRouter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.policy]
   * @param {Object} [options.conflictDetector] Instance of RepairConflictDetector for dependency analysis
   */
  constructor(options = {}) {
    this.policy = options.policy || null;
    this.conflictDetector = options.conflictDetector || null;
    this.journal = [];
  }

  /**
   * Evaluates a single proposal and its confidence assessment to determine routing disposition.
   *
   * @param {Object} proposal
   * @param {Object} assessment Confidence assessment from RepairConfidenceCalibrator
   * @param {Object} project Active EME project
   * @returns {Object} Routing decision record
   */
  routeProposal(proposal, assessment, project) {
    if (!proposal || !assessment || !project) {
      return {
        disposition: 'REJECTED',
        reason: 'Missing mandatory proposal, assessment, or project parameter',
        autonomous_eligible: false,
        advisory: null
      };
    }

    // 1. Hard Preconditions Gate (ARC-29-08)
    // Proposal status must not be REJECTED
    if (proposal.status === 'REJECTED') {
      return {
        disposition: 'REJECTED',
        reason: `Hard precondition failed: ${proposal.rationale || 'Proposal rejected'}`,
        autonomous_eligible: false,
        advisory: null
      };
    }

    // Check project revision currency
    if (assessment.project_revision !== project.revision) {
      return {
        disposition: 'REJECTED',
        reason: `Stale revision: assessment revision ${assessment.project_revision} !== project revision ${project.revision}`,
        autonomous_eligible: false,
        advisory: null
      };
    }

    // Check track lock status
    const trackId = proposal.track_id || proposal.parameters?.track_id;
    if (trackId && project.tracks) {
      const track = project.tracks.find(t => t.id === trackId);
      if (track && track.locked) {
        return {
          disposition: 'REJECTED',
          reason: `Track ${trackId} is locked against modification`,
          autonomous_eligible: false,
          advisory: null
        };
      }
    }

    // 2. Assess Confidence Disposition
    const score = assessment.confidence_score;

    // Speculative Discard (< 0.40)
    if (score < 0.40 || assessment.disposition === 'DISCARD_SPECULATIVE') {
      return {
        disposition: 'DISCARD_SPECULATIVE',
        reason: `Confidence score ${score.toFixed(4)} is below minimum execution threshold; discarded as speculative`,
        autonomous_eligible: false,
        advisory: null
      };
    }

    // Autonomous Execution (>= 0.80) with all preconditions met
    if (score >= 0.80 && assessment.disposition === 'AUTONOMOUS_EXECUTION') {
      return {
        disposition: 'AUTONOMOUS_EXECUTION',
        reason: `Confidence score ${score.toFixed(4)} meets autonomous threshold; all safety preconditions satisfied`,
        autonomous_eligible: true,
        advisory: null
      };
    }

    // Moderate Confidence (0.40 <= score < 0.80) or Human Escalation Required
    // Autonomous execution is strictly withheld, advisory is generated (ARC-29-09)
    const advisory = this.generateReviewAdvisory(proposal, assessment, project);

    return {
      disposition: 'HUMAN_ESCALATION_REQUIRED',
      reason: `Confidence score ${score.toFixed(4)} requires human-in-the-loop escalation`,
      autonomous_eligible: false,
      advisory: advisory
    };
  }

  /**
   * Generates a fully-scoped, machine-readable review request advisory (ARC-29-09).
   *
   * @param {Object} proposal
   * @param {Object} assessment
   * @param {Object} project
   * @returns {Object} Structured human_review_request advisory
   */
  generateReviewAdvisory(proposal, assessment, project) {
    const requestId = `rev_req_${crypto.randomUUID().slice(0, 12)}`;
    const clipId = proposal.clip_id || proposal.parameters?.clip_id;
    const trackId = proposal.track_id || proposal.parameters?.track_id;

    // Build structured repair alternatives (ARC-29-13)
    const alternatives = [];

    if (proposal.strategy === 'SYNC_RETIME') {
      const shiftTicks = proposal.parameters?.shift_ticks || 0;
      alternatives.push({
        option_id: 'EXECUTE_RECOMMENDED_RETIME',
        strategy: 'SYNC_RETIME',
        description: `Apply planned timing shift of ${shiftTicks} ticks to clip ${clipId}`,
        parameters: { ...proposal.parameters },
        expected_effect: `Aligns audio transient with video cue; eliminates ${Math.abs(shiftTicks / 120)}ms sync offset`,
        known_risks: 'May reduce head/tail margin to adjacent clips on track',
        is_recommended: true
      });

      alternatives.push({
        option_id: 'REALLOCATE_TO_NEW_TRACK',
        strategy: 'TRACK_REALLOCATION',
        description: `Move clip ${clipId} to a new dedicated track to avoid boundary proximity`,
        parameters: { clip_id: clipId, target_track_id: `${trackId}_alt` },
        expected_effect: 'Resolves timing offset without track congestion',
        known_risks: 'Creates additional audio track in project hierarchy',
        is_recommended: false
      });

      alternatives.push({
        option_id: 'LEAVE_DEFECT_UNRESOLVED',
        strategy: 'NO_OP',
        description: 'Leave audio timing unchanged; retain acoustic offset finding in audit log',
        parameters: {},
        expected_effect: 'No project state mutation',
        known_risks: 'Delivery may fail quality gates if offset exceeds specification threshold',
        is_recommended: false
      });
    } else if (proposal.strategy === 'PEAK_ATTENUATION') {
      const attenDb = proposal.parameters?.attenuation_db || 0;
      alternatives.push({
        option_id: 'EXECUTE_RECOMMENDED_ATTENUATION',
        strategy: 'PEAK_ATTENUATION',
        description: `Apply ${attenDb.toFixed(2)} dB attenuation to clip ${clipId}`,
        parameters: { ...proposal.parameters },
        expected_effect: `Reduces true peak below -1.0 dBTP ceiling`,
        known_risks: 'Slightly reduces perceived volume for this clip',
        is_recommended: true
      });

      alternatives.push({
        option_id: 'LEAVE_DEFECT_UNRESOLVED',
        strategy: 'NO_OP',
        description: 'Leave clip gain unchanged; retain peak overflow finding in audit log',
        parameters: {},
        expected_effect: 'No project state mutation',
        known_risks: 'May clip during downstream lossy encoding or broadcast transmission',
        is_recommended: false
      });
    } else {
      alternatives.push({
        option_id: 'EXECUTE_PROPOSED_STRATEGY',
        strategy: proposal.strategy,
        description: `Execute proposal ${proposal.proposal_id}`,
        parameters: { ...proposal.parameters },
        expected_effect: 'Resolves detected defect',
        known_risks: 'Standard operational risk',
        is_recommended: true
      });
    }

    const advisory = {
      schema_version: '1.0.0',
      request_id: requestId,
      proposal_id: proposal.proposal_id,
      finding_id: assessment.finding_id,
      defect_type: assessment.defect_type,
      candidate_revision: project.revision,
      source_media_sha256: assessment.source_media_sha256 || 'urn:sha256:placeholder',
      target: {
        clip_id: clipId,
        track_id: trackId
      },
      confidence: {
        score: assessment.confidence_score,
        policy_name: assessment.policy_name,
        policy_version: assessment.policy_version,
        components: assessment.components
      },
      acoustic_evidence: {
        defect_type: assessment.defect_type,
        confidence: assessment.components?.evidence_score || 0.50
      },
      recommended_option: alternatives[0].option_id,
      available_alternatives: alternatives,
      invalidation_conditions: {
        max_valid_revision: project.revision,
        requires_track_unlocked: true,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      },
      lifecycle_status: 'AWAITING_APPROVAL',
      rationale: assessment.rationale
    };

    this.journal.push({
      timestamp: new Date().toISOString(),
      event: 'ADVISORY_GENERATED',
      request_id: requestId,
      proposal_id: proposal.proposal_id,
      candidate_revision: project.revision
    });

    return advisory;
  }

  /**
   * Validates an explicit human approval against the active advisory and project revision (ARC-29-10).
   *
   * @param {Object} advisory Structured human_review_request
   * @param {Object} approvalPayload Human approval submission
   * @param {Object} currentProject Current active EME project
   * @returns {Object} Validation outcome
   */
  validateApproval(advisory, approvalPayload, currentProject) {
    if (!advisory || typeof advisory !== 'object') {
      return {
        valid: false,
        error_code: 'INVALID_ADVISORY',
        reason: 'Review advisory is missing or malformed'
      };
    }
    if (!approvalPayload || typeof approvalPayload !== 'object') {
      return {
        valid: false,
        error_code: 'MISSING_APPROVAL',
        reason: 'Approval payload is missing or not an object'
      };
    }
    if (!currentProject || typeof currentProject !== 'object') {
      return {
        valid: false,
        error_code: 'INVALID_PROJECT',
        reason: 'Current project is missing or not an object'
      };
    }

    // Check request status
    if (advisory.lifecycle_status !== 'AWAITING_APPROVAL') {
      return {
        valid: false,
        error_code: 'REQUEST_NOT_ELIGIBLE',
        reason: `Review request is not in AWAITING_APPROVAL status (current: ${advisory.lifecycle_status})`
      };
    }

    // Check explicit approval decision
    if (approvalPayload.decision !== 'APPROVE') {
      return {
        valid: false,
        error_code: 'NOT_APPROVED',
        reason: `Explicit approval not recorded (received decision: ${approvalPayload.decision})`
      };
    }

    // Strict Revision Fencing (ARC-29-10)
    // If the project revision has advanced since advisory was generated, invalidate approval!
    if (currentProject.revision !== advisory.candidate_revision) {
      return {
        valid: false,
        error_code: 'APPROVAL_INVALIDATED_STALE_REVISION',
        reason: `Project revision has advanced (current: ${currentProject.revision}, advisory: ${advisory.candidate_revision}); approval invalidated`
      };
    }

    // Validate approved option
    const approvedOptionId = approvalPayload.selected_option || approvalPayload.approved_option;
    const matchedAlt = (advisory.available_alternatives || []).find(a => a.option_id === approvedOptionId);

    if (!matchedAlt) {
      return {
        valid: false,
        error_code: 'UNSUPPORTED_REPAIR_OPTION',
        reason: `Selected option '${approvedOptionId}' is not among supported advisory alternatives`
      };
    }

    // Check if operation was materially modified without authorization
    if (approvalPayload.material_modifications) {
      return {
        valid: false,
        error_code: 'MATERIAL_MODIFICATION_REJECTED',
        reason: 'Approval contained unverified material modifications to proposed operation parameters'
      };
    }

    // Check track lock
    const trackId = advisory.target?.track_id;
    if (trackId && currentProject.tracks) {
      const track = currentProject.tracks.find(t => t.id === trackId);
      if (track && track.locked) {
        return {
          valid: false,
          error_code: 'TRACK_LOCKED',
          reason: `Track ${trackId} has been locked since review advisory generation`
        };
      }
    }

    this.journal.push({
      timestamp: new Date().toISOString(),
      event: 'APPROVAL_VALIDATED',
      request_id: advisory.request_id,
      selected_option: approvedOptionId,
      project_revision: currentProject.revision
    });

    return {
      valid: true,
      approved_option: matchedAlt,
      request_id: advisory.request_id,
      proposal_id: advisory.proposal_id,
      project_revision: currentProject.revision
    };
  }

  /**
   * Deterministically partitions a mixed-confidence batch of proposals (ARC-29-12).
   *
   * @param {Object} project
   * @param {Array<Object>} proposals
   * @param {Array<Object>} assessments
   * @returns {Object} Partitioned batch results
   */
  partitionBatch(project, proposals, assessments) {
    const autonomous = [];
    const escalated = [];
    const speculative = [];
    const rejected = [];

    const assessmentMap = new Map();
    for (const a of assessments) {
      assessmentMap.set(a.proposal_id, a);
    }

    // Initial individual classification
    for (const proposal of proposals) {
      const assessment = assessmentMap.get(proposal.proposal_id);
      if (!assessment) {
        rejected.push({
          proposal,
          reason: 'Missing confidence assessment record'
        });
        continue;
      }

      const route = this.routeProposal(proposal, assessment, project);
      if (route.disposition === 'AUTONOMOUS_EXECUTION') {
        autonomous.push({ proposal, assessment, route });
      } else if (route.disposition === 'HUMAN_ESCALATION_REQUIRED') {
        escalated.push({ proposal, assessment, route, advisory: route.advisory });
      } else if (route.disposition === 'DISCARD_SPECULATIVE') {
        speculative.push({ proposal, assessment, route });
      } else {
        rejected.push({ proposal, assessment, route, reason: route.reason });
      }
    }

    // Dependency analysis across mixed batch (ARC-29-12)
    // If an autonomous proposal shares track/interval or depends on an escalated proposal's clip,
    // it MUST NOT run ahead; it must be held in DEFERRED_PENDING_REVIEW!
    const escalatedClipIds = new Set(escalated.map(e => e.proposal.clip_id || e.proposal.parameters?.clip_id));
    const escalatedTrackIds = new Set(escalated.map(e => e.proposal.track_id || e.proposal.parameters?.track_id));

    const safeAutonomous = [];
    const heldAutonomous = [];

    for (const autoItem of autonomous) {
      const clipId = autoItem.proposal.clip_id || autoItem.proposal.parameters?.clip_id;
      const trackId = autoItem.proposal.track_id || autoItem.proposal.parameters?.track_id;

      // Check if dependent on escalated clip or sharing congested track
      const sharesClip = escalatedClipIds.has(clipId);
      const sharesTrack = escalatedTrackIds.has(trackId);

      if (sharesClip || sharesTrack) {
        heldAutonomous.push({
          ...autoItem,
          held_reason: `Deferred: shares clip (${sharesClip}) or track (${sharesTrack}) with pending escalated proposal`
        });
      } else {
        safeAutonomous.push(autoItem);
      }
    }

    return {
      autonomous_executable: safeAutonomous,
      autonomous_held: heldAutonomous,
      escalated_advisories: escalated,
      speculative_discarded: speculative,
      rejected_preconditions: rejected,
      has_pending_reviews: escalated.length > 0,
      safe_to_promote_immediately: escalated.length === 0 && safeAutonomous.length > 0
    };
  }
}

module.exports = {
  RepairEscalationRouter
};
