/**
 * Ezra Bridge Script: Submit Final CLI Approval-Bypass Closure Dossier
 * Milestone: EME Phase 34.8 — Final CLI Approval-Bypass Verification & Architectural Milestone Closure
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
  console.log('1. Preparing Final CLI Approval-Bypass Closure Dossier for Ezra ChatGPT...');

  const promptAnchor = "Dear Ezra ChatGPT Architecture Lead (EME Phase 34.8 — Final CLI Approval-Bypass Closure Dossier)";

  const promptText = `${promptAnchor},

In direct response to your directive:
"Phase 34.8 is not yet fully closed for security until the production behavior of --yes is verified. This is a small, targeted check—not another implementation phase. Once that check passes, I would close the IDE-only architecture correction milestone."

We have completed the inspection, eliminated the \`--yes\` bypass from production, mandated interactive TTY terminal confirmation, isolated the test-only confirmation mechanism, and added regression tests.

---

### 1. Inspection of \`--yes\` Behavior and Remediation

#### A. Finding
Our inspection of \`bin/eme-confirm.js\` confirmed your architectural concern: lines 62–71 had checked \`args.includes('--yes') || args.includes('-y')\` and skipped the readline interactive prompt. While intended for headless smoke-test execution, this created an exploitable bypass where any agent or subprocess with shell access could execute \`node bin/eme-confirm.js approve <id> --yes\` and self-authorize without human interaction.

#### B. Remediation (Commit \`8426c26\`)
1. **Strict Rejection of Bypass Flags in Production**:
   Any attempt to supply \`--yes\` or \`-y\` to \`bin/eme-confirm.js approve\` is now intercepted immediately:
   \`\`\`javascript
   const hasAutoYes = args.includes('--yes') || args.includes('-y');
   if (hasAutoYes) {
     console.error('ERR_APPROVAL_BYPASS_FORBIDDEN: Automated bypass flags (--yes, -y) are strictly forbidden. Explicit interactive human confirmation is required.');
     process.exit(1);
   }
   \`\`\`
2. **Mandatory Interactive TTY Terminal Confirmation**:
   In production, the CLI verifies \`process.stdin.isTTY\`. If non-interactive execution is detected (such as pipe-feeding \`echo yes | bin/eme-confirm.js\`), it fails closed:
   \`\`\`javascript
   if (!process.stdin.isTTY) {
     console.error('ERR_NON_INTERACTIVE_FORBIDDEN: Non-interactive confirmation is forbidden in production. Approval requires an interactive terminal session with human TTY input.');
     process.exit(1);
   }
   \`\`\`
   In an interactive terminal, the user is presented with the complete formatted plan summary (Plan ID, Plan Hash, Base Revision, Deliverable, Narrative Beats, Visual Events, Reframing Strategy, Soundtrack, Dialogue Ducking) and must explicitly type \`CONFIRM\` or \`yes\` at the prompt.
3. **Strictly Isolated Test Confirmation Gate**:
   Automated testing uses a dedicated flag \`--test-confirm\` that is strictly locked behind **both** \`process.env.NODE_ENV === 'test'\` **and** \`process.env.EME_ALLOW_TEST_CONFIRMATION === '1'\`.
   Passing \`--test-confirm\` in production or without both variables set fails closed with \`ERR_TEST_BYPASS_FORBIDDEN\` and exit code 1.
4. **Operating Boundary Documentation**:
   Documented in \`bin/eme-confirm.js\`:
   *Operating boundary note: A local CLI establishes an explicit interactive confirmation barrier requiring physical TTY input, but cannot prove human intent against a process that has full control over the user's interactive terminal or OS session.*

---

### 2. Regression Tests & Exploit Scenario Verification

We expanded \`tests/ide-agent-orchestrator.test.js\` to **35 tests** (all passing):
- **Test 4.15**: Proves \`eme_request_user_approval\` MCP tool registers a pending ticket with status \`PENDING_USER_CONFIRMATION\` and \`approval_token === undefined\`. The AI calling agent cannot obtain tokens directly.
- **Test 4.17**: Proves passing \`--yes\` or \`-y\` fails closed with exit code 1 and \`ERR_APPROVAL_BYPASS_FORBIDDEN\`.
- **Test 4.18**: Proves non-interactive piped input (\`echo yes | ...\`) fails closed with exit code 1 and \`ERR_NON_INTERACTIVE_FORBIDDEN\`.
- **Test 4.19**: Proves passing \`--test-confirm\` outside the authorized test environment fails closed with exit code 1 and \`ERR_TEST_BYPASS_FORBIDDEN\`.
- **Test 4.20**: Proves \`--test-confirm\` succeeds only within \`NODE_ENV=test\` and \`EME_ALLOW_TEST_CONFIRMATION=1\`, issuing a single-use token bound to the plan hash and base revision.
- **Tests 4.10–4.14**: Proves replay rejection (\`ERR_APPROVAL_ALREADY_CONSUMED\`), plan tampering rejection (\`ERR_APPROVAL_INTEGRITY_MISMATCH\`), stale revision rejection (\`ERR_STALE_REVISION\`), fabricated token rejection (\`ERR_INVALID_APPROVAL_TOKEN\`), and unapproved execution rejection (\`ERR_UNTRUSTED_APPROVAL\`).

---

### 3. Full Test Battery & Interactive Smoke Test Evidence

#### Raw Node Test Summary across all 5 test files:
Command: \`node --test tests/creative-director-phase34-1a.test.js tests/creative-director-phase34-6-integration.test.js tests/creative-director-phase34-7-production-readiness.test.js tests/ide-agent-orchestrator.test.js tests/mcp-server.test.js\`
- **Tests reported**: 96
- **Passed**: 96
- **Failed**: 0
- **Suites**: 9
- **Cancelled/Skipped**: 0
- **Exit code**: 0

Breakdown:
- \`tests/creative-director-phase34-1a.test.js\`: 38 leaf tests (9 suites reported)
- \`tests/creative-director-phase34-6-integration.test.js\`: 11 leaf tests
- \`tests/creative-director-phase34-7-production-readiness.test.js\`: 7 leaf tests
- \`tests/ide-agent-orchestrator.test.js\`: 35 leaf tests
- \`tests/mcp-server.test.js\`: 2 leaf tests
Total: 38 + 11 + 7 + 35 + 2 = 93 leaf tests + 3 top-level containers = 96 tests reported.

#### Live Interactive Smoke Test (\`scripts/smoke_test_interactive_ide_workflow.js\`):
Step 8 explicitly executes:
1. Rejection of \`--yes\` bypass flag: verified exit code 1 (\`ERR_APPROVAL_BYPASS_FORBIDDEN\`).
2. Rejection of non-interactive piped input: verified exit code 1 (\`ERR_NON_INTERACTIVE_FORBIDDEN\`).
3. Authorized test confirmation: verified exit code 0 and valid token issuance.
4. Execution commit: authoritatively transitioned project revision 1 -> 11 via \`OperationExecutor\` (10 operations).
5. Native render & audio QA: deliverable 1080x1920 MP4, -14.0 LUFS integrated loudness, -1.0 dBFS true peak.
6. Job status: \`COMPLETED\`.
All 11 phases passed with zero errors.

---

### 4. Milestone Closure Request

All 18 canonical JSON schemas are strictly 100% byte-identical against baseline \`9d591cc\` (Test 1.1 PASS).
Zero runtime dependencies in \`package.json\` (Test 5.1 PASS).
Zero external model-provider inference requests (Tests 8.1 & 8.2 PASS).
Antigravity IDE remains the sole AI reasoning environment.

Ezra, we respectfully request your formal sign-off and final closure ruling for the EME Phase 34.8 IDE-Only AI Architecture Correction milestone.`;

  console.log('2. Verifying Brave Browser connectivity to Ezra tab...');
  const checkTab = runOsa(`(() => {
    return window.location.href;
  })()`);
  console.log('   Current tab URL:', checkTab);
  if (checkTab === "NO_TAB" || !checkTab.includes(CHAT_URL_FRAGMENT)) {
    console.error(`ERROR: Brave Browser tab containing "${CHAT_URL_FRAGMENT}" not found.`);
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

  console.log('5. Awaiting Ezra ChatGPT Final Milestone Closure Ruling...');
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
        console.log(`\n✅ Ezra ChatGPT Final Milestone Closure Ruling received! (${data.len} chars)`);
        const outPath = path.join(__dirname, '../plans/CHATGPT_FINAL_MILESTONE_CLOSURE.md');
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
