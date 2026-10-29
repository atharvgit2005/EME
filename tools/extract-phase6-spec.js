const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function extractResponse() {
  const jsCode = `(() => {
    const ws = document.querySelector(".WorkspaceContent-dnr6uY") || document.querySelector("main");
    if (!ws) return "";
    const allText = ws.innerText;
    const parts = allText.split(/ChatGPT said:/i);
    if (parts.length <= 1) return "";
    
    // Clean trailing UI text like "ChatGPT can make mistakes..." or "Latest response"
    let responseText = parts[parts.length - 1].trim();
    const cutMarkers = [
      "ChatGPT can make mistakes.",
      "Check important info.",
      "Latest response"
    ];
    for (const marker of cutMarkers) {
      const idx = responseText.lastIndexOf(marker);
      if (idx !== -1 && idx > responseText.length - 300) {
        responseText = responseText.slice(0, idx).trim();
      }
    }
    return responseText;
  })()`;

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

  const res = spawnSync('osascript', ['-'], { input: osa, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const text = (res.stdout || '').trim();

  if (!text) {
    throw new Error('Failed to extract response text from ChatGPT tab');
  }

  const outPath = path.resolve(__dirname, '../plans/PHASE_6_CHATGPT_SPEC.md');
  fs.writeFileSync(outPath, text, 'utf8');
  console.log(`Successfully extracted Phase 6 ChatGPT Specification!`);
  console.log(`Saved to: ${outPath} (${text.length} characters)`);
  return text;
}

if (require.main === module) {
  extractResponse();
}

module.exports = { extractResponse };
