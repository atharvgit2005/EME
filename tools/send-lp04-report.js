const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/live-pilot-lp-04-report.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-04 (Adversarial Closed-Loop QA & Audio Integrity) has completed execution and verification.

Here is the unabridged Live Pilot LP-04 Engineering Report:

${reportContent}

Key Highlights & Verification Summary:
1. Immutability & Entry Gate: LP-01, LP-02, and LP-03 baselines bit-for-bit unchanged. LP-03 errata verified in docs/live-pilot-lp-03-errata.md. LP-02 audio envelope attenuation calibration carried forward as an open tracking item. 66/66 regression tests passing (exit code 0).
2. 16-Case Adversarial Fixture Matrix:
   - 8 Injected Defects (D1–D8): Caught D1 (obvious text overflow, QA 90/100), D2 (subtle text overflow, QA 90/100), and D3 (1-frame same-track overlap rejected at preflight with zero mutation). Honestly recorded 5 capability gaps (D4: animated keyframe bounds, D5: hard-clipped PCM audio, D6: true-peak ceiling, D7: 150ms audio dropout, D8: 1-frame cut gap) with external FFmpeg ground-truth evidence.
   - 8 Clean Controls (C1–C8): All 8 controls passed with 100/100 QA score and 0 warnings (100.0% Specificity, 0.0% False Positive Rate).
   - Statistical Calibration: Sensitivity = 37.5%, Specificity = 100.0%, FPR = 0.0%.
3. Closed-Loop Self-Repair (Correction A):
   - Injected D2 subtle text overflow defect.
   - ClosedLoopQaPipeline detected the clipping finding, formed a targeted modify_clip atomic operation, incremented project revision from 7 to 8, re-rendered attempt-2.mp4 (SHA-256: 6a4d71fdff252a61e2ecfb6068de8fd72c858e57adfb71614a679290d250a73b), and restored QA score to 100/100 within 2 attempts (budget: 3).
   - Verified that unrelated clips (clip_subtitle on track_v1 and audio track) remained bit-for-bit identical (zero collateral mutation).
4. Correction B: Honestly documented as BLOCKED due to unsupported built-in true-peak ceiling enforcement and gain reduction operations.
5. Render Performance & Repeatability:
   - Clean project rendered in 8.23s to artifacts/live-pilot/LP-04/renders/lp-04-clean.mp4 (SHA-256: 8d18a0c775fe6b7699e1862a06c01c3c170309384d90d9a484c5f7481b552b1e).
   - Manifest verified via eme verify-artifacts (VALID, exit code 0).
   - Deterministic repeatability confirmed with 0.00% pixel differences across 5 sampled timestamps upon independent clean rerender.

Please review this complete report, provide your formal review and sign-off for LP-04, and specify the exact parameters for Live Pilot LP-05.`;

  const jsonPayload = JSON.stringify(fullPrompt);

  const jsCode = `
    (function() {
      const promptText = ${jsonPayload};
      const els = document.querySelectorAll('.ProseMirror');
      const chatInput = els[els.length - 1];
      if (!chatInput) return 'Chat input not found';
      
      chatInput.focus();
      chatInput.innerHTML = '';
      const p = document.createElement('p');
      p.innerText = promptText;
      chatInput.appendChild(p);
      
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      setTimeout(() => {
        const sendBtn = document.querySelector('.ComposerLayoutFooter-_8IVRO button[aria-label="Send"]') ||
                        document.querySelector('button[aria-label="Send"]');
        if (sendBtn) {
          sendBtn.click();
        }
      }, 400);
      
      return 'Dispatched prompt (' + promptText.length + ' chars) to chat composer and triggered Send';
    })()
  `;

  const script = `
    tell application "Brave Browser"
      repeat with w in windows
        repeat with t in tabs of w
          if URL of t contains "chatgpt.com/c/6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
            set res to execute t javascript "${jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
            return res
          end if
        end repeat
      end repeat
    end tell
  `;

  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (res.status !== 0) {
    console.error('Error running AppleScript:', res.stderr);
  } else {
    console.log('Result:', res.stdout.trim());
  }
}

main().catch(console.error);
