const fs = require('fs');
const path = require('path');
const { sendPrompt } = require('./chatgpt-bridge.js');

async function main() {
  const reportPath = path.resolve('docs/live-pilot-lp-06-report.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-06 (Live Interruption, Crash Recovery & Safe Resume) has completed execution and verification with 100% PASS across all 3 empirical crash scenarios and governance gates.

Here is the unabridged Live Pilot LP-06 Engineering Report:

${reportContent}

Key Highlights & Verification Summary:
1. Immutability & Entry Gate: LP-01, LP-02, LP-03, LP-04, and LP-05 baselines verified 100% bit-for-bit unchanged. Full regression suite passed (66/66 test cases in 3.89s, Exit Code 0). Open tracking items (LP-02 audio attenuation, LP-04 5 QA capability gaps) explicitly carried forward.
2. Scenario A (Operation Commit Interruption & State Reconciliation): Dedicated worker child process PID 32490 killed with SIGKILL immediately post-Op 2 commit. Fresh process resumed, verified pre-crash disk state at Rev 30, confirmed idempotency, applied only remaining uncommitted Op 3, reached Rev 31. Rendered lp06-scenario-a.mp4 (SHA-256: 1e25ebbcf63503a6fdcfa1bb10b7414bc908c691f6305a2f5f1eafe737c385c4), manifest valid, 0.00% pixel diff & 0.0000 RMSE across all sampled frames.
3. Scenario B (Renderer Interruption & Partial-Output Containment): Dedicated renderer worker PID 35398 killed with SIGKILL during active frame encoding. Incomplete output.mp4.part (524KB) verified quarantined. Fresh worker resumed, executed clean full render from scratch, generated lp06-scenario-b.mp4 (SHA-256: 58f61d7040f9f5161d1c2ce7c0c361fde8b848627865b92fce0bd782eb572b56), manifest valid, 0.00% pixel diff & 0.0000 RMSE across all sampled frames.
4. Scenario C (Render-to-QA Interruption & Stage-Boundary Recovery): Render completed (lp06-scenario-c.mp4, SHA-256: 58f61d7040f9f5161d1c2ce7c0c361fde8b848627865b92fce0bd782eb572b56). Orchestrator child process PID 39705 killed with SIGKILL before QA. Fresh worker resumed, validated existing render SHA-256 against durable metadata, safely reused artifact without redundant re-render, completed QA (Score 100/100, 0 warnings), manifest valid, 0.00% pixel diff & 0.0000 RMSE across all sampled frames.
5. Target Safety & Zero Collateral Damage: All SIGKILL signals were strictly targeted at dedicated worker child PIDs spawned specifically for the tests. External processes, UI server, and bridge daemons experienced zero disruption.

Please review this complete report, provide your formal review and sign-off for Live Pilot LP-06, and specify the exact parameters for the next pilot (e.g., LP-07 or final release certification).`;

  console.log('Dispatching LP-06 report to ChatGPT via Web-AI Bridge...');
  const outPath = path.resolve('artifacts/live-pilot/LP-06/chatgpt-lp06-review.md');
  const result = await sendPrompt(fullPrompt, {
    provider: 'chatgpt',
    output: outPath,
    timeoutMs: 300000 // 5 minutes
  });

  console.log(`\n🎉 ChatGPT review saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Error sending LP-06 report:', err);
  process.exit(1);
});
