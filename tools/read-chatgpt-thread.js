const { spawnSync } = require('child_process');
const fs = require('fs');

const jsCode = `
  (function() {
    // Find all message containers in ChatGPT UI
    const turnEls = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    if (turnEls.length > 0) {
      const results = [];
      turnEls.forEach(el => {
        const text = el.innerText;
        results.push(text);
      });
      return JSON.stringify({ type: 'turns', count: results.length, last: results[results.length - 1], prev: results[results.length - 2] });
    }
    return JSON.stringify({ type: 'raw', text: document.body.innerText.slice(-5000) });
  })()
`;

const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "chatgpt.com/c/6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        set res to execute t javascript "${jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
        return res
      end if
    end repeat
  end repeat
end tell
`;

const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
if (res.status === 0 && res.stdout) {
  try {
    const data = JSON.parse(res.stdout);
    if (data.last) {
      console.log('=== PREVIOUS MESSAGE ===\n', data.prev ? data.prev.slice(0, 300) : 'none');
      console.log('=== LATEST MESSAGE ===\n', data.last);
      fs.writeFileSync('plans/CHATGPT_LATEST_RESPONSE.md', data.last);
    } else {
      console.log('=== RAW ===\n', data.text);
      fs.writeFileSync('plans/CHATGPT_LATEST_RESPONSE.md', data.text);
    }
  } catch (e) {
    console.log('Parse error, raw output:\n', res.stdout);
  }
} else {
  console.error('Error:', res.stderr);
}
