const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync, fork } = require('node:child_process');
const { ApprovalAuthority, durableWrite } = require('../src/creative/approval-authority.js');
const { ExecutionAuthority } = require('../src/creative/execution-authority.js');
const { prepareExecution, digest } = require('../src/creative/execution-record.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { EmeMcpServer } = require('../src/mcp/server.js');
const { CreativeDirector } = require('../src/creative/creative-director.js');
const { PlanStore } = require('../src/creative/plan-store.js');
const { EditorBackend } = require('../src/ui/server.js');
const { workspace, fixture, operation, confirmResult, approve } = require('./helpers/phase1-approval.cjs');

// Every output lives below a fresh mkdtemp. Keep it for failure/forensic inspection.
const area = workspace();
ApprovalAuthority.DEFAULT_STORAGE_DIR = area.store;
const pending = (project, overrides = {}) => ApprovalAuthority.createPendingRequest({ project, operation: operation(), ...overrides });
const execute = (project, token, overrides = {}) => ExecutionAuthority.execute({ project, approvalToken: token, ...overrides });

function creativePlan(project) {
  return {
    schema_version: '1.0.0', plan_id: 'creative-plan-phase1', source_request_id: 'phase1',
    project_snapshot: { project_id: project.id, base_revision: project.revision,
      snapshot_sha256: digest(project), timebase_ticks_per_second: 120000 },
    creative_intent: { goal: 'Approved edit', target_audience: 'general', style: 'clean', pacing: 'moderate', desired_outcome: 'A bounded edit' },
    deliverable: { width: 1080, height: 1920, aspect_ratio: '9:16', frame_rate: project.timebase.fps, target_duration_ticks: 120000 },
    narrative_beats: [{ beat_id: 'beat-1', sequence_index: 0, beat_type: 'hook', narrative_purpose: 'Opening',
      source_media_ref: { asset_id: 'video' }, source_range: { start_tick: 0, end_tick: 120000, duration_ticks: 120000 },
      timeline_range: { start_tick: 0, end_tick: 120000, duration_ticks: 120000 },
      editorial_decisions: { cut_type: 'none', reframing: { enabled: false, mode: 'none', target_aspect_ratio: '9:16' } } }],
    visual_events: [], audio_direction: { dialogue_ducking_enabled: false, sfx_cues: [] }, unsupported_features: [],
    provenance: { generator: { provider: 'test-fixture', model: 'none', generation_timestamp: '2026-01-01T00:00:00Z' },
      input_brief_hash: 'a'.repeat(64), context_snapshot_hash: 'b'.repeat(64), accepted_at: '2026-01-01T00:00:00Z', plan_hash: 'c'.repeat(64) }
  };
}

test('all MCP and direct director mutation entry points reject untrusted assertions', async () => {
  const project = fixture(); const before = digest(project);
  for (const untrusted of [{}, { approval: true }, { require_token: false, approval: true },
    { requireToken: false, userConsent: true, plan_hash: 'a'.repeat(64) }, { approval_token: 'fabricated' }]) {
    for (const [name, args] of [
      ['eme_create_project', { title: 'unapproved' }],
      ['eme_execute_operation', { project, operation: operation() }],
      ['eme_execute_approved_plan', { project, operationPlan: { operations: [operation()] } }]
    ]) {
      const result = await EmeMcpServer.handleToolCall(name, { ...args, ...untrusted });
      assert.equal(result.success, false, name); assert.equal(result.committedSteps, 0);
    }
  }
  const old = process.env.EME_REQUIRE_APPROVAL_TOKEN;
  process.env.EME_REQUIRE_APPROVAL_TOKEN = '0';
  try {
    const director = new CreativeDirector({ planStore: new PlanStore({ storeDir: path.join(area.root, 'plans') }) });
    assert.equal(director.execute({ project, creativePlan: {}, options: { approval: true } }).success, false);
    assert.equal((await EmeMcpServer.handleToolCall('eme_execute_operation', { project, operation: operation(), approval: true })).success, false);
  } finally { if (old === undefined) delete process.env.EME_REQUIRE_APPROVAL_TOKEN; else process.env.EME_REQUIRE_APPROVAL_TOKEN = old; }
  assert.equal(digest(project), before);
  assert.throws(() => ApprovalAuthority.grantUserApproval({ userConsent: true, planHash: 'a'.repeat(64), projectRevision: project.revision }), /ERR_UNTRUSTED_APPROVAL/);
});

test('pending requests seal exact content, return no token, and have no programmatic confirmation bypass', async () => {
  const project = fixture(); const request = await EmeMcpServer.handleToolCall('eme_request_user_approval', {
    project, operation: operation(), userConsent: true, approvedBy: 'human', approval: true
  });
  assert.equal(request.status, 'PENDING_USER_CONFIRMATION'); assert.equal(request.token, undefined);
  assert.throws(() => ApprovalAuthority.confirmPendingRequest({ requestId: request.request_id, confirmationNonce: 'anything', userConsent: true }), /ERR_UNTRUSTED_APPROVAL/);
  const ticket = ApprovalAuthority.getTicket(request.request_id);
  assert.equal(ticket.execution_record.operations_sha256, digest(ticket.execution_record.operation_plan.operations));
  assert.equal(ticket.execution_record.project_snapshot_sha256, digest(project));
  assert.equal(ticket.token_sha256, null);
  const escaped = ApprovalAuthority.createPendingRequest({ project: {},
    operation: { type: 'create_project', params: { id: 'project-\u001b[2J-forged-review', title: 'control characters' } } });
  assert.equal(escaped.summary.includes('\u001b'), false, 'Untrusted identifiers must not control terminal presentation');
});

test('exclusive staging-file collisions never delete or overwrite prior evidence', () => {
  const crypto = require('node:crypto');
  const target = path.join(area.root, 'collision-target.json');
  const collision = `${target}.tmp-${process.pid}-${'ab'.repeat(8)}`;
  fs.writeFileSync(collision, 'prior evidence');
  const original = crypto.randomBytes; crypto.randomBytes = size => Buffer.alloc(size, 0xab);
  try {
    assert.throws(() => durableWrite(target, { replace: true }), error => error.code === 'EEXIST');
    assert.equal(fs.readFileSync(collision, 'utf8'), 'prior evidence');
    assert.equal(fs.existsSync(target), false);
  } finally { crypto.randomBytes = original; }
});

test('production CLI forbids flags, pipes, environment bypasses and cancellation', () => {
  const project = fixture(); const request = pending(project);
  const cli = path.resolve(__dirname, '../bin/eme-confirm.js');
  for (const flag of ['--yes', '-y', '--test-confirm']) {
    const result = spawnSync(process.execPath, [cli, 'approve', request.request_id, flag], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', EME_ALLOW_TEST_CONFIRMATION: '1' } });
    assert.equal(result.status, 1); assert.match(result.stderr, /ERR_APPROVAL_BYPASS_FORBIDDEN/);
  }
  const piped = spawnSync(process.execPath, [cli, 'approve', request.request_id], { input: 'CONFIRM\n', encoding: 'utf8' });
  assert.equal(piped.status, 1); assert.match(piped.stderr, /ERR_NON_INTERACTIVE_FORBIDDEN/);
  assert.equal(confirmResult(request.request_id, area.store, 'cancel').exit, 1);
  assert.equal(ApprovalAuthority.getTicket(request.request_id).status, 'PENDING_USER_CONFIRMATION');
});

test('legitimate PTY-confirmed execution commits exactly once through OperationExecutor', () => {
  const project = fixture(); const request = pending(project); const token = approve(request.request_id, area.store);
  let calls = 0; const original = OperationExecutor.execute;
  OperationExecutor.execute = function(...args) { calls++; return original.apply(this, args); };
  try {
    const result = execute(project, token, { operation: operation() });
    assert.equal(result.success, true); assert.equal(result.project.revision, project.revision + 1);
    assert.equal(result.project.clips[0].durationTicks, 60000); assert.equal(calls, 1);
    const second = execute(project, token);
    assert.equal(second.error.code, 'ERR_APPROVAL_ALREADY_CONSUMED'); assert.equal(calls, 1);
    assert.equal(second.status, 'COMMITTED'); assert.equal(second.previous_execution, true);
  } finally { OperationExecutor.execute = original; }
});

test('changed operations, options, identity, revision, snapshot, destination, and token fail closed', async t => {
  const project = fixture(); const request = pending(project, { options: { marker: 'reviewed' } });
  const token = approve(request.request_id, area.store);
  const mutations = [
    ['operations', project, { operation: { ...operation(), params: { clipId: 'title', newDurationTicks: 30000 } } }, 'ERR_APPROVAL_INTEGRITY_MISMATCH'],
    ['options', project, { options: { marker: 'altered' } }, 'ERR_APPROVAL_INTEGRITY_MISMATCH'],
    ['identity', { ...project, id: 'another' }, {}, 'ERR_APPROVAL_INTEGRITY_MISMATCH'],
    ['revision', { ...project, revision: project.revision + 1 }, {}, 'ERR_STALE_REVISION'],
    ['snapshot', { ...project, title: 'changed without revision' }, {}, 'ERR_PROJECT_SNAPSHOT_MISMATCH'],
    ['destination', project, { projectPath: path.join(area.root, 'elsewhere.json') }, 'ERR_APPROVAL_INTEGRITY_MISMATCH'],
    ['fabricated token', project, { approvalToken: token.slice(0, -1) + (token.endsWith('0') ? '1' : '0') }, 'ERR_INVALID_APPROVAL_TOKEN']
  ];
  for (const [name, input, options, code] of mutations) await t.test(name, () => {
    const before = digest(input); const result = execute(input, token, options);
    assert.equal(result.success, false); assert.equal(result.error.code, code); assert.equal(digest(input), before);
  });
  assert.equal(ApprovalAuthority.getTicket(request.request_id).status, 'AUTHORIZED');
});

test('creative execution uses sealed operations without recompilation and detects changed plans', () => {
  const project = fixture();
  const media = path.join(area.root, 'source.bin'); fs.writeFileSync(media, 'verified fixture bytes');
  project.assets.push({ id: 'video', type: 'video', src: media });
  const plan = creativePlan(project);
  const options = { opticalDistortion: { enabled: true, k1: -0.2, k2: -0.05 } };
  const request = ApprovalAuthority.createPendingRequest({ project, creativePlan: plan, options });
  const token = approve(request.request_id, area.store);
  assert.equal(execute(project, token, { creativePlan: { ...plan, creative_intent: { ...plan.creative_intent, goal: 'altered' } } }).success, false);
  assert.equal(execute(project, token, { options: { opticalDistortion: { ...options.opticalDistortion, k1: -0.4 } } }).error.code, 'ERR_APPROVAL_INTEGRITY_MISMATCH');
  const compiler = require('../src/creative/creative-plan-compiler.js').CreativePlanCompiler;
  const original = compiler.compile; compiler.compile = () => { throw new Error('must not recompile'); };
  try {
    const director = new CreativeDirector({ planStore: new PlanStore({ storeDir: path.join(area.root, 'director-plans') }) });
    const result = director.execute({ creativePlan: plan, project, approvalToken: token });
    assert.equal(result.success, true, JSON.stringify(result.error));
    assert.deepEqual(result.operationPlan, request.operation_plan);
  } finally { compiler.compile = original; }
});

test('bound asset content is independently verified and changes invalidate approval', () => {
  const project = fixture(); const media = path.join(area.root, 'asset.bin'); fs.writeFileSync(media, 'original');
  project.assets.push({ id: 'asset', type: 'video', src: media });
  const request = pending(project); const token = approve(request.request_id, area.store);
  assert.equal(ApprovalAuthority.getTicket(request.request_id).execution_record.assets.length, 1);
  fs.writeFileSync(media, 'replacement');
  assert.equal(execute(project, token).error.code, 'ERR_ASSET_INTEGRITY_MISMATCH');
  assert.equal(ApprovalAuthority.getTicket(request.request_id).status, 'AUTHORIZED');
});

test('rejection is durable across restart, revokes issued authorization, and cannot be confirmed', () => {
  const project = fixture(); const request = pending(project); const token = approve(request.request_id, area.store);
  const runner = path.join(__dirname, 'helpers/phase1-confirm-child.cjs');
  const rejected = spawnSync(process.execPath, [runner, area.store, request.request_id, 'reject'], { encoding: 'utf8' });
  assert.equal(rejected.status, 0); assert.equal(ApprovalAuthority.getTicket(request.request_id).status, 'REJECTED');
  assert.match(confirmResult(request.request_id, area.store).output, /ERR_APPROVAL_REJECTED/);
  assert.equal(execute(project, token).error.code, 'ERR_APPROVAL_REJECTED');
});

test('expired pending tickets and issued tokens fail closed without caller-controlled TTL', () => {
  const project = fixture(); const request = pending(project); const token = approve(request.request_id, area.store);
  const original = Date.now; Date.now = () => original() + 600001;
  try { assert.equal(execute(project, token).error.code, 'ERR_APPROVAL_EXPIRED'); }
  finally { Date.now = original; }
  const second = pending(fixture());
  const result = confirmResult(second.request_id, area.store, 'CONFIRM', 600001);
  assert.equal(result.exit, 1); assert.match(result.output, /ERR_APPROVAL_EXPIRED/);
});

test('confirmation refuses a project or asset that changed while pending', () => {
  const project = fixture(); const projectPath = path.join(area.root, 'stale-before-review.json');
  fs.writeFileSync(projectPath, JSON.stringify(project));
  const request = pending(project, { projectPath });
  fs.writeFileSync(projectPath, JSON.stringify({ ...project, revision: project.revision + 1 }));
  const stale = confirmResult(request.request_id, area.store);
  assert.equal(stale.exit, 1); assert.match(stale.output, /ERR_STALE_REVISION/);
  assert.equal(ApprovalAuthority.getTicket(request.request_id).token_sha256, null);
  const asset = path.join(area.root, 'pending-asset.bin'); fs.writeFileSync(asset, 'before');
  const other = fixture(); other.assets.push({ id: 'media', type: 'video', src: asset });
  const pendingAsset = pending(other); fs.writeFileSync(asset, 'after');
  assert.match(confirmResult(pendingAsset.request_id, area.store).output, /ERR_ASSET_INTEGRITY_MISMATCH/);
});

test('altered stored record is rejected even when its execution digest is recomputed', () => {
  const project = fixture(); const request = pending(project); const token = approve(request.request_id, area.store);
  const file = path.join(area.store, `${request.request_id}.json`);
  const record = JSON.parse(fs.readFileSync(file)); record.execution_record.operation_plan.operations[0].params.newDurationTicks = 1;
  record.execution_digest = digest(record.execution_record); fs.writeFileSync(file, JSON.stringify(record));
  assert.equal(execute(project, token).error.code, 'ERR_APPROVAL_INTEGRITY_MISMATCH');
});

test('operation plans bind their own content and true snapshot, ignoring caller hashes', () => {
  const project = fixture(); const p = prepareExecution({ project, operation: operation() });
  const plan = structuredClone(p.record.operation_plan);
  const request = ApprovalAuthority.createPendingRequest({ project, operationPlan: plan });
  const token = approve(request.request_id, area.store);
  const altered = structuredClone(plan); altered.operations[0].params.newDurationTicks = 1;
  assert.equal(execute(project, token, { operationPlan: altered, plan_hash: request.plan_hash }).success, false);
  assert.equal(execute(project, token, { operationPlan: plan }).success, true);
  const stale = { ...plan, project_snapshot: { ...plan.project_snapshot, snapshot_sha256: 'f'.repeat(64) } };
  assert.throws(() => ApprovalAuthority.createPendingRequest({ project, operationPlan: stale }), /ERR_PROJECT_SNAPSHOT_MISMATCH/);
});

test('failure during candidate steps rolls back atomically and preserves active delivery', () => {
  const project = fixture(); const before = structuredClone(project); const session = { active_delivery: { id: 'verified', sha256: 'a'.repeat(64) } };
  const plan = structuredClone(prepareExecution({ project, operation: operation() }).record.operation_plan);
  plan.operations.push({ op_id: 'op-002', step_index: 1, type: 'add_track', target_id: 'second', params: { id: 'second', kind: 'visual' }, dependencies: [] });
  const request = ApprovalAuthority.createPendingRequest({ project, operationPlan: plan }); const token = approve(request.request_id, area.store);
  const original = OperationExecutor.execute; let calls = 0;
  OperationExecutor.execute = function(...args) {
    if (++calls === 2) throw new Error('injected candidate failure after one successful speculative step');
    return original.apply(this, args);
  };
  try {
    const result = execute(project, token);
    assert.equal(result.success, false); assert.equal(result.status, 'ROLLED_BACK'); assert.equal(result.committedSteps, 0);
    assert.equal(result.executedSteps, 1);
    assert.deepEqual(project, before); assert.equal(session.active_delivery.id, 'verified');
    assert.equal(ApprovalAuthority.getTicket(request.request_id).execution.status, 'ROLLED_BACK');
  } finally { OperationExecutor.execute = original; }
});

test('competing OS processes cannot consume one approval twice', async () => {
  const project = fixture(); const projectPath = path.join(area.root, 'race-project.json'); fs.writeFileSync(projectPath, JSON.stringify(project));
  const request = pending(project, { projectPath }); const token = approve(request.request_id, area.store);
  const calls = path.join(area.root, 'race-calls.txt');
  const runner = path.join(__dirname, 'helpers/phase1-execute-child.cjs');
  const children = [0, 1].map(() => fork(runner, [area.store, token, projectPath, 'race', calls], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }));
  const outcomes = children.map(child => new Promise((resolve, reject) => {
    child.on('error', reject); child.on('message', message => { if (message.result) resolve(message.result); });
    child.on('exit', code => { if (code) reject(new Error(`race worker exit ${code}`)); });
  }));
  await Promise.all(children.map(child => new Promise(resolve => child.once('message', resolve))));
  children.forEach(child => child.send('go'));
  const results = await Promise.all(outcomes);
  await Promise.all(children.map(child => new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))));
  assert.equal(results.filter(r => r.success).length, 1);
  assert.equal(results.filter(r => !r.success).length, 1);
  assert.equal(fs.readFileSync(calls, 'utf8'), 'step\n');
  assert.equal(JSON.parse(fs.readFileSync(projectPath)).revision, project.revision + 1);
  console.log('PHASE1_RACE: processes=2 successful_commits=1 rejected=1 executor_steps=1');
});

