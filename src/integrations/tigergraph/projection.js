// A replayable projection of trusted local facts. No media, paths, tokens or free-text notes.
const { digest } = require("../../creative/execution-record.js");
const { activeFeedback } = require("../../design/ranking.js");
const { buckets, parameters } = require("../../design/parameters.js");
const { VERSION, VERTICES, EDGES } = require("./schema.js");
function projection({ workspaceId, project, sets, events }) {
  const vertices = {},
    edges = {},
    examples = new Map();
  const id = (type, raw) => workspaceId + "_" + digest({ type, raw });
  function vertex(type, identity, attributes) {
    if (
      !VERTICES[type] ||
      Object.keys(attributes).some((k) => !Object.hasOwn(VERTICES[type], k))
    )
      throw Error("Unknown graph vertex/attribute.");
    (vertices[type] ||= {})[identity] = Object.fromEntries(
      Object.entries(attributes).map(([k, value]) => [k, { value }]),
    );
  }
  function edge(type, from, to, attributes = {}) {
    const [source, target] = EDGES[type];
    const byId = (edges[source] ||= {}),
      byType = (byId[from] ||= {}),
      byTarget = (byType[type] ||= {}),
      entries = (byTarget[target] ||= {});
    entries[to] = Object.fromEntries(
      Object.entries(attributes).map(([k, value]) => [k, { value }]),
    );
  }
  const active = new Set(activeFeedback(events).map((e) => e.id));
  for (const set of sets.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const setId = id("set", set.id);
    vertex("EMEDesignSet", setId, {
      workspace_id: workspaceId,
      set_id: set.id,
      recipe: set.brief.recipe,
      snapshot: set.snapshot,
      base_revision: set.baseRevision,
    });
    edge("EME_HAS_SET", workspaceId, setId);
    for (const candidate of set.candidates) {
      const candidateId = id("candidate", candidate.id),
        p = parameters(candidate.report.parameters),
        b = buckets(p);
      const relevant = events.filter(
        (e) =>
          e.kind === "preference" &&
          active.has(e.id) &&
          (e.preferredCandidateId === candidate.id ||
            e.comparedCandidateIds.includes(candidate.id)),
      );
      const report = candidate.report;
      const measurements = report.measurements || {
        titleFontPx:
          report.layout.elements.find((e) => e.role === "title")?.fontSize || 0,
        travel: report.timing.travel,
        holdTicks: report.timing.holdTicks,
      };
      const summary = {
        candidateId: candidate.id,
        setId: set.id,
        projectId: set.projectId,
        recipe: set.brief.recipe,
        profileId: candidate.profileId,
        aspect: candidate.features.aspect,
        parameters: p,
        parameterBuckets: b,
        measurements,
        baseRevision: set.baseRevision,
        reportSha256: candidate.reportSha256,
        designVersion: set.version,
        previousCandidateId: set.revision?.previousCandidateId || null,
        // Content length helps find comparable layouts without copying the user's wording.
        content: Object.fromEntries(
          ["title", "body", "eyebrow", "value"].map((k) => [
            k + "Characters",
            (set.brief[k] || "").length,
          ]),
        ),
        feedback: relevant.map((e) => ({
          feedbackId: e.id,
          preferred: e.preferredCandidateId === candidate.id,
          rejected: e.preferredCandidateId === null,
          compared: e.comparedCandidateIds.includes(candidate.id),
          motionReviewed: (e.motionReviewedCandidateIds || []).includes(
            candidate.id,
          ),
          evidenceStage: e.evidenceStage,
          source: e.source,
        })),
      };
      const attrs = {
        recipe: summary.recipe,
        aspect: summary.aspect,
        profile_id: summary.profileId,
        base_revision: summary.baseRevision,
      };
      examples.set(candidateId, summary);
      vertex("EMECandidate", candidateId, {
        workspace_id: workspaceId,
        candidate_id: candidate.id,
        profile_id: candidate.profileId,
        recipe: summary.recipe,
        aspect: summary.aspect,
        summary_json: JSON.stringify(summary),
      });
      edge("EME_HAS_CANDIDATE", workspaceId, candidateId, attrs);
      edge("EME_SET_CANDIDATE", setId, candidateId);
      const profileId = id("profile", candidate.profileId);
      vertex("EMEProfile", profileId, {
        workspace_id: workspaceId,
        profile_id: candidate.profileId,
      });
      edge("EME_USES_PROFILE", candidateId, profileId);
      for (const [axis, bucket] of Object.entries(b)) {
        const parameterId = id("parameter", { axis, bucket });
        vertex("EMEParameter", parameterId, {
          workspace_id: workspaceId,
          axis,
          bucket,
        });
        edge("EME_USES_PARAMETER", candidateId, parameterId);
      }
      if (summary.previousCandidateId)
        edge(
          "EME_REVISES",
          candidateId,
          id("candidate", summary.previousCandidateId),
        );
    }
  }
  for (const event of events) {
    const eventId = id("feedback", event.id);
    const evidence =
      event.kind === "preference"
        ? {
            setId: event.setId,
            observationKey: event.observationKey,
            preferredCandidateId: event.preferredCandidateId,
            comparedCandidateIds: event.comparedCandidateIds,
            motionReviewedCandidateIds: event.motionReviewedCandidateIds || [],
            evidenceStage: event.evidenceStage,
            source: event.source,
            reasons: event.reasons,
          }
        : { feedbackId: event.feedbackId, source: event.source };
    vertex("EMEFeedback", eventId, {
      workspace_id: workspaceId,
      feedback_id: event.id,
      kind: event.kind,
      active: active.has(event.id),
      recorded_at: event.recordedAt,
      evidence_json: JSON.stringify(evidence),
    });
    edge("EME_HAS_FEEDBACK", workspaceId, eventId);
    if (event.preferredCandidateId)
      edge(
        "EME_PREFERRED",
        eventId,
        id("candidate", event.preferredCandidateId),
      );
    for (const raw of event.comparedCandidateIds || [])
      edge("EME_COMPARED", eventId, id("candidate", raw));
    for (const raw of event.motionReviewedCandidateIds || [])
      edge("EME_MOTION_REVIEWED", eventId, id("candidate", raw));
    if (event.replacesId)
      edge("EME_REPLACES", eventId, id("feedback", event.replacesId));
    if (event.feedbackId)
      edge("EME_WITHDRAWS", eventId, id("feedback", event.feedbackId));
  }
  const components = new Map();
  for (const asset of project.assets) {
    const design = asset.metadata?.design,
      definition = design?.component;
    if (!definition || !examples.has(id("candidate", design.candidateId)))
      continue;
    const componentId = id("component", definition.componentId);
    const present = project.clips.some(
      (c) => c.id === definition.componentId && c.source?.assetId === asset.id,
    );
    const existing = components.get(componentId);
    if (!existing || present)
      components.set(componentId, {
        workspace_id: workspaceId,
        component_id: definition.componentId,
        current_candidate_id: present ? design.candidateId : "",
        present,
      });
    const example = examples.get(id("candidate", design.candidateId));
    edge(
      "EME_COMPONENT_CANDIDATE",
      componentId,
      id("candidate", design.candidateId),
      {
        recipe: example.recipe,
        aspect: example.aspect,
        profile_id: example.profileId,
        base_revision: example.baseRevision,
      },
    );
  }
  for (const [identity, attributes] of components) {
    vertex("EMEComponent", identity, attributes);
    edge("EME_HAS_COMPONENT", workspaceId, identity);
  }
  const revision = digest({
    version: VERSION,
    vertices,
    edges,
    projectId: project.id,
    projectRevision: project.revision,
  });
  for (const entries of Object.values(vertices))
    for (const attributes of Object.values(entries))
      attributes.projection_revision = { value: revision };
  for (const byId of Object.values(edges))
    for (const byType of Object.values(byId))
      for (const [type, byTarget] of Object.entries(byType))
        if (EDGES[type][2]?.projection_revision)
          for (const entries of Object.values(byTarget))
            for (const attributes of Object.values(entries))
              attributes.projection_revision = { value: revision };
  const workspace = {
    namespace: workspaceId,
    schema_version: VERSION,
    revision,
    state: "ready",
    project_id: project.id,
  };
  vertex("EMEWorkspace", workspaceId, workspace);
  return {
    version: VERSION,
    workspaceId,
    revision,
    workspace,
    vertices,
    edges,
    examples,
    id,
  };
}
function batches(view, maxBytes = 512 * 1024) {
  const parts = [];
  let current = { vertices: {}, edges: {} },
    size = 32;
  function append(part, bytes) {
    if (bytes > maxBytes)
      throw Error("A graph record exceeds the sync batch limit.");
    if (size + bytes > maxBytes) {
      parts.push(current);
      current = { vertices: {}, edges: {} };
      size = 32;
    }
    part(current);
    size += bytes;
  }
  // Publish the workspace manifest separately only after every record is acknowledged.
  for (const [type, entries] of Object.entries(view.vertices))
    if (type !== "EMEWorkspace")
      for (const [identity, attributes] of Object.entries(entries))
        append(
          (b) => {
            (b.vertices[type] ||= {})[identity] = attributes;
          },
          Buffer.byteLength(
            JSON.stringify({ [type]: { [identity]: attributes } }),
          ),
        );
  for (const [source, byId] of Object.entries(view.edges))
    for (const [from, byType] of Object.entries(byId))
      for (const [type, byTarget] of Object.entries(byType))
        for (const [target, entries] of Object.entries(byTarget))
          for (const [to, attributes] of Object.entries(entries))
            append(
              (b) => {
                ((((b.edges[source] ||= {})[from] ||= {})[type] ||= {})[
                  target
                ] ||= {})[to] = attributes;
              },
              Buffer.byteLength(
                JSON.stringify({
                  [source]: {
                    [from]: { [type]: { [target]: { [to]: attributes } } },
                  },
                }),
              ),
            );
  if (Object.keys(current.vertices).length || Object.keys(current.edges).length)
    parts.push(current);
  return parts;
}
module.exports = { projection, batches };
