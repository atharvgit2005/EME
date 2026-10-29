const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/live-pilot-lp-01-report.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-01 (End-to-End Multi-Track Assembly from Scratch) has completed execution and verification.\n\nHere is the unabridged Live Pilot LP-01 Engineering Report:\n\n${reportContent}\n\nPlease review this complete report, evaluate the preflight results, real source inventory, non-mutating dry run, 25-operation execution trace, rendered 1920x1080 60fps video with AAC stereo audio, 7 extracted frame inspections, FFmpeg astats audio metrics, 100/100 QA score, eme verify-artifacts manifest verification, and the 0.00% pixel-diff repeatability results. Provide your formal assessment and specify the exact parameters for Live Pilot LP-02.`;

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
          if URL of t contains "chatgpt.com" then
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
