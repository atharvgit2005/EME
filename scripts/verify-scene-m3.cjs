#!/usr/bin/env node
// Runs actual MPS inference; no mock worker or synthetic detections are substituted.
const fs = require("node:fs"),
  path = require("node:path");
const { SceneService, childOutput } = require("../src/scene/service.js");
const root = path.resolve(".artifacts/scene/m3-validation"),
  service = new SceneService();
function iou(a, b) {
  const w = Math.max(
      0,
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    ),
    h = Math.max(
      0,
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
    );
  return (w * h) / (a.width * a.height + b.width * b.height - w * h);
}
(async () => {
  fs.mkdirSync(root, { recursive: true });
  const doctor = await service.doctor();
  if (doctor.device !== "mps")
    throw Error("This verification requires actual MPS");
  await childOutput(service.configuration().python, [
    path.resolve("tests/scene-physics.test.py"),
  ]);
  await childOutput(service.configuration().python, [
    path.resolve("scripts/scene-fixtures.py"),
    root,
  ]);
  const runs = [];
  for (const name of ["motion", "occlusion", "cut", "vfr"]) {
    const gt = JSON.parse(fs.readFileSync(path.join(root, name + "-gt.json"))),
      started = Date.now(),
      result = await service.analyze({
        mediaPath: path.join(root, name + ".mp4"),
        assetId: "controlled-" + name,
        bounds: { x: 65, y: 95, width: 100, height: 160 },
        seconds: 3,
      });
    const d = result.analysis;
    const observed = d.frames.filter((f) => f.observed),
      ious = observed
        .filter((f) => gt[f.frameIndex].visible)
        .map((f) => iou(f.observed.bounds, gt[f.frameIndex].bounds));
    const summary = {
      name,
      analysisId: d.analysisId,
      cached: result.cached,
      wallMs: Date.now() - started,
      metrics: d.metrics,
      observed: observed.length,
      meanBoxIoU: ious.reduce((a, b) => a + b, 0) / Math.max(1, ious.length),
      falseVisible: observed.filter((f) => !gt[f.frameIndex].visible).length,
      path: path.join(service.root, "analyses", d.analysisId, "scene.json"),
    };
    if (
      !["cut", "occlusion"].includes(name) &&
      (observed.length < d.frames.length * 0.8 || summary.meanBoxIoU < 0.65)
    )
      throw Error("Tracking quality failed: " + JSON.stringify(summary));
    if (["cut", "occlusion"].includes(name) && summary.falseVisible > 1)
      throw Error("Uncertainty check failed: " + JSON.stringify(summary));
    if (
      name === "vfr" &&
      new Set(d.frames.slice(0, -1).map((f) => f.endTick - f.tick)).size < 2
    )
      throw Error("VFR fixture lost variable timestamps");
    runs.push(summary);
    console.log(JSON.stringify(summary));
  }
  fs.writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify({ device: doctor, runs }, null, 2),
  );
  console.log("M3_SCENE_VERIFIED " + path.join(root, "report.json"));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
