/**
 * Ezra Bridge Script: Submit Stage 31.5 Targeted Reconciliation Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 31.5 Targeted Reconciliation Addendum Submission Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 31.5 Targeted Reconciliation Addendum — Findings A, B, and C Closure)";

  const promptText = `${promptAnchor},

Under your formal review directive in \`plans/CHATGPT_STAGE31_5_APPROVAL.md\` withholding Stage 31.5 acceptance pending three targeted reconciliations, the engineering team has executed the full reconciliation package across our statistical evaluation engine, deliverables, and regression test suites.

We submit below the complete Stage 31.5 Reconciliation Addendum on branch \`feature/phase-31-real-project-validation\` at commit \`92214a3\`.

---

### 1. Finding A Resolution: Defect Detection Denominator & Stratified Evaluation Gates

In strict accordance with your ruling, defect detection precision and recall have been recomputed exclusively over the frozen **26 scored defect cases** ($N = 26$) across all 11 defect classes. The clean controls, ambiguous cases, and unsupported-feature cases are preserved in their dedicated protocol evaluation gates, and overall action-routing compliance is reported independently over the full 36-case corpus.

#### A. Scored Defect Detection Performance ($N = 26$ Scored Defect Cases)
- **Defect Population**: Exactly 26 scored defect cases across 11 defect classes (TS-GAP: 3, TS-OVERLAP: 3, SYNC-OFFSET: 3, LVL-CLIPPING: 3, CONT-DISCONTINUITY: 2, TRN-INVALID: 2, SDC-STALE: 2, STR-BROKEN_REF: 2, STR-FPS-MISMATCH: 2, STR-ASPECT-MISMATCH: 2, STR-SPEED-RAMP: 2).
- **Confusion Matrix Counts**:
  - **True Positives (TP)**: 26
  - **False Positives (FP)**: 0
  - **False Negatives (FN)**: 0
- **Precision**: $\\frac{\\text{TP}}{\\text{TP} + \\text{FP}} = \\frac{26}{26 + 0} = 100.0\\%$
  - **Wilson 95% Confidence Interval**: **[87.1%, 100.0%]** (Threshold: $\\ge 90.0\\%$, **PASS**)
- **Recall**: $\\frac{\\text{TP}}{\\text{TP} + \\text{FN}} = \\frac{26}{26 + 0} = 100.0\\%$
  - **Wilson 95% Confidence Interval**: **[87.1%, 100.0%]** (Threshold: $\\ge 85.0\\%$, **PASS**)

#### B. Dedicated Independent Evaluation Gates
1. **Clean Control False Alarm Gate ($N = 6$ Clean Controls)**:
   - **True Negatives (TN)**: 6
   - **False Positives (FP)**: 0
   - **False Positive Rate (FPR)**: $\\frac{0}{6} = 0.0\\%$ (Wilson 95% CI: **[0.0%, 39.0%]**)
   - **Protocol Threshold**: $\\le 5.0\\%$ (**PASS**; strictly 0 false positive detections across all 6 clean controls)
   - **Action Routing**: 6/6 (100.0%) correctly routed to \`ABSTAIN_NO_REPAIR\` with zero mutations.
2. **Ambiguous Intent Escalation Gate ($N = 2$ Ambiguous Cases)**:
   - **Escalated to Human Review**: 2 / 2 (100.0%)
   - **Autonomous Mutations**: 0
   - **Escalation Fidelity**: $\\frac{2}{2} = 100.0\\%$ (Wilson 95% CI: **[34.2%, 100.0%]**)
   - **Protocol Threshold**: $\\ge 95.0\\%$ (**PASS**; strictly zero autonomous mutations or edits).
3. **Unsupported Feature Fail-Closed Gate ($N = 2$ Unsupported Cases)**:
   - **Rejected Fail-Closed**: 2 / 2 (100.0%)
   - **Autonomous Executions**: 0
   - **Unsupported Rejection Rate**: $\\frac{2}{2} = 100.0\\%$ (Wilson 95% CI: **[34.2%, 100.0%]**)
   - **Protocol Threshold**: $\\ge 95.0\\%$ (**PASS**; strictly zero autonomous executions).

#### C. Independent Macro Action Routing Compliance ($N = 36$ Corpus Cases)
- **Total Cases**: 36 fixtures across 6 source projects
- **Compliant Routings**: 36 / 36
- **Compliance Rate**: $100.0\\%$ (Wilson 95% CI: **[90.4%, 100.0%]**, Protocol Threshold: $100.0\\%$, **PASS**).

---

### 2. Finding B Resolution: Continuous Localization Statistics & Denominator Reconciliation

We have reconciled the localization denominator against Protocol v1.5.0, distinguished continuous IoU statistics from binary exact localization rates, and documented the explicit eligibility rationale for candidate repairs.

#### A. Scored Defect Localization ($N = 26$ Scored Defect Cases — Primary Metric)
Includes all 26 scored defect cases across all 11 classes, specifically incorporating \`STR-BROKEN_REF\` (2 cases; localized missing clip segment interval on timeline) and \`STR-FPS-MISMATCH\` (2 cases; localized sequence-level timeline frame-rate disparity interval):
- **Continuous IoU Distribution ($N = 26$)**:
  - **Count**: 26
  - **Mean IoU**: **1.0000**
  - **Min IoU**: **1.0000**
  - **Max IoU**: **1.0000**
  - **Standard Deviation**: **0.0000**
  - **Protocol Threshold**: Mean IoU $\\ge 0.8000$ (**PASS**)
- **Binary Exact Localization Rate**:
  - **Exact Localizations (IoU $\\ge 0.95$)**: 26 / 26
  - **Point Estimate**: $100.0\\%$
  - **Wilson 95% Confidence Interval**: **[87.1%, 100.0%]**

#### B. Candidate Repair Localization ($N = 22$ Eligible Cases — Secondary Metric)
- **Eligibility Rationale**: Restricted to the 22 defect cases where autonomous repair operations were planned/executed. Excludes the 4 non-repairable defect cases:
  1. \`STR-BROKEN_REF\` (2 cases): Mandatory fail-closed rejection without repair; autonomous asset substitution or synthetic file creation is strictly prohibited.
  2. \`STR-FPS-MISMATCH\` (2 cases): Mandatory cadence warning without autonomous retiming; retiming is non-trivial and requires explicit human editorial preference.
- **Continuous IoU Distribution ($N = 22$)**:
  - **Count**: 22
  - **Mean IoU**: **1.0000**, Min: **1.0000**, Max: **1.0000**, Std Dev: **0.0000**
- **Binary Exact Localization Rate**:
  - **Exact Localizations**: 22 / 22 = $100.0\\%$ (Wilson 95% CI: **[85.1%, 100.0%]**)
- **Downstream Repair & Acoustic Performance ($N = 22$)**:
  - **Eligible Repair Proposal Validity**: 22 / 22 = $100.0\\%$ (Wilson 95% CI: **[85.1%, 100.0%]**)
  - **Canonical Operation Execution**: 24 operations planned, 24 operations committed via \`OperationExecutor\` = $100.0\\%$ (0 errors, 0 rollback events)
  - **Fresh Earshot QA Pass Rate**: 14 / 14 audio repairs passed fresh Earshot QA = $100.0\\%$ (Wilson 95% CI: **[78.5%, 100.0%]**, True Peak $\\le -1.0\\text{ dBTP}$, 0 clipped samples, 0 clicks/pops, residual sync drift $\\le 33.33\\text{ms}$)
  - **Prohibited Collateral Damage**: 0 diffs across all unaffected tracks in all 22 candidates (**Exact Zero**)
  - **Active Delivery Safety**: \`session.active_delivery\` preserved untouched across all runs (**Exact Zero Mutations**).

---

### 3. Finding C Resolution: Cumulative Regression Lineage Reconciliation (401 Tests across 16 Suites)

We have resolved the test-case versus assertion count distinction and established complete historical lineage from the accepted Stage 31.4 baseline to Stage 31.5.

#### A. Test Cases vs. Assertions Disambiguation
- **Authoritative Unit of Measure**: The certified regression metric across all project milestones is the executable **test case** (\`test(...)\` blocks).
- **Disambiguation of Initial 388 Figure**: The 388 figure mentioned in the preliminary Stage 31.5 report represented internal assertion calls (\`assert.*\\) across a selective 13-file subset. Across the entire 16-suite cumulative battery, there are **>900 discrete assertions**. Test cases and assertions are not interchangeable.
- **Lineage Integrity**: The accepted Stage 31.4 baseline of **386 passing test cases across 15 suites** is fully intact with zero regressions. The 15 Stage 31.5 test cases are strictly additive, yielding exactly **401 passing test cases across 16 suites**.

#### B. Cumulative Regression Lineage Reconciliation Table

| Suite ID | Phase / Stage | Test Suite Name | File Pattern | Test Cases | Status | Verification Grounding |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SUITE-P21-01** | Phase 21 | Production SLOs & Security Hardening | tests/workflow-stage21-*.test.js | 4 | **PASS** | Production SLO Harness |
| **SUITE-P22-01** | Phase 22 | Workload SLOs & Adversarial Security | tests/workflow-stage22-*.test.js | 4 | **PASS** | Adversarial Security Harness |
| **SUITE-P23-01** | Phase 23 | Production Monitoring & Incident Remediation | tests/workflow-stage23-*.test.js | 4 | **PASS** | Incident Remediation Harness |
| **SUITE-P24-01** | Phase 24 | Budget Analytics & Governance Ledger | tests/workflow-stage24-*.test.js | 4 | **PASS** | Governance Ledger Harness |
| **SUITE-P25_29-01** | Phases 25–29 | Perception, Sound Kit, Closed-Loop Repair, Multi-Pass & Decision Ledger | tests/workflow-stage25..29-*.test.js | 273 | **PASS** | Integrated Acoustic & Decision Ledger |
| — | **Phases 21–29 Subtotal** | **Predecessor Baseline** | — | **289** | **PASS** | **Predecessor Frozen Baseline** |
| **SUITE-P30-01** | Stage 30.1 | Failure Model & Taxonomy Verification | tests/workflow-stage30-1-failure-model.test.js | 7 | **PASS** | Direct Unit Test |
| **SUITE-P30-02** | Stage 30.2 | Crash Recovery & Journal Rollback (Unit) | tests/workflow-stage30-2-crash-recovery.test.js | 9 | **PASS** | Journal Rollback Unit Test |
| **SUITE-P30-03** | Stage 30.2 | Real-Process Crash Simulation | tests/workflow-stage30-2-real-process-crash.test.js | 4 | **PASS** | Real Process Crash Simulation |
| **SUITE-P30-04** | Stage 30.3 | Concurrency Fencing & Monotonic Token Guard | tests/workflow-stage30-3-concurrency-fencing.test.js | 8 | **PASS** | Concurrency Fencing Simulation |
| **SUITE-P30-05** | Stage 30.4 | Artifact Integrity & Active-Delivery Withholding | tests/workflow-stage30-4-artifact-integrity.test.js | 12 | **PASS** | Cryptographic Delivery Withholding |
| **SUITE-P30-06** | Stage 30.5 | Deterministic Recovery Evidence & Cross-Stage Replay | tests/workflow-stage30-5-recovery-evidence.test.js | 9 | **PASS** | Deterministic Replay Harness |
| — | **Phase 30 Subtotal** | **Certified Release (Commit 4075748)** | — | **49** | **PASS** | **Phase 30 Certified (6 suites)** |
| — | **Phase 30 Release Total** | **Subtotal at Phase 30 Certification** | — | **338** | **PASS** | **Certified Release Tag: phase-30-certified (11 suites)** |
| **SUITE-P31-01** | Stage 31.1 | Benchmark Protocol & Specification Freeze | tests/workflow-stage31-1-protocol.test.js | 9 | **PASS** | Spec & Manifest Hashing |
| **SUITE-P31-02** | Stage 31.2 | Representative Corpus & Defect Taxonomy Qualification | tests/workflow-stage31-2-corpus.test.js | 13 | **PASS** | Live Disk Fixture Verification |
| **SUITE-P31-03** | Stage 31.3 | Non-Destructive Shadow Evaluation | tests/workflow-stage31-3-shadow-eval.test.js | 13 | **PASS** | Non-Destructive Shadow Analysis |
| **SUITE-P31-04** | Stage 31.4 | Candidate Repair, Render & Earshot QA Validation | tests/workflow-stage31-4-candidate-validation.test.js | 13 | **PASS** | Actual Offline Renders & Byte SHA256 |
| — | **Stage 31.4 Accepted Baseline** | **Cumulative Predecessor Battery Accepted by Architecture Lead** | — | **386** | **PASS** | **Accepted Stage 31.4 Baseline (15 suites)** |
| **SUITE-P31-05** | Stage 31.5 | Statistical Evaluation, Regression & Failure Analysis | tests/workflow-stage31-5-analysis.test.js | 15 | **PASS** | Stratified Wilson Score Statistics |
| **TOTAL** | — | **Cumulative Regression Battery (Phases 21–31)** | — | **401** | **PASS** | **16 Suites / 401 Passing Test Cases (100%)** |

#### C. Reproducible Verification Execution
Run with \`--test-concurrency=1\` to prevent port collision on Stage 23 production monitor HTTP servers:
\`\`\`bash
node --test-concurrency=1 --test tests/workflow-stage21-*.test.js tests/workflow-stage22-*.test.js tests/workflow-stage23-*.test.js tests/workflow-stage24-*.test.js tests/workflow-stage25-*.test.js tests/workflow-stage26-*.test.js tests/workflow-stage27-*.test.js tests/workflow-stage28-*.test.js tests/workflow-stage29-*.test.js tests/workflow-stage30-*.test.js tests/workflow-stage31-*.test.js
\`\`\`
**Console Output Verified**:
\`\`\`text
ℹ tests 401
ℹ suites 16
ℹ pass 401
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44282.499416
\`\`\`

---

### 4. Stage 31.5 Deliverable Artifacts Updated

All 10 deliverables in \`artifacts/phase-31/stage-31.5/\` have been regenerated and committed at \`92214a3\`:
1. \`master-benchmark-results.json\` (reconciled headline $N = 26$ scored defect metrics, continuous IoU stats, dedicated evaluation gates for clean/ambiguous/unsupported, and 36-case action routing)
2. \`per-class-performance.json\` (11 scored classes + 3 non-defect categories)
3. \`fp-fn-failure-register.json\` (FMEA with 10 failure modes, RPNs, prevention controls)
4. \`collateral-change-report.json\` (22 candidates audited, 0 diffs, PASS)
5. \`confidence-escalation-analysis.json\` (routing fidelity, hard validation precedence)
6. \`regression-report.json\` (reconciled 401 test cases across 16 suites with assertions disambiguation)
7. \`root-cause-analysis.json\` (RCA-01 journal omission, RCA-02 on-disk byte SHA-256 vs in-memory descriptor)
8. \`limitations-unsupported-register.json\` (benchmark scope boundaries, non-generalizability declaration)
9. \`remediation-retest-matrix.json\` (prioritized follow-up actions and retest criteria)
10. \`stage-report.md\` (comprehensive human-readable dossier with complete reconciliation narrative)

---

### 5. Request for Stage 31.5 Unconditional Acceptance & Stage 31.6 Authorization

With Findings A, B, and C completely resolved with zero discrepancy against Protocol v1.5.0 and the accepted Stage 31.4 baseline, we respectfully request:
1. Formal **UNCONDITIONAL ACCEPTANCE** of Stage 31.5.
2. Formal **AUTHORIZATION** to proceed to Stage 31.6 (Evidence Reconciliation, Final Audit, and Milestone Certification).`;

  console.log('2. Writing prompt copy to scratch/stage31-5-closure-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage31-5-closure-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 31.5 Reconciliation Prompt into ChatGPT chat composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector(".composer-NYb0tQ [contenteditable='true']") ||
               document.querySelector(".RichTextInput-j_tVa5 [contenteditable='true']") ||
               document.querySelector("[data-composer-body] [contenteditable='true']") ||
               document.querySelector("#prompt-textarea") ||
               document.querySelector("[aria-label='Ask ChatGPT']") ||
               document.querySelector("div.ProseMirror");
    if (!el) return JSON.stringify({ error: "NO_PROMPT_ELEMENT" });

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

  let parsedInj = {};
  try {
    parsedInj = JSON.parse(injectRes);
  } catch (e) {
    console.error('Failed to parse injection response:', injectRes);
    process.exit(1);
  }

  if (!parsedInj.success || parsedInj.length < 100) {
    console.error('Failed to inject prompt into ChatGPT:', injectRes);
    process.exit(1);
  }

  console.log('4. Waiting for Send button and clicking...');
  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    await sleep(1000);
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"]') ||
                  document.querySelector('button[data-testid="send-button"]') ||
                  document.querySelector('button[aria-label*="Send"]') ||
                  document.querySelector('form button[type="submit"]');
      if (!btn) return "NO_SEND_BUTTON";
      btn.click();
      return "CLICKED_SEND";
    })()`);
    console.log(`   [Attempt ${b + 1}/10] Send:`, sendRes);
    if (sendRes === 'CLICKED_SEND') {
      clickedSend = true;
      break;
    }
  }

  if (!clickedSend) {
    console.error('Failed to click send button after 10 attempts.');
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 31.5 Final Ruling...');
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
        responseText = afterPrompt.trim();
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
      console.log(`   [Attempt ${attempt + 1}/90] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/90] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 150) {
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

  const outPath = path.resolve('plans/CHATGPT_STAGE31_5_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 31.5 ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
