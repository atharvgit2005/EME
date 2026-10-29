const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const jsCode = `(function() {
  const main = document.querySelector("main");
  if (!main) return "";
  const text = main.innerText;
  const marker = "PHASE PF-06 (CONVERSATIONAL REVISION, CONSTRAINT PRESERVATION & VERIFIED ITERATION) COMPLETION REPORT";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return "";
  const afterPrompt = text.substring(idx);
  const actionReq = "ACTION REQUESTED:";
  const actionIdx = afterPrompt.indexOf(actionReq);
  let responseText = "";
  if (actionIdx !== -1) {
    const rest = afterPrompt.substring(actionIdx);
    const replyMarkers = ["EME Architecture Review", "PF-06", "Decision:", "Review:", "Provisionally accepted"];
    let replyStart = -1;
    for (const rm of replyMarkers) {
      const pos = rest.indexOf(rm, 200);
      if (pos !== -1 && (replyStart === -1 || pos < replyStart)) {
        replyStart = pos;
      }
    }
    responseText = replyStart !== -1 ? rest.substring(replyStart) : rest;
  } else {
    responseText = afterPrompt;
  }
  const footerIdx = responseText.indexOf("ChatGPT can make mistakes.");
  if (footerIdx !== -1) {
    responseText = responseText.substring(0, footerIdx).trim();
  }
  return responseText;
})()`;

const osaScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
end tell
`;

const res = spawnSync('osascript', ['-e', osaScript], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (res.status === 0 && res.stdout.trim().length > 100) {
  const outFile = path.resolve(__dirname, '../plans/CHATGPT_PHASE_PF06_RESPONSE.md');
  fs.writeFileSync(outFile, res.stdout.trim(), 'utf8');
  console.log(`Successfully written ${res.stdout.trim().length} bytes to ${outFile}`);
} else {
  console.error('Extraction failed:', res.stderr || 'Output too short');
  process.exit(1);
}
