/**
 * Stage 21.4: Controlled Deployment, Canary & Rollback Pipeline Tests
 *
 * Verifies:
 * 1. Prior Known-Good Baseline Archiving with cryptographic manifest.
 * 2. Candidate Artifact Integrity & Production Cleanliness Gate (no dev/test leaks).
 * 3. Progressive Canary Rollout Evaluation (0% -> 10% -> 50% -> 100%).
 * 4. Automated Canary Rollback Triggers (error rate, latency, active delivery integrity).
 * 5. Atomic Zero-Corruption Rollback Execution with tamper resistance.
 * 6. Staging Smoke Test Harness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  RollbackManager,
  CANARY_STAGES,
  DEFAULT_CANARY_CRITERIA
} = require('../src/prompt-core/index.js');
const { computeSha256 } = require('../src/prompt-core/disaster-recovery.js');

function createTempDir(prefix = 'eme-rollout-test-') {
  const tmpDir = path.join(__dirname, '../scratch', `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

test('Stage 21.4: Controlled Deployment, Canary & Rollback Pipeline', async (t) => {

  await t.test('ROLLOUT-01: Prior Known-Good Baseline Archiving & Cryptographic Manifest Verification', () => {
    const tmp = createTempDir('rollout-01-');
    try {
      const artifactPath = path.join(tmp, 'eme-v20.0.0.tgz');
      fs.writeFileSync(artifactPath, 'MOCK_TARBALL_CONTENT_V20_GOOD_RELEASE', 'utf8');
      const expectedSha256 = computeSha256(artifactPath, true);

      const archiveDir = path.join(tmp, 'prior-known-good');
      const manager = new RollbackManager({ archiveDir });

      const res = manager.archivePriorKnownGood(artifactPath);
      assert.equal(res.ok, true, 'Archiving should succeed');
      assert.equal(res.sha256, expectedSha256, 'Archived SHA-256 should match computed SHA-256');
      assert.equal(fs.existsSync(res.archivePath), true, 'Archived file must exist');

      // Checksum file verification
      const checksumFile = `${res.archivePath}.sha256`;
      assert.equal(fs.existsSync(checksumFile), true, 'Checksum file must exist');
      const checksumContent = fs.readFileSync(checksumFile, 'utf8');
      assert.match(checksumContent, new RegExp(`^${expectedSha256}\\s+eme-v20\\.0\\.0\\.tgz`));

      // Manifest verification
      const manifestPath = path.join(archiveDir, 'prior-known-good-manifest.json');
      assert.equal(fs.existsSync(manifestPath), true, 'Manifest must exist');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.status, 'VERIFIED_KNOWN_GOOD');
      assert.equal(manifest.sha256, expectedSha256);
      assert.equal(manifest.artifact_filename, 'eme-v20.0.0.tgz');
      assert.ok(manifest.byte_size > 0);
    } finally {
      cleanTempDir(tmp);
    }
  });

  await t.test('ROLLOUT-02: Candidate Artifact Integrity & Production Cleanliness Gate', () => {
    const tmp = createTempDir('rollout-02-');
    try {
      const manager = new RollbackManager({ baseDir: tmp });

      // Create a clean mock tarball
      const cleanPkgDir = path.join(tmp, 'clean-pkg');
      fs.mkdirSync(path.join(cleanPkgDir, 'package', 'bin'), { recursive: true });
      fs.mkdirSync(path.join(cleanPkgDir, 'package', 'src'), { recursive: true });
      fs.writeFileSync(path.join(cleanPkgDir, 'package', 'package.json'), '{"name":"eme"}');
      fs.writeFileSync(path.join(cleanPkgDir, 'package', 'bin', 'eme.js'), '#!/usr/bin/env node');
      fs.writeFileSync(path.join(cleanPkgDir, 'package', 'src', 'index.js'), 'module.exports = {};');

      const cleanTarball = path.join(tmp, 'eme-clean.tgz');
      spawnSync('tar', ['-czf', cleanTarball, '-C', cleanPkgDir, 'package']);
      assert.equal(fs.existsSync(cleanTarball), true);

      const cleanSha256 = computeSha256(cleanTarball, true);
      const cleanCheck = manager.verifyReleaseArtifact(cleanTarball, cleanSha256);
      assert.equal(cleanCheck.valid, true, 'Clean package must pass verification');
      assert.equal(cleanCheck.calculatedSha256, cleanSha256);
      assert.ok(cleanCheck.fileCount >= 3);

      // Checksum mismatch rejection
      const badHashCheck = manager.verifyReleaseArtifact(cleanTarball, '0000000000000000000000000000000000000000000000000000000000000000');
      assert.equal(badHashCheck.valid, false);
      assert.match(badHashCheck.error, /Checksum mismatch/);

      // Create a tainted tarball leaking tests/
      const taintedPkgDir = path.join(tmp, 'tainted-pkg');
      fs.mkdirSync(path.join(taintedPkgDir, 'package', 'tests'), { recursive: true });
      fs.writeFileSync(path.join(taintedPkgDir, 'package', 'tests', 'leak.test.js'), 'test();');
      const taintedTarball = path.join(tmp, 'eme-tainted.tgz');
      spawnSync('tar', ['-czf', taintedTarball, '-C', taintedPkgDir, 'package']);

      const taintedSha256 = computeSha256(taintedTarball, true);
      const taintedCheck = manager.verifyReleaseArtifact(taintedTarball, taintedSha256);
      assert.equal(taintedCheck.valid, false, 'Tainted package with tests/ must fail verification');
      assert.match(taintedCheck.error, /Development files leaked into production tarball/);
    } finally {
      cleanTempDir(tmp);
    }
  });

  await t.test('ROLLOUT-03: Progressive Canary Rollout Evaluation (0% -> 10% -> 50% -> 100%)', () => {
    const manager = new RollbackManager();

    // Stage 1: 0% -> 10%
    const eval0 = manager.evaluateCanary(0, {
      sampleCount: 10,
      errorRatePercent: 0,
      latencyP95Ms: 120,
      activeDeliveryIntact: true
    });
    assert.equal(eval0.shouldAdvance, true);
    assert.equal(eval0.shouldRollback, false);
    assert.equal(eval0.nextTrafficPercent, 10);

    // Stage 2: 10% -> 50%
    const eval10 = manager.evaluateCanary(10, {
      sampleCount: 12,
      errorRatePercent: 0.1,
      latencyP95Ms: 250,
      activeDeliveryIntact: true
    });
    assert.equal(eval10.shouldAdvance, true);
    assert.equal(eval10.shouldRollback, false);
    assert.equal(eval10.nextTrafficPercent, 50);

    // Stage 3: 50% -> 100%
    const eval50 = manager.evaluateCanary(50, {
      sampleCount: 20,
      errorRatePercent: 0.2,
      latencyP95Ms: 400,
      activeDeliveryIntact: true
    });
    assert.equal(eval50.shouldAdvance, true);
    assert.equal(eval50.shouldRollback, false);
    assert.equal(eval50.nextTrafficPercent, 100);

    // Stage 4: 100% (Complete)
    const eval100 = manager.evaluateCanary(100, {
      sampleCount: 50,
      errorRatePercent: 0.05,
      latencyP95Ms: 300,
      activeDeliveryIntact: true
    });
    assert.equal(eval100.shouldAdvance, false);
    assert.equal(eval100.shouldRollback, false);
    assert.equal(eval100.nextTrafficPercent, 100);
    assert.match(eval100.reason, /100% rollout achieved/);
  });

  await t.test('ROLLOUT-04: Automated Canary Rollback Triggers', () => {
    const manager = new RollbackManager();

    // 1. Error rate breach trigger
    const errBreach = manager.evaluateCanary(50, {
      sampleCount: 10,
      errorRatePercent: 1.2, // > 0.5% threshold
      latencyP95Ms: 200,
      activeDeliveryIntact: true
    });
    assert.equal(errBreach.shouldRollback, true, 'High error rate must trigger rollback');
    assert.equal(errBreach.shouldAdvance, false);
    assert.equal(errBreach.nextTrafficPercent, 0, 'Traffic must be reverted to 0%');
    assert.match(errBreach.reason, /Error Rate .* exceeded maximum threshold/);

    // 2. Latency breach trigger
    const latencyBreach = manager.evaluateCanary(10, {
      sampleCount: 10,
      errorRatePercent: 0,
      latencyP95Ms: 18000, // > 15000ms threshold
      activeDeliveryIntact: true
    });
    assert.equal(latencyBreach.shouldRollback, true, 'High p95 latency must trigger rollback');
    assert.equal(latencyBreach.nextTrafficPercent, 0);
    assert.match(latencyBreach.reason, /p95 Latency .* exceeded threshold/);

    // 3. Active delivery integrity breach trigger (Non-negotiable invariant)
    const deliveryBreach = manager.evaluateCanary(10, {
      sampleCount: 2, // Even with low samples!
      errorRatePercent: 0,
      latencyP95Ms: 100,
      activeDeliveryIntact: false
    });
    assert.equal(deliveryBreach.shouldRollback, true, 'Active delivery breach must immediately trigger rollback');
    assert.equal(deliveryBreach.nextTrafficPercent, 0);
    assert.match(deliveryBreach.reason, /Active delivery integrity compromised/);

    // 4. Sample count guard (does not advance prematurely)
    const lowSamples = manager.evaluateCanary(10, {
      sampleCount: 2, // < 5 min samples
      errorRatePercent: 0,
      latencyP95Ms: 100,
      activeDeliveryIntact: true
    });
    assert.equal(lowSamples.shouldAdvance, false);
    assert.equal(lowSamples.shouldRollback, false);
    assert.equal(lowSamples.nextTrafficPercent, 10);
  });

  await t.test('ROLLOUT-05: Atomic Zero-Corruption Rollback Execution with Tamper Resistance', () => {
    const tmp = createTempDir('rollout-05-');
    try {
      const archiveDir = path.join(tmp, 'archive');
      const deployDir = path.join(tmp, 'production-deploy');
      fs.mkdirSync(deployDir, { recursive: true });

      const manager = new RollbackManager({ archiveDir });

      // Archive prior known good artifact
      const goodArtifact = path.join(tmp, 'eme-v20-known-good.tgz');
      fs.writeFileSync(goodArtifact, 'AUTHORITATIVE_PRIOR_KNOWN_GOOD_PAYLOAD', 'utf8');
      const archiveRes = manager.archivePriorKnownGood(goodArtifact);
      assert.equal(archiveRes.ok, true);

      // Deploy bad candidate
      const badCandidate = path.join(deployDir, 'eme-v21-candidate.tgz');
      fs.writeFileSync(badCandidate, 'BAD_CANDIDATE_LEAKING_ERRORS', 'utf8');

      // Execute Rollback
      const rollbackRes = manager.executeRollback(deployDir);
      assert.equal(rollbackRes.ok, true, 'Rollback should execute successfully');
      assert.equal(rollbackRes.restoredFilename, 'eme-v20-known-good.tgz');
      assert.ok(rollbackRes.durationMs < 2000, 'Rollback RTO must be well under 2.0s');

      // Verify restored content matches known-good
      const restoredPath = path.join(deployDir, 'eme-v20-known-good.tgz');
      assert.equal(fs.existsSync(restoredPath), true);
      assert.equal(fs.readFileSync(restoredPath, 'utf8'), 'AUTHORITATIVE_PRIOR_KNOWN_GOOD_PAYLOAD');

      // Test Tamper Resistance: Tampering with archive must fail closed on rollback attempt
      fs.writeFileSync(archiveRes.archivePath, 'TAMPERED_ARCHIVE_BYTES', 'utf8');
      const tamperedRollback = manager.executeRollback(deployDir);
      assert.equal(tamperedRollback.ok, false, 'Tampered archive must be rejected');
      assert.match(tamperedRollback.error, /checksum mismatch/);
    } finally {
      cleanTempDir(tmp);
    }
  });

  await t.test('ROLLOUT-06: Staging Smoke Test Harness', () => {
    const tmp = createTempDir('rollout-06-');
    try {
      const manager = new RollbackManager();
      const mockPkg = path.join(tmp, 'smoke-candidate.tgz');
      fs.writeFileSync(mockPkg, 'SMOKE_TEST_PACKAGE_DATA', 'utf8');

      const smokeRes = manager.runStagingSmokeTests(mockPkg);
      assert.equal(smokeRes.checks.artifactExists, true);
      assert.equal(smokeRes.checks.integrityChecksumValid, true);
      assert.equal(smokeRes.checks.schemasValid, true, 'All production schemas must be valid JSON');
      assert.equal(smokeRes.checks.cliHelpExecutable, true, 'CLI help must run cleanly via process.execPath');
      assert.equal(smokeRes.pass, true, 'Staging smoke test battery must pass');
    } finally {
      cleanTempDir(tmp);
    }
  });

});
