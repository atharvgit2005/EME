/**
 * Ezra Bridge Script: Submit Stage 28.4 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 28.4 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 28.4 Completion Report & Stage 28.5 Authorization Request)";

  const promptText = `${promptAnchor},

In accordance with your Stage 28.3 Acceptance & Stage 28.4 Authorization ruling and binding conditions (ARC-28-23 through ARC-28-28) in \`plans/CHATGPT_STAGE28_3_APPROVAL.md\`, and following the mandatory engineering directive:
\`“Use required GSD actions to achieve the goals and wherever needed.”\`

The engineering team has completed the full implementation and empirical verification of **Stage 28.4: Mandatory Conflicting Defect Certification Scenario**.

---

### 1. Stage 28.4 Deliverables & Git Commit Provenance
- **Commit**: \`d335027\` (\`feat(audio): implement mandatory conflicting defect scenario with attribution separation and safe halts (Stage 28.4)\`)
- **Modules & Tests Implemented**:
  1. \`tests/workflow-stage28-4-conflicting-repair-scenario.test.js\`: Comprehensive scenario test suite establishing:
     - **Attribution Separation (ARC-28-23)**: Earshot supplies measured perceptual audio-sync findings for Clip A (-150ms onset early relative to cut $\\to$ requires $+18,000$ tick retiming); EME independently calculates prospective timeline intervals and detects the $[240000, 258000)$ collision with adjacent Clip B on the destination track.
     - **Both Policy Paths Exercised (ARC-28-24)**:
       * **Resolvable Path A**: Policy authorizes track reallocation to free track (\`a2_sfx\`). Executed exclusively via canonical \`move_clip\` with \`targetTrackId: 'a2_sfx'\` through \`OperationExecutor\`. Rerendered candidate undergoes fresh QA, passes with zero defects, and promotes to active delivery.
       * **Unresolvable Path B**: Locked track / unresolvable collision triggers safe halt with \`NEEDS_RECONCILIATION\`, quarantines candidate, and leaves active delivery 100% untouched.
     - **Complete Interval Graph Validation (ARC-28-25 & ARC-28-26)**: Validates half-open $[t_{\\text{start}}, t_{\\text{end}})$ collision geometry and deterministic classification as \`CLIP_OVERLAP\`.
     - **Fresh Evidence & Delivery Safety (ARC-28-27 & ARC-28-28)**: Rerendered candidates undergo fresh QA audit; zero unauthorized mutations commit; active delivery remains untouched on unresolvable conflicts.
  2. \`src/audio/repair/audio-repair-planner.js\` & \`src/audio/repair/multi-pass-orchestrator.js\`: Configured \`deferCollisionCheck\` and \`deferTrackLockCheck\` options enabling \`RepairConflictDetector\` to govern policy evaluation and conflict resolution across multi-pass cycles.

---

### 2. Discrete Subtest Execution Ledger (Stage 28.4)
Command: \`node --test tests/workflow-stage28-4-conflicting-repair-scenario.test.js\`

| Test ID | Architectural Invariant | Verification Result | Duration |
|:---|:---|:---:|:---:|
| **CSC-01** | Dual-condition fixture: creates abutting Clip A $[120000, 240000)$ and Clip B $[240000, 300000)$ on track \`a1_dialogue\`, establishes baseline render | **PASS** | 4.40 ms |
| **CSC-02** | Attribution separation: Earshot supplies -150ms sync offset finding; EME independently analyzes geometry and detects $[240000, 258000)$ collision with Clip B | **PASS** | 1.04 ms |
| **CSC-03** | Collision classification: \`RepairConflictDetector\` classifies collision as \`CLIP_OVERLAP\` with exact overlap interval $[240000, 258000)$ | **PASS** | 1.81 ms |
| **CSC-04** | Resolvable path: policy-authorized track reallocation to \`a2_sfx\` executes via \`move_clip\` through \`OperationExecutor\`, fresh QA passes, promotes candidate | **PASS** | 5.20 ms |
| **CSC-05** | Unresolvable path: locked track / collision halts safely with \`NEEDS_RECONCILIATION\`, candidate quarantined, active delivery preserved 100% untouched | **PASS** | 1.00 ms |
| **CSC-06** | Complete diagnostic journal: records evidence provenance, conflict details, render SHA-256, QA results, and reconciliation instructions | **PASS** | 0.61 ms |
| **Suite Harness** | Parent test suite runner harness | **PASS** | 18.21 ms |

**Result**: **6 / 6 discrete subtests PASS (7 / 7 reported by Node.js test runner)** in 83.2 ms.

---

### 3. Cumulative Regression Battery (Phases 21 through 28.4)
Command: \`node --test tests/workflow-stage2{1,2,3,4,5,6,7}*.test.js tests/workflow-stage28-1-conflict-detector.test.js tests/workflow-stage28-2-multi-pass-orchestrator.test.js tests/workflow-stage28-3-convergence-guard.test.js tests/workflow-stage28-4-conflicting-repair-scenario.test.js\`

- **Certified Phase 27 Baseline**: **212 / 212 PASS**
- **Additive Stage 28.1 Results**: **+8 reported tests** (7 discrete subtests + 1 suite runner)
- **Additive Stage 28.2 Results**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Additive Stage 28.3 Results**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Additive Stage 28.4 Results**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Cumulative Active Battery**: **241 / 241 PASS (100% Zero Regressions)**
- Execution Time: 14.29s | Failures: 0 | Cancelled: 0 | Skipped: 0

---

### 4. Production Invariants & Constraints Compliance
1. **ARC-28-23 (Attribution Separation)**: Earshot supplies acoustic/perceptual QA findings; EME timeline logic detects and validates timeline geometry collisions.
2. **ARC-28-24 (Dual-Path Coverage)**: Both resolvable (canonical track reallocation) and unresolvable (locked-track safe halt) paths verified empirically.
3. **ARC-28-27 & ARC-28-28 (Delivery Safety & Canonical Authority)**: All mutations execute exclusively via \`OperationExecutor\`. Active delivery is preserved 100% untouched on unresolvable halts.
4. **Canonical Schemas & Zero Runtime Dependencies**: 18 canonical schemas 100% frozen; \`"dependencies": {}\` preserved in \`package.json\`.

---

### 5. Action Requested from Architecture Lead
1. Review and accept the Stage 28.4 empirical verification and test results.
2. Grant formal authorization to proceed to **Stage 28.5: Multi-Pass End-to-End Verification & Cumulative Regression** (\`tests/workflow-stage28-5-end-to-end.test.js\`, implementing tests \`E2E-01\` through \`E2E-05\`, targeting 247 reported passing tests).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 28.4 Report prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 28.4 Review Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 28.4 REVIEW DECISION RECEIVED:');
  console.log('=================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE28_4_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
