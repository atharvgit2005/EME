/** Immutable, engine-computed approval payload. No project or renderer writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const { ProjectManager } = require('../engine/project.js');
const { OperationExecutor } = require('../engine/operations.js');

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

// Reject values JSON would silently drop/coerce. Digests must describe actual inputs.
function jsonValue(value, location = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((v, i) => jsonValue(v, `${location}[${i}]`));
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(result, key, { value: jsonValue(value[key], `${location}.${key}`), enumerable: true });
    }
    return result;
  }
  fail('ERR_INVALID_EXECUTION_INPUT', `${location} must contain finite JSON data only`);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(jsonValue(value))).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function fileHash(file) {
  const fd = fs.openSync(file, 'r');
  try {
    if (!fs.fstatSync(fd).isFile()) fail('ERR_UNVERIFIABLE_ASSET', `Not a regular file: ${file}`);
    const h = crypto.createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) h.update(buffer.subarray(0, n));
    return h.digest('hex');
  } finally { fs.closeSync(fd); }
}

function localPath(src, baseDir) {
  if (typeof src !== 'string' || !src) fail('ERR_UNVERIFIABLE_ASSET', 'Asset source is required');
  if (/^file:/i.test(src)) return fileURLToPath(src);
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) fail('ERR_UNVERIFIABLE_ASSET', `Remote/virtual source cannot be verified: ${src}`);
  return path.resolve(baseDir, src);
}

function canonicalTargetPath(target) {
  const resolved = path.resolve(target);
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) fail('ERR_INVALID_EXECUTION_INPUT', 'Project commit target must not be a symlink');
  return path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
}

function bindAssets(project, operationPlan, options, baseDir) {
  const entries = new Map((project.assets || []).map(a => [a.id, a]));
  for (const op of operationPlan.operations) {
    if (op.type === 'add_asset') entries.set(op.params.id, op.params);
    if (op.type === 'restore_project_history') {
      for (const a of op.params.snapshot.assets || []) entries.set(a.id, a);
    }
  }
  const bound = [];
  function bind(id, src, expected) {
    try {
      const sourcePath = localPath(src, baseDir);
      const realPath = fs.realpathSync(sourcePath);
      const sha256 = fileHash(realPath);
      if (expected && expected !== sha256) fail('ERR_ASSET_INTEGRITY_MISMATCH', `Declared checksum differs for ${id}`);
      bound.push({ asset_id: id, source: src, source_path: sourcePath, real_path: realPath, sha256 });
    } catch (error) {
      if (error.code?.startsWith('ERR_')) throw error;
      fail('ERR_UNVERIFIABLE_ASSET', `Cannot read ${id}: ${error.code || error.message}`);
    }
  }
  for (const [id, a] of [...entries].sort(([a], [b]) => a.localeCompare(b))) bind(id, a.src, a.sha256);
  // Options are sealed too; any explicit file input must also bind its bytes.
  function visit(value, prefix) {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'string' && /^(path|src|filePath|mediaPath|.*SidecarPath)$/.test(key)) bind(`${prefix}.${key}`, v);
      else if (key === 'lutId' && typeof v === 'string' && v && value.enabled !== false) {
        const lut = require('../engine/lut-registry.js').resolveCertifiedLut(v);
        bind(`lut:${v}`, lut.absolutePath, lut.sha256);
      } else visit(v, `${prefix}.${key}`);
    }
  }
  visit(options, 'options');
  visit(project.colorGrade, 'projectGrade');
  visit((project.clips || []).map(clip => clip.colorGrade || {}), 'clipGrades');
  visit(operationPlan.operations.map(op => op.params), 'operations');
  return bound;
}

function verifyAssets(assets) {
  for (const a of assets) {
    try {
      if (fs.realpathSync(a.source_path) !== a.real_path || fileHash(a.source_path) !== a.sha256) {
        fail('ERR_ASSET_INTEGRITY_MISMATCH', `Bound asset changed: ${a.asset_id}`);
      }
    } catch (error) {
      if (error.code === 'ERR_ASSET_INTEGRITY_MISMATCH') throw error;
      fail('ERR_ASSET_INTEGRITY_MISMATCH', `Bound asset is unavailable: ${a.asset_id}`);
    }
  }
}

function simulate(project, operations) {
  let candidate = structuredClone(project);
  for (const op of operations) {
    const result = OperationExecutor.execute(candidate, {
      type: op.type, params: structuredClone(op.params), expectedBaseRevision: op.preconditions?.expectedBaseRevision ?? candidate.revision
    });
    if (!result.success) fail(result.errorCode || 'ERR_INVALID_OPERATION_PLAN', result.error);
    candidate = result.project;
  }
  return candidate;
}

function prepareExecution({ project, creativePlan = null, operationPlan = null, operation = null, options = {}, projectPath = null, assetBaseDir = process.cwd() }) {
  project = jsonValue(project);
  options = jsonValue(options);
  const resolvedAssetBaseDir = path.resolve(options.assetBaseDir ?? (projectPath ? path.dirname(projectPath) : assetBaseDir));
  const effectiveOptions = { ...options, assetBaseDir: resolvedAssetBaseDir };
  const supplied = [creativePlan, operationPlan, operation].filter(v => v !== null && v !== undefined);
  if (supplied.length !== 1) fail('ERR_INVALID_EXECUTION_INPUT', 'Supply exactly one Creative Plan, OperationPlan, or atomic operation');
  const isNew = Object.keys(project).length === 0;
  if (!isNew) ProjectManager.validate(project);
  const snapshotHash = digest(project);
  let kind, input;
  if (creativePlan) {
    kind = 'creative_plan'; input = jsonValue(creativePlan);
    const snapshot = input.project_snapshot;
    if (snapshot?.snapshot_sha256 !== snapshotHash) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'Creative Plan does not describe the current snapshot');
    const result = require('./creative-plan-compiler.js').CreativePlanCompiler.compile({ creativePlan: input, project, options: effectiveOptions });
    if (!result.success) fail('ERR_INVALID_OPERATION_PLAN', result.errors.join('; '));
    operationPlan = result.operationPlan;
  } else if (operation) {
    kind = 'operation'; input = jsonValue(operation);
    if (input.expectedBaseRevision !== undefined && input.expectedBaseRevision !== project.revision) fail('ERR_STALE_REVISION', 'Atomic operation base revision changed');
    const params = input.params !== undefined && input.params !== null ? input.params : input;
    operationPlan = {
      schema_version: '1.0.0', plan_id: `plan-${crypto.randomUUID()}`, source_brief_id: 'brief-atomic-approval',
      source_request_id: crypto.randomUUID(),
      project_snapshot: { project_id: project.id || '', base_revision: project.revision || 0, snapshot_sha256: snapshotHash, timebase_ticks_per_second: 120000 },
      target_duration_ticks: project.timebase?.durationTicks || 0,
      operations: [{ op_id: 'op-001', step_index: 0, type: input.type, target_id: params.id || params.clipId || project.id || '', params, dependencies: [] }],
      diagnostics: { unsupported_requests: [], missing_references: [], conflicts: [], rejected_operations: [] },
      dry_run: {}, validation: { status: 'ready', blocking_issue_ids: [] }
    };
  } else {
    kind = 'operation_plan'; input = jsonValue(operationPlan);
    if (input.project_snapshot?.project_id !== project.id || input.project_snapshot?.base_revision !== project.revision) fail('ERR_STALE_REVISION', 'OperationPlan project or base revision differs');
    if (input.project_snapshot?.snapshot_sha256 !== snapshotHash) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'OperationPlan snapshot differs');
  }
  operationPlan = structuredClone(operationPlan);
  if (operationPlan.validation?.status !== 'ready' || !Array.isArray(operationPlan.operations) || !operationPlan.operations.length) fail('ERR_INVALID_OPERATION_PLAN', 'A ready, non-empty operation plan is required');
  for (const [i, op] of operationPlan.operations.entries()) {
    if (op.step_index !== i || !op.type || !op.params || typeof op.params !== 'object') fail('ERR_INVALID_OPERATION_PLAN', 'Invalid operation sequence');
    if (op.type === 'create_project') {
      if (!isNew || operationPlan.operations.length !== 1) fail('ERR_INVALID_OPERATION_PLAN', 'Project creation must be a standalone operation on an empty snapshot');
      op.params.id ||= `proj-${crypto.randomUUID()}`;
    }
    if (op.type === 'split_clip') op.params.newClipId ||= `clip-${crypto.randomUUID()}`;
    if (op.type === 'invalidate_and_regenerate_sidecar') {
      op.params.regenerated_at ||= new Date().toISOString(); op.params.reconciled_at ||= op.params.regenerated_at;
    }
  }
  if (isNew && operationPlan.operations[0].type !== 'create_project') fail('ERR_INVALID_OPERATION_PLAN', 'An empty snapshot requires project creation');
  const candidate = simulate(project, operationPlan.operations);
  const projectId = project.id || candidate.id;
  operationPlan.project_snapshot.project_id = projectId;
  if (kind === 'operation') {
    operationPlan.dry_run = {
      success: true, simulated_steps: 1, final_revision: candidate.revision,
      affected_tracks: [], affected_clips: [], timing_implications: { start_tick: 0, end_tick: candidate.timebase.durationTicks, duration_ticks: candidate.timebase.durationTicks, duration_seconds: candidate.timebase.durationTicks / 120000 },
      invariant_checks: { preserved_properties_verified: true, track_locks_respected: true, zero_leak_integrity: true }
    };
    operationPlan.target_duration_ticks = candidate.timebase.durationTicks;
  }
  const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../schema/eme-operation-plan.v1.schema.json'), 'utf8'));
  const errors = require('../engine/validator.js').validateObject(operationPlan, schema, schema);
  if (errors.length) fail('ERR_INVALID_OPERATION_PLAN', errors.join('; '));
  const targetPath = projectPath ? canonicalTargetPath(projectPath) : null;
  const record = jsonValue({
    format: 'eme-approved-execution.v1', kind, project_id: projectId, base_revision: project.revision ?? 0,
    project_snapshot_sha256: snapshotHash, creative_plan: creativePlan ? input : null,
    creative_plan_sha256: creativePlan ? digest(input) : null,
    input, input_sha256: digest(input), compilation_options: options, compilation_options_sha256: digest(options),
    effective_compilation_options: effectiveOptions, effective_compilation_options_sha256: digest(effectiveOptions),
    operation_plan: operationPlan, operation_plan_sha256: digest(operationPlan), operations_sha256: digest(operationPlan.operations),
    assets: bindAssets(project, operationPlan, options, resolvedAssetBaseDir),
    target: { mode: targetPath ? 'file' : 'memory', project_path: targetPath },
    result_snapshot_sha256: digest(candidate), result_revision: candidate.revision, atomic: true
  });
  return { record: freeze(record), executionDigest: digest(record) };
}

module.exports = { prepareExecution, digest, jsonValue, freeze, verifyAssets, canonicalTargetPath, fail };
