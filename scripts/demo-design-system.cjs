#!/usr/bin/env node
// Reproducible engine-only fixture. No LLM inference or human aesthetic acceptance implied.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { StudioServer } = require("../src/studio/server.js");
const { importOperations } = require("../src/studio/plans.js");
const { NativeDelivery } = require("../src/prompt-core/native-delivery.js");
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), "eme-design-demo-"));
// An explicitly supplied destination must be new; never replace a saved edit.
if (process.argv[2]) fs.mkdirSync(root);
async function main() {
  const server = new StudioServer({ root });
  const approve = (proposal) => {
    const result = server.approve({ id: proposal.id, digest: proposal.digest });
    if (!result.success) throw Error(JSON.stringify(result));
  };
  const media = await server.demo();
  approve(
    server.pending(importOperations(server.project(), media), {
      summary:
        "Use generated artwork and a generated tone for the design-system demonstration.",
    }),
  );
  const videoClipId = server.project().clips.find((c) => c.type === "video").id;
  const examples = [
    {
      recipe: "lower-third",
      title: "Made to move",
      eyebrow: "DESIGN SYSTEM",
      videoClipId,
      startTick: 0,
      durationTicks: 480000,
    },
    {
      recipe: "title-card",
      title: "Ideas in motion",
      body: "Measured. Composed. Reviewed.",
      startTick: 480000,
      durationTicks: 480000,
    },
    {
      recipe: "statistic-card",
      title: "Shared components",
      value: "3",
      body: "One design language.",
      startTick: 960000,
      durationTicks: 480000,
    },
  ];
  const designs = [];
  for (const brief of examples) {
    const set = server.planDesign({
      baseRevision: server.project().revision,
      brief,
    });
    const candidate =
      set.candidates.find((c) => c.profileId === "balanced") ||
      set.candidates[0];
    approve(
      server.proposeDesign({
        setId: set.id,
        candidateId: candidate.id,
        baseRevision: set.baseRevision,
      }),
    );
    designs.push({
      recipe: brief.recipe,
      candidate,
      alternatives: set.candidates,
      failures: set.failures,
    });
  }
  const delivery = new NativeDelivery({
    storageDir: path.join(root, "delivery"),
    approvalDir: server.approvals,
  }).run({
    executionId: server.state.executionId,
    outputDir: path.join(root, "export"),
  });
  const evidence = {
    kind: "controlled-design-demo",
    root,
    media: "Generated artwork and tone; no external footage or voice.",
    inference: "No model used; briefs supplied by this fixture.",
    aestheticAcceptance: "Not independently evaluated",
    designs,
    delivery,
  };
  const report = path.join(root, "demo-report.json");
  fs.writeFileSync(report, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      root,
      report,
      success: delivery.success,
      outputPath: delivery.outputPath,
      manifestPath: delivery.manifestPath,
    }),
  );
  if (!delivery.success) throw Error(JSON.stringify(delivery.error));
}
main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
