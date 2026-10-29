const { spawnSync } = require('child_process');

function main() {
  const jsCode = `
    (function() {
      const articles = document.querySelectorAll('article');
      if (!articles || articles.length === 0) return 'NO_ARTICLES';
      const last = articles[articles.length - 1];
      return last.innerText;
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
  if (res.status !== 0) {
    console.error('AppleScript error:', res.stderr);
  } else {
    console.log(res.stdout);
  }
}

main();
