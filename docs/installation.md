# Installation & Quick-Start Guide

**Package**: `editing-mechanics-engine` (EME)  
**Release**: `v0.1.0-rc1`  

---

## 1. Prerequisites

EME requires:
1. **Node.js**: `v20.0.0` or higher (`v22+` recommended for native HyperFrames rendering).
2. **FFmpeg & ffprobe**: Required for media encoding and metadata inspection (`ffmpeg` and `ffprobe` in `$PATH`).
3. **HyperFrames CLI**: `v0.8.162` (installed globally or resolved dynamically via `npx`).

Verify your environment anytime with:
```bash
eme doctor
```

---

## 2. Local Installation

### From Release Tarball
```bash
npm install -g artifacts/phase-6/release-candidate/editing-mechanics-engine-0.1.0-rc1.tgz
```

### From Local Workspace
```bash
npm link
```

---

## 3. Quick-Start Workflow

### Step 1: Initialize a Canonical Project
```bash
eme init my-video.json --width 1080 --height 1920 --fps 60 --duration-ticks 360000 --title "My First EME Reel"
```

### Step 2: Validate Schema & Invariants
```bash
eme validate my-video.json
```

### Step 3: Inspect Project Structure
```bash
eme inspect my-video.json
```

### Step 4: Render to Constant-Frame-Rate MP4
```bash
eme render my-video.json --out output.mp4
```

### Step 5: Inspect Extracted Frames
```bash
eme inspect-frame output.mp4 --time 1.5 --out frame-1.5s.png
```
