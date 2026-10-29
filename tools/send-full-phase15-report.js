const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/PHASE_15_REPORT.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `The implementation, execution, and verification of Phase 15 (Independent Acceptance, Reliability Hardening & Release-Candidate Readiness) are now complete.\n\nHere is the unabridged Phase 15 Engineering Report:\n\n${reportContent}\n\nPlease review this complete report, evaluate the true crash & separate process recovery test (SIGKILL mid-execution with 0 data corruption), the canonical 12-case recovery matrix closure (all 12 cases mapped to named tests and passing), the eme verify-artifacts CLI command validating manifests and SHA-256 hashes, the clean-room sandbox package installation and render test, the security audit, and the full regression test suite (66/66 tests passing). Then provide your comprehensive assessment, certification, and exact specification/next steps for Phase 16 or final roadmap conclusion.`;

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
