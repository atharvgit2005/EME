const fs = require('fs');
const path = require('path');
const { sendPrompt } = require('./chatgpt-bridge.js');

async function main() {
  const reportPath = path.resolve('docs/live-pilot-lp-05-report.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-05 (Interactive Visual Control Surface & Shared-State Consistency) has completed execution and verification with 100% PASS across all requirements.

Here is the unabridged Live Pilot LP-05 Engineering Report:

${reportContent}

Key Highlights & Verification Summary:
1. Immutability & Entry Gate: LP-01, LP-02, LP-03, and LP-04 baselines verified 100% bit-for-bit unchanged. Open tracking items (LP-02 audio gain calibration and LP-04 5 QA capability gaps) explicitly carried forward. Visual Control Surface verified running on http://localhost:4321.
2. 3-Way Baseline Agreement: Visual Control Surface, CLI (bin/eme.js inspect), and MCP (eme_inspect_project) simultaneously queried; verified bit-for-bit identical metadata, 5 tracks, 9 clips, and Revision 24.
3. Turn 1 (Opening Title Edit): Modified title to "UI PILOT REV A" via UI, saved to disk; verified Revision 25 across UI, CLI, and MCP. Zero collateral mutation to unrelated clips.
4. Turn 2 (Timeline Adjustment): Shifted lower-third clip by 6 frames from [240, 420) to [246, 426) frames (4.100s–7.100s, tick 492000) via UI, saved to disk; verified Revision 26 across UI, CLI, and MCP.
5. Monotonic Undo & Redo: UI Undo cleanly reverted timing while preserving title at monotonic Revision 27; UI Redo restored the 6-frame shift at monotonic Revision 28.
6. Save & Reload State Persistence: Persisted to disk via UI, reloaded cleanly from disk; confirmed 100% state persistence at Revision 28.
7. Cross-Interface Stale-Revision Protection: An MCP mutation with stale expectedBaseRevision = 24 was rejected with error code STALE_REVISION, active project revision remained strictly at 28, zero mutation occurred, and UI state remained uncorrupted.
8. Final 60fps Broadcast Render & Frame Extractions: 12.0s 1080p60 MP4 rendered (lp-05.mp4, SHA-256: 58f61d7040f9f5161d1c2ce7c0c361fde8b848627865b92fce0bd782eb572b56). Verification inspection frames extracted at 1.0s, 4.0s, 4.1s, 7.1s, and 7.2s. Manifest verified via eme verify-artifacts (VALID, exit code 0).
9. Deterministic Repeatability: Independent clean rerender achieved 0.00% pixel differences across all sampled timestamps (1.0s, 4.1s, 7.1s, 10.0s).
10. Browser Session Artifacts: Recorded video (lp05_ui_control_1792151724670.webp) and full UI screenshot (lp05_completed_ui_1792151794336.png) captured and saved.

Please review this complete report, provide your formal review and sign-off for LP-05, and specify the exact parameters for Live Pilot LP-06.`;

  console.log('Dispatching LP-05 report to ChatGPT via Web-AI Bridge...');
  const outPath = path.resolve('artifacts/live-pilot/LP-05/chatgpt-lp05-review.md');
  const result = await sendPrompt(fullPrompt, {
    provider: 'chatgpt',
    output: outPath,
    timeoutMs: 300000 // 5 minutes
  });

  console.log(`\n🎉 ChatGPT review saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Error sending LP-05 report:', err);
  process.exit(1);
});
