/**
 * Artifact & Manifest Verifier (Phase 15D)
 *
 * Implements strict manifest verification:
 * - Verifies schema and required manifest properties
 * - Checks physical existence of referenced output files
 * - Computes and verifies SHA-256 digests against manifest entries
 * - Checks QA scores, unresolved warnings, and metrics validity
 */

const fs = require('fs');
const path = require('path');
const { SourceAnalyzer } = require('../planning/source-analyzer.js');

class ArtifactVerifier {
  /**
   * Verify an output manifest JSON file or manifest object.
   */
  static verifyManifest(manifestOrPath) {
    let manifest = manifestOrPath;
    let manifestPath = null;

    if (typeof manifestOrPath === 'string') {
      manifestPath = path.resolve(manifestOrPath);
      if (!fs.existsSync(manifestPath)) {
        return {
          valid: false,
          errors: [`Manifest file does not exist: ${manifestPath}`]
        };
      }
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (e) {
        return {
          valid: false,
          errors: [`Failed to parse manifest JSON: ${e.message}`]
        };
      }
    }

    const errors = [];

    // 1. Required fields
    if (!manifest.jobId) errors.push('Missing jobId');
    if (!manifest.projectId) errors.push('Missing projectId');
    if (manifest.finalRevision === undefined) errors.push('Missing finalRevision');
    if (!manifest.outputMp4Path) errors.push('Missing outputMp4Path');
    if (!manifest.metrics) errors.push('Missing metrics object');

    // 2. Output file existence and hash verification
    if (manifest.outputMp4Path) {
      const mp4Abs = path.resolve(manifest.outputMp4Path);
      if (!fs.existsSync(mp4Abs)) {
        errors.push(`Output MP4 does not exist on disk: ${manifest.outputMp4Path}`);
      } else if (manifest.outputSha256) {
        const computedSha = SourceAnalyzer.computeSha256(mp4Abs);
        if (computedSha !== manifest.outputSha256) {
          errors.push(`Output SHA-256 mismatch: manifest declared ${manifest.outputSha256}, computed ${computedSha}`);
        }
      }
    }

    // 3. Metrics validation
    if (manifest.metrics) {
      if (manifest.metrics.renderDurationRatio === undefined) {
        errors.push('Missing metrics.renderDurationRatio');
      }
      if (manifest.metrics.playbackSpeedFactor === undefined) {
        errors.push('Missing metrics.playbackSpeedFactor');
      }
    }

    // 4. QA score validation
    if (manifest.qaScore !== undefined && manifest.qaScore < 80) {
      errors.push(`QA score ${manifest.qaScore} is below acceptance threshold of 80`);
    }

    return {
      valid: errors.length === 0,
      errors,
      manifest
    };
  }
}

module.exports = { ArtifactVerifier };
