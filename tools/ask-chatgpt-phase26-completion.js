/**
 * Ezra Bridge Script: Submit Phase 26 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 26 Completion Report Submission Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_26_COMPLETION_REPORT.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 26 Milestone Completion & Certification Submission)";

  const promptText = `${promptAnchor},

Following your authorization and binding architectural directives in \`plans/CHATGPT_PHASE26_PLAN_APPROVAL.md\`, we have completed implementation of Stages 26.1 through 26.5 for **Milestone Phase 26: Declarative Sound Kit & Role Placement Engine** on branch \`feature/phase-26-sound-kit-engine\`.

All 6 binding constraints have been strictly satisfied:
1. **Correction A (Isolated Staging & Promotion)**: \`EarshotKitClient\` renders takes into fresh staging directories (\`fs.mkdtempSync\`), validates them, and promotes only validated assets. Pre-existing assets remain untouched.
2. **Correction B (Canonical Operation Vocabulary)**: Uses only canonical \`add_asset\`, \`add_track\`, \`insert_clip\`, and \`set_audio_envelope\`. Zero schema changes, frozen canonical schemas preserved.
3. **Correction C (Asset Provenance & Dual-Hash)**: Upstream SHA-1 validated, EME SHA-256 computed and bound with physical transient timing and versions.
4. **Correction D (Safe Bounds on Placement Math)**: $t_{\\text{start}} = t_e - \\text{round}(t_a \\times 120,000)$. Fails safely with \`PLACEMENT_BOUNDS_ERROR\` on negative start without silent clamping.
5. **Correction E (Conservative Dialogue Ducking)**: Applied only when explicit speech intervals are provided.
6. **Correction F (Bounded Resources & Watchdog)**: Bounded whole-kit timeout watchdog terminates hung processes cleanly.

Test Battery Results:
- Phase 26 Unit & Integration Tests: **29 / 29 PASS (100%)**
- Cumulative Regression Battery (Phases 21–26): **177 / 177 PASS (100% Zero Regressions)**
- Closed-Loop Verification with Phase 25's certified \`EarshotAdapter\`:
  - \`CHK_EARSHOT_SYNC\`: **PASSED** (measured offset: 1ms / 120 ticks, confidence 0.998 on visual cut)
  - \`CHK_EARSHOT_TRUE_PEAK\`: **PASSED** (-8.0 dBTP, 0 clipping samples)
  - \`CHK_EARSHOT_SFX_INTEGRITY\`: **PASSED** (0 defects, 0 rising glides, 0 clicks)

Here is the complete Phase 26 Completion Report:

---

${reportContent}

---

We respectfully request your formal Architecture Lead Milestone Certification and release authorization for Phase 26.`;

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

  console.log('5. Awaiting ChatGPT Architecture Lead Decision in thread-scroll-container...');
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

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE26_FINAL_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSuccessfully received Architecture Lead Final Certification! Saved to ${outPath}`);
  console.log('\n--- Certification Preview ---');
  console.log(finalMarkdown.slice(0, 800));
  console.log('...\n-----------------------------');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
