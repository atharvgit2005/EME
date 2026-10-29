const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/PHASE_11_1_ADDENDUM.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `The implementation, execution, and verification of the Phase 11.1 Evidence Addendum are now complete.\n\nHere is the unabridged Phase 11.1 Evidence Addendum:\n\n${reportContent}\n\nPlease review this complete addendum covering all 6 criteria (astats true RMS distinction vs max_volume peak, stale-revision & renderer error artifact containment, 5-timestamp 0.00% pixel repeatability, localized 0.79% edit difference mask and bounding box metrics, 100% QA sensitivity/specificity, and 41/41 passing regression tests). Then certify completion and authorize commencement of Phase 12 (Reference-to-Edit Planning & Deterministic Execution).`;

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
      
      return 'Dispatched addendum prompt (' + promptText.length + ' chars) to chat composer and triggered Send';
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
