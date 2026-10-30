# Editable design acceptance — 2026-10-30

`npm test` passed 244 tests: 165 bounded engine checks, seven Studio, fourteen
scene, five protected-title placement, twenty editor/waveform and thirty-three
design/ranking/revision tests. Contract and portable-input verification also exited
zero. After final refinements, all thirty-three design tests passed again.

The eleven revision checks cover:

- Measured within-style alternatives and animated WebP evidence.
- Larger typography and quieter motion while preserving content, style, unrelated
  clips and component IDs, including undo/redo and restart.
- Text, spacing and shorter/longer hold revisions; readable bounds, locks, external
  component changes, sequence/source limits and overlay collisions.
- Migration only from matching original legacy operations.
- Production stdio component-read/revision/proposal tools, request ownership,
  stale revisions and review authority.
- Real revised footage export, retained source audio and decoded-frame agreement
  with the preview (mean absolute difference below 8).
- Parameter preference learning on an unseen controlled brief, neutral unchanged
  axes and no style penalty for choices within one style.
- Motion learning only after declared review of both bound proxies; corrections
  retain one active influence.
- Refusal when a title cannot measurably grow without overflow.

An isolated browser workspace exercised creation, within-style variants, review,
apply, Inspector loading, targeted revision, silent motion proxy controls, explicit
feedback and retraction. One controlled comparison gave motion history 12% weight;
retraction restored the rules-only recommendation. No acceptance vote remains
active. Applying the requested revision and reopening the component retained
115% title size, 70% slide motion, unchanged content/style, and 100% spacing/hold.
The screenshot is retained at `.artifacts/design-revisions/component-editor.png`.

`npm run demo:revisions -- .artifacts/design-revisions/example-v2` rendered both
before and after twelve-second compositions using generated artwork and tone. Both
native deliveries passed. The footage lower-third title grew from 44 to 51 pixels;
the motion-graphics card title grew from 61 to 70 pixels. Slide travel fell from
10 to 6 pixels on both. Content, base timing, gaps and static holds remained fixed,
and both retained their clip IDs and Balanced style. Decoded output frames were
visually inspected. The fixture submits no preference labels.

Raw logs, screenshot, decoded frames and `acceptance.json` remain under ignored
`.artifacts/design-revisions/`. The repeatable demo script is
`scripts/demo-design-revisions.cjs`; its JSON report links both MP4s and manifests.
No files in the user's active `.eme` workspace were edited by these isolated checks.

These are engineering acceptance checks using controlled briefs/labels, without
neural inference or fine-tuning. Human reviews across diverse source projects are
still needed to assess aesthetic quality and model independence. Motion proxies
remain silent animations over still backgrounds, not full timeline renders.
See [workflow and scope](DESIGN_REVISIONS.md).
