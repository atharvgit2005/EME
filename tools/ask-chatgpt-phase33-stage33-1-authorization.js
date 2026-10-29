/**
 * Ezra Bridge Script: Submit Phase 33 Consolidated Entry-Gate Closure (EG-01, EG-02, EG-04)
 * and Request Stage 33.1 Authorization from ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 33.1 Authorization & Entry Gates Closure Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Consolidated Entry-Gate Closure & Stage 33.1 Authorization Request)";

  const promptText = `${promptAnchor},

Following your ruling in **Decision ID: AVCS-33-ENTRY-001** (\`plans/CHATGPT_PHASE33_EG00_RULING.md\`), where:
- **EG-00** was formally CLOSED and \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` established as the Phase 32 base commit, and
- **EG-03** and **EG-05** were accepted at the charter level,

the engineering team has resolved the remaining pre-flight entry gates (**EG-01**, **EG-02**, and **EG-04**) and established the complete machine-readable evidence manifests under \`evidence/phase-33/charter/\`.

We submit below the complete pre-flight closure evidence for your formal review and Stage 33.1 authorization.

---

### 1. Closure of EG-01: Clean and Protected Baseline Manifest

The repository protection record is frozen in \`evidence/phase-33/charter/working-tree-protection-manifest.json\`:
1. **Branch Identity**:
   - Current branch: \`feature/phase-33-1-fusion-contracts\`
   - Exact starting commit: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\`
   - Release tree: \`af891a5ffbd64924421c87bbb591ed40bb8e9e55\`
   - Direct child of \`phase-32-certified\` (\`git rev-parse HEAD\` $\\equiv$ \`git rev-parse phase-32-certified^{}\`).
2. **Tracked Files & Working Tree Cleanliness**:
   - \`git diff HEAD\`: **0 modifications** to tracked files.
   - Staged changes: **0**.
   - No destructive reset or forced checkout was used.
3. **Untracked Files Accounting & Preservation**:
   - All untracked items belong to explicit historical evidence categories (\`plans/\`, \`tools/\`, \`evidence/\`, \`artifacts/\`, \`docs/\`, \`scratch/\`). Zero tracked files or release histories are shadowed or overwritten.
4. **Predecessor Tags**:
   - \`phase-31-certified\`: \`82dcb0f243d65afcec37681aa8c302b20263611f\` (Untouched)
   - \`phase-32-5-certified\`: \`ef11797da1c6017b387f1c77eba7d834657e94c3\` (Untouched)
   - \`phase-32-certified\`: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (Untouched)

---

### 2. Closure of EG-02: Fresh Baseline Regression Execution

A complete, fresh regression execution has been conducted from reconciled base commit \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` on branch \`feature/phase-33-1-fusion-contracts\` using Node.js v20 test runner with \`--test-concurrency=1\`.

- **Exact Test Command**:
  \`\`\`bash
  node --test --test-concurrency=1 \\
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
- **Fresh Execution Results**:
  - Test files executed: **61 files** (55 predecessor files + 6 Phase 32 files)
  - Registered runner suites: **50 suites**
  - Total test entries executed: **592 tests**
  - Passed: **592**
  - Failed: **0**
  - Cancelled: **0**
  - Skipped: **0**
  - Todo: **0**
  - Execution duration: **53.46 seconds**
  - Inventory discrepancy vs. baseline: **0** (Exact 1:1 match with historical lineage)
- **Machine-Readable Evidence**: Recorded at \`evidence/phase-33/charter/fresh-baseline-regression-output.json\`.

---

### 3. Closure of EG-04: Real Input-Contract Availability Inventory

An exhaustive machine-readable inventory of the actual available sidecar producers, interfaces, schemas, coordinate spaces, and timebases has been frozen at \`evidence/phase-33/charter/input-contract-availability.json\`:

1. **Producer 1: \`EARSHOT_BEAT_ANALYZER\`**:
   - **Schema & Version**: \`schema/eme-beat-analysis.v1.schema.json\` (\`eme-beat-analysis.v1\`, Canonical frozen schema).
   - **Source Interface**: \`src/audio/beat/beat-grid.js\`, \`src/audio/beat/downbeat-estimator.js\`, \`src/renderers/earshot-adapter.js\`.
   - **Provenance & Freshness**: Source media binding via \`source.sha256\`; content-addressed fingerprint in \`analysisId\` (\`^sha256:[a-f0-9]{64}$\`).
   - **Timebase & Timing Semantics**: \`source.sampleRate\` (8000–192000 Hz), canonical \`120,000 integer ticks/sec\`, \`source.durationTicks\`, and event-level integer ticks \`events.beats[i].ticks\` mapped via rational formula: $\\text{tick} = \\operatorname{roundEven}\\left(\\frac{\\text{sampleIndex} \\times 120000}{\\text{sampleRate}}\\right)$.
   - **Confidence Semantics**: Raw float \`[0.0, 1.0]\` in \`events.beats[i].confidence\`.
   - **Stage 33.1 Normalization Requirement**: Adapter must quantize confidence to integer \`[0, 1000]\` via $\\operatorname{roundEven}(\\text{conf} \\times 1000)$.
   - **Provided Observations**: Beats, downbeats, onsets, tempo (BPM, alternatives, ambiguity, phase offset).

2. **Producer 2: \`VISION_WORKER_PIPELINE\`**:
   - **Schema & Version**: \`schema/eme-visual-intelligence.v1.schema.json\` (\`eme-visual-intelligence.v1\`, Auxiliary sidecar contract).
   - **Source Interface**: \`src/renderers/visual-contract-validator.js\`, \`src/renderers/vision-worker-client.js\`, \`src/solver/visual-constraint-solver.js\`.
   - **Provenance & Freshness**: Bound via \`source.assetId\`, \`source.sha256\`, and \`sidecarId\` (\`^sha256:[a-f0-9]{64}$\`).
   - **Timebase & Interval Semantics**: Rational frame rate \`fps: { numerator, denominator }\`, canonical \`120,000 integer ticks/sec\`, \`frames[i].tick\`, half-open intervals, strict monotonicity ($t_{i+1} > t_i$).
   - **Coordinate Geometry**: Fixed-point source pixel units in thousandths of a pixel (\`0.001 px\`), top-left origin \`(0, 0)\`, exact \`BigInt\` rational arithmetic proxy-to-canvas mapping, round-half-to-even quantization boundary ($\\pm 0.0005\\text{ px}$ max error).
   - **Confidence Semantics**: Integer \`[0, 1000]\` ($1000 = 1.0$, $500 = 0.5$).
   - **Provided Observations**: Detected faces, persons, salient regions, background regions, lighting/luminance. Zero solver placement decisions (\`CTR-03\` compliant).

3. **Cross-Modal Adapter Boundary**: Stage 33.1 contract will define a unified fusion envelope binding both digests, normalizing audio confidence to integer \`[0, 1000]\`, and validating freshness before any composition solver evaluation.

---

### 4. Consolidated Entry Gate Status

| Entry Gate | Description | Status | Evidence Reference |
| :--- | :--- | :--- | :--- |
| **EG-00** | Phase 32 Release Identity | **CLOSED** | Ruling \`AVCS-33-ENTRY-001\`, \`predecessor-identity-reconciliation.json\` |
| **EG-01** | Repository & Working Tree Protection | **CLOSED** | \`working-tree-protection-manifest.json\` |
| **EG-02** | Fresh Baseline Regression (592/592) | **CLOSED** | \`fresh-baseline-regression-output.json\` |
| **EG-03** | Invariant Baseline Manifest | **CLOSED** | \`baseline-invariant-manifest.json\` |
| **EG-04** | Real Input-Contract Availability | **CLOSED** | \`input-contract-availability.json\` |
| **EG-05** | Benchmark & Policy Freeze Plan | **CLOSED** | \`phase-33-stage-plan.json\` |

All 6 entry gates (**EG-00 through EG-05**) are now evidenced and verified.

---

### 5. Authorization Requested

We respectfully request the Architecture Lead to:
1. **Formally Accept** the closure evidence for **EG-01**, **EG-02**, and **EG-04**.
2. **Grant Formal Engineering Authorization** to initiate implementation of **Stage 33.1: Fusion Contracts, Time Alignment, and Policy Specification** on branch \`feature/phase-33-1-fusion-contracts\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 33.1 Authorization Request into ChatGPT composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable='true'][aria-label='Ask ChatGPT']") ||
               document.querySelector("#prompt-textarea") ||
               document.querySelector("[contenteditable='true']");
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
    const sendBtn = form ? form.querySelector("button[aria-label='Send'], button[data-testid*='send']") : null;

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
      const btn = document.querySelector('button[aria-label="Send"], button[data-testid="send-button"]');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 33.1 Authorization Ruling...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 180; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
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

      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
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
      console.log(`   [Attempt ${attempt + 1}/180] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/180] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 500 && !parsed.text.startsWith(promptAnchor)) {
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

  const outPath = path.resolve('plans/CHATGPT_STAGE33_1_AUTHORIZATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.1 Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
