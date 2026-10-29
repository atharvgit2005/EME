/**
 * Ezra Bridge Script: Submit Phase 30 Final Release Dossier to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 30 Final Release Dossier Prompt...');

  const dossierContent = fs.readFileSync(path.join(__dirname, '../artifacts/phase-30/stage-30.6/phase-30-final-dossier.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 30 Final Release Dossier & Certification Request - Corrected Addendum)";

  const promptText = `${promptAnchor},

In direct response to your ruling in \`plans/CHATGPT_PHASE30_FINAL_CERTIFICATION.md\` (where certification was held pending resolution of Findings A, B, and C), we have completed all required reconciliations on branch \`feature/phase-30-production-reliability\` at commit \`3f6aca8\`.

### Summary of Targeted Resolutions
1. **Finding A (Canonical Job-State Audit)**: Verified that \`src/prompt-core/job-orchestrator.js:30-43\` defines the exact approved 12-state vocabulary (\`ACCEPTED\`, \`PLANNING\`, \`AWAITING_APPROVAL\`, \`READY_TO_EXECUTE\`, \`EXECUTING\`, \`VERIFYING\`, \`RENDERING\`, \`PUBLISHING\`, \`SUCCEEDED\`, \`FAILED\`, \`CANCELLED\`, \`NEEDS_RECONCILIATION\`). Corrected \`SUBMITTED\` typo in report text and \`canonical-architecture-audit.json\`.
2. **Finding B (Fault-Registry Mapping Drift)**: Aligned all 20 scenario names and boundaries strictly with \`artifacts/phase-30/stage-30.1/fault-registry.json\`:
   - \`FI-08\`: "Ledger or journal persistence failure" -> mapped to \`LDG-05\` & \`REC-09\` (routes to \`NEEDS_RECONCILIATION\`).
   - \`FI-15\`: "Compensation fails after partial effects" -> mapped to \`AIG-11\` & \`REC-09\`.
   - \`FI-17\`: "Repeated recovery of same committed operation" -> mapped to \`REC-03\` / \`RPC-03\` (idempotent replay without duplicate revision bump).
3. **Finding C (Tested Source & Release-Package Provenance)**: Release package freshly generated via \`node scripts/package-release.js\`.
   - Manifest: \`dist/release-manifest.json\` records \`git_commit: 4075748615cf14716d35d7922276ad2a3fd442a3\`.
   - Archive: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\` (494,493 bytes, SHA-256: \`22ab7c0fe7e5882457112be0b28f8af4a4647e4991f0839dec38093b54856641\`, 204 files). Standalone checksum verified byte-exact.
   - Master regression: **338 / 338 PASS (100%)** (predecessor 289 + Phase 30 49).

Below is the complete **Corrected Phase 30 Final Release Dossier**:

${dossierContent}

---

### Action Requested from Architecture Lead
1. Formally review and grant unconditional **Phase 30 Release Certification**.
2. Authorize merging \`feature/phase-30-production-reliability\` into \`main\` and applying release tag \`phase-30-certified\`.
3. Authorize immediate transition to **Phase 31: Real-Project Validation & Diverse Defect Benchmark**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 30 Final Dossier into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Phase 30 Certification Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 30 FINAL CERTIFICATION DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE30_FINAL_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
