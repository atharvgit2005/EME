const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { StudioServer, run } = require("../src/studio/server.js");
const { digest } = require("../src/creative/execution-record.js");
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-editor-http-")),
    server = await new StudioServer({ root, port: 0 }).start();
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const html = await (await fetch(server.origin)).text(),
    token = /name="eme-review" content="([a-f0-9]+)"/.exec(html)[1];
  const headers = {
    Origin: server.origin,
    "X-EME-Review": token,
    "Content-Type": "application/json",
  };
  const post = async (route, body, override = {}) => {
    const r = await fetch(server.origin + "/api/" + route, {
      method: "POST",
      headers: { ...headers, ...override },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const approve = () =>
    post("approve", {
      id: server.state.proposal.id,
      digest: server.state.proposal.digest,
    });
  const source = path.join(root, "source.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x180:r=30:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=330:sample_rate=48000:duration=3",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-t",
    "3",
    source,
  ]);
  const upload = await fetch(
    server.origin + "/api/upload?name=editor-test.mp4",
    {
      method: "POST",
      headers: { Origin: server.origin, "X-EME-Review": token },
      body: fs.readFileSync(source),
    },
  );
  assert.equal(upload.status, 201);
  const media = await upload.json();
  await post("import", { mediaId: media.id });
  assert.equal((await approve()).status, 200);
  return { root, server, post, approve, media, html };
}
test("Editing workspace serves all modules, real waveform and range-bound extracted source audio", async (t) => {
  const f = await setup(t);
  for (const id of [
    "timeline-scroll",
    "track-headers",
    "inspector-panel",
    "timeline-zoom",
    "snap-toggle",
    "sequence-dialog",
  ])
    assert.ok(f.html.includes('id="' + id + '"'));
  for (const route of [
    "app.js",
    "timeline.js",
    "inspector.js",
    "playback.js",
    "scene.js",
    "style.css",
  ]) {
    const r = await fetch(f.server.origin + "/" + route);
    assert.equal(r.status, 200, route);
    assert.ok((await r.text()).length > 100);
  }
  const audio = await fetch(
    f.server.origin + "/api/media/" + f.media.audioAsset.id,
    { headers: { Range: "bytes=0-31" } },
  );
  assert.equal(audio.status, 206);
  assert.equal(audio.headers.get("content-type"), "audio/wav");
  assert.equal((await audio.arrayBuffer()).byteLength, 32);
  const r = await fetch(
      f.server.origin + "/api/waveform/" + f.media.audioAsset.id,
    ),
    w = await r.json();
  assert.equal(r.status, 200);
  assert.equal(w.available, true);
  assert.ok(w.peaks.length >= 60);
  assert.equal(w.sourceSha256, f.media.audioAsset.sha256);
  assert.ok(w.peaks.some((x) => x > 0));
  assert.equal(
    (await fetch(f.server.origin + "/api/waveform/arbitrary-path")).status,
    404,
  );
});
test("Timeline gestures create immutable review proposals, apply linked trims/splits, then undo exactly", async (t) => {
  const f = await setup(t),
    p = f.server.project(),
    video = p.clips.find((c) => c.type === "video"),
    before = digest(p);
  let r = await f.post("edit", {
    action: "trim_start",
    clipId: video.id,
    startTick: 120000,
    baseRevision: p.revision,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.operations.length, 2);
  assert.equal(digest(f.server.project()), before);
  assert.equal((await f.approve()).status, 200);
  let clips = f.server.project().clips;
  assert.ok(
    clips.every(
      (c) =>
        c.startTick === 120000 &&
        c.source.trimInTick === 120000 &&
        c.durationTicks === 240000,
    ),
  );
  r = await f.post("edit", {
    action: "split",
    clipId: video.id,
    atTick: 240000,
    baseRevision: f.server.project().revision,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await f.approve()).status, 200);
  assert.equal(f.server.project().clips.length, 4);
  await f.post("undo", {});
  assert.equal((await f.approve()).status, 200);
  assert.equal(f.server.project().clips.length, 2);
  r = await f.post("edit", {
    action: "move",
    clipId: video.id,
    startTick: 0,
    baseRevision: p.revision,
  });
  assert.equal(r.status, 409);
});
test("Browser authority, pending edits and track locks protect direct timeline actions", async (t) => {
  const f = await setup(t),
    p = f.server.project(),
    clip = p.clips.find((c) => c.type === "video"),
    before = digest(p),
    args = { action: "delete", clipId: clip.id, baseRevision: p.revision };
  assert.equal(
    (await f.post("edit", args, { "X-EME-Review": f.server.agentToken }))
      .status,
    403,
  );
  assert.equal(digest(f.server.project()), before);
  assert.equal(
    (
      await f.post("edit", {
        action: "track",
        trackId: clip.trackId,
        locked: true,
        baseRevision: p.revision,
      })
    ).status,
    200,
  );
  assert.equal((await f.post("edit", args)).status, 409);
  assert.equal((await f.approve()).status, 200);
  const failed = await f.post("edit", {
    ...args,
    baseRevision: f.server.project().revision,
  });
  assert.equal(failed.status, 400);
  assert.match(failed.body.error, /Unlock/);
});
