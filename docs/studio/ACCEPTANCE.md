# Studio acceptance — 2026-10-29

The initial source import remains eight commits, ending at 49d1b14. This report
covers the subsequent local Studio implementation.

## Verification

- The bounded engine suite passed 165 tests, including approval/execution, locking,
  artifact integrity, native delivery, and the production stdio entry point.
- The Studio suite passed seven integration tests, including real FFmpeg media,
  origin/review capability separation, proposal replacement protection, exact and
  stale approvals, undo/redo, MCP proposals, project duration, range downloads,
  persisted state, and generated-demo export. No skipped tests.
- A production stdio run used the Codex agent to interpret three browser requests
  against live project context. It submitted plans through
  `scripts/studio-agent-call.cjs`, rather than a fixed prompt parser.
- The first request added THE NEXT CHAPTER for four seconds. The second changed
  the title to MADE TO MOVE, made it orange, and raised it. The third changed only
  the color to warm white after visual inspection showed low contrast.
- Each plan was separately reviewed and applied through the browser in this
  automated acceptance session. This was not an independent human usability test.
- All three exports passed video profile, duration, audio stream, loudness/peak,
  clipping, full decode, stable checksum, and audio/video synchronization checks.
  Video was H264, 960×540, 30 fps, 12 seconds; audio was stereo AAC at 48 kHz.
- Exact comparison of the canonical project proved that original footage clips,
  audio clips, and asset records remained unchanged across the title revisions.
  Earlier exported artifacts remained available. Only requested title properties
  changed. Visual inspection covered the editor and a rendered video frame; these
  checks do not establish subjective audio quality.

| Revision | Verified export SHA-256 |
| --- | --- |
| 9 | `99a5cbdde7f3a28a6f4aeb95427af3d50f54d28f629b9725ff5f0b08e590996e` |
| 10 | `ef25eafa45c805f8000af8e7ec95a7f1024341679027c8c43be3fe9b81a854b0` |
| 11 | `7a3855707433e61f9fcc413613f05d3982423b2c17309ac605f338327d849108` |

The demo media, credentials, project state, manifests, and exported MP4s remain
local under ignored `.eme/studio/`; they are not committed as source code.

## Product limits

This is a local hackathon MVP. The IDE must process the inbox; registering MCP
alone does not start inference. The canvas is fixed at 960×540 and output at two
minutes. Final mix requires an audible audio clip. Timeline preview approximates
composition; native export is authoritative. No general transitions, transcription,
collaboration, or embedded hosted model is implemented. Wispr uses desktop
input; Dodo is an optional hosted checkout link with no tested billing lifecycle.
See [setup and scope](README.md) for operation and trust boundaries.
