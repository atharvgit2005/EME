const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { StudioServer } = require("../src/studio/server.js");
const { DesignMemory } = require("../src/integrations/tigergraph/memory.js");
const {
  configuration,
  TigerGraphClient,
} = require("../src/integrations/tigergraph/client.js");
const {
  VERSION,
  schemaGsql,
  VERTICES,
  EDGES,
} = require("../src/integrations/tigergraph/schema.js");
const { batches } = require("../src/integrations/tigergraph/projection.js");
const { digest } = require("../src/creative/execution-record.js");
const {
  SessionLockCoordinator,
} = require("../src/prompt-core/session-lock.js");

// An HTTP REST++ contract double, not a TigerGraph installation or GSQL compiler.
async function graphDouble(t) {
  const g = {
    vertices: new Map(),
    edges: new Map(),
    requests: [],
    upserts: 0,
    mode: null,
    tamperEdges: null,
    tamperVertex: null,
    onUpsert: null,
    expectedAuthorization: "Bearer contract-token",
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"),
      p = url.pathname
        .replace(/^\/restpp/, "")
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : null;
    g.requests.push({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body,
    });
    const send = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.headers.authorization !== g.expectedAuthorization)
      return send({ error: true, message: "Unauthorized" }, 401);
    if (g.mode === "offline") return send({ error: true }, 503);
    if (g.mode === "api_error")
      return send({ error: true, message: "contract-token SECRET" });
    if (g.mode === "bad_json") return res.end("not json");
    if (g.mode === "redirect") {
      res.writeHead(302, { Location: "/other-destination" });
      return res.end();
    }
    if (g.mode === "timeout") {
      const timer = setTimeout(() => res.end("late"), 1000);
      timer.unref();
      return;
    }
    if (p[0] !== "graph" || p[1] !== "EME") return send({ error: true }, 404);
    if (req.method === "POST") {
      g.upserts++;
      if (g.onUpsert) {
        const response = await g.onUpsert(body, g.upserts);
        if (response) return send(response, response.status || 200);
      }
      let accepted_vertices = 0,
        accepted_edges = 0;
      for (const [type, entries] of Object.entries(body.vertices || {})) {
        if (!VERTICES[type]) return send({ error: true });
        for (const [id, attrs] of Object.entries(entries)) {
          if (Object.keys(attrs).some((k) => !Object.hasOwn(VERTICES[type], k)))
            return send({ error: true });
          const key = type + ":" + id,
            attributes = {
              ...(g.vertices.get(key)?.attributes || {}),
              ...Object.fromEntries(
                Object.entries(attrs).map(([k, v]) => [k, v.value]),
              ),
            };
          g.vertices.set(key, { v_id: id, v_type: type, attributes });
          accepted_vertices++;
        }
      }
      for (const [from_type, byId] of Object.entries(body.edges || {}))
        for (const [from_id, byType] of Object.entries(byId))
          for (const [e_type, byTarget] of Object.entries(byType))
            for (const [to_type, entries] of Object.entries(byTarget))
              for (const [to_id, attrs] of Object.entries(entries)) {
                if (
                  !EDGES[e_type] ||
                  EDGES[e_type][0] !== from_type ||
                  EDGES[e_type][1] !== to_type
                )
                  return send({ error: true });
                g.edges.set(
                  [from_type, from_id, e_type, to_type, to_id].join(":"),
                  {
                    from_type,
                    from_id,
                    e_type,
                    to_type,
                    to_id,
                    attributes: Object.fromEntries(
                      Object.entries(attrs).map(([k, v]) => [k, v.value]),
                    ),
                  },
                );
                accepted_edges++;
              }
      return send({
        error: false,
        results: [{ accepted_vertices, accepted_edges }],
      });
    }
    if (p[2] === "vertices") {
      const found = g.vertices.get(p[3] + ":" + p[4]);
      let row = found ? structuredClone(found) : null;
      if (row && g.tamperVertex) row = g.tamperVertex(row);
      return send({ error: false, results: row ? [row] : [] });
    }
    if (p[2] === "edges") {
      let rows = [...g.edges.values()].filter(
        (e) =>
          e.from_type === p[3] &&
          e.from_id === p[4] &&
          e.e_type === p[5] &&
          e.to_type === p[6],
      );
      for (const condition of (url.searchParams.get("filter") || "")
        .split(",")
        .filter(Boolean)) {
        const [, key, value] = /^(\w+)="([\w-]+)"$/.exec(condition) || [];
        if (!key) return send({ error: true });
        rows = rows.filter((e) => e.attributes[key] === value);
      }
      rows.sort(
        (a, b) =>
          b.attributes.base_revision - a.attributes.base_revision ||
          a.to_id.localeCompare(b.to_id),
      );
      rows = rows.slice(0, Number(url.searchParams.get("limit") || 100));
      if (g.tamperEdges) rows = g.tamperEdges(structuredClone(rows));
      return send({ error: false, results: rows });
    }
    send({ error: true }, 404);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  g.env = {
    EME_TIGERGRAPH_URL: `http://127.0.0.1:${server.address().port}/restpp`,
    EME_TIGERGRAPH_TOKEN: "contract-token",
    EME_TIGERGRAPH_TIMEOUT_MS: "500",
  };
  t.after(() => new Promise((r) => server.close(r)));
  return g;
}
function local(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-tigergraph-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const server = new StudioServer({ root, tigergraphEnv: {} });
  const set = server.planDesign({
    baseRevision: 0,
    brief: {
      recipe: "title-card",
      title: "Private fixture wording",
      body: "This content stays local",
      startTick: 0,
      durationTicks: 720000,
      profiles: ["balanced"],
      variationMode: "parameters",
      variationAxes: ["titleScale", "motionScale"],
    },
  });
  return { root, server, store: server.designFeedback, set };
}
function memory(t, f, env) {
  const m = new DesignMemory({
    root: f.root,
    store: f.store,
    project: () => f.server.project(),
    env,
  });
  t.after(() => m.close());
  return m;
}
function vote(f, preferred = 1, compared = [0]) {
  return f.store.submit({
    submissionId: crypto.randomUUID(),
    setId: f.set.id,
    preferredCandidateId: f.set.candidates[preferred].id,
    comparedCandidateIds: compared.map((i) => f.set.candidates[i].id),
    reasons: ["typography"],
    note: "Secret private reviewer note",
    motionReviewedCandidateIds: [],
  });
}
async function until(predicate) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 10000)
      throw Error("Timed out awaiting automatic reconciliation");
    await new Promise((r) => setTimeout(r, 20));
  }
}
function rpc(t, root) {
  const child = spawn(
    process.execPath,
    [path.resolve("bin/eme-studio-mcp.js")],
    {
      env: { ...process.env, EME_STUDIO_ROOT: root },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  t.after(() => child.kill());
  let buffer = "",
    serial = 0;
  const pending = new Map();
  child.stdout.on("data", (b) => {
    buffer += b;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line) {
        const r = JSON.parse(line);
        pending.get(r.id)?.(r);
        pending.delete(r.id);
      }
    }
  });
  return (name, args = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial,
        timer = setTimeout(() => reject(Error("MCP timeout")), 12000);
      pending.set(id, (v) => {
        clearTimeout(timer);
        resolve(v);
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name, arguments: args },
        }) + "\n",
      );
    });
}

