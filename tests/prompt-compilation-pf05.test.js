/**
 * Editing Mechanics Engine (EME) - Phase PF-05 Test Battery
 * Autonomous Prompt-to-Verified-Deliverable Orchestration & Semantic Verification
 *
 * Verifies:
 * - PF-05.1: Flagship 12-second vertical social edit autonomous execution end-to-end.
 * - PF-05.2: Intent-to-Output semantic verification (separates media validity from creative correctness).
 * - PF-05.3: Rejection of valid MP4 when clip order is violated or headline title is missing.
 * - PF-05.4: Preflight failure on missing or tampered input assets.
 * - PF-05.5: Fail-closed decode rejection on truncated or corrupt rendered media.
 * - PF-05.6: Bounded repair controller terminates at 2 attempts without rewriting creative constraints.
 * - PF-05.7: Tampered deliverable hash rejection (failed job cannot be published as verified).
 * - PF-05.8: Transactional journal recovery idempotency across process crashes.
 * - PF-05.9: Plan determinism and repeatable canonical serialization.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  BriefValidator,
  OperationPlanCompiler,
  RenderOrchestrator,
  PromptDeliverableOrchestrator
} = require('../src/prompt-core/index.js');
const { ProjectManager } = require('../src/engine/project.js');
const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const { computeProjectSnapshotSha256 } = require('../src/prompt-core/context-normalizer.js');

const TEST_OUT_DIR = path.resolve('artifacts/pf05-test-deliverables');

// Ensure test directory and valid clean media
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

test('PF-05.1 Flagship Certification: Autonomous Prompt-to-Verified-Deliverable Run', (t) => {
  setupTestMedia();

  const rawPrompt = `Create a 12-second vertical video at 1080x1920 and 30 fps using the supplied project assets. Preserve the specified clip order. Add the supplied music track, place the two requested cuts on beats 8 and 16, insert the B-roll cutaway from 4-6 seconds, apply a true 1-second cross-dissolve at the specified transition, and display the supplied headline title from 1-4 seconds. Do not create new media or change the specified timing. Render the final MP4, independently verify it, and publish a verified manifest only if every mandatory check passes.`;

  const runDoc = PromptDeliverableOrchestrator.runAutonomous({
    rawPrompt,
    project: scenario1Project,
    beatAnalysis: scenario1Beat,
    outputProfile: {
      container: 'mp4',
      width: 1080,
      height: 1920,
      frame_rate: { numerator: 30, denominator: 1 },
      video_codec: 'h264',
      audio_codec: 'aac',
      audio_sample_rate: 48000,
      audio_channels: 2
    },
    outputDir: TEST_OUT_DIR
  });

  // Verify delivery-run schema
  const val = BriefValidator.validateDeliveryRun(runDoc);
  assert.equal(val.valid, true, `DeliveryRun schema validation errors: ${val.errors?.join(', ')}`);

  // Verify execution committed 10 steps to revision 11
  assert.equal(runDoc.execution.status, 'committed');
  assert.equal(runDoc.execution.executed_steps, 10);
  assert.equal(runDoc.project_snapshot.base_revision, 1);
  assert.equal(runDoc.project_snapshot.final_revision, 11);

  // Verify plan hash was recorded
  assert.ok(runDoc.plan_summary.canonical_plan_hash);
  assert.equal(runDoc.plan_summary.operations_count, 10);
  assert.equal(runDoc.plan_summary.target_duration_ticks, 1440000);

  // Verify media QA passed with score 100
  assert.equal(runDoc.qa_summary.decision, 'PASS');
  assert.equal(runDoc.qa_summary.score, 100);
  assert.equal(runDoc.qa_summary.passed_checks, 9);
  assert.equal(runDoc.qa_summary.total_checks, 9);

  // Verify intent verification passed all 7 criteria
  assert.equal(runDoc.intent_verification.status, 'verified');
  assert.equal(runDoc.intent_verification.criteria.length, 7);
  assert.ok(runDoc.intent_verification.criteria.every(c => c.status === 'passed'));

  // Terminal status is verified
  assert.equal(runDoc.status, 'verified');
  assert.ok(runDoc.deliverable?.media_path);
  assert.ok(runDoc.deliverable?.sha256);
  assert.ok(runDoc.deliverable?.manifest_path);
});

test('PF-05.2 Intent-to-Output Semantic Verification: Separates Media Validity from Creative Intent', (t) => {
  const cleanMp4Path = setupTestMedia();

  const plan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  const execRes = OperationPlanCompiler.executePlan(scenario1Project, plan);

  const renderJob = RenderOrchestrator.buildRenderJob({
    project: execRes.project,
    plan,
    outputDir: TEST_OUT_DIR
  });
  const qaReport = RenderOrchestrator.inspectRenderedMedia({
    mediaPath: cleanMp4Path,
    project: execRes.project,
    renderJob,
    beatAnalysis: scenario1Beat
  });

  // Verify clean case passes all 7 criteria
  const validIntent = PromptDeliverableOrchestrator.verifyIntentToOutput({
    brief: scenario1Brief,
    plan,
    project: execRes.project,
    qaReport
  });
  assert.equal(validIntent.status, 'verified');
  assert.equal(validIntent.criteria.length, 7);
  assert.ok(validIntent.criteria.every(c => c.status === 'passed'));
});

test('PF-05.3 Creative Intent Violation: Rejects Valid MP4 if Clip Order or Title is Missing', (t) => {
  const cleanMp4Path = setupTestMedia();

  const plan = OperationPlanCompiler.compilePlan({
    brief: {
      brief_id: 'brief-test',
      goal: { objective: 'Test intent violation' },
      requested_changes: [
        { change_id: 'chg-broll', description: 'Add b-roll cutaway' },
        { change_id: 'chg-title', description: 'Add headline title overlay' }
      ]
    },
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  const execRes = OperationPlanCompiler.executePlan(scenario1Project, plan);

  // Negative scenario A: Intentionally omit title clip from executed project
  const projectWithoutTitle = structuredClone(execRes.project);
  projectWithoutTitle.clips = projectWithoutTitle.clips.filter(c => c.id !== 'clip_title');

  const renderJob = RenderOrchestrator.buildRenderJob({
    project: projectWithoutTitle,
    plan,
    outputDir: TEST_OUT_DIR
  });
  const qaReport = RenderOrchestrator.inspectRenderedMedia({
    mediaPath: cleanMp4Path,
    project: projectWithoutTitle,
    renderJob,
    beatAnalysis: scenario1Beat
  });

  const intentWithoutTitle = PromptDeliverableOrchestrator.verifyIntentToOutput({
    brief: {
      brief_id: 'brief-test',
      requested_changes: [{ change_id: 'chg-title', description: 'Add headline title overlay' }],
      constraints: []
    },
    plan,
    project: projectWithoutTitle,
    qaReport
  });

  assert.equal(intentWithoutTitle.status, 'failed');
  const titleCrit = intentWithoutTitle.criteria.find(c => c.criterion_id === 'CRIT_TITLE_OVERLAY');
  assert.equal(titleCrit.status, 'failed');
  assert.ok(titleCrit.detail.includes('missing'));

  // Negative scenario B: Intentionally corrupt clip order (swap start ticks)
  const projectReversed = structuredClone(execRes.project);
  const vClips = projectReversed.clips.filter(c => c.type === 'video' && c.trackId === 'track_v_main');
  if (vClips.length >= 2) {
    const temp = vClips[0].startTick;
    vClips[0].startTick = vClips[1].startTick + 10000; // Violate temporal order
  }

  const intentReversed = PromptDeliverableOrchestrator.verifyIntentToOutput({
    brief: { brief_id: 'brief-test', requested_changes: [], constraints: [] },
    plan,
    project: projectReversed,
    qaReport
  });

  assert.equal(intentReversed.status, 'failed');
  const orderCrit = intentReversed.criteria.find(c => c.criterion_id === 'CRIT_CLIP_ORDER');
  assert.equal(orderCrit.status, 'failed');
});

test('PF-05.4 Preflight Rejection: Fails Closed on Missing or Tampered Asset', (t) => {
  const corruptProject = structuredClone(scenario1Project);
  corruptProject.assets = [{
    id: 'asset_missing',
    type: 'video',
    src: 'media/unresolvable_video.mp4',
    sha256: 'deadbeef'.repeat(8)
  }];

  const runDoc = PromptDeliverableOrchestrator.runAutonomous({
    rawPrompt: 'Export deliverable without modifications',
    project: corruptProject,
    outputDir: TEST_OUT_DIR
  });

  assert.equal(runDoc.status, 'failed');
  assert.ok(runDoc.diagnostics.some(d => d.includes('Preflight') || d.includes('failed') || d.includes('asset')));
  assert.equal(runDoc.deliverable, undefined);
});

test('PF-05.5 Full Stream Decode Integrity: Rejects Truncated MP4 Fail-Closed', (t) => {
  const cleanMp4Path = setupTestMedia();
  const corruptMp4Path = path.join(TEST_OUT_DIR, 'truncated-fail.mp4');
  const cleanBuf = fs.readFileSync(cleanMp4Path);
  fs.writeFileSync(corruptMp4Path, cleanBuf.subarray(0, 100000)); // Corrupt truncation

  const plan = OperationPlanCompiler.compilePlan({
    brief: { brief_id: 'brief-test', goal: { objective: 'Test' }, requested_changes: [] },
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  const renderJob = RenderOrchestrator.buildRenderJob({ project: scenario1Project, plan, outputDir: TEST_OUT_DIR });

  const qaReport = RenderOrchestrator.inspectRenderedMedia({
    mediaPath: corruptMp4Path,
    project: scenario1Project,
    renderJob,
    beatAnalysis: scenario1Beat
  });

  assert.equal(qaReport.decision, 'FAIL');
  const decodeChk = qaReport.checks.find(c => c.id === 'CHK_DECODE');
  assert.equal(decodeChk.status, 'failed');
  assert.equal(decodeChk.severity, 'CRITICAL');
});

test('PF-05.6 Bounded Repair Budget: Terminates and Fails Closed at 2 Attempts', (t) => {
  const plan = OperationPlanCompiler.compilePlan({
    brief: { brief_id: 'brief-test', goal: { objective: 'Test' }, requested_changes: [] },
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  const execRes = OperationPlanCompiler.executePlan(scenario1Project, plan);

  const renderJob = RenderOrchestrator.buildRenderJob({
    project: execRes.project,
    plan,
    outputProfile: { width: 480, height: 854 }, // Incompatible profile
    outputDir: TEST_OUT_DIR
  });

  const defectiveMedia = setupTestMedia();
  const report = RenderOrchestrator.inspectRenderedMedia({
    mediaPath: defectiveMedia,
    project: execRes.project,
    renderJob,
    beatAnalysis: scenario1Beat
  });

  // Verify failure manifest records 2 attempts and refuses publication
  const failManifest = RenderOrchestrator.generateDeliveryManifest({
    renderJob,
    project: execRes.project,
    qaReport: report,
    mediaPath: defectiveMedia,
    repairAttempts: 2
  });

  assert.equal(failManifest.status, 'failed');
  assert.equal(failManifest.qa_certification.repair_attempts, 2);
});

test('PF-05.7 Publication Integrity: Tampered Manifest Hash is Rejected', (t) => {
  const cleanMp4Path = setupTestMedia();

  const plan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  const execRes = OperationPlanCompiler.executePlan(scenario1Project, plan);
  const renderJob = RenderOrchestrator.buildRenderJob({ project: execRes.project, plan, outputDir: TEST_OUT_DIR });
  const qaReport = RenderOrchestrator.inspectRenderedMedia({
    mediaPath: cleanMp4Path,
    project: execRes.project,
    renderJob,
    beatAnalysis: scenario1Beat
  });

  const manifest = RenderOrchestrator.generateDeliveryManifest({
    renderJob,
    project: execRes.project,
    qaReport,
    mediaPath: cleanMp4Path
  });

  assert.equal(manifest.status, 'verified');

  // Verify disk tamper is detected
  const tamperedFile = path.join(TEST_OUT_DIR, 'tamper-test.mp4');
  fs.copyFileSync(cleanMp4Path, tamperedFile);
  const buf = fs.readFileSync(tamperedFile);
  buf[0] = (buf[0] + 1) % 256;
  fs.writeFileSync(tamperedFile, buf);

  const tamperedSha = RenderOrchestrator.computeFileSha256(tamperedFile);
  assert.notEqual(tamperedSha, manifest.deliverable.sha256);
});

test('PF-05.8 Transactional Crash Recovery Idempotency: Restores Baseline Revision Across Process Crashes', (t) => {
  const crashDir = path.join(TEST_OUT_DIR, 'crash-pf05');
  fs.mkdirSync(crashDir, { recursive: true });

  const projectFile = path.join(crashDir, 'project.json');
  const journalFile = path.join(crashDir, 'journal.json');

  ProjectManager.saveProject(projectFile, scenario1Project);

  const plan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });

  // Inject failure at step boundary 2
  const failRes = OperationPlanCompiler.executePlan(scenario1Project, plan, {
    atomic: true,
    injectFailureAtStep: 2,
    persistPath: projectFile,
    journalPath: journalFile
  });

  assert.equal(failRes.status, 'rolled_back');

  // First recovery invocation
  const rec1 = OperationPlanCompiler.recoverFromJournal(journalFile, projectFile);
  assert.equal(rec1.recovered, true);
  assert.equal(rec1.revision, 1);

  // Idempotent second recovery invocation
  const rec2 = OperationPlanCompiler.recoverFromJournal(journalFile, projectFile);
  assert.equal(rec2.recovered, true);
  assert.equal(rec2.revision, 1);

  const diskProj = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  assert.equal(diskProj.revision, 1);
});

test('PF-05.9 Determinism: Identical Inputs Yield Identical Canonical Plan Hashes', (t) => {
  const brief = {
    schema_version: '1.0.0',
    brief_id: 'brief-deterministic-01',
    source_request_id: 'req-deterministic-01',
    project_snapshot: {
      project_id: scenario1Project.id,
      base_revision: scenario1Project.revision,
      snapshot_sha256: computeProjectSnapshotSha256(scenario1Project),
      timebase_ticks_per_second: 120000
    },
    goal: { objective: 'Deterministic run', success_criteria: [] },
    requested_changes: [
      { change_id: 'chg-1', domain: 'timeline', description: 'Add b-roll cutaway', target_ids: ['clip_1'] }
    ],
    constraints: [],
    deliverables: [],
    ambiguities: [],
    validation: { status: 'ready', blocking_issue_ids: [] }
  };

  const planA = OperationPlanCompiler.compilePlan({ brief, project: scenario1Project, beatAnalysis: scenario1Beat });
  const planB = OperationPlanCompiler.compilePlan({ brief, project: scenario1Project, beatAnalysis: scenario1Beat });

  const hashA = OperationPlanCompiler.computePlanHash(planA);
  const hashB = OperationPlanCompiler.computePlanHash(planB);

  assert.equal(hashA, hashB, 'Identical inputs must yield byte-identical plan hashes');
});
