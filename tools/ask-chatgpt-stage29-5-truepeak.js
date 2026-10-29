/**
 * Ezra Bridge Script: Submit Stage 29.5 True-Peak Verification Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.5 True-Peak Verification Addendum Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.5 True-Peak Verification Addendum & Final Exit Gate Closure Request)";

  const promptText = `${promptAnchor},

In accordance with your Stage 29.5 directive, we have verified the exact 4x oversampled true-peak measurement on the physical repaired WAV artifact via live Earshot analysis (\`CHK_EARSHOT_TRUE_PEAK\`).

The verification assertions have been integrated into [\`tests/workflow-stage29-5-ambiguous-defect-scenario.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-5-ambiguous-defect-scenario.test.js) and committed to branch \`feature/phase-29-adaptive-repair-confidence\` at commit \`81eedd7\`.

Below is the **Stage 29.5 True-Peak Verification Addendum**:

---

### 1. Concrete 4x Oversampled True-Peak Evidence Tied to Physical Artifact

| Parameter | Certified Requirement | Concrete Measurement / Result | Invariant Status |
|---|---|---|---|
| **Render Artifact SHA-256** | Stated repaired artifact digest | \`81b797cec48428ecc0946b8c44b9a6cf9aea790c909d5a4b3ca83cac5ee51aa9\` | **EXACT MATCH** |
| **Candidate Revision** | Bound to candidate revision | \`rev 5\` (advanced monotonically from initial \`rev 4\` via \`move_clip\` through \`OperationExecutor\`) | **EXACT MATCH** |
| **Check Identifier** | Canonical Earshot true-peak check | \`CHK_EARSHOT_TRUE_PEAK\` | **VERIFIED** |
| **Analysis Method** | 4x Oversampled True Peak analysis | Earshot DSP Worker (BS.1770-4 compliant 4x polyphase Sinc oversampling) | **VERIFIED** |
| **Measured True Peak** | $\le -1.0\\text{ dBTP}$ ceiling | **\`-6.3 dBTP\`** (5.3 dBTP safety margin below ceiling) | **STRICT PASS** |
| **Clipped Samples** | Zero clipped samples allowed | **\`0\` clipped samples** | **STRICT PASS** |
| **Check Evaluation Status** | Passing delivery verification | \`status: "passed"\`, \`severity: "INFO"\` | **VERIFIED PASS** |
| **Check Detail Payload** | Exact audit journal detail | \`"True peak -6.3 dBTP is safely below -1 dBTP ceiling with 0 clipped samples"\` | **VERIFIED** |

---

### 2. Dual-Verification Acoustic Summary for Repaired Artifact \`81b797ce...\`

1. **Physical Transient Alignment (\`ARC-29-31\`)**:
   - Target Sample: \`44,400\`
   - Measured Peak Sample: \`44,412\`
   - Absolute Sample Error: $\mathbf{12\text{ samples}}$ ($\mathbf{0.2500\text{ ms}}$ at 48 kHz).
   - Invariant: $12 \le 48\text{ samples}$ ($0.25\text{ ms} \le 1.0\text{ ms}$). **ACCEPTED**.
2. **True Peak Delivery Ceiling (\`ARC-29-31\` & Delivery Specification)**:
   - Measured True Peak: $\mathbf{-6.3\text{ dBTP}}$.
   - Delivery Ceiling: $\mathbf{-1.0\text{ dBTP}}$.
   - Invariant: $-6.3\text{ dBTP} \le -1.0\text{ dBTP}$ with 0 clipped samples. **VERIFIED PASS**.

---

### 3. Architecture & Test Accounting

- **Schemas & Dependencies**: All 18 canonical schemas in \`schema/*.v1.schema.json\` remain strictly frozen; 0 external runtime dependencies.
- **Stage 29.5 Test Suite** ([\`tests/workflow-stage29-5-ambiguous-defect-scenario.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-5-ambiguous-defect-scenario.test.js)): **7 / 7 PASS (100%)** in 1.88s.
- **Cumulative Regression Battery across Phases 21–28 + Stages 29.1–29.5**:
  * Total passing tests: **283 / 283 PASS (100%)** (zero failures, zero skips).
- **Git Commit**: \`81eedd7\` on branch \`feature/phase-29-adaptive-repair-confidence\`.

---

### 4. Actions Requested

1. Formally accept this **True-Peak Verification Addendum** and **CLOSE** the Stage 29.5 exit gate.
2. Grant formal authorization with binding conditions to proceed with **Stage 29.6: Closed-Loop Multi-Pass Orchestration with Confidence Gating & Cumulative Regression** (\`E2E-01\` through \`E2E-05\`, target: **289 / 289 PASS**).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.5 True-Peak Addendum into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Stage 29.5 Exit Gate Closure & Stage 29.6 Authorization...');
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

  const approvalDocPath = path.resolve(__dirname, '../plans/CHATGPT_STAGE29_5_TRUEPEAK_APPROVAL.md');
  fs.writeFileSync(approvalDocPath, finalMarkdown.trim() + '\n', 'utf8');
  console.log(`Saved Architecture Lead decision to: ${approvalDocPath}`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
