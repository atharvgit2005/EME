/**
 * Editing Mechanics Engine (EME) - Prompt Core Contract & Regression Tests (PF-01)
 * Validates canonical IntentEnvelope & EditBrief schemas, zero-tolerance hard constraints,
 * deterministic readiness evaluation, golden fixtures, and project immutability.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  compileEditBrief,
  extractIntentEnvelope,
  BriefValidator,
  ContextNormalizer,
  ReferenceResolver,
  ConstraintNormalizer,
  ReadinessEvaluator
} = require('../src/prompt-core/index.js');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/prompt-core');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, relPath), 'utf8'));
}

test('PF-01 Contract: Schemas load and validate correctly', () => {
  const envelopeSchema = BriefValidator.getSchema('eme-intent-envelope.v1.schema.json');
  const constraintSchema = BriefValidator.getSchema('eme-constraint.v1.schema.json');
  const briefSchema = BriefValidator.getSchema('eme-edit-brief.v1.schema.json');

  assert.ok(envelopeSchema && envelopeSchema.$id);
  assert.ok(constraintSchema && constraintSchema.$id);
  assert.ok(briefSchema && briefSchema.$id);
});

test('PF-01 ContextNormalizer: Computes deterministic SHA-256 fingerprint', () => {
  const p1 = loadJson('projects/project-g01-export.json');
  const c1 = ContextNormalizer.normalizeProjectContext(p1);
  const c2 = ContextNormalizer.normalizeProjectContext(p1);

  assert.equal(c1.snapshot_sha256, c2.snapshot_sha256);
  assert.match(c1.snapshot_sha256, /^[a-f0-9]{64}$/);
  assert.equal(c1.timebase_ticks_per_second, 120000);
  assert.equal(c1.base_revision, 0);
  assert.equal(c1.project_id, 'proj_g01_export');
});

test('PF-01 ReferenceResolver: Resolves semantic roles and entity hints', () => {
  const p1 = loadJson('projects/project-g01-export.json');
  const dialogueRes = ReferenceResolver.resolveTargets(p1, { kind: 'role', role: 'dialogue' });
  assert.equal(dialogueRes.unresolved, false);
  assert.deepEqual(dialogueRes.resolvedIds, ['clip_a1']);

  const p2 = loadJson('projects/project-g02-reel.json');
  const hintRes = ReferenceResolver.resolveTargets(p2, { hint: 'interview_01' });
  assert.equal(hintRes.unresolved, false);
  assert.ok(hintRes.resolvedIds.includes('asset_interview_01'));

  const unknownRes = ReferenceResolver.resolveTargets(p2, { hint: 'non_existent_asset_xyz' });
  assert.equal(unknownRes.unresolved, true);
});

test('PF-01 ConstraintNormalizer: Survives normalization without weakening', () => {
  const p1 = loadJson('projects/project-g01-export.json');
  const rawConstraints = [
    { source_text: 'Preserve existing color grade', polarity: 'positive_invariant' },
    { source_text: 'Do not add music', polarity: 'negative_prohibition' },
    { source_text: 'Do not change any existing clip timing', polarity: 'positive_invariant' }
  ];

  const res = ConstraintNormalizer.normalizeConstraints(rawConstraints, p1, 0);
  assert.equal(res.errors.length, 0);
  assert.equal(res.constraints.length, 3);

  for (const c of res.constraints) {
    assert.equal(c.strength, 'hard', 'Hard constraints must never be downgraded');
    assert.equal(c.on_violation, 'block', 'Violations must strictly block');
    assert.equal(c.on_unknown, 'block', 'Unknown constraints must fail closed');
    assert.ok(c.verify_at.includes('plan_preflight'));
  }
});

test('PF-01 Golden Case G01: Export-only while preserving timing, grade, audio; forbids music', () => {
  const project = loadJson('projects/project-g01-export.json');
  const rawPrompt = 'Export this project as an MP4 video at 1080p. Preserve existing clip timing, grade, and audio edit. Do not add music.';

  const projectBefore = JSON.stringify(project);

  const res = compileEditBrief({
    rawPrompt,
    project,
    options: { briefId: 'brief-pf01-g01-export', requestId: 'req-pf01-g01' }
  });

  // Zero project mutation invariant
  assert.equal(JSON.stringify(project), projectBefore, 'compileEditBrief must not mutate project state');

  // Schema validation
  assert.equal(res.valid, true, `Brief validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.validation.status, 'ready');
  assert.equal(res.validation.blocking_issue_ids.length, 0);

  // Constraints check
  assert.ok(res.brief.constraints.length >= 3);
  const hasMusicProhibition = res.brief.constraints.some(c => 
    c.type === 'forbid_effect' && (c.forbidden_effects || []).includes('music_content_added')
  );
  assert.ok(hasMusicProhibition, 'Music prohibition constraint must be present');

  // Verify against committed expected fixture
  const expected = loadJson('expected/brief-g01-expected.json');
  assert.equal(res.brief.validation.status, expected.validation.status);
  assert.equal(res.brief.project_snapshot.snapshot_sha256, expected.project_snapshot.snapshot_sha256);
  assert.equal(res.brief.constraints.length, expected.constraints.length);
});

test('PF-01 Golden Case G02: Compound 30s vertical reel cut with dialogue protection', () => {
  const project = loadJson('projects/project-g02-reel.json');
  const rawPrompt = 'Cut a 30s vertical reel from interview_01. Preserve dialogue timing and keep original dialogue timing unchanged. Do not add music.';

  const projectBefore = JSON.stringify(project);

  const res = compileEditBrief({
    rawPrompt,
    project,
    options: { briefId: 'brief-pf01-g02-reel', requestId: 'req-pf01-g02' }
  });

  // Zero project mutation invariant
  assert.equal(JSON.stringify(project), projectBefore, 'compileEditBrief must not mutate project state');

  // Schema validation
  assert.equal(res.valid, true, `Brief validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.validation.status, 'ready');
  assert.equal(res.validation.blocking_issue_ids.length, 0);

  // Check deliverable vertical canvas
  assert.equal(res.brief.deliverables[0].video.width, 1080);
  assert.equal(res.brief.deliverables[0].video.height, 1920);

  // Check dialogue protection constraint
  const dialogueConstraint = res.brief.constraints.find(c => c.type === 'preserve_fields');
  assert.ok(dialogueConstraint, 'Dialogue field preservation constraint must be present');
  assert.ok(dialogueConstraint.fields.includes('timeline_interval'));

  // Verify against committed expected fixture
  const expected = loadJson('expected/brief-g02-expected.json');
  assert.equal(res.brief.validation.status, expected.validation.status);
  assert.equal(res.brief.constraints.length, expected.constraints.length);
});

test('PF-01 Golden Case G03: Contradictory color requirements fail closed with needs_clarification', () => {
  const project = loadJson('projects/project-g03-contradiction.json');
  const rawPrompt = 'Make warmer by changing color grade, but preserve existing color grade.';

  const projectBefore = JSON.stringify(project);

  const res = compileEditBrief({
    rawPrompt,
    project,
    options: { briefId: 'brief-pf01-g03-contradiction', requestId: 'req-pf01-g03' }
  });

  // Zero project mutation invariant
  assert.equal(JSON.stringify(project), projectBefore, 'compileEditBrief must not mutate project state');

  // Schema validation (must still be a valid schema document even when blocked/needs_clarification)
  assert.equal(res.valid, true, `Brief schema validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.validation.status, 'needs_clarification', 'Contradictory brief must require clarification');
  assert.ok(res.validation.blocking_issue_ids.length > 0, 'Must have at least one blocking issue ID');

  const hasConflict = res.brief.ambiguities.some(a => a.kind === 'CONFLICTING_REQUIREMENTS' && a.is_blocking);
  assert.ok(hasConflict, 'Ambiguities must report CONFLICTING_REQUIREMENTS');

  // Verify against committed expected fixture
  const expected = loadJson('expected/brief-g03-expected.json');
  assert.equal(res.brief.validation.status, expected.validation.status);
  assert.deepEqual(res.brief.validation.blocking_issue_ids, expected.validation.blocking_issue_ids);
});

test('PF-01 Fail-Closed: Unknown hard constraint throws and fails closed', () => {
  const project = loadJson('projects/project-g01-export.json');
  assert.throws(() => {
    ConstraintNormalizer.normalizeSingleConstraint({
      source_text: 'Magically make the video feel nostalgic and dreamy'
    }, project);
  }, /Unknown or unverifiable constraint/);
});

test('PF-01 Fail-Closed: Stale project revision is blocked by ReadinessEvaluator', () => {
  const project = loadJson('projects/project-g01-export.json');
  const res = compileEditBrief({
    rawPrompt: 'Export this project as an MP4 video at 1080p.',
    project,
    options: { briefId: 'brief-test-stale' }
  });

  // Simulate stale revision
  const evalResult = ReadinessEvaluator.evaluate(res.brief, {
    currentProjectRevision: 99 // Higher than brief's revision 0
  });

  assert.equal(evalResult.status, 'blocked');
  assert.ok(evalResult.blocking_issue_ids.includes('ERR_STALE_REVISION'));
});

test('PF-01 CLI: prompt inspect outputs valid brief without mutation', () => {
  const { execSync } = require('node:child_process');
  const projectPath = 'fixtures/prompt-core/projects/project-g01-export.json';
  const out = execSync(`node src/cli/index.js prompt inspect ${projectPath} --prompt "Export project" --json`, {
    encoding: 'utf8'
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.schema_version, '1.0.0');
  assert.equal(parsed.project_snapshot.project_id, 'proj_g01_export');
  assert.equal(parsed.validation.status, 'ready');
});
