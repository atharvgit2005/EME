#!/usr/bin/env node
const fs = require("node:fs"),
  path = require("node:path");
const {
  SceneService,
  queryScene,
  fileHash,
  childOutput,
} = require("../src/scene/service.js");
const args = process.argv.slice(2),
  command = args.shift();
function option(name, fallback) {
  const i = args.indexOf("--" + name);
  return i < 0 ? fallback : args[i + 1];
}
const service = new SceneService({
  root: option("root", process.env.EME_SCENE_ROOT),
});
(async () => {
  if (command === "configure") {
    service.configure({
      python: path.resolve(option("python", "")),
      mobileSamHome: path.resolve(option("mobilesam", "")),
      device: option("device", "mps"),
    });
    console.log(JSON.stringify(await service.doctor(), null, 2));
  } else if (command === "doctor")
    console.log(JSON.stringify(await service.doctor(), null, 2));
  else if (command === "track") {
    const bounds = option("box", "").split(",").map(Number);
    if (bounds.length !== 4) throw Error("Use --box x,y,width,height");
    const result = await service.analyze({
      mediaPath: path.resolve(option("input", "")),
      assetId: option("asset", "source"),
      bounds: Object.fromEntries(
        ["x", "y", "width", "height"].map((k, i) => [k, bounds[i]]),
      ),
      label: option("label", "Selected subject"),
      seconds: Number(option("seconds", 6)),
    });
    console.log(
      JSON.stringify(
        {
          analysisId: result.analysis.analysisId,
          cached: result.cached,
          producer: result.analysis.producer,
          metrics: result.analysis.metrics,
          path: path.join(
            service.root,
            "analyses",
            result.analysis.analysisId,
            "scene.json",
          ),
        },
        null,
        2,
      ),
    );
  } else if (command === "preview") {
    const id = option("id"),
      input = path.resolve(option("input", "")),
      doc = service.read(id, { sourceSha256: fileHash(input) });
    for (const a of doc.artifacts)
      service.artifact(id, a.id, doc.source.sha256);
    console.log(
      await childOutput(service.configuration().python, [
        path.resolve(__dirname, "../scripts/render-scene-preview.py"),
        "--source",
        input,
        "--analysis",
        path.join(service.root, "analyses", id, "scene.json"),
        "--output",
        path.resolve(option("output", "scene-preview.mp4")),
      ]),
    );
  } else if (command === "query") {
    const doc = service.read(option("id"));
    console.log(
      JSON.stringify(
        queryScene(doc, {
          startTick: Number(option("start", 0)),
          endTick: Number(option("end", doc.source.endTick)),
          requireVisible: true,
        }),
        null,
        2,
      ),
    );
  } else
    throw Error(
      "Use configure --python PATH --mobilesam PATH [--device mps|cpu], doctor, track --input VIDEO --box x,y,width,height [--seconds 6], or query --id ID.",
    );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, () => {
    service.cancel();
    process.exit(130);
  });
