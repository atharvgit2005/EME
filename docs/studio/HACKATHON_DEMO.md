# Hackathon demo: leave room for the speaker

EME turns a tracked region into an editing constraint: import a short shot, select
the speaker, ask for a title, review its rendered placement, then export a checked
MP4. Creative interpretation comes from the connected local IDE agent. The engine
measures and verifies its proposed editing action; it does not run a background LLM.

## Run

```sh
npm start
```

For a separate demo workspace that preserves your current edit:

```sh
EME_STUDIO_ROOT="$PWD/.eme/hackathon-demo" npm start -- --port 4800
```

Open http://127.0.0.1:4800. Configure tracking for this workspace using
[the scene setup instructions](SCENE.md), or copy your existing local
`.eme/studio/scene/config.json` into `.eme/hackathon-demo/scene/config.json`.
The configuration and footage stay local and are ignored by Git.

## Two-minute presentation

1. Import a short shot with an unobstructed speaker and some empty space. Approve
   its timeline import. Use a source with audio for the current verified export.
2. Choose **Understand scene**, draw the initial subject box and track four seconds.
   Scrub to show the shared timestamped observations. A dashed prediction is not
   accepted as observed evidence.
3. Under **Leave room for your subject**, use `NEXT` and `MOVE` on separate lines,
   28 px text, and a four-second interval. Choose **Find placement & review**.
   The preview uses the actual font and backing; open it for a full-size still.
4. Review and approve. The measured glyph appears on the timeline. **Export video**
   produces the native MP4 after source, scene, font, geometry, video and audio checks.
5. Show the refusal case: reopen the scene and try a much wider title. If the
   measured title cannot fit across every tracked frame, EME asks you to shorten
   it, make it smaller, or choose another shot. The existing edit stays intact.

The quick action is deterministic. To demonstrate the **local IDE/MCP workflow**,
dismiss its pending proposal and instead send:

> Add a small two-line title NEXT MOVE for the first four seconds, keeping it clear
> of the tracked speaker. Use the existing scene analysis.

Connect the IDE using Studio's **Connect IDE** configuration. Ask the IDE to read
`eme_studio_get_inbox`, read the selected `eme_studio_get_scene` interval and call
`eme_studio_propose_title`. Its arguments are `requestId`, `baseRevision`,
`analysisId`, `videoClipId`, `text`, `startTick`, `durationTicks` and optional
`fontSize`. There are 120,000 ticks per second. The tool only creates a proposal;
approval remains in the browser. No model API key is needed.

For an IDE that runs commands rather than registering MCP, use the production
stdio client:

```sh
EME_STUDIO_ROOT="$PWD/.eme/hackathon-demo" \
  node scripts/studio-agent-call.cjs eme_studio_get_inbox
# Save the tool arguments to a local JSON file, then:
EME_STUDIO_ROOT="$PWD/.eme/hackathon-demo" \
  node scripts/studio-agent-call.cjs eme_studio_propose_title /absolute/path/args.json
```

## What the check means

- The title and opaque `#151515` backing avoid the **selected region's observed
  bounding boxes**, with a 12 px margin in canvas space and a 5% canvas inset.
  These are conservative region constraints, not proof of semantic person detection.
- Every overlapping source frame interval must be observed. Trims and valid static
  crops map those source coordinates into the project canvas. Missing intervals,
  cuts with lost tracking, unsupported transforms, animation, effects and overlapping
  visual overlays block the guarded placement.
- The complete title interval is checked, even though review shows one still at
  its first source frame. The export manifest records the analysis ID, interval
  count, source range, bounds, margin and collision result.
- Font bytes, scene JSON, glyph and review image are bound to the exact approval.
  Native export re-rasterizes and rechecks the geometry. An unrelated audio edit
  retains these bindings. Changes to footage, crop, canvas or the guarded title
  require a new placement; reopening the scene replaces the earlier guarded title
  through a new review proposal.
- Tracking is a selected-region prototype. Soft matting, depth, general 3D physics,
  multiple interacting subjects and arbitrary compositions are outside this demo.

The M3 acceptance used the existing four-second local speaker excerpt, converted
to 30 fps with an explicitly labelled **generated tone** for audio QA. It does not
claim to preserve the speaker's voice. That media and the browser evidence are
local artifacts, not bundled or licensed demonstration assets.

TigerGraph, Socket and AIGI are not integrated in this slice. Wispr Flow can dictate
into the ordinary request field; there is no embedded Flow SDK integration.

## Verification

```sh
npm test
```

`test:placement` exercises trim/crop mapping, half-open intervals, missing evidence,
infeasible placement, request freshness, browser/agent authority separation,
changed preview bytes, native collision rejection and a real FFmpeg/audio-QA export
after an unrelated edit. Its scene documents are test contracts; actual M3 inference
is a separate local acceptance run. See [SCENE.md](SCENE.md) for tracking validation.
