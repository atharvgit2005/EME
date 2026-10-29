/**
 * Ezra Bridge Script: Submit Phase 18 Stage 18.2 Completion Report to ChatGPT Architecture Lead
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a";

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing Stage 18.2 Completion Report Submission Prompt...');

  const completionReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE2_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed all implementation, contract auditing, and verification requirements for **Stage 18.2: Atomic Editing & Compound Editorial Operations** in accordance with your Stage 18.2 Directive (\`plans/CHATGPT_STAGE18_1_COMPLETION_REVIEW.md\`).

We have committed the formal deliverables:
1. 📁 \`plans/PHASE_18_STAGE2A_OPERATION_CONTRACT.md\` (Formal 11-operation audit matrix & atomic trim-in contract)
2. 📁 \`plans/PHASE_18_STAGE2_COMPLETION_REPORT.md\` (Full implementation & certification report)

Here is the complete Stage 18.2 Completion Report:

---

${completionReport}

---

### Key Milestone Verifications for Your Review:
1. **Unified Atomic Trim-In**:
   - Extended \`_opTrimClip\` with \`newStartTick\` support and track collision validation in \`src/engine/operations.js\`.
   - Trimming In-handle executes in **one single transaction envelope with exactly one revision increment**, preserving the right edge and source continuity.
2. **Basic & Compound Operations Wired to UI**:
   - Move clip commits \`move_clip\` on \`mouseup\` with magnetic snapping and \`expectedBaseRevision\`.
   - Razor blade click commits \`split_clip\` atomically at the clicked playhead tick.
   - Ripple trim, Slip, and Slide tools wired to their canonical compound operations on \`mouseup\`.
   - Delete / Backspace dispatches \`delete_clip\` / \`ripple_delete\`.
   - Track locking, muting, and visibility dispatch \`set_track_state\`.
3. **Lock & Concurrency Invariants**:
   - Pre-gesture checks reject locked-track edits in UI.
   - Authoritative \`_assertTrackNotLocked\` enforces rejection at the engine boundary (\`TRACK_LOCKED\`).
   - Mismatched \`expectedBaseRevision\` fails closed with HTTP 409 (\`STALE_REVISION\`).
4. **Monotonic Undo / Redo**:
   - Engine-owned undo stack ensures bit-exact canonical restoration; revisions advance monotonically across undo ($N+1$) and redo ($N+2$).
5. **Test Results**:
   - \`node --test tests/timeline-stage18-2-operations.test.js\`: **15/15 PASS** in 93ms.
   - Consolidated timeline suites (\`tests/timeline-*.test.js\`): **35/35 PASS** in 321ms.

Please review our Stage 18.2 Completion Report and issue your formal review and authorization directive for **Stage 18.3: Concurrency, Lock Enforcement & Recovery Hardening**.`;

  console.log('2. Focusing active ChatGPT tab in Brave Browser...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return "ACTIVATED"
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const fRes = spawnSync('osascript', ['-'], { input: focusScript, encoding: 'utf8' });
  console.log('   Focus:', (fRes.stdout || '').trim());

  console.log('3. Injecting completion submission into div.ProseMirror[aria-label="Ask ChatGPT"]...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return JSON.stringify({ error: 'NO_COMPOSER' });
    el.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    document.execCommand('delete', false, null);
    
    const prompt = ${JSON.stringify(promptText)};
    document.execCommand('insertText', false, prompt);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return 'NO_COMPOSER';
    let p = el;
    while (p && !p.querySelector('button')) p = p.parentElement;
    if (!p) return 'NO_CONTAINER';
    const btns = Array.from(p.querySelectorAll('button'));
    const sendBtn = btns.find(b => {
      const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
      return (aria === 'send' || aria.includes('send')) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  console.log('5. Awaiting ChatGPT Stage 18.2 Completion Review in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Stage 18.2: Atomic Editing & Compound Editorial Operations";

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      
      // Find the prompt anchor
      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

      // Find the response after this prompt: look for "ChatGPT said:" or "Stage 18.2" or "Stage 18.3"
      const afterPrompt = text.slice(pIdx);
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

      let responseText = afterPrompt.slice(mIdx + marker.length).trim();
      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        len: responseText.length,
        snippet: responseText.slice(0, 150),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Stage 18.2 Completion Review received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`... awaiting review (chars: ${data.len}, generating: ${data.isGenerating})\n`);
      }
    } catch (e) {
      console.log('Waiting for response parsing...');
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE18_2_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Stage 18.2 Completion Review & Stage 18.3 Authorization

**Date**: ${new Date().toISOString()}  
**Conversation**: \`https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a\`  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.2 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 18.2 Completion Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
