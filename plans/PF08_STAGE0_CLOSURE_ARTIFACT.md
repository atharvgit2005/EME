# PF-08 Stage 0 Closure Artifact: Certification Conditions & Resolution Evidence

**Phase**: PF-08 $\rightarrow$ PF-09 Bridge  
**Artifact Status**: **RESOLVED & CERTIFIED**  
**Date**: 2026-10-19

---

## 1. QA Boundary Verification (Scores 79, 80, 81)

The configured minimum QA threshold is an immutable hard eligibility gate. Under the EME multi-tier evaluation contract:
$$\text{Eligibility} = (\text{status} == \text{'committed'}) \land (\text{qa\_decision} == \text{'PASS'}) \land (\text{qa\_score} \ge 80) \land (\text{semantic} == \text{'verified'})$$

### Boundary Test Matrix
| QA Score | QA Decision | Semantic Status | Hard Gates Passed | Preference Score | Composite Score | Rank | Eligible for Selection |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **79** | PASS | verified | **FALSE** | 1.00 (100% match) | **0.0000** | **null** | **FALSE** |
| **80** | PASS | verified | **TRUE** | 1.00 | **0.9500** | **#1** | **TRUE** |
| **81** | PASS | verified | **TRUE** | 1.00 | **0.9525** | **#1** | **TRUE** |

### Continuous Contribution Isolation
- For score **79**, even with maximal preference satisfaction (1.00) and perfect musical alignment (1.00), the candidate is disqualified before soft scoring.
- The continuous contribution of QA ($0.25 \times \text{qa\_score} / 100$) is evaluated **only** on candidates that clear all eligibility gates.
- Soft preference satisfaction cannot revive or make an ineligible candidate selectable under any circumstances.

---

## 2. Separation of Explicit Rejection vs Non-Selection

`schema/eme-preference-feedback.v1.schema.json` and `PreferenceFeedbackRecorder` have been updated to explicitly partition creator actions:

1. **`unselected_candidate_ids`**: Sibling candidate variations presented in the candidate set that were simply not chosen (passive non-selection).
2. **`explicitly_rejected_candidate_ids`**: Candidate variations explicitly marked as rejected or disliked by creator input.
3. **`rejected_candidate_ids`**: Retained for backward compatibility, mapping to explicit rejections if present, otherwise to unselected alternatives.
4. **Audit Provenance**:
   `"User selected candidate \"cand-dynamic\" with manifest \"man-8291a84f3c02\". Unselected alternatives: [cand-cinematic, cand-editorial]. Explicit rejections: []."`

---

## 3. Measurable Rendered Differences Across Candidates

Evidence confirming that variation profiles produce distinct on-disk deliverables:

| Candidate ID | Profile Name | Cut Beat Indices | Transition Style | Transition Duration | Typography Style | Deliverable SHA-256 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `cand-dynamic` | Dynamic | [6, 14] | `quick_dissolve` | 60,000 ticks (0.5s) | `bold_punchy` | `ab143bf490...` |
| `cand-cinematic`| Cinematic | [8, 16] | `cross_dissolve` | 120,000 ticks (1.0s)| `classic_cinematic`| `0ce3f1e92d...` |
| `cand-editorial`| Editorial | [10, 18]| `subtle_dissolve`| 180,000 ticks (1.5s)| `editorial_hierarchy`| `c86a01b7a2...` |

When rendered with real/independent video tracks, each profile's operation plan yields distinct video streams, distinct visual cut timings, distinct alpha transitions, and unique cryptographic SHA-256 hashes.

---

## 4. Preference Extraction Token Consistency

Parity verified across `PreferenceExtractor` and test suites:
- **Pacing**: `rapid` (fast, rapid, punchy, dynamic), `fluid` (smooth, fluid, cinematic), `restrained` (slower, editorial, subtle).
- **Transitions**: `quick_dissolve` (quick cut/dissolve, tight transition), `cross_dissolve` (cross-dissolve, seamless dissolve), `subtle_dissolve` (subtle dissolve, soft transition).
- **Typography**: `bold_punchy` (bold typography, punchy text), `classic_cinematic` (classic typography, clean title), `editorial_hierarchy` (editorial hierarchy, italic title).
- **Musical Alignment**: `downbeat_priority` (downbeat, beat sync), `phrase_priority` (phrase, cadence), `section_priority` (section, section boundary).

All conditions for PF-08 closure are satisfied. Proceeding directly to Phase PF-09.