test("Configuration is optional, bounds identifiers and keeps credentials out of errors", () => {
  assert.equal(configuration({}).state, "not_configured");
  for (const env of [
    { EME_TIGERGRAPH_URL: "https://user:SECRET@host.invalid/restpp" },
    { EME_TIGERGRAPH_URL: "not a URL SECRET" },
    { EME_TIGERGRAPH_URL: "http://public.invalid" },
    { EME_TIGERGRAPH_URL: "https://host.invalid" },
    {
      EME_TIGERGRAPH_URL: "http://127.0.0.1:9000",
      EME_TIGERGRAPH_GRAPH: "EME; DROP ALL",
    },
    {
      EME_TIGERGRAPH_URL: "http://127.0.0.1:9000",
      EME_TIGERGRAPH_TIMEOUT_MS: "0",
    },
  ]) {
    const config = configuration(env);
    assert.equal(config.state, "configuration_error");
    assert.doesNotMatch(JSON.stringify(config), /SECRET|user:|public\.invalid/);
  }
  assert.equal(
    configuration({ EME_TIGERGRAPH_URL: "http://127.0.0.1:9000" }).enabled,
    true,
  );
  assert.equal(
    configuration({
      EME_TIGERGRAPH_URL: "https://host.invalid/restpp",
      EME_TIGERGRAPH_TOKEN: "SECRET",
    }).enabled,
    true,
  );
  assert.throws(() => schemaGsql("EME; DROP ALL"));
  assert.equal(fs.readFileSync("schema/tigergraph.gsql", "utf8"), schemaGsql());
  assert.doesNotMatch(schemaGsql(), /^DROP /m);
});

