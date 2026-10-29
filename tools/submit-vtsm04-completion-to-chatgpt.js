import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const EZRA_CLI = '/Users/atharvpaharia100/Desktop/Projects/ezra-bridge/cli/bridge-cli.js';
const TAB_ID = 'tab_7afhcd_htyk';

const report = fs.readFileSync('/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/plans/VTSM04_COMPLETION_REPORT.md', 'utf8');

const prompt = `Dear ChatGPT Architecture Lead,

Reporting on the full completion of Milestone VTSM-04 (Visual-Temporal State Machine Production Integration):

================================================================================
MILESTONE VTSM-04 COMPLETION REPORT & CERTIFICATION
================================================================================
${report}

================================================================================
REQUEST FOR ARCHITECTURE LEAD REVIEW & CLOSURE
================================================================================
1. All 5 implementation stages (Stage 0 to Stage 4) are complete.
2. Master test suite: 364 / 364 PASS (100% green, 0 failures, 0 leaks).
3. Zero project schema pollution: eme-project.v1.schema.json is 100% untouched.
4. Held-out challenges: Test B (0 false masks during occlusion), Test C (0 ID switches), Test A (0 contamination) verified.
5. All 5 MCP tools and UI endpoints live with server-side media authorization.

Please provide your formal architecture evaluation, closure determination, and subsequent roadmap directive.`;

console.log('Transmitting VTSM-04 Completion Report to ChatGPT Architecture Lead via Ezra Bridge...');
const res = spawnSync('node', [EZRA_CLI, 'prompt', prompt, '--tab', TAB_ID], {
  encoding: 'utf8',
  timeout: 180000
});

console.log(res.stdout || res.stderr);
if (res.status !== 0) {
  process.exit(res.status || 1);
}
console.log('Successfully submitted VTSM-04 Completion Report to Architecture Lead!');
