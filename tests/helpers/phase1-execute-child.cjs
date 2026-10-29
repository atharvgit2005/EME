// Process/crash injection is confined to the test runner, never production flags.
const fs = require('node:fs');
const { ApprovalAuthority } = require('../../src/creative/approval-authority.js');
const { ExecutionAuthority } = require('../../src/creative/execution-authority.js');
const { OperationExecutor } = require('../../src/engine/operations.js');
const [store, token, projectPath, mode, callsFile] = process.argv.slice(2);
ApprovalAuthority.DEFAULT_STORAGE_DIR = store;
const originalExecute = OperationExecutor.execute;
OperationExecutor.execute = function(...args) {
  if (callsFile) fs.appendFileSync(callsFile, 'step\n');
  const result = originalExecute.apply(this, args);
  if (mode === 'crash-before') process.kill(process.pid, 'SIGKILL');
  if (mode === 'race') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  return result;
};
if (mode === 'crash-after') {
  const originalRename = fs.renameSync;
  fs.renameSync = function(from, to) {
    const result = originalRename(from, to);
    if (to === projectPath) process.kill(process.pid, 'SIGKILL');
    return result;
  };
}
const run = () => {
  const result = ExecutionAuthority.execute({ approvalToken: token, projectPath });
  if (process.send) process.send({ result });
  else process.stdout.write(JSON.stringify(result));
};
if (process.send) { process.send({ ready: true }); process.once('message', run); }
else run();
