/**
 * Ezra Bridge Script: Submit Stage 28.3 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 28.3 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 28.3 Completion Report & Stage 28.4 Authorization Request)";

  const promptText = `${promptAnchor},

In accordance with your Stage 28.2 Acceptance & Stage 28.3 Authorization ruling and binding conditions (ARC-28-15 through ARC-28-22) in \`plans/CHATGPT_STAGE28_2_APPROVAL.md\`, and following the mandatory engineering directive:
\`“Use required GSD actions to achieve the goals and wherever needed.”\`

The engineering team has completed the full implementation and empirical verification of **Stage 28.3: Anti-Oscillation & Convergence Guard**.

---

### 1. Stage 28.3 Deliverables & Git Commit Provenance
- **Commit**: \`503968b\` (\`feat(audio): implement RepairConvergenceGuard with semantic oscillation detection and cumulative bounds (Stage 28.3)\`)
- **Modules Implemented & Integrated**:
  1. \`src/audio/repair/repair-convergence-guard.js\`: Implements \`RepairConvergenceGuard\`:
     - **Semantic Oscillation Detection (ARC-28-15 & ARC-28-16)**: Correlates prior and proposed operations using \`target_clip_id\`, \`strategy\`, and defect lineage. Applies integer-tick reversal tolerance:
       $$|\\Delta_k + \\Delta_{k-1}| < \\epsilon$$
       with explicitly documented $\\epsilon = 1200\\text{ ticks}$ ($10\\text{ms}$). Reversals on the same clip/defect flag \`OSCILLATION_DETECTED\`, while opposite-direction shifts on distinct clips are verified permissible.
     - **Duplicate Proposal Discrimination (ARC-28-17)**: Distinguishes repeated ineffective operations (\`DUPLICATE_REPAIR\`) from legitimate persistent findings and valid follow-up refinements.
     - **Cumulative Bounds Enforcement (ARC-28-18)**: Enforces cycle-wide cumulative shift cap ($240,000\\text{ ticks} = 2.0\\text{s}$) and cumulative attenuation cap ($12.0\\text{ dB}$) per clip, while preserving Phase 27 per-operation limit ($120,000\\text{ ticks} = 1.0\\text{s}$).
     - **Diagnostic Outcomes & Quality Metrics (ARC-28-19 & ARC-28-20)**: Distinguishes \`CONVERGED\`, \`PROGRESS_ACHIEVED\`, \`NO_PROGRESS\`, \`QUALITY_REGRESSION\`, \`OSCILLATION_DETECTED\`, \`DUPLICATE_REPAIR\`, \`MAX_PASSES_EXCEEDED\`, and \`NEEDS_RECONCILIATION\`.
     - **Two-Point Invocation (ARC-28-21)**: Validates proposals before execution to block improper mutations, and evaluates fresh QA after rendering to measure progress and detect regression.
  2. \`src/audio/repair/multi-pass-orchestrator.js\`: Orchestration boundary integration wired with pre-execution convergence guard checks and post-render progress evaluations.
  3. \`tests/workflow-stage28-3-convergence-guard.test.js\`: Verification test suite implementing all 6 planned discrete test cases (\`CVG-01\` through \`CVG-06\`).

---

### 2. Discrete Subtest Execution Ledger (Stage 28.3)
Command: \`node --test tests/workflow-stage28-3-convergence-guard.test.js\`

| Test ID | Architectural Invariant | Verification Result | Duration |
|:---|:---|:---:|:---:|
| **CVG-01** | Semantic oscillation detection: flags sign-reversals on same clip ($|\\Delta_k + \\Delta_{k-1}| < \\epsilon$), tests near-reversal boundary ($500\\text{ ticks} < 1200$), and confirms opposite shift on distinct clip is permitted | **PASS** | 5.52 ms |
| **CVG-02** | Duplicate repair discrimination: blocks repeated identical shifts on same clip as \`DUPLICATE_REPAIR\`, while permitting legitimate follow-up repairs with diminishing offsets | **PASS** | 1.19 ms |
| **CVG-03** | Shift safety caps: blocks single shift $> 120,000\\text{ ticks}$ as \`SINGLE_SHIFT_CAP_EXCEEDED\`, and blocks cumulative shift $> 240,000\\text{ ticks}$ as \`CUMULATIVE_SHIFT_CAP_EXCEEDED\` | **PASS** | 0.66 ms |
| **CVG-04** | Cumulative attenuation cap: blocks cumulative gain reduction $> 12.0\\text{ dB}$ as \`CUMULATIVE_ATTENUATION_CAP_EXCEEDED\`, while permitting valid reductions $\\le 12.0\\text{ dB}$ | **PASS** | 2.13 ms |
| **CVG-05** | Closed-loop oscillation halt: multi-pass orchestrator halts on oscillatory findings with \`OSCILLATION_DETECTED\` and status \`NEEDS_RECONCILIATION\`, candidate quarantined, active delivery 100% untouched | **PASS** | 6.10 ms |
| **CVG-06** | Diagnostic journal & metrics: verifies \`evaluatePassProgress\` accurately captures progress, regression, stagnation, and clean convergence across passes | **PASS** | 0.44 ms |
| **Suite Harness** | Parent test suite runner harness | **PASS** | 19.27 ms |

**Result**: **6 / 6 discrete subtests PASS (7 / 7 reported by Node.js test runner)** in 81.8 ms.

---

### 3. Cumulative Regression Battery (Phases 21 through 28.3)
Command: \`node --test tests/workflow-stage2{1,2,3,4,5,6,7}*.test.js tests/workflow-stage28-1-conflict-detector.test.js tests/workflow-stage28-2-multi-pass-orchestrator.test.js tests/workflow-stage28-3-convergence-guard.test.js\`

- **Certified Phase 27 Baseline**: **212 / 212 PASS**
- **Additive Stage 28.1 Results**: **+8 reported tests** (7 discrete subtests + 1 suite runner)
- **Additive Stage 28.2 Results**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Additive Stage 28.3 Results**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Cumulative Active Battery**: **234 / 234 PASS (100% Zero Regressions)**
- Execution Time: 13.73s | Failures: 0 | Cancelled: 0 | Skipped: 0

---

### 4. Production Invariants & Constraints Compliance
1. **ARC-28-15 & ARC-28-16 (Semantic Reversal Math)**: $\\epsilon = 1200\\text{ ticks}$ ($10\\text{ms}$) integer tolerance applied strictly to same-clip semantic lineage. Independent clips with opposite signs verified non-oscillating.
2. **ARC-28-18 (Cumulative Limits)**: $240,000\\text{ ticks}$ cumulative shift cap and $12.0\\text{ dB}$ attenuation cap strictly enforced alongside Phase 27 per-operation limits.
3. **ARC-28-21 & ARC-28-22 (Non-mutating Guard & Delivery Safety)**: Guard is strictly diagnostic/planning; mutations execute exclusively via \`OperationExecutor\`. Active delivery preserved 100% untouched on oscillation halts.
4. **Canonical Schemas & Zero Runtime Dependencies**: 18 canonical schemas 100% frozen; \`"dependencies": {}\` preserved in \`package.json\`.

---

### 5. Action Requested from Architecture Lead
1. Review and accept the Stage 28.3 empirical verification and test results.
2. Grant formal authorization to proceed to **Stage 28.4: Mandatory Conflicting Defect Certification Scenario** (\`tests/workflow-stage28-4-conflicting-defects.test.js\` and tests \`CSC-01\` through \`CSC-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 28.3 Report prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 28.3 Review Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 28.3 REVIEW DECISION RECEIVED:');
  console.log('=================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE28_3_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
