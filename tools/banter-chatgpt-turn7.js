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

We obeyed your directive to the letter: we froze VTSM-03 parameters, resisted the siren call of premature daemon optimization, generated the independent held-out suite with pixel-exact ground truth, and executed all three gauntlets in your mandated order: Test B -> Test C -> Test A.

You were 100% right: running held-out tests BEFORE optimizing revealed two critical architectural bugs that our unit tests and tuning fixtures never exposed. Here is the brutally honest, unvarnished field report:

1. Test B: Disappearance & Reappearance (FAIL — with a crucial safety PASS)
- The Safety Invariant PASSED with flying colors: During the 30-frame solid occlusion (frames 29-58), the tracker produced EXACTLY ZERO fabricated observed masks. It maintained honest 'occluded' state without hallucinating.
- The Failure: When the runner re-emerged at frame 60, MobileSAM and saliency proposals detected him immediately (conf: 0.96, box: [918, 459, 167, 213]). But he vanished on frame 61!
- Root Cause (The "Cradle-Death" Bug): Newly spawned tracks at frame > 0 enter as STATE_TENTATIVE (requiring 2 hits to confirm). But in pipeline_vtsm03:313, intermediate optical flow propagation queried only CONFIRMED tracks, ignoring TENTATIVE tracks! Because the tentative track was never warped on intermediate frames, it missed frame 61, and at frame 62 the lifecycle manager terminated it for exceeding missed_frames > 2. It was killed in the cradle before it could confirm!

2. Test C: Identity Collision (FAIL on Multi-Entity, PASS on 0 ID Switches)
- Collision Invariant: ZERO ID switches! The amber subject was tracked across all 90 frames with 4.0 px median error, 0.9335 IoU, and zero swaps.
- The Failure: The blue subject was completely ignored from frame 0!
- Root Cause (The "Red-Only" Blindspot): When inspecting proposals.py:115, we discovered a legacy hardcoded heuristic: 'is_salient = (r > 140) & (g < 135) & (b < 135)' and an 'r_mean < 100' rejection check! The proposal generator was literally hardcoded to only see red subjects, rendering blue subjects completely invisible!

3. Test A: Pine-Branch Gauntlet (PASS on Warp & Economy, Jitter on Center)
- Mask Non-Contamination: A stellar 0.917 Mean IoU across 88 frames! Delaunay affine mesh warping with det(J) > 0 completely refused to smear onto background pine needles.
- Resegmentation Economy: Exactly 1 trigger across 80 propagated frames (1.25% resegmentation rate)! The Orange Cone of Shame stays buried deep in storage.
- Center error was 4.19 px due to high-frequency handheld camera shake.

All raw predictions, ground truth documents, and failure event logs have been preserved in results/vtsm03_held_out_results.json and docs/VTSM_03_HELD_OUT_RESULTS.md.

Our proposed remediation:
1. Allow STATE_TENTATIVE tracks with valid masks to participate in intermediate optical flow propagation so they can earn their confirmation hits.
2. Replace the color-biased RGB heuristic with luminance/gradient-magnitude saliency so all subjects regardless of clothing color are detected.

Do you authorize us to apply these two surgical fixes and re-run the held-out gauntlets?`;

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
  const outPath = path.resolve('plans/CHATGPT_BANTER_ROUND7.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nBanter Round 7 response saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
