import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SCHEMAS_DIR = path.join(ROOT, 'src', 'decision-fabric', 'schemas');
const POLICY_PATH = path.join(ROOT, 'src', 'decision-fabric', 'policy', 'routing-policy.json');

test('Decision Fabric M0: Validate Schema and Contract Integrity', async (t) => {
  await t.test('eme-router question schema conforms to Laya specification', () => {
    const routerSchemaPath = path.join(SCHEMAS_DIR, 'eme-router', 'questions.json');
    assert.ok(fs.existsSync(routerSchemaPath), 'eme-router/questions.json must exist');

    const schema = JSON.parse(fs.readFileSync(routerSchemaPath, 'utf8'));
    assert.ok(schema.intent, 'intent question must be present');
    assert.equal(schema.intent.type, 'choice');
    assert.ok(typeof schema.intent.instructions === 'string' && schema.intent.instructions.length > 20);
    assert.ok(schema.intent.criteria && typeof schema.intent.criteria === 'object');

    const criteriaKeys = Object.keys(schema.intent.criteria);
    assert.equal(criteriaKeys.length, 10, 'Must have exactly 10 canonical routing categories');
    assert.ok(criteriaKeys.includes('needs_planning'), 'needs_planning must be present');
    assert.ok(criteriaKeys.includes('color_grading'), 'color_grading must be present');
    assert.ok(criteriaKeys.includes('timeline_manipulation'), 'timeline_manipulation must be present');

    assert.ok(schema.requires_multistep_plan, 'requires_multistep_plan question must be present');
    assert.equal(schema.requires_multistep_plan.type, 'noul');
    assert.ok(schema.requires_multistep_plan.labels);
    assert.ok(schema.requires_multistep_plan.labels.true);
    assert.ok(schema.requires_multistep_plan.labels.false);
  });

  await t.test('eme-color-mood question schema conforms to Laya specification', () => {
    const colorSchemaPath = path.join(SCHEMAS_DIR, 'eme-color-mood', 'questions.json');
    assert.ok(fs.existsSync(colorSchemaPath), 'eme-color-mood/questions.json must exist');

    const schema = JSON.parse(fs.readFileSync(colorSchemaPath, 'utf8'));
    assert.ok(schema.color_mood, 'color_mood question must be present');
    assert.equal(schema.color_mood.type, 'choice');

    const lutKeys = Object.keys(schema.color_mood.criteria);
    assert.equal(lutKeys.length, 6, 'Must have 5 certified LUTs plus needs_review sentinel');
    assert.ok(lutKeys.includes('needs_review'), 'needs_review sentinel must be present');
    assert.ok(lutKeys.includes('bleach_bypass'));
    assert.ok(lutKeys.includes('warm_golden'));
    assert.ok(lutKeys.includes('teal_orange'));
    assert.ok(lutKeys.includes('cinematic_contrast'));
    assert.ok(lutKeys.includes('true_tone'));
  });

  await t.test('eme-timeline-arbiter question schema conforms to Laya specification', () => {
    const timelineSchemaPath = path.join(SCHEMAS_DIR, 'eme-timeline-arbiter', 'questions.json');
    assert.ok(fs.existsSync(timelineSchemaPath), 'eme-timeline-arbiter/questions.json must exist');

    const schema = JSON.parse(fs.readFileSync(timelineSchemaPath, 'utf8'));
    assert.ok(schema.gap_review_risk, 'gap_review_risk must be present');
    assert.equal(schema.gap_review_risk.type, 'noul');

    assert.ok(schema.pacing_energy, 'pacing_energy must be present');
    assert.equal(schema.pacing_energy.type, 'score');
    assert.ok(Array.isArray(schema.pacing_energy.criteria));
    assert.equal(schema.pacing_energy.criteria.length, 5, 'Must have 5 ordinal pacing energy levels');

    assert.ok(schema.snapping_mode, 'snapping_mode must be present');
    assert.equal(schema.snapping_mode.type, 'choice');
    assert.ok(schema.snapping_mode.criteria.keep_current);
    assert.ok(schema.snapping_mode.criteria.needs_review);
  });

  await t.test('routing-policy.json matches schemas and enforces closed vocabulary', () => {
    assert.ok(fs.existsSync(POLICY_PATH), 'routing-policy.json must exist');
    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

    assert.equal(policy.invariants.advisory_only, true, 'Laya must be advisory only');
    assert.equal(policy.invariants.allow_direct_mutations, false, 'No direct mutations permitted');
    assert.equal(policy.invariants.closed_vocabulary_strict, true);

    const routerSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'eme-router', 'questions.json'), 'utf8'));
    const expectedRoutes = Object.keys(routerSchema.intent.criteria).sort();
    assert.deepEqual(policy.allowed_routes.slice().sort(), expectedRoutes, 'Policy routes must exactly match schema criteria');

    const colorSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'eme-color-mood', 'questions.json'), 'utf8'));
    const certifiedLuts = policy.certified_lut_ids.slice().sort();
    const schemaLuts = Object.keys(colorSchema.color_mood.criteria).filter(k => k !== 'needs_review').sort();
    assert.deepEqual(certifiedLuts, schemaLuts, 'Certified LUTs must match non-sentinel color criteria');

    // Verify sentinel rules
    assert.ok(policy.policy_sentinels.needs_review);
    assert.deepEqual(policy.policy_sentinels.needs_review.disallowed_in_engines, ['lut_engine', 'timeline_engine']);
  });
});
