const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { OperationExecutor } = require('../../src/engine/operations.js');

function workspace() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eme-phase1-')));
  const store = path.join(root, 'approvals');
  fs.mkdirSync(store);
  return { root, store };
}

function fixture(id = `phase1-${crypto.randomUUID()}`) {
  let project = OperationExecutor.execute({}, { type: 'create_project', params: { id, durationTicks: 120000 } }).project;
  project = OperationExecutor.execute(project, { type: 'add_track', params: { id: 'main', kind: 'visual' } }).project;
  return OperationExecutor.execute(project, { type: 'insert_clip', params: {
    id: 'title', trackId: 'main', type: 'text', startTick: 0, durationTicks: 120000,
    typography: { text: 'Approved fixture', fontSize: 64 }
  } }).project;
}

const operation = () => ({ type: 'trim_clip', params: { clipId: 'title', newDurationTicks: 60000 } });

function confirmResult(requestId, store, answer = 'CONFIRM', clockOffset = 0) {
  const script = String.raw`
import os,pty,select,sys,time,json,signal
pid,fd=pty.fork()
if pid==0:
    os.execv(sys.argv[1],[sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4],'approve',sys.argv[6]])
output=b''; sent=False; deadline=time.monotonic()+8
while time.monotonic()<deadline:
    ready,_,_=select.select([fd],[],[],0.1)
    if ready:
        try: chunk=os.read(fd,65536)
        except OSError: break
        if not chunk: break
        output+=chunk
        if b'Type CONFIRM to authorize this execution:' in output and not sent:
            os.write(fd,sys.argv[5].encode()+b'\n'); sent=True
else:
    os.kill(pid,signal.SIGKILL)
_,status=os.waitpid(pid,0)
os.close(fd)
print(json.dumps({'exit':os.waitstatus_to_exitcode(status),'output':output.decode(errors='replace')}))
`;
  const run = spawnSync('python3', ['-c', script, process.execPath,
    path.join(__dirname, 'phase1-confirm-child.cjs'), store, requestId, answer, String(clockOffset)],
  { encoding: 'utf8', timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`PTY test harness failed: ${run.stderr || run.error}`);
  return JSON.parse(run.stdout);
}

function approve(requestId, store) {
  const result = confirmResult(requestId, store);
  if (result.exit !== 0) throw new Error(`Production confirmation failed: ${result.output}`);
  const line = result.output.split(/\r?\n/).find(line => line.startsWith('{"token":'));
  if (!line) throw new Error('Confirmation did not issue a token');
  return JSON.parse(line).token;
}

module.exports = { workspace, fixture, operation, confirmResult, approve };