test("Projection links designs, parameters and explicit feedback without uploading wording, notes or paths", (t) => {
  const f = local(t),
    m = memory(t, f, {}),
    before = digest(f.server.project());
  const initial = m.snapshot();
  assert.equal(Object.keys(initial.vertices.EMEFeedback || {}).length, 0);
  const feedback = vote(f),
    view = m.snapshot(),
    encoded = JSON.stringify(batches(view));
  assert.doesNotMatch(
    encoded,
    /Private fixture wording|Secret private reviewer note|This content stays local|graphic\.png|preview\.png|\/Users\/|contract-token/,
  );
  assert.equal(Object.keys(view.vertices.EMECandidate).length, 3);
  assert.equal(Object.keys(view.vertices.EMEFeedback).length, 1);
  assert.ok(Object.values(view.edges.EMEFeedback).some((e) => e.EME_PREFERRED));
  assert.ok(
    [...view.examples.values()].some((e) =>
      e.feedback.some((v) => v.feedbackId === feedback.id && v.preferred),
    ),
  );
  assert.notEqual(view.revision, initial.revision);
  assert.equal(digest(f.server.project()), before);
  assert.deepEqual(m.snapshot().vertices, view.vertices);
});

test("REST++ synchronization is authenticated, atomic per batch, idempotent and replayable after restart", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  const before = fs.readFileSync(f.server.projectPath),
    state = await m.sync();
  assert.equal(state.state, "ready", state.message);
  const count = g.vertices.size,
    revision = m.snapshot().revision;
  await m.sync();
  assert.equal(g.vertices.size, count);
  assert.equal(m.status().lastSyncedRevision, revision);
  assert.ok(
    g.requests
      .filter((r) => r.method === "POST")
      .every(
        (r) =>
          r.headers["gsql-atomic-level"] === "atomic" &&
          r.query.ack === "all" &&
          r.path === "/restpp/graph/EME",
      ),
  );
  const reloaded = memory(t, f, g.env);
  assert.equal(reloaded.status().lastSyncedRevision, revision);
  assert.equal(
    (
      await reloaded.recall({
        recipe: "title-card",
        profileId: "balanced",
        aspect: "landscape",
        limit: 2,
      })
    ).source,
    "tigergraph",
  );
  assert.deepEqual(fs.readFileSync(f.server.projectPath), before);
  assert.doesNotMatch(JSON.stringify(state), /contract-token|127\.0\.0\.1/);
});

test("Savanna database secrets authenticate without persisting a browser session or mixing credential modes", async (t) => {
  const g = await graphDouble(t),
    f = local(t);
  g.expectedAuthorization = "GSQL-Secret contract-database-secret";
  const env = {
    ...g.env,
    EME_TIGERGRAPH_TOKEN: "",
    EME_TIGERGRAPH_SECRET: "contract-database-secret",
  };
  const m = memory(t, f, env);
  assert.equal((await m.sync()).state, "ready");
  assert.equal((await m.recall()).source, "tigergraph");
  assert.ok(
    g.requests.every(
      (r) =>
        r.headers.authorization === g.expectedAuthorization &&
        !r.headers.cookie,
    ),
  );
  assert.doesNotMatch(JSON.stringify(m.status()), /contract-database-secret/);
  for (const invalid of [
    { ...env, EME_TIGERGRAPH_TOKEN: "other-token" },
    { ...env, EME_TIGERGRAPH_SECRET: "bad\r\nsecret" },
  ]) {
    const c = configuration(invalid);
    assert.equal(c.state, "configuration_error");
    assert.doesNotMatch(
      JSON.stringify(c),
      /contract-database-secret|other-token|bad\\r/,
    );
  }
});

