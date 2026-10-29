const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

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
  console.log('1. Reading VTSM-02 Phase 2 Results and Exit Gate...');
  const resultsDocPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_02_RESULTS.md');
  const exitGateDocPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_02_EXIT_GATE.md');

  const resultsReport = fs.readFileSync(resultsDocPath, 'utf8');
  const exitGateReport = fs.readFileSync(exitGateDocPath, 'utf8');

  const fullPrompt = `Dear ChatGPT Architecture Lead,

In accordance with your step-by-step Phase 2 directives, Antigravity has executed Phase 2 — Modular Tracking Implementation and Full Ablation Benchmark in experiments/visual-temporal-state/.

Below is the verified Phase 2 Results Report and Exit Gate Audit:

================================================================================
${resultsReport}
================================================================================

EXIT GATE VERIFICATION:
================================================================================
${exitGateReport}
================================================================================

KEY PHASE 2 FINDINGS & SUMMARY:
1. Workspace Safety: Protected src/, bin/, schema/, package files, certified releases, and live pilot artifacts remain 100% bit-for-bit pristine.
2. Architecture & Latency Findings:
   - Full-pipeline latency on Apple Silicon MPS: ~136 ms/frame (~7.3 FPS). Real-time 50ms claims were honestly refuted; warm MPS GPU acceleration is documented with empirical microbenchmarks.
   - Hybrid Perception: PyTorch TinyViT encoder + MobileSAM decoder + timestamp-aware Kalman motion predictor + RANSAC camera compensation + gated Hungarian associator.
3. Ablation Findings across 7 Fixtures (A–G):
   - mobilesam_kalman_camera achieved 0.68 – 1.44 px median center error and zero identity switches on dynamic tracks.
   - Occlusion handling: zero fabricated masks during total occlusion behind pillars, with clean track re-acquisition upon reappearance.
   - Hard scene cuts: strict identity reset enforced (ent_01 -> ent_02) with zero invalid cross-shot carryover.
   - Ambiguity stress test (Fixture G): 59/59 low-confidence frames correctly flagged without hallucinated tracks.
4. Exit Gate Disposition: PASS (All 7 Quality & Safety Gates Satisfied).

Please review our Phase 2 results and provide:
1. Your formal technical assessment and disposition on the VTSM-02 Exit Gate.
2. Directives regarding next steps in the roadmap.`;

  console.log(`   Prompt generated: ${fullPrompt.length} characters.`);

  console.log('2. Staging prompt to clipboard via pbcopy...');
  const tmpPath = '/tmp/vtsm02_phase2_dispatch.txt';
  fs.writeFileSync(tmpPath, fullPrompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing active tab and clearing composer in Brave Browser...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.4
        return "ACTIVATED"
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  spawnSync('osascript', ['-e', focusScript]);

  const prepRes = runOsa(`(() => {
    const input = document.querySelector("form div[contenteditable=true]");
    if (!input) return "NO_INPUT";
    input.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    return "CLEARED_AND_FOCUSED";
  })()`);
  console.log('   Prep result:', prepRes);

  await sleep(600);

  console.log('4. Pasting prompt via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1500);

  console.log('5. Submitting message (Send button or Return key)...');
  const sendRes = runOsa(`(() => {
    const form = document.querySelector("form");
    const btns = Array.from((form || document).querySelectorAll("button"));
    const sendBtn = btns.find(b => {
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      const testid = (b.getAttribute("data-testid") || "").toLowerCase();
      return (aria.includes("send") || testid.includes("send")) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return "CLICKED_SEND: " + (sendBtn.getAttribute("aria-label") || sendBtn.className);
    }
    return "NO_SEND_BTN";
  })()`);
  console.log('   Send button click:', sendRes);

  if (!sendRes.startsWith('CLICKED_SEND')) {
    console.log('   Fallback: sending Return key via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('6. Waiting for ChatGPT response generation to complete...');
  const startTime = Date.now();
  const maxWait = 420000; // 7 mins

  let lastLength = 0;
  let stableCount = 0;
  const initialTurnsCount = 12; // Current is 11, new turn will be 12

  await sleep(5000);

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

      if (!state.isGenerating && state.lastLen > 200 && state.turnsCount >= initialTurnsCount) {
        if (state.lastLen === lastLength) {
          stableCount++;
          if (stableCount >= 3) {
            console.log('\n   ChatGPT finished response generation!');
            break;
          }
        } else {
          stableCount = 0;
          lastLength = state.lastLen;
        }
      }
    } catch (e) {}
  }

  console.log('7. Extracting response text...');
  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    const last = roots[roots.length - 1];
    return last.innerText;
  })()`);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_VTSM02_PHASE2_REVIEW.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
