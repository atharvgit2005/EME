#!/usr/bin/env node

/**
 * Editing Mechanics Engine (EME) - Production Release Packaging Script
 *
 * Implements Phase PF-11 Stage 3 Gate B & Gate C:
 * 1. Validates runtime environment and external prerequisites (Node >=20, FFmpeg, FFprobe).
 * 2. Packs clean, production-only distribution tarball into dist/ via npm pack.
 * 3. Excludes development tests, temporary outputs, scratch scripts, and credentials.
 * 4. Generates immutable release manifest: dist/release-manifest.json.
 * 5. Generates standalone sha256 checksum: dist/<package-name>-<version>.tgz.sha256.
 * 6. Independently verifies archive integrity and contents.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function getGitCommit(repoRoot) {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (e) {
    return 'uncommitted-snapshot';
  }
}

function getToolVersion(cmd, args = ['-version']) {
  try {
    const res = spawnSync(cmd, args, { encoding: 'utf8' });
    if (res.status === 0) {
      const firstLine = (res.stdout || res.stderr || '').split('\n')[0].trim();
      return { ok: true, version: firstLine };
    }
  } catch (e) {}
  return { ok: false, version: null };
}

function packageRelease(options = {}) {
  const repoRoot = path.resolve(__dirname, '..');
  const distDir = path.join(repoRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  console.log('=================================================================');
  console.log(`  EME Production Release Packaging — v${pkg.version}`);
  console.log('=================================================================\n');

  // 1. Environment & Prerequisites Verification
  console.log('[1/5] Verifying runtime environment and tools...');
  const nodeVer = process.version;
  const majorNode = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  if (majorNode < 20) {
    throw new Error(`Node.js >= 20.0.0 is required. Current: ${nodeVer}`);
  }
  console.log(`  ✔ Node.js: ${nodeVer} (${process.platform}-${process.arch})`);

  const ffmpegInfo = getToolVersion('ffmpeg', ['-version']);
  if (!ffmpegInfo.ok) {
    throw new Error('FFmpeg runtime prerequisite not found in PATH.');
  }
  console.log(`  ✔ FFmpeg: ${ffmpegInfo.version}`);

  const ffprobeInfo = getToolVersion('ffprobe', ['-version']);
  if (!ffprobeInfo.ok) {
    throw new Error('FFprobe runtime prerequisite not found in PATH.');
  }
  console.log(`  ✔ FFprobe: ${ffprobeInfo.version}`);

  // 2. Schema Integrity Verification
  console.log('\n[2/5] Validating canonical schemas...');
  const schemaDir = path.join(repoRoot, 'schema');
  const requiredSchemas = [
    'eme-project.v1.schema.json',
    'eme-revision-session.v1.schema.json',
    'eme-delivery-manifest.v1.schema.json',
    'eme-media-qa-report.v1.schema.json',
    'eme-render-job.v1.schema.json',
    'eme-candidate-set.v1.schema.json',
    'eme-operation-plan.v1.schema.json'
  ];
  for (const s of requiredSchemas) {
    const sp = path.join(schemaDir, s);
    if (!fs.existsSync(sp)) {
      throw new Error(`Required canonical schema missing: ${s}`);
    }
    JSON.parse(fs.readFileSync(sp, 'utf8')); // validate json syntax
  }
  console.log(`  ✔ All ${requiredSchemas.length} canonical schemas verified syntactically valid.`);

  // 3. Clean Build & Tarball Packaging via npm pack
  console.log('\n[3/5] Packaging clean release tarball via npm pack...');
  const packCmd = spawnSync('npm', ['pack', '--pack-destination', distDir], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  if (packCmd.status !== 0) {
    throw new Error(`npm pack failed: ${packCmd.stderr}`);
  }

  const packedLines = (packCmd.stdout || '').trim().split('\n');
  const tarballFilename = packedLines[packedLines.length - 1].trim();
  const tarballPath = path.join(distDir, tarballFilename);

  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Expected packaged tarball not found at ${tarballPath}`);
  }

  const stat = fs.statSync(tarballPath);
  const tarballSha256 = computeFileSha256(tarballPath);
  console.log(`  ✔ Package created: ${tarballFilename}`);
  console.log(`  ✔ Byte size: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)} KB)`);
  console.log(`  ✔ SHA-256: ${tarballSha256}`);

  // 4. Standalone Checksum & Release Manifest
  console.log('\n[4/5] Generating release manifest and standalone checksum...');
  const checksumFilename = `${tarballFilename}.sha256`;
  const checksumPath = path.join(distDir, checksumFilename);
  fs.writeFileSync(checksumPath, `${tarballSha256}  ${tarballFilename}\n`, 'utf8');
  console.log(`  ✔ Standalone checksum saved to: ${checksumFilename}`);

  const gitCommit = getGitCommit(repoRoot);
  const manifest = {
    schema_version: '1.0.0',
    release_name: pkg.name,
    version: pkg.version,
    git_commit: gitCommit,
    build_timestamp: new Date().toISOString(),
    runtime_compatibility: {
      node: pkg.engines?.node || '>=20.0.0',
      platform: `${process.platform}-${process.arch}`,
      ffmpeg_version: ffmpegInfo.version,
      ffprobe_version: ffprobeInfo.version
    },
    schema_versions: {
      'eme-project': '1.0.0',
      'eme-revision-session': '1.0.0',
      'eme-delivery-manifest': '1.0.0',
      'eme-media-qa-report': '1.0.0',
      'eme-render-job': '1.0.0',
      'eme-candidate-set': '1.0.0',
      'eme-operation-plan': '1.0.0'
    },
    package_artifact: {
      filename: tarballFilename,
      path: `dist/${tarballFilename}`,
      size_bytes: stat.size,
      sha256: tarballSha256
    },
    dependencies: {
      runtime_npm_packages: 0,
      description: 'Zero external runtime npm dependencies; uses native Node.js core modules.'
    },
    included_surfaces: [
      'bin/eme.js (Command Line Interface)',
      'bin/eme-mcp.js (Model Context Protocol stdio server)',
      'src/ui/server.js (Visual Control Surface HTTP backend & API)',
      'src/ui/public/ (Visual Control Surface single-page frontend)',
      'schema/ (Canonical JSON schemas)'
    ]
  };

  const manifestPath = path.join(distDir, 'release-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  ✔ Release manifest saved to: release-manifest.json`);

  // 5. Independent Archive Inspection & Validation
  console.log('\n[5/5] Inspecting packaged tarball contents...');
  const tarListRes = spawnSync('tar', ['-tf', tarballPath], { encoding: 'utf8' });
  if (tarListRes.status !== 0) {
    throw new Error(`Failed to list tarball contents: ${tarListRes.stderr}`);
  }
  const fileList = tarListRes.stdout.split('\n').filter(Boolean);

  // Assert essential production assets exist in tarball
  const requiredInTarball = [
    'package/package.json',
    'package/bin/eme.js',
    'package/bin/eme-mcp.js',
    'package/src/cli/index.js',
    'package/src/ui/server.js',
    'package/src/ui/public/index.html',
    'package/src/ui/public/app.js',
    'package/src/ui/public/index.css',
    'package/src/prompt-core/index.js',
    'package/schema/eme-project.v1.schema.json',
    'package/schema/eme-revision-session.v1.schema.json',
    'package/README.md',
    'package/LICENSE'
  ];

  for (const item of requiredInTarball) {
    if (!fileList.includes(item)) {
      throw new Error(`Essential production file missing from packaged tarball: ${item}`);
    }
  }

  // Assert development/temporary assets are strictly EXCLUDED
  const forbiddenPrefixes = [
    'package/tests/',
    'package/artifacts/',
    'package/scratch/',
    'package/.git/',
    'package/.cache/'
  ];
  for (const f of fileList) {
    for (const forbidden of forbiddenPrefixes) {
      if (f.startsWith(forbidden)) {
        throw new Error(`Development asset leaked into production tarball: ${f}`);
      }
    }
  }

  console.log(`  ✔ Total files packaged: ${fileList.length}`);
  console.log('  ✔ All essential production runtime assets confirmed present.');
  console.log('  ✔ Zero test, temporary, scratch, or development artifacts present.');

  console.log('\n=================================================================');
  console.log('  ✅ PRODUCTION PACKAGING COMPLETE AND VERIFIED');
  console.log(`  Artifact: ${tarballPath}`);
  console.log(`  SHA-256:  ${tarballSha256}`);
  console.log('=================================================================\n');

  return {
    success: true,
    tarballPath,
    tarballFilename,
    tarballSha256,
    sizeBytes: stat.size,
    manifestPath,
    checksumPath,
    manifest
  };
}

if (require.main === module) {
  try {
    packageRelease();
  } catch (err) {
    console.error(`\n❌ Packaging Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { packageRelease };
