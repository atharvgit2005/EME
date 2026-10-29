# Manual Editing Workflow Guide

This guide details how a human operator uses the EME Visual Control Surface to inspect, correct, and render video editing projects produced by AI agents or human teammates.

## 1. Starting the Control Surface
Run the visual editor server from the repository root:
```bash
node src/ui/server.js
```
The server will start at `http://localhost:4321`. Open this address in your browser.

## 2. Loading a Project
1. Enter the project path in the top navbar (e.g., `artifacts/phase-7/scenario-1-16x9.json`).
2. Click **Load**.
3. The interface will populate the canvas dimensions, project title, assets, tracks, timeline clips, and initial preview stage.

## 3. Timeline Navigation & Scrubbing
- **Playhead**: Drag the playhead across the timeline ruler or click anywhere on the track area to seek to an exact timestamp.
- **Playback**: Press **▶ Play** to preview playback in real time at the native project frame rate.
- **Zoom**: Adjust the **Zoom** slider to expand or compress timeline resolution.

## 4. Making In-Place Corrections
### 4.1 Typography Corrections
1. Click any text clip on the canvas or timeline.
2. In the right **Properties Inspector**, edit the text content, font size (in pixels), or color (via color picker).
3. The system dispatches an atomic `modify_clip` operation to the engine. The canvas preview updates instantly, the revision counter increments monotonically, and the prior state is pushed to the Undo stack.

### 4.2 Timing & Duration Corrections
1. Select the target clip.
2. Adjust **Start Tick** or **Duration Ticks** in the inspector.
3. The system validates that the new position does not collide with neighboring clips on the same track before committing.

## 5. Undo and Redo
- Click **↶ Undo** (or trigger `/api/project/undo`) to step back to the prior project state.
- Click **↷ Redo** to restore undone edits.
- The revision number advances monotonically on every operation.

## 6. QA Audit & Final Rendering
1. Click **Audit QA** to execute `QualityAssuranceEngine`. A badge displays the score (0-100) and lists any text clipping, track collision, or audio sync warnings.
2. Click **Render MP4** to compile the composition into a 60fps constant-frame-rate MP4.
3. The rendered video path and metadata are reported directly in the UI.
