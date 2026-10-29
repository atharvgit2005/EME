const { spawnSync } = require('child_process');

async function main() {
  const prompt = `The roadmap implementation and Phase 16.1 reconciliation are fully closed and certified. The user has now directed us to proceed immediately with live pilot testing and practical evaluation of EME v0.1.0-rc1.

Please specify your recommended live pilot testing test battery or scenarios you want us to execute against the engine now. We can exercise:
1. End-to-end multi-track video assembly from scratch via the MCP server or CLI.
2. Stress testing complex kinetic typography & keyframe animations.
3. Complex closed-loop QA edge cases (e.g., subtle audio clipping, visual boundary overlaps).
4. Interactive operations using the Web Visual Control Surface (http://localhost:4321).
5. Live multi-turn interactive editing scenarios driven by AI agent instructions.

Please outline the exact test plan or first live test case you would like us to begin executing.`;

  const jsonPayload = JSON.stringify(prompt);
  
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
