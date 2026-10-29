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
  const kickoffPrompt = `Dear ChatGPT Architecture Lead,

Milestone VTSM-03 is formally closed and accepted under ADR-VTSM03-01. As directed by leadership, we are now launching the next major strategic evolution of the Editing Mechanics Engine (EME):

### Strategic Vision: Intelligent Color Grading Engine & CapCut-Grade Manual Interactive Timeline

Our objective is to bridge deterministic AI video generation with human-in-the-loop creative control:
1. **Intelligent Color Grading Engine**:
   - **Scene Intelligence & True Tone**: Automated scene understanding (white balance, color temperature / CCT, tint / green-magenta balance, exposure estimation, and skin tone detection / protection along the vectorscope I-line).
   - **Multi-LUT Engine & Real-Time Try-On**: Fast 3D LUT parsing (\`.cube\` format, 17x17x17 to 65x65x65 with tetrahedral interpolation), instant multi-LUT preview matrix (Kodak 2383, Teal & Orange, Fuji, Bleach Bypass, Cine B&W, etc.), intensity blending (0.0–1.0), and color space transforms.
   - **Professional Grading Controls**: 3-way color wheels (Lift/Gamma/Gain + Offset), Bézier cubic RGB/Luma curves, and 8-channel selective HSL adjustments.
   - **Execution Engine**: Hardware-accelerated GPU preview pipeline (60 FPS interactive preview) coupled with deterministic headless FFmpeg rendering (\`lut3d\`, \`curves\`, \`eq\`).

2. **CapCut-Grade Interactive Manual Timeline (NLE Workspace)**:
   - **Post-Generation Fine-Tuning**: Once EME produces an automated edit, the user requires an interactive manual timeline to adjust pacing, swap frames, trim/split clips, reorder layers, inspect element-wise breakdowns, and refine audio/visual alignment.
   - **REA Technical Reconnaissance on Local CapCut macOS App**:
     We inspected the local CapCut Desktop installation (\`/Users/atharvpaharia100/Downloads/CapCut.app\`) and reverse-engineered draft project files from \`~/Movies/CapCut/User Data/Projects/com.lveditor.draft/\`:
     - **Timing Model**: Microsecond integer timebase (\`source_timerange\`, \`target_timerange\` with \`start\` and \`duration\`).
     - **Track & Material Architecture**: Multi-track separation (video, audio, text, sticker, effect), segment transforms (\`scale\`, \`transform\`, \`rotation\`, \`alpha\`, \`flip\`), and referenced materials:
       - \`color_curves\`: Cubic Bézier curves for Master/Luma and RGB with \`anchor\`, \`left_control\`, \`right_control\`, \`sync_direction_control\`.
       - \`hsl\`: 8-channel selective color adjustments (\`hue\`, \`saturation\`, \`lightness\`).
       - \`speeds\`: Linear and Bézier \`curve_speed\` retiming.
       - \`realtime_denoises\` & \`video_effects\`: Parameterized shader effects with normalized value arrays.
   - **Bidirectional EME Round-Trip Architecture**:
     - EME Canonical Project Model (\`schema/eme-project.v1.schema.json\` using 120,000 ticks/sec timebase, half-open intervals) $\\leftrightarrow$ Interactive NLE Timeline State $\\leftrightarrow$ Real-Time Web/Canvas/WebGL Playback $\\leftrightarrow$ Deterministic FFmpeg Render Pipeline.
     - Essential Editing Mechanics: Frame-accurate playhead scrubbing, magnetic snapping, ripple trim, split at playhead, slip/slide, multi-track drag-and-drop, audio waveform display, and live audio scrubbing.

---

### Request for Architectural Directives & Milestone Plan

As Chief Architecture Lead, please provide:
1. **Milestone & Phase Breakdown**: Recommend the phase sequencing (e.g. Phase 17: Intelligent Color Grading Engine, Phase 18: CapCut-Grade Interactive Timeline UI, Phase 19: Full End-to-End Integration & Round-Trip Validation).
2. **Core Architectural Invariants & Data Contracts**:
   - Timebase mapping between EME canonical 120,000 ticks/sec and NLE timeline / CapCut microsecond representations.
   - Color grading pipeline execution graph (Input $\\to$ White Balance / True Tone $\\to$ Lift/Gamma/Gain $\\to$ Curves $\\to$ HSL $\\to$ 3D LUT Blend $\\to$ Output).
   - Non-destructive project mutation invariants.
3. **Phase 17 Kickoff Specification & Directives**:
   - Detailed specification for Milestone CG-01 / Phase 17 (Color Grading Engine).
   - Concrete test fixtures, acceptance benchmarks, and step-by-step implementation prompts to begin work immediately.

We stand fully authorized to execute under GSD guidelines until full implementation is complete. Please issue your initial directives.`;

  console.log('1. Checking tab availability in Brave Browser...');
  const tabCheck = runOsa(`window.location.href`);
  if (tabCheck === 'NO_TAB') {
    console.error('ERROR: Could not find ChatGPT tab matching ' + CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Tab found:', tabCheck);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  fs.writeFileSync(path.resolve('plans/prompt_color_timeline_kickoff.txt'), kickoffPrompt, 'utf8');
  console.log('2. Wrote kickoff prompt to plans/prompt_color_timeline_kickoff.txt (' + kickoffPrompt.length + ' chars)');

  console.log('3. Injecting prompt into ChatGPT chat composer...');
  const injectRes = runOsa(`(() => {
    const els = document.querySelectorAll(".ProseMirror");
    const chatInput = els[els.length - 1];
    if (!chatInput) return "NO_CHAT_INPUT";
    chatInput.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    document.execCommand("insertText", false, ${JSON.stringify(kickoffPrompt)});
    const sendBtn = document.querySelector("[data-testid=send-button], button[aria-label*=\\"Send\\" i]");
    return JSON.stringify({
      inputLen: chatInput.innerText.length,
      sendBtn: !!sendBtn,
      sendDisabled: sendBtn ? sendBtn.disabled : true
    });
  })()`);
  console.log('   Injection result:', injectRes);

  await sleep(1500);

  console.log('4. Clicking send button...');
  const clickRes = runOsa(`(() => {
    const sendBtn = document.querySelector("[data-testid=send-button], button[aria-label*=\\"Send\\" i]");
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.focus();
      sendBtn.click();
      return "CLICKED_SEND";
    }
    return sendBtn ? "BTN_DISABLED" : "NO_BTN";
  })()`);
  console.log('   Send button click:', clickRes);

  console.log('5. Monitoring ChatGPT response generation...');
  const startTime = Date.now();
  let lastLen = 0;
  let stableCount = 0;

  await sleep(4000);

  while (Date.now() - startTime < 360000) { // 6 minutes max
    await sleep(4000);
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
      console.log(`   [${elapsed}s] generating=${state.isGenerating}, turns=${state.turnsCount}, len=${state.lastLen}`);

      if (!state.isGenerating && state.lastLen > 300) {
        if (state.lastLen === lastLen) {
          stableCount++;
          if (stableCount >= 2) {
            console.log('   ChatGPT response generation complete and stable!');
            break;
          }
        } else {
          stableCount = 0;
          lastLen = state.lastLen;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    return roots[roots.length - 1].innerText;
  })()`);

  const outPath = path.resolve('plans/CHATGPT_COLOR_TIMELINE_KICKOFF.md');
  fs.writeFileSync(outPath, responseText, 'utf8');
  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText.slice(0, 1000) + '...\n[TRUNCATED IN LOG]');
  console.log('================================================================');
}

main().catch(console.error);
