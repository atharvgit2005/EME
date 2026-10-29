import { spawnSync } from 'node:child_process';

const EZRA_CLI = '/Users/atharvpaharia100/Desktop/Projects/ezra-bridge/cli/bridge-cli.js';
const TAB_ID = 'tab_7afhcd_htyk';

const prompt = `Dear ChatGPT Architecture Lead,

Reporting on the completion of the M6 Certification and Canary Observation phases, and requesting the next architectural directive:

================================================================================
CURRENT EME & DECISION FABRIC STATUS
================================================================================
1. M6 Certification & Advisory Canary:
   - Candidate 2 certified (91.1% fresh blind battery accuracy, 0.9475 macro-F1).
   - Limited advisory canary activated under CANARY_ADVISORY_MODE=true with sealed component hashes.
   - Zero execution privileges granted; DeterministicRouter remains 100% authoritative.
   - Cumulative observation traffic: 190 inquiries across Phase 1 & Phase 2 (97.4% agreement, 0 execution leaks, 0 state mutations).
   - Phase 3 Sustained Canary framework is active, continuously monitoring internal cohort traffic toward the 500-inquiry target across 7 days with durable safety incident logging (0 incidents).
   - Master test suite: 344/344 PASS in 66.5s (100% green).

2. Visual-Temporal State Machine (VTSM) Status:
   - Milestone VTSM-03 (MobileSAM + tracking lifecycle on Apple Silicon MPS at 52.9 FPS) is formally accepted and closed under ADR-VTSM03-01.
   - All held-out challenge fixtures passed with zero false masks during full occlusion and zero identity switches.

================================================================================
REQUEST FOR NEXT ARCHITECTURAL DIRECTIVE
================================================================================
The team is ready to move forward. Which milestone should we execute next?

OPTION A: Milestone VTSM-04 — Visual-Temporal State Machine Production Integration
  - Integrate the certified vtsm03_worker tracking daemon into EME's core timeline adapter and MCP server (eme-mcp.js).
  - Expose mask-aware tracking, spatial state persistence, and interactive propagation to the EME Visual Control Surface.

OPTION B: Phase 17/18 Subsystem Deepening — Core Engine Extensions
  - Deepen the Color Engine (Phase 17) and Timeline Engine (Phase 18) capabilities, integrating certified LUT applications and non-destructive editorial transactions.

OPTION C: Decision Fabric M7 Planning — Learned Model Distillation & Offline Training
  - Design the training and quantization pipeline for on-device learned routing weights, transitioning from hardened heuristics to an identifiable local neural checkpoint.

Please provide your formal architecture decision, designated milestone, scope, required GSD actions, exit gates, and hard constraints so we can immediately begin execution.`;

console.log('Transmitting next milestone inquiry to ChatGPT Architecture Lead via Ezra Bridge...');
const res = spawnSync('node', [EZRA_CLI, 'prompt', prompt, '--tab', TAB_ID], {
  encoding: 'utf8',
  timeout: 180000
});

console.log(res.stdout || res.stderr);
if (res.status !== 0) {
  process.exit(res.status || 1);
}
console.log('Successfully received Architecture Lead directive!');
