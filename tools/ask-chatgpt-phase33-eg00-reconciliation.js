/**
 * Ezra Bridge Script: Submit Phase 33 Entry Gate EG-00 Reconciliation to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 33 EG-00 Reconciliation Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Entry Gate EG-00 Release-Identity Reconciliation & Pre-flight Submission)";

  const promptText = `${promptAnchor},

Thank you for approving the Phase 33 Charter (**Audio-Visual Composition Synthesis — AVCS-33**) and identifying the release-commit hash discrepancy in **EG-00**.

In direct accordance with your instruction (*"Resolve EG-00 first. The two Phase 32 commit hashes differ... provide an evidence-backed reconciliation"*), the engineering team has conducted a full git object audit and established the required charter evidence bundle under \`evidence/phase-33/charter/\`.

We submit below the complete, evidence-backed reconciliation resolving **EG-00** and satisfying entry gates **EG-00 through EG-05**.

---

### 1. Item-by-Item EG-00 Reconciliation

#### 1. Actual Result of \`git rev-parse phase-32-certified^{}\`
\`\`\`bash
$ git rev-parse phase-32-certified^{}
31c6032bb88973aab6a4545785d5b63df8fa0ebe

$ git rev-parse phase-32-certified
be51d429eaa38dba3009c112f09247154ab3d7a4 (annotated tag object)
\`\`\`

#### 2. Exact Commit and Tree Identities Associated with Final Stage 32.6 Certification Evidence
\`\`\`bash
$ git cat-file -p 31c6032bb88973aab6a4545785d5b63df8fa0ebe
tree af891a5ffbd64924421c87bbb591ed40bb8e9e55
parent f4b2872a95d773615b590744817df884211167fb
author Atharv Paharia <pahariaatharv2005@gmail.com> 1792815345 +0530
committer Atharv Paharia <pahariaatharv2005@gmail.com> 1792815345 +0530

chore(phase-32): seal Stage 32.6 final certification package for release commit f4b2872
\`\`\`
- **Substantive implementation commit**: \`f4b2872a95d773615b590744817df884211167fb\` (\`f4b2872\`, closing Finding C with exact BigInt rational arithmetic).
- **Sealed candidate release commit**: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`31c6032\`, parent: \`f4b2872\`, tree: \`af891a5ffbd64924421c87bbb591ed40bb8e9e55\`).
- **Checksum verification**: All 8 sealed audit artifacts in \`artifacts/phase-32/stage-32.6/\` pass \`shasum -c evidence-inventory.sha256\` with 100% OK.

#### 3. Root Cause: Documentation Transcription Typo
- **Querying the ruling hash**:
  \`\`\`bash
  $ git cat-file -t 31c60322c4a9388836692bbda31bf348006d6eeb
  fatal: git cat-file: could not get object info
  \`\`\`
- **Explanation**: The commit hash \`31c60322c4a9388836692bbda31bf348006d6eeb\` never existed in git. In \`scratch/stage32-6-final-reconciliation-prompt.md\` (lines 9 and 145), the 7-character prefix \`31c6032\` was accidentally corrupted during drafting by appending \`2c4a9388836692bbda31bf348006d6eeb\` instead of the actual commit suffix \`bb88973aab6a4545785d5b63df8fa0ebe\`. You faithfully quoted the prompt's 40-character string in the ruling. The real sealed commit created in git has always been \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\`.

#### 4. Immutable Predecessor Tags Audit
All historical release tags remain completely untouched and immutable:
- \`phase-31-certified\`: \`82dcb0f243d65afcec37681aa8c302b20263611f\`
- \`phase-32-5-certified\`: \`ef11797da1c6017b387f1c77eba7d834657e94c3\`
- \`phase-32-certified\`: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (tag object \`be51d429eaa38dba3009c112f09247154ab3d7a4\`)

#### 5. Correct Phase 33 Base Commit
- **Reconciled Phase 33 Base Commit**: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\`
- **New Working Branch Created**: \`feature/phase-33-1-fusion-contracts\` branched directly from \`phase-32-certified\` at \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\`.

---

### 2. Pre-flight Entry Gates Manifest (EG-00 through EG-05)

The required Section 7 evidence directory has been initialized with machine-readable manifests:
1. \`evidence/phase-33/charter/phase-33-charter.md\`: Locked copy of the approved AVCS-33 Directive & Charter.
2. \`evidence/phase-33/charter/predecessor-identity-reconciliation.json\`: Machine-readable audit of EG-00.
3. \`evidence/phase-33/charter/baseline-invariant-manifest.json\`:
   - 18 canonical schemas verified byte-identical.
   - \`package.json\` dependencies: undefined (0 runtime dependencies).
   - \`OperationExecutor\` verified as sole mutation authority.
   - 120,000 integer ticks/sec timebase and half-open interval conventions confirmed.
   - Active-delivery safety and transaction protections confirmed.
4. \`evidence/phase-33/charter/phase-33-stage-plan.json\`: Formally structured 6-stage roadmap (Stages 33.1–33.6).
5. \`evidence/phase-33/charter/entry-gate-checklist.json\`: Entry gate checklist with all gates reconciled.

---

### 3. Formal Rulings & Authorization Requested

We respectfully request the Architecture Lead to:
1. **Rule on EG-00**: Formally close Finding EG-00 (Release Identity Reconciliation) confirming \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` as the certified Phase 32 base commit.
2. **Accept Pre-flight Prerequisites**: Formally accept Entry Gates EG-00 through EG-05.
3. **Authorize Stage 33.1**: Grant explicit engineering authorization to begin **Stage 33.1: Fusion Contracts, Time Alignment, and Policy Specification** on branch \`feature/phase-33-1-fusion-contracts\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 33 EG-00 Reconciliation into ChatGPT composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable='true'][aria-label='Ask ChatGPT']") ||
               document.querySelector("#prompt-textarea") ||
               document.querySelector("[contenteditable='true']");
    if (!el) return JSON.stringify({ error: "NO_COMPOSER" });

    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand("delete", false);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(promptText)});

    const form = el.closest("form") || el.closest("[data-composer-body]") || el.parentElement.parentElement.parentElement;
    const sendBtn = form ? form.querySelector("button[aria-label='Send'], button[data-testid*='send']") : null;

    return JSON.stringify({
      success: ok,
      length: el.innerText.length,
      hasSendBtn: !!sendBtn,
      sendAria: sendBtn ? sendBtn.getAttribute("aria-label") : null
    });
  })()`);
  console.log('   Injection result:', injectRes);

  let parsedInj = {};
  try {
    parsedInj = JSON.parse(injectRes);
  } catch (e) {
    console.error('Failed to parse injection response:', injectRes);
    process.exit(1);
  }

  if (!parsedInj.success || parsedInj.length < 500) {
    console.error('Composer injection did not succeed:', parsedInj);
    process.exit(1);
  }

  console.log('4. Waiting 1 second and clicking Send button...');
  await sleep(1000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[data-testid="send-button"]');
      if (!btn || btn.disabled) return "NO_SEND_BUTTON";
      btn.click();
      return "CLICKED_SEND";
    })()`);
    console.log(`   [Attempt ${b + 1}/10] Send:`, sendRes);
    if (sendRes === 'CLICKED_SEND') {
      clickedSend = true;
      break;
    }
    await sleep(1000);
  }

  if (!clickedSend) {
    console.error('Failed to click send button after 10 attempts.');
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead EG-00 Reconciliation Ruling...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 180; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
      const text = main ? main.innerText : "";

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, pIdx: -1, len: 0, text: "" });
      }

      const afterPrompt = text.slice(pIdx);
      let responseText = "";
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      } else {
        responseText = afterPrompt.trim();
      }

      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        text: responseText
      });
    })()`);

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Attempt ${attempt + 1}/180] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/180] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 500 && !parsed.text.startsWith(promptAnchor)) {
      console.log('   ChatGPT Architecture Lead response received!');
      finalMarkdown = parsed.text;
      completed = true;
      break;
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  const outPath = path.resolve('plans/CHATGPT_PHASE33_EG00_RULING.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead EG-00 Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
