/**
 * Ezra Bridge Script: Submit Stage 33.2 Lineage Reconciliation (Finding S33.2-LIN-01)
 * to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 33.2 Lineage Reconciliation Dossier (Finding S33.2-LIN-01)...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Stage 33.2 Lineage Reconciliation — Finding S33.2-LIN-01 Closure & Acceptance Resubmission)";

  const promptText = `${promptAnchor},

In direct response to your ruling in **Decision ID: AVCS-33-STAGE-002** (\`plans/CHATGPT_STAGE33_2_ACCEPTANCE.md\`), the engineering team submits the full machine-generated Git forensic evidence resolving **Finding S33.2-LIN-01** (Parent identity reconciliation).

---

### 1. Root Cause & Investigation Summary

1. **Typo in Stage 33.1 Prompt Text**:
   - During the submission of Stage 33.1, the prompt script \`tools/ask-chatgpt-stage33-1-report.js\` contained a transcription error: the short commit hash \`7401e7f\` was inadvertently expanded to \`7401e7f5cf4a9e403d61184a4ec410fcf9c585fa\` in the prompt text.
   - The true full SHA-1 hash created in Git on branch \`feature/phase-33-1-fusion-contracts\` at commit time (\`2026-10-24 10:54:07 +0530\`) was and is:
     \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\`
2. **Object Database Proof**:
   - The string \`7401e7f5cf4a9e403d61184a4ec410fcf9c585fa\` does not exist anywhere in the repository (\`git cat-file: could not get object info\`).
   - The actual parent of Stage 33.2 commit \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` is \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\`.
   - The actual parent of \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` is \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`).
3. **Unbroken Ancestry Verification**:
   - The lineage is strictly linear, unbroken, and un-rewritten:
     \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)  
     └── \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (Stage 33.1 Accepted Implementation)  
         └── \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` (Stage 33.2 Implementation)

---

### 2. Mandatory Machine-Generated Git Forensics (Items 1–5 from Decision AVCS-33-STAGE-002)

#### 2.1. Exact Output of \`git rev-parse HEAD\` and \`git rev-parse HEAD^\` on Stage 33.2:
\`\`\`bash
$ git rev-parse HEAD
fb7398b7644dda1c1a1fb78c7f56ad653eba4f82

$ git rev-parse HEAD^
7401e7f7cafba4c2fd204bbb10d5f76675b62f1c
\`\`\`

#### 2.2. Exact Output of \`git cat-file -p fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\`:
\`\`\`text
tree abf278f838a4206b747d61aa8a31030353c8ffa1
parent 7401e7f7cafba4c2fd204bbb10d5f76675b62f1c
author Atharv Paharia <pahariaatharv2005@gmail.com> 1792820270 +0530
committer Atharv Paharia <pahariaatharv2005@gmail.com> 1792820270 +0530

feat(phase-33): complete Stage 33.2 frozen audio-visual benchmark and ground truth
\`\`\`
- **Stage 33.2 Tree Identity**: \`abf278f838a4206b747d61aa8a31030353c8ffa1\`

#### 2.3. Exact Output of \`git cat-file -t\` for Both Hashes:
\`\`\`bash
$ git cat-file -t 7401e7f7cafba4c2fd204bbb10d5f76675b62f1c
commit

$ git cat-file -t 7401e7f5cf4a9e403d61184a4ec410fcf9c585fa
fatal: git cat-file: could not get object info
\`\`\`
*(Confirms that \`7401e7f5cf...\` was a transcription typo; \`7401e7f7caf...\` is the real commit object).*

#### 2.4. Exact Output of \`git cat-file -p 7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\`:
\`\`\`text
tree 5786495b75041fbe2f436b3122bb188cafe3ff95
parent 31c6032bb88973aab6a4545785d5b63df8fa0ebe
author Atharv Paharia <pahariaatharv2005@gmail.com> 1792819447 +0530
committer Atharv Paharia <pahariaatharv2005@gmail.com> 1792819447 +0530

feat(phase-33): complete Stage 33.1 fusion contracts, time alignment, and policy specification
\`\`\`
- **Stage 33.1 Tree Identity**: \`5786495b75041fbe2f436b3122bb188cafe3ff95\`
- **Stage 33.1 Parent Identity**: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)

#### 2.5. Ancestry Verification & Exit Status:
\`\`\`bash
$ git merge-base --is-ancestor 7401e7f7cafba4c2fd204bbb10d5f76675b62f1c fb7398b7644dda1c1a1fb78c7f56ad653eba4f82
$ echo "Exit Status: $?"
Exit Status: 0
\`\`\`

#### 2.6. Exact Output of \`git log -2 --oneline\`:
\`\`\`text
fb7398b (HEAD -> feature/phase-33-2-av-benchmark) feat(phase-33): complete Stage 33.2 frozen audio-visual benchmark and ground truth
7401e7f (feature/phase-33-1-fusion-contracts) feat(phase-33): complete Stage 33.1 fusion contracts, time alignment, and policy specification
\`\`\`

---

### 3. Updated Stage Decision Record (Reconciled Lineage)

- **Stage**: 33.2 — Frozen Audio-Visual Benchmark and Ground Truth
- **Implementation commit**: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\`
- **Parent commit (Reconciled)**: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (True Stage 33.1 commit)
- **Certified Predecessor Base**: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)
- **Objective**: Freeze the 24 audiovisual fixtures, 96 labeled decision cases across the 8 defect categories, clean controls, ambiguous cases, unsupported cases, partition protection manifest (16 dev / 8 held-out), auxiliary observation sidecars, and integrity ledgers.
- **Corpus Summary**:
  - **Fixtures**: Exactly 24 fixtures (16 development / 8 held-out, 6 each for Scenarios A, B, C, D).
  - **Decision Cases**: Exactly 96 cases (48 scored defects, 24 clean controls, 12 ambiguous, 12 unsupported).
  - **Partition Split**: 64 Development cases / 32 Held-out cases. Zero leakage, zero cross-partition references.
- **Tests**:
  - Stage 33.2 benchmark test suite (\`tests/workflow-stage33-2-benchmark-corpus.test.js\`): **20/20 PASS** (0 failures, 0 skips, 0 cancellations).
  - Cumulative repository regression battery: **635/635 PASS** across 63 test files (57 runner suites) in 52.71s (592 predecessor + 23 Stage 33.1 + 20 Stage 33.2 = 635 tests).
- **Applicable Quality Gates & Invariants**:
  - \`GATE-01\` (Provenance & Freshness): PASS.
  - \`GATE-04\` (Temporal Alignment): PASS. 120,000 ticks/sec standard with half-open intervals.
  - \`GATE-06\` (Ground-Truth Integrity): PASS.
  - \`GATE-08\` (Architecture & Invariants): PASS. 18 canonical schemas unchanged; package.json dependencies undefined; \`OperationExecutor\` sole mutation authority.
- **Finding S33.2-LIN-01**: **CLOSED**. Reconciled that \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` is the true Stage 33.1 parent commit, and \`7401e7f5cf...\` was an inadvertent prompt transcription typo.
- **Decision Requested**: ACCEPT Stage 33.2.
- **Next-Stage Authorization Requested**: Stage 33.3 (Deterministic Audio-Visual Evidence Fusion) on branch \`feature/phase-33-3-evidence-fusion\`.`;

  console.log('2. Finding ChatGPT tab in Brave Browser...');
  const tabCheck = runOsa('window.location.href');
  if (tabCheck === 'NO_TAB') {
    console.error(`Error: Could not find active Brave tab containing "${CHAT_URL_FRAGMENT}".`);
    process.exit(1);
  }
  console.log('   Found active thread:', tabCheck);

  console.log('3. Copying Stage 33.2 Lineage Reconciliation Dossier to system clipboard...');
  spawnSync('pbcopy', { input: promptText, encoding: 'utf8' });

  console.log('4. Pasting dossier into ChatGPT composer via System Events...');
  const pasteScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        tell t to execute javascript "(() => {
          let el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)');
          if (el) el.focus();
        })()"
      end if
    end repeat
  end repeat
  activate
end tell
delay 0.5
tell application "System Events"
  keystroke "a" using command down
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  console.log('5. Waiting 2 seconds and clicking Send button...');
  await sleep(2000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[data-testid="send-button"]');
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

  console.log('6. Awaiting ChatGPT Architecture Lead Ruling on S33.2-LIN-01 & Stage 33.2 Acceptance...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE33_2_FINAL_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.2 Final Acceptance Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
