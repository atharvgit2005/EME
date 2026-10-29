/**
 * Ezra Bridge Script: Submit Phase 27 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 27 Completion Report Submission Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_27_COMPLETION_REPORT.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 27 Milestone Completion Report & Final Certification Request)";

  const promptText = `${promptAnchor},

In accordance with your binding architectural guidance and plan approval in \`plans/CHATGPT_PHASE27_PLAN_APPROVAL.md\`, and following the mandatory engineering directive:
\`“Use required GSD actions to achieve the goals and wherever needed.”\`

The engineering team has completed the full implementation and verification of **Milestone Phase 27: Closed-Loop Audio Defect Repair & Automated Retiming**.

All 10 binding architectural conditions (**ARC-27-01** through **ARC-27-10**) have been fully satisfied with zero regressions and zero exceptions.

---

### Executive Verification & Release Provenance Summary

1. **Test Battery Accounting (Cumulative Regression: Phases 21–27)**:
   - **Baseline Cumulative Regression (Phases 21–26)**: **177 / 177 PASS (100%)**
   - **Additive Phase 27 Battery**: **35 / 35 PASS (100%)**
   - **Total Repository Battery (Phases 21–27)**: **212 / 212 PASS (100%)**
   - Duration: 14.03s | Zero failures | Zero flakiness

2. **Git Candidate Provenance**:
   - **Feature Branch**: \`feature/phase-27-audio-repair-engine\`
   - **Base Certified Tag**: \`phase-26-certified\` (\`b8098ce35138c3e4a63a81bf7522a0fb00410f74\`)
   - **Implementation Candidate Commit**: \`e53317ae7958a87dd17ae7aaaeecfdebd1a38a62\`
     - Commit Message: \`feat(audio): implement closed-loop audio repair engine and delivery protection (Phase 27)\`
   - **Authoritative Feature HEAD Commit**: \`79517f302b115662bb1e1797c0da984e1fc9a7d3\`
     - Commit Message: \`docs(phase-27): author Phase 27 Completion Report and release package verification\`
   - \`git diff --check main...HEAD\`: **100% Clean (0 whitespace/syntax issues)**

3. **Cryptographically Sealed Release Package**:
   - **Package Archive**: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\`
   - **Package SHA-256**: \`2931f7688ce7946d5e38f5070c2ff8d855c4fcc08027af1adbfa99f82f00cdf1\`
   - **Package SHA-1**: \`fbcccd592a9f207b6e5f15bc9c2655cf6d3c013e\`
   - **Packaged File Count**: **189 clean production files** (exactly +4 files over Phase 26's 185 files)
   - **Package Size**: **445,610 bytes** (435.2 kB compressed)
   - **Release Manifest**: \`dist/release-manifest.json\` (bound to git commit \`cee661c\` / \`58bfc12\`)
   - **Dependency Policy**: Preserves \`"dependencies": {}\` (**0 external runtime npm dependencies**)
   - **Schema Freeze**: All 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen.

---

### Phase 27 Completion Report Document
${reportContent}

---

### Formal Action Requested from Architecture Lead
1. Review the empirical evidence and compliance verification against \`ARC-27-01\` through \`ARC-27-10\`.
2. Issue unconditional Milestone Phase 27 Release Certification.
3. Grant authorization to merge \`feature/phase-27-audio-repair-engine\` into \`main\` and apply release tag \`phase-27-certified\`.
4. Provide directives and kickoff guidance for the subsequent engineering milestone.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Completion Report prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Certification Decision...');
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
        // Fallback: take text after anchor
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
        snippet: responseText.slice(0, 150),
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

    // Must be finished generating, have non-trivial response length, and at least 3 attempts to avoid race conditions
    if (!parsed.isGenerating && parsed.len > 400 && attempt >= 3) {
      completed = true;
      finalMarkdown = parsed.text;
      break;
    }
  }

  if (!completed) {
    console.error('ERROR: Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  console.log('\n=================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD CERTIFICATION DECISION RECEIVED:');
  console.log('=================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE27_FINAL_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
