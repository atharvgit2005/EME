import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LayaDecisionAdapter } from '../src/decision-fabric/adapter/laya-decision-adapter.js';
import { canaryLogger, CANDIDATE_COMPONENT_HASHES } from '../src/decision-fabric/adapter/canary-telemetry-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Laya Advisory Canary: Telemetry attachment with Candidate 2 identity and component hashes', async () => {
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();
  canaryLogger.clear();

  const adapter = new LayaDecisionAdapter();
  const res = await adapter.routeRequest('Generate synchronized burned captions for vertical reel');

  assert.equal(res.success, true);
  assert.ok(res.canaryAdvisory, 'canaryAdvisory payload must be attached when active');
  assert.equal(res.canaryAdvisory.enabled, true);
  assert.equal(res.canaryAdvisory.advisoryOnly, true);
  assert.equal(res.canaryAdvisory.candidateId, 'candidate2');
  assert.equal(res.canaryAdvisory.buildIdentifier, 'eme-v0.1.0-rc1-candidate2');
  assert.equal(res.canaryAdvisory.manifestFile, 'src/decision-fabric/artifacts/m6-candidate2-manifest.json');
  assert.equal(res.canaryAdvisory.authoritativeEngine, 'deterministic_router');
  assert.equal(res.canaryAdvisory.executionPrivilege, 'none');

  // Verify component hashes match Candidate 2 sealed manifest
  assert.equal(res.canaryAdvisory.componentHashes.adapter, CANDIDATE_COMPONENT_HASHES.adapter);
  assert.equal(res.canaryAdvisory.componentHashes.policyGate, CANDIDATE_COMPONENT_HASHES.policyGate);
  assert.equal(res.canaryAdvisory.componentHashes.deterministicRouter, CANDIDATE_COMPONENT_HASHES.deterministicRouter);
  assert.equal(res.canaryAdvisory.componentHashes.routingPolicy, CANDIDATE_COMPONENT_HASHES.routingPolicy);

  // Clean up
  delete process.env.CANARY_ADVISORY_MODE;
});

test('Laya Advisory Canary: Deterministic router remains 100% authoritative', async () => {
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();

  const adapter = new LayaDecisionAdapter();
  const brief = 'Trim footage and add warm golden grade with captions';
  const routeRes = await adapter.routeRequest(brief);
  const baselineRes = adapter.baselineRouter.predict({ request_text: brief });

  assert.equal(routeRes.decision.route, baselineRes.answers.intent.choice);
  assert.equal(routeRes.canaryAdvisory.authoritativeEngine, 'deterministic_router');
  assert.equal(routeRes.canaryAdvisory.executionPrivilege, 'none');

  delete process.env.CANARY_ADVISORY_MODE;
});

test('Laya Advisory Canary: Creative color and timeline arbitration have zero execution privileges', async () => {
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();

  const adapter = new LayaDecisionAdapter();

  // Color mood triage
  const colorRes = await adapter.triageColorMood('warm golden sunlit afternoon');
  assert.ok(colorRes.canaryAdvisory);
  assert.equal(colorRes.canaryAdvisory.applied, false, 'LUT must never be automatically applied');
  assert.equal(colorRes.canaryAdvisory.executionPrivilege, 'none');
  assert.equal(colorRes.canaryAdvisory.componentHashes.adapter, CANDIDATE_COMPONENT_HASHES.adapter);

  // Timeline arbitration
  const timelineRes = await adapter.arbitrateTimeline({ cut_gaps_count: 2 }, 'fast energetic pacing');
  assert.ok(timelineRes.canaryAdvisory);
  assert.equal(timelineRes.canaryAdvisory.mutated, false, 'Timeline must never be automatically mutated');
  assert.equal(timelineRes.canaryAdvisory.executionPrivilege, 'none');
  assert.equal(timelineRes.canaryAdvisory.componentHashes.adapter, CANDIDATE_COMPONENT_HASHES.adapter);

  delete process.env.CANARY_ADVISORY_MODE;
});

test('Laya Advisory Canary: Policy gate strictly enforces prerequisite blocks', async () => {
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();

  const adapter = new LayaDecisionAdapter();
  const invalidState = {
    request_text: 'Render and export master video',
    project_context: {
      source_media_available: false,
      media_integrity_passed: false,
      timeline_editable: false
    }
  };

  const blockedRes = await adapter.routeRequest(invalidState);
  assert.equal(blockedRes.decision.action, 'reject', 'Missing prerequisites must trigger reject action');
  assert.ok(blockedRes.canaryAdvisory.policyEnforced, 'Policy enforcement flag must be true');

  delete process.env.CANARY_ADVISORY_MODE;
});

test('Laya Advisory Canary: Immediate rollback on flag deactivation (CANARY_ADVISORY_MODE=false)', async () => {
  // First verify active
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();
  const adapter = new LayaDecisionAdapter();
  const activeRes = await adapter.routeRequest('Render final master video');
  assert.ok(activeRes.canaryAdvisory);

  // Now deactivate
  delete process.env.CANARY_ADVISORY_MODE;
  const rollbackRes = await adapter.routeRequest('Render final master video');
  assert.equal(rollbackRes.canaryAdvisory, undefined, 'canaryAdvisory must be cleanly absent when flag is deactivated');
  assert.equal(rollbackRes.success, true);
});

