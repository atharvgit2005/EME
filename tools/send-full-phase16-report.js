const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/PHASE_16_REPORT.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `The implementation, execution, and verification of Phase 16 (Controlled Pilot, Creative Acceptance & Final Release Gate) are now complete.\n\nHere is the unabridged Phase 16 Engineering Report:\n\n${reportContent}\n\nPlease review this complete final report, evaluate the three controlled pilot workflows (all 60fps renders achieving 100/100 QA scores and machine-readable output manifests verified with eme verify-artifacts), the 7-pillar human creative evaluation rubric, the canonical 12-case recovery matrix closure with true crash testing, and the full regression test suite (66/66 tests passing). Then provide your comprehensive final assessment, certification, and official roadmap completion summary.`;

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
