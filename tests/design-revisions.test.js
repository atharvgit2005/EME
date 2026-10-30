const crypto = require("node:crypto");
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn } = require("node:child_process");
const { StudioServer, run } = require("../src/studio/server.js");
const { digest } = require("../src/creative/execution-record.js");
const { importOperations } = require("../src/studio/plans.js");
const { NativeDelivery } = require("../src/prompt-core/native-delivery.js");
async function setup(t, source = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-design-revision-"));
  const server = await new StudioServer({ root, port: 0 }).start();
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const apply = (p) => server.approve({ id: p.id, digest: p.digest });
  if (source) {
    const file = path.join(root, "source.mp4");
    await run("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=30:d=6",
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
    const media = await server.mediaFromFile(
      file,
      "Controlled generated blue shot and tone",
    );
    apply(
      server.pending(importOperations(server.project(), media), {
        summary: "Import controlled fixture",
      }),
    );
  }
  const brief = {
    recipe: source ? "lower-third" : "title-card",
    title: "Made to move",
    body: "Considered motion.",
    startTick: 0,
    durationTicks: 480000,
    profiles: ["balanced"],
    ...(source
      ? {
          videoClipId: server.project().clips.find((c) => c.type === "video")
            .id,
        }
      : {}),
  };
  const plan = (b = brief) =>
    server.planDesign({ baseRevision: server.project().revision, brief: b });
  const choose = (s, c = s.candidates[0]) =>
    server.proposeDesign({
      baseRevision: s.baseRevision,
      setId: s.id,
      candidateId: c.id,
    });
  const post = async (route, body, agent = false) => {
    const r = await fetch(server.origin + route, {
      method: "POST",
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
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  return { root, server, brief, plan, choose, apply, post };
}
test("Within-style candidates vary requested parameters and retain exact content", async (t) => {
  const f = await setup(t),
    before = digest(f.server.project());
  const set = f.plan({
    ...f.brief,
    variationMode: "parameters",
    variationAxes: ["titleScale", "motionScale"],
  });
  assert.equal(set.candidates.length, 3);
  assert.equal(new Set(set.candidates.map((c) => c.profileId)).size, 1);
  const [base, type, motion] = set.candidates;
  assert.ok(
    type.report.measurements.titleFontPx > base.report.measurements.titleFontPx,
  );
  assert.ok(
    motion.report.measurements.travel < base.report.measurements.travel,
  );
  assert.equal(type.report.parameters.spacingScale, 1);
  assert.equal(motion.report.parameters.titleScale, 1);
  assert.equal(digest(f.server.project()), before);
  assert.ok(!f.server.state.proposal);
  const image = await fetch(f.server.origin + motion.motionPreviewUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  const c = f.server.state.designSets.at(-1).candidates[2];
  const frames = await run("python3", [
    "-c",
    "from PIL import Image; import sys; im=Image.open(sys.argv[1]); print(im.n_frames)",
    c.motionPath,
  ]);
  assert.ok(Number(frames) > 1);
});
test("Larger title plus less motion preserves style, unchanged content and other clips through undo/redo", async (t) => {
  const f = await setup(t),
    base = f.plan();
  f.apply(f.choose(base));
  const original = f.server.project(),
    clip = original.clips.find((c) => c.type === "graphic"),
    definition = f.server.designComponent(clip.id);
  const extra = f.server.pending(
    [
      {
        type: "add_track",
        params: {
          id: "other",
          name: "Unrelated title",
          kind: "visual",
          zIndex: 0,
        },
      },
      {
        type: "insert_clip",
        params: {
          id: "other-title",
          type: "text",
          trackId: "other",
          startTick: 960000,
          durationTicks: 240000,
          typography: { text: "Keep me", fontSize: 40, color: "#ffffff" },
        },
      },
    ],
    { summary: "Add unrelated content" },
  );
  f.apply(extra);
  const before = f.server.project();
  const revised = f.server.reviseDesign({
    baseRevision: before.revision,
    clipId: clip.id,
    changes: { adjustments: { typography: "larger", motion: "less" } },
  });
  assert.equal(revised.candidates.length, 3);
  for (const c of revised.candidates) {
    assert.equal(c.profileId, "balanced");
    assert.equal(
      c.report.parameters.spacingScale,
      definition.parameters.spacingScale,
    );
    assert.equal(
      c.report.parameters.holdScale,
      definition.parameters.holdScale,
    );
    assert.ok(
      c.report.measurements.titleFontPx > definition.measurements.titleFontPx,
    );
    assert.ok(c.report.measurements.travel < definition.measurements.travel);
  }
  assert.equal(digest(f.server.project()), digest(before));
  f.apply(f.choose(revised));
  const after = f.server.project(),
    edited = after.clips.find((c) => c.id === clip.id);
  assert.equal(edited.trackId, clip.trackId);
  assert.equal(after.clips.filter((c) => c.type === "graphic").length, 1);
  assert.deepEqual(
    after.clips.find((c) => c.id === "other-title"),
    before.clips.find((c) => c.id === "other-title"),
  );
  assert.deepEqual(
    after.animations.filter((a) => a.clipId !== clip.id),
    before.animations.filter((a) => a.clipId !== clip.id),
  );
  const next = f.server.designComponent(clip.id);
  assert.equal(next.componentId, definition.componentId);
  assert.equal(next.baseBrief.body, definition.baseBrief.body);
  f.apply(f.server.historyProposal("undo"));
  assert.deepEqual(f.server.project().clips, before.clips);
  f.apply(f.server.historyProposal("redo"));
  assert.equal(f.server.designComponent(clip.id).parameters.titleScale, 1.15);
  const restarted = new StudioServer({ root: f.root });
  assert.equal(restarted.designComponent(clip.id).parameters.motionScale, 0.7);
});
test("Text, spacing and hold revisions are measured; unchanged dimensions remain fixed", async (t) => {
  const f = await setup(t),
    set = f.plan();
  f.apply(f.choose(set));
  const id = f.server.project().clips[0].id,
    base = f.server.designComponent(id);
  for (const adjustments of [
    { spacing: "more" },
    { spacing: "less" },
    { hold: "longer" },
    { hold: "shorter" },
  ]) {
    const next = f.server.reviseDesign({
      baseRevision: f.server.project().revision,
      clipId: id,
      changes: { adjustments },
      explore: false,
    }).candidates[0];
    if (adjustments.spacing)
      assert.ok(
        (next.report.measurements.gapPx - base.measurements.gapPx) *
          (adjustments.spacing === "more" ? 1 : -1) >
          0,
      );
    if (adjustments.hold)
      assert.ok(
        (next.report.measurements.holdTicks - base.measurements.holdTicks) *
          (adjustments.hold === "longer" ? 1 : -1) >
          0,
      );
    assert.equal(next.report.parameters.titleScale, 1);
    assert.equal(next.report.parameters.motionScale, 1);
  }
  const content = f.server.reviseDesign({
    baseRevision: f.server.project().revision,
    clipId: id,
    changes: { title: "A new chapter" },
  });
  assert.equal(content.candidates.length, 1);
  f.apply(f.choose(content));
  assert.equal(f.server.designComponent(id).baseBrief.title, "A new chapter");
  assert.equal(
    f.server.designComponent(id).baseBrief.body,
    "Considered motion.",
  );
});
test("Bounds, unreadable holds, locked or externally changed components fail without mutation", async (t) => {
  const f = await setup(t),
    set = f.plan();
  f.apply(f.choose(set));
  const p = f.server.project(),
    id = p.clips[0].id;
  for (const changes of [
    { parameters: { titleScale: 2 } },
    { adjustments: { motion: "random" } },
    { parameters: { motionScale: 0 }, adjustments: { motion: "less" } },
    { durationTicks: 8000 },
  ])
    assert.throws(
      () =>
        f.server.reviseDesign({
          baseRevision: p.revision,
          clipId: id,
          changes,
        }),
      /ERR_DESIGN/,
    );
  assert.equal(digest(f.server.project()), digest(p));
  p.tracks[0].locked = true;
  fs.writeFileSync(f.server.projectPath, JSON.stringify(p));
  assert.throws(() => f.server.designComponent(id), /Unlock/);
  p.tracks[0].locked = false;
  p.clips[0].transform = { x: 20 };
  fs.writeFileSync(f.server.projectPath, JSON.stringify(p));
  assert.throws(() => f.server.designComponent(id), /outside/);
});
test("Extending a component cannot silently cover another overlay or exceed the sequence", async (t) => {
  const f = await setup(t),
    set = f.plan();
  f.apply(f.choose(set));
  const id = f.server.project().clips[0].id;
  f.apply(
    f.server.pending(
      [
        {
          type: "add_track",
          params: { id: "next", name: "Next", kind: "visual", zIndex: 3 },
        },
        {
          type: "insert_clip",
          params: {
            id: "next-title",
            trackId: "next",
            type: "text",
            startTick: 480000,
            durationTicks: 480000,
            typography: {
              text: "Following title",
              fontSize: 30,
              color: "#ffffff",
            },
          },
        },
      ],
      { summary: "Following overlay" },
    ),
  );
  const before = digest(f.server.project());
  assert.throws(
    () =>
      f.server.reviseDesign({
        baseRevision: f.server.project().revision,
        clipId: id,
        changes: { adjustments: { hold: "longer" } },
      }),
    /overlay/,
  );
  assert.equal(digest(f.server.project()), before);
});
test("Legacy components migrate only with their matching original operations", async (t) => {
  const f = await setup(t),
    set = f.plan();
  f.apply(f.choose(set));
  const p = f.server.project(),
    a = p.assets.find((a) => a.type === "image");
  delete a.metadata.design.component;
  fs.writeFileSync(f.server.projectPath, JSON.stringify(p));
  assert.equal(f.server.designComponent(p.clips[0].id).profileId, "balanced");
  f.server.state.designSets = [];
  assert.throws(() => f.server.designComponent(p.clips[0].id), /original plan/);
});
test("Production IDE tools read and revise components, with stale/request and review boundaries", async (t) => {
  const f = await setup(t),
    set = f.plan();
  f.apply(f.choose(set));
  const id = f.server.project().clips[0].id;
  const queued = (
    await f.post("/api/request", {
      prompt: "Keep Balanced, make the title larger and reduce motion.",
    })
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
  let n = 0,
    buffer = "";
  const waiting = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"),
        line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line) {
        const m = JSON.parse(line);
        waiting.get(m.id)?.(m);
        waiting.delete(m.id);
      }
    }
  });
  const rpc = (name, args) =>
    new Promise((resolve, reject) => {
      const req = ++n,
        timer = setTimeout(() => reject(Error("MCP timeout")), 20000);
      waiting.set(req, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req,
          method: "tools/call",
          params: { name, arguments: args },
        }) + "\n",
      );
    });
  const read = await rpc("eme_studio_get_design_component", { clipId: id });
  assert.equal(JSON.parse(read.result.content[0].text).profileId, "balanced");
  const before = digest(f.server.project());
  const response = await rpc("eme_studio_revise_design", {
    requestId: queued.id,
    baseRevision: queued.revision,
    clipId: id,
    changes: { adjustments: { typography: "larger", motion: "less" } },
  });
  const revised = JSON.parse(response.result.content[0].text);
  assert.equal(revised.candidates.length, 3);
  assert.equal(digest(f.server.project()), before);
  assert.ok(!f.server.state.proposal);
  const wrong = await f.post(
    "/api/agent/design/revise",
    {
      requestId: "absent",
      baseRevision: queued.revision,
      clipId: id,
      changes: { title: "Wrong" },
    },
    true,
  );
  assert.equal(wrong.status, 409);
  const proposal = await rpc("eme_studio_propose_design", {
    requestId: queued.id,
    baseRevision: queued.revision,
    setId: revised.id,
    candidateId: revised.candidates[0].id,
  });
  assert.ok(JSON.parse(proposal.result.content[0].text).digest);
  assert.equal(
    (
      await f.post(
        "/api/approve",
        {
          id: f.server.state.proposal.id,
          digest: f.server.state.proposal.digest,
        },
        true,
      )
    ).status,
    403,
  );
  f.apply(f.server.state.proposal);
  assert.ok(f.server.designComponent(id).parameters.titleScale > 1);
});
test("Native export of a revised footage component matches its measured preview and retains audio", async (t) => {
  const f = await setup(t, true),
    base = f.plan();
  f.apply(f.choose(base));
  const original = f.server.project(),
    id = original.clips.find((c) => c.type === "graphic").id;
  const revised = f.server.reviseDesign({
    baseRevision: original.revision,
    clipId: id,
    changes: { adjustments: { typography: "larger", motion: "less" } },
  });
  f.apply(f.choose(revised));
  const p = f.server.project();
  for (const c of original.clips.filter((c) => c.id !== id))
    assert.deepEqual(
      p.clips.find((x) => x.id === c.id),
      c,
    );
  const result = new NativeDelivery({
    storageDir: path.join(f.root, "delivery"),
    approvalDir: f.server.approvals,
  }).run({
    executionId: f.server.state.executionId,
    outputDir: path.join(f.root, "exports"),
  });
  assert.equal(result.success, true, JSON.stringify(result));
  const frame = path.join(f.root, "hold.png"),
    candidate = f.server.state.designSets.at(-1).candidates[0];
  await run("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(candidate.report.timing.entryTicks / 120000),
    "-i",
    result.outputPath,
    "-frames:v",
    "1",
    frame,
  ]);
  const diff = await run("python3", [
    "-c",
    "from PIL import Image,ImageChops,ImageStat; import sys; print(sum(ImageStat.Stat(ImageChops.difference(Image.open(sys.argv[1]).convert('RGB'),Image.open(sys.argv[2]).convert('RGB'))).mean)/3)",
    frame,
    candidate.previewPath,
  ]);
  assert.ok(Number(diff) < 8, diff);
  assert.equal(result.qa_metrics.passed, true);
});

