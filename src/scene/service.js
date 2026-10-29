const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { digest } = require("../creative/execution-record.js");
const { durableWrite } = require("../creative/approval-authority.js");
const {
  assertScene,
  sealScene,
  queryScene,
  TICKS,
  rationalTick,
} = require("./contract.js");
const ROOT = path.resolve(__dirname, "../..");
function fileHash(file) {
  const h = crypto.createHash("sha256"),
    fd = fs.openSync(file, "r"),
    b = Buffer.alloc(65536);
  try {
    let n;
    while ((n = fs.readSync(fd, b, 0, b.length, null)))
      h.update(b.subarray(0, n));
    return h.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}
function childOutput(
  command,
  args,
  { input, env, timeoutMs = 120000, onChild, signal } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env || process.env,
      signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
    onChild?.(child);
    let out = "",
      stderr = "",
      failed = null;
    const timer = setTimeout(() => {
      failed = Error("Scene worker timed out");
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > 32 * 1024 * 1024) {
        failed = Error("Scene response exceeded its limit");
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-5000);
    });
    child.once("error", (e) => {
      // Wait for close before releasing the worker slot, including on abort.
      failed = e;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failed) return reject(failed);
      if (code !== 0) {
        let message = stderr;
        try {
          message = JSON.parse(out).error || stderr;
        } catch {}
        return reject(Error("Scene process failed: " + message));
      }
      resolve(out);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input === undefined ? "" : JSON.stringify(input));
  });
}
async function probe(file, seconds, signal) {
  const info = JSON.parse(
    await childOutput(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { signal },
    ),
  );
  const v = info.streams[0];
  if (!v) throw Error("A video source is required");
  if (
    (v.tags?.rotate && Number(v.tags.rotate) !== 0) ||
    v.side_data_list?.some((x) => Number(x.rotation || 0) !== 0)
  )
    throw Error(
      "Rotated media is not supported by this prototype; normalize orientation before import.",
    );
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 15)
    throw Error("Analyze between 0 and 15 seconds.");
  const raw = JSON.parse(
    await childOutput(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-read_intervals",
        "0%+" + (seconds + 0.2),
        "-show_frames",
        "-show_entries",
        "frame=best_effort_timestamp,pkt_duration,duration",
        "-of",
        "json",
        file,
      ],
      { signal },
    ),
  );
  const origin = raw.frames[0]?.best_effort_timestamp;
  if (origin === undefined)
    throw Error("Source presentation timestamps are unavailable");
  const endTick = Math.min(
    Math.round(seconds * TICKS),
    Math.round(Number(v.duration || info.format.duration) * TICKS),
  );
  const all = raw.frames.map((f, i) => ({
    frameIndex: i,
    sourcePts: String(f.best_effort_timestamp),
    tick: rationalTick(f.best_effort_timestamp, v.time_base, origin),
  }));
  const timings = all
    .filter((f) => f.tick < endTick)
    .map((f, i) => ({
      ...f,
      endTick: Math.min(endTick, all[i + 1]?.tick ?? endTick),
    }));
  if (
    !timings.length ||
    timings.length > 1800 ||
    timings.some(
      (f, i) => f.endTick <= f.tick || (i && f.tick !== timings[i - 1].endTick),
    )
  )
    throw Error("Unsupported or incomplete timestamp coverage");
  return {
    width: v.width,
    height: v.height,
    timeBase: v.time_base,
    ptsOrigin: String(origin),
    endTick,
    timings,
  };
}
class SceneService {
  constructor({ root = path.join(ROOT, ".eme/studio/scene") } = {}) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    for (const name of ["analyses", "cache", "jobs"])
      fs.mkdirSync(path.join(this.root, name), { recursive: true });
    this.child = null;
  }
  configure(config) {
    for (const k of ["python", "mobileSamHome"])
      if (
        typeof config[k] !== "string" ||
        !path.isAbsolute(config[k]) ||
        !fs.existsSync(config[k])
      )
        throw Error("A valid absolute " + k + " path is required");
    if (
      !fs.statSync(config.python).isFile() ||
      !fs.existsSync(
        path.join(config.mobileSamHome, "mobile_sam", "predictor.py"),
      )
    )
      throw Error(
        "Choose the Python executable and a MobileSAM source checkout",
      );
    if (config.device && !["mps", "cpu"].includes(config.device))
      throw Error("Choose mps or cpu");
    durableWrite(path.join(this.root, "config.json"), config);
  }
  configuration() {
    let c = {};
    try {
      c = JSON.parse(fs.readFileSync(path.join(this.root, "config.json")));
    } catch {}
    return {
      python: process.env.EME_SCENE_PYTHON || c.python,
      mobileSamHome: process.env.EME_MOBILESAM_HOME || c.mobileSamHome,
      weights: process.env.EME_MOBILESAM_WEIGHTS || c.weights,
      device: process.env.EME_SCENE_DEVICE || c.device || "mps",
    };
  }
  async worker(input, doctor = false) {
    if (this.controller?.signal.aborted)
      throw Error("Scene analysis cancelled");
    const c = this.configuration();
    if (!c.python || !c.mobileSamHome)
      throw Error(
        "Scene tracking is not configured. Run eme-scene configure with a Python runtime and MobileSAM checkout.",
      );
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      EME_MOBILESAM_HOME: c.mobileSamHome,
      EME_SCENE_DEVICE: c.device,
    };
    if (c.weights) env.EME_MOBILESAM_WEIGHTS = c.weights;
    const output = await childOutput(
      c.python,
      [
        path.join(__dirname, "tracking-worker.py"),
        ...(doctor ? ["--doctor"] : []),
      ],
      {
        input,
        env,
        signal: this.controller?.signal,
        onChild: (child) => {
          this.child = child;
        },
      },
    ).finally(() => {
      this.child = null;
    });
    const result = JSON.parse(output);
    if (!result.success) throw Error(result.error);
    return result.result;
  }
  async doctor() {
    return this.worker(undefined, true);
  }
  read(id, { sourceSha256 } = {}) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid analysis ID");
    const dir = path.join(this.root, "analyses", id),
      doc = JSON.parse(fs.readFileSync(path.join(dir, "scene.json")));
    assertScene(doc, { expectedSourceSha256: sourceSha256 });
    return doc;
  }
  artifact(id, artifactId, sourceSha256) {
    const doc = this.read(id, { sourceSha256 });
    const a = doc.artifacts.find((a) => a.id === artifactId);
    if (!a) throw Error("Mask artifact not found");
    const file = path.join(this.root, "analyses", id, a.sha256 + ".png");
    if (
      !fs.lstatSync(file).isFile() ||
      fs.lstatSync(file).isSymbolicLink() ||
      fileHash(file) !== a.sha256
    )
      throw Error("Scene artifact integrity mismatch");
    return file;
  }
  async analyze(options) {
    if (this.controller) throw Error("A scene analysis is already running");
    this.controller = new AbortController();
    try {
      return await this._analyze(options);
    } finally {
      this.controller = null;
    }
  }
  async _analyze({
    mediaPath,
    assetId = "source",
    expectedSha256,
    bounds,
    label = "Selected subject",
    seconds = 6,
    settings = {},
  }) {
    const sha = fileHash(mediaPath);
    if (expectedSha256 && sha !== expectedSha256)
      throw Error("Source checksum changed");
    const metadata = await probe(mediaPath, seconds, this.controller.signal);
    if (
      !bounds ||
      Object.keys(bounds).sort().join(",") !== "height,width,x,y" ||
      !Object.values(bounds).every(Number.isFinite) ||
      bounds.width < 4 ||
      bounds.height < 4 ||
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.x + bounds.width > metadata.width ||
      bounds.y + bounds.height > metadata.height
    )
      throw Error("Select a valid subject box inside the source frame");
    const allowed = [
      "resegmentEvery",
      "minModelScore",
      "maxAppearanceDistance",
      "cutThreshold",
    ];
    if (Object.keys(settings).some((k) => !allowed.includes(k)))
      throw Error("Unknown tracking setting");
    const options = {
      resegmentEvery: 10,
      minModelScore: 0.65,
      maxAppearanceDistance: 0.7,
      cutThreshold: 0.65,
      ...settings,
    };
    if (
      !Number.isSafeInteger(options.resegmentEvery) ||
      options.resegmentEvery < 1 ||
      options.resegmentEvery > 30 ||
      ["minModelScore", "maxAppearanceDistance", "cutThreshold"].some(
        (k) =>
          !Number.isFinite(options[k]) || options[k] <= 0 || options[k] > 1,
      )
    )
      throw Error("Invalid tracking settings");
    const producer = await this.doctor();
    const width = Math.min(640, metadata.width),
      height = Math.max(
        2,
        Math.round((metadata.height * width) / metadata.width),
      );
    const request = {
      source: {
        assetId,
        sha256: sha,
        width: metadata.width,
        height: metadata.height,
        ticksPerSecond: TICKS,
        timeBase: metadata.timeBase,
        ptsOrigin: metadata.ptsOrigin,
        startTick: 0,
        endTick: metadata.endTick,
      },
      selection: {
        trackId: "subject-1",
        label: String(label).slice(0, 120),
        labelOrigin: "user_hint",
        bounds,
      },
      proxy: {
        width,
        height,
        scaleX: metadata.width / width,
        scaleY: metadata.height / height,
      },
      settings: options,
      timings: metadata.timings,
    };
    const key = digest({
        request,
        producer,
        adapter: digest([
          fileHash(__filename),
          fileHash(path.join(__dirname, "contract.js")),
          fileHash(path.join(ROOT, "schema/eme-scene.v1.schema.json")),
        ]),
      }),
      cache = path.join(this.root, "cache", key + ".json");
    if (fs.existsSync(cache)) {
      const { analysisId } = JSON.parse(fs.readFileSync(cache));
      const doc = this.read(analysisId, { sourceSha256: sha });
      if (doc.requestFingerprint !== key)
        throw Error("Scene cache binding mismatch");
      for (const a of doc.artifacts) this.artifact(analysisId, a.id, sha);
      if (fileHash(mediaPath) !== sha)
        throw Error("Source changed during cache lookup");
      return { analysis: doc, cached: true };
    }
    const dir = fs.mkdtempSync(path.join(this.root, "jobs/job-"));
    const result = await this.worker({
      ...request,
      mediaPath: fs.realpathSync(mediaPath),
      outputDir: dir,
    });
    if (
      digest(result.producer) !== digest(producer) ||
      digest(result.source) !== digest(request.source) ||
      digest(result.selection) !== digest(request.selection) ||
      digest(result.proxy) !== digest(request.proxy) ||
      digest(
        result.frames.map(({ frameIndex, tick, endTick, sourcePts }) => ({
          frameIndex,
          sourcePts,
          tick,
          endTick,
        })),
      ) !== digest(metadata.timings)
    )
      throw Error("Scene worker provenance/request mismatch");
    if (fileHash(mediaPath) !== sha)
      throw Error("Source changed during tracking");
    for (const a of result.artifacts) {
      const file = path.join(dir, a.sha256 + ".png");
      if (
        !/^[a-f0-9]{64}$/.test(a.sha256) ||
        !fs.lstatSync(file).isFile() ||
        fs.lstatSync(file).isSymbolicLink() ||
        fileHash(file) !== a.sha256
      )
        throw Error("Worker mask integrity mismatch");
      a.id = digest(a);
    }
    for (const f of result.frames)
      if (f.observed) {
        const a = result.artifacts[Number(f.observed.maskId)];
        if (!a) throw Error("Missing worker mask");
        f.observed.maskId = a.id;
      }
    const analysis = sealScene({
      schemaVersion: "eme-scene.v1",
      confidenceConvention: "provider_raw_uncalibrated",
      requestFingerprint: key,
      ...result,
      capabilities: {
        subjectTracking: "available",
        binarySegmentation: "available",
        softMatting: "unavailable",
        depth: "unavailable",
        surfaceNormals: "unavailable",
        gaze: "unavailable",
      },
    });
    durableWrite(path.join(dir, "scene.json"), analysis);
    fs.renameSync(dir, path.join(this.root, "analyses", analysis.analysisId));
    durableWrite(cache, { analysisId: analysis.analysisId });
    return { analysis, cached: false };
  }
  cancel() {
    this.controller?.abort();
    this.child?.kill("SIGKILL");
  }
}
module.exports = {
  SceneService,
  childOutput,
  fileHash,
  probe,
  rationalTick,
  queryScene,
};
