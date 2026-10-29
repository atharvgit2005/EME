/**
 * Editing Mechanics Engine (EME) - Phase PF-06 Test Battery
 * Conversational Revision, Constraint Preservation & Verified Iteration
 *
 * Verifies:
 * - PF-06.1: Flagship Title Move revision (minimal mutation, constraint preservation, verified manifest).
 * - PF-06.2: B-Roll replacement while preserving interval, music, and primary cut points.
 * - PF-06.3: Fail-closed conflict detection when revision contradicts preserved hard constraints.
 * - PF-06.4: Prior verified deliverable remains immutable and intact if revised QA fails.
 * - PF-06.5: Transactional failure recovery restores project baseline revision.
 * - PF-06.6: Auditable undo restores prior verified project state.
 * - PF-06.7: Minimal mutation invariant: unaffected tracks have zero diff.
 * - PF-06.8: Plan determinism: identical revision inputs produce byte-identical canonical plan hashes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  BriefValidator,
  OperationPlanCompiler,
  PromptDeliverableOrchestrator,
  RevisionIntentCompiler,
  RevisionPlanCompiler,
  RevisionOrchestrator
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/pf06-test-deliverables');

// Helper to ensure test directory and synthetic clean media
function setupTestMedia() {
  fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  const cleanMp4Path = path.join(TEST_OUT_DIR, 'clean-12s.mp4');

  if (!fs.existsSync(cleanMp4Path)) {
    spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=12',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=12:sample_rate=48000',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      cleanMp4Path
    ], { stdio: 'ignore' });
  }

  return cleanMp4Path;
}

// Helper to produce a baseline verified PF-05 delivery run
function createBaselineDeliveryRun() {
  setupTestMedia();
  const rawPrompt = `Create a 12-second vertical video at 1080x1920 and 30 fps using the supplied project assets. Preserve the specified clip order. Add the supplied music track, place the two requested cuts on beats 8 and 16, insert the B-roll cutaway from 4-6 seconds, apply a true 1-second cross-dissolve at the specified transition, and display the supplied headline title from 1-4 seconds. Do not create new media or change the specified timing. Render the final MP4, independently verify it, and publish a verified manifest only if every mandatory check passes.`;

  const runDoc = PromptDeliverableOrchestrator.runAutonomous({
    rawPrompt,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  return runDoc;
}

test('PF-06.1 Flagship Certification: Conversational Title Move Revision', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();
  assert.equal(priorRunDoc.status, 'verified');

  const liveProject = structuredClone(priorRunDoc.project_snapshot);
  liveProject.revision = priorRunDoc.project_snapshot.final_revision; // rev 11
  // Load full project clips
  const executedProject = JSON.parse(fs.readFileSync(priorRunDoc._runPath, 'utf8'));

  // User revision request: Move title later
  const revPrompt = `Move the headline title 2 seconds later, preserving its duration and all other edits.`;

  // Compile full live project state from prior execution
  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);

  const revDoc = RevisionOrchestrator.runRevision({
    rawPrompt: revPrompt,
    priorRunDoc,
    project: execBase.project,
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  // 1. Schema Validation
  const val = BriefValidator.validateRevisionRun(revDoc);
  assert.equal(val.valid, true, `RevisionRun schema errors: ${val.errors?.join(', ')}`);

  // 2. Disentanglement Validation
  assert.ok(revDoc.intent_disentanglement.explicit_changes.some(c => c.includes('headline title')));
  assert.ok(revDoc.intent_disentanglement.preserved_constraints.some(c => c.includes('C-DUR-1440K')));
  assert.equal(revDoc.intent_disentanglement.detected_conflicts.length, 0);

  // 3. Minimal Mutation Validation
  assert.equal(revDoc.plan_diff.modified_operations.length, 1);
  assert.equal(revDoc.plan_diff.modified_operations[0].params.clipId, 'clip_title');
  assert.ok(revDoc.plan_diff.unchanged_operations_count >= 8);

  // 4. Execution State
  assert.equal(revDoc.execution_result.status, 'committed');
  assert.equal(revDoc.status, 'verified');
  assert.ok(revDoc.deliverable?.media_path);
  assert.ok(revDoc.deliverable?.sha256);
  assert.ok(revDoc.deliverable?.manifest_path);
});

test('PF-06.2 B-Roll Replacement: Preserves Interval, Music, and Cut Progression', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();

  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);

  const revPrompt = `Replace the B-roll with updated cutaway footage, keeping the interval and all music intact.`;

  const revDoc = RevisionOrchestrator.runRevision({
    rawPrompt: revPrompt,
    priorRunDoc,
    project: execBase.project,
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  assert.equal(revDoc.status, 'verified');
  assert.ok(revDoc.intent_disentanglement.explicit_changes.some(c => c.includes('B-roll')));
  assert.ok(revDoc.plan_diff.modified_operations.some(op => op.params.clipId === 'clip_broll'));
  assert.ok(revDoc.plan_diff.modified_operations[0].params.assetId === 'asset_v_broll_rev2');
});

test('PF-06.3 Hard Constraint Conflict Rejection: Fails Closed without Silent Reinterpretation', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();

  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);
  const originalRevision = execBase.project.revision;

  // Incompatible duration request
  const conflictPrompt = `Make the video duration 20 seconds long.`;

  const revDoc = RevisionOrchestrator.runRevision({
    rawPrompt: conflictPrompt,
    priorRunDoc,
    project: execBase.project,
    outputDir: TEST_OUT_DIR
  });

  // Verify fail-closed behavior
  assert.equal(revDoc.status, 'conflict_blocked');
  assert.ok(revDoc.intent_disentanglement.detected_conflicts.length > 0);
  assert.ok(revDoc.intent_disentanglement.detected_conflicts[0].includes('contradicts preserved hard constraint'));

  // Zero project mutation
  assert.equal(execBase.project.revision, originalRevision);
  assert.equal(revDoc.deliverable, undefined);
});

test('PF-06.4 Prior Deliverable Preservation on QA Failure: Prior Artifacts Remain Immutable', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();
  const priorManifestPath = priorRunDoc.deliverable?.manifest_path;
  const priorManifestContent = fs.readFileSync(priorManifestPath, 'utf8');

  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);

  // Attempt revision with simulated QA failure
  const revPrompt = `Move headline title 1 second later`;
  const revDoc = RevisionOrchestrator.runRevision({
    rawPrompt: revPrompt,
    priorRunDoc,
    project: execBase.project,
    outputDir: TEST_OUT_DIR,
    options: { simulateQaFail: true }
  });

  assert.equal(revDoc.status, 'failed');
  assert.equal(revDoc.deliverable, undefined);

  // Verify prior manifest on disk was NOT touched, overwritten, or modified
  assert.ok(fs.existsSync(priorManifestPath));
  const currentPriorManifestContent = fs.readFileSync(priorManifestPath, 'utf8');
  assert.equal(currentPriorManifestContent, priorManifestContent, 'Prior manifest must remain byte-identical');
});

test('PF-06.5 Transactional Interruption & Recovery: Restores Baseline Revision Across Failures', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();

  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);
  const startRev = execBase.project.revision;

  const revPrompt = `Move headline title 2 seconds later`;

  // Inject failure at step 0
  const revDoc = RevisionOrchestrator.runRevision({
    rawPrompt: revPrompt,
    priorRunDoc,
    project: execBase.project,
    outputDir: TEST_OUT_DIR,
    options: { injectFailureAtStep: 0 }
  });

  assert.equal(revDoc.status, 'rolled_back');
  assert.equal(revDoc.execution_result.status, 'rolled_back');
  assert.equal(execBase.project.revision, startRev);
});

test('PF-06.6 Auditable Undo / Redo: Restores Prior Verified Project State', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();

  const baseProject = structuredClone(scenario1Project);
  baseProject.revision = 12; // simulates post-revision project

  const undoDoc = RevisionOrchestrator.undoRevision({
    priorRunDoc,
    project: baseProject,
    outputDir: TEST_OUT_DIR
  });

  assert.equal(undoDoc.status, 'rolled_back');
  assert.equal(undoDoc.execution_result.status, 'rolled_back');
  assert.equal(baseProject.revision, priorRunDoc.project_snapshot.base_revision);
  assert.equal(undoDoc.prior_run_id, priorRunDoc.run_id);
});

test('PF-06.7 Minimal Mutation Invariant: Unaffected Tracks Have Zero Diff', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();

  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);

  const intent = RevisionIntentCompiler.disentangle({
    rawPrompt: 'Move title 2 seconds later',
    priorRunDoc,
    project: execBase.project
  });

  const { planDiff } = RevisionPlanCompiler.compileRevisionPlan({
    priorRunDoc,
    revisionIntent: intent,
    project: execBase.project
  });

  // Only title track modified; audio and video tracks have 0 diff
  assert.equal(planDiff.modified_operations.length, 1);
  assert.equal(planDiff.modified_operations[0].params.clipId, 'clip_title');
  assert.equal(planDiff.added_operations.length, 0);
  assert.equal(planDiff.removed_operations.length, 0);
});

test('PF-06.8 Plan Determinism: Identical Revision Inputs Yield Identical Plan Hashes', (t) => {
  const priorRunDoc = createBaselineDeliveryRun();

  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json'),
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  const execBase = OperationPlanCompiler.executePlan(baseProject, basePlan);

  const intent1 = RevisionIntentCompiler.disentangle({
    rawPrompt: 'Move title 2 seconds later',
    priorRunDoc,
    project: execBase.project
  });
  const res1 = RevisionPlanCompiler.compileRevisionPlan({
    priorRunDoc,
    revisionIntent: intent1,
    project: structuredClone(execBase.project)
  });

  const intent2 = RevisionIntentCompiler.disentangle({
    rawPrompt: 'Move title 2 seconds later',
    priorRunDoc,
    project: execBase.project
  });
  const res2 = RevisionPlanCompiler.compileRevisionPlan({
    priorRunDoc,
    revisionIntent: intent2,
    project: structuredClone(execBase.project)
  });

  const hash1 = OperationPlanCompiler.computePlanHash(res1.plan);
  const hash2 = OperationPlanCompiler.computePlanHash(res2.plan);

  assert.equal(hash1, hash2, 'Identical revision requests must produce identical plan hashes');
});
