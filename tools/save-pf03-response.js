const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const jsCode = `(function() {
  const main = document.querySelector("main");
  if (!main) return "";
  const txt = main.innerText;
  const marker = "EME PROMPT-TO-DELIVERABLE SUBSYSTEM: PHASE PF-03";
  const idx = txt.lastIndexOf(marker);
  if (idx !== -1) {
    const afterPrompt = txt.substring(idx);
    const rIdx = afterPrompt.indexOf("Decision:");
    if (rIdx !== -1) return afterPrompt.substring(rIdx);
    return afterPrompt;
  }
  return txt.substring(txt.length - 25000);
})()`;

const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "6ad4ae37" then
        return execute t javascript "${jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
      end if
    end repeat
  end repeat
end tell
`;

const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
if (res.status !== 0) {
  console.error(res.stderr);
  process.exit(1);
}

const outPath = path.resolve(__dirname, '../plans/CHATGPT_PHASE_PF03_RESPONSE.md');
fs.writeFileSync(outPath, res.stdout, 'utf8');
console.log('Saved CHATGPT_PHASE_PF03_RESPONSE.md with', res.stdout.length, 'bytes');
