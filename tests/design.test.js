const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawn } = require("node:child_process");
const { StudioServer, run } = require("../src/studio/server.js");
const { importOperations } = require("../src/studio/plans.js");
const { digest } = require("../src/creative/execution-record.js");
const { NativeDelivery } = require("../src/prompt-core/native-delivery.js");
const { createDesignSet } = require("../src/design/planner.js");
const { catalog } = require("../src/design/catalog.js");
const T = 120000;
async function setup(t, media = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-design-test-"));
  const server = await new StudioServer({ port: 0, root }).start();
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = async (route, body, agent = false) => {
    const r = await fetch(server.origin + route, {
      method: body === undefined ? "GET" : "POST",
      headers: agent
        ? {
            Authorization: "Bearer " + server.agentToken,
            "Content-Type": "application/json",
          }
        : {
            Origin: server.origin,
            "X-EME-Review": server.csrf,
            "Content-Type": "application/json",
          },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  if (media) {
    const file = path.join(root, "fixture.mp4");
    await run("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=30:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=6:sample_rate=48000",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-shortest",
      file,
    ]);
    const m = await server.mediaFromFile(
      file,
      "Controlled test pattern with generated tone",
    );
    server.pending(importOperations(server.project(), m), {
      summary: "Import controlled fixture",
    });
    server.approve({
      id: server.state.proposal.id,
      digest: server.state.proposal.digest,
    });
  }
  const brief = {
    recipe: media ? "lower-third" : "title-card",
    title: "Made to move",
    eyebrow: "NEXT CHAPTER",
    body: "Clear ideas. Considered motion.",
    startTick: 0,
    durationTicks: 6 * T,
    ...(media
      ? {
          videoClipId: server.project().clips.find((c) => c.type === "video")
            .id,
        }
      : {}),
  };
  const plan = (b = brief) =>
    server.planDesign({ baseRevision: server.project().revision, brief: b });
  const propose = (set, candidate = set.candidates[0]) =>
    server.proposeDesign({
      baseRevision: set.baseRevision,
      setId: set.id,
      candidateId: candidate.id,
    });
  return { root, server, request, brief, plan, propose };
}
test("Engine produces distinct measured designs without mutation and preserves the brief", async (t) => {
  const f = await setup(t),
    before = digest(f.server.project());
  const set = f.plan();
  assert.equal(set.candidates.length, 3);
  assert.equal(digest(f.server.project()), before);
  assert.ok(!f.server.state.proposal);
  assert.equal(
    new Set(set.candidates.map((c) => c.report.graphicSha256)).size,
    3,
  );
  for (const c of set.candidates) {
    const words = c.report.layout.elements
      .find((e) => e.role === "title")
      .text.replace(/\s+/g, " ");
    assert.equal(words, f.brief.title);
    for (const e of c.report.layout.elements) {
      const b = e.bounds;
      assert.ok(b.x >= c.report.layout.marginPx && b.y >= 0);
      assert.ok(
        b.x + b.width <= 960 - c.report.layout.marginPx && b.y + b.height < 540,
      );
      assert.ok(e.fontSize >= c.report.layout.minimumFontPx);
    }
    assert.ok(c.report.timing.holdTicks >= c.report.timing.readingSeconds * T);
    const png = await fetch(f.server.origin + c.previewUrl);
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");
  }
});
test("Neobrutalist footage and portrait cards retain readable measured bounds and distinct editable variants", async (t) => {
  const f = await setup(t, true);
  for (const portrait of [false, true]) {
    const project = structuredClone(f.server.project());
    if (portrait)
      project.canvas = { ...project.canvas, width: 540, height: 960 };
    const brief = {
      ...f.brief,
      profiles: ["neobrutalism"],
      preferredProfile: "neobrutalism",
      variationMode: "parameters",
      variationAxes: ["titleScale", "spacingScale"],
    };
    if (portrait) {
      brief.recipe = "title-card";
      delete brief.videoClipId;
    }
    const set = createDesignSet({
      project,
      brief,
      outputDir: path.join(f.root, portrait ? "neo-card" : "neo-footage"),
    });
    assert.equal(set.candidates.length, 3);
    assert.equal(
      new Set(set.candidates.map((c) => c.report.graphicSha256)).size,
      3,
    );
    for (const c of set.candidates) {
      assert.equal(c.profileId, "neobrutalism");
      const b = c.report.layout.alphaBounds;
      assert.ok(
        b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.width <= project.canvas.width &&
          b.y + b.height <= project.canvas.height,
      );
      for (const e of c.report.layout.elements) {
        assert.ok(e.fontSize >= c.report.layout.minimumFontPx);
        assert.ok(e.bounds.x + e.bounds.width <= project.canvas.width);
        assert.ok(e.bounds.y + e.bounds.height <= project.canvas.height);
      }
    }
  }
});
test("Cards adapt to portrait canvas and reject content that cannot fit without truncation", async (t) => {
  const f = await setup(t),
    p = f.server.project();
  p.canvas = { ...p.canvas, width: 540, height: 960 };
  const make = (brief) =>
    createDesignSet({
      project: p,
      brief,
      outputDir: path.join(f.root, "portrait-" + Math.random()),
    });
  const set = make({
    ...f.brief,
    recipe: "statistic-card",
    value: "42%",
    title: "A meaningful improvement",
    profiles: ["editorial"],
  });
  assert.equal(
    set.candidates[0].report.layout.elements.find((e) => e.role === "value")
      .text,
    "42%",
  );
  assert.throws(
    () => make({ ...f.brief, title: "W".repeat(180), profiles: ["editorial"] }),
    /cannot fit/,
  );
});
test("Malformed timing, unsupported recipes and insufficient reading time fail before a proposal", async (t) => {
  const f = await setup(t);
  for (const patch of [
    { recipe: "__proto__" },
    { profiles: ["editorial", "editorial"] },
    { startTick: 1 },
    { durationTicks: 120000 },
    { title: "" },
    { title: "hello\u0000world" },
    { font: "/tmp/anything" },
    { recipe: "statistic-card" },
  ]) {
    assert.throws(() => f.plan({ ...f.brief, ...patch }), /ERR_DESIGN/);
    assert.ok(!f.server.state.proposal);
  }
});
test("Footage lower thirds reject unsupported mappings and existing overlays", async (t) => {
  const f = await setup(t, true);
  const p = f.server.project(),
    file = f.server.projectPath;
  const changed = structuredClone(p);
  changed.clips.find((c) => c.type === "video").transform = { rotation: 12 };
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(() => f.plan(), /static footage/);
  fs.writeFileSync(file, JSON.stringify(p));
  const set = f.plan();
  assert.match(set.candidates[0].report.warnings[0], /not checked/);
  const proposal = f.propose(set);
  f.server.approve({ id: proposal.id, digest: proposal.digest });
  assert.throws(() => f.plan(), /overlay/);
});
test("Stale candidates and altered graphic, preview or report bytes cannot be proposed", async (t) => {
  const f = await setup(t);
  for (const key of ["src", "preview", "report", "motion"]) {
    const set = f.plan(),
      stored = f.server.state.designSets.at(-1).candidates[0];
    const asset = stored.operations[0].params;
    const file = key === "src" ? asset.src : asset.metadata.design[key].path;
    fs.appendFileSync(file, "changed");
    const ranked = f.server.designView(f.server.state.designSets.at(-1));
    assert.equal(
      ranked.ranking.candidates.find((c) => c.candidateId === stored.id)
        .eligible,
      false,
    );
    assert.throws(() => f.propose(set), /changed/);
  }
  const set = f.plan(),
    p = f.server.project();
  p.revision++;
  fs.writeFileSync(f.server.projectPath, JSON.stringify(p));
  assert.throws(() => f.propose(set), /stale/);
});
test("Exact approval binds design bytes, and undo restores the original composition", async (t) => {
  const f = await setup(t),
    before = f.server.project(),
    set = f.plan();
  const proposal = f.propose(set);
  assert.equal(digest(f.server.project()), digest(before));
  const stored = f.server.state.designSets.at(-1).candidates[0],
    file = stored.glyphPath;
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, "changed");
  assert.throws(
    () => f.server.approve({ id: proposal.id, digest: proposal.digest }),
    /INTEGRITY|changed|checksum/i,
  );
  // A drifted approval is deliberately not reused. Test restoration in an independent workspace.
  fs.writeFileSync(file, original);
  const g = await setup(t),
    selected = g.plan(),
    pending = g.propose(selected);
  assert.equal(
    g.server.approve({ id: pending.id, digest: pending.digest }).success,
    true,
  );
  assert.equal(
    g.server.project().clips.filter((c) => c.type === "graphic").length,
    1,
  );
  const undo = g.server.historyProposal("undo");
  assert.equal(
    g.server.approve({ id: undo.id, digest: undo.digest }).success,
    true,
  );
  assert.equal(g.server.project().clips.length, 0);
});
test("IDE design tools use production stdio, remain proposal-only and enforce request ownership", async (t) => {
  const f = await setup(t, true);
  const queued = (
    await f.request("/api/request", { prompt: "Design an opening lower third" })
  ).body;
  const child = spawn(
    process.execPath,
    [path.resolve("bin/eme-studio-mcp.js")],
    {
      env: { ...process.env, EME_STUDIO_ROOT: f.root },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  t.after(() => child.kill());
  let buffer = "",
    sequence = 0;
  const pending = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"),
        line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line) {
        const msg = JSON.parse(line);
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      }
    }
  });
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => reject(Error("MCP timeout")), 15000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  const listed = await call("tools/list", {});
  assert.ok(
    listed.result.tools.some((x) => x.name === "eme_studio_plan_design"),
  );
  const response = await call("tools/call", {
    name: "eme_studio_plan_design",
    arguments: {
      requestId: queued.id,
      baseRevision: queued.revision,
      brief: { ...f.brief, profiles: ["balanced"] },
    },
  });
  const set = JSON.parse(response.result.content[0].text);
  assert.equal(set.candidates.length, 1);
  const ranked = await call("tools/call", {
    name: "eme_studio_rank_designs",
    arguments: { setId: set.id },
  });
  assert.equal(
    JSON.parse(ranked.result.content[0].text).ranking.recommendedCandidateId,
    set.candidates[0].id,
  );
  assert.ok(!f.server.state.proposal);
  const wrong = await f.request(
    "/api/agent/design/propose",
    {
      requestId: "absent",
      baseRevision: set.baseRevision,
      setId: set.id,
      candidateId: set.candidates[0].id,
    },
    true,
  );
  assert.equal(wrong.status, 409);
  const proposed = await call("tools/call", {
    name: "eme_studio_propose_design",
    arguments: {
      requestId: queued.id,
      baseRevision: set.baseRevision,
      setId: set.id,
      candidateId: set.candidates[0].id,
    },
  });
  assert.ok(JSON.parse(proposed.result.content[0].text).digest);
  assert.equal(
    f.server.project().clips.filter((c) => c.type === "graphic").length,
    0,
  );
  const denied = await f.request(
    "/api/approve",
    { id: f.server.state.proposal.id, digest: f.server.state.proposal.digest },
    true,
  );
  assert.equal(denied.status, 403);
});
test("Cross-origin design planning cannot create a candidate set", async (t) => {
  const f = await setup(t);
  const r = await fetch(f.server.origin + "/api/design/plan", {
    method: "POST",
    headers: {
      Origin: "https://example.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ brief: f.brief, baseRevision: 0 }),
  });
  assert.equal(r.status, 403);
  assert.equal(f.server.state.designSets, undefined);
  const info = catalog();
  info.profiles.editorial.foreground = "#000000";
  assert.notEqual(catalog().profiles.editorial.foreground, "#000000");
});
for (const recipe of ["lower-third", "statistic-card"])
  test(`${recipe}: native export passes QA and rendered hold matches the candidate`, async (t) => {
    const f = await setup(t, true);
    let brief = { ...f.brief, profiles: ["balanced"] };
    if (recipe === "statistic-card") {
      delete brief.videoClipId;
      brief = { ...brief, recipe, title: "More room for ideas", value: "42%" };
      const video = f.server.project().clips.find((c) => c.type === "video");
      const removal = f.server.pending(
        [{ type: "delete_clip", params: { clipId: video.id } }],
        {
          summary:
            "Create a standalone graphic with the existing tone soundtrack.",
        },
      );
      f.server.approve({ id: removal.id, digest: removal.digest });
    }
    const original = f.server.project(),
      set = f.plan(brief),
      proposal = f.propose(set);
    f.server.approve({ id: proposal.id, digest: proposal.digest });
    // Import media is unchanged across both kinds of design.
    for (const clip of original.clips)
      assert.deepEqual(
        f.server.project().clips.find((c) => c.id === clip.id),
        clip,
      );
    const delivery = new NativeDelivery({
      storageDir: path.join(f.root, "delivery"),
      approvalDir: f.server.approvals,
    }).run({
      executionId: f.server.state.executionId,
      outputDir: path.join(f.root, "exports"),
    });
    assert.equal(delivery.success, true, JSON.stringify(delivery));
    const rendered = path.join(f.root, "hold.png");
    const at = set.candidates[0].report.timing.entryTicks / T;
    await run("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(at),
      "-i",
      delivery.outputPath,
      "-frames:v",
      "1",
      rendered,
    ]);
    const candidate = f.server.state.designSets.at(-1).candidates[0];
    const diff = await run("python3", [
      "-c",
      "from PIL import Image,ImageChops,ImageStat; import sys; a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB'); print(sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3)",
      rendered,
      candidate.previewPath,
    ]);
    assert.ok(
      Number(diff) < 8,
      `Rendered preview mean pixel difference ${diff}`,
    );
    assert.equal(delivery.qa_metrics.passed, true);
    if (recipe === "statistic-card") {
      const first = path.join(f.root, "first.png"),
        last = path.join(f.root, "last.png");
      for (const [at, file] of [
        [0, first],
        [5.966667, last],
      ])
        await run("ffmpeg", [
          "-v",
          "error",
          "-ss",
          String(at),
          "-i",
          delivery.outputPath,
          "-frames:v",
          "1",
          file,
        ]);
      const levels = await run("python3", [
        "-c",
        "from PIL import Image,ImageStat,ImageChops; import sys; print(max(sum(ImageStat.Stat(ImageChops.difference(Image.open(p).convert('RGB'),Image.new('RGB', Image.open(p).size, sys.argv[1]))).mean)/3 for p in sys.argv[2:]))",
        f.server.project().canvas.backgroundColor,
        first,
        last,
      ]);
      assert.ok(
        Number(levels) < 3,
        `Entrance and exit should reach the sequence background, mean difference ${levels}`,
      );
    }
  });
