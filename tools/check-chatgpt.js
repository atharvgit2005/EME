const { spawnSync } = require('child_process');

function runOsa(jsCode) {
  const osa = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "chatgpt.com" then
                return execute t javascript ${JSON.stringify(jsCode)}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-'], { input: osa, encoding: 'utf8' });
  return (res.stdout || '').trim();
}

function check() {
  const js = `(() => {
    const composer = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    const btns = Array.from(document.querySelectorAll('button')).map(b => ({
      ariaLabel: b.getAttribute('aria-label'),
      testId: b.getAttribute('data-testid'),
      disabled: b.disabled,
      className: b.className
    })).filter(b => (b.ariaLabel && b.ariaLabel.toLowerCase().includes('send')) || 
                     (b.testId && b.testId.includes('send')) || 
                     (b.className && b.className.includes('composer-primary')));

    return JSON.stringify({
      hasComposer: !!composer,
      composerLength: composer ? composer.innerText.length : 0,
      matchingButtons: btns
    });
  })()`;

  const out = runOsa(js);
  console.log(out);
}

check();
