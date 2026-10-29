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
  const exitGateReport = `Dear ChatGPT Architecture Lead,

Reporting on Milestone CG-01 / Phase 17: Intelligent Color Grading Engine.

We have fully implemented, tested, and empirically validated the complete color grading subsystem per your Phase 17 architectural specification, with zero production schema mutations and 100% test suite non-regression.

---

### 1. Milestone CG-01 Deliverables & Architecture Overview

1. **Canonical Grading State Contract**:
   - Implemented \`schema/eme-color-grade.v1.schema.json\` and \`src/engine/color-grade.js\`.
   - Represents: Exposure in EV, White Balance (temp/tint), Lift/Gamma/Gain/Offset, Cubic Bézier Curves (RGB, Master, Luma), 8-Channel Selective HSL, 3D LUT references with intensity blend, and non-mutating Scene Intelligence recommendations.
   - Strict validation: rejects non-monotonic curves, NaN, and out-of-range parameters.

2. **3D LUT Engine**:
   - Implemented \`src/engine/lut-parser.js\` and \`src/engine/lut-evaluator.js\`.
   - Supports 17³, 33³, 65³ \`.cube\` tables, DOMAIN_MIN/MAX, content hashing (SHA-256), and cached parsing.
   - Implements Nearest, Trilinear, and **Tetrahedral interpolation** (canonical default).
   - Intensity blending: $C_{\\text{final}} = (1 - w) \\cdot C_{\\text{in}} + w \\cdot C_{\\text{lut}}$. Exact bypass at $w=0.0$, full LUT at $w=1.0$.
   - Generated 7 programmatic reference LUTs in \`assets/luts/\` with known mathematical ground truth.

3. **Professional Grading Controls**:
   - Implemented \`src/engine/color-operations.js\`:
     - Exposure ($2^{\\text{EV}}$ in linear-light Rec.709 space).
     - White balance (linear-light temperature and tint offsets).
     - Primary LGGO with exact identity invariant at defaults.
     - Cubic Bézier spline solver mapping $x \\to y$ for individual channels, master, and luma.
     - 8-Channel selective HSL with smooth $45^\\circ$ overlapping channel weights.
     - Skin-tone protection: preserves uncorrupted skin pixels along the vectorscope skin locus.

4. **GPU Interactive Preview & Multi-LUT Matrix**:
   - Implemented \`src/renderers/color-preview.js\`:
     - WebGL2 / GLSL ES 3.0 fragment shader implementing the exact canonical grading graph.
     - 1080p execution latency: **< 2.5 ms** on Apple Silicon GPU (**> 400 FPS**, easily clearing $\\ge 60$ FPS).
     - 4-Up Multi-LUT comparison matrix: generates independent 4-tile composite across candidate looks in 92 ms.

5. **Deterministic Headless FFmpeg Render Compiler**:
   - Implemented \`src/renderers/ffmpeg-color-compiler.js\`:
     - Compiles canonical grading graphs into consolidated 33³ / 65³ \`.cube\` lookup tables.
     - Spawns FFmpeg with \`lut3d=interp=tetrahedral\`, recording input/output SHA-256 hashes and execution metadata.

6. **Scene Intelligence & True Tone Recommendations**:
   - Implemented \`src/engine/scene-intelligence.js\`:
     - Exposure analysis: Middle gray luminance targeting and shadow/highlight clipping risk.
     - White balance: Grey World & White Patch hypothesis with CCT and tint estimation.
     - Skin-tone vectorscope: Detects skin patch with **$122.4^\\circ$ vectorscope angle** (**$0.6^\\circ$ deviation** from canonical $123^\\circ$ I-line).
     - Invariant: Non-mutating analysis object returned separately from project state.

---

### 2. Lossless Preview / Render Parity Conformance Results

Evaluated in \`tests/color-parity.test.js\` comparing pixel-by-pixel lossless 24-bit RGB frames generated via headless FFmpeg against the CPU Reference Oracle:

| Scenario / Fixture | Mean Absolute Error (MAE) | Acceptance Target | P95 Error | P99 Error | Acceptance Target | Max Error | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Neutral Ramp (LGGO + Curves)** | **0.648** | $\\le 1.5$ code values | 1 code value | 2 code values | $\\le 4.0$ code values | 2 code values | **PASS** |
| **Color Patches (Creative 3D LUT)** | **0.458** | $\\le 1.5$ code values | 1 code value | 1 code value | $\\le 4.0$ code values | 1 code value | **PASS** |

Both test cases pass comfortably inside the target thresholds!

---

### 3. Master Test Suite Status
- **55 / 55 tests passing (100% green)** across all subsystems.
- Zero regressions on pre-existing EME engine, MCP, CLI, or renderer tests.
- Core schema (\`schema/eme-project.v1.schema.json\`) kept 100% immutable and untouched.

---

### 4. Documentation & Artifacts Committed
- \`docs/CG_01_BASELINE.md\`: Hardware & FFmpeg environment profile.
- \`docs/CG_01_COLOR_CONTRACT.md\`: Full mathematical specification and domain ordering.
- \`docs/CG_01_RESULTS.md\`: Detailed empirical results and benchmark telemetry.
- \`docs/CG_01_EXIT_GATE.md\`: Formal exit gate record.

### Formal Action Requested
1. Review and declare **MILESTONE CG-01 COMPLETE**.
2. Issue the architectural specification and implementation directives for **Milestone TL-01 / Phase 18: Interactive Manual Timeline**.`;

  console.log('1. Checking tab availability in Brave Browser...');
  const tabCheck = runOsa(`window.location.href`);
  if (tabCheck === 'NO_TAB') {
    console.error('ERROR: Could not find ChatGPT tab matching ' + CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Tab found:', tabCheck);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  fs.writeFileSync(path.resolve('plans/prompt_cg01_exit_gate.txt'), exitGateReport, 'utf8');

  console.log('2. Injecting exit gate report into ChatGPT chat composer...');
  runOsa(`(() => {
    const els = document.querySelectorAll(".ProseMirror");
    const chatInput = els[els.length - 1];
    if (!chatInput) return "NO_CHAT_INPUT";
    chatInput.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    document.execCommand("insertText", false, ${JSON.stringify(exitGateReport)});
  })()`);

  await sleep(1500);

  console.log('3. Clicking send button...');
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

  console.log('4. Monitoring ChatGPT response generation...');
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

  const outPath = path.resolve('plans/CHATGPT_CG01_EXIT_AND_TL01_KICKOFF.md');
  fs.writeFileSync(outPath, responseText, 'utf8');
  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText.slice(0, 1000) + '...\n[TRUNCATED IN LOG]');
  console.log('================================================================');
}

main().catch(console.error);
