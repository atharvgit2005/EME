/**
 * Phase 20 (Stage 20.3) Test Suite: Deployment Safety, Backup & Disaster Recovery
 *
 * Verifies:
 * - DEP-01: Project backup creates atomic snapshot with cryptographic SHA-256 manifest.
 * - DEP-02: Project restore fails closed with integrity error if backup file is tampered.
 * - DEP-03: Project restore performs atomic replacement without partial state corruption.
 * - DEP-04: Sensitive data redactor sanitizes bearer tokens, api keys, and home paths.
 * - DEP-05: Environment preflight doctor validates Node (>=20), FFmpeg, FFprobe, and storage permissions.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  computeSha256,
  createProjectBackup,
  restoreProjectBackup,
  redactSensitiveData,
  runEnvironmentDoctor
} = require('../src/prompt-core/disaster-recovery.js');

const TEST_WORK_DIR = path.join(os.tmpdir(), `eme-test-stage20-3-${Date.now()}`);

test.before(() => {
  fs.mkdirSync(TEST_WORK_DIR, { recursive: true });
});

test.after(() => {
  try {
    fs.rmSync(TEST_WORK_DIR, { recursive: true, force: true });
  } catch (_) {}
});

test('DEP-01: Project backup creates atomic snapshot with cryptographic SHA-256 manifest', () => {
  const projectFile = path.join(TEST_WORK_DIR, 'sample_project.json');
  const backupDir = path.join(TEST_WORK_DIR, 'backups');

  const projectData = {
    schema_version: '1.0.0',
    name: 'SampleProductionProject',
    revision: 7,
    timeline: { duration_ticks: 1440000 },
    clips: [{ id: 'clip-1', start_ticks: 0, end_ticks: 720000 }]
  };
  fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), 'utf8');

  const backupRes = createProjectBackup(projectFile, backupDir, {
    metadata: { reason: 'pre_render_snapshot', operator: 'automated-pipeline' }
  });

  assert.strictEqual(backupRes.ok, true);
  assert.ok(backupRes.backupPath && fs.existsSync(backupRes.backupPath), 'Backup file must exist on disk');
  assert.ok(backupRes.manifestPath && fs.existsSync(backupRes.manifestPath), 'Manifest file must exist on disk');
  assert.strictEqual(backupRes.revision, 7);

  // Validate manifest structure & hash verification
  const manifest = JSON.parse(fs.readFileSync(backupRes.manifestPath, 'utf8'));
  assert.strictEqual(manifest.schema_version, '1.0.0');
  assert.strictEqual(manifest.project_name, 'SampleProductionProject');
  assert.strictEqual(manifest.project_revision, 7);
  assert.strictEqual(manifest.metadata.reason, 'pre_render_snapshot');

  const actualSha256 = computeSha256(backupRes.backupPath, true);
  assert.strictEqual(manifest.sha256, actualSha256);
  assert.strictEqual(backupRes.sha256, actualSha256);
});

test('DEP-02: Project restore fails closed with integrity error if backup file is tampered', () => {
  const projectFile = path.join(TEST_WORK_DIR, 'tamper_project.json');
  const backupDir = path.join(TEST_WORK_DIR, 'tamper_backups');

  const projectData = { name: 'TamperTestProject', revision: 1, tracks: [] };
  fs.writeFileSync(projectFile, JSON.stringify(projectData), 'utf8');

  const backupRes = createProjectBackup(projectFile, backupDir);
  assert.strictEqual(backupRes.ok, true);

  // Tamper with the backup file directly
  fs.appendFileSync(backupRes.backupPath, '/* MALICIOUS TAMPER INJECTION */');

  // Attempt restore
  const restoreTarget = path.join(TEST_WORK_DIR, 'restored_tampered.json');
  const restoreRes = restoreProjectBackup(backupRes.backupPath, restoreTarget, backupRes.manifestPath);

  assert.strictEqual(restoreRes.ok, false, 'Tampered restore must fail closed');
  assert.strictEqual(fs.existsSync(restoreTarget), false, 'Target file must NOT be written when tampered');
  assert.ok(restoreRes.error.includes('Integrity check failed'));
});

