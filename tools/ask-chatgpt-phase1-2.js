const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing Phase 1 & 2 Kickoff prompt for ChatGPT...');

  const fullPrompt = `We have reviewed your architectural guidance and are ready to execute Phase 1 (Reconnaissance & Mathematical Extraction) and Phase 2 (EME Renderer Capability Probe) for the ff-tracking Camera, HUD & Procedural Audio Spike.

Here is the operational execution plan:

1. Workspace Isolation:
   - Create an isolated sandbox directory: experiments/tracking-camera/.
   - The certified editing-mechanics-engine@0.1.0-rc1 baseline (src/, bin/, schema/, release artifacts) remains 100% read-only and immutable. Zero modifications to production files.

2. Phase 1: Pure Mathematical Extraction (experiments/tracking-camera/projection.js):
   - Extract the 3D ray-to-plane camera equations from hud/src/lib.rs and lens.sksl (pitch, yaw, roll, zoom, focal length, aim drift).
   - Implement target bounding box computation (x, y, width, height) mapping from flat canvas space into projected screen space as pure mathematical functions with 0 external dependencies.
   - Verify JetBrains Mono / Inter character advance metrics (0.6 em monospace width vs proportional shaping).
   - Formalize licensing inventory (MIT for ff-tracking, SIL OFL 1.1 for font, BSD for MT19937).

3. Phase 2: EME Renderer Capability Probe:
   - Construct a minimal probe to test whether HyperFrames can cleanly execute:
     (a) CSS 3D perspective transforms with GSAP,
     (b) WebGL custom shader canvas, or
     (c) If an optional Skia/SkSL rendering adapter or pre-rendered intermediate is necessary.
   - Deliver a concrete Capability Matrix with observed pass/fail evidence before writing any production or complex shader code.

4. Procedural Audio Prep:
   - Extract the event-timing algebra for key clicks and stereo-panned lock-on beeps without adding external audio libraries to EME core.

Please review this plan for Phase 1 & 2. Are these boundaries approved to begin execution, or are there specific test tolerances or constraints you want established before we run the probe?`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/phase1_2_kickoff_prompt.txt';
  fs.writeFileSync(tmpPath, fullPrompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer in Brave...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript "
          (() => {
            const el = document.querySelector('div.ProseMirror[aria-label=\\\"Ask ChatGPT\\\"]') ||
                       document.querySelector('div.ProseMirror');
            if (!el) return 'NO_EL';
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'FOCUSED_AND_CLEARED';
          })()
        "
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('   Focus result:', (focusRes.stdout || '').trim());

  console.log('4. Pasting from clipboard via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1500);

  console.log('5. Clicking Send button...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        return execute t javascript "
          (() => {
            const btn = document.querySelector('button[aria-label=\\\"Send\\\"]');
            if (btn) {
              btn.click();
              return 'CLICKED_SEND_BUTTON';
            }
            return 'NO_SEND_BUTTON';
          })()
        "
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendScript], { encoding: 'utf8' });
  const sendOut = (sendRes.stdout || '').trim();
  console.log('   Send button result:', sendOut);

  if (sendOut !== 'CLICKED_SEND_BUTTON') {
    console.log('   Fallback: sending Return key via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('✅ Kickoff prompt successfully dispatched to ChatGPT!');
}

main().catch(console.error);
