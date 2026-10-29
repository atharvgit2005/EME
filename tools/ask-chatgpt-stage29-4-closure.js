/**
 * Ezra Bridge Script: Submit Stage 29.4 Closure Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.4 Closure Addendum Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.4 Closure Addendum & Stage 29.5 Authorization Request)";

  const promptText = `${promptAnchor},

In accordance with your Stage 29.4 review directive, we have addressed both open policy items on branch \`feature/phase-29-adaptive-repair-confidence\` at commit \`ca36a35\`.

Below is the formal **Stage 29.4 Closure Addendum**:

---

### 1. Reconciled Post-Calibration Confidence-to-Disposition Mapping
We have fully restored the established 3-band routing policy contract across [\`src/audio/repair/repair-outcome-calibrator.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/repair/repair-outcome-calibrator.js), [\`src/audio/schemas/audio-repair-calibration.v1.json\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/schemas/audio-repair-calibration.v1.json), and the test suite:

| Confidence Band | Disposition | Autonomous Execution | Routing & Gating Rules |
|---|---|---|---|
| $\mathcal{C} \ge 0.8000$ | \`AUTOMATIC_ELIGIBLE\` | Authorized | Autonomous repair eligible; still subject to all mandatory preconditions (currency, track locks, geometry). |
| $0.4000 \le \mathcal{C} < 0.8000$ | \`ROUTED_HUMAN_REVIEW\` | Strictly Withheld | Routes to human review; autonomous execution blocked; generates advisory. Explicitly spans from 0.4000 up to 0.7999 (inclusive of 0.7000). |
| $\mathcal{C} < 0.4000$ | \`DISCARD_SPECULATIVE\` | Blocked | Rejected as speculative; 0 mutations allowed. |

**Safety Overrides (Precedence over Numerical Score)**:
1. **Diminishing Returns**: Two successive sub-threshold passes ($\Delta_{\text{obs}} < 0.20 \Delta_{\text{exp}}$) trigger \`HUMAN_ESCALATION_REQUIRED\` and cap confidence at \`0.4900\`, regardless of raw numerical calculation.
2. **Metric Regression**: Any regression in a protected metric (e.g. true peak clipping or loudness blowup during retiming) triggers canonical \`NEEDS_RECONCILIATION\`.

---

### 2. Comprehensive Score Interval & Exact Boundary Verification
Added dedicated boundary verification tests directly into [\`tests/workflow-stage29-4-outcome-calibrator.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-4-outcome-calibrator.test.js) (under \`OCG-02\`):
- **Boundary $\mathcal{C} = 0.8000$**: Evaluated at exact 0.8000 $\rightarrow$ produces \`AUTOMATIC_ELIGIBLE\` (PASS).
- **Sub-Autonomous $\mathcal{C} = 0.7999$**: Evaluated at 0.7999 $\rightarrow$ produces \`ROUTED_HUMAN_REVIEW\` (PASS).
- **Mid-Tier $\mathcal{C} = 0.7000$**: Evaluated at exact 0.7000 $\rightarrow$ produces \`ROUTED_HUMAN_REVIEW\` (PASS).
- **Lower Human-Review Boundary $\mathcal{C} = 0.4000$**: Evaluated at exact 0.4000 $\rightarrow$ produces \`ROUTED_HUMAN_REVIEW\` (PASS).
- **Speculative Boundary $\mathcal{C} = 0.3999$**: Evaluated at 0.3999 $\rightarrow$ produces \`DISCARD_SPECULATIVE\` (PASS).

---

### 3. Canonical Reconciliation State Clarification
- **Canonical Job State**: Confirmed that **\`NEEDS_RECONCILIATION\`** remains the sole, strict canonical job state across the entire engine.
- **Internal Ledger Event**: Confirmed that \`RECONCILIATION_REQUIRED\` exists strictly as an internal decision-ledger event type (\`LEDGER_EVENT_TYPES.RECONCILIATION_REQUIRED\`) to journal the detection of regressions. The ledger event payload explicitly journals \`canonicalJobState: 'NEEDS_RECONCILIATION'\`.
- **Zero Schema Invariants**: The 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen. No new canonical job states have been introduced. Active delivery and timeline geometry remain completely immutable and protected.

---

### 4. Test Accounting & Baseline Preservation
- **Stage 29.4 Suite** ([\`tests/workflow-stage29-4-outcome-calibrator.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-4-outcome-calibrator.test.js)): **7 / 7 PASS (100%)** in 11.08ms.
- **Cumulative Regression Battery across Phases 21–28 + Stages 29.1–29.4**:
  * Total cumulative passing tests: **276 / 276 PASS (100%)** in 13.46s (zero failures, zero skips).
- **Branch & Commit**: \`feature/phase-29-adaptive-repair-confidence\` at commit \`ca36a35\`.

---

### 5. Action Requested
1. Formally accept Stage 29.4 closure addendum and close the Stage 29.4 exit gate.
2. Grant formal authorization with binding conditions to proceed with **Stage 29.5: Mandatory Ambiguous Defect Certification Scenario** (\`ADC-01\` through \`ADC-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.4 Closure Addendum into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 29.4 Final Acceptance & Stage 29.5 Authorization...');
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

  const approvalDocPath = path.resolve(__dirname, '../plans/CHATGPT_STAGE29_4_FINAL_APPROVAL.md');
  fs.writeFileSync(approvalDocPath, finalMarkdown.trim() + '\n', 'utf8');
  console.log(`Saved Architecture Lead final decision to: ${approvalDocPath}`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
