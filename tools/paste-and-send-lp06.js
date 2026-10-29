const { spawnSync, execSync } = require('child_process');

function run() {
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        tell t to select
        return execute t javascript "
          (function() {
            const el = document.querySelector('div.ProseMirror');
            if (!el) return 'NO_PROSEMIRROR';
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'READY';
          })()
        "
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const res = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('Focus result:', (res.stdout || '').trim());

  // Activate and send Cmd+V
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.4
tell application "System Events"
  keystroke "v" using command down
  delay 0.8
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);
  console.log('Pasted into composer.');

  // Click Send or press Return
  const clickScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        return execute t javascript "
          (function() {
            // Find send button
            const btns = Array.from(document.querySelectorAll('button'));
            const sendBtn = btns.find(b => {
              const aria = (b.getAttribute('aria-label') || '').toLowerCase();
              const testid = (b.getAttribute('data-testid') || '').toLowerCase();
              return (aria.includes('send') || testid.includes('send')) && !b.disabled;
            });
            if (sendBtn) {
              sendBtn.click();
              return 'CLICKED_SEND_BUTTON';
            }
            return 'NO_ACTIVE_SEND_BUTTON';
          })()
        "
      end if
    end repeat
  end repeat
end tell`;
  const clickRes = spawnSync('osascript', ['-e', clickScript], { encoding: 'utf8' });
  console.log('Click result:', (clickRes.stdout || '').trim());

  if ((clickRes.stdout || '').trim() !== 'CLICKED_SEND_BUTTON') {
    console.log('Sending Return key fallback...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }
}

run();
