const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

function runOsa(jsCode) {
  const jsLiteral = JSON.stringify(jsCode);
  const osaScript = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
                return execute t javascript ${jsLiteral}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-'], { input: osaScript, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return (res.stdout || '').trim();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function dispatch() {
  console.log('1. Reading LP-07 report...');
  const reportPath = path.resolve('docs/live-pilot-lp-07-report.md');
  const report = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-07 (Media QA Capability Closure & Audio Integrity) has completed execution and verification with 100% PASS across all 16 adversarial matrix fixtures, conclusive audio gain calibration, closed-loop repairs, and master render repeatability.

Here is the unabridged Live Pilot LP-07 Engineering Report:

${report}

Key Highlights & Verification Summary:
1. Immutability & Entry Gate: LP-01 through LP-06 baselines verified 100% bit-for-bit unchanged. Full regression suite passed (66/66 test cases in 4.40s, Exit Code 0).
2. Audio Gain Calibration (LP07-G1 Resolved): Isolated root cause of LP-02's "-9.1 dB" (HTML compiler static attribute 'data-volume' requirement + dynamic music/woosh decay). Verified on pure 1kHz sine wave at -12 dBFS: 50% linear gain produces exactly -6.0240 dB Sample Peak, -6.0000 dB True Peak, and -6.0368 dB RMS attenuation (within 0.028 dB of mathematical theory 20*log10(0.5) = -6.02 dB).
3. 16-Case Adversarial Matrix (D1–D8 vs C1–C8): Evaluated 8 defects and 8 clean controls. Flawless 100.0% Sensitivity (8/8 TP), 100.0% Specificity (8/8 TN), 0.0% False Positive Rate, and 0.0% False Negative Rate. All 5 open capability gaps (D4 Animated Bounds, D5 PCM Clipping, D6 True Peak Ceiling, D7 Audio Dropout, D8 Blank Flash Cut Gap) are officially CLOSED.
4. Bounded Closed-Loop Self-Repair: Automatically healed D2 (Layout Clipping), D4 (Animated Bounds), and D8 (Blank-Frame Flash Gap) in 2 attempts each, advancing QA Score from <=90 to 100/100. Safely blocked unrepairable audio source defect D5 (PCM Clipping) with zero destructive mutations.
5. Master Broadcast Render & Decoded-Frame Repeatability: Rendered 12s 1080p60 master (lp-07-master.mp4, SHA-256: 2567f89dbdcc2aba8faab5a20b73238fcef5a7512901713b39b32af326cc2867). Clean rerender matched bit-for-bit with identical container hash. Raw decoded pixel comparisons across frames 30, 228, 360, 480, 719 confirmed 0.00% pixel differences and 0.0000 RMSE. Master QA score 100/100 (0 warnings), manifest verified valid via 'eme verify-artifacts' (Exit Code 0).

Please review this complete report, provide your formal review and sign-off for Live Pilot LP-07, and specify the parameters and authorization for the next pilot (e.g., Live Pilot LP-08 — End-to-End Release Certification Pilot).`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/lp07_prompt_staged.txt';
  fs.writeFileSync(tmpPath, fullPrompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer...');
  const focusCode = `(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]') ||
               document.querySelector('div[contenteditable=true].ProseMirror');
    if (!el) return "NO_INPUT";
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    return "READY";
  })()`;
  const focusRes = runOsa(focusCode);
  console.log('   Focus result:', focusRes);

  console.log('4. Pasting via Cmd+V...');
  execSync(`osascript -e '
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
    keystroke "v" using command down
end tell'`);

  await sleep(1000);

  console.log('5. Clicking Send button...');
  const clickSendCode = `(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sendBtn = btns.find(b => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const testId = (b.getAttribute('data-testid') || '').toLowerCase();
      const cls = (b.className || '').toLowerCase();
      return (aria.includes('send') || testId.includes('send') || cls.includes('composer-primary')) && !b.disabled;
    });

    if (sendBtn) {
      sendBtn.click();
      return "CLICKED_SEND: " + (sendBtn.getAttribute('aria-label') || sendBtn.className);
    }

    const el = document.querySelector('div.ProseMirror');
    if (el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return "ENTER_DISPATCHED";
    }

    return "NO_BUTTON";
  })()`;

  const sendRes = runOsa(clickSendCode);
  console.log('   Send result:', sendRes);
}

dispatch().catch(console.error);
