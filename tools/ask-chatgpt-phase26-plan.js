/**
 * Ezra Bridge Script: Submit Phase 26 Implementation Plan to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 26 Implementation Plan Submission Prompt...');

  const planContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_26_RECON_AND_PLAN.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 26 Implementation Plan Submission)";

  const promptText = `${promptAnchor},

Following your formal release certification of Milestone Phase 25 (\`phase-25-certified\` on merge commit \`10a046614db0a70707981c360556c454b194c75a\`) and your explicit recommendation:

> "Recommended next phase: Declarative Sound Kit & Role Placement Engine. Now that the perception adapter is certified, Phase 26 can evaluate Earshot's deterministic sound bank and kit.lock.json workflow as an optional asset-generation bridge. Keep sound generation separate from inspection, require measured onset/peak/end metadata, and route every timeline change through EME's existing planner and OperationExecutor."

We have completed reconnaissance and authored the comprehensive **Phase 26 Implementation Plan: Declarative Sound Kit & Role Placement Engine** (\`plans/PHASE_26_RECON_AND_PLAN.md\`) on branch \`feature/phase-26-sound-kit-engine\`.

Key architectural solutions defined in this plan:
1. **Asset Generation Decoupled from Inspection**: Out-of-process \`EarshotKitClient\` generates deterministic sound assets and lockfiles (\`kit.lock.json\`). It has zero inspection responsibilities and zero mutation authority.
2. **Measured Physical Transient Alignment**: Uses \`bank.times()\` metadata (\`onset_s\`, \`peak_s\`, \`end_s\`, \`dur_s\`) for mathematical frame-accurate placement:
   - \`align: "peak"\` $\\implies t_{\\text{start}} = t_{\\text{event}} - t_{\\text{peak}}\$
   - \`align: "onset"\` $\\implies t_{\\text{start}} = t_{\\text{event}} - t_{\\text{onset}}\$
3. **Canonical EME Mutation Exclusivity**: \`RolePlacementEngine\` only computes proposed \`add_clip\` operations; all timeline mutations execute strictly via \`OperationExecutor\`.
4. **Closed-Loop Audit**: Verifies placed sound kits against Phase 25's certified \`EarshotAdapter\` to ensure sync within $\\le 1\\text{ frame}$ tolerance and compliant true-peak ceiling.
5. **Zero Runtime NPM Dependencies & Frozen Schemas**: Preserved unconditionally.

Here is the full Phase 26 Implementation Plan:

---

${planContent}

---

We respectfully submit this implementation plan for your formal Architecture Lead review and request authorization ("stop and go ahead") to commence source code implementation of Stage 26.1 through Stage 26.5.`;

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

  console.log('5. Awaiting ChatGPT Architecture Lead Plan Decision in thread-scroll-container...');
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

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE26_PLAN_APPROVAL.md');
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
