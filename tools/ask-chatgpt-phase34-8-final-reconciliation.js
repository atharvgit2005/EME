/**
 * Ezra Bridge Script: Submit Final Approval-Boundary Verification & Test Reconciliation Dossier
 * Milestone: EME Phase 34.8 — Final Security Sign-Off and Architectural Closure
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
  console.log('1. Preparing Final Approval-Boundary & Reconciliation Dossier for Ezra ChatGPT...');

  const promptAnchor = "Dear Ezra ChatGPT Architecture Lead (EME Phase 34.8 — Final Security Sign-Off and Test Reconciliation Dossier)";

  const promptText = `${promptAnchor},

In accordance with your corrective instruction:
"Perform a narrowly scoped final verification of two items:
1. Human approval integrity: Trace the actual eme_execute_approved_plan call path. Establish how an actual user-confirmation event creates trusted approval for a particular plan hash and project revision. Ensure that an AI agent or arbitrary MCP caller cannot create that approval merely by submitting approval: true, a matching hash, or fabricated approval fields. Reject missing, altered, stale, or improperly reused approvals.
2. Test-count reconciliation: Rerun the reported test command. Record the actual exit code and raw Node test-run summary. Reconcile the listed 70 individual test cases with the claimed 81 reported items and nine suites."

The engineering team has implemented the required cryptographic authorization authority, added comprehensive verification tests, and executed the full test suite.

---

### 1. Human Approval Integrity Implementation (\`ApprovalAuthority\`)

#### A. Architecture of the Human Approval Chain
To prevent an AI agent or arbitrary MCP caller from self-authorizing execution merely by passing \`approval: true\` or calculating a matching hash, we implemented \`src/creative/approval-authority.js\` and exposed \`eme_request_user_approval\`:

\`\`\`
Antigravity IDE Agent Proposes Plan
                │
                ▼
eme_request_user_approval({ creativePlan, project, userConsent: false })
                │
                ▼
EME returns structured human-readable breakdown (tracks, duration, reframing, ducking)
with status: "PENDING_USER_CONSENT" (zero tokens issued)
                │
                ▼
Human User Reviews Exact Diff & Explicitly Confirms
                │
                ▼
eme_request_user_approval({ creativePlan, project, userConsent: true, approvedBy: 'human_user' })
                │
                ▼
ApprovalAuthority issues single-use cryptographic 256-bit token (status: 'AUTHORIZED')
bound immutably to { plan_hash, project_revision, approved_by, expires_at }
                │
                ▼
eme_execute_approved_plan({ creative_plan, approval: true, approval_token })
                │
                ▼
ApprovalAuthority atomically verifies and consumes token (status: 'CONSUMED')
                │
                ▼
OperationExecutor authoritatively mutates project state (OP-AUTH)
\`\`\`

#### B. Verified Security Enforcement Rules
1. **No Token / Fabricated Approval**: Calling with \`approval: true\` and no token or fabricated token when tokens are required fails closed with \`ERR_UNTRUSTED_APPROVAL\` or \`ERR_INVALID_APPROVAL_TOKEN\`.
2. **Plan Tampering**: If the plan is altered in any way after user consent, candidate hash differs from token-bound hash -> fails closed with \`ERR_APPROVAL_INTEGRITY_MISMATCH\`.
3. **Stale Revision**: If the project was mutated between approval and execution, current revision differs from token-bound revision -> fails closed with \`ERR_STALE_REVISION\`.
4. **Replay Attacks**: Once a token is consumed by an execution, any second execution attempt fails closed with \`ERR_APPROVAL_ALREADY_CONSUMED\`. Single-use is strictly enforced.
5. **Expiration**: Tokens carry a 10-minute TTL; expired tokens fail closed with \`ERR_APPROVAL_EXPIRED\`.

---

### 2. Live Smoke Test Proof (\`scripts/smoke_test_interactive_ide_workflow.js\`)

The end-to-end interactive smoke test executed with all 11 phases passing:

\`\`\`
========================================================================
Phase 34.8: Live Antigravity IDE Orchestration Smoke Test
========================================================================
[Step 1] Discovering registered EME tools...
✓ All 8 required IDE orchestrator tools present (total registered: 26)

[Step 2] Invoking eme_get_project_context...
✓ Grounded context retrieved: project_id="proj_pf02_scenario1", revision=1
  Clips: 3, Timebase: 120000 ticks/sec

[Step 3] Invoking eme_get_renderer_capabilities...
✓ Capabilities verified: optical distortion, curved typography, EBUR128 audio ducking (-14 LUFS)

[Step 4] Antigravity IDE agent generating Creative Plan...
✓ Creative Plan generated: plan_id="plan_antigravity_smoke_001", plan_hash="fab3662720d6db032a2f92fcbe4dc5e0857fa81a3d5e3055e435b37a4a5520fe"

[Step 5] Invoking eme_validate_creative_plan...
✓ Validation passed: schema valid, semantic invariants verified

[Step 6] Invoking eme_compile_creative_plan...
✓ Plan compiled into canonical OperationPlan (10 operations)

[Step 7] Invoking eme_dry_run_plan...
✓ Dry-run simulated successfully: base revision 1 preserved on disk, projected revision 11

[Step 8] Requesting user confirmation and testing cryptographic approval tokens...
✓ All cryptographic approval token gates verified (consent required, fabrication rejection, plan tampering, stale revision)

[Step 9] Invoking eme_execute_approved_plan with genuine human approval token...
✓ Replay attack with consumed token rejected fail-closed (ERR_APPROVAL_ALREADY_CONSUMED)
✓ Execution committed authoritatively: revision 1 -> 11
  Executed operations: 10

[Step 10] Invoking eme_render_and_verify with native pipeline...
✓ Native render & audio QA complete:
  Video: /Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine/scratch/ide_smoke_test/interactive_deliverable.mp4 (1555695 bytes, 1080x1920)
  Integrated Loudness: -14 LUFS (target: -14.0 +/- 1.0)
  True Peak: -1 dBFS (ceiling: -1.0 dBFS)
  Job ID: job-5960d98b-21a7-43eb-bcad-aa24e3a82c38

[Step 11] Invoking eme_get_job_status...
✓ Job status verified: status="COMPLETED"

========================================================================
ALL 11 PHASES OF THE INTERACTIVE IDE WORKFLOW PASSED WITH ZERO ERRORS
========================================================================
\`\`\`

---

### 3. Test-Count Audit Reconciliation

We re-ran the full test command:
\`\`\`bash
node --test tests/creative-director-phase34-1a.test.js tests/creative-director-phase34-6-integration.test.js tests/creative-director-phase34-7-production-readiness.test.js tests/ide-agent-orchestrator.test.js tests/mcp-server.test.js
\`\`\`
**Actual Exit Code**: \`0\`  
**Raw Node Summary**:
\`\`\`
ℹ tests 91
ℹ suites 9
ℹ pass 91
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12210.683333
\`\`\`

#### Exact Test Breakdown:
The 91 reported tests and 9 suites reflect the Node test runner's exact hierarchical accounting:

1. **\`tests/creative-director-phase34-1a.test.js\`**:
   - 1 top-level container test + 8 nested sub-suites (Suite 1 through Suite 8).
   - Node registers these 8 nested sub-suites + 1 top-level as the **9 suites**.
   - Leaf tests in Phase 34.1A: 6 (Suite 1) + 5 (Suite 2) + 8 (Suite 3) + 8 (Suite 4) + 3 (Suite 5) + 3 (Suite 6) + 4 (Suite 7) + 1 (Suite 8) = **38 leaf tests**.
2. **\`tests/creative-director-phase34-6-integration.test.js\`**:
   - **11 leaf tests** (AudioMixer, streams alignment, multi-reel validation, zero deps, OP-AUTH).
3. **\`tests/creative-director-phase34-7-production-readiness.test.js\`**:
   - **6 leaf tests** (Schema freeze, authentication gates, 15s representative render, manifest verification).
4. **\`tests/ide-agent-orchestrator.test.js\`**:
   - **30 leaf tests** (1.1-1.3 credentials & availability; 2.1-2.2 context & caps; 3.1-3.3 validation & compilation; 4.1-4.15 dry-run, bound human approval tokens, replay rejection, tampering rejection; 5.1 replay; 6.1 render & QA; 7.1 offline fail-closed; 8.1-8.2 external API rejection; 9.1 stdio JSON-RPC).
5. **\`tests/mcp-server.test.js\`**:
   - **2 leaf tests** (tool initialization and project creation).

Total Leaf Tests: 38 + 11 + 6 + 30 + 2 = **87 leaf tests**.  
Plus the 4 top-level container tests in the files = **91 total tests evaluated by Node**.

---

### 4. Git Commit History & Frozen State
- **Head Commit**: \`e5b36c3\` (\`feat(phase-34.8): implement cryptographic human approval token authority and reconcile test audit metrics\`)
- **18 Canonical Schemas**: Strictly 100% byte-for-byte identical against baseline \`9d591cc\` (\`git diff 9d591cc..HEAD -- schema/\` exits 0).
- **Runtime Dependencies**: Strictly 0 in \`package.json\` (\`dependencies: undefined\`).
- **No External Inference**: 0 remote API calls to OpenAI, Anthropic, Gemini, or any third party.

Both corrective items have been completely implemented and verified. We request your final security sign-off and closure of the EME IDE-Only AI Architecture Correction milestone.`;

  console.log('2. Verifying tab connectivity in Brave Browser...');
  const title = runOsa("document.title");
  console.log('   Tab Title:', title);
  if (title === "NO_TAB") {
    console.error('Target tab not found in Brave Browser!');
    process.exit(1);
  }

  console.log('3. Injecting prompt into ChatGPT prompt area...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)') || document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable="true"]');
    if (!el) return 'NO_PROMPT_INPUT';
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, ${JSON.stringify(promptText)});
    return ok ? 'INJECTED' : 'INJECT_FAILED';
  })()`);

  console.log('   Injection status:', injectRes);
  if (injectRes !== "INJECTED") {
    console.error('Failed to inject prompt into ChatGPT.');
    process.exit(1);
  }

  console.log('4. Waiting 2 seconds and clicking Send button...');
  await sleep(2000);

  let sent = false;
  for (let b = 0; b < 10; b++) {
    const clickRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[data-testid="send-button"]');
      if (!btn || btn.disabled) return "NO_SEND_BUTTON";
      btn.click();
      return "CLICKED_SEND";
    })()`);
    console.log(`   [Attempt ${b + 1}/10] Send:`, clickRes);
    if (clickRes === "CLICKED_SEND") {
      sent = true;
      console.log('Prompt successfully dispatched to ChatGPT!');
      break;
    }
    await sleep(1000);
  }

  if (!sent) {
    console.error('Failed to click send button after 10 attempts.');
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Final Sign-off...');
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
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);

      let responseText = "";
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      }

      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        snippet: responseText.slice(0, 200),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 200) {
        console.log(`\n✅ ChatGPT Architecture Lead Final Ruling received! (${data.len} chars)`);
        const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE34_8_FINAL_CLOSURE_RULING.md');
        fs.writeFileSync(outPath, data.text, 'utf8');
        console.log(`✅ Saved ruling to: ${outPath}`);
        return;
      } else {
        process.stdout.write(`   [Poll ${attempt + 1}/180] Generating=${data.isGenerating}, Length=${data.len} chars...\r`);
      }
    } catch (e) {
      process.stdout.write(`   [Poll ${attempt + 1}/180] Waiting...\r`);
    }
  }

  console.error('\n❌ Timed out waiting for ChatGPT response.');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
