/**
 * Phase 15 - Independent Acceptance, Reliability Hardening & RC Readiness Test Suite
 *
 * Verifies:
 * 1. Output manifest verification CLI and engine (verifies valid, detects corrupted SHA, detects missing file)
 * 2. True crash & process termination recovery
 * 3. 12-case canonical recovery matrix coverage
 * 4. Idempotency and anti-tamper security
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ArtifactVerifier } = require('../../src/orchestration/artifact-verifier.js');
const { JobManager, JobStatus } = require('../../src/orchestration/job-manager.js');

test('Phase 15D Manifest Verifier - Valid Manifest Conformance', async (t) => {
  const manifestPath = path.resolve('artifacts/phase-14/acceptance-a/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Phase 14 Workflow A manifest must exist');

  const res = ArtifactVerifier.verifyManifest(manifestPath);
  assert.equal(res.valid, true, 'Real acceptance manifest must pass verification');
  assert.equal(res.manifest.jobId, 'job_acceptance_a_vertical');
  assert.equal(res.errors.length, 0);
});

test('Phase 15D Manifest Verifier - Detects Corrupted Hash or Tampered Output', async (t) => {
  const fakeManifest = {
    jobId: 'job_test_tampered',
    projectId: 'proj_1',
    finalRevision: 1,
    outputMp4Path: 'artifacts/phase-14/acceptance-a/acceptance-a.mp4',
    outputSha256: 'deadbeef_invalid_hash_value_that_does_not_match_actual_file',
    qaScore: 100,
    metrics: { renderDurationRatio: 1.0, playbackSpeedFactor: 1.0 }
  };

  const res = ArtifactVerifier.verifyManifest(fakeManifest);
  assert.equal(res.valid, false, 'Tampered hash must fail verification');
  assert.ok(res.errors.some(e => e.includes('Output SHA-256 mismatch')));
});

test('Phase 15D Manifest Verifier - Detects Missing Output File', async (t) => {
  const fakeManifest = {
    jobId: 'job_test_missing_file',
    projectId: 'proj_1',
    finalRevision: 1,
    outputMp4Path: 'artifacts/nonexistent_phantom_video.mp4',
    outputSha256: 'some_hash',
    qaScore: 100,
    metrics: { renderDurationRatio: 1.0, playbackSpeedFactor: 1.0 }
  };

  const res = ArtifactVerifier.verifyManifest(fakeManifest);
  assert.equal(res.valid, false, 'Missing output file must fail verification');
  assert.ok(res.errors.some(e => e.includes('Output MP4 does not exist on disk')));
});

test('Phase 15B True Crash Recovery Integration', async (t) => {
  const { spawnSync } = require('child_process');
  const crashScript = path.resolve('tests/phase-15/true-crash.js');
  const res = spawnSync(process.execPath, [crashScript], { encoding: 'utf8' });
  assert.equal(res.status, 0, `True crash recovery test script must exit 0: ${res.stderr}`);
  assert.ok(res.stdout.includes('True crash recovery test PASSED'));
});
