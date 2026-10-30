# Timeline and editor reference study

Studied on 2026-10-30 to guide the EME web-editor redesign. The reference products
are Adobe Premiere Pro, DaVinci Resolve and CapCut Desktop.

## Evidence and limits

This is a reconstruction of documented interaction patterns and published UI,
not recovered proprietary implementation. No matching competitor application was
found in the machine's `/Applications` or user Applications folder. No competitor
binary, private API, native runtime, account or project was opened. Behaviours
below come from official documentation; visual observations come from official
screenshots inspected through REA. EME decisions are design proposals, not claims
that the products share an implementation.

REA navigated an owned temporary Chrome profile to each official image, waited
for the image, captured it and terminated the owned process. These captures show
published pixels, not a running desktop editor:

- Premiere's [Program Monitor illustration](https://helpx-prod.scene7.com/is/image/HelpxProd/An-overview-of-the-Program-Monitor-in-Premiere-Pro?%24pjpeg%24=&jpegSize=200&wid=1200), linked from [Adobe's monitor documentation](https://helpx.adobe.com/premiere/desktop/get-started/source-and-program-monitor-adjustments/about-source-monitor-and-program-monitor.html). REA evidence: `ev_b47ead74ada676375ceceb54b80c313072681f3e2638fa367ddaa96d0f198565`.
- Resolve's [Edit-page hero image](https://images.blackmagicdesign.com/images/products/davinciresolve/edit/hero/hero-still.jpg?_v=1592448885), linked from [Blackmagic's Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit). REA evidence: `ev_1fa87e054ffd3ba12ebf7797782e2f8cb9e529699ea1ed09e3afc739837f735d`. Its footer identifies Resolve 16, although the current product page identifies Resolve 21. Treat it as a historical layout reference, not exact current-version UI.
- CapCut's [basic editing screenshot](https://p16-seeyou-sg.ibyteimg.com/tos-alisg-i-2zwwjm3azk-sg/49913f4ef2094354944411590b42ef0b~tplv-2zwwjm3azk-compress%3Aq75.image), linked from [CapCut's usage guide](https://www.capcut.com/resource/how-to-use-capcut). REA evidence: `ev_d4603c30f5f14fdb2684ca35106a275c7c5025868481987a7d25fc006c1db7be`. Its application version is unspecified.

The suggested Blackmagic Editors Guide PDF was inaccessible through the web
reader; it is not evidence for this study. The accessible official Edit page
supplies the behaviour descriptions instead.

## Patterns worth carrying into EME

| Editing concern | Premiere Pro | DaVinci Resolve | CapCut | EME design decision |
| --- | --- | --- | --- | --- |
| Workspace | Separate source-clip and assembled-sequence monitors. [Adobe monitors](https://helpx.adobe.com/premiere/desktop/get-started/source-and-program-monitor-adjustments/about-source-monitor-and-program-monitor.html) | Media pool, source/timeline viewers, timeline and inspector appear in the published layout. [Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit) | Media, central player, right properties panel and lower timeline. [Usage guide](https://www.capcut.com/resource/how-to-use-capcut) | Media bin left, sequence monitor centre, selected-clip inspector right; timeline occupies the lower workspace. |
| Selecting and cutting | Select a clip; edge hover exposes trim interaction. [Trim a clip](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/trim-a-clip.html) | Cursor changes with trim location; ripple, roll and slip have different effects. [Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit) | Select a clip, position playhead, split; splitting does not delete footage. [Split workflow](https://www.capcut.com/features/how-to-split-a-video-capcut-workflow) | Explicit selection outline, separate edge handles, split-at-playhead command, ordinary non-ripple trims. |
| Timeline navigation | Ruler, draggable playhead, timecode position and zoom scrolling. [Navigation controls](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/navigation-controls-in-the-timeline.html) | Published timeline has a ruler, playhead, distinct track lanes and thumbnails/waveforms. [Reference image](https://images.blackmagicdesign.com/images/products/davinciresolve/edit/hero/hero-still.jpg?_v=1592448885) | Guide recommends enlarging timeline and inspecting adjacent frames before cutting. [Split workflow](https://www.capcut.com/features/how-to-split-a-video-capcut-workflow) | Shared pixels-per-second scale for ruler, clips and playhead; fit/zoom controls; frame stepping. |
| Snap and track controls | Snapping shows an alignment guide. Track output and locks are separate controls. [Snapping](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/snap-clips.html), [Track targeting](https://helpx.adobe.com/premiere/desktop/edit-projects/intro-to-editing/work-with-clips-on-the-timeline-using-track-targeting.html) | Official Edit page describes track targeting, locking and sync controls in headers. [Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit) | Exact snap/lock semantics were not established from the selected official guides. | Toggle snapping explicitly; indicate the target; keep mute/output separate from edit lock. |
| Audio and properties | Linked video/audio instances move and trim together; unlinking permits separate edits. [Linked clips](https://helpx.adobe.com/premiere/desktop/add-audio-effects/basic-audio-editing/link-audio-and-video-clips.html) | Inspector provides clip parameters; source in/out marks choose usable footage. [Edit page](https://www.blackmagicdesign.com/products/davinciresolve/edit) | Selected timeline clip exposes editing tools above tracks and properties on the right. [Usage guide](https://www.capcut.com/resource/how-to-use-capcut) | Default linked source audio; show source in/out and timeline position separately; inspector edits the selected clip. |

Visual observations: the Resolve reference uses small panel chrome, blue video
clips and green audio lanes; the CapCut reference uses a bright selected-clip
outline, thumbnails, a waveform strip, an overhead tool row and compact numeric
properties. Adobe's monitor illustration separates image area, timecode, ruler
and transport. These are hierarchy cues; EME does not copy logos, imagery or
product assets into its interface.

## Concrete EME first-version contract

These choices adapt the references to EME's existing canonical engine and review
model. They are implementation requirements to verify, not a claim of completed
feature parity.

1. **Workspace.** Use a restrained dark palette, thin panel boundaries and compact
   labels. Give editing content the space currently spent on welcome copy and
   chat. Keep the agent in a secondary panel/tab so manual editing stays visible.
2. **One time coordinate system.** Store canonical time in 120,000 ticks/second.
   Derive screen positions from one zoom scale and scroll offset. Zoom changes
   density, not clip timing. Scrubbing changes playback position without edits.
   Use project FPS for visual frame boundaries and frame-step controls.
3. **Selection before mutation.** Clicking a clip highlights it and populates
   timing, text/transform or audio fields in the inspector. Moving the playhead
   does not change selection. Background clicks can clear selection.
4. **Move versus trim.** Dragging the body changes timeline position while
   preserving source in/out. Dragging an edge changes source in/out and duration.
   A start trim also changes the clip's timeline start. Enforce available source
   media, positive duration, project bounds, track locks and track collisions.
   Display pending timing while dragging; cancel restores the committed geometry.
5. **Split and delete.** A split creates two adjacent clips without changing total
   content length; reject a cut on an endpoint. Ordinary delete leaves a gap.
   Do not silently imply ripple behaviour. Preserve selected imported video/audio
   timing together while linked editing is on.
6. **Snap.** Snap a candidate edge to nearby clip edges and playhead within a
   screen-distance threshold. Display the chosen alignment guide. Frame
   quantization remains active when magnetic snapping is off.
7. **Inspector.** Separate timeline start/end from source in/out. Provide numeric
   alternatives for gestures and only expose parameters supported by export.
   Present selected clip name/type and linked-edit state. Reject invalid values
   without losing the committed edit.
8. **Review and history.** Gesture release or an inspector Apply command creates
   an exact proposal; it does not mutate a browser-owned project copy. Keep
   revision checks, browser approval, engine-owned undo/redo and export checks.
   A guarded scene title requires replanning when its protected composition changes.
9. **Keyboard.** Implement a small, labelled EME set outside input fields: Space
   for playback, arrows for frame stepping, Delete for selected clips, zoom keys,
   and undo/redo. Advertise the actual split binding. Premiere documents Cmd/Ctrl+K
   for Add Edit; CapCut documents Ctrl+B for Split, so one shortcut is not universal.
   [Adobe shortcuts](https://helpx.adobe.com/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html), [CapCut split](https://www.capcut.com/features/how-to-split-a-video-capcut-workflow).
10. **Truthful preview.** Label the editable preview and last verified render
    distinctly. Do not present decorative waveform bars as measured audio or a
    poster image as a live composition. Recheck edits against the native export.

## Verification checklist and remaining scope

Verify selection, seek, fit/zoom, move, both trim edges, split, delete, linked
audio, mute/lock, numeric inspector edits, stale revisions, rejected proposals,
undo/redo, persistence and a real export. Gesture testing must exercise pointer
movement and inspect committed results; pressing a button is not proof of drag
behaviour. Check at desktop and narrower window sizes, and preserve keyboard focus.

Full ripple/roll/slip tools, source-monitor three-point editing, arbitrary track
reordering, multi-selection, nested sequences, multicam, a live audio mixer,
arbitrary effects and frame-identical real-time compositing are separate features.
Document any of these that remain unavailable rather than adding inactive toolbar
icons or claiming product parity. The public references establish expected user
behaviour; they do not reveal competitors' internal storage, rendering or undo code.
