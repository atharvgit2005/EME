/**
 * Editing Mechanics Engine (EME) - Preference Feedback Recorder (PF-08)
 *
 * Implements Stage 3:
 * Records auditable, versioned preference-feedback records linking candidate selection
 * and rejected alternatives to exact manifest and preference identities.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { BriefValidator } = require('./brief-validator.js');

class PreferenceFeedbackRecorder {
  static get FEEDBACK_SCHEMA_VERSION() {
    return '1.0.0';
  }

  /**
   * Records candidate selection feedback with auditable provenance.
   *
   * @param {object} params
   * @param {object} params.candidateSetDoc Validated CandidateSet document
   * @param {string} params.selectedCandidateId ID of candidate chosen
   * @param {object} [params.preferenceProfile] Source preference profile
   * @param {string} [params.outputDir='artifacts/deliverables'] Output destination
   * @returns {{ success: boolean, feedbackRecord: object, feedbackPath: string, error?: string }}
   */
  static recordSelectionFeedback({
    candidateSetDoc,
    selectedCandidateId,
    preferenceProfile,
    explicitlyRejectedCandidateIds = [],
    outputDir = 'artifacts/deliverables'
  }) {
    fs.mkdirSync(outputDir, { recursive: true });

    if (!candidateSetDoc || !Array.isArray(candidateSetDoc.candidates)) {
      return { success: false, error: 'Invalid CandidateSet document provided' };
    }

    const selectedCand = candidateSetDoc.candidates.find(c => c.candidate_id === selectedCandidateId);
    if (!selectedCand) {
      return { success: false, error: `Candidate "${selectedCandidateId}" not found in set` };
    }

    if (selectedCand.status !== 'verified' || !selectedCand.deliverable?.manifest_id) {
      return {
        success: false,
        error: `Cannot record feedback for unverified candidate "${selectedCandidateId}"`
      };
    }

    // Determine unselected siblings and explicit rejections
    const unselectedIds = candidateSetDoc.candidates
      .filter(c => c.candidate_id !== selectedCandidateId)
      .map(c => c.candidate_id);
    const explicitlyRejected = Array.isArray(explicitlyRejectedCandidateIds)
      ? explicitlyRejectedCandidateIds
      : [];

    const feedbackId = `fb-${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const prefId = preferenceProfile?.preference_id || 'pref-00000000';

    const feedbackRecord = {
      schema_version: '1.0.0',
      feedback_id: feedbackId,
      timestamp,
      preference_id: prefId,
      candidate_set_id: candidateSetDoc.candidate_set_id,
      selected_candidate_id: selectedCandidateId,
      selected_manifest_id: selectedCand.deliverable.manifest_id,
      unselected_candidate_ids: unselectedIds,
      explicitly_rejected_candidate_ids: explicitlyRejected,
      rejected_candidate_ids: explicitlyRejected.length > 0 ? explicitlyRejected : unselectedIds,
      evaluation_evidence: {
        selected_rank: selectedCand.musical_alignment?.rank ?? 1,
        selected_composite_score: selectedCand.musical_alignment?.composite_score ?? 1.0,
        selected_qa_score: selectedCand.qa_summary?.score ?? 100,
        selected_musical_score: selectedCand.musical_alignment?.musical_score ?? 1.0,
        selected_preference_score: selectedCand.preference_alignment?.preference_score ?? 1.0
      },
      provenance: `User selected candidate "${selectedCandidateId}" with manifest "${selectedCand.deliverable.manifest_id}". Unselected alternatives: [${unselectedIds.join(', ')}]. Explicit rejections: [${explicitlyRejected.join(', ')}].`
    };

    // Validate schema
    const val = BriefValidator.validatePreferenceFeedback(feedbackRecord);
    if (!val.valid) {
      return {
        success: false,
        error: `Feedback record failed schema validation: ${val.errors.join('; ')}`
      };
    }

    // Persist feedback artifact
    const feedbackPath = path.join(outputDir, `${feedbackId}-feedback.json`);
    fs.writeFileSync(feedbackPath, JSON.stringify(feedbackRecord, null, 2), 'utf8');

    return {
      success: true,
      feedbackRecord,
      feedbackPath
    };
  }
}

module.exports = {
  PreferenceFeedbackRecorder
};
