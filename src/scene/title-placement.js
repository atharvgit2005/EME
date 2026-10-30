// One geometry contract for planning, review and native export. No model calls or edits here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { digest } = require("../creative/execution-record.js");
const { assertScene, queryScene } = require("./contract.js");
const { fileHash } = require("./service.js");
const {
  VisualConstraintSolver,
} = require("../solver/visual-constraint-solver.js");
const {
  resolveFont,
  rasterizeGraphic,
  transformedBounds,
} = require("../renderers/graphic-rasterizer.js");

function reject(reason) {
  throw Error("ERR_SUBJECT_TITLE: " + reason);
}
function staticTransform(project, clip, title = false) {
  const t = clip.transform || {};
  for (const [key, fallback] of Object.entries({
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    ...(title ? {} : { x: 0, y: 0 }),
  }))
    if ((t[key] ?? fallback) !== fallback)
      reject(
        "Only static, unrotated footage and titles at full opacity are supported.",
      );
  if ((project.animations || []).some((a) => a.clipId === clip.id))
    reject(
      "Animated subject/title transforms need a new placement implementation.",
    );
  if (
    clip.properties?.optical_distortion?.enabled !== false &&
    clip.properties?.optical_distortion
  )
    reject("Distorted footage needs new scene evidence.");
  if (
    clip.effects?.length ||
    clip.properties?.curved_typography ||
    (title && clip.properties?.reframing)
  )
    reject(
      "Effects and curved/cropped titles are outside this placement prototype.",
    );
}
function visualBinding(project) {
  const clips = project.clips.filter(
    (c) => !["audio", "text"].includes(c.type),
  );
  const ids = new Set(clips.map((c) => c.trackId));
  return digest({
    canvas: project.canvas,
    timebase: project.timebase,
    clips,
    tracks: project.tracks.filter((t) => ids.has(t.id)),
    animations: (project.animations || []).filter((a) =>
      clips.some((c) => c.id === a.clipId),
    ),
  });
}
function titleBinding(clip) {
  return digest({
    typography: clip.typography,
    transform: clip.transform,
    startTick: clip.startTick,
    durationTicks: clip.durationTicks,
    backing: clip.properties.text_backing,
    fontSha256: clip.properties.render_font?.sha256,
  });
}
function mappedEvidence(project, doc, videoClipId, startTick, durationTicks) {
  assertScene(doc);
  const video = project.clips.find(
    (c) => c.id === videoClipId && c.type === "video",
  );
  if (!video) reject("Add the analyzed footage to the timeline first.");
  const track = project.tracks.find((t) => t.id === video.trackId);
  const endTick = startTick + durationTicks;
  if (
    ![startTick, durationTicks, endTick].every(Number.isSafeInteger) ||
    durationTicks <= 0 ||
    startTick < video.startTick ||
    endTick > video.startTick + video.durationTicks ||
    endTick > project.timebase.durationTicks ||
    track?.muted
  )
    reject("The title must fit completely inside the selected video clip.");
  const asset = project.assets.find(
    (a) => a.id === (video.source?.assetId || video.assetId),
  );
  if (
    !asset ||
    asset.id !== doc.source.assetId ||
    asset.sha256 !== doc.source.sha256
  )
    reject(
      "The analysis belongs to different footage. Analyze this source again.",
    );
  staticTransform(project, video);
  if (
    project.clips.some(
      (c) =>
        c.id !== video.id &&
        !["audio", "text"].includes(c.type) &&
        !project.tracks.find((t) => t.id === c.trackId)?.muted &&
        c.startTick < endTick &&
        c.startTick + c.durationTicks > startTick,
    )
  )
    reject("Overlapping footage requires a composition-aware analysis.");
  const trim = video.source?.trimInTick || 0;
  if (
    video.source?.trimOutTick !== undefined &&
    video.source.trimOutTick - trim !== video.durationTicks
  )
    reject("Speed changes are unsupported.");
  const sourceStart = startTick - video.startTick + trim,
    sourceEnd = sourceStart + durationTicks;
  if (sourceStart < doc.source.startTick || sourceEnd > doc.source.endTick)
    reject(
      "The title extends outside the analyzed interval. Track a longer interval or shorten the title.",
    );
  const query = queryScene(doc, {
    startTick: sourceStart,
    endTick: sourceEnd,
    requireVisible: true,
  });
  if (!query.completeVisibleCoverage)
    reject(
      `Tracking is missing in ${query.missing.length} frame intervals. Shorten the title or track the subject again; predictions cannot establish safe placement.`,
    );
  const crop = video.properties?.reframing?.crop_rect || {
    x: 0,
    y: 0,
    width: doc.source.width,
    height: doc.source.height,
  };
  if (
    !["x", "y", "width", "height"].every(
      (k) =>
        Number.isInteger(crop[k]) &&
        crop[k] >= (["width", "height"].includes(k) ? 1 : 0),
    ) ||
    crop.x + crop.width > doc.source.width ||
    crop.y + crop.height > doc.source.height ||
    Math.abs(
      crop.width / crop.height - project.canvas.width / project.canvas.height,
    ) > Math.max(1 / project.canvas.width, 1 / project.canvas.height)
  )
    reject("A valid explicit crop matching the canvas is required.");
  const frames = query.frames.map((f) => {
    const b = f.observed.bounds;
    const x = Math.max(b.x, crop.x),
      y = Math.max(b.y, crop.y);
    const right = Math.min(b.x + b.width, crop.x + crop.width),
      bottom = Math.min(b.y + b.height, crop.y + crop.height);
    if (right <= x || bottom <= y)
      reject(
        "The selected region is outside the crop. Select an on-screen subject.",
      );
    return {
      tick: Math.max(startTick, f.tick - trim + video.startTick),
      endTick: Math.min(endTick, f.endTick - trim + video.startTick),
      frameIndex: f.frameIndex,
      observations: [
        {
          type: "protected_region",
          bounds: {
            x: ((x - crop.x) * project.canvas.width) / crop.width,
            y: ((y - crop.y) * project.canvas.height) / crop.height,
            width: ((right - x) * project.canvas.width) / crop.width,
            height: ((bottom - y) * project.canvas.height) / crop.height,
          },
        },
      ],
    };
  });
  return { frames, crop, sourceStart, sourceEnd, video, asset };
}
function checkRectangle(rect, frames, canvas, margin, safeRatio) {
  if (
    ![rect.x, rect.y, rect.width, rect.height, margin, safeRatio].every(
      Number.isFinite,
    ) ||
    margin < 0 ||
    safeRatio < 0.05 ||
    safeRatio > 0.25
  )
    reject("Invalid placement policy.");
  const sx = canvas.width * safeRatio,
    sy = canvas.height * safeRatio;
  if (
    rect.x < sx ||
    rect.y < sy ||
    rect.x + rect.width > canvas.width - sx ||
    rect.y + rect.height > canvas.height - sy
  )
    reject("The title exceeds its approved safe-area inset.");
  for (const f of frames)
    for (const { bounds: b } of f.observations)
      if (
        rect.x < b.x + b.width + margin &&
        rect.x + rect.width > b.x - margin &&
        rect.y < b.y + b.height + margin &&
        rect.y + rect.height > b.y - margin
      )
        reject("The title overlaps a tracked region or its safety margin.");
}
function verifySubjectTitle({ project, clip, doc, bounds }) {
  const safe = clip.properties?.subject_safe;
  if (
    !safe?.required ||
    safe.version !== 1 ||
    safe.analysisId !== doc.analysisId
  )
    reject("Invalid scene binding.");
  if (digest(safe.localBounds) !== digest(bounds))
    reject("Rendered glyph/backing bounds differ from the approved bounds.");
  if (safe.visualBinding !== visualBinding(project))
    reject("The footage, crop, timing or canvas changed. Replan the title.");
  if (
    clip.typography?.color !== "#ffffff" ||
    digest(clip.properties.text_backing) !==
      digest({ color: "#151515", padding: 12 })
  )
    reject("The approved white-on-opaque backing is required.");
  staticTransform(project, clip, true);
  const evidence = mappedEvidence(
    project,
    doc,
    safe.videoClipId,
    clip.startTick,
    clip.durationTicks,
  );
  if (
    project.clips.some(
      (c) =>
        c.id !== clip.id &&
        c.id !== evidence.video.id &&
        c.type !== "audio" &&
        !project.tracks.find((t) => t.id === c.trackId)?.muted &&
        c.startTick < clip.startTick + clip.durationTicks &&
        c.startTick + c.durationTicks > clip.startTick,
    )
  )
    reject(
      "Remove overlapping visual overlays before using this placement prototype.",
    );
  const titleTrack = project.tracks.find((t) => t.id === clip.trackId),
    videoTrack = project.tracks.find((t) => t.id === evidence.video.trackId);
  if (!titleTrack || titleTrack.muted || titleTrack.zIndex <= videoTrack.zIndex)
    reject("The title must be above the footage.");
  const rect = transformedBounds(bounds, project.canvas, clip.transform);
  if (
    !Number.isInteger(clip.transform.x) ||
    !Number.isInteger(clip.transform.y) ||
    clip.transform.x % 2 !== 0 ||
    clip.transform.y % 2 !== 0
  )
    reject("Title offsets must align to the native two-pixel chroma grid.");
  checkRectangle(
    rect,
    evidence.frames,
    project.canvas,
    safe.marginPx,
    safe.titleSafeRatio,
  );
  if (safe.titleBinding !== titleBinding(clip))
    reject(
      "The title changed after its placement preview. Replan to update the preview.",
    );
  return {
    analysis_id: doc.analysisId,
    clip_id: clip.id,
    tracked_intervals: evidence.frames.length,
    source_start_tick: evidence.sourceStart,
    source_end_tick: evidence.sourceEnd,
    margin_px: safe.marginPx,
    title_safe_ratio: safe.titleSafeRatio,
    bounds: rect,
    collisions: 0,
  };
}
function ffmpeg(args) {
  const r = spawnSync(
    "ffmpeg",
    ["-nostdin", "-v", "error", "-filter_complex_threads", "1", ...args],
    { encoding: "utf8", timeout: 60000 },
  );
  if (r.status !== 0)
    reject("Review preview failed: " + (r.stderr || r.error?.message));
}
function proposeSubjectTitle({
  project,
  doc,
  scenePath,
  outputDir,
  text,
  videoClipId,
  startTick,
  durationTicks,
  fontSize = 28,
}) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 150 ||
    text.split("\n").length > 4
  )
    reject("Enter 1–150 characters, at most four lines.");
  if (!Number.isInteger(fontSize) || fontSize < 12 || fontSize > 120)
    reject("Font size must be 12–120 pixels.");
  const previous = project.clips.filter(
    (c) =>
      c.type === "text" &&
      c.properties?.subject_safe?.videoClipId === videoClipId,
  );
  if (previous.length > 1)
    reject("Select a composition with only one guarded title per video clip.");
  const evidence = mappedEvidence(
    project,
    doc,
    videoClipId,
    startTick,
    durationTicks,
  );
  if (digest(JSON.parse(fs.readFileSync(scenePath))) !== digest(doc))
    reject("Stored scene evidence changed.");
  fs.mkdirSync(outputDir, { recursive: true });
  const videoTrack = project.tracks.find(
    (t) => t.id === evidence.video.trackId,
  );
  const reuseTrack =
    previous.length &&
    project.tracks.find(
      (t) =>
        t.id === previous[0].trackId &&
        t.kind === "visual" &&
        !t.muted &&
        t.zIndex > videoTrack.zIndex,
    );
  const trackId = reuseTrack
    ? reuseTrack.id
    : "subject-title-" + crypto.randomUUID().slice(0, 8);
  const zIndex = reuseTrack
    ? reuseTrack.zIndex
    : Math.max(0, ...project.tracks.map((t) => t.zIndex)) + 1;
  const addTrack = reuseTrack
    ? []
    : [
        {
          type: "add_track",
          params: {
            id: trackId,
            name: "Subject-aware title",
            kind: "visual",
            zIndex,
          },
        },
      ];
  const clip = {
    id: "title-" + crypto.randomUUID().slice(0, 8),
    trackId,
    type: "text",
    startTick,
    durationTicks,
    typography: {
      text: text.trim(),
      fontSize,
      color: "#ffffff",
      textAlign: "center",
    },
    properties: { text_backing: { color: "#151515", padding: 12 } },
  };
  const font = resolveFont(clip);
  clip.properties.render_font = font;
  const graphic = rasterizeGraphic({
    clip,
    canvas: project.canvas,
    fps: project.timebase.fps,
    outputDir,
    font,
  });
  const marginPx = 12,
    titleSafeRatio = 0.05;
  const result = VisualConstraintSolver.solveSpatialPlacement(
    {
      // Reserve two pixels so offset quantization cannot consume the safety margin.
      element: {
        width: graphic.bounds.width + 2,
        height: graphic.bounds.height + 2,
        preferredAnchor: "center_left",
      },
      sidecar: { source: project.canvas, frames: evidence.frames },
      timeRange: { startTick, endTick: startTick + durationTicks },
      backgroundSamples: [{ r: 21, g: 21, b: 21 }],
    },
    {
      protectSelectedRegion: true,
      allowTitleSafeRelaxation: false,
      titleSafeRatio,
      faceMarginPx: marginPx,
      stepSizePx: 4,
    },
  );
  if (!result.placement)
    reject(
      "No room for this title across all tracked frames. Use smaller or multiline text, a shorter interval, or another shot.",
    );
  clip.transform = {
    x: Math.ceil((result.placement.x - graphic.bounds.x) / 2) * 2,
    y: Math.ceil((result.placement.y - graphic.bounds.y) / 2) * 2,
  };
  const previewPath = path.join(outputDir, "review.png");
  clip.properties.subject_safe = {
    required: true,
    version: 1,
    analysisId: doc.analysisId,
    videoClipId,
    evidence: { path: scenePath, sha256: fileHash(scenePath) },
    localBounds: graphic.bounds,
    marginPx,
    titleSafeRatio,
    visualBinding: visualBinding(project),
    titleBinding: titleBinding(clip),
  };
  const candidate = {
    ...project,
    tracks: [...project.tracks, ...addTrack.map((op) => op.params)],
    clips: [...project.clips.filter((c) => !previous.includes(c)), clip],
  };
  const report = verifySubjectTitle({
    project: candidate,
    clip,
    doc,
    bounds: graphic.bounds,
  });
  const crop = evidence.crop;
  ffmpeg([
    "-i",
    evidence.asset.src,
    "-i",
    graphic.inputPath,
    "-filter_complex",
    `[0:v]select=eq(n\\,${evidence.frames[0].frameIndex}),crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}:exact=1,scale=${project.canvas.width}:${project.canvas.height},setsar=1[base];[base][1:v]overlay=x=${clip.transform.x}:y=${clip.transform.y}:format=auto[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    "-y",
    previewPath,
  ]);
  clip.properties.subject_safe.reviewPreview = {
    path: previewPath,
    sha256: fileHash(previewPath),
  };
  clip.properties.subject_safe.glyphPreview = {
    path: graphic.inputPath,
    sha256: fileHash(graphic.inputPath),
  };
  return {
    operations: [
      ...previous.map((c) => ({
        type: "delete_clip",
        params: { clipId: c.id },
      })),
      ...addTrack,
      { type: "insert_clip", params: clip },
    ],
    report,
    previewPath,
    glyphPath: graphic.inputPath,
    internalPaths: [font.path, scenePath, previewPath, graphic.inputPath],
  };
}
module.exports = {
  mappedEvidence,
  visualBinding,
  checkRectangle,
  verifySubjectTitle,
  proposeSubjectTitle,
};
