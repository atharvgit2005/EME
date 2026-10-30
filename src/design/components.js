const { digest } = require("../creative/execution-record.js");
const { parameters, adjust } = require("./parameters.js");
const { PROFILES } = require("./catalog.js");
const COMPONENT_VERSION = "eme-design-component.v1";
function binding(clip, animations) {
  return digest({
    clip,
    animations: animations
      .filter((a) => a.clipId === clip.id)
      .slice()
      .sort((a, b) => a.property.localeCompare(b.property)),
  });
}
function component(project, clipId, sets = []) {
  const clip = project.clips.find(
    (c) => c.id === clipId && c.type === "graphic",
  );
  const asset = project.assets.find((a) => a.id === clip?.source?.assetId);
  if (!clip || !asset?.metadata?.design)
    throw Error("ERR_DESIGN_COMPONENT: Select a designed graphic.");
  let definition = asset.metadata.design.component;
  if (!definition) {
    // Migrate a pre-descriptor component only when its exact generated operations remain available.
    const set = sets.find((s) =>
      s.candidates.some((c) => c.id === asset.metadata.design.candidateId),
    );
    const candidate = set?.candidates.find(
      (c) => c.id === asset.metadata.design.candidateId,
    );
    const insert = candidate?.operations?.find(
      (o) => o.type === "insert_clip",
    )?.params;
    if (!insert || insert.id !== clip.id)
      throw Error(
        "ERR_DESIGN_COMPONENT: This older design needs its original plan to be revised.",
      );
    definition = {
      version: COMPONENT_VERSION,
      componentId: clip.id,
      baseBrief: set.brief,
      profileId: candidate.profileId,
      parameters: parameters(candidate.report.parameters),
      measurements: {
        titleFontPx: candidate.report.layout.elements.find(
          (e) => e.role === "title",
        ).fontSize,
        travel: candidate.report.timing.travel,
        holdTicks: candidate.report.timing.holdTicks,
        gapPx:
          candidate.report.layout.gapPx ??
          Math.max(
            8,
            Math.round(Math.min(set.canvas.width, set.canvas.height) * 0.025),
          ),
      },
      binding: binding(
        insert,
        candidate.operations
          .filter((o) => o.type === "animate_property")
          .map((o) => o.params),
      ),
    };
  }
  if (
    definition.version !== COMPONENT_VERSION ||
    definition.binding !== binding(clip, project.animations || [])
  )
    throw Error(
      "ERR_DESIGN_COMPONENT: This component changed outside the design editor. Restore its design revision or create a fresh design.",
    );
  const track = project.tracks.find((t) => t.id === clip.trackId);
  if (track?.locked || track?.muted)
    throw Error(
      "ERR_DESIGN_COMPONENT: Unlock and enable the component track before revising it.",
    );
  return {
    ...structuredClone(definition),
    clipId,
    trackId: clip.trackId,
    candidateId: asset.metadata.design.candidateId,
  };
}
function revisionBrief(current, changes, explore = true) {
  const allowed = [
    "title",
    "body",
    "eyebrow",
    "value",
    "startTick",
    "durationTicks",
    "profileId",
    "parameters",
    "adjustments",
  ];
  if (
    !changes ||
    Object.getPrototypeOf(changes) !== Object.prototype ||
    !Object.keys(changes).length ||
    Object.keys(changes).some((k) => !allowed.includes(k))
  )
    throw Error(
      "ERR_DESIGN_COMPONENT: Provide supported content, style, timing or parameter changes.",
    );
  if (changes.parameters && changes.adjustments)
    throw Error(
      "ERR_DESIGN_COMPONENT: Use parameters or adjustments, not both.",
    );
  const profileId = changes.profileId ?? current.profileId;
  if (!Object.hasOwn(PROFILES, profileId))
    throw Error("ERR_DESIGN_COMPONENT: Unknown style.");
  const adjusted = adjust(
    changes.parameters
      ? { ...current.parameters, ...changes.parameters }
      : current.parameters,
    changes.adjustments || {},
  );
  const brief = {
    ...current.baseBrief,
    profiles: [profileId],
    preferredProfile: profileId,
    parameters: adjusted.parameters,
  };
  delete brief.variationAxes;
  delete brief.variationMode;
  for (const key of [
    "title",
    "body",
    "eyebrow",
    "value",
    "startTick",
    "durationTicks",
  ])
    if (Object.hasOwn(changes, key)) brief[key] = changes[key];
  const axes = adjusted.axes.length
    ? adjusted.axes
    : Object.keys(changes.parameters || {}).filter(
        (k) => current.parameters[k] !== adjusted.parameters[k],
      );
  if (explore && axes.length) {
    brief.variationMode = "parameters";
    brief.variationAxes = axes.slice(0, 2);
  }
  const directions = { ...adjusted.directions };
  for (const axis of axes)
    directions[axis] ||= Math.sign(
      adjusted.parameters[axis] - current.parameters[axis],
    );
  return { brief, directions };
}
module.exports = { COMPONENT_VERSION, binding, component, revisionBrief };
