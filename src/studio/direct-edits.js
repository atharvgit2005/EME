// Browser gestures compile into ordinary review proposals. This module never commits.
const crypto = require("node:crypto");
const { OperationExecutor } = require("../engine/operations.js");
const { error, TICKS } = require("./plans.js");
const { visualBinding } = require("../scene/title-placement.js");

const FIELDS = {
  move: ["startTick", "targetTrackId"],
  trim_start: ["startTick"],
  trim_end: ["endTick"],
  split: ["atTick"],
  delete: [],
  properties: ["typography", "transform", "audio"],
  track: ["trackId", "muted", "locked"],
  duration: ["durationTicks"],
};
function object(value, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw error(`${label} must be an object.`);
}
function keys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw error(`Unsupported ${label} field: ${key}.`);
}
function tick(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw error(`${label} must be a nonnegative integer number of ticks.`);
  return value;
}
function frameTick(project, value) {
  const { numerator: n, denominator: d } = project.timebase.fps;
  const index = Math.round((tick(value, "Time") * n) / (TICKS * d));
  return Math.round((index * TICKS * d) / n);
}
function finite(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw error(`${label} must be between ${min} and ${max}.`);
}
function linkedClips(project, clip, enabled) {
  if (!enabled || !["video", "audio"].includes(clip.type) || !clip.source)
    return [clip];
  const matches = project.clips.filter((other) => {
    if (
      !other.source ||
      other.id === clip.id ||
      other.startTick !== clip.startTick ||
      (other.source.trimInTick || 0) !== (clip.source.trimInTick || 0)
    )
      return false;
    const related =
      clip.type === "video"
        ? other.type === "audio" &&
          other.source.assetId === clip.source.assetId + "-audio"
        : other.type === "video" &&
          clip.source.assetId === other.source.assetId + "-audio";
    if (!related) return false;
    const out =
      clip.source.trimOutTick ??
      (clip.source.trimInTick || 0) + clip.durationTicks;
    const otherOut =
      other.source.trimOutTick ??
      (other.source.trimInTick || 0) + other.durationTicks;
    if (other.durationTicks === clip.durationTicks && otherOut === out)
      return true;
    const { numerator, denominator } = project.timebase.fps;
    const oneFrame = Math.ceil((TICKS * denominator) / numerator);
    // Container/video and extracted PCM tails can differ by encoder padding. Only
    // relax that original-tail mismatch; a user-trimmed component is not silently
    // re-linked merely because its endpoint is less than one frame away.
    return (
      Math.abs(other.durationTicks - clip.durationTicks) <= oneFrame &&
      Math.abs(otherOut - out) <= oneFrame &&
      out === knownSourceDuration(project, clip) &&
      otherOut === knownSourceDuration(project, other)
    );
  });
  if (matches.length > 1)
    throw error(
      "Multiple source-audio links match. Disable linked editing and select each clip explicitly.",
    );
  return [clip, ...matches];
}
function knownSourceDuration(project, clip) {
  const id = clip.source?.assetId;
  const asset = project.assets.find((a) => a.id === id);
  if (!asset) return null;
  let ticks = asset.metadata?.durationTicks ?? asset.durationTicks;
  if (!Number.isSafeInteger(ticks) && Number.isFinite(asset.metadata?.duration))
    ticks = Math.floor(asset.metadata.duration * TICKS);
  return Number.isSafeInteger(ticks) && ticks > 0 ? ticks : null;
}
function sourceLimit(project, clip) {
  if (!project.assets.some((a) => a.id === clip.source?.assetId))
    throw error("The clip source is unavailable.");
  const ticks = knownSourceDuration(project, clip);
  // Unknown media never acquires invented source handles.
  const original = project.clips.find((c) => c.id === clip.id) || clip;
  return Number.isSafeInteger(ticks) && ticks > 0
    ? ticks
    : (original.source.trimOutTick ??
        (original.source.trimInTick || 0) + original.durationTicks);
}
function checkSource(project, clip) {
  if (!clip.source?.assetId) return;
  const start = clip.source.trimInTick || 0;
  const end = clip.source.trimOutTick ?? start + clip.durationTicks;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end - start !== clip.durationTicks ||
    end > sourceLimit(project, clip)
  )
    throw error(
      "The edit extends beyond available source footage or changes playback speed.",
    );
}
function propertyParams(project, clip, body) {
  const params = { clipId: clip.id };
  if (body.typography !== undefined) {
    if (clip.type !== "text")
      throw error("Typography controls apply to text clips.");
    keys(
      body.typography,
      ["text", "fontSize", "color", "textAlign"],
      "typography",
    );
    const t = body.typography;
    if (
      t.text !== undefined &&
      (typeof t.text !== "string" || !t.text.trim() || t.text.length > 150)
    )
      throw error("Enter title text up to 150 characters.");
    if (
      t.fontSize !== undefined &&
      (!Number.isInteger(t.fontSize) || t.fontSize < 12 || t.fontSize > 300)
    )
      throw error("Font size must be an integer from 12 to 300 px.");
    if (
      t.color !== undefined &&
      (typeof t.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(t.color))
    )
      throw error("Text color must use #RRGGBB.");
    if (
      t.textAlign !== undefined &&
      !["left", "center", "right"].includes(t.textAlign)
    )
      throw error("Choose left, center or right text alignment.");
    if (Object.keys(t).length) params.typography = structuredClone(t);
  }
  if (body.transform !== undefined) {
    if (clip.type === "audio")
      throw error("Audio clips have no visual transform.");
    keys(
      body.transform,
      ["x", "y", "scaleX", "scaleY", "rotation", "opacity"],
      "transform",
    );
    for (const [key, value] of Object.entries(body.transform)) {
      const range =
        key === "opacity"
          ? [0, 1]
          : key.startsWith("scale")
            ? [0.05, 4]
            : key === "rotation"
              ? [-360, 360]
              : [
                  -4 * Math.max(project.canvas.width, project.canvas.height),
                  4 * Math.max(project.canvas.width, project.canvas.height),
                ];
      finite(value, ...range, key);
    }
    if (Object.keys(body.transform).length)
      params.transform = structuredClone(body.transform);
  }
  if (body.audio !== undefined) {
    if (clip.type !== "audio")
      throw error(
        "Select the separate source-audio clip to adjust its volume.",
      );
    keys(body.audio, ["volume"], "audio");
    if (body.audio.volume !== undefined) {
      finite(body.audio.volume, 0, 2, "Volume");
      params.audio = { volume: body.audio.volume };
    }
  }
  if (Object.keys(params).length === 1)
    throw error("Choose a property to change.");
  return params;
}

