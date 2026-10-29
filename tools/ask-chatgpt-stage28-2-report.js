/**
 * Ezra Bridge Script: Submit Stage 28.2 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 28.2 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 28.2 Completion Report & Stage 28.3 Authorization Request)";

  const promptText = `${promptAnchor},

In accordance with your Stage 28.1 Acceptance & Stage 28.2 Authorization ruling and binding conditions (ARC-28-08 through ARC-28-14) in \`plans/CHATGPT_STAGE28_1_APPROVAL.md\`, and following the mandatory engineering directive:
\`“Use required GSD actions to achieve the goals and wherever needed.”\`

The engineering team has completed the full implementation and verification of **Stage 28.2: Multi-Pass Repair Orchestrator & Bounded Pass Engine**.

---

### 1. Stage 28.2 Deliverables & Git Commit Provenance
- **Commit**: \`2b9ae25\` (\`feat(audio): implement MultiPassRepairOrchestrator with bounded passes and atomic rollback (Stage 28.2)\`)
- **Modules Implemented**:
  1. \`src/audio/repair/multi-pass-orchestrator.js\`: Implements \`MultiPassRepairOrchestrator\` coordinating bounded sequential passes:
     - **Candidate Isolation (ARC-28-08)**: Isolated candidate project cloned from baseline; active delivery preserved 100% untouched until final verified promotion.
     - **Bounded Pass Budget (ARC-28-09)**: Strict \`maxPasses = 3\` limit; final verification-only pass counts toward limit. Pass exhaustion terminates cleanly with \`MAX_PASSES_EXCEEDED\` and status \`NEEDS_RECONCILIATION\` without promoting candidate.
     - **Fresh Ingestion & Revision Fencing (ARC-28-10)**: Pass $(k+1)$ consumes strictly fresh QA evidence derived from Pass $(k)$'s render. Re-validates proposal preconditions against candidate revision immediately prior to execution.
     - **Atomic Multi-Pass Rollback (ARC-28-12)**: Failure on subsequent passes triggers reverse-order execution of verified inverse operations. Enforces **monotonic revision progression** ($R_0 \\to R_1 \\to R_2 \\to R_3 \\to R_4$, revisions are never decremented!). Restores physical clip timeline properties and verifies candidate structural recovery. Rollback exceptions quarantine candidate and flag \`NEEDS_RECONCILIATION\`.
     - **Delivery Promotion Separation (ARC-28-13)**: Promotes only upon fresh render, passed QA, matching SHA-256 digests, and zero unresolvable conflicts.
  2. \`tests/workflow-stage28-2-multi-pass-orchestrator.test.js\`: Verification test suite implementing all 6 discrete subtests (\`MPS-01\` through \`MPS-06\`).

---

### 2. Discrete Subtest Execution Ledger (Stage 28.2)
Command: \`node --test tests/workflow-stage28-2-multi-pass-orchestrator.test.js\`

| Test ID | Architectural Invariant | Verification Result | Duration |
|:---|:---|:---:|:---:|
| **MPS-01** | Bounded pass execution: enforces 3-cycle limit and terminates successfully on Pass 2 with \`PROMOTED\` when defects resolve | **PASS** | 26.33 ms |
| **MPS-02** | Fresh findings ingestion: verifies Pass 2 consumes fresh QA findings derived from Pass 1's newly rendered media artifact | **PASS** | 3.51 ms |
| **MPS-03** | Monotonic revision progression: proves revisions advance monotonically ($5 \\to 6$) and fences against stale proposals | **PASS** | 3.86 ms |
| **MPS-04** | Pass budget exhaustion: persistent defects at pass 3 terminate with \`MAX_PASSES_EXCEEDED\` and status \`NEEDS_RECONCILIATION\` without promotion | **PASS** | 2.41 ms |
| **MPS-05** | Delivery preservation: active delivery remains completely unchanged across failed/rejected proposal attempts | **PASS** | 3.02 ms |
| **MPS-06** | Atomic multi-pass rollback: failure on Pass 2 executes inverse operations in reverse order, proves monotonic revisions, verifies physical clip recovery, and handles unverified rollback safely | **PASS** | 9.42 ms |
| **Suite Harness** | Parent test suite runner harness | **PASS** | 59.75 ms |

**Result**: **6 / 6 discrete subtests PASS (7 / 7 reported by Node.js test runner)** in 109.2 ms.

---

### 3. Cumulative Regression Battery (Phases 21 through 28.2)
Command: \`node --test tests/workflow-stage2{1,2,3,4,5,6,7}*.test.js tests/workflow-stage28-1-conflict-detector.test.js tests/workflow-stage28-2-multi-pass-orchestrator.test.js\`

- **Certified Phase 27 Baseline**: **212 / 212 PASS**
- **Additive Stage 28.1 Results**: **+8 reported tests** (7 discrete subtests + 1 suite runner)
- **Additive Stage 28.2 Results**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Cumulative Active Battery**: **227 / 227 PASS (100% Zero Regressions)**
- Execution Time: 21.57s | Failures: 0 | Cancelled: 0 | Skipped: 0

---

### 4. Production Invariants & Constraints Compliance
1. **ARC-28-08 & ARC-28-13 (Delivery Integrity)**: Active delivery is preserved 100% untouched throughout all passes until final verified promotion.
2. **ARC-28-09 (Hard Budget)**: Default \`maxPasses = 3\` enforced. Zero silent resets or unmetered loops.
3. **ARC-28-10 (Fresh Findings)**: Render output and QA evidence bound to exact candidate revision and file SHA-256.
4. **ARC-28-12 (Monotonic Rollback)**: Compensation via inverse operations executed exclusively through \`OperationExecutor\`, advancing revisions monotonically while restoring clip physical positions.
5. **ARC-28-14 (Canonical Schemas & Zero Runtime Dependencies)**: All 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen. \`"dependencies": {}\` preserved in \`package.json\`.

---

### 5. Action Requested from Architecture Lead
1. Review and accept the Stage 28.2 empirical verification and test results.
2. Grant formal authorization to proceed to **Stage 28.3: Anti-Oscillation & Convergence Guard** (\`src/audio/repair/repair-convergence-guard.js\` and tests \`CVG-01\` through \`CVG-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 28.2 Report prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 28.2 Review Decision...');
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

  console.log('\n=================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 28.2 REVIEW DECISION RECEIVED:');
  console.log('=================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE28_2_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