test('DEP-03: Project restore performs atomic replacement without partial state corruption', () => {
  const projectFile = path.join(TEST_WORK_DIR, 'valid_project.json');
  const backupDir = path.join(TEST_WORK_DIR, 'valid_backups');

  const projectData = { name: 'ValidProject', revision: 42, clips: ['c1', 'c2'] };
  fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), 'utf8');

  const backupRes = createProjectBackup(projectFile, backupDir);
  assert.strictEqual(backupRes.ok, true);

  // Restore to destination that already had prior data
  const targetPath = path.join(TEST_WORK_DIR, 'current_active_project.json');
  fs.writeFileSync(targetPath, JSON.stringify({ name: 'OldCorruptedState' }), 'utf8');

  const restoreRes = restoreProjectBackup(backupRes.backupPath, targetPath);
  assert.strictEqual(restoreRes.ok, true);
  assert.strictEqual(restoreRes.restoredPath, path.resolve(targetPath));

  const restoredData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  assert.strictEqual(restoredData.name, 'ValidProject');
  assert.strictEqual(restoredData.revision, 42);
  assert.deepStrictEqual(restoredData.clips, ['c1', 'c2']);
});

test('DEP-04: Sensitive data redactor sanitizes bearer tokens, api keys, and home paths', () => {
  const homeDir = os.homedir();
  const testPayload = {
    apiKey: 'sk-proj-999888777666555444333222111',
    authorization: 'Bearer secret_access_token_super_confidential_123',
    secretToken: 'shhh-do-not-reveal',
    systemPath: `${homeDir}/Desktop/Projects/secret_asset.mp4`,
    nested: {
      url: `file://${homeDir}/secret.json?api_key=abcdef123456789`,
      header: 'Authorization: Bearer my_jwt_token_here_with_sufficient_length_12345',
      userNote: 'Public notes here'
    },
    list: [
      `path: ${homeDir}/temp`,
      'normal-string'
    ]
  };

  const sanitized = redactSensitiveData(testPayload);

  // Verify secret keys are replaced with [REDACTED]
  assert.strictEqual(sanitized.apiKey, '[REDACTED]');
  assert.strictEqual(sanitized.authorization, '[REDACTED]');
  assert.strictEqual(sanitized.secretToken, '[REDACTED]');

  // Verify home path is neutralized to ~/
  assert.strictEqual(sanitized.systemPath, '~/Desktop/Projects/secret_asset.mp4');
  assert.ok(!sanitized.systemPath.includes(homeDir));

  // Verify nested fields
  assert.ok(!sanitized.nested.url.includes(homeDir));
  assert.ok(sanitized.nested.url.includes('~/secret.json'));
  assert.ok(sanitized.nested.url.includes('api_key=[REDACTED]'));
  assert.ok(sanitized.nested.header.includes('Bearer [REDACTED]'));
  assert.strictEqual(sanitized.nested.userNote, 'Public notes here');

  // Verify list items
  assert.strictEqual(sanitized.list[0], 'path: ~/temp');
  assert.strictEqual(sanitized.list[1], 'normal-string');
});

test('DEP-05: Environment preflight doctor validates Node (>=20), FFmpeg, FFprobe, and storage permissions', () => {
  const doctorRes = runEnvironmentDoctor({ testDir: TEST_WORK_DIR });

  assert.strictEqual(typeof doctorRes.ok, 'boolean');
  assert.ok(doctorRes.checks.node);
  assert.strictEqual(doctorRes.checks.node.supported, true, 'Node version must be >= 20.0.0');
  assert.ok(doctorRes.checks.ffmpeg);
  assert.strictEqual(doctorRes.checks.ffmpeg.available, true, 'FFmpeg must be available in system path');
  assert.ok(doctorRes.checks.ffprobe);
  assert.strictEqual(doctorRes.checks.ffprobe.available, true, 'FFprobe must be available in system path');
  assert.ok(doctorRes.checks.storage);
  assert.strictEqual(doctorRes.checks.storage.writable, true, 'Scratch/test directory must be writable');

  // In standard development environment, all checks pass
  assert.strictEqual(doctorRes.ok, true);
  assert.strictEqual(doctorRes.errors.length, 0);
});
