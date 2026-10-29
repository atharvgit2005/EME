/**
 * Editing Mechanics Engine (EME) - Candidate Musical Scorer (PF-07 Integration)
 *
 * Implements hard-gate-first, explainable candidate scoring and deterministic
 * tie-breaking based on Phase A2 musical structure evidence.
 *
 * Enforces:
 * - Hard gates outrank musical alignment (failed QA, uncommitted execution, or semantic violations reject candidate with score 0).
 * - Normalized, versioned component weighting (downbeat, phrase, section alignment).
 * - Proportional weight redistribution when individual components are unavailable.
 * - Deterministic multi-stage tie-breaking (composite score -> semantic criteria -> QA score -> average cut delta -> canonical profile).
 */

class CandidateMusicalScorer {
  static get SCORER_VERSION() {
    return '1.0.0';
  }

  static get DEFAULT_WEIGHTS() {
    return {
      downbeat: 0.50,
      phrase: 0.30,
      section: 0.20
    };
  }

  /**
   * Scores and ranks candidates using musical structure evidence.
   *
   * @param {object} params
   * @param {Array<object>} params.candidates Array of evaluated candidate objects
   * @param {object} params.adaptedStructure Output from MusicalStructureAdapter
   * @param {object} [params.brief] Source EditBrief
   * @param {object} [params.options] Scoring options
   * @returns {Array<object>} Scored and ranked candidates with explainable breakdowns
   */
  static scoreAndRankCandidates({ candidates, adaptedStructure, brief, options = {} }) {
    const scoredCandidates = [];
    const downbeatToleranceTicks = options.downbeatToleranceTicks ?? 4000; // ~33ms at 30fps

    // Step 1: Evaluate Hard Gates & Compute Component Scores
    for (const cand of candidates) {
      const executionStatus = cand.execution?.status;
      const qaDecision = cand.qa_summary?.decision;
      const qaScore = cand.qa_summary?.score ?? 0;
      const semanticStatus = cand.semantic_verification?.status;
      const overallStatus = cand.status;

      // Hard gate checks:
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
        hardGateFailures.push('Candidate marked as failed in sandbox pipeline');
      }

      if (hardGateFailures.length > 0) {
        // Failed candidate receives zero score and is disqualified from selection
        scoredCandidates.push({
          candidate_id: cand.candidate_id,
          profile_name: cand.variation_profile?.name,
          hard_gates_passed: false,
          disqualification_reasons: hardGateFailures,
          musical_score: 0.0,
          composite_score: 0.0,
          rank: null,
          eligible_for_selection: false,
          component_scores: null,
          avg_cut_delta_ticks: Infinity,
          explanation: `Disqualified by hard gates: ${hardGateFailures.join('; ')}`
        });
        continue;
      }

      // Step 2: Musical Alignment Scoring for Hard-Gate-Passing Candidates
      const project = cand._executedProject;
      const cuts = [];
      if (project && Array.isArray(project.clips)) {
        const videoClips = project.clips
          .filter(c => c.type === 'video' && c.trackId === 'track_v_main')
          .sort((a, b) => a.startTick - b.startTick);

        for (let i = 1; i < videoClips.length; i++) {
          cuts.push(videoClips[i].startTick);
        }
      }

      // Case A: Adapter is in fallback mode or missing structure
      if (!adaptedStructure || adaptedStructure.fallbackActive || !adaptedStructure.isValid) {
        // Deterministic neutral scoring based purely on QA & baseline compliance
        const compositeScore = Number((qaScore / 100).toFixed(4));
        scoredCandidates.push({
          candidate_id: cand.candidate_id,
          profile_name: cand.variation_profile?.name,
          hard_gates_passed: true,
          disqualification_reasons: [],
          musical_score: 1.0,
          composite_score: compositeScore,
          rank: null, // assigned below
          eligible_for_selection: true,
          component_scores: {
            fallback_active: true,
            reason: adaptedStructure?.reasons?.[0] || 'deterministic_baseline_fallback'
          },
          avg_cut_delta_ticks: 0,
          explanation: 'Sidecar evidence unavailable or ambiguous; evaluated on baseline compliance and physical QA.'
        });
        continue;
      }

      // Case B: Structure-aware scoring with accepted events
      const acceptedDownbeats = adaptedStructure.acceptedEvents?.downbeats || [];
      const acceptedPhrases = adaptedStructure.acceptedEvents?.phrases || [];
      const acceptedSections = adaptedStructure.acceptedEvents?.sections || [];

      // 1. Downbeat component score
      let downbeatScore = 0;
      let totalCutDeltaTicks = 0;
      let matchedCutsCount = 0;

      if (cuts.length > 0 && acceptedDownbeats.length > 0) {
        for (const cutTick of cuts) {
          let minDelta = Infinity;
          for (const db of acceptedDownbeats) {
            const delta = Math.abs(cutTick - db.downbeatTicks);
            if (delta < minDelta) minDelta = delta;
          }
          totalCutDeltaTicks += minDelta;
          if (minDelta <= downbeatToleranceTicks) {
            matchedCutsCount++;
            downbeatScore += 1.0;
          } else if (minDelta <= downbeatToleranceTicks * 3) {
            // Linear decay up to 3 frames
            const scorePart = Math.max(0, 1 - (minDelta - downbeatToleranceTicks) / (downbeatToleranceTicks * 2));
            downbeatScore += scorePart;
          }
        }
        downbeatScore = Number((downbeatScore / cuts.length).toFixed(4));
      } else {
        downbeatScore = 1.0;
      }

      const avgCutDeltaTicks = cuts.length > 0 ? totalCutDeltaTicks / cuts.length : 0;

      // 2. Phrase component score
      let phraseScore = 1.0;
      let matchedPhrasesCount = 0;
      if (acceptedPhrases.length > 0) {
        // Measure transition effect center or B-roll start alignment to phrases
        const brollClip = (project?.clips || []).find(c => c.trackId === 'track_v_broll');
        if (brollClip) {
          let minPhraseDelta = Infinity;
          for (const ph of acceptedPhrases) {
            const d1 = Math.abs(brollClip.startTick - ph.startTicks);
            const d2 = Math.abs((brollClip.startTick + brollClip.durationTicks) - ph.endTicks);
            const d = Math.min(d1, d2);
            if (d < minPhraseDelta) minPhraseDelta = d;
          }
          if (minPhraseDelta <= downbeatToleranceTicks * 2) {
            matchedPhrasesCount++;
            phraseScore = 1.0;
          } else {
            phraseScore = Number(Math.max(0.5, 1 - minPhraseDelta / 240000).toFixed(4));
          }
        }
      }

      // 3. Section component score
      let sectionScore = 1.0;
      let matchedSectionsCount = 0;
      if (acceptedSections.length > 0) {
        // Measure text overlay alignment to section boundaries
        const textClip = (project?.clips || []).find(c => c.type === 'text' || c.trackId === 'track_graphics');
        if (textClip) {
          let minSecDelta = Infinity;
          for (const sec of acceptedSections) {
            const d1 = Math.abs(textClip.startTick - sec.startTicks);
            const d2 = Math.abs((textClip.startTick + textClip.durationTicks) - sec.endTicks);
            const d = Math.min(d1, d2);
            if (d < minSecDelta) minSecDelta = d;
          }
          if (minSecDelta <= downbeatToleranceTicks * 2) {
            matchedSectionsCount++;
            sectionScore = 1.0;
          } else {
            sectionScore = Number(Math.max(0.6, 1 - minSecDelta / 360000).toFixed(4));
          }
        }
      }

      // Proportional weight normalization
      const hasDownbeats = acceptedDownbeats.length > 0;
      const hasPhrases = acceptedPhrases.length > 0;
      const hasSections = acceptedSections.length > 0;

      let sumWeights =
        (hasDownbeats ? this.DEFAULT_WEIGHTS.downbeat : 0) +
        (hasPhrases ? this.DEFAULT_WEIGHTS.phrase : 0) +
        (hasSections ? this.DEFAULT_WEIGHTS.section : 0);

      if (sumWeights === 0) sumWeights = 1.0;

      const normWDownbeat = hasDownbeats ? this.DEFAULT_WEIGHTS.downbeat / sumWeights : 0;
      const normWPhrase = hasPhrases ? this.DEFAULT_WEIGHTS.phrase / sumWeights : 0;
      const normWSection = hasSections ? this.DEFAULT_WEIGHTS.section / sumWeights : 0;

      const totalMusicalScore = Number(
        (normWDownbeat * downbeatScore + normWPhrase * phraseScore + normWSection * sectionScore).toFixed(4)
      );

      // Composite score: 40% physical QA, 60% musical structure alignment
      const compositeScore = Number((0.40 * (qaScore / 100) + 0.60 * totalMusicalScore).toFixed(4));

      const explanation = `Candidate "${cand.candidate_id}" (${cand.variation_profile?.name}): Downbeat score ${downbeatScore.toFixed(2)} (${matchedCutsCount}/${cuts.length} cuts aligned), Phrase score ${phraseScore.toFixed(2)}, Section score ${sectionScore.toFixed(2)}. Total musical score: ${totalMusicalScore.toFixed(4)}, Composite: ${compositeScore.toFixed(4)}.`;

      scoredCandidates.push({
        candidate_id: cand.candidate_id,
        profile_name: cand.variation_profile?.name,
        hard_gates_passed: true,
        disqualification_reasons: [],
        musical_score: totalMusicalScore,
        composite_score: compositeScore,
        rank: null,
        eligible_for_selection: true,
        component_scores: {
          downbeat: {
            score: downbeatScore,
            weight: Number(normWDownbeat.toFixed(3)),
            matched_cuts: matchedCutsCount,
            total_cuts: cuts.length
          },
          phrase: {
            score: phraseScore,
            weight: Number(normWPhrase.toFixed(3)),
            matched_events: matchedPhrasesCount
          },
          section: {
            score: sectionScore,
            weight: Number(normWSection.toFixed(3)),
            matched_events: matchedSectionsCount
          }
        },
        avg_cut_delta_ticks: Math.round(avgCutDeltaTicks),
        qa_score: qaScore,
        semantic_passed_count: (cand.semantic_verification?.criteria || []).filter(c => c.status === 'passed').length,
        explanation
      });
    }

