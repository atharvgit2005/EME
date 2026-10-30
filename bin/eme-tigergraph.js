#!/usr/bin/env node
const fs = require("node:fs"),
  path = require("node:path");
const { schemaGsql } = require("../src/integrations/tigergraph/schema.js");
const { DesignMemory } = require("../src/integrations/tigergraph/memory.js");
const { DesignFeedbackStore } = require("../src/design/feedback-store.js");
async function main(args = process.argv.slice(2)) {
  const [command = "status"] = args;
  if (command === "schema") {
    process.stdout.write(schemaGsql(process.env.EME_TIGERGRAPH_GRAPH || "EME"));
    return;
  }
  if (command === "verify") {
    const result =
      await require("../src/integrations/tigergraph/verify.js").verifyGraphIntegration(
        {
          progress: (event) =>
            process.stderr.write(JSON.stringify(event) + "\n"),
        },
      );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  if (!["status", "sync", "recall"].includes(command))
    throw Error("Use eme-tigergraph schema|status|sync|recall|verify.");
  const root = path.resolve(
    process.env.EME_STUDIO_ROOT || path.join(__dirname, "../.eme/studio"),
  );
  const memory = new DesignMemory({
    root,
    store: new DesignFeedbackStore(path.join(root, "design-feedback")),
    project: () => JSON.parse(fs.readFileSync(path.join(root, "project.json"))),
  });
  try {
    const result =
      command === "sync"
        ? await memory.sync()
        : command === "recall"
          ? await memory.recall()
          : memory.status();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (command === "sync" && result.state !== "ready") process.exitCode = 2;
  } finally {
    await memory.close();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      e.code === "ERR_TIGERGRAPH"
        ? e.message
        : "TigerGraph command failed. Check configuration and local Studio records; start Studio once before syncing or recalling memory.",
    );
    process.exitCode = 1;
  });
module.exports = { main };
