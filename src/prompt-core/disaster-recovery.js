/**
 * Editing Mechanics Engine (EME) - Deployment Safety, Backup & Disaster Recovery
 * Conforms to Phase 20 (Stage 20.3): Deployment Safety, Backup & Disaster Recovery Architecture
 *
 * Capabilities:
 * 1. Atomic project snapshot backup with cryptographic SHA-256 integrity manifest.
 * 2. Fail-closed project restore with pre-flight checksum verification.
 * 3. Secret and sensitive local filesystem path redactor for diagnostic telemetry.
 * 4. Production environment preflight validator (Node, FFmpeg, FFprobe, storage).
 * 5. Zero external runtime npm dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

/**
 * Computes SHA-256 digest of a file or string.
 *
 * @param {string} contentOrPath
 * @param {boolean} [isFile=false]
 * @returns {string}
 */
function computeSha256(contentOrPath, isFile = false) {
  const hash = crypto.createHash('sha256');
  if (isFile) {
    const data = fs.readFileSync(contentOrPath);
    hash.update(data);
  } else {
    hash.update(contentOrPath, 'utf8');
  }
  return hash.digest('hex');
}

/**
 * Creates an atomic, verified backup snapshot of a project file.
 *
 * @param {string} projectPath
 * @param {string} backupDir
 * @param {object} [options={}]
 * @returns {{ ok: boolean, backupPath: string|null, manifestPath: string|null, sha256: string|null, error?: string }}
 */
function createProjectBackup(projectPath, backupDir, options = {}) {
  try {
    if (!fs.existsSync(projectPath)) {
      return { ok: false, backupPath: null, manifestPath: null, sha256: null, error: `Project file not found: ${projectPath}` };
    }

    fs.mkdirSync(backupDir, { recursive: true });

    const rawContent = fs.readFileSync(projectPath, 'utf8');
    const projectSha256 = computeSha256(rawContent);
    const parsedProject = JSON.parse(rawContent);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = parsedProject.name || path.basename(projectPath, '.json');
    const backupFileName = `${projectName}_backup_${timestamp}_${crypto.randomBytes(3).toString('hex')}.json`;
    const backupPath = path.join(backupDir, backupFileName);
    const manifestPath = `${backupPath}.manifest.json`;

    // Atomic write to temporary file first
    const tmpBackupPath = `${backupPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpBackupPath, rawContent, 'utf8');
    fs.renameSync(tmpBackupPath, backupPath);

    const manifest = {
      schema_version: '1.0.0',
      backup_timestamp: new Date().toISOString(),
      source_project_path: path.resolve(projectPath),
      backup_path: backupPath,
      project_name: projectName,
      project_revision: parsedProject.revision || 0,
      sha256: projectSha256,
      byte_size: Buffer.byteLength(rawContent, 'utf8'),
      metadata: options.metadata || {}
    };

    const tmpManifestPath = `${manifestPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    fs.renameSync(tmpManifestPath, manifestPath);

    return {
      ok: true,
      backupPath,
      manifestPath,
      sha256: projectSha256,
      revision: parsedProject.revision || 0
    };
  } catch (err) {
    return {
      ok: false,
      backupPath: null,
      manifestPath: null,
      sha256: null,
      error: `Backup creation failed: ${err.message}`
    };
  }
}

/**
 * Restores a project from a verified backup snapshot, failing closed if checksums diverge.
 *
 * @param {string} backupPath
 * @param {string} targetProjectPath
 * @param {string} [manifestPath]
 * @returns {{ ok: boolean, restoredPath: string|null, sha256: string|null, error?: string }}
 */
function restoreProjectBackup(backupPath, targetProjectPath, manifestPath = null) {
  try {
    if (!fs.existsSync(backupPath)) {
      return { ok: false, restoredPath: null, sha256: null, error: `Backup file not found: ${backupPath}` };
    }

    const actualSha256 = computeSha256(backupPath, true);

    // If manifest path is provided or exists alongside backup, verify cryptographic hash
    const expectedManifest = manifestPath || `${backupPath}.manifest.json`;
    if (fs.existsSync(expectedManifest)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(expectedManifest, 'utf8'));
        if (manifest.sha256 && manifest.sha256 !== actualSha256) {
          return {
            ok: false,
            restoredPath: null,
            sha256: actualSha256,
            error: `Integrity check failed: Expected SHA-256 ${manifest.sha256}, calculated ${actualSha256}`
          };
        }
      } catch (e) {
        return { ok: false, restoredPath: null, sha256: null, error: `Invalid backup manifest: ${e.message}` };
      }
    }

    // Atomic in-place replacement
    const targetDir = path.dirname(targetProjectPath);
    fs.mkdirSync(targetDir, { recursive: true });

    const tmpRestorePath = `${targetProjectPath}.tmp.restore.${process.pid}.${Date.now()}`;
    fs.copyFileSync(backupPath, tmpRestorePath);
    fs.renameSync(tmpRestorePath, targetProjectPath);

    return {
      ok: true,
      restoredPath: path.resolve(targetProjectPath),
      sha256: actualSha256
    };
  } catch (err) {
    return {
      ok: false,
      restoredPath: null,
      sha256: null,
      error: `Restore operation failed: ${err.message}`
    };
  }
}

