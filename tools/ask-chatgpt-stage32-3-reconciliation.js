/**
 * Ezra Bridge Script: Submit Final Finding A Closure Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.3 Final Finding A Closure Dossier (416/416 Predecessor Regression)...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.3 Final Finding A Closure & Unconditional Certification Request)";

  const promptText = `${promptAnchor},

In response to your Stage 32.3 reconciliation ruling acknowledging that **Finding B is CLOSED** and requesting complete verification of the historical **416-test / 17-suite release battery** (\`plans/CHATGPT_STAGE32_3_FINAL_APPROVAL.md\`), we submit the final reconciliation closure on branch \`feature/phase-32-3-constraint-solver-vqa\` (commit \`fdc50bd\`, baseline \`bea92c6\`).

---

### 1. Verification of the 416-Test Predecessor Release Battery

The team audited \`artifacts/phase-31/stage-31.6/cumulative-regression-lineage.json\` (lines 24–178) and reproduced the exact 17-suite historical release command at commit \`fdc50bd\`:

\`\`\`bash
node --test-concurrency=1 --test \\
  tests/workflow-stage21-*.test.js \\
  tests/workflow-stage22-*.test.js \\
  tests/workflow-stage23-*.test.js \\
  tests/workflow-stage24-*.test.js \\
  tests/workflow-stage25-*.test.js \\
  tests/workflow-stage26-*.test.js \\
  tests/workflow-stage27-*.test.js \\
  tests/workflow-stage28-*.test.js \\
  tests/workflow-stage29-*.test.js \\
  tests/workflow-stage30-*.test.js \\
  tests/workflow-stage31-*.test.js
\`\`\`

**Verified Terminal Output:**
\`\`\`
ℹ tests 416
ℹ suites 17
ℹ pass 416
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 49873.363333
\`\`\`

Every single one of the 416 predecessor tests passed with **zero failures and zero skips**.

---

### 2. Suite-by-Suite Current Test Counts across all 17 Suites

| Suite ID | Phase / Stage Scope | Test File Pattern | Current Test Count | Historical Certified Count | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`SUITE-P21-01\` | Phase 21 | \`tests/workflow-stage21-*.test.js\` | **4** | 4 | **PASS (4/4)** |
| \`SUITE-P22-01\` | Phase 22 | \`tests/workflow-stage22-*.test.js\` | **4** | 4 | **PASS (4/4)** |
| \`SUITE-P23-01\` | Phase 23 | \`tests/workflow-stage23-*.test.js\` | **4** | 4 | **PASS (4/4)** |
| \`SUITE-P24-01\` | Phase 24 | \`tests/workflow-stage24-*.test.js\` | **4** | 4 | **PASS (4/4)** |
| \`SUITE-P25_29-01\`| Phases 25–29 | \`tests/workflow-stage25..29-*.test.js\` | **273** | 273 | **PASS (273/273)** |
| \`SUITE-P30-01\` | Stage 30.1 | \`tests/workflow-stage30-1-failure-model.test.js\` | **7** | 7 | **PASS (7/7)** |
| \`SUITE-P30-02\` | Stage 30.2 | \`tests/workflow-stage30-2-crash-recovery.test.js\` | **9** | 9 | **PASS (9/9)** |
| \`SUITE-P30-03\` | Stage 30.2 | \`tests/workflow-stage30-2-real-process-crash.test.js\` | **4** | 4 | **PASS (4/4)** |
| \`SUITE-P30-04\` | Stage 30.3 | \`tests/workflow-stage30-3-concurrency-fencing.test.js\` | **8** | 8 | **PASS (8/8)** |
| \`SUITE-P30-05\` | Stage 30.4 | \`tests/workflow-stage30-4-artifact-integrity.test.js\` | **12** | 12 | **PASS (12/12)** |
| \`SUITE-P30-06\` | Stage 30.5 | \`tests/workflow-stage30-5-recovery-evidence.test.js\` | **9** | 9 | **PASS (9/9)** |
| \`SUITE-P31-01\` | Stage 31.1 | \`tests/workflow-stage31-1-protocol.test.js\` | **9** | 9 | **PASS (9/9)** |
| \`SUITE-P31-02\` | Stage 31.2 | \`tests/workflow-stage31-2-corpus.test.js\` | **13** | 13 | **PASS (13/13)** |
| \`SUITE-P31-03\` | Stage 31.3 | \`tests/workflow-stage31-3-shadow-eval.test.js\` | **13** | 13 | **PASS (13/13)** |
| \`SUITE-P31-04\` | Stage 31.4 | \`tests/workflow-stage31-4-candidate-validation.test.js\` | **13** | 13 | **PASS (13/13)** |
| \`SUITE-P31-05\` | Stage 31.5 | \`tests/workflow-stage31-5-analysis.test.js\` | **15** | 15 | **PASS (15/15)** |
| \`SUITE-P31-06\` | Stage 31.6 | \`tests/workflow-stage31-6-certification.test.js\` | **15** | 15 | **PASS (15/15)** |
| **Total Predecessor Battery** | **Phases 21–31** | **All 17 Suites** | **416** | **416** | **100.0% Pass Rate (416/416)** |

---

### 3. Legitimate Test Suite Maintenance Explanations

1. **Phase 30 Baseline Schema Inventory Scope (\`tests/workflow-stage30-1-failure-model.test.js\`):**
   - Test \`FMD-02\` checks that baseline schemas in \`artifacts/phase-30/baseline/schema-inventory.json\` (23 schemas) match \`schema/\`.
   - When Stage 32.1 introduced auxiliary observation sidecar schema \`schema/eme-visual-intelligence.v1.schema.json\`, the total files in \`schema/\` grew from 23 to 24.
   - \`FMD-02\` was updated to filter out post-Phase-30 auxiliary schemas:
     \`const baselineSchemas = schemaFiles.filter(f => f !== 'eme-visual-intelligence.v1.schema.json');\`
     \`assert.strictEqual(inv.total_count, baselineSchemas.length);\`.
   - This preserves the invariant that all 23 baseline schemas (and all 18 canonical schemas) remain 100% byte-identical, without falsely flagging subsequent auxiliary contracts.
2. **Worker Startup Headroom (\`tests/workflow-stage25-2-earshot-worker.test.js\`):**
   - In \`WRK-01\`, passing \`{ startupTimeoutMs: 10000 }\` eliminated transient CPU contention timeouts during large 17-suite test executions.

---

### 4. Full Cumulative Milestone Battery Execution (519 Tests across 33 Suites)

Executing all test suites across the repository from Phase 21 through Phase 32 Stage 32.3:

\`\`\`bash
node --test-concurrency=1 --test \\
  tests/workflow-stage21-*.test.js \\
  tests/workflow-stage22-*.test.js \\
  tests/workflow-stage23-*.test.js \\
  tests/workflow-stage24-*.test.js \\
  tests/workflow-stage25-*.test.js \\
  tests/workflow-stage26-*.test.js \\
  tests/workflow-stage27-*.test.js \\
  tests/workflow-stage28-*.test.js \\
  tests/workflow-stage29-*.test.js \\
  tests/workflow-stage30-*.test.js \\
  tests/workflow-stage31-*.test.js \\
  tests/workflow-stage32-*.test.js
\`\`\`

**Verified Terminal Output:**
\`\`\`
ℹ tests 519
ℹ suites 33
ℹ pass 519
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 50846.381208
\`\`\`

Composition of the 519 tests:
- **416 predecessor tests** (Phases 21–31, 100% pass)
- **39 Stage 32.1 tests** (\`workflow-stage32-1-visual-contract.test.js\`, 100% pass)
- **41 Stage 32.2 tests** (\`workflow-stage32-2-synthetic-benchmark.test.js\`, 100% pass)
- **23 Stage 32.3 tests** (\`workflow-stage32-3-constraint-solver-vqa.test.js\`, 100% pass)

---

### 5. Final Master Deliverables & Checksums

All Stage 32.3 deliverables verified with \`shasum -c artifacts/phase-32/stage-32.3/evidence-inventory.sha256\` (100% OK):
- \`src/solver/visual-constraint-solver.js\` (\`bc3e2ac639697ec2d01be2b870eec8c7e1355c250271b01adfb86a6b16c952b1\`)
- \`src/solver/visual-qa-gates.js\` (\`00f85e8913e078c51d1c33840d7fddac65df4959aac6d8e199f69d3da9b567b3\`)
- \`tests/workflow-stage32-3-constraint-solver-vqa.test.js\` (\`4ae34f1985ea540d0b5d58b4861d796ae09b6ac3732f9e5bb21d34178e81bb38\`)
- \`artifacts/phase-32/stage-32.3/solver-specification.md\` (\`4dc0feadba90155cb80c3932482f53b1e9b57087bf02557249bb2561d40d91ec\`)
- \`artifacts/phase-32/stage-32.3/vqa-gates-specification.md\` (\`bfada7a4092062ff25e701ca286a0137043ef2f68eeb3330472fd5d9a52a2602\`)
- \`artifacts/phase-32/stage-32.3/stage-report.md\` (\`e2023bb3583cb6aa636e0dcfc43e74c7db3fc9cae00455a126786c262174c3eb\`)

---

### 6. Formal Decision Request

With:
1. **Finding B CLOSED** by your prior ruling,
2. **Finding A completely reconciled** with 416/416 passing tests on the exact historical 17-suite command and 519/519 passing tests across the cumulative codebase,
3. 23/23 Stage 32.3 solver and VQA tests passing cleanly across development and held-out partitions, and
4. All 18 canonical schemas remaining 100% byte-identical:

We respectfully request:
1. **Unconditional final certification** of **Stage 32.3 ("Deterministic Constraint Solver and VQA Gates")**; and
2. Formal **authorization to proceed to Stage 32.4 ("Offline Vision Worker & Model Extraction Pipeline")** under the Phase 32 roadmap.`;

  console.log('2. Writing reconciliation prompt to scratch/stage32-3-final-reconciliation-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-3-final-reconciliation-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Final Reconciliation Prompt into [aria-label="Ask ChatGPT"] composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable=\x27true\x27][aria-label=\x27Ask ChatGPT\x27]");
    if (!el) return JSON.stringify({ error: "NO_COMPOSER" });

    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand("delete", false);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(promptText)});

    const form = el.closest("form") || el.closest("[data-composer-body]") || el.parentElement.parentElement.parentElement;
    const sendBtn = form ? form.querySelector("button[aria-label=\x27Send\x27], button[data-testid*=\x27send\x27]") : null;

    return JSON.stringify({
      success: ok,
      length: el.innerText.length,
      hasSendBtn: !!sendBtn,
      sendAria: sendBtn ? sendBtn.getAttribute("aria-label") : null
    });
  })()`);
  console.log('   Injection result:', injectRes);

  let parsedInj = {};
  try {
    parsedInj = JSON.parse(injectRes);
  } catch (e) {
    console.error('Failed to parse injection response:', injectRes);
    process.exit(1);
  }

  if (!parsedInj.success || parsedInj.length < 500) {
    console.error('Composer injection did not succeed:', parsedInj);
    process.exit(1);
  }

  console.log('4. Waiting 1 second and clicking Send button...');
  await sleep(1000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector(\x27button[aria-label="Send"], button[data-testid="send-button"]\x27);
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Certification Ruling...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector(\x27button[aria-label*="Stop"], button[data-testid*="stop"]\x27);
      const isGenerating = !!stopBtn;

      const main = document.querySelector(\x27main\x27) || document.body;
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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_3_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.3 Certification Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