test('real process crashes before and after commit are not falsely reported as rollback', () => {
  for (const mode of ['crash-before', 'crash-after']) {
    const project = fixture(); const projectPath = path.join(area.root, `${mode}.json`); fs.writeFileSync(projectPath, JSON.stringify(project));
    const request = pending(project, { projectPath }); const token = approve(request.request_id, area.store);
    const run = spawnSync(process.execPath, [path.join(__dirname, 'helpers/phase1-execute-child.cjs'), area.store, token, projectPath, mode], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.signal, 'SIGKILL');
    const disk = JSON.parse(fs.readFileSync(projectPath));
    assert.equal(disk.revision, project.revision + (mode === 'crash-after' ? 1 : 0));
    const retry = ExecutionAuthority.execute({ approvalToken: token, projectPath });
    assert.equal(retry.success, false); assert.equal(retry.error.code, 'ERR_APPROVAL_ALREADY_CONSUMED');
    assert.equal(retry.status, mode === 'crash-after' ? 'FAILED_AFTER_COMMIT' : 'NEEDS_RECONCILIATION');
    assert.equal(retry.committed, mode === 'crash-after');
    assert.deepEqual(JSON.parse(fs.readFileSync(projectPath)), disk);
  }
});

test('journal acknowledgement failure after file commit reports the committed revision truthfully', () => {
  const project = fixture(); const projectPath = path.join(area.root, 'ack-failure.json');
  fs.writeFileSync(projectPath, JSON.stringify(project));
  const delivery = path.join(area.root, 'previous-delivery.bin'); fs.writeFileSync(delivery, 'previous verified bytes');
  const request = pending(project, { projectPath }); const token = approve(request.request_id, area.store);
  const original = ApprovalAuthority._write;
  ApprovalAuthority._write = function(ticket, ...args) {
    if (ticket.execution?.status === 'COMMITTED') throw new Error('injected acknowledgement failure');
    return original.call(this, ticket, ...args);
  };
  try {
    const result = ExecutionAuthority.execute({ approvalToken: token, projectPath });
    assert.equal(result.success, false); assert.equal(result.status, 'FAILED_AFTER_COMMIT');
    assert.equal(result.committed, true); assert.equal(result.committedSteps, 1);
    assert.equal(result.committed_revision, project.revision + 1);
    assert.equal(JSON.parse(fs.readFileSync(projectPath)).revision, project.revision + 1);
    assert.equal(fs.readFileSync(delivery, 'utf8'), 'previous verified bytes');
  } finally { ApprovalAuthority._write = original; }
});

