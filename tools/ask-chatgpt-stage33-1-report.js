/**
 * Ezra Bridge Script: Submit Stage 33.1 Completion & Acceptance Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 33.1 Acceptance Submission Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Stage 33.1 Fusion Contracts Specification — Completion & Review Submission)";

  const promptText = `${promptAnchor},

Following your formal engineering authorization in **Decision ID: AVCS-33-ENTRY-002** (\`plans/CHATGPT_STAGE33_1_AUTHORIZATION.md\`), the engineering team has completed all required deliverables for **Stage 33.1 ("Fusion Contracts, Time Alignment, and Policy Specification")** on branch \`feature/phase-33-1-fusion-contracts\`.

Implementation commit: \`7401e7f5cf4a9e403d61184a4ec410fcf9c585fa\` (\`7401e7f\`)  
Parent commit: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)  

We submit below the complete Stage 33.1 deliverable package, test results, invariant audit, and artifact manifest for your formal architectural review and acceptance.

---

### 1. Mandatory Stage Decision Record (Charter Section 9 Format)

- **Stage**: 33.1 — Fusion Contracts, Time Alignment, and Policy Specification
- **Implementation commit**: \`7401e7f5cf4a9e403d61184a4ec410fcf9c585fa\`
- **Parent**: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)
- **Objective**: Freeze the contracts, exact rational time conversions, deterministic confidence normalizations, observation vs. decision boundaries, and evidence schemas for combining Earshot and Phase 32 visual observations.
- **Tests**:
  - Stage 33.1 test suite (\`tests/workflow-stage33-1-fusion-contract.test.js\`): **23 expected, 23 executed, 23 passed, 0 failed, 0 cancelled, 0 skipped**.
  - Cumulative repository regression battery: **615 expected, 615 executed, 615 passed, 0 failed, 0 cancelled, 0 skipped** across 62 test files (57 runner suites) in 53.02s.
- **Applicable Quality Gates**:
  - **GATE-01 (Provenance & Freshness)**: PASS. \`verifyFreshness()\` strictly verifies \`projectRevision\`, \`audioSource.sha256\`, and \`visualSource.sha256\`.
  - **GATE-04 (Temporal Alignment)**: PASS. All rational sample and frame mappings match canonical integer ticks within 1 tick with round-half-to-even Banker's Rounding.
  - **GATE-08 (Architecture & Invariants)**: PASS. All 18 canonical schemas verified byte-identical; package.json dependencies undefined; \`OperationExecutor\` sole mutation authority.
- **Invariants**:
  - \`INV-01\` (Frozen Canonical Schemas): PASS. 18 canonical schemas 100% byte-identical.
  - \`INV-02\` (Canonical Timebase): PASS. 120,000 integer ticks/sec standard with half-open intervals $[t_0, t_0 + \Delta t)$.
  - \`INV-03\` (\`OP-AUTH\` Mutation Authority): PASS. \`OperationExecutor\` remains exclusive mutation authority; fusion contract produces pure observations/plans.
  - \`INV-04\` (Active-Delivery Safety): PASS. Preserved without modification.
  - \`INV-05\` (Runtime Dependency Boundary): PASS. \`package.json\` dependencies property is undefined. Zero ML weights, zero Python in core package.
  - \`INV-06\` (Observation vs Decision Separation / \`CTR-03\`): PASS. Sidecar strictly records observations; decision fields (\`safe_placement_rect\`, \`placement_score\`, \`operationPlan\`) are rejected.
  - \`INV-07\` (Determinism): PASS. Stable canonical stringify and bitwise identical SHA-256 fingerprinting.
- **Evidence Integrity**: All 10 deliverables hashed and cataloged in \`evidence/phase-33/stage-33.1/artifact-integrity-manifest.json\`.
- **Outstanding Findings**: None.
- **Decision Requested**: ACCEPT Stage 33.1.
- **Next-Stage Authorization Requested**: Stage 33.2 (Frozen Audio-Visual Benchmark and Ground Truth).

---

### 2. Stage 33.1 Implementation Deliverables Summary

1. **Auxiliary Sidecar Schema**:
   - File: \`schema/eme-fusion-evidence.v1.schema.json\`
   - Status: Classified strictly as an **auxiliary observation sidecar** (7th auxiliary schema, total 25 schemas). Zero canonical schemas modified.
   - SHA-256: \`2816c2d757e73d13d2d8b402e346684b98b8cb0090c8a76fffe41386aa6711ba\`.
2. **Core Implementation**:
   - File: \`src/fusion/fusion-contract-validator.js\` (\`FusionContractValidator\`).
   - Implements exact rational BigInt temporal conversions (\`sampleToTicks\`, \`ticksToSample\`, \`frameToTicks\`, \`ticksToFrame\`).
   - Implements deterministic confidence normalization: $c_{\\text{normalized}} = \\operatorname{roundEven}(1000 \\times c_{\\text{float}})$ with exact half-way tie-breaking to nearest even integer.
   - Enforces \`CTR-03\` pure observation guarantee via \`assertPureObservation()\`.
   - Validates Earshot beat analysis sidecars, Phase 32 visual intelligence sidecars, and unified fusion envelopes.
   - Validates evidence freshness and project revision alignment via \`verifyFreshness()\`.
   - Computes deterministic content-addressed fingerprints via \`computeFusionFingerprint()\`.
3. **Dedicated Test Suite**:
   - File: \`tests/workflow-stage33-1-fusion-contract.test.js\` (23 tests across 7 suites).
   - Covers: FUS-01 through FUS-23.
4. **Charter & Stage Evidence Bundle**:
   - \`evidence/phase-33/stage-33.1/stage-report.md\`
   - \`evidence/phase-33/stage-33.1/input-contract-inventory.json\`
   - \`evidence/phase-33/stage-33.1/time-alignment-contract.json\`
   - \`evidence/phase-33/stage-33.1/fusion-policy-v1.0.0.json\`
   - \`evidence/phase-33/stage-33.1/auxiliary-schema-inventory.json\`
   - \`evidence/phase-33/stage-33.1/contract-test-results.json\`
   - \`evidence/phase-33/stage-33.1/regression-lineage.json\`
   - \`evidence/phase-33/stage-33.1/artifact-integrity-manifest.json\`

---

### 3. Formal Request

We respectfully request the Architecture Lead to:
1. **Formally Accept** the Stage 33.1 deliverable package and findings closure.
2. **Grant Formal Engineering Authorization** to proceed to **Stage 33.2: Frozen Audio-Visual Benchmark and Ground Truth** on branch \`feature/phase-33-2-av-benchmark\`.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 33.1 Submission into ChatGPT composer...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 33.1 Acceptance Ruling...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE33_1_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.1 Acceptance Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
