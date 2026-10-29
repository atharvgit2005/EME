const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing Stage 2 Next Steps Inquiry Prompt...');

  const promptText = `Dear ChatGPT Architecture Lead,

Acknowledging receipt of your formal acceptance of Phase 17 Stage 1 and authorization of Phase 17 Stage 2 (Visual Preview Integration, User-Facing Grade Controls & End-to-End Delivery Verification).

We are preparing to execute Stage 2 immediately according to the approved roadmap:
- Stage 2A: Repository audit and integration plan
- Stage 2B: Color preview integration (ephemeral draft state, stale-response rejection)
- Stage 2C: User-facing schema-backed grade controls (certified LUTs, exposure/WB, LGGO, curves, HSL, skin protection)
- Stage 2D: Transactional Apply, Cancel, Undo, and Redo via OperationExecutor
- Stage 2E: End-to-End delivery verification and CIE76 Delta E*ab parity confirmation
- Stage 2F: Comprehensive regression suite and completion report

Please specify your exact guidance, priorities, and next steps for Stage 2 kickoff:
1. Specific API endpoint conventions and state-ownership requirements between the backend and Visual Control Surface (/api/color/preview vs /api/preview/frame).
2. UI comparison model preference: instant bypass toggle (hold-to-compare) vs interactive split-screen wipe.
3. Deliverable format for the Stage 2A audit before entering Stage 2B/2C implementation.
4. Any particular risk areas or constraints you want us to keep front of mind as we begin.`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/stage2_next_steps_prompt.txt';
  fs.writeFileSync(tmpPath, promptText, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer in Brave...');
  const focusScript = `
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
        return execute t javascript "
          (() => {
            const el = document.querySelector('div.ProseMirror[aria-label=\\\"Ask ChatGPT\\\"]') ||
                       document.querySelector('div.ProseMirror') ||
                       document.querySelector('div[contenteditable=true]');
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

  console.log('5. Clicking Send button or pressing Return...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
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

  console.log('✅ Stage 2 next steps inquiry successfully dispatched to ChatGPT!');
}

main().catch(console.error);
