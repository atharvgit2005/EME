/**
 * Ezra Bridge Script: Submit Stage 29.4 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.4 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.4 Completion Report & Stage 29.5 Authorization Request)";

  const promptText = `${promptAnchor},

We have completed **Stage 29.4: Post-Render Outcome Calibration & Confidence Feedback Loop** in strict compliance with your binding conditions (\`ARC-29-21\` through \`ARC-29-27\`) on branch \`feature/phase-29-adaptive-repair-confidence\` at commit \`a13bce6\`.

---

### 1. Stage 29.4 Deliverables & Architecture Compliance
1. **Implementation Modules & Internal Calibration Contract**:
   - Implemented [\`src/audio/repair/repair-outcome-calibrator.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/repair/repair-outcome-calibrator.js) with \`RepairOutcomeCalibrator\`.
   - Created internal Draft 2020-12 contract [\`src/audio/schemas/audio-repair-calibration.v1.json\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/schemas/audio-repair-calibration.v1.json).
   - Updated [\`src/audio/repair/repair-decision-ledger.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/repair/repair-decision-ledger.js) and [\`src/audio/schemas/audio-repair-ledger.v1.json\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/schemas/audio-repair-ledger.v1.json) to support \`OUTCOME_EVALUATED\` and \`CONFIDENCE_CALIBRATED\` lifecycle events.

2. **Binding Architectural Conditions Fulfillment**:
   - **ARC-29-21 (Metric-Specific Efficacy Calculation & Boundary Handling)**:
     * Synchronization (ms and audio ticks): evaluates whether absolute measured offset moves closer to 0 within tolerance.
     * True peak (dBTP): evaluates whether the rendered result reaches the required -1.0 dBTP ceiling without excessive attenuation.
     * Zero / near-zero expected improvement: when pre-repair measurement is within tolerance (\`expectedDelta <= tolerance\`), classifies outcome as \`NO_EXPECTED_IMPROVEMENT\` with \`efficacyRatio: null\` (zero division strictly avoided).
     * Incompatible/missing/invalid measurements return \`INCONCLUSIVE\` with \`efficacyRatio: null\`.
     * Improvements smaller than measurement tolerance classify as \`INEFFECTIVE\`.
     * Distinguishes under-correction (\`UNDER_CORRECTION\`) and over-correction (\`OVER_CORRECTION\`).
   - **ARC-29-22 (Strict Binding to Exact Operation, Render Evidence & SHA-256)**:
     * Every calibration event binds exact proposal ID, operation type, candidate revision, clip ID, project revision, and media/render SHA-256.
     * Rejects mismatched candidate revisions or stale post-repair render evidence (\`isFresh: false\`) with \`STALE_RENDER_EVIDENCE\`.
   - **ARC-29-23 (Deterministic, Bounded, Explainable Confidence Adjustments)**:
     * Preserves strict 4-decimal quantization.
     * Capped at \`MAX_CONFIDENCE_CEILING = 0.9800\` (never assigns unconditional 1.0000 probability to a strategy on a single success).
     * Floored at \`MIN_CONFIDENCE_FLOOR = 0.0000\`.
     * Bounded adjustments: \`OPTIMAL_REPAIR\` (+0.0500), \`PARTIAL_IMPROVEMENT\` (+0.0200), \`UNDER_CORRECTION\` (-0.1000), \`OVER_CORRECTION\` (-0.1200), \`INEFFECTIVE\` (-0.1500), \`PROTECTED_METRIC_REGRESSION\` (-0.3000), \`DIMINISHING_RETURNS\` extra penalty (-0.1500).
   - **ARC-29-24 (Lineage Tracking, Diminishing Returns & Delivery Run Isolation)**:
     * Correlates outcome history via stable lineage key (\`clipId:operationType\` or finding fingerprint) across proposal IDs, preventing penalty evasion.
     * Two successive passes achieving < 20% expected improvement trigger \`diminishing_returns: true\`, caps confidence at \`0.4900\`, and routes to \`HUMAN_ESCALATION_REQUIRED\`.
     * \`createRunContext(newRunId)\` guarantees complete isolation between distinct delivery runs (unrelated delivery runs never inherit prior run penalties).
   - **ARC-29-25 (Decision Ledger Authority Boundary)**:
     * Emits compliant, immutable \`OUTCOME_EVALUATED\` and \`CONFIDENCE_CALIBRATED\` events into \`RepairDecisionLedger\`.
     * Escalations and regressions automatically emit corresponding \`HUMAN_REVIEW_REQUESTED\` or \`RECONCILIATION_REQUIRED\` events.
   - **ARC-29-26 (Routing Disposition Integration)**:
     * High confidence post-calibration ($\ge 0.8000$) retains \`AUTOMATIC_ELIGIBLE\`.
     * Sub-threshold ($< 0.7000$) routes to \`ROUTED_HUMAN_REVIEW\`.
     * Diminishing returns routes to \`HUMAN_ESCALATION_REQUIRED\`.
     * Protected metric regression routes to canonical \`RECONCILIATION_REQUIRED\`.
   - **ARC-29-27 (Architecture & Schema Invariants)**:
     * 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen.
     * Zero external runtime npm dependencies (\`"dependencies": {}\`).

---

### 2. Representative Machine-Readable Calibration Record (Internal Contract)
\`\`\`json
{
  "calibration_version": "1.0.0",
  "lineage_key": "clip:clip_aud_05:PEAK_ATTENUATION",
  "clip_id": "clip_aud_05",
  "operation_type": "PEAK_ATTENUATION",
  "pass_number": 1,
  "evaluation_status": "OPTIMAL_REPAIR",
  "metric_efficacy": {
    "metric_name": "peak_dbtp",
    "pre_value": 1.5,
    "post_value": -1.1,
    "target_value": -1.0,
    "expected_delta": 2.5,
    "observed_delta": 2.6,
    "efficacy_ratio": 1.04,
    "tolerance": 0.1
  },
  "protected_metrics": [],
  "prior_confidence": 0.85,
  "posterior_confidence": 0.9,
  "confidence_delta": 0.05,
  "diminishing_returns": false,
  "consecutive_diminishing_passes": 0,
  "routing_disposition": "AUTOMATIC_ELIGIBLE",
  "rationale": "Adjusted confidence by +0.0500 based on outcome OPTIMAL_REPAIR. Prior: 0.8500 -> Posterior: 0.9000."
}
\`\`\`

---

### 3. Representative Ledger Events Emitted (OUTCOME_EVALUATED & CONFIDENCE_CALIBRATED)
\`\`\`json
[
  {
    "schema_version": "1.0.0",
    "event_id": "evt_eval_4a8c9b12e7f0",
    "event_type": "OUTCOME_EVALUATED",
    "timestamp": "2026-10-22T15:13:00.000Z",
    "proposal_id": "prop_ocg_05",
    "correlation_key": "ck_prop_ocg_05_rev4_OUTCOME_EVALUATED_1",
    "project_revision": 4,
    "source_media_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "render_sha256": "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
    "target": { "clip_id": "clip_aud_05" },
    "details": {
      "lineageKey": "clip:clip_aud_05:PEAK_ATTENUATION",
      "passNumber": 1,
      "evaluationStatus": "OPTIMAL_REPAIR",
      "metricEfficacy": {
        "metric_name": "peak_dbtp",
        "pre_value": 1.5,
        "post_value": -1.1,
        "target_value": -1.0,
        "expected_delta": 2.5,
        "observed_delta": 2.6,
        "efficacy_ratio": 1.04,
        "tolerance": 0.1
      },
      "diminishingReturns": false
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "evt_conf_7f2b1c890e4a",
    "event_type": "CONFIDENCE_CALIBRATED",
    "timestamp": "2026-10-22T15:13:00.005Z",
    "proposal_id": "prop_ocg_05",
    "correlation_key": "ck_prop_ocg_05_rev4_CONFIDENCE_CALIBRATED_1",
    "project_revision": 4,
    "source_media_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "render_sha256": "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
    "target": { "clip_id": "clip_aud_05" },
    "details": {
      "priorConfidence": 0.85,
      "posteriorConfidence": 0.9,
      "confidenceDelta": 0.05,
      "routingDisposition": "AUTOMATIC_ELIGIBLE",
      "rationale": "Adjusted confidence by +0.0500 based on outcome OPTIMAL_REPAIR. Prior: 0.8500 -> Posterior: 0.9000."
    }
  }
]
\`\`\`

---

### 4. Test Execution & Cumulative Regression Accounting
- **Stage 29.4 Test Suite**: [\`tests/workflow-stage29-4-outcome-calibrator.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-4-outcome-calibrator.test.js)
  * \`OCG-01\`: Metric-specific efficacy calculation with favorable direction, tolerances, and zero expected delta (PASS).
  * \`OCG-02\`: Deterministic confidence adjustment and maximum ceiling bound without unconditional 1.0000 (PASS).
  * \`OCG-03\`: Bounded confidence penalties for under-correction, over-correction, and protected metric regression (PASS).
  * \`OCG-04\`: Lineage tracking, diminishing returns detection across two passes, and human escalation gating (PASS).
  * \`OCG-05\`: Decision ledger integration: recording OUTCOME_EVALUATED & CONFIDENCE_CALIBRATED with strict SHA-256 (PASS).
  * \`OCG-06\`: Delivery run isolation and clean penalty state reset across distinct runs (PASS).
  * **Result**: **7 / 7 PASS (100%)** (6 discrete subtests + 1 suite runner) in 9.27ms.
- **Cumulative Master Regression Suite across Phases 21–28 + Stages 29.1–29.4**:
  * Phase 28 baseline: 247 runner results.
  * Stage 29.1 additive: 8 runner results (7 discrete + 1 runner).
  * Stage 29.2 additive: 7 runner results (6 discrete + 1 runner).
  * Stage 29.3 additive: 7 runner results (6 discrete + 1 runner).
  * Stage 29.4 additive: 7 runner results (6 discrete + 1 runner).
  * Total cumulative passing tests: **276 / 276 PASS (100%)** in 14.24s (zero failures, zero skips).
- **Invariants Preserved**:
  * All 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen.
  * Zero runtime npm dependencies (\`"dependencies": {}\`).
  * Clean commit on \`feature/phase-29-adaptive-repair-confidence\`: \`a13bce6\`.

---

### 5. Action Requested from Architecture Lead
1. Review Stage 29.4 implementation, representative calibration record, ledger events, and boundary verification results.
2. Formally accept Stage 29.4 exit gate.
3. Grant authorization with binding conditions to proceed with **Stage 29.5: Mandatory Ambiguous Defect Certification Scenario** (\`ADC-01\` through \`ADC-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.4 Completion Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 29.4 Review & Stage 29.5 Authorization...');
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

  const approvalDocPath = path.resolve(__dirname, '../plans/CHATGPT_STAGE29_4_APPROVAL.md');
  fs.writeFileSync(approvalDocPath, finalMarkdown.trim() + '\n', 'utf8');
  console.log(`Saved Architecture Lead decision to: ${approvalDocPath}`);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
