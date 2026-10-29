// Test-only process adapter: chooses an isolated store, then runs the production CLI.
// No confirmation bypass; the parent must provide actual PTY input.
const path = require('node:path');
const { ApprovalAuthority } = require('../../src/creative/approval-authority.js');
const [store, requestId, command = 'approve', clockOffset = '0'] = process.argv.slice(2);
ApprovalAuthority.DEFAULT_STORAGE_DIR = store;
if (Number(clockOffset)) {
  const realNow = Date.now;
  Date.now = () => realNow() + Number(clockOffset);
}
process.argv = [process.execPath, path.resolve(__dirname, '../../bin/eme-confirm.js'), command, requestId];
require('../../bin/eme-confirm.js').main().catch(error => {
  process.stderr.write(error.message + '\n'); process.exitCode = 1;
});
