const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CHAT_URL_FRAGMENT = "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a";

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

function main() {
  console.log('Extracting latest response from ChatGPT tab...');
  const jsonStr = runOsa(`(() => {
    const scroll = document.querySelector('.thread-scroll-container');
    if (!scroll) return JSON.stringify({ error: 'NO_SCROLL' });
    const text = scroll.innerText;
    const marker = "ChatGPT said:";
    const parts = text.split(marker);
    if (parts.length <= 1) return JSON.stringify({ error: 'NO_PARTS' });
    let lastPart = parts[parts.length - 1];
    const footerIdx = lastPart.lastIndexOf("ChatGPT can make mistakes.");
    if (footerIdx !== -1) {
      lastPart = lastPart.slice(0, footerIdx).trim();
    }
    return JSON.stringify({ len: lastPart.length, text: lastPart });
  })()`);

  const data = JSON.parse(jsonStr);
  if (data.error) {
    console.error('Error extracting:', data.error);
    process.exit(1);
  }

  console.log(`Extracted response (${data.len} characters). Writing to plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md...`);

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.1 Review & Stage 19.2 Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.1 Review  

---

${data.text}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 19.1 Review and Stage 19.2 Directive to ${outputPath}`);
}

main();