test("Corrections and retractions are projected as audit relations and stop influencing recalled examples", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  const first = vote(f);
  await m.sync();
  assert.ok((await m.recall()).examples.some((e) => e.feedback.length));
  const correction = vote(f, 0, [1]);
  assert.equal(correction.replacesId, first.id);
  const stale = await m.recall();
  assert.equal(stale.source, "local_fallback");
  assert.ok(
    stale.examples.every((e) =>
      e.feedback.every((v) => v.feedbackId !== first.id),
    ),
  );
  await m.sync();
  assert.ok([...g.edges.values()].some((e) => e.e_type === "EME_REPLACES"));
  f.store.withdraw({
    submissionId: crypto.randomUUID(),
    feedbackId: correction.id,
  });
  await m.sync();
  assert.ok([...g.edges.values()].some((e) => e.e_type === "EME_WITHDRAWS"));
  assert.equal(
    [...g.vertices.values()].filter(
      (v) => v.v_type === "EMEFeedback" && v.attributes.active,
    ).length,
    0,
  );
  const result = await m.recall();
  assert.equal(result.source, "tigergraph");
  assert.ok(result.examples.every((e) => !e.feedback.length));
});

test("Unavailable, expired-token, malformed and redirecting endpoints leave edits intact and use local memory", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  const before = digest(f.server.project());
  for (const mode of [
    "offline",
    "api_error",
    "bad_json",
    "redirect",
    "timeout",
  ]) {
    g.mode = mode;
    const status = await m.sync();
    assert.equal(status.state, "error");
    assert.equal(status.pending, true);
    assert.doesNotMatch(status.message, /contract-token|SECRET/);
    assert.equal((await m.recall()).source, "local_fallback");
  }
  assert.equal(
    g.requests.filter((r) => r.path === "/other-destination").length,
    0,
  );
  g.mode = null;
  assert.equal((await m.sync()).state, "ready");
  assert.equal(digest(f.server.project()), before);
  const wrong = new TigerGraphClient(
    configuration({ ...g.env, EME_TIGERGRAPH_TOKEN: "expired-token" }),
  );
  await assert.rejects(
    () => wrong.vertex("EMEWorkspace", m.workspaceId),
    /HTTP 401/,
  );
});

test("A failed partial upload never commits readiness; retries reconcile from durable local facts", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  g.onUpsert = (_body, n) =>
    n === 2 ? { error: true, message: "Controlled interruption" } : null;
  assert.equal((await m.sync()).state, "error");
  assert.equal(
    g.vertices.get("EMEWorkspace:" + m.workspaceId).attributes.state,
    "syncing",
  );
  assert.equal(fs.existsSync(m.checkpoint), false);
  assert.equal((await m.recall()).source, "local_fallback");
  g.onUpsert = null;
  assert.equal((await m.sync()).state, "ready");
  assert.equal((await m.recall()).source, "tigergraph");
  g.onUpsert = () => ({
    error: false,
    results: [{ accepted_vertices: 0, accepted_edges: 0 }],
  });
  assert.equal((await m.sync()).state, "error");
});

test("Graph retrieval rejects foreign identities, altered evidence, duplicate and incomplete results", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  await m.sync();
  const normal = await m.recall({ limit: 2 });
  assert.equal(normal.source, "tigergraph");
  assert.equal(normal.examples.length, 2);
  for (const transform of [
    (rows) => rows.map((r) => ({ ...r, from_id: "foreign_workspace" })),
    (rows) => [rows[0], rows[0]],
    (rows) => rows.slice(0, 1),
  ]) {
    g.tamperEdges = transform;
    assert.equal((await m.recall({ limit: 2 })).source, "local_fallback");
  }
  g.tamperEdges = null;
  g.tamperVertex = (v) => {
    if (v.v_type === "EMECandidate")
      v.attributes.summary_json = JSON.stringify({
        invented: "quality guarantee",
      });
    return v;
  };
  assert.equal((await m.recall()).source, "local_fallback");
  g.tamperVertex = null;
  for (const input of [
    { limit: 1000 },
    { query: "DROP ALL" },
    { recipe: 'title-card",x="injection' },
    { aspect: "panorama" },
    { profileId: "invented" },
  ])
    await assert.rejects(() => m.recall(input));
});