test('Laya Advisory Canary: Immediate rollback on simulated safety breach (circuit breaker)', async () => {
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();

  const adapter = new LayaDecisionAdapter();
  const activeRes = await adapter.routeRequest('Create 1080p vertical reel');
  assert.ok(activeRes.canaryAdvisory, 'Canary must be active before trip');

  // Simulate safety supervisor detecting an invariant breach or unauthorized mutation
  canaryLogger.tripCircuitBreaker('simulated_unauthorized_state_mutation');
  assert.equal(canaryLogger.isCanaryActive(), false, 'Canary must immediately deactivate on trip');

  // Next request must cleanly omit advisory payload despite CANARY_ADVISORY_MODE=true in env
  const safeRes = await adapter.routeRequest('Create 1080p vertical reel');
  assert.equal(safeRes.canaryAdvisory, undefined, 'Canary payload must be suppressed when circuit breaker is tripped');
  assert.equal(safeRes.success, true, 'Deterministic baseline must continue operating safely');

  // Reset circuit breaker and env
  canaryLogger.resetCircuitBreaker();
  delete process.env.CANARY_ADVISORY_MODE;
});

test('Laya Advisory Canary: Telemetry retention limits and bounded logging', async () => {
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();
  canaryLogger.clear();

  // Test with small retention cap
  canaryLogger.maxEntries = 5;
  const adapter = new LayaDecisionAdapter();

  for (let i = 0; i < 10; i++) {
    await adapter.routeRequest(`Test request variation ${i}`);
  }

  const entries = canaryLogger.getEntries();
  assert.equal(entries.length, 5, 'Buffer must not exceed retention cap');
  assert.equal(entries[4].baselineDecision, 'needs_planning'); // last entry

  // Restore default retention cap
  canaryLogger.maxEntries = 1000;
  canaryLogger.clear();
  delete process.env.CANARY_ADVISORY_MODE;
});

test('Laya Advisory Canary: Project state invariance across entire lifecycle', async () => {
  const fixturePath = path.join(ROOT, 'fixtures/prompt-core/projects/project-g01-export.json');
  const beforeRaw = fs.readFileSync(fixturePath, 'utf8');
  const beforeSha = crypto.createHash('sha256').update(beforeRaw).digest('hex');

  // Run various operations in canary mode
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.resetCircuitBreaker();
  const adapter = new LayaDecisionAdapter();

  await adapter.routeRequest('Generate subtitles');
  await adapter.triageColorMood('warm golden sunny afternoon');
  await adapter.arbitrateTimeline({ cut_gaps_count: 1 }, 'fast energetic pacing');

  delete process.env.CANARY_ADVISORY_MODE;

  const afterRaw = fs.readFileSync(fixturePath, 'utf8');
  const afterSha = crypto.createHash('sha256').update(afterRaw).digest('hex');

  assert.equal(beforeSha, afterSha, 'Project file must remain bit-for-bit unchanged after canary execution');
});

test('Laya Advisory Canary: Rollback cleanly preserved across runtime restart', async () => {
  // Simulate active session
  process.env.CANARY_ADVISORY_MODE = 'true';
  const a1 = new LayaDecisionAdapter();
  const res1 = await a1.routeRequest('Render final master video');
  assert.ok(res1.canaryAdvisory);

  // Simulate process restart / env teardown
  delete process.env.CANARY_ADVISORY_MODE;
  const restartedAdapter = new LayaDecisionAdapter();
  const res2 = await restartedAdapter.routeRequest('Render final master video');
  assert.equal(res2.canaryAdvisory, undefined, 'Restarted adapter must have 0 lingering canary sidecars');
  assert.equal(res2.success, true);
});

test('Laya Advisory Canary: Separation of bounded operational telemetry from durable safety incidents', async () => {
  canaryLogger.clear();
  process.env.CANARY_ADVISORY_MODE = 'true';

  // Log standard evaluations
  const adapter = new LayaDecisionAdapter();
  await adapter.routeRequest('Generate burned subtitles');

  // Trigger safety incident
  canaryLogger.tripCircuitBreaker('simulated_state_mutation', { attemptedFile: '/Users/test/project.json' });

  // Verify bounded telemetry vs durable incident separation
  const operationalEntries = canaryLogger.getEntries();
  const safetyIncidents = canaryLogger.getSafetyIncidents();

  assert.equal(safetyIncidents.length, 1);
  assert.equal(safetyIncidents[0].type, 'circuit_breaker_tripped');
  assert.equal(safetyIncidents[0].reason, 'simulated_state_mutation');

  // Verify redaction of local paths
  assert.equal(safetyIncidents[0].details.attemptedFile, '[REDACTED_LOCAL_PATH]');

  canaryLogger.resetCircuitBreaker();
  delete process.env.CANARY_ADVISORY_MODE;
});

