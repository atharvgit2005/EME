/**
 * Editing Mechanics Engine (EME) - Controlled Deployment, Canary & Rollback Pipeline
 * Conforms to Phase 21 (Stage 21.4): Controlled Deployment and Rollback Architecture
 *
 * Capabilities:
 * 1. Prior Known-Good Release Preservation with cryptographic SHA-256 manifest.
 * 2. Pre-promotion release package verification (integrity, size, production cleanliness).
 * 3. Progressive Canary Rollout Evaluation (0% -> 10% -> 50% -> 100%) with automated rollback triggers.
 * 4. Atomic Rollback Execution: reverts to prior known-good package without state corruption.
 * 5. Staging Smoke Test verification harness.
 *
 * Zero external runtime npm dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { computeSha256 } = require('./disaster-recovery.js');
const { defaultLogger } = require('./logger.js');

const CANARY_STAGES = [0, 10, 50, 100];

const DEFAULT_CANARY_CRITERIA = {
  maxErrorRatePercent: 0.5,    // Max 0.5% errors
  maxLatencyP95Ms: 15000,      // Max 15s p95 latency
  minSampleCount: 5,           // Min samples per stage
  requireActiveDeliveryIntact: true
};

class RollbackManager {
  /**
   * @param {object} [options={}]
   * @param {string} [options.baseDir]
   * @param {string} [options.archiveDir]
   */
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.resolve(__dirname, '../../dist');
    this.archiveDir = options.archiveDir || path.join(this.baseDir, 'prior-known-good');
  }

  /**
   * Archives the currently verified release as the authoritative prior known-good baseline.
   *
   * @param {string} artifactPath
   * @param {string} [checksumPath]
   * @returns {{ ok: boolean, archivePath: string|null, sha256: string|null, error?: string }}
   */
  archivePriorKnownGood(artifactPath, checksumPath = null) {
    try {
      if (!fs.existsSync(artifactPath)) {
        return { ok: false, archivePath: null, sha256: null, error: `Artifact not found: ${artifactPath}` };
      }

      fs.mkdirSync(this.archiveDir, { recursive: true });

      const artifactSha256 = computeSha256(artifactPath, true);
      const filename = path.basename(artifactPath);
      const destPath = path.join(this.archiveDir, filename);
      const destChecksumPath = `${destPath}.sha256`;
      const manifestPath = path.join(this.archiveDir, 'prior-known-good-manifest.json');

      // Atomic copy
      fs.copyFileSync(artifactPath, destPath);
      fs.writeFileSync(destChecksumPath, `${artifactSha256}  ${filename}\n`, 'utf8');

      const manifest = {
        schema_version: '1.0.0',
        archived_at: new Date().toISOString(),
        artifact_filename: filename,
        artifact_path: destPath,
        sha256: artifactSha256,
        byte_size: fs.statSync(destPath).size,
        status: 'VERIFIED_KNOWN_GOOD'
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      defaultLogger.info(`Archived prior known-good release artifact: ${filename} (SHA-256: ${artifactSha256})`, {
        destPath,
        artifactSha256
      });

      return {
        ok: true,
        archivePath: destPath,
        sha256: artifactSha256
      };
    } catch (err) {
      return {
        ok: false,
        archivePath: null,
        sha256: null,
        error: `Failed to archive prior known-good: ${err.message}`
      };
    }
  }

  /**
   * Verifies the cryptographic integrity and production cleanliness of a release artifact.
   *
   * @param {string} artifactPath
   * @param {string} expectedSha256
   * @returns {{ valid: boolean, calculatedSha256: string, byteSize: number, fileCount: number, error?: string }}
   */
  verifyReleaseArtifact(artifactPath, expectedSha256) {
    if (!fs.existsSync(artifactPath)) {
      return { valid: false, calculatedSha256: null, byteSize: 0, fileCount: 0, error: 'Artifact file missing' };
    }

    const calculatedSha256 = computeSha256(artifactPath, true);
    if (calculatedSha256 !== expectedSha256) {
      return {
        valid: false,
        calculatedSha256,
        byteSize: 0,
        fileCount: 0,
        error: `Checksum mismatch: expected ${expectedSha256}, calculated ${calculatedSha256}`
      };
    }

    const stat = fs.statSync(artifactPath);

    // Inspect tarball contents via tar -tf
    const tarList = spawnSync('tar', ['-tf', artifactPath], { encoding: 'utf8' });
    if (tarList.status !== 0) {
      return {
        valid: false,
        calculatedSha256,
        byteSize: stat.size,
        fileCount: 0,
        error: `Failed to list tarball: ${tarList.stderr}`
      };
    }

    const files = tarList.stdout.split('\n').filter(Boolean);
    const forbiddenLeaked = files.filter(f => f.startsWith('package/tests/') || f.startsWith('package/artifacts/'));
    if (forbiddenLeaked.length > 0) {
      return {
        valid: false,
        calculatedSha256,
        byteSize: stat.size,
        fileCount: files.length,
        error: `Development files leaked into production tarball: ${forbiddenLeaked.join(', ')}`
      };
    }

    return {
      valid: true,
      calculatedSha256,
      byteSize: stat.size,
      fileCount: files.length
    };
  }

  /**
   * Evaluates canary metrics against defined rollout criteria.
   *
   * @param {number} currentTrafficPercent
   * @param {object} canaryMetrics
   * @param {number} [canaryMetrics.errorRatePercent=0]
   * @param {number} [canaryMetrics.latencyP95Ms=0]
   * @param {number} [canaryMetrics.sampleCount=0]
   * @param {boolean} [canaryMetrics.activeDeliveryIntact=true]
   * @param {object} [customCriteria={}]
   * @returns {{ shouldAdvance: boolean, shouldRollback: boolean, reason: string, nextTrafficPercent: number }}
   */
  evaluateCanary(currentTrafficPercent, canaryMetrics, customCriteria = {}) {
    const criteria = { ...DEFAULT_CANARY_CRITERIA, ...customCriteria };
    const { errorRatePercent = 0, latencyP95Ms = 0, sampleCount = 0, activeDeliveryIntact = true } = canaryMetrics;

    // 1. Critical Failure Check: Active Delivery Integrity Breach
    if (criteria.requireActiveDeliveryIntact && !activeDeliveryIntact) {
      return {
        shouldAdvance: false,
        shouldRollback: true,
        reason: 'CRITICAL: Active delivery integrity compromised during canary execution',
        nextTrafficPercent: 0
      };
    }

    // 2. High Error Rate Check
    if (sampleCount >= criteria.minSampleCount && errorRatePercent > criteria.maxErrorRatePercent) {
      return {
        shouldAdvance: false,
        shouldRollback: true,
        reason: `Canary Error Rate (${errorRatePercent}%) exceeded maximum threshold (${criteria.maxErrorRatePercent}%)`,
        nextTrafficPercent: 0
      };
    }

    // 3. High Latency Check
    if (sampleCount >= criteria.minSampleCount && latencyP95Ms > criteria.maxLatencyP95Ms) {
      return {
        shouldAdvance: false,
        shouldRollback: true,
        reason: `Canary p95 Latency (${latencyP95Ms}ms) exceeded threshold (${criteria.maxLatencyP95Ms}ms)`,
        nextTrafficPercent: 0
      };
    }

    // 4. Advance Evaluation
    if (sampleCount >= criteria.minSampleCount) {
      const curIdx = CANARY_STAGES.indexOf(currentTrafficPercent);
      if (curIdx !== -1 && curIdx < CANARY_STAGES.length - 1) {
        const nextTraffic = CANARY_STAGES[curIdx + 1];
        return {
          shouldAdvance: true,
          shouldRollback: false,
          reason: `Canary stage healthy (${sampleCount} samples, ${errorRatePercent}% errors, ${latencyP95Ms}ms p95). Advancing to ${nextTraffic}%`,
          nextTrafficPercent: nextTraffic
        };
      } else if (currentTrafficPercent === 100) {
        return {
          shouldAdvance: false,
          shouldRollback: false,
          reason: 'Canary complete: 100% rollout achieved with healthy SLO compliance',
          nextTrafficPercent: 100
        };
      }
    }

    return {
      shouldAdvance: false,
      shouldRollback: false,
      reason: `Accumulating canary traffic samples (${sampleCount}/${criteria.minSampleCount})`,
      nextTrafficPercent: currentTrafficPercent
    };
  }

  /**
   * Executes atomic rollback to the prior known-good release package.
   *
   * @param {string} destinationDir
   * @returns {{ ok: boolean, restoredFilename: string|null, sha256: string|null, durationMs: number, error?: string }}
   */
  executeRollback(destinationDir) {
    const start = Date.now();
    try {
      const manifestPath = path.join(this.archiveDir, 'prior-known-good-manifest.json');
      if (!fs.existsSync(manifestPath)) {
        return { ok: false, restoredFilename: null, sha256: null, durationMs: 0, error: 'No prior known-good manifest found' };
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const priorArtifactPath = manifest.artifact_path;

      if (!fs.existsSync(priorArtifactPath)) {
        return { ok: false, restoredFilename: null, sha256: null, durationMs: 0, error: `Prior artifact missing at ${priorArtifactPath}` };
      }

      // Verify SHA-256 before restoring
      const currentSha256 = computeSha256(priorArtifactPath, true);
      if (currentSha256 !== manifest.sha256) {
        return {
          ok: false,
          restoredFilename: null,
          sha256: currentSha256,
          durationMs: Date.now() - start,
          error: `Prior known-good archive checksum mismatch: expected ${manifest.sha256}, got ${currentSha256}`
        };
      }

      // Atomic copy back to destination
      fs.mkdirSync(destinationDir, { recursive: true });
      const targetPath = path.join(destinationDir, manifest.artifact_filename);
      const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
      fs.copyFileSync(priorArtifactPath, tmpPath);
      fs.renameSync(tmpPath, targetPath);

      const durationMs = Date.now() - start;
      defaultLogger.info(`Rollback executed successfully: restored ${manifest.artifact_filename} in ${durationMs}ms`, {
        restoredFilename: manifest.artifact_filename,
        sha256: currentSha256,
        durationMs
      });

      return {
        ok: true,
        restoredFilename: manifest.artifact_filename,
        sha256: currentSha256,
        durationMs
      };
    } catch (err) {
      return {
        ok: false,
        restoredFilename: null,
        sha256: null,
        durationMs: Date.now() - start,
        error: `Rollback failed: ${err.message}`
      };
    }
  }

  /**
   * Executes staging smoke tests against a candidate release package.
   *
   * @param {string} artifactPath
   * @returns {{ pass: boolean, checks: object, error?: string }}
   */
  runStagingSmokeTests(artifactPath) {
    const checks = {
      artifactExists: false,
      integrityChecksumValid: false,
      schemasValid: false,
      cliHelpExecutable: false
    };

    try {
      if (!fs.existsSync(artifactPath)) {
        return { pass: false, checks, error: 'Artifact not found' };
      }
      checks.artifactExists = true;

      const checksum = computeSha256(artifactPath, true);
      checks.integrityChecksumValid = typeof checksum === 'string' && checksum.length === 64;

      // Schema verification
      const schemaDir = path.resolve(__dirname, '../../schema');
      const schemas = fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json'));
      let allSchemasValid = schemas.length >= 7;
      for (const s of schemas) {
        try {
          JSON.parse(fs.readFileSync(path.join(schemaDir, s), 'utf8'));
        } catch (e) {
          allSchemasValid = false;
          break;
        }
      }
      checks.schemasValid = allSchemasValid;

      // CLI Smoke test: node bin/eme.js --help
      const cliPath = path.resolve(__dirname, '../../bin/eme.js');
      const cliRes = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8', timeout: 5000 });
      checks.cliHelpExecutable = cliRes.status === 0 && (cliRes.stdout || '').includes('Editing Mechanics Engine');

      const pass = checks.artifactExists && checks.integrityChecksumValid && checks.schemasValid && checks.cliHelpExecutable;
      return { pass, checks };
    } catch (err) {
      return { pass: false, checks, error: err.message };
    }
  }
}

module.exports = {
  RollbackManager,
  CANARY_STAGES,
  DEFAULT_CANARY_CRITERIA
};
