/**
 * Ezra Bridge Script: Submit Phase 29 Final Release-Closure Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 29 Final Release-Closure Addendum Prompt...');

  const addendumContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_29_CLOSURE_ADDENDUM.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 29 Final Release-Closure Addendum & Unconditional Milestone Certification Request)";

  const promptText = `${promptAnchor},

In direct response to your Phase 29 Final Certification Review ruling in \`plans/CHATGPT_PHASE29_FINAL_CERTIFICATION.md\` (where Phase 29 implementation across Stages 29.1–29.6 and the 289/289 regression suite were provisionally accepted), and following your engineering directive:
\`“Submit a single Phase 29 release-closure addendum with the full commit identity, actual manifest, package checksum, and clean archive comparison. Include an explicit count for the three internal schemas.”\`

We have resolved both outstanding findings in empirical detail:
- **Finding A (Production File Accounting)**: Fully reconciled clean-archive file inventory against the Phase 28 certified baseline (173 files), explicitly accounting for the **3 internal schemas** (\`audio-repair-confidence.v1.json\`, \`audio-repair-ledger.v1.json\`, \`audio-repair-calibration.v1.json\`) alongside the **4 production modules** (\`repair-confidence-calibrator.js\`, \`repair-escalation-router.js\`, \`repair-decision-ledger.js\`, \`repair-outcome-calibrator.js\`), yielding exactly **180 clean production files** ($173 + 7 = 180$).
- **Finding B (Final Release Provenance)**: Packaged cleanly from isolated Git archive of full 40-character commit \`c854f6fbf254f7b1f62f7dd9ffc33429298733d2\` with verified direct ancestry from \`phase-28-certified\`, generated \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\` (465,197 bytes, SHA-256: \`f58f94143e3a32e11bf0380e50f2e427f08ead402b2d2b52ce0872dcbfe5dade\`, 180 entries), and created authoritative \`dist/release-manifest.json\`.

Here is the complete **Phase 29 Final Release-Closure Addendum** for your review and final certification sign-off:

${addendumContent}

---

### Action Requested from Architecture Lead
1. Formally review and grant unconditional **Final Milestone Certification** for **Phase 29: Adaptive Repair Confidence & Human-in-the-Loop Escalation**.
2. Grant formal authorization to merge \`feature/phase-29-adaptive-repair-confidence\` into \`main\`.
3. Grant formal authorization to create the annotated release tag \`phase-29-certified\` targeting release commit \`c854f6fbf254f7b1f62f7dd9ffc33429298733d2\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 29 Release-Closure Addendum into ChatGPT input box...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('.composer-NYb0tQ [contenteditable="true"]') ||
               document.querySelector('.RichTextInput-j_tVa5 [contenteditable="true"]') ||
               document.querySelector('[data-composer-body] [contenteditable="true"]') ||
               document.querySelector('#prompt-textarea');
    if (!el) return JSON.stringify({ error: 'NO_COMPOSER_ELEMENT' });

    el.focus();
    const prompt = ${JSON.stringify(promptText)};

    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, prompt);

    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const btn = document.querySelector('button[aria-label="Send"]') ||
                document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label*="Send"]');
    if (!btn) return "NO_SEND_BUTTON";
    btn.click();
    return "CLICKED_SEND";
  })()`);
  console.log('   Send:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.error('Failed to click send button. Send result:', sendRes);
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Final Milestone Decision...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
      const text = main ? main.innerText : '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, pIdx: -1, len: 0, text: '' });
      }

      const afterPrompt = text.slice(pIdx);
      let responseText = '';
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      } else {
        responseText = afterPrompt.slice(${JSON.stringify(promptAnchor)}.length).trim();
      }

      const footerMarkers = [
        "ChatGPT can make mistakes.",
        "Meet Codex in the desktop app",
        "A coding agent that helps you build and ship"
      ];
      for (const f of footerMarkers) {
        const fIdx = responseText.lastIndexOf(f);
        if (fIdx !== -1) {
          responseText = responseText.slice(0, fIdx).trim();
        }
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        snippet: responseText.slice(-200),
        text: responseText
      });
    })()`);

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Attempt ${attempt + 1}/90] Waiting... (parse error: ${checkRes.slice(0, 60)})`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/90] isGenerating: ${parsed.isGenerating}, len: ${parsed.len}`);
    if (parsed.snippet) {
      console.log(`      Snippet: ${parsed.snippet.replace(/\n/g, ' ')}...`);
    }

    if (!parsed.isGenerating && parsed.len > 300 && attempt >= 3) {
      completed = true;
      finalMarkdown = parsed.text;
      break;
    }
  }

  if (!completed) {
    console.error('ERROR: Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  console.log('\n=============================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 29 UNCONDITIONAL CERTIFICATION DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE29_FINAL_RELEASE_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
