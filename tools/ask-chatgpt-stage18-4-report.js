/**
 * Ezra Bridge Script: Submit Phase 18 Stage 18.4 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 18.4 Completion Report Submission Prompt...');

  const completionReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE4_COMPLETION_REPORT.md'), 'utf8');
  const auditReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE4A_DELIVERY_INTEROP_AUDIT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your **Stage 18.4 Implementation Directive** (\`plans/CHATGPT_STAGE18_3_COMPLETION_REVIEW.md\`), we have completed:
1. 📁 **Stage 18.3 Closeout**:
   - Implemented and verified **Response-Loss Retry Identity** (Test 12 in \`tests/timeline-stage18-3-concurrency.test.js\`): A committed mutation with a dropped response retried with the exact same \`operationId\` returns the previously committed outcome with zero duplicate commits and no revision advancement ($N \\to N+1$ only once). Reusing the ID with a conflicting payload fails closed with HTTP 400 (\`IDEMPOTENCY_CONFLICT\`).
   - Reconciled master regression suite discovery: \`package.json\` test runner discovers and executes all suites.
2. 📁 **\`plans/PHASE_18_STAGE4A_DELIVERY_INTEROP_AUDIT.md\`** (Audited field survivability, rational microsecond $\\leftrightarrow$ 120k tick conversion math, rounding boundaries, persistence contracts, genuine rendering pipeline, QA gates, and fail-safe active delivery preservation).
3. 📁 **\`plans/PHASE_18_STAGE4_COMPLETION_REPORT.md\`** (Complete acceptance matrix, performance benchmarks, and regression results).
4. 📁 **Test Battery (\`tests/timeline-stage18-4-delivery.test.js\`)**:
   - **Stage 18.4B (Deterministic Timeline Workflow)**: 11/11 PASS (insert_clip, move_clip with snapping, atomic trim-in/out, split_clip interior split, ripple_delete, slip/slide, track reorder/lock, locked-track fail-closed, undo/redo bit-exact canonical content equality, save/reload round-trip).
   - **Stage 18.4C (CapCut Interoperability Verification)**: 5/5 PASS (rational $0.000$ error on grid-aligned multiples of 25 us, strictly bounded $\\le 1$ tick error on non-divisible timestamps, full import/export round-trip parity, isolation of unsupported color/VTSM fields, server endpoints \`POST /api/capcut/export\` and \`import\`).
   - **Stage 18.4D (Genuine Rendering, QA & Delivery Publication)**: 5/5 PASS (real FFmpeg decoded media, QA pass with score 100, SHA-256 byte digest binding, delivery manifest verification, active delivery publication, and injected failure isolation across render crashes, QA rejections, and manifest tampering).
   - **Performance Benchmarks**: 1,000-clip projection P95: **4.17 ms** (Budget: $\\le 16.67$ ms); 1,000-clip snapping P95: **0.0164 ms** (Budget: $< 0.30$ ms).
   - **Consolidated Timeline Suites**: **70 / 70 PASS** in 821ms.
   - **Master Repository Regression**: **460 / 460 PASS in 87.8s (exit code 0)**.

Here is the complete Stage 18.4 Completion Report:

---

${completionReport}

---

Please review our Stage 18.4 Completion Report and issue your formal review and authorization for **Stage 18.5 (Final Regression & TL-01 Tagging)**.`;

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

  console.log('3. Injecting completion submission into composer...');
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

  console.log('5. Awaiting ChatGPT Stage 18.4 Completion Review in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "In accordance with your **Stage 18.4 Implementation Directive**";

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
        // Fallback: search for "Stage 18.4" or check last article
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
        console.log(`\n✅ Stage 18.4 Completion Review received! (${data.len} characters)`);
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

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE18_4_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Stage 18.4 Formal Review & Stage 18.5 Authorization

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.4 Review & Stage 18.5 Authorization  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 18.4 Completion Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
