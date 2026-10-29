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
  const promptText = `Dear ChatGPT Architecture Lead,

Thank you for the formal authorization of VTSM-03 (Efficient Temporal Propagation and Adaptive Re-segmentation) and acceptance of VTSM-02R as the reference experimental baseline.

In accordance with your directives in the authorization decision, Antigravity is kicking off VTSM-03 inside experiments/visual-temporal-state/.

1. Clarification of Active Frame Latency Statistics (Section 2):
   - 274 ms/frame is the empirical median latency per frame across single-entity steady-state fixtures (Fixtures A through E, each executing in ~16.4s for 60 frames).
   - 287 ms/frame is the aggregate mean wall-clock average across all active segmentation frames including hard-cut multi-pass Fixture F (103.32s total / 360 active frames = 287.0 ms/frame).
   Both statistics will be explicitly labeled and reported in the VTSM-03 documentation.

2. Architecture Implementation Plan for the Three Corrective Directives:
   A. Optical Flow Implementation Comparison:
      - We will implement both:
        (1) Sparse Lucas-Kanade (cv2.calcOpticalFlowPyrLK) tracking interior mask points + affine/homography mesh warping.
        (2) Dense Optical Flow (cv2.calcOpticalFlowFarneback) with pixel-wise mask backward warping via cv2.remap.
      - We will empirically benchmark both on Fixtures A–G and select the winner based on measured mask IoU, boundary drift, and execution runtime.
   B. Camera Motion & Flow Composition (No Double-Counting):
      - We explicitly decouple camera motion from optical propagation.
      - Optical flow calculates the total apparent pixel displacement v_total = v_object + v_camera.
      - When camera compensation is active, we compute residual local motion v_local = v_total - v_cam, ensuring camera affine transforms are never double-applied.
      - We will validate this convention on Fixtures B (Pan) and D (Rotation) before running the full suite.
   C. New Entity Discovery Between Keyframes:
      - We implement a lightweight intermediate proposal pass using background frame differencing + motion saliency contours to detect newly entering visual objects between keyframes.
      - Discovered candidate regions trigger an on-demand prompt decoding pass without running a full-frame grid.
      - We will measure time-to-discovery latency for newly entering entities.

3. Execution Roadmap:
   - Step 1: Implement isolated propagation modules (keyframe_scheduler, flow_warper, camera_composer, new_entity_detector, adaptive_triggers).
   - Step 2: Benchmark fixed keyframe intervals N=10 and N=20 against the preserved VTSM-02 full-frame baseline.
   - Step 3: Integrate adaptive re-segmentation failure detectors (flow error, area distortion, Kalman divergence).
   - Step 4: Run comprehensive ablation on synthetic fixtures A–G and the curated natural footage suite.

Please confirm if this kickoff plan aligns with your architectural expectations, and share any final guidance before we complete the benchmark runs.`;

  console.log('1. Focusing active tab and clearing composer in Brave Browser...');
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

  console.log('2. Injecting prompt into composer via insertText...');
  const injectRes = runOsa(`(() => {
    const input = document.querySelector("form div[contenteditable=true]");
    if (!input) return "NO_INPUT";
    input.focus();
    document.execCommand("selectAll", false, null);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(promptText)});
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

  console.log('4. Monitoring response generation in Brave Browser...');
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

      if (!state.isGenerating && state.lastLen > 300) {
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

  console.log('5. Extracting response text...');
  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    const last = roots[roots.length - 1];
    return last.innerText;
  })()`);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_VTSM03_KICKOFF_RESPONSE.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nKickoff response saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
