/**
 * Ezra Bridge Script: Inquire Next Phase / Architectural Directive
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
  console.log('1. Querying Ezra ChatGPT for Next Milestone / Engineering Directive...');

  const promptAnchor = "Dear Ezra ChatGPT Architecture Lead (Next Phase / Milestone Directive)";

  const promptText = `${promptAnchor},

Phase 34.8 (EME Architecture Correction — IDE-Only AI, Zero External Model APIs) has been formally accepted and closed per your ruling in CHATGPT_FINAL_MILESTONE_CLOSURE.md.

The current system state:
1. Antigravity IDE is the sole AI reasoning orchestrator.
2. 8 local MCP tools (+ approval request tool) are exposed via bin/eme-mcp.js stdio JSON-RPC.
3. Out-of-band human confirmation CLI (bin/eme-confirm.js) requires interactive TTY input and issues single-use cryptographic tokens bound to { plan_hash, project_revision }.
4. The security threat model is committed in docs/security/APPROVAL_THREAT_MODEL.md.
5. All 99 regression tests across 9 suites pass (0 failures, exit code 0).
6. 100% preservation of all 18 canonical baseline schemas against 9d591cc.
7. Zero runtime dependencies in package.json.

The user has instructed us to continue.
What is the next phase, milestone, or architectural directive for the Editing Mechanics Engine project? Please provide the next specification or instructions.`;

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

  console.log('5. Awaiting Ezra ChatGPT Next Directive...');
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
        console.log(`\n✅ Ezra ChatGPT Next Directive received! (${data.len} chars)`);
        const outPath = path.join(__dirname, '../plans/CHATGPT_NEXT_DIRECTIVE.md');
        fs.writeFileSync(outPath, data.text, 'utf8');
        console.log(`✅ Saved directive to: ${outPath}`);
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