/**
 * Recursively sanitizes sensitive secrets, tokens, and home directory file paths.
 *
 * @param {any} value
 * @returns {any} Sanitized clone of input
 */
function redactSensitiveData(value) {
  if (value === null || value === undefined) return value;

  const homeDir = os.homedir();

  if (typeof value === 'string') {
    let result = value;
    // Redact home directory paths: /Users/username/... -> ~/...
    if (homeDir && homeDir.length > 3 && result.includes(homeDir)) {
      result = result.split(homeDir).join('~');
    }
    // Redact bearer tokens and secret values
    result = result.replace(/bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, 'Bearer [REDACTED]');
    result = result.replace(/(api[_-]?key|secret|password|token)\s*[:=]\s*["']?[a-zA-Z0-9_\-\.]{8,}["']?/gi, '$1=[REDACTED]');
    return result;
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveData(item));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    const sensitiveKeyRegex = /(password|secret|token|api_?key|auth|bearer|private_?key)/i;

    for (const [k, v] of Object.entries(value)) {
      if (sensitiveKeyRegex.test(k) && typeof v === 'string') {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = redactSensitiveData(v);
      }
    }
    return sanitized;
  }

  return value;
}

/**
 * Preflight environment diagnostic doctor checking toolchains and operational storage.
 *
 * @param {object} [options={}]
 * @returns {{ ok: boolean, checks: object, errors: string[] }}
 */
function runEnvironmentDoctor(options = {}) {
  const checks = {};
  const errors = [];

  // 1. Node.js Version Check (>= 20.0.0)
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace(/^v/, '').split('.')[0], 10);
  checks.node = {
    version: nodeVer,
    supported: major >= 20,
    required: '>= 20.0.0'
  };
  if (major < 20) {
    errors.push(`Node.js version ${nodeVer} is unsupported. Required >= 20.0.0`);
  }

  // 2. FFmpeg Executable Check
  try {
    const ffRes = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    if (ffRes.status === 0) {
      const firstLine = (ffRes.stdout || '').split('\n')[0];
      checks.ffmpeg = { available: true, version: firstLine };
    } else {
      checks.ffmpeg = { available: false, error: 'Non-zero exit code' };
      errors.push('ffmpeg executable returned non-zero status on version check');
    }
  } catch (e) {
    checks.ffmpeg = { available: false, error: e.message };
    errors.push(`ffmpeg executable not accessible: ${e.message}`);
  }

  // 3. FFprobe Executable Check
  try {
    const fpRes = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
    if (fpRes.status === 0) {
      const firstLine = (fpRes.stdout || '').split('\n')[0];
      checks.ffprobe = { available: true, version: firstLine };
    } else {
      checks.ffprobe = { available: false, error: 'Non-zero exit code' };
      errors.push('ffprobe executable returned non-zero status on version check');
    }
  } catch (e) {
    checks.ffprobe = { available: false, error: e.message };
    errors.push(`ffprobe executable not accessible: ${e.message}`);
  }

  // 4. Temporary / Scratch Storage Write Check
  const testDir = options.testDir || os.tmpdir();
  const testFile = path.join(testDir, `.eme_doctor_probe_${Date.now()}_${process.pid}`);
  try {
    fs.writeFileSync(testFile, 'probe_write_ok', 'utf8');
    fs.unlinkSync(testFile);
    checks.storage = { writable: true, path: testDir };
  } catch (e) {
    checks.storage = { writable: false, path: testDir, error: e.message };
    errors.push(`Storage probe write failed for ${testDir}: ${e.message}`);
  }

  return {
    ok: errors.length === 0,
    checks,
    errors
  };
}

module.exports = {
  computeSha256,
  createProjectBackup,
  restoreProjectBackup,
  redactSensitiveData,
  runEnvironmentDoctor
};
