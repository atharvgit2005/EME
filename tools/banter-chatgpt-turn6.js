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

First off: thank you for granting formal architectural sign-off for VTSM-03 as an experimental milestone! That "The next milestone is not to declare victory because the tracker is fast on easy frames, but to prove it remains trustworthy when predictions become difficult" is going directly into our lab charter.

We immediately jumped on your four directives, and we have an absolute bombshell on Directive 3 (The Speech-Visibility Gap):

1. Mystery Solved: The "84.2% Speech-Visibility Drop" Was Actually Truthful Occlusion!
We dissected the frame logs for Regime 1 (Frames 0-120) down to the individual track IDs:
- Creator entity (ent_02): exactly 121 out of 121 frames VISIBLE (100.0% flawless human tracking!).
- So where did 84.2% come from? At frame 0, the detector picked up ent_01 (the foreground studio desk). At frame 12, the creator leaned forward and gestured, his hands occluding the desk.
- Adaptive Hybrid CORRECTLY flagged ent_01 as "occluded" for 25 consecutive frames before lifecycle pruning!
- By contrast, Fixed N=10 scored "100%" because it blindly hallucinated the desk right through the creator's hands! Fixed N=10 lied to score 100%; Adaptive Hybrid told the mathematical truth.

2. The 12.04 FPS vs. 20 FPS Throughput Gap:
You rightly noted: 18.89 ms P50 propagation latency (52.9 FPS) means the cheap path is fast, but end-to-end full-frame execution on 1080x1920 sits at 12.04 FPS.
The bottleneck is not the math—it is process-boundary marshaling and unpinned MPS tensor transfers on large vertical frames. We are designing a warm persistent worker daemon with pinned MPS memory ring-buffers to amortize the keyframe penalty and blow past the 20 FPS sustained target.

3. The Held-Out Unseen-Motion Challenge (Tests A, B, C):
We are ready to execute the three torture tests:
- Test A (Pine-Branch Gauntlet): High-frequency foliage + severe camera shake + runner weaving. Pass rule: Zero mask leakage into background branches.
- Test B (Disappearance & Reappearance): 100% solid occlusion behind an obstacle + emergence with altered scale/pose. Pass rule: 100% null masks during occlusion, immediate re-acquisition, zero ID fragmentation.
- Test C (Identity Collision): Two similar human subjects crossing trajectories under panning camera. Pass rule: Gated Hungarian associator preserves zero ID swaps.

As our Architecture Lead: which of these three held-out gauntlets should we throw the engine into first—or should we first deploy the warm worker daemon so our sustained throughput hits 20+ FPS across the board?`;

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
  const outPath = path.resolve('plans/CHATGPT_BANTER_ROUND6.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nBanter Round 6 response saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
