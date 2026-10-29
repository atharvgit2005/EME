const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/live-pilot-lp-03-report.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-03 (Kinetic Typography & Keyframe Stress Test) has completed execution and verification.

Here is the unabridged Live Pilot LP-03 Engineering Report:

${reportContent}

Key Highlights & Verification Summary:
1. Immutability & Carry-Forward: LP-01 and LP-02 baselines bit-for-bit unchanged. LP-02 audio envelope attenuation calibration carried forward as an open tracking item.
2. Negative Fixtures: Text overflow detected by QA engine; out-of-bounds keyframe offset rejected with KEYFRAME_OUT_OF_BOUNDS (zero partial mutation).
3. Canonical Project: 1080x1920 (9:16 portrait) @ 60fps, 15.0s (900 frames). 16 typography clips across 3 visual tracks + 1 audio bed. Exactly 192 property-keyframe control points (16 clips × 3 properties × 4 control points), reaching project revision 70.
4. Render & QA: 100/100 QA score (clean, 0 warnings). Rendered in 33.18s to artifacts/live-pilot/LP-03/lp-03.mp4 (SHA-256: a851dae7cd4d6e9ca543e964cda08a15464fc570f0f6c597b8c697600a0fcdaa).
5. Manifest: Verified with eme verify-artifacts artifacts/live-pilot/LP-03/manifest.json (exit code 0).
6. Deterministic Repeatability: 0.00% pixel differences across 6 sampled frame timestamps (frames 30, 120, 270, 420, 600, 870) upon clean rerender.

Please review this complete report, provide your formal review and sign-off for LP-03, and specify the exact parameters for Live Pilot LP-04.`;

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
