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

test("Direct browser commands commit linked edits and undo/redo without leaving a pending proposal", async t => {
  const f = await setup(t), p = f.server.project(), video = p.clips.find(c => c.type === 'video');
  const command = (command, body = {}) => f.post('editor/command', { command, baseRevision: f.server.project().revision, ...body });
  let r = await command('edit', { edit: { action: 'split', clipId: video.id, atTick: 120000, baseRevision: p.revision } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(f.server.project().clips.length, 4);
  assert.equal(f.server.state.proposal, null);
  assert.equal((await command('undo')).status, 200);
  assert.deepEqual(f.server.project().clips, p.clips);
  assert.equal((await command('redo')).status, 200);
  assert.equal(f.server.project().clips.length, 4);
  const clip = f.server.project().clips.find(c => c.type === 'video');
  assert.equal((await command('edit', { edit: { action: 'delete', clipId: clip.id, baseRevision: f.server.project().revision } })).status, 200);
  assert.equal(f.server.project().clips.length, 2);
  assert.equal(f.server.state.proposal, null);
});

test("Direct commands cannot approve agent proposals, use stale revisions or accept agent credentials", async t => {
  const f = await setup(t), p = f.server.project(), clip = p.clips[0];
  const body = { command: 'edit', baseRevision: p.revision, edit: { action: 'delete', clipId: clip.id, baseRevision: p.revision } };
  const before = digest(p);
  assert.equal((await f.post('editor/command', body, { 'X-EME-Review': f.server.agentToken })).status, 403);
  assert.equal((await f.post('editor/command', { ...body, baseRevision: -1 })).status, 409);
  assert.equal((await f.post('editor/command', { ...body, command: 'approve', operations: [] })).status, 400);
  assert.equal(digest(f.server.project()), before);
  await f.post('edit', { action: 'delete', clipId: clip.id, baseRevision: p.revision });
  const pending = f.server.state.proposal.id;
  assert.equal((await f.post('editor/command', body)).status, 409);
  assert.equal(f.server.state.proposal.id, pending);
  assert.equal(digest(f.server.project()), before);
});

test("Append extends a full sequence and Add text inserts at the playhead without overwriting titles", async t => {
  const f = await setup(t);
  const command = (command, body = {}) => f.post('editor/command', { command, baseRevision: f.server.project().revision, ...body });
  assert.equal((await command('import', { mediaId: f.media.id })).status, 200);
  assert.equal(f.server.project().timebase.durationTicks, 720000);
  assert.deepEqual(f.server.project().clips.filter(c => c.type === 'video').map(c => c.startTick), [0, 360000]);
  for (const text of ['First title', 'Second title']) {
    const result = await command('title', { text, startTick: 120000 });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
  const titles = f.server.project().clips.filter(c => c.type === 'text');
  assert.deepEqual(titles.map(c => c.typography.text), ['First title', 'Second title']);
  assert.ok(titles.every(c => c.startTick === 120000));
  assert.notEqual(titles[0].trackId, titles[1].trackId);
  const before = digest(f.server.project());
  assert.equal((await command('import', { mediaId: f.media.id, startTick: 120000 })).status, 400);
  assert.equal(digest(f.server.project()), before);
  assert.equal(f.server.state.proposal, null);
});

test("Direct track locks, mute and property edits use the validated engine and survive reload", async t => {
  const f = await setup(t), video = f.server.project().clips.find(c => c.type === 'video');
  const edit = body => f.post('editor/command', { command: 'edit', baseRevision: f.server.project().revision, edit: { baseRevision: f.server.project().revision, ...body } });
  assert.equal((await edit({ action: 'properties', clipId: video.id, transform: { x: 25, scaleX: 1.2 } })).status, 200);
  assert.equal(f.server.project().clips.find(c => c.id === video.id).transform.x, 25);
  assert.equal((await edit({ action: 'track', trackId: video.trackId, locked: true, muted: true })).status, 200);
  const before = digest(f.server.project());
  assert.equal((await edit({ action: 'delete', clipId: video.id })).status, 400);
  assert.equal(digest(f.server.project()), before);
  const disk = JSON.parse(fs.readFileSync(f.server.projectPath));
  assert.equal(disk.tracks.find(t => t.id === video.trackId).muted, true);
  assert.equal(f.server.state.proposal, null);
});
