const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawn } = require("node:child_process");
const { StudioServer, run } = require("../src/studio/server.js");
const { operationPlan } = require("../src/studio/plans.js");
const { OperationExecutor: E } = require("../src/engine/operations.js");
const { digest } = require("../src/creative/execution-record.js");
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-studio-test-"));
  const server = await new StudioServer({ port: 0, root }).start();
  t.after(() => server.close());
  const html = await (await fetch(server.origin)).text();
  const token = /name="eme-review" content="([a-f0-9]+)"/.exec(html)[1];
  const request = async (route, body, extra = {}) => {
    const response = await fetch(server.origin + route, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? { ...extra }
          : {
              Origin: server.origin,
              "X-EME-Review": token,
              "Content-Type": "application/json",
              ...extra,
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const approve = async () => {
    const p = server.state.proposal;
    return request("/api/approve", { id: p.id, digest: p.digest });
  };
  return { root, server, token, request, approve };
}
async function upload(f) {
  const file = path.join(f.root, "source.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=30:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2:sample_rate=48000",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    file,
  ]);
  const response = await fetch(
    f.server.origin + "/api/upload?name=source.mp4",
    {
      method: "POST",
      headers: { Origin: f.server.origin, "X-EME-Review": f.token },
      body: fs.readFileSync(file),
    },
  );
  assert.equal(response.status, 201);
  const media = await response.json();
  return media;
}
async function imported(t) {
  const f = await setup(t),
    media = await upload(f);
  assert.equal(
    (await f.request("/api/import", { mediaId: media.id })).status,
    200,
  );
  assert.equal((await f.approve()).status, 200);
  return { ...f, media };
}
function rpc(root) {
  const child = spawn(
    process.execPath,
    [path.resolve("bin/eme-studio-mcp.js")],
    {
      env: { ...process.env, EME_STUDIO_ROOT: root },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let n = 0,
    buffer = "";
  const pending = new Map();
  child.stdout.on("data", (data) => {
    buffer += data;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line) {
        const msg = JSON.parse(line);
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      }
    }
  });
  return {
    child,
    call: (method, params) =>
      new Promise((resolve, reject) => {
        const id = ++n,
          timer = setTimeout(() => reject(Error("MCP timeout")), 10000);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      }),
  };
}
test("Studio serves a local review surface and separates browser and agent authority", async (t) => {
  const f = await setup(t);
  assert.equal((await f.request("/api/state")).status, 200);
  const before = digest(f.server.project());
  let response = await fetch(f.server.origin + "/api/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "No consent" }),
  });
  assert.equal(response.status, 403);
  response = await fetch(f.server.origin + "/api/title", {
    method: "POST",
    headers: {
      Origin: "https://foreign.example",
      "X-EME-Review": f.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: "Wrong origin" }),
  });
  assert.equal(response.status, 403);
  assert.equal(
    (
      await f.request(
        "/api/title",
        { text: "Wrong token" },
        { "X-EME-Review": "invalid" },
      )
    ).status,
    403,
  );
  assert.equal((await f.request("/api/agent/context")).status, 403);
  const publicState = JSON.stringify((await f.request("/api/state")).body);
  assert.ok(!publicState.includes(f.server.agentToken));
  assert.ok(!publicState.includes(f.token));
  assert.equal(digest(f.server.project()), before);
  assert.equal(
    (
      await f.request(
        "/api/title",
        JSON.parse('{"text":"x","__proto__":{"polluted":true}}'),
      )
    ).status,
    400,
  );
  assert.equal({}.polluted, undefined);
});
test("Import, exact review, title edit, history and export operate on real media", async (t) => {
  const f = await setup(t),
    media = await upload(f),
    before = digest(f.server.project());
  const proposed = await f.request("/api/import", { mediaId: media.id });
  assert.equal(proposed.status, 200);
  assert.equal(
    digest(f.server.project()),
    before,
    "A proposal must not mutate",
  );
  assert.equal(
    (await f.request("/api/title", { text: "Cannot replace pending import" }))
      .status,
    409,
  );
  assert.equal((await f.request("/api/undo", {})).status, 409);
  assert.equal(f.server.state.proposal.id, proposed.body.id);
  const wrong = await f.request("/api/approve", {
    id: proposed.body.id,
    digest: "0".repeat(64),
  });
  assert.equal(wrong.status, 409);
  assert.equal(digest(f.server.project()), before);
  assert.equal((await f.approve()).status, 200);
  assert.equal(f.server.project().timebase.durationTicks, 240000);
  assert.equal(
    f.server.project().clips.filter((c) => c.type === "video").length,
    1,
  );
  assert.equal(
    f.server.project().clips.filter((c) => c.type === "audio").length,
    1,
  );
  assert.equal(
    (
      await f.request("/api/approve", {
        id: proposed.body.id,
        digest: proposed.body.digest,
      })
    ).status,
    409,
  );
  await f.request("/api/title", { text: "FIRST EDIT" });
  await f.approve();
  const title = f.server.project().clips.find((c) => c.type === "text");
  assert.equal(title.typography.text, "FIRST EDIT");
  await f.request("/api/title", { text: "REVISED EDIT" });
  await f.approve();
  assert.equal(
    f.server.project().clips.find((c) => c.type === "text").typography.text,
    "REVISED EDIT",
  );
  const revision = f.server.project().revision;
  await f.request("/api/undo", {});
  await f.approve();
  assert.equal(
    f.server.project().clips.find((c) => c.type === "text").typography.text,
    "FIRST EDIT",
  );
  assert.ok(f.server.project().revision > revision);
  await f.request("/api/redo", {});
  await f.approve();
  assert.equal(
    f.server.project().clips.find((c) => c.type === "text").typography.text,
    "REVISED EDIT",
  );
  assert.equal((await f.request("/api/render", {})).status, 202);
  assert.equal(
    (await f.request("/api/title", { text: "During render" })).status,
    409,
  );
  const started = Date.now();
  while (f.server.busy && Date.now() - started < 60000)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    f.server.state.render.status,
    "SUCCEEDED",
    JSON.stringify(f.server.state.render),
  );
  const output = f.server.state.outputs.at(-1);
  assert.equal(output.qa.passed, true);
  assert.ok(fs.statSync(output.path).size > 1000);
  const range = await fetch(f.server.origin + "/api/media/" + output.id, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 32);
  const invalid = await fetch(f.server.origin + "/api/media/" + output.id, {
    headers: { Range: "bytes=999999999-" },
  });
  assert.equal(invalid.status, 416);
  const download = await fetch(
    f.server.origin + "/api/media/" + output.id + "?download",
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /attachment/);
  const projectFile = await fetch(f.server.origin + "/api/project/download");
  assert.equal(
    (await projectFile.json()).revision,
    f.server.project().revision,
  );
  console.log(
    "STUDIO_RENDER " +
      JSON.stringify({
        artifact: output.path,
        sha256: output.sha256,
        revision: output.revision,
      }),
  );
});
test("Production stdio MCP reads requests and proposes edits without execution authority", async (t) => {
  const f = await imported(t);
  const queued = (
    await f.request("/api/request", {
      prompt: "Add the title LOCAL AGENT for the first second.",
    })
  ).body;
  const client = rpc(f.root);
  t.after(() => client.child.kill());
  const listed = await client.call("tools/list", {});
  assert.equal(listed.result.tools.length, 39);
  assert.ok(!listed.result.tools.some((t) => /studio.*approv/.test(t.name)));
  const inbox = await client.call("tools/call", {
    name: "eme_studio_get_inbox",
    arguments: {},
  });
  const ctx = JSON.parse(inbox.result.content[0].text);
  assert.equal(ctx.requests[0].id, queued.id);
  const before = digest(f.server.project());
  const ops = [
    {
      type: "add_track",
      params: { id: "titles", name: "Titles", kind: "visual", zIndex: 10 },
    },
    {
      type: "insert_clip",
      params: {
        id: "agent-title",
        trackId: "titles",
        type: "text",
        startTick: 0,
        durationTicks: 120000,
        typography: { text: "LOCAL AGENT", fontSize: 40, color: "#ffffff" },
      },
    },
  ];
  const proposal = await client.call("tools/call", {
    name: "eme_studio_submit_plan",
    arguments: {
      requestId: queued.id,
      baseRevision: ctx.project.revision,
      summary: "Add LOCAL AGENT for the first second.",
      operations: ops,
    },
  });
  assert.ok(proposal.result);
  assert.equal(digest(f.server.project()), before);
  const denied = await f.request(
    "/api/approve",
    { id: f.server.state.proposal.id, digest: f.server.state.proposal.digest },
    { "X-EME-Review": f.server.agentToken },
  );
  assert.equal(denied.status, 403);
  assert.equal((await f.approve()).status, 200);
  assert.equal(
    f.server.project().clips.find((c) => c.id === "agent-title").typography
      .text,
    "LOCAL AGENT",
  );
  const retry = await client.call("tools/call", {
    name: "eme_studio_submit_plan",
    arguments: {
      requestId: queued.id,
      baseRevision: ctx.project.revision,
      summary: "Replay",
      operations: ops,
    },
  });
  assert.ok(retry.error);
});
test("Stale or rejected proposals cannot change the current project", async (t) => {
  const f = await imported(t);
  await f.request("/api/title", { text: "Rejected" });
  const proposal = f.server.state.proposal,
    before = digest(f.server.project());
  await f.request("/api/reject", { id: proposal.id });
  assert.equal(
    (
      await f.request("/api/approve", {
        id: proposal.id,
        digest: proposal.digest,
      })
    ).status,
    409,
  );
  assert.equal(digest(f.server.project()), before);
  await f.request("/api/title", { text: "Stale" });
  const changed = E.execute(f.server.project(), {
    type: "add_track",
    params: { id: "external", kind: "visual", zIndex: 50 },
  });
  assert.equal(changed.success, true);
  fs.writeFileSync(f.server.projectPath, JSON.stringify(changed.project));
  const stale = await f.approve();
  assert.equal(stale.status, 400);
  assert.equal(
    f.server.project().clips.some((c) => c.typography?.text === "Stale"),
    false,
  );
});
test("Project-duration edits are atomic and protect content outside the new bounds", async (t) => {
  const f = await imported(t),
    before = f.server.project();
  const invalid = E.execute(before, {
    type: "set_project_duration",
    params: { durationTicks: 120000 },
  });
  assert.equal(invalid.success, false);
  assert.equal(digest(before), digest(f.server.project()));
  const ops = before.clips.map((c) => ({
    type: "trim_clip",
    params: {
      clipId: c.id,
      newDurationTicks: 120000,
      trimInTick: 0,
      trimOutTick: 120000,
    },
  }));
  ops.push({ type: "set_project_duration", params: { durationTicks: 120000 } });
  const plan = operationPlan(before, ops);
  assert.equal(plan.target_duration_ticks, 120000);
  assert.throws(() =>
    operationPlan(before, [
      { type: "add_asset", params: { id: "missing", type: "video" } },
    ]),
  );
});
test("The Studio refuses arbitrary asset paths and unavailable billing; state survives restart", async (t) => {
  const f = await imported(t);
  assert.throws(
    () =>
      f.server.pending(
        [
          {
            type: "add_asset",
            params: { id: "external", src: "/etc/passwd", type: "video" },
          },
        ],
        { summary: "No" },
      ),
    /imported/,
  );
  assert.equal((await f.request("/api/billing")).status, 503);
  const persisted = JSON.parse(fs.readFileSync(f.server.statePath));
  assert.equal(persisted.media[0].id, f.media.id);
  const reload = new StudioServer({ root: f.root, port: 0 });
  assert.equal(reload.project().revision, f.server.project().revision);
  assert.equal(reload.state.media[0].sha256, f.media.sha256);
});
test("The generated twelve-second sample includes verified audio and exports successfully", async (t) => {
  const f = await setup(t);
  const response = await f.request("/api/demo", {});
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const media = response.body;
  assert.ok(media.audioAsset?.sha256);
  assert.ok(fs.statSync(media.audioAsset.path).size > 1000);
  const importResult = await f.request("/api/import", { mediaId: media.id });
  assert.equal(importResult.status, 200);
  assert.equal((await f.approve()).status, 200);
  await f.request("/api/title", { text: "DEMO VERIFIED" });
  await f.approve();
  await f.request("/api/render", {});
  const start = Date.now();
  while (f.server.busy && Date.now() - start < 60000)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    f.server.state.render.status,
    "SUCCEEDED",
    JSON.stringify(f.server.state.render),
  );
  assert.equal(f.server.state.outputs.at(-1).qa.passed, true);
});
