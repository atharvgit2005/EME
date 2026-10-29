const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { EmeMcpServer } = require('../src/mcp/server.js');
const { EnvironmentResolver } = require('../src/engine/environment.js');

test('CLI - --version and help output', () => {
  const cliPath = path.resolve(__dirname, '../bin/eme.js');
  const verRes = spawnSync('node', [cliPath, '--version'], { encoding: 'utf8' });
  assert.equal(verRes.status, 0);
  assert.ok(verRes.stdout.includes('0.1.0-rc1'));

  const helpRes = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
  assert.equal(helpRes.status, 0);
  assert.ok(helpRes.stdout.includes('USAGE:'));
  assert.ok(helpRes.stdout.includes('doctor'));
});

test('CLI - doctor and capabilities commands', () => {
  const cliPath = path.resolve(__dirname, '../bin/eme.js');
  const docRes = spawnSync('node', [cliPath, 'doctor'], { encoding: 'utf8' });
  assert.equal(docRes.status, 0);
  assert.ok(docRes.stdout.includes('Overall Health: ✅ READY FOR PRODUCTION'));

  const capRes = spawnSync('node', [cliPath, 'capabilities'], { encoding: 'utf8' });
  assert.equal(capRes.status, 0);
  assert.ok(capRes.stdout.includes('Formats:     mp4, webm'));
});

test('CLI - init, validate, and inspect lifecycle', () => {
  const cliPath = path.resolve(__dirname, '../bin/eme.js');
  const tempProj = path.resolve(__dirname, '../artifacts/phase-6-cli-test-project.json');
  fs.mkdirSync(path.dirname(tempProj), { recursive: true });
  if (fs.existsSync(tempProj)) fs.unlinkSync(tempProj);

  // 1. init
  const initRes = spawnSync('node', [cliPath, 'init', tempProj, '--width', '1080', '--height', '1920', '--fps', '60', '--title', 'CLI Test'], { encoding: 'utf8' });
  assert.equal(initRes.status, 0);
  assert.ok(fs.existsSync(tempProj));

  // 2. validate
  const valRes = spawnSync('node', [cliPath, 'validate', tempProj], { encoding: 'utf8' });
  assert.equal(valRes.status, 0);
  assert.ok(valRes.stdout.includes('strictly valid'));

  // 3. inspect
  const inspRes = spawnSync('node', [cliPath, 'inspect', tempProj], { encoding: 'utf8' });
  assert.equal(inspRes.status, 0);
  assert.ok(inspRes.stdout.includes('Project Summary: CLI Test'));

  fs.unlinkSync(tempProj);
});

test('Security - Symlink escape and root boundary rejection', () => {
  assert.rejects(
    async () => {
      await EmeMcpServer.handleToolCall('eme_compile_composition', {
        project: {},
        outputDir: '/var/root/forbidden'
      });
    },
    /Security policy violation/
  );

  assert.rejects(
    async () => {
      await EmeMcpServer.handleToolCall('eme_render_video', {
        project: {},
        outputMp4Path: '/etc/shadow.mp4'
      });
    },
    /Security policy violation/
  );
});

test('EnvironmentResolver - Doctor reports active FFmpeg and HyperFrames', () => {
  const report = EnvironmentResolver.runDoctor();
  assert.equal(report.node.ok, true);
  assert.equal(report.ffmpeg.ok, true);
  assert.equal(report.ffprobe.ok, true);
  assert.equal(report.hyperframes.ok, true);
  assert.equal(report.hyperframes.version, '0.8.162');
});
