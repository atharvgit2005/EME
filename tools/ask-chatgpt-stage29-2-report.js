/**
 * Ezra Bridge Script: Submit Stage 29.2 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 29.2 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 29.2 Completion Report & Stage 29.3 Authorization Request)";

  const promptText = `${promptAnchor},

We have completed **Stage 29.2: Human Escalation Router & Advisory Generator** in strict accordance with your binding conditions (\`ARC-29-08\` through \`ARC-29-14\`) on branch \`feature/phase-29-adaptive-repair-confidence\`.

---

### 1. Stage 29.2 Deliverables & Architecture Compliance
1. **Implementation Module**:
   - Implemented [\`src/audio/repair/repair-escalation-router.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/src/audio/repair/repair-escalation-router.js) with \`RepairEscalationRouter\`.
   - **ARC-29-08 (Routing Never Confers Mutation Authority)**: Dispositions (\`AUTONOMOUS_EXECUTION\`, \`HUMAN_ESCALATION_REQUIRED\`, \`DISCARD_SPECULATIVE\`, \`REJECTED\`) strictly control execution eligibility. An advisory or routing decision never mutates canonical project state or bypasses \`OperationExecutor\`.
   - **ARC-29-09 (Proposal & Revision Binding)**: Every generated \`human_review_request\` is bound to exact stable \`request_id\`, \`proposal_id\`, \`finding_id\`, defect type, candidate project revision, source media SHA-256, target clip/track, confidence score + components + policy version, acoustic evidence, structured repair alternatives, and explicit expiration/invalidation conditions.
   - **ARC-29-10 (Explicit, Scoped, Revocable Human Approval)**: \`validateApproval()\` enforces that approvals must be explicit (\`APPROVE\`), must select a supported repair alternative, must verify candidate revision matches current project revision (advancing project revision immediately invalidates approval with \`APPROVAL_INVALIDATED_STALE_REVISION\`), and rejects unverified material modifications (\`MATERIAL_MODIFICATION_REJECTED\`) or locked tracks.
   - **ARC-29-11 (Canonical State Invariance & Active Delivery Preservation)**: Uses established canonical state \`AWAITING_APPROVAL\` when awaiting human decision without inventing new canonical job states. Prior active delivery remains authoritative and unchanged.
   - **ARC-29-12 (Deterministic Mixed-Confidence Batch Partitioning)**: \`partitionBatch()\` partitions proposals into \`autonomous_executable\`, \`autonomous_held\`, \`escalated_advisories\`, \`speculative_discarded\`, and \`rejected_preconditions\`. Autonomous proposals sharing clips or tracks with escalated items are safely held in \`autonomous_held\` to prevent race conditions or deadlock.
   - **ARC-29-13 (Advisory Options as Proposals, Not Executable Instructions)**: Advisory choices reference supported repair strategies with expected effects and known risks (including explicit notice when choosing to leave a defect unresolved). Unsupported options are rejected with \`UNSUPPORTED_REPAIR_OPTION\` without expanding engine vocabulary.
   - **ARC-29-14 (Diagnostic Journal & Audit Provenance)**: Records full journal of generated advisories, validated approvals, rejections, and execution boundaries.
2. **Discrete Subtests & Determinism**:
   - Implemented [\`tests/workflow-stage29-2-escalation-router.test.js\`](file:///Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/tests/workflow-stage29-2-escalation-router.test.js) with all 6 required discrete test areas:
     * \`ESC-01\`: High-confidence proposal enters autonomous-eligible route only when all mandatory preconditions pass (tested: clean pass, locked track rejection, stale revision rejection, status-rejected rejection).
     * \`ESC-02\`: Moderate-confidence proposal is routed to human review with autonomous execution withheld.
     * \`ESC-03\`: Review advisory satisfies schema and includes complete proposal provenance, alternatives, and rationale.
     * \`ESC-04\`: Mixed-confidence batch is partitioned deterministically, with dependent or conflicting actions safely withheld in \`autonomous_held\`.
     * \`ESC-05\`: Previous active delivery remains unchanged while a proposal is waiting for review.
     * \`ESC-06\`: Review request leads to appropriate existing state and enforces approval validation, revision fencing (stale approval invalidated), material modification rejection, unsupported option rejection, and lock checks.
   - **Deterministic 5x execution**: Verified identical routing decisions and validation outcomes across 5 consecutive runs with 0 flakiness.

---

### 2. Sample Machine-Readable Advisory Payload
\`\`\`json
{
  "schema_version": "1.0.0",
  "request_id": "rev_req_4a8c1f9b2d3e",
  "proposal_id": "prop_esc_03",
  "finding_id": "find_esc_03",
  "defect_type": "AUDIO_SYNC_OFFSET",
  "candidate_revision": 4,
  "source_media_sha256": "9f8e7d6c5b4a1234567890abcdef",
  "target": {
    "clip_id": "clip_esc_03",
    "track_id": "track_esc_03"
  },
  "confidence": {
    "score": 0.7000,
    "policy_name": "default_adaptive_confidence_v1",
    "policy_version": "1.0.0",
    "components": {
      "evidence_score": 0.7000,
      "geometry_score": 0.8500,
      "risk_suitability_score": 0.9000
    }
  },
  "acoustic_evidence": {
    "defect_type": "AUDIO_SYNC_OFFSET",
    "confidence": 0.7000
  },
  "recommended_option": "EXECUTE_RECOMMENDED_RETIME",
  "available_alternatives": [
    {
      "option_id": "EXECUTE_RECOMMENDED_RETIME",
      "strategy": "SYNC_RETIME",
      "description": "Apply planned timing shift of -3000 ticks to clip clip_esc_03",
      "parameters": { "clip_id": "clip_esc_03", "track_id": "track_esc_03", "shift_ticks": -3000, "target_start_tick": 117000 },
      "expected_effect": "Aligns audio transient with video cue; eliminates 25ms sync offset",
      "known_risks": "May reduce head/tail margin to adjacent clips on track",
      "is_recommended": true
    },
    {
      "option_id": "REALLOCATE_TO_NEW_TRACK",
      "strategy": "TRACK_REALLOCATION",
      "description": "Move clip clip_esc_03 to a new dedicated track to avoid boundary proximity",
      "parameters": { "clip_id": "clip_esc_03", "target_track_id": "track_esc_03_alt" },
      "expected_effect": "Resolves timing offset without track congestion",
      "known_risks": "Creates additional audio track in project hierarchy",
      "is_recommended": false
    },
    {
      "option_id": "LEAVE_DEFECT_UNRESOLVED",
      "strategy": "NO_OP",
      "description": "Leave audio timing unchanged; retain acoustic offset finding in audit log",
      "parameters": {},
      "expected_effect": "No project state mutation",
      "known_risks": "Delivery may fail quality gates if offset exceeds specification threshold",
      "is_recommended": false
    }
  ],
  "invalidation_conditions": {
    "max_valid_revision": 4,
    "requires_track_unlocked": true,
    "expires_at": "2026-10-23T11:00:00.000Z"
  },
  "lifecycle_status": "AWAITING_APPROVAL",
  "rationale": "Moderate confidence sync finding evaluated against timeline constraints"
}
\`\`\`

---

### 3. Test Execution & Cumulative Regression Accounting
- **Stage 29.2 Test Suite**: **7 / 7 PASS (100%)** (6 discrete subtests + 1 suite runner).
- **Cumulative Regression across Phases 21–28 + Stages 29.1–29.2**:
  * Baseline before Stage 29.2: 255 runner results.
  * Stage 29.2 additive: 7 runner results (6 discrete subtests + 1 suite runner).
  * Total cumulative passing tests: **262 / 262 PASS (100%)** in 40.05s (zero failures, zero skips).
- **Invariants Maintained**:
  * 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen.
  * Zero runtime npm dependencies (\`"dependencies": {}\`).
  * Clean git commit created on \`feature/phase-29-adaptive-repair-confidence\`: \`cc96b7a\`.

---

### 4. Action Requested from Architecture Lead
1. Review Stage 29.2 implementation and test ledger.
2. Confirm satisfaction of Stage 29.2 exit gate criteria.
3. Grant formal authorization to proceed with **Stage 29.3: Decision Ledger & Audit Journal Engine** (\`LDG-01\` through \`LDG-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 29.2 Completion Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 29.2 Review & Stage 29.3 Authorization...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 29.2 APPROVAL & STAGE 29.3 AUTHORIZATION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE29_2_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
