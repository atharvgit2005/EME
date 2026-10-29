/**
 * Editing Mechanics Engine (EME) - Preference Model & Evaluator (PF-08)
 *
 * Implements:
 * - PF-08.1: Explicit preference model extraction from prompt and brief invariants.
 * - PF-08.2: Explainable, hard-gate-first candidate evaluation against explicit user preferences.
 * - Hard constraints strictly outrank soft preferences.
 * - Deterministic fallback when preferences are unstated or neutral.
 */

const crypto = require('node:crypto');
const { BriefValidator } = require('./brief-validator.js');
const { CandidateMusicalScorer } = require('./candidate-musical-scorer.js');

class PreferenceExtractor {
  /**
   * Extracts an explicit, versioned preference profile from prompt and brief.
   *
   * @param {object} params
   * @param {string} params.rawPrompt Natural language request
   * @param {object} [params.brief] Validated EditBrief
   * @param {object} [params.options] Extraction options
   * @returns {object} Conforming eme-preference-profile.v1 document
   */
  static extractPreferences({ rawPrompt, brief, options = {} }) {
    const text = (rawPrompt || '').toLowerCase();
    const prefId = `pref-${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const diagnostics = [];

    // 1. Pacing dimension
    let pacingPref = 'neutral';
    let pacingStrength = 0;
    let pacingProv = 'default';

    if (text.includes('fast') || text.includes('rapid') || text.includes('high-energy') || text.includes('punchy') || text.includes('dynamic')) {
      pacingPref = 'rapid';
      pacingStrength = 0.90;
      pacingProv = 'explicit_user';
    } else if (text.includes('fluid') || text.includes('smooth') || text.includes('cinematic') || text.includes('balanced')) {
      pacingPref = 'fluid';
      pacingStrength = 0.90;
      pacingProv = 'explicit_user';
    } else if (text.includes('restrained') || text.includes('editorial') || text.includes('story') || text.includes('slower') || text.includes('subtle')) {
      pacingPref = 'restrained';
      pacingStrength = 0.90;
      pacingProv = 'explicit_user';
    }

    // 2. Transition style dimension
    let transPref = 'neutral';
    let transStrength = 0;
    let transProv = 'default';

    if (text.includes('quick dissolve') || text.includes('quick-dissolve') || text.includes('quick cut') || text.includes('tight transition')) {
      transPref = 'quick_dissolve';
      transStrength = 0.85;
      transProv = 'explicit_user';
    } else if (text.includes('cross dissolve') || text.includes('cross-dissolve') || text.includes('seamless dissolve')) {
      transPref = 'cross_dissolve';
      transStrength = 0.85;
      transProv = 'explicit_user';
    } else if (text.includes('subtle dissolve') || text.includes('subtle-dissolve') || text.includes('gentle dissolve') || text.includes('soft transition')) {
      transPref = 'subtle_dissolve';
      transStrength = 0.85;
      transProv = 'explicit_user';
    }

    // 3. Typography style dimension
    let typoPref = 'neutral';
    let typoStrength = 0;
    let typoProv = 'default';

    if (text.includes('bold typography') || text.includes('punchy text') || text.includes('bold title')) {
      typoPref = 'bold_punchy';
      typoStrength = 0.80;
      typoProv = 'explicit_user';
    } else if (text.includes('classic typography') || text.includes('cinematic title') || text.includes('clean text') || text.includes('clean title') || text.includes('classic title')) {
      typoPref = 'classic_cinematic';
      typoStrength = 0.80;
      typoProv = 'explicit_user';
    } else if (text.includes('editorial hierarchy') || text.includes('italic title') || text.includes('stylized text')) {
      typoPref = 'editorial_hierarchy';
      typoStrength = 0.80;
      typoProv = 'explicit_user';
    }

    // 4. Musical alignment dimension
    let musicPref = 'balanced';
    let musicStrength = 0.70;
    let musicProv = 'default';

    if (text.includes('downbeat') || text.includes('beat-first') || text.includes('beat sync')) {
      musicPref = 'downbeat_priority';
      musicStrength = 0.90;
      musicProv = 'explicit_user';
    } else if (text.includes('phrase') || text.includes('cadence')) {
      musicPref = 'phrase_priority';
      musicStrength = 0.90;
      musicProv = 'explicit_user';
    } else if (text.includes('section') || text.includes('section boundary') || text.includes('section boundaries')) {
      musicPref = 'section_priority';
      musicStrength = 0.90;
      musicProv = 'explicit_user';
    }

    const fallbackActive = pacingProv === 'default' && transProv === 'default' && typoProv === 'default';
    if (fallbackActive) {
      diagnostics.push('No explicit stylistic preferences specified; operating in neutral fallback evaluation mode.');
    }

    // Extract hard constraint references that outrank preferences
    const hardConstraintsRef = (brief?.constraints || [])
      .filter(c => c.strength === 'hard' || c.type === 'preserve_property' || c.type === 'preserve_fields')
      .map(c => c.constraint_id || 'C-HARD');

    const profileDoc = {
      schema_version: '1.0.0',
      preference_id: prefId,
      timestamp,
      request: {
        prompt: rawPrompt || '',
        brief_id: brief?.brief_id || 'brief-unknown'
      },
      dimensions: {
        pacing: { preference: pacingPref, strength: pacingStrength, provenance: pacingProv },
        transition_style: { preference: transPref, strength: transStrength, provenance: transProv },
        typography_style: { preference: typoPref, strength: typoStrength, provenance: typoProv },
        musical_alignment: { preference: musicPref, strength: musicStrength, provenance: musicProv }
      },
      hard_constraints_ref: hardConstraintsRef,
      scoring_weights: {
        preference_satisfaction: options.weightPreference ?? 0.40,
        musical_alignment: options.weightMusical ?? 0.35,
        physical_qa: options.weightQA ?? 0.25
      },
      fallback_active: fallbackActive,
      diagnostics
    };

    const val = BriefValidator.validatePreferenceProfile(profileDoc);
    if (!val.valid) {
      throw new Error(`Invalid preference profile schema: ${val.errors.join('; ')}`);
    }

    return profileDoc;
  }
}

class PreferenceEvaluator {
  static get EVALUATOR_VERSION() {
    return '1.0.0';
  }

  /**
   * Evaluates candidates against hard gates, user preferences, and musical structure.
   *
   * @param {object} params
   * @param {Array<object>} params.candidates Candidate records
   * @param {object} params.preferenceProfile Validated EMEPreferenceProfile
   * @param {object} params.adaptedStructure Validated musical structure adapter output
   * @param {object} [params.brief] EditBrief
   * @returns {Array<object>} Evaluated, scored, and ranked candidates
   */
  static evaluateCandidates({ candidates, preferenceProfile, adaptedStructure, brief }) {
    const scoredCandidates = [];
    const weights = preferenceProfile?.scoring_weights || {
      preference_satisfaction: 0.40,
      musical_alignment: 0.35,
      physical_qa: 0.25
    };

    for (const cand of candidates) {
      const executionStatus = cand.execution?.status;
      const qaDecision = cand.qa_summary?.decision;
      const qaScore = cand.qa_summary?.score ?? 0;
      const semanticStatus = cand.semantic_verification?.status;
      const overallStatus = cand.status;

      // 1. Hard Gate Eligibility
      const hardGateFailures = [];
      if (executionStatus !== 'committed') {
        hardGateFailures.push(`Execution not committed (${executionStatus})`);
      }
      if (qaDecision !== 'PASS' || qaScore < 80) {
        hardGateFailures.push(`Physical Media QA failed (${qaDecision || 'NONE'}, score: ${qaScore} < threshold 80)`);
      }
      if (semanticStatus !== 'verified') {
        hardGateFailures.push(`Semantic verification failed (${semanticStatus || 'NONE'})`);
      }
      if (overallStatus === 'failed') {
        hardGateFailures.push('Candidate marked failed in candidate set');
      }

      if (hardGateFailures.length > 0) {
        scoredCandidates.push({
          candidate_id: cand.candidate_id,
          profile_name: cand.variation_profile?.name,
          hard_gates_passed: false,
          disqualification_reasons: hardGateFailures,
          preference_score: 0.0,
          musical_score: 0.0,
          composite_score: 0.0,
          rank: null,
          eligible_for_selection: false,
          explanation: `Disqualified by hard gates: ${hardGateFailures.join('; ')}`
        });
        continue;
      }

      // 2. Preference Satisfaction Score
      const profile = cand.variation_profile || {};
      const dims = preferenceProfile?.dimensions || {};
      let matchCount = 0;
      let totalDims = 0;

      // Pacing match
      if (dims.pacing?.preference && dims.pacing.preference !== 'neutral') {
        totalDims++;
        if (
          (dims.pacing.preference === 'rapid' && profile.name === 'dynamic') ||
          (dims.pacing.preference === 'fluid' && profile.name === 'cinematic') ||
          (dims.pacing.preference === 'restrained' && profile.name === 'editorial')
        ) {
          matchCount += 1.0;
        } else {
          matchCount += 0.3; // partial compatibility
        }
      }

      // Transition match
      if (dims.transition_style?.preference && dims.transition_style.preference !== 'neutral') {
        totalDims++;
        if (dims.transition_style.preference === profile.transition_style) {
          matchCount += 1.0;
        } else {
          matchCount += 0.4;
        }
      }

      // Typography match
      if (dims.typography_style?.preference && dims.typography_style.preference !== 'neutral') {
        totalDims++;
        if (dims.typography_style.preference === profile.typography_style) {
          matchCount += 1.0;
        } else {
          matchCount += 0.4;
        }
      }

      const prefScore = totalDims > 0 ? Number((matchCount / totalDims).toFixed(4)) : 1.0;

      // 3. Musical Alignment Score (reuse CandidateMusicalScorer component logic)
      let musicalScore = cand.musical_alignment?.musical_score;
      if (musicalScore === undefined) {
        // Calculate via CandidateMusicalScorer
        const singleList = CandidateMusicalScorer.scoreAndRankCandidates({
          candidates: [cand],
          adaptedStructure,
          brief
        });
        musicalScore = singleList[0]?.musical_score ?? 1.0;
      }

      // 4. Composite Score
      const compositeScore = Number(
        (
          weights.preference_satisfaction * prefScore +
          weights.musical_alignment * musicalScore +
          weights.physical_qa * (qaScore / 100)
        ).toFixed(4)
      );

      const explanation = `Candidate "${cand.candidate_id}" (${profile.name}): Preference score ${prefScore.toFixed(2)}, Musical score ${musicalScore.toFixed(2)}, QA score ${qaScore}. Composite: ${compositeScore.toFixed(4)}.`;

      scoredCandidates.push({
        candidate_id: cand.candidate_id,
        profile_name: profile.name,
        hard_gates_passed: true,
        disqualification_reasons: [],
        preference_score: prefScore,
        musical_score: musicalScore,
        qa_score: qaScore,
        composite_score: compositeScore,
        rank: null,
        eligible_for_selection: true,
        explanation
      });
    }

    // 5. Deterministic Ranking & Tie-Breaking Ladder
    const passing = scoredCandidates.filter(c => c.hard_gates_passed);
    const disqualified = scoredCandidates.filter(c => !c.hard_gates_passed);
    const profileOrder = { dynamic: 1, cinematic: 2, editorial: 3 };

    passing.sort((a, b) => {
      // 1. Composite score descending
      if (Math.abs(b.composite_score - a.composite_score) > 1e-5) {
        return b.composite_score - a.composite_score;
      }
      // 2. Preference satisfaction score descending
      if (Math.abs(b.preference_score - a.preference_score) > 1e-5) {
        return b.preference_score - a.preference_score;
      }
      // 3. Musical alignment score descending
      if (Math.abs(b.musical_score - a.musical_score) > 1e-5) {
        return b.musical_score - a.musical_score;
      }
      // 4. QA score descending
      if (b.qa_score !== a.qa_score) {
        return b.qa_score - a.qa_score;
      }
      // 5. Canonical profile order
      const ordA = profileOrder[a.profile_name] || 99;
      const ordB = profileOrder[b.profile_name] || 99;
      if (ordA !== ordB) {
        return ordA - ordB;
      }
      // 6. Lexicographical candidate ID
      return a.candidate_id.localeCompare(b.candidate_id);
    });

    passing.forEach((c, idx) => {
      c.rank = idx + 1;
    });

    disqualified.forEach(c => {
      c.rank = null;
    });

    return [...passing, ...disqualified];
  }
}

module.exports = {
  PreferenceExtractor,
  PreferenceEvaluator
};
