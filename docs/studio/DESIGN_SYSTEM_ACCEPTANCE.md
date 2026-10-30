# Design system v1 acceptance — 2026-10-30

The first shared design slice is integrated with the existing IDE/MCP workflow,
Studio review, engine history and native delivery. No local planner model was added.

`npm test` passed all 221 tests: 165 existing engine acceptance tests, seven Studio,
fourteen scene, five protected-title placement, twenty editor/waveform and ten new
design tests. The contract and portable-input verification runners also exited zero.
The design suite includes production stdio proposal tools and real FFmpeg exports
for a lower third over footage and a standalone statistic card with a soundtrack.
Decoded hold frames differed from their planning previews by less than 8/255 mean
RGB levels; standalone entrance/exit frames reached the sequence background within
3/255 mean levels. These are encoding-tolerant engineering comparisons.

The browser was exercised in an isolated workspace at narrow and desktop widths:
create three candidates, select a candidate, review, apply, and seek the resulting
graphic on the timeline. Browser console checks returned no errors or warnings.
This was agent-operated acceptance, not an independent human usability evaluation.

`npm run demo:design -- "$PWD/.artifacts/design-system/example-v1"` produced a
twelve-second native MP4 containing a footage lower third, a title card and a
statistic card in the Balanced profile. All mandatory final-media checks passed.
The demo uses generated artwork and a generated tone, with fixture-supplied briefs;
it does not establish IDE inference quality, aesthetic superiority or model parity.
The local demo report, native manifest, test output and UI screenshot are retained
under ignored `.artifacts/design-system/example-v1/`. Media and private runtime
state are not source artifacts.

Current boundaries: component graphics are flattened PNG assets; wording changes
require replanning. Reading time is a word-rate heuristic. Lower-third layout does
not establish subject protection. Only supported static footage/crop mappings are
accepted. Automatic shot selection, story planning, reference-style extraction,
learned ranking and fine-tuning remain later milestones. See
[the design contract and usage](DESIGN_SYSTEM.md).
