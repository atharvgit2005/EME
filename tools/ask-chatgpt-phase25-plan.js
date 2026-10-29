/**
 * Ezra Bridge Script: Submit Phase 25 Implementation Plan to ChatGPT Architecture Lead
 *
 * Interacts with ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser
 * (thread: 6ad4ae37-23ec-83ee-b1df-5274a2f04e1a).
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
  console.log('1. Preparing Phase 25 Implementation Plan Submission Prompt...');

  const planContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_25_IMPLEMENTATION_PLAN.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 25 Implementation Plan Submission)";

  const promptText = `${promptAnchor},

In accordance with your formal directive in \`plans/CHATGPT_EARSHOT_RECON_DECISION.md\` approving the architecture in principle and mandating a comprehensive 6-stage implementation plan before any source code edits, we have authored the complete **Phase 25 Implementation Plan: Read-Only Audio QA & Perception Adapter** (\`plans/PHASE_25_IMPLEMENTATION_PLAN.md\`).

This plan thoroughly addresses all 7 required deliverables and resolves all 4 corrections you identified:

1. **Versioned Request & Response Contracts**:
   - Internal draft-2020-12 schemas in \`src/renderers/schemas/earshot-qa-request.v1.json\` and \`earshot-qa-response.v1.json\`.
   - Strict 5-value status taxonomy: \`SUCCESS\`, \`NOT_MEASURED\`, \`NOT_APPLICABLE\`, \`TIMEOUT\`, \`WORKER_ERROR\`.
   - Canonical \`schema/*.v1.schema.json\` remain 100% frozen.

2. **Worker Process Lifecycle, Isolation & Containment**:
   - \`EarshotWorkerClient\` patterned on \`VtsmWorkerClient\`.
   - Two-tier timeout policy: fast DSP (2,000ms) vs full perception (15,000ms), with strict separation from worker cold-start initialization.
   - Process tree termination (\`SIGTERM\` $\\to$ 500ms $\\to$ \`SIGKILL\`), sanitized environment (stripping API keys/tokens), and canonical media path containment.

3. **File Change Plan & Exact Integration Hooks**:
   - Exact hooks into \`src/renderers/qa-engine.js\` (\`QualityAssuranceEngine.auditQuality()\`) and \`src/prompt-core/render-orchestrator.js\` (\`RenderOrchestrator.inspectRenderedMedia()\`).
   - Zero changes to \`src/engine/operations.js\` or timeline state; zero mutation authority.

4. **Synthetic Ground-Truth Defect Fixture**:
   - \`fixtures/qa-audio-defects.mp4\` generator with 3 calibrated defects:
     * Defect 1: +150ms audio transient desync on visual cut ($t_{\\text{sound}} - t_{\\text{picture}} = +150\\text{ms}$).
     * Defect 2: True-peak ceiling overflow with recorded dual-ground-truth (+2.2 dBTP pre-clip synthesis / +0.8 dBTP post-clip measured + 120 clipped samples).
     * Defect 3: -85 dBFS digital silence dropout across cut.
   - Distinct separation of perception (adapter), repair proposal (planner/algebra: shift by -18,000 ticks), and certification.

5. **7-Test Certification Matrix**:
   - Complete test suite in \`tests/workflow-stage25-earshot-qa.test.js\` covering contract conformance, fast DSP metrics, audio sync offset detection, fallback on missing Python, malformed output handling, watchdog timeout recovery, and zero project mutation audit.

6. **Strict Zero-NPM-Dependency Isolation**:
   - Core EME \`package.json\` preserves \`dependencies: {}\`. All Earshot Python dependencies remain isolated in external virtualenv.

7. **Acceptance Criteria & Rollback Procedure**:
   - Quantitative acceptance gates across all 6 stages.
   - Single-command atomic rollback: \`git reset --hard phase-23-certified\`.

Here is the complete Phase 25 Implementation Plan:

---

${planContent}

---

We respectfully submit this implementation plan for your formal Architecture Lead review and request:
1. Formal review of the 6-stage implementation plan and its resolution of all required directives.
2. Formal authorization ("stop and go ahead") to commence source code implementation of Stage 25.1 through Stage 25.6.`;

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

  await sleep(600);

  console.log('3. Injecting prompt into div.ProseMirror[aria-label="Ask ChatGPT"]...');
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
      return (aria === 'send' || aria.includes('send') || aria === 'submit') && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.log('   Retrying send via Enter keystroke...');
    const enterScript = `
tell application "System Events"
  key code 36
end tell`;
    spawnSync('osascript', ['-'], { input: enterScript, encoding: 'utf8' });
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Decision in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      let responseText = '';
      if (pIdx !== -1) {
        const afterPrompt = text.slice(pIdx);
        const marker = "ChatGPT said:";
        const mIdx = afterPrompt.indexOf(marker);
        if (mIdx !== -1) {
          responseText = afterPrompt.slice(mIdx + marker.length).trim();
        } else {
          responseText = afterPrompt.slice(promptAnchor.length).trim();
        }
      }
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

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Poll ${attempt + 1}] Raw: ${checkRes.slice(0, 100)}`);
      continue;
    }

    console.log(`   [Poll ${attempt + 1}] Generating: ${parsed.isGenerating}, Resp Len: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 100) {
      // Allow an extra 3 seconds to ensure text is fully settled
      await sleep(3000);
      const recheck = runOsa(`(() => {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
        if (stopBtn) return JSON.stringify({ isGenerating: true });
        const scroll = document.querySelector('.thread-scroll-container');
        const text = scroll ? scroll.innerText || '' : '';
        const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
        let responseText = '';
        if (pIdx !== -1) {
          const afterPrompt = text.slice(pIdx);
          const marker = "ChatGPT said:";
          const mIdx = afterPrompt.indexOf(marker);
          if (mIdx !== -1) {
            responseText = afterPrompt.slice(mIdx + marker.length).trim();
          } else {
            responseText = afterPrompt.slice(promptAnchor.length).trim();
          }
        }
        const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
        if (footerIdx !== -1) {
          responseText = responseText.slice(0, footerIdx).trim();
        }
        return JSON.stringify({ isGenerating: false, text: responseText });
      })()`);

      try {
        const rep = JSON.parse(recheck);
        if (!rep.isGenerating && rep.text.length >= parsed.len) {
          finalMarkdown = rep.text;
          completed = true;
          break;
        }
      } catch (err) {}
    }
  }

  if (!completed || !finalMarkdown) {
    console.error('Failed to get complete response from ChatGPT.');
    process.exit(1);
  }

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE25_PLAN_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSuccessfully received Architecture Lead Decision! Saved to ${outPath}`);
  console.log('\n--- Decision Preview ---');
  console.log(finalMarkdown.slice(0, 800));
  console.log('...\n------------------------');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
