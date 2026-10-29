/**
 * Editing Mechanics Engine (EME) - Edit Brief Compilation Engine Tests (Phase PF-02)
 *
 * Verifies the compilation of validated EditBriefs into deterministic, declarative
 * OperationPlans and non-mutating dry-run verification via OperationExecutor.
 * Strictly adheres to ChatGPT Phase PF-02 specification in plans/CHATGPT_PHASE_A1_RESPONSE.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  OperationPlanCompiler,
  BriefValidator
} = require('../src/prompt-core/index.js');
const { ProjectManager } = require('../src/engine/project.js');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/prompt-core');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, relPath), 'utf8'));
}

// 1. Schema Conformance
test('PF-02 Schema: eme-operation-plan.v1.schema.json validates plan structure', () => {
  const schema = BriefValidator.getSchema('eme-operation-plan.v1.schema.json');
  assert.ok(schema && schema.$id, 'Schema must be loaded with valid $id');
  assert.equal(schema.title, 'EditingMechanicsEngineOperationPlan');
});

// 2. First Certification Scenario (10s Three-Clip Social Edit)
test('PF-02 Certification: 10-second vertical social edit compiles with exact 1,200,000 ticks', () => {
  const project = loadJson('projects/project-pf02-scenario1.json');
  const brief = loadJson('briefs/brief-pf02-scenario1.json');

  const initialRevision = project.revision;
  const initialClips = structuredClone(project.clips);

  const plan = OperationPlanCompiler.compilePlan({
    brief,
    project,
    options: { planId: 'plan-pf02-scenario1-cert' }
  });

  // Verify plan status and schema validation
  assert.equal(plan.validation.status, 'ready', 'Plan must be ready for execution');
  assert.equal(plan.target_duration_ticks, 1200000, 'Target duration must be exactly 10s (1,200,000 ticks)');
  assert.equal(plan.operations.length, 6, 'Must generate exactly 6 atomic operations (trim and move per clip)');

  // Verify operations structure & sequential layout
  const op1 = plan.operations[0];
  assert.equal(op1.type, 'trim_clip');
  assert.equal(op1.target_id, 'clip_1');
  assert.equal(op1.params.durationTicks, 400000);

  const op2 = plan.operations[1];
  assert.equal(op2.type, 'move_clip');
  assert.equal(op2.target_id, 'clip_1');
  assert.equal(op2.params.targetTick, 0);

  const op3 = plan.operations[2];
  assert.equal(op3.type, 'trim_clip');
  assert.equal(op3.target_id, 'clip_2');
  assert.equal(op3.params.durationTicks, 400000);

  const op4 = plan.operations[3];
  assert.equal(op4.type, 'move_clip');
  assert.equal(op4.target_id, 'clip_2');
  assert.equal(op4.params.targetTick, 400000);

  const op5 = plan.operations[4];
  assert.equal(op5.type, 'trim_clip');
  assert.equal(op5.target_id, 'clip_3');
  assert.equal(op5.params.durationTicks, 400000);

  const op6 = plan.operations[5];
  assert.equal(op6.type, 'move_clip');
  assert.equal(op6.target_id, 'clip_3');
  assert.equal(op6.params.targetTick, 800000);

  // Verify Dry-Run Simulation Results
  assert.equal(plan.dry_run.success, true, 'Dry-run must succeed');
  assert.equal(plan.dry_run.simulated_steps, 6, 'All 6 steps simulated');
  assert.equal(plan.dry_run.final_revision, 7, 'Dry-run simulates revision advancing to 7');
  assert.equal(plan.dry_run.timing_implications.duration_ticks, 1200000, 'Dry-run duration must match 1,200,000 ticks');
  assert.equal(plan.dry_run.timing_implications.duration_seconds, 10.0);
  assert.deepEqual(plan.dry_run.affected_clips, ['clip_1', 'clip_2', 'clip_3']);

  // Non-mutating Invariant: Live project object must NOT be mutated
  assert.equal(project.revision, initialRevision, 'Original project revision must remain unchanged');
  assert.deepEqual(project.clips, initialClips, 'Original project clips must remain unchanged');
});

// 3. Determinism & Canonical Serialization
test('PF-02 Determinism: Identical inputs produce byte-identical canonical plan serialization', () => {
  const project = loadJson('projects/project-pf02-scenario1.json');
  const brief = loadJson('briefs/brief-pf02-scenario1.json');

  const planA = OperationPlanCompiler.compilePlan({ brief, project, options: { planId: 'plan-fixed-determinism' } });
  const planB = OperationPlanCompiler.compilePlan({ brief, project, options: { planId: 'plan-fixed-determinism' } });

  const strA = OperationPlanCompiler.serializeCanonicalPlan(planA);
  const strB = OperationPlanCompiler.serializeCanonicalPlan(planB);

  assert.equal(strA, strB, 'Serialized canonical plans must be byte-identical');
});

// 4. Invalid References Fail Closed
test('PF-02 Fail-Closed: Missing clip reference is rejected with structured diagnostics', () => {
  const project = loadJson('projects/project-pf02-scenario1.json');
  const brief = loadJson('briefs/brief-pf02-missing-clip.json');

  const plan = OperationPlanCompiler.compilePlan({ brief, project });

  assert.equal(plan.validation.status, 'blocked');
  assert.ok(plan.validation.blocking_issue_ids.includes('ERR_MISSING_CLIP_REFERENCE'));
  assert.ok(plan.diagnostics.missing_references.some(m => m.includes('non_existent_clip_xyz')));
  assert.equal(plan.operations.length, 0, 'Must generate zero operations for missing reference');
});

// 5. Locked Tracks Protection
test('PF-02 Track Locking: Modification of clip on locked track is blocked', () => {
  const project = loadJson('projects/project-pf02-locked-track.json');
  const brief = {
    schema_version: '1.0.0',
    brief_id: 'brief-pf02-locked-test',
    source_request_id: 'req-pf02-locked',
    project_snapshot: {
      project_id: project.id,
      base_revision: project.revision,
      snapshot_sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      timebase_ticks_per_second: 120000
    },
    goal: { objective: 'Edit locked track clip', success_criteria: ['Fail closed'] },
    requested_changes: [
      { change_id: 'CHG-LOCKED', domain: 'timeline', description: 'Trim locked clip', target_ids: ['clip_locked_01'] }
    ],
    constraints: [],
    deliverables: [],
    ambiguities: [],
    validation: { status: 'ready', blocking_issue_ids: [] }
  };

  const plan = OperationPlanCompiler.compilePlan({ brief, project });

  assert.equal(plan.validation.status, 'blocked');
  assert.ok(plan.validation.blocking_issue_ids.includes('ERR_TRACK_LOCKED'));
  assert.ok(plan.diagnostics.conflicts.some(c => c.includes('track_v_locked is locked')));
});

// 6. Concurrency & Stale Revision Protection
test('PF-02 Concurrency: Stale project base revision is rejected before compilation', () => {
  const project = loadJson('projects/project-pf02-scenario1.json'); // revision: 1
  const brief = loadJson('briefs/brief-pf02-stale-rev.json'); // base_revision: 0

  const plan = OperationPlanCompiler.compilePlan({ brief, project });

  assert.equal(plan.validation.status, 'blocked');
  assert.ok(plan.validation.blocking_issue_ids.includes('ERR_STALE_REVISION'));
  assert.ok(plan.diagnostics.conflicts.some(c => c.includes('Stale project revision')));
});

// 7. Contradictory Constraints Conflict Reporting
test('PF-02 Conflicts: Contradictory color requirements fail with needs_clarification', () => {
  const project = loadJson('projects/project-pf02-scenario1.json');
  const brief = loadJson('briefs/brief-pf02-conflict.json');

  const plan = OperationPlanCompiler.compilePlan({ brief, project });

  assert.equal(plan.validation.status, 'needs_clarification');
  assert.ok(plan.validation.blocking_issue_ids.includes('ERR_CONTRADICTORY_CONSTRAINTS'));
  assert.ok(plan.diagnostics.conflicts.some(c => c.includes('Contradictory requirements')));
});

// 8. Execution Integration via OperationExecutor
test('PF-02 Execution: Approved plan executes through OperationExecutor to target state', () => {
  const project = loadJson('projects/project-pf02-scenario1.json');
  const brief = loadJson('briefs/brief-pf02-scenario1.json');

  const plan = OperationPlanCompiler.compilePlan({ brief, project });
  assert.equal(plan.validation.status, 'ready');

  const result = OperationPlanCompiler.executePlan(project, plan);

  assert.equal(result.success, true);
  assert.equal(result.executedSteps, 6);
  assert.equal(result.project.revision, 7);

  // Validate resulting project invariants
  const val = ProjectManager.validateProject(result.project);
  assert.equal(val.valid, true, 'Resulting project must pass complete validation');

  // Verify resulting clip layout
  const clips = result.project.clips;
  const c1 = clips.find(c => c.id === 'clip_1');
  const c2 = clips.find(c => c.id === 'clip_2');
  const c3 = clips.find(c => c.id === 'clip_3');

  assert.equal(c1.startTick, 0);
  assert.equal(c1.durationTicks, 400000);

  assert.equal(c2.startTick, 400000);
  assert.equal(c2.durationTicks, 400000);

  assert.equal(c3.startTick, 800000);
  assert.equal(c3.durationTicks, 400000);

  const totalDuration = c3.startTick + c3.durationTicks;
  assert.equal(totalDuration, 1200000, 'Final timeline duration must be exactly 10 seconds');
});
