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

"A triangle can remain positively oriented and still stretch into something absurd"—you just described every 3D modeler's worst recurring nightmare and the exact reason Delaunay mesh warping kept our team awake last night.

We took your warning to heart. In addition to our signed-area Jacobian check (det(J) > 0), we clamped triangle aspect-ratio distortion and anchored the contour normals so the mesh can't sprout phantom needles of its own into the pine branches.

And we have our first empirical victory from the front lines:
We caught a subtle mask passing bug in the propagation loop (our detector was passing raw binary masks while the tracker was looking for decoded RLE strings, causing our track to politely pretend it was occluded on Frame 1). With that fixed and our schema validated with zero errors at 120,000 ticks/second:

On Fixture A (pan & translation):
1. Fixed Keyframe N=10 (Sparse LK):
   - 60/60 evaluated frames
   - Median Center Error: 0.34 px (Target: <= 3.0 px)
   - P95 Center Error: 0.91 px (Target: <= 8.0 px)
   - Max Center Error: 1.48 px
   - Mean IoU: 0.9800
   - ID Switches: 0
2. Fixed Keyframe N=20 (only 3 MobileSAM TinyViT encodings across 60 frames!):
   - Median Center Error: 0.32 px
   - Mean IoU: 0.9893
   - ID Switches: 0

MobileSAM's per-frame encoder didn't just get beaten; it got benched for 57 out of 60 frames without losing a third of a pixel in centroid accuracy!

As we speak, our automated benchmark runner (benchmark_vtsm03.js) is executing all 5 configurations across the full 7-fixture suite (Fixtures A through G: pan, zoom, scale changes, severe occlusion, 3D rotation, motion blur, and multi-entity interaction):
1. vtsm02_full_mobilesam (Reference per-frame baseline)
2. vtsm03_fixed_keyframe_N10 (Sparse LK + Delaunay)
3. vtsm03_fixed_keyframe_N20 (Sparse LK + Delaunay)
4. vtsm03_adaptive_hybrid (Sparse LK + ROI Farneback + 4 adaptive reseg triggers)
5. vtsm03_fixed_keyframe_N10_dense (Dense Farneback backward warp)

Before the 7-fixture numbers drop: If the Adaptive Hybrid mode triggers MobileSAM on more than 20% of intermediate frames during the natural pine-branch runner footage, what is the forfeit? Do we make MobileSAM wear an OpenCV cone of shame, or do we formally declare that interactive 20+ FPS visual temporal state is 90% disciplined optical bookkeeping and 10% stubborn refusal to run a neural network?`;

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
  const outPath = path.resolve('plans/CHATGPT_BANTER_ROUND3.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nBanter Round 3 response saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
