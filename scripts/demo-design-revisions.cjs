#!/usr/bin/env node
// Controlled engine fixture; its choices are not human preference labels.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { StudioServer } = require("../src/studio/server.js");
const { importOperations } = require("../src/studio/plans.js");
const { NativeDelivery } = require("../src/prompt-core/native-delivery.js");
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), "eme-revisions-demo-"));
if (process.argv[2]) fs.mkdirSync(root); // Refuse to replace an existing edit.
async function main() {
  const server = new StudioServer({ root });
  const approve = (proposal) => {
    const result = server.approve({ id: proposal.id, digest: proposal.digest });
    if (!result.success) throw Error(JSON.stringify(result));
  };
  const apply = (set, candidate) =>
    approve(
      server.proposeDesign({
        baseRevision: set.baseRevision,
        setId: set.id,
        candidateId: candidate.id,
      }),
    );
  const render = (name) => {
    const result = new NativeDelivery({
      storageDir: path.join(root, "delivery-" + name),
      approvalDir: server.approvals,
    }).run({
      executionId: server.state.executionId,
      outputDir: path.join(root, name),
    });
    if (!result.success) throw Error(JSON.stringify(result.error));
    return result;
  };
  const media = await server.demo();
  approve(
    server.pending(importOperations(server.project(), media), {
      summary:
        "Use generated artwork and tone for the component revision demonstration.",
    }),
  );
  const videoClipId = server.project().clips.find((c) => c.type === "video").id;
  const examples = [
    {
      recipe: "lower-third",
      title: "Made to move",
      eyebrow: "ENGINE DESIGN",
      videoClipId,
      startTick: 0,
      durationTicks: 720000,
    },
    {
      recipe: "title-card",
      title: "Ideas in motion",
      body: "Measured. Composed. Reviewed.",
      startTick: 720000,
      durationTicks: 720000,
    },
  ];
  const components = [];
  for (const brief of examples) {
    const set = server.planDesign({
      baseRevision: server.project().revision,
      brief: { ...brief, profiles: ["balanced"] },
    });
    const candidate = set.candidates[0];
    apply(set, candidate);
    const clip = server
      .project()
      .clips.find(
        (c) =>
          server.project().assets.find((a) => a.id === c.source?.assetId)
            ?.metadata?.design?.candidateId === candidate.id,
      );
    components.push({
      clipId: clip.id,
      before: server.designComponent(clip.id),
      beforeCandidate: candidate,
    });
  }
  const before = render("before");
  for (const item of components) {
    const set = server.reviseDesign({
      baseRevision: server.project().revision,
      clipId: item.clipId,
      changes: { adjustments: { typography: "larger", motion: "less" } },
      explore: true,
    });
    const candidate = set.candidates.find((c) => c.variantId === "requested");
    if (!candidate) throw Error("The requested revision could not fit.");
    apply(set, candidate);
    item.after = server.designComponent(item.clipId);
    item.afterCandidate = candidate;
    item.alternatives = set.candidates;
    item.failures = set.failures;
  }
  const after = render("after");
  const evidence = {
    kind: "controlled-component-revision-demo",
    root,
    media: "Generated artwork and tone; no external footage or voice.",
    inference:
      "No model used. The fixture requests larger typography and less slide motion.",
    aestheticAcceptance:
      "Not independently evaluated; no feedback votes submitted.",
    components,
    before,
    after,
  };
  const report = path.join(root, "demo-report.json");
  fs.writeFileSync(report, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      root,
      report,
      before: before.outputPath,
      after: after.outputPath,
      success: true,
    }),
  );
}
main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
