# EME CLI Reference Manual

**Binary**: `eme`  
**Version**: `0.1.0-rc1`  

---

## Commands

### `eme --version`, `eme version`
Prints the current EME engine version.

### `eme --help`, `eme help`
Displays the full command list, options, and usage examples.

### `eme doctor`
Runs a comprehensive system and prerequisite diagnostic:
- Node.js version and executable path.
- FFmpeg availability, version, and encoder configuration.
- ffprobe availability and stream probing capability.
- HyperFrames CLI availability and version detection (`0.8.162`).

### `eme capabilities`
Lists active renderer capabilities:
- Formats: `mp4`, `webm`
- Media Types: `text`, `graphic`, `video`, `audio`
- Blend Modes: `difference`, `multiply`, `screen`, `overlay`, `normal`
- Filters: `invert`, `contrast`, `brightness`, `blur`
- Easings: `linear`, `power2.out`, `power3.out`, `easeIn`, `easeOut`, `easeInOut`, `spring`

### `eme init <project.json>`
Initializes a clean canonical EME project file.
- `--width <pixels>`: Canvas width (default: 1080)
- `--height <pixels>`: Canvas height (default: 1920)
- `--fps <number>`: Framerate (default: 60)
- `--duration-ticks <ticks>`: Duration in integer ticks (default: 360,000 = 3.0s)
- `--title <string>`: Human-readable project title

### `eme validate <project.json>`
Validates JSON Schema draft-07 structure and semantic invariants (temporal overlaps, asset references, track bounds).

### `eme inspect <project.json>`
Displays project summary, revision, resolution, track count, clip count, and asset count.

### `eme compile <project.json>`
Compiles canonical project state into a self-contained HyperFrames HTML/CSS/GSAP bundle.
- `--out <dir>`: Target output directory (default: `dist/composition`)

### `eme render <project.json>`
Compiles and renders project to constant-frame-rate MP4 video.
- `--out <file.mp4>`: Output MP4 path (default: `dist/rendered.mp4`)

### `eme inspect-frame <video.mp4>`
Extracts a lossless still PNG frame at an exact timestamp or tick.
- `--time <seconds>`: Timestamp in seconds (e.g. `1.5`)
- `--tick <ticks>`: Timestamp in integer ticks (e.g. `180000`)
- `--out <frame.png>`: Output PNG path
