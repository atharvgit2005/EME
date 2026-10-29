import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EmeMcpServer } = require('../src/mcp/server.js');
const { LayaDecisionAdapter } = await import('../src/decision-fabric/adapter/laya-decision-adapter.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Laya Shadow Mode & Statistical Planning Safety Certification', async (t) => {
  const adapter = new LayaDecisionAdapter();

  await t.test('1. MCP Server exposes shadow tools with strict advisory/shadowMode guarantees', async () => {
    // 1A. Tool listing
    const tools = EmeMcpServer.getTools();
    const toolNames = tools.map(t => t.name);
    assert.ok(toolNames.includes('eme_route_request'));
    assert.ok(toolNames.includes('eme_triage_color_mood'));
    assert.ok(toolNames.includes('eme_arbitrate_timeline'));

    // 1B. Route request tool
    const routeRes = await EmeMcpServer.handleToolCall('eme_route_request', {
      request_text: 'Denoise audio track and remove 60Hz ground hum'
    });
    assert.equal(routeRes.advisoryOnly, true);
    assert.equal(routeRes.shadowMode, true);
    assert.equal(routeRes.layaRoute, 'audio_cleanup');
    assert.equal(routeRes.consensus, true);
    assert.ok(routeRes.traceId);

    // 1C. Color mood tool
    const colorRes = await EmeMcpServer.handleToolCall('eme_triage_color_mood', {
      creativeBrief: 'Warm golden sunlit outdoor aesthetic'
    });
    assert.equal(colorRes.advisoryOnly, true);
    assert.equal(colorRes.shadowMode, true);
    assert.equal(colorRes.candidateLutId, 'warm_golden');
    assert.equal(colorRes.applied, false, 'Must never automatically apply LUT in shadow mode');

    // 1D. Timeline arbiter tool
    const timelineRes = await EmeMcpServer.handleToolCall('eme_arbitrate_timeline', {
      auditFindings: { cut_gaps_count: 2, user_permitted_gaps: false },
      editIntent: 'fast energetic pacing, snap to frame'
    });
    assert.equal(timelineRes.advisoryOnly, true);
    assert.equal(timelineRes.shadowMode, true);
    assert.equal(timelineRes.gapReviewRequired, true);
    assert.equal(timelineRes.mutated, false, 'Must never mutate timeline in shadow mode');
  });

  await t.test('2. CLI decision-fabric shadow command executes cleanly and writes comparison report', () => {
    const inputPath = path.join(ROOT, 'src', 'decision-fabric', 'data', 'test.jsonl');
    const outReport = '/tmp/test_cli_shadow_report.json';
    if (fs.existsSync(outReport)) fs.unlinkSync(outReport);

    const stdout = execFileSync('node', [
      path.join(ROOT, 'bin', 'eme.js'),
      'decision-fabric',
      'shadow',
      '--input', inputPath,
      '--out', outReport
    ], { encoding: 'utf8' });

    assert.ok(stdout.includes('EME Decision Fabric Shadow Run'));
    const expectedCases = fs.readFileSync(inputPath, 'utf8').trim().split('\n').length;
    assert.ok(stdout.includes(`Evaluated: ${expectedCases} cases`));
    assert.ok(fs.existsSync(outReport), 'Shadow report must be generated');

    const report = JSON.parse(fs.readFileSync(outReport, 'utf8'));
    assert.equal(report.mode, 'shadow_diagnostic');
    assert.equal(report.totalCases, expectedCases);
    assert.ok(report.consensusRate >= 0.90, 'Consensus rate between baseline and adapter should be >= 90%');
    assert.equal(report.comparisons.length, expectedCases);
  });

  await t.test('3. Statistical Planning Safety: 64/64 held-out complex requests escalate (Lower 95% Bound >= 95%)', async () => {
    const holdoutPath = path.join(ROOT, 'src', 'decision-fabric', 'data', 'complex_planning_holdout.jsonl');
    assert.ok(fs.existsSync(holdoutPath), 'complex_planning_holdout.jsonl must exist');

    const lines = fs.readFileSync(holdoutPath, 'utf8').trim().split('\n').filter(Boolean);
    const holdoutRecords = lines.map(l => JSON.parse(l));
    assert.equal(holdoutRecords.length, 64, 'Must have exactly 64 complex holdout cases');

    let captured = 0;
    const failures = [];

    for (const r of holdoutRecords) {
      const res = await adapter.routeRequest(r.state);
      const isNeedsPlanning = res.decision.route === 'needs_planning' || res.decision.action === 'escalate_to_system_2';
      if (isNeedsPlanning) {
        captured++;
      } else {
        failures.push({
          text: r.state.request_text,
          predictedRoute: res.decision.route,
          action: res.decision.action
        });
      }
    }

    const n = holdoutRecords.length;
    const k = captured;
    const empiricalRecall = k / n;

    // Clopper-Pearson exact binomial one-sided 95% lower confidence bound:
    // When k = n: lower_bound = alpha^(1/n) where alpha = 0.05
    const lower95Bound = Math.pow(0.05, 1 / n);

    console.log(`[Statistical Safety Audit] Captured ${k}/${n} complex requests (${(empiricalRecall * 100).toFixed(1)}%). One-sided 95% lower bound: ${(lower95Bound * 100).toFixed(2)}%.`);

    assert.equal(failures.length, 0, `Failed to escalate ${failures.length} complex requests: ${JSON.stringify(failures, null, 2)}`);
    assert.equal(captured, 64, 'All 64 complex cases must escalate to System 2');
    assert.ok(lower95Bound >= 0.95, `Lower 95% confidence bound (${(lower95Bound * 100).toFixed(2)}%) must be >= 95%`);
  });
});
