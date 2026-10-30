# Design feedback acceptance — 2026-10-30

`npm test` passed 233 tests: 165 bounded engine acceptance tests, seven Studio,
fourteen scene, five protected-title placement, twenty editor/waveform, ten design
and twelve new ranking/feedback tests. Contract and portable-input verification
also exited zero. Raw aggregate output is retained locally under ignored
`.artifacts/design-ranking/test-output.txt`.

The new checks cover deterministic cold-start ranking, preference adaptation on an
unseen controlled brief, persistence, recipe/aspect discounting, explicit style
priority, neutral unselected siblings, correction/retraction, duplicate/retry
handling, negative feedback, ineligible designs, tampered evidence, corrupted
history, a live ledger lock, browser/agent authority and historical set recovery.
Preference changes leave sealed proposals unchanged. Explicitly unsuitable designs
cannot be newly proposed until feedback is corrected or retracted. Production stdio
exercises `eme_studio_rank_designs` alongside the existing planning/proposal tools.
The real lower-third and standalone graphic exports still pass final-media QA and
decoded-frame comparison in the design suite.

An isolated browser workspace exercised candidate generation, a rules-only
recommendation, explicit comparison submission, Studio restart, persisted history,
correction replacing a vote, and retraction restoring rules-only recommendations.
The browser readout retained one matching observation after correction and removed
its influence after retraction. The project remained at revision zero with no
proposal. Browser capture became unavailable after these interaction checks, so no
new screenshot is claimed. The isolated workspace remains under ignored
`.artifacts/design-ranking/browser-v1/`; its notes label feedback as automated
acceptance data, and both preference records were retracted or superseded.

Controlled labels establish the update and persistence behavior; they are not human
aesthetic evaluations, independent model comparisons, or proof of generalization
to new source projects. This is local statistical preference adaptation, without
neural training or automatic code changes. The corpus export is explicitly labelled
static-preview evidence. See [policy, scope and workflow](DESIGN_FEEDBACK.md).
