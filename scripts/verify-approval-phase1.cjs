#!/usr/bin/env node
// Bounded Phase 1 verification. All generated logs/cleanup paths are newly allocated.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const evidence = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eme-phase1-verification-')));
const isolated = path.join(evidence, 'lock-regressions');
fs.mkdirSync(isolated);
// Legacy lock workers resolve source from cwd; this link contains no writable fixtures.
fs.symlinkSync(path.join(root, 'src'), path.join(isolated, 'src'), 'dir');
const groups = [
  { name: 'approval-and-focused', cwd: root, tests: [
    'phase1-approval-boundary.test.js', 'time.test.js', 'operations.test.js', 'timeline-operations.test.js',
    'timeline-stage18-2-operations.test.js', 'timeline-stage18-3-concurrency.test.js', 'mcp-server.test.js'
  ] },
  { name: 'locks-fencing-delivery', cwd: isolated, tests: [
    'workflow-stage19-lock-coordination.test.js', 'workflow-stage30-3-concurrency-fencing.test.js',
    'workflow-stage30-4-artifact-integrity.test.js'
  ] }
];
const results = [];
for (const group of groups) {
  const args = ['--test', '--test-reporter=tap', ...group.tests.map(file => path.join(root, 'tests', file))];
  const run = spawnSync(process.execPath, args, { cwd: group.cwd, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` }, maxBuffer: 16 * 1024 * 1024 });
  const log = path.join(evidence, `${group.name}.tap`);
  const raw = (run.stdout || '') + (run.stderr || '') + (run.error ? `\n${run.error.stack}\n` : '');
  fs.writeFileSync(log, raw, { flag: 'wx' });
  const summary = raw.split('\n').filter(line => /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(line));
  results.push({ group: group.name, command: [process.execPath, ...args], cwd: group.cwd,
    exitCode: run.status, signal: run.signal, log, summary });
  process.stdout.write(JSON.stringify(results[results.length - 1]) + '\n');
}
fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify({ node: process.version, evidence, results }, null, 2) + '\n', { flag: 'wx' });
process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0;
