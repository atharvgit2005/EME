# Design feedback and ranking v2

EME recommends eligible designs using measured rules and a persistent local
preference history. This is a small adaptive statistical ranker; it has no neural
checkpoint, teacher API, visual-quality model or automatic aesthetic guarantee.
The IDE workflow remains: read the inbox, plan, inspect the recommendation, propose,
and let the user review/apply. Any eligible candidate can be chosen.

## Use Studio

Open **Design**, generate candidates and inspect the **Recommended** badge and its
explanation. Below the previews, choose a preferred design and explicitly check
which alternatives you compared. Alternatively select **None of the compared
designs work**, then name those designs. Optional reason tags and a note record
what influenced the comparison. **Save preference feedback** updates recommendations
without changing the project or generating an edit proposal.

Reviewing, applying, dismissing, undoing or exporting an edit does not cast a vote.
Unchecked alternatives receive no negative signal. An explicit rejection makes that
exact design ineligible until its feedback is corrected or retracted; it does not
ban its whole style on future briefs. If every available candidate is explicitly
rejected, EME gives no recommendation and the user can revise the content or timing.

Expand **Recent designs and feedback** to revisit earlier sets, correct a comparison
or retract its influence. Corrections replace the previous active observation for
that comparison; old records remain in the audit history. Retracting a correction
does not resurrect a superseded vote. Retrying the same submission ID is idempotent.
Regenerating the same candidates against the same snapshot cannot multiply their
influence. Historical intact previews can still receive feedback after edits or
restarts, but applying them requires fresh planning against the current revision.

## Ranking policy

Hard eligibility checks run before scoring: source/project freshness, bound graphic,
font/report/still/motion-preview integrity, measured text bounds, minimum size and static reading
time. Unavailable or rejected candidates cannot win through preference history.

The versioned baseline heuristic uses three normalized features:

- Reading reserve: `clamp(holdTicks / (readingSeconds * 120000) - 1)`.
- Type comfort: `clamp((smallestFont / minimumFont - 1) / 0.75)`.
- Motion restraint: `1 - clamp(travel / min(canvasWidth, canvasHeight) / 0.04)`.

`baseline = 0.45 * readingReserve + 0.35 * typeComfort + 0.20 * motionRestraint`.
These are authored starting preferences for readable, restrained designs, not
validated universal measures of quality. A supplied `brief.preferredProfile`
(`editorial`, `balanced`, `energetic`) takes priority among eligible candidates;
learned history cannot override explicit style intent. The preferred profile must
be included in `brief.profiles` if that subset is supplied.

For each comparison between different profiles, the preferred profile receives one
positive observation and each named alternative profile one negative observation.
Comparisons within one profile do not reward or penalize that profile. Other siblings
remain neutral. Matching recipe and aspect observations have weight 1, same recipe with
a different aspect weight 0.5, and other recipes weight 0.25. The smoothed local
preference estimate is `(2 + wins) / (4 + wins + losses)`.

Parameter learning uses `titleScale`, `spacingScale`, `motionScale` and `holdScale`,
rounded to the nearest 0.1 bucket. A preferred bucket wins only against explicitly
compared different buckets; unchanged dimensions stay neutral. Rejections without
a preferred candidate update exact-design eligibility and profile evidence but do
not assign parameter causes. Motion buckets require declared review of bound
proxies for both preferred and compared designs. Old observations without parameters
use defaults of 1; missing motion-review declarations cast no motion vote.

Profile and parameter posteriors each use `(2 + wins) / (4 + wins + losses)`.
The parameter score averages observed parameter posteriors weighted by evidence
mass. Each historical blend weight starts at `0.6 * mass / (4 + mass)`; if their
sum exceeds 0.6, both are proportionally reduced to that cap. Remaining weight
belongs to the baseline. Responses expose `profileWeight`, `parameterWeight` and
per-axis `parameterEvidence`, including buckets and weighted counts.

This is workspace-wide preference adaptation with recipe/aspect discounting. It
does not learn arbitrary layouts, modify component code, establish causal effects
of correlated parameters, or infer numeric labels from tags/notes. Scores are
ordering aids, not probabilities. Total historical influence is capped at 60%.

No feedback produces a rules-only starting recommendation. Explanations disclose
matching/related observation counts and historical weight; limited feedback does
not become a fabricated confidence percentage. The ranking policy/version and
feedback revision accompany every result. Ranking is recomputed when requested;
previous sealed design reports and execution digests are not rewritten.

## IDE tools and authority

`eme_studio_plan_design` now returns a `ranking` alongside candidates. It contains
`recommendedCandidateId`, basis, policy version, feedback revision, and per-candidate
eligibility, rank, component scores, evidence counts and reasons.
`eme_studio_rank_designs {setId}` refreshes that result without edits or feedback.
The inbox includes `designPreferences` and refreshed rankings for current sets.
The Studio server exposes 37 tools in total, including component reading/revision
and optional graph-memory retrieval.

Preference submission/retraction use Studio's existing browser origin and review
capability; agent capability routes cannot submit user feedback. This is the
existing local application boundary, not physical-human authentication against an
unrestricted same-user process. The IDE can suggest that the user compare designs;
it cannot label its own choices as user preferences.

Browser endpoints are `GET /api/design/feedback`, `POST /api/design/feedback`,
`POST /api/design/feedback/withdraw`, `GET /api/design/feedback/export`, and
`GET /api/design/set/:setId`. Submission requires a fresh UUID `submissionId`,
`setId`, `preferredCandidateId` (or null), and nonempty distinct
`comparedCandidateIds`; reason tags and a note up to 600 characters are optional.
Optional `motionReviewedCandidateIds` declares which bound proxies were reviewed.

## Persistence and future training

Each workspace owns `design-feedback/feedback.json` plus immutable registered set
records under `design-feedback/sets/`. Atomic writes and the existing process-aware
lock coordinator serialize feedback changes. Checksums detect corrupted history;
EME does not silently replace it with empty preferences. Old set records remain
available even when the short list in Studio state rolls over.

**Export preference data** downloads active observations, exact candidate IDs,
briefs, measured features/reports, artifact hashes, reason tags and notes. It omits
machine-local artifact paths and labels the evidence stage `static_preview`.
Parameter buckets and declared `motionReviewedCandidateIds` are included separately.
These are source-bound examples, not certified final-render comparisons; proxy
review does not change that evidence label. Retracted and superseded
observations are excluded from training exports but retained in the audit ledger.

Split any future training/evaluation corpus by source project. Current automated
learning checks use controlled preference labels and an unseen brief; they show
that the update rule works and persists, not that people prefer its recommendations.
Independent reviews on diverse real projects remain necessary before aesthetic
quality or model-parity claims.

Optional [TigerGraph memory](TIGERGRAPH.md) mirrors structured facts and active/audit
relationships for retrieval. It excludes exact user wording and free-text notes.
The ranker continues to read this local ledger, so graph copies do not multiply
feedback influence. Graph downtime does not block feedback or editing.

See [editable components and within-style variants](DESIGN_REVISIONS.md) for the
revision workflow, parameter limits and motion-proxy scope.

Run `npm run test:design` for design, preference, authority and real-export tests.
`npm test` also runs the existing bounded engine/Studio/scene/editor checks.
