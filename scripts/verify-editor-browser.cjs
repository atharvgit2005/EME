#!/usr/bin/env node
// Optional local browser acceptance. Uses existing playwright-core and an owned Chrome.
// Does not join npm test: CI does not require a desktop browser installation.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { StudioServer, run } = require("../src/studio/server.js");
const { importOperations } = require("../src/studio/plans.js");
const { digest } = require("../src/creative/execution-record.js");

const repo = path.resolve(__dirname, "..");
const evidence = path.join(repo, ".artifacts/editor-redesign");
const dependencyRoot =
  process.env.EME_PLAYWRIGHT_ROOT ||
  path.join(os.homedir(), "REA", "node_modules");
const { chromium } = require(
  require.resolve("playwright-core", { paths: [dependencyRoot] }),
);
const executablePath =
  process.env.EME_CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TICKS = 120000;
const report = {
  startedAt: new Date().toISOString(),
  input: "real Playwright mouse move/down/up; no event dispatch",
  steps: [],
  pageErrors: [],
};
let browser, server, page, root;
async function waitFor(check, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Timed out waiting for " + label);
}
function geometry() {
  return server
    .project()
    .clips.filter((c) => ["video", "audio"].includes(c.type))
    .map((c) => ({
      id: c.id,
      type: c.type,
      startTick: c.startTick,
      durationTicks: c.durationTicks,
      trimInTick: c.source.trimInTick,
      trimOutTick: c.source.trimOutTick,
    }));
}
async function gesture(clipId, kind, secondsDelta, expected) {
  const before = digest(server.project()),
    revision = server.project().revision;
  const clip = server.project().clips.find((c) => c.id === clipId);
  const element = page.locator(`[data-clip="${clipId}"]`);
  await element.scrollIntoViewIfNeeded();
  const rect = await element.boundingBox();
  assert.ok(rect, "Clip must have a real on-screen rectangle");
  const pixelsPerSecond = rect.width / (clip.durationTicks / TICKS);
  const target =
    kind === "move"
      ? element
      : element.locator(
          `[data-edge="${kind === "trim_start" ? "start" : "end"}"]`,
        );
  const handle = kind === "move" ? rect : await target.boundingBox();
  assert.ok(handle, "Trim handle must be visible");
  const from = {
    x:
      kind === "move"
        ? rect.x + Math.min(80, rect.width * 0.3)
        : handle.x + handle.width / 2,
    y: handle.y + handle.height / 2,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + secondsDelta * pixelsPerSecond, from.y, {
    steps: 18,
  });
  assert.equal(
    await page.locator("#timeline-ghost").isVisible(),
    true,
    "Pointer drag must show a gesture preview",
  );
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/edit") && r.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.mouse.up();
  const response = await responsePromise;
  const result = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(result));
  await page.locator("#approve").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(
    digest(server.project()),
    before,
    "Dragging must only propose, not mutate",
  );
  assert.equal(
    server.state.proposal.operations.length,
    2,
    "Both AV components must be in the exact proposal",
  );
  assert.equal(
    server.state.proposal.operations.every(
      (op) => op.type === (kind === "move" ? "move_clip" : "trim_clip"),
    ),
    true,
  );
  await page.locator("#approve").click();
  await waitFor(
    () => !server.state.proposal && server.project().revision > revision,
    "browser-approved edit",
  );
  const after = geometry();
  for (const c of after)
    for (const [key, value] of Object.entries(expected))
      assert.equal(c[key], value, `${kind}: ${c.type}.${key}`);
  await page.waitForFunction(
    (rev) =>
      document.getElementById("revision").textContent === "Revision " + rev,
    server.project().revision,
    { timeout: 15000 },
  );
  report.steps.push({
    gesture: kind,
    deltaSeconds: secondsDelta,
    proposalOnlyBeforeApproval: true,
    linkedOperations: 2,
    revision: server.project().revision,
    geometry: after,
  });
}
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-editor-pointer-"));
  server = await new StudioServer({ root, port: 0 }).start();
  const source = path.join(root, "pointer-source.mp4");
  await run("ffmpeg", [
    "-nostdin",
    "-v",
    "error",
    "-n",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=8",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=8",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  const media = await server.mediaFromFile(
    source,
    "Pointer acceptance · generated AV.mp4",
  );
  server.pending(importOperations(server.project(), media), {
    summary: "Prepare pointer-test media",
  });
  server.approve({
    id: server.state.proposal.id,
    digest: server.state.proposal.digest,
  });
  server.pending(
    [{ type: "set_project_duration", params: { durationTicks: 12 * TICKS } }],
    { summary: "Prepare twelve-second pointer workspace" },
  );
  server.approve({
    id: server.state.proposal.id,
    digest: server.state.proposal.digest,
  });
  report.setup = {
    source: "actual FFmpeg-generated eight-second video and audio",
    projectSeconds: 12,
    initialGeometry: geometry(),
  };
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto(server.origin, { waitUntil: "networkidle" });
  const videoId = server.project().clips.find((c) => c.type === "video").id;
  await page.locator(`[data-clip="${videoId}"]`).waitFor({ state: "visible" });
  await gesture(videoId, "move", 2, {
    startTick: 2 * TICKS,
    durationTicks: 8 * TICKS,
    trimInTick: 0,
    trimOutTick: 8 * TICKS,
  });
  await gesture(videoId, "trim_end", -1, {
    startTick: 2 * TICKS,
    durationTicks: 7 * TICKS,
    trimInTick: 0,
    trimOutTick: 7 * TICKS,
  });
  await gesture(videoId, "trim_start", 1, {
    startTick: 3 * TICKS,
    durationTicks: 6 * TICKS,
    trimInTick: TICKS,
    trimOutTick: 7 * TICKS,
  });
  await page.locator("#tab-inspector").click();
  await page.screenshot({
    path: path.join(evidence, "pointer-final.png"),
    fullPage: true,
  });
  assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
  report.passed = true;
})()
  .catch(async (error) => {
    report.passed = false;
    report.error = { message: error.message, stack: error.stack };
    if (page)
      await page
        .screenshot({
          path: path.join(evidence, "pointer-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(
      path.join(evidence, "pointer-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        passed: report.passed,
        gestures: report.steps.map((s) => s.gesture),
        pageErrors: report.pageErrors,
        report: path.join(evidence, "pointer-report.json"),
      }),
    );
  });
