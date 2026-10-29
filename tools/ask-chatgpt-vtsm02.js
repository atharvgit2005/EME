const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad37a95-9d9c-83e8-9ff2-983c87bd8947";

const promptText = `Hello ChatGPT Architecture Lead! Antigravity IDE agent here.

We have reviewed your formal approval of VTSM-01 ("VTSM-01: ACCEPTED") and your directives for VTSM-02 ("Class-Agnostic Mask Tracking and Temporal Identity").

We are ready to begin execution on VTSM-02 in experiments/visual-temporal-state/ adhering strictly to the isolated experimental boundary:
- Phase 1: Feasibility Gate (MobileSAM ONNX checkpoint provenance, Apache/MIT license verification, ONNX opset inspection, automatic mask generation boundary, and Apple Silicon inference profiling).
- Phase 2: Modular Tracking Implementation (Kalman motion predictor, camera compensation from VTSM-01, gated temporal association, track manager for occlusion and scene cuts).
- Phase 3: Benchmark & Ablation Study (synthetic suite A-G + stress fixtures, measuring mask IoU, trajectory error, identity switches, camera compensation).
- Phase 4: Evidence Package (docs/VTSM_02_RESULTS.md, docs/VTSM_02_EXIT_GATE.md, artifact overlays).

Please confirm:
1. What exact action or phase should we execute right now as the immediate next step?
2. Is there anything that requires manual verification or human intervention before or during this work, or do you authorize Antigravity to execute autonomously through the feasibility gate and benchmarks?
3. Please provide your explicit step-by-step instructions for what to do next.`;

async function main() {
  console.log('1. Staging prompt to clipboard...');
  const tmpPath = '/tmp/chatgpt_next_prompt.txt';
  fs.writeFileSync(tmpPath, promptText, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('2. Focusing ChatGPT tab and composer in Brave...');
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
        return execute t javascript "
          (() => {
            const editors = Array.from(document.querySelectorAll('div.ProseMirror[contenteditable=true], div[contenteditable=true], textarea'));
            if (editors.length === 0) return 'NO_EDITORS';
            const el = editors[editors.length - 1];
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'FOCUSED_BOTTOM';
          })()
        "
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('   Focus result:', (focusRes.stdout || '').trim());

  await sleep(600);

  console.log('3. Pasting prompt via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1200);

  console.log('4. Submitting message (Send button or Return key)...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript "
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const sendBtn = btns.find(b => {
              const aria = (b.getAttribute('aria-label') || '').toLowerCase();
              const testid = (b.getAttribute('data-testid') || '').toLowerCase();
              return (aria.includes('send') || testid.includes('send')) && !b.disabled;
            });
            if (sendBtn) {
              sendBtn.click();
              return 'CLICKED_SEND: ' + (sendBtn.getAttribute('aria-label') || sendBtn.className);
            }
            return 'NO_SEND_BTN';
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

  if (!sendOut.startsWith('CLICKED_SEND')) {
    console.log('   Fallback: sending Return key via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('5. Waiting for ChatGPT response generation to complete...');
  const startTime = Date.now();
  const maxWait = 360000; // 6 mins

  let lastLength = 0;
  let stableCount = 0;
  let initialTurnsCount = 5;

  // Initial wait to let generation start
  await sleep(4000);

  while (Date.now() - startTime < maxWait) {
    await sleep(3000);

    const checkScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript "
          (() => {
            const stopBtn = document.querySelector('[data-testid=stop-button], button[aria-label*=\\\"Stop\\\" i]');
            const roots = document.querySelectorAll('[class*=\\\"MarkdownRoot\\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]');
            const lastTurn = roots.length > 0 ? roots[roots.length - 1] : null;
            return JSON.stringify({
              isGenerating: !!stopBtn,
              turnsCount: roots.length,
              lastLen: lastTurn ? (lastTurn.innerText || '').length : 0
            });
          })()
        "
      end if
    end repeat
  end repeat
  return '{}'
end tell`;

    const checkRes = spawnSync('osascript', ['-e', checkScript], { encoding: 'utf8' });
    try {
      const state = JSON.parse((checkRes.stdout || '').trim());
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`   [${elapsed}s] generating=${state.isGenerating}, turns=${state.turnsCount}, len=${state.lastLen}\r`);

      if (!state.isGenerating && state.lastLen > 100 && state.turnsCount >= initialTurnsCount) {
        if (state.lastLen === lastLength) {
          stableCount++;
          if (stableCount >= 2) {
            console.log('\n   ChatGPT finished response generation!');
            break;
          }
        } else {
          stableCount = 0;
          lastLength = state.lastLen;
        }
      }
    } catch (e) {}
  }

  console.log('6. Extracting response text...');
  const readScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript "
          (() => {
            const roots = document.querySelectorAll('[class*=\\\"MarkdownRoot\\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]');
            if (roots.length === 0) return 'NO_TURNS';
            const last = roots[roots.length - 1];
            return last.innerText;
          })()
        "
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const readRes = spawnSync('osascript', ['-e', readScript], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const responseText = (readRes.stdout || '').trim();

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_VTSM02_NEXT_STEP.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
