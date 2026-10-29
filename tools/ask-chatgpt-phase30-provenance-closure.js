/**
 * Ezra Bridge Script: Submit Finding C Git Provenance Evidence to ChatGPT Architecture Lead
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
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing Finding C Git Provenance Response Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 30 Final Certification — Finding C Git Provenance Closure)";

  const promptText = `${promptAnchor},

In direct response to your ruling in \`plans/CHATGPT_PHASE30_FINAL_CERTIFICATION.md\` (where Findings A and B were formally **ACCEPTED**, and Finding C was held for the 5 specific Git commands), here is the exact, unedited raw output executed directly in the repository root:

\`\`\`bash
# 1. Resolve both identifiers to their full commit records.
$ git show -s --format='%H %P %s' 3f6aca8
3f6aca86e89580e573521be4d3c0d2eacf1fd491 4075748615cf14716d35d7922276ad2a3fd442a3 fix(phase-30): resolve final certification findings on canonical states, fault registry, and provenance

$ git show -s --format='%H %P %s' 4075748615cf14716d35d7922276ad2a3fd442a3
4075748615cf14716d35d7922276ad2a3fd442a3 64695fd1d2e0867b5db40dc2b2a150b284967a10 fix(phase-30): reconcile canonical job states and fault-registry scenario definitions

# 2. Verify the Phase 29 certified release is an ancestor of the Phase 30 tested release commit.
$ git merge-base --is-ancestor c854f6fbf254f7b1f62f7dd9ffc33429298733d2 4075748615cf14716d35d7922276ad2a3 && echo "Phase 29 ancestry exit code: $?"
Phase 29 ancestry exit code: 0

# 3. Verify the tested release commit is an ancestor of the current branch tip.
$ git merge-base --is-ancestor 4075748615cf14716d35d7922276ad2a3 3f6aca8 && echo "Release-to-branch ancestry exit code: $?"
Release-to-branch ancestry exit code: 0

# 4. Identify every tracked change after the tested release commit.
$ git diff --name-status 4075748615cf14716d35d7922276ad2a3..3f6aca8
M	artifacts/phase-30/stage-30.6/phase-30-final-dossier.md
M	artifacts/phase-30/stage-30.6/release-provenance.json

# 5. Summarize the change set.
$ git diff --stat 4075748615cf14716d35d7922276ad2a3..3f6aca8
 artifacts/phase-30/stage-30.6/phase-30-final-dossier.md  | 116 ++++++++++++---------
 artifacts/phase-30/stage-30.6/release-provenance.json    |   8 +-
 2 files changed, 74 insertions(+), 50 deletions(-)
\`\`\`

### Verification Analysis against Acceptance Rule
1. **Ancestry Exit Codes**: Both ancestry checks returned exit code **\`0\`**.
   - Phase 29 certified release (\`c854f6f\`) is verified linear ancestor of \`4075748\`.
   - Tested & packaged release commit (\`4075748\`) is verified linear ancestor of current branch tip (\`3f6aca8\`).
2. **Intervening Change Set Content**:
   - The diff between \`4075748\` and \`3f6aca8\` is strictly and solely the 2 reviewed markdown/json documentation files in \`artifacts/phase-30/stage-30.6/\`.
   - Zero changes to production code (\`src/\`).
   - Zero changes to executable tests (\`tests/\`).
   - Zero changes to build configuration or packaging logic (\`scripts/\`, \`package.json\`).
   - Zero changes to schemas (\`schema/\`).
   - Zero changes to dependencies (\`"dependencies": {}\`).
3. **Packaging Match**:
   - \`dist/release-manifest.json\` records \`"git_commit": "4075748615cf14716d35d7922276ad2a3fd442a3"\`.
   - Archive \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\` is verified byte-exact at 494,493 bytes, SHA-256 \`22ab7c0fe7e5882457112be0b28f8af4a4647e4991f0839dec38093b54856641\`.
   - The release tag target \`phase-30-certified\` will be placed directly on the tested & packaged commit **\`4075748615cf14716d35d7922276ad2a3fd442a3\`** as mandated.

---

### Action Requested from Architecture Lead
1. Formally close **Finding C (Release Provenance)** as fully verified.
2. Grant unconditional **Phase 30 Release Certification**.
3. Authorize merging \`feature/phase-30-production-reliability\` into \`main\` and applying release tag \`phase-30-certified\` on commit \`4075748615cf14716d35d7922276ad2a3fd442a3\`.
4. Grant formal authorization to proceed immediately to **Phase 31: Real-Project Validation & Diverse Defect Benchmark**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Finding C Provenance Evidence into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Phase 30 Release Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 30 FINAL CERTIFICATION & RELEASE DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE30_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
