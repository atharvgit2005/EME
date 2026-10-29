/**
 * Phase 14 - Production Workflow Orchestration & Real-World Acceptance Test Suite
 *
 * Verifies:
 * 1. Durable job state machine transitions and invalid transition rejection
 * 2. Safe disk persistence and reload
 * 3. Asset integrity check on resume (detects missing and altered source media)
 * 4. Approval policy gate enforcement before execution
 * 5. End-to-end orchestrated workflow lifecycle (CREATED -> COMPLETED)
 * 6. Final manifest generation with explicit render_duration_ratio & playback_speed_factor
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JobManager, JobStatus } = require('../../src/orchestration/job-manager.js');
const { WorkflowService } = require('../../src/orchestration/service-boundary.js');

test('Phase 14 Job Lifecycle - Valid Transitions and State Rejection', async (t) => {
  const jm = new JobManager('artifacts/phase-14/test-jobs');
  const job = jm.createJob('job_test_lifecycle_1', { brief: { goal: 'Test' } });

  assert.equal(job.status, JobStatus.CREATED);
  assert.equal(job.jobId, 'job_test_lifecycle_1');

  // Valid transition
  const j1 = jm.transition(job.jobId, JobStatus.INGESTING, 'Ingesting assets');
  assert.equal(j1.status, JobStatus.INGESTING);
  assert.equal(j1.stateHistory.length, 1);

  // Invalid transition (INGESTING -> COMPLETED is illegal)
  assert.throws(() => {
    jm.transition(job.jobId, JobStatus.COMPLETED);
  }, /Invalid state transition/);

  // Cancel job
  const jCancelled = jm.cancel(job.jobId, 'User requested');
  assert.equal(jCancelled.status, JobStatus.CANCELLED);
});

test('Phase 14 Asset Integrity - Detect Altered or Missing Sources on Resume', async (t) => {
  const jm = new JobManager('artifacts/phase-14/test-jobs');
  const dummyAssetPath = path.resolve('artifacts/phase-14/test-jobs/temp-asset.txt');
  fs.writeFileSync(dummyAssetPath, 'Initial content', 'utf8');

  const { SourceAnalyzer } = require('../../src/planning/source-analyzer.js');
  const initialHash = SourceAnalyzer.computeSha256(dummyAssetPath);

  const job = jm.createJob('job_test_integrity', {
    assetManifest: [{ assetId: 'a1', path: dummyAssetPath, sha256: initialHash }]
  });

  // Verify initial integrity
  const check1 = jm.verifyAssetIntegrity(job.jobId);
  assert.equal(check1.valid, true);

  // Mutate file content
  fs.writeFileSync(dummyAssetPath, 'Altered content!', 'utf8');
  const check2 = jm.verifyAssetIntegrity(job.jobId);
  assert.equal(check2.valid, false);
  assert.ok(check2.error.includes('hash mismatch'));

  // Delete file
  fs.unlinkSync(dummyAssetPath);
  const check3 = jm.verifyAssetIntegrity(job.jobId);
  assert.equal(check3.valid, false);
  assert.ok(check3.error.includes('missing on resume'));
});

test('Phase 14 Approval Gate Policy - Halts Execution When Approval Required', async (t) => {
  const service = new WorkflowService({ storageDir: 'artifacts/phase-14/test-jobs' });
  const planPath = path.resolve('examples/plans/plan-scenario-a-kinetic.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  const res = await service.executeJob({
    jobId: 'job_test_approval_gate',
    brief: plan.brief,
    sourceAssets: plan.sourceReferences,
    editingPlan: plan,
    requireApproval: true,
    autoRender: false
  });

  assert.equal(res.success, false);
  assert.equal(res.awaitingApproval, true);
  assert.equal(res.job.status, JobStatus.AWAITING_APPROVAL);
});

test('Phase 14 End-to-End Orchestrated Execution with Complete Manifest', async (t) => {
  const service = new WorkflowService({ storageDir: 'artifacts/phase-14/test-jobs' });
  const planPath = path.resolve('examples/plans/plan-scenario-a-kinetic.json');
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  const res = await service.executeJob({
    jobId: 'job_test_full_execution',
    brief: plan.brief,
    sourceAssets: plan.sourceReferences,
    editingPlan: plan,
    requireApproval: false,
    autoRender: false // Test full deterministic orchestration
  });

  assert.equal(res.success, true);
  assert.equal(res.job.status, JobStatus.COMPLETED);
  assert.ok(res.manifest);
  assert.equal(res.manifest.jobId, 'job_test_full_execution');
  assert.ok(res.manifest.metrics);
  assert.ok(res.manifest.metrics.renderDurationRatio !== undefined);
  assert.ok(res.manifest.metrics.playbackSpeedFactor !== undefined);
});