test('approved MCP creation, atomic edit, and batch execution use the common boundary', async () => {
  const request = await EmeMcpServer.handleToolCall('eme_request_user_approval', {
    project: {}, operation: { type: 'create_project', params: { title: 'MCP approved' } }
  });
  const token = approve(request.request_id, area.store);
  const created = await EmeMcpServer.handleToolCall('eme_create_project', { title: 'MCP approved', approval_token: token });
  assert.equal(created.success, true); assert.equal(created.project.title, 'MCP approved');
  const project = fixture();
  const flatOperation = { type: 'trim_clip', clipId: 'title', newDurationTicks: 60000 };
  const edit = pending(project, { operation: flatOperation }); const editToken = approve(edit.request_id, area.store);
  const result = await EmeMcpServer.handleToolCall('eme_execute_operation', { project, operation: flatOperation, approval_token: editToken });
  assert.equal(result.success, true); assert.equal(result.committedSteps, 1);
  const next = pending(result.project, { operation: { type: 'trim_clip', params: { clipId: 'title', newDurationTicks: 30000 } } });
  const nextToken = approve(next.request_id, area.store);
  const batch = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', { project: result.project, operationPlan: next.operation_plan, approval_token: nextToken });
  assert.equal(batch.success, true); assert.equal(batch.project.clips[0].durationTicks, 30000);
});

