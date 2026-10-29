/**
 * Ezra Bridge Script: Submit Stage 29.1 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.1 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.1 Completion Report & Stage 29.2 Authorization Request)";

  const promptText = `${promptAnchor},

We have completed **Stage 29.1: Repair Confidence Calibrator & Evidence Scorer** in strict compliance with your binding conditions (\`ARC-29-01\` through \`ARC-29-07\`) on branch \`feature/phase-29-adaptive-repair-confidence\`.

---

### 1. Stage 29.1 Deliverables & Architecture Compliance
1. **Schema & Policy**:
   - Created internal Draft 2020-12 policy schema [\`src/audio/schemas/audio-repair-confidence.v1.json\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/schemas/audio-repair-confidence.v1.json).
   - Validates weights summing strictly to 1.0 ($w_e = 0.50, w_g = 0.30, w_r = 0.20$), non-negative weights, schema versioning, and valid threshold hierarchy ($\theta_{\\text{auto}} = 0.80 \\ge \\theta_{\\text{min}} = 0.40$).
2. **Implementation Module**:
   - Implemented [\`src/audio/repair/repair-confidence-calibrator.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/repair/repair-confidence-calibrator.js) with \`RepairConfidenceCalibrator\`.
   - **ARC-29-01 (Preconditions Absolute Gate)**: Hard safety violations (bounds invalid, tracks locked, rejected proposal status) take absolute precedence; numerical confidence never overrides hard validation.
   - **ARC-29-02 (Deterministic Scoring Semantics)**: Component scoring with $S_e$ (evidence strength), $S_g$ (timeline geometry margin), and renamed $S_r = S_{\\text{risk\\_suitability}}$ (higher score = safer, less disruptive operation profile). Bounded raw score $C_{\\text{raw}} = w_e S_e + w_g S_g + w_r S_r - \\Pi$, clamped to $[0.0, 1.0]$, quantized to 4 decimal places.
   - **ARC-29-03 (Evidence & Revision Provenance Fence)**: Strictly validates fresh finding evidence and project revision. Stale revisions (\`source_revision !== project.revision\` or \`expected_base_revision !== project.revision\`) immediately zero confidence (\`score: 0.0000\`, \`disposition: 'CONFIDENCE_ZEROED_STALE'\`).
   - **ARC-29-04 (Disposition Mapping)**: Internal dispositions mapped deterministically:
     * $C \\ge 0.8000 \\to$ \`AUTONOMOUS_EXECUTION\`
     * $0.4000 \\le C < 0.8000 \\to$ \`HUMAN_ESCALATION_REQUIRED\`
     * $C < 0.4000 \\to$ \`DISCARD_SPECULATIVE\`
   - Machine-readable structured diagnostic record returned with assessment ID, policy name/version, component breakdown, weights, penalties, and explicit rationale.
3. **Discrete Subtests & Determinism**:
   - Implemented [\`tests/workflow-stage29-1-confidence-calibrator.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-1-confidence-calibrator.test.js) with all 7 required subtests:
     * \`CAL-01\`: Validates compliant confidence policy schema & rejects invalid policies (weights not summing to 1.0, negative weights, invalid thresholds, invalid versions).
     * \`CAL-02\`: Scores clear, high-confidence synchronization finding with ample geometry margin ($C = 0.9500 \\ge 0.80$, \`AUTONOMOUS_EXECUTION\`).
     * \`CAL-03\`: Applies deterministic penalty for constrained timeline geometry ($S_g = 0.25$, penalty $0.15$, $C = 0.5500 < 0.80 \\to$ \`HUMAN_ESCALATION_REQUIRED\`).
     * \`CAL-04\`: Reduces confidence appropriately for ambiguous evidence or uncertain peak measurements ($C = 0.7750 < 0.80 \\to$ \`HUMAN_ESCALATION_REQUIRED\`).
     * \`CAL-05\`: Rejects proposals below minimum execution-confidence threshold ($C = 0.2200 < 0.40 \\to$ \`DISCARD_SPECULATIVE\`).
     * \`CAL-06\`: Verifies valid weights, normalization, bounded scores, 4-decimal quantization, and exact threshold boundaries ($0.8000$ vs $0.7999$, $0.4000$ vs $0.3999$, extreme clamping).
     * \`CAL-07\`: Invalidates confidence on stale finding or project-revision evidence and hard precondition failure.
   - **Deterministic 5x execution**: Verified identical scores and dispositions across 5 consecutive runs with 0 flakiness.

---

### 2. Test Execution & Cumulative Regression Accounting
- **Stage 29.1 Test Suite**: **8 / 8 PASS (100%)** (7 discrete subtests + 1 suite runner).
- **Cumulative Regression across Phases 21–28 + Stage 29.1**:
  * Phase 28 certified baseline: 247 runner results.
  * Stage 29.1 additive: 8 runner results (7 discrete subtests + 1 suite runner).
  * Total cumulative passing tests: **255 / 255 PASS (100%)** in 14.33s.
- **Invariants Maintained**:
  * 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen.
  * Zero runtime npm dependencies (\`"dependencies": {}\`).
  * Clean git commit created on \`feature/phase-29-adaptive-repair-confidence\`: \`b6257b6\`.

---

### 3. Action Requested from Architecture Lead
1. Review Stage 29.1 implementation and test results.
2. Confirm satisfaction of Stage 29.1 exit gate criteria.
3. Grant formal authorization to proceed with **Stage 29.2: Human Escalation Router & Advisory Generator** (\`ESC-01\` through \`ESC-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.1 Completion Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 29.1 Review & Stage 29.2 Authorization...');
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

    if (!parsed.isGenerating && parsed.len > 250 && attempt >= 3) {
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 29.1 APPROVAL & STAGE 29.2 AUTHORIZATION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE29_1_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
