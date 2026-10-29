# Troubleshooting Guide

Common issues, diagnostic procedures, and resolutions for EME.

---

## 1. Running System Diagnostics
Always start by running:
```bash
eme doctor
```
This inspects Node.js, FFmpeg, ffprobe, and HyperFrames.

---

## 2. Common Issues & Resolutions

### Issue A: `hyperframes command not found`
- **Cause**: HyperFrames is not globally installed or Node.js version is older than `v22`.
- **Resolution**: EME includes an automatic `EnvironmentResolver` that detects NVM-installed Node 22 (`~/.nvm/versions/node/v22.*/bin/node`) and invokes `npx hyperframes@0.8.162` seamlessly. You can also specify an explicit path via `export EME_NODE_PATH=/path/to/node22`.

### Issue B: `ffmpeg: command not found`
- **Cause**: FFmpeg is not installed or not available in the system `$PATH`.
- **Resolution**:
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - Or export explicit binary path: `export FFMPEG_PATH=/custom/bin/ffmpeg`

### Issue C: `Security policy violation: Path ... resolves outside authorized roots`
- **Cause**: An operation, MCP call, or compilation command passed a path attempting directory traversal outside the current project root or temporary directory.
- **Resolution**: Keep project files, output directories, and media within the project workspace or authorized asset directories.

### Issue D: `Keyframe out of bounds` or `Clip Collision`
- **Cause**: An editing operation violated semantic timeline rules (e.g. keyframe offset beyond clip duration, or overlapping clips on the same visual track).
- **Resolution**: EME enforces atomic transactions with automatic rollback. Fix the time interval in the operation parameters; the project revision is preserved unchanged.