test('HTTP legacy commit routes and CLI flags fail before mutation; approved HTTP edit/undo/redo remain functional', async () => {
  const project = fixture(); const backend = new EditorBackend({ project, outputDir: path.join(area.root, 'http') });
  const server = http.createServer((req, res) => backend.handleRequest(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body = {}) => {
    const response = await fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    for (const route of ['/api/project/operation', '/api/project/undo', '/api/project/redo', '/api/color/apply', '/api/color-grade/save',
      '/api/capcut/import', '/api/session/init', '/api/session/select', '/api/session/revise', '/api/session/undo', '/api/session/redo', '/api/session/recover',
      '/api/jobs', '/api/jobs/test/approve', '/api/jobs/test/execute', '/api/project/save']) {
      const before = digest(backend.currentProject);
      const result = await post(route, { operation: operation(), approval: true, require_token: false, userConsent: true });
      assert.ok(result.status >= 400, route); assert.equal(digest(backend.currentProject), before, route);
    }
    const prepare = await post('/api/approval/request', { operation: operation() });
    const token = approve(prepare.data.request_id, area.store);
    assert.equal((await post('/api/project/operation', { operation: operation(), approval_token: token })).status, 200);
    for (const action of ['undo', 'redo']) {
      const p = await post('/api/approval/request', { historyAction: action });
      const t = approve(p.data.request_id, area.store);
      assert.equal((await post(`/api/project/${action}`, { approval_token: t })).status, 200);
    }
    assert.equal(backend.currentProject.revision, project.revision + 3);
    for (const [route, clipId] of [['/api/color/apply', 'title'], ['/api/color-grade/save', null]]) {
      const grade = require('../src/engine/color-grade.js').createDefaultColorGrade('grade_approved_color');
      const op = { type: 'attach_color_grade', params: { ...(clipId ? { clipId } : {}), grade, projectLevel: !clipId } };
      const p = await post('/api/approval/request', { operation: op });
      assert.equal(p.status, 200, JSON.stringify(p.data));
      const t = approve(p.data.request_id, area.store);
      assert.equal((await post(route, { ...(clipId ? { clipId } : {}), grade, approval_token: t })).status, 200, route);
    }
    assert.equal(backend.currentProject.revision, project.revision + 5);
  } finally { await new Promise(resolve => server.close(resolve)); }
  for (const args of [['init', path.join(area.root, 'unapproved.json')], ['prompt', 'plan', '--execute'], ['prompt', 'auto'], ['prompt', 'session', 'undo']]) {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../bin/eme.js'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /ERR_APPROVAL_REQUIRED/);
  }
  assert.equal(fs.existsSync(path.join(area.root, 'unapproved.json')), false);
});

test('sealed project creation and CLI execution commit only the reviewed project', () => {
  const projectPath = path.join(area.root, 'created.json');
  const request = ApprovalAuthority.createPendingRequest({ project: {}, operation: { type: 'create_project', params: { title: 'Reviewed creation' } }, projectPath });
  const token = approve(request.request_id, area.store);
  // Use test-only store adapter; actual command handling remains production code.
  const run = spawnSync(process.execPath, ['-e',
    "require('./src/creative/approval-authority').ApprovalAuthority.DEFAULT_STORAGE_DIR=process.argv[1]; require('./src/cli').runCli(['execute-approved','--approval-token',process.argv[2],'--project',process.argv[3]]);",
    area.store, token, projectPath], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(fs.readFileSync(projectPath)).title, 'Reviewed creation');
});
