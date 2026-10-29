/** Local, durable authorization. Same-user shell/PTY control is outside this boundary. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { SessionLockCoordinator } = require('../prompt-core/session-lock.js');
const { prepareExecution, digest, verifyAssets, fail } = require('./execution-record.js');

// Old tickets remain untouched and cannot authorize a sealed execution.
const DEFAULT_APPROVALS_DIR = path.resolve(__dirname, '../../.eme/approvals/v2');

function durableWrite(file, value, onRenamed = () => {}) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  let fd, created = false;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    created = true;
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file); onRenamed();
    const directory = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary); // Only our exclusive staging file.
  }
}

class ApprovalAuthority {
  static DEFAULT_STORAGE_DIR = DEFAULT_APPROVALS_DIR;
  static _ensureStorageDir(dir = this.DEFAULT_STORAGE_DIR) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); return dir;
  }
  static _coordinator(storageDir = this.DEFAULT_STORAGE_DIR) {
    this._ensureStorageDir(storageDir);
    return new SessionLockCoordinator({ lockDir: path.join(storageDir, 'locks') });
  }
  static _ticketPath(requestId, storageDir = this.DEFAULT_STORAGE_DIR) {
    if (!/^req_[a-f0-9]{32}$/.test(requestId || '')) fail('ERR_INVALID_APPROVAL_TOKEN', 'Invalid request identity');
    return path.join(storageDir, `${requestId}.json`);
  }
  static _key(storageDir) {
    const file = path.join(storageDir, '.authority-key');
    if (!fs.existsSync(file)) {
      const fd = fs.openSync(file, 'wx', 0o600);
      try { fs.writeFileSync(fd, crypto.randomBytes(32)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const directory = fs.openSync(storageDir, 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
    const key = fs.readFileSync(file);
    if (key.length !== 32) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Invalid authority key');
    return key;
  }
  static _seal(ticket, storageDir) {
    const copy = structuredClone(ticket); delete copy.signature;
    return crypto.createHmac('sha256', this._key(storageDir)).update(digest(copy)).digest('hex');
  }
  static _write(ticket, storageDir = this.DEFAULT_STORAGE_DIR) {
    ticket.signature = this._seal(ticket, storageDir);
    durableWrite(this._ticketPath(ticket.request_id, storageDir), ticket);
  }
  static getTicket(requestId, storageDir = this.DEFAULT_STORAGE_DIR) {
    const file = this._ticketPath(requestId, storageDir);
    if (!fs.existsSync(file)) return null;
    let ticket;
    try { ticket = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Unreadable approval record'); }
    if (ticket.format !== 'eme-approval-ticket.v2' || ticket.request_id !== requestId ||
        ticket.signature !== this._seal(ticket, storageDir) || digest(ticket.execution_record) !== ticket.execution_digest) {
      fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Approval record was altered or is unsupported');
    }
    return ticket; // Always disk truth, never cached authorization.
  }
  static formatApprovalPrompt({ executionRecord: r, executionDigest }) {
    return {
      summaryText: [
        '=== EME EXECUTION APPROVAL ===',
        `Project: ${JSON.stringify(r.project_id)} (base revision ${r.base_revision})`,
        `Snapshot SHA-256: ${r.project_snapshot_sha256}`,
        `Creative Plan SHA-256: ${r.creative_plan_sha256 || 'none (direct operations)'}`,
        `OperationPlan SHA-256: ${r.operation_plan_sha256}`,
        `Operations SHA-256: ${r.operations_sha256}`,
        `Compilation options SHA-256: ${r.compilation_options_sha256}`,
        `Execution SHA-256: ${executionDigest}`,
        `Target: ${JSON.stringify(r.target.project_path || 'returned project snapshot (memory)')}`,
        `Creative intent: ${JSON.stringify(r.creative_plan?.creative_intent || null)}`,
        `Atomic operations (${r.operation_plan.operations.length}):`,
        ...r.operation_plan.operations.map(op => `  ${op.step_index}: ${op.type} ${JSON.stringify(op.params)}`),
        `Compilation options: ${JSON.stringify(r.compilation_options)}`,
        `Verified assets (${r.assets.length}):`,
        ...r.assets.map(a => `  ${JSON.stringify(a.asset_id)}: ${JSON.stringify(a.source_path)} SHA-256=${a.sha256}`),
        'Confirmation authorizes this exact execution once. Local shell/PTY control cannot prove human presence.'
      ].join('\n'),
      plan_hash: r.creative_plan_sha256 || r.operation_plan_sha256,
      project_id: r.project_id, base_revision: r.base_revision
    };
  }
  static createPendingRequest({ storageDir = this.DEFAULT_STORAGE_DIR, ...params }) {
    this._ensureStorageDir(storageDir);
    const setup = this._coordinator(storageDir).acquireLock('session', 'authority-initialization');
    try { this._key(storageDir); } finally { setup.release(); }
    const prepared = prepareExecution(params);
    const prompt = this.formatApprovalPrompt({ executionRecord: prepared.record, executionDigest: prepared.executionDigest });
    const now = Date.now();
    const ticket = {
      format: 'eme-approval-ticket.v2', request_id: `req_${crypto.randomBytes(16).toString('hex')}`,
      status: 'PENDING_USER_CONFIRMATION', execution_record: prepared.record, execution_digest: prepared.executionDigest,
      plan_hash: prompt.plan_hash, project_id: prepared.record.project_id, project_revision: prepared.record.base_revision,
      summary: prompt.summaryText, created_at: new Date(now).toISOString(), expires_at: new Date(now + 600000).toISOString(),
      token_sha256: null, confirmed_by: null, confirmed_at: null, consumed_at: null, execution: null
    };
    this._write(ticket, storageDir);
    return {
      request_id: ticket.request_id, status: ticket.status, execution_digest: ticket.execution_digest,
      plan_hash: ticket.plan_hash, project_id: ticket.project_id, project_revision: ticket.project_revision,
      summary: ticket.summary, expires_at: ticket.expires_at,
      operation_plan: structuredClone(prepared.record.operation_plan),
      confirmation_command: `node bin/eme-confirm.js approve ${ticket.request_id}`
    };
  }
  static _requirePending(ticket) {
    if (!ticket) fail('ERR_TICKET_NOT_FOUND', 'Approval request not found');
    if (ticket.status === 'REJECTED') fail('ERR_APPROVAL_REJECTED', 'Request was rejected');
    if (ticket.status === 'CONSUMED') fail('ERR_APPROVAL_ALREADY_CONSUMED', 'Request was consumed');
    if (ticket.status === 'AUTHORIZED') fail('ERR_APPROVAL_ALREADY_CONFIRMED', 'Request was already confirmed');
    if (ticket.status !== 'PENDING_USER_CONFIRMATION') fail('ERR_UNTRUSTED_APPROVAL', 'Request is not pending');
    if (!Number.isFinite(Date.parse(ticket.expires_at)) || Date.now() >= Date.parse(ticket.expires_at)) fail('ERR_APPROVAL_EXPIRED', 'Request expired');
  }
  static _requireFresh(ticket, storageDir) {
    const r = ticket.execution_record;
    verifyAssets(r.assets);
    if (r.target.mode === 'file') {
      const project = fs.existsSync(r.target.project_path) ? JSON.parse(fs.readFileSync(r.target.project_path, 'utf8')) : {};
      if (project.id && project.id !== r.project_id) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Project identity changed before confirmation');
      if ((project.revision ?? 0) !== r.base_revision) fail('ERR_STALE_REVISION', 'Project revision changed before confirmation');
      if (digest(project) !== r.project_snapshot_sha256) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'Project snapshot changed before confirmation');
    } else {
      const head = path.join(storageDir, `head-${digest(r.project_id)}.json`);
      if (fs.existsSync(head) && JSON.parse(fs.readFileSync(head)).project_snapshot_sha256 !== r.project_snapshot_sha256) fail('ERR_STALE_REVISION', 'Project advanced before confirmation');
    }
  }
  static async confirmInteractively({ requestId, storageDir = this.DEFAULT_STORAGE_DIR }) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) fail('ERR_NON_INTERACTIVE_FORBIDDEN', 'Confirmation requires an interactive terminal');
    const shown = this.getTicket(requestId, storageDir); this._requirePending(shown);
    this._requireFresh(shown, storageDir);
    process.stdout.write(shown.summary + '\n');
    const answer = await new Promise(resolve => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Type CONFIRM to authorize this execution: ', value => { resolve(value.trim()); rl.close(); });
      rl.on('close', () => resolve(''));
    });
    if (answer !== 'CONFIRM') fail('ERR_APPROVAL_CANCELLED', 'No authorization was issued');
    const lock = this._coordinator(storageDir).acquireHierarchicalLocks(`approval-project-${digest(shown.project_id)}`, requestId);
    try {
      const ticket = this.getTicket(requestId, storageDir); this._requirePending(ticket);
      if (ticket.execution_digest !== shown.execution_digest || ticket.signature !== shown.signature) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Request changed during review');
      this._requireFresh(ticket, storageDir);
      const token = `${requestId}.${crypto.randomBytes(32).toString('hex')}`;
      ticket.status = 'AUTHORIZED'; ticket.token_sha256 = digest(token);
      ticket.confirmed_by = 'human_interactive_terminal'; ticket.confirmed_at = new Date().toISOString();
      this._write(ticket, storageDir);
      return { token, request_id: requestId, execution_digest: ticket.execution_digest, plan_hash: ticket.plan_hash,
        project_revision: ticket.project_revision, expires_at: ticket.expires_at };
    } finally { lock.release(); }
  }
  static rejectPendingRequest({ requestId, storageDir = this.DEFAULT_STORAGE_DIR }) {
    const lock = this._coordinator(storageDir).acquireLock('job', requestId);
    try {
      const ticket = this.getTicket(requestId, storageDir);
      if (!ticket) fail('ERR_TICKET_NOT_FOUND', 'Approval request not found');
      if (ticket.status === 'CONSUMED') fail('ERR_APPROVAL_ALREADY_CONSUMED', 'Cannot reject an executed request');
      ticket.status = 'REJECTED'; ticket.token_sha256 = null; ticket.rejected_at = new Date().toISOString();
      this._write(ticket, storageDir); return { request_id: requestId, status: ticket.status };
    } finally { lock.release(); }
  }
  /** Called only by the local Studio review surface after its origin/CSRF checks.
   * This records a browser review, not physical-human authentication. MCP never exposes it.
   */
  static confirmReviewedExecution({ requestId, executionDigest, storageDir = this.DEFAULT_STORAGE_DIR }) {
    const shown = this.getTicket(requestId, storageDir); this._requirePending(shown);
    const lock = this._coordinator(storageDir).acquireHierarchicalLocks(`approval-project-${digest(shown.project_id)}`, requestId);
    try {
      const ticket = this.getTicket(requestId, storageDir); this._requirePending(ticket);
      if (ticket.execution_digest !== executionDigest || ticket.signature !== shown.signature) {
        fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'The reviewed execution has changed');
      }
      this._requireFresh(ticket, storageDir);
      const token = `${requestId}.${crypto.randomBytes(32).toString('hex')}`;
      ticket.status = 'AUTHORIZED'; ticket.token_sha256 = digest(token);
      ticket.confirmed_by = 'local_browser_review'; ticket.confirmed_at = new Date().toISOString();
      this._write(ticket, storageDir);
      return { token, request_id: requestId, execution_digest: ticket.execution_digest };
    } finally { lock.release(); }
  }
  static _requestId(token) {
    if (typeof token !== 'string' || !/^req_[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) fail('ERR_UNTRUSTED_APPROVAL', 'A trusted approval token is required');
    return token.split('.')[0];
  }
  // Issuance and standalone consumption are not caller-controlled escape hatches.
  static grantUserApproval() { fail('ERR_UNTRUSTED_APPROVAL', 'Use the interactive confirmation workflow'); }
  static confirmPendingRequest() { fail('ERR_UNTRUSTED_APPROVAL', 'Use bin/eme-confirm.js approve'); }
  static verifyAndConsumeApproval() { return { valid: false, error: { code: 'ERR_APPROVAL_EXECUTION_REQUIRED', message: 'Authorization is consumed only inside protected execution' } }; }
  static clearAll() { /* No cache. Never remove persisted evidence. */ }
}
module.exports = { ApprovalAuthority, durableWrite };
