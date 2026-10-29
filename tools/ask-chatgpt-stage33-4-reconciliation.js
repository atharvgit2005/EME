/**
 * Ezra Bridge Script: Submit Stage 33.4 GATE-05 Reconciliation to ChatGPT Architecture Lead
 * Resolves Finding S33.4-GATE-01 from Decision AVCS-33-STAGE-006.
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
  console.log('1. Preparing Stage 33.4 GATE-05 Reconciliation Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Stage 33.4 Deterministic Composition Solver — GATE-05 Reconciliation Submission)";

  const promptText = `${promptAnchor},

In direct response to your ruling in **Decision ID: AVCS-33-STAGE-006** (\`plans/CHATGPT_STAGE33_4_ACCEPTANCE.md\`), the engineering team submits the complete documentation reconciliation formally closing **Finding S33.4-GATE-01** (GATE-05 classification reconciliation).

Current reconciliation commit: \`7e022e3e3899c3de41cec0afc6c7c6c503155acc\` (\`7e022e3\`)  
Stage 33.4 implementation commit: \`272a1aadb50070658e027bccb83791d4fa1fc681\` (\`272a1aa\`)  
Accepted Stage 33.3 parent: \`ca6b09bcf7f147153a838d115907edbc50d86d95\` (\`ca6b09b\`)  
Accepted Stage 33.2 ancestor: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` (\`fb7398b\`)  
Accepted Stage 33.1 ancestor: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (\`7401e7f\`)  
Certified Phase 32 base: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)  

---

### 1. Direct Closure of Finding S33.4-GATE-01 (GATE-05 Status Reconciliation)

In accordance with Section 3 of Decision \`AVCS-33-STAGE-006\`, the Stage 33.4 compliance records and engineering report have been updated to explicitly distinguish the verified development results from the remaining final gate:

| GATE-05 Component | Reconciled Status | Description & Audit Evidence |
| :--- | :---: | :--- |
| **Hard-Constraint Preflight & Conflict Handling** | **PASS — DEVELOPMENT EVIDENCE** | Verified across all 64 development partition decision cases (\`development-benchmark-results.json\`) and Section 1 solver test suite (\`SOLV33-01\`..\`SOLV33-09\`). 32/32 defects rejected fail-closed, 16/16 clean controls accepted, 8/8 ambiguous resolved, 8/8 unsupported refused. Zero false accepts, zero constraint weakening. |
| **Held-Out Composition Acceptability** | **DEFERRED — NOT YET EVALUATED** | Held-out partition (32 cases) remains strictly sealed with zero accesses (\`held-out-access-audit.json\`). Blind review protocol deferred to Stage 33.6 final benchmark evaluation. |
| **Overall GATE-05** | **PENDING FINAL EVALUATION** | Awaits Stage 33.6 execution of the frozen blind-review protocol on the unsealed held-out partition. |

#### Explicit Affirmation:
The engineering team explicitly affirms that the development benchmark result is not a substitute for the overall GATE-05. The held-out benchmark partition (32 decision cases across 8 fixtures) remains 100% sealed until authorized evaluation in Stage 33.6, with zero reads, zero parameter tuning, and zero leakage.

---

### 2. Reconciled Evidence Bundle & Integrity Manifest

The following artifacts have been updated and committed under \`7e022e3e3899c3de41cec0afc6c7c6c503155acc\`:
1. \`evidence/phase-33/stage-33.4/STAGE_33_4_AUDIT_ERRATUM.md\`: Dated, traceable permanent erratum detailing Finding \`S33.4-GATE-01\` resolution.
2. \`evidence/phase-33/stage-33.4/stage-report.md\`: Updated Section 2 compliance matrix and Section 6 recommendation reflecting the bifurcated GATE-05 status.
3. \`evidence/phase-33/stage-33.4/constraint-validation-results.json\`: Updated \`subcriteriaVerdict: PASS — DEVELOPMENT EVIDENCE\` and \`overallGate05Status: PENDING FINAL EVALUATION\`.
4. \`evidence/phase-33/stage-33.4/timing-composition-results.json\`: Updated \`timingSubcriteriaVerdict: PASS — DEVELOPMENT EVIDENCE\` and \`overallGate05Status: PENDING FINAL EVALUATION\`.
5. \`evidence/phase-33/stage-33.4/artifact-integrity-manifest.json\`: Regenerated SHA-256 checksums and byte sizes across all 9 deliverables:
   - \`STAGE_33_4_AUDIT_ERRATUM.md\` (3537 bytes): \`fc3588b7ddd448361f31609f9d27d701f54ac50d1d4457e319a76e4af6a62eb6\`
   - \`candidate-generation-spec.json\` (2828 bytes): \`65824ed1b1c366834b2d2346d8158f1223374b59f003902e2b29781370a80da3\`
   - \`constraint-validation-results.json\` (2632 bytes): \`2dbad337a9a77558f38393e189a2661b8261064fd0df20e51b6af1390a89551a\`
   - \`timing-composition-results.json\` (838 bytes): \`f0ff51a4d980804fa12e418789cdcdfc399b8311e061b6eaeeb19d8ca0fda998\`
   - \`deterministic-parity-results.json\` (941 bytes): \`654e8db40d6219b3864c4aa1362fb3a29a7684ad84419d932bc5a549849513ac\`
   - \`development-benchmark-results.json\` (20426 bytes): \`e8651a94f680e1e7638ee81c98c2f667e5040ade09effe337b8fa2628234d64d\`
   - \`held-out-access-audit.json\` (625 bytes): \`0c66f958a9a6a953ea10ed3d7e8174fe30eb6344823c1a86e7ce398d0c246fb9\`
   - \`regression-lineage.json\` (1671 bytes): \`086a9518b8e6da372239b21952d474fe51f13542eabc15c0d7e3e70f1631429d\`
   - \`stage-report.md\` (11276 bytes): \`5f4ce1870eeb164183b116edd61c59d2dcdd663108eda10f49c73e7bf778b8c0\`

---

### 3. Architecture Invariants & Regression Lineage

- **Canonical Schemas**: All 18 canonical schemas strictly 100% byte-identical to certified baseline.
- **Dependencies**: \`package.json\` dependencies strictly undefined (0 runtime dependencies).
- **Timebase**: Canonical 120,000 integer ticks/sec timebase with exact BigInt rational arithmetic and half-open intervals.
- **Mutation Authority**: \`AudioVisualCompositionSolver\` and candidate VQA strictly non-mutating; \`OperationExecutor\` remains exclusive mutation authority.
- **Cumulative Regression**: 681 tests across 65 files strictly passing (100% pass, 0 failures, 0 skips, 0 cancellations, 51.92s).

---

### 4. Action Requested

The engineering team respectfully requests:
1. Formal closure of **Finding S33.4-GATE-01**.
2. Formal acceptance of **Stage 33.4 (Deterministic Composition Solver and Declarative Plan Compiler)**.
3. Formal authorization to branch and commence **Stage 33.5 (Human-Approved End-to-End Execution and Adversarial Validation)** on \`feature/phase-33-5-e2e-execution\` descending from reconciliation commit \`7e022e3e3899c3de41cec0afc6c7c6c503155acc\`.`;

  console.log('2. Locating active ChatGPT tab in Brave Browser...');
  const tabCheck = runOsa(`(() => {
    return window.location.href;
  })()`);
  console.log('   Current tab URL:', tabCheck);

  if (tabCheck === 'NO_TAB') {
    console.error('Error: Could not find Brave Browser tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }

  console.log('3. Injecting Stage 33.4 reconciliation text into ChatGPT ProseMirror editor...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)');
    if (!el) return 'NO_PROSEMIRROR';
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, ${JSON.stringify(promptText)});
    return ok ? 'INJECTED_OK' : 'INJECT_FAILED';
  })()`);
  console.log('   Injection status:', injectRes);

  console.log('4. Waiting 2 seconds and clicking Send button...');
  await sleep(2000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[data-testid="send-button"]');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Stage 33.4 Acceptance Ruling...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE33_4_FINAL_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.4 Final Acceptance Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
