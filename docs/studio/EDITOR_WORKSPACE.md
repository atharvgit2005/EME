# Edit workspace

The web interface uses a media pool, a sequence viewer, a selected-clip inspector,
and a full-width timeline. The [reference study](EDITOR_REFERENCE_STUDY.md) records
the official Premiere, Resolve and CapCut interface sources and the limits of the
comparison. No competitor binaries or internal code were examined.

Run `npm start` and open http://127.0.0.1:4720. Existing Studio projects and review
history are preserved. Import local media or load the generated sample.

## Working on the timeline

- Select a clip to inspect it. Drag its body to move it, or either edge to trim.
  These are ordinary trims: other clips stay in place. Source limits, track locks,
  collisions and project boundaries are checked before a proposal is created.
- Source audio stays linked by default. The chain button allows explicitly separate
  edits. Matching imported AV components with a proven source-tail difference of up
  to one sequence frame remain linked. Larger differences are not silently paired.
- Use the ruler to seek, or enter `HH:MM:SS:FF` in the timeline's timecode field and
  press Enter. Display uses non-drop-frame numbering at the sequence frame rate.
- Use Split at playhead, the blade tool, or Cmd/Ctrl+B (also Cmd/Ctrl+K). Deleting
  leaves the other clips in place. Split and delete include linked source audio.
- Snapping aligns edges with the playhead and other clip boundaries and shows an
  alignment guide. Toggle it with S. Zoom and Fit change only the viewport.
- Track headers separate edit locks from output mute. Drag the timeline's top
  divider, or focus it and use Up/Down, to resize the working area.
- Click **Sequence 01** to extend the sequence. Trim clips beyond a proposed end
  before shortening it. Studio retains its two-minute export limit.

Gestures and inspector edits open **Review**. Apply the precise proposal to commit;
dismiss to keep the current project. Undo/redo also uses reviewed engine history.
Changes are bound to the current revision, source bytes and exact operations.

## Inspector and preview

The inspector separates timeline start/end from source in/out. Numeric alternatives
are available for moving, trimming, duration, text styling, position, scale,
rotation, opacity and audio volume. Guarded scene titles require replanning via
**Understand scene**; edits that would invalidate their evidence are blocked.

Click a media thumbnail to preview its original source. **Timeline** previews the
assembled edit; **Export** shows the latest checked MP4 and labels older revisions.
The sequence clock advances across gaps, synchronizes video and audio components,
and stops at the sequence end. Frame stepping and exact timecode seeking are
available without changing the project.

Audio waveforms are measured from the imported source: mono PCM at 1 kHz, with
50 ms peak bins and a 120-second cap. They are display data, not loudness or true-peak
meters. Source checks run before and after extraction. Video thumbnails repeat the
source poster; they are not per-frame filmstrip samples.

The editable preview is approximate. It displays the upper active video layer,
static crop/transform and simple text/effects. Arbitrary layered compositing,
animation and final audio processing belong to the native export. Browser audio
volume is capped at 100%; export applies gains above that and performs final audio
QA. Source and export modes play their own files directly. Do not infer native
render parity from the browser preview.

## Validation

`npm test` includes source-bound direct-edit tests, real waveform extraction,
browser authority checks, linked trim/split and undo integration, and the existing
native render/delivery suites.

For actual pointer verification, with an existing Playwright or playwright-core
installation and Chrome:

```sh
EME_PLAYWRIGHT_ROOT=/path/to/package-root node scripts/verify-editor-browser.cjs
```

The script creates an isolated Studio workspace and actual FFmpeg fixture, drags
the clip body and both edges using browser mouse inputs, verifies no commit before
review, approves in the browser and checks linked source/timeline geometry. It
cleans up its browser and server. See the script for runtime overrides; no browser
dependency is added to normal Studio startup or the default CI suite.

Full ripple/roll/slip editing, multi-selection, arbitrary track reordering,
multicam and nested sequences remain outside this version.
