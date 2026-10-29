#!/usr/bin/env node
const { StudioServer } = require("../src/studio/server.js");
const args = process.argv.slice(2);
const index = args.indexOf("--port");
const port =
  index >= 0 ? Number(args[index + 1]) : Number(process.env.PORT || 4720);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw Error("Use a valid port.");
const studio = new StudioServer({ port });
studio
  .start()
  .then(() => {
    console.log("EME Studio is running at " + studio.origin);
    console.log(
      "Connect your local IDE with: node " +
        require("node:path").resolve(__dirname, "eme-studio-mcp.js"),
    );
  })
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => studio.close().then(() => process.exit(0)));
