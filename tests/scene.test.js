const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { digest } = require("../src/creative/execution-record.js");
const {
  assertScene,
  sealScene,
  queryScene,
  rationalTick,
} = require("../src/scene/contract.js");
const {
  SceneService,
  childOutput,
  fileHash,
  probe,
} = require("../src/scene/service.js");
const SHA = "a".repeat(64),
  producer = {
    name: "eme-anchored-mobilesam",
    version: "test-only",
    origin: "synthetic_fixture",
    device: "cpu",
    weightsSha256: SHA,
    codeSha256: SHA,
    dependencies: {
      torch: "fixture",
      opencv: "fixture",
      numpy: "fixture",
      timm: "fixture",
    },
  };
function document({ origin = "model", lost = false } = {}) {
  const artifact = {
    sha256: SHA,
    kind: "binary_mask",
    mimeType: "image/png",
    width: 320,
    height: 180,
    frameIndex: 0,
  };
  artifact.id = digest(artifact);
  return sealScene({
    schemaVersion: "eme-scene.v1",
    confidenceConvention: "provider_raw_uncalibrated",
    requestFingerprint: SHA,
    source: {
      assetId: "test-source",
      sha256: SHA,
      width: 640,
      height: 360,
      ticksPerSecond: 120000,
      timeBase: "1/30",
      ptsOrigin: "0",
      startTick: 0,
      endTick: 8000,
    },
    producer: { ...producer, origin },
    selection: {
      trackId: "subject-1",
      label: "User selected region",
      labelOrigin: "user_hint",
      bounds: { x: 100, y: 40, width: 100, height: 200 },
    },
    proxy: { width: 320, height: 180, scaleX: 2, scaleY: 2 },
    capabilities: {
      subjectTracking: "available",
      binarySegmentation: "available",
      softMatting: "unavailable",
      depth: "unavailable",
      surfaceNormals: "unavailable",
      gaze: "unavailable",
    },
    frames: [
      {
        frameIndex: 0,
        sourcePts: "0",
        tick: 0,
        endTick: 4000,
        shotId: "shot-1",
        visibility: "visible",
        observed: {
          bounds: { x: 100, y: 40, width: 100, height: 200 },
          maskId: artifact.id,
          method: "anchor_segmentation",
          modelScore: 0.8,
        },
        predictedBounds: null,
        camera: { valid: false, dx: 0, dy: 0, inlierRatio: 0 },
        diagnostics: [],
      },
      {
        frameIndex: 1,
        sourcePts: "1",
        tick: 4000,
        endTick: 8000,
        shotId: "shot-1",
        visibility: "lost",
        observed: null,
        predictedBounds: { x: 110, y: 40, width: 100, height: 200 },
        camera: { valid: false, dx: 0, dy: 0, inlierRatio: 0 },
        diagnostics: ["track_lost"],
      },
    ],
    artifacts: [artifact],
    metrics: {
      elapsedMs: 1,
      frameCount: 2,
      segmentationFrames: 1,
      flowFrames: 0,
      unobservedFrames: 1,
      peakRssMb: 0,
      mpsAllocatedMb: 0,
    },
  });
}
function reseal(d) {
  const { analysisId, ...payload } = d;
  return { ...payload, analysisId: digest(payload) };
}
test("Scene queries distinguish observed regions from predictions and half-open coverage", () => {
  const d = document(),
    q = queryScene(d, { startTick: 0, endTick: 4000, requireVisible: true });
  assert.equal(q.status, "available");
  assert.equal(q.frames.length, 1);
  const missing = queryScene(d, {
    startTick: 3999,
    endTick: 8000,
    requireVisible: true,
  });
  assert.equal(missing.status, "insufficient_evidence");
  assert.deepEqual(missing.missing, [
    { startTick: 4000, endTick: 8000, visibility: "lost" },
  ]);
  assert.equal(d.frames[1].observed, null);
  assert.ok(d.frames[1].predictedBounds);
  assert.throws(() => queryScene(d, { endTick: 8001 }), /QUERY_RANGE/);
});
test("Scene integrity and source/request bindings reject stale or changed evidence", () => {
  const d = document();
  assert.throws(
    () => assertScene(d, { expectedSourceSha256: "b".repeat(64) }),
    /STALE_SOURCE/,
  );
  assert.throws(
    () => assertScene(d, { expectedRequestFingerprint: "b".repeat(64) }),
    /STALE_REQUEST/,
  );
  d.frames[0].observed.bounds.x++;
  assert.throws(() => assertScene(d), /INTEGRITY/);
});
test("Fabricated visible masks, unsupported capabilities, geometry and temporal gaps fail closed", () => {
  const mutate = [
    (d) => (d.frames[1].observed = d.frames[0].observed),
    (d) => (d.capabilities.depth = "available"),
    (d) => (d.frames[0].observed.bounds.width = 1000),
    (d) => (d.frames[1].tick = 4001),
    (d) => (d.frames[1].sourcePts = "3"),
    (d) => (d.frames[1].frameIndex = 2),
    (d) => (d.artifacts[0].frameIndex = 1),
  ];
  for (const m of mutate) {
    const d = document();
    m(d);
    assert.throws(() => assertScene(reseal(d)));
  }
});
test("Synthetic fixtures cannot be consumed as production scene evidence", () => {
  const d = document({ origin: "synthetic_fixture" });
  assert.throws(() => assertScene(d), /FIXTURE_NOT_PRODUCTION/);
  assert.equal(assertScene(d, { allowFixture: true }), d);
  assert.throws(() => queryScene(d), /FIXTURE_NOT_PRODUCTION/);
});
test("Original rational timestamps support variable intervals without nominal FPS assumptions", () => {
  assert.equal(rationalTick("1001", "1/30000", "0"), 4004);
  assert.equal(rationalTick("2", "1/30", "1"), 4000);
  assert.throws(() => rationalTick("0", "1/30", "1"), /NEGATIVE_PTS/);
  const d = document();
  d.source.timeBase = "1/120000";
  d.source.endTick = 11000;
  d.frames[0].endTick = 5000;
  d.frames[1].sourcePts = "5000";
  d.frames[1].tick = 5000;
  d.frames[1].endTick = 11000;
  assertScene(reseal(d));
});
test("Strict schema rejects extra fields and non-finite confidence", () => {
  const d = document();
  d.frames[0].execute = true;
  assert.throws(() => assertScene(reseal(d)), /CONTRACT/);
  delete d.frames[0].execute;
  d.frames[0].observed.modelScore = NaN;
  assert.throws(() => assertScene(d));
});
async function media(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-scene-contract-"));
  const file = path.join(root, "source.mp4");
  await childOutput("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=10:d=0.3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
  return { root, file };
}
function mockService(root) {
  const s = new SceneService({ root: path.join(root, "scene") });
  let runs = 0;
  s.doctor = async () => ({ ...producer, origin: "model" });
  s.worker = async (r) => {
    runs++;
    const artifacts = [],
      frames = r.timings.map((timing, i) => {
        const bytes = Buffer.from("test-only-mask-" + i),
          sha = fileHashOf(bytes),
          a = {
            sha256: sha,
            kind: "binary_mask",
            mimeType: "image/png",
            width: r.proxy.width,
            height: r.proxy.height,
            frameIndex: i,
          };
        fs.writeFileSync(path.join(r.outputDir, sha + ".png"), bytes);
        artifacts.push(a);
        return {
          ...timing,
          shotId: "shot-1",
          visibility: "visible",
          observed: {
            bounds: r.selection.bounds,
            maskId: String(i),
            method: "anchor_segmentation",
            modelScore: 0.8,
          },
          predictedBounds: null,
          camera: { valid: false, dx: 0, dy: 0, inlierRatio: 0 },
          diagnostics: [],
        };
      });
    return {
      source: r.source,
      producer: { ...producer, origin: "model" },
      selection: r.selection,
      proxy: r.proxy,
      frames,
      artifacts,
      metrics: {
        elapsedMs: 1,
        frameCount: frames.length,
        segmentationFrames: frames.length,
        flowFrames: 0,
        unobservedFrames: 0,
        peakRssMb: 0,
        mpsAllocatedMb: 0,
      },
    };
  };
  return { s, runs: () => runs };
}
function fileHashOf(b) {
  return require("node:crypto").createHash("sha256").update(b).digest("hex");
}
test("Adapter seals real source timing, caches exact requests, and invalidates changed subject hints", async (t) => {
  const { root, file } = await media(t),
    { s, runs } = mockService(root),
    input = {
      mediaPath: file,
      bounds: { x: 30, y: 20, width: 50, height: 100 },
      seconds: 0.2,
    };
  const first = await s.analyze(input);
  assert.equal(first.cached, false);
  assert.equal(first.analysis.frames.length, 2);
  assert.equal((await s.analyze(input)).cached, true);
  assert.equal(runs(), 1);
  assert.equal(
    (await s.analyze({ ...input, bounds: { ...input.bounds, x: 40 } })).cached,
    false,
  );
  assert.equal(runs(), 2);
  assert.throws(
    () => s.read(first.analysis.analysisId, { sourceSha256: "b".repeat(64) }),
    /STALE_SOURCE/,
  );
});
test("Mask registry checks every returned artifact and detects tampering on cache hits", async (t) => {
  const { root, file } = await media(t),
    { s } = mockService(root),
    input = {
      mediaPath: file,
      bounds: { x: 30, y: 20, width: 50, height: 100 },
      seconds: 0.2,
    },
    r = await s.analyze(input),
    a = r.analysis.artifacts[0],
    p = s.artifact(r.analysis.analysisId, a.id);
  fs.appendFileSync(p, "tampered");
  assert.throws(() => s.artifact(r.analysis.analysisId, a.id), /integrity/);
  await assert.rejects(s.analyze(input), /integrity/);
  assert.throws(() => s.read("../config"), /Invalid/);
});
test("Invalid settings, stale source, and out-of-frame selections never run inference", async (t) => {
  const { root, file } = await media(t),
    { s, runs } = mockService(root),
    input = {
      mediaPath: file,
      bounds: { x: 30, y: 20, width: 50, height: 100 },
      seconds: 0.2,
    };
  await assert.rejects(
    s.analyze({ ...input, expectedSha256: "b".repeat(64) }),
    /checksum/,
  );
  await assert.rejects(
    s.analyze({ ...input, bounds: { x: 0, y: 0, width: 1000, height: 50 } }),
    /valid subject/,
  );
  await assert.rejects(
    s.analyze({ ...input, settings: { minModelScore: NaN } }),
    /Invalid/,
  );
  assert.equal(runs(), 0);
});
test("Source metadata keeps probed presentation timestamps and rejects orientation assumptions", async (t) => {
  const { file } = await media(t);
  const p = await probe(file, 0.2);
  assert.equal(p.timings[1].tick, 12000);
  assert.equal(p.timings[1].endTick, 24000);
  await assert.rejects(probe(file, 16), /15 seconds/);
});
test("Worker transport terminates bounded processes on timeout and cancellation", async () => {
  await assert.rejects(
    childOutput(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      timeoutMs: 30,
    }),
    /timed out/,
  );
  const c = new AbortController(),
    pending = childOutput(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { signal: c.signal },
    );
  c.abort();
  await assert.rejects(pending, /abort/i);
});
async function studio(t) {
  const { StudioServer } = require("../src/studio/server.js"),
    { root, file } = await media(t),
    server = await new StudioServer({
      root: path.join(root, "studio"),
      port: 0,
    }).start();
  t.after(() => server.close());
  const html = await (await fetch(server.origin)).text(),
    token = /name="eme-review" content="([a-f0-9]+)"/.exec(html)[1];
  server.state.media.push({
    id: "source-test",
    path: file,
    sha256: fileHash(file),
    type: "video",
    width: 320,
    height: 180,
    duration: 0.3,
    name: "Fixture",
  });
  server.save();
  const request = async (route, body, headers = {}) => {
    const r = await fetch(server.origin + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: server.origin,
        "X-EME-Review": token,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  return { root, file, server, request };
}
async function settle(server) {
  const p = server.scenePromise;
  if (p) await p;
}
test("Studio scene jobs require browser authority and never mutate the canonical project", async (t) => {
  const f = await studio(t),
    { s } = mockService(f.root);
  f.server.sceneService = s;
  const before = digest(f.server.project()),
    input = {
      mediaId: "source-test",
      bounds: { x: 30, y: 20, width: 50, height: 100 },
      seconds: 0.2,
    };
  assert.equal(
    (await f.request("/api/scene/analyze", input, { "X-EME-Review": "wrong" }))
      .status,
    403,
  );
  assert.equal(
    (await f.request("/api/scene/analyze", { ...input, mediaId: "missing" }))
      .status,
    404,
  );
  const job = await f.request("/api/scene/analyze", input);
  assert.equal(job.status, 202);
  await settle(f.server);
  assert.equal(
    f.server.state.sceneJob.status,
    "SUCCEEDED",
    JSON.stringify(f.server.state.sceneJob),
  );
  const id = f.server.state.sceneJob.analysisId,
    read = await f.request("/api/scene/" + id);
  assert.equal(read.status, 200);
  assert.equal(read.body.source.sha256, fileHash(f.file));
  assert.equal(digest(f.server.project()), before);
  assert.equal(f.server.state.proposal, undefined);
  assert.equal(f.server.context().sceneAnalyses[0].analysisId, id);
});
test("Production MCP queries scene intervals and the API rejects drifted source bytes", async (t) => {
  const f = await studio(t),
    { s } = mockService(f.root);
  f.server.sceneService = s;
  await f.request("/api/scene/analyze", {
    mediaId: "source-test",
    bounds: { x: 30, y: 20, width: 50, height: 100 },
    seconds: 0.2,
  });
  await settle(f.server);
  const id = f.server.state.sceneJob.analysisId,
    args = path.join(f.root, "query.json");
  fs.writeFileSync(
    args,
    JSON.stringify({
      analysisId: id,
      startTick: 0,
      endTick: 12000,
      requireVisible: true,
    }),
  );
  const text = await childOutput(
      process.execPath,
      [
        path.resolve("scripts/studio-agent-call.cjs"),
        "eme_studio_get_scene",
        args,
      ],
      { env: { ...process.env, EME_STUDIO_ROOT: f.server.root } },
    ),
    q = JSON.parse(text);
  assert.equal(q.analysisId, id);
  assert.equal(q.status, "available");
  assert.equal(q.frames.length, 1);
  assert.equal(
    (await f.request("/api/agent/scene", { analysisId: id })).status,
    403,
  );
  fs.appendFileSync(f.file, "drift");
  assert.equal((await f.request("/api/scene/" + id)).status, 409);
});
test("Unavailable tracking prerequisites produce a failed job rather than manufactured observations", async (t) => {
  const f = await studio(t),
    before = digest(f.server.project());
  const r = await f.request("/api/scene/analyze", {
    mediaId: "source-test",
    bounds: { x: 30, y: 20, width: 50, height: 100 },
    seconds: 0.2,
  });
  assert.equal(r.status, 202);
  await settle(f.server);
  assert.equal(f.server.state.sceneJob.status, "FAILED");
  assert.match(f.server.state.sceneJob.message, /not configured/);
  assert.equal(f.server.state.sceneAnalyses.length, 0);
  assert.equal(digest(f.server.project()), before);
});
