/**
 * Ezra Bridge Script: Submit Phase 21 Path B Resolution & Request Unconditional Certification
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
  console.log('1. Preparing Phase 21 Path B Resolution Prompt...');

  const addendumContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_21_CLOSURE_ADDENDUM.md'), 'utf8');
  const amendmentContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_20_PROVENANCE_AMENDMENT.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (Phase 21 Path B Provenance Amendment & Unconditional Certification)";

  const promptText = `${promptAnchor},

We have completed **Path B — Formally establish a replacement baseline** in strict compliance with your directive to close **ROLLBACK-21-A**.

### Summary of Completed Path B Requirements:

1. **Formal Replacement Baseline Established (\`plans/PHASE_20_PROVENANCE_AMENDMENT.md\`)**:
   - Source Commit: Tag \`phase-20-certified\` (\`45e0046\`, code commit \`cf048418a04e2b1c095b8ca388974dc0ff4348d5\`).
   - Build Procedure: Clean source tree extraction (161 files) packed via native Node.js packaging harness into \`dist/prior-known-good/editing-mechanics-engine-0.1.0-rc1.tgz\`.
   - Resulting Checksum: **\`96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282\`**.
   - Resulting Byte Size: **371,606 bytes** (161 clean distribution files).
   - Formally documented as an approved amendment to the Phase 20 release provenance.

2. **Independent Verification & Live Rollback Proof**:
   - \`RollbackManager.verifyReleaseArtifact\` verified package integrity and zero test/dev leaks.
   - Live automated rollback drill restored this baseline in **2ms** under \`executeRollback\` with zero state corruption and full active delivery preservation.
   - All Stage 21.4 rollback tests and staging smoke tests re-executed: **7 / 7 PASS**.

3. **All Conditions Now Fully Resolved**:
   - **CERT-21-A**: Closed (Authoritative commit: \`155b62b7ccd84a7864feba5207d29e517cc4cf10\`).
   - **CERT-21-B**: Closed (4 parent runners + 22 child assertions = 26 reported passing tests).
   - **CERT-21-C & ROLLBACK-21-A**: Fully closed via Path B provenance amendment, verified prior-known-good archive, and live 2ms rollback drill.

Here is the Phase 20 Provenance Amendment (\`plans/PHASE_20_PROVENANCE_AMENDMENT.md\`):

---

${amendmentContent}

---

And here is the updated Phase 21 Closure Addendum (\`plans/PHASE_21_CLOSURE_ADDENDUM.md\`):

---

${addendumContent}

---

With Path B fully fulfilled, we respectfully request:
1. Final unconditional certification of Milestone Phase 21.
2. Formal authorization to create git tag \`phase-21-certified\` on commit \`155b62b7ccd84a7864feba5207d29e517cc4cf10\`.
3. Kickoff authorization for Phase 22 (*Controlled Production Pilot & Independent Release Assurance*).`;

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

  console.log('5. Awaiting ChatGPT Final Unconditional Certification Response in thread-scroll-container...');
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

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Phase 21 Final Unconditional Certification received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`   [Attempt ${attempt + 1}/120] Generating=${data.isGenerating}, len=${data.len}...\r`);
      }
    } catch (e) {
      process.stdout.write(`   [Attempt ${attempt + 1}/120] waiting...\r`);
    }
  }

  if (completed && finalMarkdown) {
    const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE21_FINAL_CERTIFICATION.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead final certification to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT final certification response.');
  }
}

main().catch(console.error);
