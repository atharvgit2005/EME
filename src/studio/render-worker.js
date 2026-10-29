const fs = require("node:fs");
const { NativeDelivery } = require("../prompt-core/native-delivery.js");
const { durableWrite } = require("../creative/approval-authority.js");
const [requestPath, resultPath] = process.argv.slice(2);
try {
  const request = JSON.parse(fs.readFileSync(requestPath));
  const result = new NativeDelivery({
    storageDir: request.storageDir,
    approvalDir: request.approvalDir,
  }).run({ executionId: request.executionId, outputDir: request.outputDir });
  durableWrite(resultPath, result);
  process.exitCode = result.success ? 0 : 1;
} catch (error) {
  durableWrite(resultPath, {
    success: false,
    error: { message: error.message, code: error.code || "RENDER_FAILED" },
  });
  process.exitCode = 1;
}
