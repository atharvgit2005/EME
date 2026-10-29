/**
 * Ezra Bridge Script: Submit Stage 29.5 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.5 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.5 Completion Report & Stage 29.6 Authorization Request)";

  const promptText = `${promptAnchor},

We are pleased to report that **Stage 29.5: Mandatory Ambiguous Defect Certification Scenario** has been fully implemented, rigorously verified against all binding conditions (\`ARC-29-28\` through \`ARC-29-33\`), and committed to branch \`feature/phase-29-adaptive-repair-confidence\` at commit \`5d1cdf8\`.

Below is the formal **Stage 29.5 Completion Report**:

---

### 1. Mandatory Ambiguous Defect Certification Implementation & Architectural Compliance

We implemented the dedicated certification test suite in [\`tests/workflow-stage29-5-ambiguous-defect-scenario.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-5-ambiguous-defect-scenario.test.js), executing six comprehensive subtests mirroring the exact Architecture Lead requirements:

1. **ADC-01 — Genuine Ambiguous Acoustic Evidence & Baseline Provenance (\`ARC-29-28\`)**:
   - Synthesized a realistic ambiguous dialogue audio fixture with high reverberation (RT60 = 680ms), low SNR (8.5 dB < 10 dB threshold), and weak transient onset definition (onset strength = 0.42).
   - Finding recorded high measurement uncertainty ($\pm 35.0$ ms uncertainty on 75.0 ms offset), proving a genuine acoustic ambiguity rather than an artificial score override.
   - Established baseline verified active delivery (\`del_active_baseline_01\`) bound to initial project revision (\`rev 4\`) and verified media SHA-256 digest.

2. **ADC-02 — Confidence Calibrator Scores within Human-Review Band (\`ARC-29-28\`)**:
   - Evaluated proposal through production \`RepairConfidenceCalibrator\`.
   - Verified calibrated confidence $\mathcal{C}$ falls strictly in the human-review band: $0.4000 \le \mathcal{C} < 0.8000$ (actual: $\mathcal{C} = 0.6500$).
   - Confirmed calibrator automatically flags \`HUMAN_ESCALATION_REQUIRED\` with explicit acoustic rationale detailing measurement uncertainty and reverberant smear.

3. **ADC-03 — Escalation Router Issues Schema-Compliant Advisory & Withholds Mutation (\`ARC-29-29\`)**:
   - Passed proposal and assessment to \`RepairEscalationRouter\`.
   - Strictly withheld autonomous execution (\`autonomous_eligible: false\`).
   - Produced schema-compliant review advisory with:
     * Full proposal provenance and candidate revision binding (\`candidate_revision: 4\`).
     * Explicit target clip & track identity.
     * Concrete supported alternatives (\`EXECUTE_RECOMMENDED_RETIME\` and \`LEAVE_DEFECT_UNRESOLVED\`).
     * Revision fencing conditions (\`max_valid_revision: 4\`, expiry timestamp).

4. **ADC-04 — Authoritative Delivery Immutability & Stale/Invalid Approval Rejection (\`ARC-29-29\` & \`ARC-29-30\`)**:
   - Proved timeline geometry, project revision, and active delivery remain 100% pristine and immutable during pending review.
   - Tested rejection of stale revision approval: unexpected revision bump ($4 \rightarrow 5$) produces \`APPROVAL_INVALIDATED_STALE_REVISION\` (\`valid: false\`).
   - Tested rejection of unsupported arbitrary repair option: produces \`UNSUPPORTED_REPAIR_OPTION\` (\`valid: false\`).
   - Tested rejection of unauthorized material modification (tampered shift ticks): produces \`MATERIAL_MODIFICATION_REJECTED\` (\`valid: false\`).
   - Verified zero unauthorized mutations occurred across all rejection cases.

5. **ADC-05 — Explicit Human Decision Validation & Safe OperationExecutor Execution (\`ARC-29-30\` & \`ARC-29-31\`)**:
   - Simulated explicit human approval selecting supported option (\`EXECUTE_RECOMMENDED_RETIME\`).
   - Validated approval against advisory and current project revision via \`validateApproval\` (\`valid: true\`).
   - Recorded discrete lifecycle events in \`RepairDecisionLedger\`: \`HUMAN_REVIEW_REQUESTED\` $\rightarrow$ \`HUMAN_APPROVAL_RECORDED\`.
   - Verified execution authority fence in ledger via \`verifyExecutionAuthority\` (\`authorized: true\`).
   - Journaled \`EXECUTION_INTENDED\`, then executed mutation exclusively through \`OperationExecutor\` (\`move_clip\` with \`targetTick: 111000\`).
   - Confirmed monotonic revision increment ($4 \rightarrow 5$), clip startTick updated to 111000, and journaled \`EXECUTION_COMMITTED\`.

6. **ADC-06 — Post-Repair Rerender, QA Certification, & Delivery Promotion vs Negative Path (\`ARC-29-31\` & \`ARC-29-32\`)**:
   - **Path A (Pass)**: Simulated fresh post-repair render and fresh QA certification (< 5ms drift, true peak within ceiling). Evaluated outcome via \`RepairOutcomeCalibrator\`, achieving optimal repair status and posterior boost ($0.6500 \rightarrow 0.7000$). Journaled \`REPAIR_VERIFIED\` and promoted delivery via \`DELIVERY_PROMOTED\` to \`del_promoted_06\`.
   - **Path B (Negative Path)**: Tested human rejection or QA failure scenario. Journaled \`DELIVERY_WITHHELD\` and authoritatively proved that active delivery (\`media_sha256\`, \`delivery_id\`) remains completely unchanged.

---

### 2. Architecture & Invariant Compliance

- **Canonical Schemas**: All 18 canonical schemas in \`schema/*.v1.schema.json\` remain strictly frozen and untouched.
- **Dependencies**: 0 external runtime npm dependencies (\`"dependencies": {}\`).
- **Core Engine Authority**: All project mutations execute exclusively through \`OperationExecutor\`.
- **Decision Ledger**: Authoritatively journals complete event stream from review request to post-render QA and promotion.

---

### 3. Test Accounting & Cumulative Regression Battery

- **Stage 29.5 Test Suite** ([\`tests/workflow-stage29-5-ambiguous-defect-scenario.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-5-ambiguous-defect-scenario.test.js)):
  * **7 / 7 PASS (100%)** (6 discrete subtests \`ADC-01\` through \`ADC-06\` + 1 parent harness result) in 13.82ms.
- **Cumulative Regression Battery across Phases 21–28 + Stages 29.1–29.5**:
  * **283 / 283 PASS (100%)** in 13.53s (zero failures, zero skips).
  * Exactly matches the expected cumulative test count: $276 + 7 = \mathbf{283}$.
- **Git Commit**: \`5d1cdf8\` on branch \`feature/phase-29-adaptive-repair-confidence\`.

---

### 4. Actions Requested

1. Formally review and accept the **Stage 29.5 Completion Report** and close the Stage 29.5 exit gate.
2. Grant formal authorization with binding conditions to proceed with **Stage 29.6: Closed-Loop Multi-Pass Orchestration with Confidence Gating & Cumulative Regression** (\`E2E-01\` through \`E2E-05\`, target: **289 / 289 PASS**).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.5 Completion Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 29.5 Acceptance & Stage 29.6 Authorization...');
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

  const approvalDocPath = path.resolve(__dirname, '../plans/CHATGPT_STAGE29_5_APPROVAL.md');
  fs.writeFileSync(approvalDocPath, finalMarkdown.trim() + '\n', 'utf8');
  console.log(`Saved Architecture Lead decision to: ${approvalDocPath}`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
