/**
 * Ezra Bridge Script: Submit Stage 28.5 & Phase 28 Milestone Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 28.5 & Phase 28 Final Milestone Certification Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 28.5 Completion & Phase 28 Final Milestone Certification Request)";

  const promptText = `${promptAnchor},

In accordance with your Stage 28.4 Acceptance & Stage 28.5 Authorization ruling and binding conditions (ARC-28-29 through ARC-28-35) in \`plans/CHATGPT_STAGE28_4_APPROVAL.md\`, and following the mandatory engineering directive:
\`“Use required GSD actions to achieve the goals and wherever needed.”\`

The engineering team has completed the full implementation and empirical verification of **Stage 28.5: Closed-Loop Multi-Pass End-to-End Verification & Cumulative Regression**, concluding all stages of **Milestone Phase 28: Repair Policy, Conflict Resolution & Multi-Pass Orchestration**.

---

### 1. Stage 28.5 Deliverables & Git Commit Provenance
- **Commit**: \`a629f0e\` (\`feat(audio): implement multi-pass end-to-end verification and cumulative regression (Stage 28.5)\`)
- **Direct Ancestry**: \`git merge-base --is-ancestor main HEAD\` confirmed (exit code 0).
- **Branch**: \`feature/phase-28-repair-policy-orchestration\` (6 clean atomic commits from \`main\`):
  1. \`5f7c4b0\`: Phase 28 Implementation Plan
  2. \`58abba7\`: Stage 28.1 — RepairConflictDetector and audio-repair-policy schema
  3. \`2b9ae25\`: Stage 28.2 — MultiPassRepairOrchestrator with bounded passes and atomic rollback
  4. \`503968b\`: Stage 28.3 — RepairConvergenceGuard with semantic oscillation detection and cumulative bounds
  5. \`d335027\`: Stage 28.4 — Mandatory conflicting defect scenario with attribution separation and safe halts
  6. \`a629f0e\`: Stage 28.5 — Multi-pass end-to-end verification and cumulative regression
- **Production Files Added/Modified**:
  1. \`src/audio/schemas/audio-repair-policy.v1.json\` (Draft 2020-12 policy schema)
  2. \`src/audio/repair/repair-conflict-detector.js\` (Collision & DAG engine)
  3. \`src/audio/repair/multi-pass-orchestrator.js\` (Multi-pass coordinator & rollback engine)
  4. \`src/audio/repair/repair-convergence-guard.js\` (Anti-oscillation & convergence guard)
  5. \`src/audio/repair/audio-repair-planner.js\` (Scoped defer options for conflict resolution)

---

### 2. Discrete Subtest Execution Ledger (Stage 28.5)
Command: \`node --test tests/workflow-stage28-5-end-to-end.test.js\`

| Test ID | Architectural Invariant | Verification Result | Duration |
|:---|:---|:---:|:---:|
| **E2E-01** | Multi-pass sequential repair (Pass 1 sync + Pass 2 peak + Pass 3 verification $\\to$ PROMOTED) (ARC-28-29 & ARC-28-32) | **PASS** | 53.46 ms |
| **E2E-02** | Live Earshot worker integration with real Python process and acoustic transient analysis (ARC-28-30) | **PASS** | 1,714.92 ms |
| **E2E-03** | Authoritative pre-commit validation fence and delivery preservation across passes (ARC-28-31 & ARC-28-33) | **PASS** | 1.78 ms |
| **E2E-04** | Complete audit journal, provenance tracking, and artifact SHA-256 digests (ARC-28-30 & ARC-28-34) | **PASS** | 1.45 ms |
| **E2E-05** | Cumulative regression verification across preceding Phase 28 stages (ARC-28-35) | **PASS** | 89.42 ms |
| **Suite Harness** | Parent test suite runner harness | **PASS** | 1,864.32 ms |

**Result**: **5 / 5 discrete subtests PASS (6 / 6 reported by Node.js test runner)** in 2.44s.

---

### 3. Cumulative Phase 21–28 Master Regression Battery
Command: \`node --test tests/workflow-stage2{1,2,3,4,5,6,7}*.test.js tests/workflow-stage28-1-conflict-detector.test.js tests/workflow-stage28-2-multi-pass-orchestrator.test.js tests/workflow-stage28-3-convergence-guard.test.js tests/workflow-stage28-4-conflicting-repair-scenario.test.js tests/workflow-stage28-5-end-to-end.test.js\`

- **Certified Phase 27 Baseline**: **212 / 212 PASS**
- **Additive Stage 28.1**: **+8 reported tests** (7 discrete subtests + 1 suite runner)
- **Additive Stage 28.2**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Additive Stage 28.3**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Additive Stage 28.4**: **+7 reported tests** (6 discrete subtests + 1 suite runner)
- **Additive Stage 28.5**: **+6 reported tests** (5 discrete subtests + 1 suite runner)
- **Phase 28 Total Additive**: **30 discrete subtests (35 Node reported)**
- **Cumulative Active Battery**: **247 / 247 PASS (100% Zero Regressions)**
- Execution Time: 14.30s | Failures: 0 | Cancelled: 0 | Skipped: 0

---

### 4. Full Phase 28 Milestone Verification Summary
1. **ARC-28-29 (Pass Budget Invariant)**: Bounded to $\\le 3$ render-and-audit cycles. Pass 3 verification counts against budget. Terminated with \`MAX_PASSES_EXCEEDED\` if defects persist.
2. **ARC-28-30 (Closed-Loop Evidence & Live Earshot)**: Real acoustic transient alignment measured on actual media via live Earshot worker process; artifact SHA-256 digests tracked and verified.
3. **ARC-28-31 (Authoritative Pre-Commit Validation)**: Proved that deferred preliminary checks never bypass pre-commit validation; locked destination tracks halt with \`NEEDS_RECONCILIATION\` and 100% active delivery preservation.
4. **ARC-28-32 (Independent Metrics)**: Synchronization ($\\\\le 33.33\\\\text{ ms}$) and true peak ($\\\\le -1.0\\\\text{ dBTP}$) verified independently on fresh candidate renders.
5. **ARC-28-33 (Delivery Provenance)**: Active delivery preserved untouched across all intermediate passes; promoted only upon 100% clean verified candidate with matching SHA-256 and monotonic revision.
6. **ARC-28-34 (Journal Integrity)**: Comprehensive audit journal captures all lifecycle events, digests, and rollback details without inventing non-canonical job states.
7. **ARC-28-35 (Regression Accounting)**: Exact reconciliation: $212 + 8 + 7 + 7 + 7 + 6 = 247$ reported passing tests.
8. **Schema & Dependency Freeze**: 18 canonical schemas in \`schema/*.v1.schema.json\` 100% frozen; \`"dependencies": {}\` preserved in \`package.json\`.

---

### 5. Action Requested from Architecture Lead
1. Review and grant **Unconditional Milestone Certification** for **Phase 28: Repair Policy, Conflict Resolution & Multi-Pass Orchestration**.
2. Grant formal authorization to merge \`feature/phase-28-repair-policy-orchestration\` into \`main\`.
3. Grant authorization to create the release tag \`phase-28-certified\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 28.5 & Phase 28 Certification prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Milestone Decision...');
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

  console.log('\n=============================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 28 FINAL CERTIFICATION DECISION RECEIVED:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE28_FINAL_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
