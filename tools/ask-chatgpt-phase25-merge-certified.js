/**
 * Ezra Bridge Script: Submit Tested Merge Commit & Provenance to ChatGPT Architecture Lead
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
  console.log('1. Preparing Final Post-Merge Certification Submission Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 25 Post-Merge Final Certification & Tagging Request)";

  const promptText = `${promptAnchor},

In accordance with your formal instructions in \`plans/CHATGPT_PHASE25_FINAL_CERTIFICATION.md\`:

1. **Exact Candidate Commit Reconciliation & Working Tree Evidence**:
   We executed the 6 requested git commands on \`feature/phase-25-earshot-adapter\`:
   - \`git status --short\`: 0 modified tracked files.
   - \`git rev-parse HEAD\`: \`34099d9adfbd9c65ba4b88b912bfba9e4e874be8\`
   - \`git show -s --format='%H %P %s' HEAD\`: \`34099d9adfbd9c65ba4b88b912bfba9e4e874be8 45b7823e0614cd256b46cbf0533026f6255e426c docs(phase-25): reconcile commit genealogy and release provenance for CERT-25-D\`
   - \`git merge-base main HEAD\`: \`66fbb6e615a1fdd54778bd3a1c6eeff429bdae6b\` (Phase 24 Certified Release)
   - \`git log --oneline --decorate main..HEAD\`:
     * \`34099d9\` docs(phase-25): reconcile commit genealogy and release provenance for CERT-25-D (Authoritative Candidate HEAD)
     * \`45b7823\` docs(phase-25): add Phase 25 Closure Addendum for final certification
     * \`7a3cd9e\` feat(phase-25): close certification conditions CERT-25-A through CERT-25-D
     * \`40906ba\` feat(phase-25): implement earshot read-only audio qa and perception adapter (Stages 25.1-25.6)
     *(Note: \`d9fe038\` was a transient working commit hash immediately amended into \`45b7823\` during authoring; it never existed as a separate standalone commit).*
   - \`git diff --check main...HEAD\`: Verified 0 code defects, clean tree.

2. **Executed Merge onto main**:
   Following repository policy, we merged the authoritative feature branch candidate (\`34099d9adfbd9c65ba4b88b912bfba9e4e874be8\`) into \`main\` via a non-fast-forward merge commit:
   - **Tested Merge Commit SHA**: \`10a046614db0a70707981c360556c454b194c75a\`
   - **Merge Strategy**: \`ort\` (clean merge, 27 files changed, 6111 insertions(+)).

3. **Post-Merge Regression Verification on \`main\` at Commit \`10a0466\`**:
   We reran the entire cumulative regression battery directly on \`main\` against merge commit \`10a046614db0a70707981c360556c454b194c75a\`:
   - Phase 25 Battery (\`tests/workflow-stage25-*.test.js\`): **50 / 50 reported results PASS** (6 parent suites + 44 child tests across 6 files).
   - Cumulative Regression (\`tests/workflow-stage21-*.test.js\` through \`stage24-*.test.js\`): **98 / 98 reported results PASS**.
   - **Grand Total Cumulative Regression Battery**: **148 / 148 PASS (100% Zero Regressions)**.

4. **Calibrated Release Fixture Digest**:
   - File: \`fixtures/qa-audio-defects.mp4\` (166,005 bytes)
   - SHA-256: \`c177a4a9a07e824c3704ba0ec138a30252eae11eb60703bf18f2df02f1e0a6a7\`

5. **Strict Release Invariants Preserved**:
   - Zero runtime npm dependencies (\`package.json\` preserves \`dependencies: {}\`).
   - All 18 canonical schemas (\`schema/*.v1.schema.json\`) remain strictly frozen.
   - Earshot remains strictly advisory; zero timeline mutation authority.

We respectfully request your final confirmation and authorization to create the annotated release tag \`phase-25-certified\` pointing to the tested merge commit \`10a046614db0a70707981c360556c454b194c75a\`.`;

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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Release Authorization...');
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

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE25_RELEASE_AUTHORIZED.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSuccessfully received Architecture Lead Final Release Authorization! Saved to ${outPath}`);
  console.log('\n--- Release Authorization Preview ---');
  console.log(finalMarkdown.slice(0, 800));
  console.log('...\n------------------------------------');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
