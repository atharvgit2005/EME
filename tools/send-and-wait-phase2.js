const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad37a95-9d9c-83e8-9ff2-983c87bd8947";

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8" });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Submitting prompt by clicking Send button in ChatGPT...');
  const sendRes = runOsa(`(() => {
    const form = document.querySelector("form");
    const btns = Array.from((form || document).querySelectorAll("button"));
    const sendBtn = btns.find(b => {
      const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
      const testid = (b.getAttribute("data-testid") || "").trim().toLowerCase();
      return (aria === "send" || testid === "send-button" || aria.includes("send")) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return "CLICKED_SEND";
    }
    return "NO_SEND_BTN";
  })()`);

  console.log('   Send click result:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.error('Failed to find Send button!');
    process.exit(1);
  }

  console.log('2. Waiting for response generation to commence and complete...');
  const startTime = Date.now();
  const maxWait = 480000; // 8 minutes

  let lastLen = 0;
  let stableCount = 0;
  const initialTurnsCount = 12;

  // Initial wait for generation to start
  await sleep(4000);

  while (Date.now() - startTime < maxWait) {
    await sleep(3000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector("[data-testid=stop-button], button[aria-label*=\\"Stop\\" i]");
      const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
      const lastTurn = roots.length > 0 ? roots[roots.length - 1] : null;
      return JSON.stringify({
        isGenerating: !!stopBtn,
        turnsCount: roots.length,
        lastLen: lastTurn ? (lastTurn.innerText || "").length : 0
      });
    })()`);

    try {
      const state = JSON.parse(checkRes);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`   [${elapsed}s] generating=${state.isGenerating}, turns=${state.turnsCount}, len=${state.lastLen}\r`);

      if (state.turnsCount >= initialTurnsCount && !state.isGenerating && state.lastLen > 200) {
        if (state.lastLen === lastLen) {
          stableCount++;
          if (stableCount >= 3) {
            console.log('\n   ChatGPT finished generating response!');
            break;
          }
        } else {
          stableCount = 0;
          lastLen = state.lastLen;
        }
      }
    } catch (e) {}
  }

  console.log('3. Extracting latest response text...');
  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    const last = roots[roots.length - 1];
    return last.innerText;
  })()`);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_VTSM02_PHASE2_REVIEW.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nReview saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
