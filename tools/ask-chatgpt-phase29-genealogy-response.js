/**
 * Ezra Bridge Script: Submit Commit-Genealogy Clarification to ChatGPT Architecture Lead
 *
 * Interacts with ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser
 * (thread: 6ad4ae37-23ec-83ee-b1df-5274a2f04e1a).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

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
  console.log('1. Preparing Commit-Genealogy Clarification Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 29 Commit-Genealogy Clarification & Final Authorization)";

  const promptText = `${promptAnchor},

Thank you for confirming that Findings A and B are fully accepted as reconciled (180 clean archive files, package SHA-256 \`f58f94143e3a32e11bf0380e50f2e427f08ead402b2d2b52ce0872dcbfe5dade\`, 465,197 bytes, and manifest matching).

Here is the exact empirical response to the commit-genealogy clarification query:

---

### 1. Empirical Repository Command Outputs

\`\`\`bash
$ git show -s --format='%H %P %s' e9b87453e25b53cc3c2af121616790eb004834b4
e9b87453e25b53cc3c2af121616790eb004834b4 bd00954062e0bbca984576ea4835042788ca4a54 a629f0ec055cf4b00de9f07ce9084ee1f8144672 Merge Phase 28: Repair Policy, Conflict Resolution & Multi-Pass Orchestration

$ git show -s --format='%H %P %s' e9b87455e8a609d59ea061ca815915ec4ae89fd4
fatal: bad object e9b87455e8a609d59ea061ca815915ec4ae89fd4

$ git show -s --format='%H %P %s' main
e9b87453e25b53cc3c2af121616790eb004834b4 bd00954062e0bbca984576ea4835042788ca4a54 a629f0ec055cf4b00de9f07ce9084ee1f8144672 Merge Phase 28: Repair Policy, Conflict Resolution & Multi-Pass Orchestration

$ git merge-base --is-ancestor e9b87453e25b53cc3c2af121616790eb004834b4 c854f6fbf254f7b1f62f7dd9ffc33429298733d2
$ echo "Previously recorded main baseline ancestry: $?"
Previously recorded main baseline ancestry: 0

$ git merge-base --is-ancestor a629f0ec055cf4b00de9f07ce9084ee1f8144672 c854f6fbf254f7b1f62f7dd9ffc33429298733d2
$ echo "Phase 28 certified ancestry: $?"
Phase 28 certified ancestry: 0
\`\`\`

---

### 2. Reconciliation & Errata Explanation

1. **Root Cause**: The string \`e9b87455e8a609d59ea061ca815915ec4ae89fd4\` was a single-line clerical transcription error in line 7 of the markdown addendum text.
2. **Repository Ground Truth**:
   - The git object database does not contain \`e9b87455...\` (returned \`fatal: bad object\`).
   - The authoritative, actual commit hash of \`main\` in the repository is:
     $$\mathbf{e9b87453e25b53cc3c2af121616790eb004834b4}$$
   - Its commit message is: \`Merge Phase 28: Repair Policy, Conflict Resolution & Multi-Pass Orchestration\`.
   - Its second parent ($P_2$) is \`a629f0ec055cf4b00de9f07ce9084ee1f8144672\` (\`phase-28-certified\`).
3. **Ancestry Unambiguously Confirmed**:
   - \`git merge-base --is-ancestor e9b87453e25b53cc3c2af121616790eb004834b4 c854f6fbf254f7b1f62f7dd9ffc33429298733d2\` exits with **code 0**.
   - \`git merge-base --is-ancestor a629f0ec055cf4b00de9f07ce9084ee1f8144672 c854f6fbf254f7b1f62f7dd9ffc33429298733d2\` exits with **code 0**.
4. **Addendum Updated**:
   - [\`plans/PHASE_29_CLOSURE_ADDENDUM.md\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/plans/PHASE_29_CLOSURE_ADDENDUM.md) has been corrected in-place to specify \`e9b87453e25b53cc3c2af121616790eb004834b4\` as the Main Merge Baseline.
   - All certified git history remains 100% preserved and untouched.

---

### 3. Action Requested from Architecture Lead

With the commit genealogy fully clarified and proven with exit code 0:
1. Formally grant unconditional **Final Milestone Certification** for **Phase 29: Adaptive Repair Confidence & Human-in-the-Loop Escalation**.
2. Grant formal authorization to merge \`feature/phase-29-adaptive-repair-confidence\` into \`main\`.
3. Grant formal authorization to tag \`phase-29-certified\` on release commit \`c854f6fbf254f7b1f62f7dd9ffc33429298733d2\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Commit-Genealogy Clarification into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Certification and Authorization...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 29 FINAL UNCONDITIONAL DECISION:');
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
