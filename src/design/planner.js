const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { VERSION, PROFILES, RECIPES } = require("./catalog.js");
const { resolveFont } = require("../renderers/graphic-rasterizer.js");
const { digest } = require("../creative/execution-record.js");
const {
  computeFileSha256BoundedSync: fileHash,
} = require("../prompt-core/job-orchestrator.js");
const { MediaTime } = require("../engine/time.js");
const { FrameInspector } = require("../renderers/inspector.js");
const { parameters, variants } = require("./parameters.js");
const { COMPONENT_VERSION, binding } = require("./components.js");
const TICKS = 120000;
function invalid(message) {
  throw Error("ERR_DESIGN: " + message);
}
function command(cmd, args, input) {
  const result = spawnSync(cmd, args, {
    input,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    invalid(result.error?.message || result.stderr);
  return result.stdout;
}
function normalize(project, input, revisionClipId = null) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype)
    invalid("Provide a design brief.");
  const allowed = [
    "recipe",
    "title",
    "body",
    "eyebrow",
    "value",
    "startTick",
    "durationTicks",
    "profiles",
    "videoClipId",
    "preferredProfile",
    "parameters",
    "variationMode",
    "variationAxes",
  ];
  for (const k of Object.keys(input))
    if (!allowed.includes(k)) invalid("Unsupported brief field: " + k);
  if (!Object.hasOwn(RECIPES, input.recipe))
    invalid("Choose a supported recipe.");
  const brief = { ...input };
  brief.parameters = parameters(brief.parameters);
  if (
    brief.variationMode !== undefined &&
    !["styles", "parameters"].includes(brief.variationMode)
  )
    invalid("Unsupported variation mode.");
  for (const [key, limit] of [
    ["title", 180],
    ["body", 260],
    ["eyebrow", 45],
    ["value", 16],
  ]) {
    if (brief[key] === undefined && !["title"].includes(key)) brief[key] = "";
    if (
      typeof brief[key] !== "string" ||
      brief[key].length > limit ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(brief[key])
    )
      invalid(`${key} must be text up to ${limit} characters.`);
    brief[key] = brief[key].trim();
  }
  if (!brief.title) invalid("A title is required.");
  if (brief.recipe === "statistic-card" && !brief.value)
    invalid("A statistic value is required.");
  if (brief.recipe !== "statistic-card" && brief.value)
    invalid("Only statistic cards accept a value.");
  const frame = MediaTime.frameToTicks(1, project.timebase.fps);
  if (
    ![brief.startTick, brief.durationTicks].every(Number.isSafeInteger) ||
    brief.startTick < 0 ||
    brief.durationTicks < frame ||
    brief.startTick + brief.durationTicks > project.timebase.durationTicks
  )
    invalid("The design interval must fit the sequence.");
  for (const tick of [brief.startTick, brief.durationTicks]) {
    const index = Math.round(
      (tick * project.timebase.fps.numerator) /
        (TICKS * project.timebase.fps.denominator),
    );
    if (MediaTime.frameToTicks(index, project.timebase.fps) !== tick)
      invalid("Use frame-aligned timing.");
  }
  if (
    project.canvas.width < 320 ||
    project.canvas.height < 180 ||
    project.canvas.width > 3840 ||
    project.canvas.height > 3840
  )
    invalid("Supported canvas range is 320×180 through 3840×3840.");
  brief.profiles ??= Object.keys(PROFILES);
  if (
    !Array.isArray(brief.profiles) ||
    !brief.profiles.length ||
    brief.profiles.length > 3 ||
    new Set(brief.profiles).size !== brief.profiles.length ||
    brief.profiles.some((k) => !Object.hasOwn(PROFILES, k))
  )
    invalid("Choose one to three distinct supported profiles.");
  if (
    brief.preferredProfile !== undefined &&
    !brief.profiles.includes(brief.preferredProfile)
  )
    invalid("The preferred profile must be among the requested profiles.");
  const active = project.clips.filter(
    (c) =>
      !project.tracks.find((t) => t.id === c.trackId)?.muted &&
      c.id !== revisionClipId &&
      c.type !== "audio" &&
      c.startTick < brief.startTick + brief.durationTicks &&
      c.startTick + c.durationTicks > brief.startTick,
  );
  if (active.some((c) => c.type !== "video"))
    invalid(
      "An existing visual overlay overlaps this interval. Choose another interval or remove it through review first.",
    );
  let video = null;
  if (RECIPES[brief.recipe].requiresVideo) {
    video = project.clips.find(
      (c) => c.id === brief.videoClipId && c.type === "video",
    );
    if (
      !video ||
      active.length !== 1 ||
      active[0].id !== video.id ||
      video.startTick > brief.startTick ||
      video.startTick + video.durationTicks <
        brief.startTick + brief.durationTicks
    )
      invalid(
        "Select one visible video covering the complete lower-third interval.",
      );
    if (
      Object.entries(video.transform || {}).some(
        ([k, v]) =>
          v !==
          ({ scaleX: 1, scaleY: 1, opacity: 1, anchorX: 0.5, anchorY: 0.5 }[
            k
          ] ?? 0),
      ) ||
      video.effects?.length ||
      (project.animations || []).some((a) => a.clipId === video.id) ||
      video.properties?.optical_distortion ||
      video.properties?.curved_typography ||
      video.colorGrade?.enabled ||
      project.colorGrade?.enabled
    )
      invalid(
        "Lower-third previews require static footage without effects or animation.",
      );
    if (
      video.source?.trimOutTick !== undefined &&
      video.source.trimOutTick - (video.source.trimInTick || 0) !==
        video.durationTicks
    )
      invalid("Speed changes are unsupported.");
  } else if (brief.videoClipId !== undefined)
    invalid("Cards do not require a videoClipId.");
  return { brief, video };
}
function motion(duration, fps, profile, height) {
  const count = Math.round(
    (duration * fps.numerator) / (TICKS * fps.denominator),
  );
  const entryFrames = Math.max(
    1,
    Math.round((profile.entrySeconds * fps.numerator) / fps.denominator),
  );
  const exitFrames = Math.max(
    1,
    Math.round((profile.exitSeconds * fps.numerator) / fps.denominator),
  );
  const at = (i) => MediaTime.frameToTicks(i, fps);
  if (entryFrames + exitFrames + 2 >= count)
    invalid("The interval is too short for the selected motion profile.");
  const travel =
    profile.travelRatio === 0
      ? 0
      : Math.max(2, Math.round((height * profile.travelRatio) / 2) * 2);
  const opacity = [
    { offsetTick: 0, value: 0, easing: "linear" },
    { offsetTick: at(entryFrames), value: 1, easing: "linear" },
    { offsetTick: at(count - exitFrames - 1), value: 1, easing: "linear" },
    { offsetTick: at(count - 1), value: 0, easing: "linear" },
  ];
  const y = Array.from({ length: entryFrames + 1 }, (_, i) => {
    const u = i / entryFrames;
    return {
      offsetTick: at(i),
      value: Math.round((travel * (1 - u * u * (3 - 2 * u))) / 2) * 2,
      easing: "linear",
    };
  });
  return {
    opacity,
    y,
    entryTicks: at(entryFrames),
    exitTicks: duration - at(count - exitFrames - 1),
    travel,
  };
}
function createDesignSet({
  project,
  brief: input,
  outputDir,
  revision = null,
  directions = {},
}) {
  const { brief, video } = normalize(project, input, revision?.clipId);
  const font = resolveFont({});
  const source =
    video &&
    project.assets.find(
      (a) => a.id === (video.source?.assetId || video.assetId),
    );
  if (video && (!source || fileHash(source.src) !== source.sha256))
    invalid("Source footage is missing or changed.");
  const sourceHash = source?.sha256;
  if (source) {
    const actual = FrameInspector.inspectVideoMetadata(source.src).video;
    const crop = video.properties?.reframing?.crop_rect || {
      x: 0,
      y: 0,
      width: actual.width,
      height: actual.height,
    };
    if (
      !["x", "y", "width", "height"].every(
        (k) =>
          Number.isSafeInteger(crop[k]) &&
          crop[k] >= (["width", "height"].includes(k) ? 1 : 0),
      ) ||
      crop.x + crop.width > actual.width ||
      crop.y + crop.height > actual.height ||
      Math.abs(
        crop.width / crop.height - project.canvas.width / project.canvas.height,
      ) > Math.max(1 / project.canvas.width, 1 / project.canvas.height)
    )
      invalid("A valid static crop matching the canvas aspect is required.");
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const set = {
    id: crypto.randomUUID(),
    version: VERSION,
    baseRevision: project.revision,
    projectId: project.id,
    canvas: structuredClone(project.canvas),
    snapshot: digest(project),
    brief,
    candidates: [],
    failures: [],
    ...(revision ? { revision } : {}),
  };
  const words = [brief.title, brief.body, brief.eyebrow, brief.value]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  for (const variant of variants(brief, directions)) {
    const { profileId, variantId, parameters: resolved } = variant;
    const dir = path.join(outputDir, `${profileId}-${variantId}`);
    fs.mkdirSync(dir);
    try {
      const frames = Math.round(
        (brief.durationTicks * project.timebase.fps.numerator) /
          (TICKS * project.timebase.fps.denominator),
      );
      const effectiveDuration = MediaTime.frameToTicks(
        Math.max(1, Math.round(frames * resolved.holdScale)),
        project.timebase.fps,
      );
      const effectiveBrief = { ...brief, durationTicks: effectiveDuration };
      normalize(project, effectiveBrief, revision?.clipId);
      const profile = {
          ...PROFILES[profileId],
          travelRatio: PROFILES[profileId].travelRatio * resolved.motionScale,
        },
        timing = motion(
          effectiveDuration,
          project.timebase.fps,
          profile,
          project.canvas.height,
        );
      const readingSeconds = Math.max(1.2, words / profile.wordsPerSecond);
      const holdTicks =
        effectiveDuration - timing.entryTicks - timing.exitTicks;
      if (holdTicks < Math.ceil(readingSeconds * TICKS))
        invalid(
          `Allow at least ${(readingSeconds + profile.entrySeconds + profile.exitSeconds + 1 / (project.timebase.fps.numerator / project.timebase.fps.denominator)).toFixed(2)} seconds for ${words} words in ${profile.name}.`,
        );
      const glyphPath = path.join(dir, "graphic.png"),
        previewPath = path.join(dir, "preview.png"),
        reportPath = path.join(dir, "design.json");
      const layout = JSON.parse(
        command(
          "python3",
          [path.join(__dirname, "rasterize.py")],
          JSON.stringify({
            ...brief,
            parameters: resolved,
            canvas: project.canvas,
            profile,
            rules: RECIPES[brief.recipe],
            font: font.path,
            output: glyphPath,
          }),
        ),
      );
      const measurements = {
        titleFontPx: layout.elements.find((e) => e.role === "title").fontSize,
        gapPx: layout.gapPx,
        travel: timing.travel,
        holdTicks,
      };
      const comparison =
        revision?.measurements || set.candidates[0]?.report.measurements;
      if (comparison) {
        const axes = revision
          ? Object.keys(directions)
          : brief.variationMode === "parameters"
            ? [variantId]
            : [];
        const names = {
          titleScale: "titleFontPx",
          spacingScale: "gapPx",
          motionScale: "travel",
          holdScale: "holdTicks",
        };
        for (const axis of axes) {
          const sign =
            directions[axis] ||
            (resolved[axis] > brief.parameters[axis] ? 1 : -1);
          if (sign * (measurements[names[axis]] - comparison[names[axis]]) <= 0)
            invalid(
              `The requested ${axis} change cannot be measured in this layout. Change the content or interval.`,
            );
        }
      }
      let backgroundPath = null;
      if (brief.recipe === "lower-third") {
        if (
          layout.alphaBounds.y + layout.alphaBounds.height + timing.travel >
          project.canvas.height
        )
          invalid("Entrance would exceed the canvas.");
        const crop = video.properties?.reframing?.crop_rect;
        const cropFilter = crop
          ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}:exact=1,`
          : "";
        command("ffmpeg", [
          "-nostdin",
          "-v",
          "error",
          "-filter_complex_threads",
          "1",
          "-ss",
          String(
            ((video.source?.trimInTick || 0) +
              brief.startTick -
              video.startTick +
              timing.entryTicks) /
              TICKS,
          ),
          "-i",
          source.src,
          "-i",
          glyphPath,
          "-filter_complex",
          `[0:v]${cropFilter}scale=${project.canvas.width}:${project.canvas.height},setsar=1[bg];[bg][1:v]overlay=0:0`,
          "-frames:v",
          "1",
          "-y",
          previewPath,
        ]);
        backgroundPath = path.join(dir, "background.png");
        command("ffmpeg", [
          "-nostdin",
          "-v",
          "error",
          "-ss",
          String(
            ((video.source?.trimInTick || 0) +
              brief.startTick -
              video.startTick +
              timing.entryTicks) /
              TICKS,
          ),
          "-i",
          source.src,
          "-vf",
          `${cropFilter}scale=${project.canvas.width}:${project.canvas.height},setsar=1`,
          "-frames:v",
          "1",
          "-y",
          backgroundPath,
        ]);
      } else fs.copyFileSync(glyphPath, previewPath);
      const motionPath = path.join(dir, "motion.webp");
      const motionPreview = JSON.parse(
        command(
          "python3",
          [path.join(__dirname, "motion-preview.py")],
          JSON.stringify({
            glyph: glyphPath,
            background: backgroundPath,
            color: project.canvas.backgroundColor || "#000000",
            durationTicks: effectiveDuration,
            opacity: timing.opacity,
            y: timing.y,
            output: motionPath,
          }),
        ),
      );
      const id = digest({
        version: VERSION,
        snapshot: set.snapshot,
        brief,
        profileId,
        profile,
        timing,
        layout,
        resolved,
        font: font.sha256,
        graphic: fileHash(glyphPath),
      });
      const trackId = revision?.trackId || `design-${id.slice(0, 16)}`,
        assetId = `${trackId}-image`,
        clipId = revision?.clipId || `${trackId}-clip`;
      const uniqueAssetId = revision
        ? `design-${id.slice(0, 16)}-image`
        : assetId;
      const report = {
        version: VERSION,
        candidateId: id,
        profileId,
        variantId,
        parameters: resolved,
        measurements,
        effectiveDurationTicks: effectiveDuration,
        recipe: brief.recipe,
        snapshot: set.snapshot,
        fontSha256: font.sha256,
        graphicSha256: fileHash(glyphPath),
        previewSha256: fileHash(previewPath),
        motionPreview: { ...motionPreview, sha256: fileHash(motionPath) },
        layout,
        timing: { ...timing, readingSeconds, holdTicks },
        warnings: [
          brief.recipe === "lower-third"
            ? "Placement is not checked against tracked subjects. Use scene placement for subject protection."
            : "This opaque card covers footage during its interval. Existing audio is preserved.",
        ],
        decisions: [
          "Text measured and wrapped with the bound local font.",
          `${profile.name} spacing, type hierarchy and colors applied.`,
          "Smoothstep entrance compiled to frame-aligned native linear keyframes.",
          `${readingSeconds.toFixed(2)} seconds minimum static reading time.`,
        ],
      };
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), {
        flag: "wx",
      });
      const clipParams = {
        id: clipId,
        trackId,
        type: "graphic",
        source: { assetId: uniqueAssetId },
        startTick: brief.startTick,
        durationTicks: effectiveDuration,
      };
      const animationParams = [
        ["transform.opacity", timing.opacity],
        ["transform.y", timing.y],
      ].map(([property, keyframes]) => ({ clipId, property, keyframes }));
      const baseBrief = Object.fromEntries(
        [
          "recipe",
          "title",
          "body",
          "eyebrow",
          "value",
          "startTick",
          "durationTicks",
          "videoClipId",
        ]
          .filter((k) => brief[k] !== undefined)
          .map((k) => [k, brief[k]]),
      );
      const definition = {
        version: COMPONENT_VERSION,
        componentId: revision?.componentId || clipId,
        baseBrief,
        profileId,
        parameters: resolved,
        measurements,
        binding: binding(clipParams, animationParams),
        ...(revision
          ? { previousCandidateId: revision.previousCandidateId }
          : {}),
      };
      const operations = [
        {
          type: "add_asset",
          params: {
            id: uniqueAssetId,
            type: "image",
            src: glyphPath,
            sha256: report.graphicSha256,
            metadata: {
              design: {
                candidateId: id,
                recipe: brief.recipe,
                title: brief.title,
                component: definition,
                report: { path: reportPath, sha256: fileHash(reportPath) },
                preview: { path: previewPath, sha256: report.previewSha256 },
                motion: {
                  path: motionPath,
                  sha256: report.motionPreview.sha256,
                },
              },
            },
          },
        },
        {
          type: "add_asset",
          params: {
            id: `design-${id.slice(0, 16)}-font`,
            type: "font",
            src: font.path,
            sha256: font.sha256,
          },
        },
        ...(!revision
          ? [
              {
                type: "add_track",
                params: {
                  id: trackId,
                  name: `${profile.name} · ${RECIPES[brief.recipe].name}`,
                  kind: "visual",
                  zIndex:
                    Math.max(0, ...project.tracks.map((t) => t.zIndex)) + 1,
                },
              },
            ]
          : [{ type: "delete_clip", params: { clipId } }]),
        {
          type: "insert_clip",
          params: clipParams,
        },
        ...animationParams.map((params) => ({
          type: "animate_property",
          params,
        })),
      ];
      const internalPaths = [
        glyphPath,
        font.path,
        reportPath,
        previewPath,
        motionPath,
      ];
      set.candidates.push({
        id,
        profileId,
        name: variant.name ? `${profile.name} · ${variant.name}` : profile.name,
        report,
        operations,
        internalPaths,
        previewPath,
        glyphPath,
        motionPath,
      });
    } catch (error) {
      set.failures.push({ profileId, variantId, reason: error.message });
    }
  }
  if (source && fileHash(source.src) !== sourceHash)
    invalid("Source footage changed while creating previews.");
  if (fileHash(font.path) !== font.sha256)
    invalid("Font changed while creating designs.");
  if (!set.candidates.length)
    invalid(set.failures.map((f) => `${f.profileId}: ${f.reason}`).join("\n"));
  return set;
}
module.exports = { createDesignSet, normalize, motion };
