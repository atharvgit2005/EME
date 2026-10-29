const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROMPT_FILE = path.resolve(__dirname, '../experiments/tracking-camera/phase1-2-prompt.txt');
const OUT_FILE = path.resolve(__dirname, '../docs/phase1-2-chatgpt-review.md');

const promptText = `EME TRACKING CAMERA & HUD SPIKE: PHASE 1 & 2 COMPLETION REPORT + PHASE 3 PROPOSAL

Dear ChatGPT Architecture Lead,

We have completed Phase 1 (Mathematical Extraction) and Phase 2 (Renderer Capability Probes) for the mrsarac/ff-tracking reverse-engineering spike in editing-mechanics-engine. All work is strictly isolated in experiments/tracking-camera/ with zero modifications to production src/ or certified release v0.1.0-rc1.

================================================================================
1. PHASE 1: MATHEMATICAL EXTRACTION & VERIFICATION (COMPLETED)
================================================================================
- Implementation: experiments/tracking-camera/projection.js (309 lines, zero external dependencies).
- Matrix math: Tait-Bryan rotation matrix R = Rz(roll) * Ry(tilt_y) * Rx(tilt_x) matching hud/src/lib.rs and lens.sksl.
- Functions:
  * projectPoint(point, camera, options): maps flat canvas (qx, qy) to lens screen space with near-plane (z <= 0.05) clipping.
  * unprojectScreenPoint(screenPoint, camera, options): closed-form inverse ray-to-plane intersection.
  * projectRect(rect, camera, options): projects 4 corners and computes axis-aligned screen-space bounding box.
  * evaluateCameraAtTick(cameraTracks, tick, options): linear keyframe interpolation for tilt_x, tilt_y, roll, zoom, aim.
  * evaluateTrackingLock(cameraPos, targetPos, currentLockState): 2-frame lock acquire state machine with threshold validation.
  * computeAudioPan(targetScreenX, screenWidth): normalized stereo pan p = 2x - 1 in [-1.0, 1.0].
- Verification: experiments/tracking-camera/tests/projection.test.js
  * 11/11 tests PASS in 5.5ms (node --test).
  * Strict numerical precision thresholds achieved (error <= 1e-6 px on projections, <= 1 px on bounding boxes).
- Legal & Licensing: experiments/tracking-camera/LICENSING_INVENTORY.md cataloged MIT (code), SIL OFL 1.1 (fonts), BSD (MT19937).

================================================================================
2. PHASE 2: RENDERER CAPABILITY PROBES & BENCHMARKS (COMPLETED)
================================================================================
We conducted empirical probes across the three candidate rendering paths on macOS arm64 (Apple Silicon M3, Node 22/20, HyperFrames v0.8.162, Headless Chromium 152 with ANGLE Metal):

1. Candidate A: CSS 3D Transforms + GSAP (probes/css-3d-probe/)
   - Result: Exit Code 0 (PASS).
   - Render Time: 11.3s for 90 frames (3.0s @ 30fps 1080p).
   - Video Output: 2.06 MB MP4.
   - Frame Inspection: Keyframes at t=0.5s and t=2.0s verified via FrameInspector. Perfect vector text rendering, zero rasterization blur, rock-solid GSAP seekable timeline sync.
   - Limitation: Cannot perform per-pixel chromatic aberration or barrel distortion natively.

2. Candidate B: WebGL Shader Canvas (probes/webgl-shader-probe/)
   - Result: Exit Code 0 (PASS).
   - Render Time: 9.2s for 90 frames (3.0s @ 30fps 1080p) - 1.2x faster than Candidate A!
   - Video Output: 3.58 MB MP4.
   - Shader Capabilities: Direct GLSL implementation of lens.sksl (ray-plane perspective, chromatic aberration RGB split, CRT scanlines, vignette).
   - Frame Inspection: Keyframes at t=0.5s, 1.5s, 2.5s confirm authentic cinematic visual styling under hardware ANGLE Metal acceleration.
   - Limitation: Dynamic DOM typography requires rasterization or multi-pass texture compositing.

3. Candidate C: Native Rust/Skia/SkSL Companion
   - Result: Exit Code 127 (FAIL - Cargo not found).
   - Finding: Heavy toolchain dependency (Rust, Cargo, LLVM, skia-safe) violates EME's zero-external-runtime-dependency core principle.

Archived Matrix: experiments/tracking-camera/CAPABILITY_MATRIX.md

================================================================================
3. RECOMMENDED HYBRID ARCHITECTURE FOR EME
================================================================================
Based on empirical findings, we recommend a 2-Tier Composable Strategy:
- Tier 1 (Default): CSS 3D DOM Layer. Uses projection.js to calculate CSS 3D matrices and 2D HUD bounding boxes. Zero overhead, crisp text, 100% native HyperFrames compatibility.
- Tier 2 (Opt-In): WebGL Lens Post-Processing Filter. When chromatic aberration, scanlines, or bloom are requested in clip effects, the composition applies the WebGL shader canvas as an optical filter pass.

================================================================================
4. PHASE 3 PROPOSAL: MINIMAL VERTICAL PROTOTYPE
================================================================================
We propose implementing a complete vertical prototype in experiments/tracking-camera/prototype/:
1. Pass 1 (Source Canvas): Synthesize an authentic agent terminal session (1920x1080) with code execution, status banners, and target tokens.
2. Camera & Tracking Controller: Drive camera motion (tilt_x, tilt_y, zoom) and compute real-time HUD tracker coordinates targeting a designated token using projection.js.
3. Procedural Audio Synthesis: Implement a pure Node.js synthesis script (tools/sfx-synth.js in experiment sandbox) replicating ff-tracking's tools/sfx.py:
   - CRT background hum (60 Hz + harmonics).
   - Keystroke acoustic click bursts.
   - Lock-on synth beep chords (pentatonic scale, A4/C5/D5/E5/G5) with stereo panning p = 2x - 1 based on projected screen position.
4. End-to-End Render: Render complete video + audio bundle via HyperFramesRenderer and FFmpeg audio multiplexing. Extract still frames to certify tracking accuracy and audio synchronization.

Please review the Phase 1 & 2 findings, the recommended 2-Tier architecture, and authorize kickoff for Phase 3.`;

