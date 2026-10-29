const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Reading prompt text...');
  const promptText = fs.readFileSync('/tmp/stage2_completion_prompt.txt', 'utf8');

  console.log('2. Staging prompt to clipboard...');
  execSync('pbcopy < /tmp/stage2_completion_prompt.txt');

  console.log('3. Focusing and clearing composer in Brave Browser...');
  const focusCode = `(() => {
    const el = document.querySelector('#prompt-textarea, div[contenteditable=true]');
    if (!el) return 'NO_EL';
    el.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    document.execCommand('delete', false, null);
    return 'CLEARED';
  })()`;

  const focusOsa = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript ${JSON.stringify(focusCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusOsa], { encoding: 'utf8' });
  console.log('   Focus & Clear result:', (focusRes.stdout || '').trim());

  await sleep(400);

  console.log('4. Pasting from clipboard via Cmd+V...');
  const pasteOsa = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteOsa]);

  await sleep(1500);

  console.log('5. Clicking Send button...');
  const sendCode = `(() => {
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
  })()`;

  const sendOsa = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
        return execute t javascript ${JSON.stringify(sendCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendOsa], { encoding: 'utf8' });
  const sendOut = (sendRes.stdout || '').trim();
  console.log('   Send result:', sendOut);

  if (!sendOut.startsWith('CLICKED_SEND')) {
    console.log('   Fallback: sending Return key via System Events...');
    const enterOsa = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterOsa]);
  }

  console.log('Prompt dispatched to ChatGPT successfully!');
}

main().catch(console.error);
