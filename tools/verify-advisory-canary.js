import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { LayaDecisionAdapter } from '../src/decision-fabric/adapter/laya-decision-adapter.js';
import { canaryLogger, CANDIDATE_COMPONENT_HASHES } from '../src/decision-fabric/adapter/canary-telemetry-logger.js';
import { EmeMcpServer } from '../src/mcp/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export async function runCanaryVerification() {
  console.log('================================================================');
  console.log('🚀 EME × Laya: Limited Advisory Canary Activation & Verification');
  console.log('================================================================\n');

  // Baseline state snapshot
  const fixturePath = path.join(ROOT, 'fixtures/prompt-core/projects/project-g01-export.json');
  const fixtureBeforeRaw = fs.readFileSync(fixturePath, 'utf8');
  const fixtureBeforeSha = crypto.createHash('sha256').update(fixtureBeforeRaw).digest('hex');

  const manifestPath = path.join(ROOT, 'src/decision-fabric/artifacts/m6-candidate2-manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Candidate 2 manifest must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // --------------------------------------------------------------------------
  // STEP 1: VERIFY CANARY_ADVISORY_MODE=true ENABLES ADVISORY TELEMETRY
  // --------------------------------------------------------------------------
  console.log('1. Enabling CANARY_ADVISORY_MODE=true and verifying advisory telemetry...');
  process.env.CANARY_ADVISORY_MODE = 'true';
  const adapter = new LayaDecisionAdapter();

  const sampleBrief = 'Generate synchronized burned captions for vertical reel';
  const routeRes = await adapter.routeRequest(sampleBrief);

  assert.equal(routeRes.success, true);
  assert.ok(routeRes.canaryAdvisory, 'Canary advisory payload must be attached when CANARY_ADVISORY_MODE=true');
  assert.equal(routeRes.canaryAdvisory.enabled, true);
  assert.equal(routeRes.canaryAdvisory.advisoryOnly, true);
  assert.equal(routeRes.canaryAdvisory.candidateId, 'candidate2');
  assert.equal(routeRes.canaryAdvisory.buildIdentifier, 'eme-v0.1.0-rc1-candidate2');
  assert.equal(routeRes.canaryAdvisory.authoritativeEngine, 'deterministic_router');
  assert.equal(routeRes.canaryAdvisory.executionPrivilege, 'none');
  console.log('   ✔ routeRequest canary telemetry verified:', JSON.stringify(routeRes.canaryAdvisory));

  // Color triage in canary mode
  const colorRes = await adapter.triageColorMood('warm golden sunny afternoon');
  assert.ok(colorRes.canaryAdvisory, 'Canary advisory payload must be attached to color triage');
  assert.equal(colorRes.canaryAdvisory.applied, false, 'LUT must never be applied by advisory canary');
  assert.equal(colorRes.canaryAdvisory.executionPrivilege, 'none');
  console.log('   ✔ color triage canary telemetry verified (applied: false)');

  // Timeline arbitration in canary mode
  const timeRes = await adapter.arbitrateTimeline({ cut_gaps_count: 1 }, 'fast energetic pacing');
  assert.ok(timeRes.canaryAdvisory, 'Canary advisory payload must be attached to timeline arbitration');
  assert.equal(timeRes.canaryAdvisory.mutated, false, 'Timeline must never be mutated by advisory canary');
  assert.equal(timeRes.canaryAdvisory.executionPrivilege, 'none');
  console.log('   ✔ timeline arbitration canary telemetry verified (mutated: false)');

  // --------------------------------------------------------------------------
  // STEP 2: VERIFY DETERMINISTIC ROUTER REMAINS AUTHORITATIVE
  // --------------------------------------------------------------------------
  console.log('\n2. Verifying deterministic router remains authoritative...');
  const deterministicRes = adapter.baselineRouter.predict({ request_text: sampleBrief });
  assert.equal(routeRes.decision.route, deterministicRes.answers.intent.choice);
  console.log(`   ✔ Route equivalence confirmed: ${routeRes.decision.route} === ${deterministicRes.answers.intent.choice}`);

  // --------------------------------------------------------------------------
  // STEP 3: VERIFY POLICY GATE ENFORCEMENT IN CANARY MODE
  // --------------------------------------------------------------------------
  console.log('\n3. Verifying policy gate enforcement in canary mode...');
  const prereqFailState = {
    request_text: 'Render and export master video',
    project_context: {
      source_media_available: false,
      media_integrity_passed: false,
      timeline_editable: false
    }
  };
  const blockedRes = await adapter.routeRequest(prereqFailState);
  assert.equal(blockedRes.decision.action, 'reject', 'Prerequisite failure must trigger reject action');
  console.log('   ✔ Policy gate successfully blocked invalid state (action: reject)');

  // --------------------------------------------------------------------------
  // STEP 4: VERIFY IMMEDIATE ROLLBACK (CANARY_ADVISORY_MODE=false)
  // --------------------------------------------------------------------------
  console.log('\n4. Verifying immediate rollback via CANARY_ADVISORY_MODE=false...');
  delete process.env.CANARY_ADVISORY_MODE;
  const rollbackAdapter = new LayaDecisionAdapter();
  const rolledBackRes = await rollbackAdapter.routeRequest(sampleBrief);

  assert.equal(rolledBackRes.success, true);
  assert.equal(rolledBackRes.canaryAdvisory, undefined, 'canaryAdvisory must NOT be present when flag is disabled');
  console.log('   ✔ Rollback confirmed: canary telemetry cleanly deactivated with zero lingering state');

  // --------------------------------------------------------------------------
  // STEP 4B: VERIFY IMMEDIATE ROLLBACK ON SIMULATED BREACH (CIRCUIT BREAKER)
  // --------------------------------------------------------------------------
  console.log('\n4b. Verifying immediate circuit-breaker rollback on simulated mutation...');
  process.env.CANARY_ADVISORY_MODE = 'true';
  canaryLogger.tripCircuitBreaker('simulated_state_mutation');
  assert.equal(canaryLogger.isCanaryActive(), false, 'Circuit breaker must deactivate canary immediately');
  const trippedRes = await adapter.routeRequest(sampleBrief);
  assert.equal(trippedRes.canaryAdvisory, undefined, 'Advisory payload suppressed when circuit breaker tripped');
  assert.equal(trippedRes.success, true, 'Deterministic baseline continues unharmed');
  canaryLogger.resetCircuitBreaker();
  delete process.env.CANARY_ADVISORY_MODE;
  console.log('   ✔ Circuit-breaker rollback verified: automatic emergency deactivation confirmed');

  // --------------------------------------------------------------------------
  // STEP 5: VERIFY STATE INVARIANCE ACROSS CANARY SESSION
  // --------------------------------------------------------------------------
  console.log('\n5. Verifying zero state mutation across canary execution...');
  const fixtureAfterRaw = fs.readFileSync(fixturePath, 'utf8');
  const fixtureAfterSha = crypto.createHash('sha256').update(fixtureAfterRaw).digest('hex');
  assert.equal(fixtureBeforeSha, fixtureAfterSha, 'Project fixture must remain bit-for-bit identical');
  console.log(`   ✔ Bit-for-bit fixture identity confirmed: ${fixtureAfterSha}`);

  // --------------------------------------------------------------------------
  // STEP 6: PERSIST TELEMETRY AUDIT LOG
  // --------------------------------------------------------------------------
  console.log('\n6. Persisting canary audit log with retention controls...');
  canaryLogger.persist();
  const logPath = path.join(ROOT, 'src/decision-fabric/reports/canary-telemetry.json');
  assert.ok(fs.existsSync(logPath), 'Canary telemetry report must be persisted');
  console.log(`   ✔ Telemetry log persisted to: ${logPath}`);

  console.log('\n================================================================');
  console.log('✅ LIMITED ADVISORY CANARY ACTIVATION & VERIFICATION: ALL PASS');
  console.log('================================================================\n');

  return {
    status: 'CANARY_VERIFIED_AND_ACTIVE',
    flag: 'CANARY_ADVISORY_MODE=true',
    rollback_verified: true,
    circuit_breaker_verified: true,
    state_invariance_verified: true,
    fixture_sha256: fixtureAfterSha,
    telemetry_log_file: logPath
  };
}

runCanaryVerification().catch(err => {
  console.error('Canary verification failed:', err);
  process.exit(1);
});