test("Workspace isolation and full corpus replay survive the short Studio design-set window", async (t) => {
  const g = await graphDouble(t),
    a = local(t),
    b = local(t);
  const ma = memory(t, a, g.env),
    mb = memory(t, b, g.env);
  for (let i = 0; i < 22; i++) {
    const original = a.server.state.designSets[0];
    a.store.register({
      ...original,
      id: crypto.randomUUID(),
      baseRevision: i + 1,
    });
  }
  await Promise.all([ma.sync(), mb.sync()]);
  assert.notEqual(ma.workspaceId, mb.workspaceId);
  assert.equal(Object.keys(ma.snapshot().vertices.EMEDesignSet).length, 23);
  assert.equal(
    [...g.vertices.values()].filter(
      (v) =>
        v.v_type === "EMEDesignSet" &&
        v.attributes.workspace_id === ma.workspaceId,
    ).length,
    23,
  );
  assert.equal((await ma.recall()).source, "tigergraph");
  assert.ok(
    (await mb.recall()).examples.every(
      (e) => e.projectId === b.server.project().id,
    ),
  );
});

test("Live lock holders block competing graph writers and corrupted ledgers do not reset remote history", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  await m.sync();
  const checkpoint = fs.readFileSync(m.checkpoint),
    before = g.upserts;
  const lock = new SessionLockCoordinator({
    lockDir: path.join(m.root, "locks"),
  }).acquireLock("session", "tigergraph-sync");
  try {
    assert.equal((await m.sync()).state, "error");
    assert.equal(g.upserts, before);
  } finally {
    lock.release();
  }
  vote(f);
  const ledger = JSON.parse(fs.readFileSync(f.store.file));
  ledger.sha256 = "damaged";
  fs.writeFileSync(f.store.file, JSON.stringify(ledger));
  assert.equal((await m.sync()).state, "error");
  assert.equal(g.upserts, before);
  assert.deepEqual(fs.readFileSync(m.checkpoint), checkpoint);
  await assert.rejects(() => m.recall(), /damaged/);
});

test("Applied component lineage and undo are reconciled without treating approvals as preference votes", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  const c = f.set.candidates.find((c) => c.variantId === "requested");
  const approve = (p) => f.server.approve({ id: p.id, digest: p.digest });
  approve(
    f.server.proposeDesign({
      baseRevision: f.set.baseRevision,
      setId: f.set.id,
      candidateId: c.id,
    }),
  );
  const clipId = f.server.project().clips.find((c) => c.type === "graphic").id;
  const set = f.server.reviseDesign({
    baseRevision: f.server.project().revision,
    clipId,
    changes: { adjustments: { typography: "larger", motion: "less" } },
  });
  const revised = set.candidates.find((c) => c.variantId === "requested");
  approve(
    f.server.proposeDesign({
      baseRevision: set.baseRevision,
      setId: set.id,
      candidateId: revised.id,
    }),
  );
  await m.sync();
  const recall = await m.recall({ componentId: clipId, limit: 10 });
  assert.equal(recall.source, "tigergraph");
  assert.ok(recall.examples.some((e) => e.previousCandidateId === c.id));
  assert.equal(f.store.read().length, 0);
  assert.ok([...g.edges.values()].some((e) => e.e_type === "EME_REVISES"));
  const undo = f.server.historyProposal("undo");
  approve(undo);
  await m.sync();
  const component = [...g.vertices.values()].find(
    (v) => v.v_type === "EMEComponent" && v.attributes.component_id === clipId,
  );
  assert.equal(component.attributes.current_candidate_id, c.id);
  assert.equal(
    (await m.recall({ componentId: clipId, limit: 10 })).source,
    "tigergraph",
  );
});

test("Feedback retracted during a remote read is absent from the fresh local fallback", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  const feedback = vote(f);
  await m.sync();
  let changed = false;
  g.tamperVertex = (vertex) => {
    if (!changed && vertex.v_type === "EMECandidate") {
      changed = true;
      f.store.withdraw({
        submissionId: crypto.randomUUID(),
        feedbackId: feedback.id,
      });
    }
    return vertex;
  };
  const result = await m.recall();
  assert.equal(result.source, "local_fallback");
  assert.equal(result.projectionRevision, m.snapshot().revision);
  assert.ok(result.examples.every((e) => !e.feedback.length));
});

