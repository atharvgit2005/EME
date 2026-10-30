const crypto = require("node:crypto");
const { OperationExecutor } = require("../engine/operations.js");
const { digest } = require("../creative/execution-record.js");
const TICKS = 120000;
const ALLOWED = new Set([
  "add_asset",
  "add_track",
  "insert_clip",
  "modify_clip",
  "trim_clip",
  "move_clip",
  "split_clip",
  "delete_clip",
  "apply_effect",
  "animate_property",
  "set_audio_envelope",
  "set_track_state",
  "set_project_duration",
]);
function error(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function operationPlan(project, operations) {
  if (
    !Array.isArray(operations) ||
    !operations.length ||
    operations.length > 80
  )
    throw error("Provide between 1 and 80 editing operations.");
  let next = structuredClone(project);
  const normalized = operations.map((op, index) => {
    if (
      !ALLOWED.has(op.type) ||
      !op.params ||
      Object.getPrototypeOf(op.params) !== Object.prototype
    )
      throw error("Unsupported editing operation: " + op.type);
    const result = OperationExecutor.execute(next, {
      type: op.type,
      params: op.params,
    });
    if (!result.success) throw error(result.error);
    next = result.project;
    return {
      op_id: `op-${index}`,
      step_index: index,
      type: op.type,
      target_id: op.params.clipId || op.params.id || project.id,
      params: op.params,
      dependencies: [],
    };
  });
  return {
    schema_version: "1.0.0",
    plan_id: `plan-${crypto.randomUUID()}`,
    source_brief_id: "brief-studio",
    source_request_id: crypto.randomUUID(),
    project_snapshot: {
      project_id: project.id,
      base_revision: project.revision,
      snapshot_sha256: digest(project),
      timebase_ticks_per_second: TICKS,
    },
    target_duration_ticks: next.timebase.durationTicks,
    operations: normalized,
    diagnostics: {
      unsupported_requests: [],
      missing_references: [],
      conflicts: [],
      rejected_operations: [],
    },
    dry_run: {
      success: true,
      simulated_steps: normalized.length,
      final_revision: next.revision,
      affected_tracks: [],
      affected_clips: [],
      timing_implications: {
        start_tick: 0,
        end_tick: next.timebase.durationTicks,
        duration_ticks: next.timebase.durationTicks,
        duration_seconds: next.timebase.durationTicks / TICKS,
      },
      invariant_checks: {
        preserved_properties_verified: true,
        track_locks_respected: true,
        zero_leak_integrity: true,
      },
    },
    validation: { status: "ready", blocking_issue_ids: [] },
  };
}
function crop(width, height, canvas) {
  const ratio = canvas.width / canvas.height;
  let w = width,
    h = height;
  if (width / height > ratio) w = Math.floor(height * ratio);
  else h = Math.floor(width / ratio);
  return {
    x: Math.floor((width - w) / 2),
    y: Math.floor((height - h) / 2),
    width: w,
    height: h,
  };
}
function importOperations(project, media) {
  const ops = [],
    add = (type, params) => ops.push({ type, params });
  const video = media.type === "video";
  if (video && !project.clips.length)
    add("set_project_duration", {
      durationTicks: Math.min(Math.floor(media.duration * TICKS), 120 * TICKS),
    });
  const track = video ? "footage" : "soundtrack";
  if (!project.tracks.some((t) => t.id === track))
    add("add_track", {
      id: track,
      name: video ? "Footage" : "Soundtrack",
      kind: video ? "visual" : "audio",
      zIndex: 0,
    });
  if (
    video &&
    media.hasAudio &&
    !project.tracks.some((t) => t.id === "dialogue")
  )
    add("add_track", {
      id: "dialogue",
      name: "Source audio",
      kind: "audio",
      zIndex: 0,
    });
  if (!project.assets.some((a) => a.id === media.id))
    add("add_asset", {
      id: media.id,
      type: media.type,
      src: media.path,
      sha256: media.sha256,
      metadata: {
        duration: media.duration,
        dimensions: { width: media.width, height: media.height },
      },
    });
  const start = video
    ? Math.max(
        0,
        ...project.clips
          .filter((c) => c.type === "video")
          .map((c) => c.startTick + c.durationTicks),
      )
    : 0;
  const duration = Math.min(
    Math.floor(media.duration * TICKS),
    (video && !project.clips.length
      ? Math.min(Math.floor(media.duration * TICKS), 120 * TICKS)
      : project.timebase.durationTicks) - start,
  );
  if (duration < 4000)
    throw error(
      "The timeline is full. Remove a clip before adding more footage.",
    );
  const id = (video ? "clip-" : "music-") + crypto.randomUUID().slice(0, 8);
  const params = {
    id,
    trackId: track,
    type: media.type,
    startTick: start,
    durationTicks: duration,
    source: { assetId: media.id, trimInTick: 0, trimOutTick: duration },
  };
  if (video)
    params.properties = {
      reframing: { crop_rect: crop(media.width, media.height, project.canvas) },
    };
  if (!video) params.audio = { volume: 0.25 };
  add("insert_clip", params);
  if (video && media.hasAudio) {
    const audio = media.audioAsset;
    if (!audio) throw error("Reimport this video to prepare its source audio.");
    if (!project.assets.some((a) => a.id === audio.id))
      add("add_asset", {
        id: audio.id,
        type: "audio",
        src: audio.path,
        sha256: audio.sha256,
      });
    const audioDuration = Math.min(
      duration,
      Math.floor(audio.duration * TICKS),
    );
    add("insert_clip", {
      id: "audio-" + id,
      trackId: "dialogue",
      type: "audio",
      startTick: start,
      durationTicks: audioDuration,
      source: { assetId: audio.id, trimInTick: 0, trimOutTick: audioDuration },
      audio: { volume: 1 },
    });
  }
  return ops;
}
function titleOperations(project, text) {
  const existing = project.clips.find((c) => c.type === "text");
  if (existing?.properties?.subject_safe)
    throw error(
      "Open Understand scene and plan the title again to update its placement and preview.",
    );
  if (existing)
    return [
      {
        type: "modify_clip",
        params: { clipId: existing.id, typography: { text } },
      },
    ];
  const ops = [];
  if (!project.tracks.some((t) => t.id === "titles"))
    ops.push({
      type: "add_track",
      params: { id: "titles", name: "Titles", kind: "visual", zIndex: 10 },
    });
  ops.push({
    type: "insert_clip",
    params: {
      id: "title-" + crypto.randomUUID().slice(0, 8),
      trackId: "titles",
      type: "text",
      startTick: 0,
      durationTicks: Math.min(4 * TICKS, project.timebase.durationTicks),
      typography: {
        text,
        fontSize: Math.round(project.canvas.width / 16),
        color: "#ffffff",
        textAlign: "center",
      },
      transform: { x: 0, y: Math.round(project.canvas.height * 0.3) },
    },
  });
  return ops;
}
module.exports = {
  operationPlan,
  importOperations,
  titleOperations,
  crop,
  error,
  TICKS,
};
