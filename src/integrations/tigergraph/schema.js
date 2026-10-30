const VERSION = "eme-tigergraph.v1";
const VERTICES = {
  EMEWorkspace: {
    namespace: "STRING",
    schema_version: "STRING",
    revision: "STRING",
    state: "STRING",
    project_id: "STRING",
  },
  EMEDesignSet: {
    workspace_id: "STRING",
    set_id: "STRING",
    recipe: "STRING",
    snapshot: "STRING",
    base_revision: "INT",
  },
  EMECandidate: {
    workspace_id: "STRING",
    candidate_id: "STRING",
    profile_id: "STRING",
    recipe: "STRING",
    aspect: "STRING",
    summary_json: "STRING",
  },
  EMEProfile: { workspace_id: "STRING", profile_id: "STRING" },
  EMEParameter: { workspace_id: "STRING", axis: "STRING", bucket: "STRING" },
  EMEFeedback: {
    workspace_id: "STRING",
    feedback_id: "STRING",
    kind: "STRING",
    active: "BOOL",
    recorded_at: "STRING",
    evidence_json: "STRING",
  },
  EMEComponent: {
    workspace_id: "STRING",
    component_id: "STRING",
    current_candidate_id: "STRING",
    present: "BOOL",
  },
};
const FILTER = {
  recipe: "STRING",
  aspect: "STRING",
  profile_id: "STRING",
  base_revision: "INT",
  projection_revision: "STRING",
};
const EDGES = {
  EME_HAS_SET: ["EMEWorkspace", "EMEDesignSet"],
  EME_HAS_CANDIDATE: ["EMEWorkspace", "EMECandidate", FILTER],
  EME_SET_CANDIDATE: ["EMEDesignSet", "EMECandidate"],
  EME_HAS_FEEDBACK: ["EMEWorkspace", "EMEFeedback"],
  EME_PREFERRED: ["EMEFeedback", "EMECandidate"],
  EME_COMPARED: ["EMEFeedback", "EMECandidate"],
  EME_MOTION_REVIEWED: ["EMEFeedback", "EMECandidate"],
  EME_REPLACES: ["EMEFeedback", "EMEFeedback"],
  EME_WITHDRAWS: ["EMEFeedback", "EMEFeedback"],
  EME_USES_PROFILE: ["EMECandidate", "EMEProfile"],
  EME_USES_PARAMETER: ["EMECandidate", "EMEParameter"],
  EME_REVISES: ["EMECandidate", "EMECandidate"],
  EME_HAS_COMPONENT: ["EMEWorkspace", "EMEComponent"],
  EME_COMPONENT_CANDIDATE: ["EMEComponent", "EMECandidate", FILTER],
};
for (const fields of Object.values(VERTICES))
  fields.projection_revision = "STRING";
function schemaGsql(graph = "EME") {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(graph))
    throw Error("Invalid graph identifier.");
  const attributes = (fields) =>
    Object.entries(fields)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
  return (
    `// ${VERSION}. Run once in an empty, dedicated graph namespace. No DROP commands.\n` +
    Object.entries(VERTICES)
      .map(
        ([name, fields]) =>
          `CREATE VERTEX ${name} (PRIMARY_ID id STRING, ${attributes(fields)})`,
      )
      .join("\n") +
    "\n" +
    Object.entries(EDGES)
      .map(
        ([name, [from, to, fields = {}]]) =>
          `CREATE DIRECTED EDGE ${name} (FROM ${from}, TO ${to}${Object.keys(fields).length ? ", " + attributes(fields) : ""}) WITH REVERSE_EDGE=\"${name}_REVERSE\"`,
      )
      .join("\n") +
    "\n" +
    `CREATE GRAPH ${graph} (${[...Object.keys(VERTICES), ...Object.keys(EDGES), ...Object.keys(EDGES).map((n) => n + "_REVERSE")].join(", ")})\n`
  );
}
module.exports = { VERSION, VERTICES, EDGES, schemaGsql };