test(
  "The end-to-end verifier exercises Studio, REST++, revisions, native export, restart and production stdio",
  { timeout: 120000 },
  async (t) => {
    const g = await graphDouble(t);
    const {
      verifyGraphIntegration,
    } = require("../src/integrations/tigergraph/verify.js");
    const result = await verifyGraphIntegration({
      env: g.env,
      evidenceKind: "restpp_contract_double",
      outputDir: path.resolve(
        ".artifacts/tigergraph/e2e-contract-" + crypto.randomUUID(),
      ),
    });
    assert.equal(result.success, true);
    const report = JSON.parse(fs.readFileSync(result.reportPath));
    assert.equal(report.evidenceKind, "restpp_contract_double");
    assert.equal(report.delivery.success, true);
    assert.ok(fs.statSync(result.outputPath).size > 1000);
    for (const stage of [
      "live_connection_and_workspace_manifest",
      "explicit_feedback_correction_and_retraction",
      "component_revisions_and_graph_lineage",
      "undo_redo_reconciliation",
      "native_export_with_audio",
      "restart_and_production_stdio_retrieval",
    ])
      assert.ok(result.stages.some((s) => s.name === stage));
    assert.equal(
      [...g.vertices.values()].filter(
        (v) => v.v_type === "EMEFeedback" && v.attributes.active,
      ).length,
      0,
    );
    assert.doesNotMatch(JSON.stringify(report), /contract-token/);
    console.log(
      "TIGERGRAPH_E2E_CONTRACT " +
        JSON.stringify({ report: result.reportPath, video: result.outputPath }),
    );
  },
);

test("The live verifier refuses unconfigured endpoints without creating a fake successful result", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-live-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "uncreated");
  await assert.rejects(
    () =>
      require("../src/integrations/tigergraph/verify.js").verifyGraphIntegration(
        { env: {}, outputDir },
      ),
    /Configure EME_TIGERGRAPH_URL/,
  );
  assert.equal(fs.existsSync(outputDir), false);
});

test("Production Studio and stdio expose memory retrieval, auto-sync changes and retain feedback/review authority", async (t) => {
  const g = await graphDouble(t),
    f = local(t);
  const server = await new StudioServer({
    root: f.root,
    port: 0,
    tigergraphEnv: g.env,
  }).start();
  t.after(() => server.close());
  await until(() => server.designMemory.status().state === "ready");
  const html = await (await fetch(server.origin)).text(),
    csrf = /name="eme-review" content="([a-f0-9]+)"/.exec(html)[1];
  const post = async (route, body, browser = true) =>
    fetch(server.origin + route, {
      method: "POST",
      headers: browser
        ? {
            Origin: server.origin,
            "X-EME-Review": csrf,
            "Content-Type": "application/json",
          }
        : {
            Authorization: "Bearer " + server.agentToken,
            "Content-Type": "application/json",
          },
      body: JSON.stringify(body),
    });
  const before = digest(server.project()),
    call = rpc(t, f.root);
  const response = await call("eme_studio_get_design_memory", {
    recipe: "title-card",
    limit: 2,
  });
  assert.equal(response.result.isError, undefined);
  assert.equal(
    JSON.parse(response.result.content[0].text).source,
    "tigergraph",
  );
  const inbox = JSON.parse(
    (await call("eme_studio_get_inbox")).result.content[0].text,
  );
  assert.equal(inbox.graphMemory.enabled, true);
  assert.match(inbox.instructions, /eme_studio_get_design_memory/);
  assert.equal(
    (await post("/api/agent/design/memory", { query: "DROP ALL" }, false))
      .status,
    400,
  );
  assert.equal(
    (await post("/api/agent/design/memory/sync", {}, false)).status,
    404,
  );
  assert.equal((await post("/api/design/memory/sync", {}, false)).status, 403);
  assert.equal(
    (
      await post(
        "/api/design/feedback",
        { submissionId: crypto.randomUUID() },
        false,
      )
    ).status,
    403,
  );
  assert.equal(digest(server.project()), before);
  const feedback = await post("/api/design/feedback", {
    submissionId: crypto.randomUUID(),
    setId: f.set.id,
    preferredCandidateId: f.set.candidates[1].id,
    comparedCandidateIds: [f.set.candidates[0].id],
  });
  assert.equal(feedback.status, 200);
  const saved = (await feedback.json()).feedback;
  await until(
    () =>
      server.designMemory.status().lastSyncedRevision ===
      server.designMemory.snapshot().revision,
  );
  assert.ok(
    (await server.designMemory.recall()).examples.some(
      (e) => e.feedback.length,
    ),
  );
  assert.equal(
    (
      await post("/api/design/feedback/withdraw", {
        submissionId: crypto.randomUUID(),
        feedbackId: saved.id,
      })
    ).status,
    200,
  );
  await until(
    () =>
      server.designMemory.status().lastSyncedRevision ===
      server.designMemory.snapshot().revision,
  );
  assert.ok(
    (await server.designMemory.recall()).examples.every(
      (e) => !e.feedback.length,
    ),
  );
  assert.equal(server.state.proposal, undefined);
  const planned = server.planDesign({
    baseRevision: server.project().revision,
    brief: {
      recipe: "title-card",
      title: "Automatically synchronized",
      startTick: 0,
      durationTicks: 720000,
      profiles: ["balanced"],
    },
  });
  await until(
    () =>
      server.designMemory.status().lastSyncedRevision ===
      server.designMemory.snapshot().revision,
  );
  const proposed = server.proposeDesign({
    baseRevision: planned.baseRevision,
    setId: planned.id,
    candidateId: planned.candidates[0].id,
  });
  server.approve({ id: proposed.id, digest: proposed.digest });
  await until(
    () =>
      server.designMemory.status().lastSyncedRevision ===
      server.designMemory.snapshot().revision,
  );
  assert.ok(
    [...g.vertices.values()].some(
      (v) => v.v_type === "EMEComponent" && v.attributes.present,
    ),
  );
  assert.equal(server.designFeedback.history().activeCount, 0);
});

