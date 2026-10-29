const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad37a95-9d9c-83e8-9ff2-983c87bd8947";

async function main() {
  console.log('1. Reading VTSM-02 Feasibility Report...');
  const docPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_02_FEASIBILITY.md');
  const feasibilityReport = fs.readFileSync(docPath, 'utf8');

  const fullPrompt = `Dear ChatGPT Architecture Lead,

In accordance with your step-by-step directives, Antigravity has executed Phase 1 — MobileSAM Feasibility Gate (Steps 0–4) in experiments/visual-temporal-state/.

Below is the verified Phase 1 Feasibility Report:

================================================================================
${feasibilityReport}
================================================================================

KEY FINDINGS & SUMMARY:
1. Workspace Safety: Production src/, bin/, schema/, package files, release artifacts, and live pilot evidence remain 100% bit-for-bit untouched.
2. Checkpoint Provenance: Official MobileSAM TinyViT checkpoint mobile_sam.pt (38.84 MB, SHA-256: 6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f) verified under Apache-2.0.
3. Architectural Execution Boundary:
   - Image Encoder: Runs via TinyViT in PyTorch (599 ms median on Apple Silicon CPU).
   - Mask Decoder: Runs in 42.87 ms median (P95: 72.24 ms) per prompt.
   - Automatic Mask Generation (AMG): A 16x16 grid finds 224 candidate visual regions in 18.52 s.
4. Tracking Architecture Recommendation:
   - Keyframe / Shot-Start Proposals: Use AMG / saliency proposals at shot boundaries.
   - Intra-Shot Continuous Tracking: Track persistent entity centroids using Kalman filter predictions to supply targeted point/box prompts to the lightweight Mask Decoder (~43 ms/fr), avoiding the expensive full-grid AMG per frame while maintaining continuous masks.
5. Gate Disposition: PASS.

Please review our Phase 1 Feasibility findings and provide:
1. Your formal review and disposition on the Phase 1 Feasibility Gate.
2. Any strategic constraints, adjustments, or specific implementation directives before we begin Phase 2 (Modular Tracking: Kalman motion predictor, camera compensation integration, gated temporal association, and track manager).`;

  console.log('2. Staging prompt to clipboard via pbcopy...');
  const tmpPath = '/tmp/vtsm02_feasibility_dispatch.txt';
  fs.writeFileSync(tmpPath, fullPrompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer in Brave...');
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

  console.log('4. Pasting prompt via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1200);

  console.log('5. Submitting message (Send button or Return key)...');
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

  console.log('6. Waiting for ChatGPT response generation to complete...');
  const startTime = Date.now();
  const maxWait = 360000; // 6 mins

  let lastLength = 0;
  let stableCount = 0;
  let initialTurnsCount = 6;

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

  console.log('7. Extracting response text...');
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
  const outPath = path.resolve('plans/CHATGPT_VTSM02_FEASIBILITY_REVIEW.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText);
  console.log('================================================================');
}

main().catch(console.error);
