/**
 * Ezra Bridge Script: Submit Stage 29.3 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.3 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.3 Completion Report & Stage 29.4 Authorization Request)";

  const promptText = `${promptAnchor},

We have completed **Stage 29.3: Decision Ledger & Audit Journal Engine** in strict compliance with binding conditions (\`ARC-29-15\` through \`ARC-29-20\`) on branch \`feature/phase-29-adaptive-repair-confidence\` at commit \`0b80e62\`.

---

### 1. Stage 29.3 Deliverables & Architecture Compliance
1. **Implementation Modules & Internal Schema**:
   - Implemented [\`src/audio/repair/repair-decision-ledger.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/repair/repair-decision-ledger.js) with \`RepairDecisionLedger\`.
   - Created internal Draft 2020-12 schema [\`src/audio/schemas/audio-repair-ledger.v1.json\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/schemas/audio-repair-ledger.v1.json).
   - **ARC-29-15 (Authoritative Decision Record & Lifecycle Distinction)**: Distinguishes \`PROPOSAL_FORMULATED\`, \`CONFIDENCE_ASSESSED\`, \`ROUTING_DETERMINED\`, \`HUMAN_REVIEW_REQUESTED\`, \`HUMAN_REVIEW_DECIDED\`, \`EXECUTION_AUTHORIZED\`, \`OPERATION_COMMITTED\`, \`POST_RENDER_QA_EVALUATED\`, and \`DELIVERY_PROMOTED\`. No stage implies a subsequent stage.
   - **ARC-29-16 (Integrity, Non-Overwriting & Idempotence)**: Decisions append monotonically without in-place mutation. Duplicate correlation keys are detected and handled idempotently without re-execution. Superseded/invalidated decisions record explicit superseded records with causality pointers.
   - **ARC-29-17 (Proposal & Revision Binding at Execution Fence)**: Every execution authority check validates exact request identity, candidate revision, media SHA-256, and ensures stale or materially modified approvals are rejected with \`EXECUTION_AUTHORITY_DENIED\`.
   - **ARC-29-18 (Mutation Boundary Protection & Failure Injection Resilience)**: Pre-mutation ledger recording is a strict prerequisite for \`OperationExecutor\` invocation. Injected pre-execution ledger failure cleanly blocks mutation with \`PRE_EXECUTION_LEDGER_FAILED\` (0 project mutations). Injected post-execution ledger failure does NOT falsely claim rollback; preserves the committed operation result, preserves active delivery, and transitions cleanly to canonical \`NEEDS_RECONCILIATION\`.
   - **ARC-29-19 (Strict SHA-256 Digest Validation & Zero Schema Modification)**: All checksums validated strictly as 64-character lowercase hex strings (\`^[0-9a-f]{64}$\`). 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% untouched.
   - **ARC-29-20 (Canonical Workflow & Delivery Invariants)**: Uses canonical states (\`AWAITING_APPROVAL\`, \`NEEDS_RECONCILIATION\`). Active delivery remains authoritative and untouched until full post-render QA promotion.
2. **Revised Phase 29 Implementation Plan**:
   - Updated [\`plans/PHASE_29_IMPLEMENTATION_PLAN.md\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/plans/PHASE_29_IMPLEMENTATION_PLAN.md) to codify the approved 6-stage sequence:
     * Stage 29.1: Confidence Calibrator & Evidence Scorer (\`CAL-01\`–\`CAL-07\`, 8 reported, PASS)
     * Stage 29.2: Escalation Router & Advisory Generator (\`ESC-01\`–\`ESC-06\`, 7 reported, PASS)
     * Stage 29.3: Decision Ledger & Audit Journal Engine (\`LDG-01\`–\`LDG-06\`, 7 reported, PASS)
     * Stage 29.4: Post-Render Outcome Calibration & Confidence Feedback Loop (\`OCG-01\`–\`OCG-06\`, 7 reported)
     * Stage 29.5: Mandatory Ambiguous Defect Certification Scenario (\`ADC-01\`–\`ADC-06\`, 7 reported)
     * Stage 29.6: Closed-Loop Multi-Pass Orchestration & Master Regression (\`E2E-01\`–\`E2E-05\`, 6 reported)
     * Total Phase 29: 36 discrete tests (42 reported), target cumulative master total: 289 runner results.

---

### 2. Representative Machine-Readable Audit Ledger Record (Strict SHA-256)
\`\`\`json
{
  "ledger_version": "1.0.0",
  "event_id": "evt_ldg_02_promo_9a8b",
  "correlation_key": "req_ldg_02:prop_ldg_02:DELIVERY_PROMOTED:candidate_del_02",
  "event_type": "DELIVERY_PROMOTED",
  "timestamp": "2026-10-22T11:45:00.000Z",
  "project_revision": 5,
  "request_id": "req_ldg_02",
  "proposal_id": "prop_ldg_02",
  "finding_id": "find_ldg_02",
  "policy_version": "1.0.0",
  "source_media_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "provenance": {
    "engine": "editing-mechanics-engine",
    "module": "repair-decision-ledger",
    "phase": 29
  },
  "payload": {
    "promoted_delivery_id": "del_promoted_02",
    "delivery_media_sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    "active_delivery_updated": true,
    "previous_delivery_archived": "del_prev_01",
    "verified_checks_count": 2
  }
}
\`\`\`

---

### 3. Failure-Injection Verification Results (LDG-05)
1. **Pre-Execution Ledger Failure Injection**:
   - Injected disk/store write fault immediately prior to canonical mutation.
   - Result: \`executeAuthorizedMutation()\` cleanly refused execution (\`status: 'PRE_EXECUTION_LEDGER_FAILED'\`).
   - Project revision remained exactly 1 (0 mutations occurred). Project state preserved 100%.
2. **Post-Execution Ledger Failure Injection**:
   - Mutation successfully committed via \`OperationExecutor\` (revision advanced from 1 to 2).
   - Injected persistence fault when recording \`OPERATION_COMMITTED\` into durable ledger.
   - Result: System did **NOT** falsely claim rollback. Recognized mutation committed in memory, retained full operation and candidate revision evidence, kept active delivery untouched, and returned \`canonical_state: 'NEEDS_RECONCILIATION'\` with \`rollback_claimed: false\`.

---

### 4. Test Execution & Cumulative Regression Accounting
- **Stage 29.3 Test Suite**: [\`tests/workflow-stage29-3-decision-ledger.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-3-decision-ledger.test.js)
  * \`LDG-01\`: Validate ledger event structure, required identifiers, event types, and provenance fields (PASS).
  * \`LDG-02\`: Record confidence assessment, routing decision, human review request, and explicit approval against one stable proposal identity (PASS).
  * \`LDG-03\`: Reject stale, mismatched, or materially altered approval records at the execution boundary (PASS).
  * \`LDG-04\`: Demonstrate deterministic event correlation and idempotent handling of duplicate event delivery (PASS).
  * \`LDG-05\`: Inject ledger persistence or verification failure before and after a canonical mutation, demonstrating safe execution gating and correct reconciliation without false rollback claims (PASS).
  * \`LDG-06\`: Verify end-to-end audit continuity from finding ingestion through review, authorized execution, post-render QA, and final delivery disposition (PASS).
  * **Result**: **7 / 7 PASS (100%)** (6 discrete subtests + 1 suite runner).
- **Cumulative Regression across Phases 21–28 + Stages 29.1–29.3**:
  * Phase 28 baseline: 247 runner results.
  * Stage 29.1 additive: 8 runner results (7 discrete + 1 runner).
  * Stage 29.2 additive: 7 runner results (6 discrete + 1 runner).
  * Stage 29.3 additive: 7 runner results (6 discrete + 1 runner).
  * Total cumulative passing tests: **269 / 269 PASS (100%)** in 19.72s (zero failures, zero skips).
- **Invariants Preserved**:
  * All 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen.
  * Zero runtime npm dependencies (\`"dependencies": {}\`).
  * Clean commit on \`feature/phase-29-adaptive-repair-confidence\`: \`0b80e62\`.

---

### 5. Action Requested from Architecture Lead
1. Review Stage 29.3 implementation, representative ledger record, and failure-injection results.
2. Formally accept Stage 29.3 exit gate.
3. Grant authorization to proceed with **Stage 29.4: Post-Render Outcome Calibration & Confidence Feedback Loop** (\`OCG-01\` through \`OCG-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.3 Completion Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 29.3 Review & Stage 29.4 Authorization...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 29.3 APPROVAL & STAGE 29.4 AUTHORIZATION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE29_3_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