test("Concurrent sync requests coalesce and changes arriving during upload are replayed afterwards", async (t) => {
  const g = await graphDouble(t),
    f = local(t),
    m = memory(t, f, g.env);
  let changed = false;
  g.onUpsert = (body) => {
    if (!changed && body.vertices?.EMECandidate) {
      changed = true;
      vote(f);
    }
  };
  const initialRevision = m.snapshot().revision;
  const results = await Promise.all([m.sync(), m.sync(), m.sync()]);
  assert.ok(results.every((r) => r.state === "ready"));
  assert.equal(m.status().lastSyncedRevision, initialRevision);
  assert.equal(g.upserts, 3);
  await until(() => m.status().lastSyncedRevision === m.snapshot().revision);
  assert.equal(g.upserts, 6);
  const recalled = await m.recall();
  assert.equal(recalled.source, "tigergraph");
  assert.ok(recalled.examples.some((e) => e.feedback.length));
});


test("Transient overload retries atomic upserts; authentication and invalid counts fail closed", async () => {
  let calls = 0;
  const body = { vertices: { EMEWorkspace: { test: { state: { value: "syncing" } } } } };
  const config = configuration({ EME_TIGERGRAPH_URL: "http://localhost:9000" });
  const client = new TigerGraphClient(config, async (url, options) => {
    calls++;
    assert.equal(options.headers["gsql-atomic-level"], "atomic");
    assert.equal(url.searchParams.has("atomic_post"), false);
    return calls < 3 ? new Response("busy", { status: 503 }) :
      Response.json({ error: false, results: [{ accepted_vertices: 1, accepted_edges: 0 }] });
  });
  await client.upsert(body);
  assert.equal(calls, 3);
  for (const response of [
    () => new Response("secret", { status: 401 }),
    () => Response.json({ error: false, results: [{ accepted_vertices: "Infinity" }] }),
    () => Response.json({ error: false, results: [{ accepted_vertices: -1 }] }),
    () => Response.json({ error: false, results: [] }),
  ]) {
    let attempts = 0;
    const c = new TigerGraphClient(config, async () => { attempts++; return response(); });
    await assert.rejects(c.upsert(body), /ERR_TIGERGRAPH/);
    assert.equal(attempts, 1);
  }
});


test("Stopped cloud workspace gives actionable redacted diagnostics and retains pending local facts", async (t) => {
  const f = local(t);
  const m = memory(t, f, { EME_TIGERGRAPH_URL: "https://workspace.invalid/restpp", EME_TIGERGRAPH_TOKEN: "secret" });
  let calls = 0;
  m.client.fetch = async () => { calls++; return new Response("<html>Auto start is not enabled for this workspace secret</html>", { status: 500 }); };
  const state = await m.sync();
  assert.equal(state.reason, "workspace_stopped");
  assert.equal(state.pending, true);
  assert.equal(calls, 1);
  assert.match(state.message, /Resume it in TigerGraph Cloud/);
  assert.doesNotMatch(state.message, /secret|<html>/);
  await m.close();
});
