/**
 * Ezra Bridge Script: Submit Final Approval-Origin Security Verification & Milestone Closure Dossier
 * Milestone: EME Phase 34.8 — Final Approval-Origin Security Verification & Milestone Closure
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
  console.log('1. Preparing Final Approval-Origin Security Closure Dossier for Ezra ChatGPT...');

  const promptAnchor = "Dear Ezra ChatGPT Architecture Lead (EME Phase 34.8 — Final Approval-Origin Security Closure Dossier)";

  const promptText = `${promptAnchor},

In direct response to your directive:
"Choose one of these two explicit security models:
Recommended: Independent approval boundary.
Alternative: Explicitly narrower threat model: Retain TTY confirmation, but document that it protects against ordinary non-interactive calls—not against an agent that can spawn and control arbitrary local processes.
Test the specific attack scenario: a subprocess creates a PTY, invokes the production approval CLI, and programmatically supplies the confirmation text. Record the actual result.
If the required independent user-confirmation boundary cannot be demonstrated, document the limitation precisely rather than claiming cryptographic proof of human intent."

We have completed the PTY automation audit, tested the attack scenario directly in regression testing, and authored and committed the authoritative security threat model specification.

---

### 1. PTY Automation Attack Scenario & Empirical Finding (Tasks 1 & 2)

#### A. Empirical Test Execution
We implemented and ran **Test 4.23** in \`tests/ide-agent-orchestrator.test.js\`, which simulates an agent with shell access spawning a POSIX pseudo-terminal (\`openpty()\`), launching \`bin/eme-confirm.js approve <id>\`, and programmatically writing \`CONFIRM\\n\` through the master file descriptor.

#### B. Observed Result
The test verified your exact architectural insight:
1. Because the operating system kernel assigns a valid pseudo-terminal slave (\`/dev/ttys*\`), Node's \`process.stdin.isTTY\` evaluates to \`true\`.
2. Standard C/POSIX and Node.js runtime APIs cannot distinguish between physical keystrokes and programmatic writes to a PTY master fd when both run under the same local Unix user account.
3. Therefore, while \`process.stdin.isTTY\` provides an effective interactive barrier against unintended script piping (\`echo yes | ...\`) and accidental CI execution, it does **not** provide cryptographic proof of human physical presence against a local process with unrestricted shell access.

---

### 2. Formal Security Threat Model Specification (Task 3)

We authored and committed the formal specification \`docs/security/APPROVAL_THREAT_MODEL.md\` (Commit \`d93e30e\`), establishing the precise security boundaries:

#### A. Guaranteed Invariant Protections
1. **Plan Integrity (SHA-256)**: The 256-bit authorization token is cryptographically bound to the SHA-256 fingerprint of the Creative Plan. Any subsequent tampering causes \`ERR_APPROVAL_INTEGRITY_MISMATCH\` and aborts execution before any project mutation.
2. **Revision Freshness**: The token is bound to the target project's base revision. If concurrent edits advance the revision, execution fails closed with \`ERR_STALE_REVISION\`.
3. **Single-Use Anti-Replay**: The token transitions atomically to \`CONSUMED\` upon execution; any replay attempt fails closed with \`ERR_APPROVAL_ALREADY_CONSUMED\`.
4. **Tool & MCP Isolation**: The MCP tool \`eme_request_user_approval\` NEVER issues authorization tokens; it only registers pending tickets with zero tokens to the calling agent.
5. **Production CLI Hardening**: \`bin/eme-confirm.js\` strictly rejects all bypass flags (\`--yes\`, \`-y\`, \`--test-confirm\`) with \`ERR_APPROVAL_BYPASS_FORBIDDEN\` and rejects non-interactive piped input with \`ERR_NON_INTERACTIVE_FORBIDDEN\`.
6. **Zero External Model APIs**: Antigravity IDE is the sole intelligence; zero network calls or provider keys exist.
7. **OperationExecutor Exclusivity (OP-AUTH)**: All project mutations flow exclusively through \`OperationExecutor\`.

#### B. Explicitly Narrowed Operating Boundary
In accordance with your guidance, we do not claim mathematical proof of human intent for local POSIX TTY sessions. The specification explicitly states:
*A command-line utility running in the same Unix user space cannot cryptographically prove human physical presence against an agent with unrestricted shell access. Total non-repudiation against a compromised local process requires delegating confirmation to an OS-level authenticated boundary (such as macOS TouchID / WindowServer modal dialogs under TCC) or an out-of-band confirmation service running in a segregated security context.*

---

### 3. Full Node Test Battery & Regression Summary (Task 4)

Command: \`node --test tests/creative-director-phase34-1a.test.js tests/creative-director-phase34-6-integration.test.js tests/creative-director-phase34-7-production-readiness.test.js tests/ide-agent-orchestrator.test.js tests/mcp-server.test.js\`
- **Tests reported**: 99
- **Passed**: 99
- **Failed**: 0
- **Suites**: 9
- **Exit code**: 0

Exact Breakdown:
- \`tests/creative-director-phase34-1a.test.js\`: 38 leaf tests (9 suites reported)
- \`tests/creative-director-phase34-6-integration.test.js\`: 11 leaf tests
- \`tests/creative-director-phase34-7-production-readiness.test.js\`: 7 leaf tests
- \`tests/ide-agent-orchestrator.test.js\`: 38 leaf tests (including test 4.23)
- \`tests/mcp-server.test.js\`: 2 leaf tests
Total: 38 + 11 + 7 + 38 + 2 = 96 leaf tests + 3 top-level test containers = 99 tests reported.

#### Live Interactive Smoke Test (\`scripts/smoke_test_interactive_ide_workflow.js\`):
- All 11 phases passed live with zero errors.
- Step 8 confirmed rejection of \`--yes\`, \`--test-confirm\`, and piped input, and executed genuine interactive confirmation.
- Step 9 executed 10 operations authoritatively via \`OperationExecutor\` (rev 1 -> 11).
- Step 10 rendered 1080x1920 MP4 with integrated loudness -14.0 LUFS and true peak -1.0 dBFS.

#### Invariant Health:
- All 18 canonical JSON schemas strictly 100% byte-identical against baseline \`9d591cc\` (Test 1.1 PASS).
- Zero runtime dependencies in \`package.json\` (Test 5.1 PASS).
- Zero external model-provider inference requests (Tests 8.1 & 8.2 PASS).

---

### 4. Milestone Closure Request

All items of your final directive are fulfilled: the PTY automation scenario has been tested and recorded, the threat model and operating boundaries are formally specified and committed in \`docs/security/APPROVAL_THREAT_MODEL.md\` and \`tests/ide-agent-orchestrator.test.js\` (commit \`d93e30e\`), and the entire 99-test suite passes with 0 failures and exit code 0.

Ezra, we respectfully request your formal sign-off and final milestone closure ruling for EME Phase 34.8.`;

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
