# Shared design system v1

EME owns the first design step for both footage and motion graphics. The IDE supplies
content, recipe and interval; a local deterministic planner owns typography, measured
wrapping, spacing, layout, reading-time policy and motion. No model, training weights,
network service or model API key was added. This is the first implementation slice,
not automatic story selection, reference imitation or a neural aesthetic evaluator.

## Use Studio

Run `npm start`, then choose **Design** in the timeline toolbar. Choose a footage
lower third, title card or statistic card. Enter your exact content and timing.
Create candidates to compare Editorial, Balanced and Energetic. Each profile shares
type ratios, surface/text/accent roles, margins and entry/exit timing across recipes.
Click **Review this design**, inspect its proposal, then approve to apply it.
Undo/redo uses existing engine history. Dismissal preserves the existing edit.

Lower thirds require one visible, untransformed video covering the entire interval,
with a compatible static crop and no effects or animated transforms. Placement is
not subject-safe: use **Understand scene** and the existing protected-title tool
when the user requires avoidance of a tracked subject. Cards are opaque and cover
footage during their interval. Both paths preserve existing footage and audio clips.
Existing visual overlays in the requested interval must be removed through review
or avoided. The planner never silently replaces them.

Text is measured with the local Helvetica/DejaVu fallback font used by the engine.
Long text wraps and shrinks within recipe limits; content that cannot fit is refused.
No text is truncated or rewritten, and statistic values come from the caller.
Support is limited to glyphs available in that font. Reading time uses a configurable
profile word-rate heuristic, with a 1.2-second minimum static hold. It is not a
validated comprehension guarantee, especially for scripts without whitespace words.
Failed profiles return reasons while viable alternatives remain available. If no
profile can fit the content and timing, the planner returns an actionable error.

## IDE workflow

Read `eme_studio_get_inbox`; it includes `designSystem`, supported recipes, profiles,
limits, actual clip IDs and the current revision. The agent translates the queued
request into a brief, then calls the production Studio stdio tools:

```json
{
  "name": "eme_studio_plan_design",
  "arguments": {
    "requestId": "FROM_INBOX",
    "baseRevision": 8,
    "brief": {
      "recipe": "lower-third",
      "videoClipId": "FROM_PROJECT",
      "title": "Made to move",
      "eyebrow": "NEXT CHAPTER",
      "startTick": 0,
      "durationTicks": 720000
    }
  }
}
```

For `statistic-card`, provide `value`. All recipes accept optional `body` and
`eyebrow`. Cards omit `videoClipId`. `profiles` may select one to three unique
IDs: `editorial`, `balanced`, `energetic`. Timing must align to sequence frames.
The tool returns candidates, measured reports and preview URLs without changing
the project or creating an approval. Inspect these, then call:

```json
{
  "name": "eme_studio_propose_design",
  "arguments": {
    "requestId": "FROM_INBOX",
    "baseRevision": 8,
    "setId": "FROM_PLAN",
    "candidateId": "SELECTED_CANDIDATE"
  }
}
```

This creates a browser-review proposal only. The original IDE reasoning remains
external; registering MCP still does not wake an IDE automatically. The local form
and the IDE use the same planner and proposal path.

## Rendering and evidence

The planner compiles a component into a full-canvas PNG, a visual track and ordinary
`animate_property` operations. Smoothstep entrance is sampled at sequence frames
into the native renderer's supported linear keyframes; exit uses an opacity fade.
This adds no unsupported native easing or arbitrary executable code. Graphics now
retain an [editable component definition](DESIGN_REVISIONS.md). Use the design
editor to change content, title size, spacing, slide motion or hold length. EME
recompiles that component through review while retaining its clip/track IDs.
Generic transformations and timing changes create ordinary edits and invalidate
the exact binding; the original report describes the original plan only.

Still previews show the static hold. Optional silent proxies animate compiled
motion over a still background; long holds are shortened. Lower-third still
previews use the source at the entrance-end timestamp with the same crop. Studio
plays the generated graphics and their x/y/opacity channels on its timeline; final
native export remains authoritative. Studio also supports exporting graphic-only
compositions with an explicit audible soundtrack; silent verified export remains
unsupported.

Generated PNGs, still/motion previews, measured reports and font bytes are included in
approval asset bindings. Candidate IDs include version, project snapshot, brief,
profile, font hash and graphic hash. Changed project revisions, source bytes,
font/graphic/report/preview bytes or request ownership prevent stale execution.
Candidates remain local under `.eme/studio/designs/`; the last twenty sets are
listed in Studio state. Historical generated files are retained for history.
Final-media QA and durable native publication are unchanged.

## Verification and repeatable example

`npm run test:design` checks no-mutation planning, distinct candidates, measured
layout, portrait adaptation, overflow and reading-time refusal, unsupported source
mapping, stale/tampered dependencies, request/review authority, undo, production
stdio tools, and real native exports with decoded-frame comparison to previews.
`npm test` includes this suite alongside existing bounded acceptance suites.

`npm run demo:design` creates an isolated temporary workspace, generated artwork and
a generated tone, then renders a twelve-second sequence containing all three
recipes in one shared profile. It prints the MP4 and JSON evidence report paths.
The fixture supplies its briefs without LLM inference; it demonstrates engineering
behavior and does not establish independent aesthetic preference or model parity.
Pass a new, nonexistent directory with `npm run demo:design -- /absolute/new-folder`
to retain the example there instead of a temporary workspace. Its parent must exist.

The [feedback and candidate ranking system](DESIGN_FEEDBACK.md) now combines
measured rules with explicit local preferences and supports correction, retraction
and training-data export. Fine-tuning remains a later milestone after sufficient
reviewed outcomes.