function directEditOperations(project, body) {
  object(body, "Edit");
  if (
    !Number.isSafeInteger(body.baseRevision) ||
    body.baseRevision !== project.revision
  )
    throw error(
      "The project changed. Refresh the editor and retry this edit.",
      409,
    );
  if (!Object.hasOwn(FIELDS, body.action))
    throw error("Unsupported timeline action.");
  keys(
    body,
    ["baseRevision", "action", "clipId", "linked", ...FIELDS[body.action]],
    "edit",
  );
  if (body.linked !== undefined && typeof body.linked !== "boolean")
    throw error("Linked editing must be enabled or disabled.");
  const operations = [],
    add = (type, params) => operations.push({ type, params });
  let summary;
  if (body.action === "track") {
    const track = project.tracks.find((t) => t.id === body.trackId);
    if (!track) throw error("Track not found.", 404);
    const params = { trackId: track.id };
    for (const key of ["muted", "locked"])
      if (body[key] !== undefined) {
        if (typeof body[key] !== "boolean")
          throw error(`${key} must be a boolean.`);
        params[key] = body[key];
      }
    if (Object.keys(params).length === 1)
      throw error("Choose a track control to change.");
    add("set_track_state", params);
    summary = `Update ${track.name || track.id}: ${Object.entries(params)
      .filter(([k]) => k !== "trackId")
      .map(([k, v]) => `${k} ${v ? "on" : "off"}`)
      .join(", ")}.`;
  } else if (body.action === "duration") {
    const durationTicks = frameTick(project, body.durationTicks);
    if (durationTicks <= 0 || durationTicks > 120 * TICKS)
      throw error(
        "Project length must be positive and no longer than 120 seconds.",
      );
    if (
      project.clips.some((c) => c.startTick + c.durationTicks > durationTicks)
    )
      throw error(
        "Trim or remove clips beyond the requested project end first.",
      );
    add("set_project_duration", { durationTicks });
    summary = `Set project length to ${(durationTicks / TICKS).toFixed(3)} seconds.`;
  } else {
    const clip = project.clips.find((c) => c.id === body.clipId);
    if (!clip) throw error("Clip not found.", 404);
    if (
      (clip.properties?.subject_safe || clip.properties?.face_safe?.required) &&
      body.action !== "delete"
    )
      throw error(
        "This title has verified scene placement. Open Understand scene to replan its text, position or timing; deleting the title is allowed.",
      );
    if (clip.properties?.curved_typography && body.action !== "delete")
      throw error(
        "Replan curved typography before changing its text, style or timing.",
      );
    const group = [
      "move",
      "trim_start",
      "trim_end",
      "split",
      "delete",
    ].includes(body.action)
      ? linkedClips(project, clip, body.linked !== false)
      : [clip];
    for (const c of group)
      if (project.tracks.find((t) => t.id === c.trackId)?.locked)
        throw error("Unlock the clip's track before editing it.");
    const snap = (value) =>
      group.some((c) => c.type !== "audio")
        ? frameTick(project, value)
        : tick(value, "Time");
    const minDuration = group.some((c) => c.type !== "audio")
      ? Math.max(
          1,
          Math.floor(
            (TICKS * project.timebase.fps.denominator) /
              project.timebase.fps.numerator,
          ),
        )
      : 1;
    const name = clip.typography?.text?.replaceAll("\n", " ") || clip.id;
    const linked = group.length > 1 ? " and linked source audio" : "";
    switch (body.action) {
      case "move": {
        const startTick = snap(body.startTick);
        for (const c of group) {
          if (startTick + c.durationTicks > project.timebase.durationTicks)
            throw error(
              "The move exceeds the project end. Extend the project first.",
            );
          const targetTrackId =
            c.id === clip.id ? body.targetTrackId || c.trackId : c.trackId;
          const track = project.tracks.find((t) => t.id === targetTrackId);
          if (
            !track ||
            track.kind !== (c.type === "audio" ? "audio" : "visual")
          )
            throw error("Choose a compatible destination track.");
          add("move_clip", {
            clipId: c.id,
            targetTick: startTick,
            targetTrackId,
          });
        }
        summary = `Move ${name}${linked} to ${(startTick / TICKS).toFixed(3)} seconds.`;
        break;
      }
      case "trim_start":
      case "trim_end": {
        const edge =
          body.action === "trim_start"
            ? snap(body.startTick)
            : snap(body.endTick);
        for (const c of group) {
          const start = body.action === "trim_start" ? edge : c.startTick;
          const end =
            body.action === "trim_end" ? edge : c.startTick + c.durationTicks;
          if (end - start < minDuration || end > project.timebase.durationTicks)
            throw error("Keep at least one frame inside the project bounds.");
          const params = {
            clipId: c.id,
            newStartTick: start,
            newDurationTicks: end - start,
          };
          if (c.source?.assetId) {
            params.trimInTick =
              (c.source.trimInTick || 0) + start - c.startTick;
            params.trimOutTick = params.trimInTick + params.newDurationTicks;
            checkSource(project, {
              ...c,
              startTick: start,
              durationTicks: params.newDurationTicks,
              source: {
                ...c.source,
                trimInTick: params.trimInTick,
                trimOutTick: params.trimOutTick,
              },
            });
          }
          add("trim_clip", params);
        }
        summary = `Trim the ${body.action === "trim_start" ? "start" : "end"} of ${name}${linked} to ${(edge / TICKS).toFixed(3)} seconds.`;
        break;
      }
      case "split": {
        const at = snap(body.atTick);
        for (const c of group) {
          if (
            at - c.startTick < minDuration ||
            c.startTick + c.durationTicks - at < minDuration
          )
            throw error(
              "Place the playhead inside the selected clip, leaving at least one frame on each side.",
            );
          add("split_clip", {
            clipId: c.id,
            splitTick: at,
            newClipId: `${c.type}-${crypto.randomUUID().slice(0, 8)}`,
          });
        }
        summary = `Split ${name}${linked} at ${(at / TICKS).toFixed(3)} seconds.`;
        break;
      }
      case "delete":
        group.forEach((c) => add("delete_clip", { clipId: c.id }));
        summary = `Delete ${name}${linked}. Leave the remaining clips in place.`;
        break;
      case "properties":
        add("modify_clip", propertyParams(project, clip, body));
        summary = `Update ${name}'s ${["typography", "transform", "audio"].filter((k) => body[k] && Object.keys(body[k]).length).join(", ")}.`;
        break;
    }
  }
  let candidate = structuredClone(project);
  for (const operation of operations) {
    const result = OperationExecutor.execute(candidate, operation);
    if (!result.success) throw error(result.error);
    candidate = result.project;
  }
  for (const c of candidate.clips) {
    if (
      c.startTick + c.durationTicks > project.timebase.durationTicks &&
      body.action !== "duration"
    )
      throw error("The edit exceeds the project end.");
    checkSource(candidate, c);
  }
  const guarded = candidate.clips.filter(
    (c) => c.properties?.subject_safe || c.properties?.face_safe?.required,
  );
  if (guarded.length && visualBinding(candidate) !== visualBinding(project))
    throw error(
      "This edit would invalidate a title's verified scene placement. Delete that title, make the footage edit, then replan it through Understand scene.",
    );
  return { operations, summary };
}
module.exports = { directEditOperations };