test("Preferences learn title-size parameters within one style without penalizing unchanged dimensions", async (t) => {
  const f = await setup(t),
    before = digest(f.server.project());
  for (let i = 0; i < 8; i++) {
    const set = f.plan({
      ...f.brief,
      title: "Parameter decision " + i,
      variationMode: "parameters",
      variationAxes: ["titleScale", "spacingScale"],
    });
    const large = set.candidates.find(
        (c) => c.report.variantId === "titleScale",
      ),
      base = set.candidates.find((c) => c.report.variantId === "requested");
    f.server.designFeedback.submit({
      submissionId: crypto.randomUUID(),
      setId: set.id,
      preferredCandidateId: large.id,
      comparedCandidateIds: [base.id],
      reasons: ["typography"],
      note: "Controlled parameter-learning fixture",
    });
  }
  const unseen = f.plan({
    ...f.brief,
    title: "An unseen design",
    variationMode: "parameters",
    variationAxes: ["titleScale", "spacingScale"],
  });
  const chosen = unseen.candidates.find(
      (c) => c.id === unseen.ranking.recommendedCandidateId,
    ),
    row = unseen.ranking.candidates[0];
  assert.equal(chosen.report.variantId, "titleScale");
  assert.equal(row.profileWeight, 0);
  assert.ok(row.parameterWeight > 0);
  assert.equal(row.parameterEvidence.titleScale.weightedWins, 8);
  assert.equal(row.parameterEvidence.motionScale.observations, 0);
  assert.equal(row.parameterEvidence.spacingScale.observations, 0);
  assert.equal(digest(f.server.project()), before);
});

