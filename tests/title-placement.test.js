const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { StudioServer, run } = require("../src/studio/server.js");
const { importOperations } = require("../src/studio/plans.js");
const { sealScene } = require("../src/scene/contract.js");
const { digest } = require("../src/creative/execution-record.js");
const { fileHash } = require("../src/scene/service.js");
const {
  mappedEvidence,
  verifySubjectTitle,
} = require("../src/scene/title-placement.js");
const {
  CanonicalNativeAdapter,
} = require("../src/renderers/canonical-native.js");

// Test-only model-contract documents: these do not assert that a model ran.
// The separate M3 acceptance uses actual worker-produced scene evidence.
function document(media, { lost = -1, full = false } = {}) {
  const sha = "a".repeat(64),
    artifacts = [],
    frames = [];
  const bounds = full
    ? { x: 0, y: 0, width: 320, height: 180 }
    : { x: 180, y: 20, width: 120, height: 140 };
  for (let i = 0; i < 60; i++) {
    const binding = {
      sha256: sha,
      kind: "binary_mask",
      mimeType: "image/png",
      width: 320,
      height: 180,
      frameIndex: i,
    };
    const a = { ...binding, id: digest(binding) };
    artifacts.push(a);
    frames.push({
      frameIndex: i,
      sourcePts: String(i),
      tick: i * 4000,
      endTick: (i + 1) * 4000,
      shotId: "test-shot",
      visibility: i === lost ? "lost" : "visible",
      observed:
        i === lost
          ? null
          : {
              bounds,
              maskId: a.id,
              method: "anchor_segmentation",
              modelScore: 0.8,
            },
      predictedBounds: i === lost ? bounds : null,
      camera: { valid: false, dx: 0, dy: 0, inlierRatio: 0 },
      diagnostics: i === lost ? ["test-loss"] : [],
    });
  }
  return sealScene({
    schemaVersion: "eme-scene.v1",
    confidenceConvention: "provider_raw_uncalibrated",
    requestFingerprint: sha,
    source: {
      assetId: media.id,
      sha256: media.sha256,
      width: 320,
      height: 180,
      ticksPerSecond: 120000,
      timeBase: "1/30",
      ptsOrigin: "0",
      startTick: 0,
      endTick: 240000,
    },
    producer: {
      name: "eme-anchored-mobilesam",
      version: "unit-test-contract-only",
      origin: "model",
      device: "cpu",
      weightsSha256: sha,
      codeSha256: sha,
      dependencies: {
        torch: "test",
        opencv: "test",
        numpy: "test",
        timm: "test",
      },
    },
    selection: {
      trackId: "subject-1",
      label: "Test region",
      labelOrigin: "user_hint",
      bounds,
    },
    proxy: { width: 320, height: 180, scaleX: 1, scaleY: 1 },
    capabilities: {
      subjectTracking: "available",
      binarySegmentation: "available",
      softMatting: "unavailable",
      depth: "unavailable",
      surfaceNormals: "unavailable",
      gaze: "unavailable",
    },
    frames,
    artifacts,
    metrics: {
      elapsedMs: 0,
      frameCount: 60,
      segmentationFrames: lost >= 0 ? 59 : 60,
      flowFrames: 0,
      unobservedFrames: lost >= 0 ? 1 : 0,
      peakRssMb: 0,
      mpsAllocatedMb: 0,
    },
  });
}
async function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-title-test-"));
  const server = await new StudioServer({ root, port: 0 }).start();
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const source = path.join(root, "source.mp4");
  await run("ffmpeg", [
    "-nostdin",
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
    source,
  ]);
  const html = await (await fetch(server.origin)).text();
  const token = /name="eme-review" content="([a-f0-9]+)"/.exec(html)[1];
  const request = async (route, body, agent = false) => {
    const r = await fetch(server.origin + route, {
      method: "POST",
      headers: agent
        ? {
            Authorization: "Bearer " + server.agentToken,
            "Content-Type": "application/json",
          }
        : {
            Origin: server.origin,
            "X-EME-Review": token,
            "Content-Type": "application/json",
          },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const u = await fetch(server.origin + "/api/upload?name=test.mp4", {
    method: "POST",
    headers: { Origin: server.origin, "X-EME-Review": token },
    body: fs.readFileSync(source),
  });
  assert.equal(u.status, 201);
  const media = await u.json();
  server.pending(importOperations(server.project(), media), {
    summary: "Import test video",
  });
  server.approve({
    id: server.state.proposal.id,
    digest: server.state.proposal.digest,
  });
  const doc = document(media, options);
  const dir = path.join(root, "scene", "analyses", doc.analysisId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(doc));
  server.state.sceneAnalyses.push({
    analysisId: doc.analysisId,
    mediaId: media.id,
  });
  server.save();
  const body = {
    analysisId: doc.analysisId,
    videoClipId: server.project().clips.find((c) => c.type === "video").id,
    text: "NEXT\nMOVE",
    fontSize: 28,
    startTick: 0,
    durationTicks: 240000,
  };
  return { root, server, media, doc, body, request };
}
test("Source intervals map through trims and noncentral crop using actual half-open frame coverage", async (t) => {
  const f = await setup(t),
    p = f.server.project(),
    v = p.clips.find((c) => c.type === "video");
  v.startTick = 8000;
  v.durationTicks = 6000;
  v.source.trimInTick = 4000;
  v.source.trimOutTick = 10000;
  v.properties.reframing.crop_rect = { x: 40, y: 0, width: 240, height: 135 };
  const m = mappedEvidence(p, f.doc, v.id, 8000, 6000);
  assert.equal(m.sourceStart, 4000);
  assert.equal(m.sourceEnd, 10000);
  assert.deepEqual(
    m.frames.map((r) => [r.frameIndex, r.tick, r.endTick]),
    [
      [1, 8000, 12000],
      [2, 12000, 14000],
    ],
  );
  assert.deepEqual(m.frames[0].observations[0].bounds, {
    x: 560,
    y: 80,
    width: 400,
    height: 460,
  });
  v.transform = { rotation: 5 };
  assert.throws(() => mappedEvidence(p, f.doc, v.id, 8000, 6000), /static/);
});
test("Tracking loss blocks a proposal without substituting predicted bounds or changing the project", async (t) => {
  const f = await setup(t, { lost: 25 }),
    before = digest(f.server.project());
  const r = await f.request("/api/scene/title", f.body);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Tracking is missing/);
  assert.equal(digest(f.server.project()), before);
  assert.equal(f.server.state.proposal, null);
  // A half-open title ending before the missing frame remains usable.
  const short = await f.request("/api/scene/title", {
    ...f.body,
    durationTicks: 100000,
  });
  assert.equal(short.status, 200, JSON.stringify(short.body));
  assert.equal(short.body.planning.tracked_intervals, 25);
});
test("Infeasible placement never relaxes the safety policy", async (t) => {
  const f = await setup(t, { full: true }),
    before = digest(f.server.project());
  const r = await f.request("/api/scene/title", f.body);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /No room/);
  assert.equal(digest(f.server.project()), before);
});
test("Agent title proposals require a current request and browser review; previews bind exact glyph and scene bytes", async (t) => {
  const f = await setup(t),
    before = digest(f.server.project());
  const q = await f.request("/api/request", {
    prompt: "Place NEXT MOVE clear of the selected region.",
  });
  const args = {
    ...f.body,
    requestId: q.body.id,
    baseRevision: f.server.project().revision,
  };
  assert.equal(
    (
      await f.request(
        "/api/agent/title",
        { ...args, baseRevision: args.baseRevision - 1 },
        true,
      )
    ).status,
    409,
  );
  const r = await f.request("/api/agent/title", args, true);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(digest(f.server.project()), before);
  assert.equal(f.server.state.requests.at(-1).status, "PROPOSED");
  assert.equal(
    (
      await f.request(
        "/api/approve",
        { id: r.body.id, digest: r.body.digest },
        true,
      )
    ).status,
    403,
  );
  const preview = await fetch(
    f.server.origin + "/api/title-preview/" + r.body.planning.previewId,
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/png");
  const glyph =
    r.body.operations.at(-1).params.properties.subject_safe.glyphPreview.path;
  fs.appendFileSync(glyph, "changed");
  const stale = await f.request("/api/approve", {
    id: r.body.id,
    digest: r.body.digest,
  });
  assert.equal(stale.status, 400);
  assert.equal(digest(f.server.project()), before);
});
test("Native delivery rechecks every interval and retains scene/font bindings after unrelated edits", async (t) => {
  const f = await setup(t),
    r = await f.request("/api/scene/title", f.body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(
    (await f.request("/api/approve", { id: r.body.id, digest: r.body.digest }))
      .status,
    200,
  );
  const p = f.server.project(),
    c = p.clips.find((c) => c.type === "text");
  const report = verifySubjectTitle({
    project: p,
    clip: c,
    doc: f.doc,
    bounds: c.properties.subject_safe.localBounds,
  });
  assert.equal(report.tracked_intervals, 60);
  assert.equal(report.collisions, 0);
  const moved = structuredClone(p);
  moved.clips.find((v) => v.id === c.id).transform.x = 100;
  assert.throws(
    () =>
      verifySubjectTitle({
        project: moved,
        clip: moved.clips.find((v) => v.id === c.id),
        doc: f.doc,
        bounds: c.properties.subject_safe.localBounds,
      }),
    /overlaps/,
  );
  const cropped = structuredClone(p);
  cropped.clips.find((v) => v.type === "video").properties.reframing.crop_rect
    .x++;
  assert.throws(
    () =>
      verifySubjectTitle({
        project: cropped,
        clip: c,
        doc: f.doc,
        bounds: c.properties.subject_safe.localBounds,
      }),
    /changed/,
  );
  const title = structuredClone(c);
  title.durationTicks++;
  assert.throws(
    () =>
      verifySubjectTitle({
        project: p,
        clip: title,
        doc: f.doc,
        bounds: c.properties.subject_safe.localBounds,
      }),
    /inside/,
  );
  // A later audio edit must bind the existing title's dependencies again.
  const audio = p.clips.find((c) => c.type === "audio");
  f.server.pending(
    [
      {
        type: "modify_clip",
        params: { clipId: audio.id, audio: { volume: 0.5 } },
      },
    ],
    { summary: "Adjust audio" },
  );
  f.server.approve({
    id: f.server.state.proposal.id,
    digest: f.server.state.proposal.digest,
  });
  await f.request("/api/render", {});
  const deadline = Date.now() + 60000;
  while (f.server.busy && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    f.server.state.render.status,
    "SUCCEEDED",
    JSON.stringify(f.server.state.render),
  );
  const output = f.server.state.outputs.at(-1),
    manifest = JSON.parse(fs.readFileSync(output.manifestPath));
  assert.equal(output.qa.passed, true);
  assert.equal(fileHash(output.path), output.sha256);
  assert.equal(manifest.provenance.subject_titles[0].tracked_intervals, 60);
  assert.equal(
    manifest.provenance.subject_titles[0].analysis_id,
    f.doc.analysisId,
  );
  // Measure the backing in decoded pixels, independently of scene/solver geometry.
  const decoded = spawnSync(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-ss",
      "0.5",
      "-i",
      output.path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 8e6 },
  );
  assert.equal(decoded.status, 0, String(decoded.stderr));
  const w = p.canvas.width,
    h = p.canvas.height,
    pixels = decoded.stdout;
  assert.equal(pixels.length, w * h * 3);
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (pixels[i] < 50 && pixels[i + 1] < 50 && pixels[i + 2] < 50) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  const expected = report.bounds;
  for (const [actual, wanted] of [
    [minX, expected.x],
    [minY, expected.y],
    [maxX + 1, expected.x + expected.width],
    [maxY + 1, expected.y + expected.height],
  ])
    assert.ok(
      Math.abs(actual - wanted) <= 2,
      `Decoded backing ${actual} differs from measured placement ${wanted}`,
    );
  // The actual native adapter rejects a newly sealed but colliding title too.
  const bad = f.server.project();
  bad.clips.find((v) => v.id === c.id).transform.x = 100;
  const paths = [];
  function bind(v) {
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "path" && typeof x === "string") paths.push(x);
      else bind(x);
    }
  }
  bind(bad.clips);
  const assets = [
    ...bad.assets.map((a) => ({
      asset_id: a.id,
      source_path: a.src,
      real_path: fs.realpathSync(a.src),
      sha256: fileHash(a.src),
    })),
    ...paths.map((p, i) => ({
      asset_id: "aux-" + i,
      source_path: p,
      real_path: fs.realpathSync(p),
      sha256: fileHash(p),
    })),
  ];
  const stagingDir = path.join(f.root, "bad-render");
  fs.mkdirSync(stagingDir);
  assert.throws(
    () =>
      CanonicalNativeAdapter.render({
        snapshot: {
          project: bad,
          assets,
          provenance: { snapshot_sha256: digest(bad) },
        },
        stagingDir,
        outputPath: path.join(stagingDir, "bad.mp4"),
      }),
    /overlaps/,
  );
  assert.equal(fs.existsSync(path.join(stagingDir, "bad.mp4")), false);
  const changedText = structuredClone(c);
  changedText.typography.text = "CHANGED";
  assert.throws(
    () =>
      verifySubjectTitle({
        project: p,
        clip: changedText,
        doc: f.doc,
        bounds: c.properties.subject_safe.localBounds,
      }),
    /title changed/,
  );
  const beforeReplan = digest(f.server.project());
  const replacement = await f.request("/api/scene/title", {
    ...f.body,
    text: "NEW\nMOVE",
    fontSize: 24,
  });
  assert.equal(replacement.status, 200, JSON.stringify(replacement.body));
  assert.equal(digest(f.server.project()), beforeReplan);
  assert.equal(replacement.body.operations[0].type, "delete_clip");
  assert.equal(
    (
      await f.request("/api/approve", {
        id: replacement.body.id,
        digest: replacement.body.digest,
      })
    ).status,
    200,
  );
  assert.equal(
    f.server.project().clips.filter((c) => c.type === "text").length,
    1,
  );
  const replanned = f.server.project().clips.find((c) => c.type === "text");
  assert.equal(f.server.project().tracks.length, p.tracks.length);
  assert.equal(
    verifySubjectTitle({
      project: f.server.project(),
      clip: replanned,
      doc: f.doc,
      bounds: replanned.properties.subject_safe.localBounds,
    }).collisions,
    0,
  );
});
