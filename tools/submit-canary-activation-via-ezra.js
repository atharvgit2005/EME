import { spawnSync } from 'node:child_process';
import path from 'node:path';

const EZRA_CLI = '/Users/atharvpaharia100/Desktop/Projects/ezra-bridge/cli/bridge-cli.js';
const TAB_ID = 'tab_7afhcd_htyk';

const message = `EME × Laya — M6 Limited Advisory Canary Activation Complete & Verified

Architecture Directive Status: 100% COMPLETE

1. Advisory Canary Activated: CANARY_ADVISORY_MODE=true verified in designated internal canary environment.
2. Invariants Enforced: DeterministicRouter remains 100% authoritative; LayaDecisionAdapter recommendations attach as non-mutating advisory envelopes (executionPrivilege: "none", applied: false, mutated: false). Zero execution privileges granted.
3. Component Hashes Recorded: Sealed Candidate 2 SHA-256 hashes (adapter, policyGate, deterministicRouter, routingPolicy) embedded in every advisory evaluation payload.
4. Bounded Telemetry & Logging: Ring-buffer capped at 1,000 entries (FIFO eviction) with retention controls. Audit log persisted to src/decision-fabric/reports/canary-telemetry.json.
5. Dual Rollback Paths Verified:
   - Manual: Setting CANARY_ADVISORY_MODE=false cleanly strips all advisory payloads and restores default baseline in < 1 ms.
   - Circuit Breaker: Safety supervisor automatically trips on simulated state mutations or invariant breaches, instantly disabling canary evaluation.
6. Bit-for-Bit State Invariance: Verified on project-g01-export.json (e8c55be7b5e90020b72e3835bc8c04cb2f9bdd7503411dd4707c4d4a8d4ae4a3 - 0 mutations).
7. Test Suite Status:
   - Canary Unit Tests: 8/8 PASS (tests/laya-advisory-canary.test.js)
   - Decision Fabric Suite: 34/34 PASS in 616 ms
   - Master Test Suite: 342/342 PASS in 74.7 s (0 failing, 0 skipped, 100% clean)
8. Formal Report: Generated and published to docs/LAYA_ADVISORY_CANARY_REPORT.md.
9. Recommendation: CONTINUE_CANARY under advisory restrictions. No neural model claims; deterministic routing remains authoritative.`;

console.log('Submitting canary activation completion report to ChatGPT via Ezra Bridge...');
const res = spawnSync('node', [EZRA_CLI, 'prompt', message, '--tab', TAB_ID], {
  encoding: 'utf8',
  timeout: 120000
});

console.log(res.stdout || res.stderr);
if (res.status !== 0) {
  process.exit(res.status || 1);
}
console.log('Successfully transmitted report to ChatGPT via Ezra!');