    // Step 3: Deterministic Ranking & Tie-Breaking
    const passing = scoredCandidates.filter(c => c.hard_gates_passed);
    const disqualified = scoredCandidates.filter(c => !c.hard_gates_passed);

    const profileOrder = { dynamic: 1, cinematic: 2, editorial: 3 };

    passing.sort((a, b) => {
      // 1. Composite score descending
      if (Math.abs(b.composite_score - a.composite_score) > 1e-5) {
        return b.composite_score - a.composite_score;
      }
      // 2. Semantic verification passed criteria count descending
      const semA = a.semantic_passed_count ?? 0;
      const semB = b.semantic_passed_count ?? 0;
      if (semB !== semA) {
        return semB - semA;
      }
      // 3. QA score descending
      const qaA = a.qa_score ?? 0;
      const qaB = b.qa_score ?? 0;
      if (qaB !== qaA) {
        return qaB - qaA;
      }
      // 4. Average cut-to-downbeat delta ticks ascending
      if (Math.abs(a.avg_cut_delta_ticks - b.avg_cut_delta_ticks) > 10) {
        return a.avg_cut_delta_ticks - b.avg_cut_delta_ticks;
      }
      // 5. Canonical profile order
      const profA = profileOrder[a.profile_name] || 99;
      const profB = profileOrder[b.profile_name] || 99;
      if (profA !== profB) {
        return profA - profB;
      }
      // 6. Lexicographical candidate ID
      return a.candidate_id.localeCompare(b.candidate_id);
    });

    passing.forEach((cand, idx) => {
      cand.rank = idx + 1;
    });

    disqualified.forEach(cand => {
      cand.rank = null;
    });

    return [...passing, ...disqualified];
  }
}

module.exports = {
  CandidateMusicalScorer
};
