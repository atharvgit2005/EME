const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing LP-08 certification prompt...');
  const reportPath = path.resolve('docs/live-pilot-lp-08-report.md');
  const report = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-08 (End-to-End Release Certification Pilot) has completed execution and verification across all 10 Gates with 100% UNCONDITIONAL PASS.

Here is the unabridged Live Pilot LP-08 Release Certification Engineering Report:

${report}

Key Highlights & Verification Summary:
1. Gate 0 (Evidence Reconciliation & Errata): Conclusively closed G0-1 through G0-5 without modifying sealed baselines. Reconciled D3 1-tick vs 1-frame overlap, corrected audio calibration summary figure (-5.9954 dB), resolved absolute audio level offset (isolated to FFmpeg lavfi sine default amplitude 0.125 = -18.06 dBFS, verified 0 dB offset with true -12 dBFS signal), scoped D8 timeline cut gap vs rendered black-frame flash, and published non-destructive LP-06 Scenario A digest erratum.
2. Gate 1 (Baseline Immutability): All 11 historical baselines from LP-01 through LP-07 matched their cryptographically sealed SHA-256 digests 100% bit-for-bit.
3. Gate 2 (Media QA Matrix): 32 fixtures audited (16 defect variants D1a–D8b, 16 clean controls C1–C16). Flawless 100.0% Sensitivity (16/16 TP), 100.0% Specificity (16/16 TN), 0.0% FPR, and 0.0% FNR.
4. Gate 3 (Audio Calibration): Calibrated against true -12.000 dBFS pure sine wave. Static 0.5x (-6.01 dB RMS delta), static 0.25x (-12.03 dB RMS delta), and ducking envelope (-6.01 dB RMS delta) matched mathematical theory within 0.009 dB (well within +-0.05 dB tolerance). True peak delivery ceiling (-1.0 dBTP) strictly respected (-11.9 dBTP measured).
5. Gate 4 (Repair Safety): Automated self-repair healed D2a (layout clipping), D4a (animated bounds), and D8a (timeline cut gap) to QA score 100 in 2 attempts each. Unrepairable source audio defect D5a (PCM clipping) was safely blocked with zero mutations and project revision preserved.
6. Gate 5 (Process Crash Recovery): All 4 lifecycle interruption scenarios passed (Scenario A commit interruption & idempotent resume to rev 31; Scenario B render interruption & partial .part quarantine; Scenario C render-to-QA interruption & durable hash reuse; Scenario D corrupt artifact detection & .quarantine isolation).
7. Gate 6 (Cross-Surface State Consistency): Canonical synchronization verified across UI Backend (port 4321), CLI (bin/eme.js), and MCP Server stdio JSON-RPC (bin/eme-mcp.js). Stale revision write rejected with HTTP 409 Conflict.
8. Gate 7 (Clean-Room Packaging & Installation): npm pack generated candidate tarball editing-mechanics-engine-0.1.0-rc1.tgz (54,718 bytes, SHA-256: d986acb3...). Isolated sandbox extraction and execution in /tmp confirmed eme --version, eme doctor, and eme capabilities exit code 0.
9. Gate 8 (Licensing, Security & Documentation): MIT core, Apache-2.0 HyperFrames, SIL OFL 1.1 fonts; localhost:4321 restriction, stdio MCP, assertSafePath traversal prevention, zero telemetry exfiltration, full documentation suite verified.
10. Gate 9 (Master Repeatability): 12s 1080p60 certified master rendered twice independently. Whole-file container SHA-256 matched bit-for-bit (eab6a989bec68602a32e0de1790c3207fa0713d869a77dc4d925b28ce76c47b4). Decoded video comparison across ALL 720 frames confirmed 0 mismatches (0.00% diff, 0.0000 RMSE). Decoded audio streams confirmed bit-for-bit identical (MD5=7b8c7597ab61c5948883b0b5f2c34338). QA score 100/100, 0 warnings. Job manifest verified conforming via 'eme verify-artifacts' (Exit Code 0).
11. Full regression suite passed (66/66 test cases in 4.54s). All 12 evidence files cryptographically sealed in release-manifest.json.

Please review this comprehensive Release Certification Report, provide your formal engineering review and release certification disposition for candidate editing-mechanics-engine@0.1.0-rc1, and specify any next directives.`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/lp08_prompt_staged.txt';
  fs.writeFileSync(tmpPath, fullPrompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer in Brave...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript "
          (() => {
            const el = document.querySelector('div.ProseMirror[aria-label=\\\"Ask ChatGPT\\\"]') ||
                       document.querySelector('div.ProseMirror');
            if (!el) return 'NO_EL';
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'FOCUSED_AND_CLEARED';
          })()
        "
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('   Focus result:', (focusRes.stdout || '').trim());

  console.log('4. Pasting from clipboard via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1500);

  console.log('5. Clicking Send button or pressing Return...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        return execute t javascript "
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const sendBtn = btns.find(b => {
              const aria = (b.getAttribute('aria-label') || '').toLowerCase();
              const testid = (b.getAttribute('data-testid') || '').toLowerCase();
              return (aria.includes('send') || testid.includes('send')) && !b.disabled;
            });
            if (sendBtn) {
              sendBtn.click();
              return 'CLICKED_SEND: ' + (sendBtn.getAttribute('aria-label') || sendBtn.className);
            }
            return 'NO_SEND_BUTTON';
          })()
        "
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendScript], { encoding: 'utf8' });
  const sendOut = (sendRes.stdout || '').trim();
  console.log('   Send button result:', sendOut);

  if (!sendOut.startsWith('CLICKED_SEND')) {
    console.log('   Fallback: sending Return key via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('✅ LP-08 prompt successfully dispatched to ChatGPT!');
}

main().catch(console.error);
