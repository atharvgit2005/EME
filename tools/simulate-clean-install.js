/**
 * Clean-Room Installation & Workflow Simulation
 *
 * Simulates a fresh developer installation in an isolated temporary directory:
 * 1. Packages EME into an npm tarball (`npm pack`)
 * 2. Unpacks/installs into `/tmp/eme-clean-install-test`
 * 3. Tests `eme --version`, `eme doctor`, `eme capabilities`
 * 4. Tests `eme init`, `eme validate`, `eme inspect`
 * 5. Tests `eme-mcp` stdio JSON-RPC initialization & tool listing
 * 6. Generates full clean-install test manifest
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runCleanInstallTest() {
  console.log('====================================================');
  console.log('  Phase 6 Clean-Room Installation Simulation Test');
  console.log('====================================================\n');

  const repoRoot = path.resolve(__dirname, '..');
  const releaseDir = path.join(repoRoot, 'artifacts/phase-6/release-candidate');
  fs.mkdirSync(releaseDir, { recursive: true });

  // 1. Generate npm pack tarball
  console.log('[Clean-Install] 1. Packing npm tarball...');
  const packOut = execSync('npm pack', { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n');
  const tarballName = packOut[packOut.length - 1].trim();
  const tarballPath = path.join(repoRoot, tarballName);
  const destTarball = path.join(releaseDir, tarballName);
  fs.copyFileSync(tarballPath, destTarball);
  console.log(`   ✔ Tarball created: ${destTarball} (${fs.statSync(destTarball).size} bytes)`);

  // Calculate sha256 checksum
  const sha256 = execSync(`shasum -a 256 "${destTarball}"`, { encoding: 'utf8' }).trim().split(' ')[0];
  console.log(`   ✔ SHA256: ${sha256}`);

  // 2. Set up isolated test directory
  const sandboxDir = '/tmp/eme-clean-install-sandbox';
  if (fs.existsSync(sandboxDir)) {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sandboxDir, { recursive: true });
  console.log(`\n[Clean-Install] 2. Setting up isolated sandbox at: ${sandboxDir}`);

  // Unpack tarball directly
  execSync(`tar -xzf "${destTarball}" -C "${sandboxDir}"`, { encoding: 'utf8' });
  const pkgDir = path.join(sandboxDir, 'package');
  console.log(`   ✔ Unpacked package contents to: ${pkgDir}`);

  // 3. Test CLI commands directly from installed package
  console.log('\n[Clean-Install] 3. Testing CLI entry points in clean environment...');
  const emeBin = path.join(pkgDir, 'bin/eme.js');
  const mcpBin = path.join(pkgDir, 'bin/eme-mcp.js');

  // Test --version
  const verRes = spawnSync('node', [emeBin, '--version'], { encoding: 'utf8' });
  assert.equal(verRes.status, 0);
  assert.ok(verRes.stdout.includes('0.1.0-rc1'));
  console.log(`   ✔ eme --version: ${verRes.stdout.trim()}`);

  // Test doctor
  const docRes = spawnSync('node', [emeBin, 'doctor'], { encoding: 'utf8' });
  assert.equal(docRes.status, 0);
  assert.ok(docRes.stdout.includes('Overall Health: ✅ READY FOR PRODUCTION'));
  console.log('   ✔ eme doctor: PASS');

  // Test capabilities
  const capRes = spawnSync('node', [emeBin, 'capabilities'], { encoding: 'utf8' });
  assert.equal(capRes.status, 0);
  assert.ok(capRes.stdout.includes('Formats:     mp4, webm'));
  console.log('   ✔ eme capabilities: PASS');

  // 4. Test project lifecycle
  console.log('\n[Clean-Install] 4. Testing Project Lifecycle in Sandbox...');
  const testProject = path.join(sandboxDir, 'sandbox-project.json');

  const initRes = spawnSync('node', [emeBin, 'init', testProject, '--width', '1080', '--height', '1920', '--fps', '60', '--title', 'Sandbox Project'], { encoding: 'utf8' });
  assert.equal(initRes.status, 0);
  console.log('   ✔ eme init: PASS');

  const valRes = spawnSync('node', [emeBin, 'validate', testProject], { encoding: 'utf8' });
  assert.equal(valRes.status, 0);
  assert.ok(valRes.stdout.includes('strictly valid'));
  console.log('   ✔ eme validate: PASS');

  const inspRes = spawnSync('node', [emeBin, 'inspect', testProject], { encoding: 'utf8' });
  assert.equal(inspRes.status, 0);
  assert.ok(inspRes.stdout.includes('Sandbox Project'));
  console.log('   ✔ eme inspect: PASS');

  // 5. Test synthetic project compile, render, and inspect-frame
  console.log('\n[Clean-Install] 5. Testing Synthetic Composition Compile & Render in Sandbox...');
  const compDir = path.join(sandboxDir, 'sandbox-comp');
  const compRes = spawnSync('node', [emeBin, 'compile', testProject, '--out', compDir], { encoding: 'utf8' });
  assert.equal(compRes.status, 0);
  assert.ok(fs.existsSync(path.join(compDir, 'index.html')));
  console.log('   ✔ eme compile: PASS');

  const outMp4 = path.join(sandboxDir, 'sandbox-render.mp4');
  console.log('   Running eme render in sandbox...');
  const renderRes = spawnSync('node', [emeBin, 'render', testProject, '--out', outMp4], { encoding: 'utf8' });
  assert.equal(renderRes.status, 0);
  assert.ok(fs.existsSync(outMp4));
  console.log(`   ✔ eme render: PASS (${fs.statSync(outMp4).size} bytes)`);

  const outPng = path.join(sandboxDir, 'sandbox-frame.png');
  const inspectRes = spawnSync('node', [emeBin, 'inspect-frame', outMp4, '--time', '1.0', '--out', outPng], { encoding: 'utf8' });
  assert.equal(inspectRes.status, 0);
  assert.ok(fs.existsSync(outPng));
  console.log(`   ✔ eme inspect-frame: PASS (${fs.statSync(outPng).size} bytes)`);

  // 6. Test MCP Server over stdio (including tool calls on sandbox project)
  console.log('\n[Clean-Install] 6. Testing packaged MCP server over stdio JSON-RPC...');
  const initRpc = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n';
  const listRpc = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n';
  const inspectRpc = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'eme_inspect_project', arguments: { projectPath: testProject } } }) + '\n';
  const badOpRpc = JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'eme_execute_operation', arguments: { project: { revision: 0 }, operation: { type: 'invalid_op' } } } }) + '\n';

  const mcpProc = spawnSync('node', [mcpBin], {
    input: initRpc + listRpc + inspectRpc + badOpRpc,
    encoding: 'utf8',
    timeout: 10000
  });

  assert.equal(mcpProc.status, 0);
  const lines = mcpProc.stdout.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert.equal(lines.length, 4);
  assert.equal(lines[0].result.serverInfo.name, 'eme-mcp-server');
  assert.ok(lines[1].result.tools.length >= 9);
  assert.ok(lines[2].result.content[0].text.includes('Sandbox Project'));
  const badOpData = JSON.parse(lines[3].result.content[0].text);
  assert.equal(badOpData.success, false);
  console.log(`   ✔ MCP initialize, tools/list, eme_inspect_project & rollback error: PASS`);

  // Clean up sandbox
  fs.rmSync(sandboxDir, { recursive: true, force: true });
  fs.unlinkSync(tarballPath);

  // Generate manifest
  const manifest = {
    verdict: 'PASS',
    tarball: tarballName,
    tarballPath: destTarball,
    sha256,
    version: '0.1.0-rc1',
    cleanInstallTest: 'PASS',
    cliCommandsTested: [
      '--version',
      'doctor',
      'capabilities',
      'init',
      'validate',
      'inspect',
      'compile',
      'render',
      'inspect-frame'
    ],
    mcpServerTested: {
      stdioProtocol: true,
      toolDiscoveryCount: lines[1].result.tools.length,
      inspectProjectCall: true,
      errorRollbackCall: true
    },
    renderingVerification: {
      compiledComposition: true,
      renderedMp4: true,
      frameExtracted: true
    },
    timestamp: new Date().toISOString()
  };

  const manifestPath = path.join(releaseDir, 'clean-install-report.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n🎉 Full Clean-Room Install, Render & MCP Verification PASS! Manifest saved: ${manifestPath}`);

  return manifest;
}

if (require.main === module) {
  runCleanInstallTest().catch(err => {
    console.error('Clean install simulation failed:', err);
    process.exit(1);
  });
}

module.exports = { runCleanInstallTest };