fs.writeFileSync(PROMPT_FILE, promptText, 'utf8');

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        return execute t javascript "${jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"
      end if
    end repeat
  end repeat
end tell`;

  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  return res.stdout ? res.stdout.trim() : '';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Checking ChatGPT tab in Brave...');
  const initCheck = runOsa(`(function() {
    const input = document.querySelector("form div[contenteditable=true]");
    return input ? "OK" : "NO_INPUT";
  })()`);

  if (initCheck !== 'OK') {
    console.error('Composer input not found in ChatGPT tab');
    process.exit(1);
  }

  // Baseline turn count
  const initialCountStr = runOsa(`(function() {
    const turns = document.querySelectorAll("[data-message-author-role=assistant], div.markdown, .prose");
    return turns.length.toString();
  })()`);
  const initialCount = parseInt(initialCountStr || '0', 10);
  console.log(`Initial assistant turns on page: ${initialCount}`);

  console.log('2. Injecting prompt into composer...');
  // Read prompt JSON encoded to avoid escaping issues
  const promptJson = JSON.stringify(promptText);
  const injectRes = runOsa(`(function() {
    const input = document.querySelector("form div[contenteditable=true]");
    if (!input) return "NO_INPUT";
    input.focus();
    document.execCommand("selectAll", false, null);
    const p = ${promptJson};
    const ok = document.execCommand("insertText", false, p);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return ok ? "INJECTED" : "FAILED";
  })()`);

  console.log('Injection result:', injectRes);
  await sleep(800);

  console.log('3. Clicking Send button...');
  const clickRes = runOsa(`(function() {
    const form = document.querySelector("form");
    const sendBtn = form ? Array.from(form.querySelectorAll("button")).find(b => {
      const a = (b.getAttribute("aria-label") || "").toLowerCase();
      const t = (b.innerText || "").toLowerCase();
      return a.includes("send") || t.includes("send");
    }) : null;

    if (sendBtn) {
      sendBtn.click();
      return "CLICKED";
    }

    // Fallback: keyboard enter
    const input = document.querySelector("form div[contenteditable=true]");
    if (input) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      return "ENTERED";
    }
    return "NO_SEND_BUTTON";
  })()`);

  console.log('Send trigger result:', clickRes);

  console.log('4. Waiting for generation to complete (polling up to 6 minutes)...');
  const startTime = Date.now();
  const maxWait = 360000; // 6 mins

  let lastLength = 0;
  let stableTicks = 0;

  while (Date.now() - startTime < maxWait) {
    await sleep(4000);

    const statusJson = runOsa(`(function() {
      const stopBtn = document.querySelector("[data-testid=stop-button], button[aria-label*=\\"Stop\\" i]");
      const turns = document.querySelectorAll("[data-message-author-role=assistant], div.markdown, .prose");
      const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
      return JSON.stringify({
        isGenerating: !!stopBtn,
        turnsCount: turns.length,
        lastLen: lastTurn ? (lastTurn.innerText || "").length : 0
      });
    })()`);

    let status = {};
    try {
      status = JSON.parse(statusJson);
    } catch (_) {}

    console.log(`[${Math.round((Date.now() - startTime)/1000)}s] Generating: ${status.isGenerating}, Turns: ${status.turnsCount}, Length: ${status.lastLen}`);

    if (status.turnsCount > initialCount && !status.isGenerating && status.lastLen > 200) {
      if (status.lastLen === lastLength) {
        stableTicks++;
        if (stableTicks >= 2) {
          console.log('\n✅ Response finished and stabilized!');
          break;
        }
      } else {
        stableTicks = 0;
        lastLength = status.lastLen;
      }
    }
  }

  // Harvest final response
  console.log('5. Harvesting final response...');
  const harvestScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        return execute t javascript "(function() {
          const turns = document.querySelectorAll('[data-message-author-role=assistant], div.markdown, .prose');
          if (turns.length > 0) {
            return turns[turns.length - 1].innerText;
          }
          return 'NO_TEXT';
        })()"
      end if
    end repeat
  end repeat
end tell`;

  const finalRes = spawnSync('osascript', ['-e', harvestScript], { encoding: 'utf8' });
  const text = finalRes.stdout ? finalRes.stdout.trim() : '';

  if (text && text !== 'NO_TEXT') {
    fs.writeFileSync(OUT_FILE, text, 'utf8');
    console.log(`\n=================== RESPONSE SAVED (${text.length} chars) ===================`);
    console.log(text.slice(0, 600) + '...\n');
    console.log(`Saved to ${OUT_FILE}`);
  } else {
    console.error('Failed to harvest text from response turn');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
