# Editing Mechanics Engine — Renderer Adapter Interface

**Version**: `1.0.0`  
**Phase**: Phase 2 Deliverable  

---

## 1. Interface Definition

To ensure complete renderer independence, the Editing Mechanics Engine interacts with all rendering backends exclusively through the abstract `RendererAdapter` contract.

```typescript
export interface RendererCapabilities {
  name: string;
  version: string;
  supportedClipTypes: ('video' | 'text' | 'graphic' | 'audio')[];
  supportedBlendModes: string[];
  supportsAlphaVideo: boolean;
  supportsCustomFonts: boolean;
  maxResolution: { width: number; height: number };
}

export interface RenderOptions {
  outputPath: string;
  startFrame?: number;
  endFrame?: number;
  codec?: 'h264' | 'hevc' | 'prores';
  hardwareAcceleration?: boolean;
}

export interface RendererAdapter {
  getCapabilities(): Promise<RendererCapabilities>;
  compile(project: EmeProject): Promise<CompiledIntermediateRepresentation>;
  render(project: EmeProject, options: RenderOptions): Promise<{ outputPath: string; durationMs: number }>;
  renderFrame(project: EmeProject, frameIndex: number, outputPath: string): Promise<{ framePath: string }>;
}
```

---

## 2. Primary Adapter: HyperFrames Adapter (`renderers/hyperframes`)

### 2.1 Compilation Mapping Rules
1. **DOM Scaffolding**:
   - `canvas.width` and `canvas.height` compile to root `<div id="root" data-composition-id="eme_comp" data-width="1080" data-height="1920">`.
   - `timebase.durationTicks` compiles to root `data-duration="${durationSeconds}s"`.
2. **Typography Clips**:
   - Every text clip compiles to a `<div class="clip" data-start="${startSeconds}s" data-duration="${durationSeconds}s" data-track-index="${track.zIndex}">`.
   - Fonts are declared in `<style>` with `@font-face` pointing to local TTF files in `assets/fonts/`.
3. **Alpha Transitions & Video Footage**:
   - Video clips compile to `<video class="clip" src="${asset.src}" data-start="..." data-duration="...">`.
4. **GSAP Timeline Compilation**:
   - Compiles EME property animations into `window.__timelines["eme_comp"] = gsap.timeline({ paused: true })`.
   - Keyframe offsets are mapped to exact seconds ($t = tick / ticksPerSecond$).
5. **Execution**:
   - Invokes `npx hyperframes render` via child process or headless CDP controller.

---

## 3. Secondary / Fallback Adapter: FFmpeg Adapter (`renderers/ffmpeg`)

### 3.1 Compilation Mapping Rules
1. **Filtergraph Generation**:
   - Video and graphics clips are mapped to `color=c=black:s=${width}x${height}` base canvas.
   - Overlays are chained: `[base][v0]overlay=x=${x}:y=${y}:enable='between(t,${start},${end})'[v0_out]`.
   - Blend modes are mapped: `[v0][v1]blend=all_mode=difference[v_diff]`.
2. **Audio Mixing**:
   - Audio clips are trimmed with `atrim=start=${trimIn}:end=${trimOut},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}`.
   - Mixed with `amix=inputs=${count}:duration=first:dropout_transition=0`.
3. **Execution**:
   - Invokes local FFmpeg binary (`/opt/homebrew/bin/ffmpeg`) with Apple Silicon VideoToolbox (`-c:v h264_videotoolbox`).

---

## 4. Capability Declaration & Non-Degradation Rule
If a project uses an effect (e.g. `blendMode: "difference"`) that an adapter does not support, the compiler must immediately reject compilation with `ERR_UNSUPPORTED_EFFECT`. **It is strictly prohibited to silently omit visual effects or substitute fonts.**
