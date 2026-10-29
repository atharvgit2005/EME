const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad37a95-9d9c-83e8-9ff2-983c87bd8947";

async function main() {
  console.log('1. Reading VTSM-01 Independent Technical Audit Report...');
  const reportPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_01_INDEPENDENT_AUDIT.md');
  const auditReport = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Dear ChatGPT Architecture Lead,

In accordance with your directives, Antigravity has conducted a comprehensive, independent technical audit and exit-gate verification for VTSM-01 (Visual Temporal State Model Foundation and Benchmark).

Below is the complete, evidence-based audit report:

${auditReport}

================================================================================
AUDIT SUMMARY & QUESTIONS FOR REVIEW:
================================================================================
1. Production Isolation: Confirmed 100% clean working tree on production src/, bin/, schema/, package.json.
2. Controlled Fixtures: All 7 controlled fixtures independently verified; decoded frame pixels match ground truth.
3. Classical Vision Baseline: 7/7 fixtures pass all strict numerical targets; 100% bit-exact reproducibility between back-to-back benchmark runs.
4. Learned Candidate Benchmark: Ultralytics YOLO11n + ByteTrack was genuinely executed (SHA-256: 0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1). It achieved 100% recall on natural video (62.5 ms/fr), but 0% recall on synthetic procedural shapes due to COCO category bias, and carries an AGPL-3.0 viral copyleft license. As you noted, the classical baseline is accepted on its criteria, while the learned candidate is formally marked BLOCKED for production packaging.

Please review this independent audit evidence and provide your formal technical disposition and any directives before we conclude.`;

  console.log('2. Staging prompt to clipboard via pbcopy...');
  const tmpPath = '/tmp/vtsm01_audit_staged.txt';
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
            const el = document.querySelector('div.ProseMirror[contenteditable=true]') ||
                       document.querySelector('div[contenteditable=true]') ||
                       document.querySelector('#prompt-textarea');
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
delay 0.4
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1500);

  console.log('5. Clicking Send button or pressing Return...');
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

  console.log('6. Waiting for ChatGPT response to complete...');
  const startTime = Date.now();
  const maxWait = 360000; // 6 mins

  let lastLength = 0;
  let stableCount = 0;

  while (Date.now() - startTime < maxWait) {
    await sleep(4000);

    const checkScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript "
          (() => {
            const stopBtn = document.querySelector('[data-testid=stop-button], button[aria-label*=\\\"Stop\\\" i]');
            const turns = document.querySelectorAll('[data-message-author-role=assistant], .markdown, div.agent-turn');
            const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
            return JSON.stringify({
              isGenerating: !!stopBtn,
              turnsCount: turns.length,
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
      process.stdout.write(`   [${Math.round((Date.now() - startTime) / 1000)}s] generating=${state.isGenerating}, turns=${state.turnsCount}, len=${state.lastLen}\r`);

      if (!state.isGenerating && state.lastLen > 200) {
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

  console.log('7. Reading final response text...');
  const readScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript "
          (() => {
            const turns = document.querySelectorAll('[data-message-author-role=assistant], .markdown');
            if (turns.length === 0) return 'NO_ASSISTANT_TURNS';
            const last = turns[turns.length - 1];
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
  const outPath = path.resolve('plans/CHATGPT_VTSM01_AUDIT_RESPONSE.md');
  fs.writeFileSync(outPath, responseText, 'utf8');

  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText.slice(0, 1500));
  console.log('================================================================');
}

main().catch(console.error);
