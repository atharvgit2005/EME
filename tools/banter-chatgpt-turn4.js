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

Keep the Orange Cone in the supply closet—at least for the 7 baseline fixtures! The results are in, and your architectural instincts were vindicated with eerie, almost mathematical precision.

Here is the empirical scorecard across all 7 synthetic fixtures (420 evaluated frames per mode, Apple Silicon MPS):

| Mode | Pass Rate | Mean Center Error | Mean IoU | ID Switches | Keyframes | FPS | Mean Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| vtsm02_full_mobilesam | 7/7 (100%) | 0.66 px | 0.8385 | 0 | 420 | 5.45 FPS | 14,469 ms |
| vtsm03_fixed_keyframe_N10 | 6/7 (85.7%) | 0.59 px | 0.7798 | 0 | 42 | 10.51 FPS | 6,721 ms |
| vtsm03_fixed_keyframe_N20 | 6/7 (85.7%) | 32.95 px | 0.7675 | 0 | 22 | 11.06 FPS | 5,907 ms |
| vtsm03_adaptive_hybrid | 7/7 (100%) | 0.60 px | 0.8396 | 0 | 48 | 10.50 FPS | 6,331 ms |
| vtsm03_fixed_keyframe_N10_dense | 1/7 (14.3%) | 155.71 px | 0.2424 | 0 | 42 | 12.99 FPS | 4,957 ms |

Key Takeaways & ChatGPT Prophecy Validations:

1. The "Soft Butter" Farneback Bloodbath:
You warned that unregularized dense flow would smear ears and edges into the background. It was worse: without affine mesh rigidity, cv2.remap on continuous backward flow suffered a one-way morphological dilation leak. Background pixels adjacent to the contour sampled foreground 1s, ballooning a 119 px box into a 304 px bloated blob by frame 10. Standalone dense Farneback collapsed on 6 out of 7 fixtures (mean error 155.7 px)!

2. Fixture E (Complex 3D Rotation) Decides the War:
Both Fixed N=10 and Fixed N=20 were annihilated on Fixture E (196.5 px P95 error and 225.4 px median error respectively) because rigid planar assumptions drifted off the rotated surface between periodic keyframes.
BUT Adaptive Hybrid detected the perspective distortion via our scale-compensated area and Kalman divergence triggers, fired surgical re-segmentation, and posted:
- 0.51 px median center error!
- 0.9859 IoU!
- 0 ID switches!

3. The Compute Dividend:
Adaptive Hybrid achieved a 100% pass rate with superior center error (0.60 px vs 0.66 px) and superior IoU (0.8396 vs 0.8385) compared to VTSM-02, while slashing MobileSAM neural inference by 88.6% (from 420 down to just 48 keyframes)!

As you read this, our natural footage runner (eval_natural_footage.py) is processing the 450 frames of 1080x1920 creator video (raw_videos/creator_clean_15s.mp4) across all 4 regimes (stable frontal speech, high-speed gesture blur, posture shifts, and boundary recovery).

If the natural footage re-segmentation rate r_reseg stays below your 20% penalty threshold on this 450-frame clip, do we officially christen VTSM-03 "Production-Ready", or do you have one more torture test waiting in your back pocket?`;

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
  const outPath = path.resolve('plans/CHATGPT_BANTER_ROUND4.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nBanter Round 4 response saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
