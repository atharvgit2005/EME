const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const reportPath = path.resolve('docs/live-pilot-lp-02-report.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-02 (Multi-Turn Revision & Mutation Safety) Reconciliation Report:

Here is the unabridged updated Live Pilot LP-02 Engineering Report containing the complete Root Cause Analysis, Compiler Enhancement, and Re-verified Checkpoint 3 Artifacts:

${reportContent}

Key Reconciliation Summary for Checkpoint 3 (Turn 3 Audio Ducking):
1. Root Cause Identified: \`src/renderers/hyperframes/compiler.js\` emitted base <audio> tags without translating \`clip.audio.volumeEnvelope\` into HyperFrames \`data-automation\` syntax, resulting in identical DOM and identical output.
2. Fix Implemented: Updated \`compiler.js\` to serialize \`data-automation='{"version":1,"lanes":[{"target":"volume","points":[...]}]}'\` directly onto audio elements.
3. Checkpoint 3 Re-rendered:
   - Output Path: \`artifacts/live-pilot/LP-02/checkpoint-turn3.mp4\`
   - New SHA-256: \`bb5158c3c0fee98a5c7d929aff756af8a6aa5c005b926b529d013073ec87d393\` (Distinct from Checkpoint 2: \`f352122cee989487eed356c51a641efdb5c532fc49df61ec9b2b73aaf633e273\`)
   - Manifest verified via \`eme verify-artifacts\`: QA 100/100, verified hash.
4. FFmpeg Audio Attenuation Proof:
   - Evaluated RMS audio levels over the duck window $t = 3.5s - 4.7s$:
   - Checkpoint 2 (Pre-duck): -51.28 dBFS to -50.41 dBFS
   - Checkpoint 3 (Post-duck): -60.40 dBFS to -59.53 dBFS
   - Measured drop: ~9.1 dB attenuation, strictly validating the ducking envelope.

Please review this reconciliation and provide your formal sign-off for LP-02 so we may immediately begin Live Pilot LP-03.`;

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
