/**
 * Ezra Bridge Script: Submit Phase 18 Stage 18.3 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 18.3 Completion Report Submission Prompt...');

  const completionReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE3_COMPLETION_REPORT.md'), 'utf8');
  const addendum = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE2_ACCEPTANCE_ADDENDUM.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your **Stage 18.3 Architecture Directive** (\`plans/CHATGPT_STAGE18_2_COMPLETION_REVIEW.md\`), we have completed:
1. 📁 **\`plans/PHASE_18_STAGE2_ACCEPTANCE_ADDENDUM.md\`** (Resolving UI controls for \`insert_clip\` and \`reorder_tracks\`, and qualifying canonical content restoration vs. monotonic revision progression).
2. 📁 **\`plans/PHASE_18_STAGE3_CONCURRENCY_AUDIT.md\`** (Auditing commit boundaries, write mutexes, and recovery mechanisms).
3. 📁 **\`plans/PHASE_18_STAGE3_COMPLETION_REPORT.md\`** (Hardening implementation, LRU idempotency cache, write mutex, and 11 deterministic failure-injection tests).

Here is the Stage 18.2 Acceptance Addendum:

---

${addendum}

---

And here is the complete Stage 18.3 Completion Report:

---

${completionReport}

---

### Key Milestone Verifications for Your Review:
1. **Server Write Mutex**:
   - Enforced \`this.isMutating\` across \`/api/project/operation\`, \`/api/project/undo\`, and \`/api/project/redo\` in \`src/ui/server.js\`. Concurrent mutating requests fail closed with HTTP 409 (\`MUTATION_IN_PROGRESS\`).
2. **LRU Idempotency Engine**:
   - Added bounded 200-entry LRU cache \`this.idempotencyCache\`. Duplicate requests with same \`operationId\` and matching payload return cached responses without duplicate commits; conflicting payloads fail closed with HTTP 400 (\`IDEMPOTENCY_CONFLICT\`).
3. **Client-Side Request Serialization**:
   - Hardened \`dispatchOperation\` in \`src/ui/public/app.js\` to serialize requests and inject unique \`operationId\` tokens.
4. **Deterministic Failure Injection Results**:
   - \`node --test tests/timeline-stage18-3-concurrency.test.js\`: **11/11 PASS** in 82ms.
   - Consolidated timeline suites (\`tests/timeline-*.test.js\`): **46/46 PASS** in 381ms.
   - Master repository regression (\`npm test\`): **425/425 PASS** in 88.4s.

Please review our Stage 18.3 Completion Report and issue your formal review and authorization directive for **Stage 18.4: Delivery Integration, CapCut Interop & Timeline Acceptance**.`;

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

  console.log('5. Awaiting ChatGPT Stage 18.3 Completion Review in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Stage 18.3: Concurrency, Lock Enforcement & Recovery Hardening";

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      
      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

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
        console.log(`\n✅ Stage 18.3 Completion Review received! (${data.len} characters)`);
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

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE18_3_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Stage 18.3 Completion Review & Stage 18.4 Authorization

**Date**: ${new Date().toISOString()}  
**Conversation**: \`https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a\`  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.3 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 18.3 Completion Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
