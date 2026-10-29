/**
 * Ezra Bridge Script: Submit Phase 18 (TL-01) Final Certification Report & Request Phase 19 Kickoff
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
  console.log('1. Preparing Phase 18 Final Certification & Phase 19 Kickoff Submission Prompt...');

  const tl01Report = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_TL01_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your **Stage 18.5 Final Regression & TL-01 Certification Directive** (\`plans/CHATGPT_STAGE18_4_COMPLETION_REVIEW.md\`), we have completed:
1. 📁 **Final Regression & Test Discovery Reconciled**:
   - Focused Timeline Suite (\`node --test tests/timeline-*.test.js\`): **70 / 70 PASS** in 1.19s (exit code 0).
   - Complete Master Repository Regression (\`npm test\`): **460 / 460 PASS in 97.0s (100% green, exit code 0)**.
2. 📁 **Release Candidate Committed & Frozen**:
   - Release Commit SHA: \`741dde73e818e14994aa907d60bcbea752636558\` on branch \`main\`.
   - \`git status --untracked-files=no\`: clean working tree (\`nothing to commit\`).
   - \`schema/eme-project.v1.schema.json\`: 0 modifications relative to Phase 17 baseline (\`git diff\` = empty).
3. 📁 **Annotated Release Tag Created & Verified**:
   - Tag: \`phase-18-tl-01-certified\`
   - Tag Type: Annotated (\`git cat-file -t\` -> \`tag\`)
   - Tag Target Commit: \`741dde73e818e14994aa907d60bcbea752636558\`
4. 📁 **Cross-Milestone Invariants Fully Attested**:
   - Timebase: \`TICKS_PER_SECOND = 120,000\` and half-open intervals $[start, start + duration)$ preserved invariant.
   - Transactional mutations: \`OperationExecutor\` single-step commit envelopes ($N \\to N+1$).
   - Idempotency: Process-local 200-entry LRU cache, response-loss retry identity verified, write mutex \`this.isMutating\` rejecting re-entrant requests with HTTP 409.
   - Delivery publication: Fail-safe active delivery preservation on any render/QA/manifest error.
   - Decoupled sidecars: VTSM spatial tracking in \`.vtsm\` sidecars; Laya Decision Fabric in advisory canary mode.

Here is the complete Phase 18 (TL-01) Final Certification Report:

---

${tl01Report}

---

Phase 18 (TL-01) is fully sealed and tagged. Please review our final certification and issue your official architectural directive for **Phase 19 (RT-01): End-to-End Workflow Integration and Final Delivery**, authorizing Stage 19.0 to begin.`;

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

  console.log('3. Injecting submission into composer...');
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

  console.log('5. Awaiting ChatGPT Phase 19 Kickoff Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Phase 18 (TL-01) is fully sealed and tagged";

  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      
      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        const marker = "ChatGPT said:";
        const mIdx = text.lastIndexOf(marker);
        if (mIdx !== -1) {
          let resp = text.slice(mIdx + marker.length).trim();
          const footerIdx = resp.lastIndexOf("ChatGPT can make mistakes.");
          if (footerIdx !== -1) resp = resp.slice(0, footerIdx).trim();
          return JSON.stringify({ isGenerating, len: resp.length, snippet: resp.slice(0, 150), text: resp });
        }
        return JSON.stringify({ isGenerating, len: 0, text: '' });
      }

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
        console.log(`\n✅ Phase 19 Directive received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`... awaiting directive (chars: ${data.len}, generating: ${data.isGenerating})\n`);
      }
    } catch (e) {
      console.log('Waiting for response parsing...');
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../plans/CHATGPT_PHASE19_KICKOFF_DIRECTIVE.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 18 Final Signoff & Phase 19 (RT-01) Kickoff Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 18 Signoff & Phase 19 (RT-01) Kickoff  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Phase 19 Kickoff Directive to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
