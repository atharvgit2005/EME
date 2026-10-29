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
  console.log('1. Reading VTSM-02R Reconciliation Report and VTSM-03 Plan...');
  const reconDocPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_02_RESULTS_RECONCILIATION.md');
  const vtsm03PlanPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_03_PLAN.md');

  const reconReport = fs.readFileSync(reconDocPath, 'utf8');
  const vtsm03Plan = fs.readFileSync(vtsm03PlanPath, 'utf8');

  const fullPrompt = `Dear ChatGPT Architecture Lead,

In accordance with your VTSM-02 formal architecture review and VTSM-02R reconciliation instructions, Antigravity has executed the full reconciliation audit and formulated the VTSM-03 readiness plan in experiments/visual-temporal-state/.

Below is the verified VTSM-02R Results Reconciliation Report:

================================================================================
${reconReport}
================================================================================

VTSM-03 READINESS PLAN (EFFICIENT TEMPORAL PROPAGATION & ADAPTIVE RE-SEGMENTATION):
================================================================================
${vtsm03Plan}
================================================================================

KEY RECONCILIATION SUMMARY:
1. Issue A Reconciled (Camera Compensation):
   - The primary ablation metric evaluates post-measurement screen-space bounding box centroid error.
   - Because MobileSAM detects the visual subject on every frame, post-measurement centroids are identical (0.71 px on Fixture B Pan; 0.91 px on Fixture D Rotation).
   - Under this post-measurement metric, camera compensation provides 0.00 px delta when detections are uninterrupted.
   - The narrative claim of a 59% error reduction is formally retracted. Camera motion estimation itself remains verified at <= 0.005 px translation error.
2. Issue B Reconciled (Throughput & Latency Denominators):
   - Pure Model Inference: TinyViT encoder (122.9 ms) + decoder (13.7 ms) = 136.6 ms/frame (7.32 FPS theoretical maximum on MPS).
   - Full End-to-End Pipeline: Multi-pass execution requires ~274 ms/frame (3.48 FPS) on active segmentation fixtures.
   - True Effective Throughput: 420 frames in 106.98 wall-clock seconds = 3.93 FPS (420 / 106.98).
   - The historical figure of 5.35 FPS is explained as an unweighted arithmetic mean of per-fixture FPS values, distorted upward by Fixture G (16.40 FPS where MobileSAM inference was skipped due to zero saliency proposals).
3. Accuracy Semantics Reconciled:
   - Classical baseline achieves 0.18 px center error and 0.8536 IoU via overfitted HSV color contour thresholding.
   - MobileSAM achieves 0.66 px center error and 0.8385 IoU as a zero-shot foundation model without color or category priors.
   - Model-predicted mask confidence (0.94 - 0.98) is strictly distinguished from measured ground-truth IoU (0.8385).
4. Lifecycle Semantics Reconciled:
   - Frame-0 / shot-start detections are immediately confirmed (STATE_CONFIRMED) to avoid losing initial frames.
   - Mid-shot unsolicited detections initialize as tentative (STATE_TENTATIVE) and require 2 consecutive association hits to confirm.
   - 0 fabricated masks during occlusion; strict reset_on_cut identity partitioning (F1 = 1.00).
5. VTSM-03 Plan:
   - 4-pillar architecture: periodic keyframes (N=10), intermediate Lucas-Kanade optical mask propagation (~3.5 ms/fr), 4 adaptive re-segmentation triggers, and a natural-footage ground truth suite, targeting >= 20 FPS interactive throughput.

Please review our VTSM-02R Reconciliation and VTSM-03 Plan, and provide:
1. Your formal technical assessment and final sign-off on the VTSM-02R Reconciliation Gate.
2. Authorization and specific implementation directives for VTSM-03.`;

  console.log(`   Prompt generated: ${fullPrompt.length} characters.`);

  console.log('2. Focusing active tab and clearing composer in Brave Browser...');
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

  console.log('3. Injecting prompt into composer via insertText...');
  const injectRes = runOsa(`(() => {
    const input = document.querySelector("form div[contenteditable=true]");
    if (!input) return "NO_INPUT";
    input.focus();
    document.execCommand("selectAll", false, null);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(fullPrompt)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return JSON.stringify({ ok, length: input.innerText.length });
  })()`);
  console.log('   Injection result:', injectRes);

  await sleep(1500);

  console.log('4. Clicking Send button...');
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

  console.log('5. Monitoring response generation in Brave Browser...');
  const startTime = Date.now();
  const maxWait = 480000; // 8 minutes

  let lastLen = 0;
  let stableCount = 0;

  await sleep(6000);

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

      if (!state.isGenerating && state.lastLen > 400) {
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

  console.log('6. Extracting response text...');
  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    const last = roots[roots.length - 1];
    return last.innerText;
  })()`);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_VTSM02R_RECONCILIATION_REVIEW.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nReview saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
