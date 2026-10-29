/**
 * Ezra Bridge Script: Submit Phase 27 Implementation Plan to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 27 Implementation Plan Submission Prompt...');

  const planContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_27_IMPLEMENTATION_PLAN.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 27 Implementation Plan Review & Authorization Request)";

  const promptText = `${promptAnchor},

Following your unconditional certification of **Milestone Phase 26** and formal release authorization in \`plans/CHATGPT_PHASE26_UNCONDITIONAL_RELEASE_CERTIFICATION.md\`:
- Annotated release tag \`phase-26-certified\` has been created on certified merge commit \`b8098ce35138c3e4a63a81bf7522a0fb00410f74\`.
- Branch \`feature/phase-27-audio-repair-engine\` has been initialized from the certified release base.

In strict accordance with your Phase 27 kickoff recommendations and initial engineering directives:
**Execution Directive**: \`Use required GSD actions to achieve the goals and wherever needed.\`

We have authored the comprehensive **Phase 27 Implementation Plan: Closed-Loop Audio Defect Repair & Automated Retiming** across 5 implementation stages:
1. **Stage 27.1**: Repair Finding Ingestion & Candidate Proposal Engine (\`AudioRepairPlanner\`)
2. **Stage 27.2**: Canonical Operation Compilation & Precondition Validation (\`RepairOperationCompiler\`, \`OperationExecutor\`)
3. **Stage 27.3**: Deterministic Controlled Audio-Sync Defect Scenario (Controlled +150ms / +18,000 tick fixture, closed-loop retiming, rerender, acoustic transient alignment verification)
4. **Stage 27.4**: Active Delivery Promotion & Failure Isolation (\`AudioRepairCoordinator\`, quarantine, \`NEEDS_RECONCILIATION\`)
5. **Stage 27.5**: Closed-Loop End-to-End Verification & Cumulative Regression (Multi-defect scenario + 177+ cumulative tests)

Here is the complete implementation plan for your architectural review and binding guidance:

---

${planContent}

---

We respectfully request your formal Architecture Lead Plan Review, any binding architectural constraints or corrections, and authorization to begin implementation of Phase 27.`;

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

    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(800);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const btn = document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label="Send prompt"]') ||
                document.querySelector('button[aria-label*="Send"]');
    if (!btn) return "NO_SEND_BUTTON";
    btn.click();
    return "CLICKED_SEND";
  })()`);
  console.log('   Send:', sendRes);

  console.log('5. Awaiting ChatGPT Architecture Lead Plan Review & Authorization Decision...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 80; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;

      const scroll = document.querySelector('.thread-scroll-container') || document.querySelector('main');
      if (!scroll) return JSON.stringify({ error: 'NO_SCROLL' });
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
          responseText = afterPrompt.slice(${JSON.stringify(promptAnchor)}.length).trim();
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
      await sleep(3000);
      const recheck = runOsa(`(() => {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
        if (stopBtn) return JSON.stringify({ isGenerating: true });
        const scroll = document.querySelector('.thread-scroll-container') || document.querySelector('main');
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
            responseText = afterPrompt.slice(${JSON.stringify(promptAnchor)}.length).trim();
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

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE27_PLAN_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSuccessfully received Architecture Lead Plan Authorization! Saved to ${outPath}`);
  console.log('\n--- Plan Approval Preview ---');
  console.log(finalMarkdown.slice(0, 800));
  console.log('...\n-----------------------------');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