test("Motion preferences require explicit review of bound proxies on both compared designs", async (t) => {
  const f = await setup(t),
    set = f.plan({
      ...f.brief,
      variationMode: "parameters",
      variationAxes: ["motionScale"],
    });
  const base = set.candidates.find((c) => c.report.variantId === "requested"),
    quiet = set.candidates.find((c) => c.report.variantId === "motionScale");
  const body = {
    setId: set.id,
    preferredCandidateId: quiet.id,
    comparedCandidateIds: [base.id],
    reasons: ["motion"],
    note: "Controlled proxy-review fixture",
  };
  f.server.designFeedback.submit({
    ...body,
    submissionId: crypto.randomUUID(),
  });
  let rank = f.server.designView(f.server.state.designSets.at(-1)).ranking;
  assert.equal(
    rank.candidates.find((r) => r.candidateId === quiet.id).parameterEvidence
      .motionScale.observations,
    0,
  );
  f.server.designFeedback.submit({
    ...body,
    submissionId: crypto.randomUUID(),
    motionReviewedCandidateIds: [quiet.id, base.id],
  });
  rank = f.server.designView(f.server.state.designSets.at(-1)).ranking;
  assert.equal(
    rank.candidates.find((r) => r.candidateId === quiet.id).parameterEvidence
      .motionScale.weightedWins,
    1,
  );
  assert.equal(f.server.designFeedback.history().activeCount, 1);
  assert.equal(
    f.server.designFeedback.export().samples[0].motionReviewedCandidateIds
      .length,
    2,
  );
});

test("A title that cannot actually grow is refused rather than labelled larger", async (t) => {
  const f = await setup(t),
    set = f.plan({ ...f.brief, title: "W".repeat(36), body: "" });
  f.apply(f.choose(set));
  const before = digest(f.server.project()),
    id = f.server.project().clips[0].id;
  assert.throws(
    () =>
      f.server.reviseDesign({
        baseRevision: f.server.project().revision,
        clipId: id,
        changes: { adjustments: { typography: "larger" } },
      }),
    /cannot be measured/,
  );
  assert.equal(digest(f.server.project()), before);
});
