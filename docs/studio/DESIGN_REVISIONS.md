# Editable designs and parameter preferences

EME stores a component definition alongside each generated graphic: exact content,
recipe, style, base interval, four parameters, measured output and a binding to its
timeline clip and animation channels. The IDE describes an edit; EME measures and
compiles a reviewable proposal. This works for footage lower thirds, title cards
and statistic cards.

## Browser workflow

1. Open **Design**, choose a style and enter content. Choose **Variations within
   one style** to compare the requested design with up to two alternatives in
   title size, spacing, slide motion or hold length.
2. Review and apply a candidate. Select its timeline clip, then choose **Edit design
   content and motion** in Inspector. Alternatively select the saved component in Design.
3. Change content, timing or a parameter. Only changed fields are submitted. EME
   preserves the style unless explicitly changed. Revision alternatives explore up
   to two changed parameter axes in the requested direction. **Requested revision
   only** generates one candidate.
4. Inspect measured values and play motion proxies when useful, then review before
   applying. Revisions retain clip/track IDs and replace only this graphic and its
   animation channels. Undo/redo and restart retain the component definition.
5. Save an explicit preference for designs actually compared. This updates local
   recommendations without editing. Applying an edit alone casts no vote.

## Engine parameters

| Parameter      | Range    | Meaning                                                                                                              |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `titleScale`   | 0.8–1.4  | Preferred main-title size, subject to measured fitting. Other text roles retain their hierarchy.                     |
| `spacingScale` | 0.75–1.5 | Gap between text roles.                                                                                              |
| `motionScale`  | 0–1.75   | Entrance slide travel. Zero removes the slide; opacity fades remain.                                                 |
| `holdScale`    | 0.8–1.5  | Scales the base interval, rounded to sequence frames. Entry/exit time is deducted to obtain the static reading hold. |

Defaults are 1; the browser displays percentages. A six-second base interval at
115% hold length results in approximately 6.9 seconds total duration. Candidates
show exact duration and static hold. Lower thirds must still fit their source
footage. Revisions cannot cover other overlays or exceed the sequence. Minimum
reading time is checked again after scaling.

Natural-language interpretation stays in the IDE. Structured engine adjustments are
`typography: larger|smaller` (±0.15 title scale), `spacing: more|less` (±0.15),
`motion: more|less` (±0.30), and `hold: longer|shorter` (±0.15). Explicit numeric
parameters are also accepted. These forms are mutually exclusive for a revision.
Bounds are enforced without silently clamping requested changes.

Exploration keeps the requested design and adds one candidate per selected axis:
steps of 0.12 for title/spacing/hold and 0.30 for motion, bounded at the limits.
Content and unrelated parameters remain fixed. Revisions follow the requested
direction; new within-style plans default to larger titles, more spacing, longer
holds and quieter motion. Saturated or unfit variants may be absent, with reasons.

An increase/decrease must change measured font pixels, gap, slide travel or static
hold. A long title that cannot actually grow without overflowing is refused instead
of producing unchanged output labelled “larger.”

## IDE contract

Studio exposes 37 tools. `eme_studio_get_inbox` includes current `designComponents`,
their IDs/content/style/parameters, supported limits and actual project revision.
Read the selected component when needed:

```json
{
  "name": "eme_studio_get_design_component",
  "arguments": { "clipId": "FROM_PROJECT" }
}
```

Then request a revision:

```json
{
  "name": "eme_studio_revise_design",
  "arguments": {
    "requestId": "FROM_INBOX",
    "baseRevision": 8,
    "clipId": "FROM_PROJECT",
    "changes": { "adjustments": { "typography": "larger", "motion": "less" } },
    "explore": true
  }
}
```

`changes` also accepts `title`, `body`, `eyebrow`, `value`, `startTick`,
`durationTicks`, `profileId` and `parameters`. Omitted fields are preserved.
Recipe and source association cannot change through a revision. Use
`eme_studio_propose_design` with the resulting IDs to queue review. Reading,
planning and ranking do not mutate the project. The IDE cannot approve its edits
or submit user preference labels through agent routes.

For new designs, `eme_studio_plan_design` accepts `brief.parameters`,
`variationMode: "parameters"`, exactly one profile in `profiles`, and `variationAxes`
containing one or two distinct parameter keys. Default planning compares styles.
Browser routes are `GET /api/design/component/:clipId` and `POST /api/design/revise`;
equivalent agent routes retain request/revision guards.

## Learning and motion evidence

[Ranker v2](DESIGN_FEEDBACK.md) learns parameter buckets from explicit comparisons.
A choice between two Balanced variants does not count as a win/loss for Balanced
itself. Unchanged dimensions receive no parameter signal. Rejection without a
preferred candidate does not identify which parameter caused the rejection.
Reason tags and notes are retained, not interpreted as automatic numeric labels.

Each candidate includes a silent animated WebP proxy, up to 480 pixels wide and
12 fps, using the compiled position/opacity channels. Footage lower thirds use a
source still as background. Intervals over ten seconds have their middle hold
shortened while retaining entry/exit. Proxies do not preview source motion, audio
or the complete native render. Native export remains authoritative.

Opening both compared proxies and explicitly saving feedback declares their motion
review. Only these comparisons update motion parameter preferences. This is a
review declaration, not proof of attention or final-render quality. Proxies and
hashes are bound to candidates; tampered proxies cannot be reviewed or proposed.
Export keeps `motionReviewedCandidateIds` separate from `static_preview` evidence.

## Compatibility and scope

Rendering still uses a compiled raster graphic with native animations. Editing is
possible because its source definition is retained. This is not an arbitrary vector
scene graph or free-form generated component code. External timeline/transform/channel
changes invalidate the exact binding. Restore its design revision or create a fresh
design before using the design editor again. Locked/muted tracks cannot be revised.

Older graphics migrate only when their matching original plan and exact generated
operations remain available. Lost content is not inferred from pixels. Generated
assets remain available for history and undo.

Run `npm run test:design` for revision, preference, production stdio, integrity and
native-render checks. `npm run demo:revisions` renders twelve-second before/after
examples with both a footage lower third and a motion-graphics card, requesting
“larger title, less slide motion” through structured adjustments. Retain results
with `npm run demo:revisions -- /absolute/new-folder` (parent must exist).
The fixture uses generated artwork/tone and its own briefs, and submits no votes.
Controlled tests do not establish human aesthetic quality, model parity or neural
training. See [acceptance evidence](DESIGN_REVISIONS_ACCEPTANCE.md).
