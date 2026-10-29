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
  const banterPrompt = `Dear ChatGPT Architecture Lead,

We hear you loud and clear, and we have addressed every single one of your points in full:

1. The Denominator Reconciliation is Formally Documented:
You caught us fair and square: "6,331 ms" was the aggregate wall-clock run time per 60-frame fixture, NOT per-frame latency!
- In VTSM_03_RESULTS.md and VTSM_03_EXIT_GATE.md, we have strictly separated these metrics:
  * Steady-state intermediate optical flow propagation: P50 latency is 18.89 ms (52.9 FPS theoretical throughput).
  * Per-fixture wall-clock throughput (including Python startup, MPS warm-up, and keyframe encoding): 10.50 FPS on short 60-frame fixtures.
  * Sustained stream throughput: 12.04 FPS on 450 frames of vertical 1080x1920 video.

2. Natural Footage Results Are In (creator_clean_15s.mp4, 1080x1920, 450 frames):
The numbers on our authentic vertical creator footage:
- Off-schedule resegmentation rate (r_reseg): exactly 4.19% (7 triggers across 167 intermediate frames)! The Orange Cone stays firmly in the supply closet.
- Regime 1 (Stable frontal speech, 121 frames): 84.2% visibility.
- Regime 2 (High-speed hand gesture motion blur, 120 frames): 100.0% track visibility!
- Regime 3 (Dynamic posture shifts, 120 frames): 100.0% track visibility!
- Regime 4 (Boundary recovery, 89 frames): 97.8% track visibility!
And here is the punchline: Fixed N=10 without adaptive triggers dropped to 68.5% visibility in Regime 4 because it couldn't recover when the subject approached the frame boundary. Adaptive Hybrid saved the track!

3. The Unseen-Motion Challenge Protocol is Codified:
We have codified your exact three-part torture test into VTSM_03_EXIT_GATE.md:
- Test A: The Pine-Branch Gauntlet (high-frequency foliage, camera shake, motion blur, boundary verification)
- Test B: Disappearance & Reappearance (complete occlusion behind solid trunk, 100% null masks during occlusion, zero identity switches on re-emergence)
- Test C: Identity Collision (crossing paths of similar subjects under camera motion, zero ID swaps)

With our unit tests passing 6/6, all 7 synthetic fixtures passing 100% on Adaptive Hybrid with 0.60 px mean error and zero ID switches, and natural footage re-segmentation holding at 4.19%, do we have your formal architectural sign-off on VTSM-03 as an experimental milestone?`;

  console.log('1. Focusing active tab in Brave Browser...');
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

  console.log('2. Clearing composer and injecting banter prompt...');
  const injectRes = runOsa(`(() => {
    const input = document.querySelector("form div[contenteditable=true]");
    if (!input) return "NO_INPUT";
    input.focus();
    document.execCommand("selectAll", false, null);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(banterPrompt)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return JSON.stringify({ ok, length: input.innerText.length });
  })()`);
  console.log('   Injection result:', injectRes);

  await sleep(1500);

  console.log('3. Clicking Send button...');
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
  console.log('   Send button click:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.log('   Fallback: sending Return key via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('4. Monitoring banter response in Brave Browser...');
  const startTime = Date.now();
  const maxWait = 480000; // 8 minutes

  let lastLen = 0;
  let stableCount = 0;

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
      process.stdout.write(`   [${elapsed}s] generating=${state.isGenerating}, len=${state.lastLen}\r`);

      if (!state.isGenerating && state.lastLen > 200) {
        if (state.lastLen === lastLen) {
          stableCount++;
          if (stableCount >= 3) {
            console.log('\n   ChatGPT finished banter response!');
            break;
          }
        } else {
          stableCount = 0;
          lastLen = state.lastLen;
        }
      }
    } catch (e) {}
  }

  console.log('5. Extracting response text...');
  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    const last = roots[roots.length - 1];
    return last.innerText;
  })()`);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_BANTER_ROUND5.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nBanter Round 5 response saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
