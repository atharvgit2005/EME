const { spawnSync, execSync } = require('child_process');

function triggerSend() {
  const js = `(() => {
    const btn = document.querySelector('button[aria-label="Send"]');
    if (!btn) return "NO_SEND_BUTTON";
    if (btn.disabled) return "BUTTON_DISABLED";
    
    btn.focus();
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    btn.click();
    return "CLICKED";
  })()`;

  const osa = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "chatgpt.com" then
                return execute t javascript ${JSON.stringify(js)}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-'], { input: osa, encoding: 'utf8' });
  console.log('DOM Click result:', (res.stdout || '').trim());

  // Also do System Events Return keystroke as fallback
  console.log('Sending Return keystroke...');
  execSync(`osascript -e '
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
    keystroke return
end tell'`);
  console.log('Return keystroke sent.');
}

triggerSend();
