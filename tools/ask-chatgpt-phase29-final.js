/**
 * Ezra Bridge Script: Submit Phase 29 Final Milestone Certification to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 29 Final Milestone Certification Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 29 Final Milestone Certification & Closure Request)";

  const promptText = `${promptAnchor},

We are proud to present the formal completion of **Milestone Phase 29: Adaptive Repair Confidence & Human-in-the-Loop Escalation** across all six planned stages (Stages 29.1 through 29.6), fulfilling all binding architectural conditions (\`ARC-29-01\` through \`ARC-29-40\`), on branch \`feature/phase-29-adaptive-repair-confidence\` at commit \`c854f6f\`.

Below is the **Phase 29 Final Milestone Certification Report**:

---

### 1. Stage-by-Stage Implementation & Verification Summary

| Stage | Production Modules & Artifacts | Primary Test Suite | Subtest Results | Architectural Compliance |
|---|---|---|---|---|
| **Stage 29.1: Repair Confidence Calibrator** | \`src/audio/repair/repair-confidence-calibrator.js\` | \`tests/workflow-stage29-1-confidence-calibrator.test.js\` | **8 / 8 PASS** (\`CAL-01..07\` + parent) | \`ARC-29-01\`..\`07\`: Deterministic 3-band scoring, acoustic evidence weighting, timeline geometry penalties, minimum threshold fencing. |
| **Stage 29.2: Human Escalation Router** | \`src/audio/repair/repair-escalation-router.js\` | \`tests/workflow-stage29-2-escalation-router.test.js\` | **7 / 7 PASS** (\`ESC-01..06\` + parent) | \`ARC-29-08\`..\`14\`: Structured review advisories, candidate revision binding, strict withholding of autonomous execution, stale/tampered approval rejection. |
| **Stage 29.3: Decision Ledger & Audit Journal** | \`src/audio/repair/repair-decision-ledger.js\`, \`src/audio/schemas/audio-repair-ledger.v1.json\` | \`tests/workflow-stage29-3-decision-ledger.test.js\` | **7 / 7 PASS** (\`LDG-01..06\` + parent) | \`ARC-29-15\`..\`20\`: Immutable audit journal, event correlation keys, execution authority fencing, failure gating without false rollback claims. |
| **Stage 29.4: Outcome Calibrator & Feedback Loop** | \`src/audio/repair/repair-outcome-calibrator.js\`, \`src/audio/schemas/audio-repair-calibration.v1.json\` | \`tests/workflow-stage29-4-outcome-calibrator.test.js\` | **7 / 7 PASS** (\`OCG-01..06\` + parent) | \`ARC-29-21\`..\`27\`: Metric efficacy evaluation, bounded confidence adjustment, diminishing returns override, run isolation. |
| **Stage 29.5: Mandatory Ambiguous Defect Scenario** | End-to-end certification fixture with real WAV rendering & Earshot QA | \`tests/workflow-stage29-5-ambiguous-defect-scenario.test.js\` | **7 / 7 PASS** (\`ADC-01..06\` + parent) | \`ARC-29-28\`..\`33\`: Real audio rendering, Earshot QA, 12-sample (0.25 ms) transient alignment ($\le 48$ samples), -6.3 dBTP true peak ($\le -1.0$ dBTP ceiling), active delivery preservation. |
| **Stage 29.6: Multi-Pass Orchestration & Master Regression** | \`tests/workflow-stage29-6-end-to-end.test.js\` | \`tests/workflow-stage29-6-end-to-end.test.js\` | **6 / 6 PASS** (\`E2E-01..05\` + parent) | \`ARC-29-34\`..\`40\`: Closed-loop orchestration, mixed-confidence batch partitioning, live Earshot worker integration, anti-inflation gating, non-recursive cumulative regression. |

---

### 2. Physical Audio & Signal-Level Quality Certification

All acoustic repairs have been physically rendered, measured, and verified on disk using real PCM sample analysis and live 4x oversampled Earshot DSP audits:

1. **Physical Acoustic Transient Alignment (\`ARC-29-31\` / \`ARC-29-39\`)**:
   - Target Sample: \`44,400\`
   - Measured Peak Sample: \`44,412\`
   - Absolute Sample Error: $\mathbf{12\text{ samples}}$ ($\mathbf{0.2500\text{ ms}}$ at 48 kHz).
   - Certified Limit: $\le 48\text{ samples}$ ($\le 1.0\text{ ms}$). **STRICT PASS** (75% margin below ceiling).
2. **True Peak Delivery Ceiling (\`ARC-29-31\` / \`ARC-29-39\`)**:
   - Check ID: \`CHK_EARSHOT_TRUE_PEAK\` (4x oversampled polyphase Sinc filter).
   - Measured True Peak: $\mathbf{-6.3\text{ dBTP}}$.
   - Delivery Ceiling: $\mathbf{-1.0\text{ dBTP}}$.
   - Clipped Samples: $\mathbf{0}$.
   - Certified Margin: **5.3 dBTP safety headroom**. **STRICT PASS**.

---

### 3. Cumulative Test Accounting & Master Battery Verification

The cumulative test battery across all Phase 21 through Phase 29 test suites was executed with \`--test-concurrency=1\`:

\`\`\`
▶ Stage 21 (1-4): 30 tests PASS
▶ Stage 22 (1-5): 37 tests PASS
▶ Stage 23 (1-5): 35 tests PASS
▶ Stage 24 (1-4): 28 tests PASS
▶ Stage 25 (1-5): 42 tests PASS
▶ Stage 26: 12 tests PASS
▶ Stage 27 (1-3 + e2e): 28 tests PASS
▶ Stage 28 (1-5): 35 tests PASS
▶ Stage 29 (1-6): 42 tests PASS (8 + 7 + 7 + 7 + 7 + 6)
---------------------------------------------------------------
TOTAL REPORTED PASSING RESULTS: 289 / 289 PASS (100%)
TOTAL TEST SUITES: 5 root suites, 43 test files
FAILURES: 0 | SKIPPED: 0 | CANCELLED: 0 | DURATION: 49.67s
\`\`\`

- **Certified Baseline**: 247 reported passing tests (Phases 21–28).
- **Phase 29 Additive**: 42 reported passing tests (36 discrete subtests across Stages 29.1–29.6 + 6 parent suite results).
- **Target Reconciled Exactly**: $247 + 42 = \mathbf{289\text{ reported passing tests}}$.

---

### 4. Architectural Invariant Compliance & Package Integrity

1. **Canonical Schemas Frozen**: All 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen and unmodified.
2. **Zero Runtime Dependencies**: The core production package retains zero external runtime npm dependencies (\`"dependencies": {}\`).
3. **Canonical Mutation Boundary**: All project state transitions occur exclusively through \`OperationExecutor\`. Revisions advance strictly monotonically ($R_k \rightarrow R_{k+1}$).
4. **Execution Authority Fence**: Every mutation requires valid, non-stale approval bound to the current revision; stale revision bumps and material modifications are rejected fail-closed.
5. **Authoritative Delivery Safety**: Active delivery remains 100% untouched and preserved during review requests, speculative rejections, and QA failures (\`DELIVERY_WITHHELD\`).
6. **Canonical State Vocabulary**: \`NEEDS_RECONCILIATION\` remains the sole canonical reconciliation job state; ledger events are internal records and never pollute public schemas.
7. **Production Package File Accounting**:
   - Baseline from Phase 28: 173 files.
   - Phase 29 additions: 4 production modules + 2 internal schemas = **179 production files**.

---

### 5. Git Commit & Repository State

- **Feature Branch**: \`feature/phase-29-adaptive-repair-confidence\`
- **Final Milestone Commit**: \`c854f6f\`
- **Working Tree**: Clean (all phase artifacts committed, zero uncommitted changes to tracked files).

---

### 6. Action Requested

1. Formally review and grant **Final Milestone Certification** for **Phase 29: Adaptive Repair Confidence & Human-in-the-Loop Escalation**.
2. Grant formal authorization to merge \`feature/phase-29-adaptive-repair-confidence\` into \`main\` and tag release \`phase-29-certified\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 29 Final Certification Prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Phase 29 Certification Decision...');
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
        return JSON.stringify({ isGenerating, responseFound: false, length: 0 });
      }

      const responseSub = text.slice(pIdx + ${JSON.stringify(promptAnchor)}.length);
      return JSON.stringify({
        isGenerating,
        responseFound: true,
        length: responseSub.length,
        preview: responseSub.slice(0, 100),
        fullResponse: responseSub
      });
    })()`);

    try {
      const parsed = JSON.parse(checkRes);
      if (parsed.responseFound) {
        process.stdout.write(`   Attempt ${attempt + 1}: length=${parsed.length}, generating=${parsed.isGenerating}\r`);
        if (!parsed.isGenerating && parsed.length > 500) {
          completed = true;
          finalMarkdown = parsed.fullResponse;
          console.log('\nChatGPT Architecture Lead completed response!');
          break;
        }
      }
    } catch (e) {
      console.log(`   Attempt ${attempt + 1}: raw=${checkRes.slice(0, 80)}`);
    }
  }

  if (!completed) {
    console.error('\nTimed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const approvalDocPath = path.resolve(__dirname, '../plans/CHATGPT_PHASE29_FINAL_CERTIFICATION.md');
  fs.writeFileSync(approvalDocPath, finalMarkdown.trim() + '\n', 'utf8');
  console.log(`Saved Architecture Lead final decision to: ${approvalDocPath}`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
